# PLAY80 V4.1 — QA Source & Patch

**অবস্থা: QA-only, production release নয়।**

## কী বাস্তবায়িত হয়েছে
- 24 Nov 2026 PLAY80 QA v4.0 APK থেকে `assets/` পুনরুদ্ধার করে তার ওপর non-destructive patch করা হয়েছে।
- Tournament বিভাগে **2048 Practice**: চারদিকে চাল, সঠিক merge, score, best score, swipe/keyboard/buttons, restart, locally saved game state, game-over display ও premium purple UI।
- **Memory Puzzle round reconnect**: `RECONNECT ROUND` button; server-verified state re-sync; transient flip response failure-এ state পুনরায় পড়ার চেষ্টা।
- 2048 চলাকালে mobile footer লুকিয়ে board overlap কমানো; app-logo image containment।
- বিদ্যমান v4.0 APK-এর ১৫টি asset ফাইল সংরক্ষণ; ১টি নতুন JS file যোগ। `play80_online.js` ও অন্য সমস্ত মূল media byte-for-byte অপরিবর্তিত।
- v3.8-এর চারটি pawn image সংরক্ষিত আছে `reference_assets/ludo_v3_8/`-এ। এগুলো **runtime-এ এখনো ব্যবহার করা হয়নি**; v4.0-এর CSS token UI বজায় আছে।

## যা এই QA build-এ নেই
- 2048-এর tournament point submission; এখনও শুধু Memory Puzzle-এ server-verified tournament score।
- Online Ludo/Chess settlement, matching, invites বা live reconnection।
- Bubble Shooter, Match-3, Sudoku, Block Puzzle-এর functional modules।
- New Crazy Time 3D engine, full Android/end-to-end/72-hour verification।
- Production signing key, HTTPS WebView origin, complete security hardening ও public deployment।

কয়েন কেবল non-redeemable demonstration currency; অ্যাপে কোনো real-money payment/payout API নেই।

## ফাইল ও বিল্ড
- `assets/index.html`: আগের UI + নতুন practice screen ও Memory reconnect button।
- `assets/play80_tournament.js`: tab navigation + server state recovery।
- `assets/play80_practice_2048.js`: নতুন gameplay engine ও UI।
- `assets/play80_online.js`: আগের connected Play80 Supabase client, অপরিবর্তিত।
- `reference_assets/ludo_v3_8/*.png`: পুরোনো Ludo pawn art, future implementation reference হিসেবে সংরক্ষিত।
- `build_qa.py`: Android minimal WebView QA builder; JDK/Java `keytool` ও `jarsigner` আবশ্যক।
- `tests/test_2048.js`: Node.js move-merge test।
- `tests/test_browser.py`: Chromium+Playwright UI smoke test।
- `release_check.py`: পুরোনো ১০টি arcade game smoke test।
- `QA_REPORT_V4_1.md`: পরীক্ষার ও অ্যাক্সেসের রিপোর্ট।

বিল্ড করতে (নিজস্ব **QA-only** keystore দিয়ে):

```bash
export PLAY80_SIGNING_KEYSTORE=/secure/path/play80_qa.keystore
export PLAY80_SIGNING_PASSWORD='use-your-own-private-password'
python build_qa.py
```

QA APK package: `com.play80.arcade.master.tournamentv41qa`। এটি আগের Play80 অ্যাপকে replace করে না, আলাদা QA app হিসেবে ইনস্টল হবে। মূল signing key ও HTTPS origin ছাড়া production APK প্রকাশ করবেন না।

## টেস্ট

```bash
node tests/test_2048.js
python tests/test_browser.py
python release_check.py
node --check assets/play80_practice_2048.js
node --check assets/play80_online.js
node --check assets/play80_tournament.js
```

Playwright browser test HTML inline এবং external JS injected source হিসেবে চলে; environment-এর `file://` ও loopback URL browsing restriction এড়াতে এ ব্যবস্থা। এটি physical Android বা actual Supabase request end-to-end verification নয়।

**Supabase project** `suhpmjqrcqkzaslptpca`। এই patch-এ কোনো production SQL migration বা ডেটা পরিবর্তন করা হয়নি।
