# W07 companion independent pre-run review — round 1

Verdict: REVISE one evidence-capture detail (R1), then rebind approval to the revised exact bytes. The four schedules and existing-owner composition are otherwise suitable for the first locked native baseline run. This is source review only: I ran no test, native code, mutant, lab job, or source/static-check command.

Reviewer: subagent:/root/native_witness_verifier. Date: 2026-10-15.
Worktree: /mnt/data/peter/projects/.worktrees/runtime-captured-inbound-correction-20261015
Observed HEAD: a7e821154f1039df82bfc73ef4f2e25e4fa0468d
Observed branch: review/runtime-captured-inbound-correction-20261015
Production src diff against that HEAD: empty. The parent owns the staged Quest, test and impact-registry work; I only read it and write this review outside the worktree.

## Exact reviewed identities

SHA256:
- test/raft/raft-rs-backend/runtime-captured-inbound-boundary-native.test.js: eca6ab04ea1c6bc0252e912e782addcf4ba3a89e5f7f69fc72774318942ce8d5
- test/raft/raft-rs-backend/runtime-captured-inbound-companion-fixture.js: 50133ac6d95d9c8279c5a68fd16abea16f13c1f64673ebdd1ef1b9a3314f3da0
- solve/quests/runtime-captured-inbound-extent/evidence/COMPANION-WITNESS-PLAN.md: 24dbc016574008e1e618bfa9a723b45190465242094bb2c0dd1d64407125e4f2
- test/shards/impact-contracts.json: 990de129808dba6556f7cccf428136c2b555725c961852bac49a64b9b4e8e1cd
- solve/quests/runtime-captured-inbound-extent/DESIGN.md: 1a122e71d184efba30e857d61a1ad0b23f5c06a4c2a85da5aeaf032d1675232f

Frozen original W07: test/raft/raft-rs-backend/runtime-captured-inbound-service-native.test.js
- SHA256: 07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d
- Git blob, independently read: debc16f442ba63b100332d93b285865d36d1c376
This is a blob identity, not a commit.

Source/fixture anchors and SHA256:
- R = src/raft/raft-rs-runtime-owner.js: a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b
- P = src/raft/raft-rs-operation-port.js: ab3b0a3c27b1568ab644d458ebcf078f47d8da98255d41317bdc766923ff0597
- L = src/raft/raft-rs-replica-lifecycle-owner.js: 692ff3dd28f0ae4fe7f70b1128361df494437b3a8939d83bba5471cd5e5bfe01
- A = src/raft/raft-rs-persistence-admission.js: 55c3d7b5bb1eeb2a35f9fb6c11e6b54506ef00e18374f5a52cd4e9d11b83e931
- D = src/raft/raft-rs-peer-delivery.js: cd047d4be28802188892b8bf31d1e8b14d5039524dd4349a8195104ef8d5e9a5
- F = test/raft/raft-rs-backend/partition-node-cluster.js: dca9b5eaaa23d192909608b8d05a5f3c1b8effe2386d5e6050745e6d393d871c

In the itemized census below T means the reviewed boundary-native test, H the reviewed companion fixture, and Plan the reviewed COMPANION-WITNESS-PLAN.md. These abbreviations name the complete paths above. Line references bind to the hashes in this round.

## Findings and classification

R1 — required before the intended pre-ensure negative is interpreted.
T:180 discards the exact selected outcome by extracting only outcome in the assertion. The actual replay-count and commit/applied checks at T:182-183 follow that assertion. A capture-before-ensure treatment may correctly make the restored follower propose before the captured heartbeat restores leader contact, producing a real native refusal instead of reaching the later ordering assertion. Current raw diagnostics would not retain that outcome's reason/phase or the completed recovery marker/positions before the failure. Retain the full result, actual durableProgress and marker count immediately after awaiting it; validate completed marker replay and commit/applied equality before checking selected success. This is evidence fidelity, not a new scheduling driver or changed success criterion. A setup/import/seam guard failure remains a non-proof.

