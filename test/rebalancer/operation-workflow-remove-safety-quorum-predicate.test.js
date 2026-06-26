// R1 — projectQuorumAfterRemoval: the single authoritative post-removal quorum predicate
// consolidating the three floor sites in operation-workflow-remove-safety-evaluator.js.
// This is a behavior-PRESERVING consolidation; these tests pin that each `scope`
// reproduces the decision its former inline site made, and that the structured result
// exposes both the strict and the optimistic count so a future over-removal fix has one
// place to branch.

import {test} from '../../src/test-helpers/tap.js';
import {
  projectQuorumAfterRemoval,
  QUORUM_PROJECTION_SCOPE,
} from '../../src/rebalancer/operation-workflow-remove-safety-evaluator.js';

function rows(n) {
  return Array.from({length: n}, (_, i) => ({
    replica_id: `p-r${i}`,
    service_id: `p-r${i}`,
    node_id: `node-${i}`,
  }));
}

test('simple-floor: defers when voter-ready rows drop below min (the non-completion-safe site)', (t) => {
  const below = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(2), minReplicaCount: 3,
    completionSafe: false, scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR,
  });
  t.equal(below.floorSatisfied, false);
  t.equal(below.projectedVoterReadyCount, 2);
  const at = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(3), minReplicaCount: 3,
    completionSafe: false, scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR,
  });
  t.equal(at.floorSatisfied, true);
  t.end();
});

test('simple-floor: ignores the recovery-projection union (strict row count only)', (t) => {
  const r = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(2), minReplicaCount: 3,
    recoveryProjectionNodeIds: ['a', 'b', 'c', 'd'],
    completionSafe: false, scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR,
  });
  t.equal(r.effectiveProjectedVoterReadyCount, 2, 'non-completion-safe never inflates with the union');
  t.equal(r.floorSatisfied, false);
  t.end();
});

test('completion-safe-floor: the optimistic node-union can lift the count to the floor (preserved over-removal seam)', (t) => {
  const r = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(2), minReplicaCount: 3,
    recoveryProjectionNodeIds: ['a', 'b', 'c'], // includes a not-yet-ready node
    completionSafe: true, scope: QUORUM_PROJECTION_SCOPE.COMPLETION_SAFE_FLOOR,
  });
  t.equal(r.projectedVoterReadyCount, 2, 'strict count exposed');
  t.equal(r.effectiveProjectedVoterReadyCount, 3, 'optimistic count exposed (max of rows, union)');
  t.equal(r.floorSatisfied, true, 'this is the documented over-removal seam, preserved unchanged');
  t.ok(r.effectiveProjectedVoterReadyCount > r.projectedVoterReadyCount,
    'the single branch a future fix can key on (learners inflated the count)');
  t.end();
});

test('completion-safe-floor: with no recovery projection, effective == strict count', (t) => {
  const r = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(2), minReplicaCount: 3,
    recoveryProjectionNodeIds: null,
    completionSafe: true, scope: QUORUM_PROJECTION_SCOPE.COMPLETION_SAFE_FLOOR,
  });
  t.equal(r.effectiveProjectedVoterReadyCount, 2);
  t.equal(r.floorSatisfied, false, 'no snapshot => strict floor, matching the former resolve fn');
  t.end();
});

test('published-spread: defers when distinct nodes fall below requiredDistinctNodeCount', (t) => {
  const below = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(2), requiredDistinctNodeCount: 3,
    scope: QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD,
  });
  t.equal(below.floorSatisfied, false);
  t.equal(below.projectedDistinctNodeCount, 2);
  const at = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(3), requiredDistinctNodeCount: 3,
    scope: QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD,
  });
  t.equal(at.floorSatisfied, true);
  t.end();
});

test('published-spread: a non-finite or <=1 requirement is always satisfied (the former early-out)', (t) => {
  for (const req of [NaN, undefined, 0, 1]) {
    const r = projectQuorumAfterRemoval({
      projectedVoterReadyRows: rows(0), requiredDistinctNodeCount: req,
      scope: QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD,
    });
    t.equal(r.floorSatisfied, true, `requirement ${String(req)} short-circuits to satisfied`);
  }
  t.end();
});
