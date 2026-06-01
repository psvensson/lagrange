# Refactor oversized source file src/control-plane/control-plane-system-table-gateway-segment-2.js

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
    "owner": "control_plane_file_size_owner",
    "boundary": "source_control_plane_control_plane_system_table_gateway_file_size_refactor_alpha",
    "currentState": "Current file-size audit reports src/control-plane/control-plane-system-table-gateway-segment-2.js at 1145/800 lines; no implementation is started in this package yet.",
    "nextAction": "Extract semantically named helper modules from src/control-plane/control-plane-system-table-gateway-segment-2.js until it is below 800 lines, preserving behavior and the public entrypoint.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/control-plane-system-table-gateway-segment-2.js",
      "src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/control-plane/control-plane-system-table-gateway-segment-2.js",
      "src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "The active rolling-restart stability sprint explicitly front-loads file-size cleanup before runtime stability work resumes; this package removes one remaining oversized file from the zero-oversized gate while preserving behavior.",
    "stabilityCredit": "local-proof-only",
    "codeQualityAdmission": {
      "reason": "active-guardrail-requirement",
      "evidence": "The package is generated from npm run audit:file-size -- --top 250 for src/control-plane/control-plane-system-table-gateway-segment-2.js; closure proof must make npm run audit:file-size -- --strict src/control-plane/control-plane-system-table-gateway-segment-2.js pass."
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
        "npm run audit:file-size -- --strict src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js",
        "node --check src/control-plane/control-plane-system-table-gateway-segment-2.js",
        "node --check src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js",
        "node --test test/control-plane/control-plane-system-table-gateway.test.js",
        "git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js work/packages/done-20260524-oversized-control-plane-control-plane-system-table-alpha.md"
      ]
    }
  }
}
-->

## Why

src/control-plane/control-plane-system-table-gateway-segment-2.js is a remaining oversized source file at 1145/800 lines. This package owns one disjoint target in the zero-oversized backlog so parallel executors can refactor it without crossing package scopes.

## Scope Basis

Approved maintenance/refactor scope from the active rolling-restart stability sprint. The May 24 full file-size audit reports src/control-plane/control-plane-system-table-gateway-segment-2.js at 1145/800 lines; closure must bring this file below the configured threshold without changing behavior or reducing coverage.

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
- Route owner: `control_plane_file_size_owner`
- Route boundary: `source_control_plane_control_plane_system_table_gateway_file_size_refactor_alpha`
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

1. src/control-plane/control-plane-system-table-gateway-segment-2.js
2. src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js

## Out Of Scope

1. test/
2. runtime ownership or public contract changes

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `src/control-plane/control-plane-system-table-gateway-segment-2.js`, `src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js`
- Forbidden files: `test/`, `runtime ownership or public contract changes`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:file-size -- --strict src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js`, `node --check src/control-plane/control-plane-system-table-gateway-segment-2.js`, `node --check src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js`, `node --test test/control-plane/control-plane-system-table-gateway.test.js`, `git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js work/packages/done-20260524-oversized-control-plane-control-plane-system-table-alpha.md`
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

- [x] action: implementation; owner: executor; files-changed: `src/control-plane/control-plane-system-table-gateway-segment-2.js`, `src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js`; validation: `npm run audit:file-size -- --strict src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js`, `node --check src/control-plane/control-plane-system-table-gateway-segment-2.js`, `node --check src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js`, `node --input-type=module -e "import('./src/control-plane/control-plane-system-table-gateway-segment-2.js').then(() => console.log('import ok'))"`, `node --test test/control-plane/control-plane-system-table-gateway.test.js`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: verifier_fixer; files-changed: package-owned files only; validation: strict file-size proof, syntax/import proof, focused gateway test proof, and `git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js work/packages/done-20260524-oversized-control-plane-control-plane-system-table-alpha.md`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: no ledger update required for scoped file-size refactor; outcome: not-needed.

## Validation

1. npm run audit:file-size -- --strict src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js
2. node --check src/control-plane/control-plane-system-table-gateway-segment-2.js
3. node --check src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js
4. node --test test/control-plane/control-plane-system-table-gateway.test.js
5. git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-2-query-methods.js work/packages/done-20260524-oversized-control-plane-control-plane-system-table-alpha.md
