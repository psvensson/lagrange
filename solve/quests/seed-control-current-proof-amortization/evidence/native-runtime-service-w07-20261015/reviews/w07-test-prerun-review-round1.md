# W07 exact-test independent pre-run review, round 1

Reviewer: `subagent:/root/native_witness_verifier`, 2026-10-15.

**REVISE before the first locked native execution.** This is a test-source review, not an execution result. No tests, native processes, lab leases, production edits or Git mutations were performed by this reviewer. Only this report was written. Implementation and release-protocol approval remain HOLD.

The isolated tree is `/mnt/data/peter/projects/.worktrees/native-runtime-service-w07-20261015`, branch `review/native-runtime-service-w07-20261015`, HEAD `ec6a14832e843080e1079c19efe3c0d2fce1bab8`. The actual AGENTS -> rules -> router and conditional owner/checklist documents were loaded for this work. Current staged/untracked content belongs to the parent packet; it is not evidence of a shared-checkout lease. This review binds the test and plan hashes below, before any requested revision.

## Scope and schedule judgment

The change from the earlier heartbeat-response predecessor to a real B forwarded-proposal predecessor is justified. Test lines 175-205 hold a native send belonging to an already-entered operation, queue the selected operation behind it, then admit exactly four occurrences of one captured native heartbeat. The selected proposal's own send is deliberately not held. That avoids a fixture-induced deadlock if a later implementation services the proposal before the remaining inputs.

The frozen bound of one is justified for this selected schedule: only occurrence 1 is pending when the queued turn starts. A prospective captured-input implementation must include **all** input already pending at turn entry and avoid extending that captured set with later arrivals. It must not blindly cap every preexisting batch at one. The separate C-refusal/B-forwarded-tail control is therefore necessary to retain CA1/M9.

The main test has a genuine source-backed failure hypothesis: `src/raft/raft-rs-runtime-owner.js:1691-1724` recursively consumes the live inbound queue after each Ready await; `:1727-1742` runs that drain before the queued command. Its preservation checks precede its service assertion (test 209-228). No measured status/readStatus/settle/deliverAll/manual tick or observer-driven rescue was found. There is no missing production symbol or simulated compound release command. The unchanged fixture really exports PARTITION_TIMING.

Four duplicate deliveries are not four independently native-produced heartbeats. The plan says this correctly. Core entry is operation service, not committed application, durable transaction settlement, deadline enforcement, or release authorization. The plan retains those limits.

## Findings requiring revision

### F1 — Teardown can close storage while owned continuations remain runnable

Test `finish:165-173` resolves gates and immediately disposes the cluster. Resolving a Promise does not run its `.then` or the runtime's Ready continuation synchronously. The gate callback at 103-106 can therefore enqueue the actual message after dispose. `finishReady` at runtime 1136-1188 still has application/advance work after send completion. Fixture `dispose:495-515` closes native handles and databases immediately and swallows close errors; it does not join these continuations.

Minimal reachable failure schedule: predecessor send is held -> a seam/preservation assertion fails -> finally resolves its gate -> dispose closes the database -> gate/Ready/queued-operation continuations execute. This can contaminate the next test or obscure the first failure. There is also a future-treatment schedule: the selected operation completes early -> the final heartbeat reply is released -> `await queued` is already satisfied -> assertions/teardown run before that final Ready continuation finishes. Counting emitted replies alone does not join them.

Make cleanup asynchronous and owned: stop creating holds, release all known gates, join known invocation Promises, and passively establish completion of the declared finite continuation work before disposal. Use existing passive observations or a bounded passive flush with explicit completion checks; do not introduce a status/tick rescue inside the measured interval. Preserve a measurement snapshot before cleanup and retain the original assertion if cleanup itself fails. A terminal `has_ready` observation is an entry attempt, so any chosen completion predicate must be described honestly rather than treated as an authoritative return-value hook.

Also cover setup failure. `fixture:82-115` forms/captures before the caller's try; service 176, generation 239-246 and refusal 297-298 put constructed fixtures outside their cleanup region. A setup assertion or second-cluster creation failure can leave databases and the fixture-installed global observer alive. Dispose successfully acquired resources and reset observer seams on those exits as well.

