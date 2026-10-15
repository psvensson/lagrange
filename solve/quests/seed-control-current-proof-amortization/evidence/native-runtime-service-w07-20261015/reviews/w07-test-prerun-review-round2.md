# W07 exact-test independent pre-run review, round 2

Reviewer: `subagent:/root/native_witness_verifier`, 2026-10-15.

**APPROVE these exact test/plan bytes for a non-main test-only checkpoint and one first locked whole-file native execution.** This is source approval, not a test result, runtime repair approval or protocol acceptance. No tests were executed by the reviewer. No production/source/Git mutations were made; only review artifacts were written. No production implementation, sealing, activation or merge is authorized.

Worktree: `/mnt/data/peter/projects/.worktrees/native-runtime-service-w07-20261015`; baseline HEAD `ec6a14832e843080e1079c19efe3c0d2fce1bab8`; branch `review/native-runtime-service-w07-20261015`. The review includes the full current test, plan, changed registry and generated metadata scope, plus the existing source seams named in round 1. No diff under `src`, `architecture` or `docs/steering` was present at freeze.

The first review remains unchanged at `/tmp/lagrange-native-runtime-service-20261015.3juv0xul/w07-test-prerun-review.md`, SHA256 `c91a272dac1116364085ad1e95c79d9a589a9ca4f85abaff897b5081e942a3f9`. Its complete 36-item checklist and source mapping are incorporated here. This second round supersedes its REVISE verdict only for the exact new hashes below; it does not rewrite the first reviewed bytes or history.

## Findings resolved

- **F1 cleanup:** test 174-216 tracks returned operation/send Promise settlement, freezes measurement diagnostics, disables future holds, releases gates, observes known settlement and permits a fixed passive 256-microtask unwind before disposal. No cleanup clock, delivery, status or port operation can rescue the measurement. On an observed settlement failure it reports retained storage and preserves the first measurement error. Fixture 111-124 now disposes/reset observers on formation/capture failure; generation trigger construction is inside the protected region. This addresses the finite native/SQLite/send-Promise graph under review. The flush is not a general proof of arbitrary asynchronous quiescence. Partial failure inside the preexisting PartitionNodeCluster constructor remains explicitly documented as an inherited fixture limitation, not a semantic RED or a reason to repair production here.
- **F2 replacement:** test 308-347 enables native output capture, verifies the two accepted occurrences and both actual heartbeat replies, while retaining exact step bytes, newer generation, real trap/reconstruction, typed old HOST_FAILURE/generation-changed result and no stale target primitive. The second response is generated through the actual native core. It is no longer merely a second entry attempt.
- **F3 refusal/tail:** test 394-403 reads the existing durable log with `RAFT_RS_SQL.SELECT_LOG_ENTRIES` after the measured operation completed and before the diagnostic status read. It requires exactly one exact base64 encoding of B's marker, exactly one A marker and strict index order. This excludes a refused/lost forwarded tail despite successful A proposal. Durable-store constants 89-94 and store 425-437 establish the selected query/data representation. Test 407-412 separately checks C's CORE_REFUSED, step phase, APPEND_RESPONSE, fresh count 1 and peer-not-found reason. These are local durable append facts, not quorum commitment/application claims.
- **F4 exact calls:** test 235-238 checks predecessor CORE_OK; 258-263 requires exactly one predecessor native proposal and one selected native proposal. Aggregate two real forwarded sends is still checked separately.
- **Evidence ordering and wording:** the deliberate pressure falsifier is now last (422-423), after quiet, replacement and refusal controls. Test 126-128 and the plan accurately describe retained message references with capture-time hashes, with incoming native snapshots frozen by the existing runtime. There is no claim of deep-copy instrumentation.

No unresolved source blocker was found for this bounded first execution. Future changes to the runtime's async graph must re-evaluate cleanup rather than treating the fixed passive flush as a universal guarantee. A construction/guard/cleanup/external-timeout failure remains a fixture or unclosed seam result and is not the named finite service RED.

## Final category dispositions

All numbered items of the six templates were revisited; untouched source mappings and explicit non-engagements remain those in round 1.

