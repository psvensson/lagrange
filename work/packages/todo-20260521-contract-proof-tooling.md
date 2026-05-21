# Contract Proof Tooling

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-21",
  "lane": "mechanical-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "contract_proof_validation",
  "dominantReason": "scenario_proof_not_contract_proof",
  "currentState": "Planned successor package after metadata/storage separation is proven.",
  "nextAction": "Upgrade package validators and evidence tooling so owner-boundary closure proves named contract transitions rather than timeout symptom movement.",
  "proof": [
    "npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-architecture-decision-gate.test.js",
    "npm test -- test/scripts/work-llm-usability-tools.test.js",
    "npm run work:validate -- --pre-impl work/packages/todo-20260521-contract-proof-tooling.md"
  ],
  "writeScope": [
    "scripts/work-tracker.js",
    "scripts/work-package-schema.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-llm-usability-tools.test.js"
  ],
  "handoffFiles": [
    "work/packages/todo-20260521-system-table-metadata-schema-separation.md"
  ],
  "generatedFiles": [
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/testing.md"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/owner-outcome-contract.js"
  ],
  "commitScope": [
    "scripts/work-tracker.js",
    "scripts/work-package-schema.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/testing.md",
    "work/packages/todo-20260521-contract-proof-tooling.md"
  ],
  "modelFit": {
    "packageClass": "mechanical-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "small",
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
      "Split generated steering pack regeneration from validator code if the proof tooling patch is otherwise focused."
    ]
  },
  "predecessor": "work/packages/todo-20260521-system-table-metadata-schema-separation.md"
}
-->

## Why

The workflow already asks for causal closure, but the validator does not yet
make contract proof the default closure currency. This package owns making
package proof name the owner outcome or handoff transition being validated.

## Scope Basis

AGPL roadmap scope: developer workflow/debugging, operational visibility
basics, and failure simulations in `edition-matrix.md` and `roadmap.md`. This
package is mechanical/tooling only and depends on the runtime contract packages
so it can enforce the real vocabulary instead of guessing it.

## Detailed Execution Contract

1. Extend package validation so runtime/scenario packages must name the
   contract transition under proof, not only a changed timeout or count.
2. Require a focused contract fixture plus affected consumer proof for
   owner-boundary packages; representative routing evidence remains required
   when a scenario artifact selected the work.
3. Update tests and generated steering packs so future packages cannot close
   from symptom movement alone.
4. Keep this package out of runtime source. If runtime vocabulary changes are
   needed, stop and open a runtime-owner-boundary package.

## Workflow Lane

- Selected lane: `mechanical-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Package validation requires a named owner outcome or handoff transition, focused contract fixture, affected consumer proof, and representative routing evidence when scenario work is involved.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_tooling_owner`
- Route boundary: `contract_proof_validation`
- Route dominant reason: `scenario_proof_not_contract_proof`
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

1. scripts/work-tracker.js
2. scripts/work-package-schema.js
3. test/scripts/work-tracker-subagent-ledger.test.js
4. test/scripts/work-llm-usability-tools.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `mechanical-maintenance`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `small`
- Owned files: `scripts/work-tracker.js`, `scripts/work-package-schema.js`, `test/scripts/work-tracker-subagent-ledger.test.js`, `test/scripts/work-llm-usability-tools.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-architecture-decision-gate.test.js`, `npm test -- test/scripts/work-llm-usability-tools.test.js`, `npm run work:validate -- --pre-impl work/packages/todo-20260521-contract-proof-tooling.md`
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
1. Split generated steering pack regeneration from validator code if the proof tooling patch is otherwise focused.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-architecture-decision-gate.test.js
2. npm test -- test/scripts/work-llm-usability-tools.test.js
3. npm run work:validate -- --pre-impl work/packages/todo-20260521-contract-proof-tooling.md