### F2 — Replacement positive control observes an attempt without its processing evidence

Generation control 255-288 never enables `control.capture`. It verifies the second native step entry and newer generation but does not verify that the retained occurrence produces its real heartbeat reply. `invokeCore` reports entry before core invocation (runtime 349-359), and a typed CORE_REFUSED is still an observed step. A regression that refuses the retained h1 rather than servicing it can therefore satisfy these positive assertions.

Enable passive native output capture and assert the two accepted occurrences, exact byte identities, and the second real heartbeat response after reconstruction. Keep the existing old invocation's HOST_FAILURE/generation-changed result and absence of old native proposal. Join its final continuation before teardown per F1. This is shared-WASM replacement with surviving host queues, not process-crash recovery.

### F3 — Refusal control does not yet prove the valid tail's native effect

Refusal control 319-337 checks the two core-step attempts and A's own proposal outcome. Both delivered messages could be refused while A's own proposal still succeeds. That satisfies the present assertions and does not preserve the valid-tail side of CA1/M9.

Before the post-measurement status read, assert a native APPEND or already-written native log record containing the **exact encoded B forwarded marker**, with appropriate occurrence/order identity. Merely asserting some APPEND exists is weaker here because A's own selected proposal can produce one. The actual native send/log is available through existing fixture surfaces; no production hook is needed. Retain both steps-before-selected ordering. Assert the C refusal's message type, reason classification and fresh count or baseline delta, in addition to sender/outcome/phase. Runtime peer-delivery 42-58 already records these fields. A diagnostic refusal retained from another phase cannot substitute for the measured per-message result.

### F4 — Exact operation multiplicity and predecessor outcome are underasserted

`proposalEntry:155-158` returns only the first match, while service 210-212 counts total forwarded sends. An extra selected core attempt that emits no extra output is not excluded. Assert exactly one matching selected native proposal entry and one predecessor entry; assert the predecessor's returned CORE_OK at 193 instead of discarding it. This closes the planned one-operation/non-vacuity claim without adding a new authority.

## Additional review observations

- Move the pressure test registration from 235-236 to EOF, after the positive controls. No bail option was found in the current runner, so this is robustness and evidence ordering rather than a demonstrated bail failure. It aligns the prior design recommendation and ensures the deliberately failing service assertion is encountered after the controls.
- Observations retain message object references at 95, 102 and 129; they are not deep copies as plan 77/test 118 literally say. Runtime inbound snapshots are deeply frozen at 1842-1847, and no test mutation of native packets was found. This is not an observed fidelity defect. Either describe the immutable-reference capture precisely or copy the diagnostic payloads, keeping pre-capture hashes and avoiding instrumentation exceptions that masquerade as core faults.
- The 256-microtask guard is a fixture seam guard, not a wall-time liveness budget. Its failure must remain a non-proof. A malformed scheduling implementation may still stall an unguarded awaited operation until the external whole-file limit; do not classify that as the named finite service assertion.
- The parent has registered this file in the existing `raft-rs-runtime-application-transaction` impact contract; no new semantic owner was added. Generated classification is unit/ordinary/storage-raft. No production diff was present in the inspected scope. Parent states the locked executor will use LAGRANGE_RETRY_FAILED_ONCE=0; execution provenance must confirm it later.

## Category-complete review (36 items)

The entries below are source-review findings or explicit limits, never executed PASS claims. `T` means the reviewed test; `R` the runtime owner; `P` peer-delivery; `F` PartitionNodeCluster; `V` VirtualTimeSource; `C` inbound-timer-custody.

