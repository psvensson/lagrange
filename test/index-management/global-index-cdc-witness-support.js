import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {TABLES} from '../../src/constants/index.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {
  getInitialPartitionId,
  getInitialReplicaIds,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {buildCommittedCdcOutcome, hasDurableCdcEvents} from '../../src/cdc/cdc-delivery-outcome.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {waitForCondition} from '../partition/partition-service-test-support.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {
  resumeFixtureParticipantAdmission,
} from '../test-helpers/participant-transaction-fixture.js';
import {createTargetRouter} from './global-index-founding-witness-support.js';

const SYSTEM_PARTITION_TABLES = [
  TABLES.TABLES,
  TABLES.PARTITIONS,
  TABLES.INDICES,
  TABLES.SERVICES,
  TABLES.SCHEMA_OPERATIONS,
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS,
];

const USERS_SCHEMA = {
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'email', type: 'TEXT'},
    {name: 'name', type: 'TEXT'},
    {name: 'status', type: 'TEXT'},
  ],
  primaryKey: ['id'],
};

async function startLeaderPartition(tmpDir, {
  partitionId,
  tableName,
  replicaId,
  nodeId,
  keyRange,
  schema,
  systemCache,
}) {
  const ps = new PartitionService(withFoundingStamp({
    partitionId,
    tableId: tableName,
    tableName,
    replicaId,
    replicaIds: [replicaId],
    nodeId,
    systemTableCache: systemCache,
    dbPath: path.join(tmpDir, `${partitionId}.db`),
    keyRange,
    schema,
  }));
  await ps.initialize();
  ps.startElection();
  await turnChainValue(ps.raft.campaign());
  await waitForCondition(() => ps.role === 'leader', 3000, 5);
  await resumeFixtureParticipantAdmission(ps);
  return ps;
}

function seedBootstrapCache(cache, {usersPartitions}) {
  const now = Date.now();
  for (const sysTable of SYSTEM_PARTITION_TABLES) {
    const schema = getSchemaByTableName(sysTable);
    const partitionId = getInitialPartitionId(sysTable);
    const replicaId = getInitialReplicaIds(sysTable)[0];
    cache.applySystemTableChange(TABLES.TABLES, CACHE_CDC_OPERATIONS.UPSERT, {
      table_id: sysTable,
      table_name: sysTable,
      schema_definition: JSON.stringify(schema),
      partition_key: schema.primaryKey?.[0] || schema.columns[0].name,
      table_policies: '{}',
      partition_count: 1,
      active_partition_version: 1,
      created_at: now,
      updated_at: now,
    });
    cache.applySystemTableChange(TABLES.PARTITIONS, CACHE_CDC_OPERATIONS.UPSERT, {
      partition_id: partitionId,
      table_id: sysTable,
      table_name: sysTable,
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'TEXT',
      partition_version: 1,
      replica_count: 1,
      size_bytes: 0,
      leader_node_id: 'node-a',
      state: 'NORMAL',
      created_at: now,
      updated_at: now,
    });
    cache.applySystemTableChange(TABLES.SERVICES, CACHE_CDC_OPERATIONS.UPSERT, {
      service_id: replicaId,
      replica_id: replicaId,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: 'node-a',
      raft_role: 'leader',
      address: `node-a/partition/${partitionId}`,
      status: 'active',
    });
  }

  cache.applySystemTableChange(TABLES.TABLES, CACHE_CDC_OPERATIONS.UPSERT, {
    table_id: 'users',
    table_name: 'users',
    schema_definition: JSON.stringify(USERS_SCHEMA),
    partition_key: 'id',
    table_policies: '{}',
    partition_count: usersPartitions.length,
    active_partition_version: 1,
    created_at: now,
    updated_at: now,
  });
  for (const part of usersPartitions) {
    cache.applySystemTableChange(TABLES.PARTITIONS, CACHE_CDC_OPERATIONS.UPSERT, part);
    cache.applySystemTableChange(TABLES.SERVICES, CACHE_CDC_OPERATIONS.UPSERT, {
      service_id: `${part.partition_id}-r1`,
      replica_id: `${part.partition_id}-r1`,
      service_type: 'partition',
      partition_id: part.partition_id,
      node_id: 'node-a',
      raft_role: 'leader',
      address: `node-a/partition/${part.partition_id}`,
      status: 'active',
    });
  }
}

