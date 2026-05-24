# Split oversized test/support file test/distributed/harness/failure-bundle-segment-5.js

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-24",
    "closed": "2026-05-24",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "test_quality_owner",
    "boundary": "test_distributed_harness_failure_bundle_file_size_refactor",
    "currentState": "Split complete: failure-bundle-segment-5.js is now 545/1500 lines; helper files are 187, 959, 1206, 412, and 1053 lines. Parent revalidated strict file-size, syntax, export smoke, and diff-check proof. The broader failure-bundle suite remains red with the same 13 failures on clean HEAD, so it is recorded as pre-existing residual rather than package-owned regression.",
    "nextAction": "Close package after closure validation and sprint link update.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "test/distributed/harness/failure-bundle-segment-5.js",
      "test/distributed/harness/failure-bundle-classification-constants.js",
      "test/distributed/harness/failure-bundle-failure-classification.js",
      "test/distributed/harness/failure-bundle-priority-recovery-classification.js",
      "test/distributed/harness/failure-bundle-stability-gates.js",
      "test/distributed/harness/failure-bundle-triage-summary.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "test/distributed/harness/failure-bundle-segment-5.js",
      "test/distributed/harness/failure-bundle-classification-constants.js",
      "test/distributed/harness/failure-bundle-failure-classification.js",
      "test/distributed/harness/failure-bundle-priority-recovery-classification.js",
      "test/distributed/harness/failure-bundle-stability-gates.js",
      "test/distributed/harness/failure-bundle-triage-summary.js"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "The active rolling-restart stability sprint explicitly front-loads file-size cleanup before runtime stability work resumes; this package removes one remaining oversized file from the zero-oversized gate while preserving behavior.",
    "stabilityCredit": "local-proof-only",
    "codeQualityAdmission": {
      "reason": "active-guardrail-requirement",
      "evidence": "Closure proof made strict file-size pass for test/distributed/harness/failure-bundle-segment-5.js, test/distributed/harness/failure-bundle-classification-constants.js, test/distributed/harness/failure-bundle-failure-classification.js, test/distributed/harness/failure-bundle-priority-recovery-classification.js, test/distributed/harness/failure-bundle-stability-gates.js, test/distributed/harness/failure-bundle-triage-summary.js and parent revalidated focused proof before package closure."
    }
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "helper or split filenames cannot be chosen semantically inside this target directory",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run audit:file-size -- --strict test/distributed/harness/failure-bundle-segment-5.js test/distributed/harness/failure-bundle-classification-constants.js test/distributed/harness/failure-bundle-failure-classification.js test/distributed/harness/failure-bundle-priority-recovery-classification.js test/distributed/harness/failure-bundle-stability-gates.js test/distributed/harness/failure-bundle-triage-summary.js",
        "node --check test/distributed/harness/failure-bundle-segment-5.js",
        "node --check test/distributed/harness/failure-bundle-classification-constants.js",
        "node --check test/distributed/harness/failure-bundle-failure-classification.js",
        "node --check test/distributed/harness/failure-bundle-priority-recovery-classification.js",
        "node --check test/distributed/harness/failure-bundle-stability-gates.js",
        "node --check test/distributed/harness/failure-bundle-triage-summary.js",
        "node --input-type=module -e \"import {FAILURE_BUNDLE_SEGMENT_5} from './test/distributed/harness/failure-bundle-segment-5.js'; if (typeof FAILURE_BUNDLE_SEGMENT_5.buildScenarioFailureBundle !== 'function') throw new Error('failure bundle export missing'); console.log('failure bundle split export ok')\"",
        "git diff --check -- work/packages/done-20260524-oversized-distributed-harness-failure-bundle.md test/distributed/harness/failure-bundle-segment-5.js test/distributed/harness/failure-bundle-classification-constants.js test/distributed/harness/failure-bundle-failure-classification.js test/distributed/harness/failure-bundle-priority-recovery-classification.js test/distributed/harness/failure-bundle-stability-gates.js test/distributed/harness/failure-bundle-triage-summary.js"
      ]
    }
  }
}
-->

## Why

test/distributed/harness/failure-bundle-segment-5.js is a remaining oversized test/support file at 3158/1500 lines. This package owns one disjoint target in the zero-oversized backlog so parallel executors can refactor it without crossing package scopes.

## Scope Basis

Approved maintenance/refactor scope from the active rolling-restart stability sprint. The May 24 full file-size audit reports test/distributed/harness/failure-bundle-segment-5.js at 3158/1500 lines; closure must bring this file below the configured threshold without changing behavior or reducing coverage.

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
- Route boundary: `test_distributed_harness_failure_bundle_file_size_refactor`
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

