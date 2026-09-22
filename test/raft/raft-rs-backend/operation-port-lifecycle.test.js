import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_PARTITION_NODE_REQUEST} from
  '../../../src/raft/raft-provider-contract-constants.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {createRuntimeDispatcher} from
  '../../../src/raft/raft-rs-runtime-owner.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const ACTIVE_OPERATIONS = Object.freeze([
  'tick', 'step', 'propose', 'proposeConfChange', 'campaign', 'readStatus',
  'configureTick', 'startScheduling',
]);

test('the core-entry instrument counts every binding call and catches an ungated mutant',
  () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'operation-counter-red',
      replicaIds: ['counter-replica'],
    });
    try {
      const before = cluster.coreEntryCount();
      cluster.tick('counter-replica');
      assert.ok(cluster.coreEntryCount() > before,
        'a semantic operation increments the owner-side actual-entry observer');
      assert.equal(
        typeof cluster.node('counter-replica').raftRsGroupParts,
        'undefined',
        'the public value offers no ungated core path; the AST mutant covers it');
    } finally {
      cluster.dispose();
    }
  });

test('step is local admission and retirement prevents queued core entry',
  async () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'queued-step-lifecycle-recheck',
      replicaIds: ['queued-replica'],
    });
    try {
      const port = cluster.node('queued-replica');
      const status = await port.readStatus();
      const beforeAdmission = cluster.coreEntryCount();
      const accepted = await port.step({
        groupId: cluster.partitionId,
        to: status.peerId,
        message: {
          from: status.peerId,
          to: status.peerId,
          msgType: 0,
          term: '0',
          logTerm: '0',
          index: '0',
          commit: '0',
        },
      });
      assert.equal(accepted.outcome, 'CORE_OK');
      assert.equal(accepted.reason, 'inbound-enqueued');
      assert.equal(cluster.coreEntryCount(), beforeAdmission,
        'transport admission acknowledges without entering the core');

      await cluster.retireReplica('queued-replica', 'retire-after-admission');
      const refused = await port.tick();
      assert.equal(refused.outcome, 'CORE_REFUSED');
      assert.equal(refused.reason, 'retired');
      assert.equal(cluster.coreEntryCount(), beforeAdmission,
        'the worker lifecycle recheck prevents queued delivery after retirement');
    } finally {
      cluster.dispose();
    }
  });

test('malformed ingress is refused locally without core entry', async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'malformed-ingress-local-refusal',
    replicaIds: ['ingress-replica'],
  });
  try {
    const before = cluster.coreEntryCount();
    const refused = await cluster.node('ingress-replica').step({
      groupId: 'wrong-group',
      to: 'not-a-decimal-peer',
      message: {},
    });
    assert.equal(refused.outcome, 'CORE_REFUSED');
    assert.equal(refused.phase, 'admission');
    assert.equal(cluster.coreEntryCount(), before);
  } finally {
    cluster.dispose();
  }
});

test('durable retirement refuses every active operation before core entry after restart',
  async () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'operation-retirement-red',
      replicaIds: ['retired-replica'],
    });
    try {
      const active = cluster.node('retired-replica');
      await active.campaign();
      const activeStatus = await active.readStatus();
      assert.equal(activeStatus.confState.voters.includes(
        activeStatus.peerId), true,
      'the durable ConfState deliberately still contains self');
      await cluster.retireReplica(
        'retired-replica', 'test-terminal-retirement');
      const port = cluster.restart('retired-replica').node;
      const missing = ACTIVE_OPERATIONS.filter((name) =>
        typeof port[name] !== 'function');
      assert.deepEqual(missing, [],
        'retirement is exercised through the complete semantic port');
      const before = cluster.coreEntryCount();
      const calls = [
        port.tick(),
        port.step({}),
        port.propose(new Uint8Array()),
        port.proposeConfChange({}),
        port.campaign(),
        port.readStatus(),
        port.configureTick(10),
        port.startScheduling(),
      ];
      const results = await Promise.all(calls);
      assert.equal(results.every((result) =>
        result?.outcome === 'CORE_REFUSED' &&
        result?.reason === 'retired'), true);
      assert.equal(cluster.coreEntryCount(), before,
        'terminal lifecycle refusal occurs before every actual core entry');
      assert.equal([...cluster.replicas.values()].reduce(
        (total, replica) => total + replica.inbox.length, 0), 0,
      'retired operations emit no messages');
      const termAfterRefusals = String(cluster.replica('retired-replica').db
        .prepare('SELECT term FROM _raft_rs_hard_state WHERE group_id = ?')
        .pluck().get(cluster.partitionId));
      assert.equal(termAfterRefusals, String(activeStatus.term),
        'retired direct calls cannot disturb the durable term');
      const unsubscribe = port.subscribe('term-change', () => {
        assert.fail('a retired port cannot emit an active event');
      });
      assert.equal(Object.isFrozen(unsubscribe), true);
      await port.stopScheduling();
      await port.close();
      assert.equal(cluster.coreEntryCount(), before,
        'passive subscription and cleanup never enter a retired core');
      assert.equal(typeof port.raftRsGroupParts, 'undefined',
        'restart cannot expose a core bypass around terminal retirement');

      const replica = cluster.replica('retired-replica');
      const request = replica.request;
      const registry = new RaftRsPeerIdentityRegistry(replica.db);
      const mutant = createRuntimeDispatcher({
        database: replica.db,
        groupId: cluster.partitionId,
        replicaIdentity: replica.replicaId,
        peerId: registry.raftPeerIdOf(replica.replicaId),
        voters: [registry.raftPeerIdOf(replica.replicaId)],
        timing: request[RAFT_PARTITION_NODE_REQUEST.TIMING],
        sendToPeer: request[RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER],
        resolvePeerAddress: () => cluster.addressOf(replica.replicaId),
        resolvePeerIdentity: () => replica.replicaId,
        applyCommittedEntry:
          request[RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY],
        applyTransactionRolledBack: request[
          RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK],
        emit: () => undefined,
      });
      const mutantBefore = cluster.coreEntryCount();
      const bypassed = await mutant.execute({type: 'campaign'});
      assert.equal(bypassed.outcome, 'CORE_OK');
      assert.ok(cluster.coreEntryCount() > mutantBefore,
        'deliberately bypassing the lifecycle owner restores core entry');
      const disturbed = await mutant.execute({type: 'read-status'});
      assert.ok(disturbed.term > activeStatus.term,
        'the bypass restores the retired replica\'s disruptive term change');
      mutant.close({enterCore: true});
    } finally {
      cluster.dispose();
    }
  });

test('a durable Raft record without a matching lifecycle record fails closed',
  async () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'missing-lifecycle-record',
      replicaIds: ['missing-lifecycle-replica'],
    });
    try {
      const replica = cluster.replica('missing-lifecycle-replica');
      await replica.node.close();
      replica.db.prepare(
        'DELETE FROM _raft_rs_replica_lifecycle WHERE group_id = ?',
      ).run(cluster.partitionId);
      const before = cluster.coreEntryCount();
      const restarted = cluster.restart('missing-lifecycle-replica').node;
      const refused = await restarted.tick();
      assert.equal(refused.outcome, 'CORE_REFUSED');
      assert.equal(refused.reason, 'lifecycle-record-missing');
      assert.equal(cluster.coreEntryCount(), before,
        'missing lifecycle authority refuses before reconstructing a RawNode');
    } finally {
      cluster.dispose();
    }
  });
