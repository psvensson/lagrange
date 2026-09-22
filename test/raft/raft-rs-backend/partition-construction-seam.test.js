import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {PartitionService} from
  '../../../src/partition/partition-service.js';
import {
  RAFT_BACKEND,
  RAFT_BACKEND_OPTION,
} from '../../../src/raft/raft-backend-constants.js';
import {createRaftProvider} from
  '../../../src/raft/raft-backend-selection.js';
import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_METHODS} from
  '../../../src/raft/raft-operation-port.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
  RAFT_PROVIDER_CONTRACT_METHOD,
} from '../../../src/raft/raft-provider-contract-constants.js';

const PARTITION_ID = 'seam-partition';
const REPLICA_ID = 'replica-seam-1';
const TIMING = Object.freeze({
  heartbeatMs: 30000,
  electionMinMs: 30000,
  electionMaxMs: 60000,
});

function minimalPartitionRequest(overrides = {}) {
  return {
    [RAFT_PARTITION_NODE_REQUEST.GROUP_ID]: PARTITION_ID,
    [RAFT_PARTITION_NODE_REQUEST.PEER_ID]: REPLICA_ID,
    [RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS]: REPLICA_ID,
    [RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS]: [REPLICA_ID],
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG]: {end: () => undefined},
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE]: new Database(':memory:'),
    [RAFT_PARTITION_NODE_REQUEST.TIMING]: TIMING,
    [RAFT_PARTITION_NODE_REQUEST.SUBSTRATE]: {},
    [RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION]: true,
    [RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER]: () => Promise.resolve(),
    [RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS]: (value) => value,
    [RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK]: () =>
      undefined,
    [RAFT_PARTITION_NODE_REQUEST.INITIAL_TERM]: 0,
    ...overrides,
  };
}

class RecordingLiferaftProvider extends LiferaftProvider {
  constructor() {
    super();
    this.requests = [];
    this.ports = [];
  }

  createPartitionPort(request) {
    this.requests.push(request);
    const port = super.createPartitionPort(request);
    this.ports.push(port);
    return port;
  }
}

function buildPartition(provider) {
  return new PartitionService({
    partitionId: PARTITION_ID,
    tableId: 'seam-table',
    tableName: 'seam_table',
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: 'node-seam-1',
    dbPath: ':memory:',
    deferElection: true,
    raftProvider: provider,
  });
}

test('the partition service asks its provider for the port it runs on',
  async () => {
    const provider = new RecordingLiferaftProvider();
    const service = buildPartition(provider);
    try {
      await service.initialize();
      assert.equal(provider.requests.length, 1);
      assert.equal(service.raft, provider.ports[0]);
      assert.deepEqual(Reflect.ownKeys(service.raft).sort(),
        [...RAFT_OPERATION_PORT_METHODS].sort());
    } finally {
      await service.shutdown();
    }
  });

test('the request carries exactly the partition requirements', async () => {
  const provider = new RecordingLiferaftProvider();
  const service = buildPartition(provider);
  try {
    await service.initialize();
    const [request] = provider.requests;
    assert.deepEqual(Object.keys(request).sort(),
      Object.values(RAFT_PARTITION_NODE_REQUEST).sort());
    assert.equal(request.groupId, service.partitionId);
    assert.equal(request.peerId, service.replicaId);
    assert.equal(request.durableStorage, service.db);
    for (const hook of [
      'sendToPeer', 'resolvePeerAddress', 'applyCommittedEntry',
      'snapshotCatchupNeeded', 'applyTransactionRolledBack',
    ]) {
      assert.equal(typeof request[hook], 'function');
    }
  } finally {
    await service.shutdown();
  }
});

test('the default backend returns the same frozen semantic port contract',
  () => {
    const request = minimalPartitionRequest();
    const port = new LiferaftProvider().createPartitionPort(request);
    try {
      assert.equal(Object.getPrototypeOf(port), null);
      assert.equal(Object.isFrozen(port), true);
      assert.deepEqual(Reflect.ownKeys(port).sort(),
        [...RAFT_OPERATION_PORT_METHODS].sort());
      assert.equal(typeof port.readStatus().term, 'number');
    } finally {
      port.close();
      request.durableStorage.close();
    }
  });

test('the default liferaft port reports leadership as a semantic role', () => {
  const request = minimalPartitionRequest();
  const port = new LiferaftProvider().createPartitionPort(request);
  const observedRoles = [];
  const unsubscribe = port.subscribe(RAFT_ROLE.LEADER, () => {
    observedRoles.push(port.readStatus().role);
  });
  try {
    assert.equal(port.readStatus().role, RAFT_ROLE.FOLLOWER);
    const result = port.campaign();
    assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(port.readStatus().role, RAFT_ROLE.LEADER);
    assert.deepEqual(observedRoles, [RAFT_ROLE.LEADER]);
  } finally {
    unsubscribe();
    port.close();
    request.durableStorage.close();
  }
});

test('a single-replica partition observes liferaft leadership through the port',
  async () => {
    const provider = new RecordingLiferaftProvider();
    const service = buildPartition(provider);
    try {
      await service.initialize();
      assert.equal(service.isLeader, true);
      assert.equal(service.role, RAFT_ROLE.LEADER);
      assert.equal(service.raft.readStatus().role, RAFT_ROLE.LEADER);
    } finally {
      await service.shutdown();
    }
  });

test('the rollback fact crosses the request without exposing an event emitter',
  async () => {
    const provider = new RecordingLiferaftProvider();
    const service = buildPartition(provider);
    try {
      await service.initialize();
      const refreshed = [];
      const original = service.storage.refreshAppliedWatermarkCacheFromStore
        .bind(service.storage);
      service.storage.refreshAppliedWatermarkCacheFromStore = () => {
        refreshed.push(true);
        return original();
      };
      provider.requests[0].applyTransactionRolledBack();
      assert.deepEqual(refreshed, [true]);
      assert.equal(typeof service.raft.emit, 'undefined');
    } finally {
      await service.shutdown();
    }
  });

test('the experimental backend refuses missing named requirements', () => {
  const provider = createRaftProvider({
    [RAFT_BACKEND_OPTION]: RAFT_BACKEND.RAFT_RS_WASM,
  });
  assert.equal(typeof provider[
    RAFT_PROVIDER_CONTRACT_METHOD.CREATE_PARTITION_PORT], 'function');
  for (const field of [
    'groupId', 'peerId', 'durableStorage', 'timing', 'sendToPeer',
    'resolvePeerAddress', 'applyCommittedEntry', 'bootstrapPeerIds',
  ]) {
    const request = minimalPartitionRequest({[field]: undefined});
    assert.throws(() => provider.createPartitionPort(request),
      (error) => error.message.includes(field));
    request.durableStorage?.close();
  }
});
