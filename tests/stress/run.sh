#!/usr/bin/env bash
# One-command screenshot stress test for any page.
#   tests/stress/run.sh <url> [--quick]
# Builds a dev-API widget, runs the DPR x local-settings x renderMode matrix and
# the scenario set against <url> with every write stubbed, then writes a
# truth-vs-capture sheet per run. Output: tests/stress/runs/<host>-<timestamp>/
# Needs: system Google Chrome, python3 + Pillow + numpy (`pip install pillow numpy`), `npm install` done.
set -uo pipefail
URL="${1:?usage: run.sh <url> [--quick]}"
QUICK="${2:-}"
cd "$(dirname "$0")/../.."
DEV_API="https://5mjiz034ia.execute-api.ap-south-1.amazonaws.com/dev/api"
HOST=$(node -p "new URL('$URL').hostname")
OUT="tests/stress/runs/$HOST-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

# Explicit env beats .env (which points at localhost).
API_URL="$DEV_API" RENDERER_URL="$DEV_API" node build.js >/dev/null || exit 1
cp dist/tapko-widget.js "$OUT/widget.js"

H=tests/stress/harness.js
PAR=${PAR:-3}   # parallel Chromes; >3 starves WebGL pages and skews timings
run() { # name, extra args...
  local name=$1; shift
  node "$H" --widget "$OUT/widget.js" --url "$URL" --out "$OUT/$name" --profile "$OUT/.profiles/$name" "$@" \
    >"$OUT/$name.stdout" 2>&1 && echo "ok   $name" || echo "FAIL $name (see $OUT/$name.stdout)"
}

jobs_=(
  "M1 --dpr 1 --mode auto  --render url"
  "M2 --dpr 2 --mode auto  --render url"
  "M3 --dpr 1 --mode local --render url"
  "M4 --dpr 2 --mode local --render url"
  "M5 --dpr 1 --mode auto  --render html"
  "M6 --dpr 2 --mode auto  --render html"
  "M7 --dpr 3 --mode auto  --render url --width 390 --height 844"
)
[ "$QUICK" = "--quick" ] && jobs_=("${jobs_[1]}" "${jobs_[4]}")
[ "$QUICK" != "--quick" ] && jobs_+=(
  "S-rapid        --dpr 2 --scenario rapid"
  "S-midscroll    --dpr 2 --scenario midscroll"
  "S-rendererdown --dpr 2 --scenario rendererdown"
  "S-reload       --dpr 2 --scenario reload"
  "S-annotate     --dpr 2 --scenario annotate"
  "S-2560         --dpr 1 --width 2560 --height 1440"
)

for j in "${jobs_[@]}"; do
  while [ "$(jobs -rp | wc -l)" -ge "$PAR" ]; do sleep 2; done
  # shellcheck disable=SC2086
  run $j &
done
wait

for d in "$OUT"/*/; do
  [ "$(basename "$d")" = ".profiles" ] && continue
  ls "$d"/upload-* >/dev/null 2>&1 && python3 tests/stress/sheet.py "${d%/}" >/dev/null
  ls "$d"/results.json >/dev/null 2>&1 && echo "score $(basename "$d"): $(python3 tests/stress/score.py "${d%/}" | tail -1)"
done
rm -rf "$OUT/.profiles"
node tests/stress/summary.js "$OUT"
