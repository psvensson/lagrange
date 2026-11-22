/**
 * Shared 3-replica PgWire cluster fixture and assertion helpers for
 * authoritative locking-read reservation tests.
 *
 * @module test/query/locking-read-authoritative-test-support
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import pg from 'pg';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {clearAllReservations} from '../../src/partition/partition-locking-read-reservation.js';
import {
  PARTICIPANT_CONCURRENCY_GRANULARITY,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PostgresWireRuntimeModule} from '../../src/runtime/pgwire-runtime-module.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from '../partition/partition-release-fixture.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';

const QUIET_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

export const ACCOUNTS_TABLE = 'accounts';
export const ACCOUNTS_PARTITION_ID = 'accounts-p1';
export const ACCOUNTS_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'balance', type: 'INTEGER', nullable: false},
    {name: 'tier', type: 'TEXT', nullable: false},
  ],
});
export const GROUP_BUDGET_MS = 20000;
const RAFT_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const PG_HOST = '127.0.0.1';
const PG_USER = 'postgres';
const PG_DATABASE = 'lagrange';
export const LOCK_NOT_AVAILABLE_SQLSTATE = '55P03';

export function initEnvironment(nodeId = 'locking-node-1') {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: nodeId},
    raft: RAFT_TIMING,
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function createAccountsTableRow(leaderNodeId = 'node-1') {
  return {
    table_id: ACCOUNTS_TABLE,
    table_name: ACCOUNTS_TABLE,
    active_partition_version: 1,
    schema: JSON.stringify(ACCOUNTS_SCHEMA),
    partition_key: 'id',
    partition_key_type: 'INTEGER',
    primary_key: 'id',
    leader_node_id: leaderNodeId,
  };
}

function createAccountsPartitionRow(replicaCount, leaderNodeId = 'node-1') {
  return {
    partition_id: ACCOUNTS_PARTITION_ID,
    table_id: ACCOUNTS_TABLE,
    table_name: ACCOUNTS_TABLE,
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'INTEGER',
    replica_count: replicaCount,
    leader_node_id: leaderNodeId,
  };
}

function buildServiceRows(group, members, leaderReplicaId) {
  return members.map(([replicaId, nodeId]) => ({
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: ACCOUNTS_PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    address: group.addressOf([replicaId, nodeId]),
    raft_role: replicaId === leaderReplicaId ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
  }));
}

function buildNodeCache(group, members, leaderMember) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    TABLES.TABLES,
    CDC_OPERATION.INSERT,
    createAccountsTableRow(leaderMember[1]),
  );
  cache.applySystemTableChange(
    TABLES.PARTITIONS,
    CDC_OPERATION.INSERT,
    createAccountsPartitionRow(members.length, leaderMember[1]),
  );
  for (const row of buildServiceRows(group, members, leaderMember[0])) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, row);
  }
  return cache;
}

async function seedAccountsData(engine) {
  const inserts = [
    [1, 100, 'gold'],
    [2, 200, 'silver'],
    [3, 300, 'gold'],
  ];
  for (const [id, balance, tier] of inserts) {
    const res = await engine.executeQuery(
      'INSERT INTO accounts (id, balance, tier) VALUES (?, ?, ?)',
      [id, balance, tier],
    );
    assert.equal(res.success, true, `seed row ${id} failed: ${res.error}`);
  }
  const leaderService = engine.partitionServicesProvider?.()?.values()?.next()?.value;
  if (leaderService?.db) {
    leaderService.db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier)');
  }
}

async function startPgWireNode(engine) {
  const runtime = new PostgresWireRuntimeModule({logger: QUIET_LOGGER});
  const prepared = await runtime.prepare({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      host: PG_HOST,
      authMode: 'trust',
      tlsMode: 'disable',
    }),
  });
  assert.equal(prepared.status, 'ready');
  const started = await runtime.start({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: PG_HOST,
    port: 0,
    sqlRequestExecutor: (sqlRequest, opts) => engine.executeRequest(sqlRequest, opts),
  });
  assert.equal(started.status, 'running');
  return {
    runtime,
    port: started.endpointIntent.port,
    async connectClient() {
      const client = new pg.Client({
        host: PG_HOST,
        port: started.endpointIntent.port,
        user: PG_USER,
        database: PG_DATABASE,
      });
      await client.connect();
      return client;
    },
    async stop() {
      await runtime.stop({serviceId: META_SERVICE_ID.POSTGRES_WIRE});
    },
  };
}

export async function setupTwoNodeCluster(options = {}) {
  clearAllReservations();
  initEnvironment('node-1');
  const members = [
    [`${ACCOUNTS_PARTITION_ID}-r1`, 'node-1'],
    [`${ACCOUNTS_PARTITION_ID}-r2`, 'node-2'],
    [`${ACCOUNTS_PARTITION_ID}-r3`, 'node-3'],
  ];
  const group = await formAdmittedGroup({
    partitionId: ACCOUNTS_PARTITION_ID,
    members,
    tempPrefix: options.tempPrefix || 'lock-auth-cluster-',
    budgetMs: GROUP_BUDGET_MS,
    serviceOptions: {
      tableId: ACCOUNTS_TABLE,
      tableName: ACCOUNTS_TABLE,
      schema: ACCOUNTS_SCHEMA,
      concurrencyGranularity:
        options.concurrencyGranularity || PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
    },
  });
  const releaseOwners = await attachPartitionReleaseOwners(group.services, {
    directory: path.dirname(group.dbFileOf(members[0])),
    budgetMs: GROUP_BUDGET_MS,
  });
  for (const sysTable of [TABLES.PARTITIONS, TABLES.SERVICES]) {
    const rows = group.services[0].systemTableCache.getAll(sysTable) || [];
    for (const row of rows) {
      if (row.partition_id === releaseOwners.control.partitionId ||
          row.service_id === releaseOwners.control.replicaId) {
        for (const svc of group.services.slice(1)) {
          svc.systemTableCache.applySystemTableChange(sysTable, CDC_OPERATION.INSERT, row);
        }
      }
    }
  }
  await releaseOwners.release(ACCOUNTS_PARTITION_ID);

  for (const svc of group.services) {
    svc.systemTableCache.applySystemTableChange(
      TABLES.TABLES,
      CDC_OPERATION.INSERT,
      createAccountsTableRow(members[0][1]),
    );
    svc.db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier)');
  }

  const gateway = createTransactionPersistenceGateway();
  const makeNodeEngine = (memberIndex) => {
    const member = members[memberIndex];
    const localService = group.services[memberIndex];
    const cache = buildNodeCache(group, members, members[0]);
    const localMap = new Map([[localService.replicaId, localService]]);
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: cache,
      messageRouter: group.services[0].transport,
      controlPlaneSystemTableGateway: gateway,
      partitionServicesProvider: () => localMap,
      nodeId: member[1],
      autoStartDistributedTransactionRecovery: false,
      migrationAutoWire: false,
      unrefRetryDelayTimers: true,
    });
    return {engine, cache, localService, member};
  };

  const node1 = makeNodeEngine(0);
  const node2 = makeNodeEngine(1);
  node2.engine.queryExecutor.setBootstrapTopologySnapshotOwner({
    resolveCanonicalPartitionLeaderNodeId: (pid) =>
      pid === releaseOwners.control.partitionId ? members[0][1] : null,
  });
  group.services[1].sqlQueryEngine = node2.engine;
  await seedAccountsData(node1.engine);

  const pg1 = await startPgWireNode(node1.engine);
  const pg2 = await startPgWireNode(node2.engine);

  return {
    group,
    members,
    releaseOwners,
    gateway,
    node1,
    node2,
    pg1,
    pg2,
    leader: () =>
      group.services.find(
        (svc) => svc.raft?.readStatus?.().role === RAFT_ROLE.LEADER,
      ) ?? null,
    updateLeaderRouting(newLeaderMember) {
      for (const node of [node1, node2]) {
        for (const row of buildServiceRows(group, members, newLeaderMember[0])) {
          node.cache.applySystemTableChange(
            TABLES.SERVICES,
            CDC_OPERATION.UPDATE,
            row,
          );
        }
      }
    },
    async cleanup() {
      await pg1.stop().catch(() => {});
      await pg2.stop().catch(() => {});
      await node1.engine.shutdown().catch(() => {});
      await node2.engine.shutdown().catch(() => {});
      await releaseOwners.dispose().catch(() => {});
      await group.dispose().catch(() => {});
      gateway.db.close();
      clearAllReservations();
    },
  };
}

export async function expectSqlState(client, sql, params, expectedSqlState) {
  let caught = null;
  try {
    await client.query(sql, params);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `Expected SQLSTATE ${expectedSqlState} for "${sql}", but it succeeded`);
  assert.equal(
    caught.code,
    expectedSqlState,
    `Expected SQLSTATE ${expectedSqlState} for "${sql}", got ${caught.code}: ${caught.message}`,
  );
  return caught;
}

export function countDbReservations(db, tableName = ACCOUNTS_TABLE) {
  const exists = db
    .prepare(
      'SELECT 1 AS ok FROM sqlite_master WHERE type = \'table\' AND name = ?',
    )
    .get('_lagrange_locking_read_reservations');
  if (!exists) return 0;
  const row = db
    .prepare(
      'SELECT COUNT(*) AS cnt FROM _lagrange_locking_read_reservations WHERE table_name = ?',
    )
    .get(tableName);
  return Number(row?.cnt || 0);
}

export function assertNumericRowValues(rows, expectedRows) {
  assert.equal(rows.length, expectedRows.length);
  for (let i = 0; i < expectedRows.length; i += 1) {
    const actual = rows[i];
    const expected = expectedRows[i];
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected)) {
      assert.equal(Number(actual[k]), v, `Mismatch on column ${k}`);
    }
  }
}
