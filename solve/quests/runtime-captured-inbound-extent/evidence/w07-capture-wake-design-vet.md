# W07 admitted-capture and remainder-service design vet

Reviewer: `subagent:/root/native_witness_verifier`, 2026-10-15.

**Design/seam verdict: APPROVE the bounded direction and the three companion schedules below for test authoring, subject to exact-content review before any execution. No production source is approved by this report.** No tests were executed, no source was edited, no lab lease was acquired and no Git mutation was performed. Only this report was written.

Pinned tree: `/mnt/data/peter/projects/.worktrees/runtime-captured-inbound-correction-20261015`; branch `review/runtime-captured-inbound-correction-20261015`; HEAD `a7e821154f1039df82bfc73ef4f2e25e4fa0468d`. At inspection the new Quest was untracked and no production diff existed. Actual AGENTS -> rules -> router were loaded, then current architecture/runtime/recovery, test and verification owners. Parent owns the packet; historical worktree/process observations are not this reviewer's lease.

The new Quest `runtime-captured-inbound-extent` is sealed at that HEAD with six receipt obligations. Its seal does not activate the release successor. The frozen W07 file is unchanged: Git object `debc16f442ba63b100332d93b285865d36d1c376` is a **blob**, not a commit; local `git hash-object` matches it. SHA256 is `07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d`.

## Exact owner boundary

`raft-rs-runtime-owner.js` remains the sole owner of per-group serialized turns, accepted inbound queue custody, Ready continuations and execution-generation validation. The operation port supplies lifecycle admission and encoded command intent; peer delivery supplies actual transport completion; the durable store owns persistence admission and log/application durability. The test supplies controlled external scheduling and observes these owners. No observer, release caller or helper grants a new permit.

Capture the generation and finite queue extent **inside `perform`'s successful `ensureExecution` continuation**, adjacent to current lines 1740-1742. Capture neither at `executeCommand`/`enqueue` nor before calling `ensureExecution` at 1736. That call can reconstruct a failed group (`920-935`, `877-906`), replay committed work through `drainReady`, and await persistence admission. Input accepted during that wait belongs to the admitted turn's initial extent.

Keep all envelopes in `group.inbound`; pass only a remaining extent through the drain. Each actual per-message refusal consumes one occurrence and must continue through the rest of the captured preaccepted tail. Later arrivals never increase the remaining extent. A blanket cap of one would violate the two-message CA1/M9 tail; the frozen W07 bound is one only because that schedule has one occurrence pending at its cut.

## Complete findings and constraints

**F1 — Frozen W07 is not a unique capture-point oracle (harness/concurrency).** Its `before <= 1` permits zero, so capturing at enqueue can satisfy it. The preserved post-run review already identifies this limitation; do not alter the old test to conceal it. Add exact-order companion assertions for both queue admission and the actual ensureExecution await.

**F2 — Pre-dequeue custody needs the canonical execution guard (concurrency/recovery).** Current `drainInbound:1700` shifts before `invokeCoreAt:1709`. A generation/closed/handle/health change between a successful Ready result and the next continuation can therefore remove an unstepped occurrence before the native-entry guard refuses. Check current custody before any queue-consuming mutation. Preserve the existing guard's single meaning (`394-407`); a private extraction reused by it and drain is preferable to two independently evolving predicates. Guard each resumed iteration, including before running the selected command. Do not let an old continuation drive reconstruction of the new generation.

This is a source-reachable risk, not a newly executed native counterexample. The frozen replacement test replaces during a held send, where `finishReady` usually returns a generation failure before recursion; it does not uniquely cover the narrow successful-Ready-to-next-dequeue gap. Exact source review must verify the guard ordering even if that narrower native cut lacks a faithful existing passive seam.

