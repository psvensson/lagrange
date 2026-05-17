# Topology Rolling-Restart Green Gate Closure Sprint

Status: active, resumed on 2026-05-16 after a migrated closure. This sprint
started after `done-2026-q2-topology-convergence-complexity-reduction.md`
reduced the publication-to-active-gate handoff complexity and first closed when
fresh evidence selected `topology_publication_owner / publication_convergence`
as the next blocker.

## Goal

Make representative `rolling-restart` green:

```text
active=5/5
snapshotCoverage=5/5
missingPublished=0
```

No timeout increase, active-gate admission relaxation, or diagnostics-only
success is in scope.

## Current Blocker Snapshot

Latest representative artifact:
`test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json`.

Canonical state after the publication-convergence package migrated:

1. `work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md`
   closed as `migrated`; focused part-5 harness proof passed, paired
   owner-reconcile projection and selected stale ACK resolution are covered,
   and the representative moved past startup active-gate setup.
2. `work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md`
   closed publication convergence as `migrated`; stale presentation-only
   publication gate reasons are filtered from the owner reason-code snapshot.
3. The current active package is
   `work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md`.
4. Fresh `work:evidence-summary` selects `active_gate_snapshot_coverage` as the
   first frontier.
5. Representative owner boundary:
   `startup_active_gate_owner / snapshot_coverage`.
6. Canonical blocker: selected snapshot source timeout before active-gate
   coverage can form.
