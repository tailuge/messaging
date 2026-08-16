// Take an iPhone-style screenshot using Playwright's WebKit browser.
// Requires WebKit:  npx playwright install --with-deps webkit
// Assumes the lobby is already served (npm run build:all) at http://localhost/lobby.html
import { webkit, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEVICE = process.env.DEVICE || 'iPhone 15';
const URL = process.env.URL || 'http://localhost/lobby.html';
const OUT = process.env.OUT || join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots', 'lobby-iphone.png');

const device = devices[DEVICE];
if (!device) {
    console.error(`Unknown device "${DEVICE}". Available iPhone devices: ${Object.keys(devices).filter(k => k.startsWith('iPhone')).join(', ')}`);
    process.exit(1);
}

await mkdir(dirname(OUT), { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({ ...device });
const page = await context.newPage();

// 'load' (not 'networkidle') because the lobby keeps WebSocket connections open,
// which would prevent networkidle from ever settling.
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('lobby-app', { timeout: 15000 });
await page.waitForTimeout(2000); // let presence/lobby render settle

await page.screenshot({ path: OUT, fullPage: true });
console.log(`Wrote ${OUT} (${device.viewport.width}x${device.viewport.height} @${device.deviceScaleFactor}x, WebKit)`);

await browser.close();
