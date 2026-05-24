# Refactor oversized source file src/debug-runtime/debug-metadata-service.js

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
    "owner": "debug_runtime_file_size_owner",
    "boundary": "source_debug_runtime_debug_metadata_service_file_size_refactor",
    "currentState": "Implementation split is complete locally: src/debug-runtime/debug-metadata-service.js is 716/800 lines and helper modules are 63, 111, and 144 lines. Focused local proof is green; parent revalidated focused proof: yes.",
    "nextAction": "Close this package atomically with the validated wave.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "src/debug-runtime/debug-metadata-service.js",
      "src/debug-runtime/debug-metadata-service-policy.js",
      "src/debug-runtime/debug-metadata-service-row-normalizers.js",
      "src/debug-runtime/debug-metadata-service-value-helpers.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      "src/debug-runtime/debug-metadata-service-policy.js",
      "src/debug-runtime/debug-metadata-service-row-normalizers.js",
      "src/debug-runtime/debug-metadata-service-value-helpers.js"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/debug-runtime/debug-metadata-service.js",
      "src/debug-runtime/debug-metadata-service-policy.js",
      "src/debug-runtime/debug-metadata-service-row-normalizers.js",
      "src/debug-runtime/debug-metadata-service-value-helpers.js",
      "work/packages/done-20260524-oversized-debug-runtime-debug-metadata-service.md"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "The active rolling-restart stability sprint explicitly front-loads file-size cleanup before runtime stability work resumes; this package removes one remaining oversized file from the zero-oversized gate while preserving behavior.",
    "stabilityCredit": "local-proof-only",
    "codeQualityAdmission": {
      "reason": "active-guardrail-requirement",
      "evidence": "The package is generated from npm run audit:file-size -- --top 250 for src/debug-runtime/debug-metadata-service.js; focused local proof made npm run audit:file-size -- --strict src/debug-runtime/debug-metadata-service.js src/debug-runtime/debug-metadata-service-policy.js src/debug-runtime/debug-metadata-service-row-normalizers.js src/debug-runtime/debug-metadata-service-value-helpers.js pass."
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
        "npm run audit:file-size -- --strict src/debug-runtime/debug-metadata-service.js src/debug-runtime/debug-metadata-service-policy.js src/debug-runtime/debug-metadata-service-row-normalizers.js src/debug-runtime/debug-metadata-service-value-helpers.js",
        "node --check src/debug-runtime/debug-metadata-service.js",
        "node --check src/debug-runtime/debug-metadata-service-policy.js",
        "node --check src/debug-runtime/debug-metadata-service-row-normalizers.js",
        "node --check src/debug-runtime/debug-metadata-service-value-helpers.js",
        "node --input-type=module -e \"const mod = await import('./src/debug-runtime/debug-metadata-service.js'); const store = new mod.DebugMetadataStore(); if (typeof mod.DebugMetadataStore !== 'function' || typeof mod.defaultDebugPolicyResolver !== 'function' || typeof mod.createDebugMetadataError !== 'function' || typeof store.updateSessionEndpoint !== 'function') { throw new Error('debug metadata import smoke failed'); } console.log('debug metadata import smoke OK');\"",
        "node --test test/debug-runtime/debug-metadata-service.test.js",
        "git diff --check -- src/debug-runtime/debug-metadata-service.js src/debug-runtime/debug-metadata-service-policy.js src/debug-runtime/debug-metadata-service-row-normalizers.js src/debug-runtime/debug-metadata-service-value-helpers.js work/packages/done-20260524-oversized-debug-runtime-debug-metadata-service.md"
      ]
    }
  }
}
-->

## Why

src/debug-runtime/debug-metadata-service.js is a remaining oversized source file at 951/800 lines. This package owns one disjoint target in the zero-oversized backlog so parallel executors can refactor it without crossing package scopes.

## Scope Basis

Approved maintenance/refactor scope from the active rolling-restart stability sprint. The May 24 full file-size audit reports src/debug-runtime/debug-metadata-service.js at 951/800 lines; closure must bring this file below the configured threshold without changing behavior or reducing coverage.

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
- Route owner: `debug_runtime_file_size_owner`
- Route boundary: `source_debug_runtime_debug_metadata_service_file_size_refactor`
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

1. src/debug-runtime/debug-metadata-service.js
2. src/debug-runtime/debug-metadata-service-policy.js
3. src/debug-runtime/debug-metadata-service-row-normalizers.js
4. src/debug-runtime/debug-metadata-service-value-helpers.js

## Out Of Scope

