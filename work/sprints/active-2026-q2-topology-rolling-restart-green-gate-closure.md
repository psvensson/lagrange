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
`test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`.

Canonical state after the publication diagnostics fallback proof:

1. `work:evidence-summary` selects `active_gate_snapshot_coverage` as the first
   frontier.
2. Representative owner boundary:
   `startup_active_gate_owner / snapshot_coverage`.
3. Dominant reason: `active_gate_timed_out`.
4. Current reasons:
   `active_gate_timed_out`, `owner_reconcile_pending`,
   `snapshot_coverage_incomplete`, and `snapshot_repair_deferred`.
5. Producer publication ACK convergence is satisfied, but
   `publishedActiveNodeIds` remains seed-only with
   `7493b0ab-a054-5fad-a91b-5e331db29304`; producer
   `missingPublishedCount=4`.
6. The canonical handoff probe reports `missingEdge=null` and
   `contractEdge=publication_active_gate_handoff_contract`.
7. Handoff contract state is `pending` with
   `nextAction=reconcile_owner_membership_publication`,
   consumer `pendingReconcileCount=1`, pending node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and
   `runtimePromotionAllowed=false`.
8. Active-gate snapshot coverage remains `2/5`; selected snapshot observation
   remains `repair_deferred` / `stale_usable` / `pending` / `idle` / `wait`
   with `cache_stale_watermark`.
9. `analyze:priority-recovery-residuals` reports one subordinate
   `operation_workflow_owner / workflow_progress` witness on
   `control_plane_publications-p1`, semantic state
   `spread_satisfied_in_flight`, and `Split required: false`.
10. The workflow-progress package remains parked because `work:evidence-summary`
    and causal model still select active-gate snapshot coverage as the first
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
4. [Priority Recovery operation_workflow_owner workflow_progress Residual](../packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `operation_workflow_owner / workflow_progress`
   - Purpose: parked dependency package for the current residual inventory:
     three `spread_satisfied_in_flight` workflow-progress witnesses on
     `control_plane_publications-p1`, `replica_operations-p1`, and
     `sql_transaction_participants-p1`.
   - Entry condition: the rebalancer handoff package closed as reduced; fresh
     evidence reports `Split required: false` with three subordinate
     `operation_workflow_owner / workflow_progress` witnesses.
   - Activation gate: fresh canonical evidence must promote workflow progress
     ahead of active-gate snapshot coverage or record owner-boundary migration
     proof; a real review subagent must run before implementation starts.
   - Acceptance on future activation: workflow-progress witnesses drain, split,
     or become the next representative owner boundary after handoff progress is
     settled.
5. [Publication Active-Gate Reconcile Bridge Simplification](../packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md)
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
8. [Startup Active Gate Remaining Publication Lag Proof](../packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md)
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
   - Current result: `reduced`. The active-gate publication diagnostics
     selector now prefers a newer or wider durable published fallback over
     stale seed-only readiness diagnostics when readiness has no owner recovery
     evidence. Focused admin tests and guardrails pass. Fresh representative
     evidence reduces the consumer handoff to `pendingReconcileCount=1` for
     `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, while producer published
     membership remains seed-only with `missingPublishedCount=4` and snapshot
     coverage remains `2/5`.

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
3. `npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md`
4. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json`
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe`
6. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json`
7. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown`
8. `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
9. `npm run work:subagent-prompt -- --role review --package work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md`
10. Real review/fix/implementation subagent proof before runtime implementation starts.
11. Focused owner tests, static guardrails, and representative `rolling-restart`
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

Commit and push the active remaining publication lag proof package, then open
the next bounded startup-active-gate snapshot-coverage package for the final
pending owner reconcile target:

```text
work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md
```

The workflow-progress package remains parked because the latest topology and
causal extractors keep active-gate snapshot coverage as the first frontier.
