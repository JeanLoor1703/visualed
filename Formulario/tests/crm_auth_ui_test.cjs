'use strict';

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const moduleRoot = process.env.CODEX_TEST_NODE_MODULES;
if (!moduleRoot) throw new Error('CODEX_TEST_NODE_MODULES is required.');
const browserExecutable = process.env.CODEX_TEST_BROWSER;

const { chromium } = require(path.join(moduleRoot, 'playwright'));

const baseUrl = 'http://127.0.0.1:4173';
const results = path.join(__dirname, 'results');
const siteRoot = path.resolve(__dirname, '..', 'crm');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, baseUrl);
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const requestedPath = path.resolve(siteRoot, relativePath || 'index.html');
  const filePath = requestedPath.endsWith(path.sep) || !path.extname(requestedPath)
    ? path.join(requestedPath, 'index.html')
    : requestedPath;

  if (!filePath.startsWith(siteRoot + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    response.end(data);
  });
});

(async () => {
  fs.mkdirSync(results, { recursive: true });
  const consoleErrors = [];
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4173, '127.0.0.1', resolve);
  });
  const browser = await chromium.launch({
    headless: true,
    ...(browserExecutable ? { executablePath: browserExecutable } : {})
  });

  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    desktop.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await desktop.goto(baseUrl, { waitUntil: 'networkidle' });
    await desktop.locator('#view-login').waitFor({ state: 'visible' });

    if (!(await desktop.locator('#view-loading').isHidden())) throw new Error('Loading view remained visible.');
    if (!(await desktop.getByRole('heading', { name: 'Bienvenido de nuevo' }).isVisible())) throw new Error('Login heading not visible.');
    if ((await desktop.locator('#login-username').count()) !== 1) throw new Error('Username input missing.');
    if ((await desktop.locator('#login-password').count()) !== 1) throw new Error('Password input missing.');
    if ((await desktop.locator('#email-otp').count()) !== 0) throw new Error('Obsolete email OTP input still present.');
    if ((await desktop.locator('script:not([src])').count()) !== 0) throw new Error('Inline script found.');
    if ((await desktop.locator("script[src^='http']").count()) !== 0) throw new Error('External runtime script found.');
    if ((await desktop.locator("link[href^='http']").count()) !== 1) throw new Error('Unexpected external stylesheet or resource found.');

    const desktopOverflow = await desktop.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (desktopOverflow) throw new Error('Desktop horizontal overflow detected.');

    await desktop.screenshot({ path: path.join(results, 'crm-login-desktop.png'), fullPage: true });
    if (consoleErrors.length) throw new Error(`Browser console errors before security checks: ${consoleErrors.join(' | ')}`);
    consoleErrors.length = 0;

    const dashboard = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    dashboard.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await dashboard.goto(baseUrl, { waitUntil: 'networkidle' });
    await dashboard.locator('#view-login').waitFor({ state: 'visible' });
    await dashboard.evaluate(() => {
      document.querySelectorAll('.auth-view').forEach((view) => { view.hidden = true; });
      document.querySelector('#view-ready').hidden = false;
      document.body.classList.add('crm-open');
    });
    await dashboard.getByRole('heading', { name: 'Centro de operación', exact: true }).waitFor({ state: 'visible' });
    if ((await dashboard.locator('[data-crm-panel="overview"] .participant-row').count()) !== 5) throw new Error('Demo participant flow was not rendered.');
    if (await dashboard.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) throw new Error('Dashboard horizontal overflow detected.');
    await dashboard.screenshot({ path: path.join(results, 'crm-dashboard-desktop.png'), fullPage: true });

    await dashboard.getByRole('button', { name: /Participantes/ }).click();
    await dashboard.getByRole('heading', { name: 'Personas detrás de cada registro' }).waitFor({ state: 'visible' });
    await dashboard.locator('#participant-search').fill('Mora Café');
    if ((await dashboard.locator('#participant-table-body tr').count()) !== 1) throw new Error('Participant filtering failed.');

    await dashboard.getByRole('button', { name: 'Sorteo' }).click();
    await dashboard.locator('#raffle-coupon').selectOption('20%');
    if ((await dashboard.locator('#raffle-pool-count').innerText()) !== '4 elegibles') throw new Error('Raffle eligibility filter failed.');
    await dashboard.getByRole('button', { name: 'Iniciar simulación' }).click();
    await dashboard.locator('#raffle-kicker').filter({ hasText: 'SEÑAL SELECCIONADA' }).waitFor({ timeout: 6000 });
    await dashboard.screenshot({ path: path.join(results, 'crm-raffle-winner.png'), fullPage: true });
    if (consoleErrors.length) throw new Error(`Dashboard console errors: ${consoleErrors.join(' | ')}`);
    consoleErrors.length = 0;

    const anonResult = await desktop.evaluate(async () => {
      const config = window.VISUALED_CRM_CONFIG;
      const response = await fetch(`${config.supabaseUrl}/rest/v1/crm_members?select=*`, {
        headers: { apikey: config.supabasePublishableKey }
      });
      return { status: response.status, body: await response.text() };
    });
    if (anonResult.status >= 200 && anonResult.status < 300) {
      throw new Error(`Anonymous membership query unexpectedly succeeded: ${anonResult.body}`);
    }

    await desktop.locator('#login-username').fill('not-a-member');
    await desktop.locator('#login-password').fill('not-a-valid-password');
    await desktop.getByRole('button', { name: 'Entrar al panel' }).click();
    await desktop.locator('#global-message').waitFor({ state: 'visible', timeout: 15000 });
    const loginMessage = await desktop.locator('#global-message').innerText();
    if (loginMessage !== 'No pudimos completar el acceso. Verifica tus credenciales e inténtalo nuevamente.') {
      throw new Error(`Login response is not neutral: ${loginMessage}`);
    }

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
    await mobile.locator('#view-login').waitFor({ state: 'visible' });
    const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (mobileOverflow) throw new Error('Mobile horizontal overflow detected.');
    await mobile.screenshot({ path: path.join(results, 'crm-login-mobile.png'), fullPage: true });

    const mobileDashboard = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobileDashboard.goto(baseUrl, { waitUntil: 'networkidle' });
    await mobileDashboard.locator('#view-login').waitFor({ state: 'visible' });
    await mobileDashboard.evaluate(() => {
      document.querySelectorAll('.auth-view').forEach((view) => { view.hidden = true; });
      document.querySelector('#view-ready').hidden = false;
      document.body.classList.add('crm-open');
    });
    await mobileDashboard.locator('#crm-menu-toggle').click();
    await mobileDashboard.locator('.crm-sidebar').waitFor({ state: 'visible' });
    await mobileDashboard.waitForTimeout(350);
    if (await mobileDashboard.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) throw new Error('Mobile dashboard horizontal overflow detected.');
    await mobileDashboard.screenshot({ path: path.join(results, 'crm-dashboard-mobile.png'), fullPage: true });

    const callback = await browser.newPage({ viewport: { width: 900, height: 800 } });
    await callback.goto(`${baseUrl}/auth/invite/?flow=invite`, { waitUntil: 'networkidle' });
    await callback.locator('#view-login').waitFor({ state: 'visible' });
    if (callback.url() !== `${baseUrl}/`) throw new Error('Authentication callback URL was not cleaned.');

    console.log('CRM UI checks passed: login, dashboard, filters, raffle, responsive layout, callback cleanup, local resources and interactions.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
