#!/usr/bin/env bash
set -u
B=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-1c
WT=/mnt/data/peter/projects/.worktrees/verify-1c
run() { "$B/run1-r5.sh" "$1" "$2"; echo "$1 rc=$? $(tail -1 $B/r5/runs/$1.log)" >> "$B/r5/runs/CHAIN.txt"; }
run r5-01-U test/node/runtime-service-bound-route.test.js
run r5-02-N test/wasm-service/bound-creation-handler-embedding.integration.test.js
run r5-03-H test/node/runtime-service-handler.test.js
run r5-04-publication-int test/wasm-service/wasm-creation-publication.integration.test.js
run r5-05-lifecycle test/wasm-service/wasm-service-lifecycle.test.js
rm -f $B/r5/probes/facts.ndjson
run r5-06-probe test/node/verify-1c-r5-probe.test.js
rm -f $WT/test/node/verify-1c-r5-probe.test.js
M="$B/mutate-r5.sh"; R=src/node/runtime-service-bound-creation-route.js; U=test/node/runtime-service-bound-route.test.js
$M R5B $R $U; $M R5A $R $U; $M R5C $R $U; $M R5D $R $U; $M M4B $R $U; $M RA $R $U; $M RB $R $U
echo MUTATIONS_DONE >> "$B/r5/mutations/CHAIN.txt"
cd $WT && git status --short > $B/r5/git-status-before-statics.txt
$B/r5/chain-statics.sh
cd $WT && git status --short > $B/r5/git-status-after.txt
echo ALL_DONE >> "$B/r5/runs/CHAIN.txt"
