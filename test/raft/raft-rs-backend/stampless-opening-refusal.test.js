// V1a (verification O1 round 1, verify-o1-seed-genesis rebuilt): a replica
// is opened from a stamp or from the durable-record bootstrap, never from an
// absent stamp. At ab7669fd0 the port read an absent stamp as a GENESIS of
// its bootstrap peer ids: a founder rebuilt with no stamp and no record (the
// seed phase's request after a lost data directory) opened a SECOND group
// under the same partition id with its gate open at index 0, while the
// joiner still held the committed one. Now the port refuses it typed
// (STAMP_INVALID, defect MISSING), and a partition service built without a
// bootstrap membership cannot initialize.
//
// Oracles: the joiner's durable log fold (the committed group) and the
// port's typed refusal; the stamp the joiner is built from is folded from
// the founder's durable log, never answered by the implementation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  durableAppliedState,
  foldAt,
  logFold,
  reservedIdentities,
} from './committed-membership-oracles.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {PARTITION_CONSENSUS_STARTUP_OUTCOME} from
  '../../../src/partition/partition-service-constants.js';
import {
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';

const PARTITION_ID = 'v1a-seed';
const FOUNDER = 'v1a-seed-a';
const JOINER = 'v1a-seed-b';
const ROUNDS = 400;
const MISSING_STAMP = Object.freeze({
  outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
  reason: COMMITTED_MEMBERSHIP_REFUSAL.STAMP_INVALID,
  defect: COMMITTED_MEMBERSHIP_STAMP_DEFECT.MISSING,
  retryable: false,
});

function leads(cluster, replicaId) {
  return cluster.leaderReplicaId() === replicaId;
}

// The COMMITTED stamp a correct leader answers, folded from its durable log.
function oracleStamp(cluster, leader, genesisPeerIds) {
  const dbFile = cluster.replica(leader).dbFile;
  const applied = durableAppliedState(dbFile, PARTITION_ID);
  const voters = foldAt(logFold(dbFile, PARTITION_ID, genesisPeerIds),
    applied.appliedIndex).voters;
  const reserved = reservedIdentities(dbFile);
  return {
    kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
    voters,
    votersOutgoing: [],
    learners: [],
    appliedIndex: applied.appliedIndex,
    commitIndex: applied.appliedIndex,
    term: 1,
    leaderId: leader,
    gateOpen: true,
    identities: Object.fromEntries(voters.map((peerId) =>
      [peerId, reserved.get(peerId)])),
  };
}

function consensusOf(error) {
  const {outcome, reason, defect, retryable} = error?.consensus ?? {};
  return {outcome, reason, defect, retryable};
}

test('V1a: a founder rebuilt with no stamp and no record is refused typed, ' +
  'not founded again beside the committed group', () => {
  const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [FOUNDER]});
  try {
    cluster.tickers = [FOUNDER];
    assert.ok(cluster.settle(() => leads(cluster, FOUNDER) &&
      durableAppliedState(cluster.replica(FOUNDER).dbFile, PARTITION_ID)
        .appliedIndex > 0, {rounds: ROUNDS}), 'setup: the founder leads');
    const genesis = [String(cluster.raftPeerIdOf(FOUNDER))];
    cluster.addReplica(JOINER, [FOUNDER, JOINER],
      {[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]:
        oracleStamp(cluster, FOUNDER, genesis)});
    const joinerPeerId = String(cluster.raftPeerIdOf(JOINER));
    const joinerHoldsBoth = () => {
      const applied = durableAppliedState(cluster.replica(JOINER).dbFile,
        PARTITION_ID);
      return applied?.voters.length === 2 &&
        cluster.node(JOINER).readStatus().gateOpen === true;
    };
    for (let attempt = 0; attempt < 10 && !joinerHoldsBoth(); attempt += 1) {
      cluster.node(FOUNDER).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaIdentity: JOINER});
      cluster.settle(joinerHoldsBoth, {rounds: 40});
    }
    assert.ok(joinerHoldsBoth(),
      'setup: the joiner holds the committed configuration {a, b}, open');
    const committedVoters = durableAppliedState(
      cluster.replica(JOINER).dbFile, PARTITION_ID).voters;

    // The founder loses its data directory and is rebuilt the way the seed
    // phase built it at ab7669fd0: no stamp, its founding list as hints.
    const replica = cluster.replica(FOUNDER);
    replica.node.close();
    replica.db.close();
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      fs.rmSync(replica.dbFile + suffix, {force: true});
    }
    cluster.isolate(JOINER);
    let opened = null;
    let refusal = null;
    try {
      opened = cluster.buildReplica(FOUNDER, [FOUNDER],
        {[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: undefined});
    } catch (error) {
      refusal = error;
    }
    const rebuilt = cluster.replica(FOUNDER);
    if (rebuilt.node === null) {
      rebuilt.db.close();
      cluster.replicas.delete(FOUNDER);
    }
    assert.equal(opened, null, 'V1a: the stamp-less founder does not open ' +
      `(it opened with ${JSON.stringify(opened?.node?.readStatus?.())})`);
    assert.deepEqual(consensusOf(refusal), MISSING_STAMP,
      'V1a: refused typed - STAMP_INVALID, defect MISSING, non-retryable');
    assert.deepEqual(durableAppliedState(cluster.replica(JOINER).dbFile,
      PARTITION_ID).voters, committedVoters,
    'the committed group the joiner holds is untouched');
    assert.ok(committedVoters.includes(joinerPeerId));
  } finally {
    cluster.dispose();
  }
});

test('V1a: a partition service built without a bootstrap membership cannot ' +
  'initialize - a third origin fails visibly', async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'v1a-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
  const service = new PartitionService({
    partitionId: 'v1a-third-origin',
    tableId: 'v1a-table',
    tableName: 'v1a-table',
    replicaId: 'v1a-third-origin-r1',
    replicaIds: ['v1a-third-origin-r1'],
    nodeId: 'v1a-node',
    dbPath: ':memory:',
  });
  try {
    await assert.rejects(service.initialize(), (error) => {
      assert.equal(error.code,
        PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED);
      assert.deepEqual(consensusOf(error), MISSING_STAMP);
      return true;
    });
  } finally {
    await service.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
