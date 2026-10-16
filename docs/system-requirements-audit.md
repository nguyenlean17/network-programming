# OTTv2 Bot Tournament Requirements Audit

Audit date: 2026-10-16. Scope: requirements in the supplied project brief that can be evaluated from repository code and local tests. Live Render, credentials, billing, and production database checks are excluded.

## Overall result

**Not all requirements are implemented yet.** The existing human multiplayer remains intact, and the bot protocol, account/bot submission foundation, tournament round robin, scoring, replay, and a Practice Arena are present. Several requested user-facing and administration features remain incomplete. The isolation code is present, but the repository tests use a mocked Render SDK; the real sandbox resource profile is therefore not proven by these tests.

## Requirement-by-requirement status

| Brief section | Status | Repository evidence and remaining work |
| --- | --- | --- |
| A. Preserve human games | Met by current regression evidence | The existing WebSocket room/game modules remain; `tests/server.integration.test.js` and `tests/server.timer.test.js` are in `npm test`. Bot matches use a separate queue and `ServerGameSession`. |
| B. Bot API | Mostly met | `docs/bot-api-v1.md`, `server/bots/protocol.js`, `server/bots/match.js`, and `examples/bots/*.py` define JSON input/output, legal moves, memory, API version, invalid output, timeout, crash and draw handling. Coordinator revalidates moves. The worker uses a per-decision timeout; there is no independent configurable whole-match wall-clock deadline. |
| C. Accounts and bot management | Partial | `platformRouter.js` supports account registration/login, bot creation, editing, deletion when no history references it, version upload, SHA-256 and validation state. `.py` uploads are limited to 64 KiB; ZIP uploads must be <=128 KiB and contain exactly one root `main.py`, with decompressed size <=64 KiB and integrity checks. Email verification and richer validation diagnostics/review tools are absent. |
| D. Safe runner | Partial | `renderSandboxRunner.js` uses separate sandboxes per seat, denies network, caps source/stdout, runs Python with a 2-second decision limit, and applies shell CPU, memory, process, file and descriptor limits. The Render adapter test is mocked, so these controls and the real runtime remain unproven against an actual sandbox. |
| E. Practice Arena | Mostly met | `bots.html` and `js/botHub.js` queue a verified owned bot against another `READY` bot, provide two seeded official sample opponents, support 1- or 3-game runs with side alternation, show status and link to a live replay. Users are limited to three active matches. |
| F. Automatic tournaments | Partial | Round-robin scheduling, entry locking, queued matches, execution, pause/resume, retry, 3/1/0 scoring, draft/open editing, and safe pre-start cancellation are implemented. Other formats, configurable rounds/pairing, participant management, cancellation during a live event, and explicit result publication/locking are absent. |
| G. Standings and scoring | Mostly met; tie policy incomplete | The configured 3/1/0 scores and standings include rank, owner, bot/version, played, W/D/L, win rate, and points. Equal scores share a rank. No secondary tie-break rule was supplied, so head-to-head/score-difference criteria are not implemented. |
| H. Match/replay | Mostly met | `match.html`, `js/replayPage.js`, `server/bots/replay.js`, and replay API rebuild each requested board frame from persisted moves; player names, match kind, outcome, reason and diagnostic detail are exposed. The code has no separate persisted structured runner-log record. |
| I. Admin console | Partial | Backend checks `ADMIN` for tournament lifecycle and queue retry. UI supports tournament lifecycle, draft/open editing, cancellation before scheduled matches, queue status and retry. User/role moderation, participant management, bot/version moderation, resource metrics, searchable match/log console, and complete audit coverage remain absent. |
| Data and persistence | Mostly met in schema/code | PostgreSQL migrations define users, bots, immutable-in-use versions, tournaments, entries, matches, moves, jobs and audit records. Standings are recalculated from completed matches. Integration against an actual PostgreSQL instance is not part of local tests. |
| Quality gates | Partial | `npm test` passes the existing multiplayer suite, bot unit tests, API tests with a fake pool, sandbox tests with a fake SDK, and two trusted Python examples. There is no real PostgreSQL/Render worker end-to-end test for upload → sandbox validation → tournament execution → stored replay → standings. |
| UI states and no fake data | Mostly met | The bot UI has loading/empty/success/error messaging. Practice examples are real seeded source versions run through the same validation and queue, not hard-coded sample match results. |

## Verification run

`npm test` completed successfully on the updated worktree, including both Python example bots. ZIP parsing, bot API ownership and administration, match execution, standings, and mocked sandbox adapter checks pass. Local and mocked tests cannot prove production database migrations, Render API behavior, or real sandbox isolation.

The worktree also fixes practice-job selection, complete leaderboard fields, and replay labels/reasons. Practice stores move progress incrementally so active matches can be watched. These changes are not yet committed or pushed.

## Remaining implementation work inside the repository

1. Add bot/version moderation, searchable match/job diagnostics, and worker resource metrics.
2. Define an explicit publication policy for final results; keep ranking tied on equal points until a tie-break rule is supplied.
3. Add a database-backed worker integration test and explicit total-match deadline.
4. Run the sandbox adapter and migrations against an actual configured Render/PostgreSQL environment before public tournament use.
