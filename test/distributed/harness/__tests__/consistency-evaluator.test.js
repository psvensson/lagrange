import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {ConsistencyEvaluatorV2} from '../consistency-evaluator.js';
import {ASSERTIONS_CONVERGENCE_WAIT} from '../assertions-convergence-wait.js';
const {runFinalAdjudication} = ASSERTIONS_CONVERGENCE_WAIT;

const SNAPSHOT_TEMPLATE = Object.freeze({
  schemaVersion: 1,
  capturedAt: 1,
  nodes: ['node-1', 'node-2'],
  partitions: ['partition-1'],
  replicaOperations: {
    inFlightCount: 0,
    statusHistogram: {},
  },
});

function createSnapshot(nodeId, overrides = {}) {
  return {
    ...SNAPSHOT_TEMPLATE,
    nodeId,
    leaders: {
      'partition-1': 'leader-a',
    },
    replicaRoleDiagnostics: {
      'partition-1': {
        canonicalLeaderNodeId: 'leader-a',
        source: 'partitions',
        inconsistentReplicaRoles: false,
        replicaLeaderNodeIds: ['leader-a'],
      },
    },
    ...overrides,
  };
}

test('ConsistencyEvaluatorV2 classifies matching snapshots as consistent', async () => {
  const evaluator = new ConsistencyEvaluatorV2();

  const result = evaluator.evaluate({
    reachableNodeIds: ['node-1', 'node-2'],
    snapshots: [
      createSnapshot('node-1'),
      createSnapshot('node-2'),
    ],
  });

  assert.equal(result.verdict, 'consistent');
  assert.equal(result.hardFailure, false);
  assert.equal(result.coverage.reachableNodes, 2);
  assert.equal(result.coverage.snapshotNodes, 2);
  assert.deepEqual(result.mismatches, []);
  assert.deepEqual(result.evidenceWarnings, []);
});

test('ConsistencyEvaluatorV2 classifies leader disagreement as inconsistent',
  async () => {
    const evaluator = new ConsistencyEvaluatorV2();

    const result = evaluator.evaluate({
      reachableNodeIds: ['node-1', 'node-2'],
      snapshots: [
        createSnapshot('node-1', {
          leaders: {
            'partition-1': 'leader-a',
          },
        }),
        createSnapshot('node-2', {
          leaders: {
            'partition-1': 'leader-b',
          },
        }),
      ],
    });

    assert.equal(result.verdict, 'inconsistent');
    assert.equal(result.hardFailure, true);
    assert.ok(result.mismatches.length > 0, 'should include mismatch payloads');

    const leaderMismatch = result.mismatches.find((entry) =>
      entry.kind === 'leader_mismatch',
    );
    assert.ok(leaderMismatch, 'should include leader mismatch payload');
    assert.equal(leaderMismatch.partitionId, 'partition-1');
    assert.deepEqual(leaderMismatch.byNode, {
      'node-1': 'leader-a',
      'node-2': 'leader-b',
    });
  });

test('ConsistencyEvaluatorV2 reports replica-role inconsistency separately ' +
  'from canonical leader mismatch', async () => {
  const evaluator = new ConsistencyEvaluatorV2();

  const result = evaluator.evaluate({
    reachableNodeIds: ['node-1', 'node-2'],
    snapshots: [
      createSnapshot('node-1'),
      createSnapshot('node-2', {
        replicaRoleDiagnostics: {
          'partition-1': {
            canonicalLeaderNodeId: 'leader-a',
            source: 'partitions',
            inconsistentReplicaRoles: true,
            replicaLeaderNodeIds: ['leader-a', 'leader-b'],
          },
        },
      }),
    ],
  });

  assert.equal(result.verdict, 'inconsistent');
  assert.equal(result.hardFailure, true);

  const leaderMismatch = result.mismatches.find((entry) =>
    entry.kind === 'leader_mismatch',
  );
  assert.equal(leaderMismatch, undefined, 'canonical leaders should still agree');

  const replicaRoleMismatch = result.mismatches.find((entry) =>
    entry.kind === 'replica_role_inconsistency',
  );
  assert.ok(replicaRoleMismatch, 'should report replica-role inconsistency separately');
  assert.equal(replicaRoleMismatch.partitionId, 'partition-1');
  assert.deepEqual(replicaRoleMismatch.byNode, {
    'node-1': {
      canonicalLeaderNodeId: 'leader-a',
      inconsistentReplicaRoles: false,
      replicaLeaderNodeIds: ['leader-a'],
      source: 'partitions',
    },
    'node-2': {
      canonicalLeaderNodeId: 'leader-a',
      inconsistentReplicaRoles: true,
      replicaLeaderNodeIds: ['leader-a', 'leader-b'],
      source: 'partitions',
    },
  });
});

