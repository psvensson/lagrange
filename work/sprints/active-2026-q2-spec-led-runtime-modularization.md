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
- Current causal thesis: the fresh representative route still selects `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete`, priority-recovery residuals are zero, and architecture-gap analysis selected `architecture-gap-stop` because the only concrete progress signal is the repeated deferred retry contract.
- Competing hypotheses: H1 selected snapshot timeout/deferred repair is still local bounded-progress debt; H2 the active-gate/rebalancer pair is a coupled invariant needing architecture work; H3 the visible active-gate frontier is downstream startup readiness lag; H4 the artifact is stale or instrumentation-only. H1 is blocked from source promotion on this artifact because it repeats the saturated contract-gap path.
- Confidence and evidence: high for architecture-gap-stop on this artifact; `work:frontier-history` reports same-mechanism-repeat `contract_gap`, `work:scenario-route` still selects startup_active_gate_owner / snapshot_coverage, topology-convergence names only the repeated deferred retry contract, and the joint coupled-invariant probe residual count remains 0.
- Expected green path: close the architecture-gap analysis as a learning package, then continue only with fresh representative evidence or a follow-on architecture experiment that names a non-repeated owner contract, protocol/model/topology route, or real owner-boundary migration.
- Wrong direction signals: closing this sprint on architecture-gap or migration, widening timeouts, weakening admission/readiness, hiding diagnostics, reopening rebalancer handoff while priority-recovery witnesses are zero, or opening another generic startup_active_gate_owner / snapshot_coverage patch after the rederive selected architecture work.
- Next best package: fresh route evidence or a bounded architecture experiment; no local startup_active_gate_owner / snapshot_coverage source package is promoted from the current artifact.
- Redirect rule: on same-frontier / no-reduction evidence after the rederive, immediately open a bounded architecture/causal experiment that names a non-repeated owner contract — or run fresh representative route evidence — instead of another local runtime package. This is a redirect, not a stop: the agent keeps executing the next autonomous action and never hands control back; the loop continues until the Evidence Anchor success condition is met. Terminate only for a closed Termination Condition recorded in `## Theory Loop Termination`.

## Theory Loop Termination

- Loop status: running
- Termination reason: none
- Next autonomous action: per the Redirect rule above; the Evidence Anchor success condition (local rolling-restart harness exits 0 with no active priority-recovery or active-gate frontier) is not yet met, so the loop must not stop.

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
Visible first frontier: active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage
Active package: work/packages/active-20260529-rolling-restart-active-gate-saturation-fresh-system-theory-rederive.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: snapshot_coverage_incomplete
Required action: Rederive the startup_active_gate_owner / snapshot_coverage whole-system theory from the fresh representative artifact before any runtime source promotion.
Representative status: architecture-gap
Causal outcome: continue_local_fix
Architecture gate: selected / architecture-package
Expected delta: System-theory rederive records whether the fresh guarded active-gate frontier permits a non-repeated contract, owner migration, architecture-gap, or another fresh rerun.
Current state: Fresh representative evidence still selects active_gate_snapshot_coverage with runtimePromotionGuard.state=blocked after the saturation architecture-gap package closed.
Allowed edits: work/packages/active-20260529-rolling-restart-active-gate-saturation-fresh-system-theory-rederive.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md, work/theory-ledger.md
Candidate runtime files: src/admin/admin-control-snapshot-repair-diagnostics.js, src/bootstrap/bootstrap-api-control-plane-methods.js, src/control-plane/membership-publication-active-gate-reconcile.js, src/control-plane/publication-active-gate-handoff-contract-selection.js
Forbidden edits: Runtime promotion stays blocked until system theory names a non-repeated source route.
Required latest proof: falsifier: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage, regression: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage, supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage, supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Joint Coupled-Invariant Probe

- Command: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --explain snapshot_coverage
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
8. [Rolling Restart Active Gate Saturation Fresh System Theory Rederive](../packages/active-20260529-rolling-restart-active-gate-saturation-fresh-system-theory-rederive.md)
   - Lane: `causal-escalation`
   - Purpose: Record the fresh system-theory rederive required after representative evidence returned to the guarded active-gate frontier.
   - First-run reason: Fresh rolling-restart evidence still selects active_gate_snapshot_coverage with runtimePromotionGuard.state=blocked, and work:system-theory:rederive reports same-mechanism-repeat contract_gap saturation.

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
