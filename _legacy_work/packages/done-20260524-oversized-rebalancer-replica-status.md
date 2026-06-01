# Refactor oversized source file src/rebalancer/replica-status.js

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
    "owner": "rebalancer_file_size_owner",
    "boundary": "source_rebalancer_replica_status_file_size_refactor",
    "currentState": "src/rebalancer/replica-status.js has been split so replica operation progress and workflow exports live in src/rebalancer/replica-operation-progress.js while src/rebalancer/replica-status.js preserves the public entrypoint; focused proof is recorded in package evidence.",
    "nextAction": "Review the ready diff and perform the close/rename/push ceremony separately if requested; this pass intentionally leaves the package unclosed.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "src/rebalancer/replica-status.js",
      "src/rebalancer/replica-operation-progress.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/rebalancer/replica-status.js",
      "src/rebalancer/replica-operation-progress.js",
      "work/packages/done-20260524-oversized-rebalancer-replica-status.md"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "The active rolling-restart stability sprint explicitly front-loads file-size cleanup before runtime stability work resumes; this package removes one remaining oversized file from the zero-oversized gate while preserving behavior.",
    "stabilityCredit": "local-proof-only",
    "codeQualityAdmission": {
      "reason": "active-guardrail-requirement",
      "evidence": "The package is generated from npm run audit:file-size -- --top 250 for src/rebalancer/replica-status.js; closure proof must make npm run audit:file-size -- --strict src/rebalancer/replica-status.js src/rebalancer/replica-operation-progress.js pass."
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
        "npm run audit:file-size -- --strict src/rebalancer/replica-status.js src/rebalancer/replica-operation-progress.js",
        "node --check src/rebalancer/replica-status.js",
        "node --check src/rebalancer/replica-operation-progress.js",
        "node --input-type=module -e \"const m=await import('./src/rebalancer/replica-status.js'); const op=m.createOperation({operationId:'op',type:m.OperationType.REPLACE,partitionId:'p',sourceNodeId:'s',targetNodeId:'t',sourceReplicaId:'r'}); if (op.stepsHistory[0][m.OPERATION_METADATA_KEY.SOURCE_REPLICA_ID] !== 'r') process.exit(1);\"",
        "git diff --check -- src/rebalancer/replica-status.js src/rebalancer/replica-operation-progress.js work/packages/done-20260524-oversized-rebalancer-replica-status.md"
      ]
    }
  }
}
-->

## Why

src/rebalancer/replica-status.js was a remaining oversized source file at 890/800 lines. This package owns the target plus the semantically named helper needed to keep the public entrypoint stable while satisfying the zero-oversized gate.

## Scope Basis

Approved maintenance/refactor scope from the active rolling-restart stability sprint. The May 24 full file-size audit reports src/rebalancer/replica-status.js at 890/800 lines; closure must keep the target and helper below the configured threshold without changing behavior or reducing coverage.

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
- Route owner: `rebalancer_file_size_owner`
- Route boundary: `source_rebalancer_replica_status_file_size_refactor`
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

1. src/rebalancer/replica-status.js
2. src/rebalancer/replica-operation-progress.js

## Out Of Scope

1. test/
2. runtime ownership or public contract changes

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `src/rebalancer/replica-status.js`, `src/rebalancer/replica-operation-progress.js`
- Forbidden files: `test/`, `runtime ownership or public contract changes`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: strict file-size for `src/rebalancer/replica-status.js` and `src/rebalancer/replica-operation-progress.js`; `node --check` for both JS files; public entrypoint import smoke; package closure validation; `git diff --check` for touched files.
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

- [x] action: implementation; owner: executor; files-changed: src/rebalancer/replica-status.js, src/rebalancer/replica-operation-progress.js, work/packages/done-20260524-oversized-rebalancer-replica-status.md; validation: pre-impl validation passed before edits; extracted replica operation progress/workflow constants and helpers into src/rebalancer/replica-operation-progress.js while preserving src/rebalancer/replica-status.js as the public entrypoint; strict file-size audit passed for target/helper with source oversized-file ratchet 0/144 over 800 and test oversized-file ratchet 0/60 over 1500; `node --check` passed for both touched JS files; public entrypoint import smoke passed; focused `node --test test/rebalancer/replica-status-completeness.property.test.js` passed 98/98 tests; parent revalidated focused proof: yes; no ledger update; outcome: validated.
- [x] action: verification-fix; owner: verifier_fixer; files-changed: package-owned files only; validation: `npm run audit:file-size -- --strict src/rebalancer/replica-status.js src/rebalancer/replica-operation-progress.js` passed; `node --check src/rebalancer/replica-status.js` passed; `node --check src/rebalancer/replica-operation-progress.js` passed; import smoke for `src/rebalancer/replica-status.js` passed; `node --test test/rebalancer/replica-status-completeness.property.test.js` passed 98/98 tests; package closure validation passed; scoped tracked `git diff --check` passed; no-index helper whitespace check emitted no diagnostics; parent revalidated focused proof: yes; no ledger update; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: not run because this package was intentionally not closed/renamed and current-blocker tracker files were not mutated; no ledger update; outcome: not-needed.

No ledger update: this is a behavior-preserving oversized-file refactor with no representative evidence or theory-ledger truth change.

## Validation

1. npm run audit:file-size -- --strict src/rebalancer/replica-status.js src/rebalancer/replica-operation-progress.js
2. node --check src/rebalancer/replica-status.js
3. node --check src/rebalancer/replica-operation-progress.js
4. node --input-type=module -e "const m=await import('./src/rebalancer/replica-status.js'); const op=m.createOperation({operationId:'op',type:m.OperationType.REPLACE,partitionId:'p',sourceNodeId:'s',targetNodeId:'t',sourceReplicaId:'r'}); if (op.stepsHistory[0][m.OPERATION_METADATA_KEY.SOURCE_REPLICA_ID] !== 'r') process.exit(1);"
5. npm run work:validate -- --closure work/packages/done-20260524-oversized-rebalancer-replica-status.md
6. git diff --check -- src/rebalancer/replica-status.js src/rebalancer/replica-operation-progress.js work/packages/done-20260524-oversized-rebalancer-replica-status.md
