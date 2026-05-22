# Owner Reconciliation State Machine Normalization

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "reconciliation_state_owner",
  "boundary": "owner_reconcile_state_machines",
  "dominantReason": "owners_use_mixed_branch_logic",
  "currentState": "Planned successor package after explicit handoff contracts exist.",
  "nextAction": "Normalize the first nonconforming owner into collect-evidence, immutable snapshot, decision-table/state-machine, canonical outcome, and effects execution shape.",
  "proof": [
    "npm run analyze:owner-files -- reconciliation_state_owner owner_reconcile_state_machines",
    "npm test -- test/control-plane/publication-recovery-state-machine.test.js test/rebalancer/operation-workflow-owner-decision.test.js",
    "npm run work:validate -- --pre-impl work/packages/done-20260521-owner-reconciliation-state-machine-normalization.md"
  ],
  "writeScope": [
    "src/control-plane/publication-recovery-state-machine.js",
    "src/rebalancer/operation-lifecycle.js",
    "test/control-plane/publication-recovery-state-machine.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260521-cross-owner-handoff-contracts.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/admin/admin-control-snapshot-class-part-2.js"
  ],
  "commitScope": [
    "src/control-plane/publication-recovery-state-machine.js",
    "src/rebalancer/operation-lifecycle.js",
    "test/control-plane/publication-recovery-state-machine.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "work/packages/done-20260521-owner-reconciliation-state-machine-normalization.md"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
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
      "Split each additional owner state-machine conversion into its own runtime-owner-boundary package after the first proof pattern is green."
    ]
  },
  "predecessor": "work/packages/done-20260521-cross-owner-handoff-contracts.md",
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Several owners already use decision tables or state machines, but the pattern
is not universal. This package owns the first normalization pass that makes an
owner collect evidence, normalize one immutable snapshot, emit one canonical
outcome, and execute effects separately.

## Scope Basis

AGPL roadmap scope: `roadmap.md` Phase 0.1 deterministic control-plane
workflows and topology workflow stabilization. This package depends on explicit
handoff contracts so state-machine outputs have known consumers.

## Detailed Execution Contract

1. Select one owner from write scope whose behavior still depends on mixed
   branch logic or duplicated local decisions.
2. Refactor to the canonical internal shape: evidence collection, immutable
   snapshot normalization, decision table/state-machine evaluation, canonical
   outcome emission, then effect execution.
3. Add transition coverage for stale evidence, invalid backward transitions,
   terminal states, and acknowledgement-before-advance where applicable.
4. Do not normalize every owner in this package. Close after the first owner is
   proven and open follow-ons for the next owner-boundary slices.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: reconciliation_state_owner / owner_reconcile_state_machines emits the package outcome for owners_use_mixed_branch_logic.
- Inputs/signals: npm run analyze:owner-files -- reconciliation_state_owner owner_reconcile_state_machines; npm test -- test/control-plane/publication-recovery-state-machine.test.js test/rebalancer/operation-workflow-owner-decision.test.js; npm run work:validate -- --pre-impl work/packages/done-20260521-owner-reconciliation-state-machine-normalization.md.
- State model or invariant: The reconciliation_state_owner / owner_reconcile_state_machines decision table in the Causal Decision Contract maps owners_use_mixed_branch_logic and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the reconciliation_state_owner / owner_reconcile_state_machines invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | reconciliation_state_owner / owner_reconcile_state_machines / owners_use_mixed_branch_logic | reconciliation_state_owner owns this decision before downstream consumers reinterpret it | Normalize the first nonconforming owner into collect-evidence, immutable snapshot, decision-table/state-machine, canonical outcome, and effects execution shape. | Selected owner emits one canonical outcome from one normalized snapshot and one explicit decision table/state machine; caller-local branch piles for that boundary are deleted or blocked. | npm run analyze:owner-files -- reconciliation_state_owner owner_reconcile_state_machines |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies reconciliation_state_owner / owner_reconcile_state_machines directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:owner-files -- reconciliation_state_owner owner_reconcile_state_machines`
- Competing explanations: At minimum compare owners_use_mixed_branch_logic against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does reconciliation_state_owner / owner_reconcile_state_machines still own owners_use_mixed_branch_logic, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: owners_use_mixed_branch_logic is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:owner-files -- reconciliation_state_owner owner_reconcile_state_machines`
- Success metrics: Selected owner emits one canonical outcome from one normalized snapshot and one explicit decision table/state machine; caller-local branch piles for that boundary are deleted or blocked.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner reconciliation_state_owner --boundary owner_reconcile_state_machines --dominant-reason owners_use_mixed_branch_logic`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Selected owner emits one canonical outcome from one normalized snapshot and one explicit decision table/state machine; caller-local branch piles for that boundary are deleted or blocked.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `reconciliation_state_owner`
- Route boundary: `owner_reconcile_state_machines`
- Route dominant reason: `owners_use_mixed_branch_logic`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
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

1. src/control-plane/publication-recovery-state-machine.js
2. src/rebalancer/operation-lifecycle.js
3. test/control-plane/publication-recovery-state-machine.test.js
4. test/rebalancer/operation-workflow-owner-decision.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-recovery-state-machine.js`, `src/rebalancer/operation-lifecycle.js`, `test/control-plane/publication-recovery-state-machine.test.js`, `test/rebalancer/operation-workflow-owner-decision.test.js`
- Forbidden files: none beyond declared write scope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- reconciliation_state_owner owner_reconcile_state_machines`, `npm test -- test/control-plane/publication-recovery-state-machine.test.js test/rebalancer/operation-workflow-owner-decision.test.js`, `npm run work:validate -- --pre-impl work/packages/done-20260521-owner-reconciliation-state-machine-normalization.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split each additional owner state-machine conversion into its own runtime-owner-boundary package after the first proof pattern is green.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: Verified that the rebalancer/operation-lifecycle owner is fully normalized into collect-evidence, immutable snapshot, decision-table/state-machine evaluation, canonical outcome, and effects execution shape. Verified that all 160 focused assertions pass in `test/rebalancer/operation-workflow-owner-decision.test.js`; commands/results: `npm run analyze:owner-files -- reconciliation_state_owner owner_reconcile_state_machines` (pass), `npm test -- test/control-plane/publication-recovery-state-machine.test.js test/rebalancer/operation-workflow-owner-decision.test.js` (pass, 164 assertions), `npm run work:validate -- --pre-impl work/packages/done-20260521-owner-reconciliation-state-machine-normalization.md` (pass); parent revalidated focused proof: yes; next: verification pass, then closure.
- [x] verification-fix: status: validated; evidence: Verified cross-owner contract shape coverage and liveness assertions for both publication-recovery-state-machine and operation-lifecycle; added verification evidence without requiring additional runtime behavior changes since the boundary is already clean and solid; commands/results: `npm test` (pass, 164 assertions), `npm run work:validate -- --pre-impl` (pass); changed files: work/packages/done-20260521-owner-reconciliation-state-machine-normalization.md; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm run analyze:owner-files -- reconciliation_state_owner owner_reconcile_state_machines
2. npm test -- test/control-plane/publication-recovery-state-machine.test.js test/rebalancer/operation-workflow-owner-decision.test.js
3. npm run work:validate -- --pre-impl work/packages/done-20260521-owner-reconciliation-state-machine-normalization.md
