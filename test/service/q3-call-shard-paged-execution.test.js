/**
 * Q3 — Shard-local paged execution (`call-shard-paged-execution`)
 * verification suite under `pilot-readiness-and-public-proof`.
 *
 * Proves:
 *   1. Deterministic keyset cursor planning, validation, and SQL query
 *      construction (`call-shard-read-view-cursor.js`), fail-closed rejection
 *      of unordered or `rowid`-ordered selectors (`KEYSET_ORDER_REQUIRED`),
 *      and `stateSchema` + `init`/`step`/`finish` validation in
 *      `normalizeServiceDefinition` and `typingsSource`.
 *   2. Real compiled `service-cell-v2` WASM component execution across 3
 *      disk-backed SQLite WAL shards with >4,096 rows per shard (4,500 + 4,200
 *      + 1,500 = 10,200 rows) using `init` / `step` / `finish` bounded
 *      accumulators across uneven page bounds (`pageRowBound = 1100` and
 *      `pageRowBound = 4096`), empty shards (`0` rows), 1-page shards, and
 *      exact-boundary shards, matching the independent oracle on `totalCents`,
 *      `count`, `weightedAverage`, `orderSensitiveDigest`, and `stepCount`.
 *   3. Genuine SQLite WAL retained read-view snapshot isolation across
 *      concurrent `INSERT`, `UPDATE`, and `DELETE` mutations between pages,
 *      deterministic reader cleanup, and fail-closed `READ_VIEW_UNAVAILABLE`
 *      when a backend cannot retain a read view.
 *   4. Atomic conditional SQL `UPDATE` page progress transitions, idempotent
 *      `deliveryId` replay, conflicting `deliveryId` rejection
 *      (`DELIVERY_CONFLICT`), resumable recovery from durable Page 1 state
 *      when the retained read view remains valid, and `wholeAttemptDiscard`
 *      + fresh attempt retry when read-view custody is lost mid-shard.
 *   5. Per-page and per-shard row, byte, state (`STATE_BUDGET_EXCEEDED`),
 *      page (`PAGE_BUDGET_EXCEEDED`), and deadline (`READ_VIEW_EXPIRED`)
 *      budget enforcement.
 */

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';
import Database from 'better-sqlite3';

import {defineService} from '../../src/authoring/define-service.js';
import {distributed} from '../../src/authoring/distributed-operation.js';
import {sql} from '../../src/authoring/sql-template.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {UNIFIED_SERVICE_TYPE} from
  '../../src/constants/unified-service-lifecycle.js';
import {
  bindDeploymentArtifact,
  buildBindingRow,
  canonicalJson,
  normalizeDeploymentBinding,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
  deriveRequestServiceDefinitionId,
} from '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {handleCallCellInvocation} from
  '../../src/node/runtime-service-call-cell-handler.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {createCallCellReduceCoordinator} from
  '../../src/runtime/call-cell-reduce-coordinator.js';
import {HEALTH_STATUS} from '../../src/runtime/runtime-driver.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {CallBindingRouteResolver} from
  '../../src/service/call-binding-route-resolver.js';
import {createCallCellBatchExecutor} from
  '../../src/service/call-cell-batch-executor.js';
import {CallCellInvoker} from '../../src/service/call-cell-invoker.js';
import {CALL_CELL_PARTIAL_KEY_PREFIX} from
  '../../src/service/call-cell-routing-contract.js';
import {CallCellStatementAdapter} from
  '../../src/service/call-cell-statement-adapter.js';
import {
  COMPARATOR_VERSION,
  CURSOR_VERSION,
  PAGED_CONSISTENCY_SCOPE,
  PAGED_EXECUTION_ERROR_CODE,
  buildKeysetPageCursor,
  buildKeysetPageQuery,
  compareKeyTuples,
  createPagedShardProgressTracker,
  createShardReadViewManager,
  executeLocalShardPageRead,
  executePagedShardSlot,
  resolveDeterministicKeyColumns,
  validateKeysetPageCursor,
} from '../../src/service/call-shard-paged-execution.js';
import {buildServiceComponent} from
  '../../src/service/service-component-build.js';
import {emitServiceEntry} from '../../src/service/service-entry-generator.js';
import {
  IR_TARGET,
  SERVICE_SOURCE_ERROR_CODE,
  SERVICE_SOURCE_STATUS,
  normalizeServiceDefinition,
} from '../../src/service/service-source-contract.js';
import {typingsSource} from '../../src/service/service-typings-generator.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
const QUEST_ID = 'call-shard-paged-execution';
const SERVICE_WORLD_V2 = 'service-cell-v2';
const CALL_WORLD_NAME = 'call-cell';
const RUN_EXPORT = 'run';
const TENANT_ID = 'tenant-q3';
const PRINCIPAL_ID = 'principal-q3-analyst';
const NODE_ID = 'node-q3-1';
const SERVICE_NAME = 'paged-ledger-rollup';
const SERVICE_VERSION = '1.0.0';
const BINDING_NAME = 'paged-ledger-rollup--call--paged-rollup';
const PACKAGE_ID =
  'service-package-3333333333333333333333333333333333333333333333333333333333333333';
const ARTIFACT_DIGEST =
  'sha256:6666666666666666666666666666666666666666666666666666666666666666';
const ARTIFACT_REF = 'oci://registry.local/q3/paged-ledger-rollup:1.0.0';
const TABLE_NAME = 'ledger_events';
const PARTITION_ONE = 'ledger_events_p0';
const PARTITION_TWO = 'ledger_events_p1';
const PARTITION_THREE = 'ledger_events_p2';
const COORDINATION_TABLE = 'call_cell_reduce_slots';
const RESULT_TABLE = 'call_cell_results';
const BATCH_ROW_BOUND = 4096;
const BATCH_BYTE_BOUND = 4194304;
const UNEVEN_PAGE_ROW_BOUND = 1100;
const EMIT_BUDGET = 64;
const NESTED_CALL_BUDGET = 1;
const PARTIAL_LIMIT = 64;
const DEADLINE_WINDOW_MS = 30000;
const LEASE_MS = 30000;
const SLOT_COUNT = 8;
const P0_ROW_COUNT = 4500;
const P1_ROW_COUNT = 4200;
const P2_ROW_COUNT = 1500;
const DIGEST_MODULO = 1000000007;
const DIGEST_MULTIPLIER = 131;

const SECURITY_CONTEXT = Object.freeze({
  principal: PRINCIPAL_ID,
  roles: Object.freeze(['application']),
  tenantId: TENANT_ID,
});

const SELECTOR_SQL =
  'SELECT event_ts, id, account_code, amount_cents, weight ' +
  'FROM ledger_events ORDER BY event_ts ASC, id ASC';

const PAGE_KEY_COLUMNS = Object.freeze(['event_ts', 'id']);

