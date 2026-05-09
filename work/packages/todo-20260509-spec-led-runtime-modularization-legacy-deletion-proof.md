# Spec-Led Runtime Modularization Legacy Deletion And Representative Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
  "playback": "none",
  "owner": "runtime_contract_closure_owner",
  "boundary": "legacy_path_deletion_and_representative_proof",
  "dominantReason": "modular_rewrite_not_yet_closed_by_deletion_and_gate_proof",
  "currentState": "After owner rewrites land, old compatibility paths, aliases, helpers, and fallback branches must be deleted or guarded, then representative proof must confirm no new blocker has been hidden.",
  "nextAction": "Run structural deletion proof, close remaining compatibility paths, and rerun representative rolling-restart or migrate the first new blocker to a fresh owner package.",
  "proof": [
    "rg checks for deleted legacy labels and helpers",
    "npm run work:validate",
    "Touched-file static guardrails selected by changed owners",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner*.js",
    "src/rebalancer/move-planner*.js",
    "src/control-plane/*publication*.js",
    "src/control-plane/*readiness*.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/distributed/harness/*.js",
    "scripts/analyze-topology-convergence.js",
    "work/sprints/todo-2026-q2-spec-led-runtime-modularization.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md"
}
-->

## Why

The rewrite is not complete when new modules exist. It is complete when the old
paths are gone, consumers cannot fall back to shadow grammar, and a
representative run proves the system either closes the gate or reports a fresh
owner-boundary blocker. This package is the closure slice for the sprint.

## Scope Basis

All previous spec-led runtime modularization packages and Phase `0.1`
representative-gate closure scope.

## In Scope

1. Delete or guard old compatibility paths named by previous packages.
2. Remove unused constants, aliases, and test helpers for old reason names.
3. Add structural checks where direct deletion is unsafe in one slice.
4. Rerun focused owner tests for all rewritten owners.
5. Rerun representative rolling-restart or open a fresh package if a new first
   frontier appears.

## Out Of Scope

1. New owner rewrites.
2. New feature behavior.
3. Harness timeout increases or report relabeling to force a green result.
4. Pro or Enterprise work.

## Invariants

1. No deleted compatibility path can remain reachable under a new alias.
2. Structural proof must check labels, helpers, and import paths.
3. Representative proof must preserve the owner-boundary evidence ladder.
4. If the gate still fails, the failure must migrate to one fresh package with
   canonical owner evidence.

## Tactical Inspiration

1. Compiler dead-code elimination passes: prove old entrypoints are unreachable
   or remove them.
2. Kubernetes conformance: representative proof validates the behavior promised
   by lower-level contract tests.
3. Post-incident closure practice: action items close only when verification
   shows the old failure mode cannot recur silently.

## Hotspots

1. Owner modules added by previous packages.
2. Old operation workflow owner segments.
3. Old publication and readiness helpers.
4. Old diagnostics and harness classifiers.
5. `scripts/analyze-topology-convergence.js`
6. `work/sprints/todo-2026-q2-spec-led-runtime-modularization.md`

## Shared Boundary Contract

Semantic owner: `runtime_contract_closure_owner`.

Canonical contract shape / vocabulary: deletion inventory, structural guard
results, focused proof results, representative report, and migrated blocker
handoff if needed.

Allowed consumers: sprint closure notes, roadmap status, work tracker, and any
fresh successor package.

Prohibited reinterpretations: do not call the sprint done while compatibility
paths remain reachable, while owner tests fail, or while representative proof
has no canonical owner-boundary outcome.

Primary diagnostics / proof surfaces: rg deletion checks, static guardrails,
focused owner tests, work tracker validation, and representative rolling-restart
report.

## Detection / Analysis Tasks

- [ ] Gather deletion targets from all prior package closure notes.
- [ ] Run import and label searches for old owner names, state names, reason
      names, and helper modules.
- [ ] Classify each remaining hit as live code, test fixture, compatibility
      alias, documentation, or false positive.
- [ ] Decide whether each compatibility alias can be deleted or must be guarded
      with a follow-on package.

## Implementation Tasks

- [ ] Delete live legacy paths that are superseded by owner contracts.
- [ ] Remove old aliases and duplicate tests.
- [ ] Add structural guards for any path that must remain temporarily.
- [ ] Update sprint closure notes with final proof or fresh blocker handoff.
- [ ] Open a successor package if representative proof finds a new first
      frontier.

## Validation

1. Owner-specific focused suites from previous packages.
2. Structural `rg` checks for deleted labels and helper paths.
3. Static guardrails for changed files.
4. `npm run work:validate`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --fast-local --verbose`

## Done When

1. Legacy paths are deleted, guarded, or handed to a named successor package.
2. All rewritten owner contract tests pass.
3. Representative rolling-restart is green or migrated to a fresh owner-boundary
   package with canonical evidence.
4. The sprint has closure notes and package ledger proof for every activated
   package.