| Category/item | Concrete evidence and disposition |
| --- | --- |
| Harness 1 correct RED | R1691-1742 and T175-228 engage recurring real input before the command; final bound is after byte/count checks. F1-F4 must close first. No run yet. |
| Harness 2 seam fidelity | F147-194 uses real native ports and sendFor; T91-106 returns a real held Promise and queues the original output on release. No synthetic CORE_OK. |
| Harness 3 time | Existing PARTITION_TIMING 44-50 unchanged; T197 drives only B's owned zero-time callback; T266-268 explicitly drives trigger ticks. No compressed timeout claim. |
| Harness 4 fields | T144-152 preserves exact native envelope hash; T126-139 correlates actual sequence/generation/arguments, T160-162 targets peer B. F3 requires exact tail-effect bytes; retained-reference wording noted. |
| Harness 5 non-vacuity | T57-65 forms real RF3 with setup write on all replicas; T186 asserts held predecessor; T209-221 asserts real output and preserved occurrences. F2-F4 close attempt-only and duplicate-operation holes. |
| Harness 6 live binding | F206-230 builds real WAL/FULL/native operation ports; no fake core. Native execution remains pending; generic fixture application is not production release/TX1 proof. |
| Concurrency 1 sync gate | R961-987 synchronously installs tail; T185-191 demonstrably suspends an entered operation before queueing selected work. No new CAS or admission authority. |
| Concurrency 2 after await | R394-407 generation backstop; T266-281 observes actual replacement then old result/no target entry. F2/F1 complete positive current-generation and continuation cleanup. |
| Concurrency 3 one winner | Unique encoded proposal marker identifies the operation, but first-match lookup misses duplicates: F4. No durable-claim CAS is added or certified. |
| Concurrency 4 timer reentry | T120-141 observers only record; T197 uses existing owned timer. R1820-1824 enters same queue. No progress call from instrumentation. |
| Concurrency 5 key scope | R group queue is replica-specific; T filters partition and message.to, unique proposal bytes, actual runtime generation. Global raw counts alone are not the proof. |
| Recovery 1 no stale clobber | T261 retains second accepted envelope over real reconstruction R721-803. No fixture rebuilds private state. F2 needs actual positive response, not attempt only. |
| Recovery 2 restart/live | Shared native runtime replacement is observed by create_node/new generation T269-271. Host queues survive; this is explicitly not process restart or snapshot recovery. |
| Recovery 3 missing enrollment | T144-152 admission and T213-221 occurrence counts reject missing accepted heartbeat work. F2 adds the same complete accounting to generation control. Transaction enrollment is unengaged. |
| Recovery 4 idempotence | Duplicate heartbeat deliveries are intentionally all stepped; no application dedup or atomic release replay is modeled. Those obligations remain outside this test. |
| Recovery 5 absence | Old proposal absence is paired with held old Ready, declared actual trap, new generation and typed old failure T255-281. Fresh service is not established by absence: F2. |
| Transport 1 ACK vs processed | T150-151 distinguishes ingress acceptance; T219-221 adds actual native replies for service. F2/F3 are the two missing processing/effect controls. |
| Transport 2 late response | T272-281 resumes old actual send after real replacement, preserving stale-continuation fence. F1 must prevent teardown from creating additional late work. |
| Transport 3 classification | Existing P74-85 and R342-407 retained; T279-280 checks HOST_FAILURE phase and T335-336 checks CORE_REFUSED phase. F3 requires exact refusal fields/count. No new response shape. |
| Transport 4 bounded unavailable | Delays are deliberately finite, test-owned sends; F1 must release/join on every exit. Missing-handler/deadline behavior is not exercised or certified. |
| Transport 5 stub honesty | Native message queue/sendFor is the declared lower-level peer seam, not a canonical router fake. P88-127 is real production delivery sequencing; same-host fixture only. |
| Timer 1 injected clock | T85-90 and 241-243 supply actual V clocks; V150-182 dispatches due callbacks. C6-27 owns exact clock. Referenced accepted-work wake is deliberate, idle ticks unref at port338-345. |
| Timer 2 role fence | Real RF3 setup and native follower forwarding engage roles; selected command has no release/transaction authority. Replacement uses R expectedGeneration, not setup role as a permit. |
| Timer 3 crash equivalent | No queues/maps are cleared to fake a restart. T238-294 is precisely shared native replacement, and makes no JS-process crash-equivalence claim. |
| Timer 4 legal hold | No detector thresholds or legal obligation expiry changed; the fixture deliberately releases finite sends. F1 covers exits with outstanding sends. |
| Timer 5 self-starvation | No observer/status/settle rescue in T188-228; the existing B-owned wake is exercised. This finite service result is not unbounded fairness or stalled transport closure. |
| Owner 1 sole decision | R owns service/order/refusal; T only schedules external deliveries and records outputs. Counts remain evidence, not runtime authority. |
| Owner 2 typed seam | Existing operation ports, native sendFor and passive observers only (T9-17,91-106,120-141). No new production hook/fallback. |
| Owner 3 paired invariants | T213-228 keeps preservation and service in the same pressure trace. T296-337 protects preexisting refusal/tail ordering but lacks tail effect: F3. No old-shortcut mutation executed. |
| Owner 4 stale then fresh | T238-288 is the right old-await/new-generation schedule; F2 strengthens actual fresh positive service. |
| Owner 5 pressure/backoff | Four finite native duplicate deliveries, no force flag or retry loop; selected output unheld permits a future fair implementation. Does not test saturation/byte plateau. |
| Owner 6 wake | R1757-1824 and C own accepted wake; T197 and 282 dispatch that clock. No manual tick/status rescue. Fresh processing requires F2. |
| Owner 7 projection authority | Entry sequence/hash/stage/refusal are diagnostic observations. F2/F3 prevent their misuse as processing success. Post-interval status does not drive the measured command. |
| Owner 8 negative fidelity | Current-production semantic RED is proposed, not yet observed. Frozen ARRIVALS=4/BOUND=1; later changes must retain schedule and assertions. No mutant/fixed-run proof claimed. |
| Owner 9 no escape hatch | No direct core call, state rewrite, fabricated membership/refusal, row deletion or added harness. Actual coreFaultInjector throws only for the declared trigger tick. Cleanup fix must retain this boundary. |
| Owner 10 registry/proof | impact-contracts:599-664 adds test to existing contract; primary/resource/subsystem entries classify it unit/ordinary/storage-raft. Revised exact bytes require re-review before one locked first run. |