F2 — queued-capture microtask ordering is valid for the exact present fixture, not a blocker.
T:60 fires the existing timer while the predecessor is still held. R:1820-1821 enqueues DRAIN behind the selected runtime token, via R:963-967. The token already has the port containment/lifecycle Promise observers (P:138-146, L:254-255), and the test awaits the returned outer Promise. DRAIN's queued callback therefore runs before that outer await resumes. Unheld sends are synchronous and return undefined through H:78, F:165-173, D:109-116; no selected/heartbeat output is held in this case. Consequently the DRAIN can complete preserved heartbeat steps/replies before T:64 even when the selected command's incorrect capture omitted some inputs. The direct ordering assertion at T:67-70 is reachable. This reasoning is not a claim about arbitrary asynchronous transports.

F3 — the new pre-dequeue trap is justified, with a precise scope.
T:194-233 adds a witness not present in the initial three-schedule proposal. It injects an explicit native-operation trap at the final status announcement after h1's Ready. R:1205-1207 currently ignores announcement failure, while R:1700 removes h2 before R:1709 reaches the current-execution guard. The initial failure is an unhealthy-runtime boundary; the numeric generation is replaced only during the explicitly marked later tick. The test does not claim replacement happened before dequeue or that recovery was autonomous. It is a useful exact preservation counterexample and does not authorize a separate announcement-error protocol repair.

F4 — measured cleanup is now appropriate; remaining setup limits are explicit.
H:181-209 freezes the measured diagnostic before releasing gates or the optional SQL wait. It observes all enrolled invocation/send settlements, catches release/dispose failures, clears instrumentation, retains storage on unsettled cleanup and preserves a primary body failure. Cleanup cannot satisfy an already-failed measured assertion. Two setup-only limitations remain: F:89-109 can fail during a partially constructed cluster before the caller obtains it; H:104-107 can let a dispose failure replace a formation/setup error. Such failures are fixture/environment failures, never semantic RED or approval evidence. I do not request a new generic fixture/recovery implementation here.

F5 — native endpoints are deliberately bounded.
H:144-178 proves admitted occurrence count, native argument hashes and genuine generated heartbeat replies; it does not prove remote processing of those replies. T:166-191 additionally binds one replayed committed marker to the actual store's commit/applied positions and fixture afterCommit effect. The ordinary selected-command endpoint in the other cases is native propose entry, not durable proposal commitment/application. No release transition, transaction protocol, capacity policy, snapshot path or physical multi-host behavior is modeled or certified.

F6 — registry is aligned with the proposed test unit.
The staged impact diff adds the companion to the existing runtime-lifecycle-entry and runtime-application-transaction test sets (test/shards/impact-contracts.json:597,666), and appends the finite admitted-capture requirement to the existing lifecycle-entry description (:563). It adds no new semantic owner, pair, transport, command or production path. The source implementation and future classified receipt are still outstanding. Generated metadata/static receipts are parent-owned and are not a substitute for native evidence.

## Four schedule audits

1. Queued capture, T:31-71.
A formed real RF3 follower B starts a genuine forwarded predecessor, whose real send Promise is held. The selected operation is enqueued before two complete copies of a native A-to-B heartbeat are accepted. The production inbound wake is dispatched once and queues behind selected. Both inputs/replies, selected success and exact proposal invocation count are checked before ordering. There is no measured readStatus, tick, settle or deliverAll. The extent must include both preaccepted occurrences; a cap of one is not the contract. See F2 for Promise ordering.

2. Consumed wake, T:73-103.
Only h1 exists at the selected turn's intended capture. Its real Ready send is held, then h2 is accepted, and the actual owned wake is fired while Ready waits. Callback and turn-request counts are exactly one, with only h1 entered. After the final real send release, there is no further external progress event. The required h1 -> selected -> h2 order is paired with both native replies. This tests an existing queued service continuation, not a need for unconditional rearm. The unchanged live-tail predecessor is expected to fail selected-before-h2, not lose h2.

3. Pre-dequeue guard, T:194-233.
Both native inputs were accepted before selected. The explicit fault engages only after the first real step/reply and at final announce. The exact HOST_FAILURE/generation-changed and absence of selected native entry are required before the separately marked recovery driver. A real new-generation replay must retain h2 once and must not retry selected. Numeric generation and byte equality prevent treating one old step as two preserved occurrences. Baseline loss at R:1700 is the intended semantic RED; a trap/setup guard failure is not.

