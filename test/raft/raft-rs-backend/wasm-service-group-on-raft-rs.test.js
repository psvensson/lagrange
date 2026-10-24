// The WASM service consensus group runs on the rs-raft operation port and
// the worker consensus path is gone (consensus-cutover quest;
// design R4 §2(a), §2(b), owner decisions 5 and 6).
//
// Three real WasmServiceReplica instances, each with its own durable file,
// exchange the port's semantic envelopes over one real MessageRouter. The
// session KV store shares the consensus connection, so a committed write and
// its applied index are one transaction and a restart replays nothing.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {WasmServiceReplica} from
  '../../../src/wasm-service/wasm-service-replica.js';
import {WASM_SERVICE_ERROR_MSG} from
  '../../../src/wasm-service/wasm-service-constants.js';
import {WASM_SERVICE_COMMAND_REFUSAL} from
  '../../../src/wasm-service/wasm-service-committed-command-admission.js';
import {WasmServiceLifecycle} from
  '../../../src/wasm-service/wasm-service-lifecycle.js';
import {
  WASM_WRITER_PROFILE,
  WRITER_ACTION,
  WRITER_ENCODING,
  WRITER_STATUS,
} from '../../../src/wasm-service/wasm-writer-profile.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../../src/constants/index.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {TEST_BOOT_INCARNATION} from
  '../../test-helpers/boot-incarnation-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..');
const SERVICE_ID = 'wasm-rs-witness';
const NODE_ID = 'wasm-rs-witness-node';
const REPLICAS = ['wsr-0', 'wsr-1', 'wsr-2'];
const SESSION = 'session-1';
const BUDGET_MS = 10000;
// A strong write uses the v1 writer delivery shape (wasm-writer-slots-v1
// DESIGN.md "Exact v1 boundary shapes"). Manual INIT and ENROLL on this
// unbound group is NOT the protocol: production INIT comes from the bound
// creation genesis, and unbound production formation is dead at prepare.
// This is the owner-retained test surface whose only live users are tests;
// the witness migrates to the bound creation fixture when the deletion unit
// for the unbound path lands.
const WRITER = Object.freeze({
  incarnation: '11'.repeat(32),
  initNonce: '22'.repeat(32),
  enrollNonce: '33'.repeat(32),
  slot: 0,
  generation: 1,
});
const POLL_MS = 10;
const DELETED_WORKER_PATH = Object.freeze([
  'src/worker',
  'src/cache/system-cache-proxy.js',
  'src/raft/raft-replica-base.js',
  'src/raft/raft-replica-base-constants.js',
  'src/raft/raft-replica-base-runtime-helpers.js',
  'src/raft/raft-peer-backpressure-mute.js',
]);

function configure() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function waitFor(predicate, boundMs = BUDGET_MS) {
  const deadline = Date.now() + boundMs;
  return new Promise((resolve) => {
    const poll = () => {
      if (predicate()) {
        resolve(true);
      } else if (Date.now() >= deadline) {
        resolve(false);
      } else {
        setTimeout(poll, POLL_MS);
      }
    };
    poll();
  });
}

// The node's services rows place each replica on this node, as placement
// publishes them: peer addresses resolve from that authority alone.
function createPlacedNodeCache() {
  const cache = new SystemTableCache();
  for (const replicaId of REPLICAS) {
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: replicaId,
      [COLUMN.NODE_ID]: NODE_ID,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });
  }
  return cache;
}

async function createServiceHost() {
  configure();
  const nodeCache = createPlacedNodeCache();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-rs-witness-'));
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    wsPort: 0,
  });
  await router.initialize({startServer: false});
  const live = new Map();
  const dbFileOf = (replicaId) =>
    path.join(directory, 'wasm-services', SERVICE_ID, `${replicaId}.db`);
  const open = async (replicaId) => {
    fs.mkdirSync(path.dirname(dbFileOf(replicaId)), {recursive: true});
    const replica = new WasmServiceReplica({
      replicaId,
      nodeId: NODE_ID,
      replicaIds: REPLICAS,
      transport: router,
      serviceDefinitionId: SERVICE_ID,
      dbPath: dbFileOf(replicaId),
      systemTableCache: nodeCache,
    });
    live.set(replicaId, replica);
    await replica.initialize();
    return replica;
  };
  const close = async (replicaId) => {
    const replica = live.get(replicaId);
    live.delete(replicaId);
    await replica?.shutdown();
  };
  const dispose = async () => {
    for (const replicaId of [...live.keys()]) {
      await close(replicaId);
    }
    await router.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  };
  return {router, open, close, dispose, dbFileOf};
}