function buildPartitionCdcSubscriberAck(sysPs, list) {
  if (!hasDurableCdcEvents(list)) {
    return {success: true};
  }
  const last = list.at(-1);
  const index = last?.sourceLogIndex ?? last?.logIndex ?? 1;
  const term = last?.term ?? sysPs.resolveCurrentTermSafe?.() ?? 1;
  return buildCommittedCdcOutcome(
    list,
    sysPs.groupId || sysPs.partitionId,
    {index, term},
  );
}

async function withIndependentCacheCdcEnvironment(callback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-gsi-cdc-2c-'));
  const cacheA = new SystemTableCache();
  const cacheB = new SystemTableCache();
  const partitionServices = new Map();
  const systemPartitions = [];
  const provisionedPartitions = [];
  const propagatedCdcEvents = [];

  const usersPartitions = [
    {
      partition_id: 'users_p0',
      table_id: 'users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: 100,
      partition_key_type: 'INTEGER',
      partition_version: 1,
      replica_count: 1,
      size_bytes: 0,
      leader_node_id: 'node-a',
      state: 'NORMAL',
    },
    {
      partition_id: 'users_p1',
      table_id: 'users',
      table_name: 'users',
      partition_key_start: 100,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      partition_version: 1,
      replica_count: 1,
      size_bytes: 0,
      leader_node_id: 'node-a',
      state: 'NORMAL',
    },
  ];
  seedBootstrapCache(cacheA, {usersPartitions});
  seedBootstrapCache(cacheB, {usersPartitions});

  const oracleDb = new Database(':memory:');
  oracleDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT,
      name TEXT,
      status TEXT
    )
  `);

  for (const sysTable of SYSTEM_PARTITION_TABLES) {
    const partitionId = getInitialPartitionId(sysTable);
    const replicaId = getInitialReplicaIds(sysTable)[0];
    const sysPs = await startLeaderPartition(tmpDir, {
      partitionId,
      tableName: sysTable,
      replicaId,
      nodeId: 'node-a',
      keyRange: {start: null, end: null},
      schema: getSchemaByTableName(sysTable),
      systemCache: cacheA,
    });
    partitionServices.set(replicaId, sysPs);
    systemPartitions.push(sysPs);
  }

  const usersP0 = await startLeaderPartition(tmpDir, {
    partitionId: 'users_p0',
    tableName: 'users',
    replicaId: 'users_p0-r1',
    nodeId: 'node-a',
    keyRange: {start: null, end: 100},
    schema: USERS_SCHEMA,
    systemCache: cacheA,
  });
  const usersP1 = await startLeaderPartition(tmpDir, {
    partitionId: 'users_p1',
    tableName: 'users',
    replicaId: 'users_p1-r1',
    nodeId: 'node-a',
    keyRange: {start: 100, end: null},
    schema: USERS_SCHEMA,
    systemCache: cacheA,
  });
  partitionServices.set('users_p0-r1', usersP0);
  partitionServices.set('users_p1-r1', usersP1);

  const readinessA = createCommittedServeEligibilityOwner();
  const readinessB = createCommittedServeEligibilityOwner();
  const messageRouter = createTargetRouter(partitionServices);

  const cdcA = new CDCIntegrationService({
    nodeId: 'node-a',
    systemTableCache: cacheA,
    messageRouter,
  });
  cdcA.initialize();
  const gatewayA = new ControlPlaneSystemTableGateway({
    nodeId: 'node-a',
    cdcIntegrationService: cdcA,
    systemTableCache: cacheA,
    messageRouter,
    controlPlaneReadinessService: readinessA,
  });

  const cdcB = new CDCIntegrationService({
    nodeId: 'node-b',
    systemTableCache: cacheB,
    messageRouter,
  });
  cdcB.initialize();
  const gatewayB = new ControlPlaneSystemTableGateway({
    nodeId: 'node-b',
    cdcIntegrationService: cdcB,
    systemTableCache: cacheB,
    messageRouter,
    controlPlaneReadinessService: readinessB,
  });

  for (const sysPs of systemPartitions) {
    sysPs.subscribeToCDC((events) => {
      const list = Array.isArray(events) ? events : [events];
      const now = Date.now();
      for (const event of list) {
        propagatedCdcEvents.push(event);
        gatewayA.applyCommittedPartitionCdcEventToCache(cacheA, event, now);
        gatewayB.applyCommittedPartitionCdcEventToCache(cacheB, event, now);
      }
      return buildPartitionCdcSubscriberAck(sysPs, list);
    });
  }

  const provisionerA = async (ctx) => {
    const replicaId = `${ctx.partitionId}-r1`;
    const ps = await startLeaderPartition(tmpDir, {
      partitionId: ctx.partitionId,
      tableName: ctx.tableName,
      replicaId,
      nodeId: 'node-a',
      keyRange: ctx.keyRange || {start: null, end: null},
      schema: ctx.schema,
      systemCache: cacheA,
    });
    partitionServices.set(replicaId, ps);
    provisionedPartitions.push(ps);
    const serviceRes = await gatewayA.submitMutation({
      operation: 'insert',
      tableName: TABLES.SERVICES,
      row: {
        service_id: replicaId,
        service_type: 'partition',
        partition_id: ctx.partitionId,
        node_id: 'node-a',
        raft_role: 'leader',
        address: `node-a/partition/${ctx.partitionId}`,
        status: 'active',
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    });
    const partLeaderRes = await gatewayA.submitMutation({
      operation: 'update',
      tableName: TABLES.PARTITIONS,
      whereClause: {partition_id: ctx.partitionId},
      data: {leader_node_id: 'node-a', updated_at: Date.now()},
    });
    await Promise.all([
      serviceRes?.position && gatewayA.awaitProjectionAt(serviceRes.position),
      partLeaderRes?.position && gatewayA.awaitProjectionAt(partLeaderRes.position),
    ].filter(Boolean));
    return {partitionId: ctx.partitionId, replicaIds: [replicaId]};
  };

  const engineA = new SQLQueryEngine({
    nodeId: 'node-a',
    controlPlaneReadinessService: readinessA,
    systemCache: cacheA,
    messageRouter,
    cdcIntegrationService: cdcA,
    controlPlaneSystemTableGateway: gatewayA,
    tablePartitionProvisioner: provisionerA,
    autoStartDistributedTransactionRecovery: false,
    migrationAutoWire: false,
  });
  cdcA.setSqlQueryEngine(engineA);
  gatewayA.setSqlQueryEngine?.(engineA);
  engineA.queryExecutor.leaderRetryDelayMs = 5;
  engineA.queryExecutor.queryTimeoutMs = 1500;
  await engineA.indexService.initialize();

  const engineB = new SQLQueryEngine({
    nodeId: 'node-b',
    controlPlaneReadinessService: readinessB,
    systemCache: cacheB,
    messageRouter,
    cdcIntegrationService: cdcB,
    controlPlaneSystemTableGateway: gatewayB,
    autoStartDistributedTransactionRecovery: false,
    migrationAutoWire: false,
  });
  cdcB.setSqlQueryEngine(engineB);
  gatewayB.setSqlQueryEngine?.(engineB);
  engineB.queryExecutor.leaderRetryDelayMs = 5;
  engineB.queryExecutor.queryTimeoutMs = 1500;
  await engineB.indexService.initialize();

  try {
    await callback({
      cacheA,
      cacheB,
      engineA,
      engineB,
      gatewayA,
      gatewayB,
      usersP0,
      usersP1,
      oracleDb,
      propagatedCdcEvents,
    });
  } finally {
    await engineB.shutdown().catch(() => {});
    await engineA.shutdown().catch(() => {});
    cdcB.shutdown?.();
    cdcA.shutdown?.();
    readinessB.shutdown?.();
    readinessA.shutdown?.();
    for (const ps of provisionedPartitions) {
      await ps.shutdown().catch(() => {});
    }
    await usersP0.shutdown().catch(() => {});
    await usersP1.shutdown().catch(() => {});
    for (const sysPs of systemPartitions) {
      await sysPs.shutdown().catch(() => {});
    }
    oracleDb.close();
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

export {withIndependentCacheCdcEnvironment};
