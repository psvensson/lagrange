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
`test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json`.

Canonical state at sprint creation:

1. `work:evidence-summary` selects `active_gate_snapshot_coverage` as first
   frontier.
2. Representative owner boundary:
   `startup_active_gate_owner / snapshot_coverage`.
3. Dominant reason: `active_gate_timed_out`.
4. Current reasons:
   `active_gate_timed_out`, `owner_reconcile_pending`,
   `snapshot_coverage_incomplete`, and `snapshot_repair_deferred`.
5. Publication ACK convergence is satisfied.
6. The canonical handoff probe reports `missingEdge=null` and
   `contractEdge=publication_active_gate_handoff_contract`.
7. Handoff contract state is `pending` with
   `nextAction=reconcile_owner_membership_publication`,
   `pendingReconcileCount=3`, and `runtimePromotionAllowed=false`.
8. Active-gate admission must remain strict until the owner reconcile path
   produces durable coverage.

Current blocker after the first package:

1. The active-gate owner reconcile package closed as `migrated`.
2. All five nodes still report active, and the selected active-gate snapshot no
   longer reports `stale_replica_operations_in_flight`.
3. The canonical handoff contract remains pending with
   `publicationActiveGateHandoffPendingReconcileCount=3`.
4. `analyze:priority-recovery-residuals` reports `Split required: true`.
5. First split package:
   `operation_workflow_owner / rebalancer_handoff` with
   `recovering_in_flight` witnesses.
6. Parked paired split:
   `operation_workflow_owner / workflow_progress` with
   `spread_satisfied_in_flight` witnesses.

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
2. [Priority Recovery operation_workflow_owner rebalancer_handoff Residual](../packages/active-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md)
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
3. [Priority Recovery operation_workflow_owner workflow_progress Residual](../packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `operation_workflow_owner / workflow_progress`
   - Purpose: parked paired split for `spread_satisfied_in_flight` witnesses.
   - Entry condition: the rebalancer handoff package is green, reduced, split,
     or explicitly superseded by fresher canonical evidence.
   - Acceptance: workflow-progress witnesses drain, split, or become the next
     representative owner boundary after handoff progress is settled.
4. [Publication Active-Gate Reconcile Bridge Simplification](../packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary:
     `startup_active_gate_owner / publication_reconcile_bridge`
   - Purpose: after the active owner-reconcile closure package lands,
     centralize canonical handoff target selection, narrow reconcile-only
     catch-up signaling, and remove broad repair-deferred snapshot rebuild as
     the reconcile mechanism.
   - Entry condition: the active package is done, explicitly split, or
     superseded with canonical evidence; fresh context confirms the duplicate
     bridge shape remains in scope.
   - Acceptance: the bridge has one canonical target helper, admin callers
     submit owner reconcile intent without reconstructing handoff semantics,
     focused admin/publication tests stay green, and representative
     `rolling-restart` intent is preserved.

No additional package may be added merely to defer owner-key reconcile from
the original active-gate owner package. That package is now closed as migrated.
The queued bridge simplification package is a follow-on only; it must not start
until the operation workflow residual is green, reduced, explicitly split, or
superseded with canonical evidence. Any other split is allowed only when
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

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json`
4. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown`
5. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json`
6. `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown`
7. `npm run work:subagent-prompt -- --role implementation --package <package>`
8. Focused operation workflow handoff and replica lifecycle tests selected by
   the package.
9. Focused active-gate consumer proof only if the handoff fix changes
   admission-facing evidence.
10. Static guardrails on touched runtime, node, rebalancer, and tests.
11. Representative `rolling-restart`.
12. `npm run work:evidence-summary -- <fresh-report>`
13. `npm run analyze:topology-convergence -- <fresh-report> --handoff-probe`
14. `npm --silent run analyze:causal-model -- <fresh-report>`
15. `git diff --check -- <commitScope>`
16. `npm run work:validate -- --closure <package>`
17. Focused commit and push.

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

Continue with the active package:

```text
work/packages/active-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md
```

Implementation continues under the active rebalancer handoff package. Subagent
roles are recorded as `blocked-by-environment-policy` unless the user
explicitly asks for delegation.
