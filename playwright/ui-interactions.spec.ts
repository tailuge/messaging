import { test, expect } from '@playwright/test';

const setupUser = async (browser: any, name: string, id: string) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/publish/presence/lobby', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) })
    );
    await page.goto(`http://localhost:80/lobby.html?clientId=${id}&userName=${name}`);
    return { context, page };
};

const dispatchState = (page: any, users: any[]) =>
    page.evaluate((u: any[]) => {
        const app = document.querySelector('lobby-app') as any;
        app._ctrl.dispatch({ type: 'CONNECTED', payload: true });
        app._ctrl.dispatch({ type: 'USERS_UPDATE', payload: u });
    }, users);

test.describe('Chat', () => {
    test('should open chat modal and send a message', async ({ browser }) => {
        const alice = await setupUser(browser, 'Alice', 'alice');
        const bob   = await setupUser(browser, 'Bob',   'bob');

        const users = [
            { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
            { userId: 'bob',   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
        ];
        await dispatchState(alice.page, users);
        await dispatchState(bob.page, users);

        // Inject an unread chat message for Alice so the 💬 button appears
        await alice.page.evaluate(() => {
            const panel = (document.querySelector('lobby-app') as any).shadowRoot.querySelector('online-panel') as any;
            const modal = panel.shadowRoot.querySelector('message-modal');
            modal.dispatchEvent(new CustomEvent('unread-changed', {
                bubbles: true, composed: true,
                detail: { userId: 'bob', count: 1 }
            }));
        });

        // Alice clicks the chat button for Bob
        const chatBtn = alice.page.locator('button[aria-label="Unread message from Bob"]');
        await expect(chatBtn).toBeVisible();
        await chatBtn.click();

        // Modal opens — inject a mock lobby so sendChat works
        await alice.page.evaluate(() => {
            const panel = (document.querySelector('lobby-app') as any).shadowRoot.querySelector('online-panel') as any;
            const modal = panel.shadowRoot.querySelector('message-modal') as any;
            modal.lobby = {
                currentUser: { userId: 'alice' },
                onChat: () => {},
                sendChat: () => {},
            };
            modal.targetId   = 'bob';
            modal.targetName = 'Bob';
        });

        const modal = alice.page.locator('[aria-label="Chat with Bob"]');
        await expect(modal).toBeVisible();

        // Type and send a message
        const input = alice.page.locator('[aria-label="Message text"]');
        await input.fill('Hello Bob!');
        await alice.page.locator('button:has-text("Send")').click();

        // Message appears in thread
        await expect(alice.page.locator('.msg.mine')).toBeVisible();

        await alice.context.close();
        await bob.context.close();
    });

    test('should show unread badge and clear on open', async ({ browser }) => {
        const alice = await setupUser(browser, 'Alice', 'alice');

        const users = [
            { userId: 'alice', userName: 'Alice', messageType: 'presence', type: 'join', meta: { country: 'US' } },
            { userId: 'bob',   userName: 'Bob',   messageType: 'presence', type: 'join', meta: { country: 'GB' } },
        ];
        await dispatchState(alice.page, users);

        // Simulate incoming chat from Bob
        await alice.page.evaluate(() => {
            const panel = (document.querySelector('lobby-app') as any).shadowRoot.querySelector('online-panel') as any;
            const modal = panel.shadowRoot.querySelector('message-modal');
            modal.dispatchEvent(new CustomEvent('unread-changed', {
                bubbles: true, composed: true,
                detail: { userId: 'bob', count: 2 }
            }));
        });

        await expect(alice.page.locator('button[aria-label="Unread message from Bob"]')).toBeVisible();

        await alice.context.close();
    });
});

test.describe('Username change', () => {
    test('should update display name on Enter', async ({ browser }) => {
        const { context, page } = await setupUser(browser, 'Alice', 'alice');

        // Click the badge to enter edit mode
        const badge = page.locator('user-badge');
        await badge.locator('[role="button"]').click();

        // Input should appear
        const input = page.locator('[aria-label="Edit display name"]');
        await expect(input).toBeVisible();

        // Type new name and press Enter
        await input.fill('NewName');
        await input.press('Enter');

        // Display name updates
        await expect(page.locator('[role="button"][aria-label*="NewName"]')).toBeVisible();

        await context.close();
    });

    test('should update display name on click outside', async ({ browser }) => {
        const { context, page } = await setupUser(browser, 'Alice', 'alice');

        await page.locator('user-badge [role="button"]').click();

        const input = page.locator('[aria-label="Edit display name"]');
        await expect(input).toBeVisible();
        await input.fill('ClickOut');

        // Click somewhere outside the badge
        await page.locator('h1').click();

        await expect(page.locator('[role="button"][aria-label*="ClickOut"]')).toBeVisible();

        await context.close();
    });

    test('should cancel edit on Escape', async ({ browser }) => {
        const { context, page } = await setupUser(browser, 'Alice', 'alice');

        await page.locator('user-badge [role="button"]').click();

        const input = page.locator('[aria-label="Edit display name"]');
        await input.fill('ShouldNotSave');
        await input.press('Escape');

        // Input gone, original name still shown
        await expect(input).not.toBeVisible();
        await expect(page.locator('user-badge')).toContainText('Alice');

        await context.close();
    });
});
