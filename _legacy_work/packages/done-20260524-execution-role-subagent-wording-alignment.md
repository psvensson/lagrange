# Execution role subagent wording alignment

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
    "boundary": "execution-evidence-roles",
    "currentState": "Canonical steering still mixes real sub-agent requirements with the newer role-based Execution Evidence model where implementation and verification-fix roles are required and real-agent identity is optional provenance.",
    "nextAction": "Reframe subagent steering as implementation and verification-fix roles with optional real-agent provenance",
    "dominantReason": "subagent-language-ambiguity",
    "closed": "2026-05-24"
  },
  "scope": {
    "writeScope": [
      "work/README.md",
      ".kiro/steering/workflow-guidelines/subagents.md",
      ".kiro/steering/workflow-guidelines/closure.md",
      ".kiro/steering/roadmap.md",
      ".kiro/steering/doctrine/owner-boundaries.md",
      ".kiro/steering/testing-guidelines/release-gate.md",
      "work/packages/done-20260524-execution-role-subagent-wording-alignment.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      ".kiro/steering/llm/architecture.md",
      ".kiro/steering/llm/testing.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/README.md",
      ".kiro/steering/workflow-guidelines/subagents.md",
      ".kiro/steering/workflow-guidelines/closure.md",
      ".kiro/steering/roadmap.md",
      ".kiro/steering/doctrine/owner-boundaries.md",
      ".kiro/steering/testing-guidelines/release-gate.md",
      ".kiro/steering/llm/architecture.md",
      ".kiro/steering/llm/testing.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260524-execution-role-subagent-wording-alignment.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal of reliable LLM handoff and execution by making sub-agent steering match the role-based Execution Evidence model before more packages depend on ambiguous review/fix/implementation wording."
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
        "npm run steering:llm:pack",
        "npm run work:validate -- --entry work/packages/done-20260524-execution-role-subagent-wording-alignment.md",
        "npm run work:validate -- --pre-impl work/packages/done-20260524-execution-role-subagent-wording-alignment.md",
        "npm run work:validate -- --closure work/packages/done-20260524-execution-role-subagent-wording-alignment.md",
        "git diff --check -- work/README.md .kiro/steering/workflow-guidelines/subagents.md .kiro/steering/workflow-guidelines/closure.md .kiro/steering/roadmap.md .kiro/steering/doctrine/owner-boundaries.md .kiro/steering/testing-guidelines/release-gate.md .kiro/steering/llm/architecture.md .kiro/steering/llm/testing.md .kiro/steering/llm/governance.md .kiro/steering/llm/rules.json .kiro/steering/llm/manifest.json work/packages/done-20260524-execution-role-subagent-wording-alignment.md"
      ]
    }
  }
}
-->

## Why

Sub-agent steering currently implies real sub-agents and real agent identities
are required for sprint or package implementation, while newer workflow text
uses role-based `## Execution Evidence`. This package aligns the language:
`implementation` and `verification-fix` are the closure roles; real sub-agent
identity is optional provenance or an explicit unavailable-state note.

## Scope Basis

Approved maintenance scope: steering and workflow documentation ambiguity
reduction. No runtime, test, package-tool behavior, or validator behavior
changes are in scope.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded steering wording and generated-pack
  refresh with no runtime, test, package-tool, or validator behavior change.
- Escalation trigger to a heavier lane: changing validator/tooling behavior,
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
- Route boundary: `execution-evidence-roles`
- Route dominant reason: `subagent-language-ambiguity`
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
4. Delegated role prompts: not needed for this lightweight maintenance package.
5. Large-file cleanup: not in scope.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: use pack
   generation, package validation, and `git diff --check` for this package.
   Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/README.md
2. .kiro/steering/workflow-guidelines/subagents.md
3. .kiro/steering/workflow-guidelines/closure.md
4. .kiro/steering/roadmap.md
5. .kiro/steering/doctrine/owner-boundaries.md
6. .kiro/steering/testing-guidelines/release-gate.md
7. work/packages/done-20260524-execution-role-subagent-wording-alignment.md

