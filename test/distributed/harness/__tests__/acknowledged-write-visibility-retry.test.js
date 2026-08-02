import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAcknowledgedWritesVisibleOnReachableNodes,
} from '../../scenarios/rolling-restart.js';

const arrayMap = Function.call.bind(Array.prototype.map);

// Falsifier for the rolling-restart final acknowledged-write visibility probe.
//
// Gate stat-gate-20260618T165824Z run3 failed (the only non-passing run of an
// otherwise 3/3-CONVERGED, 0-breach gate) because the step-9 visibility probe's
// `node.query` THREW a transient "Distributed operation failed due to participant
// failures" while the post-restart rebalance tail was still moving replicas. The
// probe already polls for a 30s deadline to tolerate transient non-visibility, but
// the query call itself was un-retried — a single thrown query killed the whole
// run on poll #1.
//
// The fix retries a THROWN query within that existing deadline. These tests pin:
//  (1) a transient throw that clears is tolerated (RED on revert — un-wrapped query
//      throws immediately);
//  (2) a write that is genuinely invisible STILL fails (integrity preserved — no
//      masking of a real stale read);
//  (3) a participant unqueryable for the WHOLE window STILL fails (availability
//      signal preserved, with a distinct "could not complete" message).

const ACK_IDS = ['w1', 'w2'];
const ACK = {
  ids: ACK_IDS,
  tableName: 'logs',
  idColumn: 'log_id',
  receipts: arrayMap(ACK_IDS, (id, index) => {
    const operationId = `operation-${id}`;
    const idempotencyKey = `idempotency-${id}`;
    const durableCommitWitness = {
      partitionId: 'logs-p1',
      leaderNodeId: 'writer-node',
      leaderReplicaId: 'logs-p1-writer-node',
      term: 1,
      logIndex: index + 1,
      entryId: `entry-${id}`,
      operationId,
      idempotencyKey,
    };
    return {
      id,
      operationId,
      idempotencyKey,
      successfulParticipantCount: 1,
      witnessedParticipantCount: 1,
      commitWitnessComplete: true,
      missingCommitWitnessPartitions: [],
      durableCommitWitnesses: [durableCommitWitness],
      participantReceipts: [{
        partitionId: 'logs-p1',
        acceptingNodeId: 'writer-node',
        acknowledgedAtMs: 1,
        durableCommitWitness,
        complete: true,
      }],
    };
  }),
};
const FAST = {visibilityTimeoutMs: 800, visibilityPollIntervalMs: 5};

function okResult(ids, nodeId) {
  return {
    rows: arrayMap(ids, (id) => ({ack_id: id})),
    readAuthorityWitnesses: [{
      state: 'observed',
      partitionId: 'logs-p1',
      servingNodeId: nodeId,
      servingReplicaId: `logs-p1-${nodeId}`,
      term: 1,
      role: 'follower',
      observedAtMs: Date.now(),
    }],
  };
}

describe('acknowledged-write visibility probe — thrown-query retry', () => {
  it('tolerates a TRANSIENT participant-failure throw that clears within the ' +
    'deadline (RED on revert: the un-wrapped query throws on poll #1)', async () => {
    let calls = 0;
    const node = {
      id: 'node-A',
      isReachable: async () => true,
      query: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error(
            'Distributed operation failed due to participant failures',
          );
        }
        return okResult(ACK.ids, 'node-A');
      },
    };
    // Must not throw — the transient first failure is retried and then succeeds.
    await assertAcknowledgedWritesVisibleOnReachableNodes(ACK, [node], FAST);
    assert.ok(calls >= 2, 'the thrown query was retried within the deadline');
  });

  it('STILL fails when an acknowledged write is genuinely invisible ' +
    '(integrity preserved — a clean read with a missing id is not masked)', async () => {
    const node = {
      id: 'node-B',
      isReachable: async () => true,
      query: async () => okResult(['w1'], 'node-B'), // w2 genuinely missing
    };
    await assert.rejects(
      () => assertAcknowledgedWritesVisibleOnReachableNodes(ACK, [node], FAST),
      /Acknowledged writes missing after rolling restart on node node-B/,
      'a genuinely-missing acknowledged write must still fail the probe',
    );
  });

  it('STILL fails when a participant is unqueryable for the WHOLE window ' +
    '(availability signal preserved, distinct message)', async () => {
    const node = {
      id: 'node-C',
      isReachable: async () => true,
      query: async () => {
        throw new Error(
          'Distributed operation failed due to participant failures',
        );
      },
    };
    await assert.rejects(
      () => assertAcknowledgedWritesVisibleOnReachableNodes(ACK, [node], FAST),
      /Could not complete acknowledged-write visibility query on node node-C/,
      'a participant down for the whole deadline must still fail (not masked)',
    );
  });
});
