# Recovered original Harnessd failures — 2026-10-19

This report classifies retained original execution, using bounded nonexecuting `evidence` reads. No replacement source tests were run to obtain these logs.

## Verification

| Original | Source SHA | Executor | Full bytes | Full SHA256 |
| --- | --- | --- | ---: | --- |
| [lab #184](https://github.com/psvensson/lagrange-lab/issues/184) | `d55cb368d027d40c780ab8463aa6b1f254d2a540` | adams-gamla | 27,220 | `3570100726f390852d13fe720b91d5bd79d8d2165cdbb5be7bd3bf864ffbd46e` |
| [lab #192](https://github.com/psvensson/lagrange-lab/issues/192) | `9b53962f2e7b8402b2a6a02a4a24b45985cd3563` | tv-dator | 23,846 | `08641ce3ee8557722c12d00374d513fdb49d2da6caeabf484f4178d31ff1d740` |

The evidence requests were #238–#241 for #184 (offsets 0, 8000, 16000, 24000) and #242–#244 for #192 (offsets 0, 8000, 16000). Each retained receipt was checked for controller, request ID/digest, original job ID, offset, byte count and chunk SHA256. Concatenated bytes match each original terminal receipt's full log digest. The retrieval receipts say `redacted: true`; the text returned nevertheless hashes identically to both the raw chunk and full original digest, so no returned byte changed.

Local complete artifacts: `lab-184-executor.log`, `lab-192-executor.log`; machine-readable leaf failure details: `lab-184-failure-analysis.json`, `lab-192-failure-analysis.json`; original terminal envelopes: `set-b-and-conformance-original-receipts.json`; each bounded retrieval: `evidence-238-receipt.json` through `evidence-244-receipt.json`.

## #184: the complete lab signature matches inherited local conformance red

The original 19-file run completed with exit 1: 18 files passed and one failed, with 356 runner assertions. The only failing file was `test/runtime/wasm-driver-contract-conformance.test.js`. Its leaf counters were 30 tests, 23 pass, 7 fail. All seven leaf failures, in order, are:

1. `prepare returns {status: READY} on success` — failed versus ready.
2. `start returns {status: RUNNING} on success` — failed versus running.
3. `health returns {status: string}` — unhealthy versus healthy.
4. `prepare is idempotent (double prepare succeeds)` — failed versus ready.
5. `start is idempotent (double start succeeds)` — failed versus running.
6. `valid descriptor always leads to successful prepare` — failed versus ready, property counterexample.
7. `prepared service always starts successfully` — failed versus running, property counterexample.

These seven names and counters exactly match the retained independent verifier's `base-comparison/failure-signature.json`, its raw base comparison TAP, and its Node22 candidate TAP under `solve/quests/wasm-creation-genesis/evidence/recovery-20261017/verifier-recovery-u1-cloud/`. The recorded base is `381750de29af647d446b19adedf1da53eb712093`. Raw base TAP SHA256 is `17fa32169a86cfd96475de19b1648d23ec7abeb73d9f19bd35b088c5e4a19b90`; Node22 candidate TAP SHA256 is `3c0f51717999b262fd9ce4a6021281040c745ed8d1cf09eed9b5c820b7fa9d2b`.

This closes the earlier uncertainty about whether the lab tail hid a distinct first failure. It establishes matching inherited failure signatures, not passing conformance.

Source inspection at d55cb368 explains the signature: the conformance fixture constructs `WasmComponentDriver` without the consensus lifecycle, while `#prepareConsensusReplica` requires that physical owner and reports `CONSENSUS_LIFECYCLE_REQUIRED` if absent. This is source-based diagnosis, separate from the executed comparison. Any fixture correction must supply the authorized owner contract and preserve the production refusal.

## #192: two failure families point at writer-freeze contract changes

The original three-file run completed with exit 1: one file passed and two failed, with 64 runner assertions. It is a real source assertion failure, not an infrastructure failure.

| File | Result | Runner assertions | Relevant execution |
| --- | --- | ---: | --- |
| `test/raft/raft-rs-backend/operation-port-boundary.test.js` | PASS | 7 | 4,712 ms |
| `test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js` | FAIL | 4 | Two group tests failed |
| `test/wasm-service/wasm-service-replica.test.js` | FAIL | 53 | Four committed-entry tests failed |

The first group failure is `wasm service group commits and applies kv writes through raft-rs`: `written.accepted` is undefined rather than true at test line 238. The restart test then fails a replication predicate (`false !== true`) at line 270 after about ten seconds.

At exact source 9b53962, these tests send the legacy `{operation: 'write', sessionId, key, value}` payload. The strong-write branch now calls `writerCommandFromDelivery`, refuses invalid writer commands with `{status, reason, identity}`, and submits valid writer commands through writer completion. The test's old `accepted` expectation no longer describes that contract. The restart test's missing replicated write is consistent with its old payload; the raw log proves the failed predicate but does not independently expose the returned refusal payload.

The four replica leaf failures are:

1. `should apply KV_SET records to kvStore`.
2. `should apply KV_DELETE records to kvStore`.
3. `should apply KV_DELETE_SESSION records`.
4. `advances the safety interval applied index from the record`.

Each throws `Cannot read properties of undefined (reading 'push')` at `src/wasm-service/wasm-service-replica.js:328`, where production calls `committed.effects.afterCommit.push(...)`. The exact test helper still constructs `{command, index, term: 1, effects: []}`. This directly explains the missing `afterCommit` collection. Updating that fixture also requires executing the post-commit callbacks at the intended transaction boundary; merely adding an empty array would not preserve the safety-index assertion's meaning.

## Set B measured boundary remains unchanged

The existing measured good head is `9ff61abda9d28dd58b60f71f3890e4fdd5a2845d` (#191); measured bad is `9b53962f2e7b8402b2a6a02a4a24b45985cd3563` (#192). The retained source census finds only two production-changing commits among the remaining 35 first-parent commits: finite inbound capture at `4aa8780cfec6f2718b86b4d1e27ee9711492be59`, and writer freeze at the measured bad head. The same three tests, package/lock and runner versions are unchanged.

The recovered failures make the writer-freeze parent's exact head `26cded6cb74594b8d38bce24e6a862302b605e23` the informative next boundary measurement. This report has not submitted it and does not promote source inspection into executed bisection proof. The older fenced Set B intent remains untouched.