**F3 — A healthy consumed wake is usually already a queued owner turn (transport/timer).** `enqueueStep:1979-1982` retains an immutable envelope and calls the existing scheduler. Its callback clears scheduled state and either sees empty/closed input, owns typed hold/retry debt, or enqueues DRAIN through the same lifecycle/queue (`1796-1824`). A healthy callback consumed while a command waits does not imply lost wake custody: it may already have queued the turn that owns the remainder. Do not add an unconditional timer/rearm or a competing queue merely because the captured drain leaves input behind.

For any proposed rearm, identify a concrete uncovered exit and show current group/lifecycle ownership, coalescing and exact-clock custody. A zero-delay rearm on every held/failed turn can spin or queue redundant work. In particular it must not renew spent persistence-admission bounds, bypass recovery not-before, or replace an existing timer.

**F4 — Preserve failure and terminal classifications (admission/recovery).** Native per-message CORE_REFUSED is recorded against that envelope and continues (`1716-1724`; peer-delivery `42-58`); host/core failure ends the turn with existing typed semantics. Shared runtime replacement is distinct from group-only host reconstruction. Identity-unrecorded ingress is explicitly not accepted (`1972-1977`). The existing permanent reseed owner deliberately clears the inbound queue (`runtime-faults:53-64`); close and reseed must not silently be reinterpreted as transient retained-work promises. No new durable obligation or discard ledger is introduced here.

**F5 — Actual ensureExecution awaits need a real host boundary (harness/admission).** Healthy RF3 ensureExecution is synchronous. Ordinary RF3 reconstruction may replay without producing a peer send, so holding an ordinary later Ready send is insufficient to demonstrate capture after ensureExecution. Use the actual reconstruction plus real SQLite persistence wait in C2 below. If its Ready boundary does not engage, report the seam failure rather than manufacture an asynchronous result.

**F6 — Finite service does not establish global capacity/liveness (owner interaction).** A finite captured extent leaves potentially large preexisting batches, native Ready/application cost, caller tail depth, follower backlog and stalled peer sends unbounded by this test. No intake capacity, M/H/settlement priority, owed-tick guarantee, release fencing, TX1, snapshot import, process-crash recovery or physical cross-host certification follows. The existing release implementation unit remains separate.

## Three narrowly scoped companion schedules

All use actual native operation ports, actual native-produced envelopes, existing `sendFor`/`applyFor`/fault seams and unchanged timing constants. Keep the frozen W07 file byte-identical; author separate test/helper files. No measured status/readStatus, settle, deliverAll, manual tick or observer-driven progress. Assert native outputs and typed outcomes in addition to entry attempts. Cleanup owns gates, any real SQL transaction and returned invocation Promises before database closure; instrumentation errors are fixture failures, not semantic REDs.

### C1 — Accepted after enqueue, before admitted turn

Form RF3, apply a setup marker everywhere and capture an actual A-to-B heartbeat. Hold B's real forwarded predecessor send. Queue a unique selected B proposal; while it is queued, accept **two** duplicate occurrences through B.step, with separate occurrence identities and the same exact bytes. Release the predecessor. Require both core steps and real replies before the one selected core proposal, plus its real forwarded output and CORE_OK. No fixed one-message cap can pass this case. Baseline should preserve this existing behavior; an enqueue-capture mutation must fail the exact order through the intended seam.

### C2 — Accepted during real ensureExecution reconstruction wait