1. test/
2. runtime ownership or public contract changes

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `src/debug-runtime/debug-metadata-service.js`, `src/debug-runtime/debug-metadata-service-policy.js`, `src/debug-runtime/debug-metadata-service-row-normalizers.js`, `src/debug-runtime/debug-metadata-service-value-helpers.js`
- Forbidden files: `test/`, `runtime ownership or public contract changes`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:file-size -- --strict src/debug-runtime/debug-metadata-service.js src/debug-runtime/debug-metadata-service-policy.js src/debug-runtime/debug-metadata-service-row-normalizers.js src/debug-runtime/debug-metadata-service-value-helpers.js`, `node --check` for touched JS, debug metadata import smoke, `node --test test/debug-runtime/debug-metadata-service.test.js`, `git diff --check --` package-owned files
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

- [x] action: implementation; owner: executor; files-changed: src/debug-runtime/debug-metadata-service.js, src/debug-runtime/debug-metadata-service-policy.js, src/debug-runtime/debug-metadata-service-row-normalizers.js, src/debug-runtime/debug-metadata-service-value-helpers.js, work/packages/done-20260524-oversized-debug-runtime-debug-metadata-service.md; validation: initial pre-impl PASS, second pre-impl after helper scope expansion PASS, final pre-impl after evidence update PASS, line counts 716/63/111/144, strict file-size audit PASS, `node --check` for touched JS PASS, debug metadata import smoke PASS, `node --test test/debug-runtime/debug-metadata-service.test.js` PASS 6/6, scoped `git diff --check` PASS, no-index whitespace check for untracked helper files PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: verifier_fixer; files-changed: package metadata only; validation: parent revalidated focused proof: yes; strict wave file-size/import smoke and node --test test/debug-runtime/debug-metadata-service.test.js passed 6/6; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: no ledger update needed before wave closure; outcome: not-needed.

## Validation

1. `npm run work:validate -- --pre-impl work/packages/done-20260524-oversized-debug-runtime-debug-metadata-service.md` - PASS before source edits.
2. `npm run work:validate -- --pre-impl work/packages/done-20260524-oversized-debug-runtime-debug-metadata-service.md` - PASS after adding helper files to package scope.
3. `npm run work:validate -- --pre-impl work/packages/done-20260524-oversized-debug-runtime-debug-metadata-service.md` - PASS after evidence update.
4. `wc -l src/debug-runtime/debug-metadata-service.js src/debug-runtime/debug-metadata-service-policy.js src/debug-runtime/debug-metadata-service-row-normalizers.js src/debug-runtime/debug-metadata-service-value-helpers.js` - 716, 63, 111, and 144 lines.
5. `npm run audit:file-size -- --strict src/debug-runtime/debug-metadata-service.js src/debug-runtime/debug-metadata-service-policy.js src/debug-runtime/debug-metadata-service-row-normalizers.js src/debug-runtime/debug-metadata-service-value-helpers.js` - PASS: `Source oversized-file ratchet: 0/144 over 800 lines.` `Test oversized-file ratchet: 0/60 over 1500 lines.`
6. `node --check src/debug-runtime/debug-metadata-service.js` - PASS.
7. `node --check src/debug-runtime/debug-metadata-service-policy.js` - PASS.
8. `node --check src/debug-runtime/debug-metadata-service-row-normalizers.js` - PASS.
9. `node --check src/debug-runtime/debug-metadata-service-value-helpers.js` - PASS.
10. `node --input-type=module -e "const mod = await import('./src/debug-runtime/debug-metadata-service.js'); const store = new mod.DebugMetadataStore(); if (typeof mod.DebugMetadataStore !== 'function' || typeof mod.defaultDebugPolicyResolver !== 'function' || typeof mod.createDebugMetadataError !== 'function' || typeof store.updateSessionEndpoint !== 'function') { throw new Error('debug metadata import smoke failed'); } console.log('debug metadata import smoke OK');"` - PASS: `debug metadata import smoke OK`.
11. `node --test test/debug-runtime/debug-metadata-service.test.js` - PASS: 1 suite, 6 tests.
12. `git diff --check -- src/debug-runtime/debug-metadata-service.js src/debug-runtime/debug-metadata-service-policy.js src/debug-runtime/debug-metadata-service-row-normalizers.js src/debug-runtime/debug-metadata-service-value-helpers.js work/packages/done-20260524-oversized-debug-runtime-debug-metadata-service.md` - PASS.
13. `/bin/bash -lc '<git diff --no-index --check loop over untracked helper files>'` - PASS with no whitespace warnings.
14. Parent revalidated focused proof - PENDING for parent runner.
