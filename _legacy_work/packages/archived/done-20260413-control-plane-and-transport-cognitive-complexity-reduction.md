# Control-Plane Readiness and Message Delivery Predictability

## Status

Closed on 2026-04-20 as a planning umbrella.

The execution split that originally fed this package is archived done, and the
remaining structural closure is now owned by narrower coherence packages rather
than this broad umbrella. This package no longer owns package-local harness
reruns.

## Why

Rolling restarts, join-under-load behavior, and recovery scenarios depend on
one clear answer to two questions: is the node actually ready for the next
step, and where should the next message go? When readiness and routing are
encoded through scattered conditions or fallback paths, scenario failures stop
being predictable and diagnostics stop being trustworthy.

This package couples the remaining control-plane and transport hotspot work to
one outcome: readiness and delivery decisions should emit one canonical state
and one canonical reason story for the scenario families that stress them.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Simplify the relevant owner paths in
   `src/control-plane/control-plane-readiness-service.js`
2. Simplify the relevant owner paths in `src/transport/message-router.js`
3. Touch directly related helpers only where needed to preserve one readiness
   and delivery owner path

## Out Of Scope

1. Broad transport redesign
2. Startup or publication feature work outside the touched readiness and
   delivery lane
3. General duplication cleanup outside the directly touched files

## Scenario Targets

1. `rolling-restart`
2. `seed-restart-under-load`
3. `node-join-under-load`
4. `seven-node-load-during-partitioning`
5. `seven-node-read-write-load-transaction-recovery`

## Invariants

1. Readiness and routing outcomes must emit one canonical result and typed
   reasons.
2. Refactors must not introduce fallback paths, owner bypasses, or competing
   readiness vocabularies.
3. Focused control-plane and transport coverage plus the relevant scenario
   evidence must remain green on the touched lane.

## Execution Split

1. [Control-plane publication and provisioning contract reuse cutover](done-20260419-control-plane-publication-and-provisioning-contract-reuse-cutover.md)
2. [Message router connection authority and outbound registry owner split](done-20260418-message-router-connection-authority-and-outbound-registry-owner-split.md)
3. [Control-plane readiness startup authority and transition owner extraction](done-20260418-control-plane-readiness-startup-authority-and-transition-owner-extraction.md)

## Residual Closure Inventory

- [x] The original execution-split packages are archived done.
- [x] Remaining structural closure is tracked in narrower readiness/transport
      packages rather than this umbrella.
- [x] This umbrella is closed and no longer waits on package-local harness
      evidence.

## Validation

1. Targeted control-plane tests
2. Targeted transport tests
3. Focused scenario evidence for the named readiness and recovery lanes
4. `npm run test:metrics`

## Done When

1. The touched readiness and delivery owners answer with one canonical state
   model and readable reasons.
2. The named scenario families are either green on the touched lane or fail
   with one obvious typed blocker story.
3. Zero circular dependencies remain preserved and `npm run test:metrics`
   stays green on the tightened baselines.
