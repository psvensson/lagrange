# Independent verification — formation-barrier-spread-cure-admission-liveness

Verdict: **REJECT**

Verifier: `verify_formation_cure`  
Base: `a00df079c5a2bea5e2143f46e2662f9f95f5d7b4`  
Exact aggregate: `sha256:a3d8ad51dbb5a3f4e488c19e6740ebce20ea75bedd8521db5fb44f3bbc902f51` (90,080 bytes, 21 paths)  
Ordered path/content manifest: `sha256:11baebf36f251b288aab66d543df392ba70db93a5b9ee0b84cc98168a113981a`, computed as SHA-256 over each Solver-ordered `path NUL size NUL content-sha256 LF` record.  
Current `src/` fingerprint: `bbd70acf45475c8b`  
Live A/B fixed-arm fingerprint: `7bfa41a444acf4c6`

No immutable review envelope existed for this Quest at verification time. Solver reported `request-verification` and the exact next command `node scripts/solve.js land --id formation-barrier-spread-cure-admission-liveness`. Accordingly, this receipt is content-bound, but no invalid or fabricated `solver-verifier-verdict/1` JSON was emitted without a `reviewId`.

## Actionable finding

### [harness-fidelity] Fresh live A/B does not bind the exact aggregate under review

`live-ab/round-2/analysis.md:8-18` explicitly describes an exact **24-path** fixed candidate with source fingerprint `7bfa41a444acf4c6`. The exact current candidate is a **21-path** aggregate with artifact fingerprint `a3d8ad51...02f51` and current bootable source fingerprint `bbd70acf45475c8b`.

This is not only generated-manifest bookkeeping. The live source and tests were changed about five hours after the A/B evidence: `src/control-plane/control-plane-mutation-readiness.js:41-49` now centralizes own-data authority reading, `src/rebalancer/provisioning-admission-policy.js:242-253` consumes that helper, and `src/rebalancer/unified-rebalancer-move-execution.js:29-70,240-265` replaces ambient move spreads with explicit safety/operation requests and conditionally transports only a validated own data property. The new inherited/accessor negatives in `test/rebalancer/formation-barrier-recovery-mutation-admission.test.js:201-284` correctly close the prior security finding, but they also confirm the reviewed execution boundary changed after the live run.

These changes are fail-closed and are unlikely to harm formation liveness, but the sealed requirement is an exact-aggregate live A/B, not an inference that a post-run hardening is benign. Re-run the fixed N>=2 arm on source fingerprint `bbd70acf45475c8b` (or a newly frozen successor) against exact base revert, archive the emitted source fingerprints, then mint an immutable review.

## Systemic owner and history analysis

The change respects a single owner per subsystem and a single owner per interaction:

- startup-authority placement eligibility classifies connected JOINING cohort targets at `startup-authority-placement-eligibility.js`;
- the priority recovery planning gate owns the cohort/target-in-flight decision and permits only the spread-curing ADD;
- move minting owns creation of the narrow `priorityRecoveryOperationCreationRequired` capability;
- move execution transports only that validated own data property in an explicit coordinator request;
- `control-plane-mutation-readiness.js` owns capability interpretation, and provisioning admission consumes its result only for priority-control-plane, token-stale deferred readiness;
- pre-existing coordinator terminal and placement-visibility event consumers own cadence rearming; no listener or timer was added by this candidate.

History inspection against CL-028, CL-036, the partition-class owner refactors, and the prior rejected attempt shows that the current change narrows rather than duplicates authority. No other source consumer of the authority field exists outside the planning snapshots/log contexts, the readiness owner, provisioning admission, move execution, and the focused tests. Explicit request construction prevents object spread from invoking or copying inherited/accessor authority.

## Required review templates

### admission-gating — completed

Own data value `true` is required. Inherited and accessor-backed authority fail closed without accessor invocation in both execution handoff and provisioning admission. Ordinary partitions, priority moves without authority, and fresh-closed readiness retain `LOCAL_MUTATION_UNHEALTHY`. The fresh-open CL-028 path remains authoritative. Focused admission test: 10 subtests, 15/15 assertions pass.

### adversarial-js-intrinsics — completed

