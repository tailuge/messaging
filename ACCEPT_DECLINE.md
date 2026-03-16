# Challenge Deduplication on Reconnect

## Problem

When B accepts (or declines) a challenge then reconnects, they receive the buffered "offer" again even though they've already responded to it.

### Scenario
1. A challenges B → B receives "offer"
2. B accepts → B sends "accept" to A
3. B disconnects and reconnects
4. Nchan delivers buffered messages: "offer" → "accept"
5. B receives "offer" notification again (bug!)

## Solution

Track responded challenges and filter offers before notifying listeners.

## Implementation

### Storage (persists across Lobby instances)
```typescript
// Module-level for tests, sessionStorage for browser
const respondedChallengesStorage = new Map<string, number>();
```

### Data Structures
- `pendingChallenges: ChallengeMessage[]` - offers awaiting 250ms timer
- Single 250ms timer - starts on first challenge arrival
- Responded challenges stored in module-level Map

### Flow

**When offer arrives:**
1. Add to pendingChallenges
2. Start 250ms timer if not running

**When accept/decline arrives:**
1. Key = `tableId || recipientId`
2. Save to respondedChallenges storage

**When timer fires:**
1. For each pending challenge
2. If key exists in respondedChallenges → skip notification
3. Otherwise → notify listeners

### Key Matching
- Offer: `tableId` is set (challenger's table)
- Accept: `tableId` is same value, `recipientId` is challenger
- Key is `tableId` for both → matches correctly

### Storage Methods

```typescript
private getRespondedChallenges(): Set<string> {
  // Check sessionStorage (browser) or module-level Map (tests)
}

private saveRespondedChallenge(key: string): void {
  // Store in both sessionStorage and module-level Map
}

private hasResponded(key: string): boolean {
  // Check both sessionStorage and module-level Map
}
```

### Cleanup
- `stopChallengeTimer()` clears the timer but does NOT clear responded challenges storage
- This allows state to persist across reconnects within the same session

## Why This Works

1. **Fresh challenge**: Timer fires after 250ms → check responded → no match → notify
2. **Reconnect with accept in buffer**: 
   - Offer arrives → pending, timer starts
   - Accept arrives → key saved to storage
   - Timer fires → check responded → match found → skip notification
3. **Same for decline**: Same logic applies

## Edge Cases Handled

- Multiple challenges from different users: Each tracked by unique key
- Decline: Works because decline also saves key
- Cancel: Works because cancel also saves key
- Page refresh: sessionStorage persists across refreshes
- Test environment: Module-level Map provides fallback
