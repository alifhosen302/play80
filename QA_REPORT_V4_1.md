# PLAY80 V4.1 — QA Verification

Date: 24 Nov 2026

## Implemented
1. Added the 2048 free-practice game to Tournament tab, with full move/merge rules, responsive grid, swipe/keyboard/buttons and local score persistence.
2. Added Memory Puzzle `RECONNECT ROUND` action and server-state re-sync after ambiguous network failure.
3. Removed obstructing bottom navigation from active 2048 screen.
4. Retained all 15 original APK assets. Four unused pawn PNGs from v3.8 are archived as references, not silently integrated into existing Ludo gameplay.
5. Built independently signed Android QA package `com.play80.arcade.master.tournamentv41qa`; no old apps overwritten.

## Modified source
`assets/index.html` and `assets/play80_tournament.js`

## New code
`assets/play80_practice_2048.js`, `build_qa.py`, QA scripts & references

## Testing (this turn)
| Test | Result | Scope |
|---|---|---|
| 12 Node.js assertions for 2048 engine | PASS | Correct merge behavior, all four directions, blocked moves, game over, invalid input |
| Chromium Playwright UI | PASS | Three tabs, 2048 new game/controls/navigation, Ludo launch, zero JS runtime errors |
| Ten legacy arcade games | PASS | Carnival, Cups, Apples, Slots, Roulette, Blackjack, Plinko, Mines, Keno, Scratch basic actions |
| JS syntax | PASS | All 3 client JS files |
| APK integrity | PASS | ZIP CRC, original asset retention, INTERNET permission, distinct QA application ID |
| APK cryptographic signing | PASS (QA only) | Self-signed temporary QA key; NOT an in-place update nor production certificate |
| Physical Android device | NOT TESTED | Device installation, real audio/touch/login not available |
| Live login + deposit/bonus/wallet | NOT END-TO-END TESTED | Server connection exists; no verified test-user workflow executed |
| 72h tournament full cycle | NOT TESTED | Timed multi-day run and payouts not proven |
| Multiplayer Ludo/Chess | NOT IMPLEMENTED | Requires authoritative server game protocols and real two-device testing |
| 2048 tournament scoreboard | NOT IMPLEMENTED | Requires server move validation; deliberately not advertised as competitive |

## Read-only Supabase verification
- PLAY80 project `suhpmjqrcqkzaslptpca` active/healthy.
- A cron job named `play80_tournament_heartbeat_v4` scheduled every minute and active.
- Latest 5 cron runs inspected all succeeded.
- 30 bot profiles, 30 enabled; one tournament in registration_open when checked.
- User and wallet RLS policies inspected; security advisory still needs a production review of SECURITY DEFINER RPCs / staff privacy.
- No existing database row, schema or function changed during V4.1 work.
- The connected GitHub account did not expose a dedicated PLAY80 repository; no modifications to Hossain Group GitHub/Supabase were made.

## Risks and missing pieces
- Play80 v4.0 shipped no `ludo_pawn_{color}.png` assets, unlike v3.8. Actual v4.0 used CSS tokens; this patch preserves that path instead of silently changing game art. Why prior images were not implemented is not confirmed.
- WebView still starts from `file:///android_asset/index.html`; HTTPS-origin asset loading is required for a release-grade auth stack.
- Supabase publishable key is intended to be public. Never add a service-role secret key to the Android bundle.
- Existing user session persistence uses localStorage and requires a hardened storage design before production.
- Signed temporary QA package cannot update a previous PLAY80 install signed by another key.

## Access checklist for production completion
1. Dedicated PLAY80 GitHub repository with push access (or permission and tool to create it).
2. Hosting deployment with HTTPS origin and working redirect URLs; owned domain optional if provider subdomain is acceptable.
3. Auth redirect configuration and verified SMTP provider credentials stored only in hosting/Supabase secret settings; no passwords in chat.
4. Owner-controlled original production APK signing key or secure key migration/build pipeline.
5. Verified QA accounts and Android devices (2+ devices for multiplayer) to test remote auth, reconnect, wallet settlement, audio and timed lifecycle.

Production deployment: NONE. Current deliverable: Android QA APK + reconstructable source ZIP.
