# Refactor oversized source file src/cli/index.js

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
    "owner": "cli_file_size_owner",
    "boundary": "source_cli_index_file_size_refactor",
    "currentState": "src/cli/index.js has been split into semantically named CLI helper modules; focused proof is recorded in this package.",
    "nextAction": "Run verifier-fixer before package closure if closure is requested.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "src/cli/index.js",
      "src/cli/admin-cli-local-constants.js",
      "src/cli/admin-cli-debug-log.js",
      "src/cli/admin-cli-setup-methods.js",
      "src/cli/admin-cli-connection-methods.js",
      "src/cli/admin-cli-render-methods.js",
      "src/cli/admin-cli-navigation-methods.js",
      "work/packages/done-20260524-oversized-cli-index.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/cli/index.js",
      "src/cli/admin-cli-local-constants.js",
      "src/cli/admin-cli-debug-log.js",
      "src/cli/admin-cli-setup-methods.js",
      "src/cli/admin-cli-connection-methods.js",
      "src/cli/admin-cli-render-methods.js",
      "src/cli/admin-cli-navigation-methods.js",
      "work/packages/done-20260524-oversized-cli-index.md"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "The active rolling-restart stability sprint explicitly front-loads file-size cleanup before runtime stability work resumes; this package removes one remaining oversized file from the zero-oversized gate while preserving behavior.",
    "stabilityCredit": "local-proof-only",
    "codeQualityAdmission": {
      "reason": "active-guardrail-requirement",
      "evidence": "The package is generated from npm run audit:file-size -- --top 250 for src/cli/index.js; closure proof must make npm run audit:file-size -- --strict src/cli/index.js pass."
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
        "npm run audit:file-size -- --strict src/cli/index.js src/cli/admin-cli-local-constants.js src/cli/admin-cli-debug-log.js src/cli/admin-cli-setup-methods.js src/cli/admin-cli-connection-methods.js src/cli/admin-cli-render-methods.js src/cli/admin-cli-navigation-methods.js",
        "node --input-type=module -e 'import {spawnSync} from \"node:child_process\"; const files = [\"src/cli/index.js\", \"src/cli/admin-cli-local-constants.js\", \"src/cli/admin-cli-debug-log.js\", \"src/cli/admin-cli-setup-methods.js\", \"src/cli/admin-cli-connection-methods.js\", \"src/cli/admin-cli-render-methods.js\", \"src/cli/admin-cli-navigation-methods.js\"]; for (const file of files) { const result = spawnSync(process.execPath, [\"--check\", file], {stdio: \"inherit\"}); if (result.status) process.exit(result.status); }'",
        "node --test test/cli/index.test.js",
        "git diff --check -- src/cli/index.js src/cli/admin-cli-local-constants.js src/cli/admin-cli-debug-log.js src/cli/admin-cli-setup-methods.js src/cli/admin-cli-connection-methods.js src/cli/admin-cli-render-methods.js src/cli/admin-cli-navigation-methods.js work/packages/done-20260524-oversized-cli-index.md"
      ]
    }
  }
}
-->

## Why

src/cli/index.js is a remaining oversized source file at 1507/800 lines. This package owns one disjoint target in the zero-oversized backlog so parallel executors can refactor it without crossing package scopes.

## Scope Basis

Approved maintenance/refactor scope from the active rolling-restart stability sprint. The May 24 full file-size audit reports src/cli/index.js at 1507/800 lines; closure must bring this file below the configured threshold without changing behavior or reducing coverage.

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
- Route owner: `cli_file_size_owner`
- Route boundary: `source_cli_index_file_size_refactor`
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

1. src/cli/index.js
2. src/cli/admin-cli-local-constants.js
3. src/cli/admin-cli-debug-log.js
4. src/cli/admin-cli-setup-methods.js
5. src/cli/admin-cli-connection-methods.js
6. src/cli/admin-cli-render-methods.js
7. src/cli/admin-cli-navigation-methods.js
8. work/packages/done-20260524-oversized-cli-index.md

## Out Of Scope

1. test/
2. runtime ownership or public contract changes

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `src/cli/index.js`, `src/cli/admin-cli-local-constants.js`, `src/cli/admin-cli-debug-log.js`, `src/cli/admin-cli-setup-methods.js`, `src/cli/admin-cli-connection-methods.js`, `src/cli/admin-cli-render-methods.js`, `src/cli/admin-cli-navigation-methods.js`, `work/packages/done-20260524-oversized-cli-index.md`
- Forbidden files: `test/`, `runtime ownership or public contract changes`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: strict file-size for the target and helpers, `node --check` for changed JS files, `node --test test/cli/index.test.js`, and scoped `git diff --check`.
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

- [x] action: implementation; owner: executor; files-changed: src/cli/index.js plus semantically named src/cli/admin-cli-* helper modules and this package file; validation: focused proof and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: codex_verifier_fixer; files-changed: work/packages/done-20260524-oversized-cli-index.md only; validation: `npm run audit:file-size -- --strict src/cli/index.js src/cli/admin-cli-local-constants.js src/cli/admin-cli-debug-log.js src/cli/admin-cli-setup-methods.js src/cli/admin-cli-connection-methods.js src/cli/admin-cli-render-methods.js src/cli/admin-cli-navigation-methods.js` passed (Source oversized-file ratchet: 0/144 over 800 lines; Test oversized-file ratchet: 0/60 over 1500 lines); `node --check` passed for all owned JS files; `node --test test/cli/index.test.js` passed (26 tests, 18 suites); `git diff --check -- src/cli/index.js src/cli/admin-cli-local-constants.js src/cli/admin-cli-debug-log.js src/cli/admin-cli-setup-methods.js src/cli/admin-cli-connection-methods.js src/cli/admin-cli-render-methods.js src/cli/admin-cli-navigation-methods.js work/packages/done-20260524-oversized-cli-index.md` passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: not-needed; outcome: not-needed.

Theory ledger: no ledger update; behavior-preserving oversized-file refactor only.

## Validation

1. npm run audit:file-size -- --strict src/cli/index.js src/cli/admin-cli-local-constants.js src/cli/admin-cli-debug-log.js src/cli/admin-cli-setup-methods.js src/cli/admin-cli-connection-methods.js src/cli/admin-cli-render-methods.js src/cli/admin-cli-navigation-methods.js
2. node --input-type=module -e 'import {spawnSync} from "node:child_process"; const files = ["src/cli/index.js", "src/cli/admin-cli-local-constants.js", "src/cli/admin-cli-debug-log.js", "src/cli/admin-cli-setup-methods.js", "src/cli/admin-cli-connection-methods.js", "src/cli/admin-cli-render-methods.js", "src/cli/admin-cli-navigation-methods.js"]; for (const file of files) { const result = spawnSync(process.execPath, ["--check", file], {stdio: "inherit"}); if (result.status) process.exit(result.status); }'
3. node --test test/cli/index.test.js
4. git diff --check -- src/cli/index.js src/cli/admin-cli-local-constants.js src/cli/admin-cli-debug-log.js src/cli/admin-cli-setup-methods.js src/cli/admin-cli-connection-methods.js src/cli/admin-cli-render-methods.js src/cli/admin-cli-navigation-methods.js work/packages/done-20260524-oversized-cli-index.md
