# Topology Convergence Complexity Reduction Sprint

Status: done on 2026-05-15. This sprint superseded the stopped
`done-2026-q2-topology-convergence-residual-closure.md` sprint and is now
closed as reduced/classification-only.

## Goal

Reduce topology convergence complexity by replacing the repeated
publication/active-gate blocker chase with one canonical
publication-to-active-gate handoff contract.

The sprint is intentionally narrow. It exists to implement the concrete
simplification opportunities identified in the cross-boundary deep dive:

1. One canonical publication-to-active-gate handoff contract.
2. Admin snapshot behavior becomes observation-only plus owner-key reconcile
   scheduling.
3. Active membership vocabulary collapses into one explicit state model or
   decision table.
4. Diagnostics rank owner witnesses instead of re-deciding runtime truth.
5. Superseded staged reconstruction paths are deleted or structurally guarded.

This is not a scaffolding sprint. It is successful only when the runtime code,
direct consumers, diagnostics, harness replay, tests, deletion/guardrail work,
representative evidence, focused commit, and push are all complete.

## Stop Decision For Previous Sprint

The residual-closure sprint was stopped by human direction on 2026-05-15.

Reason:

1. Fresh evidence kept migrating across the publication and active-gate
   boundary.
2. Focused patches reduced local symptoms but left several consumers able to
   reconstruct overlapping handoff truth.
3. Continuing with another single-owner local patch would preserve the same
   complexity that caused the oscillation.
4. The next useful move is to reduce the boundary: one producer-owned handoff
   contract, one consumer grammar, and no duplicate runtime truth.

Stopped package retained as dormant context:

1. [Topology Active Gate Snapshot Coverage After Publication Handoff](../packages/superseded-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md)

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo. This sprint must not implement
Pro or Enterprise behavior.

## Current Evidence Snapshot

Latest representative artifact:
`test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json`.

Canonical state at sprint creation:

1. `work:evidence-summary` selects `active_gate_snapshot_coverage` as first
   frontier.
2. Representative owner boundary:
   `startup_active_gate_owner / snapshot_coverage`.
3. Dominant reason: `active_gate_timed_out`.
4. Publication ACK convergence is satisfied while the handoff remains
   inconsistent: `publication=PUBLISHED`, `pendingAck=0`,
   `publishedActive=1/5`, and `missingPublished=4`.
5. Active-gate selected snapshot coverage is `2/5` with
   `owner_reconcile_pending`, selected snapshot repair deferred, and
   `runtimePromotionAllowed=false`.
6. The handoff probe reports
   `publication_ack_to_active_gate_reconcile_missing`.
7. `analyze:priority-recovery-residuals` reports a subordinate
   `operation_workflow_owner / workflow_progress` witness for
   `control_plane_publications-p1`, but that is not promoted ahead of the
   handoff contract at sprint creation.

## Closure Evidence Snapshot

Fresh representative artifact:
`test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json`.

Closure state:

1. The canonical publication-to-active-gate handoff contract is implemented
   across runtime, admin projection, diagnostics, analyzer, harness replay,
   fixtures, and focused tests.
2. The handoff probe reports `missingEdge=null` and
   `contractEdge=publication_active_gate_handoff_contract`.
3. The canonical handoff contract reports `state=pending`,
   `reasonCode=owner_reconcile_pending`,
   `nextAction=reconcile_owner_membership_publication`,
   `pendingReconcileCount=3`, and `runtimePromotionAllowed=false`.
4. Representative `rolling-restart` remains red, but reduced: the remaining
   first frontier is `startup_active_gate_owner / snapshot_coverage`, not the
   publication-to-active-gate handoff contract.
5. No planned follow-on implementation remains inside this sprint's
   publication-to-active-gate handoff simplification scope.

## Complexity Reduction Contract

The canonical contract must carry, at minimum:

1. `publicationEpoch`
2. `expectedNodeIds`
3. `publishedActiveNodeIds`
4. `missingPublishedNodeIds`
5. `pendingRecoveryNodeIds`
6. `pendingReconcileNodeIds`
7. `runtimePromotionAllowed`
8. `state`
9. `reasonCode`
10. `nextAction`

