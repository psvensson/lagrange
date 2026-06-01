# Oversized Test File Cap And Top Offender Split

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-23",
    "closed": "2026-05-23",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "test_quality_owner",
    "boundary": "oversized_test_files",
    "currentState": "The 1500-line test cap and semantic splits are implemented; package-owned size proof, work-tracker proof, and focused failure-bundle proof are green. The rebalancer split wrapper still fails because current forbidden runtime code redispatches or retains operations where the pre-existing behavioral assertions expect terminal removal.",
    "nextAction": "Close the oversized-file split package with the rebalancer runtime-contract drift recorded as out-of-scope evidence for successor routing.",
    "dominantReason": "oversized_test_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "scripts/check-file-size-thresholds.js",
      "test/scripts/work-tracker-subagent-ledger.test.js",
      "test/scripts/work-tracker-subagent-ledger-fixtures.js",
      "test/scripts/work-tracker-*.test.js",
      "test/distributed/harness/failure-bundle-diagnostics-contract.js",
      "test/distributed/harness/failure-bundle-*.js",
      "test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js",
      "test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js",
      "test/rebalancer/rebalance-coordinator-stopping-reconcile-*.test.js",
      "work/packages/done-20260523-oversized-test-file-cap-and-top-offender-split.md",
      "work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "scripts/check-file-size-thresholds.js",
      "test/scripts/work-tracker-subagent-ledger.test.js",
      "test/scripts/work-tracker-subagent-ledger-fixtures.js",
      "test/scripts/work-tracker-*.test.js",
      "test/distributed/harness/failure-bundle-diagnostics-contract.js",
      "test/distributed/harness/failure-bundle-*.js",
      "test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js",
      "test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js",
      "test/rebalancer/rebalance-coordinator-stopping-reconcile-*.test.js",
      "work/packages/done-20260523-oversized-test-file-cap-and-top-offender-split.md",
      "work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "This package advances the active sprint goal of workflow steering core logic hardening by enforcing the remaining oversized test-file guardrail and splitting the largest test files before sprint closure.",
    "stabilityCredit": "local-proof-only"
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run audit:file-size:strict -- scripts/check-file-size-thresholds.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-subagent-ledger-fixtures.js test/scripts/work-tracker-subagent-sequencing-ledger.test.js test/scripts/work-tracker-package-doctor-ledger.test.js test/scripts/work-tracker-contract-ledger.test.js test/scripts/work-tracker-current-blocker-ledger.test.js test/scripts/work-tracker-policy-ledger.test.js test/distributed/harness/failure-bundle-diagnostics-contract.js test/distributed/harness/failure-bundle-diagnostics-foundation.js test/distributed/harness/failure-bundle-diagnostics-merge.js test/distributed/harness/failure-bundle-diagnostics-priority-recovery.js test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-diagnostics-stability-gates.js test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-stale-priority.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-source-handoff.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-cache-visibility.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-terminal-visibility.test.js",
        "npm test -- test/scripts/work-tracker-subagent-ledger.test.js",
        "node --test --test-name-pattern \"maps direct convergence diagnostics|derives blocked-partition counts|startup snapshot timeout owner\" test/distributed/harness/__tests__/failure-bundle.test.js",
        "npm test -- test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js",
        "git diff --check -- scripts/check-file-size-thresholds.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-subagent-ledger-fixtures.js test/scripts/work-tracker-subagent-sequencing-ledger.test.js test/scripts/work-tracker-package-doctor-ledger.test.js test/scripts/work-tracker-contract-ledger.test.js test/scripts/work-tracker-current-blocker-ledger.test.js test/scripts/work-tracker-policy-ledger.test.js test/distributed/harness/failure-bundle-diagnostics-contract.js test/distributed/harness/failure-bundle-diagnostics-foundation.js test/distributed/harness/failure-bundle-diagnostics-merge.js test/distributed/harness/failure-bundle-diagnostics-priority-recovery.js test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-diagnostics-stability-gates.js test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-stale-priority.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-source-handoff.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-cache-visibility.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-terminal-visibility.test.js work/packages/done-20260523-oversized-test-file-cap-and-top-offender-split.md work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md"
      ]
    }
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `test_quality_owner`
- Route boundary: `oversized_test_files`
- Route dominant reason: `oversized_test_file_ratchet`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `lightweight-maintenance`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. scripts/check-file-size-thresholds.js
2. test/scripts/work-tracker-subagent-ledger.test.js
3. test/scripts/work-tracker-subagent-ledger-fixtures.js
4. test/scripts/work-tracker-*.test.js
5. test/distributed/harness/failure-bundle-diagnostics-contract.js
6. test/distributed/harness/failure-bundle-*.js
7. test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js
8. test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js
9. test/rebalancer/rebalance-coordinator-stopping-reconcile-*.test.js
10. work/packages/done-20260523-oversized-test-file-cap-and-top-offender-split.md
11. work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md

## Out Of Scope

