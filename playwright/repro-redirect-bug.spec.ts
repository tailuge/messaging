import { test, expect } from '@playwright/test';

/**
 * Regression tests for the "lobby redirects back to game" bug.
 *
 * Root cause: Nchan buffers messages for 90s. A fresh lobby session would
 * receive a stale 'accept' from a completed game and immediately redirect.
 *
 * Fix: the reducer only processes an 'accept' if the current session already
 * has a matching pending challenge (keyed by tableId) in its challenges state.
 */
test.describe('Lobby Redirect Bug Regression', () => {
  test.setTimeout(15000);

  const TABLE_ID = 'regression-table-42';
  const staleAccept = {
    messageType: 'challenge',
    type: 'accept',
    challengerId: 'alice',
    challengerName: 'Alice',
    challengeeId: 'bob',
    ruleType: 'eightball',
    tableId: TABLE_ID,
    meta: { ts: Date.now() - 60_000 }, // 60s old — simulates a buffered message
  };

  async function openLobby(browser, userId: string, userName: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Stub publish so the lobby doesn't fail trying to reach Nchan
    await page.route('**/publish/**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ status: 'sent' }) }),
    );
    await page.goto(
      `http://localhost:80/lobby.html?userId=${userId}&userName=${userName}`,
    );
    await page.waitForFunction(() => {
      const app = document.querySelector('lobby-app') as any;
      return app && app._ctrl;
    });
    return { context, page };
  }

  function dispatch(page, action) {
    return page.evaluate((a) => {
      const app = document.querySelector('lobby-app') as any;
      app._ctrl.dispatch(a);
    }, action);
  }

  // ── Bug regression: stale buffered accept must NOT redirect fresh session ──

  test('buffered accept on fresh lobby session does NOT redirect', async ({ browser }) => {
    const { context, page } = await openLobby(browser, 'alice', 'Alice');

    // Fresh session — no pending challenges at all
    await dispatch(page, { type: 'CONNECTED', payload: true });

    // Receive the stale accept that arrived from Nchan's buffer
    await dispatch(page, { type: 'CHALLENGE_MSG', payload: staleAccept });

    // Wait one render tick then assert we are still on the lobby page
    await page.waitForTimeout(500);
    expect(page.url()).toContain('lobby.html');
    expect(page.url()).not.toContain(TABLE_ID);

    await context.close();
  });

  // ── Positive case: a legitimate in-session accept DOES still redirect ──

  test('in-session accept still redirects to game', async ({ browser }) => {
    const { context, page } = await openLobby(browser, 'alice', 'Alice');

    await dispatch(page, { type: 'CONNECTED', payload: true });

    // Alice sent a challenge this session → her state has a pending entry
    await dispatch(page, {
      type: 'CHALLENGE_SENT',
      payload: {
        challengerId: 'alice',
        challengerName: 'Alice',
        challengeeId: 'bob',
        recipientName: 'Bob',
        ruleType: 'eightball',
        tableId: TABLE_ID,
      },
    });

    // Bob's accept arrives — tableId matches what Alice sent
    const freshAccept = { ...staleAccept, meta: { ts: Date.now() } };
    await dispatch(page, { type: 'CHALLENGE_MSG', payload: freshAccept });

    // Should be redirected to the game
    await expect(page).toHaveURL(new RegExp(TABLE_ID), { timeout: 5000 });

    await context.close();
  });

  // ── Edge: accept for a DIFFERENT tableId is still ignored ──

  test('accept for a different tableId is ignored even with a pending challenge', async ({ browser }) => {
    const { context, page } = await openLobby(browser, 'alice', 'Alice');

    await dispatch(page, { type: 'CONNECTED', payload: true });

    // Alice has a pending challenge for a DIFFERENT table
    await dispatch(page, {
      type: 'CHALLENGE_SENT',
      payload: {
        challengerId: 'alice',
        challengerName: 'Alice',
        challengeeId: 'bob',
        recipientName: 'Bob',
        ruleType: 'eightball',
        tableId: 'different-table-99',
      },
    });

    // Accept arrives with the OLD stale tableId
    await dispatch(page, { type: 'CHALLENGE_MSG', payload: staleAccept });

    await page.waitForTimeout(500);
    expect(page.url()).toContain('lobby.html');
    expect(page.url()).not.toContain(TABLE_ID);

    await context.close();
  });
});
