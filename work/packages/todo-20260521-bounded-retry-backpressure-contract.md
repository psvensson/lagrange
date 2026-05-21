# Bounded Retry Backpressure Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-21",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "pressure_retry_contract_owner",
  "boundary": "bounded_retry_backpressure",
  "dominantReason": "retry_backpressure_not_universal",
  "currentState": "Planned successor package after owner state-machine normalization starts.",
  "nextAction": "Make deferred and backpressured owner outcomes carry retryAfterMs, wake source, attempt key, max bound, deadline, and terminal escalation behavior.",
  "proof": [
    "npm run analyze:owner-files -- pressure_retry_contract_owner bounded_retry_backpressure",
    "npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js",
    "npm run work:validate -- --pre-impl work/packages/todo-20260521-bounded-retry-backpressure-contract.md"
  ],
  "writeScope": [
    "src/control-plane/control-plane-system-table-gateway-shared.js",
    "src/control-plane/control-plane-system-table-gateway-segment-2.js",
    "src/control-plane/priority-recovery-diagnostics-constants.js",
    "test/control-plane/control-plane-system-table-gateway-tail-test-cases.js",
    "test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js"
  ],
  "handoffFiles": [
    "work/packages/todo-20260521-owner-reconciliation-state-machine-normalization.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-effects.js",
    "src/bootstrap/node-joining-service-segment-2.js"
  ],
  "commitScope": [
    "src/control-plane/control-plane-system-table-gateway-shared.js",
    "src/control-plane/control-plane-system-table-gateway-segment-2.js",
    "src/control-plane/priority-recovery-diagnostics-constants.js",
    "test/control-plane/control-plane-system-table-gateway-tail-test-cases.js",
    "test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js",
    "work/packages/todo-20260521-bounded-retry-backpressure-contract.md"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
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
      "Split gateway, priority recovery, bootstrap retry, and transport pressure work if one package cannot prove bounded lifetime for all selected paths."
    ]
  },
  "predecessor": "work/packages/todo-20260521-owner-reconciliation-state-machine-normalization.md"
}
-->

## Why

Deferred and backpressured states exist, but not every owner exposes the same
bounded progress facts. This package owns making retry/backpressure first-class
state rather than timeout-shaped absence.

## Scope Basis

AGPL roadmap scope: `roadmap.md` Phase 0.1 production-readiness guarantees,
failure simulations, and control-plane pressure correctness. This package
depends on the state-machine normalization package so retry decisions have one
owner output.

## Detailed Execution Contract

1. Extend selected deferred/backpressure outcomes to include retry-after,
   wake/retry source, owner key or attempt key, maximum progress bound,
   deadline, and terminal escalation state.
2. Route local retry loops behind owner-owned queues or the shared pressure
   governor. Callers may request work and consume outcomes; they may not own
   retry semantics locally.
3. Add bounded-lifetime regressions for repeated cycles: queue depth, retained
   request maps, retry registries, and deferred-work maps must plateau.
4. Preserve critical convergence admission while diagnostics/admin repair can
   defer under pressure.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: pressure_retry_contract_owner / bounded_retry_backpressure emits the package outcome for retry_backpressure_not_universal.
- Inputs/signals: npm run analyze:owner-files -- pressure_retry_contract_owner bounded_retry_backpressure; npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js; npm run work:validate -- --pre-impl work/packages/todo-20260521-bounded-retry-backpressure-contract.md.
- State model or invariant: The pressure_retry_contract_owner / bounded_retry_backpressure decision table in the Causal Decision Contract maps retry_backpressure_not_universal and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the pressure_retry_contract_owner / bounded_retry_backpressure invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | pressure_retry_contract_owner / bounded_retry_backpressure / retry_backpressure_not_universal | pressure_retry_contract_owner owns this decision before downstream consumers reinterpret it | Make deferred and backpressured owner outcomes carry retryAfterMs, wake source, attempt key, max bound, deadline, and terminal escalation behavior. | Every selected deferred/backpressured owner outcome includes retryAfterMs, wake/retry source, attempt key, max progress bound, deadline, and terminal escalation; repeated cycles prove bounded queue/registry lifetime. | npm run analyze:owner-files -- pressure_retry_contract_owner bounded_retry_backpressure |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies pressure_retry_contract_owner / bounded_retry_backpressure directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:owner-files -- pressure_retry_contract_owner bounded_retry_backpressure`
- Competing explanations: At minimum compare retry_backpressure_not_universal against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does pressure_retry_contract_owner / bounded_retry_backpressure still own retry_backpressure_not_universal, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: retry_backpressure_not_universal is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:owner-files -- pressure_retry_contract_owner bounded_retry_backpressure`
- Success metrics: Every selected deferred/backpressured owner outcome includes retryAfterMs, wake/retry source, attempt key, max progress bound, deadline, and terminal escalation; repeated cycles prove bounded queue/registry lifetime.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner pressure_retry_contract_owner --boundary bounded_retry_backpressure --dominant-reason retry_backpressure_not_universal`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Every selected deferred/backpressured owner outcome includes retryAfterMs, wake/retry source, attempt key, max progress bound, deadline, and terminal escalation; repeated cycles prove bounded queue/registry lifetime.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `pressure_retry_contract_owner`
- Route boundary: `bounded_retry_backpressure`
- Route dominant reason: `retry_backpressure_not_universal`
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

1. src/control-plane/control-plane-system-table-gateway-shared.js
2. src/control-plane/control-plane-system-table-gateway-segment-2.js
3. src/control-plane/priority-recovery-diagnostics-constants.js
4. test/control-plane/control-plane-system-table-gateway-tail-test-cases.js
5. test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/control-plane-system-table-gateway-shared.js`, `src/control-plane/control-plane-system-table-gateway-segment-2.js`, `src/control-plane/priority-recovery-diagnostics-constants.js`, `test/control-plane/control-plane-system-table-gateway-tail-test-cases.js`, `test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
- Forbidden files: none beyond declared write scope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- pressure_retry_contract_owner bounded_retry_backpressure`, `npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`, `npm run work:validate -- --pre-impl work/packages/todo-20260521-bounded-retry-backpressure-contract.md`
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
1. Split gateway, priority recovery, bootstrap retry, and transport pressure work if one package cannot prove bounded lifetime for all selected paths.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm run analyze:owner-files -- pressure_retry_contract_owner bounded_retry_backpressure
2. npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js
3. npm run work:validate -- --pre-impl work/packages/todo-20260521-bounded-retry-backpressure-contract.md
