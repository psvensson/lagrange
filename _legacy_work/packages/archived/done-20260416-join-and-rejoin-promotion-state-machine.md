# Join And Rejoin Promotion State Machine

## Why

The join pipeline is now explicitly segmented, but it still compresses several
semantically different states into one broader readiness path:

1. observed by the cluster
2. hydrated from bootstrap truth
3. local services restored or created
4. learner/catchup state still active
5. promotable and safe to count as ready

Mature systems treat these as explicit join/rejoin progression states so a node
is not counted as fully available before promotion evidence exists. This
package closes that gap for both fresh join and durable rejoin.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one explicit join/rejoin promotion state model covering observed,
   hydrated, restoring, catching-up, promotable, and ready.
2. Route fresh join and durable rejoin through the same promotion semantics.
3. Gate readiness, local activation, and cluster admission on promotable
   evidence instead of broader “phase completed” heuristics.
4. Align learner-aware replica evidence, local restored services, and join
   lifecycle signals with that state model.
5. Emit one explicit promotion state and reasons in join diagnostics.

## Out Of Scope

1. Transport/bootstrap contact redesign.
2. Reworking Raft itself or message-group election protocol.
3. General node lifecycle changes unrelated to join/rejoin progression.

## Invariants

1. Join and rejoin must not present a node as fully ready before promotion
   evidence exists for the required local services.
2. Learner or catchup state must remain explicit even when local rows already
   appear `active`.
3. Durable rejoin restore must feed the same promotion state model as fresh
   join, not a parallel shortcut.
4. Promotion-state transitions must be observable in diagnostics and tests.

## Hotspots

1. `src/bootstrap/pipeline/join-startup-plan.js`
2. `src/bootstrap/node-joining-service.js`
3. `src/bootstrap/phases/query-system-state-phase.js`
4. `src/bootstrap/phases/wait-for-leadership-phase.js`
5. `src/bootstrap/join-readiness-evaluator.js`
6. `src/rebalancer/replica-operation-repository.js`
7. `src/control-plane/priority-recovery-snapshot.js`
8. `test/bootstrap/node-joining-service.test.js`
9. `test/bootstrap/bootstrap-readiness-state.test.js`
10. `test/integration/node-join-replica-activation.integration.test.js`
11. `test/integration/critical-partition-learner-safety.integration.test.js`

## Analysis Tasks

- [ ] Inventory the current places where join/rejoin implicitly upgrade from
  hydrated/restored state to ready/promotable state.
- [ ] Define one promotion state model and transition owner for join and
  durable rejoin.
- [ ] Confirm the exact service/replica evidence required before promotion to
  ready.
- [ ] Confirm which distributed scenarios should assert the new intermediate
  states directly.

## Implementation Tasks

- [ ] Add one canonical join/rejoin promotion state owner.
- [ ] Route join pipeline readiness and durable rejoin restore through that
  owner.
- [ ] Make learner/catchup evidence explicit in join diagnostics and gating.
- [ ] Update activation and admission checks so “restored” is not equivalent to
  “promotable”.
- [ ] Add focused and integration regressions for fresh join and durable
  rejoin.

## Progress Notes

1. The canonical promotion owner is live and now distinguishes `hydrated`,
   `restoring`, `catching_up`, `promotable`, and `ready` instead of treating
   fully hydrated-but-still-lagging join state as effectively ready.
2. Join-readiness diagnostics, timeout payloads, and regression coverage now
   preserve promotion state, promotion reasons, and revision metadata together.
3. Fresh join and durable rejoin focused coverage is green for the current
   state model, including learner/catchup gating and restore-in-progress
   behavior.
4. `NodeJoiningService.getStatus()` now exposes promotion state, promotion
   reasons, and snapshot revision metadata directly instead of only coarse
   phase state.
5. Focused, integration, and boundary-transition proof now cover the shared
   promotion model instead of leaving status/reporting surfaces behind.

## Validation

1. `node test/bootstrap/node-joining-service.test.js`
2. `node test/bootstrap/bootstrap-api.test.js`
3. `node test/integration/node-join-replica-activation.integration.test.js`
4. `node test/integration/critical-partition-learner-safety.integration.test.js`
5. `npm run test:distributed:boundary:transition`

## Done When

1. Join and durable rejoin share one explicit promotion state machine.
2. Ready signaling no longer hides catchup/learner progression inside phase
   completion.
3. Diagnostics can explain whether a node is observed, hydrated, catching up,
   promotable, or ready.
4. Remaining join/rejoin failures are narrower than promotion-state ambiguity.
