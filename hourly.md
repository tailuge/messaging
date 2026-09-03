# Hourly Arena Seeding — Reworked Design

Design doc for the seeding behaviour of the shared `active-arenas` component
(`src/client/active-arenas.js`, used by both the lobby strip and the arena page).

## Today's behaviour (to be replaced)

- Seeds only inside the UTC minute window **30–55**, and only once per UTC hour
  (`_hourlyArenaPeriod` guard).
- Always creates a **30-minute** arena ending at `now + 30min` (ends at an
  arbitrary minute, e.g. 10:47).
- Deterministic id per UTC hour: `arena-hourly-YYYYMMDD-HH`.

Result: the `:00–:30` stretch of most hours has **no active arena at all**, and
when a seed is created late in the window its end time is not aligned.

## Decisions (agreed)

1. **Seeded arenas only.** End-alignment applies to auto-seeded "hourly" arenas
   (`creatorId: "hourly-arena"`). User-created arenas keep their 10/30-minute
   durations and arbitrary end times.
2. **End times aligned to UTC `:00` / `:30`.** Seeds always end exactly on the
   hour or half past, in UTC.
3. **Create whenever no arena is active.** Remove the 30–55 window and the
   once-per-hour guard. Any poll that finds zero active arenas triggers a seed.
4. **Shorter sprints are fine.** When seeding mid-slot the arena runs only until
   the next UTC boundary (e.g. created 10:23 → ends 10:30). The countdown and
   "ends ⏰" display already reflect the real `endTime`.
5. **Shared UTC name.** The arena name carries its UTC boundary so it reads
   identically for every user, e.g. `Nine Ball Mini Hourly Arena 14:30 UTC`.
6. Client code stays in the shared component — one implementation for lobby and
   arena page.

## New seeding algorithm (client, `active-arenas._load()`)

```
every poll (REFRESH_MS):
  data = GET /api/arena
  active = data.arenas where endTime > now AND status != finished
  if active.length > 0: stop                        # something is running

  end      = next UTC boundary strictly after now   # :00 or :30
  minutes  = (end - now) / 60000
  if minutes < MIN_SEED_MINUTES (5): stop           # too close to boundary;
                                                    # next poll after it seeds the
                                                    # full 30-min slot instead

  preset   = HOURLY_PRESETS[ boundaryUTCHours % presets.length ]
  POST /api/arena {
    id:            `arena-hourly-YYYYMMDD-HHMM`     # from the *boundary* slot
    creatorId:     "hourly-arena"
    creatorName:   `${preset.name} ${HH}:${MM} UTC` # HH:MM = boundary
    ruleType, options: preset
    endTime:       end                              # exact alignment (see below)
  }
  re-fetch and dispatch arenas-loaded
```

Notes:

- **Slot id & idempotency.** The id is derived from the boundary, so two open
  tabs (lobby + arena page) that both see an empty list post the *same* id; the
  server's `SET … NX` makes the second a harmless no-op. A mid-slot sprint uses
  the id of the boundary it ends at (e.g. `…-1030`), and the next seed after it
  ends targets a later boundary — no id is ever reused for the same slot.
- **Gap after a sprint.** A seed ending at 10:30 is replaced by the next poll
  (≤ `REFRESH_MS` later) with the slot ending 11:00. Mid-slot arenas are only
  created when a poll catches an empty list, so coverage is continuous apart
  from the poll interval itself.
- **`MIN_SEED_MINUTES` = 5.** A 2-second arena is noise (it would be born
  finished), so we only seed when at least 5 minutes remain to the boundary;
  below the floor we wait, and the immediately following poll creates the normal
  30-minute slot.
- **UTC everywhere.** Boundaries, slot ids, preset rotation and the name suffix
  all use UTC, matching the existing UTC-based window logic and keeping the name
  globally unambiguous.

## Server accommodation (the one non-client change)

The API (`docker/api.njs`, `arenaCreate`) currently computes
`endTime = start + durationMinutes` and only accepts `durationMinutes` 10 or 30.
That makes exact boundary-aligned end times impossible from the client alone
(a seed at 10:23 cannot express "end at 10:30").

Minimal accommodation — accept an optional `endTime` (ms, epoch) for seeds:

```
if body.endTime is a finite number:
    must satisfy  start < endTime <= start + 30min        # else 400
    arena.endTime        = endTime
    arena.durationMinutes = max(1, round((endTime-start)/60000))   # display only
else:
    existing behaviour unchanged (durationMinutes ∈ {10, 30}, now + duration)
```

This is ~5 lines inside `arenaCreate` and does not affect user-created arenas
(they never send `endTime`), nor any existing validation.

### Fallback if the API cannot change

Strictly client-only alternative: never create mid-slot; instead seed only when
a poll lands on/near a boundary (`:00`/`:30`), always 30-minute arenas. Perfect
alignment with zero server change, but the list can be empty for up to ~30
minutes between slots and mid-slot gaps are never filled — this contradicts
decision 3 and is **not recommended**.

## Out of scope

- Alignment for user-created arenas (impossible without forcing their durations).
- Changing displayed duration semantics for normal arenas.
- Persistence/history of short-lived seeds beyond the existing completed-list TTL.
