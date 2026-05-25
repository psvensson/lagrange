# Tell-Tale Scenario Reliability Sprint

Status: active. Created on May 25, 2026.

## Goal

Make the tell-tale distributed scenarios, starting with representative
`rolling-restart`, repeatedly succeed without timeout increases, admission
relaxation, or diagnostics-only green results.

The sprint is not done until `rolling-restart` has a clean representative pass
and the same proof ladder is promoted to the tell-tale scenario set.

## Sprint Strategy Brief

- Goal state: `rolling-restart` is representative-green with
  `active=5/5`, `snapshotCoverage=5/5`, `missingPublished=0`, final
  adjudication completes, and the tell-tale suite has repeatable route
  evidence.
- Current causal thesis: operation-workflow residuals are cleared, but the
  first frontier migrated back to
  `startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`.
  The latest artifact reports `snapshotCoverageNodeCount=1/5`,
  `owner_reconcile_pending`, `selected_snapshot_source_timeout`,
  `snapshot_repair_deferred`, `wait_owner_recovery`, and one selected owner
  queue pending write. Prior local reducers already covered these shapes, so
  another same-frontier runtime patch is forbidden until a higher-level
  active-gate snapshot coverage contract is selected.
- Competing hypotheses: H1 the missing contract is owner-reconcile wake debt;
  H2 the selected snapshot source must refresh before repair can advance; H3
  snapshot repair execution is runnable but deferred behind an owner/projection
  ambiguity; H4 the coverage projection contract cannot prove the active cohort
  even when owner evidence is present; H5 final adjudication is an independent
  harness bug that must be fixed before clean pass/fail interpretation.
- Confidence and evidence: high that priority-recovery operation-workflow
  residual witnesses are zero in the fresh rerun; high that the visible first
  frontier is active-gate snapshot coverage; high that the scenario process
  still has an independent `runFinalAdjudication is not defined` exit defect;
  medium on which active-gate mechanism is the actual missing edge.
- Expected green path: first select the active-gate snapshot coverage contract,
  then implement exactly that contract, then repair final adjudication if still
  blocking clean pass/fail, then run the representative green gate, then promote
  the proof ladder to the tell-tale suite.
- Wrong direction signals: editing startup readiness, publication, operation
  workflow, timeout budgets, or admission rules before the active-gate contract
  package selects a concrete edge; opening another
  `startup_active_gate_owner / snapshot_coverage` runtime patch from the
  unchanged artifact; declaring green from a routed failure where final
  adjudication did not complete.
- Next best package:
  `work/packages/done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md`.
- Stop or escalate rule: if the active-gate contract package cannot name one
  executable wake, timeout, repair, or projection contract, close as
  architecture-stop and require fresh representative evidence or a higher-level
  architecture decision before runtime promotion.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: unknown
Active package: work/packages/done-20260525-workflow-streamlining-follow-through.md
Active package owner: workflow_tooling_owner
Active package boundary: workflow_acceleration
Selected cause: ceremony_reduction
Required action: Add sprint advancement tooling, actionable audit summaries, bootstrap context hints, and streamlined workflow docs.
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: Workflow streamlining primitives exist but sprint advancement, audit summaries, and LLM-facing docs still leave manual ceremony.
Allowed edits: scripts/work-audit-ceremony.js, scripts/work-sprint-advance.js, scripts/work-context.js, scripts/list-commands.js, package.json, work/RULES.md, work/README.md, .kiro/steering/llm/core.md, .kiro/steering/llm/boot.md, test/scripts/work-audit-ceremony.test.js, test/scripts/work-sprint-advance.test.js, test/scripts/work-context.test.js, test/scripts/list-commands.test.js, work/packages/done-20260525-workflow-streamlining-follow-through.md
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: regression: node --test test/scripts/work-audit-ceremony.test.js test/scripts/work-sprint-advance.test.js test/scripts/work-context.test.js test/scripts/list-commands.test.js, supporting: npm run work:audit:ceremony -- --summary --limit 5, supporting: npm run work:sprint:advance -- --dry-run --force, supporting: git diff --check -- scripts/work-audit-ceremony.js scripts/work-sprint-advance.js scripts/work-context.js scripts/list-commands.js package.json work/RULES.md work/README.md .kiro/steering/llm/core.md .kiro/steering/llm/boot.md test/scripts/work-audit-ceremony.test.js test/scripts/work-sprint-advance.test.js test/scripts/work-context.test.js test/scripts/list-commands.test.js work/packages/done-20260525-workflow-streamlining-follow-through.md
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Package Queue