const ROLLUP_STATE_SCHEMA = Object.freeze({
  fields: Object.freeze({
    alphaCents: Object.freeze({type: 'integer'}),
    alphaCount: Object.freeze({type: 'integer'}),
    alphaWeight: Object.freeze({type: 'integer'}),
    alphaWeightedNum: Object.freeze({type: 'integer'}),
    betaCents: Object.freeze({type: 'integer'}),
    betaCount: Object.freeze({type: 'integer'}),
    betaWeight: Object.freeze({type: 'integer'}),
    betaWeightedNum: Object.freeze({type: 'integer'}),
    gammaCents: Object.freeze({type: 'integer'}),
    gammaCount: Object.freeze({type: 'integer'}),
    gammaWeight: Object.freeze({type: 'integer'}),
    gammaWeightedNum: Object.freeze({type: 'integer'}),
    orderSensitiveDigest: Object.freeze({type: 'integer'}),
    rowCount: Object.freeze({type: 'integer'}),
    stepCount: Object.freeze({type: 'integer'}),
  }),
  type: 'record',
});

const ROLLUP_PARTIAL_SCHEMA = Object.freeze({
  fields: Object.freeze({
    count: Object.freeze({type: 'integer'}),
    orderSensitiveDigest: Object.freeze({type: 'integer'}),
    stepCount: Object.freeze({type: 'integer'}),
    sumCents: Object.freeze({type: 'integer'}),
    weightSum: Object.freeze({type: 'integer'}),
    weightedNumerator: Object.freeze({type: 'integer'}),
  }),
  type: 'record',
});

const SHARD_TABLE_DDL =
  'CREATE TABLE ledger_events (' +
  'id INTEGER PRIMARY KEY, ' +
  'event_ts INTEGER NOT NULL, ' +
  'account_code TEXT NOT NULL, ' +
  'amount_cents INTEGER NOT NULL, ' +
  'weight INTEGER NOT NULL)';

const SHARD_INSERT_SQL =
  'INSERT INTO ledger_events ' +
  '(id, event_ts, account_code, amount_cents, weight) ' +
  'VALUES (?, ?, ?, ?, ?)';

const ACCOUNT_CYCLE = Object.freeze(['acct-alpha', 'acct-beta', 'acct-gamma']);

