// Take an iPhone-style screenshot of any website using Playwright's WebKit browser.
// Requires WebKit:  npx playwright install --with-deps webkit
//
// Usage (all args optional, env vars as fallback, defaults in brackets):
//   node scripts/screenshot.mjs [url] [out] [device] [selector]
//   URL=https://example.com OUT=screenshots/example.png DEVICE='iPhone 15' SELECTOR=#app node scripts/screenshot.mjs
import { webkit, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const [urlArg, outArg, deviceArg, selectorArg] = args;

const DEVICE = deviceArg || process.env.DEVICE || 'iPhone 15';
const URL = urlArg || process.env.URL || 'http://localhost/lobby.html';
const OUT = outArg || process.env.OUT || join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots', 'screenshot.png');
const SELECTOR = selectorArg || process.env.SELECTOR || '';

const device = devices[DEVICE];
if (!device) {
    console.error(`Unknown device "${DEVICE}". Available iPhone devices: ${Object.keys(devices).filter(k => k.startsWith('iPhone')).join(', ')}`);
    process.exit(1);
}

// Wait until the page has actually rendered content (not a blank loading frame).
// three.js/WebGL apps commonly show a black loading screen until assets are
// ready, and a fixed delay is unreliable — especially on cold loads. WebKit
// clears the WebGL drawing buffer between frames (preserveDrawingBuffer: false),
// so JS can't read the canvas directly; instead we screenshot the composited
// page and decode it in-browser to check for content.
async function waitForContent(page, timeoutMs = 15000) {
    const hasWebGLCanvas = await page.evaluate(() =>
        [...document.querySelectorAll('canvas')].some(c => {
            try { return !!(c.getContext('webgl') || c.getContext('webgl2')); } catch { return false; }
        })
    );
    if (!hasWebGLCanvas) return true; // not a WebGL page — nothing to wait for

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const shot = await page.screenshot({ type: 'jpeg', quality: 30 });
        const dataUrl = 'data:image/jpeg;base64,' + shot.toString('base64');
        const colors = await page.evaluate((url) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = 100;
                c.height = 100;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, 100, 100);
                const d = ctx.getImageData(0, 0, 100, 100).data;
                const seen = new Set();
                for (let i = 0; i < d.length; i += 16) {
                    seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
                    if (seen.size > 50) { resolve(seen.size); return; } // blank page has ~1 color
                }
                resolve(seen.size);
            };
            img.onerror = () => resolve(-1);
            img.src = url;
        }), dataUrl);
        if (colors > 50) return true;
        await page.waitForTimeout(500);
    }
    console.warn('WARNING: page still blank after timeout — screenshot may be dark');
    return false;
}

await mkdir(dirname(OUT), { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({ ...device });
const page = await context.newPage();

// 'load' (not 'networkidle') because sites with WebSockets (like the lobby)
// would prevent networkidle from ever settling.
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

// Optional: wait for a specific element (e.g. 'lobby-app', '#app') before shooting.
if (SELECTOR) {
    await page.waitForSelector(SELECTOR, { timeout: 15000 });
}
await waitForContent(page);
await page.waitForTimeout(500); // let the render settle

await page.screenshot({ path: OUT, fullPage: true });
console.log(`Wrote ${OUT} (${device.viewport.width}x${device.viewport.height} @${device.deviceScaleFactor}x, WebKit)`);

await browser.close();
