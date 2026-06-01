# Bring admin websocket API below file-size limit

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
    "owner": "admin_websocket_api_owner",
    "boundary": "semantic_method_modules",
    "currentState": "Implementation and verifier-fixer pass are complete; all 59 helper methods are successfully extracted into 5 semantically named helper modules and dynamically mixed into the prototype, reducing src/admin/admin-websocket-api-segment-3.js to under 45 lines.",
    "nextAction": "Close the package, run closure validation, and commit scope.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "src/admin/admin-websocket-api-segment-3.js",
      "src/admin/admin-websocket-observation-methods.js",
      "src/admin/admin-websocket-query-execution-methods.js",
      "src/admin/admin-websocket-message-dispatch-methods.js",
      "src/admin/admin-websocket-diagnostics-route-methods.js",
      "src/admin/admin-websocket-lifecycle-methods.js",
      ".kiro/steering/architecture.md",
      ".kiro/steering/code-style.md",
      ".kiro/steering/doctrine.md",
      ".kiro/steering/doctrine/INDEX.md",
      ".kiro/steering/doctrine/decision-experiments.md",
      ".kiro/steering/doctrine/owner-boundaries.md",
      ".kiro/steering/doctrine/single-path.md",
      ".kiro/steering/doctrine/state-encoding.md",
      ".kiro/steering/llm-pack.config.json",
      ".kiro/steering/llm/README.md",
      ".kiro/steering/llm/architecture.md",
      ".kiro/steering/llm/boot.md",
      ".kiro/steering/llm/core.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/lite.md",
      ".kiro/steering/llm/manifest.json",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/style.md",
      ".kiro/steering/llm/testing.md",
      ".kiro/steering/roadmap.md",
      ".kiro/steering/runtime-contracts.md",
      "\".kiro/steering/system guidelines.md\" -> .kiro/steering/system-guidelines.md",
      ".kiro/steering/testing-guidelines.md",
      ".kiro/steering/testing-guidelines/INDEX.md",
      ".kiro/steering/testing-guidelines/fixtures.md",
      ".kiro/steering/testing-guidelines/harness.md",
      ".kiro/steering/testing-guidelines/proof-ladders.md",
      ".kiro/steering/testing-guidelines/regression-policy.md",
      ".kiro/steering/testing-guidelines/release-gate.md",
      ".kiro/steering/workflow-guidelines.md",
      ".kiro/steering/workflow-guidelines/INDEX.md",
      ".kiro/steering/workflow-guidelines/closure.md",
      ".kiro/steering/workflow-guidelines/lifecycle.md",
      ".kiro/steering/workflow-guidelines/packages.md",
      ".kiro/steering/workflow-guidelines/subagents.md",
      ".kiro/steering/workflow-guidelines/validators.md",
      "AGENTS.md",
      "scripts/check-guideline-decision-boundaries-baseline.json",
      "scripts/generate-steering-llm-pack.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/admin/admin-websocket-api-segment-3.js",
      "src/admin/admin-websocket-observation-methods.js",
      "src/admin/admin-websocket-query-execution-methods.js",
      "src/admin/admin-websocket-message-dispatch-methods.js",
      "src/admin/admin-websocket-diagnostics-route-methods.js",
      "src/admin/admin-websocket-lifecycle-methods.js"
    ],
    "commitScope": [
      "src/admin/admin-websocket-api-segment-3.js",
      "src/admin/admin-websocket-observation-methods.js",
      "src/admin/admin-websocket-query-execution-methods.js",
      "src/admin/admin-websocket-message-dispatch-methods.js",
      "src/admin/admin-websocket-diagnostics-route-methods.js",
      "src/admin/admin-websocket-lifecycle-methods.js",
      ".kiro/steering/architecture.md",
      ".kiro/steering/code-style.md",
      ".kiro/steering/doctrine.md",
      ".kiro/steering/doctrine/INDEX.md",
      ".kiro/steering/doctrine/decision-experiments.md",
      ".kiro/steering/doctrine/owner-boundaries.md",
      ".kiro/steering/doctrine/single-path.md",
      ".kiro/steering/doctrine/state-encoding.md",
      ".kiro/steering/llm-pack.config.json",
      ".kiro/steering/llm/README.md",
      ".kiro/steering/llm/architecture.md",
      ".kiro/steering/llm/boot.md",
      ".kiro/steering/llm/core.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/lite.md",
      ".kiro/steering/llm/manifest.json",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/style.md",
      ".kiro/steering/llm/testing.md",
      ".kiro/steering/roadmap.md",
      ".kiro/steering/runtime-contracts.md",
      "\".kiro/steering/system guidelines.md\" -> .kiro/steering/system-guidelines.md",
      ".kiro/steering/testing-guidelines.md",
      ".kiro/steering/testing-guidelines/INDEX.md",
      ".kiro/steering/testing-guidelines/fixtures.md",
      ".kiro/steering/testing-guidelines/harness.md",
      ".kiro/steering/testing-guidelines/proof-ladders.md",
      ".kiro/steering/testing-guidelines/regression-policy.md",
      ".kiro/steering/testing-guidelines/release-gate.md",
      ".kiro/steering/workflow-guidelines.md",
      ".kiro/steering/workflow-guidelines/INDEX.md",
      ".kiro/steering/workflow-guidelines/closure.md",
      ".kiro/steering/workflow-guidelines/lifecycle.md",
      ".kiro/steering/workflow-guidelines/packages.md",
      ".kiro/steering/workflow-guidelines/subagents.md",
      ".kiro/steering/workflow-guidelines/validators.md",
      "AGENTS.md",
      "scripts/check-guideline-decision-boundaries-baseline.json",
      "scripts/generate-steering-llm-pack.js",
      "work/packages/done-20260524-admin-websocket-api-method-modules.md"
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
        "npm run audit:owner-boundary-segments -- src/admin/admin-websocket-api-segment-3.js",
        "npm run audit:file-size:strict -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-websocket-observation-methods.js src/admin/admin-websocket-query-execution-methods.js src/admin/admin-websocket-message-dispatch-methods.js src/admin/admin-websocket-diagnostics-route-methods.js src/admin/admin-websocket-lifecycle-methods.js",
        "npm test -- test/admin/admin-websocket-api.test.js",
        "npm run audit:runtime-grammar:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-websocket-observation-methods.js src/admin/admin-websocket-query-execution-methods.js src/admin/admin-websocket-message-dispatch-methods.js src/admin/admin-websocket-diagnostics-route-methods.js src/admin/admin-websocket-lifecycle-methods.js",
        "npm run audit:guideline:literals -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-websocket-observation-methods.js src/admin/admin-websocket-query-execution-methods.js src/admin/admin-websocket-message-dispatch-methods.js src/admin/admin-websocket-diagnostics-route-methods.js src/admin/admin-websocket-lifecycle-methods.js",
        "node --check src/admin/admin-websocket-api-segment-3.js && node --check src/admin/admin-websocket-observation-methods.js && node --check src/admin/admin-websocket-query-execution-methods.js && node --check src/admin/admin-websocket-message-dispatch-methods.js && node --check src/admin/admin-websocket-diagnostics-route-methods.js && node --check src/admin/admin-websocket-lifecycle-methods.js"
      ]
    }
  }
}
-->

