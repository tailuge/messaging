
import { reduce, INITIAL_STATE } from "../src/client/utils.js";

// Mock lit, styles, components, user-store, and other browser modules
jest.mock('lit', () => ({
  html: (strings: any, ..._values: any[]) => strings[0],
  css: (strings: any, ..._values: any[]) => strings[0],
  LitElement: class {
    requestUpdate() {}
    get updateComplete() { return Promise.resolve(true); }
    get renderRoot() {
      return {
        querySelector: () => null
      };
    }
  },
}));

jest.mock('../src/client/user-store.js', () => ({
  userStore: {
    clientId: 'alice',
    userName: 'Alice',
    lod: '2',
    flip: false,
    useProxy: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    getCustom: () => ({}),
    setCustom: () => {},
  },
  StoreElement: class {},
}));

jest.mock('../src/client/logusage.js', () => ({
  logUsage: () => {},
}));

jest.mock('../src/client/styles.js', () => ({
  SHARED_STYLES: '',
  PLAYER_PANEL_STYLES: '',
  CHALLENGE_BANNER_STYLES: '',
  SENT_CHALLENGE_BANNER_STYLES: '',
  CHALLENGE_MODAL_STYLES: '',
  LOBBY_APP_STYLES: '',
}));

jest.mock('../src/client/user-slot-manager.js', () => ({
  UserSlotManager: class {
    update() {}
    getSlots() { return []; }
  }
}));

jest.mock('../src/client/user-list.js', () => ({}));
jest.mock('../src/client/message-modal.js', () => ({}));
jest.mock('../src/client/challenge-banner.js', () => ({}));
jest.mock('../src/client/challenge-modal.js', () => ({}));

const mockChallengeFn = jest.fn().mockResolvedValue('table-123');
const mockJoinLobby = jest.fn().mockImplementation(() => {
    return {
        onUsersChange: (cb: any) => {
            setTimeout(() => cb([{ userId: 'bob', userName: 'Bob' }]), 0);
        },
        onChallenge: () => {},
        onSettled: (cb: any) => {
            setTimeout(cb, 10);
        },
        challenge: mockChallengeFn,
        updatePresence: jest.fn().mockResolvedValue({}),
    };
});

jest.mock('../src/index.ts', () => {
    return {
        MessagingClient: class {
            setVersion() {}
            joinLobby = mockJoinLobby;
        }
    };
});

