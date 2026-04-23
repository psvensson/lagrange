# Shadow-Grammar Deletion Across Readiness, Bootstrap, And Rebalancer

## Status

Closed on 2026-04-20.

Focused proof is now green. Readiness planning answers retain and merge the
shared `publicationRecoveryGate`, readiness evidence preserves typed local
query-transport diagnostics, bootstrap readiness consumes gate-owned ACK
fields, and rebalancer priority blockers use the shared gate snapshot instead
of local spread-gap reinterpretation. Sprint-level scenario confirmation
remains downstream and is not a package-local closure gate.

## Why

The system now has better small contracts, but the largest owners still keep
older local grammars alive beside them. As long as those branch piles remain,
failures will continue to surface as "surprises" because several meanings are
still possible at once.

This package deletes the leftover local grammars after the new canonical
contracts are in place.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Delete local readiness/publication/recovery interpretation branches that are
   superseded by shared contracts.
2. Remove stale vocabulary and redundant owner-local snapshots on the touched
   boundaries.
3. Add proof that consumers now route through one contract shape per concern.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Invariants

1. Each touched concern has one declared contract shape.
2. Tail consumers do not preserve legacy reinterpretations.
3. Closure is not complete until hot path, tail consumers, diagnostics, and
   deletion work are all closed.

## Residual Closure Inventory

- [x] Tail consumers of readiness/publication/recovery reuse shared contracts.
- [x] Superseded local branch piles are deleted.
- [x] Focused proof confirms the cutover and package-local closure no longer
      waits on named harness evidence.
  Focused proof is green with:
  `npm test -- test/control-plane/control-plane-readiness-service.test.js test/bootstrap/bootstrap-api.test.js test/bootstrap/bootstrap-readiness-ladder.test.js test/rebalancer/unified-rebalancer.test.js`.
  Named harness confirmation is now owned by the sprint-level scenario pass.
