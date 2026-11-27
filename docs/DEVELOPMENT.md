# PLAY80 — development and release guide

PLAY80 is one Android application for non-redeemable demo coins. There are no real-money deposits, withdrawals or cash conversion. Supabase project: `suhpmjqrcqkzaslptpca`. Hossain Group is a separate project and must not be changed.

## Source of truth

`alifhosen302/play80`, branch `main`, is the authoritative integrated source. A temporary branch is a review/test candidate, not a second app. Merge verified changes into main; never build a separate product from a copy of this repository. Keep historical migrations and Git history intact.

| Area | Authoritative source |
| --- | --- |
| Screen structure and styles | assets/index.html |
| Account, auth, menu, demo wallet, daily rewards and turnover UI | assets/play80_online.js |
| Tournament and individual games | assets/play80_tournament.js and each assets/play80_*.js game module |
| Android shell and packaging | android/MainActivity.java, build_qa.py |
| Server rules | supabase/migrations/ (ordered, immutable once applied), supabase/functions/ |
| Regression tests | tests/ |
| Release history and deployment evidence | docs/PLAY80_RELEASE_STATUS.md |

Keep game rules separated by module rather than joining everything into an unreadable file. UI must call server-authoritative RPCs; do not calculate authoritative balances or wins in the client. Use consistent source naming, narrow functions, meaningful comments, and tests for each business rule. Do not duplicate wallet or auth logic across game modules.

## Intended release workflow

1. Review changes against main and keep only one integrated candidate.
2. Verify JavaScript/Python, database fixtures, and mobile browser UI. All checks must pass. No real-user data in test fixtures.
3. Reconcile existing demo-wallet history without deleting records, resetting balances or counting the same credit twice. Record migration status. Do not apply unverified SQL.
4. Build only an approved main revision with the existing application ID and owner signing identity. Increment internal versionCode.
5. Test fresh installation and in-place update. Publish only one distributable APK, named `PLAY80.apk`, in the existing protected release. Do not publish another APK for each source commit. Never change package identity or signing key as a shortcut.
6. Verify the uploaded digest and record the commit, version, server migration, and test results. Keep the last known working release until the replacement passes.

## Current integration status

The main branch is the last verified baseline; the new daily claim/turnover/filename changes are in `daily-bonus-claim-queue`. The royal cup table is separately staged in PR #18; check its tests before integrating. PRs #12 and #14 are historical/differing candidates and must be compared with main, not blindly merged. The latest candidate CI failed before producing usable step logs; APK and database deployment are not verified. The per-source simulated withdrawal allowance and zero-balance reset rules still need an explicit, tested server settlement model. Do not enable the turnover withdrawal guard prematurely.

No additional APK is published by this document.
