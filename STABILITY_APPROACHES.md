# Positional Stability for Online User Display

## The Problem
The current implementation sorts users alphabetically by `userName`. While this is predictable, it causes significant UI "jitter" in a dynamic environment:
- New users joining can shift the entire list.
- Users changing their names (even slightly) triggers a re-sort.
- Users leaving cause remaining items to slide up, often changing the target under a user's cursor.

## Proposed Solutions

### 1. Chronological (Arrival) Ordering
Instead of alphabetical sorting, users are ordered by when they first joined the lobby.
- **Mechanism**: Use the `since` or `ts` metadata from the initial join message to establish a fixed position.
- **Pros**: New users always appear at the bottom. Existing users never move unless someone above them leaves.
- **Cons**: Difficult to find specific users in a large list; requires consistent join timestamps.

### 2. Slot-based Grid Layout
Maintain a fixed grid of "slots."
- **Mechanism**: Assign each user to the first available index in an array. When a user leaves, their slot becomes "empty" or a "ghost" for a period before being reclaimed.
- **Pros**: Perfect positional stability. A user at index 5 remains at index 5.
- **Cons**: Can lead to a sparse UI with gaps; requires managing slot assignments.

### 3. Ghosting / Delayed Removal
When a user leaves, they are not immediately removed from the DOM.
- **Mechanism**: Mark the user as "offline" (e.g., grayscale, 0.5 opacity) but keep their element in the list for 5-10 seconds.
- **Pros**: Prevents sudden list shifting, giving the user time to finish an interaction.
- **Cons**: The list still eventually shifts; can be confusing if many people leave at once.

### 4. Sticky Sorting (Hybrid Approach)
A combination of stateful client-side tracking and sorting.
- **Mechanism**:
    1. On initial load, sort users alphabetically.
    2. Store this order in a local `Map` (userId -> position).
    3. New users are appended to the end of the current list.
    4. Re-sort only occurs on manual refresh or after the lobby becomes empty.
- **Pros**: High stability during a session. Familiar alphabetical start.
- **Cons**: The list becomes increasingly unsorted over time.

### 5. UI-Level "Locking" during Interaction
- **Mechanism**: If the user's cursor is over the `UserList`, or if a `ChallengeModal` is open, suspend DOM updates that would change item heights or positions.
- **Pros**: Prevents "misclicks" during active use.
- **Cons**: Can lead to a "frozen" feeling; technical complexity in tracking "active" interaction state.

## Recommendation
**Approach 4 (Sticky Sorting)** combined with **Approach 3 (Ghosting)** provides the best balance.
- Users stay where they are for the duration of the session.
- Leaving users fade out slowly, maintaining the positions of those below them for a short window.
- New users don't disrupt the flow for existing users.
