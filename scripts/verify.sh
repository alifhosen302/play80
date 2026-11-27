#!/usr/bin/env bash
# Shared regression checks. CI and the release pipeline use exactly these commands.
set -euo pipefail
cd "$(dirname "$0")/.."
source_checks() {
  local file
  for file in build_qa.py release_check.py assets/index.html assets/play80_online.js assets/play80_tournament.js assets/play80_practice_2048.js; do
    test -s "$file"
  done
  for file in assets/play80_*.js; do node --check "$file"; done
  python -m compileall -q build_qa.py release_check.py
  node --experimental-strip-types tests/test_dsr_creation.mjs
  for file in tests/test_2048.js tests/test_chess.js tests/test_v44_ui.js tests/test_rules_gate.js tests/test_v46_ui.js; do node "$file"; done
  python - <<'PY'
from pathlib import Path
banned = {'.keystore', '.jks', '.p12', '.pfx', '.pem', '.key'}
files = [str(f) for f in Path('.').rglob('*') if f.is_file() and '.git' not in f.parts and f.suffix.lower() in banned]
if files:
    raise SystemExit('Signing or secret files must not be committed: ' + str(files))
PY
}
database_checks() (
  local db="play80-test-$$"
  trap 'docker rm -f "$db" >/dev/null 2>&1 || true' EXIT
  docker run --detach --name "$db" -e POSTGRES_HOST_AUTH_METHOD=trust -v "$PWD:/work:ro" postgres:16
  for attempt in {1..30}; do
    if docker exec "$db" pg_isready -h 127.0.0.1 -U postgres; then break; fi
    sleep 1
  done
  docker cp supabase/migrations/20261126193000_rewards_referrals_owner_support.sql "$db:/tmp/play80-reward-migration.sql"
  docker cp supabase/migrations/20261126222000_stage_coin_turnover.sql "$db:/tmp/play80-turnover.sql"
  docker exec -i "$db" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -f /work/tests/play80_rewards_support.sql
  docker exec "$db" createdb -h 127.0.0.1 -U postgres play80_turnover_test
  docker exec -i "$db" psql -h 127.0.0.1 -U postgres -d play80_turnover_test -v ON_ERROR_STOP=1 -f /work/tests/play80_turnover.sql
  docker exec "$db" createdb -h 127.0.0.1 -U postgres play80_daily_claim_test
  docker exec -i "$db" psql -h 127.0.0.1 -U postgres -d play80_daily_claim_test -v ON_ERROR_STOP=1 -f /work/tests/play80_daily_claim.sql
)
browser_checks() {
  local file
  for file in tests/test_v47_mobile_browser.py tests/test_v50_roles_browser.py tests/test_v51_signup_feedback.py tests/test_account_recovery.py; do python "$file"; done
  if [[ -f tests/test_cup_table.py ]]; then python tests/test_cup_table.py; fi
}
case "${1:-all}" in
  source) source_checks ;;
  database) database_checks ;;
  browser) browser_checks ;;
  all) source_checks; database_checks; browser_checks ;;
  *) echo 'Usage: bash scripts/verify.sh [source|database|browser|all]' >&2; exit 2 ;;
esac
