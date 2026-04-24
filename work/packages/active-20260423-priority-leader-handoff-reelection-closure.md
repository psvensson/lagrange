# Priority Leader Handoff Re-Election Closure

## Why

The source-removal closure witness guard held in focused tests and in the
representative rerun. The rerun then failed on the next state-machine boundary:
priority replacement operations stayed active while source removal was deferred
because no canonical non-source partition leader was durably visible.

The final artifact showed priority service rows as followers and repeated
`replace_remove_safety_blocked` deferrals with replacement leader ownership
pending. That means source leader handoff was acknowledged, but the interlocked
Raft/service/partition publication machines did not complete the second half of
the contract: re-elect, observe, and publish a replacement leader before safe
source removal.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Define the leader-handoff closure contract between replica handler,
   partition service, Raft timers, durable leader publication, and rebalancer
   source-removal safety.
2. Add focused proof that a forced source step-down either reactivates election
   progress or returns a state that cannot be interpreted as replacement leader
   ownership.
3. Correct the implementation path that acknowledges handoff without producing
   or observing a replacement leader.
4. Correct priority recovery diagnostics so active operations blocked on
   replacement leader ownership are not reported as operation absence.
5. Rerun the representative `node-join-under-load` scenario after focused proof
   is green.

## Out Of Scope

1. Relaxing the replacement-leader ownership guard added by the source-removal
   package.
2. Treating source follower evidence, completed handoff RPCs, or operation
   absence as spread closure.
3. Broad changes to non-priority leader election unless required by the shared
   owner contract.

## Shared Boundary Contract

- Semantic owner:
  source handoff demotes or releases the old owner; election/publication owns
  replacement leader closure.
- Canonical contract:
  source-removal safety may observe replacement leadership only through the
  canonical partition leader row naming a non-source node.
- Progress contract:
  a successful forced handoff must leave at least one explicit election or
  publication path alive; it must not clear the old leader's timers and return
  completed while all replicas remain follower-only with no replacement
  ownership path.
- Diagnostic contract:
  active replacement operations blocked on leader ownership are blocked
  operations, not missing operations.

## Hotspots

1. `src/node/replica-handler-class-part-2.js`
2. `src/node/replica-handler-class-part-1.js`
3. `src/node/replica-handler-constants.js`
4. `src/partition/partition-service-segment-1-part-2.js`
5. `src/partition/partition-service-segment-4-part-2.js`
6. `src/raft/liferaft-provider.js`
7. `src/control-plane/priority-recovery-observation-snapshot.js`
8. `test/node/replica-handler.test.js`
9. `test/node/replica-handler-tail-more-test-cases.js`
10. `test/rebalancer/quorum-conditioned-remove-safety.test.js`
11. `test/control-plane/priority-recovery-snapshot.test.js`

## Detection / Analysis Tasks

- [x] Confirm the source-removal guard moved the scenario from premature
      operation completion to active replacement operations blocked on
      replacement leader ownership.
- [x] Confirm the fresh artifact contains priority partitions with follower
      rows and no canonical non-source leader for the blocked source-removal
      closures.
- [x] Trace the forced step-down path from replica handler to Raft timer state
      and durable partition leader publication.
- [x] Identify whether the missing closure is election reactivation,
      publication observation, diagnostic classification, or a combination.

## Implementation Tasks

- [x] Add or update node-level focused tests for forced source step-down and
      election reactivation.
- [x] Add or update control-plane diagnostics tests for active operations
      blocked on replacement leader ownership.
- [x] Patch the smallest owner seam that can produce an explicit replacement
      leader closure path without bypassing source-removal safety.
- [x] Extend runtime grammar audit coverage if the fix introduces a new
      state-machine boundary that must stay mechanically guarded.

## Residual Closure Inventory

- [x] Node-level handoff/election proof.
- [x] Priority recovery diagnostic proof.
- [x] Focused rebalancer/source-removal regression proof.
- [x] Representative `node-join-under-load` rerun.

## Progress Notes

1. This package exists because the previous package intentionally stopped
   source removal from hiding missing replacement leadership. The current
   failure is now the exposed liveness contract between handoff, election, and
   durable leader publication.
2. Forced priority step-down now preserves or rearms election progress instead
   of clearing the follower timer and returning a false terminal handoff.
3. Priority recovery diagnostics now preserve leader-ownership-blocked active
   operations as blocked in-flight work rather than collapsing them into
   missing-operation classification.
4. Focused validation passed:
   `npx tap test/node/replica-handler.test.js`,
   `npx tap test/control-plane/priority-recovery-snapshot.test.js`,
   `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js`,
   `npx tap test/scripts/check-runtime-grammar-contracts.test.js`, and
   `npm run test:metrics`.
5. Representative rerun on April 23, 2026 no longer stalls on replacement
   leader ownership. Publication gate readiness is `true`, blocked or
   unresolved priority partitions are `0`, and the scenario fails later on
   `nodeAdmissionBlocked`.

## Validation

1. `npx tap test/node/replica-handler.test.js`
2. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
3. `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js`
4. `npm run audit:runtime-grammar`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. Forced priority source handoff cannot leave source-removal safety waiting on
   replacement leader ownership with no election/publication progress path.
2. Diagnostics distinguish active leader-ownership-blocked operations from
   missing operation creation.
3. The representative harness is green, or the next state-machine blocker is
   explicitly split from a fresh failure bundle.
