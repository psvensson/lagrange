# Rolling Restart LLM Preflight And Code Risk Closure Sprint

Status: done. Marked done on May 14, 2026 during sprint backlog cleanup. This
preflight sprint is closed and has no active package assigned.

## Goal

Implement the LLM-agent preflight and code-risk recommendations before the next
full 5-node `rolling-restart` gate is used as the discovery surface.

The sprint is successful only when the next full scenario run is reached through
focused proof first, and the result is either representative green or a fresh
owner-boundary handoff backed by canonical evidence. Classification-only
closure, accepted backpressure, stale package metadata, and timeout stretching
do not close this sprint.

## Current Evidence Snapshot

Seed artifact:
`test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`.

Canonical extractor state from May 13, 2026:

1. `npm run work:evidence-summary -- <artifact>` reports first frontier
   `active_gate_snapshot_coverage`, owner `startup_active_gate_owner`, boundary
   `snapshot_coverage`, dominant reason `active_gate_timed_out`, with
   `snapshot_coverage_incomplete`.
2. `npm run analyze:topology-convergence -- <artifact> --explain priority_recovery_partition_progress`
   reports priority recovery as `satisfied` and non-frontier.
3. `npm run analyze:priority-recovery-residuals -- <artifact> --markdown`
   still reports one `operation_workflow_owner / workflow_progress` witness for
   `control_plane_publications-p1` with semantic state
   `spread_satisfied_in_flight`.
4. `npm --silent run analyze:causal-model -- <artifact>` still carries one
   `priority_recovery:event_driven` wait with next action
   `wait_for_operation_progress`, while its critical path is
   `startup_active_gate_owner / snapshot_coverage`.
5. `npm run analyze:distributed-failure -- --report <artifact>` reports
   `priorityRecovery=none`, `priorityRecoveryState=none`, publication
   `PUBLISHED`, `pendingAck=0`, `missingPublished=4`, `active=2/5`, and
   `snapshotCoverage=1/5`.

Execution update from May 13, 2026: focused owner-boundary and fixture proof
passes in the current workspace, but the diff-aware review blocks the full
`rolling-restart` rerun until the active startup package is committed and
unrelated control-plane/rebalancer/failure-bundle edits are split or admitted.
The earlier active green sprint is paused; this preflight sprint must not edit,
regenerate, stage, commit, or push its active package, active sprint file, or
current-blocker files.

This sprint therefore starts from a concrete preflight question: is the
remaining priority-recovery evidence real owner work, stale diagnostic residue,
or subordinate context behind the now-promoted active-gate snapshot coverage
frontier?

## Operating Rules

1. Run `npm run work:context` and `npm run work:llm-start` before activation.
2. Refresh the seed artifact if a newer `rolling-restart` report exists.
3. Use canonical extractors before raw JSON, logs, or ad hoc `jq`.
4. Use `npm run work:subagent-prompt -- --role <role> --package <package>` for
   required review, fix, and implementation agents on runtime or scenario
   packages.
5. Do not run the full distributed scenario until the latest artifact refresh,
   owner-boundary consistency check, focused fixture, and diff-aware risk review
   have either passed or produced an explicit successor package.
6. Runtime packages in this sprint must close one named owner transition,
   projection, wake, retry, timeout, reconcile, dispatch, delivery, or bounded
   migration. A package cannot close by saying the failure is merely retryable.
7. If the refresh package proves priority recovery is stale or subordinate,
   operation-workflow implementation packages must close as no-runtime-change
   reviews or be superseded; active-gate snapshot coverage becomes the next
   implementation owner.

## Recommendation Coverage

1. **Artifact-led code tracing** is implemented by the latest-artifact refresh
   package and must run before every runtime package in this sprint.
2. **LLM preflight review** is implemented by the preflight harness package and
   must produce a recorded agent review before full scenario execution.
3. **State-machine gap review** is implemented by the operation-progress state
   machine package.
4. **Owner-boundary consistency review** is implemented by the topology/frontier
   projection package.
5. **Wake/retry path audit** is implemented by the wake-retry progress package.
6. **Focused fixture synthesis** is implemented by the latest-residual fixture
   package.
7. **Diff-aware risk review** is implemented by the dirty-diff risk package.
8. **Validation and durable proof** are implemented by the final green-gate
   confirmation package.

## Package Queue

1. [Rolling Restart LLM Preflight Harness](../packages/done-20260513-rolling-restart-llm-preflight-harness.md)
   - Lane: `lightweight-maintenance`
   - Purpose: create the reusable agent prompt/checklist and sprint execution
     ledger so preflight is a recorded gate, not a conversation note.
2. [Rolling Restart Latest Artifact Preflight Refresh](../packages/done-20260513-rolling-restart-latest-artifact-preflight-refresh.md)
   - Lane: `read-review-doc-only`
   - Purpose: refresh current evidence, decide whether priority recovery is
     real, stale, or subordinate, and select the first runtime package.
   - Result: `active-gate-first-frontier`; priority-recovery residual evidence
     is stale/subordinate unless fresh canonical evidence promotes it again.
