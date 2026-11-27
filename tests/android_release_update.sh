#!/usr/bin/env bash
set -euo pipefail
package=com.play80.arcade.master.tournamentv41qa
candidate=dist/PLAY80.apk
launch() {
  adb shell am start -W -n "$package/.MainActivity" | tee "$RUNNER_TEMP/launch.txt"
  grep -q 'Status: ok' "$RUNNER_TEMP/launch.txt"
  sleep 3
  adb shell pidof "$package" >/dev/null
}
adb install "$candidate"
launch
adb uninstall "$package"
adb install "$RUNNER_TEMP/update-base.apk"
adb install -r "$candidate"
launch
