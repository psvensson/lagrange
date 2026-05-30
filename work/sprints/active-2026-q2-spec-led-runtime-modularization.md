# Spec-Led Runtime Modularization Rolling Restart Green Theory Loop Sprint

Status: active. Opened on May 28, 2026.
systemTheoryRederivedAt: 2026-05-29

## Goal

Make the local `rolling-restart` distributed test harness scenario green. This
sprint does not close on classification, reduced evidence, owner-boundary
migration, or architecture-gap; those outcomes are learning states until the
harness command exits successfully and canonical evidence has no active
priority-recovery or active-gate frontier.

## Sprint Strategy Brief

- Goal state: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose` exits 0, and canonical evidence shows representative green.
- Current causal thesis: the fresh post-handoff-selection representative rerun stayed red on `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending`; priority-recovery residuals are zero, topology shows snapshot coverage 1/5 with selected_snapshot_source_timeout plus snapshot_repair_deferred, publication handoff `wait_owner_recovery`, `membershipPublicationHandoffOutcomeEnqueued=false`, and one selected owner pending write, while scenario-route blocks runtime promotion through `runtimePromotionGuard.state=blocked`.
- Competing hypotheses: H1 a non-repeated active-gate source contract is now discoverable; H2 the active-gate/rebalancer pair remains a coupled invariant needing architecture continuation; H3 the visible active-gate frontier is downstream startup readiness lag; H4 the artifact is stale or instrumentation-only. H1 is blocked until the system-theory rederive names a concrete non-repeated source contract.
- Confidence and evidence: high that the active pending-write architecture experiment is non-terminal; source-context proof shows membership-publication active-gate reconcile already exposes bounded drain, owner wake enqueue, and queue-pressure reentry, `work:scenario-route` keeps `runtimePromotionGuard.state=blocked`, `work:frontier-history` reports exhausted loop health with same-mechanism-repeat plus pair-alternation-post-rederive, and priority-recovery residual witnesses remain zero.
- Expected green path: close the pending-write architecture experiment as architecture-gap continuation, then continue only through fresh representative evidence or proof that names a non-repeated source contract, real owner migration, implementable protocol/model/topology route, fresh representative rerun route, or representative-green proof until the Evidence Anchor is met.
- Wrong direction signals: closing this sprint on architecture-gap or migration, widening timeouts, weakening admission/readiness, hiding diagnostics, reopening rebalancer handoff while priority-recovery witnesses are zero, or opening another generic startup_active_gate_owner / snapshot_coverage patch after the rederive selected architecture work.
- Next best package: `work/packages/done-20260529-rolling-restart-active-gate-owner-pending-write-reentry.md`; it records that the candidate pending-write source context already expresses bounded owner-recovery reentry and does not reopen runtime promotion from this artifact.
- Redirect rule: on same-frontier / no-reduction evidence after the rederive, immediately open a bounded architecture/causal experiment that names a non-repeated owner contract — or run fresh representative route evidence — instead of another local runtime package. This is a redirect, not a stop: the agent keeps executing the next autonomous action and never hands control back; the loop continues until the Evidence Anchor success condition is met. Terminate only for a closed Termination Condition recorded in `## Theory Loop Termination`.
- Architecture-route forcing (R13): the earlier active-gate protocol route has been implemented and `work:frontier-history` now reports `architectureRouteState: implemented`; this release-gate package is therefore evidence-only. Any future runtime package on the active-gate pair must still satisfy the current compositional gates and carry the required architecture-route marker when those gates demand it.

## Theory Loop Termination

- Loop status: running
- Termination reason: none
- Next autonomous action: close the active pending-write architecture experiment as architecture-gap continuation, then continue through fresh representative evidence or a future proof that names a non-repeated successor or representative-green result. The Evidence Anchor success condition (local rolling-restart harness exits 0 with no active priority-recovery or active-gate frontier) is not yet met, so the loop must not stop.

## Theory Loop Sprint

