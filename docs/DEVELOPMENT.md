# PLAY80 — development and release guide

PLAY80 is one Android application using non-redeemable demo coins. There is no real-money payment, withdrawal or cash conversion. Supabase project: `suhpmjqrcqkzaslptpca`. Hossain Group is unrelated.

## One source of truth

`alifhosen302/play80`, branch `main`, contains the integrated source. Temporary branches and historical pull requests are review history, not alternate apps. Make further changes against main, retain migration and commit history, and never build a separate product from a copy of the repository.

| Area | Source |
| --- | --- |
| Screen structure and styles | assets/index.html |
| Accounts, menus, wallet, reward and turnover UI | assets/play80_online.js |
| Games | assets/play80_*.js (individual modules) |
| Android and packaging | android/MainActivity.java, build_qa.py |
| Server | supabase/migrations/, supabase/functions/ |
| Shared verification | scripts/verify.sh |
| Regression cases | tests/ |
| Deployment history | docs/PLAY80_RELEASE_STATUS.md |

## Demo wallet rules

- Each approved normal deposit or completed owner send creates an independent 1x turnover source.
- A first 1,000-coin deposit with its linked 5,000-coin bonus is one 6,000-coin source requiring 18,000 turnover.
- Daily awards accumulate every 24 hours and each 50-coin period can be claimed once. The countdown does not depend on claims.
- Verified server wins are allocated newest source first. A completed source disappears from the active list and releases its original demo coin amount.
- While an incomplete source remains, available simulated withdrawal is capped by unused completed-source principal and unheld wallet balance. If no source remains, the whole unheld balance is available. Existing 200-coin minimum withdrawal is unchanged.
- A pending withdrawal reserves its amount; approval consumes released allowances once. Zero settled wallet balance (and no held coins) closes all existing sources without deleting history or changing recorded progress. New deposits start new sources.
- Source-specific withdrawal limits are implemented but the guard remains staged until all games that affect the server wallet have authoritative settlement. Local practice games and room matching do not pretend to be server-verified wins.
- Historical reconstruction is restricted to the previously verified exact 6,500-coin account with zero progress; the original legacy record remains closed for audit. If preconditions do not match, no automatic reconstruction is made.

## Release

Run `bash scripts/verify.sh source`, `bash scripts/verify.sh database`, and `bash scripts/verify.sh browser` (Node 22, Python, Docker, Playwright/Chromium required). CI and the release workflow use the same script.

The existing signed APK remains the distribution baseline until the new migration, Android install and in-place upgrade checks all pass. Publish only from main with the existing application ID and signing certificate, increment internal versionCode, and replace the same protected GitHub release with one file named `PLAY80.apk`. No APK for every source commit. Never change signing keys to bypass failed checks.

## Integration and verification

The menu-only logout, individual daily claims, newest-first turnover, owner-send credit, grouped first bonus, partial simulated withdrawal, zero balance closure, and royal cup table are now consolidated in main. The older wallet-navigation and initial turnover PRs contain historical implementation versions; do not merge them blindly.

The integrated candidate passed JavaScript syntax checks (9 files), five existing JavaScript test scripts in an isolated evaluator, and the full PostgreSQL fixture with synthetic schemas inside a rolled-back transaction (including historical reconciliation). GitHub Actions jobs failed before runner assignment and returned no step logs; browser/device installation and signed release checks are not yet verified. No live user wallet has been changed and the new migration has not been deployed. Do not distribute the updated APK until backend/client compatibility and the full release gate are verified.
