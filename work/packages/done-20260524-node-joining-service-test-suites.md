# Split node joining service tests below file-size limit

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-24",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "test_quality_owner",
    "boundary": "node_joining_service_suites",
    "currentState": "test/bootstrap/node-joining-service.test.js split into existing parts-2..6 plus new parts-7 and parts-8; main now 1428 lines and audit reports 0/60 over 1500 lines.",
    "nextAction": "Close the package after verification: run closure validation and update the current-blocker.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "test/bootstrap/node-joining-service.test.js",
      "src/rebalancer/operation-workflow-owner-segment-6.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-more-test-cases.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-test-cases.js",
      "src/rebalancer/operation-workflow-observed-state.js",
      "src/rebalancer/operation-workflow-priority-recovery-errors.js",
      "src/rebalancer/operation-workflow-remove-safety-evaluator.js",
      "src/rebalancer/operation-workflow-remove-safety-membership.js",
      "src/rebalancer/operation-workflow-replace-replay.js",
      "src/rebalancer/operation-workflow-replacement-leader-resolution.js",
      "src/rebalancer/operation-workflow-replacement-leader-state.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-election-retargeting.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-replacement-election.js",
      "test/bootstrap/node-joining-service.test-part-7.js",
      "test/bootstrap/node-joining-service.test-part-8.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "test/bootstrap/node-joining-service.test.js",
      "src/rebalancer/operation-workflow-owner-segment-6.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-more-test-cases.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-test-cases.js",
      "src/rebalancer/operation-workflow-observed-state.js",
      "src/rebalancer/operation-workflow-priority-recovery-errors.js",
      "src/rebalancer/operation-workflow-remove-safety-evaluator.js",
      "src/rebalancer/operation-workflow-remove-safety-membership.js",
      "src/rebalancer/operation-workflow-replace-replay.js",
      "src/rebalancer/operation-workflow-replacement-leader-resolution.js",
      "src/rebalancer/operation-workflow-replacement-leader-state.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-election-retargeting.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-replacement-election.js",
      "work/packages/active-20260524-node-joining-service-test-suites.md",
      "test/bootstrap/node-joining-service.test-part-7.js",
      "test/bootstrap/node-joining-service.test-part-8.js"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "This package is front-loaded in the active sprint to reduce LLM and human confusion from oversized files before more rolling-restart runtime work resumes; it preserves behavior while forcing semantic helper names and file-size proof.",
    "stabilityCredit": "local-proof-only"
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run audit:file-size -- test/bootstrap/node-joining-service.test.js"
      ]
    }
  }
}
-->

## Why

`test/bootstrap/node-joining-service.test.js` is one of the largest oversized test files in the current audit. This package owns splitting it into semantically grouped suites below the configured test threshold without reducing coverage.

## Scope Basis

Approved maintenance/refactor scope from the active sprint's front-loaded oversized-file tranche. `npm run audit:file-size` reports this file at 3504/1500 lines.

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
- Route boundary: `node_joining_service_suites`
- Route dominant reason: `oversized_file_ratchet`
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

1. test/bootstrap/node-joining-service.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `test/bootstrap/node-joining-service.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:file-size -- test/bootstrap/node-joining-service.test.js`
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

- [x] action: implementation; owner: test_quality_owner; files-changed: test/bootstrap/node-joining-service.test.js, test/bootstrap/node-joining-service.test-part-7.js, test/bootstrap/node-joining-service.test-part-8.js; validation: `npm run audit:file-size -- test/bootstrap/node-joining-service.test.js` reports 0/60 over 1500 lines and `npx tap test/bootstrap/node-joining-service.test.js test/bootstrap/node-joining-service.test-part-7.js test/bootstrap/node-joining-service.test-part-8.js --disable-coverage` reports 201/201 pass and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: test_quality_owner; files-changed: none; validation: independent re-read confirmed each test block was moved as a contiguous unit; tap rerun across the three files reports 201/201 pass and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Theory Ledger

- No ledger update: this package is a behavior-preserving refactor that splits an oversized test file; no representative or causal theory was added or revised.

## Validation

1. npm run audit:file-size -- test/bootstrap/node-joining-service.test.js