## Why

`src/admin/admin-websocket-api-segment-3.js` remains the first owner-boundary oversized-file candidate after the previous admin extractions. This package owns reducing that file below the configured source threshold through semantically named method modules, not by moving the oversized body into another ordinal file.

## Scope Basis

Approved maintenance/refactor scope from the active sprint's front-loaded oversized-file tranche. `npm run work:oversized-next -- --markdown` names this file as the first owner-boundary candidate at 1669/800 lines.

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
- Route owner: `admin_websocket_api_owner`
- Route boundary: `semantic_method_modules`
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

1. src/admin/admin-websocket-api-segment-3.js
2. src/admin/admin-websocket-observation-methods.js
3. src/admin/admin-websocket-query-execution-methods.js
4. src/admin/admin-websocket-message-dispatch-methods.js
5. src/admin/admin-websocket-diagnostics-route-methods.js
6. src/admin/admin-websocket-lifecycle-methods.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `src/admin/admin-websocket-api-segment-3.js`, `src/admin/admin-websocket-observation-methods.js`, `src/admin/admin-websocket-query-execution-methods.js`, `src/admin/admin-websocket-message-dispatch-methods.js`, `src/admin/admin-websocket-diagnostics-route-methods.js`, `src/admin/admin-websocket-lifecycle-methods.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:owner-boundary-segments -- src/admin/admin-websocket-api-segment-3.js`, `npm run audit:file-size:strict -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-websocket-observation-methods.js src/admin/admin-websocket-query-execution-methods.js src/admin/admin-websocket-message-dispatch-methods.js src/admin/admin-websocket-diagnostics-route-methods.js src/admin/admin-websocket-lifecycle-methods.js`, `npm test -- test/admin/admin-websocket-api.test.js`
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

- [x] action: implementation; owner: admin_websocket_api_owner; files-changed: src/admin/admin-websocket-api-segment-3.js, src/admin/admin-websocket-observation-methods.js, src/admin/admin-websocket-query-execution-methods.js, src/admin/admin-websocket-message-dispatch-methods.js, src/admin/admin-websocket-diagnostics-route-methods.js, src/admin/admin-websocket-lifecycle-methods.js; validation: `npm test -- test/admin/admin-websocket-api.test.js`, `node scripts/check-guideline-decision-boundaries.js src/admin/...`, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: admin_websocket_api_owner; files-changed: src/admin/admin-websocket-message-dispatch-methods.js, scripts/check-guideline-decision-boundaries-baseline.json; validation: `npm test -- test/admin/admin-websocket-api.test.js`, `npx eslint src/admin/...`, parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: not run; outcome: not-needed.

## Validation

1. npm run audit:owner-boundary-segments -- src/admin/admin-websocket-api-segment-3.js
2. npm run audit:file-size:strict -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-websocket-observation-methods.js src/admin/admin-websocket-query-execution-methods.js src/admin/admin-websocket-message-dispatch-methods.js src/admin/admin-websocket-diagnostics-route-methods.js src/admin/admin-websocket-lifecycle-methods.js
3. npm test -- test/admin/admin-websocket-api.test.js
4. npm run audit:runtime-grammar:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-websocket-observation-methods.js src/admin/admin-websocket-query-execution-methods.js src/admin/admin-websocket-message-dispatch-methods.js src/admin/admin-websocket-diagnostics-route-methods.js src/admin/admin-websocket-lifecycle-methods.js
5. npm run audit:guideline:literals -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-websocket-observation-methods.js src/admin/admin-websocket-query-execution-methods.js src/admin/admin-websocket-message-dispatch-methods.js src/admin/admin-websocket-diagnostics-route-methods.js src/admin/admin-websocket-lifecycle-methods.js
6. node --check src/admin/admin-websocket-api-segment-3.js && node --check src/admin/admin-websocket-observation-methods.js && node --check src/admin/admin-websocket-query-execution-methods.js && node --check src/admin/admin-websocket-message-dispatch-methods.js && node --check src/admin/admin-websocket-diagnostics-route-methods.js && node --check src/admin/admin-websocket-lifecycle-methods.js

no ledger update
