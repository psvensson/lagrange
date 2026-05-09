# Spec-Led Runtime Modularization Legacy Deletion And Representative Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
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
    "src/control-plane/dual-path-closure*.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/control-plane/dual-path-closure.test.js",
    "test/distributed/harness/*.js",
    "scripts/analyze-topology-convergence.js",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md",
    "work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md"
  ],
  "modelFit": {
    "packageClass": "escalation-required",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "representative-frontier-closure",
    "escalationTriggers": [
      "runtime owner boundary changes",
      "representative proof may require successor blocker migration"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md"
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
6. `work/sprints/active-2026-q2-spec-led-runtime-modularization.md`

## Model Fit

- Package class: `escalation-required`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `representative-frontier-closure`
- Escalation triggers: runtime owner boundary changes; representative proof may
  require successor blocker migration.

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

- [x] Gather deletion targets from all prior package closure notes.
- [x] Run import and label searches for old owner names, state names, reason
      names, and helper modules.
- [x] Classify each remaining hit as live code, test fixture, compatibility
      alias, documentation, or false positive.
- [x] Decide whether each compatibility alias can be deleted or must be guarded
      with a follow-on package.

## Implementation Tasks

- [x] Delete live legacy paths that are superseded by owner contracts.
- [x] Remove old aliases and duplicate tests.
- [x] Add structural guards for any path that must remain temporarily.
- [x] Update sprint closure notes with final proof or fresh blocker handoff.
- [x] Open a successor package if representative proof finds a new first
      frontier or an external artifact contract cannot be deleted in this
      slice.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Turing (`019e0c4b-0225-7c13-b804-3b267f6c5984`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Aquinas (`019e0c51-d05e-7540-beeb-f0d202fb2a32`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md`.
- [x] Implementation subagent recorded:
      Agent Banach (`019e0c58-3141-77d0-aa9b-0b5516964e01`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md`.

## Implementation Notes

Deletion inventory executed in this slice:

1. Removed priority-recovery semantic-state inference from the runtime
   snapshot pipeline and harness mirrors. Snapshots now require explicit owner
   semantic state evidence instead of deriving state from raw cache/operation
   fields.
2. Renamed/deleted the legacy active-gate helper surface:
   `deriveLegacyPriorityRecoveryActiveGateFields` and `buildLegacyNoProgress`
   became owner-bound active-gate report helpers, with a structural guard
   preventing the old names from returning.
3. Deleted the `pending_ack_nodes` stability-gate alias in favor of
   `pending_acks_present`, and removed raw `topFailures.topReasons` assertions
   that treated raw ranking as canonical owner truth.
4. Removed old planning-answer aliases:
   `getPriorityRecoveryPlanningAnswerBestEffort` and
   `getMembershipPublicationPlanningAnswerBestEffort` now resolve through
   planning-snapshot vocabulary.
5. Removed `resolveLegacy*` runtime names, legacy reachability probe naming,
   and remaining legacy-prefixed local helper identifiers in the package
   surfaces touched by this closure slice.
6. Renamed the control-plane dual-path closure violation vocabulary from
   `legacy_branch` / `legacyBranches` to `superseded_branch` /
   `supersededBranches`, and guarded the old terms from returning.
7. Kept `top_failure_reasons` only as a diagnostics edge. Analyzer and
   failure-bundle tests now assert owner-witness dominant reason selection
   before raw failure-reason ranking.
8. Named successor package
   `work/packages/todo-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md`
   for `activeGateBestProgress`, `activeGateNoProgress`, and
   `activeGateBlockerHistory`, because those names remain an external
   failure-bundle/report artifact schema contract.
9. Named representative successor package
   `work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md`
   because the final rolling-restart report moved the first frontier to
   `topology_publication_owner / publication_convergence` with dominant
   reason `pending_acks_present`.

## Representative Handoff

The final representative run did not go green. It moved the scenario from the
legacy deletion boundary to a fresh topology publication boundary:

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `publication_ack_convergence`
- Current semantic owner: `topology_publication_owner`
- Current boundary: `publication_convergence`
- Frontier state: `blocked`
- Dominant reason: `pending_acks_present`
- Evidence path: `report.scenarios[0].publicationConvergence`
- Reasons: `publication_pending, pending_acks_present`
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --explain publication_ack_convergence`

## Validation

1. Owner-specific focused suites from previous packages.
2. Structural `rg` checks for deleted labels and helper paths.
3. Static guardrails for changed files.
4. `npm run work:validate`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --fast-local --verbose`

## Validation Notes

Implementation-subagent validation:

1. Passed:
   `node --test test/control-plane/priority-recovery-snapshot.test.js`
2. Passed:
   `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/failure-bundle.test.js`
3. Passed:
   `node --test test/scripts/spec-led-runtime-legacy-deletion-guard.test.js`
4. Passed:
   `node --test test/rebalancer/move-planner-placement-owner-kernel.test.js test/rebalancer/storage-admission-service.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`
5. Passed: exact `rg` guard for deleted helper names, planning-answer names,
   `resolveLegacy`, `inferPriorityRecoverySemanticState`,
   `pending_ack_nodes`, old diagnostics aliases, local absent aliases, and
   unknown-owner aliases across the touched runtime/diagnostics/harness
   surfaces.
6. Passed: `node --check` for all implementation-subagent-touched JavaScript
   files.
7. Passed: `npm run audit:runtime-grammar:file -- <implementation touched files>`.
8. Passed: production touched-file literal guard
   `node scripts/check-guideline-literals.js <production touched files>`.
9. Passed: touched-file decision-boundary guard when test paths are passed with
   `./test/...` so the checker classifies tests as tests. The raw
   `test/...` invocation still reports two pre-existing harness decision
   boundary violations in
   `test/distributed/harness/failure-bundle-segment-5.js`:
   `resolveFailureClassificationGuidance` and `buildFailureClassification`.
10. Known guardrail debt: broad literal guard on harness/test paths reports
    existing test-fixture literal debt because those relative paths are treated
    as runtime by the checker. Production touched files are clean.
11. Parent-session validation passed:
    `npm run work:validate`.
12. Parent-session validation passed:
    `node --test test/scripts/spec-led-runtime-legacy-deletion-guard.test.js`.
13. Parent-session validation passed:
    `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/failure-bundle.test.js`.
14. Parent-session validation passed:
    `node --test test/control-plane/priority-recovery-snapshot.test.js`.
15. Parent-session validation passed:
    `node --test test/rebalancer/move-planner-placement-owner-kernel.test.js test/rebalancer/storage-admission-service.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`.
16. Parent-session validation passed:
    `node --test test/control-plane/dual-path-closure.test.js`.
17. Parent-session exact package runtime-source guardrails passed for runtime
    grammar, literal ownership, and decision boundaries over the changed
    runtime/diagnostics/analyzer source set.
18. Broad guardrail note: exact changed production-plus-tooling literal and
    decision-boundary scans fail on unrelated tooling changes already present
    in pushed commit `09ce26fb` (`scripts/work-tracker.js`,
    `scripts/model-ledger.js`, and `scripts/work-context.js`). Those files are
    outside this runtime closure owner boundary and are not claimed as clean by
    this package.
19. Representative validation failed as expected for a migrated blocker:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --fast-local --verbose`
    stopped at `publication_ack_convergence` with `pending_acks_present`.
20. Representative analyzer proof passed:
    `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --explain publication_ack_convergence`.
21. Closure note: runtime implementation changes for this package were already
    pushed in mixed commit `09ce26fb`. This package does not rewrite that
    pushed history; the closure commit records only package-status and
    sprint-handoff metadata.

## Commit And Push Ledger

1. Focused package commit: `423c6493`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Done When

1. Legacy paths are deleted, guarded, or handed to a named successor package.
2. All rewritten owner contract tests pass.
3. Representative rolling-restart is green or migrated to a fresh owner-boundary
   package with canonical evidence.
4. The sprint has closure notes and package ledger proof for every activated
   package.