1. [Tell-Tale Active Gate Snapshot Coverage Contract](../packages/done-20260525-tell-tale-active-gate-snapshot-coverage-contract.md)
   - Lane: `experiment`
   - Purpose: select the authoritative active-gate snapshot coverage contract
     before any new runtime patch.
   - First-run reason: fresh rolling-restart moved past operation-workflow
     residuals but returned to the repeated active-gate snapshot coverage
     architecture gap.

2. [Tell-Tale Active Gate Snapshot Coverage Runtime Successor](../packages/done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md)
   - Lane: `causal-escalation`
   - Purpose: implement only the concrete wake, timeout, repair, or projection
     contract selected by the active package.
   - First-run reason: runtime work is required for green only after the
     contract package names an executable owner edge and write scope.

3. [Rolling Restart Final Adjudication Harness Fix](../packages/done-20260525-rolling-restart-final-adjudication-harness-fix.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: repair the `runFinalAdjudication is not defined` harness defect
     so representative failures and passes can complete clean adjudication.
   - First-run reason: the latest rolling-restart report routed useful
     evidence but the scenario process exited through final adjudication.

4. [Rolling Restart Representative Green Gate](../packages/done-20260525-rolling-restart-representative-green-gate.md)
   - Lane: `scenario-release-gate`
   - Purpose: run fresh rolling-restart evidence and close as
     representative-green, reduced, migrated, or same-frontier with one
     successor.
   - First-run reason: tell-tale stabilization must be proven by fresh
     representative evidence after the current first frontier is handled.

5. [Rolling Restart Active Gate Snapshot Coverage Architecture Experiment V2](../packages/done-20260525-rolling-restart-active-gate-snapshot-coverage-architecture-experiment-v2.md)
   - Lane: `experiment`
   - Purpose: triage active-gate snapshot coverage with combined scenario evidence before runtime edits.
   - First-run reason: fresh representative rerun routed to startup_active_gate_owner/snapshot_coverage with active_gate_timed_out.

6. [Rolling Restart Cache Watermark Write Queue Drain Successor](../packages/done-20260525-rolling-restart-cache-watermark-write-queue-drain-successor.md)
   - Lane: `causal-escalation`
   - Purpose: implement write-queue drain and cache refresh mechanics to resolve the stale cache watermark under concurrent load.
   - First-run reason: architecture experiment v2 distinguished cache watermark write-queue latency as the primary blocker.

7. [Tell-Tale Scenario Suite Promotion Gate](../packages/done-20260525-tell-tale-scenario-suite-promotion-gate.md)
   - Lane: `scenario-release-gate`
   - Purpose: promote the rolling-restart proof ladder to the tell-tale
     scenarios and require repeatable route evidence.
   - First-run reason: a stabilization sprint should end with repeated
     scenario proof, not one lucky green run.

## Tell-Tale Suite

Initial suite:

1. `rolling-restart`
2. `node-join-under-load`
3. `admin-query-smoke`

Add scenarios only when they are already used as representative stability
signals or when a package explicitly promotes them through canonical route
evidence.

## Definition Of Done

1. `rolling-restart` exits successfully with final adjudication complete.
2. Canonical route evidence reports no unresolved first frontier for
   `rolling-restart`.
3. Active-gate snapshot coverage is complete or emits a deliberately accepted
   bounded owner contract.
4. The tell-tale suite has a repeatable command sequence and recorded pass
   evidence.
5. Any remaining failure opens one bounded package with a single owner,
   boundary, dominant reason, and proof ladder.
