#!/usr/bin/env bash
set -u
B=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-1c
run() { "$B/run1-r6.sh" "$1" "$2"; echo "$1 rc=$? $(tail -1 $B/r6/runs/$1.log)" >> "$B/r6/runs/CHAIN.txt"; }
run r6-01-local-record test/wasm-service/wasm-creation-local-record.test.js
run r6-02-publication-int test/wasm-service/wasm-creation-publication.integration.test.js
run r6-03-genesis test/wasm-service/wasm-creation-genesis.integration.test.js
run r6-04-reconciliation test/wasm-service/wasm-creation-reconciliation.integration.test.js
run r6-05-retained test/wasm-service/wasm-retained-bootstrap.integration.test.js
run r6-06-bound-native test/wasm-service/wasm-creation-bound-native.test.js
run r6-07-creation-intent test/service/service-consensus-creation-intent.test.js
run r6-08-creation-recovery test/service/service-consensus-creation-recovery.integration.test.js
echo RUNS_DONE >> "$B/r6/runs/CHAIN.txt"
