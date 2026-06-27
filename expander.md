# Online Panel Sidebar — Implementation Plan

## Philosophy

Grid-Driven Orchestration: Define a master 2D grid on `<main>`, toggle a single CSS class, and let the browser handle all reflow. JS only flips a boolean; CSS does everything else.

## Files Changed

3 files, ~50 lines total.

---

## Step 1: `src/client/user-list.js` — emit expand/collapse event

Add one line in `#toggleExpand()` so the parent can react:

```js
// After toggling this.#expanded:
emit(this, 'user-list-toggle', { expanded: this.#expanded });
```

The `emit` helper already exists at the top of the file (line 7: `bubbles: true, composed: true`), so the event escapes all shadow DOMs and reaches `lobby-app`.

**~3 lines.**

---

## Step 2: `src/client/lobby.js` — listen for event, toggle CSS class, flatten DOM

### 2a. Add `_sidebarOpen` property

```js
static properties = {
    _theme: { type: String, reflect: true, attribute: 'theme' },
    _sidebarOpen: { type: Boolean },  // NEW
};
```

### 2b. Initialize in constructor + listen for event

```js
constructor() {
    super();
    this._theme = document.documentElement.getAttribute('theme') || 'light';
    this._sidebarOpen = false;  // NEW
    // NEW: listen for user-list expand/collapse
    this.addEventListener('user-list-toggle', e => {
        this._sidebarOpen = e.detail.expanded;
    });
}
```

### 2c. Flatten `<main>` DOM

Remove `.main-row` and `.players` wrappers so `.solo`, `<online-panel>`, `.motd-row`, and `.info-row` are all direct children of `<main>`.

**Before:**
```html
<main>
    <div class="main-row">
        <div class="solo">
            <div class="panel">...</div>
        </div>
        <div class="players panel"><online-panel></online-panel></div>
    </div>
    <div class="motd-row panel"><motd-panel></motd-panel></div>
    <div class="info-row"><info-panel></info-panel></div>
</main>
```

**After:**
```html
<main class="${this._sidebarOpen ? 'has-sidebar' : ''}">
    <div class="solo">
        <div class="panel">
            <div class="panel-title">Solo Practice</div>
            <solo-panel></solo-panel>
        </div>
    </div>
    <online-panel class="panel"></online-panel>
    <div class="motd-row panel"><motd-panel></motd-panel></div>
    <div class="info-row"><info-panel></info-panel></div>
</main>
```

Note: `online-panel` now gets `class="panel"` directly to preserve card styling (background, border, border-radius, padding) that was previously provided by `.players.panel`.

**~12 lines changed.**

---

## Step 3: `src/client/styles.js` — CSS Grid in `LOBBY_APP_STYLES`

### 3a. Remove old `.main-row` flex layout

```css
/* REMOVE these 3 rules: */
.main-row { display: flex; gap: 0.2rem; flex-shrink: 0; margin-bottom: 3px; }
.main-row .solo { flex: 0 0 auto; }
.main-row .players { flex: 1; display: flex; flex-direction: column; }
```

### 3b. Add grid layout (after `.info-row .panel { overflow: visible; }`)

```css
/* === Narrow screens (< 600px) ===
   Natural block stacking — no grid needed.
   Children of <main> stack in DOM order:
     solo → online-panel → motd-row → info-row                */

/* === Wide screens (≥ 600px) === */
@media (min-width: 600px) {
    main {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.2rem;
    }

    /* Default state: solo left, online-panel right */
    .solo           { grid-area: 1 / 1 / 2 / 2; }
    online-panel    { grid-area: 1 / 2 / 2 / 3; }
    .motd-row       { grid-area: 2 / 1 / 3 / 3; }
    .info-row       { grid-area: 3 / 1 / 4 / 3; }

    /* Expanded state: online-panel becomes fixed-width right sidebar */
    main.has-sidebar {
        grid-template-columns: 1fr 300px;
    }
    main.has-sidebar .solo {
        grid-area: 1 / 1 / 2 / 2;
    }
    main.has-sidebar online-panel {
        grid-area: 1 / 2 / 4 / 3;     /* spans rows 1–3 */
        overflow-y: auto;
        max-height: calc(100vh - 6rem);
    }
    main.has-sidebar .motd-row {
        grid-area: 2 / 1 / 3 / 2;
    }
    main.has-sidebar .info-row {
        grid-area: 3 / 1 / 4 / 2;
    }
}
```

**~35 lines added, ~3 removed.**

---

## Layout Summary

| State | < 600px | ≥ 600px collapsed | ≥ 600px expanded |
|---|---|---|---|
| solo | Full width | Left column, auto | Left column |
| online-panel | Full width, below solo | Right column, fills remainder | Right sidebar, 300px, full height |
| motd-row | Full width | Full width below | Left column below solo |
| info-row | Full width | Full width below | Left column below motd |
| header / footer | Unchanged | Unchanged | Unchanged |

---

## What stays unchanged

- `<header>` (logo, title, user-badge, settings-modal) — completely untouched
- `<footer>` — completely untouched
- `.container` — still `flex column`
- All shadow DOM internals of `online-panel`, `user-list`, `solo-panel`, etc.
- All JS logic in `online-panel.js` (MessagingClient, challenge handling, modals)

## Edge cases

- **Narrow screens + expanded user-list:** Grid does not activate (`@media` gates it). Online-panel stacks below solo in block flow. The user-list inside online-panel still expands vertically (showing all users) as before.
- **No online users:** User-list renders "No other players online yet" message. Expand button not rendered (existing behavior). `_sidebarOpen` stays `false`.
- **`.panel` class on `online-panel`:** Preserves card styling (background, border, radius, padding) for the sidebar mode. In collapsed mode on wide screens it also gets the card look, which is an improvement.
