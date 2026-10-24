#!/usr/bin/env bash
# Download the RuneScape Wiki Treasure Trails guide pages used by build_data.py.
# Usage: tools/fetch_wiki.sh <out-dir>   then   python3 tools/build_data.py <out-dir> app/src/main/assets/data.js
set -euo pipefail
OUT=${1:?out dir}
UA="RS3ClueSolverBuilder/1.0 (personal app)"
API="https://runescape.wiki/api.php"
mkdir -p "$OUT/scans"

parse() { # page title -> html file
  curl -sS -m 90 -G -A "$UA" "$API" --data-urlencode action=parse --data-urlencode "page=$1" \
    --data-urlencode prop=text --data-urlencode format=json --data-urlencode formatversion=2 \
    --data-urlencode redirects=1 | python3 -c "import json,sys;print(json.load(sys.stdin)['parse']['text'])" > "$2"
}

for p in Anagrams Cryptics Emotes Coordinates Simple_clues Challenge_scrolls Skill_riddle_challenges Scans Maps; do
  parse "Treasure_Trails/Guide/$p" "$OUT/$p.html"
done

python3 - "$OUT" <<'PY'
import json, sys
from bs4 import BeautifulSoup
out = sys.argv[1]
s = BeautifulSoup(open(f"{out}/Scans.html").read(), "lxml")
rows = []
for tb in s.find_all("table"):
    trs = tb.find_all("tr")
    if not trs or trs[0].get_text(" ", strip=True) != "Guide Wording on clue scroll Difficulty":
        continue
    for r in trs[1:]:
        c = r.find_all("td")
        rows.append((c[0].find("a")["title"], c[1].get_text(" ", strip=True).strip('"'), c[2].get_text(strip=True)))
json.dump(rows, open(f"{out}/scans/index.json", "w"), indent=1)
PY

python3 -c "import json;[print(t) for t,_,_ in json.load(open('$OUT/scans/index.json'))]" | while read -r t; do
  parse "$t" "$OUT/scans/$(echo "$t" | tr ' /' '__').html"
  sleep 0.3
done
