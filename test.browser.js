/* global state, saveUser, renderApp */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axeSource = require('axe-core').source;

const root = __dirname;
const screenshots = process.env.SCREENSHOT_DIR || '/tmp';
let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`✓ ${name}`); }
  else { failed++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json', '.png': 'image/png'
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox']
  });
  const errors = [];

  async function newPage() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(base);
    await page.waitForSelector('form[data-form="login"]');
    return { context, page };
  }

  async function axe(page, name) {
    await page.waitForTimeout(400);
    const toast = page.locator('.toast');
    if (await toast.count()) await toast.waitFor({ state: 'detached', timeout: 5000 });
    await page.evaluate(axeSource);
    const results = await page.evaluate(async () => axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
    }));
    check(`axe: ${name}`, results.violations.length === 0,
      results.violations.map(v => `${v.id}: ${v.nodes.map(n => `${n.target.join(' ')} ${n.failureSummary}`).join(', ')}`).join(' | '));
  }

  async function tab(page, id) {
    await page.click(`button[data-action="tab"][data-tab="${id}"]`);
    await page.waitForSelector('.main h1');
  }

  const signup = await newPage();
  const page = signup.page;
  await axe(page, 'sign in');
  await page.click('[data-action="auth-mode"][data-mode="signup"]');
  await page.fill('#auth-username', 'browser-test');
  await page.fill('#auth-password', 'test-password');
  await page.fill('#auth-confirm', 'test-password');
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForSelector('form[data-form="onboarding"]');
  await axe(page, 'onboarding');
  await page.fill('#ob-name', 'Browser Test');
  await page.fill('#ob-age', '29');
  await page.selectOption('#ob-sex', 'male');
  await page.fill('#ob-height', '180');
  await page.fill('#ob-weight', '80');
  await page.fill('#ob-target', '75');
  await page.selectOption('#ob-days', '3');
  await page.selectOption('#ob-activity', 'moderate');
  await page.selectOption('#ob-goal', 'lose');
  await page.selectOption('#ob-diet', 'nonveg');
  await page.click('form[data-form="onboarding"] button[type="submit"]');
  await page.waitForSelector('.main h1');
  check('signup and onboarding reach dashboard', (await page.locator('.main').textContent()).includes('Browser'));
  await axe(page, 'dashboard dark');

  await page.click('[data-action="open-settings"]');
  await page.waitForSelector('[role="dialog"]');
  check('settings receives keyboard focus', await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
  await axe(page, 'settings modal');
  await page.focus('[data-action="delete-all"]');
  await page.keyboard.press('Tab');
  check('modal traps forward Tab', await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
  await page.keyboard.press('Escape');
  check('Escape returns focus to settings trigger', await page.evaluate(() => document.activeElement.dataset.action === 'open-settings'));

  await page.click('header [data-action="toggle-theme"]');
  check('light theme applies', await page.getAttribute('html', 'data-theme') === 'light');
  await axe(page, 'dashboard light');
  await page.click('header [data-action="toggle-theme"]');

  await tab(page, 'chef');
  await page.fill('#chef-ingredients', 'chicken, rice');
  await page.click('form[data-form="chef-ingredients"] button[type="submit"]');
  await page.waitForSelector('.match-box');
  check('ingredient search renders matches', await page.locator('.match-box').count() > 0);
  await axe(page, 'Chef ingredient matches');

  await tab(page, 'nutritionist');
  await axe(page, 'Nutritionist');
  await tab(page, 'doctor');
  await axe(page, 'Health check');
  await tab(page, 'progress');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#workoutChart');
    return canvas && canvas.width > 0 && canvas.height > 0;
  });
  const chartDrawn = await page.evaluate(() => {
    const canvas = document.querySelector('#workoutChart');
    return canvas.toDataURL('image/png').length > 2000;
  });
  check('workout chart renders without weekStart error', chartDrawn);
  await axe(page, 'Progress');
  await page.screenshot({ path: path.join(screenshots, 'trainer4u-progress-desktop.png'), fullPage: true });
  await tab(page, 'dashboard');
  await page.screenshot({ path: path.join(screenshots, 'trainer4u-dashboard-desktop.png'), fullPage: true });

  // Real file-input import: markup must remain inert text and malformed data must not persist.
  const payload = '<svg onload=window.__importXss=1>';
  const exported = await page.evaluate(() => ({
    profile: state.user.profile,
    logs: state.user.logs,
    settings: state.user.settings
  }));
  exported.profile.name = payload;
  exported.logs.food.push({ date: new Date().toISOString().slice(0, 10), meal: 'Snack', name: payload, grams: 100, calories: 10, protein: 1, carbs: 1, fat: 0 });
  await page.evaluate(() => { window.__importXss = 0; });
  await page.click('[data-action="open-settings"]');
  await page.setInputFiles('#import-file', { name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });
  check('imported markup displays as text', (await page.locator('.userchip').textContent()) === payload);
  check('stored import payload did not execute', await page.evaluate(() => window.__importXss === 0));
  await tab(page, 'nutritionist');
  check('imported food markup is escaped', await page.locator('.food-name', { hasText: payload }).count() === 1);

  const beforeMalformed = await page.evaluate(() => localStorage.getItem('trainer4u_db_v2'));
  await page.click('[data-action="open-settings"]');
  await page.setInputFiles('#import-file', {
    name: 'bad.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ profile: {}, logs: { food: [null] } }))
  });
  await page.waitForSelector('.toast.show');
  check('malformed import leaves saved data unchanged', await page.evaluate(() => localStorage.getItem('trainer4u_db_v2')) === beforeMalformed);
  await page.keyboard.press('Escape');

  // Verify offline reload using the actual service worker.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.main h1');
  await signup.context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.main h1');
  check('offline reload renders the app', true);
  await signup.context.setOffline(false);

  await tab(page, 'dashboard');
  await page.evaluate(() => { state.user.profile.name = 'Browser Test'; saveUser(); renderApp(); });
  await page.setViewportSize({ width: 390, height: 844 });
  check('390px layout has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await axe(page, 'dashboard mobile');
  await page.screenshot({ path: path.join(screenshots, 'trainer4u-dashboard-mobile.png'), fullPage: true });
  await signup.context.close();

  // The seeded profile exercises populated charts and history.
  const demo = await newPage();
  await demo.page.fill('#auth-username', 'demo');
  await demo.page.fill('#auth-password', 'demo1234');
  await demo.page.click('.auth-card form button[type="submit"]');
  await demo.page.waitForSelector('.main h1');
  await tab(demo.page, 'progress');
  await demo.page.waitForTimeout(200);
  check('demo charts render', await demo.page.evaluate(() => {
    const canvas = document.querySelector('#weightChart');
    return canvas && canvas.width > 0 && canvas.height > 0;
  }));
  await axe(demo.page, 'populated Progress');
  await demo.page.screenshot({ path: path.join(screenshots, 'trainer4u-progress-populated.png'), fullPage: true });
  await demo.context.close();

  check('no uncaught browser JavaScript errors', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch(error => {
  failed++;
  console.error(error);
}).finally(async () => {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log(`\nBrowser checks passed: ${passed}  Failed: ${failed}`);
  if (failed) process.exitCode = 1;
});
