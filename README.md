# RS3 Clue Solver (Android)

An offline-first Android app for RuneScape 3 Treasure Trails.

**Clues tab** – type any part of a clue scroll and get the answer. Covers anagrams
(also matches if you type the letters in any order), cryptics & simple clues,
emote clues (with items to equip, hidey-hole and travel), map clues, coordinate
clues, challenge-scroll answers and skill riddles. Filter by clue type and tier.

**Coords tab** – type the degrees/minutes from a coordinate clue; the exact (or
nearest) dig spot appears with directions.

**Scans tab** – every elite/master scan region with its orb range and all
possible dig spots. Tap spots to cross them off as you eliminate them.

**Ask Claude** – every clue, scan area and puzzle has an “Ask Claude” button. It
writes up the clue for you, copies it, and opens the Claude app (your normal
Claude subscription – no API key). If the message box is empty, just paste.

**Puzzles tab**
- *Puzzle box* – pick the picture, tap the pieces to copy your scrambled box,
  then follow the step-by-step moves (the tile to click flashes).
- *Lockbox* – copy the melee/ranged/magic grid; the app shows how many times to
  click each square (exact solver, finds the fewest clicks).
- *Towers* – enter the edge numbers; the app fills in every tower height.
- *Celtic knot & compass* – quick strategy notes.

Pictures (dig-spot photos, map scrolls) load from the RuneScape Wiki when you're
online; all text and solvers work offline.

## Install on your phone

1. Get `app-release.apk` – from the **Actions** tab on GitHub (latest
   “Build APK” run → *Artifacts*) or build it yourself (below).
2. Open it on the phone and allow “Install unknown apps” for your browser/files
   app when prompted.

## Build

Requires JDK 17+ and the Android SDK (platform 35).

```sh
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
node tests/solvers.test.js   # solver tests
```

The APK is signed with the bundled `app/cluesolver.keystore` so every build
(local or CI) can update the installed app in place. It's a convenience key for
a personal sideloaded app – don't reuse it for a Play Store release.

## Refreshing clue data

```sh
tools/fetch_wiki.sh /tmp/wiki
python3 tools/build_data.py /tmp/wiki app/src/main/assets/data.js
```

Clue data and pictures © RuneScape Wiki contributors, CC BY-NC-SA 3.0.
RuneScape is a trademark of Jagex Ltd; this app is not affiliated with Jagex.
