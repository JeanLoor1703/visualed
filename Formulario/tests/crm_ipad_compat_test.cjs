'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const moduleRoot = process.env.CODEX_TEST_NODE_MODULES;
if (!moduleRoot) throw new Error('CODEX_TEST_NODE_MODULES is required.');
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const browserExecutable = process.env.CODEX_TEST_BROWSER;
const results = path.resolve(__dirname, 'results', 'ipad');
const baseUrl = 'http://127.0.0.1:4175';
const root = path.resolve(__dirname, '..', 'crm');
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

const records = [{
  id: 'ipad-1', full_name: 'Julissa Castro', business_name: 'VisuaLed',
  whatsapp: '0993024415', business_activity: 'Publicidad',
  plan_interest: 'informacion', source: 'redes_sociales', coupon_percent: 15,
  status: 'nuevo', is_demo: false, consent: true,
  campaign: 'sorteo_un_mes_publicidad', created_at: '2026-09-02T10:00:00Z'
}];

const supabaseStub = `
  (() => {
    let session = null;
    const records = ${JSON.stringify(records)};
    const query = (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: table === 'participants' ? records : [], error: null }),
        maybeSingle: async () => ({
          data: table === 'crm_members' ? { display_name: 'Julissa Castro', role: 'admin', active: true } : null,
          error: null
        })
      };
      return chain;
    };
    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session }, error: null }),
          signInWithPassword: async () => {
            session = { access_token: 'ipad-test-token', user: { id: 'ipad-member' } };
            return { data: { session }, error: null };
          },
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null })
        },
        from: query,
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        functions: { invoke: async () => ({ data: null, error: null }) }
      })
    };
  })();`;

const safariLimits = `
  (() => {
    try { Object.defineProperty(MediaQueryList.prototype, 'addEventListener', { value: undefined, configurable: true }); } catch {}
    try { Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true }); } catch {}
    try { Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: undefined, configurable: true }); } catch {}
    try { Object.defineProperty(HTMLDialogElement.prototype, 'close', { value: undefined, configurable: true }); } catch {}
  })();`;

(async () => {
  fs.mkdirSync(results, { recursive: true });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4175, '127.0.0.1', resolve);
  });
  const browser = await chromium.launch({ headless: true, ...(browserExecutable ? { executablePath: browserExecutable } : {}) });
  const context = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript({ content: safariLimits });
  await page.route('**/vendor/supabase-2.111.0.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseStub }));

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('#view-login').waitFor({ state: 'visible' });
    await page.locator('#login-username').fill('Visualed');
    await page.locator('#login-password').fill('prueba-segura');
    await page.locator('#login-form button[type="submit"]').click();
    await page.locator('#view-ready').waitFor({ state: 'visible', timeout: 5000 });

    const shellBox = await page.locator('.studio-shell').boundingBox();
    if (!shellBox || shellBox.height < 700) throw new Error(`El panel colapsó en iPad: ${JSON.stringify(shellBox)}`);
    if (await page.locator('#dashboard-table-body tr').count() !== 1) throw new Error('Los registros no se renderizaron en iPad.');

    await page.locator('#studio-menu-toggle').click();
    await page.locator('#studio-sidebar-close').click();
    await page.waitForTimeout(300);
    if (await page.locator('#studio-menu-toggle').getAttribute('aria-expanded') !== 'false') throw new Error('El menú no se cerró en iPad.');

    await page.locator('#studio-add-participant').click();
    if (await page.locator('#add-participant-dialog').getAttribute('open') === null) throw new Error('El formulario alternativo no abrió en Safari.');
    await page.locator('[data-close-add-participant]').first().click();

    await page.setViewportSize({ width: 1180, height: 820 });
    await page.waitForTimeout(250);
    if (!(await page.locator('#view-ready').isVisible())) throw new Error('El CRM desapareció al rotar el iPad.');
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))) throw new Error('Hay desbordamiento horizontal en iPad.');
    await page.screenshot({ path: path.join(results, 'crm-ipad-landscape.png'), fullPage: true });

    if (errors.length) throw new Error(`Errores del navegador: ${errors.join(' | ')}`);
    console.log('PASS CRM iPad: acceso, compatibilidad Safari, diálogo, navegación y rotación.');
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
