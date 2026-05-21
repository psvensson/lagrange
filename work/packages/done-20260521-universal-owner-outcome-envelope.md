# Universal Owner Outcome Envelope

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "runtime_contract_owner",
  "boundary": "owner_outcome_envelope",
  "dominantReason": "owner_outcome_not_universal",
  "currentState": "Planned successor package for making owner outcomes universal after the active rolling-restart package closes.",
  "nextAction": "Add the shared owner outcome envelope and adapt the first control-plane owners without replacing local owner detail.",
  "proof": [
    "npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope",
    "npm test -- test/control-plane/owner-outcome-contract.test.js",
    "npm run work:validate -- --pre-impl work/packages/done-20260521-universal-owner-outcome-envelope.md"
  ],
  "writeScope": [
    "src/control-plane/owner-outcome-contract.js",
    "src/control-plane/control-plane-system-table-gateway-shared.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/owner-outcome-contract.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260521-rolling-restart-active-gate-snapshot-quorum.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-state-machine.js"
  ],
  "commitScope": [
    "src/control-plane/owner-outcome-contract.js",
    "src/control-plane/control-plane-system-table-gateway-shared.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/owner-outcome-contract.test.js",
    "work/packages/done-20260521-universal-owner-outcome-envelope.md"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 2,
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
      "Split individual owner adapters into follow-on runtime-owner-boundary packages if more than two runtime owners need edits."
    ]
  },
  "predecessor": "work/packages/done-20260521-rolling-restart-active-gate-snapshot-quorum.md",
  "closed": "2026-05-21",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Owner-specific result objects already exist in the gateway, publication,
active-gate, and priority-recovery paths, but there is no universal envelope
that lets consumers rely on one shape. This package owns the shared runtime
contract that all later packages consume.

## Scope Basis

AGPL roadmap scope: `roadmap.md` Phase 0.1 core topology/control-plane
stabilization, metadata gateway ownership, and production-readiness guarantees.
This package starts only after the active rolling-restart quorum package has
closed or been intentionally superseded.

## Detailed Execution Contract

1. Add `src/control-plane/owner-outcome-contract.js` with named states,
   next-actions, freshness variants, retry/defer fields, terminal flags, and
   evidence helpers. Required envelope fields: `owner`, `boundary`, `state`,
   `outcome`, `reasonCodes`, `nextAction`, `freshness`, `revision`,
   `retryAfterMs`, `terminal`, and `evidence`.
2. Provide adapters from at least two existing owner-specific outcomes into the
   envelope: one metadata gateway outcome and one active-gate/publication
   outcome. Preserve local owner details; do not flatten away state,
   diagnostics, or reason vocabulary.
3. Add tests proving missing fields fail closed, `null`/`undefined` do not
   encode domain state, and owner-specific details survive round trip through
   the envelope.
4. Keep this package as the shared kernel only. If adapting more than two
   runtime owners is needed, split those adapters into successor packages.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: runtime_contract_owner / owner_outcome_envelope emits the package outcome for owner_outcome_not_universal.