## Out Of Scope

1. Runtime source files under `src/`.
2. Tests under `test/`.
3. Package tooling behavior, schema enum changes, or validator logic changes.
4. Runtime package execution policy beyond role/provenance wording.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/README.md`, `.kiro/steering/workflow-guidelines/subagents.md`, `.kiro/steering/workflow-guidelines/closure.md`, `.kiro/steering/roadmap.md`, `.kiro/steering/doctrine/owner-boundaries.md`, `.kiro/steering/testing-guidelines/release-gate.md`, `work/packages/done-20260524-execution-role-subagent-wording-alignment.md`
- Forbidden files: `src/`, `test/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run steering:llm:pack`, `npm run work:validate -- --entry work/packages/done-20260524-execution-role-subagent-wording-alignment.md`, `npm run work:validate -- --pre-impl work/packages/done-20260524-execution-role-subagent-wording-alignment.md`, `npm run work:validate -- --closure work/packages/done-20260524-execution-role-subagent-wording-alignment.md`, `git diff --check -- work/README.md .kiro/steering/workflow-guidelines/subagents.md .kiro/steering/workflow-guidelines/closure.md .kiro/steering/roadmap.md .kiro/steering/doctrine/owner-boundaries.md .kiro/steering/testing-guidelines/release-gate.md .kiro/steering/llm/architecture.md .kiro/steering/llm/testing.md .kiro/steering/llm/governance.md .kiro/steering/llm/rules.json .kiro/steering/llm/manifest.json work/packages/done-20260524-execution-role-subagent-wording-alignment.md`
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

- [x] action: implementation; owner: workflow-steering; files-changed: work/README.md, .kiro/steering/workflow-guidelines/subagents.md, .kiro/steering/workflow-guidelines/closure.md, .kiro/steering/roadmap.md, .kiro/steering/doctrine/owner-boundaries.md, .kiro/steering/testing-guidelines/release-gate.md, .kiro/steering/llm/governance.md, .kiro/steering/llm/testing.md, .kiro/steering/llm/rules.json, .kiro/steering/llm/manifest.json, work/packages/done-20260524-execution-role-subagent-wording-alignment.md; validation: npm run steering:llm:pack PASS; npm run work:validate -- --entry work/packages/done-20260524-execution-role-subagent-wording-alignment.md PASS; npm run work:validate -- --pre-impl work/packages/done-20260524-execution-role-subagent-wording-alignment.md PASS; git diff --check over package scope PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow-steering; files-changed: work/packages/done-20260524-execution-role-subagent-wording-alignment.md; validation: reviewed source steering and generated LLM pack diffs; rg stale required-subagent phrases across steering, LLM packs, and work README returned no matches; entry validation PASS; pre-impl validation PASS; scoped git diff --check PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow-steering; files-changed: none; validation: not needed because package validation did not require tracker repair and current-blocker generated files were not updated by this package; outcome: not-needed.

## Theory Ledger Update

no ledger update. This package changed steering wording and generated LLM packs
only; it did not change representative route truth or runtime package
experience.

## Validation

1. npm run steering:llm:pack
2. npm run work:validate -- --entry work/packages/done-20260524-execution-role-subagent-wording-alignment.md
3. npm run work:validate -- --pre-impl work/packages/done-20260524-execution-role-subagent-wording-alignment.md
4. npm run work:validate -- --closure work/packages/done-20260524-execution-role-subagent-wording-alignment.md
5. git diff --check -- work/README.md .kiro/steering/workflow-guidelines/subagents.md .kiro/steering/workflow-guidelines/closure.md .kiro/steering/roadmap.md .kiro/steering/doctrine/owner-boundaries.md .kiro/steering/testing-guidelines/release-gate.md .kiro/steering/llm/architecture.md .kiro/steering/llm/testing.md .kiro/steering/llm/governance.md .kiro/steering/llm/rules.json .kiro/steering/llm/manifest.json work/packages/done-20260524-execution-role-subagent-wording-alignment.md
