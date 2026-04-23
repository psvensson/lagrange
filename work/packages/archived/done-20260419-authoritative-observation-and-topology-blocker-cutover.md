# Authoritative Observation And Topology Blocker Cutover

## Status

Closed on 2026-04-20. The blocker cutover is landed on the
`node-join-under-load` boundary where cache-only endpoint visibility and hard
missing-row confirmation previously produced different semantic answers.
Endpoint-visibility authoritative revalidation and owner-persisted deferred
replica-operation confirmation are both landed and covered by focused tests,
and the follow-up deep dive did not find a second live local blocker
interpreter left behind. Sprint-level scenario confirmation remains downstream
and is not a package-local closure gate.

## Why

The current hotspot is not one isolated bug. It is one observation-boundary
problem: safety-critical topology and workflow decisions still interpret cache
gaps, authoritative reads, and recent owner-local writes through different
contracts.

This package cuts the most failure-prone blocker paths over to one explicit
authoritative observation grammar so cache lag becomes a typed deferred
outcome instead of a latent deadlock or surprise hard failure.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Revalidate critical-system endpoint-visibility blockers in
   `src/rebalancer/unified-rebalancer.js` against authoritative endpoint rows
   before deferring planning.
2. Reuse explicit owner-persisted observation in
   `src/rebalancer/replica-operation-repository.js` so recent confirmed
   workflow transitions can emit a typed deferred confirmation outcome instead
   of an unstructured hard miss when the authoritative read is momentarily
   empty.
3. Add or update focused rebalancer and repository tests that prove the new
   observation contract.

## Out Of Scope

1. Membership publication owner unification.
2. Broad replica workflow phase-model redesign.
3. Transport delivery or reconnect redesign outside direct observation
   collaborators.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Invariants

1. Cache gaps alone must not keep topology-settling closed once authoritative
   endpoint evidence satisfies the blocker contract.
2. Replica-operation step/status mismatches must still fail hard.
3. Empty authoritative reads after recent owner-local persisted transitions
   must emit one typed deferred outcome, not silent success and not surprise
   hard failure.

## Shared Boundary Contract

- Semantic owner: authoritative observation for endpoint visibility and
  replica-operation visibility
- Canonical contract shape / vocabulary: one observation carrying
  `state`, `operation` or `operations`, `deferredOutcome`, `retryAfterMs`,
  and source-specific reasons
- Allowed consumers: `UnifiedRebalancer`, `ReplicaOperationRepository`,
  focused diagnostics and harness triage
- Prohibited reinterpretations: cache-only blocker adjudication, raw empty
  authoritative reads interpreted as hard loss without checking the owned
  deferred witness contract
- Primary diagnostics / proof surfaces: focused rebalancer tests, focused
  repository tests, and sprint-level scenario confirmation after package
  closure

## Detection / Analysis Tasks

- [x] Trace the current `node-join-under-load` blocker story from playback
      artifacts to concrete owner boundaries.
- [x] Confirm that endpoint-visibility deadlock was caused by cache-only
      blocker evidence.
- [x] Confirm that the next blocker shape is authoritative replica-operation
      confirmation, not the old endpoint blocker.

## Implementation Tasks

- [x] Add authoritative endpoint revalidation to topology-settling blockers.
- [x] Add owner-persisted deferred confirmation handling to
      replica-operation visibility.
- [x] Delete or explicitly close any superseded local blocker interpretation
      revealed by the cutover deep dive.

## Residual Closure Inventory

- [x] Endpoint-visibility blockers consult authoritative evidence before
      deferring.
- [x] Replica-operation confirmation uses one typed deferred witness when the
      authoritative owner read is briefly empty after a local persisted
      transition.
- [x] Focused diagnostics and tests describe the same observation vocabulary.
- [x] Package-local closure no longer waits on named harness evidence.

## Validation

1. `test/rebalancer/unified-rebalancer.test.js`
2. `test/rebalancer/replica-operation-repository.test.js`
3. Sprint-level scenario confirmation after coherence closure
4. `npm run test:metrics`

## Done When

1. Topology blockers and replica-operation confirmation use the same
   authoritative observation/deferred grammar.
2. The endpoint deadlock path is gone.
3. The next harness failures, if any, classify to one narrower owner boundary
   instead of a mixed cache-versus-authoritative story.
