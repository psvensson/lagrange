# Independent verification — formation-barrier-spread-cure-final-landing

Verdict: **APPROVE**

Verifier: `verify_formation_cure`  
Immutable review: `review-32d16f187a678b485c0d58a8`  
Review file SHA-256: `ea338380fe9059522d07114c9ee20663e8d384ea05e48b6c585d1138751e4303`  
Base: `a7d26367cd92b139efeccd5f08d6e12f7644bfc1`  
Exact aggregate: `sha256:05349ef5a273aa5db46985412256591bbae57126985c8fde58ca0c5bf037a1de` (94,717 bytes, 24 paths)  
Exact predecessor runtime/model/test diff: `sha256:a3d8ad51dbb5a3f4e488c19e6740ebce20ea75bedd8521db5fb44f3bbc902f51` (90,080 bytes, 21 paths)  
Ordered path/content manifest: `sha256:33abd3a6f662fb046e728b3455202f26a1b6ce4d5ffe5e14a2e0916c079580e2`, computed as SHA-256 over each review-ordered `path NUL size NUL content-sha256 LF` record.

## Outcome

The candidate preserves the systemic owner interaction and closes the previous sole rejection. `assertReviewCurrent` passes against the immutable 24-path review. The 21 runtime/model/test paths exactly reproduce the previously reviewed `a3d8ad51...02f51` candidate, and the three additional paths are generator-owned test classification manifests whose current SHA-256 and sizes exactly match the review envelope.

Round 3 binds the post-hardening bootable source fingerprint `bbd70acf45475c8b`: fixed runs reached READY in 45,338 ms and 54,037 ms with zero barrier timeouts. Fixed run 2 logged the complete classification -> cadence -> own-authority -> coordinator persistence -> admission interaction, including six true authority evaluations and eight persistence confirmations, with no `local_mutation_unhealthy` refusal. The exact-revert pair reached READY in 53,842 ms and 53,961 ms; reverted run 2 nevertheless logged a real `local_mutation_unhealthy` priority ADD refusal at the intended token-stale admission tail.

The fresh reverted pair's lack of a new timeout is not an approval blocker. The sealed `hotpath-live-ab` constraint requires N=2 exact-final versus N=2 exact-revert, both fixed runs under 120 seconds, full engagement, and fail-honest recording of the reverted outcomes. It does not require either fresh reverted sample to cross 120 seconds. The report states that limitation plainly and retains the round-2 counterexample from the same exact revert, where the barrier failed at 122,175 ms. This supports a mechanism claim, not a distributional performance claim.

## Systemic owner and tail-consumer trace

- `startup-authority-placement-eligibility.js` owns formation-cohort classification for connected JOINING startup-authority targets.
- The priority-recovery planning gate owns cohort exclusion and in-flight serialization; only the spread-curing ADD bypasses target-in-flight self-blocking.
- Critical-topology/follow-up planning mints the narrow `priorityRecoveryOperationCreationRequired` capability after the owner decision.
- `unified-rebalancer-move-execution.js` explicitly constructs safety and operation requests and transports only a capability accepted by the authority owner; no move/context spread invokes or copies it.
- `control-plane-mutation-readiness.js` is the single semantic owner of the capability and uses the pre-bound own-data reader; provisioning admission consumes it only for a priority-control-plane operation under token-stale deferred readiness.
- Existing coordinator terminal and placement-visibility event consumers rearm the priority base cadence. The candidate adds no listener, timer, mutation store, or second recovery authority.
- CL-028 fresh readiness, CL-036 publication/recovery gating, operation serialization, remove safety, target/promotion/quorum floors, the 70-80-second non-priority branch, and the global 120-second barrier remain owned and unchanged.

## Required review templates

### admission-gating — completed

Precheck/enforcement share the same provisioning admission owner. Only an owner-minted own data value `true` can bridge token-stale deferred readiness. An absent marker, inherited marker, getter-backed marker, ordinary partition, and fresh-closed readiness all fail closed; fresh-open readiness retains the existing CL-028 recovery break-glass. Reasons remain canonical `LOCAL_MUTATION_UNHEALTHY`, and no budget is raised. Evidence: `priority-recovery-mutation-admission.json`, `control-plane-mutation-readiness.js:41-49`, `provisioning-admission-policy.js:237-260`, and the 25/25 guard assertions.

### adversarial-js-intrinsics — completed

The capability read delegates to `readOwnDataValue`, which uses module-load-bound `Object.getOwnPropertyDescriptor` and `Object.hasOwn`, accepts only a data descriptor, catches exotic/proxy failures, and never performs ordinary property access. Both move execution and admission call that owner. Focused tests prove inherited and accessor-backed authority neither propagates nor admits and that the getter read count remains zero. A fresh post-import hostile replacement of `Object.getOwnPropertyDescriptor` and `Object.hasOwn` also passed: own authority remained accepted while inherited/accessor authority remained rejected without invocation. No numeric or serialization input was added by this candidate.