1. test/distributed/harness/failure-bundle-segment-5.js
2. test/distributed/harness/failure-bundle-classification-constants.js
3. test/distributed/harness/failure-bundle-failure-classification.js
4. test/distributed/harness/failure-bundle-priority-recovery-classification.js
5. test/distributed/harness/failure-bundle-stability-gates.js
6. test/distributed/harness/failure-bundle-triage-summary.js

## Out Of Scope

1. src/
2. coverage reduction or assertion deletion

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `test/distributed/harness/failure-bundle-segment-5.js`, `test/distributed/harness/failure-bundle-classification-constants.js`, `test/distributed/harness/failure-bundle-failure-classification.js`, `test/distributed/harness/failure-bundle-priority-recovery-classification.js`, `test/distributed/harness/failure-bundle-stability-gates.js`, `test/distributed/harness/failure-bundle-triage-summary.js`
- Forbidden files: `src/`, `coverage reduction or assertion deletion`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:file-size -- --strict test/distributed/harness/failure-bundle-segment-5.js test/distributed/harness/failure-bundle-classification-constants.js test/distributed/harness/failure-bundle-failure-classification.js test/distributed/harness/failure-bundle-priority-recovery-classification.js test/distributed/harness/failure-bundle-stability-gates.js test/distributed/harness/failure-bundle-triage-summary.js`, `node --check test/distributed/harness/failure-bundle-segment-5.js`, `node --check test/distributed/harness/failure-bundle-classification-constants.js`, `node --check test/distributed/harness/failure-bundle-failure-classification.js`, `node --check test/distributed/harness/failure-bundle-priority-recovery-classification.js`, `node --check test/distributed/harness/failure-bundle-stability-gates.js`, `node --check test/distributed/harness/failure-bundle-triage-summary.js`, `node --input-type=module -e "import {FAILURE_BUNDLE_SEGMENT_5} from './test/distributed/harness/failure-bundle-segment-5.js'; if (typeof FAILURE_BUNDLE_SEGMENT_5.buildScenarioFailureBundle !== 'function') throw new Error('failure bundle export missing'); console.log('failure bundle split export ok')"`, `git diff --check -- work/packages/done-20260524-oversized-distributed-harness-failure-bundle.md test/distributed/harness/failure-bundle-segment-5.js test/distributed/harness/failure-bundle-classification-constants.js test/distributed/harness/failure-bundle-failure-classification.js test/distributed/harness/failure-bundle-priority-recovery-classification.js test/distributed/harness/failure-bundle-stability-gates.js test/distributed/harness/failure-bundle-triage-summary.js`
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

- [x] action: implementation; owner: executor; files-changed: target file plus semantically named helper/split files added to this package before pre-impl; validation: focused proof and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: verifier_fixer; files-changed: package-owned files only; validation: strict file-size proof, syntax/focused test proof, and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: no ledger update needed before package closure; outcome: not-needed.

## Validation

1. npm run audit:file-size -- --strict test/distributed/harness/failure-bundle-segment-5.js test/distributed/harness/failure-bundle-classification-constants.js test/distributed/harness/failure-bundle-failure-classification.js test/distributed/harness/failure-bundle-priority-recovery-classification.js test/distributed/harness/failure-bundle-stability-gates.js test/distributed/harness/failure-bundle-triage-summary.js
2. node --check test/distributed/harness/failure-bundle-segment-5.js
3. node --check test/distributed/harness/failure-bundle-classification-constants.js
4. node --check test/distributed/harness/failure-bundle-failure-classification.js
5. node --check test/distributed/harness/failure-bundle-priority-recovery-classification.js
6. node --check test/distributed/harness/failure-bundle-stability-gates.js
7. node --check test/distributed/harness/failure-bundle-triage-summary.js
8. node --input-type=module -e "import {FAILURE_BUNDLE_SEGMENT_5} from './test/distributed/harness/failure-bundle-segment-5.js'; if (typeof FAILURE_BUNDLE_SEGMENT_5.buildScenarioFailureBundle !== 'function') throw new Error('failure bundle export missing'); console.log('failure bundle split export ok')"
9. git diff --check -- work/packages/done-20260524-oversized-distributed-harness-failure-bundle.md test/distributed/harness/failure-bundle-segment-5.js test/distributed/harness/failure-bundle-classification-constants.js test/distributed/harness/failure-bundle-failure-classification.js test/distributed/harness/failure-bundle-priority-recovery-classification.js test/distributed/harness/failure-bundle-stability-gates.js test/distributed/harness/failure-bundle-triage-summary.js