4. ensureExecution completion, T:120-192,244-254.
The committed marker originates at actual A and is committed using actual A/C message processing while B is withheld. B receives real queued envelopes individually until its one-shot application callback throws before afterCommit exposure. Actual commit exceeds actual applied, and marker exposure is zero. Selected B reconstruction identifies create_node with B's real peer ID. A real SQLite BEGIN is introduced only at the existing persist_ready fault seam after the store persisted the Ready (R:1217-1232; R:1136-1148). It holds the actual persistence-admission path. A native heartbeat is accepted while that wait is outstanding; ROLLBACK and the existing poll interval release it. The marker must replay once and the heartbeat must precede actual selected proposal/forwarding. Missing reconstructable Ready is a seam failure. R1 ensures negative provenance survives the expected native refusal.

## Category-complete census (43 items)

These are pre-run source findings. 'Covered schedule' means a concrete reachable assertion/mechanism is present, not that it has passed. 'Unengaged' states the exact boundary rather than inventing proof.

### Harness fidelity (6)

H1. Correct RED: T:67-70 (wrong extent/capture order), T:101-102 (live-tail extension), T:226-227 (pre-dequeue loss), T:180-187 (pre-ensure capture, R1) and Plan:33-43,69-71 name behavioral endpoints. No execution yet; import/setup/guard failures at H:35-40,50-70 or T:144 are non-proofs.
H2. Seam fidelity: F:147-194 supplies actual operation ports, SQLite, Ready sends and afterCommit effects. H:73-87 defers/forwards exact real output. T:153-158 and T:202-206 explicitly inject failure, never authoritative success. No router success stub replaces the tested owner.
H3. Time fidelity: H:93-102 uses per-replica VirtualTimeSource; T:60,84 dispatch existing zero-time wake; T:161 dispatches the existing PERSISTENCE_ADMISSION_WAIT poll interval. No production period/budget is shortened; 12 setup rounds/256 passive microtasks are engagement guards, not service deadlines.
H4. Field fidelity: H:62-68 captures an actual native envelope; H:144-151 records full-envelope hash and exact admission outcome; H:121-127 records native argument hash/proposal bytes. T:108-111 reads actual owner SQL. No synthetic native message, participant row or successful result.
H5. Nonvacuity: actual RF3 formation and applied setup at H:50-59; real held predecessor at T:33-38; exact positive steps/replies/admissions at H:171-178; actual fault engagement at T:213 and real SQL transaction at T:173. Marker absence alone is never the positive oracle; T:182-183 requires replay/position after R1.
H6. Live binding: actual native operation sequence/generation originates at R:342-359 and is coupled to native output through H:73-87. These are native fixture observations, not application/live-cluster certification. First locked execution and later exact source treatments remain required; no result is claimed here.

### Concurrency / serialization (5)

C1. Synchronous gate and backstop: R:961-987 owns the FIFO before any await; L:240-255 owns lifecycle operation counting. T:31-39 proves selected is queued while predecessor is suspended; T:85-89 proves the timer requests another turn instead of entering it.
C2. After-await freshness: R:1736-1742 captures only after ensureExecution; proposed finite extent must share that point. T:166-191 specifically suspends that boundary. T:194-233 checks the canonical current-execution condition before destructive dequeue; R:394-407 remains the native backstop.
C3. Single winner: no durable work-claim CAS is introduced or needed by this queue contract. Both ordinary and scheduled operations enter R:961 via P:293,299-318 / R:1820. Exact selected native count one and no retry after failed generation at T:66,97,184,220,231 cover bounded duplicate-entry risk; no arbitrary concurrent dispatch certification.
C4. Timer reentry: T:84-89 fires the owned wake during the held Ready; it records callback and turn-request without a second native step. The no-rescue suffix then relies on the existing queue continuation. No observer calls a port or advances a clock.
C5. Scope/key: R's existing group key identifies partition plus peer; test separates A/B/C operation ports, filters B inbound stages and B-destined heartbeats (H:119,131-134,160-168), and uses unique partitionId per case. No transport-wide mutex or multi-partition fairness claim.

### Recovery / replay (5)