| Category | Exact disposition for all items |
| --- | --- |
| Harness 1-6 | Correct source mechanism R1691-1742; real held native send at T93-108; existing clocks and frozen 4/1 geometry T20-26,239-249; exact message/proposal fields T153-170,258-272; non-vacuous RF3 formation, outputs and controls T58-68,308-347,394-412. Native execution is still pending. No synthetic success or missing symbol is the expected failure. |
| Concurrency 1-5 | Runtime's existing synchronous tail owns serialization R961-987. T227-234 holds an entered predecessor and queues selected work; T320-335 exercises actual post-await generation fencing; T258-263 proves one occurrence per selected/predecessor proposal. Observers do not reenter. Partition/peer/marker/generation identify the resource, not global counts alone. No new CAS/mutex claimed. |
| Recovery 1-5 | Actual replacement retains second input and yields its real reply T308-347; no private state rewrite. Shared-WASM replacement is distinguished from process crash. Exact accepted multiplicity prevents lost-input-as-empty reasoning. Durable application/release replay is unengaged. Stale absence is paired with positive old failure/new-generation service, not accepted alone. |
| Transport 1-5 | Acceptance, actual core entry, native reply and typed refusal are separate observations T153-160,264-272,338-347,407-412. Old send completes only after replacement. No outcome shape/classifier changed. Finite held sends are released/observed in cleanup T185-216; production missing-handler/outer-deadline closure remains untested. The queue/sendFor peer seam is honest and is not a canonical message-router mock. |
| Timer 1-5 | Existing injected clocks/owned zero-time wake and declared trigger tick interval only; no timeouts raised. Real role/generation ownership retained. No JS-memory crash simulation or obligation expiry. No diagnostic or observer drives service. Accepted-work timer remains referenced by its existing owner; idle trigger tick remains unref. Finite service does not prove unbounded fairness. |
| Owner interaction 1-10 | Runtime remains sole service/order/refusal owner; typed operation/send seams unchanged. Same pressure trace pairs four preserved byte-identical occurrences/replies with bound1, while refusal control retains the whole preaccepted tail's ordered durable effect. Stale/fresh control is positive, repeated callers do not create bypass/retry owners, and existing B wake re-enters the same queue. Projections remain evidence. Current-production negative is proposed, not yet observed; exact future treatment must keep schedule/assertions. No escape hatch/new hook. Registry and primary/resource/subsystem classifications match the existing owner pair and test-only scope. |

## Schedule and acceptance boundary

The forwarded-proposal predecessor is an accepted refinement of the pre-edit design. Four deliveries are one native-produced heartbeat plus three exact duplicates. Bound one applies because occurrence 1 alone is pending at the queued turn's capture boundary. A later repair must capture all preexisting input, not truncate CA1/M9 tails to one. The selected proposal's own native output remains unheld, avoiding a test-induced future-green deadlock.

The first run must preserve raw TAP, committed source identity, exact test hash, command, dependencies, locked host, exit status and all controls. Use the existing locked executor with failed-file retries disabled; no rerun to obtain a preferred result. A semantic service RED is established only if the controls/preservation checks engage and the final `before <= 1` assertion is the failing mechanism. That result would demonstrate finite late service, not infinite starvation or release-protocol failure.

## Frozen hashes

```text
07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d  test/raft/raft-rs-backend/runtime-captured-inbound-service-native.test.js
f5c79702e99802631c2d56bf2183fd29b6720e04c282547944f4fb6e474c81fd  solve/quests/seed-control-current-proof-amortization/evidence/native-runtime-service-w07-20261015/WITNESS-PLAN.md
b746e184a8c4026af9eb01ae2240b12e7f2e21a4cf3544e31e06aea41a8bf7df  test/shards/impact-contracts.json
35a2593136f3de6c8ff15b006c78584da76efe65674f0aa9e78a2e39716826b9  test/shards/primary-classes.json
ee7ce66d755436df020d0a01abcca74fa8a924eb96f23f85c6249e590466570d  test/shards/resource-classes.json
c45b5bd4d09b6df0ae1ce95b8a80cb09249a74ef5081d1c3a90e82e4db0db6b8  test/shards/subsystem-classes.json
fde64b7ca256545732e90c6ee132e9c84b79abc13e7278c8edcf8cdb93e8ed74  test/shards/impact-graph-seal.json
ba23c000e14143ae00e1e48a74cc2a91612a4f9abdacc381589b282500df4cf2  src/raft/raft-rs-durable-store-constants.js
88af05c5bcdf3d8f1209615a2d3f6c6427ab9ebf8951a1f66835402074c75d5f  src/raft/raft-rs-durable-store.js
```

Runtime/port/delivery/timer/fixture source hashes remain those recorded in round 1. Test checkpoint source approval does not approve a runtime correction or the complete release implementation unit. Successor remains unsealed/unactivated; shared wave HELD; Runner/TAP PARKED; PR122 and bde70cec remain rejected.