1. Form RF3. Commit a native marker using A and C while withholding B's relevant transport. Deliver B's real envelopes individually during setup until a one-shot existing `applyFor` failure occurs for that exact marker. Stop B immediately; do not let a setup status/tick reconstruct it. Establish actual durable commit > applied and absent application effect with passive SQLite reads. No synthetic log or participant row.
2. Invoke the selected B proposal, which must enter `perform -> ensureExecution -> reconstructGroup`. Use the existing fault injector as an **explicit active host-fault seam**, distinct from passive observers: observe target `create_node` arguments (`createNodeArguments:410-430`, field `id === cached B peer`), then open a real B SQLite `BEGIN` once at the reconstruction's subsequent `persist_ready`. Return undefined so the real native primitive executes. The taken Ready's existing `whenPersistenceAdmitted` must now hold this invocation; no fake Promise or success is substituted.
3. While that real wait is pending, deliver the saved actual A-to-B heartbeat. Record acceptance and its full identity; assert selected native propose has not entered. ROLLBACK the actual connection and advance only B's owned clock by the **existing** persistence poll interval. This drives the already-owned wait, not a test-created recovery algorithm.
4. Require replayed marker effect exactly once, exact heartbeat step and real reply before selected native proposal, and selected real output/typed success. Record observed reconstruction/persistence-wait ordering. This differentiates capture before ensureExecution from capture after it. The `create_node` observer alone is group-scoped; use actual args to identify B and never guess replica from a global count.

This schedule is source-mapped feasible but unexecuted. `operation-port-ready-recovery.test.js:207-245` supplies the real failed-application/replay precedent; runtime `1136-1188` and persistence-admission `34-76` supply the real taken-Ready wait. Refuse a test that labels an ordinary proposal's send await as this cut.

### C3 — Remainder after an already-consumed wake, with no later rescue

Hold real B forwarded predecessor; queue selected B proposal; accept h1; release predecessor. Selected's turn steps h1 and suspends on its actual response. Accept h2, then advance B clock zero **once while h1 remains held**, observing original wake callback/turn-request. That callback has already enqueued the canonical DRAIN turn behind selected. Release h1. From this cut onward perform **no new step, clock advance, status, tick, settle, deliverAll or unrelated command**. Do not hold selected's send or h2's reply.

Require exactly h1 then selected native propose then h2, both original message hashes and actual heartbeat replies, one selected native entry and its CORE_OK/output. Existing queued work must drain h2 automatically. The current live-queue implementation may fail the selected-before-h2 order while still preserving h2; a later dropping/stranding implementation must fail positive remainder service. This witnesses consumed-wake custody, not proof that a newly armed timer was necessary.

If the actual correction touches shared-runtime wake debt, strengthen its separate replacement control by firing B's already-owned wake between the trigger's trap and reconstruction ticks, so `RUNTIME_HELD` is observed; after old continuation settlement use only B's owned clock to verify current-generation h2 step/reply. Existing `resumeRuntimeGroup:647-653` owns that reoffer. Do not inject a new observer-side progress loop. This addition is conditional on the changed exit and must be reviewed before execution.

## Category-complete sealed checklist (43 items)

R = runtime owner; P = persistence-admission; D = peer-delivery; C = inbound timer custody; F = PartitionNodeCluster. Each row is a design obligation/source finding, not an executed PASS.

