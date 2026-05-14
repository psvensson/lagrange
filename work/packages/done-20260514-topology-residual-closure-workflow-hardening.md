# Topology Residual Closure Workflow Hardening

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-14",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "work_tracker",
  "boundary": "sprint_closure_semantics",
  "dominantReason": "ship_shape_closure_not_bound_to_representative_green",
  "currentState": "Successor sprint setup starts from a closed prior sprint whose package queue drained while representative rolling-restart remains red at startup_active_gate_owner / snapshot_coverage.",
  "nextAction": "Harden sprint and tracker closure semantics so focused-green coverage-only and representative-green cannot be confused before runtime residual packages resume.",
  "proof": [
    "npm run work:context",
    "npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-residual-closure-workflow-hardening.md",
    "npm run work:validate -- --entry work/packages/done-20260514-topology-residual-closure-workflow-hardening.md",
    "node --test test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js",
    "npm run work:current-blocker -- --write",
    "npm run work:validate -- --entry",
    "npm run work:validate -- --pre-impl",
    "git diff --check -- work/packages/done-20260514-topology-residual-closure-workflow-hardening.md work/packages/todo-20260514-topology-*.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md scripts/work-tracker.js scripts/work-context.js scripts/work-package-schema.js work/README.md test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js work/sprints/current-blocker.md work/sprints/current-blocker.json",
    "npm run work:model-ledger -- record --package work/packages/done-20260514-topology-residual-closure-workflow-hardening.md --model gpt-5.3-codex --reasoning-effort high --task-class workflow-tooling --package-class bounded-implementation --intended-minimum-model gpt-5.3-codex-spark --scope-shape leaf-slice --escalated false --bailout-reason none --outcome implemented --validation-status pre-impl-pass --correction-loops 1 --review-findings 8"
  ],
  "writeScope": [
    "work/packages/done-20260514-topology-residual-closure-workflow-hardening.md",
    "work/packages/done-20260514-topology-residual-evidence-inventory.md",
    "work/packages/done-20260514-topology-active-gate-budget-closure.md",
    "work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md",
    "work/packages/active-20260514-topology-publication-projection-reconciliation.md",
    "work/packages/todo-20260514-topology-priority-recovery-residual-drain.md",
    "work/packages/todo-20260514-topology-failure-gate-execution-harness.md",
    "work/packages/todo-20260514-topology-failure-detection-repair-gate.md",
    "work/packages/done-20260514-topology-killed-join-gate.md",
    "work/packages/done-20260514-topology-killed-rejoin-gate.md",
    "work/packages/done-20260514-topology-remote-coordinator-handoff-gate.md",
    "work/packages/todo-20260514-topology-missed-handoff-ack-gate.md",
    "work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md",
    "work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md",
    "work/packages/active-20260514-topology-contract-integration-reconciliation.md",
    "work/packages/todo-20260514-topology-ship-gate-final-confirmation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/work-package-schema.js",
    "work/README.md",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-context.test.js",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/sprints/done-2026-q2-topology-convergence-ship-shape.md",
    "work/packages/done-20260513-topology-failure-scenario-gates.md",
    "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260514-topology-residual-closure-workflow-hardening.md",
    "work/packages/done-20260514-topology-residual-evidence-inventory.md",
    "work/packages/done-20260514-topology-active-gate-budget-closure.md",
    "work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md",
    "work/packages/active-20260514-topology-publication-projection-reconciliation.md",
    "work/packages/todo-20260514-topology-priority-recovery-residual-drain.md",
    "work/packages/todo-20260514-topology-failure-gate-execution-harness.md",
    "work/packages/todo-20260514-topology-failure-detection-repair-gate.md",
    "work/packages/done-20260514-topology-killed-join-gate.md",
    "work/packages/done-20260514-topology-killed-rejoin-gate.md",
    "work/packages/done-20260514-topology-remote-coordinator-handoff-gate.md",
    "work/packages/todo-20260514-topology-missed-handoff-ack-gate.md",
    "work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md",
    "work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md",
    "work/packages/active-20260514-topology-contract-integration-reconciliation.md",
    "work/packages/todo-20260514-topology-ship-gate-final-confirmation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/work-package-schema.js",
    "work/README.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-context.test.js",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "activate residual evidence inventory, then active-gate budget or active-gate cohort package unless fresh evidence migrates the frontier"
  },
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The previous topology sprint closed with a drained package queue while the
representative rolling-restart evidence remained red. That is a workflow
failure before it is a runtime failure: future packages must not be able to
confuse focused contract proof, coverage-matrix proof, or classification-only
handoff with ship-shape evidence.

This package owns the tracker and sprint-closure semantics needed before the
runtime residual packages resume. It should make the handoff durable enough
that `current-blocker` keeps pointing at the live representative residual when
ship criteria are unmet.

## Scope Basis

Approved maintenance scope under `work/README.md`: tracker semantics,
sprint-closure policy, and LLM handoff clarity for the existing AGPL topology
release-gate work. No runtime behavior changes belong in this package.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: the package changes tracker and sprint
  semantics only; it must not change runtime ownership, shared runtime
  contracts, distributed harness behavior, or representative evidence.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260514-topology-residual-closure-workflow-hardening.md