describe("Unified Rematch Scenarios (newspec.md)", () => {
    const A = "alice";
    const B = "bob";

    describe("Scenario 1: Both Rematch Simultaneously", () => {
        it("should deterministically pick one table and one starter", () => {
            const nextTurnId = A; // A should be first

            // A sends offer
            const offerA = { type: 'offer', challengerId: A, challengerName: 'Alice', challengeeId: B, tableId: 'table-A', ruleType: 'nineball', nextTurnId };
            let stateA = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId: A, payload: { ...offerA, recipientName: 'Bob' } } as any);

            // B sends offer
            const offerB = { type: 'offer', challengerId: B, challengerName: 'Bob', challengeeId: A, tableId: 'table-B', ruleType: 'nineball', nextTurnId };
            let stateB = reduce(INITIAL_STATE, { type: 'CHALLENGE_SENT', myId: B, payload: { ...offerB, recipientName: 'Alice' } } as any);

            // A receives B's offer. A is lower ID ("alice" < "bob"), so A yields.
            stateA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: offerB } as any);
            expect((stateA.challenges[B] as any).tableId).toBe('table-B');

            // B receives A's offer. B is higher ID, so B ignores.
            stateB = reduce(stateB, { type: 'CHALLENGE_MSG', myId: B, payload: offerA } as any);
            expect((stateB.challenges[A] as any).tableId).toBe('table-B');

            // Simulating OnlinePanel logic: A (lower ID) accepts B's offer
            const acceptA = { type: 'accept', challengerId: B, challengerName: 'Bob', challengeeId: A, ruleType: 'nineball', tableId: 'table-B', nextTurnId };

            stateA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: acceptA } as any);
            stateB = reduce(stateB, { type: 'CHALLENGE_MSG', myId: B, payload: acceptA } as any);

            expect((stateA.currentMatch as any)?.tableId).toBe('table-B');
            expect((stateB.currentMatch as any)?.tableId).toBe('table-B');
            expect((stateA.currentMatch as any)?.isFirst).toBe(true); // nextTurnId === A
            expect((stateB.currentMatch as any)?.isFirst).toBe(false);
        });
    });

    describe("Scenario 5/6: Rematch + Cross-site Accept (Simplified)", () => {
        it("should work when one player has an autoChallenge and the other sends an offer", () => {
            // A arrives with ?opponent.userId=B (autoChallenge)
            // B is already in lobby and sends an offer to A
            const offerB = { type: 'offer', challengerId: B, challengerName: 'Bob', challengeeId: A, tableId: 'table-B', ruleType: 'nineball' };

            let stateA = INITIAL_STATE;
            // A receives offerB.
            stateA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: offerB } as any);

            // In OnlinePanel.#checkAutoChallenge, A sees incoming offer from B and accepts.
            const acceptA = { type: 'accept', challengerId: B, challengerName: 'Bob', challengeeId: A, ruleType: 'nineball', tableId: 'table-B' };
            stateA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: acceptA } as any);

            expect((stateA.currentMatch as any)?.tableId).toBe('table-B');
        });
    });

    describe("isFirst logic edge cases", () => {
        it("should honor nextTurnId even if it's not the challenger", () => {
            // Bob challenges Alice, but sets Alice as nextTurnId
            const offerB = { type: 'offer', challengerId: B, challengeeId: A, tableId: 't1', ruleType: '9', nextTurnId: A };
            const acceptMsg = {
                type: 'accept', challengerId: B, challengeeId: A,
                tableId: 't1', ruleType: '9', nextTurnId: A
            };

            const stateA = reduce(INITIAL_STATE, { type: 'CHALLENGE_MSG', myId: A, payload: offerB } as any);
            const finalA = reduce(stateA, { type: 'CHALLENGE_MSG', myId: A, payload: acceptMsg } as any);
            expect((finalA.currentMatch as any)?.isFirst).toBe(true);

            const stateB = reduce(INITIAL_STATE, {
                type: 'CHALLENGE_SENT', myId: B,
                payload: { challengerId: B, challengeeId: A, tableId: 't1', status: 'pending', nextTurnId: A }
            } as any);
            const finalB = reduce(stateB, { type: 'CHALLENGE_MSG', myId: B, payload: acceptMsg } as any);
            expect((finalB.currentMatch as any)?.isFirst).toBe(false);
        });

        it("should fallback to challenger as first if nextTurnId is missing", () => {
            const acceptMsg = { type: 'accept', challengerId: B, challengeeId: A, tableId: 't1', ruleType: '9' };

            const stateB = reduce(INITIAL_STATE, {
                type: 'CHALLENGE_SENT', myId: B,
                payload: { challengerId: B, challengeeId: A, tableId: 't1', status: 'pending' }
            } as any);
            const finalB = reduce(stateB, { type: 'CHALLENGE_MSG', myId: B, payload: acceptMsg } as any);
            expect((finalB.currentMatch as any)?.isFirst).toBe(true);
        });
    });

    describe("OnlinePanel Rematch Option Extraction & Challenge Trigger", () => {
        let originalWindow: any;

        let onlinePanelConstructor: any;

        beforeAll(() => {
            originalWindow = (globalThis as any).window;
            (globalThis as any).window = {
                location: {
                    hostname: 'localhost',
                    host: 'localhost:80',
                    protocol: 'http:',
                    href: 'http://localhost/?opponent.userId=bob&opponent.userName=Bob&opponent.custom.cue=1&ruletype=threecushion&tableSize=5&raceTo=15&shotclock=60&reds=6&freeaim=true&custom.skin=red',
                    search: '?opponent.userId=bob&opponent.userName=Bob&opponent.custom.cue=1&ruletype=threecushion&tableSize=5&raceTo=15&shotclock=60&reds=6&freeaim=true&custom.skin=red'
                },
                history: {
                    replaceState: jest.fn()
                },
                customElements: {
                    define: jest.fn().mockImplementation((name, ctor) => {
                        if (name === 'online-panel') {
                            onlinePanelConstructor = ctor;
                        }
                    }),
                    get: jest.fn().mockImplementation((name) => {
                        if (name === 'online-panel') return onlinePanelConstructor;
                        return null;
                    })
                },
                document: {
                    addEventListener: jest.fn(),
                    removeEventListener: jest.fn(),
                    hidden: false
                },
                Notification: {
                    permission: 'default'
                }
            };
            (globalThis as any).location = (globalThis as any).window.location;
            (globalThis as any).history = (globalThis as any).window.history;
            (globalThis as any).customElements = (globalThis as any).window.customElements;
            (globalThis as any).document = (globalThis as any).window.document;
            (globalThis as any).Notification = (globalThis as any).window.Notification;
        });

        afterAll(() => {
            if (originalWindow) {
                (globalThis as any).window = originalWindow;
                (globalThis as any).location = originalWindow.location;
                (globalThis as any).history = originalWindow.history;
            } else {
                delete (globalThis as any).window;
                delete (globalThis as any).location;
                delete (globalThis as any).history;
            }
            delete (globalThis as any).customElements;
            delete (globalThis as any).document;
            delete (globalThis as any).Notification;
        });

        it("should parse whitelisted rematch options and trigger challenge with them", async () => {
            await import("../src/client/online-panel.js" as any);
            const panel = new (customElements.get('online-panel') as any)();

            // Connect and verify that the auto-challenge triggers challenge call with correct options
            await panel._connect();

            // Wait for onSettled microtask queue and timers to process
            await new Promise((resolve) => setTimeout(resolve, 30));

            // Verify that challenge was called on the mock lobby with correct parsed options
            expect(mockChallengeFn).toHaveBeenCalledWith(
                'bob',
                'threecushion',
                {
                    tableSize: '5',
                    raceTo: '15',
                    shotClock: '60',
                    reds: '6',
                    freeaim: 'true'
                },
                null,
                {}
            );

            // Also verify the URL was cleaned up
            expect(window.history.replaceState).toHaveBeenCalled();
            const lastUrl = (window.history.replaceState as jest.Mock).mock.calls[0][2];
            const urlObj = new URL(lastUrl);
            expect(urlObj.searchParams.get('opponent.userId')).toBeNull();
            expect(urlObj.searchParams.get('opponent.userName')).toBeNull();
            expect(urlObj.searchParams.get('opponent.custom.cue')).toBeNull();
            expect(urlObj.searchParams.get('custom.skin')).toBeNull();
            expect(urlObj.searchParams.get('tableSize')).toBeNull();
            expect(urlObj.searchParams.get('raceTo')).toBeNull();
            expect(urlObj.searchParams.get('shotClock')).toBeNull();
            expect(urlObj.searchParams.get('shotclock')).toBeNull();
            expect(urlObj.searchParams.get('reds')).toBeNull();
            expect(urlObj.searchParams.get('freeaim')).toBeNull();
        });
    });
});
