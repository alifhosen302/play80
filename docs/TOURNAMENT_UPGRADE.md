# PLAY80 — Tournament upgrade specification

All coins are non-redeemable demo currency. No real money, external cash prizes, or payment links. This specification is a target; the only existing verified live game is Memory. Never charge a fee or accept a client-reported score for a game whose authoritative move engine has not passed verification.

## Target shared tournament flow
- Separate event for each of the four tournament games: Memory, Block Puzzle, Bubble Shooter, 2048. Registration opens for 3 hours, then play lasts 72 hours. Show server timestamps, countdown, entry terms, leaderboard and past winners on each game's details page.
- Registration establishes eligibility. Each **new** paid demo round costs 500 virtual coins. Resuming an unfinished round after exit, reconnect or retry is free. An idempotent server operation must debit exactly once. The existing Memory event charges 500 once at join; do not retroactively change its terms.
- Cumulative score is the sum of server-validated round scores, not highest score; persistent across restarts. Rank by total, then highest round, then deterministic tie-break. Use server time, not the phone clock.
- Keep previously configured rank caps (1–8: 1800,1200,1000,900,800,700,600,500 virtual coins; maximum pool 7500). Display the funded pool and actual allocation separately. No cash payouts. If the intended per-round pool differs, revise the announced rules before activating the next event.
- 15 clearly identified AI competitors per event (configurable to 20); names can be human-readable but every public rank and result must explicitly say AI. AI uses the same game rules and scoring engine, no arbitrary score inflation. A bot's virtual award can be recorded in the company's virtual ledger, disclosed before joining.
- AI plays at most 8 hours per day and 24 hours per event, enforced by actual validated server gameplay sessions. Owner AI tab lists active status, game, latest activity, score, duration, and virtual awards; no ability to secretly alter the leaderboard.
- Preserve historical entries, wallet balances, past winner lists, signing identity and existing migrations.
- All paid event games require authentication, eligibility, move validation, atomic fee ledger, replay protection, cutoff, and tests covering invalid moves, retries and crash recovery.

## Implementation status
Block local engine supports colored shapes, including single, line, L, T, rectangle and six-cell pieces; three available pieces; touch drag with preview; tap alternative; row/column clears and simultaneous line intersection; cumulative local scoring and no-move detection. This is still practice, not a server-verified tournament. AI menu now has a concise AI label. Current Memory server supports live rankings, legitimate bot moves, daily/event caps and company virtual award ledger. Existing one-time entry rules remain active. Multi-event scheduling, per-round charging, all-game server validation and historical winners UI are not yet implemented.

The future Memory event policy now has a tested migration and dynamic client terms. Historical winner listing and current AI game activity are implemented. The test uses isolated fixtures; the new migration must be deployed only after client compatibility is confirmed. Existing event terms are preserved. Block, Bubble, and 2048 still require authoritative tournament engines.