- Inputs/signals: npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope; npm test -- test/control-plane/owner-outcome-contract.test.js; npm run work:validate -- --pre-impl work/packages/done-20260521-universal-owner-outcome-envelope.md.
- State model or invariant: The runtime_contract_owner / owner_outcome_envelope decision table in the Causal Decision Contract maps owner_outcome_not_universal and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the runtime_contract_owner / owner_outcome_envelope invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | runtime_contract_owner / owner_outcome_envelope / owner_outcome_not_universal | runtime_contract_owner owns this decision before downstream consumers reinterpret it | Add the shared owner outcome envelope and adapt the first control-plane owners without replacing local owner detail. | Shared owner outcome envelope exists and at least two existing owner-specific outcomes adapt into it without losing local state, reasons, freshness, revision, retry, terminal, or evidence fields. | npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies runtime_contract_owner / owner_outcome_envelope directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope`
- Competing explanations: At minimum compare owner_outcome_not_universal against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does runtime_contract_owner / owner_outcome_envelope still own owner_outcome_not_universal, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: owner_outcome_not_universal is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope`
- Success metrics: Shared owner outcome envelope exists and at least two existing owner-specific outcomes adapt into it without losing local state, reasons, freshness, revision, retry, terminal, or evidence fields.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner runtime_contract_owner --boundary owner_outcome_envelope --dominant-reason owner_outcome_not_universal`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Shared owner outcome envelope exists and at least two existing owner-specific outcomes adapt into it without losing local state, reasons, freshness, revision, retry, terminal, or evidence fields.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `runtime_contract_owner`
- Route boundary: `owner_outcome_envelope`
- Route dominant reason: `owner_outcome_not_universal`
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

1. src/control-plane/owner-outcome-contract.js
2. src/control-plane/control-plane-system-table-gateway-shared.js
3. src/control-plane/publication-active-gate-handoff-contract.js
4. test/control-plane/owner-outcome-contract.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Ambiguity score: `2`
- Owned files: `src/control-plane/owner-outcome-contract.js`, `src/control-plane/control-plane-system-table-gateway-shared.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `test/control-plane/owner-outcome-contract.test.js`
- Forbidden files: none beyond declared write scope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope`, `npm test -- test/control-plane/owner-outcome-contract.test.js`, `npm run work:validate -- --pre-impl work/packages/done-20260521-universal-owner-outcome-envelope.md`
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
1. Split individual owner adapters into follow-on runtime-owner-boundary packages if more than two runtime owners need edits.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: changed files: `src/control-plane/owner-outcome-contract.js`, `src/control-plane/control-plane-system-table-gateway-shared.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `test/control-plane/owner-outcome-contract.test.js`; implementation added shared owner outcome envelope plus gateway and active-gate adapters; parent fixed new literal guardrail violations in `src/control-plane/owner-outcome-contract.js`; commands/results: `npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope` (pass), `npm test -- test/control-plane/owner-outcome-contract.test.js` (pass), `npm run work:validate -- --pre-impl work/packages/done-20260521-universal-owner-outcome-envelope.md` (pass), `node scripts/check-guideline-literals.js src/control-plane/owner-outcome-contract.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/publication-active-gate-handoff-contract.js` (pass), `node scripts/check-guideline-decision-boundaries.js src/control-plane/owner-outcome-contract.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/publication-active-gate-handoff-contract.js` (pass), `npm run audit:runtime-grammar:file -- src/control-plane/owner-outcome-contract.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/publication-active-gate-handoff-contract.js` (pass), `git diff --check` (pass); parent revalidated focused proof: yes; next: verifier-fixer pass.
- [x] verification-fix: status: validated; evidence: inspected owner envelope + gateway/publication adapters for owner-boundary correctness, fail-closed behavior, null/undefined handling, local detail preservation, and caller-side reinterpretation; fixed publication adapter terminal classification so `blocked`/`failed` owner outcomes are terminal; added regression coverage for unavailable publication handoff envelope behavior; commands/results: `npm run work:package:doctor -- --suggest work/packages/done-20260521-universal-owner-outcome-envelope.md` (pass), `npm run work:validate -- --pre-impl work/packages/done-20260521-universal-owner-outcome-envelope.md` (pass), `npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope` (pass), `npm test -- test/control-plane/owner-outcome-contract.test.js` (fail once on new expectation, then pass after in-scope test correction), `node scripts/check-guideline-literals.js src/control-plane/owner-outcome-contract.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/publication-active-gate-handoff-contract.js` (pass), `node scripts/check-guideline-decision-boundaries.js src/control-plane/owner-outcome-contract.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/publication-active-gate-handoff-contract.js` (pass), `npm run audit:runtime-grammar:file -- src/control-plane/owner-outcome-contract.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/publication-active-gate-handoff-contract.js` (pass), `git diff --check` (pass); parent reran package doctor, pre-impl validation, owner-files, focused test, literal guard, decision-boundary guard, runtime grammar audit, and `git diff --check` after verifier fix (all pass); changed files: `src/control-plane/publication-active-gate-handoff-contract.js`, `test/control-plane/owner-outcome-contract.test.js`; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: closure validation.

## Validation

1. npm run analyze:owner-files -- runtime_contract_owner owner_outcome_envelope
2. npm test -- test/control-plane/owner-outcome-contract.test.js
3. npm run work:validate -- --pre-impl work/packages/done-20260521-universal-owner-outcome-envelope.md
