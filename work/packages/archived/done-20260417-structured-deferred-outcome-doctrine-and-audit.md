# Structured Deferred-Outcome Doctrine And Audit

## Why

Several of the hardest failures in the current sprint share one pattern:

1. an owner-path read or write is unresolved under pressure
2. the caller receives an empty list, timeout-shaped silence, or a weak local
   fallback
3. downstream consumers interpret that absence differently
4. the system accumulates another shadow decision path

The recent control-plane and harness fixes improved specific boundaries, but
the repo still needs a durable rule: unresolved owner-path operations must emit
structured deferred outcomes rather than ambiguous absence or silence.

This package exists to turn that rule into explicit doctrine, testing policy,
and a bounded deterministic audit for the active hotspot families.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Add a durable doctrine rule that unresolved owner-path reads and writes must
   return structured deferred outcomes.
2. Add corresponding stable testing guidance requiring regression coverage for
   deferred outcomes when an owner path is intentionally unresolved or
   backpressured.
3. Add one bounded deterministic audit or checker for the current hotspot
   families so active work can measure compliance instead of relying only on
   memory.
4. Keep the rule tightly scoped to owner-path unresolved behavior rather than
   trying to lint every async function in the repo.

## Out Of Scope

1. A whole-program static proof for all timeout or retry behavior.
2. Replacing focused behavioral tests with a linter.
3. Generic stylistic rules unrelated to owner-path semantics.
4. Repo-wide cleanup of every historical empty-list or timeout fallback in one
   package.

## Invariants

1. Structured deferred outcomes are semantic contracts, not logging sugar.
2. Callers may consume or propagate a deferred outcome, but they must not
   silently reinterpret it as empty success or unknown absence.
3. The audit must remain deterministic and scoped enough to be useful in day-to-day
   work.
4. Doctrine, testing policy, and the audit must use the same rule vocabulary.

## Hotspots

1. `.kiro/steering/doctrine.md`
2. `.kiro/steering/testing-guidelines.md`
3. `scripts/check-guideline-decision-boundaries.js`
4. `scripts/guideline-check-shared.js`
5. `test/scripts/check-guideline-decision-boundaries.test.js`
6. `architecture/current-owner-maps.md`
7. Active hotspot owner modules named by the current benchmark and recovery
   packages

## Analysis Tasks

- [x] Confirm that recent failures repeatedly involved timeout-shaped silence,
  empty collections, or weak local fallbacks on unresolved owner paths.
- [x] Confirm that doctrine and testing policy are the right durable homes for
  the rule itself.
- [x] Confirm that a bounded deterministic audit is preferable to a vague
  best-effort convention.

## Implementation Tasks

- [x] Add the structured deferred-outcome rule to doctrine.
- [x] Add the corresponding regression policy to testing guidelines.
- [x] Add one bounded deterministic audit for the active hotspot families or
  extend the existing guideline-audit tooling to cover the new rule.
- [x] Add focused tests for the new audit and documentation-driven behavior.
- [x] Record the new rule in current owner-map guidance where shared owner
  snapshots depend on deferred outcomes.

## Progress Notes

1. Doctrine now states the core rule explicitly: unresolved owner paths must
   emit one structured deferred outcome instead of empty-list, null-shaped, or
   timeout-only silence.
2. Testing guidance now requires a regression whenever a caller should see
   deferred owner state instead of ambiguous absence, and it ties that rule to
   the new middle boundary-transition layer.
3. `scripts/check-guideline-deferred-outcomes.js` adds a bounded hotspot audit
   for the current deferred-outcome owners and consumers, with focused tests in
   `test/scripts/check-guideline-deferred-outcomes.test.js`.

## Documentation Decision

1. `.kiro/steering/doctrine.md` is the durable home for the design rule.
2. `.kiro/steering/testing-guidelines.md` is the durable home for the required
   regression policy.
3. `architecture/current-owner-maps.md` should reference the rule only where a
   concrete shared owner path depends on it.

## Validation

1. `node test/scripts/check-guideline-decision-boundaries.test.js`
2. Focused tests for any new or extended deferred-outcome checker
3. Manual review of doctrine/testing-guideline coherence

## Done When

1. The repository has one explicit rule that unresolved owner paths must emit
   structured deferred outcomes.
2. Stable testing policy requires regressions for that rule.
3. Active work has at least one deterministic audit surface to keep the rule
   visible and measurable.
