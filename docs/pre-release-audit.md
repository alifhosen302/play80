# PLAY80 pre-release review — nonredeemable demo only
Review baseline: 7a8dd85de0f83ce211ec63eb808469fefbf20a4d.
Scope: inspected repository inventory, targeted game engines and lifecycle, account/turnover client, selected SQL migrations and bot Edge Function, source and mobile test history. Not a complete line-by-line security audit; no live database changes or provider transactions.
## Confirmed issues corrected in source
- 2048: invalid/non-power-of-two values accepted by move; maximum tile could become non-restorable; stale touch after multitouch/cancel/navigation; best score restore inconsistency. Validated board, capped safe tile merges, clear gesture state, normalize restored best.
- Chess: multi-character promotion accepted by substring match; common dead positions and automatic 75-move draw missing. Corrected both rule copies and UI labels. Repetition claims and all possible dead positions are not fully implemented. Server function deployment not performed.
- Account progress: incomplete response could substitute a cached account balance; overlapping refreshes could show older result. Strict server snapshot validation and read-version guard added.
## Game-by-game review and test priorities
| Game | Rule / verification basis | Priority tests |
|---|---|---|
| Avatar Dice | Two independent six-sided dice; three sum ranges | All 36 combinations, red-pip accuracy, leaving screen |
| Spin Time | Existing PLAY80 wheel design | Display matches server sector, retries and cancellation |
| Crazy Wheel Show | User video / original fictional offline show | Timer pause/resume, stale bonus callback, spectator isolation |
| Carnival Wheel | Existing PLAY80 arcade | Display/round replay consistency |
| Sky Flight | Existing PLAY80 practice simulation | Clock drift, app backgrounding; no cash integration |
| Cup Shuffle | Existing perspective table | Cup identity and rendered position through swaps |
| Apple Tree | Existing practice design | Row progression, invalid repeat action |
| Fruit Slots | Existing three-reel game | Visual result consistency, retry |
| Roulette | Existing wheel simulation | Selected colour and rendered result consistency |
| Blackjack | Bicycle Cards published basic card rules | Ace scoring, deck validity, dealer terminal state; current simplified practice not full standard |
| Plinko | Galton board probability demonstration | Ball path and displayed bin agreement |
| Mines | Existing tile puzzle | Duplicate tile action, bounds, terminal state |
| Keno | Existing number-draw practice | Unique choices, unique drawn numbers, replay |
| Scratch Cards | Existing reveal practice | Reveal once, deterministic final display |
| Ludo | Existing approved reference layout | Legal token moves, turn transitions, reconnect |
| Chess | FIDE laws | Checkmate, stalemate, promotion, dead position, repetition/draw claims |
| 2048 | Original creator's free game | Merge once per move, gesture, saved board, terminal state |
| Bubble/Block/Memory | Existing practice and tournament rules | Score, input validation, app lifecycle, clear distinction between practice and verified competition |
## External rule references
- FIDE: https://handbook.fide.com/chapter/e012023
- Bicycle Cards: https://bicyclecards.com/how-to-play/blackjack/
- Original 2048: https://classic.play2048.co/
- Two-sided dice mathematics (six-sided dice): https://mathworld.wolfram.com/Dice.html
- Galton Board educational reference: https://galtonboard.com/Content/PDF/Galton-Board-Middle-School-Curriculum-and-Worksheet.pdf
## Release gates
Source and database fixture tests + mobile browser tests + Android signed APK install + actual account/device restore smoke test. Existing passing tests do not establish full game correctness.
Separate practice points from account totals. Keep actual money, cash withdrawal, real-payment references and conversion of virtual points out of demo. Do not use real-money operator payout schedules as a demo implementation template. Prefer free games, clearly disclosed nonredeemable points, no simulated player balance claims or pressure to continue. No payout/turnover formula changes in this audit.

## Follow-up improvements
- Game-only Low/Medium/High visual preference and session-time/break controls. No wallet UI changes.
- Flight countdown uses a monotonic deadline and stops while off-screen or backgrounded; resumes same local practice round.
- Crazy Wheel: visible round counter, bonus countdown, single-action lock prevents timeout and user action from settling the same bonus.
- Arcade: inactive-screen action guard and reset lifecycle. No new payout formula or payment integration.
