<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z/rolling-restart/",
  "owner": "diagnostics / topology_convergence_graph",
  "boundary": "read-only artifact-derived topology blocker projection",
  "dominantReason": "priority_recovery_workflow_progress_event_driven",
  "currentState": "Read-only TopologyConvergenceGraph diagnostic added without runtime behavior changes.",
  "nextAction": "Use the CLI against failure-bundle, triage-summary, or direct report artifacts when blocker migration needs projection.",
  "proof": [
    "node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js",
    "node scripts/analyze-topology-convergence.js test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json",
    "node scripts/analyze-topology-convergence.js --help",
    "npm run work:validate",
    "npx eslint src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js",
    "git diff --check -- src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js package.json work/packages/done-20260507-systemic-topology-convergence-graph-diagnostic.md"
  ],
  "touchedFiles": [
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "package.json",
    "work/packages/done-20260507-systemic-topology-convergence-graph-diagnostic.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md"
}
-->

# Systemic TopologyConvergenceGraph Diagnostic

## Why

The rolling-restart topology path has repeatedly migrated blockers after each
local closure. This package adds a read-only artifact diagnostic that ranks the
current minimal unsatisfied frontier and projects the next expected frontier
without changing runtime behavior.

## Verifier Finding Fix

High-priority verifier finding:

1. Direct `.report.json` input was advertised but treated path-only
   `failureBundle` metadata as evidence.
2. The real `20260507T072145Z` report carries topology evidence at
   `scenarios[0]`, including publication convergence, readiness failure,
   dominant reason, failure classification, and priority recovery progress.
3. Normalization now ignores path-only failure-bundle metadata and consumes the
   first scenario evidence for direct report-shaped input.
4. Regression coverage now proves the direct report returns
   `priority_recovery_partition_progress` as the first frontier and projects
   `active_gate_snapshot_coverage` next.

## Scope

In scope:

1. Add a pure `TopologyConvergenceGraph` builder under diagnostics.
2. Consume parsed report, failure-bundle, and triage-summary shaped objects.
3. Model publication convergence, active gate snapshot coverage, priority
   recovery progress, startup readiness support evidence, and top failure
   reasons.
4. Add a CLI that reads one JSON artifact path and prints graph summary,
   frontier, and next expected frontier.
5. Add focused tests including the `20260507T072145Z` playback artifact.

Out of scope:

1. Runtime topology, recovery, startup, or readiness behavior changes.
2. Edits to the active rolling-restart runtime package or dirty runtime files.
3. Pro or Enterprise behavior.

## Boundary Contract

Semantic owner:

1. `diagnostics / topology_convergence_graph` owns only artifact-derived,
   read-only projection.

Canonical contract:

1. Edge states are explicit named variants: `satisfied`, `blocked`,
   `deferred`, `retryable`, `terminal_failed`, and `unknown`.
2. Returned graph data uses explicit `absent` or `unknown` sentinels instead
   of `null` or `undefined` domain state.
3. Every edge carries owner, boundary, evidence path, source, reasons, rank,
   dependencies, and projection hint.
4. `frontier` contains unsatisfied edges whose dependencies are satisfied or
   absent, sorted deterministically by severity, rank, source order, and id.
5. `nextExpectedFrontier` is computed by hypothetically satisfying the first
   current frontier edge and recomputing the same frontier rule.

Allowed consumers:

1. Diagnostics, scripts, tests, and operator analysis tooling.

Prohibited reinterpretations:

1. Runtime owners must not consume this graph as an authority for state
   mutation.
2. The diagnostic must not replace existing failure-classifier authority.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `019e0168-d047-7541-8357-3cff88712095` / `Lovelace` reviewed
      `work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md`
      on the shared rolling-restart topology publication/workflow-progress
      boundary; result `fixes-required` for package bookkeeping before
      TopologyConvergenceGraph implementation starts.
- [x] Fix subagent recorded or explicitly not needed:
      `019e016c-6a3a-7a10-ac17-0658994f9e74` / `Chandrasekhar` performed the
      prerequisite package-bookkeeping fixes, leaving the review/fix ledger
      clean before this package implementation started.
- [x] Implementation subagent recorded:
      `Codex implementation session 2026-05-07T10:20:00+02:00` implemented
      this package only after the Lovelace review and Chandrasekhar fix ledger
      was clean.
- [x] Verifier continuation review source recorded:
      `external high-priority verifier finding 2026-05-07` reviewed this
      completed diagnostics package on the topology convergence graph boundary;
      result `fixes-required` for direct report input consuming path-only
      `failureBundle` metadata instead of `scenarios[0]` evidence.
- [x] Verifier continuation fix session recorded:
      `Codex verifier-fix session 2026-05-07` reproduced the finding with a
      failing direct-report regression, repaired report normalization, and kept
      the review/fix ledger clean for this bounded verifier continuation.
- [x] Verifier continuation review source recorded:
      review agent `019e018b-f1b3-7273-992f-1cfed6b88a05` reviewed this
      completed diagnostics package on the topology convergence graph boundary;
      result `fixes-required` for permanently unsatisfied
      `top_failure_reasons` frontier behavior and wrong direct
      `failureBundle` provenance on direct failure-bundle input.
- [x] Verifier continuation fix session recorded:
      `Codex fix subagent session 2026-05-07T10:37:08+02:00` added failing
      regressions, repaired `generatedFrom.failureBundle` provenance, made the
      terminal top-failure edge non-blocking for healthy convergence, and left
      the review/fix ledger clean for this bounded continuation.

## Residual Closure Inventory

1. Direct owner path changed: `src/diagnostics/topology-convergence-graph.js`.
2. Tail consumer changed: `scripts/analyze-topology-convergence.js`.
3. Tests changed: focused diagnostics and CLI tests.
4. Superseded paths or vocabulary to delete: none.
5. Required proof: targeted tests, CLI help, work validation, touched-file
   ESLint, and diff whitespace check.

## Static Drift Ledger

Preflight:

1. Scope is read-only diagnostics and script code; no runtime owner files were
   edited.
2. Relevant guardrails selected: touched-file ESLint, targeted tests, work
   validation, and diff whitespace.

Closure:

1. Touched-file ESLint selected for new JavaScript files.
2. `npm run work:validate` selected for package ledger and checklist closure.
3. `git diff --check` selected for whitespace.
4. No runtime behavior or active rolling-restart runtime files changed.

## Validation

1. Targeted tests passed:
   `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js`.
2. Verifier-finding direct report CLI passed:
   `node scripts/analyze-topology-convergence.js test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json`.
3. CLI `--help` passed:
   `node scripts/analyze-topology-convergence.js --help`.
4. Work tracker validation passed: `npm run work:validate`.
5. Touched-file ESLint passed:
   `npx eslint src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js`.
6. Literal guard passed:
   `node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js`.
7. Diff whitespace passed:
   `git diff --check -- src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js work/packages/done-20260507-systemic-topology-convergence-graph-diagnostic.md`.
8. Review-fix targeted diagnostic regression passed:
   `node --test test/diagnostics/topology-convergence-graph.test.js`.
9. Review-fix touched-file ESLint passed:
   `npx eslint src/diagnostics/topology-convergence-graph.js test/diagnostics/topology-convergence-graph.test.js`.
10. Review-fix diff whitespace passed:
    `git diff --check -- src/diagnostics/topology-convergence-graph.js test/diagnostics/topology-convergence-graph.test.js work/packages/done-20260507-systemic-topology-convergence-graph-diagnostic.md`.
