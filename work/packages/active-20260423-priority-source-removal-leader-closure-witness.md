# Priority Source-Removal Leader Closure Witness

## Why

The latest `node-join-under-load` rerun moved past publication recovery:
publication status was `PUBLISHED`, recovery was `steady_published`, and the
priority spread summary was satisfied.

The remaining failure was deeper than a stale readiness reason. Two priority
partitions, `sql_transactions-p1` and `sql_transaction_participants-p1`, had
completed REPLACE source-removal operations after source handoff evidence, but
their canonical `partitions.leader_node_id` values were still missing and the
final service rows showed every replica as follower.

That exposed a state-machine grammar defect: source leader handoff evidence was
being treated as source-removal closure. It is only source-side evidence. Safe
priority source removal also needs a partition-owned closure witness that a
non-source leader is durably visible.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Add an explicit priority source-removal safety state for replacement leader
   ownership pending.
2. Stop converting completed source handoff evidence into source follower or
   replacement leader closure.
3. Require the canonical partition leader row to name a non-source node before
   dispatching priority REPLACE source removal for handoff-required partitions.
4. Flip the existing stale-leader tests so they prove the closure witness is
   required.
5. Extend the runtime grammar audit to guard the new state-machine boundary.

## Out Of Scope

1. Changing the Raft election algorithm in this package.
2. Harness-side exemptions for missing leaders.
3. Reworking non-priority source removal.

## Shared Boundary Contract

- Semantic owner:
  source handoff is source-replica evidence; partition leadership is
  partition-owned evidence.
- Canonical contract:
  priority source removal can dispatch only when source handoff is no longer
  required and `partitions.leader_node_id` names a non-source node.
- Prohibited reinterpretations:
  completed handoff RPCs, not-found handoff RPCs, or source follower rows as
  replacement leader ownership.
- Primary proof:
  quorum-conditioned remove-safety regressions, runtime grammar audit, and the
  representative `node-join-under-load` rerun.

## Hotspots

1. `src/rebalancer/operation-workflow-owner-segment-5.js`
2. `src/rebalancer/operation-workflow-owner-shared.js`
3. `test/rebalancer/quorum-conditioned-remove-safety.test.js`
4. `test/rebalancer/quorum-conditioned-remove-safety-tail-test-cases.js`
5. `test/rebalancer/quorum-conditioned-remove-safety-tail-more-test-cases.js`
6. `scripts/check-runtime-grammar-contracts.js`
7. `test/scripts/check-runtime-grammar-contracts.test.js`

## Detection / Analysis Tasks

- [x] Confirm the representative rerun no longer fails on publication recovery
      readiness or stale priority spread reasons.
- [x] Identify that affected priority partitions ended with no canonical leader
      while their REPLACE source-removal operations had completed.
- [x] Identify tests that encoded source handoff evidence as sufficient for
      removal while the partition leader row still lagged.

## Implementation Tasks

- [x] Add `WAIT_REPLACEMENT_LEADER_OWNERSHIP` to the priority publication
      leader remove-safety state model.
- [x] Remove completed handoff evidence from source role resolution.
- [x] Defer source removal without another handoff request while replacement
      leader ownership is pending.
- [x] Flip stale-leader source-removal tests to require a non-source
      `leader_node_id`.
- [x] Extend runtime grammar hotspot checks for this boundary.

## Residual Closure Inventory

- [x] Focused quorum-conditioned remove-safety proof.
- [x] Runtime grammar audit proof.
- [x] Focused rebalancer regression suite.
- [x] Representative `node-join-under-load` rerun.

## Progress Notes

1. This package intentionally does not claim to fix every no-leader cause. It
   prevents operation completion from hiding that state-machine gap.
2. Focused proofs passed for the explicit replacement-leader ownership state:
   `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js`,
   `npx tap test/scripts/check-runtime-grammar-contracts.test.js`,
   `npm run audit:runtime-grammar`, the focused unified rebalancer suite, and
   the focused control-plane readiness/publication suite.
3. The representative rerun failed later: publication status was `PUBLISHED`,
   pending ack count was `0`, but priority recovery remained
   `priority_spread_pending` with active priority replacement operations
   deferred on `replace_remove_safety_blocked`.
4. The fresh blocker is no longer early source-removal completion. The guard
   now exposes that forced source leader handoff can leave priority replicas
   follower-only while the canonical partition row never names a non-source
   replacement leader.
5. The next blocker is split into
   [Priority leader handoff re-election closure](./active-20260423-priority-leader-handoff-reelection-closure.md).

## Validation

1. `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js`
2. `npx tap test/scripts/check-runtime-grammar-contracts.test.js`
3. `npm run audit:runtime-grammar`
4. `npx tap test/rebalancer/unified-rebalancer.test.js test/rebalancer/unified-rebalancer.test-part-6.js test/rebalancer/move-planner-inflight-cleanup.test.js test/rebalancer/rebalancer-safety-preflight.test.js`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. Priority source-removal safety no longer completes from source handoff
   evidence alone.
2. Focused tests prove removal waits for non-source partition leadership.
3. The representative harness is green, or the next state-machine blocker is
   explicitly split from a fresh failure bundle.
