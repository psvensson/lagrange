#!/usr/bin/env bash
set -u
S=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-1c
run() { "$S/run1-r3.sh" "$1" "$2"; echo "$1 rc=$? $(tail -1 $S/r3/runs/$1.log)" >> "$S/r3/runs/CHAIN.txt"; }
run r3-01-U test/node/runtime-service-bound-route.test.js
run r3-02-N test/wasm-service/bound-creation-handler-embedding.integration.test.js
run r3-03-lifecycle test/wasm-service/wasm-service-lifecycle.test.js
run r3-04-handler test/node/runtime-service-handler.test.js
run r3-05-P test/runtime/service-runtime-consensus-publication.test.js
run r3-06-publication-int test/wasm-service/wasm-creation-publication.integration.test.js
echo CHAIN_DONE >> "$S/r3/runs/CHAIN.txt"
