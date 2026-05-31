# System Reasoning-Surface Upgrade Sprint

Status: queued. Created on May 31, 2026.

This is a **meta / workflow-framework** sprint, kept distinct from the in-flight
`active-2026-q2-rolling-restart-contract-first-green-theory-loop` runtime sprint
per CORE-02 (one bounded concern per sprint). It was created *instead of*
upgrading the rolling-restart sprint, because the rolling-restart sprint owns a
runtime frontier and must not absorb a framework concern.

## Goal

Shift weight from the loop-*control* layer (which already had many guardrails)
to the *semantic* layer, so that system parts become easier to reason about. The
control guardrails (R1–R14) kept the theory loop honest but did not give the loop
a durable place to record *what is true about a part*, nor force the loop to honour
a formal proof once it had one. This sprint adds the missing semantic surface:
a machine-readable invariant registry, a System-Contract home for whole-system
theory, model-proof forcing, a model-coverage trigger, a blocking representative
circuit breaker, and a single owner-dossier read model.

## Strategic Premise

The repository accumulated 1,100+ packages, 14 guardrails, and a strict validator
engine, yet only one formal model and three contract records. The expensive
pattern was not missing process but missing *reasoned-about parts*: the loop could
re-open analysis on a pair a model had already settled, keep closing packages on a
pair with no model at all, and re-record (and drift) whole-system theory in every
package. This sprint makes the semantic artifacts first-class and binds the
control guardrails to them.

## Sprint Strategy Brief

- Goal state: every owner/boundary has one place that records its invariants
  (registry), its whole-system theory (contract record), and its model status;
  the loop is *forced* to honour a model proof, *required* to build a model when a
  pair stalls unmodelled, and *blocked* from local slices that do not move the
  artifact-bound residual.
- Current causal thesis: reasoning friction, not implementation friction, is the
  dominant cost once the control guardrails exist; the loop lacks a durable
  semantic surface and proof-forcing.
- Competing hypotheses:
  1. The existing guardrails are sufficient and a semantic layer only moves cost.
     Falsifier: a model proof now ends the analysis loop on a pair (R15) instead
     of feeding another rederive, and stalled unmodelled pairs are redirected to
     model-building (R16).
  2. Whole-system theory belongs per-package. Falsifier: the contract-record
     `systemTheory` block (R2) lets packages drop the re-recorded block without
     losing the two-level contract, removing the drift surface.
- Confidence and evidence: high — grounded in the existing active-gate TLA+ proof
  (`test-output/reports/active-gate-tlc-route.model.report.json`,
  `livenessHolds: true`) which R1/R15 now make binding.
- Expected green path: registry first (R6), then systemTheory home (R2), then
  proof forcing (R15/R1), model-coverage (R16/R4), circuit breaker (R17/R5), and
  the owner-dossier read model (R18/R3); docs and template last.
- Wrong-direction signals: a new validator that fires on legacy packages with no
  proven route / no registry entry (all new gates are additive no-ops without the
  new artifacts), or a contract-record change that breaks `work:contract:check`.
- Stop or escalate rule: if a recommendation needs runtime behaviour change,
  stop and split it into a runtime/scenario package on the rolling-restart sprint;
  this sprint owns workflow-framework reasoning surface only.

## Recommendations Implemented

All six recommendations were implemented thoroughly (not scaffolding) and are
green under `work:validate`, `work:contract:check`, `work:invariants:check`, and
the script test suite.

1. **Model-proven route forcing (R15).** `validateModelProvenRouteForcing`
   (`scripts/work-tracker.js`) blocks re-analysis and forces the proven layer when
   a contract record lists a `modelProvenRoutes` entry with `livenessHolds: true`
   for the pair. Tests: `test/scripts/work-tracker-model-proven-route.test.js`.
2. **System Contract Record is the home of systemTheory (R2).**
   `validateTwoLevelTheoryContract` accepts a `sliceTheory.systemTheoryRef` that
   resolves to a record carrying a `systemTheory` block, in place of an inline
   block; `validateContractSystemTheory` (`scripts/work-contract-check.js`)
   validates the block. Tests:
   `test/scripts/work-tracker-system-theory-ref.test.js`.
3. **Owner-dossier read model (R18).** `buildOwnerDossier` +
   `scripts/work-owner-dossier.js` (`npm run work:owner-dossier`) assemble the
   contract record, registry invariants, model status, current residual, recent
   outcomes, and ledger trail for one pair. Tests:
   `test/scripts/work-owner-dossier.test.js`.
4. **Model-coverage requirement (R16).** `validateModelCoverageRequirement`
   redirects an unmodelled pair to model-building after repeated stalled closures.
   Tests: `test/scripts/work-tracker-model-coverage.test.js`.
5. **Representative-progress circuit breaker (R17).**
   `validateRepresentativeProgressCircuitBreaker` blocks local slices when the
   artifact-bound `residualCount` chain does not shrink. Tests:
   `test/scripts/work-tracker-circuit-breaker.test.js`.
6. **Machine-readable invariant registry (R6).**
   `architecture/contracts/invariants.json` (`invariant-registry-v1`) +
   `scripts/work-invariants.js` (`npm run work:invariants:check`), cross-checked
   against contract records by `work:contract:check`. Tests:
   `test/scripts/work-invariants.test.js`.

New guardrails R15–R18 and the registry / systemTheory-home conventions are
documented in `work/RULES.md`; the contract-record template
(`work/templates/system-contract-record.md`) carries the new fields; the command
index (`scripts/list-commands.js`) lists `work:invariants:check` and
`work:owner-dossier`.

## Package Queue

This sprint's deliverables were implemented directly as framework infrastructure
(validators, registry, CLI, docs) rather than as runtime theory-loop packages,
because they change the *validator and reasoning surface* itself rather than
runtime behaviour on a frontier. No runtime owner/boundary frontier is owned by
this sprint. Follow-up packages, if any, belong on the sprint that owns the
relevant runtime pair.

## Activation Note

Do **not** activate this sprint over the in-flight rolling-restart package. The
reasoning-surface upgrade is already merged-ready and additive (every new gate is
a no-op until the new artifacts exist), so it does not need to preempt runtime
work. Activate (`npm run work:sprint:queue --activate <slug>`) only if a future
package extends this surface and the rolling-restart sprint has closed.