7. Dominant reason: `active_gate_timed_out`.
8. Active-gate evidence: `activeGate.state=timed_out`,
   `snapshotCoverageNodeCount=0/5`,
   `selectedSnapshotSourceCause=selected_snapshot_source_timeout`,
   `selectedSnapshotNodeId=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and
   `selectedSnapshotTimeoutMs=100`.
9. Publication convergence is satisfied and
   `priority-recovery-residuals` reports zero witnesses.
10. The next focused proof must decide whether
    `startup_active_gate_owner / snapshot_coverage` can reduce the selected
    snapshot source timeout, must migrate to a narrower owner boundary, or can
    make representative `rolling-restart` green.

Historical publication-convergence package:

1. The previous active package was
   `work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md`.
2. Its stale input evidence selected `publication_ack_convergence`.
3. Publication evidence was `publicationStatus=OPEN`,
   `publicationPending=true`, `recoveryProtocolState=publication_pending`,
   `publicationOwnerStreamOutcome=publishing`, and
   `publicationOwnerRecoveryOutcome=waiting_for_publication`.
4. The publication contained only the seed in `publishedActiveNodeIds` and
   reports `missingPublishedCount=4`.
5. `priority-recovery-residuals` reported one
   `operation_workflow_owner / rebalancer_handoff` witness for
   `control_plane_publications-p1`; the fresh artifact reduced that witness
   count to `0`.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json
First frontier: active_gate_snapshot_coverage
Owner: startup_active_gate_owner
Boundary: snapshot_coverage
Selected cause: selected_snapshot_source_timeout
Required action: prove selected-source timeout reduction or migrate a narrower active-gate edge
Runtime promotion allowed: pending focused proof
Priority residual: none
Current coverage: active-gate snapshotCoverageNodeCount=0/5
Goal: active-gate snapshot coverage improves, owner-boundary migration with proof, or representative green
Allowed edits: package metadata until review/fix/implementation proof is clean, then exact files promoted by focused active-gate proof
Forbidden edits: publication recovery, priority recovery, timeout_budgets, active_gate_admission, terminal-progress selection, readiness_support
Required latest proof: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json --replay-fixture
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Sprint Architecture Decision Gate

Status: watching.

Current decision: continue focused publication-convergence proof before
splitting to operation workflow or opening an architecture reset.

Decision basis:

1. `work:evidence-summary` and causal-model select
   `publication_ack_convergence / topology_publication_owner /
   publication_convergence` with dominant reason `publication_pending`.
2. The active-gate owner-reconcile proof migrated and is now deferred, not the
   first frontier.
3. Priority residual extraction exposes one
   `operation_workflow_owner / rebalancer_handoff` witness, but the publication
   frontier remains first. The active package must use a focused publication
   probe before splitting ownership.
4. A broad architecture reset is not selected while the current evidence names
   a specific publication owner boundary and a concrete possible downstream
   operation-workflow residual.

Candidate ranking:

1. Publication OPEN/publishing convergence: high. Triggered by the current
   first frontier. Route to the active topology publication package.
2. Operation workflow rebalancer handoff: medium. Trigger if the focused
   publication probe proves publication is correctly waiting on
   `control_plane_publications-p1` operation progress.
3. Active-gate coverage/promotion split: deferred. Trigger only if canonical
   evidence reselects active-gate as first frontier or a representative green
   contradicts pending handoff semantics.
4. Timeout/budget reset: removed unless local fixes keep moving metrics but the
   current budget contract cannot complete without reopening timeout semantics.

Forbidden during this gate:

1. Do not reopen the closed active-gate harness proof unless canonical evidence
   reselects it.
2. Do not widen timeout budgets, active-gate admission, selected-source
   timeout, terminal-progress selection, or readiness support unless canonical
   evidence reselects them.
3. Do not split to operation workflow until the publication-convergence package
   records focused proof that publication is waiting on that owner boundary.

## Frontier Transition Ledger

| Package | Artifact | First frontier | Metric change | Result |
| --- | --- | --- | --- | --- |
| `done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md` | `rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json` | `topology_publication_owner / publication_convergence` -> `startup_active_gate_owner / snapshot_coverage` | `pendingAckCount=1` -> `0`; priority residual witnesses -> `0`; snapshot coverage `6/7` | `migrated` |
| `done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md` | `rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json` | `startup_active_gate_owner / snapshot_coverage` | `owner_reconcile_pending` drained; `publicationActiveGateHandoffPendingReconcileCount=0`; selected cause moved to `selected_snapshot_source_timeout`; snapshot coverage `0/5` | `reduced` |
| `done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md` | `rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json` | `startup_active_gate_owner / snapshot_coverage` | selected-source timeout reduced; snapshot coverage `0/5` -> `4/5`; pending handoff reconcile count `3` | `reduced` |
| `done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md` | `rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json` | `startup_active_gate_owner / snapshot_coverage` | replay fixture records the three pending reconcile nodes; representative remains at `pendingReconcileCount=3`, coverage `4/5` | `same-frontier` |
| `done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md` | `rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json` | `startup_active_gate_owner / snapshot_coverage` | focused harness projection keeps ACK/priority frozen and reduces `pendingReconcileCount=3` -> `1`; remaining node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` | `reduced` |
| `done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md` | `rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json` | `startup_active_gate_owner / snapshot_coverage` -> `topology_publication_owner / publication_convergence` | focused paired reconcile projection and selected stale ACK handoff proof passed; representative moved past startup active gate and selected `publication_ack_convergence` with `publication_pending` | `migrated` |
| `done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md` | `rolling-restart-publication-reason-filter-20260517T151928Z.report.json` | `topology_publication_owner / publication_convergence` -> `startup_active_gate_owner / snapshot_coverage` | stale presentation-only publication reasons filtered; `publication_ack_convergence` satisfied; priority residual witnesses -> `0`; selected active-gate source timeout at `0/5` coverage | `migrated` |
| `active-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md` | `rolling-restart-publication-reason-filter-20260517T151928Z.report.json` | `startup_active_gate_owner / snapshot_coverage` | selected snapshot source timeout on node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`; coverage `0/5`; publication and priority frozen upstream | `active` |

## Sprint LLM Trap List

1. Do not reopen the closed active-gate harness proof unless canonical evidence
   reselects `startup_active_gate_owner / snapshot_coverage` as the first
   frontier.
2. Do not split to operation workflow solely because a residual witness exists;
   first prove publication is correctly waiting on
   `operation_workflow_owner / rebalancer_handoff`.
3. Do not widen timeout budgets or active-gate admission to hide publication
   convergence.
4. Do not chase readiness support while publication convergence is first
   frontier.
5. Do not start runtime edits before the publication-convergence probe names the
   exact owner file path and required progress mechanism.
6. Do not write new representative artifacts with placeholder timestamps such
   as `T000000Z`; use a real timestamp or unique run id.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo. This sprint must not implement
Pro or Enterprise behavior.

## Package Queue

1. [Startup Active Gate Snapshot Coverage Owner Reconcile Closure](../packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / snapshot_coverage`
   - Purpose: consume the completed canonical handoff contract and implement
     the owner-key reconcile path required by
     `reconcile_owner_membership_publication`.
   - Entry condition: handoff-contract sprint closed as reduced; fresh
     representative evidence still times out at active-gate snapshot coverage.
   - Result: `migrated`. Focused owner-key reconcile, bounded remote wake-up,
     and replica operation router replacement-key proof passed; fresh
     representative evidence promoted a split operation workflow residual.
