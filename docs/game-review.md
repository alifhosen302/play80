# PLAY80 game review — free, nonredeemable demo
## Sources reviewed
- User-provided 73-second Avatar Dice recording and three screenshots: fictional dealer layout, two dice, range choices 2–6 / 7 / 8–12, recent result row. The original provider's real-money amounts, promotions, player claims and assets are not copied.
- Two-dice probability: https://courses.washington.edu/psy524a/_book/probability.html
- FIDE laws: https://handbook.fide.com/chapter/e012023
- 2048 original: https://gabrielecirulli.github.io/2048/
## Scope of this commit
- Avatar Dice: premium original studio, three sum classes, history, cancellation, free practice isolated from wallet. Manual roll.
- Crazy Wheel Show: dedicated original SVG icon, distinct from Carnival Wheel.
- Shared premium interior styling: Spin Time, Sky Flight, Arcade.
## Existing implementation audit / remaining checks
| Game | Existing implementation | Needed before final release |
|---|---|---|
| Spin Time | Server RPC | Wallet idempotency and account-switch device tests |
| Carnival Wheel | Server arcade RPC | Animation-to-result parity |
| Crazy Wheel Show | Offline fictional show | Keep practice isolated; pause lifecycle device test |
| Avatar Dice | Free sum practice | Android animation and orientation test |
| Sky Flight | Local practice | No cash-out integration; timer and background audit |
| Cup Shuffle | Local practice | Shuffle visual/result parity |
| Apple Tree | Local practice | Row validation |
| Fruit Slots | Server arcade RPC | Result animation and replay tests |
| Roulette | Server arcade RPC | Selection and result display |
| Plinko | Server arcade RPC | Path and bin consistency |
| Keno | Server arcade RPC | Unique selections and replay |
| Blackjack | Local practice | Ace scoring, dealer draws, terminal states |
| Mines | Local practice | Duplicate tile and cancellation tests |
| Scratch Cards | Local practice | Duplicate reveal and terminal states |
| Ludo | Local practice / server bot arena | Legal moves and reconnection |
| Chess | Local practice / server bot arena | FIDE legal move and end-state checks |
| 2048 | Practice / tournament | Merge once per move, restore and terminal state |
| Memory, Bubble, Block | Practice / tournament catalog | Rule and input tests |
## Boundary
No real-money payment or cash redemption implementation. Existing account wallet and turnover were not changed in this commit. No claims of full game QA or release readiness.