| Item | Evidence and disposition |
| --- | --- |
| Harness 1 correct RED | Frozen W07 first native result is preserved; C1-C3 require named ordering failures after real preconditions. Missing wait/guard/setup failure is non-proof (F1/F5). |
| Harness 2 seam parity | F147-194 real port/send/apply seams; C2 uses real SQLite and actual core persist_ready, no mocked authority. |
| Harness 3 time | Existing F PARTITION_TIMING; P poll/bound unchanged. C3 has no post-release drivers; C2 uses only its owned poll interval. |
| Harness 4 identity | Group, B peer, runtime generation, full native envelope/marker bytes, delivery ordinal and exact create_node.id; R349-359 observer/args limits. |
| Harness 5 non-vacuity | Two inputs in C1; actual commit>applied/application failure and pending replay in C2; original callback fired, h2 real reply in C3. |
| Harness 6 native binding | F206-230 real native/WAL/FULL; first baseline and later exact-source runs remain required. No cross-host or product protocol claim. |
| Concurrency 1 synchronous owner | R961-987 tail installed synchronously; capture belongs to admitted work, not submission. C1 differentiates the cuts. |
| Concurrency 2 after await | R1736 successful continuation is capture point; F2 checks guard before dequeue after every Ready await; C2 distinguishes pre-ensure capture. |
| Concurrency 3 winner | Existing per-group queue and exact one proposal; no alternate priority/CAS. Captured extent cannot grow during awaits. |
| Concurrency 4 reentry | R1796-1824/C6-27 queues owned callback; instrumentation passive except explicitly named host fault. No callback progress rescue. |
| Concurrency 5 key | R group key, actual B peer/command bytes and generation; global group-only observer is insufficient alone. |
| Recovery 1 live state | Keep envelopes in existing R group.inbound; no detached batch/new recovery owner; F2 preserves unstepped remainder. |
| Recovery 2 discrimination | R920-935 chooses shared replacement vs group reconstruction; C2 host failure preserves runtime generation, frozen W07 covers real generation replacement. |
| Recovery 3 missing custody | Exact accepted occurrence multiplicity and positive real replies; empty queue cannot imply prior work completed. |
| Recovery 4 replay | C2 verifies actual committed marker afterCommit once; existing application transaction owns rollback/replay. No new release-result dedup. |
| Recovery 5 absence | Pair missing selected entry during hold with actual pending invocation; pair resumed service with native reply. Stale absence alone proves nothing. |
| Transport 1 ACK | R1979-1982 acceptance is not processing; C1-C3 require steps plus real output/typed result. |
| Transport 2 late reply | Frozen W07 holds old send through replacement; F2 covers not-yet-handed-off remainder; old completion cannot drive current recovery. |
| Transport 3 classes | R1716-1724/D42-58 keep per-message refusal separate from selected result; no new transport outcome shape. |
| Transport 4 bounds | Test sends are finite and cleanup-owned. Production never-resolving peer send remains an explicit unproved boundary; no timeout change. |
| Transport 5 honest stub | F sendFor queues actual native envelope after held Promise; no router-success stub, no fabricated heartbeat. |
| Sweep 1 clock | C6-47 retains original clock/cancellation. Referenced accepted-work timers are intentional; generic unref advice does not override custody. |
| Sweep 2 authority | R394-407 current execution state before destructive dequeue; actual roles/membership from native setup. No new transaction decision. |
| Sweep 3 crash model | Shared native replacement retains JS queues; C2 same-runtime host reconstruction. Neither simulates process crash. |
| Sweep 4 legal hold | P BOUND_MS and poll cadence unchanged; do not reset bound/retry-not-before on rearm (F3/F4). |
| Sweep 5 self-starvation | C3 no later driver; C2 only existing owned persistence poll. No status read through subsystem to rescue its progress. |
| Owner 1 one decision | Runtime alone chooses captured turn/custody; store alone supplies admission; test/projections do not grant service. |
| Owner 2 typed seam | Existing operation commands/send/store outcomes only. No new public hook, scheduler or second queue. |
| Owner 3 paired invariant | C1 retains all preaccepted input; C3 pairs selected service with preserved late input in one trace; frozen refusal retains CA1/M9. |
| Owner 4 stale/fresh | Frozen generation control plus current guard ordering; conditional runtime-held wake extension if source changes that exit. |
| Owner 5 pressure | Captured extent stops live extension, not intake or preexisting-size bounds. No backpressure bypass or invented finite-capacity claim. |
| Owner 6 wake | F3 inventories armed timer vs queued turn vs runtime debt; C3 proves queued ownership without fresh trigger. |
| Owner 7 projection | Observer stages/hash/sequence are evidence only; actual replies/application effect complete positive claims. |
| Owner 8 negative | Same frozen W07/source-reversion and exact companions/incorrect-capture mutation required by Quest receipts. Never change assertion threshold with treatment. |
| Owner 9 no bypass | No raw runtime mutation, synthetic authoritative rows, new timers or observer polling. C2 real SQL BEGIN is declared test host fault at existing seam. |
| Owner 10 alignment | Existing runtime/application contract and affected native tests; register new tests/update actual pair scope with source increment. W07 tests-list membership alone is not complete paired proof. |
| Admission 1 precheck/enforce | R1731 and P persistence owner; capture only after successful ensureExecution, generation backstop before mutation. No copied store predicate. |
| Admission 2 transient classes | Existing R recoveryOutcome/hostFailure/CORE_REFUSED unchanged; typed host hold cannot masquerade as empty admitted batch. |
| Admission 3 budget | PERSISTENCE_ADMISSION_WAIT poll 10ms/bound120000ms; recovery election-derived not-before unchanged. Finite extent is a count, not a new time allowance. |
| Admission 4 reason shapes | Existing named outcome/phase/reason; retain CORE_REFUSED vs HOST_FAILURE and its retry/recovery flags. |
| Admission 5 release | Actual SQLite ROLLBACK plus owned poll releases C2; actual queued DRAIN services C3. No CDC/cache permission involved. |
| Admission 6 freshness | Capture current generation/extent at admitted continuation and guard current state before each removal; no enqueue-time snapshot reused. |
| Admission 7 message honesty | Diagnostics name blocked B/group/runtime generation and actual accepted envelope/selected bytes; no unrelated operation identity used as blocker. |

