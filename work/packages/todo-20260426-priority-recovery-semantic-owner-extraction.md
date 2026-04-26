# Priority Recovery Semantic Owner Extraction

## Why

`src/control-plane/priority-recovery-snapshot.js` is over 4000 lines, and
current rebalancer segments still exceed reviewable owner boundaries. The
active runtime failures are on priority recovery and replica-operation
progression paths, so decomposition must follow semantic owners instead of
creating more arbitrary segments.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
`Topology workflow stabilization`, `Failure simulations`, and `Production
guarantees`.

Sprint:

1. [Roadmap runtime truth and boundary closure](../sprints/active-2026-q2-roadmap-runtime-truth-and-boundary-closure.md)

Related backlog:

1. [Oversized runtime decomposition tranche 1](./todo-20260419-oversized-runtime-decomposition-tranche-1.md)
2. [Oversized runtime decomposition tranche 2](./todo-20260419-oversized-runtime-decomposition-tranche-2.md)

## In Scope

1. Build a semantic inventory of priority recovery snapshot responsibilities.
2. Extract one owner boundary at a time, starting with the boundary named by the
   current `rolling-restart` blocker.
3. Prioritize priority recovery snapshot, operation workflow owner, unified
   rebalancer, and bootstrap/join readiness collaborators.
4. Add focused proof for every extracted owner.
5. Update owner maps or architecture records when a durable boundary emerges.

## Out Of Scope

1. Mechanical segment splitting without semantic ownership.
2. Broad reformatting or literal cleanup outside the extracted owner boundary.
3. Changing runtime behavior without focused proof and representative-gate
   follow-up.

## Invariants

1. Priority recovery decisions remain canonical and owner-visible.
2. Replica-operation progression cannot be reconstructed by consumers from
   local booleans.
3. Decomposition must not increase static guardrail debt.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/rebalancer/operation-workflow-owner-segment-5.js`
3. `src/rebalancer/operation-workflow-owner-segment-7.js`
4. `src/rebalancer/unified-rebalancer-segment-4.js`
5. `src/rebalancer/unified-rebalancer-segment-5.js`
6. `src/bootstrap/owners/`
7. `test/control-plane/priority-recovery-snapshot.test.js`
8. `test/rebalancer/`

## Static Drift Ledger

Preflight:

- [ ] Record line counts for touched owner files.
- [ ] Run decision-boundary and literal audits for touched files.
- [ ] Run metadata-gateway audit if owner paths cross system metadata.
- [ ] Record current representative `rolling-restart` blocker.

Closure:

- [ ] Rerun the same file-scoped audits.
- [ ] No touched-file decision-boundary, literal, or metadata-gateway count
      increased.
- [ ] Extracted owner has focused tests and an explicit contract.
- [ ] Representative blocker is rerun or explicitly migrated.

## Validation

1. Focused priority recovery and rebalancer tests.
2. File-scoped static guardrails selected in preflight.
3. `rolling-restart` representative probe if the extracted owner is on the
   active failure path.

## Done When

1. At least one priority recovery semantic owner has been extracted with proof.
2. The extracted boundary reduces review surface and does not create new
   segment-only ownership.
3. Current runtime blocker evidence moves forward or is preserved with no
   static drift increase.
