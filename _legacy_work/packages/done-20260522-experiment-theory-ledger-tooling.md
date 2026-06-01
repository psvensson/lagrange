# Experiment Theory Ledger Tooling

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "mechanical-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "experiment_theory_ledger_tooling",
  "dominantReason": "ledger_needs_low_friction_validation_and_lookup",
  "currentState": "Ledger tooling is implemented in the current worktree, with focused tests, ledger validation, command discovery coverage, and a separate verifier-fixer pass green.",
  "nextAction": "Formally close this package or preserve it as implemented evidence during the focused commit/closure decision; do not redo tooling unless validation regresses.",
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "stabilityCredit": "instrumentation-only",
  "whyHighestLeverageNow": "This advances the sprint goal of universal owner-contract completion by making the theory ledger cheap to validate and safe to use during representative stability work.",
  "codeQualityAdmission": {
    "reason": "improves-evidence-fidelity",
    "evidence": "The tooling validates and lists theory-ledger entries so future stability packages can find current and superseded experiment evidence without relying on scattered package prose."
  },
  "proof": [
    "npm test -- test/scripts/work-theory-ledger.test.js test/scripts/list-commands.test.js",
    "npm run work:theory-ledger -- validate",
    "npm run work:validate -- --pre-impl work/packages/done-20260522-experiment-theory-ledger-tooling.md"
  ],
  "writeScope": [
    "package.json",
    "scripts/work-theory-ledger.js",
    "scripts/list-commands.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/list-commands.test.js",
    "work/templates/theory-ledger-entry.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "package.json",
    "scripts/work-theory-ledger.js",
    "scripts/list-commands.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/list-commands.test.js",
    "work/templates/theory-ledger-entry.md",
    "work/packages/done-20260522-experiment-theory-ledger-tooling.md"
  ],
  "modelFit": {
    "packageClass": "mechanical-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "small",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "mechanical edits only; no behavior or ownership decisions",
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
      "Keep docs/templates/schema metadata edits in this Spark-safe package.",
      "Split any runtime or test behavior into a separate package before execution."
    ]
  },
  "predecessor": "work/packages/done-20260522-experiment-theory-ledger-foundation.md",
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The ledger will lose value if agents hand-edit entries inconsistently. This
package owns minimal tooling so agents can validate, list, and append entries
without turning the ledger into another heavy ceremony.

## Scope Basis

Current sprint focus: universal owner-contract completion and representative
stability. This is mechanical workflow tooling and depends on the foundation
ledger shape.

## Detailed Execution Contract

1. Add `npm run work:theory-ledger -- validate` to check entry ids, required
   fields, accepted statuses, artifact/package link shape, and supersession
   references.
2. Add `npm run work:theory-ledger -- list [--status <status>] [--owner <owner>]`
   for quick lookup during handoff.
3. Add `npm run work:theory-ledger -- new --id <id> ...` or an equivalent
   append command that emits one template-compliant entry.
4. Keep storage as Markdown so the ledger remains readable in normal reviews.
5. Tests must include a valid entry, a missing evidence link, an invalid status,
   duplicate id detection, and broken supersession reference detection.
6. Do not infer runtime truth from raw logs; tooling validates structure only.

## Workflow Lane

- Selected lane: `mechanical-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Agents can validate and query the ledger through `npm run work:theory-ledger` before relying on it in package handoffs.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_tooling_owner`
- Route boundary: `experiment_theory_ledger_tooling`
- Route dominant reason: `ledger_needs_low_friction_validation_and_lookup`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `mechanical-maintenance`
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

1. package.json
2. scripts/work-theory-ledger.js
3. scripts/list-commands.js
4. test/scripts/work-theory-ledger.test.js
5. test/scripts/list-commands.test.js
6. work/templates/theory-ledger-entry.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `mechanical-maintenance`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `small`
- Owned files: `package.json`, `scripts/work-theory-ledger.js`, `scripts/list-commands.js`, `test/scripts/work-theory-ledger.test.js`, `test/scripts/list-commands.test.js`, `work/templates/theory-ledger-entry.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/scripts/work-theory-ledger.test.js test/scripts/list-commands.test.js`, `npm run work:theory-ledger -- validate`, `npm run work:validate -- --pre-impl work/packages/done-20260522-experiment-theory-ledger-tooling.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: mechanical edits only; no behavior or ownership decisions
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep docs/templates/schema metadata edits in this Spark-safe package.
2. Split any runtime or test behavior into a separate package before execution.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: added `scripts/work-theory-ledger.js`, `test/scripts/work-theory-ledger.test.js`, `work:theory-ledger`, and command discovery tests; ran `npm test -- test/scripts/work-theory-ledger.test.js test/scripts/list-commands.test.js` and `npm run work:theory-ledger -- validate`; parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: Curie verifier-fixer found no blocking issues and reran `npm run work:theory-ledger -- validate`, targeted ledger tests, and five-package pre-impl validation successfully; changed files: none; parent revalidated focused proof: yes; next: closure decision.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after ledger refs landed; parent revalidated focused proof: yes; next: validation.

## Validation

1. npm test -- test/scripts/work-theory-ledger.test.js test/scripts/list-commands.test.js
2. npm run work:theory-ledger -- validate
3. npm run work:validate -- --pre-impl work/packages/done-20260522-experiment-theory-ledger-tooling.md

## Commit And Push Ledger

1. Focused package commit: b23a1ab300cc701eeb459ac1eca84bcdcb534107
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