The retry/formation templates were also read. No new retry algorithm, rate, formation owner or client budget is proposed. Relevant firing/stop/backoff obligations are covered by F3/F4 and transport/timer/admission rows above. If implementation introduces rearm changes beyond existing coalescing or a new wait, that additional retry surface requires explicit category/contract review rather than an assumed pass.

## Source binding

```text
a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b  src/raft/raft-rs-runtime-owner.js
ab3b0a3c27b1568ab644d458ebcf078f47d8da98255d41317bdc766923ff0597  src/raft/raft-rs-operation-port.js
55c3d7b5bb1eeb2a35f9fb6c11e6b54506ef00e18374f5a52cd4e9d11b83e931  src/raft/raft-rs-persistence-admission.js
dec12a4e6aa2047425ec668384d594eccf613bcf0bccdc9eb908cd26313634f9  src/raft/raft-rs-inbound-timer-custody.js
a171e184991b340f40a046775232c1a7c3bc10a577aa048898f924126b7a9379  src/raft/raft-rs-runtime-faults.js
c59d26515dd145e3ce62fbbcbf5308fd5ff301fb232f6fc1516143fbd84476b2  src/raft/raft-rs-runtime-owner-constants.js
dca9b5eaaa23d192909608b8d05a5f3c1b8effe2386d5e6050745e6d393d871c  test/raft/raft-rs-backend/partition-node-cluster.js
82e2704c3562d90cff3ffbc2fd39970078312302ffcb62529cbd14d3afaf7fa3  test/raft/raft-rs-backend/inbound-drain-owned-timer.test.js
edd3a9d1d5a1c24a4383c0ecd089babedea65715658668c95313966730f2a22f  test/raft/raft-rs-backend/operation-port-ready-recovery.test.js
07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d  test/raft/raft-rs-backend/runtime-captured-inbound-service-native.test.js
09042315bda639529e42427e50ddd9eed4a2d8590f2d20e181585aa1e0792ad8  solve/quests/seed-control-current-proof-amortization/evidence/native-runtime-service-w07-20261015/SOURCE-CORRECTION-PROPOSAL.md
193516223dc8c26916ce261427127fdda93f595ccd5f6a2d91eb80319bd9b2da  solve/quests/runtime-captured-inbound-extent/quest.json
```

The narrow source increment may proceed only through the authorized reviewed-tests/baseline/source-review evidence order. The full release successor stays unsealed/unactivated, shared-control-wave HELD, Runner/TAP PARKED, and PR122/bde70cec rejected. No wholesale merge of this preservation lineage is approved.
