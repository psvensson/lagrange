# W07 independent pre-implementation design vet

Reviewer: `subagent:/root/native_witness_verifier`; 2026-10-15.

**Verdict: approve the bounded TEST-ONLY design for authoring and subsequent exact-content review. No source checkpoint or execution approval is given by this pre-edit vet.** No tests were executed. No production changes, new hooks, compound-command simulation, protocol acceptance or successor activation are authorized.

Worktree `/mnt/data/peter/projects/.worktrees/native-runtime-service-w07-20261015`, branch `review/native-runtime-service-w07-20261015`, HEAD `ec6a14832e843080e1079c19efe3c0d2fce1bab8`. Initial tracked tree was clean. Actual AGENTS -> rules -> router loaded in order, followed by Quest-subagent, test, architecture and all six requested verification-template owners. Relevant runtime/fixture/architecture bytes also have no diff from the prior inspected `0c981c7b18eabd11b021d8ddbaccd506a5e1a666`. Historical observations are not current leases.

## Existing mechanisms and limitations

- **R1:** `src/raft/raft-rs-runtime-owner.js:961-987` synchronously owns one queue turn; `:1691-1724` recursively drains inbound, including arrivals during Ready awaits; `:1727-1742` drains before the selected command. `:1945-1982` returns `CORE_OK/inbound-enqueued` after queueing, not after core processing. This is the prospective W07 failure mechanism.
- **R2:** `:349-354` actualCoreEntryObserver reports sequence, operation, groupId and runtimeGeneration, **not replica or message**. `:133-137` inbound observer reports replica, stage and queue count, **not message identity**. `:358` existing coreFaultInjector receives actual arguments immediately before real core call. A passive arm can correlate full message/unique proposal bytes with the preceding core-entry sequence; only the explicit one-shot trap arm may throw. No observer may drive progress or assert inside the callback.
- **R3:** `src/raft/raft-rs-peer-delivery.js:88-127` passes actual native-produced messages to sendToPeer and awaits a returned Promise. `:74-85` distinguishes noHandler/deferRetry/failure. The sendFor deferred Promise is an existing faithful host-await seam; its resolution is transport completion, not commit/application.
- **R4:** `test/raft/raft-rs-backend/partition-node-cluster.js:89-109,147-194,206-230` supplies real native ports, real SQLite WAL/FULL and injected clocks/sendFor. `sendFor` returning undefined falls through to queue, so a captured/delayed send must return its Promise or an explicitly owned non-undefined transport answer to prevent accidental duplicate delivery. Constructor overwrites the global core observer. Generic applyFor is test-owned, not production release application.
- **R5:** `src/raft/raft-rs-inbound-timer-custody.js:6-27` owns exact-clock wake; runtime `:1757-1824` schedules it. `src/time/time-source.js:150-182` advance(0) drives due owned callbacks and can also fire newly armed same-instant callbacks; it is not itself an inert wait. Idle tick scheduling is at operation-port `:338-345`. Accepted inbound intentionally owns a referenced wake (timer-custody header); do not change it.
- **R6:** runtime `:394-407` fences stale generation; `:721-803` replaces the actual shared core and restores registered groups; `:690-715` defers resumption behind occupied queues; `:626-661` reoffers consumed inbound wake debt. `runScheduledInboundDrain:1805-1810` alone does NOT reconstruct an unhealthy runtime. Use the prestarted trigger group's owned tick, not a status reader, to initiate replacement.
- **R7:** `test/raft/raft-rs-backend/runtime-turn-integrity.test.js:151-162,253-278` provides the real removed-C response followed by B's native forwarded proposal. `src/raft/raft-rs-peer-delivery.js:42-58` records per-sender core refusal. Its frozen CA1/M9 meaning (:1-16) must remain: a refused envelope is not the queued command's answer and already-pending valid tail is not lost. The new test must not claim permission to truncate arbitrary preexisting batches.
- **R8:** `test/raft/raft-rs-backend/operation-port-ready-recovery.test.js:272-330` is an existing real deferred-Ready/generation witness, but it manually ticks/reads status; reuse mechanism, not those measurement drivers. `inbound-drain-owned-timer.test.js:218-310` demonstrates exact wake/replacement seams. These unchanged files are not requested for rerun.
- **R9:** `test/shards/impact-contracts.json:599-664,1540-1614` names the existing runtime/application interaction. Register the new test and any test-only fixture in the affected existing contracts; do not create a production scheduler authority.

