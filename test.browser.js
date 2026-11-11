/* global state, saveUser, renderApp, RECIPES */
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
    if (await toast.count()) {
      await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, { timeout: 5000 });
    }
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

  await page.fill('#auth-username', 'ab');
  await page.fill('#auth-password', 'test-password');
  await page.fill('#auth-confirm', 'test-password');
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForSelector('.form-error');
  check('signup rejects an invalid username', (await page.locator('.form-error').textContent()).includes('3–24'));

  await page.fill('#auth-username', 'browser-test');
  await page.fill('#auth-password', 'short');
  await page.fill('#auth-confirm', 'short');
  await page.click('.auth-card form button[type="submit"]');
  check('signup enforces the password minimum', await page.locator('#auth-password').evaluate(el => !el.validity.valid && el.validationMessage.length > 0));

  await page.fill('#auth-password', 'test-password');
  await page.fill('#auth-confirm', 'different-password');
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForSelector('.form-error');
  check('signup rejects mismatched passwords', (await page.locator('.form-error').textContent()).includes('do not match'));

  await page.fill('#auth-username', 'browser-test');
  await page.fill('#auth-password', 'test-password');
  await page.fill('#auth-confirm', 'test-password');
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForSelector('form[data-form="onboarding"]');

  const requiredFields = await page.locator('form[data-form="onboarding"]').evaluate(form =>
    Array.from(form.elements).filter(field => field.required).map(field => field.name));
  check('all required onboarding fields are explicit', JSON.stringify(requiredFields) === JSON.stringify([
    'name', 'age', 'sex', 'height', 'weight', 'daysPerWeek', 'activity', 'goal', 'diet'
  ]), requiredFields.join(', '));
  check('blank target weight is valid and optional', await page.locator('#ob-target').evaluate(el => !el.required && el.value === '' && el.validity.valid));
  check('free-text signup limits match import limits', await page.evaluate(() =>
    document.querySelector('#ob-allergies').maxLength === 1000 && document.querySelector('#ob-injuries').maxLength === 2000));
  await axe(page, 'onboarding');

  await page.fill('#ob-name', 'Browser Test');
  await page.fill('#ob-age', '29');
  await page.selectOption('#ob-sex', 'male');
  await page.fill('#ob-height', '180');
  await page.fill('#ob-weight', '80');
  await page.selectOption('#ob-days', '3');
  await page.selectOption('#ob-activity', 'moderate');
  await page.selectOption('#ob-goal', 'lose');
  await page.selectOption('#ob-diet', 'nonveg');
  await page.selectOption('#ob-experience', 'intermediate');
  await page.fill('#ob-allergies', 'peanuts, dairy');
  await page.fill('#ob-injuries', 'knee pain when squatting');
  await page.uncheck('input[name="equipment"][value="bodyweight"]');
  await page.check('input[name="equipment"][value="dumbbells"]');

  // Reproduce the reported retry: an invalid goal/target combination followed by
  // clearing the optional target must not leave stale browser validation behind.
  await page.fill('#ob-target', '85');
  await page.click('form[data-form="onboarding"] button[type="submit"]');
  await page.waitForSelector('.field-error');
  check('goal conflict explains the target error', (await page.locator('.field-error').textContent()).includes('target must be lower'));
  check('invalid target receives focus', await page.evaluate(() => document.activeElement.id === 'ob-target'));
  check('goal conflict sets custom validity', await page.locator('#ob-target').evaluate(el => el.validity.customError));
  await page.fill('#ob-target', '');
  check('editing target clears stale validation', await page.locator('#ob-target').evaluate(el => el.validity.valid && el.validationMessage === '' && !document.querySelector('.field-error')));

  await page.click('form[data-form="onboarding"] button[type="submit"]');
  await page.waitForSelector('.main h1');
  check('signup and onboarding reach dashboard without target', (await page.locator('.main').textContent()).includes('Browser'));

  const savedSignup = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('trainer4u_db_v2'));
    const user = db.profiles['browser-test'];
    return {
      profile: user.profile,
      onboarded: user.onboarded,
      weights: user.logs.weights,
      session: localStorage.getItem('trainer4u_session_v2')
    };
  });
  check('signup persists the basic profile fields', savedSignup.profile.name === 'Browser Test' && savedSignup.profile.age === 29 &&
    savedSignup.profile.sex === 'male' && savedSignup.profile.height === 180 && savedSignup.profile.weight === 80 &&
    savedSignup.profile.activity === 'moderate' && savedSignup.profile.goal === 'lose' && savedSignup.profile.diet === 'nonveg');
  check('signup persists optional fields and blank target', savedSignup.profile.targetWeight === null &&
    savedSignup.profile.allergies === 'peanuts, dairy' && savedSignup.profile.injuries === 'knee pain when squatting' &&
    savedSignup.profile.experience === 'intermediate' && savedSignup.profile.daysPerWeek === 3);
  check('signup always includes bodyweight equipment', savedSignup.profile.equipment.includes('bodyweight') && savedSignup.profile.equipment.includes('dumbbells'));
  check('signup initializes progress and session', savedSignup.onboarded && savedSignup.profile.startWeight === 80 &&
    savedSignup.weights.length === 1 && savedSignup.weights[0].kg === 80 && savedSignup.session === 'browser-test');

  await page.reload();
  await page.waitForSelector('.main h1');
  check('reload restores the completed signup', (await page.locator('.userchip').textContent()) === 'Browser Test');

  await page.click('[data-action="open-settings"]');
  await page.click('[data-action="logout"]');
  await page.waitForSelector('form[data-form="login"]');
  await page.fill('#auth-username', 'browser-test');
  await page.fill('#auth-password', 'wrong-password');
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForSelector('.form-error');
  check('login rejects a wrong password', (await page.locator('.form-error').textContent()).includes('does not match'));

  await page.click('[data-action="auth-mode"][data-mode="signup"]');
  await page.fill('#auth-username', 'BROWSER-TEST');
  await page.fill('#auth-password', 'test-password');
  await page.fill('#auth-confirm', 'test-password');
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForSelector('.form-error');
  check('duplicate usernames are case-insensitive', (await page.locator('.form-error').textContent()).includes('already exists'));

  await page.click('[data-action="auth-mode"][data-mode="login"]');
  await page.fill('#auth-username', 'browser-test');
  await page.fill('#auth-password', 'test-password');
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForSelector('.main h1');
  check('correct login restores the saved profile', (await page.locator('.userchip').textContent()) === 'Browser Test');
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
  await page.locator('[data-action="open-custom-food"]').first().click();
  await page.waitForSelector('form[data-form="custom-food"]');
  await axe(page, 'custom food modal');
  await page.fill('#custom-name', 'Homemade dal');
  await page.fill('#custom-serving-label', '1 bowl');
  await page.fill('#custom-serving-grams', '250');
  await page.fill('#custom-calories', '280');
  await page.fill('#custom-protein', '18');
  await page.fill('#custom-carbs', '35');
  await page.fill('#custom-fat', '6');
  await page.click('form[data-form="custom-food"] button[type="submit"]');
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });
  const customFood = await page.evaluate(() => state.user.customFoods[0]);
  check('custom food saves its serving and nutrition', !!customFood && customFood.name === 'Homemade dal' &&
    customFood.servingLabel === '1 bowl' && customFood.servingGrams === 250 && customFood.calories === 280);
  check('custom food appears in the logging library', await page.locator('#food-name optgroup[label="My foods"]').count() === 1);
  await page.selectOption('#food-name', `custom:${customFood.id}`);
  check('custom food defaults to its named serving', await page.locator('#food-unit').inputValue() === 'serving' &&
    (await page.locator('#food-portion-hint').textContent()).includes('1 bowl = 250 g'));
  await page.fill('#food-amount', '1.5');
  await page.selectOption('#food-meal', 'Lunch');
  await page.click('form[data-form="add-food"] button[type="submit"]');
  await page.waitForSelector('.food-name', { hasText: 'Homemade dal' });
  const customEntry = await page.evaluate(() => state.user.logs.food.find(entry => entry.name === 'Homemade dal'));
  check('serving logging scales custom nutrition', !!customEntry && customEntry.grams === 375 && customEntry.calories === 420 &&
    customEntry.protein === 27 && customEntry.carbs === 52.5 && customEntry.fat === 9);
  check('diary shows the named portion', (await page.locator('.food-name', { hasText: '1.5 × 1 bowl' }).textContent()).includes('1.5 × 1 bowl'));
  await page.selectOption('#food-name', 'db:Eggs');
  await page.selectOption('#food-unit', 'oz');
  await page.fill('#food-amount', '1');
  await page.selectOption('#food-meal', 'Snack');
  await page.click('form[data-form="add-food"] button[type="submit"]');
  const ounceEntry = await page.evaluate(() => state.user.logs.food[state.user.logs.food.length - 1]);
  check('built-in foods support ounce portions', ounceEntry.name === 'Eggs' && ounceEntry.grams === 28.3 && ounceEntry.portion === '1 oz');
  await page.fill('#food-filter', 'dosa');
  const dosaOptions = await page.locator('#food-name option').allTextContents();
  check('food filter narrows the list to matches', dosaOptions.length === 2 && dosaOptions.every(text => text.toLowerCase().includes('dosa')), dosaOptions.join('|'));
  await page.selectOption('#food-name', 'db:Dosa');
  await page.selectOption('#food-meal', 'Breakfast');
  await page.click('form[data-form="add-food"] button[type="submit"]');
  const dosaEntry = await page.evaluate(() => state.user.logs.food[state.user.logs.food.length - 1]);
  check('filtered Indian food logs by weight', dosaEntry.name === 'Dosa' && dosaEntry.grams === 100);
  await page.fill('#food-filter', 'homemade');
  check('filter finds custom foods too', await page.locator('#food-name optgroup[label="My foods"] option').count() === 1);
  await page.fill('#food-filter', 'zzzz-no-such-food');
  check('filter shows an empty-state option', (await page.locator('#food-name option').textContent()).includes('No matches'));
  await page.fill('#food-filter', '');
  check('clearing the filter restores the full list', (await page.locator('#food-name option').count()) > 40);
  await page.click('[data-action="edit-custom-food"]');
  await page.waitForSelector('form[data-form="custom-food"]');
  check('edit custom food modal prefills the saved values', await page.evaluate(() =>
    document.querySelector('form[data-form="custom-food"] button[type="submit"]').textContent === 'Save changes' &&
    document.getElementById('custom-name').value === 'Homemade dal' &&
    document.getElementById('custom-serving-grams').value === '250'
  ));
  await page.fill('#custom-calories', '300');
  await page.click('form[data-form="custom-food"] button[type="submit"]');
  await page.waitForSelector('form[data-form="custom-food"]', { state: 'detached' });
  check('editing keeps the same custom food id', await page.evaluate(() => {
    const saved = state.user.customFoods;
    return saved.length === 1 && saved[0].calories === 300 && saved[0].name === 'Homemade dal';
  }));
  check('editing a custom food does not rewrite diary history', await page.evaluate(() =>
    state.user.logs.food.filter(item => item.name === 'Homemade dal').every(item => item.calories === 420)
  ));
  await axe(page, 'Nutritionist with custom foods');
  await page.screenshot({ path: path.join(screenshots, 'trainer4u-custom-foods-desktop.png'), fullPage: true });
  await tab(page, 'chef');
  await page.click('[data-action="recipe-open"]');
  await page.waitForSelector('[data-action="log-recipe"]');
  const loggedRecipeName = await page.evaluate(() => RECIPES[state.modal.index].name);
  await page.selectOption('#recipe-log-meal', 'Dinner');
  await page.click('[data-action="log-recipe"]');
  await page.waitForSelector('.modal-overlay', { state: 'detached' });
  check('recipe logs to the diary as one serving', await page.evaluate(() => {
    const entry = state.user.logs.food.find(item => item.portion === '1 serving');
    return !!entry && entry.meal === 'Dinner' && !entry.grams && entry.calories > 0;
  }));
  await tab(page, 'nutritionist');
  check('diary shows a recipe entry without a grams label', await page.evaluate(name => {
    const row = [...document.querySelectorAll('.food-row')].find(el => el.textContent.includes(name));
    return !!row && row.querySelector('.tiny').textContent.trim() === '1 serving';
  }, loggedRecipeName));
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
  // Use the real export download so the backup path itself is covered.
  await page.click('[data-action="open-settings"]');
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action="export-data"]');
  const backupDownload = await downloadPromise;
  const exported = JSON.parse(fs.readFileSync(await backupDownload.path(), 'utf8'));
  check('JSON export includes custom foods and portion labels', exported.customFoods.length === 1 &&
    exported.customFoods[0].name === 'Homemade dal' && exported.logs.food.some(entry => entry.portion === '1.5 × 1 bowl'));
  await page.keyboard.press('Escape');
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
  check('custom food library survives import', await page.evaluate(() => state.user.customFoods.length === 1 && state.user.customFoods[0].name === 'Homemade dal'));
  check('custom diary entry survives import', await page.locator('.food-name', { hasText: '1.5 × 1 bowl' }).count() === 1);

  const beforeMalformed = await page.evaluate(() => localStorage.getItem('trainer4u_db_v2'));
  await page.click('[data-action="open-settings"]');
  await page.setInputFiles('#import-file', {
    name: 'bad.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ profile: {}, logs: { food: [null] } }))
  });
  await page.waitForSelector('.toast.show');
  check('malformed import leaves saved data unchanged', await page.evaluate(() => localStorage.getItem('trainer4u_db_v2')) === beforeMalformed);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  check('custom foods layout fits a 390px screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await axe(page, 'Nutritionist custom foods mobile');
  await page.screenshot({ path: path.join(screenshots, 'trainer4u-custom-foods-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.locator('[data-action="delete-custom-food"]').click();
  check('deleting a custom food clears only the library', await page.evaluate(() => state.user.customFoods.length === 0 &&
    state.user.logs.food.some(entry => entry.name === 'Homemade dal' && entry.portion === '1.5 × 1 bowl')));
  check('deleted custom food remains in diary history', await page.locator('.food-name', { hasText: '1.5 × 1 bowl' }).count() === 1);

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
