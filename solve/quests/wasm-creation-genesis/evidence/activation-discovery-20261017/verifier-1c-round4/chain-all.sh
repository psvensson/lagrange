#!/usr/bin/env bash
set -u
B=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-1c
WT=/mnt/data/peter/projects/.worktrees/verify-1c
run() { "$B/run1-r4.sh" "$1" "$2"; echo "$1 rc=$? $(tail -1 $B/r4/runs/$1.log)" >> "$B/r4/runs/CHAIN.txt"; }
run r4-01-U test/node/runtime-service-bound-route.test.js
run r4-02-N test/wasm-service/bound-creation-handler-embedding.integration.test.js
run r4-03-handler test/node/runtime-service-handler.test.js
run r4-04-publication-int test/wasm-service/wasm-creation-publication.integration.test.js
rm -f $B/r4/probes/facts.ndjson
run r4-05-probe test/node/verify-1c-r4-probe.test.js
rm -f $WT/test/node/verify-1c-r4-probe.test.js
M="$B/mutate-r4.sh"; R=src/node/runtime-service-bound-creation-route.js; H=src/node/runtime-service-handler.js; U=test/node/runtime-service-bound-route.test.js
$M M4A $H $U; $M M4B $R $U; $M M4C $R $U; $M M4C2 $R $U; $M M4D $R $U; $M RA $R $U; $M RB $R $U
echo MUTATIONS_DONE >> "$B/r4/mutations/CHAIN.txt"
$B/r4/chain-statics.sh
cd $WT && git status --short > $B/r4/git-status-after.txt
echo ALL_DONE >> "$B/r4/runs/CHAIN.txt"
