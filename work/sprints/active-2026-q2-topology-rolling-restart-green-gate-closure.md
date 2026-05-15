# Topology Rolling-Restart Green Gate Closure Sprint

Status: active. This sprint starts after
`done-2026-q2-topology-convergence-complexity-reduction.md` reduced the
publication-to-active-gate handoff complexity.

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
`test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json`.

Canonical state after the control-plane publication pending proof:

1. `work:evidence-summary` selects `active_gate_snapshot_coverage` as the first
   frontier.
2. Representative owner boundary:
   `startup_active_gate_owner / snapshot_coverage`.
3. Dominant reason: `active_gate_timed_out`.
4. Current reasons:
   `active_gate_timed_out`, `owner_reconcile_pending`,
   `snapshot_coverage_incomplete`, and `snapshot_repair_deferred`.
5. All nodes now report active: `active=5/5`.
6. Producer publication ACK convergence is satisfied, but selected producer
   membership remains seed-only and producer `missingPublishedCount=4`.
7. The canonical handoff probe reports `missingEdge=null` and
   `contractEdge=publication_active_gate_handoff_contract`.
8. Handoff contract state is `pending` with
   `nextAction=reconcile_owner_membership_publication`,
   consumer `pendingReconcileCount=2`, pending nodes
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   and `8be8d30f-4499-5eed-865c-71b4d529a67a`, with
   `runtimePromotionAllowed=false`.
9. Active-gate snapshot coverage remains `2/5`; selected snapshot observation
   remains `repair_deferred` / `deferred_refresh` / `deferred` / `deferred` /
   `retry` with
   `cache_stale_watermark|discovery_node_coverage_gap|stale_replica_operations_in_flight`.
10. `analyze:priority-recovery-residuals` now reports zero witnesses; the
    workflow-progress residual is drained.
11. `causal-model` marks `priority_recovery_partition_progress` satisfied and
    keeps `active_gate_snapshot_coverage` as the first critical path.
12. The closed package is
    `work/packages/done-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md`;
    the next package should own `startup_active_gate_owner / snapshot_coverage`
    for the remaining owner membership publication reconcile path.
13. Active-gate admission must remain strict until the owner reconcile path
    produces durable coverage.

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

No additional package may be added merely to defer owner-key reconcile from
the original active-gate owner package. That package is now closed as migrated.
The queued bridge simplification package is a follow-on only; it must not start
until fresh context confirms the bridge remains the next startup active-gate
concern. The workflow-progress package is now active because canonical evidence
records owner-boundary migration proof; any other split is allowed only when
canonical evidence changes the semantic owner, boundary, or next required
action.

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
3. `npm run work:package:doctor -- --suggest work/packages/active-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md`
4. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json`
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --handoff-probe`
6. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json`
7. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --markdown`
8. `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
9. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json`
10. `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
11. `npm run work:subagent-prompt -- --role review --package work/packages/active-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md`
12. Real review/fix/implementation subagent proof before runtime implementation starts.
13. Focused owner tests, static guardrails, and representative `rolling-restart`
    after the package has implementation proof.

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

## Current Next Action

Continue with the active single-witness workflow-progress package:

```text
work/packages/active-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md
```

Run the required review/fix/implementation sequence, then prove or split the
single `control_plane_publications-p1` workflow-progress witness for operation
`0a3b14cf-b731-4279-a07b-3a755ead1a17` without relaxing active-gate admission,
rewriting publication handoff truth, or increasing timeouts.
