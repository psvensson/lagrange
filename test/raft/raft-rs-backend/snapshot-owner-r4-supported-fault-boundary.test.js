// R4 component witness: a destructive local loss of a replica that the
// authoritative lifecycle owner says already opened must be stopped before a
// native core can be born empty. The path uses a production ReplicaHandler
// and a real initialized PartitionService factory; the only assertion source
// outside that path is an independent read-only look at the replica DB.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {TABLES} from '../../../src/constants/index.js';
import {ReplicaHandler as ProductionReplicaHandler} from
  '../../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../../src/node/replica-state-machine.js';
import {OperationType, ReplicaStatus} from
  '../../../src/rebalancer/replica-status.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {genesisStamp} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {setActualCoreEntryObserver} from
  '../../../src/raft/raft-rs-runtime-owner.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {createLifecycleControlPlaneGatewayForCache} from
  '../../test-helpers/lifecycle-state-store.js';
import {createLoopbackTransport} from
  '../../partition/partition-service-test-support.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const NODE_ID = 'snapshot-r4-node';
const PARTITION_ID = 'snapshot-r4-supported-p1';
const TABLE_ID = 'snapshot-r4-supported-table';
const TABLE_NAME = 'snapshot_r4_rows';
const REPLICA_ID = 'snapshot-r4-supported-r1';
const RESEED_REQUIRED = COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED;
const TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const SCHEMA = Object.freeze({
  columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
});

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    raft: TIMING,
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createSeededCache(row = null) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    table_id: TABLE_ID,
    table_name: TABLE_NAME,
    schema_definition: JSON.stringify(SCHEMA),
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID,
    table_id: TABLE_ID,
    table_name: TABLE_NAME,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: NODE_ID,
  });
  if (row !== null) {
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', row);
  }
  return cache;
}

function createMockCDCService(cache) {
  return {
    operations: [],
    async executeAuthoritativeSystemTableRead(tableName, sql, params) {
      this.operations.push({type: 'authoritativeRead', tableName, sql, params});
      const row = cache.get(tableName, params[0]);
      return {success: true, rows: row ? [{...row}] : []};
    },
    async insertSystemTableRow(tableName, data) {
      this.operations.push({type: 'insert', tableName, data});
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      this.operations.push({type: 'update', tableName, whereClause, data});
      cache.applySystemTableChange(tableName, 'UPDATE', {...whereClause, ...data});
      return {success: true};
    },
    async upsertSystemTableRow(tableName, data) {
      this.operations.push({type: 'upsert', tableName, data});
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      this.operations.push({type: 'delete', tableName, whereClause});
      cache.applySystemTableChange(tableName, 'DELETE', whereClause);
      return {success: true};
    },
  };
}

function lifecycleRow(dbPath) {
  const db = new Database(dbPath, {readonly: true});
  try {
    return db.prepare('SELECT state, reason FROM _raft_rs_replica_lifecycle ' +
      'WHERE group_id = ? AND replica_identity = ?')
      .get(PARTITION_ID, REPLICA_ID) ?? null;
  } finally {
    db.close();
  }
}

async function buildReplicaHandlerWitness(directory, options = {}) {
  const cache = createSeededCache(options.seedRow ?? null);
  const lifecycleGateway = createLifecycleControlPlaneGatewayForCache(cache, {
    store: options.store ?? null,
  });
  const gateway = {
    store: lifecycleGateway.store,
    submitMutation: lifecycleGateway.submitMutation,
    readAuthoritativeRows: lifecycleGateway.readAuthoritativeRows,
    updateSystemTableRow: (tableName, whereClause, data) =>
      lifecycleGateway.submitMutation({
        operation: 'update', tableName, whereClause, data,
      }),
  };
  const transport = createLoopbackTransport();
  const opened = [];
  const cdcIntegrationService = createMockCDCService(cache);
  const handler = new ProductionReplicaHandler({
    nodeId: NODE_ID,
    dataDir: directory,
    systemTableCache: cache,
    cdcIntegrationService,
    replicaStateMachine: new ReplicaStateMachine({
      nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
    }),
    controlPlaneSystemTableGateway: gateway,
    createPartitionService: async (options) => {
      const partition = new PartitionService(withFoundingStamp({
        ...options,
        schema: SCHEMA,
        nodeId: NODE_ID,
        dbPath: path.join(directory, `${options.replicaId}.sqlite`),
        transport,
        systemTableCache: cache,
        deferElection: true,
        suppressLifecycleLogs: true,
      }));
      opened.push(partition);
      try {
        await partition.initialize();
      } catch (error) {
        partition.openFailure = error;
        throw error;
      }
      return partition;
    },
  });
  handler.executorOutcomeEmitter = {emitOutcome() {}};
  handler.initialize();
  return {handler, opened, cache, cdcIntegrationService, store: gateway.store};
}

