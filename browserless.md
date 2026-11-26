# Browserless

Remote Chrome (browserless.io) for screenshots, scraping and headless checks without a local browser.

## Credentials

- Token lives in `.env` as `BROWSERLESS_TOKEN` (`.env` is gitignored). **Never commit it, paste it
  into source, or echo it in logs/screenshots.**
- Load it into the shell per session: `set -a; . ./.env; set +a` (or `export BROWSERLESS_TOKEN=...`).
- Endpoint host: `production-sfo.browserless.io`. Auth is the `?token=` query parameter — the REST
  routes reject an `Authorization` header.

## Screenshot (REST, any language)

The token goes in the URL, so feed the URL to curl on **stdin** (`-K-`) to keep it out of the
process argument list:

```bash
printf 'url = "https://production-sfo.browserless.io/screenshot?token=%s"\n' "$BROWSERLESS_TOKEN" \
  | curl -sS -X POST -K- \
    -H "Content-Type: application/json" \
    -d '{"url": "https://example.com"}' \
    --fail --output out.png \
    -w "HTTP %{http_code}\n"
```

Other REST routes: `/pdf`, `/content`, `/scrape`, `/function` (same POST + JSON body shape).

## Playwright / Puppeteer (WebSocket)

```js
// Playwright: the browser goes in the path
const browser = await pw.chromium.connect(
  `wss://production-sfo.browserless.io/chromium/playwright?token=${process.env.BROWSERLESS_TOKEN}`,
);

// Puppeteer: replace launch() with connect(), the rest of the script is unchanged
const browser = await puppeteer.connect({
  browserWSEndpoint: `wss://production-sfo.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`,
});
```

Use `connectOverCDP` instead of Playwright's `connect` only if you need Browserless helpers
(stealth, ad-blocking); it supports less of native Playwright.

## Notes

- The token is account-wide: any 401 usually means a private-fleet token hit the shared-cloud host,
  or the key was rotated — re-check the dashboard rather than guessing at the URL.
- 429 means concurrency/rate limited: wait and retry once.
- Always close the browser/session you opened.
