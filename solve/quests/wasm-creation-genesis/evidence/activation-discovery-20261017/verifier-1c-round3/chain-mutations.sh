#!/usr/bin/env bash
set -u
S=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-1c
M="$S/mutate-r3.sh"; R=src/node/runtime-service-bound-creation-route.js
U=test/node/runtime-service-bound-route.test.js; L=test/wasm-service/wasm-service-lifecycle.test.js; N=test/wasm-service/bound-creation-handler-embedding.integration.test.js
$M VM01 $R $U
$M VM11 $R $U
$M VA7 $R $U
$M VA8 src/wasm-service/wasm-service-serving-state.js $L $N
$M RA $R $U
$M RB $R $U
$M RB2 $R $U
$M RC $R $U
$M RD $R $U
echo MUTATIONS_DONE >> "$S/r3/mutations/CHAIN.txt"