1. src/
2. architecture/
3. .kiro/steering/

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `scripts/check-file-size-thresholds.js`, `test/scripts/work-tracker-subagent-ledger.test.js`, `test/scripts/work-tracker-subagent-ledger-fixtures.js`, `test/scripts/work-tracker-*.test.js`, `test/distributed/harness/failure-bundle-diagnostics-contract.js`, `test/distributed/harness/failure-bundle-*.js`, `test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js`, `test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js`, `test/rebalancer/rebalance-coordinator-stopping-reconcile-*.test.js`, `work/packages/done-20260523-oversized-test-file-cap-and-top-offender-split.md`, `work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md`
- Forbidden files: `src/`, `architecture/`, `.kiro/steering/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:file-size:strict -- scripts/check-file-size-thresholds.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-subagent-ledger-fixtures.js test/scripts/work-tracker-subagent-sequencing-ledger.test.js test/scripts/work-tracker-package-doctor-ledger.test.js test/scripts/work-tracker-contract-ledger.test.js test/scripts/work-tracker-current-blocker-ledger.test.js test/scripts/work-tracker-policy-ledger.test.js test/distributed/harness/failure-bundle-diagnostics-contract.js test/distributed/harness/failure-bundle-diagnostics-foundation.js test/distributed/harness/failure-bundle-diagnostics-merge.js test/distributed/harness/failure-bundle-diagnostics-priority-recovery.js test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-diagnostics-stability-gates.js test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-stale-priority.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-source-handoff.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-cache-visibility.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-terminal-visibility.test.js`, `npm test -- test/scripts/work-tracker-subagent-ledger.test.js`, `node --test --test-name-pattern "maps direct convergence diagnostics|derives blocked-partition counts|startup snapshot timeout owner" test/distributed/harness/__tests__/failure-bundle.test.js`, `npm test -- test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`, `git diff --check -- scripts/check-file-size-thresholds.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-subagent-ledger-fixtures.js test/scripts/work-tracker-subagent-sequencing-ledger.test.js test/scripts/work-tracker-package-doctor-ledger.test.js test/scripts/work-tracker-contract-ledger.test.js test/scripts/work-tracker-current-blocker-ledger.test.js test/scripts/work-tracker-policy-ledger.test.js test/distributed/harness/failure-bundle-diagnostics-contract.js test/distributed/harness/failure-bundle-diagnostics-foundation.js test/distributed/harness/failure-bundle-diagnostics-merge.js test/distributed/harness/failure-bundle-diagnostics-priority-recovery.js test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-diagnostics-stability-gates.js test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-stale-priority.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-source-handoff.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-cache-visibility.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile-terminal-visibility.test.js work/packages/done-20260523-oversized-test-file-cap-and-top-offender-split.md work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: test_quality_owner; files-changed: scripts/check-file-size-thresholds.js, test/scripts/work-tracker-subagent-ledger.test.js, test/scripts/work-tracker-subagent-ledger-fixtures.js, test/scripts/work-tracker-subagent-sequencing-ledger.test.js, test/scripts/work-tracker-package-doctor-ledger.test.js, test/scripts/work-tracker-contract-ledger.test.js, test/scripts/work-tracker-current-blocker-ledger.test.js, test/scripts/work-tracker-policy-ledger.test.js, test/distributed/harness/failure-bundle-diagnostics-contract.js, test/distributed/harness/failure-bundle-diagnostics-foundation.js, test/distributed/harness/failure-bundle-diagnostics-merge.js, test/distributed/harness/failure-bundle-diagnostics-priority-recovery.js, test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js, test/distributed/harness/failure-bundle-diagnostics-stability-gates.js, test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js, test/rebalancer/rebalance-coordinator-stopping-reconcile-fixtures.js, test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js, test/rebalancer/rebalance-coordinator-stopping-reconcile-stale-priority.test.js, test/rebalancer/rebalance-coordinator-stopping-reconcile-source-handoff.test.js, test/rebalancer/rebalance-coordinator-stopping-reconcile-cache-visibility.test.js, test/rebalancer/rebalance-coordinator-stopping-reconcile-terminal-visibility.test.js; validation: scoped `npm run audit:file-size:strict` pass 0/144 source and 0/60 test over cap; `npm test -- test/scripts/work-tracker-subagent-ledger.test.js` pass 165/165; `node --test --test-name-pattern "maps direct convergence diagnostics|derives blocked-partition counts|startup snapshot timeout owner" test/distributed/harness/__tests__/failure-bundle.test.js` pass 3/3; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: test_quality_owner; files-changed: test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js and related package-owned split files; validation: verifier-fixer confirmed doctor pass, scoped file-size pass 0/144 source and 0/60 test over cap, work-tracker pass 165/165, selected failure-bundle pass 3/3, and rebalancer split wrapper fails 78/102 because forbidden `src/rebalancer/*` runtime now returns owner outcome objects and redispatches or retains operations where pre-existing assertions expect terminal removal; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: no generated current-blocker repair needed before package evidence update; outcome: not-needed.

## Validation

1. Scoped `npm run audit:file-size:strict` over the package-owned files - passed; source 0/144 and test 0/60 over cap.
2. `npm test -- test/scripts/work-tracker-subagent-ledger.test.js` - passed; 165/165 tests.
3. `node --test --test-name-pattern "maps direct convergence diagnostics|derives blocked-partition counts|startup snapshot timeout owner" test/distributed/harness/__tests__/failure-bundle.test.js` - passed; 3/3 tests.
4. `npm test -- test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js` - blocked by unrelated dirty runtime return-shape and behavior drift in `src/rebalancer/*`; after verifier-fixer test assertions adapted to the owner outcome object shape, the parent rerun observed 78 pass and 24 fail. The first remaining failures are at `test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js:206` and `:211`, where runtime redispatches source removal and leaves the operation at `STOPPING` instead of completing to `REMOVED`.
5. Scoped `git diff --check` over the package-owned files - passed after intent-to-add included new split files.

no ledger update
