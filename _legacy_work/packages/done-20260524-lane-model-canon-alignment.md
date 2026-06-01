# Lane model canon alignment

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
    "owner": "workflow-steering",
    "boundary": "lane-vocabulary",
    "currentState": "work/RULES.md still presents four lane families while work-package schema and boot steering expose six canonical lane groups plus accepted legacy aliases.",
    "nextAction": "Align work/RULES.md lane definitions with work-package schema",
    "dominantReason": "lane-model-ambiguity",
    "closed": "2026-05-24"
  },
  "scope": {
    "writeScope": [
      "work/RULES.md",
      "work/packages/done-20260524-lane-model-canon-alignment.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/RULES.md",
      "work/packages/done-20260524-lane-model-canon-alignment.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal of reliable LLM handoff and execution by removing the highest-signal lane-selection ambiguity: making the canonical rules document match the schema lane groups and accepted aliases already surfaced by workflow tooling."
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
        "npm run work:package:schema",
        "npm run work:validate -- --entry work/packages/done-20260524-lane-model-canon-alignment.md",
        "npm run work:validate -- --pre-impl work/packages/done-20260524-lane-model-canon-alignment.md",
        "git diff --check -- work/RULES.md work/packages/done-20260524-lane-model-canon-alignment.md"
      ]
    }
  }
}
-->

## Why

`work/RULES.md` is the canonical process document, but its lane definitions use
four historical lane families while the package schema and boot contract expose
six canonical lane groups plus accepted aliases. This package owns the
documentation alignment only.

## Scope Basis

Approved maintenance scope: steering and workflow documentation ambiguity
reduction. No runtime, test, or package-tool behavior changes are in scope.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded canonical-rule documentation update with
  no runtime, test, or package-tool behavior change.
- Escalation trigger to a heavier lane: changing package tooling behavior,
  runtime ownership, shared contracts, or representative scenario evidence.

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
- Route owner: `workflow-steering`
- Route boundary: `lane-vocabulary`
- Route dominant reason: `lane-model-ambiguity`
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

1. Package metadata or ledger edits: use `npm run work:package:doctor`,
   `npm run work:package:schema`, or `npm run work:package:new`.
2. Representative evidence: not needed for this documentation-only package.
3. Owner discovery: not needed; the owner is `workflow-steering`.
4. Subagent sequencing: not needed for this lightweight maintenance package.
5. Large-file cleanup: not in scope.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: use schema output,
   package validation, and `git diff --check` for this package. Add static
   guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Align `work/RULES.md` lane definitions with the six schema lane groups.
2. Add the accepted legacy alias table to `work/RULES.md`.
3. Keep package metadata and validation evidence for this maintenance slice.

## Out Of Scope

1. Runtime source files under `src/`.
2. Tests under `test/`.
3. Package tooling behavior or schema enum changes.
4. Other ambiguity findings from the steering audit.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/RULES.md`, `work/packages/done-20260524-lane-model-canon-alignment.md`
- Forbidden files: `src/`, `test/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:package:schema`, `npm run work:validate -- --entry work/packages/done-20260524-lane-model-canon-alignment.md`, `npm run work:validate -- --pre-impl work/packages/done-20260524-lane-model-canon-alignment.md`, `git diff --check -- work/RULES.md work/packages/done-20260524-lane-model-canon-alignment.md`
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

- [x] action: implementation; owner: workflow-steering; files-changed: work/RULES.md, work/packages/done-20260524-lane-model-canon-alignment.md; validation: `npm run work:package:schema`, `npm run work:validate -- --entry work/packages/done-20260524-lane-model-canon-alignment.md`, `npm run work:validate -- --pre-impl work/packages/done-20260524-lane-model-canon-alignment.md`, and `git diff --check -- work/RULES.md work/packages/done-20260524-lane-model-canon-alignment.md` passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow-steering; files-changed: none; validation: reviewed the lane table against `npm run work:package:schema`, reran entry/pre-implementation validation, and reran `git diff --check`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow-steering; files-changed: none; validation: not needed because this package does not change generated sprint current-blocker state; outcome: not-needed.

## Validation

1. npm run work:package:schema
2. npm run work:validate -- --entry work/packages/done-20260524-lane-model-canon-alignment.md
3. npm run work:validate -- --pre-impl work/packages/done-20260524-lane-model-canon-alignment.md
4. git diff --check -- work/RULES.md work/packages/done-20260524-lane-model-canon-alignment.md

## Theory Ledger Update

no ledger update