- Evidence anchor: central problem = rolling-restart remains red after the CL-006 publication-lag reduction; latest fresh route selects priority recovery rebalancer handoff while active-gate snapshot coverage remains the next expected frontier; representative artifact = test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json; success condition = the local rolling-restart distributed test harness scenario exits 0 and canonical evidence shows representative green with no active priority-recovery or active-gate frontier.
- Success condition invariant: the Evidence Anchor success condition is the original representative or release success metric, not an architecture-gap, owner-boundary migration, classification, or route-selection stop.
- Stable facts:
- rolling-restart is still non-green on the fresh active-package rerun
- canonical route selects priority_recovery_partition_progress owned by operation_workflow_owner / rebalancer_handoff with priority_recovery_event_driven_wait
- active_gate_snapshot_coverage remains the next expected frontier after priority recovery closes
- Changed facts:
- the original all-active active-gate witness no longer owns the first frontier in the fresh rerun
- the fresh rerun exposes six priority-recovery residual witnesses across two owner-boundary groups
- Mechanism card: mechanism = scheduling_gap; deciding owner = operation_workflow_owner; current action = priority recovery remains retryable with event-driven wait/backpressure evidence during rebalancer handoff; missing transition or observation = an owner-owned wake, retry, dispatch, or handoff transition must convert priority recovery wait into progress or prove the correct waiting contract; smallest falsifier = `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`; expected movement = priority_recovery_partition_progress stops being the first frontier; the harness either passes green or exposes the next active-gate frontier for a promoted source package; negative result means = unchanged priority_recovery_event_driven_wait means the sprint must not open another active-gate local patch from this evidence; escalation rule = after repeated same-frontier priority recovery evidence without a source contract, run system-theory rederive before another local runtime package.
- Rejected alternatives:
- closing the sprint on architecture-gap or owner-boundary migration is rejected because the user requested green harness success
- opening another active-gate local patch from the older artifact is rejected while priority recovery is the current first frontier
- Theory option set: options are hypotheses to compare, not future packages; each option names mechanism, intervention, src/ source-code modification, discriminator, promotion, and rejection.
1. mechanism: scheduling_gap; intervention: repair owner-owned retry wake or dispatch for priority recovery rebalancer handoff; modification: src/control-plane/*recovery*.js or the exact operation workflow owner file selected by the discriminator; discriminator: rerun scenario-route for priority_recovery_partition_progress; promotion: priority recovery remains first and owner files identify a concrete dispatch or wake source path; rejection: evidence routes away from priority recovery or no wake retry source contract is selected; layer: scheduling
2. mechanism: ownership_gap; intervention: migrate the active package from startup_active_gate_owner snapshot coverage to operation_workflow_owner rebalancer handoff before source edits resume; modification: source changes stay blocked until the successor package names the exact src owner path; discriminator: work:scenario-route plus frontier-history agree that operation_workflow_owner owns the first frontier; promotion: current package cannot close without routing to operation workflow; rejection: fresh evidence returns to active gate after priority recovery closes; layer: ownership
3. mechanism: protocol_mismatch; intervention: reconcile priority recovery publication ACK and active-gate progress semantics so each owner consumes one contract; modification: src/control-plane/*publication*.js and src/control-plane/*recovery*.js only after a focused contract fixture selects the mismatch; discriminator: causal-model and owner explain disagree on publication_ack_convergence versus priority_recovery_partition_progress; promotion: focused proof shows producer and consumer disagree on terminal progress; rejection: owner explain and causal route both stay on the same single frontier; layer: protocol
4. mechanism: observation_gap; intervention: preserve decisive owner progress fields through the active-gate and failure-bundle evidence path without changing readiness; modification: src/bootstrap/owners/*.js only if the owner contract omits decisive priority-recovery closure evidence; discriminator: evidence summary lacks fields needed to decide whether priority recovery actually closed; promotion: missing fields prevent selecting a source owner; rejection: current canonical evidence already selects a concrete owner boundary; layer: observation
- Creative move menu:
- boundary swap: test priority recovery ownership before another active-gate patch
- missing-object search: identify the absent wake, retry token, dispatch record, or terminal progress field
- opposite intervention: prove waiting is owner-correct before adding more wake pressure
- Discriminator first: run or name the cheapest discriminator for each viable option before code edits; the active package executes only the promoted option.
- Real package rule: a theory-loop work package exists only for a promoted theory with an in-scope src/ source-code modification, a falsifying verification command, result recording, and successor package creation. Evidence-only discriminators stay in the sprint until they promote real source work.
- Promotion rule: create or activate one executable package only when fresh evidence or a discriminator selects one option with explicit owner, boundary, write scope, proof, and stop rule.
- Learning rule: record each option as supported, avoided, falsified, fixed, migrated, representative-green, architecture-gap, or needs-rerun, then revise the option set before another patch.
- Queue discipline: keep one active executable package and no speculative package queue; successor packages are created only from fresh route evidence.
- Closure invariant: the sprint continues indefinitely until the original success condition is met; close only after `## Theory Loop Success Evidence` records `Success condition met: yes`, `Matched success condition` equal to the Evidence Anchor success condition, fresh representative evidence, and `Result: success-condition-met`.
- Ceremony budget: use `npm run work:theory-loop -- next|record|fix` for package and ledger updates before hand-editing markdown.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json
Visible first frontier: release_gate_owner / rolling_restart_fully_green_gate / representative_green_required
Active package: work/packages/active-20260530-rolling-restart-active-gate-fresh-representative-route-gate.md
Active package owner: release_gate_owner
Active package boundary: rolling_restart_fully_green_gate
Selected cause: representative_green_required
Required action: Run fresh rolling-restart representative evidence, route the resulting artifact, and select the next sprint action from the fresh route instead of opening another local active-gate patch from the closed architecture-gap artifact.
Representative status: pending-before-rerun
Causal outcome: pending-before-rerun
Architecture gate: watching / unknown
Expected delta: Fresh representative evidence either satisfies the rolling-restart green condition, migrates owner/boundary, reduces the active-gate timeout shape, or preserves architecture-gap blocking and selects a bounded successor.
Current state: The owner wake delivery architecture experiment closed as architecture-gap continuation; runtime source promotion on startup_active_gate_owner / snapshot_coverage remains blocked until fresh representative evidence changes the route or names a non-repeated successor.
Allowed edits: work/packages/active-20260530-rolling-restart-active-gate-fresh-representative-route-gate.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md
Candidate runtime files: src/control-plane/membership-publication-active-gate-reconcile.js, src/control-plane/membership-publication-control-plane-convergence.js, src/control-plane/membership-publication-coordinator-class-stage-3.js, src/admin/admin-control-snapshot-publication-handoff.js, src/admin/admin-control-snapshot-query-result-helper.js
Forbidden edits: Fresh representative evidence must route one owner boundary before source promotion resumes.
Required latest proof: falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose # release-gate contract transition, regression: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required # release-gate outcome state transition, supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json, supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Joint Coupled-Invariant Probe

- Command: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner diagnostics_owner --boundary causal_analysis_framework --dominant-reason runtime_promotion_guard_conflict --explain snapshot_coverage
- Last run: 2026-05-29
- Last residual count: 0
- Residual trend: decreasing
- Boundaries covered: startup_active_gate_owner / snapshot_coverage, operation_workflow_owner / rebalancer_handoff

## Package Queue

1. [Spec-Led Runtime Modularization Priority Recovery Rebalancer Handoff](../packages/done-20260528-spec-led-runtime-modularization-priority-recovery-rebalancer-handoff.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Execute the fresh priority recovery rebalancer handoff scheduling-gap source package selected by scenario-route.
   - First-run reason: Freshness review migrated the stale active-gate package to operation_workflow_owner / rebalancer_handoff while preserving the CL-006 fixture as local proof.
2. [Spec-Led Runtime Modularization Active Gate Owner Recovery Reentry](../packages/done-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md)
   - Lane: `causal-escalation`
   - Purpose: Execute the load-mode selected-timeout owner-recovery re-entry discriminator selected after priority-recovery witnesses dropped to zero.
   - First-run reason: Fresh route migrated away from rebalancer handoff but rolling-restart stayed red at active-gate snapshot coverage with `priority_recovery_zero_witness_conflict`.
3. [Rolling Restart Benchmark Table Bootstrap Sql Unavailable Repair](../packages/done-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md)
   - Lane: `causal-escalation`
   - Purpose: Execute the SQL-unavailable benchmark table bootstrap source theory selected after the owner-recovery representative rerun stayed red and reported `authoritativeRepairAttempted=false`.
   - First-run reason: Fresh route kept active-gate snapshot coverage unchanged while the terminal scenario error exposed single-candidate SQL query engine unavailable with no authoritative repair.
4. [Rolling Restart Priority Recovery Retry Deferred Handoff](../packages/done-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md)
   - Lane: `causal-escalation`
   - Purpose: Execute the fresh retry_deferred priority-recovery handoff recurrence selected after the table-bootstrap repair moved its representative metric.
   - First-run reason: Fresh route now selects `priority_recovery_partition_progress` with three `recovering_in_flight` retry_deferred dispatch-pending witnesses under `operation_workflow_owner / rebalancer_handoff`.
5. [Rolling Restart Active Gate Snapshot Coverage Architecture Gap Analysis](../packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-analysis.md)
   - Lane: `causal-escalation`
   - Purpose: Record the architecture-gap-stop decision for the startup_active_gate_owner / snapshot_coverage coupled invariant before another local active-gate source package.
   - First-run reason: The completed system-theory rederive confirmed same-mechanism-repeat `contract_gap` saturation while fresh route evidence still selects active_gate_snapshot_coverage with priority-recovery residuals at zero.
   - Decision: Focused proof selected architecture-gap-stop; the only concrete progress signal is the repeated selected-snapshot deferred retry contract, and the causal-model readiness migration is downstream of the active-gate first critical path.
6. [Rolling Restart Active Gate Saturation Route Guard](../packages/done-20260529-rolling-restart-active-gate-saturation-route-guard.md)
   - Lane: `experiment`
   - Purpose: Test whether the corrected local-blocker route needs a diagnostics-owned architecture guard before any active-gate runtime source promotion.
   - First-run reason: The stop-condition route bug is fixed, but prior architecture-gap evidence still blocks reopening an unchanged active-gate runtime patch from the same artifact.
7. [Rolling Restart Active Gate Saturation Architecture Gap Analysis](../packages/done-20260529-rolling-restart-active-gate-saturation-architecture-gap-analysis.md)
   - Lane: `causal-escalation`
   - Purpose: Run the architecture-gap analysis selected by the diagnostics guard before any active-gate runtime source promotion.
   - First-run reason: Scenario-route now reports `runtimePromotionGuard.state=blocked` and frontier-history still reports same-mechanism-repeat contract_gap for startup_active_gate_owner / snapshot_coverage.
8. [Rolling Restart Active Gate Saturation Fresh System Theory Rederive](../packages/done-20260529-rolling-restart-active-gate-saturation-fresh-system-theory-rederive.md)
   - Lane: `causal-escalation`
   - Purpose: Record the fresh system-theory rederive required after representative evidence returned to the guarded active-gate frontier.
   - First-run reason: Fresh rolling-restart evidence still selects active_gate_snapshot_coverage with runtimePromotionGuard.state=blocked, and work:system-theory:rederive reports same-mechanism-repeat contract_gap saturation.
9. [Rolling Restart Active Gate Saturation Architecture Gap Experiment](../packages/done-20260529-rolling-restart-active-gate-saturation-architecture-gap-experiment.md)
   - Lane: `causal-escalation`
   - Purpose: Run the architecture-gap class discriminator selected after the fresh rederive kept active-gate runtime promotion blocked.
   - First-run reason: The theory-loop sprint cannot close on architecture-gap, runtime promotion remains blocked, and scenario-route suggests an autonomous architecture experiment before any source package resumes.
   - Decision: Fresh representative rerun stayed red with the same active_gate_snapshot_coverage first frontier, zero priority-recovery residuals, and blocked runtime-promotion guard; no non-repeated runtime successor is selected.
10. [Rolling Restart Active Gate Saturation Checkpoint System Theory Rederive](../packages/done-20260529-rolling-restart-active-gate-saturation-checkpoint-system-theory-rederive.md)
   - Lane: `causal-escalation`
   - Purpose: Record the checkpoint system-theory rederive required before another runtime or architecture successor can activate.
   - First-run reason: The non-halting sprint still lacks representative-green success evidence, and `work:system-theory:rederive -- --check-due --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md` reports 12 closed packages since the sprint rederive stamp.
   - Decision: Checkpoint proof reconfirmed same-mechanism contract_gap saturation, active_gate_snapshot_coverage first frontier, zero priority-recovery residuals, and blocked runtime promotion; no non-repeated source contract or owner-boundary migration is selected.
11. [System Theory Checkpoint Due Recognition](../packages/done-20260529-system-theory-checkpoint-due-recognition.md)
   - Lane: `experiment`
   - Purpose: Keep the periodic rederive gate enforced while making it recognize the latest closed same-day system-theory checkpoint.
   - First-run reason: After the checkpoint rederive closed, `work:system-theory:rederive -- --check-due --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md` still reports 13 same-day closed packages and would force another immediate checkpoint instead of the selected architecture continuation.
   - Decision: `work:system-theory:rederive -- --check-due --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md` now reports 0 closed packages since the latest closed systemTheory rederive checkpoint; the gate remains enforced for packages closed after that checkpoint.
12. [Rolling Restart Active Gate Handoff Protocol Route](../packages/done-20260529-rolling-restart-active-gate-handoff-protocol-route.md)
   - Lane: `causal-escalation`
   - Purpose: Implement the R13 protocol-layer route by converting selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and making topology diagnostics recognize the non-repeated source contract.
   - First-run reason: `work:frontier-history` reports `architectureRouteState: implement-pending` for startup_active_gate_owner / snapshot_coverage, so the only valid redirect is the architecture-route implementation carrying `theoryLoop.architectureRoute`.
13. [Rolling Restart Active Gate Owner Handoff Write Deferred Reentry](../packages/done-20260529-rolling-restart-active-gate-owner-handoff-write-deferred-reentry.md)
   - Lane: `experiment`
   - Purpose: Preserve the reduced owner_reconcile_pending route after the protocol package closes, then promote the concrete source package selected by the remaining write_deferred owner handoff evidence.
   - First-run reason: The protocol route proof removed the runtime-promotion guard and exposed publicationActiveGateHandoff wait_owner_recovery pending recovery evidence; the remaining local witness is membershipPublicationHandoffOutcomeState=write_deferred with one pending owner recovery write.
14. [Rolling Restart Active Gate Owner Recovery Reentry Drain](../packages/done-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md)
   - Lane: `causal-escalation`
   - Purpose: Implement the bounded owner-recovery wait reentry/drain source package for membershipPublicationHandoffOutcome write_deferred evidence.
   - First-run reason: The route-selection package kept startup_active_gate_owner / snapshot_coverage on owner_reconcile_pending and selected src/control-plane/membership-publication-active-gate-reconcile.js plus its focused owner-recovery test as the concrete source owner.
15. [Rolling Restart Active Gate Timeout Retry Contract](../packages/done-20260529-rolling-restart-active-gate-timeout-retry-contract.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Implement the bounded active-gate timeout retry contract now that owner-recovery wait reentry is enqueued.
   - First-run reason: Fresh representative evidence after the owner-recovery reentry drain reports membershipPublicationHandoffOutcomeEnqueued=true, zero priority-recovery residuals, and a remaining active_gate_timed_out frontier under startup_active_gate_owner / snapshot_coverage.
16. [Rolling Restart Active Gate Post Rerun System Theory Rederive](../packages/done-20260529-rolling-restart-active-gate-post-rerun-system-theory-rederive.md)
   - Lane: `causal-escalation`
   - Purpose: Rederive active-gate system theory after the post-architecture-gap representative rerun stayed same-frontier/no-reduction.
   - First-run reason: Fresh representative evidence selects active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending with zero priority-recovery residuals, and `work:system-theory:rederive --check-due` requires a checkpoint before another runtime slice activates.
17. [Rolling Restart Active Gate Runtime Promotion Guard Reconcile](../packages/done-20260529-rolling-restart-active-gate-runtime-promotion-guard-reconcile.md)
   - Lane: `experiment`
   - Purpose: Reconcile scenario-route runtime promotion guard semantics with topology handoff denial before any repeated active-gate runtime source package can activate.
   - First-run reason: The checkpoint gate is no longer due, but current topology records publicationActiveGateHandoffRuntimePromotionAllowed=false while scenario-route still reports runtimePromotionGuard.state=allowed for the same active-gate frontier.
18. [Rolling Restart Active Gate Owner Reconcile Pending Post Guard Architecture Gap Analysis](../packages/done-20260529-rolling-restart-active-gate-owner-reconcile-pending-post-guard-architecture-gap-analysis.md)
   - Lane: `causal-escalation`
   - Purpose: Run the architecture-gap class discriminator selected by corrected runtime-promotion guard evidence before any active-gate runtime source promotion.
   - First-run reason: Scenario-route now reports `runtimePromotionGuard.state=blocked` for owner_reconcile_pending and frontier-history still reports same-mechanism-repeat contract_gap for startup_active_gate_owner / snapshot_coverage.
19. [Rolling Restart Release Gate System Theory Rederive](../packages/done-20260529-rolling-restart-release-gate-system-theory-rederive.md)
   - Lane: `causal-escalation`
   - Purpose: Record the release-gate system-theory revision required after same-mechanism-repeat blocked another route-only package.
   - First-run reason: The post-guard fresh representative route gate was not pre-implementation fresh; compositional auto-promote requires rederive before rerun activation.
20. [Rolling Restart Active Gate Timeout Post Rerun Architecture Gap Analysis](../packages/done-20260529-rolling-restart-active-gate-timeout-post-rerun-architecture-gap-analysis.md)
   - Lane: `causal-escalation`
   - Purpose: Run the architecture-gap class discriminator selected by fresh post-rederive active_gate_timed_out evidence before any further active-gate runtime source promotion.
   - First-run reason: Fresh representative evidence after the release-gate rederive stayed red on active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out, scenario-route reports runtimePromotionGuard.state=blocked, and priority-recovery residual witnesses remain zero.
21. [Rolling Restart Active Gate Owner Pending Write Reentry](../packages/done-20260529-rolling-restart-active-gate-owner-pending-write-reentry.md)
   - Lane: `causal-escalation`
   - Purpose: Run the autonomous architecture experiment for the fresh owner_reconcile_pending pending-write evidence while runtime files remain candidate-only.
   - First-run reason: Fresh representative evidence after the handoff-selection architecture experiment stayed red on active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending, with membershipPublicationHandoffOutcomeEnqueued=false, selectedControlPlaneOwnerQueuePendingWrites=1, and zero priority-recovery residual witnesses; the two-shot same-frontier validator rejected another runtime-owner-boundary package on this pair.
   - Decision: Focused proof found the candidate source already covers drained snapshot reentry, accepted owner wake enqueue, and queue-pressure reentry; route evidence still blocks runtime promotion with historyCount=12 and zero priority-recovery residual witnesses, so this package closes as architecture-gap continuation.
22. [Rolling Restart Active Gate Owner Recovery Retry Floor](../packages/done-20260529-rolling-restart-active-gate-owner-recovery-retry-floor.md)
   - Lane: `causal-escalation`
   - Purpose: Test the non-repeated owner-recovery retry-floor contract exposed by the fresh active_gate_timed_out route.
   - First-run reason: Fresh representative evidence returned to active_gate_snapshot_coverage with selectedSnapshotObservationRetryAfterMs=100, membershipPublicationHandoffOutcomeRetryAfterMs=100, outbound queue saturation, zero priority-recovery residuals, and blocked runtime promotion; this source package checks whether selected snapshot observation retry is downshifting owner-recovery handoff retry below the critical convergence floor.
23. [Rolling Restart Active Gate Owner Reconcile Handoff Retry](../packages/done-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md)
   - Lane: `causal-escalation`
   - Purpose: Close the fresh owner_reconcile_pending route as architecture-gap analysis and select the next non-repeated scheduling route.
   - First-run reason: Fresh representative evidence now routes active_gate_snapshot_coverage to owner_reconcile_pending with membershipPublicationHandoffOutcomeState=write_deferred, enqueued=false, retryAfterMs=0, progressContract.retryAfterMs=1000, and zero priority-recovery residuals.
24. [Rolling Restart Active Gate Owner Reconcile Wake Scheduling Route](../packages/done-20260529-rolling-restart-active-gate-owner-reconcile-wake-scheduling-route.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Implement the architecture-route scheduling layer selected by owner_reconcile_pending architecture-gap analysis.
   - First-run reason: Architecture-gap analysis selected bounded owner wake scheduling as the non-repeated route for membershipPublicationHandoffOutcomeState=write_deferred with enqueued=false and retryAfterMs=0.
25. [Rolling Restart Active Gate Timeout After Wake Architecture Gap](../packages/done-20260529-rolling-restart-active-gate-timeout-after-wake-architecture-gap.md)
   - Lane: `causal-escalation`
   - Purpose: Analyze the fresh active_gate_timed_out post-wake route before any further startup_active_gate_owner / snapshot_coverage runtime source promotion.
   - First-run reason: Fresh representative rerun moved owner_reconcile_pending to bounded wake evidence but returned active_gate_snapshot_coverage to active_gate_timed_out with runtimePromotionGuard blocked.

## Sprint Proof Ladder

1. `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`
2. `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`
3. `npm run work:frontier-history -- --owner operation_workflow_owner --boundary rebalancer_handoff --limit 8`
4. Focused owner proof selected by the promoted theory option.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
6. `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`

## Operating Rules

1. Keep one active executable package and no speculative successor queue.
2. Use canonical evidence tools before raw JSON, logs, broad search, or ad hoc queries.
3. Evidence-only classification, route comparison, and source/log reading remain sprint-level discrimination until they select one source-code package.
4. A promoted theory-loop package must declare a real `src/` source modification, falsifier, regression proof, result recording, and successor rule.
5. Do not close this sprint until `## Theory Loop Success Evidence` records the exact success condition with fresh representative proof.
