import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {ConsistencyEvaluatorV2} from '../consistency-evaluator.js';

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