2. work/packages/done-20260514-topology-residual-evidence-inventory.md
3. work/packages/done-20260514-topology-active-gate-budget-closure.md
4. work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md
5. work/packages/active-20260514-topology-publication-projection-reconciliation.md
6. work/packages/todo-20260514-topology-priority-recovery-residual-drain.md
7. work/packages/todo-20260514-topology-failure-gate-execution-harness.md
8. work/packages/todo-20260514-topology-failure-detection-repair-gate.md
9. work/packages/done-20260514-topology-killed-join-gate.md
10. work/packages/done-20260514-topology-killed-rejoin-gate.md
11. work/packages/done-20260514-topology-remote-coordinator-handoff-gate.md
12. work/packages/todo-20260514-topology-missed-handoff-ack-gate.md
13. work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md
14. work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md
15. work/packages/active-20260514-topology-contract-integration-reconciliation.md
16. work/packages/todo-20260514-topology-ship-gate-final-confirmation.md
17. work/sprints/active-2026-q2-topology-convergence-residual-closure.md
18. scripts/work-tracker.js
19. scripts/work-context.js
20. scripts/work-package-schema.js
21. work/README.md

Required behavior:

1. Distinguish `focused-proof-complete`, `coverage-matrix-only`,
   `representative-migrated`, and `representative-green` in sprint/package
   closure language.
2. Keep `work:sprints/current-blocker.*` aligned to the live representative
   residual whenever the ship criterion is unmet.
3. Make successor-package selection explicit when a human directs a coverage
   pivot away from the representative first frontier.
4. Prevent a sprint from using `done` or equivalent closure wording as
   ship-shape proof unless the representative gate is green or a narrower
   active blocker exists with canonical evidence.

## Out Of Scope

1. src/
2. test/distributed/runtime-behavior

Also out of scope:

1. Runtime fixes for active-gate, publication, priority recovery, failure
   detection, join, rejoin, or rebalance behavior.
2. Distributed scenario reruns.
3. Harness timeout increases.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Owned files: the active package, successor todo package stubs, active sprint
  file, current-blocker generated files, and tracker/documentation files listed
  in this package write scope.
- Forbidden files: `src/`, `test/distributed/runtime-behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-residual-closure-workflow-hardening.md`, `node --test test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js`, `npm run work:validate -- --entry`, `npm run work:validate -- --pre-impl`, `git diff --check -- work/packages/done-20260514-topology-residual-closure-workflow-hardening.md scripts/work-tracker.js scripts/work-context.js`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:context
2. npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-residual-closure-workflow-hardening.md
3. npm run work:validate -- --entry work/packages/done-20260514-topology-residual-closure-workflow-hardening.md
4. node --test test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js
5. npm run work:current-blocker -- --write
6. npm run work:validate -- --entry
7. npm run work:validate -- --pre-impl
8. git diff --check -- work/packages/done-20260514-topology-residual-closure-workflow-hardening.md work/packages/todo-20260514-topology-*.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md scripts/work-tracker.js scripts/work-context.js scripts/work-package-schema.js work/README.md test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js work/sprints/current-blocker.md work/sprints/current-blocker.json
9. npm run work:model-ledger -- record --package work/packages/done-20260514-topology-residual-closure-workflow-hardening.md --model gpt-5.3-codex --reasoning-effort high --task-class workflow-tooling --package-class bounded-implementation --intended-minimum-model gpt-5.3-codex-spark --scope-shape leaf-slice --escalated false --bailout-reason none --outcome implemented --validation-status pre-impl-pass --correction-loops 1 --review-findings 8
10. Final deep-dive proof: confirm the generated current-blocker exposes the sprint representative residual separately from this workflow package status before closure.

## Findings To Close

1. Queued scenario packages carry concrete `causalGovernance` and
   `scenarioCausalClosure` metadata before activation.
2. Package closure proof uses `## Commit And Push Ledger`; the tracker accepts
   `## Closure Commit Proof` only as a legacy alias.
3. `causal-escalation` packages use required subagent sequencing ledgers.
4. Runtime candidates stay in `candidateRuntimeFiles` until owner-file proof
   promotes exact paths into `writeScope` and `commitScope`.
5. `current-blocker` exposes the live representative residual even when the
   active package is workflow-only and `scenario: none`.
6. Validation grandfathers old closed packages opened before 2026-05-14 when
   they are missing commit proof, without inventing historical ledgers.
7. Package validation ladders include package-doctor, static guardrails,
   `git diff --check`, and final deep-dive classification.
8. Sprint/package activation contracts define same-frontier fallback, artifact
   preservation, and result-classification vocabulary.

## Acceptance Criteria

1. Active sprint exists and states that representative rolling-restart remains
   red until proven otherwise.
2. All successor work packages exist with package-specific owner, boundary,
   evidence, validation, split rules, and closure criteria.
3. `work:sprints/current-blocker.*` points at the live active workflow package
   while the sprint setup is active and separately renders the representative
   rolling-restart residual.
4. Tracker semantics and package prose distinguish focused proof, coverage
   matrix proof, representative migration, and representative-green ship proof.
5. No runtime file is modified by this package.
6. Global entry validation is not blocked by missing commit ledgers on
   historical closed packages that predate the current policy.

## Split Rules

1. If tracker code cannot represent the desired closure semantics without
   runtime coupling, split the tracker change rather than weakening sprint
   policy.
2. If package creation reveals a new representative first frontier, preserve
   the package queue and make that frontier the next active package.
3. If all docs are complete and validation passes, close this setup package and
   activate the residual evidence inventory package.

## Subagent Sequencing Note

Subagents are not required for this lightweight maintenance package. Runtime and
scenario successor packages carry their own required sequencing ledgers.

## Commit And Push Ledger

Required at closure.

1. Focused package commit: b51e23cda80600ef4d26ae6cff7c890c528f8b91
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Closure follow-up/finalization commit: 59f4b12d4103d32ec4b5fcdec4f3b7e32b5edde5 completed the final workflow-hardening state after the focused package commit.