## Selected finite schedule

The parent's selected schedule is acceptable and slightly larger than the minimum counterexample. Use its frozen **four post-cut arrivals** (`h1..h4`) plus `h0`. Two post-cut arrivals would already exceed a one-envelope allowance; four provide additional preservation pressure without becoming an open-ended load test.

1. **Setup only:** form actual RF3, establish A leader/B follower and a committed setup write at every replica. Capture a real A->B MsgHeartbeat emitted by native core during setup ticks. Quiesce residual fixture/native input before measuring. Freeze peer IDs, target address, term, runtime generation, exact envelope bytes/hash and selected proposal marker. All h0..h4 are duplicate *deliveries* of those exact native-produced bytes; do not claim five independently produced messages. Give each delivery a separate test observation ordinal.
2. B.step(h0) must return `CORE_OK/inbound-enqueued`; advance only B's injected owned clock by zero until the owned inbound drain reaches its actual heartbeat-response sendFor Promise. Assert the correct from/to/type and that the reply gate is held. **That gate is the start cut.** h0 is excluded from post-cut counts.
3. While h0's response is held, request one uniquely tagged existing `B.propose(marker)` and accept h1. Confirm no matching marker native propose entry yet. Release only h0's actual response gate. When h1 reaches its real reply gate, accept h2, then release h1; continue identically through h4. Advance B's owned clock by zero as needed, with declared finite fixture guard. No status/readStatus, settle, deliverAll, direct native step, or manual tick after the start cut.
4. **Frozen service assertion:** the matching marker native `propose` entry must occur after **at most one** post-cut heartbeat core step (`postCutStepsBeforeMarker <= 1`). This is the selected finite service expectation for this one-at-a-time recurring-arrival schedule. It is not a wall-time bound, proof of infinite-arrival fairness, a general batch-size implementation rule, or a claim that today's runtime already promises this contract.
5. Record the service result without throwing early. Finish the fixed stream and release every known send gate. Assert exactly five accepted heartbeat delivery occurrences, five matched native step attempts and five corresponding real heartbeat-response sends, identical envelope bytes, no extra selected marker proposal, and proper typed proposal result. Keep an occurrence ordinal as well as hash because duplicate bytes share one hash. Then emit raw trace and assert the frozen service bound. If it fails after all preconditions/preservation controls, it is a semantic service RED. Missing heartbeat/gate, unknown symbol, setup failure or stalled fixture cleanup is not that RED.

Counting the marker's *core invocation* proves service of an existing operation. On a follower it may forward to A; it does not prove its committed application, release authority, transaction outcome or deadline enforcement. The test must name that claim precisely.

## Required paired controls

- **Quiet input:** same RF3/setup/h0 reply cut and selected marker, zero later heartbeat arrivals. Release h0 and use only B's owned clock. Marker native entry and typed result must complete; same gates/identity checks. It rules out a fixture that prevents every command from running.
- **Per-message refusal:** use R7's actual C removal and actual saved C acknowledgement, then B's real forwarded proposal and A's ordinary proposal. Measure without status/manual tick; use actual core entry/argument records and native outbound append evidence. Only after all measured inputs are consumed, read refusal status and assert its sender/type/core phase/count, while A's own proposal answer is not the refused envelope's outcome. No fabricated CORE_OK or injected peer-not-found is needed. This keeps the older paired invariant visible.
- **Generation:** precreate RF3 plus an RF1 trigger and install global observers only afterward. Before measurement start the trigger's existing owned tick timer. B.step(h0); call B.propose(marker), allowing *that call's inbound prelude* to suspend in h0's response before marker reaches core. Accept h1. One-shot trap only the trigger's actual native tick through existing coreFaultInjector; the next owned trigger tick enters ensureExecution/replaces actual shared runtime. Observe create_node/new generation, then release old h0 reply. Assert old marker Promise returns `HOST_FAILURE/runtime-generation-changed` and never enters native propose. Only afterward advance B's owned clock, and assert retained h1 reaches actual current-generation step/reply. No manual status/tick is necessary. Prove both replacement occurred and old continuation was actually pending; absence of marker alone is vacuous.
- Prefer controls before the deliberately failing service subtest so a bail policy cannot hide them. Run the complete new file once through the locked lab after exact-content independent review. Preserve first raw result; do not invert the expected RED into an artificial PASS.

