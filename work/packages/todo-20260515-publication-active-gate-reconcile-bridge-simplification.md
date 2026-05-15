# Publication Active-Gate Reconcile Bridge Simplification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-15",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "publication_reconcile_bridge",
  "dominantReason": "duplicate_handoff_reconcile_projection",
  "currentState": "Queued as the next package in the active rolling-restart green-gate sprint. The active owner-reconcile closure package exposed follow-on simplification risks: duplicate handoff selection, admin-local reconcile target projection, reconcile catch-up triggered by broad pending handoff state, and repair-deferred snapshot rebuild being used as the publication reconcile mechanism. This package does not start until the current active package closes or is explicitly split.",
  "nextAction": "After the active owner-reconcile closure package lands, centralize canonical handoff target selection, tighten reconcile-only catch-up signals, and replace broad repair-deferred snapshot rebuild catch-up with a narrow owner publication reconcile path while preserving admin diagnostics and rolling-restart intent.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "npm run work:validate -- --entry work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "npm run analyze:owner-files -- startup_active_gate_owner publication_reconcile_bridge --markdown",
    "node --test test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "node --test test/admin/admin-control-snapshot.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json",
    "npm run work:validate -- --closure work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md"
  ],
  "writeScope": [
    "work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "commitScope": [
    "work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary-simplification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/follow-on",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

The current green-gate implementation direction is sound: the canonical
publication-to-active-gate handoff contract should drive the owner membership
publication reconcile. The in-progress shape, however, risks adding another
layer of handoff interpretation around that contract.

This package owns the follow-on simplification after the active owner-reconcile
closure package lands. It should remove duplicated bridge logic without losing
the intent of the current fix: pending reconcile node IDs become one explicit
publication owner target, active-gate admission remains strict while
`runtimePromotionAllowed=false`, and admin diagnostics keep their existing
meaning.

The package is queued next in the sprint because the simplification is
directly coupled to the current `rolling-restart` blocker, but it must not be
used to defer the active package's owner-key reconcile work.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package simplifies one runtime bridge
  between the active-gate handoff contract, admin snapshot observation, and the
  membership publication owner. It should reduce paths and states, not create a
  new representative-frontier package.
- Escalation trigger to a heavier lane: fresh representative evidence changes
  the first owner boundary, the package needs to reopen publication handoff
  semantics beyond helper extraction, or `rolling-restart` remains red on the
  same first frontier after the current active package closes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Centralize handoff selection and reconcile-target projection in
   `src/control-plane/publication-active-gate-handoff-contract.js`, so admin
   code consumes one canonical helper instead of reconstructing handoff
   semantics.
2. Tighten publication catch-up signal detection to the reconcile case:
   `nextAction=reconcile_owner_membership_publication`, non-empty
   `pendingReconcileNodeIds`, or the equivalent normalized owner-reconcile
   reason. Do not treat `wait_owner_recovery` as a publication reconcile
   target.
3. Replace broad repair-deferred snapshot rebuild catch-up with a narrow owner
   publication reconcile path. Rebuilding the admin control snapshot may
   observe the result, but it must not be the mechanism that decides or
   performs the publication reconcile.
4. Make explicit membership publication targets named and intentional instead
   of inferred from the coincidental presence of multiple node ID arrays.
5. Preserve existing priority-recovery and admin diagnostic semantics. The
   focused admin snapshot test suite must not change unrelated
   `priorityRecoveryObservation` or blocker-bucket meaning as a side effect.
6. Update package/sprint/release tracking and model-ledger evidence if this
   package is activated and implemented.
7. If the current active package already removes the duplicated bridge shape,
   close this package as reduced with proof rather than reworking the same
   boundary again.

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. new diagnostics-only success path
4. broad admin snapshot rebuild as the reconcile mechanism
5. Deferring the current active package's required owner-key reconcile.
6. Reopening the completed handoff-contract semantics except for extracting or
   reusing canonical helper APIs.
7. Broad priority-recovery, operation-workflow, or readiness behavior changes.

## Activation Gate

This package is next in the sprint queue, not the current active package.
Before implementation starts:

1. The active owner-reconcile closure package must be done, explicitly split,
   or superseded with canonical evidence.
2. A fresh `work:context` / `work:llm-start` pass must confirm that this
   package is still the next bounded concern.
3. Exact runtime files must be promoted from `candidateRuntimeFiles` into
   `writeScope` and `commitScope` before editing.
4. Required runtime-owner-boundary subagent sequencing must be recorded in this
   package.

## Subagent Sequencing Ledger

Required on activation because this is a runtime-owner-boundary package.

- [ ] Review subagent recorded: pending-on-activation
- [ ] Fix subagent recorded or explicitly not needed: pending-on-review
- [ ] Implementation subagent recorded: pending-on-activation

## Model Fit

- Package class: `runtime-owner-boundary-simplification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/follow-on`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/tracks/topology-convergence.md`, `work/releases/0.1-dependency-map.md`, `work/releases/0.1-stabilization.md`, `work/model-ledger.jsonl`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `new diagnostics-only success path`, `broad admin snapshot rebuild as the reconcile mechanism`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md`, `npm run work:validate -- --entry work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md`, `npm run analyze:owner-files -- startup_active_gate_owner publication_reconcile_bridge --markdown`, `node --test test/control-plane/membership-publication-coordinator-main-stage-2.js`, `node --test test/admin/admin-control-snapshot.test.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json`, `npm run work:validate -- --closure work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md
4. npm run work:validate -- --entry work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md
5. npm run analyze:owner-files -- startup_active_gate_owner publication_reconcile_bridge --markdown
6. node --test test/control-plane/membership-publication-coordinator-main-stage-2.js
7. node --test test/admin/admin-control-snapshot.test.js
8. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json --fast-local --verbose
9. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json
10. npm run work:validate -- --closure work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md
