/**
 * Jalankan dengan app aktif, Convex terseed, dan akun tes di .env.local:
 * `npm run screenshots`. Kredensial hanya dibaca dari env; jangan hardcode.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { chromium } from 'playwright-core';

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const outputDir = path.resolve(process.env.SCREENSHOT_OUT || 'artifacts/screenshots');
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const goto = (route) => (page) => page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
const capture = (name, marker, prepare, fullPage = false, input = false) => ({ name, marker, prepare, fullPage, input });

const publicSurfaces = [
  capture('01-landing', 'Demo —', goto('/'), true),
  capture('02-sign-in', 'input[name="identifier"]', goto('/sign-in'), false, true),
];
const userSurfaces = [
  capture('03-dashboard-browse', 'Demo —', goto('/dashboard'), true),
  capture('04-dashboard-my-listings', 'Demo — Folding Chairs', (page) => clickTab(page, 'My listings')),
  capture('05-dashboard-my-requests', 'Overdue', (page) => clickTab(page, 'My requests')),
  capture('06-dashboard-incoming', 'Demo —', (page) => clickTab(page, 'Incoming requests')),
];
const adminSurfaces = [
  capture('07-dashboard-admin', 'All loans', async (page) => {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await clickTab(page, 'Admin');
  }),
];
const allSurfaces = [...publicSurfaces, ...userSurfaces, ...adminSurfaces];
assert.equal(new Set(allSurfaces.map(({ name }) => name)).size, allSurfaces.length, 'screenshot names must be unique');

const results = [];
const pageUrl = (route) => `${baseUrl}${route}`;
const errorMessage = (error) => error instanceof Error ? error.message : String(error);

async function clickTab(page, name) {
  const tab = page.getByRole('tab', { name, exact: true });
  if (await tab.count()) return tab.first().click({ timeout: 20_000 });
  return page.getByText(name, { exact: true }).first().click({ timeout: 20_000 });
}

async function waitForMarker(page, surface) {
  const marker = surface.input ? page.locator(surface.marker) : page.getByText(surface.marker);
  await marker.first().waitFor({ state: 'visible', timeout: 20_000 });
}

async function captureSurface(page, surface, viewportName) {
  const filename = `${surface.name}-${viewportName}.png`;
  try {
    await surface.prepare(page);
    await waitForMarker(page, surface);
    await page.screenshot({ path: path.join(outputDir, filename), fullPage: surface.fullPage });
    results.push({ filename, status: 'OK' });
  } catch (error) {
    results.push({ filename, status: 'GAGAL', reason: errorMessage(error) });
  }
}

function skipSurfaces(surfaces, viewportName, reason) {
  for (const surface of surfaces) results.push({ filename: `${surface.name}-${viewportName}.png`, status: 'DILEWATI', reason });
}

async function signIn(page, email, password) {
  await page.goto(pageUrl('/sign-in'), { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.locator('input[name="identifier"]').fill(email, { timeout: 20_000 });
  const continueButton = page.getByRole('button', { name: /^continue$/i });
  if (await continueButton.count() && await continueButton.first().isVisible()) {
    await continueButton.first().click({ timeout: 20_000 });
  }
  await page.locator('input[name="password"]').fill(password, { timeout: 20_000 });
  await page.getByRole('button', { name: /^sign in$/i }).click({ timeout: 20_000 });
  await Promise.any([
    page.waitForURL((url) => /\/dashboard\/?$/.test(url.pathname), { timeout: 20_000 }),
    page.getByText('Dashboard', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
}

async function runSession(browser, viewport, viewportName, role, email, password, surfaces) {
  if (!email || !password) {
    const reason = `env ${role === 'user' ? 'TEST_ACCOUNT_EMAIL/TEST_ACCOUNT_PASSWORD' : 'ADMIN_ACCOUNT_EMAIL/ADMIN_ACCOUNT_PASSWORD'} tidak lengkap`;
    console.log(`Lewati sesi ${role} (${viewportName}): ${reason}.`);
    skipSurfaces(surfaces, viewportName, reason);
    return;
  }

  let context;
  let page;
  let loginError;
  try {
    context = await browser.newContext({ viewport });
    page = await context.newPage();
    await signIn(page, email, password);
  } catch (error) {
    loginError = `Login sesi ${role} gagal: ${errorMessage(error)}`;
  }

  for (const surface of surfaces) {
    if (loginError) results.push({ filename: `${surface.name}-${viewportName}.png`, status: 'GAGAL', reason: loginError });
    else await captureSurface(page, surface, viewportName);
  }
  await context?.close();
}

let browser;
try {
  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const [viewportName, viewport] of Object.entries(viewports)) {
    const publicPage = await browser.newPage({ viewport });
    for (const surface of publicSurfaces) await captureSurface(publicPage, surface, viewportName);
    await publicPage.close();

    await runSession(browser, viewport, viewportName, 'user', process.env.TEST_ACCOUNT_EMAIL, process.env.TEST_ACCOUNT_PASSWORD, userSurfaces);
    await runSession(browser, viewport, viewportName, 'admin', process.env.ADMIN_ACCOUNT_EMAIL, process.env.ADMIN_ACCOUNT_PASSWORD, adminSurfaces);
  }
} catch (error) {
  console.error(`Harness gagal: ${errorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

console.log('\nRingkasan screenshot:');
for (const result of results) {
  console.log(`${result.status} ${result.filename}${result.reason ? ` — ${result.reason}` : ''}`);
}
if (results.some(({ status }) => status === 'GAGAL')) process.exitCode = 1;