async function openGroup(host) {
  const replicas = [];
  for (const replicaId of REPLICAS) {
    replicas.push(await host.open(replicaId));
  }
  return replicas;
}

function writerCommand(action, fields) {
  return {type: WASM_WRITER_PROFILE.type, profile: WASM_WRITER_PROFILE.id,
    action, serviceId: SERVICE_ID, incarnation: WRITER.incarnation,
    ...fields};
}

function assertRecorded(response, label) {
  assert.equal(response.status, WRITER_STATUS.RECORDED, label);
  assert.equal(response.accepted, true, label);
}

// INIT and ENROLL as actual lifecycle-admin requests on the elected leader,
// applied by the group, never seeded rows. The lifecycle here composes only
// its hosted-replica registry with the real replica (as the v1 native
// fixture does); it claims no module or port deployment.
async function enrollWriter(host, leader) {
  const lifecycle = new WasmServiceLifecycle({messageRouter: host.router,
    nodeId: NODE_ID});
  lifecycle.activeReplicas.set(SERVICE_ID, leader);
  try {
    assertRecorded(await lifecycle.administerWriter(SERVICE_ID,
      writerCommand(WRITER_ACTION.INIT, {nonce: WRITER.initNonce})),
    'the writer state is initialized through the group');
    assertRecorded(await lifecycle.administerWriter(SERVICE_ID,
      writerCommand(WRITER_ACTION.ENROLL, {slot: WRITER.slot,
        expectedGeneration: 0, expectedCompletedSequence: 0,
        expectedReceiptDigest: null, newGeneration: WRITER.generation,
        nonce: WRITER.enrollNonce})),
    'the writer slot is enrolled through the group');
  } finally {
    lifecycle.activeReplicas.delete(SERVICE_ID);
  }
}

function strongWrite(key, value, sequence = 1) {
  return {payload: {operation: 'write',
    requestId: {serviceId: SERVICE_ID, incarnation: WRITER.incarnation,
      slot: WRITER.slot, generation: WRITER.generation, sequence},
    ack: null, sessionId: SESSION, key, value}};
}

function leaderOf(replicas) {
  const leaders = replicas.filter((replica) => {
    const status = replica.raft.readStatus();
    return status.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
      status.role === 'leader';
  });
  return leaders.length === 1 ? leaders[0] : null;
}

function hardStateOf(dbFile) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    const row = independent.prepare(
      'SELECT term, vote FROM _raft_rs_hard_state WHERE group_id = ?')
      .get(SERVICE_ID);
    return {term: Number(row.term), vote: Number(row.vote)};
  } finally {
    independent.close();
  }
}

test('worker consensus path and its replica base are deleted', () => {
  for (const relative of DELETED_WORKER_PATH) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), false,
      `${relative} is deleted`);
  }
  const seaBuild = fs.readFileSync(path.join(ROOT, 'scripts/build-sea.js'),
    'utf8');
  assert.doesNotMatch(seaBuild, /replica[- ]worker/i,
    'the SEA build bundles no replica worker');
  const chain = [];
  for (let proto = WasmServiceReplica.prototype; proto;
    proto = Object.getPrototypeOf(proto)) {
    chain.push(proto.constructor.name);
  }
  assert.equal(chain.includes('RaftReplicaBase'), false,
    'the WASM replica no longer inherits the retired replica base');
  assert.equal(typeof WasmServiceReplica.prototype.handleRaftPacket,
    'undefined', 'no native packet entry point remains');
});