R1. Live state not clobbered: R:583-590 preserves inbound while invalidating handles; R:877-906 reconstructs the failed group; T:194-233 requires accepted h2 remain available after shared failure. This does not prove every unrelated cache or registry reconstruction seam.
R2. Restart versus live: actual application host failure is distinguished from the explicit core trap (T:136-141 versus 205-215; R:920-932). The former reconstructs from durable state; the latter changes runtime generation at the later recovery tick. No pretend fresh-start empty state.
R3. Lost enrollment is not empty: transaction enrollment is unengaged. The analogous accepted-input obligation is explicit: H:149-150 requires inbound-enqueued, H:176-177 counts admissions, T:218-219 preserves both accepted occurrences even when one has not stepped. No missing callback is taken as an empty queue proof.
R4. Replay idempotence: real failing apply occurs before fixture afterCommit (F:187-193). T:140-141 requires commit>applied and no exposed marker; T:182-183 requires exactly one marker and aligned positions after recovery. This is application transaction recovery, not request-result dedup or TX1 settlement proof.
R5. Absence proves nothing: observed zero selected entries is paired with exact positive ingress, failure cause and later native step/reply evidence (T:213-232); zero initial marker is paired with actual committed watermark and later replay. No absent row/event is called noncommit. R1 is needed to retain this positive recovery evidence in the early-capture negative.

### Transport / delivery (5)

T1. ACK versus processing: H:149-150 identifies local custody acknowledgement only. Actual native argument entry and genuine heartbeat output are separate at H:171-178. Reply generation/fixture queuing does not establish remote processing.
T2. Late responses: held send settlement resumes actual Ready through D:109-114, R:1147. T:73-103 exercises late completion without losing queued service. There is no SERVICE_RESPONSE waiter-retirement/retry cancellation in these tests; that policy is unengaged.
T3. Classification: no response shape/classifier is changed. H forwards undefined or a real pending Promise via F:165-173; exact HOST_FAILURE/phase is checked at T:214-215. Before-ensure refusal classification needs R1's full outcome evidence. Frozen W07 remains the independent actual per-message refusal control.
T4. Undeliverable bound: intentionally held sends always get release or cleanup release (H:184). Missing handler/disconnected transport is not simulated; no proof of production transport timeout is claimed. Existing persistence poll bounds remain A:41-67, not a test-created deadline.
T5. Faithful stub: the fixture's in-memory transport is explicit; it queues original actual native packets, delaying only real completion through sendFor. No fabricated router ACK/noHandler contract is introduced. This proves native runtime/service ordering on one host, not networking delivery semantics.

### Sweep / timer (5)

S1. Injected clock: H:93-102 and T:60,84,161 drive actual owned clocks with unchanged intervals. The template's generic unref guidance does not override the existing referenced timer needed to retain accepted inbound/Ready custody (A:55-61); no timer implementation is changed.
S2. Role/authority: A's real leader heartbeat and B's real follower forwarding come from formation/capture (H:50-70; T:33-38,189-191). No artificial role flip, global transaction decision or timer-owned authority is added.
S3. Crash equivalence: T:194-233 uses the actual runtime failure/replacement path and a newer actual generation, not manual clearing. T:120-192 reopens a native group from its durable record; no test edits application/log rows. Broader caches/snapshot installation are unengaged.
S4. Legitimate obligations cannot expire: the SQL hold is released via normal admission well below the existing 120000ms budget and uses its 10ms poll. Passive observation guards do not delete accepted work. Timeout/exhaustion production behavior is not claimed covered.
S5. Self-starvation: T:73-103 demonstrates that the already-fired wake owns a FIFO continuation despite the selected turn waiting in Ready. It needs no readStatus/extra input rescue. Infinite inbound pressure, total memory growth and arbitrary repeated failures remain outside this finite witness; frozen W07 supplies its separate four-arrival service bound.

### Owner interaction (10)

