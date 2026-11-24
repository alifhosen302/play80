# PLAY80

Private Android demo-gaming project. The single source of truth for application development is this GitHub repository.

## Current baseline

- Target source: **PLAY80 V4.1 QA** (existing verified archive `PLAY80_V4_1_QA_Source.zip`).
- Supabase project: `suhpmjqrcqkzaslptpca` (Play80 only).
- Existing Hossain Group project is unrelated and must remain untouched.
- All virtual coins are **non-redeemable demo currency**. No real-money payment, withdrawal, or cash conversion.
- The editable V4.1 QA source is now committed in this repository. GitHub Actions import-and-build run #45450637564 passed source-integrity verification, 2048 unit tests, JavaScript/Python syntax checks, and the signed QA APK artifact upload. This is not a full production security audit or Android device validation.

## Single-app release policy

1. Make changes on branches of this repository; review tests before merging.
2. Keep a stable Android `applicationId` and a stable owner-controlled signing key for in-place updates. The historical V4.1 package `com.play80.arcade.master.tournamentv41qa` is **QA-only**; do not silently treat this as the production ID.
3. Never commit keystores, passwords, service-role keys, private JWTs, SMTP credentials or other secrets.
4. Do not publish an APK unless the complete source has been committed and automated checks pass.
5. Use GitHub Actions artifacts for testing and GitHub Releases for approved distribution. Avoid creating multiple independent apps.

## Expected V4.1 source layout

```text
assets/
  index.html
  play80_online.js
  play80_tournament.js
  play80_practice_2048.js
  (images, webp, audio and logos)
reference_assets/ludo_v3_8/
tests/test_2048.js
tests/test_browser.py
build_qa.py
release_check.py
README_V4_1.md
QA_REPORT_V4_1.md
```

## Tests after import

```bash
node --check assets/play80_practice_2048.js
node --check assets/play80_online.js
node --check assets/play80_tournament.js
node tests/test_2048.js
python -m compileall -q build_qa.py
```

The current Python APK builder needs Java `keytool` and `jarsigner` and a secure signing key. WebView security, HTTPS origin, device tests, server-authenticated gameplay and full 72-hour tournament testing remain release blockers.