Consumers may observe this contract, surface it, or enqueue owner-key work.
They may not rebuild equivalent handoff truth from local booleans, cache
fragments, diagnostics fields, stale snapshots, or independent branch piles.

## Package Queue

1. [Topology Publication Active Gate Handoff Contract Consolidation](../packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md)
   - Lane: `causal-escalation`
   - Owner boundary:
     `topology_publication_owner / publication_active_gate_handoff_contract`
   - Purpose: implement the entire simplification end to end: owner emission,
     active-gate consumption, admin observation-only cutover, diagnostics
     witness ranking, harness/replay grammar, and deletion or guardrails for
     superseded reconstruction paths.
   - Entry condition: residual-closure sprint stopped; latest canonical
     evidence still shows ACK closure and active-gate cohort truth split across
     several vocabularies.
   - Acceptance: no planned follow-on implementation remains inside the
     publication-to-active-gate handoff scope. Fresh representative evidence is
     green, reduced, migrated to a narrower owner boundary, classification-only
     with a concrete stop condition, or architecture-gap with a named owner.

No additional package may be added to this sprint merely to defer planned
implementation from the active package. A split is allowed only when canonical
evidence changes the semantic owner, boundary, or next required action.

## Working Rules

1. Work one active package at a time.
2. Start every package with `npm run work:context`.
3. Use `npm run work:llm-start` when package doctor, dirty scope,
   model-ledger, or representative evidence context is needed.
4. Use canonical extractors before raw JSON, broad search, or logs:
   `work:evidence-summary`, `analyze:topology-convergence`,
   `analyze:priority-recovery-residuals`, `analyze:distributed-failure`,
   `analyze:owner-files`, and `analyze:causal-model`.
5. Runtime owner-boundary and causal-escalation subagent sequencing must be
   recorded before implementation starts unless the environment or human
   direction records an allowed waiver state.
6. Runtime files listed as `candidateRuntimeFiles` are read-only until exact
   owner-file or focused probe evidence promotes them into `writeScope` and
   `commitScope`.
7. Representative reruns are checkpoints after focused owner/consumer proof,
   not the first debugging tool.
8. Static guardrails must run for all touched runtime, admin, diagnostics,
   analyzer, harness, and test files.
9. A package cannot close with unresolved in-scope residuals, duplicate
   handoff truth, placeholder ledgers, or unpushed focused commits.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:package:doctor -- --suggest <package>`
4. `npm run work:package:doctor -- --fix-dry-run <package>`
5. `npm run work:evidence-summary -- <artifact>`
6. `npm run analyze:topology-convergence -- <artifact> --handoff-probe`
7. `npm run analyze:owner-files -- topology_publication_owner publication_active_gate_handoff_contract --markdown`
8. `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
9. Focused producer contract tests.
10. Focused active-gate consumer tests.
11. Focused admin observation-only tests.
12. Focused diagnostics and analyzer tests.
13. Harness replay and fixture tests.
14. Static guardrails.
15. Representative `rolling-restart`.
16. `npm run work:validate -- --closure <package>`
17. Focused commit and push.

## Closure Rules

The sprint cannot close until:

1. The active package is closed as `done-...` with a valid Commit And Push
   Ledger.
2. The canonical handoff contract is implemented, consumed, and tested across
   runtime, admin, diagnostics, harness, and analyzer surfaces.
3. No in-scope consumer reconstructs the same handoff truth independently.
4. Superseded paths are deleted or structurally guarded.
5. `work/sprints/current-blocker.*` names either final green evidence or a
   fresh narrower active blocker. It must not point at the stopped residual
   package.
6. Fresh representative evidence is classified with owner, boundary, artifact,
   result, and next action.
7. The final note states whether the original rolling-restart gate is green,
   reduced, migrated, classification-only, or architecture-gap.

## Closure Outcome

Closed package:

```text
work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md
```

The original rolling-restart gate is not green. It is reduced and
classification-only for this sprint: the duplicate publication/active-gate
handoff truth is collapsed into one contract, and the remaining red evidence is
a narrower startup active-gate snapshot-coverage owner blocker with owner-key
publication reconcile as the next action.
