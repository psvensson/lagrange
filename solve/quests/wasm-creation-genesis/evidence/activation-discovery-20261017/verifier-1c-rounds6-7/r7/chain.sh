#!/usr/bin/env bash
set -u
WT=/mnt/data/peter/projects/.worktrees/verify-1c; B=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-1c; S=$B/r7; F=src/service/service-consensus-creation-intent.js
run() { "$B/run1-r7.sh" "$1" "$2"; echo "$1 rc=$? $(tail -1 $S/runs/$1.log)" >> "$S/runs/CHAIN.txt"; }
run r7-01-creation-intent test/service/service-consensus-creation-intent.test.js
run r7-02-creation-recovery test/service/service-consensus-creation-recovery.integration.test.js
run r7-03-publication-int test/wasm-service/wasm-creation-publication.integration.test.js
$B/mutate-r7.sh MA $F test/service/service-consensus-creation-intent.test.js
cd $WT || exit 97
for i in $(seq 1 120); do if pgrep -af "node --test|test:file|run-test-files|run-classified-test-files|npx tap" | grep -v pgrep >/dev/null; then sleep 15; else break; fi; done
node scripts/checks/wait-for-thermal-headroom.js > $S/statics/thermal.log 2>&1
node scripts/check-fast-static.js --base b3793c7e5 > $S/statics/fast-static.log 2>&1; echo "fast-static rc=$?" >> $S/runs/CHAIN.txt; tail -2 $S/statics/fast-static.log >> $S/runs/CHAIN.txt
git status --short > $S/git-status-after.txt
echo ALL_DONE >> $S/runs/CHAIN.txt