## All reachable design risks / findings

1. **Service defect hypothesis (R1):** current recursive drain should consume all four later heartbeats before the marker. This is source-predicted, not yet an execution finding. Test-only scope may preserve this RED; it does not authorize repair or claim a sealed Quest is solved.
2. **Identity hole (R2):** core observer alone cannot identify replica/command, inbound observer alone cannot identify packet. Correlate passive argument capture, exact marker bytes, message.to, group and generation. Do not use global raw counts as target-specific proof.
3. **Observer ownership (R4):** constructing the trigger after installing observers silently replaces the global observer. Install once after construction, reset in finally; no concurrent cases in the same process that share these seams.
4. **Driver contamination (R4/R5/R8):** settle/deliverAll/readStatus/manual ticks can supply the missing progress. Guard their measured use in the test design; setup is separate. advance(0) may execute several due owned callbacks, so report actual callback/core ordering rather than assume one advance equals one turn.
5. **Gate leakage (R3/R4):** returning undefined after capture enqueues the same packet; returning success before owning delivery fabricates completion. Hold exactly named Promise, retain native packet; release all gates on every exit before close. If future scheduling bypasses a gate or changes reply count, fail with observed trace, not an unbounded wait.
6. **ACK/preservation overclaim (R1/R3):** enqueue acceptance and native entry attempt are distinct from successful processing. Real matching heartbeat response supports processing for these messages; refusal control checks actual per-sender outcome. Do not treat arbitrary core invocation as application success.
7. **Stale false positive (R6):** no marker call is insufficient without actual old Ready await and actual runtime generation change. Capture those cuts, old typed failure and later retained h1 service together. Trigger tick trap is an injected actual binding failure, not malicious peer input or process-crash proof.
8. **Existing contract compatibility (R7):** preserve CA1/M9 and refusal classification. The selected one-post-cut bound cannot silently weaken the older requirement for already-pending valid tail. This test measures recurring arrivals; any later scheduler implementation needs a separate explicit owner decision and full interaction review.
9. **Finite-evidence limit:** four arrivals show a concrete finite service violation or success at that bound, not unbounded starvation, arbitrary quorum/churn fairness, memory plateau, deadline cancellation or cross-host behavior. No production timer value changes.
10. **Cleanup attribution:** snapshots of measured observations must be fixed before teardown adds close/free native entries. If cleanup fails, preserve both semantic evidence and cleanup failure; do not overwrite the first result or remove retained evidence. Current fixture dispose catches some close failures, so explicitly settle owned fixture promises before invoking it.

## Category-complete checklist (36 items)

Each item is a source-backed design obligation; no row claims an executed pass.