test('ConsistencyEvaluatorV2 classifies sparse snapshot coverage as insufficient_evidence',
  async () => {
    const evaluator = new ConsistencyEvaluatorV2();

    const result = evaluator.evaluate({
      reachableNodeIds: ['node-1', 'node-2', 'node-3'],
      snapshots: [
        createSnapshot('node-1'),
      ],
    });

    assert.equal(result.verdict, 'insufficient_evidence');
    assert.equal(result.hardFailure, false);
    assert.equal(result.coverage.reachableNodes, 3);
    assert.equal(result.coverage.snapshotNodes, 1);
    assert.ok(
      result.evidenceWarnings.length > 0,
      'insufficient evidence should include warnings',
    );
    assert.deepEqual(result.mismatches, []);
  });

test('ConsistencyEvaluatorV2 classifies missing leader on one ' +
  'node as leader mismatch (CDC propagation gap)', async () => {
  const evaluator = new ConsistencyEvaluatorV2();

  const result = evaluator.evaluate({
    reachableNodeIds: ['node-1', 'node-2'],
    snapshots: [
      createSnapshot('node-1', {
        partitions: ['partition-1', 'partition-2'],
        leaders: {
          'partition-1': 'leader-a',
          'partition-2': 'leader-a',
        },
      }),
      createSnapshot('node-2', {
        partitions: ['partition-1', 'partition-2'],
        leaders: {
          'partition-1': 'leader-a',
        },
      }),
    ],
  });

  assert.equal(result.verdict, 'inconsistent');
  assert.equal(result.hardFailure, true);

  const leaderMismatch = result.mismatches.find((entry) =>
    entry.kind === 'leader_mismatch',
  );
  assert.ok(
    leaderMismatch,
    'should detect missing leader as leader mismatch',
  );
  assert.equal(leaderMismatch.partitionId, 'partition-2');
  assert.deepEqual(leaderMismatch.byNode, {
    'node-1': 'leader-a',
    'node-2': '',
  });
});

test('runFinalAdjudication performs drain, queries mock nodes and evaluates consistency', async () => {
  const mockNode1 = {
    id: 'node-1',
    getReachabilityDiagnostics: async () => {
      return { nodeId: 'node-1', reachable: true, adminReady: true, reachableBy: 'socket', lastError: null };
    },
    getControlSnapshot: async () => {
      return {
        rows: [{
          nodeId: 'node-1',
          nodes: ['node-1', 'node-2'],
          partitions: ['partition-1'],
          leaders: {
            'partition-1': 'node-1',
          },
          replicaOperations: {
            inFlightCount: 0,
            statusHistogram: {},
          },
          controlPlaneDiagnostics: {
            replicaRoleDiagnostics: {
              'partition-1': {
                canonicalLeaderNodeId: 'node-1',
                source: 'partitions',
                inconsistentReplicaRoles: false,
                replicaLeaderNodeIds: ['node-1'],
              }
            }
          }
        }]
      };
    }
  };

  const mockNode2 = {
    id: 'node-2',
    getReachabilityDiagnostics: async () => {
      return { nodeId: 'node-2', reachable: true, adminReady: true, reachableBy: 'socket', lastError: null };
    },
    getControlSnapshot: async () => {
      return {
        rows: [{
          nodeId: 'node-2',
          nodes: ['node-1', 'node-2'],
          partitions: ['partition-1'],
          leaders: {
            'partition-1': 'node-1',
          },
          replicaOperations: {
            inFlightCount: 0,
            statusHistogram: {},
          },
          controlPlaneDiagnostics: {
            replicaRoleDiagnostics: {
              'partition-1': {
                canonicalLeaderNodeId: 'node-1',
                source: 'partitions',
                inconsistentReplicaRoles: false,
                replicaLeaderNodeIds: ['node-1'],
              }
            }
          }
        }]
      };
    }
  };

  const result = await runFinalAdjudication([mockNode1, mockNode2]);
  assert.equal(result.verdict, 'consistent');
  assert.equal(result.hardFailure, false);
});

