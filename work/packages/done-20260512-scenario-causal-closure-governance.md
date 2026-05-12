# Scenario Causal Closure Governance

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-12",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix/rolling-restart/",
  "owner": "work_tracker_owner",
  "boundary": "scenario_causal_closure_governance",
  "dominantReason": "first_frontier_migration_without_whole_scenario_closure",
  "currentState": "Scenario-driven rolling-restart packages can preserve first-frontier migration while leaving the whole phase chain, downstream blockers, and missing causal edge implicit.",
  "nextAction": "Add repo-wide scenario causal closure policy, template guidance, tracker validation, current-blocker handoff fields, and focused tests.",
  "proof": [
    "node --test test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js",
    "npm run work:package:doctor -- work/packages/done-20260512-scenario-causal-closure-governance.md",
    "npm run work:current-blocker",
    "npm run work:validate",
    "npm run work:context",
    "git diff --check -- .kiro/steering/doctrine.md .kiro/steering/system\\ guidelines.md .kiro/steering/testing-guidelines.md work/README.md work/templates/work-package-template.md scripts/work-tracker.js scripts/work-context.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js work/packages/done-20260512-scenario-causal-closure-governance.md work/packages/active-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md work/sprints/current-blocker.json work/sprints/current-blocker.md .kiro/steering/llm"
  ],
  "touchedFiles": [
    ".kiro/steering/doctrine.md",
    ".kiro/steering/system guidelines.md",
    ".kiro/steering/testing-guidelines.md",
    "work/README.md",
    "work/templates/work-package-template.md",
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-context.test.js",
    "work/packages/done-20260512-scenario-causal-closure-governance.md",
    "work/packages/active-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    ".kiro/steering/llm/*"
  ],
  "modelFit": {
    "packageClass": "workflow-tooling-governance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "repo-wide-governance/tooling-contract",
    "escalationTriggers": [
      "validation requires runtime src changes",
      "policy must redefine roadmap or edition scope",
      "current-blocker generation requires sprint package-status mutation outside owned scope"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If scenario causal closure metadata is required, future scenario-driven packages will preserve the full causal chain instead of treating first-frontier migration as sufficient closure.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json",
    "expectedCausalModelChange": "The governance contract records first frontier, downstream blockers, missing causal edge, bounded progress proof, and classification-only stop conditions for successor packages.",
    "representativeOutcome": "classification-only",
    "causalDebt": "This package adds governance and tracker enforcement only; it does not repair the rolling-restart runtime frontier.",
    "crossBoundaryReview": "completed-before-implementation through Helmholtz review and Leibniz fix of the active governance continuation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart current-blocker causal-governance probe",
    "phaseChain": [
      "publication convergence",
      "operation workflow dispatch and retry",
      "startup active-gate presentation"
    ],
    "currentFirstFrontier": "operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner snapshot coverage remains downstream at 2/5",
      "publication_missing_active_node is presentation evidence while publication_ack_convergence remains satisfied"
    ],
    "missingCausalEdge": "workflow-progress dispatch-pending retry wake must be proven before downstream active-gate closure is pursued",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "boundedProgressProof": "Tracker policy requires focused wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, advance, or bounded progress proof before representative reruns substitute for missing causal edges.",
    "boundedProgressProofArtifact": "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js; test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "control_plane_publications-p1 and sql_transaction_participants-p1 leave dispatch-pending workflow_progress or are classified as bounded non-frontier with named retry and timer evidence",
    "maxProgressBound": "one owner wake/retry/timeout dispatch cycle per blocked partition before rerun or same-frontier classification",
    "sameFrontierFallback": "keep operation_workflow_owner / workflow_progress as the active successor frontier and stop downstream active-gate closure",
    "expectedNextFrontier": "successor runtime package either reduces workflow_progress, classifies bounded non-frontier progress, or migrates to a named downstream owner",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled-v2.md",
  "closed": "2026-05-12",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Rolling-restart package history has enough first-frontier movement that local
closures need stronger causal bookkeeping. The durable rule is that a
scenario-driven package must keep the whole phase chain visible, including
known downstream blockers and the missing causal edge, while it works the
current first frontier.

## Scope Basis

Approved work-tracker and steering maintenance for AGPL-owned scenario
governance. This package does not implement runtime behavior.

## In Scope

1. Add repo-wide Scenario Causal Closure policy to doctrine, system, and testing
   guidance.
2. Extend the work package template and README metadata contract.
3. Validate `scenarioCausalClosure` for active scenario-driven metadata-bearing
   packages.
4. Surface the new metadata in current-blocker payloads, markdown, and
   `work:context`.
5. Add focused tracker tests for valid, missing, invalid, doctor, and
   current-blocker behavior.
6. Own metadata-only successor planning updates to
   `work/packages/active-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md`
   so the next runtime package can inherit the causal-closure handoff without
   this package implementing runtime behavior or changing package status.

## Out Of Scope

1. Runtime `src/` edits.
2. Rolling-restart runtime implementation, successor package activation or
   renaming, and sprint or package-status rewrites.
3. Pro, Enterprise, or operator workflow behavior.
4. Backfilling historical packages with invented scenario causal closure data.

## Model Fit

- Package class: `workflow-tooling-governance`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `repo-wide-governance/tooling-contract`
- Owned files: `.kiro/steering/doctrine.md`, `.kiro/steering/system guidelines.md`, `.kiro/steering/testing-guidelines.md`, `work/README.md`, `work/templates/work-package-template.md`, `scripts/work-tracker.js`, `scripts/work-context.js`, `test/scripts/work-tracker-subagent-ledger.test.js`, `test/scripts/work-context.test.js`, this package file, metadata-only successor planning updates in `work/packages/active-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md`, and regenerated `.kiro/steering/llm/*`.
- Forbidden files: `src/`, runtime rolling-restart implementation edits, successor package activation or renaming, and sprint or package-status rewrites.
- Frozen decisions: this package adds governance/tooling enforcement only and does not change runtime blocker ownership.
- Escalation triggers: validation requires runtime code, roadmap scope changes, or package-status mutation outside owned scope.
- Focused proof: `node --test test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js`; `npm run work:package:doctor -- work/packages/done-20260512-scenario-causal-closure-governance.md`; `npm run work:current-blocker`; `npm run work:validate`.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart current-blocker causal-governance probe`
- Phase chain: `publication convergence -> operation workflow dispatch and retry -> startup active-gate presentation`
- Current first frontier: `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`
- Known downstream blockers: `startup_active_gate_owner snapshot coverage`, `publication_missing_active_node presentation evidence`
- Missing causal edge: workflow-progress dispatch-pending retry wake proof.
- Missing causal edge probe: `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Bounded progress proof: focused probes must name wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, advance, or bounded progress.
- Bounded progress proof artifact: `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`; `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Expected observable transition: `control_plane_publications-p1` and `sql_transaction_participants-p1` leave dispatch-pending `workflow_progress` or are classified as bounded non-frontier with named retry and timer evidence.
- Max progress bound: one owner wake/retry/timeout dispatch cycle per blocked partition before rerun or same-frontier classification.
- Same-frontier fallback: keep `operation_workflow_owner / workflow_progress` active and stop downstream active-gate closure.
- Expected next frontier: successor runtime package reduces workflow progress, classifies bounded non-frontier progress, or migrates to a named downstream owner.
- Result classification: `classification-only`
- Stop condition: `classification-only-stop`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Helmholtz (019e1aaf-6f87-74c2-9a58-943d084de77d) reviewed
      `work/packages/done-20260512-scenario-causal-closure-governance.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Leibniz (019e1ab2-72b5-7272-a631-53ebee8a9a02) fixed
      `work/packages/done-20260512-scenario-causal-closure-governance.md`.
- [x] Implementation subagent recorded:
      Agent Euclid (019e1ab5-bb1a-76b0-8732-8556baf9176b) implemented
      `work/packages/done-20260512-scenario-causal-closure-governance.md`.

## Validation Plan

1. `node --test test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js`
2. `npm run work:package:doctor -- work/packages/done-20260512-scenario-causal-closure-governance.md`
3. `npm run work:current-blocker`
4. `npm run work:validate`
5. `npm run work:context`
6. `git diff --check -- .kiro/steering/doctrine.md .kiro/steering/system\ guidelines.md .kiro/steering/testing-guidelines.md work/README.md work/templates/work-package-template.md scripts/work-tracker.js scripts/work-context.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-context.test.js work/packages/done-20260512-scenario-causal-closure-governance.md work/packages/active-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md work/sprints/current-blocker.json work/sprints/current-blocker.md .kiro/steering/llm`

## Commit And Push Ledger

1. Focused package commit: `7c9707632e6a15b93b799211109271722e9cf9ff`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Model Ledger

A model-ledger row was recorded for this governance/tooling package:
`2026-05-12T06:10:04.887Z`, package
`work/packages/done-20260512-scenario-causal-closure-governance.md`, model
`gpt-5.3-codex`, task class `workflow-tooling`, package class
`workflow-tooling-governance`, scope shape
`repo-wide-governance/tooling-contract`, outcome `implemented`, validation
status `passed`, correction loops `1`, review findings `4`, bailout reason
`none`.
