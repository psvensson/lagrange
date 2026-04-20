# Steering And Static Guardrails For Boundary Impedance And Overlap

## Why

The repo already has strong one-owner and explicit-state rules, but recent
failures show a narrower class of regressions keeps returning anyway:

1. overlapping authority surfaces
2. semantic mode bags built from booleans
3. storage or transport shapes leaking into runtime contracts
4. several near-synonymous identifiers for one concern
5. consumers using internal or diagnostic surfaces as production authority

Those problems will continue unless the steering docs and lightweight
mechanical checks make them hard to reintroduce.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `.kiro/steering/system guidelines.md`
2. `.kiro/steering/doctrine.md`
3. `.kiro/steering/code-style.md`
4. `architecture/current-owner-maps.md`
5. `work/packages/archived/done-20260412-steering-hardening-for-generation-contracts.md`

## Sprint Umbrella

[Runtime Boundary Simplification And Contract Unification Sprint](../../sprints/archived/done-2026-q2-runtime-boundary-simplification-and-contract-unification.md)

## In Scope

1. Strengthen steering rules for:
   - one canonical contract shape per concern
   - explicit consumer contracts for shared surfaces
   - named modes instead of semantic boolean bags
   - boundary normalization instead of runtime impedance leaks
2. Require architecture or boundary-catalog updates when a shared contract is
   added or reshaped.
3. Define one bounded static-analysis follow-on for patterns that can be
   detected mechanically.

## Out Of Scope

1. Building a full new lint framework.
2. Introducing duplicate steering documents.
3. Treating static checks as a substitute for architectural review.

## Invariants

1. Steering guidance must stay aligned across doctrine, system guidelines, and
   style documents.
2. The repo must keep one steering framework rather than several overlapping
   policy layers.
3. Static checks may detect suspicious patterns, but semantic owner review
   remains mandatory.
4. Shared boundary changes must declare consumers and forbidden
   reinterpretations explicitly.

## Hotspots

1. `.kiro/steering/system guidelines.md`
2. `.kiro/steering/doctrine.md`
3. `.kiro/steering/code-style.md`
4. `architecture/current-owner-maps.md`
5. `scripts/`

## Detection / Analysis Tasks

- [ ] Inventory which overlap and impedance patterns can already be detected by
      existing static metrics or scripts.
- [ ] Detect the steering gaps that allowed overlapping contract shapes and
      boolean mode bags to recur.
- [ ] Define the smallest useful mechanical checks for the new rules.

## Implementation Tasks

- [ ] Tighten the steering docs to make the new contract rules explicit and
      high-salience.
- [ ] Require boundary-catalog updates when shared contracts change.
- [ ] Add one bounded static-analysis or audit follow-on for mechanically
      detectable overlap patterns.
- [ ] Align package language so future work packages must declare contract
      shape, consumers, and prohibited reinterpretations.

## Validation

1. Manual consistency review across the touched steering docs.
2. Link and wording sanity review for package and architecture references.
3. Script or metrics proof if a new mechanical check lands.

## Done When

1. The steering docs explicitly forbid overlapping contract shapes and runtime
   impedance leaks.
2. Shared semantic modes are described as named contracts, not boolean bags.
3. Future shared-boundary packages are required to declare consumers and
   forbidden reinterpretations.
4. A bounded mechanical-enforcement path exists or is split forward explicitly.
