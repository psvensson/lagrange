# Work Tracking Closure Summary Adoption

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-28",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "work_tracking_signal_density",
    "dominantReason": "closure_summary_missing",
    "currentState": "Recent packages bury closure outcomes behind long setup metadata, and frontier tooling reports many unknown or high-overlap results.",
    "nextAction": "Add structured closure summaries to schema, tooling, and current sprint/package records."
  },
  "scope": {
    "writeScope": [
      "scripts/work-package-schema.js",
      "scripts/work-tracker.js",
      "scripts/work-package-cost.js",
      "scripts/work-frontier-history.js",
      "scripts/work-negative-learning.js",
      "test/scripts/work-llm-usability-tools.test.js",
      "test/scripts/work-frontier-history.test.js",
      "test/scripts/work-negative-learning.test.js",
      "work/templates/lightweight-maintenance-package.md",
      "work/templates/doc-only-package.md",
      "work/templates/single-file-maintenance-package.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/packages/active-20260528-work-tracking-closure-summary-adoption.md",
      "work/packages/done-20260528-failure-bundle-sql-availability-diagnostics-capture.md",
      "work/packages/done-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md",
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md",
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md",
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/packages/done-20260528-rolling-restart-active-gate-owner-reconcile-pending-recovery-contract.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "scripts/work-package-schema.js",
      "scripts/work-tracker.js",
      "scripts/work-package-cost.js",
      "scripts/work-frontier-history.js",
      "scripts/work-negative-learning.js",
      "test/scripts/work-llm-usability-tools.test.js",
      "test/scripts/work-frontier-history.test.js",
      "test/scripts/work-negative-learning.test.js",
      "work/templates/lightweight-maintenance-package.md",
      "work/templates/doc-only-package.md",
      "work/templates/single-file-maintenance-package.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/packages/active-20260528-work-tracking-closure-summary-adoption.md",
      "work/packages/done-20260528-failure-bundle-sql-availability-diagnostics-capture.md",
      "work/packages/done-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md",
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md",
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md",
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/packages/done-20260528-rolling-restart-active-gate-owner-reconcile-pending-recovery-contract.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The active rolling-restart representative gate depends on quickly distinguishing startup_active_gate_owner / snapshot_coverage same-frontier work from diagnostics_owner / failure_bundle_diagnostics_capture migration, and the last six package records bury those closure outcomes behind repeated setup metadata.",
    "codeQualityAdmission": "improves-evidence-fidelity"
  },
  "codeQualityAdmission": {
    "reason": "improves-evidence-fidelity",
    "evidence": "Closure summaries let canonical package-cost, frontier-history, and negative-learning tooling read outcome, movement, successor reason, and artifact without ad hoc package prose scans."
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "workflow-tooling-and-package-records",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "schema changes would invalidate historical packages",
      "work scope expands into runtime or scenario behavior",
      "current sprint routing changes beyond tracking summary adoption"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "regression: npm test -- test/scripts/work-llm-usability-tools.test.js test/scripts/work-frontier-history.test.js test/scripts/work-negative-learning.test.js",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 6",
        "supporting: npm run work:negative-learning -- --package-dir work/packages --limit 6",
        "supporting: git diff --check -- scripts/work-package-schema.js scripts/work-tracker.js scripts/work-package-cost.js scripts/work-frontier-history.js scripts/work-negative-learning.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-frontier-history.test.js test/scripts/work-negative-learning.test.js work/templates/lightweight-maintenance-package.md work/templates/doc-only-package.md work/templates/single-file-maintenance-package.md work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/packages/active-20260528-work-tracking-closure-summary-adoption.md work/packages/done-20260528-failure-bundle-sql-availability-diagnostics-capture.md work/packages/done-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md work/packages/done-20260528-rolling-restart-active-gate-owner-reconcile-pending-recovery-contract.md"
      ]
    }
  },
  "closureSummary": {
    "resultClassification": "classification-only",
    "predictionAccuracy": "matched",
    "observedMovement": "Package summary tooling now reads closureSummary for package cost, frontier history, and negative learning; closure validation rejects pending placeholders, same-day summaries sort by artifact time, and templates, the current sprint, and six current sprint package records include the field.",
    "successorReason": "No successor package is required for tracking adoption; the sprint can return to the rolling-restart successor selection state using denser closure records.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "work/packages/active-20260528-work-tracking-closure-summary-adoption.md"
  }
}
-->

## Why

The last six package records show the tracking problem directly: closure outcomes, movement, and successor reasons are present, but the highest-signal facts sit below hundreds of lines of setup metadata. This package adds a structured `closureSummary` and upgrades tooling and current package records to read it first.

## Scope

- In: workflow package schema/reference, validator shape checks, package-cost/frontier-history/negative-learning summaries, templates, current sprint tracking text, and the last six completed package records.
- Out: runtime code, representative scenario behavior, package closure automation, and historical rewrites beyond the requested recent package upgrade.

## Validation

1. `npm test -- test/scripts/work-llm-usability-tools.test.js test/scripts/work-frontier-history.test.js test/scripts/work-negative-learning.test.js`
2. `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 6`
3. `npm run work:negative-learning -- --package-dir work/packages --limit 6`
4. `git diff --check -- scripts/work-package-schema.js scripts/work-tracker.js scripts/work-package-cost.js scripts/work-frontier-history.js scripts/work-negative-learning.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-frontier-history.test.js test/scripts/work-negative-learning.test.js work/templates/lightweight-maintenance-package.md work/templates/doc-only-package.md work/templates/single-file-maintenance-package.md work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/packages/active-20260528-work-tracking-closure-summary-adoption.md work/packages/done-20260528-failure-bundle-sql-availability-diagnostics-capture.md work/packages/done-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md work/packages/done-20260528-rolling-restart-active-gate-owner-reconcile-pending-recovery-contract.md`

## Execution Evidence

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: schema, validator, summary tooling, templates, current sprint, six package records, focused tests; validation: npm test -- test/scripts/work-llm-usability-tools.test.js test/scripts/work-frontier-history.test.js test/scripts/work-negative-learning.test.js; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 6; npm run work:negative-learning -- --package-dir work/packages --limit 6; git diff --check scoped files; parent revalidated focused proof: yes; outcome: passed.
- [x] action: verification-fix; owner: Agent Lorentz (019e6f8a-a327-7741-9871-ec86492b8567); files-changed: scripts/work-tracker.js, scripts/work-frontier-history.js, scripts/work-negative-learning.js, scripts/work-package-schema.js, test/scripts/work-llm-usability-tools.test.js, test/scripts/work-frontier-history.test.js, test/scripts/work-negative-learning.test.js, work/packages/active-20260528-work-tracking-closure-summary-adoption.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: subagent found historical closure validation, pending placeholder, same-day ordering, and active-package closure gaps; fixes applied; npm test -- test/scripts/work-llm-usability-tools.test.js test/scripts/work-frontier-history.test.js test/scripts/work-negative-learning.test.js; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 6; npm run work:negative-learning -- --package-dir work/packages --limit 6; npm run work:validate -- --entry work/packages/active-20260528-work-tracking-closure-summary-adoption.md; npm run work:validate -- --pre-impl work/packages/active-20260528-work-tracking-closure-summary-adoption.md; parent revalidated focused proof: yes; outcome: passed.
- Theory-ledger: not-needed because this package changes workflow tracking schema/tooling and package metadata, not the rolling-restart mechanism theory.
