# Runtime Grammar Hierarchy Contract And Priority-Recovery Inventory

## Why

The system now has enough explicit runtime vocabulary that the next problem is
not just missing labels. It is the lack of one hierarchy that puts those
labels in order.

On the current priority-recovery path, the same artifact can show:

1. publication pending
2. missing active membership acknowledgement
3. `eligible_but_no_operation_created`
4. control-plane write backlog and timeout pressure
5. harness-level dominant reasons

Those are not one layer of meaning.

This package freezes the hierarchy contract and maps the current
priority-recovery pilot slice into it before more runtime changes land.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

## In Scope

1. Define one explicit runtime grammar hierarchy for active implementation:
   `intent`, `authority`, `actuation`, `conditions`, `decision`,
   `presentation`.
2. Map the current priority-recovery pilot slice into that hierarchy.
3. Record the most obvious missing and overloaded grammar on that slice.
4. Update the active architecture record so later packages can build on one
   durable contract instead of another local interpretation.

## Out Of Scope

1. Runtime behavior changes on the owner path
2. New scenario runs or harness confirmation work
3. Repo-wide grammar inventory outside the pilot slice
4. Presentation-layer redesign beyond identifying where it currently
   overreaches

## Invariants

1. This package must not invent a new parallel runtime subsystem.
2. The hierarchy must reuse existing owner paths and only reorder meaning.
3. The missing actuation layer must be named explicitly instead of folded back
   into publication or reporting semantics.
4. The priority-recovery pilot slice must remain the concrete reference path.

## Hotspots

1. `architecture/runtime-grammar-hierarchy.md`
2. `architecture/current-owner-maps.md`
3. `src/control-plane/priority-recovery-diagnostics-constants.js`
4. `src/control-plane/owner-contract-outcome.js`
5. `src/control-plane/priority-recovery-snapshot.js`
6. `test-output/.playback/report/node-join-under-load/triage-summary.json`

## Shared Boundary Contract

- Semantic owner:
  the hierarchy itself is an architecture contract consumed by the pilot-slice
  runtime owners and later cutover packages
- Canonical contract shape / vocabulary:
  `RuntimeGrammarHierarchy { intent, authority, actuation, conditions, decision, presentation }`
- Allowed consumers:
  active runtime packages,
  `architecture/current-owner-maps.md`,
  pilot-slice design and cutover packages
- Prohibited reinterpretations:
  treating all current enums as peer concepts,
  folding pressure directly into report-level meaning,
  or using publication truth as a substitute for actuation state

## Detection / Analysis Tasks

- [x] Inventory the current priority-recovery pilot slice and classify the
      existing grammar families.
- [x] Identify the missing first-class actuation layer.
- [x] Identify the most overloaded current layers on the pilot slice.

## Implementation Tasks

- [x] Add one architecture document that defines the target hierarchy and the
      pilot-slice mapping.
- [x] Update [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      so the hierarchy is part of the active architecture record.
- [x] Record the immediate next closure targets for the pilot slice.
- [x] Map the adjacent publication/readiness/workflow owners more explicitly
      into the pilot hierarchy so the actuation package can start from one
      shared inventory instead of another local read.
- [x] Tighten the follow-on package inputs using the hierarchy inventory.

## Residual Closure Inventory

- [x] The hierarchy contract is now durable enough to drive the pilot slice.
- [x] The missing actuation layer is named explicitly.
- [x] The current overreach of publication and presentation semantics is
      recorded explicitly.
- [x] The follow-on packages now have tightened inputs from the owner-path
      inventory, but still need to land the runtime actuation contract and
      code-path cutovers.

## Execution Notes

1. Added [runtime-grammar-hierarchy.md](../../architecture/runtime-grammar-hierarchy.md)
   with the target layer contract and the current priority-recovery mapping.
2. Updated [current-owner-maps.md](../../architecture/current-owner-maps.md)
   so the hierarchy is part of the active architecture record.
3. The current pilot-slice gap is now explicit:
   observation and reporting are richer than the actuation grammar between
   workflow/coordinator state and the decision layer.
4. Added the concrete adjacent owner ingress map:
   readiness planning projection and local admission,
   admitted active cohort resolution,
   coordinator create-lane and follow-up arming,
   workflow progress and timeout reconcile,
   and the existing pressure/timeout evidence sources.
5. Tightened the actuation follow-on package so it starts from one explicit
   owner-path inventory instead of a fresh local survey.

## Validation

1. Architecture review of the hierarchy against the active pilot slice
2. No runtime behavior change is intended in this package

## Done When

1. The pilot slice has one explicit hierarchy contract.
2. The next package can implement actuation on top of that contract without
   redefining the hierarchy locally.