The authority owner delegates to `readOwnDataValue`, which uses pre-bound `Object.getOwnPropertyDescriptor` and `Object.hasOwn`, rejects accessors, catches proxy/descriptor exceptions, and does not read the property value through ordinary lookup. Move execution calls the same owner before copying the capability. The post-import hostile-intrinsic surface for this authority is therefore centralized and fail-closed. No move spread handles the capability.

### concurrency-serialization — completed

The lane witness proves an in-flight spread-curing ADD targeting a valid cohort member does not self-block, while a REMOVE targeting the same member still returns `TOPOLOGY_OPERATION_TARGET_IN_FLIGHT`. Existing operation and remove serialization owners are unchanged. Lane witness: 4 subtests, 18/18 assertions pass.

### formation-circularity — completed

Valid CONNECTED JOINING startup-authority cohort members cease to be readiness blockers only during active priority recovery, leaving substantive denials and non-priority partitions strict. The fixed TLC route converges and proves whole-plane schedule arithmetic under the unchanged 120-second barrier; both timer-paced and scheduler-only/admission-veto mutants produce the required liveness counterexample. The exact live proof is stale as described in the finding.

### harness-fidelity — completed, rejecting

The local guard scenario reports 2/2 files and 47/47 guard assertions green. The A/B archives are internally coherent: fixed 2/2 below 120 seconds, exact reverted base 1/2 timed out. However, their fixed source fingerprint does not match current source bytes, so they cannot satisfy the exact-aggregate evidence bar.

### recovery-replay — completed

The terminal and placement-visibility handlers reuse existing event delivery and reset `currentInterval` to the priority base cadence before enqueueing rebalance/publication reconciliation. The retryable reverted run preserved its join session and recovered after the 250 ms resume, demonstrating the recorded failure is the formation barrier lane rather than generic process startup.

### retry-loops — completed

Terminal and placement visibility rearm the base priority delay; the fixed model uses the unchanged 5-second event cadence for six whole-plane gaps (30 seconds), while timer-only escalation is falsified. No retry ceiling or 120-second barrier was weakened.

### sweep-timer — completed

The lane pin confirms topology-settle escalation is binding and the 70-80-second blocked-spread sleep is `NOT_APPLICABLE` to priority partitions. The candidate adds no sweep or timer owner; it only resets cadence on existing events.

### transport-delivery — completed

The coordinator request is explicitly constructed and carries the capability only after the own-data authority owner accepts it. Inherited/accessor authority is neither invoked nor propagated. Existing terminal and cache visibility transports remain the sole wake sources.

## Commands and results

- Exact diff construction: `git diff --binary --full-index --no-ext-diff a00df079... -- <21 Solver paths>` -> 90,080 bytes, SHA-256 `a3d8ad51...02f51`.
- `node scripts/solve.js next --id formation-barrier-spread-cure-admission-liveness --json` -> exact 21 paths, candidate/aggregate fingerprint match, nine required templates, `problems: []`, action `request-verification`.
- `node scripts/run-formation-barrier-spread-cure-admission-liveness-scenarios.js` -> PASS, 2/2 files, 47/47 assertions.
- Direct lane witness -> PASS, 4 subtests, 18/18 assertions.
- Direct mutation-admission witness -> PASS, 10 subtests, 15/15 assertions.
- `npm run model:tlc -- --mode formation-barrier-spread-cure-liveness-fixed` -> converged=true, expected=true.
- `npm run model:tlc -- --mode formation-barrier-spread-cure-liveness-timer-paced` -> converged=false, expected=false.
- `npm run model:tlc -- --mode formation-barrier-spread-cure-liveness-scheduler-only` -> converged=false, expected=false.
- `node test/rebalancer/cl-036-publications-quorum-escape.test.js` -> PASS, 5/5 assertions.
- `node test/rebalancer/operation-workflow-remove-safety-universal-floor.test.js` -> PASS, 5/5 assertions.
- `node test/rebalancer/priority-remove-safety-spread-nonregression.test.js` -> PASS, 8/8 assertions.
- ESLint on all candidate JavaScript paths -> PASS.
- Both decision-table JSON files parse -> PASS.

No source, Quest, ledger, or review-state files were modified by the verifier.
