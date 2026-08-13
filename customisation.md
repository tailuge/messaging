# Customisation Contract

The one contract: a `custom` dictionary is dutifully transcribed into URL params — nothing else. The dictionary is generic: `cue` is just the first element, more will follow (skin, cloth, table, …).

## Shape

`custom` is a dictionary of primitives (`string | number | boolean`) and nested objects:

```json
{ "cue": { "shaftColour": "#d2b48c", "grain": true }, "skin": "blue" }
```

`undefined` / `null` values are omitted. Nested objects flatten to dot-notation keys; arrays are not recursed.

## Transport

1. **Persistence** — localStorage key `custom` (JSON string of the dict). `userStore.setCustom(key, value)` read-modify-writes it; `userStore.getCustom()` returns the in-memory snapshot, refreshed cross-document via the `storage` event (so e.g. the `cue.html` iframe can write to `custom.cue.*` directly).
   - **Iframe modifiers must not erase adjacent fields**: a page that customises `custom.<element>.*` (e.g. the cue picker writing `custom.cue.*`) must read the existing dict, set only its own key, and write the whole dict back — never `setItem('custom', JSON.stringify(ownState))`, or it wipes sibling customisations (e.g. `custom.skin`) owned by other elements.
2. **Challenge messages** — `custom` rides on challenge offer/accept messages (`ChallengeMessage.custom`).
3. **Game URL** — `gameUrl()` (and `soloUrl()` for the solo panel) flattens it recursively:
   - local player → `custom.a.b=v`
   - opponent → `opponent.custom.a.b=v`

   Numbers and booleans are stringified; `#` in hex colours is URL-encoded (`%23`), so the consumer must decode params before use.

## Golden rule

Adding a new customisation (a new key under `custom`) costs **zero** transport/URL code: write it with `userStore.setCustom('field', value)` (or directly from its own iframe, e.g. `custom.cue.*`) and read it in the game page at `custom.field.*`. The transport never knows or cares what the fields mean. Verified by `test/gameurl-custom.spec.ts` and `test/rematch-unified.spec.ts`.
