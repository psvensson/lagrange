/**
 * Quest formation-ledger-self-move-blocks-cluster-ops (mode B): the
 * concentration predicate must classify only REPLACE-curable placement skew.
 *
 * The majority formula (voters outside the hottest node cannot form a
 * majority) is unsatisfiable for ANY placement of <=2 voters, and
 * spreadActionable was true whenever a free ready node existed — so a
 * 1-2-voter ledger view classified as permanently concentrated: the hold
 * deferred all dependent admission and the planner re-minted count-neutral
 * cure REPLACEs that cannot reduce a max-1-per-node "concentration" (live:
 * seven successive ledger REPLACEs over 15 minutes against a 2-voter view,
 * demo run 2026-07-13T06:52; the 07-12 docker probe deferral storms at
 * totalVoters=1-2 warn payloads). Too few voters is under-replication — the
 * ADD/promotion machinery's concern.
 *
 * RED-ON-REVERT: the max<=1 cases below classify concentrated on the
 * unfixed evaluator. The run-22 protection case (>=2 voters on one node)
 * must keep classifying concentrated + actionable.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  evaluateOperationLedgerQuorumConcentration,
} from '../../src/rebalancer/operation-ledger-quorum-concentration.js';
import {TABLES} from '../../src/constants/index.js';

const LEDGER_PARTITION_ID = 'replica_operations-p1';

function buildVoterRow(replicaId, nodeId) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: LEDGER_PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: 'follower',
  };
}

function buildReadyNodeRow(nodeId) {
  return {node_id: nodeId, connection_state: 'ready'};
}

function buildCache({voterNodeIds, readyNodeIds, targetReplicaCount = 3}) {
  const serviceRows = voterNodeIds.map((nodeId, index) =>
    buildVoterRow(`${LEDGER_PARTITION_ID}-r${index + 1}`, nodeId),
  );
  const nodeRows = readyNodeIds.map(buildReadyNodeRow);
  return {
    filter(tableName, predicate) {
      const rows =
        tableName === TABLES.SERVICES ? serviceRows :
          tableName === TABLES.NODES ? nodeRows :
            [];
      return rows.filter(predicate);
    },
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === LEDGER_PARTITION_ID) {
        return {replica_count: targetReplicaCount};
      }
      return null;
    },
  };
}

test(
  'a 2-voter ledger spread 1-per-node is NOT concentrated even with free ' +
    'ready nodes (REPLACE is impotent; under-replication owns the cure)',
  (t) => {
    const evaluation = evaluateOperationLedgerQuorumConcentration(
      buildCache({
        voterNodeIds: ['node-0', 'node-1'],
        readyNodeIds: ['node-0', 'node-1', 'node-2', 'node-3', 'node-4'],
      }),
    );
    t.equal(evaluation.holdEngaged, false, 'the hold does not engage');
    t.strictSame(
      [...evaluation.concentratedPartitions],
      [],
      'no concentrated entry is produced for a max-1-per-node placement',
    );
    t.end();
  },
);

test('a single-voter ledger is NOT concentrated', (t) => {
  const evaluation = evaluateOperationLedgerQuorumConcentration(
    buildCache({
      voterNodeIds: ['node-0'],
      readyNodeIds: ['node-0', 'node-1', 'node-2'],
    }),
  );
  t.equal(evaluation.holdEngaged, false, 'the hold does not engage');
  t.strictSame([...evaluation.concentratedPartitions], [], 'no entry');
  t.end();
});

test(
  'run-22 protection preserved: 2 of 3 voters on one node is concentrated ' +
    'and spread-actionable',
  (t) => {
    const evaluation = evaluateOperationLedgerQuorumConcentration(
      buildCache({
        voterNodeIds: ['node-0', 'node-0', 'node-1'],
        readyNodeIds: ['node-0', 'node-1', 'node-2', 'node-3'],
      }),
    );
    t.equal(evaluation.holdEngaged, true, 'the hold engages');
    t.equal(evaluation.concentratedPartitions.length, 1, 'one entry');
    const entry = evaluation.concentratedPartitions[0];
    t.equal(entry.maxVotersOnOneNode, 2, 'skew measured');
    t.equal(entry.hottestNodeId, 'node-0', 'hottest node named');
    t.strictSame(
      [...entry.distinctVoterNodeIds],
      ['node-0', 'node-1'],
      'the owner publishes the distinct voter placement with its decision',
    );
    t.equal(entry.spreadActionable, true, 'REPLACE cure is actionable');
    t.end();
  },
);

test('a fully spread 3-voter ledger is NOT concentrated', (t) => {
  const evaluation = evaluateOperationLedgerQuorumConcentration(
    buildCache({
      voterNodeIds: ['node-0', 'node-1', 'node-2'],
      readyNodeIds: ['node-0', 'node-1', 'node-2', 'node-3', 'node-4'],
    }),
  );
  t.equal(evaluation.holdEngaged, false, 'the hold does not engage');
  t.strictSame([...evaluation.concentratedPartitions], [], 'no entry');
  t.end();
});

test(
  'a 4-voter 2+2 split stays concentrated (skew exists on two nodes; a ' +
    'REPLACE off either hot node reduces it)',
  (t) => {
    const evaluation = evaluateOperationLedgerQuorumConcentration(
      buildCache({
        voterNodeIds: ['node-0', 'node-0', 'node-1', 'node-1'],
        readyNodeIds: ['node-0', 'node-1', 'node-2', 'node-3', 'node-4'],
        targetReplicaCount: 3,
      }),
    );
    t.equal(evaluation.holdEngaged, true, 'the hold engages');
    t.equal(
      evaluation.concentratedPartitions[0]?.maxVotersOnOneNode,
      2,
      'skew measured on the hottest node',
    );
    t.end();
  },
);
