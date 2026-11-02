/**
 * Q2 — Typed selector parameter narrowing (`call-selector-typed-parameter-narrowing`)
 * verification suite under `pilot-readiness-and-public-proof`.
 *
 * Proves:
 *   1. Distributed operations declare typed parameter slots (`params` /
 *      `parameters`) for a fixed SQL selector (`$1, $2` or `?`), validated by
 *      `normalizeServiceDefinition`, `normalizeDeploymentBinding`, and
 *      `buildDeploymentRecords`, and projected into `runtime-types.d.ts`
 *      without raw Binding names or string interpolation.
 *   2. The planner (`createCallCellBatchExecutor`) normalizes the typed
 *      parameter vector once, narrows target partitions via
 *      `PartitionResolver.resolvePartitions` before dispatch (detecting
 *      restored full scatter), and threads canonical `boundParameters` and
 *      `parametersDigest` through `CallCellInvoker` -> `CallCellStatementAdapter`
 *      -> `handleCallCellInvocation`.
 *   3. Each shard host binds `boundParameters` through the SQLite parameter
 *      mechanism (`partitionService.executeQuery(sql, boundParameters, ...)`),
 *      narrowing rows in SQLite before guest `run` executes in a real compiled
 *      `service-cell-v2` WASM component and matching an independent oracle.
 *   4. Missing, unknown, wrong-type, out-of-range, disallowed-null, disallowed-
 *      empty, over-byte, and authority-impersonating (`tenantId`, `principal`,
 *      `roles`) values fail before dispatch (`CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS`,
 *      `invoked: false`, 0 partition reads, 0 guest runs).
 *   5. Divergent planner/executor parameter values, changed retry values under
 *      an existing invocation identity, and stale parameter schema fail closed
 *      before local SQL execution or guest invocation.
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
  DeploymentBindingError,
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
import {HEALTH_STATUS} from '../../src/runtime/runtime-driver.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {CallBindingRouteResolver} from
  '../../src/service/call-binding-route-resolver.js';
import {createCallCellBatchExecutor} from
  '../../src/service/call-cell-batch-executor.js';
import {CallCellInvoker} from '../../src/service/call-cell-invoker.js';
import {
  CALL_CELL_PARTIAL_KEY_PREFIX,
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_CELL_ROUTE_MESSAGE_TYPE,
  CALL_CELL_ROUTE_OPERATION,
  createCallInvocationIntentDigest,
} from '../../src/service/call-cell-routing-contract.js';
import {
  CALL_SELECTOR_PARAM_TYPE,
  normalizeCallSelectorInvocationParameters,
  normalizeCallSelectorParameterSchema,
} from '../../src/service/call-selector-parameter-contract.js';
import {CallCellStatementAdapter} from
  '../../src/service/call-cell-statement-adapter.js';
import {buildServiceComponent} from
  '../../src/service/service-component-build.js';
import {buildDeploymentRecords} from
  '../../src/service/service-deployment-record-generator.js';
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
const RUN_EXPORT = 'run';
const TENANT_ID = 'tenant-q2';
const PRINCIPAL_ID = 'principal-q2-analyst';
const NODE_ID = 'node-q2-1';
const SERVICE_NAME = 'ledger-analytics';
const SERVICE_VERSION = '1.0.0';
const BINDING_NAME_POINT = 'ledger-analytics--call--account-summary';
const BINDING_NAME_RANGE = 'ledger-analytics--call--range-summary';
const PACKAGE_ID =
  'service-package-2222222222222222222222222222222222222222222222222222222222222222';
const ARTIFACT_DIGEST =
  'sha256:3333333333333333333333333333333333333333333333333333333333333333';
const ARTIFACT_REF = 'oci://registry.local/q2/ledger-analytics:1.0.0';
const TABLE_NAME = 'account_activity';
const PARTITION_LOW = 'account_activity_p0';
const PARTITION_MID = 'account_activity_p1';
const PARTITION_HIGH = 'account_activity_p2';
const BATCH_ROW_BOUND = 64;
const BATCH_BYTE_BOUND = 262144;
const EMIT_BUDGET = 32;
const NESTED_CALL_BUDGET = 1;
const PARTIAL_LIMIT = 32;
const DEADLINE_WINDOW_MS = 30000;

const SECURITY_CONTEXT = Object.freeze({
  principal: PRINCIPAL_ID,
  roles: Object.freeze(['application']),
  tenantId: TENANT_ID,
});

const POINT_SELECTOR_SQL =
  'SELECT id, account_id, category, active, amount_cents, note ' +
  'FROM account_activity ' +
  'WHERE account_id = $1 AND active = $2 AND category = $3 ' +
  'AND ($4 IS NULL OR note = $4)';

const RANGE_SELECTOR_SQL =
  'SELECT id, account_id, category, active, amount_cents, note ' +
  'FROM account_activity ' +
  'WHERE account_id BETWEEN $1 AND $2 AND amount_cents >= $3';

const POINT_PARAM_SCHEMA = Object.freeze([
  Object.freeze({
    max: 100000,
    min: 1,
    name: 'accountId',
    nullable: false,
    type: CALL_SELECTOR_PARAM_TYPE.INTEGER,
  }),
  Object.freeze({
    name: 'active',
    nullable: false,
    type: CALL_SELECTOR_PARAM_TYPE.BOOLEAN,
  }),
  Object.freeze({
    allowEmpty: false,
    maxBytes: 32,
    maxLength: 16,
    minLength: 2,
    name: 'category',
    nullable: false,
    type: CALL_SELECTOR_PARAM_TYPE.TEXT,
  }),
  Object.freeze({
    maxLength: 32,
    name: 'noteFilter',
    nullable: true,
    type: CALL_SELECTOR_PARAM_TYPE.TEXT,
  }),
]);

const RANGE_PARAM_SCHEMA = Object.freeze([
  Object.freeze({
    max: 100000,
    min: 1,
    name: 'minAccountId',
    nullable: false,
    type: CALL_SELECTOR_PARAM_TYPE.INTEGER,
  }),
  Object.freeze({
    max: 100000,
    min: 1,
    name: 'maxAccountId',
    nullable: false,
    type: CALL_SELECTOR_PARAM_TYPE.INTEGER,
  }),
  Object.freeze({
    max: 1000000,
    min: 0,
    name: 'minAmountCents',
    nullable: false,
    type: CALL_SELECTOR_PARAM_TYPE.NUMBER,
  }),
]);

const SEEDED_PARTITION_ROWS = Object.freeze({
  [PARTITION_LOW]: Object.freeze([
    Object.freeze({
      account_id: 25,
      active: 1,
      amount_cents: 120,
      category: 'card',
      id: 1,
      note: 'coffee',
    }),
    Object.freeze({
      account_id: 50,
      active: 1,
      amount_cents: 450,
      category: 'wire',
      id: 2,
      note: 'invoice',
    }),
    Object.freeze({
      account_id: 75,
      active: 0,
      amount_cents: 900,
      category: 'card',
      id: 3,
      note: null,
    }),
  ]),
  [PARTITION_MID]: Object.freeze([
    Object.freeze({
      account_id: 150,
      active: 1,
      amount_cents: 300,
      category: 'card',
      id: 4,
      note: 'lunch',
    }),
    Object.freeze({
      account_id: 150,
      active: 1,
      amount_cents: 700,
      category: 'card',
      id: 5,
      note: 'travel',
    }),
    Object.freeze({
      account_id: 150,
      active: 0,
      amount_cents: 9999,
      category: 'card',
      id: 6,
      note: 'archived',
    }),
    Object.freeze({
      account_id: 150,
      active: 1,
      amount_cents: 5000,
      category: 'wire',
      id: 7,
      note: 'rent',
    }),
    Object.freeze({
      account_id: 180,
      active: 1,
      amount_cents: 800,
      category: 'card',
      id: 8,
      note: 'lunch',
    }),
  ]),
  [PARTITION_HIGH]: Object.freeze([
    Object.freeze({
      account_id: 220,
      active: 1,
      amount_cents: 600,
      category: 'card',
      id: 9,
      note: ' dinner',
    }),
    Object.freeze({
      account_id: 260,
      active: 1,
      amount_cents: 1500,
      category: 'wire',
      id: 10,
      note: 'payroll',
    }),
  ]),
});

const SHARD_TABLE_DDL = `
  CREATE TABLE account_activity (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    active INTEGER NOT NULL,
    amount_cents REAL NOT NULL,
    note TEXT
  );
`;

const SHARD_INSERT_SQL =
  'INSERT INTO account_activity ' +
  '(id, account_id, category, active, amount_cents, note) ' +
  'VALUES (?, ?, ?, ?, ?, ?)';

function sha256Prefixed(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function computeOraclePointSummary({accountId, active, category, noteFilter}) {
  const allRows = Object.values(SEEDED_PARTITION_ROWS).flat();
  const activeInt = active ? 1 : 0;
  const matching = allRows.filter((row) =>
    row.account_id === accountId &&
    row.active === activeInt &&
    row.category === category &&
    (noteFilter === null || row.note === noteFilter));
  const totalCents = matching.reduce((sum, row) => sum + row.amount_cents, 0);
  return {
    accountId: String(accountId),
    matchedRowIds: matching.map((row) => row.id),
    totalCents,
  };
}

function computeOracleRangeSummary({maxAccountId, minAccountId, minAmountCents}) {
  const allRows = Object.values(SEEDED_PARTITION_ROWS).flat();
  const matching = allRows.filter((row) =>
    row.account_id >= minAccountId &&
    row.account_id <= maxAccountId &&
    row.amount_cents >= minAmountCents);
  const byCategory = new Map();
  for (const row of matching) {
    byCategory.set(
      row.category,
      (byCategory.get(row.category) || 0) + row.amount_cents,
    );
  }
  return Object.fromEntries(
    [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

function buildQ2ServiceSource() {
  return `import {Hono} from 'hono';
import {defineService, distributed, sql} from 'lagrange-server/authoring';

const accountSummary = distributed({
  statement: sql\`${POINT_SELECTOR_SQL}\`,
  params: ${JSON.stringify(POINT_PARAM_SCHEMA)},
  run(rows, _args, {emit}) {
    let sum = 0;
    for (const row of rows) {
      sum += Number(row.amount_cents);
    }
    emit('total', sum);
    return {rowCount: rows.length};
  },
  reduce(partials, args) {
    let totalCents = 0;
    for (const [, value] of partials) {
      totalCents += Number(value);
    }
    return {
      accountId: String(args.accountId),
      totalCents,
    };
  },
});

const app = new Hono();
app.post('/summary', async (c) => {
  const body = await c.req.json();
  const result = await c.env.lagrange.call(accountSummary, body);
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

function createInMemoryReduceCoordinator() {
  const slotsByInvocation = new Map();
  const snapshots = new Map();
  return {
    snapshots,
    async seedInvocation(invocationId, slotIds) {
      const slotMap = new Map();
      for (const slotId of slotIds) {
        slotMap.set(slotId, {leaseHolder: null, partialJson: null});
      }
      slotsByInvocation.set(invocationId, slotMap);
      return {slotIds};
    },
    async acquireReduceLease(invocationId, replicaId, slotId) {
      const slotMap = slotsByInvocation.get(invocationId);
      const slot = slotMap.get(slotId);
      slot.leaseHolder = replicaId;
      return {slot_id: slotId};
    },
    async publishPartial(invocationId, slotId, replicaId, partialJson) {
      const slotMap = slotsByInvocation.get(invocationId);
      const slot = slotMap.get(slotId);
      assert.equal(slot.leaseHolder, replicaId);
      slot.partialJson = partialJson;
    },
    async resolveCompletePartialSet(invocationId, slotIds) {
      const slotMap = slotsByInvocation.get(invocationId);
      const combined = [];
      for (const slotId of slotIds) {
        const slot = slotMap.get(slotId);
        const entries = JSON.parse(slot.partialJson || '[]');
        for (const entry of entries) {
          combined.push([entry.groupKey, JSON.stringify(entry.aggValue)]);
        }
      }
      return {
        partials: combined,
        witness: {invocationId, slotCount: slotIds.length},
      };
    },
    async publishFinalSnapshot(invocationId, resultJson, witness) {
      snapshots.set(invocationId, {resultJson, witness});
    },
  };
}

function createTableRoutingFixture() {
  const tableInfo = Object.freeze({
    active_partition_version: 1,
    partition_key: 'account_id',
    partition_key_type: 'INTEGER',
    primary_key: 'account_id',
    table_id: TABLE_NAME,
    table_name: TABLE_NAME,
  });
  const partitionRows = Object.freeze([
    Object.freeze({
      leader_node_id: NODE_ID,
      max_value: 100,
      min_value: null,
      partition_id: PARTITION_LOW,
      partition_key_end: '100',
      partition_key_start: null,
      partition_version: 1,
      state: 'NORMAL',
      table_id: TABLE_NAME,
      table_name: TABLE_NAME,
    }),
    Object.freeze({
      leader_node_id: NODE_ID,
      max_value: 200,
      min_value: 100,
      partition_id: PARTITION_MID,
      partition_key_end: '200',
      partition_key_start: '100',
      partition_version: 1,
      state: 'NORMAL',
      table_id: TABLE_NAME,
      table_name: TABLE_NAME,
    }),
    Object.freeze({
      leader_node_id: NODE_ID,
      max_value: null,
      min_value: 200,
      partition_id: PARTITION_HIGH,
      partition_key_end: null,
      partition_key_start: '200',
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
  const readLog = [];
  const partitionServices = new Map();

  for (const [partitionId, rows] of Object.entries(SEEDED_PARTITION_ROWS)) {
    const db = new Database(':memory:');
    db.exec(SHARD_TABLE_DDL);
    const stmt = db.prepare(SHARD_INSERT_SQL);
    for (const row of rows) {
      stmt.run(
        row.id,
        row.account_id,
        row.category,
        row.active,
        row.amount_cents,
        row.note,
      );
    }
    databases.set(partitionId, db);
    partitionServices.set(partitionId, {
      executeQuery: async (renderedSql, boundParams = []) => {
        readLog.push({
          boundParams: [...boundParams],
          partitionId,
          sql: renderedSql,
        });
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
    clearLog() {
      readLog.length = 0;
    },
    close() {
      for (const db of databases.values()) {
        db.close();
      }
    },
    partitionServices,
    readLog,
  };
}

describe('Q2 — call-selector-typed-parameter-narrowing', () => {
  let tempDir;
  let componentBytes;
  let cellRuntime;
  let sqliteHarness;
  let routingFixture;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lagrange-q2-'));
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
    const entryPath = path.join(projectDir, '.lagrange', 'generated', 'entry.js');
    await fs.writeFile(serviceModulePath, buildQ2ServiceSource(), 'utf8');
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

  it('normalizes typed selector parameter schemas in source IR, deployment records, and editor typings while forbidding interpolation or authority slots', () => {
    assert.throws(
      () => sql`SELECT id FROM account_activity WHERE account_id = ${150}`,
      /interpolations/u,
    );

    const accountSummary = distributed({
      params: POINT_PARAM_SCHEMA,
      reduce: (partials) => partials,
      run: (rows) => rows.length,
      statement: sql`SELECT id, account_id, amount_cents FROM account_activity WHERE account_id = $1 AND active = $2 AND category = $3 AND ($4 IS NULL OR note = $4)`,
    });
    const accepted = normalizeServiceDefinition(
      defineService({
        fetch: () => new globalThis.Response('ok'),
        name: SERVICE_NAME,
        operations: {accountSummary},
        version: SERVICE_VERSION,
      }),
      {target: IR_TARGET.SERVICE_CELL_V2},
    );
    assert.equal(accepted.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.deepEqual(accepted.ir.operations[0].parameters, POINT_PARAM_SCHEMA);

    const recordResult = buildDeploymentRecords({
      artifact: {
        digest: ARTIFACT_DIGEST,
        ref: ARTIFACT_REF,
        sizeBytes: 1024,
      },
      ir: accepted.ir,
    });
    assert.equal(recordResult.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    const callBinding = recordResult.records.bindings.find(
      (b) => b.name === BINDING_NAME_POINT,
    );
    assert.ok(callBinding);
    assert.deepEqual(callBinding.source.parameters, POINT_PARAM_SCHEMA);

    const dts = typingsSource(accepted.ir);
    assert.match(dts, /export interface AccountSummaryParams \{/u);
    assert.match(dts, /readonly "accountId": number;/u);
    assert.match(dts, /readonly "active": boolean;/u);
    assert.match(dts, /readonly "category": string;/u);
    assert.match(dts, /readonly "noteFilter": string \| null;/u);
    assert.doesNotMatch(dts, /--call--/u);

    // Reject missing parameters when statement has $1 placeholders.
    const missingSchemaOp = distributed({
      reduce: (partials) => partials,
      run: (rows) => rows.length,
      statement: sql`SELECT id FROM account_activity WHERE account_id = $1`,
    });
    const missingSchemaResult = normalizeServiceDefinition(
      defineService({
        fetch: () => new globalThis.Response('ok'),
        name: SERVICE_NAME,
        operations: {missingSchemaOp},
        version: SERVICE_VERSION,
      }),
      {target: IR_TARGET.SERVICE_CELL_V2},
    );
    assert.equal(missingSchemaResult.status, SERVICE_SOURCE_STATUS.REJECTED);
    assert.deepEqual(
      missingSchemaResult.errors.map((e) => e.code),
      [SERVICE_SOURCE_ERROR_CODE.INVALID_PARAMETERS],
    );

    // Reject reserved authority slot names in schema declarations.
    for (const forbiddenName of ['tenantId', 'tenant_id', 'principal', 'roles']) {
      assert.throws(
        () => normalizeCallSelectorParameterSchema([
          {name: forbiddenName, type: 'text'},
        ]),
        /authority/u,
      );
    }

    // Reject mismatched placeholder count in normalizeDeploymentBinding.
    assert.throws(
      () => normalizeDeploymentBinding({
        ...callBinding,
        source: {
          ...callBinding.source,
          parameters: [POINT_PARAM_SCHEMA[0]],
        },
      }),
      DeploymentBindingError,
    );
  });

  it('narrows target partitions at the planner for point equality, range predicates, and reordered positional placeholders', () => {
    const batchExecutor = createCallCellBatchExecutor({
      partitionResolver: routingFixture.partitionResolver,
      partitionsProvider: () => [...routingFixture.partitionRows],
      queryExecutor: routingFixture.queryExecutor,
      sqlParser: {parse: (s) => new SQLParser(s).parse()},
    });

    // Point equality on account_id = 150 selects ONLY p-mid ([100, 200)).
    const pointPlan = batchExecutor.planShards({
      argumentsJson: JSON.stringify({
        accountId: 150,
        active: true,
        category: 'card',
        noteFilter: null,
      }),
      parameterSchema: POINT_PARAM_SCHEMA,
      statement: POINT_SELECTOR_SQL,
    });
    assert.deepEqual(
      pointPlan.shards.map((s) => s.partitionId),
      [PARTITION_MID],
      'point equality on partition key must narrow to p-mid only, never full scatter',
    );
    assert.deepEqual(pointPlan.boundParameters, [150, 1, 'card', null, null]);
    assert.equal(typeof pointPlan.parametersDigest, 'string');

    // Range [50, 150] selects p-low and p-mid, skipping p-high.
    const rangePlanLowMid = batchExecutor.planShards({
      argumentsJson: JSON.stringify({
        maxAccountId: 150,
        minAccountId: 50,
        minAmountCents: 100,
      }),
      parameterSchema: RANGE_PARAM_SCHEMA,
      statement: RANGE_SELECTOR_SQL,
    });
    assert.deepEqual(
      rangePlanLowMid.shards.map((s) => s.partitionId),
      [PARTITION_LOW, PARTITION_MID],
    );

    // Range [210, 290] selects ONLY p-high.
    const rangePlanHigh = batchExecutor.planShards({
      argumentsJson: JSON.stringify({
        maxAccountId: 290,
        minAccountId: 210,
        minAmountCents: 500,
      }),
      parameterSchema: RANGE_PARAM_SCHEMA,
      statement: RANGE_SELECTOR_SQL,
    });
    assert.deepEqual(
      rangePlanHigh.shards.map((s) => s.partitionId),
      [PARTITION_HIGH],
    );

    // Reordered positional placeholders ($2 in WHERE partition key, $1 in filter)
    // bind in AST placeholder order for both PartitionResolver and SQLite.
    const reorderedPlan = batchExecutor.planShards({
      argumentsJson: JSON.stringify({
        accountId: 25,
        category: 'card',
      }),
      parameterSchema: [
        {name: 'category', type: 'text'},
        {name: 'accountId', type: 'integer'},
      ],
      statement:
        'SELECT id FROM account_activity WHERE account_id = $2 AND category = $1',
    });
    assert.deepEqual(
      reorderedPlan.shards.map((s) => s.partitionId),
      [PARTITION_LOW],
    );
    assert.deepEqual(reorderedPlan.boundParameters, [25, 'card']);
  });

  it('executes the real compiled WASM component end to end with narrowed partitions, SQLite parameter binding, and independent oracle parity', async () => {
    sqliteHarness.clearLog();

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
      name: BINDING_NAME_POINT,
      schema_version: 3,
      source: {
        kind: 'call',
        name: BINDING_NAME_POINT,
        parameters: POINT_PARAM_SCHEMA,
        statement: POINT_SELECTOR_SQL,
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
      world: 'call-cell',
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
      const guestInvocations = [];
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
            guestInvocations.push({
              args: req.args,
              exportName: req.exportName,
              intentDigest: req.intentDigest,
              invocationId: req.invocationId,
            });
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
      const reduceCoordinator = createInMemoryReduceCoordinator();
      const telemetryRecords = [];
      const invoker = new CallCellInvoker({
        batchByteBound: BATCH_BYTE_BOUND,
        batchExecutor,
        batchRowBound: BATCH_ROW_BOUND,
        emitBudget: EMIT_BUDGET,
        nestedCallBudget: NESTED_CALL_BUDGET,
        onInvocationTelemetry: (rec) => telemetryRecords.push(rec),
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
        reduceCoordinator,
        routeResolver,
        statementAdapter,
      });

      // 1. Narrowed point call with noteFilter = null (matches rows 4 and 5: 300 + 700 = 1000).
      const argsAllCard = {
        accountId: 150,
        active: true,
        category: 'card',
        noteFilter: null,
      };
      const resultAllCardJson = await invoker.invoke({
        argumentsJson: JSON.stringify(argsAllCard),
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        name: BINDING_NAME_POINT,
        securityContext: SECURITY_CONTEXT,
      });
      const oracleAllCard = computeOraclePointSummary(argsAllCard);
      assert.deepEqual(JSON.parse(resultAllCardJson), {
        accountId: oracleAllCard.accountId,
        totalCents: oracleAllCard.totalCents,
      });
      assert.equal(
        telemetryRecords.at(-1).selectedPartitionCount,
        1,
        'planner must narrow to 1 partition instead of scattering across all 3',
      );
      assert.equal(sqliteHarness.readLog.length, 1);
      assert.equal(sqliteHarness.readLog[0].partitionId, PARTITION_MID);
      assert.deepEqual(
        sqliteHarness.readLog[0].boundParams,
        [150, 1, 'card', null, null],
      );

      // 2. Narrowed point call with non-null noteFilter = 'lunch' (matches row 4 only: 300).
      sqliteHarness.clearLog();
      const argsLunchOnly = {
        accountId: 150,
        active: true,
        category: 'card',
        noteFilter: 'lunch',
      };
      const resultLunchJson = await invoker.invoke({
        argumentsJson: JSON.stringify(argsLunchOnly),
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        name: BINDING_NAME_POINT,
        securityContext: SECURITY_CONTEXT,
      });
      const oracleLunch = computeOraclePointSummary(argsLunchOnly);
      assert.deepEqual(JSON.parse(resultLunchJson), {
        accountId: oracleLunch.accountId,
        totalCents: oracleLunch.totalCents,
      });
      assert.equal(sqliteHarness.readLog.length, 1);
      assert.deepEqual(
        sqliteHarness.readLog[0].boundParams,
        [150, 1, 'card', 'lunch', 'lunch'],
      );

      // 3. SQL injection attempt in text parameter is bound as data, never SQL syntax.
      sqliteHarness.clearLog();
      const argsSqlInjection = {
        accountId: 150,
        active: true,
        category: 'card\' OR 1=1--',
        noteFilter: null,
      };
      const resultInjectionJson = await invoker.invoke({
        argumentsJson: JSON.stringify(argsSqlInjection),
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        name: BINDING_NAME_POINT,
        securityContext: SECURITY_CONTEXT,
      });
      assert.deepEqual(JSON.parse(resultInjectionJson), {
        accountId: '150',
        totalCents: 0,
      });
      assert.equal(sqliteHarness.readLog.length, 1);

      // 4. Reject invalid, missing, unknown, wrong-type, out-of-range, disallowed-null,
      //    and authority-impersonating arguments BEFORE dispatch (0 SQL reads, 0 guest calls).
      sqliteHarness.clearLog();
      const guestCountBeforeInvalid = guestInvocations.length;
      const invalidPayloads = [
        // Missing required parameter 'category'
        {accountId: 150, active: true, noteFilter: null},
        // Unknown extra field
        {
          accountId: 150,
          active: true,
          category: 'card',
          extraField: 1,
          noteFilter: null,
        },
        // Wrong type for integer ('150' string)
        {accountId: '150', active: true, category: 'card', noteFilter: null},
        // Non-integer float for integer slot
        {accountId: 150.5, active: true, category: 'card', noteFilter: null},
        // Wrong type for boolean (number 1 instead of boolean)
        {accountId: 150, active: 1, category: 'card', noteFilter: null},
        // Out of range (below min: 1)
        {accountId: 0, active: true, category: 'card', noteFilter: null},
        // Out of range (above max: 100000)
        {accountId: 999999, active: true, category: 'card', noteFilter: null},
        // Disallowed null on non-nullable slot
        {accountId: null, active: true, category: 'card', noteFilter: null},
        // Disallowed empty string on allowEmpty: false
        {accountId: 150, active: true, category: '', noteFilter: null},
        // Over maxLength (16) on category
        {
          accountId: 150,
          active: true,
          category: 'category-name-too-long',
          noteFilter: null,
        },
        // Authority impersonation via tenantId / principal
        {
          accountId: 150,
          active: true,
          category: 'card',
          noteFilter: null,
          tenantId: 'spoofed-tenant',
        },
        {
          accountId: 150,
          active: true,
          category: 'card',
          noteFilter: null,
          principal: 'spoofed-principal',
        },
      ];

      for (const badArgs of invalidPayloads) {
        await assert.rejects(
          invoker.invoke({
            argumentsJson: JSON.stringify(badArgs),
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            name: BINDING_NAME_POINT,
            securityContext: SECURITY_CONTEXT,
          }),
          (error) => {
            assert.equal(error.code, CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS);
            assert.equal(error.invoked, false);
            return true;
          },
        );
      }
      assert.equal(
        sqliteHarness.readLog.length,
        0,
        'invalid selector arguments must be refused before any partition read',
      );
      assert.equal(
        guestInvocations.length,
        guestCountBeforeInvalid,
        'invalid selector arguments must be refused before any guest invocation',
      );

      // 5. Changed retry parameter values under an existing invocationId fail closed!
      const pinnedInvocationId = 'call-invocation-q2-retry-fence-1';
      const firstRetryRes = await invoker.invoke({
        argumentsJson: JSON.stringify(argsLunchOnly),
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        invocationId: pinnedInvocationId,
        name: BINDING_NAME_POINT,
        securityContext: SECURITY_CONTEXT,
      });
      assert.deepEqual(JSON.parse(firstRetryRes), {
        accountId: '150',
        totalCents: 300,
      });

      sqliteHarness.clearLog();
      const guestCountBeforeRetryConflict = guestInvocations.length;
      await assert.rejects(
        invoker.invoke({
          argumentsJson: JSON.stringify(argsAllCard),
          deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
          invocationId: pinnedInvocationId,
          name: BINDING_NAME_POINT,
          securityContext: SECURITY_CONTEXT,
        }),
        (error) => {
          assert.equal(error.code, CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS);
          assert.equal(error.invoked, false);
          return true;
        },
      );
      assert.equal(sqliteHarness.readLog.length, 0);
      assert.equal(guestInvocations.length, guestCountBeforeRetryConflict);

      // 6. Divergent planner/executor parameter values on the shard host fail closed!
      const resolvedRoute = routeResolver.resolve({
        invocationId: 'call-invocation-q2-divergent#slot-1',
        name: BINDING_NAME_POINT,
        securityContext: SECURITY_CONTEXT,
      });
      const canonicalNorm = normalizeCallSelectorInvocationParameters({
        argumentsJson: JSON.stringify(argsLunchOnly),
        parameterSchema: resolvedRoute.parameters,
        statement: resolvedRoute.statement,
      });
      const divergentOutcome = await handleCallCellInvocation(handler, {
        metadata: {roles: SECURITY_CONTEXT.roles},
        operation: CALL_CELL_ROUTE_OPERATION,
        payload: {
          call: {
            arguments: JSON.stringify(argsLunchOnly),
            name: BINDING_NAME_POINT,
            // Tampered bound parameter value (999 instead of 150)
            parameters: [999, 1, 'card', 'lunch', 'lunch'],
            parametersDigest: canonicalNorm.parametersDigest,
          },
          invocation: {
            callCell: {
              batchByteBound: BATCH_BYTE_BOUND,
              batchRowBound: BATCH_ROW_BOUND,
              emitBudget: EMIT_BUDGET,
              nestedCallBudget: NESTED_CALL_BUDGET,
            },
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            exportName: RUN_EXPORT,
            id: 'call-invocation-q2-divergent#slot-1',
            intentDigest: createCallInvocationIntentDigest({
              argumentsDigest: 'digest-1',
              bindingVersionId: resolvedRoute.bindingVersionId,
              name: BINDING_NAME_POINT,
              parametersDigest: canonicalNorm.parametersDigest,
              tenantId: TENANT_ID,
            }),
          },
          partitionId: PARTITION_MID,
          route: resolvedRoute,
          type: CALL_CELL_ROUTE_MESSAGE_TYPE,
        },
        principal: PRINCIPAL_ID,
        serviceId,
        serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        tenantId: TENANT_ID,
      });
      assert.equal(divergentOutcome.processed, false);
      assert.equal(
        divergentOutcome.invocationOutcome.code,
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      );
      assert.equal(divergentOutcome.invocationOutcome.invoked, false);
      assert.equal(sqliteHarness.readLog.length, 0);

      // 7. Stale parameter schema on the route is refused with TARGET_STALE (retryable, invoked: false).
      const staleSchemaRoute = Object.freeze({
        ...resolvedRoute,
        parameters: Object.freeze([POINT_PARAM_SCHEMA[0]]),
      });
      const staleSchemaOutcome = await handleCallCellInvocation(handler, {
        metadata: {roles: SECURITY_CONTEXT.roles},
        operation: CALL_CELL_ROUTE_OPERATION,
        payload: {
          call: {
            arguments: JSON.stringify(argsLunchOnly),
            name: BINDING_NAME_POINT,
            parameters: canonicalNorm.boundParameters,
            parametersDigest: canonicalNorm.parametersDigest,
          },
          invocation: {
            callCell: {
              batchByteBound: BATCH_BYTE_BOUND,
              batchRowBound: BATCH_ROW_BOUND,
              emitBudget: EMIT_BUDGET,
              nestedCallBudget: NESTED_CALL_BUDGET,
            },
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            exportName: RUN_EXPORT,
            id: 'call-invocation-q2-stale-schema#slot-1',
            intentDigest: 'digest-stale',
          },
          partitionId: PARTITION_MID,
          route: staleSchemaRoute,
          type: CALL_CELL_ROUTE_MESSAGE_TYPE,
        },
        principal: PRINCIPAL_ID,
        serviceId,
        serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        tenantId: TENANT_ID,
      });
      assert.equal(staleSchemaOutcome.processed, false);
      assert.equal(
        staleSchemaOutcome.invocationOutcome.code,
        CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      );
      assert.equal(staleSchemaOutcome.invocationOutcome.invoked, false);
      assert.equal(sqliteHarness.readLog.length, 0);

      // Verify range oracle helper consistency for completeness
      const rangeOracle = computeOracleRangeSummary({
        maxAccountId: 150,
        minAccountId: 50,
        minAmountCents: 300,
      });
      assert.deepEqual(rangeOracle, {
        card: 11899,
        wire: 5450,
      });
      assert.ok(BINDING_NAME_RANGE.length > 0);
      assert.ok(CALL_CELL_PARTIAL_KEY_PREFIX.length > 0);
    } finally {
      await cellRuntime.stop(serviceId);
    }
  });
});
