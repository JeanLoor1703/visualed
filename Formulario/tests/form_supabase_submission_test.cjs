'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const moduleRoot = process.env.CODEX_TEST_NODE_MODULES;
if (!moduleRoot) throw new Error('CODEX_TEST_NODE_MODULES is required.');
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const browserExecutable = process.env.CODEX_TEST_BROWSER;
const root = path.resolve(__dirname, '..');
const baseUrl = 'http://127.0.0.1:4175';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((request, response) => {
  const url = new URL(request.url, baseUrl);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  let file = path.resolve(root, relative);
  if (!path.extname(file)) file = path.join(file, 'index.html');
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(data);
  });
});

(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4175, '127.0.0.1', resolve);
  });
  const browser = await chromium.launch({ headless: true, ...(browserExecutable ? { executablePath: browserExecutable } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10000);
    let capturedPayload = null;
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
    await page.route('https://ffaypyjokinfzdkwtezz.supabase.co/rest/v1/participants*', async (route) => {
      capturedPayload = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: 'application/json', body: '' });
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#campaignForm').waitFor({ state: 'visible' });
    await page.locator('#fullName').fill('Registro Prueba');
    await page.locator('#businessName').fill('Negocio Prueba');
    await page.locator('#whatsapp').fill('099 123 4567');
    await page.locator('#businessActivity').fill('Servicios de prueba');
    await page.locator('label.choice-row').filter({ hasText: 'Sí, quiero que me contacten' }).click();
    await page.locator('label.choice-row').filter({ hasText: 'Expoferia' }).click();
    await page.locator('label.coupon-option').filter({ hasText: '15%' }).click();
    await page.locator('label.consent-row').click();
    await page.locator('#submitButton').click();
    await page.locator('#successPanel').waitFor({ state: 'visible' });
    if (!capturedPayload) throw new Error('El formulario no intentó guardar en Supabase.');
    if (capturedPayload.full_name !== 'Registro Prueba') throw new Error('Nombre incorrecto en el payload.');
    if (capturedPayload.whatsapp !== '0991234567') throw new Error('WhatsApp no fue normalizado.');
    if (capturedPayload.plan_interest !== 'contactar' || capturedPayload.coupon_percent !== 15) throw new Error('Campos de campaña incorrectos.');
    for (const forbidden of ['id', 'status', 'is_demo', 'created_at']) {
      if (Object.hasOwn(capturedPayload, forbidden)) throw new Error(`El formulario intentó controlar ${forbidden}.`);
    }
    console.log('PASS formulario: payload validado y enviado a participants en Supabase.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
