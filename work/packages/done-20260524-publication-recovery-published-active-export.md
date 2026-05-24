# Restore publication recovery published-active export

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
    "boundary": "publication_recovery_evidence_normalizer_facade_exports",
    "currentState": "The first oversized publication-recovery facade split omitted the existing resolvePublicationRecoveryPublishedActiveNodeIds export, blocking focused tests that import publication-recovery-evidence-builders.js.",
    "nextAction": "Restore resolvePublicationRecoveryPublishedActiveNodeIds on the publication recovery evidence normalizer facade and rerun the blocked focused tests.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/publication-recovery-evidence-values.js",
      "src/control-plane/publication-recovery-evidence-normalizers.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/control-plane/publication-recovery-evidence-values.js",
      "src/control-plane/publication-recovery-evidence-normalizers.js"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "Restores the behavior-preserving public facade contract needed to verify the next oversized-file refactor wave without changing runtime ownership or representative evidence.",
    "stabilityCredit": "local-proof-only"
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run audit:file-size -- --strict src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js",
        "node --check src/control-plane/publication-recovery-evidence-normalizers.js",
        "node --check src/control-plane/publication-recovery-evidence-values.js",
        "node --test test/rebalancer/replica-operation-repository.test.js",
        "node --test test/bootstrap/bootstrap-replica-registration-trace.test.js",
        "git diff --check -- src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js work/packages/done-20260524-publication-recovery-published-active-export.md"
      ]
    }
  }
}
-->

## Why

`publication-recovery-evidence-builders.js` still imports `resolvePublicationRecoveryPublishedActiveNodeIds` from the publication recovery evidence normalizer facade. The first facade split dropped that export, which blocks unrelated oversized-file package tests before assertions run.

## Scope Basis

Approved maintenance scope from the active oversized-file refactor sprint. This is a compatibility repair for the facade created by the prior publication-recovery oversized-file package.

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
- Route boundary: `publication_recovery_evidence_normalizer_facade_exports`
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

1. src/control-plane/publication-recovery-evidence-values.js
2. src/control-plane/publication-recovery-evidence-normalizers.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-recovery-evidence-values.js`, `src/control-plane/publication-recovery-evidence-normalizers.js`
- Forbidden files: `runtime ownership changes`, `rebalancer or bootstrap package implementation files`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:file-size -- --strict src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js`, `node --check src/control-plane/publication-recovery-evidence-normalizers.js`, `node --check src/control-plane/publication-recovery-evidence-values.js`, `node --test test/rebalancer/replica-operation-repository.test.js`, `node --test test/bootstrap/bootstrap-replica-registration-trace.test.js`, `git diff --check -- src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js work/packages/done-20260524-publication-recovery-published-active-export.md`
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

- [x] action: implementation; owner: control_plane_file_size_owner; files-changed: src/control-plane/publication-recovery-evidence-values.js, src/control-plane/publication-recovery-evidence-normalizers.js; validation: `npm run audit:file-size -- --strict src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js` (pass: source ratchet 0/144 over 800 lines, test ratchet 0/60 over 1500 lines), `node --check src/control-plane/publication-recovery-evidence-normalizers.js` (pass), `node --check src/control-plane/publication-recovery-evidence-values.js` (pass), `node --test test/rebalancer/replica-operation-repository.test.js` (pass: 295/295 tests, 97/97 suites), `node --test test/bootstrap/bootstrap-replica-registration-trace.test.js` (pass: 3/3 tests, 2/2 suites), `git diff --check -- src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js work/packages/done-20260524-publication-recovery-published-active-export.md` (pass for tracked diffs after evidence update), `git diff --check --no-index /dev/null work/packages/done-20260524-publication-recovery-published-active-export.md` (no whitespace-error output for untracked package file); parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: control_plane_file_size_owner; files-changed: work/packages/done-20260524-publication-recovery-published-active-export.md; validation: verified parent source repair without source edits using `npm run audit:file-size -- --strict src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js` (pass), `node --check src/control-plane/publication-recovery-evidence-normalizers.js` (pass), `node --check src/control-plane/publication-recovery-evidence-values.js` (pass), `node --test test/rebalancer/replica-operation-repository.test.js` (pass: 295/295), `node --test test/bootstrap/bootstrap-replica-registration-trace.test.js` (pass: 3/3), `git diff --check -- src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js work/packages/done-20260524-publication-recovery-published-active-export.md` (pass for tracked diffs after evidence update), `git diff --check --no-index /dev/null work/packages/done-20260524-publication-recovery-published-active-export.md` (no whitespace-error output for untracked package file); parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: not run; outcome: not-needed.

## Validation

1. npm run audit:file-size -- --strict src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js
2. node --check src/control-plane/publication-recovery-evidence-normalizers.js
3. node --check src/control-plane/publication-recovery-evidence-values.js
4. node --test test/rebalancer/replica-operation-repository.test.js
5. node --test test/bootstrap/bootstrap-replica-registration-trace.test.js
6. git diff --check -- src/control-plane/publication-recovery-evidence-normalizers.js src/control-plane/publication-recovery-evidence-values.js work/packages/done-20260524-publication-recovery-published-active-export.md

## Theory Ledger Update

no ledger update