test('R4 supported fault boundary - a real prior open then DB wipe drives ' +
  'ReplicaHandler into PartitionService reseed hold before native core',
async () => {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-r4-supported-'));
  const coreEntries = [];
  setActualCoreEntryObserver((entry) => coreEntries.push(entry));
  let firstLife = null;
  let secondLife = null;
  let thirdLife = null;
  try {
    const dbPath = path.join(directory, `${REPLICA_ID}.sqlite`);
    firstLife = await buildReplicaHandlerWitness(directory);
    await firstLife.handler.createReplicaAsync({
      operationId: 'snapshot-r4-supported-first-open',
      explicitOperationType: OperationType.ADD,
      partitionId: PARTITION_ID,
      replicaId: REPLICA_ID,
      bootstrapReplicaIds: [REPLICA_ID],
      bootstrapPeerAddresses: [`${NODE_ID}/partition/${REPLICA_ID}`],
      bootstrapTableMetadata: null,
      bootstrapPartitionMetadata: null,
      bootstrapMembership: genesisStamp([REPLICA_ID]),
    });
    assert.equal(firstLife.opened.length, 1,
      'setup opened the exact replica through the handler');
    assert.equal(firstLife.opened[0].identityExisted, false,
      'setup first open had no prior-existence fact');
    assert.equal(firstLife.store.durableRow(TABLES.SERVICES, REPLICA_ID)
      ?.status, ReplicaStatus.ACTIVE,
    'setup persisted authoritative ACTIVE after the real open');
    assert.ok(fs.existsSync(dbPath), 'setup created the replica DB');
    await firstLife.handler.shutdown();
    await Promise.allSettled(firstLife.opened.map((partition) =>
      partition.initialized ? partition.shutdown() : Promise.resolve()));
    fs.rmSync(dbPath, {force: true});
    fs.rmSync(`${dbPath}-wal`, {force: true});
    fs.rmSync(`${dbPath}-shm`, {force: true});

    const beforeRefusedOpen = coreEntries.length;
    secondLife = await buildReplicaHandlerWitness(directory, {
      store: firstLife.store,
    });
    let failure = null;
    try {
      await secondLife.handler.createReplicaAsync({
        operationId: 'snapshot-r4-supported-reopen-after-wipe',
        explicitOperationType: OperationType.ADD,
        partitionId: PARTITION_ID,
        replicaId: REPLICA_ID,
        bootstrapReplicaIds: [REPLICA_ID],
        bootstrapPeerAddresses: [`${NODE_ID}/partition/${REPLICA_ID}`],
        bootstrapTableMetadata: null,
        bootstrapPartitionMetadata: null,
        bootstrapMembership: genesisStamp([REPLICA_ID]),
        skipLifecycleStatusPersistence: true,
      });
    } catch (error) {
      failure = error;
    }

    assert.ok(failure, 'the reopened empty identity is refused');
    assert.equal(secondLife.opened[0].openFailure?.consensus?.outcome,
      RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(secondLife.opened[0].openFailure?.consensus?.reason,
      RESEED_REQUIRED);
    assert.equal(secondLife.opened.length, 1,
      'the handler reached the real PartitionService factory once');
    assert.equal(secondLife.opened[0].identityExisted, true,
      'the durable SERVICES row supplied the prior-existence fact');
    assert.deepEqual(lifecycleRow(dbPath), {
      state: 'retired', reason: RESEED_REQUIRED,
    });
    assert.equal(coreEntries.slice(beforeRefusedOpen).filter((entry) =>
      entry.operation === 'create_node' && entry.groupId === PARTITION_ID)
      .length, 0, 'the refused empty reincarnation never entered native core');
    await secondLife.handler.shutdown();
    await Promise.allSettled(secondLife.opened.map((partition) =>
      partition.initialized ? partition.shutdown() : Promise.resolve()));

    thirdLife = await buildReplicaHandlerWitness(directory, {
      store: firstLife.store,
    });
    let heldFailure = null;
    try {
      await thirdLife.handler.createReplicaAsync({
        operationId: 'snapshot-r4-supported-same-bytes-held',
        explicitOperationType: OperationType.ADD,
        partitionId: PARTITION_ID,
        replicaId: REPLICA_ID,
        bootstrapReplicaIds: [REPLICA_ID],
        bootstrapPeerAddresses: [`${NODE_ID}/partition/${REPLICA_ID}`],
        bootstrapTableMetadata: null,
        bootstrapPartitionMetadata: null,
        bootstrapMembership: genesisStamp([REPLICA_ID]),
        skipLifecycleStatusPersistence: true,
      });
    } catch (error) {
      heldFailure = error;
    }
    assert.ok(heldFailure, 'same-byte owner-path reopen is refused');
    assert.equal(thirdLife.opened[0].openFailure?.consensus?.reason,
      RESEED_REQUIRED,
      'same-byte owner-path reopen consumes the persisted HOLD');
  } finally {
    setActualCoreEntryObserver(null);
    for (const life of [thirdLife, secondLife, firstLife]) {
      if (life === null) continue;
      await life.handler.shutdown().catch(() => undefined);
      await Promise.allSettled(life.opened.map((partition) =>
        partition.initialized ? partition.shutdown() : Promise.resolve()));
    }
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

test('R4 ordinary cold restart - three intact voters elect and commit with no ' +
  'preexisting live leader', async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'snapshot-r4-intact-restart',
    replicaIds: ['r4-a', 'r4-b', 'r4-c'],
  });
  try {
    cluster.tickers = ['r4-a'];
    assert.equal((await cluster.node('r4-a').campaign()).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true,
      'setup elects a leader');
    const leader = cluster.leaderReplicaId();
    cluster.propose(leader, {op: 'before-cold-restart'});
    assert.equal(cluster.settle(() => ['r4-a', 'r4-b', 'r4-c'].every(
      (replicaId) => cluster.replica(replicaId).appliedCommands.some(
        (command) => command.op === 'before-cold-restart'))), true,
    'setup commits on every voter');

    const boot = new Map([...cluster.replicas].map(([replicaId, replica]) =>
      [replicaId, {
        bootstrap: replica.request.bootstrapPeerIds,
        extraRequest: replica.extraRequest,
      }]));
    for (const replica of cluster.replicas.values()) {
      replica.node.close();
      replica.db.close();
    }
    for (const replicaId of ['r4-a', 'r4-b', 'r4-c']) {
      const saved = boot.get(replicaId);
      cluster.buildReplica(replicaId, saved.bootstrap, saved.extraRequest);
    }
    cluster.tickers = ['r4-a', 'r4-b', 'r4-c'];
    assert.equal((await cluster.node('r4-b').campaign()).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true,
      'a restarted voter can lead without a live pre-restart leader');
    const restartedLeader = cluster.leaderReplicaId();
    cluster.propose(restartedLeader, {op: 'after-cold-restart'});
    assert.equal(cluster.settle(() => ['r4-a', 'r4-b', 'r4-c'].every(
      (replicaId) => cluster.replica(replicaId).appliedCommands.some(
        (command) => command.op === 'after-cold-restart'))), true,
    'the restarted voters commit after cold restart');
  } finally {
    cluster.dispose();
  }
});
