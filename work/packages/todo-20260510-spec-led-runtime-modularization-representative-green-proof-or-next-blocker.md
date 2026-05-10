# Spec-Led Runtime Modularization Representative Green Proof Or Next Blocker Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-10",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations/rolling-restart/",
  "owner": "representative_gate_owner",
  "boundary": "proof_classification",
  "dominantReason": "pending_representative_proof",
  "currentState": "This proof-only package is queued immediately after the operation scheduling SQL write operations frontier. It must decide whether representative rolling-restart is green, still on the same scheduling boundary, or migrated to exactly one new owner boundary.",
  "nextAction": "Consume or produce the scheduling frontier's representative rolling-restart report, run topology-convergence analysis, and update tracker truth before any companion cleanup or broad successor work starts.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --fast-local --verbose",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json",
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json when the representative proof is not green",
    "npm run work:current-blocker",
    "npm run work:validate"
  ],
  "touchedFiles": [
    "work/packages/todo-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "roadmap.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "spark-safe",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "escalationTriggers": [
      "representative report or analyzer output is missing or contradictory",
      "proof requires runtime, test, diagnostics, analyzer, or harness code changes",
      "scenario still fails on rebalancer_leader / operation_scheduling after the scheduling package claims closure",
      "more than one plausible new owner boundary appears in normalized evidence"
    ]
  },
  "predecessor": "work/packages/active-20260509-spec-led-runtime-modularization-operation-scheduling-sql-write-operations-frontier.md"
}
-->

## Why

The sprint has already reduced several rolling-restart blockers. After the
current scheduling frontier, the highest-risk failure mode is scope widening:
schema cleanup, older residuals, or a fresh broad runtime package could start
before the representative gate has been proven or classified.

This package is the latch. It keeps the next step proof-only until the
representative rolling-restart result is known.

## Scope Basis

Successor proof gate for
`work/packages/active-20260509-spec-led-runtime-modularization-operation-scheduling-sql-write-operations-frontier.md`.
This remains Phase `0.1` internal-coherence gate work in the AGPL repository.

## In Scope

1. Consume the representative report produced by the scheduling package, or run
   the named rolling-restart command if the report is absent.
2. Run topology-convergence analysis against that report.
3. Classify the result as exactly one of:
   - `representative-green`
   - `same-frontier`
   - `migrated-frontier`
4. If the result is `representative-green`, update the sprint and roadmap
   handoff toward Phase 0.1 representative gate closure.
5. If the result is `same-frontier`, update the scheduling package and sprint
   current blocker snapshot without opening a new runtime package.
6. If the result is `migrated-frontier`, activate exactly one successor
   frontier package with a generated owner evidence block.

## Out Of Scope

1. Runtime, test, diagnostics, analyzer, or harness code changes.
2. Active-gate report schema alias deletion.
3. Broad cleanup, package archaeology, or multiple successor packages.
4. Manual blocker reclassification that contradicts analyzer output without
   escalation.
5. Pro or Enterprise work.

## Model Fit

- Package class: `spark-safe`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Owned files: this package file,
  `work/sprints/active-2026-q2-spec-led-runtime-modularization.md`,
  `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`,
  `roadmap.md`, and `work/model-ledger.jsonl`.
- Forbidden files: `src/`, `test/`, `scripts/`, `.kiro/specs/`,
  `.kiro/steering/`, runtime behavior, diagnostics behavior, analyzer
  behavior, and harness behavior.
- Frozen decisions: topology-convergence analyzer output is the classification
  source; this package records green, same-frontier, or one migrated frontier
  only; companion cleanup remains parked until classification is recorded.
- Escalation triggers: representative report or analyzer output is missing or
  contradictory; proof requires code changes; scenario still fails on
  `rebalancer_leader / operation_scheduling` after the scheduling package
  claims closure; more than one plausible new owner boundary appears in
  normalized evidence.
- Focused proof:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --fast-local --verbose`;
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json`;
  `npm run work:package:evidence-block -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json`;
  `npm run work:current-blocker`; `npm run work:validate`.

## Validation

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --fast-local --verbose`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json`
3. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json` when the representative proof is not green.
4. `npm run work:current-blocker`
5. `npm run work:validate`

## Done When

1. The representative gate is recorded as green, same-frontier, or one migrated
   frontier.
2. Sprint current blocker truth matches the classification.
3. Companion cleanup remains parked until the classification is recorded.
