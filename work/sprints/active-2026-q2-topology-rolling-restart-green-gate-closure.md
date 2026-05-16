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
`test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json`.

Canonical state for the current deferred-refresh discovery-gap package:

1. `work:evidence-summary` selects `active_gate_snapshot_coverage` as the first
   frontier.
2. Representative owner boundary:
   `startup_active_gate_owner / snapshot_coverage`.
3. Dominant reason: `active_gate_timed_out`.
4. Priority recovery is satisfied with zero residual witnesses.
5. Publication ACK convergence remains satisfied with `pendingAckCount=0`.
6. Active-gate snapshot coverage is blocked with `snapshotCoverageNodeCount=2`,
   `expectedNodeCount=5`, `pendingReconcileCount=3`, selected source
   `11601fe0-72d6-5853-8590-ec2881853e72`, and selected snapshot observation
   `repair_deferred` / `deferred_refresh` / `deferred` / `retry` with
   `discovery_node_coverage_gap`.
7. The current active package is
   `work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md`.
   It must separate deferred-refresh discovery-node coverage from
   snapshot-source selection, forced repair stalls, authoritative query
   pressure, and inherited readiness support without reopening priority
   recovery or publication ACK convergence.

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
3. `npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md`
4. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json`
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json --handoff-probe`
6. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json`
7. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json --markdown`
8. `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
9. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json`
10. `npm run work:subagent-prompt -- --role review --package work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md`
11. Real review/fix/implementation subagent proof before runtime implementation starts.
12. Focused owner tests, static guardrails, and representative `rolling-restart`
    after the package has implementation proof.
13. `node --test test/control-plane/membership-publication-coordinator-main-stage-2.js`
14. `node --test test/control-plane/publication-active-gate-handoff-contract.test.js`
15. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json`
16. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json --handoff-probe`
17. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json`

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

Continue with the active-gate snapshot coverage deferred-refresh discovery-gap
package:

```text
work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md
test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json
```

Keep the completed post-systems-pattern checkpoint package and artifact as
predecessor/context:

```text
work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md
test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json
```

Use the final pre-detour representative artifact only as historical handoff
context:

```text
test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
```

The repeated priority recovery workflow-progress package drained the
`spread_satisfied_in_flight` witnesses to zero and fresh representative evidence
marks `priority_recovery_partition_progress` satisfied. The current
representative first frontier is `active_gate_snapshot_coverage` under
`startup_active_gate_owner / snapshot_coverage`, with `pendingReconcileCount=3`,
selected source `11601fe0-72d6-5853-8590-ec2881853e72`, and snapshot coverage
still at 2/5. The selected snapshot observation is
`repair_deferred` / `deferred_refresh` / `deferred` / `retry` with
`discovery_node_coverage_gap`. The next work is to run the required subagent
sequence for the active startup active-gate package, then prove whether
`deferred_refresh` discovery-node coverage is owned by snapshot-source
selection, forced repair stall, authoritative nodes query pressure, or inherited
readiness support. Keep publication ACK convergence and priority recovery frozen
unless canonical evidence selects them again.