O1. Sole semantic owner: R owns when a group turn captures and consumes inbound. P/L supply lifecycle admission; A supplies persistence admission; native core supplies protocol reactions. H/T only observe or introduce explicitly named faults. Plan:16-29 introduces no equivalent decision authority.
O2. Typed crossing: operation requests/results use P:299-320,372-400 and existing CORE_OK/HOST_FAILURE/RUNTIME_PHASE values; accepted envelope custody uses R:1945-1982. SQLite BEGIN is a host condition observed by A, not a counterfeit admission answer.
O3. Paired invariant: T:51-71 binds complete preaccepted-tail preservation with selected service; T:73-103 binds finite selected service with later remainder preservation in the same schedule. T:194-233 binds stale-turn refusal with current-generation retention. Treatments and native execution remain outstanding.
O4. Stale then fresh: T:213-232 first records failed-runtime refusal, then explicitly invokes canonical replacement and requires h2 in a newer generation without retrying selected. T:166-191 releases actual persistence admission before service. No cached failure permanently vetoes newly admissible work.
O5. Pressure/backoff: queued selected work does not bypass its predecessor, the lifecycle owner, the real Ready wait or the existing persistence poll (T:33-38,80-89,172-180). No force flag or extra work driver. Broader failure-window/backpressure tests remain required by impact selection.
O6. Wake/release path: held send completion resumes current Ready; fired inbound timer transfers to R:1820's queued DRAIN (T:84-95); real host ROLLBACK permits A's existing poll (T:178). This tests existing service owners and does not justify a new scheduler or unconditional rearm.
O7. Projection versus authority: observer events and SHA256s in H:113-178 are assertions only; they do not trigger progress. The only active callbacks are clearly labeled faults in T:150-158,197-206. Durable reads are actual SQLite owner queries, not cached substitutes.
O8. Treatment fidelity: Plan:69-71 and DESIGN:31-35 require source fingerprints and unchanged tests. The old-source, early-capture and one-envelope treatments are not yet run. R1 prevents a real refusal from being misidentified from insufficient preserved data; setup/missing-symbol failure never counts.
O9. No escape hatch: measured bodies contain no readStatus/settle/deliverAll, direct queue edit, fabricated rows or authoritative success. T:224 is explicitly a separate recovery driver, not the no-rescue witness. H:43-70 uses setup-only drivers; H:181 onward cleanup is outside evidence.
O10. Contract/registry/proof: existing registry entries at impact-contracts.json:562-598,600-667 cover runtime, lifecycle, application and the new primary test. The description states target semantics, not an existing implementation claim; Quest DESIGN:9-11 and Plan:33-43 match it. Parent still must seal exact checkpoint/classification and first native outputs.

### Admission / gating (7)

A1. Shared enforcement state: R:1731 prechecks actual A:persistenceAdmission; R:1136-1148 then rechecks before applying taken Ready. T:147-180 introduces the same real connection hold. No independent test-side boolean substitutes for store admission.
A2. Transient/terminal: T:138 checks actual application HOST_FAILURE; T:214-215 checks stale/runtime failure; no terminal reseed or close is treated as successful remainder service. Production refusal/reseed behavior remains owned by R/raft-rs-runtime-faults.js, not generalized by this witness.
A3. Existing budget: A:45,60-61 uses PERSISTENCE_ADMISSION_WAIT.BOUND_MS/POLL_INTERVAL_MS, unchanged. T:161 advances the existing poll interval once. The 256-microtask guard is a fixture engagement/settlement bound and cannot certify native deadline behavior.
A4. Reason fidelity: H:149-150 checks the exact native ingress reason; T:138,214-215 use actual existing phase shapes. No response coercion/new shape is added. R1 requires retaining the full actual selected refusal for the planned negative.
A5. Hold release: genuine send resolve (T:61,91) and actual SQL ROLLBACK plus poll (T:159-161,178) are the observables. T:94-102 requires remainder service after the last external event. Real-time performance/production RPC budget closure are unmeasured.
A6. Freshness: two acceptance-after-enqueue cases distinguish turn capture from caller enqueue; the reconstruction case distinguishes post-ensure capture from pre-await snapshot. Guarded remainder requires the current runtime health/generation before removal. No cached status read drives the measured interval.
A7. Identity honesty: each diagnostic names actual partitionId; admission stage names B replica; native step carries actual from/to, bytes and generation; create_node matches B's real peer ID (T:151). R1 must add exact selected result/canonical positions to avoid diagnosing from only its outcome enum.

## Boundary

After R1 and hash rebinding, this authorizes only a test/evidence checkpoint and its first normal locked whole-file baseline execution, not a green result or production implementation. Capture/guard source correction still requires its own exact review and same-test controlled negatives. Preserve the frozen W07, historical results and first new run. No source-reversion or bad-capture execution was performed by this verifier.

The complete release successor remains unsealed/unactivated, shared-control-wave HELD, Runner/TAP PARKED, PR #122 and bde70cec corrected model rejected. The narrow runtime Quest does not transfer release, transaction, snapshot or outcome authority and is not merge authorization.