| Category / item | Evidence, required assertion or honest limit |
| --- | --- |
| Harness 1 correct RED | R1 + selected step 5: bound fails only after actual gate/queued operation/accepted-core-response counts engage. Unsupported setup is non-proof. |
| Harness 2 seam fidelity | R3/R4: delay actual native reply, not mocked core or fake release success. Refusal comes from R7 real membership change. |
| Harness 3 time ordering | R5: current injected clocks, no altered timing constants; finite message ordering is oracle, clock budget is only fixture guard. |
| Harness 4 fields | Freeze group, replica/peer from/to, term, envelope bytes/hash, delivery ordinal, marker bytes, runtime generation and observer sequence. R2/R4. |
| Harness 5 non-vacuity | RF3 formed/setup applied; five real replies; marker pending at cut; quiet control; real trap/new generation and retained h1. R4/R6/R7. |
| Harness 6 native binding | R4 invokes real operation ports/store/WASM. Generic application callback does not certify production release/TX protocol; no live run yet. |
| Concurrency 1 sync gate | R1: hold actual turn then queue marker; source installs tail synchronously. No new claim/CAS implemented by fixture. |
| Concurrency 2 after await | R6 old reply resumes only after observed replacement; no old-generation core entry; later current-generation h1 succeeds. |
| Concurrency 3 one winner | One marker/native invocation in selected replica; callbacks only record/resolve observation signals. No test-owned scheduler chooses a production winner. R1/R2. |
| Concurrency 4 reentry | R5 owned clock callbacks share existing runtime queue; observer callbacks never call step/tick/status. No nested progress from instrumentation. |
| Concurrency 5 key | Correlate group + message.to/marker + runtime generation; global observer counters alone are insufficient. R2. |
| Recovery 1 no stale clobber | R6 preserves h1 across replacement; record old/new generation and exact bytes. No fixture writes/rebuilds runtime state. |
| Recovery 2 restart vs live | Actual shared-WASM replacement, not process crash or same-file cold restart. R6/R8. Explicitly no cold-loss claim. |
| Recovery 3 lost enrollment | Five accepted occurrence IDs must be accounted; missing callback/map entry cannot mean processed/discarded. Generation control retains exact h1. R1/R2. |
| Recovery 4 atomic replay | This packet has no new durable release/apply effect; test marker is only serviced. Setup applied write proves real cluster. Full atomic release replay is unengaged, remains HOLD. R4. |
| Recovery 5 absence proof | Old marker absence paired with old typed failure + actual trap/replacement; h1 positively enters new core. No missing-log-as-complete inference. R6. |
| Transport 1 ACK vs processed | R1 enqueue ACK, R2 core attempt, R3 native reply and R7 refusal are separately asserted. |
| Transport 2 late reply | Release old held h0 response after replacement; must not enter stale core or destroy h1's only wake. R6. |
| Transport 3 classes | Preserve native CORE_OK/CORE_REFUSED/HOST_FAILURE with phase/reason; real removed-C refusal cannot become marker answer. R3/R7. |
| Transport 4 bounded unavailable | Finite deliberately held host Promise is always released/owned by fixture; no claim that this tests production missing-handler deadline. No new transport timeout. R3. |
| Transport 5 stub honesty | Native-envelope queue/sendFor at declared port seam, no canonical message-router success substituted. Same-host transport only. R4. |
| Timer 1 injected clock | R5 exact existing VirtualTimeSource; accepted wake remains referenced per owner; idle trigger tick remains existing unref timer. |
| Timer 2 role fence | Real A/B roles measured in setup; current generation is execution authority, not cached setup role. No sweep creates transaction decisions. R6. |
| Timer 3 crash equivalent | Shared runtime replacement preserves host queues; it is not process loss. Do not clear queues/maps to simulate restart. R6. |
| Timer 4 legitimate hold | Deferred reply is finite and explicitly released; no expiry erases accepted envelope. No legal obligation timeout change. R3/R5. |
| Timer 5 self-starvation | Main service test drives only owned clock after cut, so a diagnostic reader cannot rescue queue starvation. R1/R5/R8. |
| Owner 1 sole decision | Runtime decides core service/order/refusal; fixture only delivers/suspends/observes. No release decision exists in this packet. R1-R3. |
| Owner 2 typed seam | Existing operation port, sendToPeer, typed results and passive observers only. No production hook added. R2-R4. |
| Owner 3 paired invariant | Service bound and all five accepted/replied preservation checks in same pressure trace; R7 refusal control preserves neighboring invariant. |
| Owner 4 stale then fresh | Generation control proves stale old continuation rejected and fresh retained h1 serviced through same owner. R6. |
| Owner 5 pressure | Four post-cut accepted messages, no forced bypass, bounded gates. No pressure/backoff/memory-proof extrapolation. R1/R3. |
| Owner 6 wake | Exact B-owned inbound clock and post-replacement resumption; no reader/manual tick rescue. R5/R6. |
| Owner 7 projection | Counts/hash/sequence are evidence, never production authority; actual core reply and typed result substantiate claims. R2/R3. |
| Owner 8 negative fidelity | Current-production finite RED proposed; no source mutant yet. Later treatment must keep identical schedule/assertions and exact hashes; quiet input is a control, not a replacement pass criterion. |
| Owner 9 no bypass | No direct core step, row deletion, fake quorum, accepted-command overwrite, private runtime write or alternate harness. R4/R7 existing test seams only. |
| Owner 10 registry/proof | R9 new primary-classified file and affected existing pair descriptions must reflect test-only service evidence. Final exact test review then one locked execution; no old-file reruns. |

