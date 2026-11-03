/**
 * Q4 — Bounded structured partial aggregations (`call-bounded-structured-partials`)
 * verification suite under `pilot-readiness-and-public-proof`.
 *
 * Proves:
 *   1. `call-canonical-partial-codec.js` enforces deterministic canonical JSON
 *      partial values and versioned envelopes (`CANONICAL_PARTIAL_GOLDEN_VECTORS`),
 *      type-distinguished group keys (`"1"` vs `1`), and fail-closed rejection
 *      of non-finite numbers, unsafe integers, wire `-0`, lone surrogates,
 *      duplicate keys, non-canonical key ordering, unsupported versions,
 *      prototypes/getters/proxies/cycles, and size/depth/field/element limits.
 *   2. Distributed operations declare optional `partialSchema` validated by
 *      `normalizeServiceDefinition` (`SERVICE_SOURCE_ERROR_CODE.INVALID_PARTIAL_SCHEMA`)
 *      and projected into `runtime-types.d.ts` (`<Operation>Partial`).
 *   3. A real compiled `service-cell-v2` WASM component emits structured
 *      `{sumCents, count, minCents, maxCents}` partial records across multiple
 *      SQLite shards with overlapping account keys across shards and multiple
 *      emissions for the same key within a shard, reducing to the exact oracle
 *      `total` and `weightedAverage` while preserving string `"1"` vs numeric
 *      `1` group keys.
 *   4. Arrival-order permutations across shards produce identical ordered
 *      `reduce` inputs and final snapshots.
 *   5. Identical `deliveryId` replay is idempotent (neither double-counted nor
 *      double-reduced), conflicting `deliveryId` replay fails closed with
 *      `CALL_CELL_REDUCE_INCOMPLETE_REASON.DELIVERY_CONFLICT`, stale attempt
 *      delivery fails closed with `CALL_CELL_REDUCE_INCOMPLETE_REASON.STALE_DELIVERY`,
 *      and per-shard / global count and byte overflows fail closed without
 *      truncation (`CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED`).
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
import {
  CALL_CELL_REDUCE_INCOMPLETE_REASON,
  createCallCellReduceCoordinator,
} from '../../src/runtime/call-cell-reduce-coordinator.js';
import {HEALTH_STATUS} from '../../src/runtime/runtime-driver.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {CallBindingRouteResolver} from
  '../../src/service/call-binding-route-resolver.js';
import {createCallCellBatchExecutor} from
  '../../src/service/call-cell-batch-executor.js';
import {CallCellInvoker} from '../../src/service/call-cell-invoker.js';
import {
  CANONICAL_PARTIAL_GOLDEN_VECTORS,
  DEFAULT_PARTIAL_SCHEMA_ID,
  PARTIAL_CODEC_ERROR_CODE,
  PARTIAL_CODEC_VERSION,
  decodeCanonicalGroupKey,
  decodeCanonicalPartialEnvelope,
  decodeCanonicalPartialValue,
  decodeCanonicalPartialWire,
  encodeCanonicalGroupKey,
  encodeCanonicalPartialEnvelope,
  encodeCanonicalPartialValue,
  normalizePartialValueSchema,
  validateValueAgainstSchema,
} from '../../src/service/call-canonical-partial-codec.js';
import {
  CALL_CELL_PARTIAL_KEY_PREFIX,
  CALL_CELL_ROUTE_ERROR_CODE,
  normalizeEmittedPartialEntries,
} from '../../src/service/call-cell-routing-contract.js';
import {CallCellStatementAdapter} from
  '../../src/service/call-cell-statement-adapter.js';
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
const SERVICE_WORLD_V2 = 'service-cell-v2';
const CALL_WORLD_NAME = 'call-cell';
const RUN_EXPORT = 'run';
const TENANT_ID = 'tenant-q4';
const PRINCIPAL_ID = 'principal-q4-analyst';
const NODE_ID = 'node-q4-1';
const SERVICE_NAME = 'account-rollup';
const SERVICE_VERSION = '1.0.0';
const BINDING_NAME = 'account-rollup--call--account-summary';
const PACKAGE_ID =
  'service-package-4444444444444444444444444444444444444444444444444444444444444444';
const ARTIFACT_DIGEST =
  'sha256:5555555555555555555555555555555555555555555555555555555555555555';
const ARTIFACT_REF = 'oci://registry.local/q4/account-rollup:1.0.0';
const TABLE_NAME = 'ledger_postings';
const PARTITION_ONE = 'ledger_postings_p0';
const PARTITION_TWO = 'ledger_postings_p1';
const PARTITION_THREE = 'ledger_postings_p2';
const COORDINATION_TABLE = 'call_cell_reduce_slots';
const RESULT_TABLE = 'call_cell_results';
const BATCH_ROW_BOUND = 64;
const BATCH_BYTE_BOUND = 262144;
const EMIT_BUDGET = 32;
const NESTED_CALL_BUDGET = 1;
const PARTIAL_LIMIT = 32;
const DEADLINE_WINDOW_MS = 30000;
const LEASE_MS = 30000;
const SLOT_COUNT = 8;

const SECURITY_CONTEXT = Object.freeze({
  principal: PRINCIPAL_ID,
  roles: Object.freeze(['application']),
  tenantId: TENANT_ID,
});

const SELECTOR_SQL =
  'SELECT id, account_code, category, amount_cents, weight ' +
  'FROM ledger_postings';

const SUMMARY_PARTIAL_SCHEMA = Object.freeze({
  fields: Object.freeze({
    category: Object.freeze({type: 'string'}),
    count: Object.freeze({type: 'integer'}),
    maxCents: Object.freeze({type: 'integer'}),
    minCents: Object.freeze({type: 'integer'}),
    sumCents: Object.freeze({type: 'integer'}),
    weightedNumerator: Object.freeze({type: 'integer'}),
    weightSum: Object.freeze({type: 'integer'}),
  }),
  type: 'record',
});

const SEEDED_PARTITION_ROWS = Object.freeze({
  [PARTITION_ONE]: Object.freeze([
    Object.freeze({
      account_code: 'acct-alpha',
      amount_cents: 100,
      category: 'card',
      id: 1,
      weight: 2,
    }),
    Object.freeze({
      account_code: 'acct-alpha',
      amount_cents: 300,
      category: 'wire',
      id: 2,
      weight: 4,
    }),
    Object.freeze({
      account_code: '1',
      amount_cents: 50,
      category: 'str-key',
      id: 3,
      weight: 1,
    }),
  ]),
  [PARTITION_TWO]: Object.freeze([
    Object.freeze({
      account_code: 'acct-alpha',
      amount_cents: 200,
      category: 'card',
      id: 4,
      weight: 2,
    }),
    Object.freeze({
      account_code: 'acct-beta',
      amount_cents: 400,
      category: 'ach',
      id: 5,
      weight: 5,
    }),
    Object.freeze({
      account_code: 'NUM_1',
      amount_cents: 75,
      category: 'num-key',
      id: 6,
      weight: 3,
    }),
  ]),
  [PARTITION_THREE]: Object.freeze([
    Object.freeze({
      account_code: 'acct-beta',
      amount_cents: 100,
      category: 'card',
      id: 7,
      weight: 5,
    }),
    Object.freeze({
      account_code: 'acct-alpha',
      amount_cents: 400,
      category: 'ach',
      id: 8,
      weight: 2,
    }),
  ]),
});

const SHARD_TABLE_DDL =
  'CREATE TABLE ledger_postings (' +
  'id INTEGER PRIMARY KEY, ' +
  'account_code TEXT NOT NULL, ' +
  'category TEXT NOT NULL, ' +
  'amount_cents INTEGER NOT NULL, ' +
  'weight INTEGER NOT NULL)';

const SHARD_INSERT_SQL =
  'INSERT INTO ledger_postings ' +
  '(id, account_code, category, amount_cents, weight) ' +
  'VALUES (?, ?, ?, ?, ?)';

function sha256Prefixed(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function buildQ4ServiceSource() {
  return `import {Hono} from 'hono';
import {defineService, distributed, sql} from 'lagrange-server/authoring';

const accountSummary = distributed({
  statement: sql\`${SELECTOR_SQL}\`,
  partialSchema: ${JSON.stringify(SUMMARY_PARTIAL_SCHEMA)},
  run(rows, _args, {emit}) {
    const byAccountAndCategory = new Map();
    for (const row of rows) {
      const groupKey = row.account_code === 'NUM_1' ? 1 : String(row.account_code);
      const bucketKey = typeof groupKey + ':' + String(groupKey) + ':' + row.category;
      const amount = Number(row.amount_cents);
      const weight = Number(row.weight);
      const current = byAccountAndCategory.get(bucketKey) || {
        groupKey,
        partial: {
          category: String(row.category),
          count: 0,
          maxCents: amount,
          minCents: amount,
          sumCents: 0,
          weightSum: 0,
          weightedNumerator: 0,
        },
      };
      current.partial.count += 1;
      current.partial.sumCents += amount;
      current.partial.minCents = Math.min(current.partial.minCents, amount);
      current.partial.maxCents = Math.max(current.partial.maxCents, amount);
      current.partial.weightedNumerator += amount * weight;
      current.partial.weightSum += weight;
      byAccountAndCategory.set(bucketKey, current);
    }
    let emittedBuckets = 0;
    for (const entry of byAccountAndCategory.values()) {
      emit(entry.groupKey, entry.partial);
      emittedBuckets += 1;
    }
    return {emittedBuckets};
  },
  reduce(partials) {
    const merged = new Map();
    const orderedTrace = [];
    for (const [groupKey, partial] of partials) {
      const id = (typeof groupKey === 'number' ? 'num:' : 'str:') + String(groupKey);
      orderedTrace.push(id + ':' + partial.category + ':' + String(partial.sumCents));
      const acc = merged.get(id) || {
        categories: [],
        count: 0,
        key: groupKey,
        keyType: typeof groupKey,
        maxCents: partial.maxCents,
        minCents: partial.minCents,
        totalCents: 0,
        weightSum: 0,
        weightedNumerator: 0,
      };
      acc.count += partial.count;
      acc.totalCents += partial.sumCents;
      acc.minCents = Math.min(acc.minCents, partial.minCents);
      acc.maxCents = Math.max(acc.maxCents, partial.maxCents);
      acc.weightedNumerator += partial.weightedNumerator;
      acc.weightSum += partial.weightSum;
      acc.categories.push(partial.category);
      merged.set(id, acc);
    }
    const accounts = Array.from(merged.values()).map((acc) => ({
      categories: acc.categories,
      count: acc.count,
      key: acc.key,
      keyType: acc.keyType,
      maxCents: acc.maxCents,
      minCents: acc.minCents,
      totalCents: acc.totalCents,
      weightedAverage: acc.weightedNumerator / acc.weightSum,
    }));
    return {accounts, orderedTrace};
  },
});

const app = new Hono();
app.get('/summary', async (c) => {
  const result = await c.env.lagrange.call(accountSummary, {});
  return c.json(result);
});

export default defineService({
  name: '${SERVICE_NAME}',
  version: '${SERVICE_VERSION}',
  operations: {accountSummary},
  fetch: app.fetch,
});
`;
}

function computeOracleRollup() {
  const allRows = [
    ...SEEDED_PARTITION_ROWS[PARTITION_ONE],
    ...SEEDED_PARTITION_ROWS[PARTITION_TWO],
    ...SEEDED_PARTITION_ROWS[PARTITION_THREE],
  ];
  const byId = new Map();
  for (const row of allRows) {
    const key = row.account_code === 'NUM_1' ? 1 : String(row.account_code);
    const id = `${typeof key === 'number' ? 'num:' : 'str:'}${String(key)}`;
    const acc = byId.get(id) || {
      count: 0,
      key,
      keyType: typeof key,
      maxCents: row.amount_cents,
      minCents: row.amount_cents,
      totalCents: 0,
      weightSum: 0,
      weightedNumerator: 0,
    };
    acc.count += 1;
    acc.totalCents += row.amount_cents;
    acc.minCents = Math.min(acc.minCents, row.amount_cents);
    acc.maxCents = Math.max(acc.maxCents, row.amount_cents);
    acc.weightedNumerator += row.amount_cents * row.weight;
    acc.weightSum += row.weight;
    byId.set(id, acc);
  }
  return Array.from(byId.values()).map((acc) => ({
    count: acc.count,
    key: acc.key,
    keyType: acc.keyType,
    maxCents: acc.maxCents,
    minCents: acc.minCents,
    totalCents: acc.totalCents,
    weightedAverage: acc.weightedNumerator / acc.weightSum,
  }));
}

function extractQuotedString(sqlText, marker) {
  const start = sqlText.indexOf(marker);
  if (start < 0) return null;
  let cursor = start + marker.length;
  let value = '';
  while (cursor < sqlText.length) {
    const char = sqlText[cursor];
    if (char !== '\'') {
      value += char;
      cursor += 1;
      continue;
    }
    if (sqlText[cursor + 1] === '\'') {
      value += '\'';
      cursor += 2;
      continue;
    }
    return value;
  }
  return value;
}

function whereValue(sqlText, marker) {
  const match = sqlText.match(new RegExp(`${marker} = ('?)([^'\\s,]+)\\1`));
  return match ? match[2] : null;
}

function applyCoordinationUpdate(store, sqlText) {
  const whereIndex = sqlText.indexOf(' WHERE ');
  const whereClause = whereIndex < 0 ? '' : sqlText.slice(whereIndex);
  const slot = store.slots.find((row) =>
    row.invocation_id === whereValue(whereClause, 'invocation_id') &&
    row.slot_id === Number(whereValue(whereClause, 'slot_id')));
  if (!slot) return;
  const ownerGuard = extractQuotedString(whereClause, 'replica_id = \'');
  if (ownerGuard !== null && slot.replica_id !== ownerGuard) return;
  const expiryGuard = whereClause.match(/lease_expires_at <= (\d+)/);
  if (expiryGuard && slot.lease_expires_at > Number(expiryGuard[1])) return;
  const setClause = sqlText.slice(0, whereIndex < 0 ? undefined : whereIndex);
  const claimOwner = ownerGuard === null ?
    extractQuotedString(setClause, 'replica_id = \'') :
    null;
  if (claimOwner !== null) {
    slot.replica_id = claimOwner;
    slot.partial_json = '[]';
    slot.computed_at = 0;
  }
  const partialJson = extractQuotedString(setClause, 'partial_json = \'');
  if (partialJson !== null) {
    slot.partial_json = partialJson;
    slot.computed_at = Number(whereValue(setClause, 'computed_at'));
  }
  const leaseAssignment = whereValue(setClause, 'lease_expires_at');
  if (leaseAssignment !== null) {
    slot.lease_expires_at = Number(leaseAssignment);
  }
}

function applyResultUpdate(store, sqlText) {
  const row = store.results.find(
    (entry) => entry.result_id === whereValue(sqlText, 'result_id'),
  );
  if (!row) return;
  row.result_json = extractQuotedString(sqlText, 'result_json = \'');
  row.computed_at = Number(whereValue(sqlText, 'computed_at'));
  row.source_snapshot_json = extractQuotedString(
    sqlText, 'source_snapshot_json = \'',
  );
}

function parseInsert(sqlText) {
  const match =
    /^INSERT INTO ([a-z_]+) \(([^)]+)\) VALUES \((.+)\)$/u.exec(sqlText);
  if (!match) return null;
  const [, tableName, columnsFragment, valuesFragment] = match;
  const columns = columnsFragment.split(',').map((column) => column.trim());
  const values = valuesFragment.match(/'(?:[^']|'')*'|[^,\s]+/gu)
    .map((value) => (value.startsWith('\'') ?
      value.slice(1, -1).replace(/''/gu, '\'') :
      Number(value)));
  return {
    row: Object.fromEntries(
      columns.map((column, index) => [column, values[index]]),
    ),
    tableName,
  };
}

function createInMemoryCoordinations(nowProvider = () => Date.now()) {
  const store = {results: [], slots: []};
  const executeInternal = async (sqlText) => {
    if (sqlText.startsWith('SELECT slot_id')) {
      const invocationId = whereValue(sqlText, 'invocation_id');
      return {
        results: store.slots
          .filter((row) => row.invocation_id === invocationId)
          .map((row) => ({...row})),
        success: true,
      };
    }
    if (sqlText.startsWith(`UPDATE ${COORDINATION_TABLE}`)) {
      applyCoordinationUpdate(store, sqlText);
      return {success: true};
    }
    if (sqlText.startsWith(`UPDATE ${RESULT_TABLE}`)) {
      applyResultUpdate(store, sqlText);
      return {success: true};
    }
    const insert = parseInsert(sqlText);
    if (insert?.tableName === COORDINATION_TABLE) {
      store.slots.push(insert.row);
      return {success: true};
    }
    if (insert?.tableName === RESULT_TABLE) {
      store.results.push(insert.row);
      return {success: true};
    }
    throw new Error(`Unsupported coordination SQL: ${sqlText}`);
  };
  return {
    coordinator: createCallCellReduceCoordinator({
      coordinationTable: COORDINATION_TABLE,
      executeInternal,
      leaseMs: LEASE_MS,
      nowProvider,
      resultTable: RESULT_TABLE,
      slotCount: SLOT_COUNT,
    }),
    store,
  };
}

function createTableRoutingFixture() {
  const tableInfo = Object.freeze({
    active_partition_version: 1,
    partition_key: 'id',
    partition_key_type: 'INTEGER',
    primary_key: 'id',
    table_id: TABLE_NAME,
    table_name: TABLE_NAME,
  });
  const partitionRows = Object.freeze([
    Object.freeze({
      leader_node_id: NODE_ID,
      max_value: 4,
      min_value: null,
      partition_id: PARTITION_ONE,
      partition_key_end: '4',
      partition_key_start: null,
      partition_version: 1,
      state: 'NORMAL',
      table_id: TABLE_NAME,
      table_name: TABLE_NAME,
    }),
    Object.freeze({
      leader_node_id: NODE_ID,
      max_value: 7,
      min_value: 4,
      partition_id: PARTITION_TWO,
      partition_key_end: '7',
      partition_key_start: '4',
      partition_version: 1,
      state: 'NORMAL',
      table_id: TABLE_NAME,
      table_name: TABLE_NAME,
    }),
    Object.freeze({
      leader_node_id: NODE_ID,
      max_value: null,
      min_value: 7,
      partition_id: PARTITION_THREE,
      partition_key_end: null,
      partition_key_start: '7',
      partition_version: 1,
      state: 'NORMAL',
      table_id: TABLE_NAME,
      table_name: TABLE_NAME,
    }),
  ]);
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
      if (tableName === SYSTEM_TABLE_NAME.PARTITIONS) {
        return [...partitionRows];
      }
      return [];
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
  return {
    partitionResolver,
    partitionRows,
    queryExecutor,
    tableInfo,
  };
}

function createSqlitePartitionHarness() {
  const databases = new Map();
  const partitionServices = new Map();

  for (const [partitionId, rows] of Object.entries(SEEDED_PARTITION_ROWS)) {
    const db = new Database(':memory:');
    db.exec(SHARD_TABLE_DDL);
    const stmt = db.prepare(SHARD_INSERT_SQL);
    for (const row of rows) {
      stmt.run(
        row.id,
        row.account_code,
        row.category,
        row.amount_cents,
        row.weight,
      );
    }
    databases.set(partitionId, db);
    partitionServices.set(partitionId, {
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
    });
  }

  return {
    close() {
      for (const db of databases.values()) {
        db.close();
      }
    },
    partitionServices,
  };
}

describe('Q4 — Bounded structured partial aggregations', () => {
  let tempDir;
  let componentBytes;
  let cellRuntime;
  let sqliteHarness;
  let routingFixture;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lagrange-q4-'));
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
    await fs.writeFile(serviceModulePath, buildQ4ServiceSource(), 'utf8');
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
    sqliteHarness = createSqlitePartitionHarness();
    routingFixture = createTableRoutingFixture();
  });

  after(async () => {
    if (sqliteHarness) {
      sqliteHarness.close();
    }
    if (tempDir) {
      await fs.rm(tempDir, {force: true, recursive: true});
    }
  });

  it('matches all CANONICAL_PARTIAL_GOLDEN_VECTORS byte-for-byte and preserves groupKey type distinction', () => {
    assert.equal(PARTIAL_CODEC_VERSION, 1);
    assert.equal(DEFAULT_PARTIAL_SCHEMA_ID, 'lagrange.partial.v1');

    for (const vector of CANONICAL_PARTIAL_GOLDEN_VECTORS) {
      const encodedValue = encodeCanonicalPartialValue(vector.input);
      assert.equal(
        encodedValue,
        vector.canonicalWire,
        `golden vector (${vector.description}) must match canonical JSON bytes`,
      );
      const decodedValue = decodeCanonicalPartialValue(encodedValue);
      assert.equal(
        encodeCanonicalPartialValue(decodedValue),
        vector.canonicalWire,
      );

      const envelopeWire = encodeCanonicalPartialEnvelope(vector.input);
      const decodedEnvelope = decodeCanonicalPartialEnvelope(envelopeWire);
      assert.equal(decodedEnvelope.v, PARTIAL_CODEC_VERSION);
      assert.equal(decodedEnvelope.schema, DEFAULT_PARTIAL_SCHEMA_ID);
      assert.equal(
        encodeCanonicalPartialValue(decodedEnvelope.value),
        vector.canonicalWire,
      );
    }

    const encodedStrKey = encodeCanonicalGroupKey('1');
    const encodedNumKey = encodeCanonicalGroupKey(1);
    assert.notEqual(encodedStrKey, encodedNumKey);
    assert.equal(decodeCanonicalGroupKey(encodedStrKey), '1');
    assert.equal(typeof decodeCanonicalGroupKey(encodedStrKey), 'string');
    assert.equal(decodeCanonicalGroupKey(encodedNumKey), 1);
    assert.equal(typeof decodeCanonicalGroupKey(encodedNumKey), 'number');
  });

  it('rejects non-canonical values, floats/specials, surrogates, duplicate/out-of-order keys, prototypes, and size overflows', () => {
    assert.equal(
      encodeCanonicalPartialValue({a: -0, b: [1, -0]}),
      '{"a":0,"b":[1,0]}',
      '-0 normalizes to 0 in canonical encoding',
    );

    const invalidValues = [
      {code: PARTIAL_CODEC_ERROR_CODE.INVALID_PARTIAL_VALUE, value: Number.NaN},
      {
        code: PARTIAL_CODEC_ERROR_CODE.INVALID_PARTIAL_VALUE,
        value: Number.POSITIVE_INFINITY,
      },
      {
        code: PARTIAL_CODEC_ERROR_CODE.INVALID_PARTIAL_VALUE,
        value: Number.NEGATIVE_INFINITY,
      },
      {
        code: PARTIAL_CODEC_ERROR_CODE.UNSAFE_INTEGER_VALUE,
        value: Number.MAX_SAFE_INTEGER + 1,
      },
      {
        code: PARTIAL_CODEC_ERROR_CODE.INVALID_UNICODE_STRING,
        value: 'bad\uD800surrogate',
      },
      {code: PARTIAL_CODEC_ERROR_CODE.INVALID_PARTIAL_VALUE, value: undefined},
      {code: PARTIAL_CODEC_ERROR_CODE.INVALID_PARTIAL_VALUE, value: () => {}},
    ];
    for (const {code, value} of invalidValues) {
      assert.throws(
        () => encodeCanonicalPartialValue(value),
        (err) => err.code === code,
      );
    }

    const cyclic = {a: 1};
    cyclic.self = cyclic;
    assert.throws(
      () => encodeCanonicalPartialValue(cyclic),
      (err) => err.code === PARTIAL_CODEC_ERROR_CODE.CYCLIC_PARTIAL_VALUE,
    );

    const withGetter = {};
    Object.defineProperty(withGetter, 'a', {
      enumerable: true,
      get() {
        return 1;
      },
    });
    assert.throws(
      () => encodeCanonicalPartialValue(withGetter),
      (err) => err.code === PARTIAL_CODEC_ERROR_CODE.INVALID_PARTIAL_VALUE,
    );

    const invalidWirePayloads = [
      {
        code: PARTIAL_CODEC_ERROR_CODE.DUPLICATE_OBJECT_KEY,
        json: '{"a":1,"a":2}',
      },
      {
        code: PARTIAL_CODEC_ERROR_CODE.NON_CANONICAL_PARTIAL_WIRE,
        json: '{"b":1,"a":2}',
      },
      {
        code: PARTIAL_CODEC_ERROR_CODE.NON_CANONICAL_PARTIAL_WIRE,
        json: '{"a":-0}',
      },
      {
        code: PARTIAL_CODEC_ERROR_CODE.INVALID_UNICODE_STRING,
        json: '{"a":"\\uD800"}',
      },
      {
        code: PARTIAL_CODEC_ERROR_CODE.UNSUPPORTED_PARTIAL_CODEC_VERSION,
        json: '{"schema":"lagrange.partial.v1","v":2,"value":{"a":1}}',
      },
    ];
    for (const {code, json} of invalidWirePayloads) {
      assert.throws(
        () => decodeCanonicalPartialWire(json),
        (err) => err.code === code,
      );
    }

    assert.throws(
      () =>
        encodeCanonicalPartialValue(
          {a: 'x'.repeat(128)},
          {maxContributionBytes: 32},
        ),
      (err) => err.code === PARTIAL_CODEC_ERROR_CODE.BYTE_OVERFLOW,
    );
    assert.throws(
      () => encodeCanonicalPartialValue({a: {b: {c: 1}}}, {maxDepth: 2}),
      (err) => err.code === PARTIAL_CODEC_ERROR_CODE.DEPTH_OVERFLOW,
    );
    assert.throws(
      () =>
        encodeCanonicalPartialValue(
          {a: 1, b: 2, c: 3},
          {maxRecordFields: 2},
        ),
      (err) => err.code === PARTIAL_CODEC_ERROR_CODE.ELEMENT_COUNT_OVERFLOW,
    );
    assert.throws(
      () => encodeCanonicalPartialValue([1, 2, 3], {maxArrayLength: 2}),
      (err) => err.code === PARTIAL_CODEC_ERROR_CODE.ELEMENT_COUNT_OVERFLOW,
    );
  });

  it('validates partialSchema in normalizeServiceDefinition and emits <Operation>Partial in typingsSource', () => {
    const accountSummary = distributed({
      partialSchema: SUMMARY_PARTIAL_SCHEMA,
      reduce: (partials) => partials.length,
      run: (rows) => rows.length,
      statement: sql`SELECT id, account_code, category, amount_cents, weight FROM ledger_postings`,
    });
    const validService = defineService({
      fetch: () => new globalThis.Response('ok'),
      name: SERVICE_NAME,
      operations: {accountSummary},
      version: SERVICE_VERSION,
    });

    const irResult = normalizeServiceDefinition(validService, {
      target: IR_TARGET.SERVICE_CELL_V2,
    });
    assert.equal(irResult.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.deepEqual(
      irResult.ir.operations[0].partialSchema,
      normalizePartialValueSchema(SUMMARY_PARTIAL_SCHEMA),
    );

    const dts = typingsSource(irResult.ir);
    assert.match(dts, /export type AccountSummaryPartial = \{/u);
    assert.match(dts, /readonly "sumCents": number;/u);
    assert.match(dts, /readonly "count": number;/u);
    assert.match(
      dts,
      /emit\(key: string \| number, partial: AccountSummaryPartial\): void/u,
    );
    assert.match(
      dts,
      /reduce\(partials: readonly \(readonly \[string \| number, AccountSummaryPartial\]\)\[\], args: Record<string, unknown>\): unknown;/u,
    );

    validateValueAgainstSchema(
      {
        category: 'card',
        count: 2,
        maxCents: 200,
        minCents: 100,
        sumCents: 300,
        weightSum: 3,
        weightedNumerator: 500,
      },
      irResult.ir.operations[0].partialSchema,
    );
    assert.throws(
      () =>
        validateValueAgainstSchema(
          {category: 'card', count: 'not-an-int'},
          irResult.ir.operations[0].partialSchema,
        ),
      (err) => err.code === PARTIAL_CODEC_ERROR_CODE.INVALID_PARTIAL_VALUE,
    );

    const badOp = distributed({
      partialSchema: {fields: {}, type: 'record'},
      reduce: () => ({}),
      run: () => ({}),
      statement: sql`SELECT id FROM ledger_postings`,
    });
    const invalidService = defineService({
      fetch: () => new globalThis.Response('ok'),
      name: SERVICE_NAME,
      operations: {badOp},
      version: SERVICE_VERSION,
    });
    const invalidResult = normalizeServiceDefinition(invalidService, {
      target: IR_TARGET.SERVICE_CELL_V2,
    });
    assert.equal(invalidResult.status, SERVICE_SOURCE_STATUS.REJECTED);
    assert.equal(
      invalidResult.errors[0].code,
      SERVICE_SOURCE_ERROR_CODE.INVALID_PARTIAL_SCHEMA,
    );
  });

  it('executes compiled service-cell-v2 structured partials across 3 SQLite shards and matches the independent oracle', async () => {
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
        cpu_time_ms: 2000,
        input_bytes: 1048576,
        memory_bytes: 134217728,
        output_bytes: 65536,
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
        handler_id: 'accountSummary',
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
    const activeDef = buildActivatedRequestBindingServiceDefinition(
      compiledDef,
      projectedBinding,
    );
    const serviceId = deriveRequestServiceDefinitionId(
      projectedBinding.bindingVersionId,
    );
    const replicaId = `${serviceId}-r1`;

    await cellRuntime.start({
      budgets: normalizedBinding.budgets,
      bytes: componentBytes,
      capabilities: [],
      exportName: RUN_EXPORT,
      serviceId,
      world: CALL_WORLD_NAME,
    });

    try {
      const bindingRowsState = [bindingRow];
      const cache = {
        get(tableName, key) {
          if (tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS &&
              key === serviceId) {
            return activeDef;
          }
          return routingFixture.queryExecutor.systemCache.get(tableName, key);
        },
        getAll(tableName) {
          if (tableName === SYSTEM_TABLE_NAME.SERVICE_BINDINGS) {
            return bindingRowsState;
          }
          if (tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS) {
            return [activeDef];
          }
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
        localReplicas: new Map([[replicaId, {
          entityId: serviceId,
          replicaHandle: {serviceId},
          status: ReplicaStatus.ACTIVE,
        }]]),
        nodeId: NODE_ID,
        partitionServicesProvider: () => sqliteHarness.partitionServices,
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
          dispatch: async (envelope) => {
            const outcome = await handleCallCellInvocation(handler, envelope);
            return {
              acknowledged: true,
              answer: outcome,
            };
          },
        },
      });
      const batchExecutor = createCallCellBatchExecutor({
        partitionResolver: routingFixture.partitionResolver,
        partitionsProvider: () => [...routingFixture.partitionRows],
        queryExecutor: routingFixture.queryExecutor,
        sqlParser: {parse: (s) => new SQLParser(s).parse()},
      });
      const {coordinator, store} = createInMemoryCoordinations();
      const invoker = new CallCellInvoker({
        batchByteBound: BATCH_BYTE_BOUND,
        batchExecutor,
        batchRowBound: BATCH_ROW_BOUND,
        emitBudget: EMIT_BUDGET,
        nestedCallBudget: NESTED_CALL_BUDGET,
        partialLimit: PARTIAL_LIMIT,
        partitionTopology: {
          resolveShardHost: (_tbl, partitionId) => Object.freeze({
            activePartitionVersion: 1,
            hostNodeId: NODE_ID,
            partitionId,
            partitionReplicaId: `${partitionId}-r1`,
            partitionState: 'NORMAL',
            partitionVersion: 1,
          }),
        },
        reduceCoordinator: coordinator,
        routeResolver,
        statementAdapter,
      });

      const resultJson = await invoker.invoke({
        argumentsJson: '{}',
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        name: BINDING_NAME,
        securityContext: SECURITY_CONTEXT,
      });

      const snapshot = JSON.parse(resultJson);
      const oracleAccounts = computeOracleRollup();

      const sortAccounts = (items) =>
        [...items].sort((left, right) => {
          const leftId = `${left.keyType}:${String(left.key)}`;
          const rightId = `${right.keyType}:${String(right.key)}`;
          return leftId.localeCompare(rightId);
        });

      const actualAccounts = sortAccounts(snapshot.accounts).map((entry) => ({
        count: entry.count,
        key: entry.key,
        keyType: entry.keyType,
        maxCents: entry.maxCents,
        minCents: entry.minCents,
        totalCents: entry.totalCents,
        weightedAverage: entry.weightedAverage,
      }));
      assert.deepEqual(
        actualAccounts,
        sortAccounts(oracleAccounts),
        'compiled service-cell-v2 structured partial reduce must match independent oracle',
      );

      const strKeyOne = actualAccounts.find(
        (item) => item.keyType === 'string' && item.key === '1',
      );
      const numKeyOne = actualAccounts.find(
        (item) => item.keyType === 'number' && item.key === 1,
      );
      assert.ok(strKeyOne, 'string groupKey "1" must be preserved');
      assert.ok(numKeyOne, 'numeric groupKey 1 must be preserved');
      assert.equal(strKeyOne.totalCents, 50);
      assert.equal(numKeyOne.totalCents, 75);

      assert.deepEqual(
        snapshot.orderedTrace,
        [
          'str:acct-alpha:card:100',
          'str:acct-alpha:wire:300',
          'str:1:str-key:50',
          'str:acct-alpha:card:200',
          'str:acct-beta:ach:400',
          'num:1:num-key:75',
          'str:acct-beta:card:100',
          'str:acct-alpha:ach:400',
        ],
        'reduce receives partials in deterministic (slotId, emissionOrdinal) order with duplicate groupKeys preserved',
      );
      assert.equal(store.results.length, 1);
      assert.equal(store.results[0].result_json, resultJson);
    } finally {
      await cellRuntime.stop(serviceId);
    }
  });

  it('produces identical ordered partials under all shard arrival-order permutations', async () => {
    const slotPayloads = new Map([
      [
        1,
        normalizeEmittedPartialEntries(
          [
            {
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${encodeCanonicalGroupKey('acct-alpha')}`,
              partial: encodeCanonicalPartialEnvelope({count: 1, sumCents: 100}),
            },
            {
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${encodeCanonicalGroupKey('acct-alpha')}`,
              partial: encodeCanonicalPartialEnvelope({count: 1, sumCents: 300}),
            },
          ],
          {
            includeDeliveryMetadata: true,
            invocationId: 'inv-perm',
            shardId: 'p0',
            slotId: 1,
          },
        ),
      ],
      [
        2,
        normalizeEmittedPartialEntries(
          [
            {
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${encodeCanonicalGroupKey('acct-alpha')}`,
              partial: encodeCanonicalPartialEnvelope({count: 1, sumCents: 200}),
            },
            {
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${encodeCanonicalGroupKey(1)}`,
              partial: encodeCanonicalPartialEnvelope({count: 1, sumCents: 75}),
            },
          ],
          {
            includeDeliveryMetadata: true,
            invocationId: 'inv-perm',
            shardId: 'p1',
            slotId: 2,
          },
        ),
      ],
      [
        3,
        normalizeEmittedPartialEntries(
          [
            {
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${encodeCanonicalGroupKey('1')}`,
              partial: encodeCanonicalPartialEnvelope({count: 1, sumCents: 50}),
            },
          ],
          {
            includeDeliveryMetadata: true,
            invocationId: 'inv-perm',
            shardId: 'p2',
            slotId: 3,
          },
        ),
      ],
    ]);

    const permutations = [
      [1, 2, 3],
      [3, 1, 2],
      [2, 3, 1],
      [3, 2, 1],
    ];
    let baselineJson = null;

    for (const order of permutations) {
      const nowRef = {now: 1000};
      const {coordinator} = createInMemoryCoordinations(() => nowRef.now);
      const invocationId = `call-invocation-perm-${order.join('-')}`;
      await coordinator.seedInvocation(invocationId, [1, 2, 3]);
      for (const slotId of order) {
        nowRef.now += 10;
        const replicaId = `replica-slot-${slotId}`;
        await coordinator.acquireReduceLease(invocationId, replicaId, slotId);
        await coordinator.publishPartial(
          invocationId,
          slotId,
          replicaId,
          encodeCanonicalPartialValue(slotPayloads.get(slotId)),
          nowRef.now,
        );
      }
      const resolved = await coordinator.resolveCompletePartialSet(
        invocationId,
        [1, 2, 3],
        PARTIAL_LIMIT,
      );
      const serialized = encodeCanonicalPartialValue(resolved.partials);
      if (baselineJson === null) {
        baselineJson = serialized;
      } else {
        assert.equal(
          serialized,
          baselineJson,
          `permutation ${order.join(',')} must produce identical ordered partials`,
        );
      }
    }
  });

  it('deduplicates identical deliveryId replays and rejects conflicting, stale, or unbounded partial deliveries', async () => {
    const nowRef = {now: 2000};
    const {coordinator} = createInMemoryCoordinations(() => nowRef.now);
    const invocationId = 'call-invocation-q4-fencing';
    await coordinator.seedInvocation(invocationId, [1, 2]);

    await coordinator.acquireReduceLease(invocationId, 'replica-1', 1);
    await coordinator.acquireReduceLease(invocationId, 'replica-2', 2);

    const slotOnePayload = encodeCanonicalPartialValue([
      {
        aggValue: {count: 1, sumCents: 100},
        attempt: 1,
        deliveryId: 'inv-q4:slot-1:ord-0',
        emissionOrdinal: 0,
        groupKey: 'acct-alpha',
        shardId: 'p0',
        slotId: 1,
      },
      {
        aggValue: {count: 1, sumCents: 100},
        attempt: 1,
        deliveryId: 'inv-q4:slot-1:ord-0',
        emissionOrdinal: 0,
        groupKey: 'acct-alpha',
        shardId: 'p0',
        slotId: 1,
      },
    ]);
    await coordinator.publishPartial(
      invocationId,
      1,
      'replica-1',
      slotOnePayload,
      2010,
    );
    await coordinator.publishPartial(
      invocationId,
      1,
      'replica-1',
      slotOnePayload,
      2015,
    );

    const slotTwoPayload = encodeCanonicalPartialValue([
      {
        aggValue: {count: 2, sumCents: 250},
        attempt: 1,
        deliveryId: 'inv-q4:slot-2:ord-0',
        emissionOrdinal: 0,
        groupKey: 'acct-alpha',
        shardId: 'p1',
        slotId: 2,
      },
    ]);
    await coordinator.publishPartial(
      invocationId,
      2,
      'replica-2',
      slotTwoPayload,
      2020,
    );

    const resolved = await coordinator.resolveCompletePartialSet(
      invocationId,
      [1, 2],
      2,
    );
    assert.equal(resolved.partials.length, 2);
    assert.deepEqual(resolved.partials, [
      ['acct-alpha', {count: 1, sumCents: 100}],
      ['acct-alpha', {count: 2, sumCents: 250}],
    ]);
    assert.equal(
      resolved.witness.slots[0].candidateCount,
      1,
      'duplicate deliveryId replay must not double-count against candidate limit',
    );

    await assert.rejects(
      () =>
        coordinator.publishPartial(
          invocationId,
          2,
          'replica-2',
          encodeCanonicalPartialValue([
            {
              aggValue: {count: 99, sumCents: 9999},
              attempt: 1,
              deliveryId: 'inv-q4:slot-2:ord-0',
              emissionOrdinal: 0,
              groupKey: 'acct-alpha',
              shardId: 'p1',
              slotId: 2,
            },
          ]),
          2030,
        ),
      (err) =>
        err.code === CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE &&
        err.reason === CALL_CELL_REDUCE_INCOMPLETE_REASON.DELIVERY_CONFLICT,
    );

    await assert.rejects(
      () =>
        coordinator.publishPartial(
          invocationId,
          1,
          'replica-1',
          slotOnePayload,
          2040,
          {attempt: 1, fenceAttempt: 2},
        ),
      (err) =>
        err.code === CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE &&
        err.reason === CALL_CELL_REDUCE_INCOMPLETE_REASON.STALE_DELIVERY,
    );

    await assert.rejects(
      () => coordinator.resolveCompletePartialSet(invocationId, [1, 2], 1),
      (err) =>
        err.code === CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE &&
        err.reason === CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED,
    );

    await assert.rejects(
      () =>
        coordinator.resolveCompletePartialSet(invocationId, [1, 2], 10, {
          byteLimit: 8,
        }),
      (err) =>
        err.code === CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE &&
        err.reason === CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED,
    );
  });
});