### concurrency-serialization — completed

The planning decision retains existing durable/in-memory operation serialization. The lane witness proves a cure ADD aimed at its valid formation-cohort member does not self-block, while a REMOVE targeting the same node remains `TOPOLOGY_OPERATION_TARGET_IN_FLIGHT`. Existing coordinator creation, claim, and remove-safety owners are unchanged; new wakes are no-op evaluations rather than duplicate mutations. Evidence: lane witness 18/18 and decision table `formation-cohort-spread-cure.json`.

### formation-circularity — completed

The self-dependency is fully represented: global startup readiness waits for whole-plane priority spread; spread planning needs a JOINING target; target readiness waits for the same global barrier; operation persistence/readback traverses the ledger being cured; local mutation admission observes readiness degraded by the unfinished recovery. The fix breaks the circle at owner boundaries without bypassing the ledger or creating a second truth source. Fixed TLC converges and proves all six 5-second event-paced gaps fit in 30 seconds inside the unchanged 120-second barrier. Timer-paced and scheduler-only/admission-veto configurations counterexample `JoinerHoldEventuallyReleases` as expected. Round-3 fixed margins are 74,662 ms and 65,963 ms.

### harness-fidelity — completed

The real UnifiedRebalancer seam is used with a fake clock; the witness reaches the named settle-gate assertions and pins the non-priority sleep as not applicable. The mutation-admission fixture reaches real execution handoff and policy enforcement and includes non-vacuous hostile authority cases. Round-3 archives contain five node logs per arm, append-only probe histories, and host-scheduling receipts. All recorded hashes match `analysis.md`; all four scheduling reports are `exceeded=false`. The current computed `src/` fingerprint is exactly the fixed-arm `bbd70acf45475c8b`. The fixed/revert limitation is stated honestly.

### recovery-replay — completed

Terminal operation and placement-visibility events reuse existing replay/reconciliation consumers and reset the next priority evaluation to base cadence before enqueue. They do not infer completion from absent rows or replace live state with cache state. Re-evaluation re-enters authoritative planning/coordinator owners, so duplicate/lost visibility is handled as an idempotent nudge rather than mutation replay.

### retry-loops — completed

The existing terminal/visibility wake paths provably fire in the lane witness and rearm from escalated cadence to the 5-second priority base. The fixed model bounds six whole-plane gaps at 30 seconds. No attempt ceiling, timeout, or retry budget changes. Concurrent wakes converge through existing operation visibility/serialization and cannot directly create duplicate effects.

### sweep-timer — completed

No new sweep or timer exists. Existing fake-clock seams drive the deterministic cadence test. Terminal and placement visibility reset only `currentInterval`; the 70-80-second blocked-spread sleep stays not applicable to priority partitions, and the 120-second barrier remains unchanged. The timer-paced mutant demonstrates why event cadence is required rather than assumed.

### transport-delivery — completed

The changed delivery boundary is an in-process coordinator request, not a transport ACK. It is explicitly field-built, preserves entity identity and safety inputs, and conditionally copies only validated own authority. Existing coordinator/cache event sources remain the sole wake delivery paths; the candidate adds no acknowledged/no-handler interpretation or unbounded awaiting transport.

## Commands and results

- Direct `assertReviewCurrent(...)` for `review-32d16f187a678b485c0d58a8`: PASS; exact candidate/aggregate fingerprint, 24 paths, proof plan pass, 2074/2074 selected tests.
- Exact 24-path binary/full-index diff: 94,717 bytes, SHA-256 `05349ef5...a1de`.
- Exact 21-path predecessor subset: 90,080 bytes, SHA-256 `a3d8ad51...02f51`.
- Generator checks: primary/resource/subsystem classifications PASS at 2074 tests; files match review SHA-256 `e4b343c0...82da6`, `452e29f8...19c98`, `dd6be231...ffcb`.
- `node scripts/run-formation-barrier-spread-cure-admission-liveness-scenarios.js`: PASS, 2/2 guard files, 47/47 assertions.
- Direct lane witness: PASS, 4 subtests, 18/18 assertions.
- CL-036 guard: PASS, 5/5 assertions.
- Universal remove-safety floor: PASS, 5/5 assertions.
- Priority remove spread non-regression: PASS, 8/8 assertions.
- `npm run model:contracts`: PASS, including decision tables and all registered TLC contracts.
- Three focused TLC modes: fixed converged as expected; timer-paced and scheduler-only did not converge as expected.
- ESLint over every candidate JavaScript path: PASS.
- Round-3 node-log/probe-history hashes and scheduling receipts: MATCH/PASS.

No source, Quest, review, or append-only ledger file was modified by the verifier. The only durable `solve/changes` outputs written were this authorized receipt and its strict verdict; focused commands also refreshed ignored `test-output/reports` artifacts.