## Source binding

Hash inventory below binds this design vet. It is not approval of test bytes that do not yet exist. The user-authorized test-only scope takes precedence over any general fixture rule that would otherwise require fixing a discovered production defect: preserve the RED and stop at review; do not silently expand into runtime repair.

```text
cd7a732087a504ab418ea482973b451c657ea39486695ed487e4de09fe0ebcb7  AGENTS.md
e4183d409853f18cf2a3563a5aef295386084706e5593897c536c69c3298ed51  docs/steering/rules.md
58ff909b679551a717302e5132ff5598b3a1fab6286dc386cd5f1a76bda474f6  docs/steering/router.md
8c04752384e03bcb1c9b20520751da63ed1fc93b6148900208c319fdc0b263ad  docs/development/quest-subagents.md
6b44dcfa5d6d9a88d15a93af181e9528ad9976e6a50574a6fe83496a5312af5b  docs/development/verification-templates/harness-fidelity.md
afa4fc20b8d6c8174ae35d6a5b464251ae91d4f61fcbc52264ed9ff900ebc6f0  docs/development/verification-templates/concurrency-serialization.md
ad5413237fa46f2e7a71f6d6bc231d871d845ea09b7dec210712eb5ce6ac83e9  docs/development/verification-templates/recovery-replay.md
79a8d0aa5bd9f13d04aa8887479492b0ccbf934f07afd005d556fc2b88e12b81  docs/development/verification-templates/transport-delivery.md
eaeb8837e81a601b35d7c9212fd3d3bdcd6ca41af562e077870fa9049269fc67  docs/development/verification-templates/sweep-timer.md
fac2a0850f459e57f802d8355b7d6013e61165d186c62aad166b7847acff185d  docs/development/verification-templates/owner-interaction.md
0fe213d96ec992dc696136e7f17c315f740fe82afccd6588bc9bf1ec62f8ee6b  architecture/runtime-contracts.md
128538d75429c1d31b9cb7aa245eef9392ef14f7ee948c925086582a972a1ae5  architecture/contracts/authority-and-recovery.md
008615a2ee24d0654efcd3b96915034de2a6c69386ad95a72a5f886699f3c73c  test/guidelines/fixtures.md
e43e7198ae48209899f23d21d93273ed24fd30250e69fd51d154cfa44377cf6f  test/guidelines/harness.md
a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b  src/raft/raft-rs-runtime-owner.js
ab3b0a3c27b1568ab644d458ebcf078f47d8da98255d41317bdc766923ff0597  src/raft/raft-rs-operation-port.js
cd047d4be28802188892b8bf31d1e8b14d5039524dd4349a8195104ef8d5e9a5  src/raft/raft-rs-peer-delivery.js
dec12a4e6aa2047425ec668384d594eccf613bcf0bccdc9eb908cd26313634f9  src/raft/raft-rs-inbound-timer-custody.js
c4bf713ffca20541e11f079eeacf6cb51892ef722c0993a6277c7edd4ca48311  src/time/time-source.js
dca9b5eaaa23d192909608b8d05a5f3c1b8effe2386d5e6050745e6d393d871c  test/raft/raft-rs-backend/partition-node-cluster.js
398eca66728c0e50c240af08287fe76548692e7566768e534ff3a1011978304b  test/raft/raft-rs-backend/runtime-turn-integrity.test.js
edd3a9d1d5a1c24a4383c0ecd089babedea65715658668c95313966730f2a22f  test/raft/raft-rs-backend/operation-port-ready-recovery.test.js
82e2704c3562d90cff3ffbc2fd39970078312302ffcb62529cbd14d3afaf7fa3  test/raft/raft-rs-backend/inbound-drain-owned-timer.test.js
8451c83f8bef30feb8b26312b0e45ee2f181927de3373a5d0d962e8629788137  test/shards/impact-contracts.json
```

All inventory bytes matched pinned HEAD at review freeze. No native or unit execution performed.