test('wasm service replica requires its own durable file', async () => {
  configure();
  try {
    assert.throws(() => new WasmServiceReplica({
      replicaId: 'no-file', nodeId: NODE_ID, replicaIds: ['no-file'],
      serviceDefinitionId: SERVICE_ID,
    }), {message: WASM_SERVICE_ERROR_MSG.MISSING_DB_PATH});
    assert.throws(() => new WasmServiceReplica({
      replicaId: 'memory', nodeId: NODE_ID, replicaIds: ['memory'],
      serviceDefinitionId: SERVICE_ID, dbPath: ':memory:',
    }), {message: WASM_SERVICE_ERROR_MSG.IN_MEMORY_DB_PATH_REFUSED});
  } finally {
    LoggingService.resetInstance();
    ConfigurationManager.resetInstance();
  }
});

test('wasm service group commits and applies kv writes through raft-rs',
  async () => {
    const host = await createServiceHost();
    try {
      const replicas = await openGroup(host);
      assert.equal(await waitFor(() => leaderOf(replicas) !== null), true,
        'one replica is elected over the semantic envelopes');
      const leader = leaderOf(replicas);
      assert.equal(Object.isFrozen(leader.raft), true);
      const follower = replicas.find((replica) => replica !== leader);
      assert.equal(await waitFor(() => follower.leaderId === leader.replicaId),
        true, 'the follower publishes the port-announced leader');
      assert.deepEqual(await follower.handleMessage(strongWrite('k', 'v')),
        {forwarded: true, leaderId: leader.replicaId},
        'a follower forwards writes to the leader the port announced');

      await enrollWriter(host, leader);
      const value = Buffer.from([0, 1, 2, 250, 255]);
      const written = await leader.handleMessage(strongWrite('bytes', value));
      assertRecorded(written, 'the strong write is recorded after application');
      assert.equal(written.async, false);
      assert.deepEqual(written.receipt.outcome, {accepted: true, error: null});
      for (const replica of replicas) {
        assert.equal(await waitFor(() =>
          replica.kvStore.get(SESSION, 'bytes')?.equals(value) === true),
        true, `${replica.replicaId} applied the committed binary value`);
      }
      const committed = RaftRsDurableStore.readCommittedEntriesIn(
        follower.db, SERVICE_ID);
      assert.ok(committed.some((entry) =>
        entry.command?.type === WASM_WRITER_PROFILE.type &&
        entry.command.action === WRITER_ACTION.WRITE &&
        entry.command.valueEncoding === WRITER_ENCODING),
      'the durable log holds the JSON v1 write command');

      const before = leader.raft.readStatus().commitIndex;
      await assert.rejects(leader.proposeEntry({type: 'not_a_command'}),
        (error) => error.reason === WASM_SERVICE_COMMAND_REFUSAL.UNKNOWN_TYPE,
        'an unknown command type is refused before propose');
      assert.equal(leader.raft.readStatus().commitIndex, before);
    } finally {
      await host.dispose();
    }
  });

test('wasm service replica restart preserves kv and consensus state',
  async () => {
    const host = await createServiceHost();
    try {
      const replicas = await openGroup(host);
      assert.equal(await waitFor(() => leaderOf(replicas) !== null), true);
      const leader = leaderOf(replicas);
      await enrollWriter(host, leader);
      const value = Buffer.from('durable');
      assertRecorded(await leader.handleMessage(strongWrite('kept', value)),
        'the strong write is recorded before restart');
      for (const replica of replicas) {
        assert.equal(await waitFor(() =>
          replica.kvStore.get(SESSION, 'kept')?.equals(value) === true), true);
      }
      for (const replicaId of REPLICAS) {
        await host.close(replicaId);
      }
      const persisted = new Map(REPLICAS.map((replicaId) =>
        [replicaId, hardStateOf(host.dbFileOf(replicaId))]));
      const reopened = await openGroup(host);
      for (const replica of reopened) {
        assert.equal(replica.kvStore.get(SESSION, 'kept')?.equals(value), true,
          `${replica.replicaId} keeps its applied KV state`);
        assert.ok(replica.raft.readStatus().term >=
          persisted.get(replica.replicaId).term,
        `${replica.replicaId} resumes from its persisted term`);
      }
      assert.equal(await waitFor(() => leaderOf(reopened) !== null), true,
        'the restarted group elects a leader again');
    } finally {
      await host.dispose();
    }
  });