2. [Priority Recovery operation_workflow_owner rebalancer_handoff Residual](../packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `operation_workflow_owner / rebalancer_handoff`
   - Purpose: prove or split the `recovering_in_flight` handoff residual now
     blocking priority recovery after bounded direct wake-ups reach replica
     CREATE_REPLICA handling.
   - Entry condition: predecessor package closed as migrated; canonical
     priority residual extraction reports a split and this is the first split
     group.
   - Acceptance: representative `rolling-restart` is green, residual reduces
     to `operation_workflow_owner / workflow_progress`, or fresh evidence
     migrates/classifies to a narrower replica lifecycle owner with concrete
     operation and handler state.
   - Result: `reduced`. Duplicate CREATE_REPLICA idempotency for local
     `PENDING`/`CREATING` replicas now emits canonical owner progress, and
     fresh representative evidence drains the `rebalancer_handoff` residual.
3. [Rolling Restart Canonical Frontier Steering Repair](../packages/done-20260515-rolling-restart-canonical-frontier-steering-repair.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / snapshot_coverage`
   - Purpose: repair sprint, track, release, and current-blocker state after
     fresh canonical evidence kept the representative first frontier on
     active-gate snapshot coverage while the priority-recovery extractor
     reported only subordinate workflow-progress evidence.
   - Entry condition: previous package pushed with the sprint pointing at
     `operation_workflow_owner / workflow_progress` as active work despite
     `work:evidence-summary` and `analyze:causal-model` selecting
     `active_gate_snapshot_coverage`.
   - Acceptance: exactly one active package remains, current-blocker names
     `startup_active_gate_owner / snapshot_coverage`, workflow-progress is
     parked as dependency/sub-frontier evidence, and runtime resume requires
     real review subagent proof.
4. [Priority Recovery operation_workflow_owner workflow_progress Residual](../packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `operation_workflow_owner / workflow_progress`
   - Purpose: workflow-progress package for the prior residual inventory:
     representative extraction reported one unsplit
     `operation_workflow_owner / workflow_progress` group with three
     `spread_satisfied_in_flight` witnesses on
     `control_plane_publications-p1`, `replica_operations-p1`, and
     `sql_transaction_participants-p1`.
   - Entry condition: the remaining publication visibility target proof closed
     as migrated; latest evidence reports `Split required: false` with three
     workflow-progress witnesses and causal-model wait evidence names
     `advance_existing_operation`.
   - Activation result: activated after owner-boundary migration proof from
     `startup_active_gate_owner / snapshot_coverage`; a real review subagent,
     fix subagent or explicit not-needed result, and implementation subagent
     were recorded before runtime implementation closed.
   - Result: `reduced`. Dispatch-pending re-entry now schedules from the
     normalized operation-owner snapshot and selected witness operation. Fresh
     representative evidence reduced the workflow-progress residual from three
     witnesses to one `control_plane_publications-p1` witness.
5. [Priority Recovery operation_workflow_owner workflow_progress Control Plane Publication Pending](../packages/done-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `operation_workflow_owner / workflow_progress`
   - Purpose: active package for the single remaining
     `control_plane_publications-p1` `spread_satisfied_in_flight` witness.
   - Entry condition: predecessor workflow-progress package closed as reduced;
     fresh representative evidence reports `Split required: false` with one
     workflow-progress witness and causal-model wait evidence names
     `advance_existing_operation`.
   - Activation result: active after reduced proof from the prior
     workflow-progress package; a real review subagent, fix subagent or
     explicit not-needed result, and implementation subagent are required before
     runtime implementation closes.
   - Acceptance: the remaining `control_plane_publications-p1` witness drains,
     splits to a narrower workflow/repository/dispatch owner, or becomes proven
     non-frontier without timeout increases, active-gate admission relaxation,
     or publication handoff rewrites.
   - Result: `migrated`. No-confirm transition persistence now records the
     owner-persisted transition visibility witness before syncing incomplete
     operation observation. Fresh representative evidence reports zero
     priority-recovery residual witnesses and migrates the blocker back to
     `startup_active_gate_owner / snapshot_coverage` with
     `pendingReconcileCount=2`.
6. [Startup Active Gate Snapshot Coverage Owner Reconcile Remaining Targets](../packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / snapshot_coverage`
   - Purpose: prove or reduce the remaining owner membership publication
     reconcile path for pending nodes
     `11601fe0-72d6-5853-8590-ec2881853e72` and
     `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` after workflow progress drained.
   - Entry condition: the control-plane publication pending package pushed as
     migrated; fresh representative evidence reports zero priority-recovery
     witnesses, `snapshotCoverage=2/5`, producer selected membership
     seed-only, and handoff `pendingReconcileCount=2`.
   - Acceptance: representative `rolling-restart` is green,
     `pendingReconcileCount`, producer selected membership, or snapshot
     coverage improves with focused owner proof, or canonical evidence reports
     one membership publication owner outcome:
     `published_visible`, `write_deferred`, `pressure_deferred`,
     `target_blocked`, or `no_change`.
6. [Publication Active-Gate Reconcile Bridge Simplification](../packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / publication_reconcile_bridge`
   - Purpose: after the active owner-reconcile closure package lands,
     centralize canonical handoff target selection, narrow reconcile-only
     catch-up signaling, and remove broad repair-deferred snapshot rebuild as
     the reconcile mechanism.
   - Entry condition: the active steering repair package is done and fresh
     context confirms the duplicate bridge shape remains in scope, or a
     successor startup active-gate package explicitly promotes this bridge.
   - Activation result: active after the steering repair closed; fresh
     handoff-probe evidence still requires
     `reconcile_owner_membership_publication` with
     `runtimePromotionAllowed=false`.
   - Acceptance: the bridge has one canonical target helper, admin callers
     submit owner reconcile intent without reconstructing handoff semantics,
     focused admin/publication tests stay green, and representative
     `rolling-restart` intent is preserved.
   - Result: `same-frontier-reduced`. Canonical handoff target selection is
     centralized, broad repair-deferred snapshot rebuild catch-up is replaced
     by a narrow owner publication reconcile path, awaited direct reconcile is
     preferred when available, and fresh representative evidence reduces the
     handoff to one pending reconcile target while remaining red on
     `startup_active_gate_owner / snapshot_coverage`.
6. [Startup Active Gate Snapshot Coverage Final Reconcile Target](../packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / snapshot_coverage`
   - Purpose: prove why the final handoff pending reconcile target remains
     outside durable publication and selected snapshot coverage after the
     bridge became canonical.
   - Entry condition: bridge simplification pushed as same-frontier-reduced;
     fresh evidence still selects `active_gate_snapshot_coverage`,
     `pendingReconcileCount=1`, and `runtimePromotionAllowed=false`, while
     priority-recovery residual extraction now reports three subordinate
     `operation_workflow_owner / workflow_progress` witnesses that remain
     parked because active-gate snapshot coverage is still the first frontier.
   - Acceptance: representative `rolling-restart` is green, pending reconcile
     and snapshot coverage are reduced with focused owner proof, or fresh
     canonical evidence migrates to a narrower owner boundary with concrete
     next action.
   - Current result: `same-frontier`. The admin readback contract is tightened,
     but fresh representative evidence still reports snapshot coverage `2/5`,
     seed-only published active membership, `pendingReconcileCount=4`, and
     `runtimePromotionAllowed=false`.
7. [Startup Active Gate Seed Publication Visibility Proof](../packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / snapshot_coverage`
   - Purpose: prove why durable membership publication visibility remains
     seed-only after awaited diagnostics-grade reconcile readback, before any
     broader runtime edit or workflow-progress activation.
   - Entry condition: final reconcile readback package is pushed as
     same-frontier; fresh evidence still selects `active_gate_snapshot_coverage`
     with `missingPublishedCount=4`, `pendingReconcileCount=4`,
     `snapshotCoverage=2/5`, and subordinate workflow-progress witnesses.
   - Acceptance: representative `rolling-restart` is green, durable
     publication visibility or snapshot coverage improves with focused owner
     proof, or canonical evidence migrates to a narrower owner boundary with
     concrete next action.
   - Result: `reduced`. The coordinator returns the durable readback row for
     explicit handoff targets, admin snapshots carry the awaited reconcile
     observation before stale diagnostics reads, focused tests and guardrails
     pass, and the representative rerun reduces consumer
     `pendingReconcileCount` from `4` to `3` while clearing workflow-progress
     residual witnesses. The gate remains red on `active_gate_snapshot_coverage`
     with producer published membership still seed-only.
8. [Startup Active Gate Remaining Publication Lag Proof](../packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / snapshot_coverage`
   - Purpose: prove why producer publication convergence remains seed-only
     after the awaited handoff reconcile readback path can return and carry a
     widened publication row.
   - Entry condition: seed publication visibility package is pushed as
     reduced; fresh evidence still selects `active_gate_snapshot_coverage`,
     producer `missingPublishedCount=4`, consumer `pendingReconcileCount=3`,
     `snapshotCoverage=2/5`, and zero workflow-progress residual witnesses.
   - Acceptance: representative `rolling-restart` is green, producer
     missingPublishedCount or consumer pendingReconcileCount is reduced with
     focused owner proof, snapshot coverage improves, or canonical evidence
     migrates to a narrower owner boundary with concrete next action.
   - Result: `reduced`. The active-gate publication diagnostics
     selector now prefers a newer or wider durable published fallback over
     stale seed-only readiness diagnostics when readiness has no owner recovery
     evidence. Focused admin tests and guardrails pass. Fresh representative
     evidence reduces the consumer handoff to `pendingReconcileCount=1` for
     `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, while producer published
     membership remains seed-only with `missingPublishedCount=4` and snapshot
     coverage remains `2/5`.
9. [Startup Active Gate Final Owner Publication Target Proof](../packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / snapshot_coverage`
   - Purpose: prove the final pending owner publication target by classifying
     producer durable publication truth, active-gate observation, and
     subordinate workflow progress before promoting runtime files.
   - Entry condition: remaining publication lag package is pushed as reduced;
     fresh evidence still selects `active_gate_snapshot_coverage`, producer
     `missingPublishedCount=4`, consumer `pendingReconcileCount=1` for
     `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, `snapshotCoverage=2/5`, and one
     subordinate workflow-progress witness.
   - Acceptance: representative `rolling-restart` is green,
     `pendingReconcileCount` reaches `0`, producer `missingPublishedCount` or
     snapshot coverage improves with focused owner proof, or canonical evidence
     migrates to a narrower owner boundary with concrete next action.
   - Runtime promotion rule: the package must refresh the causal edge table
     first and then promote only the runtime files owned by the selected
     surface: producer publication truth, active-gate observation,
     workflow-progress migration, or architecture-gap handoff.
   - Result: `reduced`. The prior active-gate observation selector slice is
     closed and pushed in commit `1047df0c`. Fresh representative evidence
     reports all five nodes ACTIVE, but still selects
     `active_gate_snapshot_coverage` with selected producer membership
     seed-only, `missingPublishedCount=4`, `snapshotCoverage=2/5`,
     `pendingReconcileCount=1`, and a remaining pending target
     `11601fe0-72d6-5853-8590-ec2881853e72`.
10. [Startup Active Gate Remaining Publication Visibility Target Proof](../packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `startup_active_gate_owner / snapshot_coverage`
   - Purpose: prove why the remaining one-node publication visibility target
     remains outside selected publication coverage after all nodes reach
     ACTIVE and active-gate handoff reconcile fallback is honored.
   - Entry condition: final owner publication target proof is pushed as
     reduced; fresh evidence still selects `active_gate_snapshot_coverage`
     with `active=5/5`, selected producer membership seed-only,
     `missingPublishedCount=4`, `snapshotCoverage=2/5`,
     `pendingReconcileCount=1` for
     `11601fe0-72d6-5853-8590-ec2881853e72`, and three subordinate
     workflow-progress witnesses.
   - Acceptance: representative `rolling-restart` is green,
     `pendingReconcileCount` reaches `0`, producer `missingPublishedCount` or
     snapshot coverage improves with focused owner proof, or canonical evidence
     migrates to a narrower owner boundary with concrete proof.
   - Runtime promotion rule: prove whether the remaining target belongs to
     producer publication truth, active-gate observation, or a canonical
     workflow-progress migration before promoting runtime files.
   - Result: `migrated`. The refreshed evidence still shows
     `active_gate_snapshot_coverage` as the visible topology/causal first
     frontier, but the causal-edge table selects
     `workflow-progress-migration`: `analyze:priority-recovery-residuals`
     reports one unsplit `operation_workflow_owner / workflow_progress` group
     with three `spread_satisfied_in_flight` witnesses, and causal-model wait
     evidence names `advance_existing_operation`. No startup active-gate
     runtime file is promoted by this proof package.

No additional package may be added merely to defer owner-key reconcile from the
active startup active-gate package. The bridge simplification and earlier
visibility proof packages are closed context. The current package continues on
the same representative owner boundary until it either makes the active-gate
handoff consume a structured membership publication owner outcome, turns the
gate green, or canonical evidence changes the semantic owner, boundary, or next
required action.

## Current Continuation Packages

[Startup Active Gate Selected Snapshot Source Timeout](../packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md)

- Lane: `causal-escalation`
- Owner boundary:
  `startup_active_gate_owner / snapshot_coverage`
- Purpose: decide the four-way blocker split after
  `discovery_node_coverage_gap` disappeared: bad snapshot-source selection,
  forced repair stall, authoritative nodes query pressure, or inherited
  readiness no-progress.
- Result: `reduced`. The focused owner path now advances the late forced
  active-gate snapshot retry through direct authoritative repair. The
  representative rerun stayed red, but `selected_snapshot_source_timeout`
  disappeared while publication ACK and priority recovery stayed satisfied.
  The next selected edge is authoritative control snapshot repair participant
  failure.

[Startup Active Gate Authoritative Repair Participant Failure](../packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md)

- Lane: `causal-escalation`
- Owner boundary:
  `startup_active_gate_owner / snapshot_coverage`
- Purpose: build the narrow fixture/probe that separates authoritative repair
  participant connection failure from inherited readiness no-progress and
  authoritative nodes query pressure.
- Entry condition: selected-source timeout package closed as `reduced`; fresh
  representative evidence reports `selected_snapshot_source_timeout` absent,
  `snapshotCoverageNodeCount=0/5`, and selected error
  `Authoritative control snapshot repair failed: nodes:Connection to node
  7493b0ab-a054-5fad-a91b-5e331db29304 closed`.
- Acceptance: snapshot coverage improves above `2/5`, the representative
  frontier migrates to a genuinely new owner boundary, or representative
  `rolling-restart` turns green.
- Result: `reduced`. The package separated the four possible causes and met
  the metric-moving target by removing `discovery_node_coverage_gap` from the
  representative report. The next selected owner path is authoritative control
  snapshot nodes query pressure; publication ACK, priority recovery, timeout
  budget increases, and active-gate admission remain frozen.

[Startup Active Gate Authoritative Nodes Query Pressure](../packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md)

- Lane: `causal-escalation`
- Owner boundary:
  `startup_active_gate_owner / snapshot_coverage`
- Purpose: build the replayable authoritative nodes query pressure
  fixture/probe for selected source
  `11601fe0-72d6-5853-8590-ec2881853e72`.
- Entry condition: predecessor closed as `reduced`; fresh representative
  evidence has `discovery_node_coverage_gap` and
  `selected_snapshot_source_timeout` absent, snapshot coverage `0/5`, and
  selected error `Authoritative control snapshot repair failed:
  nodes:Query timeout after 3000ms`.
- Acceptance: snapshot coverage improves above `2/5`,
  `discovery_node_coverage_gap` stays absent and the frontier migrates to a
  genuinely new owner boundary, or representative `rolling-restart` turns
  green.

[Startup Active Gate Snapshot Coverage Owner Reconcile After ACK Drain](../packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md)

- Lane: `causal-escalation`
- Owner boundary:
  `startup_active_gate_owner / snapshot_coverage`
- Purpose: preserve bounded retry evidence for a rejected owner publication
  handoff after publication ACK drained.
- Entry condition: fresh representative evidence selected
  `active_gate_snapshot_coverage` with
  `publicationActiveGateHandoffReasonCode=owner_reconcile_pending`,
  `publicationActiveGateHandoffPendingReconcileCount=5`, and
  `snapshotCoverageNodeCount=6/7`.
- Result: `reduced`. Focused admin snapshot tests and static guardrails pass;
  the representative rerun no longer detects the active-gate handoff or
  pending reconcile nodes. The first frontier remains
  `startup_active_gate_owner / snapshot_coverage`, now with
  `selected_snapshot_source_timeout` and `snapshotCoverageNodeCount=0/5`.

[Startup Active Gate Selected Snapshot Source Timeout After Bounded Handoff Retry](../packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md)

- Lane: `causal-escalation`
- Owner boundary:
  `startup_active_gate_owner / snapshot_coverage`
- Purpose: build the replayable selected-source timeout fixture/probe for node
  `11601fe0-72d6-5853-8590-ec2881853e72` and reduce or migrate the current
  active-gate snapshot coverage blocker.
- Entry condition: predecessor pushed as reduced; latest representative
  evidence has no detected handoff, pending reconcile `0`, snapshot coverage
  `0/5`, and selected source timeout after `806ms`.
- Acceptance: selected source timeout reduces, snapshot coverage improves above
  `0/5`, the frontier migrates to a genuinely new owner boundary, or
  representative `rolling-restart` turns green.
- Result: `reduced`. Focused terminal progress now preserves the best clean
  snapshot-coverage witness when the selected witness regresses to a
  zero-coverage timeout. The representative rerun improved snapshot coverage to
  `4/5` and exposed the pending handoff reconcile edge with
  `pendingReconcileCount=3`.

[Startup Active Gate Pending Handoff Reconcile After Selected Timeout Reduction](../packages/done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md)

- Lane: `causal-escalation`
- Owner boundary:
  `startup_active_gate_owner / snapshot_coverage`
- Purpose: make the pending publication active-gate handoff reconcile edge
  replayable after selected-source timeout reduction exposed
  `pendingReconcileCount=3`.
- Entry condition: selected-source timeout package closed as `reduced`; fresh
  representative evidence still selected `active_gate_snapshot_coverage` with
  snapshot coverage `4/5`, repair-deferred snapshot observation, and pending
  handoff reconcile for three nodes.
- Result: `same-frontier`. The replay fixture records the exact three pending
  reconcile nodes and repair-deferred selected snapshot observation. No
  production runtime files were promoted, and the representative artifact
  remains red at `active_gate_snapshot_coverage` with
  `pendingReconcileCount=3`.

[Startup Active Gate Startup Publication Lag Snapshot Projection](../packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md)

- Lane: `causal-escalation`
- Owner boundary:
  `startup_active_gate_owner / snapshot_coverage`
- Purpose: implement the bounded `reconcile_owner_membership_publication`
  slice selected by the latest handoff probe, after the predecessor made the
  pending reconcile edge replayable.
- Entry condition: predecessor pushed as same-frontier in commit `5888ab0c`;
  latest representative evidence still selects `active_gate_snapshot_coverage`
  with `runtimePromotionAllowed=false`, `pendingReconcileCount=3`, snapshot
  coverage `4/5`, and priority residual witnesses at zero.
- Acceptance: pending reconcile count reduces below `3`, snapshot coverage
  improves beyond `4/5`, canonical evidence migrates to a genuinely new owner
  boundary, or representative `rolling-restart` turns green.
- Result: `reduced`. Focused harness projection now adds canonical published
  active membership to snapshot coverage only under the pending
  owner-reconcile handoff, reducing `pendingReconcileCount=3` to `1` while
  keeping publication ACK and priority residuals frozen.

## Working Rules

1. Work one active package at a time.
2. Start with `npm run work:context`.
3. Use `npm run work:llm-start` after this sprint/package is active.
4. Use canonical extractors before raw JSON, broad search, or logs:
   `work:evidence-summary`, `analyze:topology-convergence`,
   `analyze:causal-model`, `analyze:owner-files`,
   `analyze:priority-recovery-residuals`, and `analyze:distributed-failure`.
5. Required subagent sequencing must be completed before implementation
   proceeds beyond review/fix readiness.
6. Runtime files listed as `candidateRuntimeFiles` are read-only until exact
   owner-file or focused probe evidence promotes them into `writeScope` and
   `commitScope`.
7. Active-gate admission must not pass while `runtimePromotionAllowed=false`.
8. Representative reruns are checkpoints after focused owner/consumer proof.
9. A package cannot close with unresolved in-scope residuals, duplicate
   handoff truth, placeholder ledgers, or unpushed focused commits.
10. Before any next runtime package promotes files, it must fill a causal edge
    table covering producer publication durable truth, active-gate observation,
    and workflow progress. Runtime `writeScope` must match the owner selected
    by that table, or the package must stop as a handoff/architecture concern.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:package:doctor -- --suggest work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md`
4. `npm run work:validate -- --entry work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md`
5. `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
6. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe`
7. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture`
8. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
9. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
10. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
11. Real review/fix/implementation subagent proof before runtime implementation starts.
12. Focused publication owner tests, static guardrails, and representative
    `rolling-restart` after the package has implementation proof.

## Closure Rules

The sprint cannot close until:

1. The active package is closed as `done-...` with a valid Commit And Push
   Ledger.
2. `rolling-restart` is green, or the remaining red evidence is explicitly
   migrated/classified to a narrower owner boundary.
3. `work/sprints/current-blocker.*` names final green evidence or the fresh
   narrower blocker.
4. No in-scope consumer reconstructs publication-to-active-gate handoff truth
   independently of the canonical contract.
5. Active-gate admission remains strict for partial handoff truth.
6. The final note states whether the original gate is green, migrated,
   same-frontier, classification-only, or architecture-gap.

## Closure Snapshot

1. Final package:
   `work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md`.
2. Successor package:
   `work/packages/done-20260516-topology-publication-convergence-frontier-causal-edge.md`.
3. Final representative artifact:
   `test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`.
4. Result: migrated. The active-gate owner-reconcile path no longer reports
   `owner_reconcile_service_unavailable`; the active-gate handoff contract has
   `pendingReconcileCount=0` and `nextAction=wait_owner_recovery`.
5. Remaining red frontier:
   `publication_ack_convergence / topology_publication_owner /
   publication_convergence`, with dominant reason `publication_ack_blocked`.
6. Post-detour update: systems-pattern hardening and completion closure are now
   done. The publication ACK continuation package is closing as migrated, and
   the active continuation returns to startup active-gate snapshot coverage.

## Post-Systems-Pattern Continuation Package

[Rolling Restart Post Systems Pattern Checkpoint](../packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md)

- Lane: `scenario-release-gate`
- Owner boundary:
  `release_gate_owner / rolling_restart_post_systems_pattern_checkpoint`
- Purpose: run and classify one fresh `rolling-restart` representative artifact
  after systems-pattern hardening and completion closure landed.
- Entry condition: the rolling-restart gate is explicitly resumed, the package
  is moved from `todo` to `active`, and current-blocker is regenerated from the
  active package before `npm run work:llm-start`.
- Acceptance: representative `rolling-restart` is green, or canonical
  extractors select a fresh owner-boundary successor package from the new
  artifact.
- Guardrail: the old pending-reconcile active-gate trace is historical because
  the final pre-detour handoff had `pendingReconcileCount=0` and
  `nextAction=wait_owner_recovery`.
- Result: red same-frontier successor selected. The fresh checkpoint report is
  `test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`;
  canonical extractors select `publication_ack_convergence` under
  `topology_publication_owner / publication_convergence` with
  `publication_ack_blocked` / `pending_acks_present`. All five nodes reached
  `ACTIVE`, but the active gate timed out with `snapshotCoverage=2/5`.
  Producer recovery is waiting for ACK (`publicationOwnerAckState=waiting_for_ack`,
  `freshnessFence=ack_lag`, `recoveryOutcome=waiting_for_ack`,
  `streamOutcome=waiting_for_ack`), active-gate handoff has
  `pendingReconcileCount=0` and `nextAction=wait_owner_recovery`, and
  priority recovery remains subordinate with two unsplit workflow-progress
  witnesses.

## Current Next Action

Continue with the startup active-gate selected snapshot source timeout
successor selected by the latest representative artifact:

```text
work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md
test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json
```

The current first frontier is
`startup_active_gate_owner / snapshot_coverage`: fresh evidence reports
`active_gate_snapshot_coverage`, `active_gate_timed_out`,
`snapshotCoverageNodeCount=0/5`,
`selectedSnapshotSourceCause=selected_snapshot_source_timeout`,
`selectedSnapshotNodeId=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
`selectedSnapshotTimeoutMs=100`, and no publication active-gate handoff.
Publication ACK is satisfied and priority residual extraction reports zero
witnesses.

Run the required review/fix/implementation subagent sequence before runtime
edits for the successor package. Keep publication ACK, priority recovery,
timeout budget increases, active-gate admission, publication truth,
selected-source timeout handling, terminal-progress selection, and readiness
support frozen unless canonical evidence selects them again. The next proof
target remains metric-moving: reduce `pendingReconcileCount`, improve snapshot
coverage, migrate to a genuinely new owner boundary, or turn representative
`rolling-restart` green.
