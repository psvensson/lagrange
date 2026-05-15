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
`test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`.

Canonical state after the rebalancer-handoff package and steering repair:

1. `work:evidence-summary` selects `active_gate_snapshot_coverage` as the first
   frontier.
2. Representative owner boundary:
   `startup_active_gate_owner / snapshot_coverage`.
3. Dominant reason: `active_gate_timed_out`.
4. Current reasons:
   `active_gate_timed_out`, `owner_reconcile_pending`,
   `snapshot_coverage_incomplete`, and `snapshot_repair_deferred`.
5. Publication ACK convergence is satisfied and priority recovery is classified
   as satisfied in the causal topology graph.
6. The canonical handoff probe reports `missingEdge=null` and
   `contractEdge=publication_active_gate_handoff_contract`.
7. Handoff contract state is `pending` with
   `nextAction=reconcile_owner_membership_publication`,
   `pendingReconcileCount=4`, and `runtimePromotionAllowed=false`.
8. Selected snapshot observation remains `repair_deferred` with
   `stale_replica_operations_in_flight`.
9. `analyze:priority-recovery-residuals` reports `Split required: false` with
   one subordinate `operation_workflow_owner / workflow_progress` witness on
   `control_plane_publications-p1` in `spread_satisfied_in_flight`.
10. The workflow-progress package is parked as dependency/sub-frontier evidence
    unless focused extractors promote it back to the representative first
    frontier.
11. Active-gate admission must remain strict until the owner reconcile path
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
3. [Rolling Restart Canonical Frontier Steering Repair](../packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md)
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
4. [Priority Recovery operation_workflow_owner workflow_progress Residual](../packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `operation_workflow_owner / workflow_progress`
   - Purpose: parked dependency package for the remaining
     `spread_satisfied_in_flight` workflow-progress witness on
     `control_plane_publications-p1`.
   - Entry condition: the rebalancer handoff package closed as reduced; fresh
     evidence reports `Split required: false` with one
     `operation_workflow_owner / workflow_progress` witness.
   - Activation gate: fresh canonical evidence must promote workflow progress
     ahead of active-gate snapshot coverage or record owner-boundary migration
     proof; a real review subagent must run before implementation starts.
   - Acceptance on future activation: workflow-progress witnesses drain, split,
     or become the next representative owner boundary after handoff progress is
     settled.
5. [Publication Active-Gate Reconcile Bridge Simplification](../packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary:
     `startup_active_gate_owner / publication_reconcile_bridge`
   - Purpose: after the active owner-reconcile closure package lands,
     centralize canonical handoff target selection, narrow reconcile-only
     catch-up signaling, and remove broad repair-deferred snapshot rebuild as
     the reconcile mechanism.
   - Entry condition: the active steering repair package is done and fresh
     context confirms the duplicate bridge shape remains in scope, or a
     successor startup active-gate package explicitly promotes this bridge.
   - Acceptance: the bridge has one canonical target helper, admin callers
     submit owner reconcile intent without reconstructing handoff semantics,
     focused admin/publication tests stay green, and representative
     `rolling-restart` intent is preserved.

No additional package may be added merely to defer owner-key reconcile from
the original active-gate owner package. That package is now closed as migrated.
The queued bridge simplification package is a follow-on only; it must not start
until the steering repair closes and fresh context confirms the bridge remains
the next startup active-gate concern. The parked workflow-progress package must
not start unless canonical evidence promotes it or records owner-boundary
migration proof. Any other split is allowed only when canonical evidence
changes the semantic owner, boundary, or next required action.

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

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:package:schema`
4. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`
5. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown`
6. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe`
7. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`
8. `npm run work:current-blocker -- --write`
9. `npm run work:validate -- --entry work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md`
10. `git diff --check -- work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/tracks/topology-convergence.md work/releases/0.1-stabilization.md work/releases/0.1-dependency-map.md work/model-ledger.jsonl`
11. Focused commit and push for the steering repair.
12. Before any runtime package resumes:
   `npm run work:subagent-prompt -- --role review --package <package>` and a
   real review subagent ledger entry in that runtime package.

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

Continue with the active steering package:

```text
work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md
```

The rebalancer handoff package is closed as reduced. The workflow-progress
package is parked as dependent sub-frontier evidence because the canonical
first frontier remains `startup_active_gate_owner / snapshot_coverage`. Do not
start bridge simplification or workflow-progress runtime work until this
steering repair closes and fresh context confirms the next bounded runtime
concern. Any runtime package that starts next must record real review subagent
proof before implementation.