function sha256Prefixed(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function generateDeterministicRows(startId, count) {
  const rows = [];
  for (let idx = 0; idx < count; idx += 1) {
    const id = startId + idx;
    const eventTs = 1700000000 + Math.floor(idx / 3) * 10 + (idx % 3);
    const accountCode = ACCOUNT_CYCLE[id % ACCOUNT_CYCLE.length];
    const amountCents = ((id * 37) % 500) + 25;
    const weight = (id % 5) + 1;
    rows.push(
      Object.freeze({
        account_code: accountCode,
        amount_cents: amountCents,
        event_ts: eventTs,
        id,
        weight,
      }),
    );
  }
  return rows;
}

function computeShardOracle(rows, pageRowBound) {
  const buckets = {
    'acct-alpha': {count: 0, sumCents: 0, weightSum: 0, weightedNumerator: 0},
    'acct-beta': {count: 0, sumCents: 0, weightSum: 0, weightedNumerator: 0},
    'acct-gamma': {count: 0, sumCents: 0, weightSum: 0, weightedNumerator: 0},
  };
  let orderSensitiveDigest = 0;
  for (const row of rows) {
    const amount = row.amount_cents;
    orderSensitiveDigest =
      (orderSensitiveDigest * DIGEST_MULTIPLIER + row.id * 17 + amount) %
      DIGEST_MODULO;
    const b = buckets[row.account_code];
    b.count += 1;
    b.sumCents += amount;
    b.weightSum += row.weight;
    b.weightedNumerator += amount * row.weight;
  }
  const stepCount = rows.length === 0 ? 0 : Math.ceil(rows.length / pageRowBound);
  return {accounts: buckets, orderSensitiveDigest, rowCount: rows.length, stepCount};
}

function computeClusterOracle(partitionRowsMap, pageRowBound) {
  const merged = {
    'acct-alpha': {count: 0, sumCents: 0, weightSum: 0, weightedNumerator: 0},
    'acct-beta': {count: 0, sumCents: 0, weightSum: 0, weightedNumerator: 0},
    'acct-gamma': {count: 0, sumCents: 0, weightSum: 0, weightedNumerator: 0},
  };
  const shardDigests = [];
  let totalSteps = 0;
  let totalRows = 0;
  for (const rows of Object.values(partitionRowsMap)) {
    const shard = computeShardOracle(rows, pageRowBound);
    shardDigests.push(shard.orderSensitiveDigest);
    totalSteps += shard.stepCount;
    totalRows += shard.rowCount;
    for (const [acct, stats] of Object.entries(shard.accounts)) {
      merged[acct].count += stats.count;
      merged[acct].sumCents += stats.sumCents;
      merged[acct].weightSum += stats.weightSum;
      merged[acct].weightedNumerator += stats.weightedNumerator;
    }
  }
  shardDigests.sort((a, b) => a - b);
  return {
    accounts: Object.entries(merged).map(([key, stats]) => ({
      count: stats.count, key, totalCents: stats.sumCents,
      weightedAverage: stats.weightSum > 0 ? stats.weightedNumerator / stats.weightSum : 0,
    })),
    shardDigests, totalRows, totalSteps,
  };
}

function buildQ3ServiceSource() {
  return `import {Hono} from 'hono';
import {defineService, distributed, sql} from 'lagrange-server/authoring';

const pagedRollup = distributed({
  statement: sql\`${SELECTOR_SQL}\`,
  pageKey: ${JSON.stringify(PAGE_KEY_COLUMNS)},
  stateSchema: ${JSON.stringify(ROLLUP_STATE_SCHEMA)},
  partialSchema: ${JSON.stringify(ROLLUP_PARTIAL_SCHEMA)},
  init() {
    return {
      alphaCents: 0, alphaCount: 0, alphaWeight: 0, alphaWeightedNum: 0,
      betaCents: 0, betaCount: 0, betaWeight: 0, betaWeightedNum: 0,
      gammaCents: 0, gammaCount: 0, gammaWeight: 0, gammaWeightedNum: 0,
      orderSensitiveDigest: 0, rowCount: 0, stepCount: 0,
    };
  },
  step(state, rows) {
    let {
      alphaCents, alphaCount, alphaWeight, alphaWeightedNum,
      betaCents, betaCount, betaWeight, betaWeightedNum,
      gammaCents, gammaCount, gammaWeight, gammaWeightedNum,
      orderSensitiveDigest, rowCount, stepCount,
    } = state;
    for (const row of rows) {
      const amount = Number(row.amount_cents);
      const weight = Number(row.weight);
      const id = Number(row.id);
      orderSensitiveDigest =
        (orderSensitiveDigest * ${DIGEST_MULTIPLIER} + id * 17 + amount) %
        ${DIGEST_MODULO};
      rowCount += 1;
      if (row.account_code === 'acct-alpha') {
        alphaCents += amount; alphaCount += 1;
        alphaWeight += weight; alphaWeightedNum += amount * weight;
      } else if (row.account_code === 'acct-beta') {
        betaCents += amount; betaCount += 1;
        betaWeight += weight; betaWeightedNum += amount * weight;
      } else {
        gammaCents += amount; gammaCount += 1;
        gammaWeight += weight; gammaWeightedNum += amount * weight;
      }
    }
    return {
      alphaCents, alphaCount, alphaWeight, alphaWeightedNum,
      betaCents, betaCount, betaWeight, betaWeightedNum,
      gammaCents, gammaCount, gammaWeight, gammaWeightedNum,
      orderSensitiveDigest, rowCount, stepCount: stepCount + 1,
    };
  },
  finish(state, _args, {emit}) {
    emit('acct-alpha', {
      count: state.alphaCount, orderSensitiveDigest: state.orderSensitiveDigest,
      stepCount: state.stepCount, sumCents: state.alphaCents,
      weightSum: state.alphaWeight, weightedNumerator: state.alphaWeightedNum,
    });
    emit('acct-beta', {
      count: state.betaCount, orderSensitiveDigest: 0, stepCount: 0,
      sumCents: state.betaCents, weightSum: state.betaWeight,
      weightedNumerator: state.betaWeightedNum,
    });
    emit('acct-gamma', {
      count: state.gammaCount, orderSensitiveDigest: 0, stepCount: 0,
      sumCents: state.gammaCents, weightSum: state.gammaWeight,
      weightedNumerator: state.gammaWeightedNum,
    });
    return {
      orderSensitiveDigest: state.orderSensitiveDigest,
      rowCount: state.rowCount, stepCount: state.stepCount,
    };
  },
  reduce(partials) {
    const merged = new Map();
    const shardDigests = [];
    let totalSteps = 0;
    for (const [key, partial] of partials) {
      if (key === 'acct-alpha') {
        shardDigests.push(partial.orderSensitiveDigest);
        totalSteps += partial.stepCount;
      }
      const acc = merged.get(key) || {
        count: 0, key, sumCents: 0, weightSum: 0, weightedNumerator: 0,
      };
      acc.count += partial.count;
      acc.sumCents += partial.sumCents;
      acc.weightSum += partial.weightSum;
      acc.weightedNumerator += partial.weightedNumerator;
      merged.set(key, acc);
    }
    shardDigests.sort((a, b) => a - b);
    const accounts = Array.from(merged.values()).map((acc) => ({
      count: acc.count, key: acc.key, totalCents: acc.sumCents,
      weightedAverage: acc.weightSum > 0 ? acc.weightedNumerator / acc.weightSum : 0,
    }));
    const totalRows = accounts.reduce((sum, a) => sum + a.count, 0);
    return {accounts, shardDigests, totalRows, totalSteps};
  },
});

const app = new Hono();
app.get('/rollup', async (c) => c.json(await c.env.lagrange.call(pagedRollup, {})));

export default defineService({
  name: '${SERVICE_NAME}',
  version: '${SERVICE_VERSION}',
  operations: {pagedRollup},
  fetch: app.fetch,
});
`;
}

function createDiskBackedCoordinationHarness(dbDir, nowProvider = () => Date.now()) {
  const coordDbPath = path.join(
    dbDir,
    `coord-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
  const db = new Database(coordDbPath);
  db.pragma('journal_mode = WAL');
  db.exec(
    `CREATE TABLE ${COORDINATION_TABLE} (` +
    'invocation_id TEXT NOT NULL, ' +
    'slot_id INTEGER NOT NULL, ' +
    'replica_id TEXT NOT NULL, ' +
    'lease_expires_at INTEGER NOT NULL, ' +
    'partial_json TEXT NOT NULL, ' +
    'computed_at INTEGER NOT NULL, ' +
    'PRIMARY KEY (invocation_id, slot_id))',
  );
  db.exec(
    `CREATE TABLE ${RESULT_TABLE} (` +
    'result_id TEXT PRIMARY KEY, ' +
    'result_json TEXT NOT NULL, ' +
    'computed_at INTEGER NOT NULL, ' +
    'source_snapshot_json TEXT NOT NULL)',
  );

  const executeInternal = async (sqlText) => {
    const trimmed = sqlText.trim();
    if (trimmed.startsWith('SELECT ')) {
      return {results: db.prepare(trimmed).all(), success: true};
    }
    const info = db.prepare(trimmed).run();
    return {changes: info.changes, success: true};
  };

  return {
    close() {
      db.close();
    },
    coordinator: createCallCellReduceCoordinator({
      coordinationTable: COORDINATION_TABLE,
      executeInternal,
      leaseMs: LEASE_MS,
      nowProvider,
      resultTable: RESULT_TABLE,
      slotCount: SLOT_COUNT,
    }),
    db,
    executeInternal,
  };
}

function createTableRoutingFixture(partitionIds = [
  PARTITION_ONE,
  PARTITION_TWO,
  PARTITION_THREE,
]) {
  const tableInfo = Object.freeze({
    active_partition_version: 1,
    partition_key: 'id',
    partition_key_type: 'INTEGER',
    primary_key: 'id',
    table_id: TABLE_NAME,
    table_name: TABLE_NAME,
  });
  const partitionRows = Object.freeze(
    partitionIds.map((partitionId, idx) =>
      Object.freeze({
        leader_node_id: NODE_ID,
        max_value: idx < partitionIds.length - 1 ? (idx + 1) * 10000 : null,
        min_value: idx === 0 ? null : idx * 10000,
        partition_id: partitionId,
        partition_key_end: idx < partitionIds.length - 1 ?
          String((idx + 1) * 10000) :
          null,
        partition_key_start: idx === 0 ? null : String(idx * 10000),
        partition_version: 1,
        state: 'NORMAL',
        table_id: TABLE_NAME,
        table_name: TABLE_NAME,
      }),
    ),
  );
  const systemCache = {
    get(tableName, key) {
      if (tableName === SYSTEM_TABLE_NAME.TABLES && key === TABLE_NAME) {
        return tableInfo;
      }
      if (tableName === SYSTEM_TABLE_NAME.PARTITIONS) {
        return partitionRows.find((p) => p.partition_id === key) || null;
      }
      return null;
    },
    getAll(tableName) {
      return tableName === SYSTEM_TABLE_NAME.PARTITIONS ? [...partitionRows] : [];
    },
  };
  const partitionResolver = new PartitionResolver({systemCache});
  const queryExecutor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: {send: async () => ({success: true})},
    nodeId: NODE_ID,
    partitionResolver,
    systemCache,
  });
  return {partitionResolver, partitionRows, queryExecutor, tableInfo};
}

function createDiskBackedWalPartitions(dbDir, partitionRowsMap) {
  const databases = new Map();
  const partitionServices = new Map();

  for (const [partitionId, rows] of Object.entries(partitionRowsMap)) {
    const dbPath = path.join(
      dbDir,
      `${partitionId}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
    );
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(SHARD_TABLE_DDL);
    const insertMany = db.transaction((items) => {
      const stmt = db.prepare(SHARD_INSERT_SQL);
      for (const row of items) {
        stmt.run(
          row.id,
          row.event_ts,
          row.account_code,
          row.amount_cents,
          row.weight,
        );
      }
    });
    insertMany(rows);
    databases.set(partitionId, db);
    partitionServices.set(partitionId, {
      dbPath,
      executeQuery: async (renderedSql, boundParams = []) => {
        const matchedRows = db.prepare(renderedSql).all(...boundParams);
        return {
          count: matchedRows.length,
          partitionId,
          rows: matchedRows,
          success: true,
        };
      },
      initialized: true,
      isLeader: true,
      partitionId,
      raftRole: 'leader',
      status: 'active',
      storageBackend: {db, dbPath},
    });
  }

  return {
    close() {
      for (const db of databases.values()) {
        if (db.open) db.close();
      }
    },
    databases,
    partitionServices,
  };
}

function buildRuntimeStack({
  cellRuntime,
  componentBytes,
  coordHarness,
  pageRowBound = BATCH_ROW_BOUND,
  partitionServices,
  routingFixture,
}) {
  const manifest = {
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: ARTIFACT_REF,
      size_bytes: componentBytes.byteLength,
      type: 'oci',
    },
    exports: [
      {interface: 'request_v2', name: 'handle-request'},
      {interface: 'call_v2', name: 'run'},
    ],
    name: SERVICE_NAME,
    runtime: {kind: 'wasm_component'},
    schema_version: 3,
    version: SERVICE_VERSION,
  };
  const manifestDigest = sha256Prefixed(canonicalJson(manifest));
  const normalizedBinding = normalizeDeploymentBinding({
    budgets: {
      context_bytes: 8192,
      cpu_time_ms: 5000,
      input_bytes: 4194304,
      memory_bytes: 134217728,
      output_bytes: 262144,
      wall_time_ms: 30000,
    },
    name: BINDING_NAME,
    schema_version: 3,
    source: {
      kind: 'call',
      name: BINDING_NAME,
      statement: SELECTOR_SQL,
    },
    target: {
      handler_id: 'pagedRollup',
      interface: 'call_v2',
      manifest_digest: manifestDigest,
      package_id: PACKAGE_ID,
    },
  });
  const boundDeclaration = bindDeploymentArtifact(normalizedBinding, {
    manifest,
    manifestDigest,
    packageId: PACKAGE_ID,
  });
  const bindingRow = buildBindingRow({
    createdAt: 1700000000000,
    declaration: boundDeclaration,
    generation: 1,
    securityContext: SECURITY_CONTEXT,
  });
  const projectedBinding = projectBinding(bindingRow);
  const compiledDef = buildRequestBindingServiceDefinition(bindingRow, {
    artifactDigest: ARTIFACT_DIGEST,
    manifest,
    manifestDigest,
    packageId: PACKAGE_ID,
  });
  const baseActiveDef = buildActivatedRequestBindingServiceDefinition(
    compiledDef,
    projectedBinding,
  );
  const activeDef = Object.freeze({
    ...baseActiveDef,
    pageKey: PAGE_KEY_COLUMNS,
    pageRowBound,
    stateSchema: ROLLUP_STATE_SCHEMA,
  });
  const serviceId = deriveRequestServiceDefinitionId(
    projectedBinding.bindingVersionId,
  );
  const replicaId = `${serviceId}-r1`;

  const cache = {
    get(tableName, key) {
      if (
        tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS &&
        key === serviceId
      ) {
        return activeDef;
      }
      return routingFixture.queryExecutor.systemCache.get(tableName, key);
    },
    getAll(tableName) {
      if (tableName === SYSTEM_TABLE_NAME.SERVICE_BINDINGS) return [bindingRow];
      if (tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS) return [activeDef];
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
        return [{
          node_id: NODE_ID,
          service_id: replicaId,
          service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          status: ReplicaStatus.ACTIVE,
        }];
      }
      return routingFixture.queryExecutor.systemCache.getAll(tableName);
    },
  };

  const routeResolver = new CallBindingRouteResolver({
    systemTableCacheProvider: () => cache,
  });
  const handler = {
    callBindingRouteResolver: routeResolver,
    cdcIntegrationService: {
      sqlQueryEngine: {
        parse: (s) => new SQLParser(s).parse(),
        queryExecutor: routingFixture.queryExecutor,
      },
    },
    localReplicas: new Map([[
      replicaId,
      {
        entityId: serviceId,
        replicaHandle: {serviceId},
        status: ReplicaStatus.ACTIVE,
      },
    ]]),
    nodeId: NODE_ID,
    partitionServicesProvider: () => partitionServices,
    serviceRuntimeLifecycle: {
      health: async () => ({status: HEALTH_STATUS.HEALTHY}),
      invoke: async (handle, req) => {
        const res = await cellRuntime.invoke(
          handle.serviceId,
          req.args,
          () => [],
          () => {},
          () => {},
          {
            callContext: req.callCell,
            deadlineMs: req.deadlineMs,
            exportName: req.exportName,
          },
        );
        return typeof res === 'object' && res !== null && 'value' in res ?
          {
            partials: (res.partials || []).map(([key, partial]) => ({
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${key}`,
              partial,
            })),
            result: res.value,
          } :
          res;
      },
    },
    systemTableCache: cache,
  };

  const statementAdapter = new CallCellStatementAdapter({
    deadlineMs: DEADLINE_WINDOW_MS,
    routeResolver,
    serviceDispatcher: {
      dispatch: async (envelope) => ({
        acknowledged: true,
        answer: await handleCallCellInvocation(handler, envelope),
      }),
    },
  });
  const batchExecutor = createCallCellBatchExecutor({
    partitionResolver: routingFixture.partitionResolver,
    partitionsProvider: () => [...routingFixture.partitionRows],
    queryExecutor: routingFixture.queryExecutor,
    sqlParser: {parse: (s) => new SQLParser(s).parse()},
  });
  const progressTracker = createPagedShardProgressTracker({
    coordinationTable: COORDINATION_TABLE,
    executeInternal: coordHarness.executeInternal,
  });
  const invoker = new CallCellInvoker({
    batchByteBound: BATCH_BYTE_BOUND,
    batchExecutor,
    batchRowBound: pageRowBound,
    emitBudget: EMIT_BUDGET,
    nestedCallBudget: NESTED_CALL_BUDGET,
    partialLimit: PARTIAL_LIMIT,
    partitionTopology: {
      resolveShardHost: (_tbl, partitionId) =>
        Object.freeze({
          activePartitionVersion: 1,
          hostNodeId: NODE_ID,
          partitionId,
          state: 'NORMAL',
          tableName: TABLE_NAME,
        }),
    },
    progressTracker,
    reduceCoordinator: coordHarness.coordinator,
    routeResolver,
    statementAdapter,
  });

  return {
    budgets: normalizedBinding.budgets,
    handler,
    invoker,
    progressTracker,
    replicaId,
    routeResolver,
    serviceId,
    statementAdapter,
  };
}

describe(`Q3 — Shard-local paged execution (${QUEST_ID})`, () => {
  let tempDir;
  let componentBytes;
  let cellRuntime;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lagrange-q3-'));
    const projectDir = path.join(tempDir, 'service');
    await fs.mkdir(projectDir, {recursive: true});
    const repoNodeModules = path.resolve(process.cwd(), 'node_modules');
    const localNodeModules = path.join(projectDir, 'node_modules');
    await fs.mkdir(localNodeModules, {recursive: true});
    await fs.symlink(
      path.join(repoNodeModules, 'hono'),
      path.join(localNodeModules, 'hono'),
      'dir',
    );
    await fs.symlink(
      process.cwd(),
      path.join(localNodeModules, 'lagrange-server'),
      'dir',
    );
    const serviceModulePath = path.join(projectDir, 'lagrange.service.js');
    const entryPath = path.join(
      projectDir,
      '.lagrange',
      'generated',
      'entry.js',
    );
    await fs.writeFile(serviceModulePath, buildQ3ServiceSource(), 'utf8');
    await emitServiceEntry({
      moduleSpecifier: serviceModulePath,
      outputPath: entryPath,
      world: SERVICE_WORLD_V2,
    });
    const built = await buildServiceComponent({
      entryPath,
      worldName: SERVICE_WORLD_V2,
    });
    componentBytes = new Uint8Array(built.component);
    cellRuntime = new WasiComponentCellRuntime();
  });

  after(async () => {
    if (tempDir) {
      await fs.rm(tempDir, {force: true, recursive: true});
    }
  });

  it('enforces deterministic keyset ordering, cursor progression, stateSchema validation, and typings projection', () => {
    const keyCols = resolveDeterministicKeyColumns(SELECTOR_SQL, {
      pageKey: PAGE_KEY_COLUMNS,
    });
    assert.deepEqual(keyCols, ['event_ts', 'id']);
    assert.equal(PAGED_CONSISTENCY_SCOPE, 'per_shard_retained_read_view');

    assert.throws(
      () =>
        resolveDeterministicKeyColumns(
          'SELECT id, amount_cents FROM ledger_events',
          {},
        ),
      (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.KEYSET_ORDER_REQUIRED,
    );
    assert.throws(
      () =>
        resolveDeterministicKeyColumns(
          'SELECT id FROM ledger_events ORDER BY rowid ASC',
          {pageKey: ['rowid']},
        ),
      (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.KEYSET_ORDER_REQUIRED,
    );

    assert.equal(compareKeyTuples([100, 1], [100, 2]), -1);
    assert.equal(compareKeyTuples([100, 2], [100, 2]), 0);
    assert.equal(compareKeyTuples([101, 1], [100, 99]), 1);

    const cursor0 = buildKeysetPageCursor({
      keyColumns: keyCols,
      lastKeyTuple: [1700000010, 5],
      pageIndex: 0,
      readViewId: 'rv-1',
    });
    assert.equal(cursor0.version, CURSOR_VERSION);
    assert.equal(cursor0.comparatorVersion, COMPARATOR_VERSION);

    const cursor1 = buildKeysetPageCursor({
      keyColumns: keyCols,
      lastKeyTuple: [1700000010, 9],
      pageIndex: 1,
      readViewId: 'rv-1',
    });
    validateKeysetPageCursor(cursor1, {
      keyColumns: keyCols,
      previousCursor: cursor0,
      readViewId: 'rv-1',
    });

    assert.throws(
      () =>
        validateKeysetPageCursor(cursor0, {
          keyColumns: keyCols,
          previousCursor: cursor1,
          readViewId: 'rv-1',
        }),
      (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
    );

    assert.throws(
      () =>
        validateKeysetPageCursor(cursor1, {
          keyColumns: keyCols,
          previousCursor: cursor0,
          readViewId: 'rv-different',
        }),
      (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
    );

    const queryPlan = buildKeysetPageQuery({
      boundParameters: [],
      keyColumns: keyCols,
      lastKeyTuple: cursor0.lastKeyTuple,
      pageRowBound: 100,
      statement: SELECTOR_SQL,
    });
    assert.match(queryPlan.sql, /WHERE \(\(event_ts > \?\)/u);
    assert.match(queryPlan.sql, /LIMIT 100$/u);
    assert.deepEqual(queryPlan.parameters, [1700000010, 1700000010, 5]);

    const pagedOp = distributed({
      finish: (state, _args, {emit}) => {
        emit('k', state);
        return state;
      },
      init: () => ({count: 0, orderSensitiveDigest: 0}),
      pageKey: PAGE_KEY_COLUMNS,
      pageRowBound: 512,
      partialSchema: {
        fields: {
          count: {type: 'integer'},
          orderSensitiveDigest: {type: 'integer'},
        },
        type: 'record',
      },
      reduce: (partials) => partials.length,
      stateSchema: {
        fields: {
          count: {type: 'integer'},
          orderSensitiveDigest: {type: 'integer'},
        },
        type: 'record',
      },
      statement: sql`SELECT event_ts, id FROM ledger_events ORDER BY event_ts ASC, id ASC`,
      step: (state, rows) => ({
        count: state.count + rows.length,
        orderSensitiveDigest: state.orderSensitiveDigest + rows.length,
      }),
    });
    const svc = defineService({
      fetch: () => new globalThis.Response('ok'),
      name: SERVICE_NAME,
      operations: {pagedOp},
      version: SERVICE_VERSION,
    });
    const normalized = normalizeServiceDefinition(svc, {
      target: IR_TARGET.SERVICE_CELL_V2,
    });
    assert.equal(normalized.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.deepEqual(normalized.ir.operations[0].pageKey, ['event_ts', 'id']);
    assert.equal(normalized.ir.operations[0].pageRowBound, 512);

    const dts = typingsSource(normalized.ir);
    assert.match(dts, /export type PagedOpState = \{/u);
    assert.match(dts, /init\(args: Record<string, unknown>\): PagedOpState;/u);
    assert.match(
      dts,
      /step\(state: PagedOpState, page: readonly PagedOpRow\[\], args: Record<string, unknown>\): PagedOpState;/u,
    );
    assert.match(
      dts,
      /finish\(state: PagedOpState, args: Record<string, unknown>, context: \{ emit\(key: string \| number, partial: PagedOpPartial\): void \}\): unknown;/u,
    );

    const invalidStateOp = distributed({
      finish: (s) => s,
      init: () => ({}),
      reduce: () => 0,
      stateSchema: {fields: {}, type: 'record'},
      statement: sql`SELECT id FROM ledger_events ORDER BY id ASC`,
      step: (s) => s,
    });
    const invalidSvc = defineService({
      fetch: () => new globalThis.Response('ok'),
      name: SERVICE_NAME,
      operations: {invalidStateOp},
      version: SERVICE_VERSION,
    });
    const invalidRes = normalizeServiceDefinition(invalidSvc, {
      target: IR_TARGET.SERVICE_CELL_V2,
    });
    assert.equal(invalidRes.status, SERVICE_SOURCE_STATUS.REJECTED);
    assert.equal(
      invalidRes.errors[0].code,
      SERVICE_SOURCE_ERROR_CODE.INVALID_STATE_SCHEMA,
    );
  });

  it('executes compiled service-cell-v2 across 3 disk-backed SQLite WAL shards (>4,096 rows/shard, 10,200 total rows) and matches the oracle across uneven and 4,096 page bounds', async () => {
    const partitionRowsMap = {
      [PARTITION_ONE]: generateDeterministicRows(1, P0_ROW_COUNT),
      [PARTITION_TWO]: generateDeterministicRows(10001, P1_ROW_COUNT),
      [PARTITION_THREE]: generateDeterministicRows(20001, P2_ROW_COUNT),
    };
    const walHarness = createDiskBackedWalPartitions(tempDir, partitionRowsMap);
    const coordHarness = createDiskBackedCoordinationHarness(tempDir);
    const routingFixture = createTableRoutingFixture();

    const stackUneven = buildRuntimeStack({
      cellRuntime,
      componentBytes,
      coordHarness,
      pageRowBound: UNEVEN_PAGE_ROW_BOUND,
      partitionServices: walHarness.partitionServices,
      routingFixture,
    });

    await cellRuntime.start({
      budgets: stackUneven.budgets,
      bytes: componentBytes,
      capabilities: [],
      exportName: RUN_EXPORT,
      serviceId: stackUneven.serviceId,
      world: CALL_WORLD_NAME,
    });

    try {
      const outcomeUneven = JSON.parse(
        await stackUneven.invoker.invoke({
          argumentsJson: '{}',
          deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
          invocationId: 'inv-q3-uneven-10200',
          name: BINDING_NAME,
          securityContext: SECURITY_CONTEXT,
        }),
      );

      const expectedUneven = computeClusterOracle(
        partitionRowsMap,
        UNEVEN_PAGE_ROW_BOUND,
      );
      assert.equal(outcomeUneven.totalRows, 10200);
      assert.equal(
        outcomeUneven.totalSteps,
        expectedUneven.totalSteps,
        'uneven pageRowBound (1100) must execute 5 + 4 + 2 = 11 step calls',
      );
      assert.equal(outcomeUneven.totalSteps, 11);
      assert.deepEqual(outcomeUneven.shardDigests, expectedUneven.shardDigests);
      assert.deepEqual(outcomeUneven.accounts, expectedUneven.accounts);

      const stack4096 = buildRuntimeStack({
        cellRuntime,
        componentBytes,
        coordHarness,
        pageRowBound: BATCH_ROW_BOUND,
        partitionServices: walHarness.partitionServices,
        routingFixture,
      });
      const outcome4096 = JSON.parse(
        await stack4096.invoker.invoke({
          argumentsJson: '{}',
          deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
          invocationId: 'inv-q3-bound4096-10200',
          name: BINDING_NAME,
          securityContext: SECURITY_CONTEXT,
        }),
      );

      const expected4096 = computeClusterOracle(
        partitionRowsMap,
        BATCH_ROW_BOUND,
      );
      assert.equal(outcome4096.totalRows, 10200);
      assert.equal(
        outcome4096.totalSteps,
        5,
        '4096 pageRowBound must execute 2 + 2 + 1 = 5 step calls across 4500/4200/1500 rows',
      );
      assert.deepEqual(outcome4096.shardDigests, expected4096.shardDigests);
      assert.deepEqual(outcome4096.accounts, expected4096.accounts);
    } finally {
      await cellRuntime.stop(stackUneven.serviceId);
      coordHarness.close();
      walHarness.close();
    }
  });

  it('handles empty shards (0 rows), single-page shards, and exact-boundary shards without extra empty step calls', async () => {
    const exactBound = 250;
    const partitionRowsMap = {
      [PARTITION_ONE]: [],
      [PARTITION_TWO]: generateDeterministicRows(10001, 120),
      [PARTITION_THREE]: generateDeterministicRows(20001, exactBound),
    };
    const walHarness = createDiskBackedWalPartitions(tempDir, partitionRowsMap);
    const coordHarness = createDiskBackedCoordinationHarness(tempDir);
    const routingFixture = createTableRoutingFixture();
    const stack = buildRuntimeStack({
      cellRuntime,
      componentBytes,
      coordHarness,
      pageRowBound: exactBound,
      partitionServices: walHarness.partitionServices,
      routingFixture,
    });

    await cellRuntime.start({
      budgets: stack.budgets,
      bytes: componentBytes,
      capabilities: [],
      exportName: RUN_EXPORT,
      serviceId: stack.serviceId,
      world: CALL_WORLD_NAME,
    });

    try {
      const outcome = JSON.parse(
        await stack.invoker.invoke({
          argumentsJson: '{}',
          deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
          invocationId: 'inv-q3-boundaries',
          name: BINDING_NAME,
          securityContext: SECURITY_CONTEXT,
        }),
      );

      assert.equal(outcome.totalRows, 370);
      assert.equal(
        outcome.totalSteps,
        2,
        '0-row shard runs 0 steps, 120-row shard runs 1 step, 250-row exact-boundary shard runs 1 step',
      );
    } finally {
      await cellRuntime.stop(stack.serviceId);
      coordHarness.close();
      walHarness.close();
    }
  });

  it('preserves SQLite WAL retained read-view snapshot isolation under concurrent INSERT/UPDATE/DELETE and fails closed with READ_VIEW_UNAVAILABLE when unsupported', async () => {
    const initialRows = generateDeterministicRows(1, 300);
    const walHarness = createDiskBackedWalPartitions(tempDir, {
      [PARTITION_ONE]: initialRows,
    });
    const manager = createShardReadViewManager();
    const handler = {nodeId: NODE_ID, readViewManager: manager};
    const partitionService = walHarness.partitionServices.get(PARTITION_ONE);
    const writerDb = walHarness.databases.get(PARTITION_ONE);
    const route = {
      bindingVersionId: 'bv-wal-iso',
      pageKey: PAGE_KEY_COLUMNS,
      statement: SELECTOR_SQL,
    };
    const invocation = {
      callCell: {batchByteBound: BATCH_BYTE_BOUND, batchRowBound: 100},
      deadlineMs: Date.now() + 30000,
      id: 'inv-wal-iso',
    };
    const makePayload = (pageIndex, pageCursor = undefined, readViewId = undefined) => ({
      pageRequest: {
        attemptId: 'attempt-1',
        ...(pageCursor ? {pageCursor} : {}),
        pageIndex,
        pageKey: PAGE_KEY_COLUMNS,
        pageRowBound: 100,
        ...(readViewId ? {readViewId} : {}),
      },
      partitionFence: {partitionVersion: 1},
      partitionId: PARTITION_ONE,
    });

    try {
      const page0 = await executeLocalShardPageRead({
        boundParameters: [], handler, invocation, partitionService,
        payload: makePayload(0), route,
      });
      assert.equal(page0.rows.length, 100);
      assert.equal(page0.pageMeta.hasMore, true);
      const readViewId = page0.pageMeta.readViewId;
      assert.equal(manager.stats().activeViewCount, 1);

      writerDb
        .prepare(SHARD_INSERT_SQL)
        .run(99999, 1700000500, 'acct-alpha', 999999, 1);
      writerDb
        .prepare('UPDATE ledger_events SET amount_cents = 888888 WHERE id > 100')
        .run();
      writerDb.prepare('DELETE FROM ledger_events WHERE id > 250').run();

      const page1 = await executeLocalShardPageRead({
        boundParameters: [], handler, invocation, partitionService,
        payload: makePayload(1, page0.pageMeta.nextCursor, readViewId), route,
      });
      assert.equal(page1.rows.length, 100);
      assert.equal(page1.pageMeta.hasMore, true);

      const page2 = await executeLocalShardPageRead({
        boundParameters: [], handler, invocation, partitionService,
        payload: makePayload(2, page1.pageMeta.nextCursor, readViewId), route,
      });
      assert.equal(page2.rows.length, 100);
      assert.equal(page2.pageMeta.hasMore, false);
      assert.equal(manager.stats().activeViewCount, 0);

      const combinedRows = [...page0.rows, ...page1.rows, ...page2.rows];
      assert.equal(combinedRows.length, 300);
      assert.deepEqual(
        combinedRows.map((r) => ({amount_cents: r.amount_cents, id: r.id})),
        initialRows.map((r) => ({amount_cents: r.amount_cents, id: r.id})),
      );

      await assert.rejects(
        () =>
          executeLocalShardPageRead({
            boundParameters: [], handler,
            invocation: {...invocation, id: 'inv-unsupported'},
            partitionService: {partitionId: 'unsupported-partition'},
            payload: {...makePayload(0), partitionId: 'unsupported-partition'},
            route,
          }),
        (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
      );
    } finally {
      manager.releaseAttemptReadViews('inv-wal-iso', 'attempt-1');
      walHarness.close();
    }
  });

  it('commits atomic page progress via conditional SQL UPDATE, handles idempotent replay, rejects delivery conflicts, resumes from Page 1, and triggers wholeAttemptDiscard on lost readViewId', async () => {
    const coordHarness = createDiskBackedCoordinationHarness(tempDir);
    const tracker = createPagedShardProgressTracker({
      coordinationTable: COORDINATION_TABLE,
      executeInternal: coordHarness.executeInternal,
    });

    try {
      await coordHarness.coordinator.seedInvocation('inv-progress-1', [1]);
      await coordHarness.coordinator.acquireReduceLease('inv-progress-1', 'rep-1', 1);

      const cursorAfter0 = buildKeysetPageCursor({
        keyColumns: PAGE_KEY_COLUMNS,
        lastKeyTuple: [1700000010, 10],
        pageIndex: 0,
        readViewId: 'rv-p1',
      });
      const baseTransition = {
        attemptId: 'attempt-1', bindingVersionId: 'bv-1', bytesConsumed: 256,
        deliveryId: 'inv-progress-1:slot-1:attempt-1:page-0',
        expectedFencingRevision: 0, hasMore: true, inputDigest: 'in-digest-0',
        invocationId: 'inv-progress-1', keyColumns: PAGE_KEY_COLUMNS,
        nextCursor: cursorAfter0, operationId: 'pagedRollup', pageIndex: 0,
        pagesConsumed: 1, parametersDigest: null, partitionId: PARTITION_ONE,
        readViewId: 'rv-p1', replicaId: 'rep-1', rowsConsumed: 10, slotId: 1,
        stateJson: '{"count":10,"orderSensitiveDigest":123,"stepCount":1}',
      };

      const firstCommit = await tracker.commitPageProgress(baseTransition);
      assert.equal(firstCommit.replayed, false);
      assert.equal(firstCommit.progress.fencingRevision, 1);

      const replayCommit = await tracker.commitPageProgress(baseTransition);
      assert.equal(replayCommit.replayed, true);

      const dispatchedPages = [];
      const resumedOutcome = await executePagedShardSlot({
        dispatchPage: async (pageReq) => {
          dispatchedPages.push(pageReq.pageIndex);
          const prev = JSON.parse(pageReq.stateJson);
          const nextState = {
            count: prev.count + 5,
            orderSensitiveDigest: prev.orderSensitiveDigest + 50,
            stepCount: prev.stepCount + 1,
          };
          return {
            componentResult: JSON.stringify({
              __lagrangePagedOutcome: 'finished',
              stateJson: JSON.stringify(nextState),
              value: nextState,
            }),
            pageMeta: {
              consistencyScope: PAGED_CONSISTENCY_SCOPE, hasMore: false,
              inputDigest: 'in-digest-1', keyColumns: PAGE_KEY_COLUMNS,
              nextCursor: buildKeysetPageCursor({
                keyColumns: PAGE_KEY_COLUMNS, lastKeyTuple: [1700000020, 15],
                pageIndex: 1, readViewId: pageReq.readViewId,
              }),
              pageBytes: 128, pageIndex: pageReq.pageIndex,
              readViewId: pageReq.readViewId, rowCount: 5,
            },
            partials: [{
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}acct-alpha`,
              partial: JSON.stringify(nextState),
            }],
            replicaId: 'rep-1',
          };
        },
        progressTracker: tracker,
        reduceCoordinator: coordHarness.coordinator,
        request: {
          argumentsJson: '{}', attemptId: 'attempt-1',
          deadlineMs: Date.now() + 30000, invocationId: 'inv-progress-1',
          name: BINDING_NAME,
          resolution: {
            bindingVersionId: 'bv-1', handlerId: 'pagedRollup', replicaId: 'rep-1',
            stateSchema: {
              fields: {
                count: {type: 'integer'}, orderSensitiveDigest: {type: 'integer'},
                stepCount: {type: 'integer'},
              },
              type: 'record',
            },
          },
          shard: {partitionId: PARTITION_ONE}, slotId: 1,
        },
      });
      assert.deepEqual(dispatchedPages, [1]);
      assert.equal(resumedOutcome.pagesConsumed, 2);
      assert.equal(resumedOutcome.rowsConsumed, 15);

      await coordHarness.coordinator.seedInvocation('inv-conflict-1', [1]);
      await coordHarness.coordinator.acquireReduceLease('inv-conflict-1', 'rep-1', 1);
      await tracker.commitPageProgress({
        ...baseTransition,
        deliveryId: 'inv-conflict-1:s1:p0',
        invocationId: 'inv-conflict-1',
        stateJson: '{"count":10}',
      });
      await assert.rejects(
        () =>
          tracker.commitPageProgress({
            ...baseTransition,
            deliveryId: 'inv-conflict-1:s1:p0',
            invocationId: 'inv-conflict-1',
            stateJson: '{"count":999}',
          }),
        (err) =>
          err.pagedCode === PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT &&
          err.wholeAttemptDiscard === true,
      );
      assert.equal(tracker.isAttemptFenced('inv-conflict-1', 'attempt-1'), true);

      await coordHarness.coordinator.seedInvocation('inv-lost-rv', [1]);
      await assert.rejects(
        () =>
          executePagedShardSlot({
            dispatchPage: async (pageReq) => {
              if (pageReq.pageIndex === 0) {
                return {
                  componentResult: JSON.stringify({
                    __lagrangePagedOutcome: 'stepped', stateJson: '{"count":10}',
                  }),
                  pageMeta: {
                    consistencyScope: PAGED_CONSISTENCY_SCOPE, hasMore: true,
                    inputDigest: 'in-rv-0', keyColumns: PAGE_KEY_COLUMNS,
                    nextCursor: buildKeysetPageCursor({
                      keyColumns: PAGE_KEY_COLUMNS, lastKeyTuple: [1700000010, 10],
                      pageIndex: 0, readViewId: 'rv-ephemeral',
                    }),
                    pageBytes: 200, pageIndex: 0, readViewId: 'rv-ephemeral', rowCount: 10,
                  },
                  partials: [], replicaId: 'rep-1',
                };
              }
              return {
                componentResult: JSON.stringify({
                  __lagrangePagedOutcome: 'finished', stateJson: '{"count":20}',
                }),
                pageMeta: null, partials: [], replicaId: 'rep-1',
              };
            },
            progressTracker: tracker,
            reduceCoordinator: coordHarness.coordinator,
            request: {
              argumentsJson: '{}', attemptId: 'attempt-1',
              deadlineMs: Date.now() + 30000, invocationId: 'inv-lost-rv',
              name: BINDING_NAME, resolution: {replicaId: 'rep-1'},
              shard: {partitionId: PARTITION_ONE}, slotId: 1,
            },
          }),
        (err) =>
          err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST &&
          err.wholeAttemptDiscard === true,
      );
      assert.equal(tracker.isAttemptFenced('inv-lost-rv', 'attempt-1'), true);
      assert.equal(tracker.getShardProgress('inv-lost-rv', 'attempt-1', 1), null);

      const retryAttempt2 = await executePagedShardSlot({
        dispatchPage: async (pageReq) => {
          const isFirst = pageReq.pageIndex === 0;
          const prevCount = pageReq.stateJson ? JSON.parse(pageReq.stateJson).count : 0;
          const nextCount = prevCount + 10;
          return {
            componentResult: JSON.stringify({
              __lagrangePagedOutcome: isFirst ? 'stepped' : 'finished',
              stateJson: JSON.stringify({count: nextCount}),
            }),
            pageMeta: {
              consistencyScope: PAGED_CONSISTENCY_SCOPE, hasMore: isFirst,
              inputDigest: `in-rv2-${pageReq.pageIndex}`, keyColumns: PAGE_KEY_COLUMNS,
              nextCursor: buildKeysetPageCursor({
                keyColumns: PAGE_KEY_COLUMNS,
                lastKeyTuple: [1700000010 + pageReq.pageIndex, 10 + pageReq.pageIndex],
                pageIndex: pageReq.pageIndex, readViewId: 'rv-fresh-attempt2',
              }),
              pageBytes: 200, pageIndex: pageReq.pageIndex,
              readViewId: 'rv-fresh-attempt2', rowCount: 10,
            },
            partials: isFirst ? [] : [{
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}acct-alpha`,
              partial: JSON.stringify({count: nextCount}),
            }],
            replicaId: 'rep-1',
          };
        },
        progressTracker: tracker,
        reduceCoordinator: coordHarness.coordinator,
        request: {
          argumentsJson: '{}', attemptId: 'attempt-2',
          deadlineMs: Date.now() + 30000, invocationId: 'inv-lost-rv',
          name: BINDING_NAME, resolution: {replicaId: 'rep-1'},
          shard: {partitionId: PARTITION_ONE}, slotId: 1,
        },
      });
      assert.equal(retryAttempt2.rowsConsumed, 20);
    } finally {
      coordHarness.close();
    }
  });

  it('enforces per-page and per-shard state, page count, row, byte, and deadline budgets with wholeAttemptDiscard', async () => {
    const tracker = createPagedShardProgressTracker();
    const makeBudgetReq = (attemptId, deadlineMs = Date.now() + 30000) => ({
      argumentsJson: '{}', attemptId, deadlineMs, invocationId: 'inv-budgets',
      name: BINDING_NAME, resolution: {replicaId: 'rep-1'},
      shard: {partitionId: PARTITION_ONE}, slotId: 1,
    });
    const makeDelivery = ({hasMore = false, pageBytes = 100, pageIndex = 0, rowCount = 5, stateJson = '{"c":1}'}) => ({
      componentResult: JSON.stringify({
        __lagrangePagedOutcome: hasMore ? 'stepped' : 'finished',
        stateJson,
      }),
      pageMeta: {
        consistencyScope: PAGED_CONSISTENCY_SCOPE, hasMore,
        inputDigest: `in-b-${pageIndex}`, keyColumns: PAGE_KEY_COLUMNS,
        nextCursor: hasMore ? buildKeysetPageCursor({
          keyColumns: PAGE_KEY_COLUMNS,
          lastKeyTuple: [1700000000 + pageIndex, pageIndex + 1],
          pageIndex, readViewId: 'rv-b',
        }) : null,
        pageBytes, pageIndex, readViewId: 'rv-b', rowCount,
      },
      partials: [], replicaId: 'rep-1',
    });

    await assert.rejects(
      () => executePagedShardSlot({
        dispatchPage: async () => makeDelivery({
          stateJson: JSON.stringify({oversizedPayload: 'x'.repeat(128)}),
        }),
        limits: {maxStateBytes: 32}, progressTracker: tracker,
        reduceCoordinator: null, request: makeBudgetReq('attempt-state-overflow'),
      }),
      (err) =>
        err.pagedCode === PAGED_EXECUTION_ERROR_CODE.STATE_BUDGET_EXCEEDED &&
        err.wholeAttemptDiscard === true,
    );

    await assert.rejects(
      () => executePagedShardSlot({
        dispatchPage: async () => makeDelivery({rowCount: 30}),
        limits: {maxShardRows: 25}, progressTracker: tracker,
        reduceCoordinator: null, request: makeBudgetReq('attempt-rows-overflow'),
      }),
      (err) =>
        err.pagedCode === PAGED_EXECUTION_ERROR_CODE.SHARD_ROW_BUDGET_EXCEEDED &&
        err.wholeAttemptDiscard === true,
    );

    await assert.rejects(
      () => executePagedShardSlot({
        dispatchPage: async () => makeDelivery({pageBytes: 1024}),
        limits: {maxShardBytes: 512}, progressTracker: tracker,
        reduceCoordinator: null, request: makeBudgetReq('attempt-bytes-overflow'),
      }),
      (err) =>
        err.pagedCode === PAGED_EXECUTION_ERROR_CODE.SHARD_BYTE_BUDGET_EXCEEDED &&
        err.wholeAttemptDiscard === true,
    );

    await assert.rejects(
      () => executePagedShardSlot({
        dispatchPage: async (pageReq) => makeDelivery({
          hasMore: true, pageIndex: pageReq.pageIndex,
        }),
        limits: {maxPages: 1}, progressTracker: tracker,
        reduceCoordinator: null, request: makeBudgetReq('attempt-pages-overflow'),
      }),
      (err) =>
        err.pagedCode === PAGED_EXECUTION_ERROR_CODE.PAGE_BUDGET_EXCEEDED &&
        err.wholeAttemptDiscard === true,
    );

    await assert.rejects(
      () => executePagedShardSlot({
        dispatchPage: async () => ({}), progressTracker: tracker,
        reduceCoordinator: null,
        request: makeBudgetReq('attempt-deadline-overflow', Date.now() - 10),
      }),
      (err) =>
        err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED &&
        err.wholeAttemptDiscard === true,
    );
  });
});