## Exact reviewed identities

```text
d786695137c20d80b39062da1adda7d1789d77691ffc645782542adc793a9e34  test/raft/raft-rs-backend/runtime-captured-inbound-service-native.test.js
2a52fcf9665d8984204f39b4f2fa26d7a6d564f0c50ba84856bca27711161abf  solve/quests/seed-control-current-proof-amortization/evidence/native-runtime-service-w07-20261015/WITNESS-PLAN.md
b746e184a8c4026af9eb01ae2240b12e7f2e21a4cf3544e31e06aea41a8bf7df  test/shards/impact-contracts.json
35a2593136f3de6c8ff15b006c78584da76efe65674f0aa9e78a2e39716826b9  test/shards/primary-classes.json
ee7ce66d755436df020d0a01abcca74fa8a924eb96f23f85c6249e590466570d  test/shards/resource-classes.json
c45b5bd4d09b6df0ae1ce95b8a80cb09249a74ef5081d1c3a90e82e4db0db6b8  test/shards/subsystem-classes.json
fde64b7ca256545732e90c6ee132e9c84b79abc13e7278c8edcf8cdb93e8ed74  test/shards/impact-graph-seal.json
a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b  src/raft/raft-rs-runtime-owner.js
ab3b0a3c27b1568ab644d458ebcf078f47d8da98255d41317bdc766923ff0597  src/raft/raft-rs-operation-port.js
cd047d4be28802188892b8bf31d1e8b14d5039524dd4349a8195104ef8d5e9a5  src/raft/raft-rs-peer-delivery.js
dec12a4e6aa2047425ec668384d594eccf613bcf0bccdc9eb908cd26313634f9  src/raft/raft-rs-inbound-timer-custody.js
c4bf713ffca20541e11f079eeacf6cb51892ef722c0993a6277c7edd4ca48311  src/time/time-source.js
dca9b5eaaa23d192909608b8d05a5f3c1b8effe2386d5e6050745e6d393d871c  test/raft/raft-rs-backend/partition-node-cluster.js
398eca66728c0e50c240af08287fe76548692e7566768e534ff3a1011978304b  test/raft/raft-rs-backend/runtime-turn-integrity.test.js
```

The original design vet remains unchanged at SHA256 `49935286e66c51dff4ab99d3c9604a2295a53f3985180c7087855fe12a0d2cb0`. This report does not revise its preserved history. The current test is not approved for the first native run until the required fixture/control corrections receive exact-content review. Successor remains unsealed/unactivated; shared wave HELD; Runner/TAP PARKED; PR122 and bde70cec remain rejected.
