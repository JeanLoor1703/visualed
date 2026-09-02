'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const moduleRoot = process.env.CODEX_TEST_NODE_MODULES;
if (!moduleRoot) throw new Error('CODEX_TEST_NODE_MODULES is required.');
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const browserExecutable = process.env.CODEX_TEST_BROWSER;

const root = path.resolve(__dirname, '..', 'crm');
const results = path.resolve(__dirname, 'results', 'redesign');
const baseUrl = 'http://127.0.0.1:4174';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, baseUrl);
  const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
  let file = path.resolve(root, relative);
  if (!path.extname(file)) file = path.join(file, 'index.html');
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end('Not found');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(data);
  });
});

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function revealDashboard(page) {
  await page.locator('#view-ready').waitFor({ state: 'visible' });
  await page.locator('#studio-title').waitFor({ state: 'visible' });
}

async function installSupabaseStub(page) {
  const records = [
    { id: 'real-1', participation_code: 'VL-001', full_name: 'Julissa Castro', business_name: 'VisuaLed', whatsapp: '0993024415', business_activity: 'Publicidad', plan_interest: 'informacion', source: 'redes_sociales', coupon_percent: 15, status: 'nuevo', is_demo: false, consent: true, campaign: 'sorteo_un_mes_publicidad', created_at: '2026-09-01T10:00:00Z' },
    { id: 'real-2', participation_code: 'VL-002', full_name: 'Ivis', business_name: 'Creacom', whatsapp: '0980642911', business_activity: 'Construcción', plan_interest: 'contactar', source: 'expoferia', coupon_percent: 15, status: 'nuevo', is_demo: false, consent: true, campaign: 'sorteo_un_mes_publicidad', created_at: '2026-09-01T10:01:00Z' },
    { id: 'real-3', participation_code: 'VL-003', full_name: 'Jean Loor', business_name: 'Taller Domingo', whatsapp: '0994946999', business_activity: 'Mecánica', plan_interest: 'informacion', source: 'expoferia', coupon_percent: 10, status: 'nuevo', is_demo: false, consent: true, campaign: 'sorteo_un_mes_publicidad', created_at: '2026-09-01T10:02:00Z' }
  ];
  const stub = `
    (() => {
      const records = ${JSON.stringify(records)};
      const query = (table) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: async () => ({ data: table === 'participants' ? records : [], error: null }),
          maybeSingle: async () => ({ data: table === 'crm_members' ? { display_name: 'Julissa Castro', role: 'admin', active: true } : null, error: null })
        };
        return chain;
      };
      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({ data: { session: { access_token: 'test-user-token', user: { id: 'member-1' } } }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signOut: async () => ({ error: null })
          },
          from: query,
          channel: () => ({ on() { return this; }, subscribe() { return this; } }),
          functions: { invoke: async () => ({ data: { winner: { participant_id: 'real-3', full_name: 'Jean Loor', business_name: 'Taller Domingo', coupon_percent: 10, ticket_code: 'VL-003' } }, error: null }) }
        })
      };
    })();`;
  await page.route('**/vendor/supabase-2.111.0.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: stub }));
}

(async () => {
  fs.mkdirSync(results, { recursive: true });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4174, '127.0.0.1', resolve);
  });

  const browser = await chromium.launch({ headless: true, ...(browserExecutable ? { executablePath: browserExecutable } : {}) });
  const errors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
    await installSupabaseStub(page);
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`page:${error.message}`));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await revealDashboard(page);

    check(await page.locator('.studio-metrics article').count() === 4, 'No se muestran las cuatro métricas.');
    check(await page.locator('#dashboard-table-body tr').count() >= 1, 'La tabla inicial no muestra registros.');
    check(await page.locator('.studio-detail').isVisible(), 'La ficha lateral no está visible.');
    check(await page.locator('#studio-profile-action strong').innerText() === 'Julissa Castro', 'El perfil no muestra a Julissa Castro.');
    check(await page.locator('.studio-brand p').count() === 0, 'El lema anterior continúa bajo el logo.');
    check(await page.locator('.studio-nav__item[data-crm-target="leads"]').count() === 0, 'Seguimiento continúa en la navegación.');
    check(await page.locator('.studio-nav__item[data-crm-target="participants"]').count() === 0, 'Registros continúa en la navegación.');
    check((await page.locator('.studio-shell').evaluate((node) => getComputedStyle(node).fontFamily)).includes('Aptos'), 'No se aplicó la nueva tipografía del CRM.');
    check((await page.locator('#record-whatsapp').getAttribute('href')).startsWith('https://wa.me/593'), 'El enlace de WhatsApp no es válido.');
    check((await page.locator('#record-whatsapp').evaluate((node) => getComputedStyle(node).backgroundColor)) === 'rgb(18, 140, 126)', 'El botón de WhatsApp no usa el verde solicitado.');
    check(await page.locator('#record-whatsapp svg').count() === 1, 'El botón de WhatsApp no muestra su icono.');

    await page.locator('#studio-add-participant').click();
    check(await page.locator('#add-participant-dialog').isVisible(), 'El formulario para agregar no se abre.');
    check(await page.locator('#add-participant-form input[name="full_name"]').count() === 1, 'Falta el campo de nombre del formulario de alta.');
    await page.locator('#add-participant-form textarea[name="business_activity"]').fill('Servicios de publicidad digital');
    check(await page.locator('[data-add-counter]').innerText() === '31/240', 'El contador del formulario de alta no responde.');
    await page.locator('[data-close-add-participant]').first().click();
    check(await page.locator('#add-participant-dialog').isHidden(), 'El formulario de alta no se puede cerrar.');

    const excelDownload = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#studio-export-excel').click()
    ]);
    check(excelDownload[0].suggestedFilename().endsWith('.xls'), 'El respaldo no se descarga en formato compatible con Excel.');

    const secondName = await page.locator('#dashboard-table-body tr').nth(1).locator('.studio-record-person strong').innerText();
    await page.locator('#dashboard-table-body tr').nth(1).locator('.studio-record-person').click();
    check(await page.locator('#record-detail-name').innerText() === secondName, 'El mouse no selecciona registros.');
    check(await page.locator('#record-detail-code').innerText() === 'VL-002', 'La ficha no muestra el código permanente del participante.');

    check(await page.locator('#record-status').count() === 0, 'El selector Estado actual continúa visible.');
    check(await page.locator('.studio-table th').count() === 7, 'La tabla conserva la columna de estado innecesaria.');
    check(await page.locator('.studio-table-scroll').evaluate((node) => getComputedStyle(node).scrollbarWidth) === 'none', 'La barra horizontal de la tabla continúa visible.');
    check(parseFloat(await page.locator('.studio-table td').first().evaluate((node) => getComputedStyle(node).fontSize)) >= 11, 'El texto de la tabla continúa demasiado pequeño.');

    await page.locator('#dashboard-search').fill('VisuaLed');
    check(await page.locator('#dashboard-table-body tr').count() === 1, 'La búsqueda no filtra la tabla.');
    await page.locator('#dashboard-search').fill('VL-003');
    check(await page.locator('#dashboard-table-body tr').count() === 1, 'La búsqueda no encuentra el código de participación.');
    await page.locator('#dashboard-search').fill('');
    await page.locator('[data-record-filter="direct"]').click();
    check(await page.locator('#dashboard-table-body tr').count() === 1, 'El filtro de contacto directo es incorrecto.');
    await page.locator('[data-record-filter="all"]').click();

    for (const target of ['coupons', 'raffle', 'activity', 'overview']) {
      await page.locator(`.studio-nav__item[data-crm-target="${target}"]`).click();
      check(await page.locator(`.studio-panel[data-crm-panel="${target}"]`).isVisible(), `La sección ${target} no abre con el mouse.`);
    }

    await page.locator('#studio-notification-action').click();
    check(await page.locator('#studio-toast').isVisible(), 'La notificación no responde al clic.');
    await page.locator('#studio-profile-action').click();
    check(await page.locator('#studio-profile-menu').isVisible(), 'El menú de perfil no abre.');
    await page.keyboard.press('Escape');
    check(await page.locator('#studio-profile-menu').isHidden(), 'Escape no cierra el perfil.');

    const duplicateIds = await page.locator('[id]').evaluateAll((nodes) => {
      const count = new Map();
      nodes.forEach((node) => count.set(node.id, (count.get(node.id) || 0) + 1));
      return [...count.entries()].filter(([, amount]) => amount > 1).map(([id]) => id);
    });
    check(duplicateIds.length === 0, `Hay IDs duplicados: ${duplicateIds.join(', ')}`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), 'Hay desbordamiento horizontal en escritorio.');
    await page.locator('#studio-toast').evaluate((toast) => { toast.hidden = true; });
    await page.screenshot({ path: path.join(results, 'crm-dashboard-desktop.png'), fullPage: true });
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await installSupabaseStub(mobile);
    mobile.on('console', (message) => { if (message.type() === 'error') errors.push(`mobile-console:${message.text()}`); });
    mobile.on('pageerror', (error) => errors.push(`mobile-page:${error.message}`));
    await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
    await revealDashboard(mobile);

    check(await mobile.locator('#dashboard-table-body tr').first().evaluate((node) => getComputedStyle(node).display) === 'grid', 'Los registros no se adaptan como fichas en móvil.');
    const mobileRecordWidth = await mobile.locator('#dashboard-table-body tr').first().evaluate((node) => node.getBoundingClientRect().width);
    check(mobileRecordWidth <= 366, `Una ficha excede el ancho móvil: ${mobileRecordWidth}`);

    check((await mobile.locator('.studio-sidebar').getAttribute('inert')) !== null, 'El menú móvil cerrado no está aislado.');
    await mobile.locator('#studio-menu-toggle').click();
    check(await mobile.locator('#studio-nav-scrim').isVisible(), 'El fondo cerrable del menú no aparece.');
    check((await mobile.locator('.studio-sidebar').getAttribute('inert')) === null, 'El menú abierto continúa inerte.');
    check(await mobile.locator('#studio-sidebar-close').isVisible(), 'El menú móvil no muestra un botón para cerrarlo.');
    await mobile.screenshot({ path: path.join(results, 'crm-dashboard-mobile-menu.png'), fullPage: true });
    await mobile.locator('#studio-sidebar-close').click();
    check((await mobile.locator('#studio-menu-toggle').getAttribute('aria-expanded')) === 'false', 'El botón interno no cierra el menú móvil.');
    await mobile.waitForTimeout(300);
    await mobile.locator('#studio-menu-toggle').click();
    await mobile.locator('.studio-nav__item[data-crm-target="coupons"]').click();
    check(await mobile.locator('.studio-panel[data-crm-panel="coupons"]').isVisible(), 'La navegación móvil no responde.');
    check(await mobile.locator('#studio-nav-scrim').isHidden(), 'La capa móvil quedó bloqueando el mouse.');
    await mobile.waitForTimeout(300);
    const closedSidebarBox = await mobile.locator('.studio-sidebar').boundingBox();
    check(closedSidebarBox && closedSidebarBox.x + closedSidebarBox.width <= 1, `El menú cerrado sigue visible: ${JSON.stringify(closedSidebarBox)}`);
    await mobile.locator('#studio-menu-toggle').click();
    await mobile.locator('#studio-nav-scrim').click({ position: { x: 350, y: 400 } });
    check((await mobile.locator('#studio-menu-toggle').getAttribute('aria-expanded')) === 'false', 'El fondo no cierra el menú.');
    await mobile.waitForTimeout(300);
    check(!(await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), 'Hay desbordamiento horizontal en móvil.');
    await mobile.screenshot({ path: path.join(results, 'crm-dashboard-mobile.png'), fullPage: true });
    await mobile.close();

    check(errors.length === 0, `Errores del navegador: ${errors.join(' | ')}`);
    console.log('PASS CRM redesign: mouse, navegación, filtros, ficha, responsive y consola.');
    console.log(path.join(results, 'crm-dashboard-desktop.png'));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
