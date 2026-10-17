#!/usr/bin/env bash
set -u
S=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-1c/r3/statics
WT=/mnt/data/peter/projects/.worktrees/verify-1c
cd "$WT" || exit 97
for i in $(seq 1 240); do if pgrep -af "node --test|test:file|run-test-files|run-classified-test-files|npx tap" | grep -v pgrep >/dev/null; then sleep 15; else break; fi; done
node scripts/checks/wait-for-thermal-headroom.js > $S/thermal.log 2>&1
git diff --name-only 04f1a9112 9f83c7be3 -- src | grep '\.js$' > $S/touched-src.txt
git diff --name-only 04f1a9112 9f83c7be3 -- src test | grep '\.js$' > $S/touched-js.txt
{ echo "== decision boundaries =="; node scripts/check-guideline-decision-boundaries.js --json $(cat $S/touched-src.txt) > $S/db.json 2>$S/db.err; echo "rc=$?"; node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(JSON.stringify({total:j.totalViolationCount,raw:j.rawViolationCount,inherited:j.inheritedViolationCount,baseline:j.baselineViolationCount,files:j.filesWithViolations}))' $S/db.json
  echo "== eslint =="; npx eslint $(cat $S/touched-js.txt) > $S/eslint.log 2>&1; echo "rc=$? lines=$(wc -l < $S/eslint.log)"
  echo "== complexity scoped =="; node scripts/check-complexity.js --scoped $(cat $S/touched-js.txt) > $S/complexity.log 2>&1; echo "rc=$?"; grep -E "ratchet|complexity of" $S/complexity.log
  echo "== cognitive scoped =="; node scripts/check-cognitive-complexity.js --scoped $(cat $S/touched-js.txt) > $S/cognitive.log 2>&1; echo "rc=$?"; grep -E "ratchet" $S/cognitive.log
  echo "== literals scoped =="; node scripts/check-guideline-literals.js $(cat $S/touched-src.txt) > $S/literals.log 2>&1; echo "rc=$?"; head -3 $S/literals.log
  echo "== silent-catch scoped =="; node scripts/check-guideline-silent-catch.js $(cat $S/touched-src.txt) > $S/silent.log 2>&1; echo "rc=$?"; head -5 $S/silent.log
  echo "== runtime grammar =="; npm run -s audit:runtime-grammar > $S/grammar.log 2>&1; echo "rc=$?"; tail -3 $S/grammar.log
  echo "== shards =="; npm run -s audit:shards > $S/shards.log 2>&1; echo "rc=$?"; tail -3 $S/shards.log
  echo "== impact-contracts =="; npm run -s audit:impact-contracts > $S/impact.log 2>&1; echo "rc=$?"; tail -3 $S/impact.log
  echo "== file-size =="; npm run -s audit:file-size > $S/filesize.log 2>&1; echo "rc=$?"; head -3 $S/filesize.log
  echo "== unused =="; npm run -s test:unused:ratchet > $S/unused.log 2>&1; echo "rc=$?"; head -1 $S/unused.log
  echo "== duplication =="; npm run -s test:duplication > $S/dup.log 2>&1; echo "rc=$?"; grep -n "ratchet" $S/dup.log
  echo "== fast-static --base b3793c7e5 =="; node scripts/check-fast-static.js --base b3793c7e5 > $S/fast-static.log 2>&1; echo "rc=$?"; tail -4 $S/fast-static.log
} > $S/SUMMARY.txt 2>&1
echo STATICS_DONE >> $S/SUMMARY.txt
