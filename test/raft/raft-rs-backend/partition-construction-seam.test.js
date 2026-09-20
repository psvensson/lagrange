// Receipt: backend-seam-selects-explicitly-and-liferaft-behaviour-is-unchanged
//   (the partition half - phase 4, addendum §1)
//
// Phase 3's finding was that selecting a backend does not change the node a
// partition runs on, because the partition service constructed
// `class RaftNode extends LifeRaft` itself. This file is the acceptance test
// for the seam that closes it: the partition service asks its provider for the
// node, the provider receives the named requirements of a partition group and
// nothing else, and with the default backend the node it gets back is
// observably the node it built before.
//
// Every expected value comes from the service's own state or from liferaft
// itself; nothing here is a literal the production path could be changed to
// agree with.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  PartitionService,
} from '../../../src/partition/partition-service.js';
import LifeRaft from '../../../src/raft/liferaft.js';
import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';
import {createRaftProvider} from '../../../src/raft/raft-backend-selection.js';
import {
  RAFT_BACKEND,
  RAFT_BACKEND_OPTION,
} from '../../../src/raft/raft-backend-constants.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
  RAFT_PROVIDER_CONTRACT_METHOD,
} from '../../../src/raft/raft-provider-contract-constants.js';

const PARTITION_ID = 'seam-partition';
const TABLE_ID = 'seam-table';
const TABLE_NAME = 'seam_table';
const REPLICA_ID = 'replica-seam-1';
const NODE_ID = 'node-seam-1';
const MEMORY_DB = ':memory:';

// A provider that is the real liferaft provider in every respect, and also
// records what the partition service asked it for. It is not a double: every
// call is delegated, so what the service gets back is what liferaft built.
class RecordingLiferaftProvider extends LiferaftProvider {
  /** Record the requests this provider was given. */
  constructor(...args) {
    super(...args);
    this.partitionNodeRequests = [];
    this.partitionNodes = [];
  }

  /**
   * @param {Object} request - The partition group's requirements.
   * @return {Object} Whatever liferaft's provider builds.
   */
  createPartitionNode(request) {
    this.partitionNodeRequests.push(request);
    const node = super.createPartitionNode(request);
    this.partitionNodes.push(node);
    return node;
  }
}

function buildPartition(raftProvider) {
  return new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE_ID,
    tableName: TABLE_NAME,
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: NODE_ID,
    dbPath: MEMORY_DB,
    deferElection: true,
    raftProvider,
  });
}

test('the partition service asks its provider for the node it runs on',
  async () => {
    const provider = new RecordingLiferaftProvider();
    const service = buildPartition(provider);
    try {
      await service.initialize();
      assert.equal(provider.partitionNodeRequests.length, 1,
        'exactly one partition node is built, and the provider builds it');
      // Identity, not shape: the node the service runs on IS the object the
      // provider returned, so nothing constructed a second node beside it.
      assert.equal(service.raft, provider.partitionNodes[0],
        'the service runs on the node its provider returned');
    } finally {
      await service.shutdown();
    }
  });

test('the request carries the partition group\'s own requirements and no ' +
  'hidden global',
async () => {
  const provider = new RecordingLiferaftProvider();
  const service = buildPartition(provider);
  try {
    await service.initialize();
    const [request] = provider.partitionNodeRequests;
    // The field names are the contract owner's, so a request that grew a
    // field nobody declared, or lost one, fails here.
    assert.deepEqual(
      Object.keys(request).sort(),
      Object.values(RAFT_PARTITION_NODE_REQUEST).sort(),
      'the request is exactly the declared backend-neutral requirement set');
    // Every value is the service's own state, read off the service.
    assert.equal(request[RAFT_PARTITION_NODE_REQUEST.GROUP_ID],
      service.partitionId);
    assert.equal(request[RAFT_PARTITION_NODE_REQUEST.PEER_ID],
      service.replicaId);
    assert.equal(request[RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS],
      service.unifiedAddress);
    assert.deepEqual(request[RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS],
      service.replicaIds);
    assert.equal(request[RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG],
      service.logAdapter);
    assert.deepEqual(request[RAFT_PARTITION_NODE_REQUEST.TIMING],
      service.raftTimingConfig);
    assert.equal(request[RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION],
      service.deferElection);
    for (const hook of [
      RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER,
      RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS,
      RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY,
      RAFT_PARTITION_NODE_REQUEST.SNAPSHOT_CATCHUP_NEEDED,
    ]) {
      assert.equal(typeof request[hook], 'function',
        `${hook} is a capability the group needs, handed over explicitly`);
    }
  } finally {
    await service.shutdown();
  }
});

test('with the default backend the node is the liferaft node it was before',
  async () => {
    const provider = new RecordingLiferaftProvider();
    const service = buildPartition(provider);
    try {
      await service.initialize();
      const node = service.raft;
      // liferaft itself is the oracle for what a liferaft node is.
      assert.ok(node instanceof LifeRaft,
        'the default backend still runs a liferaft node');
      assert.equal(node.address, service.unifiedAddress);
      // The state vocabulary is liferaft's own, and the service's leadership
      // view agrees with the node's - the seam did not interpose a state.
      assert.ok([LifeRaft.LEADER, LifeRaft.CANDIDATE, LifeRaft.FOLLOWER,
        LifeRaft.CHILD, LifeRaft.STOPPED].includes(node.state),
      `the node reports a liferaft state; it reported ${node.state}`);
      assert.equal(service.isLeader, node.state === LifeRaft.LEADER);
      // The durable log the node reads is the service's own adapter, not a
      // copy: liferaft resolves the LOG option once at construction.
      assert.equal(node.log, service.logAdapter);
      // The timers liferaft is holding are the ones the service computed.
      assert.equal(node.beat, service.raftTimingConfig.heartbeatMs);
      assert.equal(node.election.min, service.raftTimingConfig.electionMinMs);
      assert.equal(node.election.max, service.raftTimingConfig.electionMaxMs);
    } finally {
      await service.shutdown();
    }
  });

test('the experimental backend refuses partition construction by name rather ' +
  'than building a liferaft node',
async () => {
  const provider = createRaftProvider({
    [RAFT_BACKEND_OPTION]: RAFT_BACKEND.RAFT_RS_WASM,
  });
  assert.equal(
    typeof provider[RAFT_PROVIDER_CONTRACT_METHOD.CREATE_PARTITION_NODE],
    'function',
    'the name is present on both backends, so a caller never takes a ' +
    'quieter path because a method was missing');
  let refusal = null;
  try {
    provider.createPartitionNode({});
    assert.fail('the experimental backend must not build a partition node yet');
  } catch (error) {
    refusal = error;
  }
  assert.ok(
    refusal.message.includes(
      RAFT_PROVIDER_CONTRACT_METHOD.CREATE_PARTITION_NODE),
    `the refusal names what was refused; it said ${refusal.message}`);
});
