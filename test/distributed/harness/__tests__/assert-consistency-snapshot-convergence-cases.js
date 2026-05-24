import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  assertConsistencyFromSnapshots,
  waitForConsistencyConvergence,
} from '../assertions.js';
import {
  TEST_WS_ADDRESS,
  TEST_LEADER_ADDRESS,
  buildControlSnapshotNode,
} from './assert-consistency-fixtures.js';

test('assertConsistencyFromSnapshots throws on published active-node mismatch', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: ['node-1', 'node-3'],
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
      },
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Published active-node sets disagree/i,
  );
});

test('assertConsistencyFromSnapshots prefers published membership over effective node disagreement', async () => {
  const publishedNodes = ['node-1', 'node-2'];
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1'],
      publishedNodes,
      projectedNodes: ['node-1'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: publishedNodes,
        },
        activeNodeViews: {
          effectiveSource: 'published_membership',
          effectiveNodeIds: publishedNodes,
          projectedNodeIds: ['node-1'],
          publishedNodeIds: publishedNodes,
          publishedMembershipAvailable: true,
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      publishedNodes,
      projectedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: publishedNodes,
        },
        activeNodeViews: {
          effectiveSource: 'published_membership',
          effectiveNodeIds: publishedNodes,
          projectedNodeIds: ['node-1', 'node-2'],
          publishedNodeIds: publishedNodes,
          publishedMembershipAvailable: true,
        },
      },
    },
  ];

  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots(snapshots);
  });
});

test('assertConsistencyFromSnapshots passes with ' +
  'consistent evaluator snapshots', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2', 'node-3'],
      partitions: ['p1', 'p2'],
      leaders: {p1: TEST_LEADER_ADDRESS, p2: TEST_WS_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2', 'node-3'],
      partitions: ['p2', 'p1'],
      leaders: {p2: TEST_WS_ADDRESS, p1: TEST_LEADER_ADDRESS},
    },
  ];

  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots(snapshots);
  });
});

test('assertConsistencyFromSnapshots throws on partition ' +
  'set mismatch — uses evaluator snapshots as single ' +
  'consistency owner', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1', 'p2'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Partition assignments disagree/i,
  );
});

test('assertConsistencyFromSnapshots throws on leader ' +
  'identity mismatch', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_WS_ADDRESS},
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Leader identities disagree/i,
  );
});

test('assertConsistencyFromSnapshots is a no-op when ' +
  'fewer than 2 snapshots provided', async () => {
  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots([
      {
        nodeId: 'node-a',
        nodes: ['node-1'],
        partitions: ['p1'],
        leaders: {p1: TEST_LEADER_ADDRESS},
      },
    ]);
  });
  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots([]);
  });
});

test('waitForConsistencyConvergence resolves when nodes ' +
  'agree on first attempt', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b');

  await assert.doesNotReject(async () => {
    await waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 2000, pollIntervalMs: 50},
    );
  });
});

test('waitForConsistencyConvergence retries until nodes ' +
  'converge within timeout', async () => {
  let callCount = 0;
  const convergenceThreshold = 3;
  const divergentLeader = TEST_WS_ADDRESS;

  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      callCount += 1;
      const leader = callCount >= convergenceThreshold ?
        TEST_LEADER_ADDRESS :
        divergentLeader;
      return {
        rows: [{
          nodes: ['node-1', 'node-2', 'node-3'],
          partitions: ['p1'],
          leaders: {p1: leader},
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            },
          },
        }],
      };
    },
    async query() {
      throw new Error('should not be called');
    },
  };

  await assert.doesNotReject(async () => {
    await waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 5000, pollIntervalMs: 50},
    );
  });
  assert.ok(
    callCount >= convergenceThreshold,
    'Expected at least ' + convergenceThreshold +
    ' probes, got ' + callCount,
  );
});

test('waitForConsistencyConvergence throws last error ' +
  'when timeout expires', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b', {
    leaders: {p1: TEST_WS_ADDRESS},
  });

  await assert.rejects(
    waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 500, pollIntervalMs: 50},
    ),
    /Leader identities disagree/i,
  );
});

test('waitForConsistencyConvergence tolerates transient empty leader maps',
  async () => {
    const nodeA = buildControlSnapshotNode('node-a', {
      leaders: {p1: TEST_LEADER_ADDRESS},
    });
    const nodeB = buildControlSnapshotNode('node-b', {
      leaders: {},
    });

    await assert.doesNotReject(async () => {
      await waitForConsistencyConvergence(
        [nodeA, nodeB],
        {timeoutMs: 500, pollIntervalMs: 50},
      );
    });
  });
