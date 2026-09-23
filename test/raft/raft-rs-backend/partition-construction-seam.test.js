import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';

import {PartitionService} from
  '../../../src/partition/partition-service.js';
import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';
import {RaftRsWasmProvider} from '../../../src/raft/raft-rs-provider.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_METHODS} from
  '../../../src/raft/raft-operation-port.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
  RAFT_PROVIDER_CONTRACT_METHOD,
} from '../../../src/raft/raft-provider-contract-constants.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OPERATION_PORT_FACTORY_OWNER =
  'src/partition/partition-service-core-base.js';
const OPERATION_PORT_FACTORY_DEFINITION =
  /^\s*(?:async\s+)?createOperationPort\s*\([^)]*\)\s*\{/mu;
// The request fields only the retired backend read: the durable log it wrote
// and the term it booted from. The rs-raft store owns both.
const RETIRED_REQUEST_FIELDS = Object.freeze([
  RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG,
  RAFT_PARTITION_NODE_REQUEST.INITIAL_TERM,
  RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK,
]);
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
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG]: {
      end: () => undefined,
      getLastInfo: async () => ({index: 0, term: 0, committedIndex: 0}),
    },
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

// Records the request production construction builds and the port the
// production factory returned for it; the port itself is production's.
class RecordingPartitionService extends PartitionService {
  constructor(options) {
    super(options);
    this.requests = [];
    this.ports = [];
  }

  createOperationPort(request) {
    this.requests.push(request);
    const port = super.createOperationPort(request);
    this.ports.push(port);
    return port;
  }
}

function buildPartition() {
  return new RecordingPartitionService({
    partitionId: PARTITION_ID,
    tableId: 'seam-table',
    tableName: 'seam_table',
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: 'node-seam-1',
    dbPath: ':memory:',
    deferElection: true,
  });
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(resolved);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [resolved] : [];
  });
}

test('the partition service builds the port it runs on through its one factory',
  async () => {
    const service = buildPartition();
    try {
      await service.initialize();
      assert.equal(service.requests.length, 1);
      assert.equal(service.raft, service.ports[0]);
      assert.deepEqual(Reflect.ownKeys(service.raft).sort(),
        [...RAFT_OPERATION_PORT_METHODS].sort());
      assert.equal(typeof service.raft.emit, 'undefined',
        'the port exposes no event emitter');
    } finally {
      await service.shutdown();
    }
  });

test('no production module replaces the partition operation-port factory',
  () => {
    const definers = sourceFiles(path.join(ROOT, 'src'))
      .filter((file) => OPERATION_PORT_FACTORY_DEFINITION.test(
        fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'));
    assert.deepEqual(definers, [OPERATION_PORT_FACTORY_OWNER],
      'only the partition core defines createOperationPort; a subclass that ' +
      'overrides it is a test seam, never a production path');
  });

test('the request carries the partition requirements and no retired field',
  async () => {
    const service = buildPartition();
    try {
      await service.initialize();
      const [request] = service.requests;
      const contractFields = Object.values(RAFT_PARTITION_NODE_REQUEST);
      assert.deepEqual(
        Object.keys(request).filter((key) => !contractFields.includes(key)),
        [], 'every request field is a declared contract field');
      assert.deepEqual(
        RETIRED_REQUEST_FIELDS.filter((field) => Object.hasOwn(request, field)),
        [], 'the retired backend\'s log, term and rollback hook are gone');
      assert.equal(request.groupId, service.partitionId);
      assert.equal(request.peerId, service.replicaId);
      assert.equal(request.durableStorage, service.db);
      for (const hook of [
        'sendToPeer', 'resolvePeerAddress', 'applyCommittedEntry',
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
    assert.equal(port.readStatus().leaderAddress, REPLICA_ID,
      'the semantic status carries the live leader address separately');
    assert.deepEqual(observedRoles, [RAFT_ROLE.LEADER]);
  } finally {
    unsubscribe();
    port.close();
    request.durableStorage.close();
  }
});

test('a single-replica partition observes rs-raft leadership through the port',
  async () => {
    const service = buildPartition();
    try {
      await service.initialize();
      assert.equal(service.isLeader, true);
      assert.equal(service.role, RAFT_ROLE.LEADER);
      assert.equal((await service.raft.readStatus()).role, RAFT_ROLE.LEADER);
    } finally {
      await service.shutdown();
    }
  });

test('liferaft step routes inbound vote packets through the Raft data event',
  async () => {
    const request = minimalPartitionRequest({
      [RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS]:
        'node-1/partition/replica-seam-1',
      [RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS]: (value) => value,
    });
    const port = new LiferaftProvider().createPartitionPort(request);
    const replies = [];
    try {
      assert.equal(port.readStatus().term, 0);
      port.step({
        payload: {
          type: 'vote',
          term: 7,
          address: 'node-2/partition/replica-seam-2',
          state: 2,
          leader: '',
          last: {term: 0, index: 0},
        },
        reply: (packet) => replies.push(packet),
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(port.readStatus().term, 7,
        'the higher-term vote reaches LifeRaft through port.step');
      assert.equal(replies.length, 1,
        'the semantic step preserves LifeRaft\'s vote-reply callback');
      assert.equal(replies[0]?.type, 'voted');
      assert.equal(replies[0]?.data?.granted, true);
    } finally {
      port.close();
      request.durableStorage.close();
    }
  });

test('the experimental backend refuses missing named requirements', () => {
  const provider = new RaftRsWasmProvider();
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
