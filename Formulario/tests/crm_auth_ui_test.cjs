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
    if (!(await desktop.getByRole('heading', { name: 'Acceso por correo' }).isVisible())) throw new Error('Login heading not visible.');
    if ((await desktop.locator('input[type="password"]').count()) !== 0) throw new Error('Password input still present.');
    if (!(await desktop.locator('#email-otp').count())) throw new Error('Email OTP input missing.');
    if ((await desktop.locator('script:not([src])').count()) !== 0) throw new Error('Inline script found.');
    if ((await desktop.locator("script[src^='http']").count()) !== 0) throw new Error('External runtime script found.');
    if ((await desktop.locator("link[href^='http']").count()) !== 1) throw new Error('Unexpected external stylesheet or resource found.');

    const desktopOverflow = await desktop.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (desktopOverflow) throw new Error('Desktop horizontal overflow detected.');

    await desktop.screenshot({ path: path.join(results, 'crm-login-desktop.png'), fullPage: true });
    if (consoleErrors.length) throw new Error(`Browser console errors before security checks: ${consoleErrors.join(' | ')}`);
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

    await desktop.locator('#login-email').fill('not-a-member@example.invalid');
    await desktop.getByRole('button', { name: 'Enviar código' }).click();
    await desktop.locator('#global-message').waitFor({ state: 'visible', timeout: 15000 });
    const sendMessage = await desktop.locator('#global-message').innerText();
    if (sendMessage !== 'Si el correo está autorizado, recibirás un código temporal en unos instantes.') {
      throw new Error(`Email response is not neutral: ${sendMessage}`);
    }

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
    await mobile.locator('#view-login').waitFor({ state: 'visible' });
    const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (mobileOverflow) throw new Error('Mobile horizontal overflow detected.');
    await mobile.screenshot({ path: path.join(results, 'crm-login-mobile.png'), fullPage: true });

    const callback = await browser.newPage({ viewport: { width: 900, height: 800 } });
    await callback.goto(`${baseUrl}/auth/invite/?flow=invite`, { waitUntil: 'networkidle' });
    await callback.locator('#view-login').waitFor({ state: 'visible' });
    if (callback.url() !== `${baseUrl}/`) throw new Error('Authentication callback URL was not cleaned.');

    console.log('CRM UI checks passed: desktop, mobile, callback cleanup, local resources and interactions.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
