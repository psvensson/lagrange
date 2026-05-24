# Split node joining service tests below file-size limit

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "opened": "2026-05-24",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "test_quality_owner",
  "boundary": "node_joining_service_suites",
  "dominantReason": "oversized_file_ratchet",
  "currentState": "New package scaffolded from the shared work-package schema.",
  "nextAction": "Split semantically grouped node joining service test suites until test/bootstrap/node-joining-service.test.js is below the configured test file-size limit without reducing coverage.",
  "proof": [
    "npm run audit:file-size -- test/bootstrap/node-joining-service.test.js"
  ],
  "theoryLedgerRefs": [],
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "This package is front-loaded in the active sprint to reduce LLM and human confusion from oversized files before more rolling-restart runtime work resumes; it preserves behavior while forcing semantic helper names and file-size proof.",
  "writeScope": [
    "test/bootstrap/node-joining-service.test.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "test/bootstrap/node-joining-service.test.js"
  ],
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
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and forbidden files are named",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
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

- [ ] action: implementation; owner: <owner>; files-changed: <paths or none>; validation: <focused proof and parent revalidated focused proof: yes>; outcome: <validated|blocked>.
- [ ] action: verification-fix; owner: <owner>; files-changed: <paths or none>; validation: <verification proof and parent revalidated focused proof: yes>; outcome: <validated|blocked>.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: <validated|not-needed>.

## Validation

1. npm run audit:file-size -- test/bootstrap/node-joining-service.test.js
