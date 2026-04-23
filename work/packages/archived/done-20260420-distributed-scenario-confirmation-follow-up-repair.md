# Distributed Scenario Confirmation Follow-Up Repair

## Status

Done on 2026-04-21 after explicit split.

The harness repair package exposed two distinct confirmation blockers on
different boundaries. This umbrella package is closed by handing them off into
two narrower packages with disjoint write scope:

1. `done-20260421-node-join-convergence-assertion-boundary-repair.md`
2. `done-20260421-rolling-restart-stop-start-boundary-repair.md`

## Why

Keeping both blockers in one package would blur two different boundaries:

1. the convergence assertion owner path used by `node-join-under-load`
2. the stop/start restart boundary used by `rolling-restart`

The split keeps validation and deletion aligned with the real bug surfaces.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under
`Failure simulations`.

## Completed Scope

1. Confirmed the first two confirmation scenarios now write scenario/run
   failure bundles instead of crashing in teardown.
2. Recorded the `node-join-under-load` blocker as
   `CONVERGENCE_DEFAULTS is not defined`.
3. Recorded the `rolling-restart` blocker as raw Docker
   `container already stopped`.
4. Split the work into two narrower repair packages before additional code
   changes on those boundaries.

## Handoff

1. [Node-join convergence assertion boundary repair](./done-20260421-node-join-convergence-assertion-boundary-repair.md)
2. [Rolling-restart stop/start boundary repair](./done-20260421-rolling-restart-stop-start-boundary-repair.md)
