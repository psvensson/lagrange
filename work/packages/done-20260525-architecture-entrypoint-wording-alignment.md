# Architecture entrypoint wording alignment

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow-steering",
    "boundary": "architecture-entrypoint-authority",
    "currentState": "Architecture steering already says architecture/INDEX.md is canonical and root architecture.md is a compatibility pointer, but roadmap and related steering references still describe root architecture.md as the architecture entrypoint.",
    "nextAction": "Standardize architecture/INDEX.md as canonical and root architecture.md as compatibility only",
    "dominantReason": "architecture-entrypoint-wording-ambiguity",
    "closed": "2026-05-25"
  },
  "scope": {
    "writeScope": [
      ".kiro/steering/roadmap.md",
      ".kiro/steering/system-guidelines.md",
      ".kiro/steering/doctrine/INDEX.md",
      ".kiro/steering/code-style.md",
      "work/packages/done-20260525-architecture-entrypoint-wording-alignment.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      ".kiro/steering/llm/architecture.md",
      ".kiro/steering/llm/style.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/manifest.json",
      ".kiro/steering/llm/rules.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      ".kiro/steering/roadmap.md",
      ".kiro/steering/system-guidelines.md",
      ".kiro/steering/doctrine/INDEX.md",
      ".kiro/steering/code-style.md",
      ".kiro/steering/llm/architecture.md",
      ".kiro/steering/llm/style.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/manifest.json",
      ".kiro/steering/llm/rules.json",
      "work/packages/done-20260525-architecture-entrypoint-wording-alignment.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the active sprint goal of reliable LLM handoff and execution by removing architecture-entrypoint ambiguity before future packages choose owner maps or subsystem detail from the wrong file."
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
        "npm run work:validate -- --entry work/packages/done-20260525-architecture-entrypoint-wording-alignment.md",
        "npm run work:validate -- --pre-impl work/packages/done-20260525-architecture-entrypoint-wording-alignment.md",
        "npm run work:validate -- --closure work/packages/done-20260525-architecture-entrypoint-wording-alignment.md",
        "git diff --check -- .kiro/steering/roadmap.md .kiro/steering/system-guidelines.md .kiro/steering/doctrine/INDEX.md .kiro/steering/code-style.md .kiro/steering/llm/architecture.md .kiro/steering/llm/style.md .kiro/steering/llm/governance.md .kiro/steering/llm/manifest.json .kiro/steering/llm/rules.json work/packages/done-20260525-architecture-entrypoint-wording-alignment.md"
      ]
    }
  }
}
-->

## Why

`.kiro/steering/architecture.md` and root `architecture.md` already say the
canonical architecture entrypoint is `architecture/INDEX.md`, with root
`architecture.md` retained for compatibility. Other steering references still
point readers at root `architecture.md` for current owner maps or the concrete
architecture entrypoint. This package standardizes the wording.

## Scope Basis

Approved workflow-steering maintenance scope. The package only changes
architecture-entrypoint wording and regenerated compact-pack metadata.

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
- Route owner: `workflow-steering`
- Route boundary: `architecture-entrypoint-authority`
- Route dominant reason: `architecture-entrypoint-wording-ambiguity`
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
4. Delegated role prompts: not needed for this architecture-entrypoint wording
   package.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. .kiro/steering/roadmap.md
2. .kiro/steering/system-guidelines.md
3. .kiro/steering/doctrine/INDEX.md
4. .kiro/steering/code-style.md
5. work/packages/done-20260525-architecture-entrypoint-wording-alignment.md

## Out Of Scope

1. src/
2. test/

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `.kiro/steering/roadmap.md`, `.kiro/steering/system-guidelines.md`, `.kiro/steering/doctrine/INDEX.md`, `.kiro/steering/code-style.md`, `work/packages/done-20260525-architecture-entrypoint-wording-alignment.md`
- Forbidden files: `src/`, `test/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run steering:llm:pack`, `npm run work:validate -- --entry work/packages/done-20260525-architecture-entrypoint-wording-alignment.md`, `npm run work:validate -- --pre-impl work/packages/done-20260525-architecture-entrypoint-wording-alignment.md`, `npm run work:validate -- --closure work/packages/done-20260525-architecture-entrypoint-wording-alignment.md`, `git diff --check -- .kiro/steering/roadmap.md .kiro/steering/system-guidelines.md .kiro/steering/doctrine/INDEX.md .kiro/steering/code-style.md .kiro/steering/llm/architecture.md .kiro/steering/llm/style.md .kiro/steering/llm/governance.md .kiro/steering/llm/manifest.json .kiro/steering/llm/rules.json work/packages/done-20260525-architecture-entrypoint-wording-alignment.md`
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

- [x] action: implementation; owner: workflow-steering; files-changed: .kiro/steering/roadmap.md, .kiro/steering/system-guidelines.md, .kiro/steering/doctrine/INDEX.md, .kiro/steering/code-style.md, .kiro/steering/llm/architecture.md, .kiro/steering/llm/manifest.json, .kiro/steering/llm/rules.json, work/packages/done-20260525-architecture-entrypoint-wording-alignment.md; validation: npm run steering:llm:pack PASS; npm run work:validate -- --entry work/packages/done-20260525-architecture-entrypoint-wording-alignment.md PASS; npm run work:validate -- --pre-impl work/packages/done-20260525-architecture-entrypoint-wording-alignment.md PASS; stale root-architecture-entrypoint grep returned no matches; scoped git diff --check PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow-steering; files-changed: work/packages/done-20260525-architecture-entrypoint-wording-alignment.md; validation: reviewed source steering and generated compact-pack diffs; verified remaining root architecture.md mentions describe compatibility or compact/generated pack names, not canonical entrypoint authority; reran entry validation PASS, pre-impl validation PASS, and scoped git diff --check PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow-steering; files-changed: none; validation: not needed because this package did not update current-blocker generated state; outcome: not-needed.

## Theory Ledger Update

no ledger update. This package changed steering wording and generated compact
pack metadata only; it did not change representative route truth or runtime
package experience.

## Validation

1. npm run steering:llm:pack
2. npm run work:validate -- --entry work/packages/done-20260525-architecture-entrypoint-wording-alignment.md
3. npm run work:validate -- --pre-impl work/packages/done-20260525-architecture-entrypoint-wording-alignment.md
4. npm run work:validate -- --closure work/packages/done-20260525-architecture-entrypoint-wording-alignment.md
5. git diff --check -- .kiro/steering/roadmap.md .kiro/steering/system-guidelines.md .kiro/steering/doctrine/INDEX.md .kiro/steering/code-style.md .kiro/steering/llm/architecture.md .kiro/steering/llm/style.md .kiro/steering/llm/governance.md .kiro/steering/llm/manifest.json .kiro/steering/llm/rules.json work/packages/done-20260525-architecture-entrypoint-wording-alignment.md
