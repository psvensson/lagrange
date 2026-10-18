#!/usr/bin/env bash
set -u
WT=/mnt/data/peter/projects/.worktrees/verify-1c; B=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-1c; S=$B/r6; F=src/service/service-consensus-creation-intent.js
cd $WT || exit 97
# (2) base comparison of the decision-boundary hit: round-5 bytes swapped in, checker run, restored by sha
before=$(sha256sum $F | cut -d' ' -f1)
git show 4bcf5f86d:$F > $F
node scripts/check-guideline-decision-boundaries.js --json $F > $S/statics/db-round5-bytes.json 2>/dev/null
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log("round-5 bytes:",JSON.stringify({total:j.totalViolationCount,raw:j.rawViolationCount,inherited:j.inheritedViolationCount}))' $S/statics/db-round5-bytes.json > $S/statics/db-compare.txt
git checkout -- $F
after=$(sha256sum $F | cut -d' ' -f1); [ "$before" = "$after" ] && echo "RESTORED_BYTE_IDENTICAL $F" >> $S/statics/db-compare.txt || echo "RESTORE_MISMATCH" >> $S/statics/db-compare.txt
# (3) mutations
$B/mutate-r6.sh MA $F test/service/service-consensus-creation-intent.test.js
$B/mutate-r6.sh MB $F test/service/service-consensus-creation-intent.test.js test/wasm-service/wasm-creation-publication.integration.test.js
# (4) fast-static on the clean tree
for i in $(seq 1 120); do if pgrep -af "node --test|test:file|run-test-files|run-classified-test-files|npx tap" | grep -v pgrep >/dev/null; then sleep 15; else break; fi; done
node scripts/checks/wait-for-thermal-headroom.js > $S/statics/thermal.log 2>&1
node scripts/check-fast-static.js --base b3793c7e5 > $S/statics/fast-static.log 2>&1; echo "fast-static rc=$?" >> $S/statics/db-compare.txt; tail -2 $S/statics/fast-static.log >> $S/statics/db-compare.txt
git status --short > $S/git-status-after.txt
echo CHAIN2_DONE >> $S/statics/db-compare.txt
