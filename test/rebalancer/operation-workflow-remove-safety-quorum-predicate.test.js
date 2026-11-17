// R1 — projectQuorumAfterRemoval: the single authoritative post-removal quorum predicate
// for the floor sites in operation-workflow-remove-safety-evaluator.js and the universal
// tier. The former completion-safe scope, whose optimistic cluster-node union could lift
// the count to the floor (the over-removal seam), is closed: the voter-ready floor counts
// only the partition's voter-ready rows on READY-lease nodes, on every path.

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

function rowsOnNodes(nodeIds) {
  return nodeIds.map((nodeId, index) => ({
    replica_id: `p-r${index}`,
    service_id: `p-r${index}`,
    node_id: nodeId,
  }));
}

test('simple-floor: defers when voter-ready rows drop below min (every system and universal removal path)', (t) => {
  const below = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(2), minReplicaCount: 3,
    scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR,
  });
  t.equal(below.floorSatisfied, false);
  t.equal(below.projectedVoterReadyCount, 2);
  const at = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(3), minReplicaCount: 3,
    scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR,
  });
  t.equal(at.floorSatisfied, true);
  t.end();
});

test('simple-floor: the projection is the strict voter-ready row count', (t) => {
  const r = projectQuorumAfterRemoval({
    projectedVoterReadyRows: rows(2), minReplicaCount: 3,
    scope: QUORUM_PROJECTION_SCOPE.SIMPLE_FLOOR,
  });
  t.equal(r.projectedVoterReadyCount, 2);
  t.same(r.reason, {kind: 'below-min', got: 2, need: 3});
  t.equal(r.floorSatisfied, false);
  t.same(Object.keys(QUORUM_PROJECTION_SCOPE).sort(), ['PUBLISHED_SPREAD', 'SIMPLE_FLOOR'],
    'no scope admits a cluster-node union into the voter count');
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

test('published-spread: a serialized intermediate REPLACE may preserve current spread ' +
  'below the final target, but may not regress it', (t) => {
  const currentTwoNodeSpread = rowsOnNodes([
    'node-seed',
    'node-seed',
    'node-seed',
    'node-target',
  ]);
  const preservedTwoNodeSpread = rowsOnNodes([
    'node-seed',
    'node-seed',
    'node-target',
  ]);
  const preserved = projectQuorumAfterRemoval({
    currentVoterReadyRows: currentTwoNodeSpread,
    projectedVoterReadyRows: preservedTwoNodeSpread,
    requiredDistinctNodeCount: 3,
    scope: QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD,
  });
  t.equal(
    preserved.floorSatisfied,
    true,
    '2 -> 2 is non-regressing and must release the serialized operation so a later REPLACE can reach 3',
  );
  t.equal(preserved.currentDistinctNodeCount, 2);
  t.equal(preserved.requiredPostRemovalDistinctNodeCount, 2);

  const regressed = projectQuorumAfterRemoval({
    currentVoterReadyRows: currentTwoNodeSpread,
    projectedVoterReadyRows: rowsOnNodes([
      'node-seed',
      'node-seed',
      'node-seed',
    ]),
    requiredDistinctNodeCount: 3,
    scope: QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD,
  });
  t.equal(
    regressed.floorSatisfied,
    false,
    '2 -> 1 still blocks: the intermediate operation may preserve deficit, never increase it',
  );
  t.equal(regressed.requiredPostRemovalDistinctNodeCount, 2);
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
