# Status — lost challenge work

## Where this stands: reproduction done, fix attempts blocked by a server-side deadlock

### 1. Reproduction (works, kept)

`test/lostchallenge.spec.ts` — two Jest integration tests against a real Nchan container
built from `docker/`:

- *"delivers a held offer when the target arrives in the lobby"* — before any change it
  **failed** exactly as `lostchallenge.md` §4 row 1 describes: the target leaves mid-game,
  the challenger's offer reaches nobody, `/api/challenges` shows the offer is held
  server-side, and the returning lobby receives `[]`.
- *"clears a held offer when the challenger goes offline, but not when the target leaves"* —
  **passed** before any change, confirming §4a already matches the spec.

### 2. Implementation attempted (in the tree, currently broken)

`docker/nchan_meta.js`:

- `challenges_live` now stores the full enriched offer body instead of just a timestamp.
- `replayHeldOffers()` re-publishes held offers when a presence `join` arrives.
- `challengeSince()` reads the offer time from that body for `/api/challenges`.

The stale assertion in `test/messagingclient.spec.ts` ("should not replay offers sent while
the user was disconnected") was flipped to expect re-delivery.

### 3. Blocker found — nested publish deadlocks

Re-publishing to `presence/lobby` from inside a `presence/lobby` publish hangs the join
request:

```
join with no held offer:  202  t=0.001
join with a held offer:   000  t=10.00   <- client timeout
njs_error.log: "pending events while closing request"
```

The subscriber *does* receive the replayed offer, then the join frame itself never gets
published. Moving the replay to before the join frame did not help, so any nested publish to
the same channel is unsafe, in either order. It is also intermittent: the spec passed once
immediately after the first implementation, then hung on later runs.

### 4. Verification state

- `test/nchan-meta-unit.spec.ts`: 40/40 pass.
- `test/lostchallenge.spec.ts`: passes only while the replay path is inactive; with the
  current code it hangs (30 s test timeout).
- Flipped `messagingclient` test: fails (5 s timeout — the join publish retries after the
  socket is cut).
- `npm run lint`: was 1 warning (unused var in the new spec), fixed but not re-run.

### 5. Heads-up on repo state

`docker/nchan_meta.js` currently contains the hanging version, and the steps already run
rebuilt the tags `tailuge/billiards-network:latest` and `:3.0.0` from it. The `:80`
container still runs the older image. This needs reverting or replacing before anything is
deployed.

### Where it should go

Deliver the held offers in the presence snapshot that `Lobby.join()` already fetches
(`GET /api/online/presence`) and emit them after settle. That keeps the server-side hold,
the 60 s expiry and the `/api/challenges` view, drops the unsafe nested publish, and costs a
small library change — so §10's "no client or library change" assumption no longer holds.
