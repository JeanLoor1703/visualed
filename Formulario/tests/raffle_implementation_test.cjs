'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const moduleRoot = process.env.CODEX_TEST_NODE_MODULES;
if (!moduleRoot) throw new Error('CODEX_TEST_NODE_MODULES is required.');
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const browserExecutable = process.env.CODEX_TEST_BROWSER;

const root = path.resolve(__dirname, '..', 'crm');
const results = path.resolve(__dirname, 'results', 'raffle');
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
    { id: 'demo-1', participation_code: null, full_name: 'Julissa Castro', business_name: 'VisuaLed', whatsapp: '0990000101', business_activity: 'Diseño', plan_interest: 'contactar', source: 'otro', coupon_percent: 10, status: 'nuevo', is_demo: true, consent: true, campaign: 'sorteo_un_mes_publicidad', created_at: '2026-09-01T10:00:00Z' },
    { id: 'demo-2', participation_code: null, full_name: 'Kayal', business_name: 'Creacom', whatsapp: '0990000102', business_activity: 'Diseño', plan_interest: 'informacion', source: 'redes_sociales', coupon_percent: 15, status: 'nuevo', is_demo: true, consent: true, campaign: 'sorteo_un_mes_publicidad', created_at: '2026-09-01T10:01:00Z' },
    { id: 'demo-3', participation_code: null, full_name: 'Ivis', business_name: 'All in Construcción', whatsapp: '0990000103', business_activity: 'Construcción', plan_interest: 'solo_sorteo', source: 'recomendacion', coupon_percent: 20, status: 'nuevo', is_demo: true, consent: true, campaign: 'sorteo_un_mes_publicidad', created_at: '2026-09-01T10:02:00Z' },
    { id: 'real-1', participation_code: 'VL-001', full_name: 'Jean Loor', business_name: null, whatsapp: '0994946999', business_activity: 'Mecánica', plan_interest: null, source: null, coupon_percent: null, status: 'nuevo', is_demo: false, consent: true, campaign: 'sorteo_un_mes_publicidad', created_at: '2026-09-02T04:45:37Z' }
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
          functions: {
            invoke: async () => ({ data: { winner: { participant_id: 'real-1', full_name: 'Jean Loor', business_name: 'Sin negocio registrado', coupon_percent: null, ticket_code: 'VL-001' } }, error: null })
          }
        })
      };
    })();`;
  await page.route('**/vendor/supabase-2.111.0.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: stub }));
}

async function openRaffle(page) {
  if (await page.evaluate(() => innerWidth <= 900)) await page.locator('#studio-menu-toggle').click();
  await page.locator('.studio-nav__item[data-crm-target="raffle"]').click();
  await page.locator('#studio-raffle-start').waitFor({ state: 'visible' });
}

async function checkNoOverflow(page, label) {
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), `${label}: hay desbordamiento horizontal`);
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await installSupabaseStub(page);
    const requests = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`page:${error.message}`));
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await revealDashboard(page);
    const dashboardRows = await page.locator('#dashboard-table-body').innerText();
    check(/Jean Loor/.test(dashboardRows), 'El CRM no muestra el registro real.');
    check(!/Julissa Castro|Kayal|Ivis/.test(dashboardRows), 'El CRM todavía muestra registros de demostración.');
    await openRaffle(page);

    check(!/simulaci[oó]n/i.test(await page.locator('.studio-panel[data-crm-panel="raffle"]').innerText()), 'El sorteo todavía muestra etiquetas de simulación.');
    check(/sorteo\s+un mes de publicidad gratis/i.test((await page.locator('#studio-raffle-title').innerText()).replace(/\s+/g, ' ').trim()), 'El título del sorteo no coincide con el solicitado.');
    check(!/Participantes elegibles|Una empresa\.|Una señal\.|45 segundos/i.test(await page.locator('.studio-raffle__controls').innerText()), 'El panel todavía muestra el texto anterior.');
    check(await page.locator('#studio-raffle-ticker span').count() === 1, 'El ticker no muestra únicamente el registro real.');
    check(await page.locator('#studio-raffle-company-count').innerText() === '1', 'El contador del sorteo no refleja el registro real.');
    check(!/Julissa Castro|Kayal|Ivis/.test(await page.locator('#studio-raffle-ticker').innerText()), 'El sorteo todavía mezcla registros de demostración.');
    check(await page.locator('.studio-raffle__screen > img').evaluate((image) => image.complete && image.naturalWidth > 0), 'No carga la pantalla LED.');
    check(await page.locator('.studio-raffle__robot img').evaluate((image) => image.complete && image.naturalWidth > 0), 'No carga el robot.');

    const baseline = requests.length;
    const startedAt = Date.now();
    await page.locator('#studio-raffle-start').click();
    check(await page.locator('#studio-raffle-start').isDisabled(), 'El botón permite doble clic durante el sorteo.');
    check(await page.locator('#studio-raffle-coupon').isDisabled(), 'El filtro no se bloquea durante el sorteo.');
    check(await page.locator('.studio-raffle__stage').getAttribute('data-raffle-state') === 'countdown', 'No empieza la cuenta regresiva.');
    check(/PREPARANDO SORTEO|COMENZANDO EN/.test(await page.locator('#studio-raffle-kicker').innerText()), 'El clic no produce respuesta visual inmediata.');

    await page.locator('#studio-raffle-winner-card').waitFor({ state: 'visible', timeout: 24000 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(results, 'raffle-winner-confetti.png'), fullPage: true });
    await page.waitForTimeout(1950);
    const elapsed = (Date.now() - startedAt) / 1000;
    check(elapsed >= 16 && elapsed <= 22, `La experiencia no dura aproximadamente 18 segundos: ${elapsed.toFixed(1)}s.`);
    check(await page.locator('#studio-raffle-winner-name').innerText() === 'Jean Loor', 'El ganador no pertenece a los registros reales.');
    check((await page.locator('#studio-raffle-winner-code').innerText()).startsWith('VL-'), 'El ganador no muestra código.');
    check(await page.locator('#studio-raffle-winner-code').innerText() === 'VL-001', 'El sorteo no conserva el código permanente del formulario.');
    check(await page.locator('#studio-raffle-confetti i').count() === 64, 'No se generó el confeti de escenario completo.');
    check(await page.locator('#studio-raffle-kicker').innerText() === 'GANADOR DEL SORTEO', 'La pantalla no anuncia claramente al ganador.');
    check(/Sorteo realizado a las/.test(await page.locator('#studio-raffle-winner-time').innerText()), 'La tarjeta final no muestra la hora del sorteo.');
    check(await page.locator('#studio-raffle-start').isEnabled(), 'El botón no se habilita al terminar.');
    check(!requests.slice(baseline).some((url) => url.includes('supabase.co')), 'La simulación hizo una solicitud a Supabase.');
    await checkNoOverflow(page, 'Sorteo escritorio');
    await page.screenshot({ path: path.join(results, 'raffle-desktop-winner.png'), fullPage: true });
    await page.close();

    const compact = await browser.newPage({ viewport: { width: 1900, height: 900 } });
    await installSupabaseStub(compact);
    await compact.goto(baseUrl, { waitUntil: 'networkidle' });
    await revealDashboard(compact);
    await openRaffle(compact);
    await checkNoOverflow(compact, 'Sorteo compacto 90%');
    check(await compact.locator('#crm-workspace-main').evaluate((element) => getComputedStyle(element).overflowY === 'hidden'), 'El scroll general sigue activo en la vista del sorteo.');
    check(await compact.locator('.studio-panel[data-crm-panel="raffle"]').evaluate((element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)), 'El sorteo no tiene su propio scroll vertical.');
    await compact.screenshot({ path: path.join(results, 'raffle-compact-90.png'), fullPage: true });
    await compact.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await installSupabaseStub(mobile);
    await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
    await revealDashboard(mobile);
    await openRaffle(mobile);
    await checkNoOverflow(mobile, 'Sorteo móvil');
    const stageBox = await mobile.locator('.studio-raffle__stage').boundingBox();
    check(stageBox && stageBox.width <= 374, `El escenario excede el ancho móvil: ${stageBox ? stageBox.width : 'sin caja'}.`);
    await mobile.screenshot({ path: path.join(results, 'raffle-mobile-idle.png'), fullPage: true });
    await mobile.close();

    const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const reducedPage = await reduced.newPage();
    await installSupabaseStub(reducedPage);
    await reducedPage.goto(baseUrl, { waitUntil: 'networkidle' });
    await revealDashboard(reducedPage);
    await openRaffle(reducedPage);
    await reducedPage.locator('#studio-raffle-start').click();
    await reducedPage.locator('#studio-raffle-winner-card').waitFor({ state: 'visible', timeout: 2000 });
    await reducedPage.waitForTimeout(150);
    const runningAnimations = await reducedPage.evaluate(() => document.getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => ({ name: animation.animationName || 'waapi', target: animation.effect?.target?.className || animation.effect?.target?.id || 'unknown' })));
    check(runningAnimations.length === 0, `Quedaron animaciones activas con movimiento reducido: ${JSON.stringify(runningAnimations)}`);
    await reduced.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  check(errors.length === 0, `Errores del navegador: ${errors.join(' | ')}`);
  console.log('PASS raffle: solo datos reales, respuesta inmediata, ~20s, scroll interno, responsive y reduced motion.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
