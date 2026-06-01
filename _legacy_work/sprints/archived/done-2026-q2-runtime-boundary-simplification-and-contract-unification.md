# Runtime Boundary Simplification And Contract Unification Sprint (AGPL)

## Goal

Collapse the remaining overlapping runtime contracts that keep reintroducing
the same classes of distributed-recovery bugs:

1. several authority views for one concern
2. semantic behavior assembled from boolean option bags
3. multiple endpoint identities for one peer
4. planner, executor, and diagnostics speaking different operation vocabularies
5. storage or transport boundary shapes leaking into runtime state

## Starting Point

Recent recovery work made the hot failures narrower, but also exposed that the
remaining complexity is structural rather than purely bug-local.

The highest-value simplification direction is now:

1. one canonical authority surface per concern
2. one explicit mode contract per ingress
3. one canonical peer endpoint authority
4. one shared operation lifecycle vocabulary
5. one normalized runtime state model instead of raw boundary-shaped state

## Sprint Umbrella

1. [Authority view and consumer contract collapse](../../packages/archived/done-20260418-authority-view-and-consumer-contract-collapse.md)
2. [Control-plane ingress mode contract simplification](../../packages/archived/done-20260418-control-plane-ingress-mode-contract-simplification.md)
3. [Canonical endpoint authority and ingress normalization](../../packages/archived/done-20260418-canonical-endpoint-authority-and-ingress-normalization.md)
4. [Operation ledger lifecycle and blocker vocabulary unification](../../packages/archived/done-20260418-operation-ledger-lifecycle-and-blocker-vocabulary-unification.md)
5. [Steering and static guardrails for boundary impedance and overlap](../../packages/archived/done-20260418-steering-and-static-guardrails-for-boundary-impedance-and-overlap.md)

## Exit Check

1. Shared control-plane and topology boundaries expose one canonical authority
   surface and one explicit consumer contract.
2. Touched owner ingress paths no longer accept semantic read or write behavior
   through combinable boolean bags.
3. Peer routing and recovery publication rely on one canonical endpoint
   authority.
4. Topology-operation planning, execution, and diagnostics share one lifecycle
   vocabulary.
5. Steering and architecture records make these simplification rules difficult
   to regress silently.