3. [Rolling Restart Owner Boundary Consistency Closure](../packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md)
   - Lane: `scenario-release-gate`
   - Purpose: reconcile topology, residual, causal-model, distributed-failure,
     active-gate, and startup-readiness projections into one owner-owned first
     frontier.
   - Result so far: focused proof selects `startup_active_gate_owner /
     snapshot_coverage`; the residual priority witness is stale/subordinate
     context, not a runtime package activation.
4. [Rolling Restart Latest Residual Fixture Synthesis](../packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md)
   - Lane: `scenario-release-gate`
   - Purpose: freeze the latest promoted frontier and any stale/subordinate
     priority-recovery residue into focused fixtures before another full run.
   - Result so far: focused fixture tests pass in the current workspace, but
     closure is deferred because the fixture/test files overlap the active
     startup package write scope.
5. [Rolling Restart Operation Progress State Machine Gap Closure](../packages/superseded-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: prove or repair every priority-recovery operation-progress state
     transition if priority recovery remains actionable.
   - Result: superseded before activation because latest preflight selected
     `startup_active_gate_owner / snapshot_coverage`.
6. [Rolling Restart Wake Retry Progress Closure](../packages/superseded-20260513-rolling-restart-wake-retry-progress-closure.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: prove or repair dispatch wake, delivery, event consumption,
     retry, timeout, and reconcile paths if `dispatched_waiting_progress` or
     `wait_for_operation_progress` remains actionable.
   - Result: superseded before activation because latest preflight selected
     `startup_active_gate_owner / snapshot_coverage`.
7. [Rolling Restart Diff Aware Risk Review](../packages/todo-20260513-rolling-restart-diff-aware-risk-review.md)
   - Lane: `read-review-doc-only`
   - Purpose: inspect dirty runtime/test diffs against package ownership and
     split unrelated or risky changes before representative rerun.
   - Result: full representative rerun is blocked by mixed dirty scope: 23
     current active-package entries plus 14 split-required unrelated runtime
     and test files after package-status cleanup is excluded.
8. [Rolling Restart Preflight Green Gate Confirmation](../packages/todo-20260513-rolling-restart-preflight-green-gate-confirmation.md)
   - Lane: `scenario-release-gate`
   - Purpose: run focused proof first, then the full `rolling-restart` gate,
     and close only on green or fresh owner-boundary evidence.

## Activation Decision Table

| Evidence after refresh | Next package |
| --- | --- |
| Priority recovery is still first frontier and actionable | State machine gap closure, then wake/retry progress closure |
| Priority recovery is satisfied but residual extractor reports stale/subordinate witness | Owner-boundary consistency closure, then latest residual fixture synthesis |
| Active-gate snapshot coverage is first frontier with no priority-recovery action | Owner-boundary consistency closure, then activate or create a `startup_active_gate_owner / snapshot_coverage` runtime package |
| Diff risk finds mixed package ownership | Stop and split package scopes before runtime work |
| Focused fixtures fail to represent current evidence | Fix fixture/analyzer package before runtime work |

## Required Preflight Agent Questions

The LLM preflight agent must answer these before implementation starts:

1. Which canonical extractor owns the first-frontier decision for the latest
   artifact?
2. Is the remaining priority-recovery evidence actionable owner work, stale
   projection, or subordinate context?
3. Which state transition, if any, lacks an entry condition, progress signal,
   retry/wake path, timeout/migration path, or owning module?
4. Which dirty files are package-owned, which are unrelated, and which are risky
   enough to block a full scenario run?
5. Which focused fixture or test must pass before the full scenario rerun?

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:package:doctor -- --suggest <active-package>`
4. `npm run work:evidence-summary -- <latest-rolling-restart-artifact>`
5. `npm run analyze:priority-recovery-residuals -- <latest-rolling-restart-artifact> --markdown`
6. `npm run analyze:topology-convergence -- <latest-rolling-restart-artifact> --explain priority_recovery_partition_progress`
7. `npm run analyze:topology-convergence -- <latest-rolling-restart-artifact> --explain active_gate_snapshot_coverage`
8. `npm --silent run analyze:causal-model -- <latest-rolling-restart-artifact>`
9. `npm run analyze:distributed-failure -- --report <latest-rolling-restart-artifact>`
10. `npm run work:dirty-scope`
11. Focused fixture and owner tests selected by the active package.
12. Static guardrails on touched runtime files.
13. `npm run work:validate -- --pre-impl <package>` before implementation.
14. `npm run work:validate -- --closure <package>` before closing.
15. Full `rolling-restart` distributed run only after focused proof is green.

## Closure Rules

1. Each package closes with its own focused commit and push ledger.
2. Runtime and scenario packages must record real sequential review, fix when
   needed, and implementation subagent proof before closure.
3. The sprint closes only after the final confirmation package records either a
   representative green artifact or a successor owner-boundary package backed by
   fresh canonical evidence.
4. If the final scenario is red, the sprint remains active unless the red result
   is migrated into a new package whose owner, boundary, artifact, proof ladder,
   and focused next action are explicit.
