import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PostgresWireRuntimeModule} from
  '../../src/runtime/pgwire-runtime-module.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {
  computeSchemaDigest,
  computeSourceDigest,
} from '../../src/cli/bulk-load-manifest-contract.js';
import {
  BULK_LOAD_TABLES,
  runBulkLoad,
} from '../../src/cli/bulk-load-command.js';
import {
  ALLOWED_CUTOVER_TRANSITIONS,
  CUTOVER_DECISION_VERDICT,
  CUTOVER_ERROR_CODE,
  CUTOVER_RECEIPT_STEP,
  CUTOVER_WORKFLOW_STATE,
  PilotCutoverError,
  assertLegalCutoverTransition,
  validateChangeFeedRecord,
  validateMigrationPlan,
} from '../../src/control-plane/owners/pilot-cutover-workflow-contract.js';
import {
  CUTOVER_TABLES,
  PilotCutoverWorkflowOwner,
  createPilotCutoverWorkflowOwner,
} from '../../src/control-plane/owners/pilot-cutover-workflow-owner.js';
import {
  CUTOVER_CLI_EXIT_CODE,
  parseCutoverCommand,
  runCutoverCommand,
} from '../../src/cli/cutover-router.js';

import {createCommittedServeEligibilityOwner} from './serve-eligibility-test-support.js';
const HOST = '127.0.0.1';
const DB_NAME = 'pilot_cutover_db';
const DB_USER = 'pilot_operator';
const TABLE_NAME = 'pilot_orders';
const SPLIT_KEY = 100;
const QUERY_MESSAGE = 'QUERY';
const SQL_READ_PATTERN = /^\s*(SELECT|WITH|PRAGMA)\b/iu;
const ADDRESS_PARTITION_SEGMENT = 2;
const FIXTURE_NODE = 'cutover-node';

const SILENT_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

const ORDERS_SCHEMA = Object.freeze({
  primaryKey: 'id',
  columns: Object.freeze([
    Object.freeze({name: 'id', type: 'INTEGER', nullable: false}),
    Object.freeze({name: 'customer', type: 'TEXT', nullable: false}),
    Object.freeze({name: 'amount', type: 'INTEGER', nullable: false}),
  ]),
});

const ORDERS_SCHEMA_DIGEST = computeSchemaDigest(ORDERS_SCHEMA);

const TABLE_DDLS = Object.freeze({
  [TABLE_NAME]:
    `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (` +
    'id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount INTEGER NOT NULL)',
  [BULK_LOAD_TABLES.CHECKPOINTS]:
    `CREATE TABLE IF NOT EXISTS ${BULK_LOAD_TABLES.CHECKPOINTS} (` +
    'checkpoint_id TEXT PRIMARY KEY, load_id TEXT NOT NULL, ' +
    'checkpoint_seq INTEGER NOT NULL, byte_offset INTEGER NOT NULL, ' +
    'record_index INTEGER NOT NULL, batch_byte_offset INTEGER NOT NULL, ' +
    'batch_record_index INTEGER NOT NULL, rows_applied INTEGER NOT NULL, ' +
    'rows_rejected INTEGER NOT NULL, batch_checksum TEXT NOT NULL, ' +
    'schema_digest TEXT NOT NULL)',
  [BULK_LOAD_TABLES.REJECTS]:
    `CREATE TABLE IF NOT EXISTS ${BULK_LOAD_TABLES.REJECTS} (` +
    'reject_id TEXT PRIMARY KEY, load_id TEXT NOT NULL, ' +
    'record_index INTEGER NOT NULL, checkpoint_seq INTEGER NOT NULL, ' +
    'reason_code TEXT NOT NULL, excerpt TEXT NOT NULL)',
  [CUTOVER_TABLES.PLANS]:
    `CREATE TABLE IF NOT EXISTS ${CUTOVER_TABLES.PLANS} (` +
    'plan_id TEXT PRIMARY KEY, plan_version INTEGER NOT NULL, ' +
    'plan_json TEXT NOT NULL, sealed_at TEXT NOT NULL)',
  [CUTOVER_TABLES.RECEIPTS]:
    `CREATE TABLE IF NOT EXISTS ${CUTOVER_TABLES.RECEIPTS} (` +
    'receipt_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, ' +
    'receipt_seq INTEGER NOT NULL, step TEXT NOT NULL, ' +
    'workflow_state TEXT NOT NULL, source_position INTEGER NOT NULL, ' +
    'target_state_digest TEXT NOT NULL, divergence_count INTEGER NOT NULL, ' +
    'divergence_samples_json TEXT NOT NULL, decision TEXT NOT NULL, ' +
    'detail_json TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)',
  [CUTOVER_TABLES.APPLIED_CHANGES]:
    `CREATE TABLE IF NOT EXISTS ${CUTOVER_TABLES.APPLIED_CHANGES} (` +
    'dedup_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, ' +
    'change_id TEXT NOT NULL, source_position INTEGER NOT NULL)',
  [CUTOVER_TABLES.POST_WRITES]:
    `CREATE TABLE IF NOT EXISTS ${CUTOVER_TABLES.POST_WRITES} (` +
    'write_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, ' +
    'write_seq INTEGER NOT NULL, table_name TEXT NOT NULL, ' +
    'primary_key_value TEXT NOT NULL, operation TEXT NOT NULL, ' +
    'row_json TEXT NOT NULL, recorded_at TEXT NOT NULL)',
});

function ensureConfig() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize();
  }
}

function buildClusterEngine() {
  ensureConfig();
  const tableSpecs = [
    {
      name: TABLE_NAME,
      primaryKey: 'id',
      ddl: TABLE_DDLS[TABLE_NAME],
      partitions: [
        {
          partition_id: 'orders-p1',
          partition_key_start: null,
          partition_key_end: SPLIT_KEY,
          partition_key_type: 'INTEGER',
        },
        {
          partition_id: 'orders-p2',
          partition_key_start: SPLIT_KEY,
          partition_key_end: null,
          partition_key_type: 'INTEGER',
        },
      ],
    },
    {
      name: BULK_LOAD_TABLES.CHECKPOINTS,
      primaryKey: 'checkpoint_id',
      ddl: TABLE_DDLS[BULK_LOAD_TABLES.CHECKPOINTS],
      partitions: [{
        partition_id: 'cp-p1',
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'TEXT',
      }],
    },
    {
      name: BULK_LOAD_TABLES.REJECTS,
      primaryKey: 'reject_id',
      ddl: TABLE_DDLS[BULK_LOAD_TABLES.REJECTS],
      partitions: [{
        partition_id: 'rej-p1',
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'TEXT',
      }],
    },
    {
      name: CUTOVER_TABLES.PLANS,
      primaryKey: 'plan_id',
      ddl: TABLE_DDLS[CUTOVER_TABLES.PLANS],
      partitions: [{
        partition_id: 'plans-p1',
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'TEXT',
      }],
    },
    {
      name: CUTOVER_TABLES.RECEIPTS,
      primaryKey: 'receipt_id',
      ddl: TABLE_DDLS[CUTOVER_TABLES.RECEIPTS],
      partitions: [{
        partition_id: 'receipts-p1',
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'TEXT',
      }],
    },
    {
      name: CUTOVER_TABLES.APPLIED_CHANGES,
      primaryKey: 'dedup_id',
      ddl: TABLE_DDLS[CUTOVER_TABLES.APPLIED_CHANGES],
      partitions: [{
        partition_id: 'dedup-p1',
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'TEXT',
      }],
    },
    {
      name: CUTOVER_TABLES.POST_WRITES,
      primaryKey: 'write_id',
      ddl: TABLE_DDLS[CUTOVER_TABLES.POST_WRITES],
      partitions: [{
        partition_id: 'postwrites-p1',
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'TEXT',
      }],
    },
  ];

  const sqliteByPartition = new Map();
  const tableMetadata = new Map();
  const catalogEntries = {
    tables: [],
    partitions: [],
    services: [],
  };

  for (const spec of tableSpecs) {
    const tableRecord = {table_name: spec.name, primaryKey: spec.primaryKey};
    tableMetadata.set(spec.name, tableRecord);
    catalogEntries.tables.push(tableRecord);
    for (const part of spec.partitions) {
      const conn = new Database(':memory:');
      conn.exec(spec.ddl);
      sqliteByPartition.set(part.partition_id, conn);
      catalogEntries.partitions.push(Object.assign({}, part, {
        table_name: spec.name,
        leader_node_id: FIXTURE_NODE,
      }));
      catalogEntries.services.push({
        address: [FIXTURE_NODE, 'partition', part.partition_id].join('/'),
        node_id: FIXTURE_NODE,
        partition_id: part.partition_id,
        raft_role: 'leader',
        service_id: part.partition_id,
        service_type: 'partition',
        status: 'active',
      });
    }
  }

  const systemCache = {
    filter: (kind, fn) => (catalogEntries[kind] ?? []).filter(fn),
    get: (kind, key) =>
      kind === 'tables' ? (tableMetadata.get(key) ?? null) : null,
    getAll: (kind) => catalogEntries[kind] ?? [],
  };

  function handlePartitionSql(conn, sqlText, boundParams) {
    const stmt = conn.prepare(sqlText);
    if (SQL_READ_PATTERN.test(sqlText)) {
      return {rows: stmt.all(...boundParams), success: true};
    }
    const result = stmt.run(...boundParams);
    return {changes: result.changes, rows: [], success: true};
  }

  const messageRouter = {
    async deliver(destination, envelope) {
      const targetPartition = destination.split('/')[ADDRESS_PARTITION_SEGMENT];
      if (envelope.type === QUERY_OPERATION.TRANSACTION) {
        const txReply = answerParticipantTransactionRequest(
          envelope,
          targetPartition,
        );
        return buildDeliveryEnvelope({acknowledged: true}, txReply);
      }
      const conn = sqliteByPartition.get(targetPartition);
      const outcome =
        envelope.type === QUERY_MESSAGE && conn ?
          handlePartitionSql(conn, envelope.sql, envelope.params ?? []) :
          {success: true};
      return buildDeliveryEnvelope({acknowledged: true}, outcome);
    },
  };

  const persistenceGateway = createTransactionPersistenceGateway();
  const queryEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    controlPlaneSystemTableGateway: persistenceGateway,
    messageRouter,
    systemCache,
  });

  return {
    close() {
      persistenceGateway.db.close();
      sqliteByPartition.forEach((conn) => conn.close());
    },
    databases: sqliteByPartition,
    engine: queryEngine,
  };
}

async function startDualPgwireClusters() {
  const sourceCluster = buildClusterEngine();
  const targetCluster = buildClusterEngine();

  const sourceRuntime = new PostgresWireRuntimeModule({logger: SILENT_LOGGER});
  const targetRuntime = new PostgresWireRuntimeModule({logger: SILENT_LOGGER});

  const sourceContext = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: HOST,
    port: 0,
    sqlRequestExecutor: (req) => sourceCluster.engine.executeRequest(req),
  };
  const targetContext = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: HOST,
    port: 0,
    sqlRequestExecutor: (req) => targetCluster.engine.executeRequest(req),
  };

  const wireConfig = JSON.stringify({
    host: HOST,
    authMode: 'trust',
    tlsMode: 'disable',
  });
  await sourceRuntime.prepare({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: wireConfig,
  });
  await targetRuntime.prepare({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: wireConfig,
  });

  const sourceStarted = await sourceRuntime.start(sourceContext);
  const targetStarted = await targetRuntime.start(targetContext);

  const sourcePgClient = new pg.Client({
    host: HOST,
    port: sourceStarted.endpointIntent.port,
    database: DB_NAME,
    user: DB_USER,
    ssl: false,
  });
  const targetPgClient = new pg.Client({
    host: HOST,
    port: targetStarted.endpointIntent.port,
    database: DB_NAME,
    user: DB_USER,
    ssl: false,
  });
  await sourcePgClient.connect();
  await targetPgClient.connect();

  const sourceSqlClient = {
    execute(sql, params = [], options = {}) {
      return sourceCluster.engine.executeQuery(sql, params, {
        dialect: 'postgresql',
        ...options,
      });
    },
  };
  const targetSqlClient = {
    execute(sql, params = [], options = {}) {
      return targetCluster.engine.executeQuery(sql, params, {
        dialect: 'postgresql',
        ...options,
      });
    },
  };

  return {
    sourceCluster,
    targetCluster,
    sourcePgClient,
    targetPgClient,
    sourceSqlClient,
    targetSqlClient,
    async close() {
      await sourcePgClient.end();
      await targetPgClient.end();
      await sourceRuntime.stop(sourceContext);
      await targetRuntime.stop(targetContext);
      sourceCluster.close();
      targetCluster.close();
    },
  };
}

function buildTestPlan(overrides = {}) {
  return {
    planId: 'pilot-orders-migration-v1',
    planVersion: 1,
    sourceDescriptor: {sourceId: 'legacy-pg-orders'},
    targetDescriptor: {targetId: 'lagrange-pilot-orders'},
    tables: [
      {
        tableName: TABLE_NAME,
        primaryKey: 'id',
        columns: ['id', 'customer', 'amount'],
        schemaDigest: ORDERS_SCHEMA_DIGEST,
      },
    ],
    paritySpec: {
      keyRanges: [
        {startKey: 1, endKey: SPLIT_KEY},
        {startKey: SPLIT_KEY, endKey: 500},
      ],
      sampleRate: 1,
      checksumMethod: 'sha256',
    },
    cutoverCriteria: {
      maxDivergence: 0,
      highWaterMark: 5,
    },
    rollbackCriteria: {
      allowPartialTrafficRollback: true,
    },
    trafficSlices: [
      {sliceId: 'slice-eu-read-write', description: 'EU tenants'},
      {sliceId: 'slice-us-read-write', description: 'US tenants'},
    ],
    maxReorderWindow: 0,
    ...overrides,
  };
}

function buildInitialOrdersNdjson() {
  const rows = [
    {id: 10, customer: 'acme', amount: 500},
    {id: 20, customer: 'beta', amount: 750},
    {id: 110, customer: 'cyber', amount: 1200},
  ];
  return `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
}

async function seedSourceDatabaseWithInitialAndChanges(sourceSqlClient) {
  const finalSourceRows = [
    {id: 10, customer: 'acme', amount: 550},
    {id: 20, customer: 'beta', amount: 750},
    {id: 110, customer: 'cyber', amount: 1200},
    {id: 150, customer: 'delta', amount: 900},
  ];
  for (const row of finalSourceRows) {
    await sourceSqlClient.execute(
      `INSERT INTO ${TABLE_NAME} (id, customer, amount) VALUES ($1, $2, $3)`,
      [row.id, row.customer, row.amount],
    );
  }
}

describe('Q9 pilot-cutover-and-rollback-receipts', () => {
  it('validates migration plan, change-feed records, and legal state transitions', () => {
    const plan = validateMigrationPlan(buildTestPlan());
    assert.equal(plan.planId, 'pilot-orders-migration-v1');
    assert.equal(Array.isArray(ALLOWED_CUTOVER_TRANSITIONS.draft), true);

    assertLegalCutoverTransition(
      CUTOVER_WORKFLOW_STATE.DRAFT,
      CUTOVER_WORKFLOW_STATE.LOADING,
    );
    assert.throws(
      () => assertLegalCutoverTransition(
        CUTOVER_WORKFLOW_STATE.DRAFT,
        CUTOVER_WORKFLOW_STATE.COMPLETE,
      ),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.ILLEGAL_STATE_TRANSITION,
    );

    const record = validateChangeFeedRecord({
      changeId: 'chg-1',
      sourcePosition: 4,
      table: TABLE_NAME,
      operation: 'INSERT',
      row: {id: 150, customer: 'delta', amount: 900},
    });
    assert.equal(record.changeId, 'chg-1');
  });

  it('executes full happy path from Q8 initial load through change feed, pgwire parity, traffic switch, and process restart recovery', async (t) => {
    const clusters = await startDualPgwireClusters();
    t.after(() => clusters.close());

    await seedSourceDatabaseWithInitialAndChanges(clusters.sourceSqlClient);
    const initialNdjson = buildInitialOrdersNdjson();
    const bulkManifest = {
      manifestVersion: 1,
      loadId: 'q9-initial-load-001',
      tableName: TABLE_NAME,
      schema: ORDERS_SCHEMA,
      schemaDigest: ORDERS_SCHEMA_DIGEST,
      source: {
        sourceId: 'orders-initial.ndjson',
        sourceDigest: computeSourceDigest(initialNdjson),
      },
      batchBounds: {maxRows: 2, maxBytes: 4096},
    };

    const loadOutcome = await runBulkLoad({
      manifest: bulkManifest,
      sourceText: initialNdjson,
      targetTableSchema: ORDERS_SCHEMA,
      sqlClient: clusters.targetSqlClient,
      externalReadClient: clusters.targetPgClient,
    });
    assert.equal(loadOutcome.reconciliation.verified, true);

    const owner = createPilotCutoverWorkflowOwner({
      sqlClient: clusters.targetSqlClient,
    });
    const plan = buildTestPlan();

    // 1. Seal plan (draft)
    const sealed = await owner.sealMigrationPlan(plan);
    assert.equal(sealed.workflowState, CUTOVER_WORKFLOW_STATE.DRAFT);
    assert.equal(sealed.receipt.receiptSeq, 0);
    assert.equal(sealed.receipt.step, CUTOVER_RECEIPT_STEP.PLAN_SEALED);

    // Plan immutability check: re-sealing same planId fails closed
    await assert.rejects(
      () => owner.sealMigrationPlan(plan),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.PLAN_IMMUTABLE,
    );

    // 2. Complete initial load (draft -> loading -> syncing)
    const loaded = await owner.completeInitialLoad(plan.planId, loadOutcome);
    assert.equal(loaded.workflowState, CUTOVER_WORKFLOW_STATE.SYNCING);
    assert.equal(loaded.sourcePosition, 3);
    assert.equal(loaded.receipt.receiptSeq, 1);

    // 3. Ingest change-feed batch with duplicate changeId and reach highWaterMark (syncing -> parity)
    const feedResult = await owner.ingestChangeFeedBatch(plan.planId, [
      {
        changeId: 'chg-4',
        sourcePosition: 4,
        table: TABLE_NAME,
        operation: 'UPDATE',
        row: {id: 10, customer: 'acme', amount: 550},
        schemaDigest: ORDERS_SCHEMA_DIGEST,
      },
      {
        changeId: 'chg-4',
        sourcePosition: 4,
        table: TABLE_NAME,
        operation: 'UPDATE',
        row: {id: 10, customer: 'acme', amount: 550},
        schemaDigest: ORDERS_SCHEMA_DIGEST,
      },
      {
        changeId: 'chg-5',
        sourcePosition: 5,
        table: TABLE_NAME,
        operation: 'INSERT',
        row: {id: 150, customer: 'delta', amount: 900},
        schemaDigest: ORDERS_SCHEMA_DIGEST,
      },
    ]);
    assert.equal(feedResult.workflowState, CUTOVER_WORKFLOW_STATE.PARITY);
    assert.equal(feedResult.appliedCount, 2);
    assert.equal(feedResult.duplicateCount, 1);
    assert.equal(feedResult.receipt.decision, CUTOVER_DECISION_VERDICT.HIGH_WATER_REACHED);

    // 4. Run parity verification via real external pgwire clients (parity -> cutover_pending)
    const parityResult = await owner.runParityVerification(plan.planId, {
      sourceClient: clusters.sourcePgClient,
      targetClient: clusters.targetPgClient,
    });
    assert.equal(
      parityResult.workflowState,
      CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING,
    );
    assert.equal(parityResult.passed, true);
    assert.equal(parityResult.outstandingDivergence.count, 0);

    // 5. Switch slice 1 (cutover_pending -> cutover)
    const switched1 = await owner.executeTrafficCutover(plan.planId, {
      sliceId: 'slice-eu-read-write',
    });
    assert.equal(switched1.workflowState, CUTOVER_WORKFLOW_STATE.CUTOVER);
    assert.deepEqual(switched1.activeSlices, ['slice-eu-read-write']);

    // Simulate process restart: instantiate a brand-new owner over durable SQL
    const restartedOwner = new PilotCutoverWorkflowOwner({
      sqlClient: clusters.targetSqlClient,
    });
    const recoveredMidCutover = await restartedOwner.recoverPlanStatus(
      plan.planId,
    );
    assert.equal(
      recoveredMidCutover.workflowState,
      CUTOVER_WORKFLOW_STATE.CUTOVER,
    );
    assert.deepEqual(recoveredMidCutover.activeSlices, ['slice-eu-read-write']);
    assert.equal(recoveredMidCutover.sourcePosition, 5);

    // 6. Switch slice 2 on restarted owner (cutover -> complete)
    const switched2 = await restartedOwner.executeTrafficCutover(plan.planId, {
      sliceId: 'slice-us-read-write',
    });
    assert.equal(switched2.workflowState, CUTOVER_WORKFLOW_STATE.COMPLETE);
    assert.deepEqual(switched2.activeSlices, [
      'slice-eu-read-write',
      'slice-us-read-write',
    ]);
    assert.equal(
      switched2.receipt.decision,
      CUTOVER_DECISION_VERDICT.CUTOVER_COMPLETED,
    );

    const finalStatus = await restartedOwner.recoverPlanStatus(plan.planId);
    assert.equal(finalStatus.receipts.length, 6);
    assert.deepEqual(
      finalStatus.receipts.map((r) => r.receiptSeq),
      [0, 1, 2, 3, 4, 5],
    );
  });

  it('enforces D12 failure modes: reconnect position regression, out-of-order change, target outage, and schema drift', async (t) => {
    const clusters = await startDualPgwireClusters();
    t.after(() => clusters.close());

    const owner = createPilotCutoverWorkflowOwner({
      sqlClient: clusters.targetSqlClient,
      maxTargetOutageAttempts: 2,
    });

    const verifiedLoadOutcome = {
      loadId: 'load-1',
      tableName: TABLE_NAME,
      schemaDigest: ORDERS_SCHEMA_DIGEST,
      rowsApplied: 3,
      sourcePosition: 3,
      reconciliation: {verified: true, overallDigest: 'digest-3'},
    };

    // Case A: Position regression on reconnect
    const planRegress = buildTestPlan({planId: 'plan-pos-regress'});
    await owner.sealMigrationPlan(planRegress);
    await owner.completeInitialLoad(planRegress.planId, verifiedLoadOutcome);
    await assert.rejects(
      () => owner.ingestChangeFeedBatch(
        planRegress.planId,
        [],
        {reconnectFromPosition: 2},
      ),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.POSITION_REGRESSION &&
        err.receipt?.workflowState === CUTOVER_WORKFLOW_STATE.HALTED,
    );

    // Case B: Out-of-order change beyond maxReorderWindow
    const planOoo = buildTestPlan({
      planId: 'plan-out-of-order',
      maxReorderWindow: 0,
    });
    await owner.sealMigrationPlan(planOoo);
    await owner.completeInitialLoad(planOoo.planId, verifiedLoadOutcome);
    await assert.rejects(
      () => owner.ingestChangeFeedBatch(planOoo.planId, [
        {
          changeId: 'c-5',
          sourcePosition: 5,
          table: TABLE_NAME,
          operation: 'INSERT',
          row: {id: 50, customer: 'x', amount: 10},
        },
        {
          changeId: 'c-4',
          sourcePosition: 4,
          table: TABLE_NAME,
          operation: 'INSERT',
          row: {id: 40, customer: 'y', amount: 20},
        },
      ]),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.OUT_OF_ORDER_CHANGE &&
        err.receipt?.workflowState === CUTOVER_WORKFLOW_STATE.HALTED,
    );

    // Case C: Schema drift in change feed
    const planDrift = buildTestPlan({planId: 'plan-schema-drift'});
    await owner.sealMigrationPlan(planDrift);
    await owner.completeInitialLoad(planDrift.planId, verifiedLoadOutcome);
    await assert.rejects(
      () => owner.ingestChangeFeedBatch(planDrift.planId, [
        {
          changeId: 'c-drift',
          sourcePosition: 4,
          table: TABLE_NAME,
          operation: 'INSERT',
          row: {id: 60, customer: 'z', amount: 30},
          schemaDigest: 'drifted-schema-digest',
        },
      ]),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.SCHEMA_DRIFT &&
        err.receipt?.workflowState === CUTOVER_WORKFLOW_STATE.HALTED,
    );

    // Case D: Target outage bounded attempts and stall receipt
    const planOutage = buildTestPlan({planId: 'plan-target-outage'});
    await owner.sealMigrationPlan(planOutage);
    await owner.completeInitialLoad(planOutage.planId, verifiedLoadOutcome);
    let hookCalls = 0;
    await assert.rejects(
      () => owner.ingestChangeFeedBatch(
        planOutage.planId,
        [
          {
            changeId: 'c-outage',
            sourcePosition: 4,
            table: TABLE_NAME,
            operation: 'INSERT',
            row: {id: 70, customer: 'outage', amount: 40},
          },
        ],
        {
          targetWriteHook: () => {
            hookCalls += 1;
            throw new Error('simulated target partition outage');
          },
        },
      ),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.TARGET_OUTAGE &&
        err.receipt?.step === CUTOVER_RECEIPT_STEP.CHANGE_FEED,
    );
    assert.equal(hookCalls, 2);
  });

  it('enforces parity mismatch refusal, cutover timeout reversion, and rollback after partial traffic with divergence accounting', async (t) => {
    const clusters = await startDualPgwireClusters();
    t.after(() => clusters.close());

    await seedSourceDatabaseWithInitialAndChanges(clusters.sourceSqlClient);
    const initialNdjson = buildInitialOrdersNdjson();
    const bulkManifest = {
      manifestVersion: 1,
      loadId: 'q9-rollback-load',
      tableName: TABLE_NAME,
      schema: ORDERS_SCHEMA,
      schemaDigest: ORDERS_SCHEMA_DIGEST,
      source: {sourceId: 'orders-initial.ndjson'},
      batchBounds: {maxRows: 5, maxBytes: 4096},
    };
    const loadOutcome = await runBulkLoad({
      manifest: bulkManifest,
      sourceText: initialNdjson,
      sqlClient: clusters.targetSqlClient,
      externalReadClient: clusters.targetPgClient,
    });

    const owner = createPilotCutoverWorkflowOwner({
      sqlClient: clusters.targetSqlClient,
    });
    const plan = buildTestPlan({planId: 'plan-parity-timeout-rollback'});
    await owner.sealMigrationPlan(plan);
    await owner.completeInitialLoad(plan.planId, loadOutcome);

    // Advance position to high-water mark (5) without applying row 150 yet so parity mismatches!
    await owner.ingestChangeFeedBatch(plan.planId, [
      {
        changeId: 'chg-only-update',
        sourcePosition: 5,
        table: TABLE_NAME,
        operation: 'UPDATE',
        row: {id: 10, customer: 'acme', amount: 550},
      },
    ]);

    // 1. Parity mismatch blocks cutover (missing row id=150 in target)
    await assert.rejects(
      () => owner.runParityVerification(plan.planId, {
        sourceClient: clusters.sourcePgClient,
        targetClient: clusters.targetPgClient,
      }),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.PARITY_MISMATCH &&
        err.outstandingDivergence.count === 1 &&
        err.receipt.decision === CUTOVER_DECISION_VERDICT.PARITY_FAILED,
    );

    // Fix missing row in target so parity passes
    await clusters.targetSqlClient.execute(
      `INSERT INTO ${TABLE_NAME} (id, customer, amount) VALUES ($1, $2, $3)`,
      [150, 'delta', 900],
    );
    const parityPassed = await owner.runParityVerification(plan.planId, {
      sourceClient: clusters.sourcePgClient,
      targetClient: clusters.targetPgClient,
    });
    assert.equal(parityPassed.passed, true);

    // 2. Cutover timeout reverts to cutover_pending and preserves prior traffic slices
    await assert.rejects(
      () => owner.executeTrafficCutover(plan.planId, {
        sliceId: 'slice-eu-read-write',
        timeoutMs: 10,
        switchTraffic: () => ({timedOut: true}),
      }),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.CUTOVER_TIMEOUT &&
        err.receipt.workflowState === CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING &&
        err.receipt.decision === CUTOVER_DECISION_VERDICT.CUTOVER_TIMED_OUT &&
        err.activeSlices.length === 0,
    );

    // 3. Switch slice 1 (partial traffic cutover)
    const partialCutover = await owner.executeTrafficCutover(plan.planId, {
      sliceId: 'slice-eu-read-write',
    });
    assert.equal(partialCutover.workflowState, CUTOVER_WORKFLOW_STATE.CUTOVER);

    // Record 2 post-cutover target writes during partial traffic window
    await owner.recordPostCutoverTargetWrite(plan.planId, {
      table: TABLE_NAME,
      primaryKeyValue: 301,
      operation: 'INSERT',
      row: {id: 301, customer: 'post-cutover-1', amount: 1100},
      applyToTarget: true,
    });
    await owner.recordPostCutoverTargetWrite(plan.planId, {
      table: TABLE_NAME,
      primaryKeyValue: 10,
      operation: 'UPDATE',
      row: {id: 10, customer: 'acme', amount: 999},
      applyToTarget: true,
    });

    // 4. Execute rollback after partial traffic: enumerates both post-cutover writes in receipt
    const reversedCalls = [];
    const rollbackResult = await owner.executeRollback(plan.planId, {
      reason: 'elevated downstream latency on slice-eu',
      reverseTraffic: (info) => reversedCalls.push(info),
    });
    assert.equal(
      rollbackResult.workflowState,
      CUTOVER_WORKFLOW_STATE.ROLLED_BACK,
    );
    assert.deepEqual(rollbackResult.activeSlices, []);
    assert.equal(rollbackResult.outstandingDivergence.count, 2);
    assert.deepEqual(
      rollbackResult.outstandingDivergence.sampleRefs.map((r) => r.key),
      ['301', '10'],
    );
    assert.equal(reversedCalls.length, 1);
    assert.deepEqual(reversedCalls[0].reversedSlices, ['slice-eu-read-write']);
  });

  it('fails closed on red-on-revert when receipt durability, parity checks, or divergence accounting is disabled', async (t) => {
    const clusters = await startDualPgwireClusters();
    t.after(() => clusters.close());

    const noDurabilityOwner = createPilotCutoverWorkflowOwner({
      sqlClient: clusters.targetSqlClient,
      disableReceiptDurability: true,
    });
    await assert.rejects(
      () => noDurabilityOwner.sealMigrationPlan(buildTestPlan()),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.RECEIPT_DURABILITY_REQUIRED,
    );

    const noParityOwner = createPilotCutoverWorkflowOwner({
      sqlClient: clusters.targetSqlClient,
      disableParityChecks: true,
    });
    await assert.rejects(
      () => noParityOwner.runParityVerification('any-plan'),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.PARITY_RECEIPT_REQUIRED,
    );

    const noDivergenceOwner = createPilotCutoverWorkflowOwner({
      sqlClient: clusters.targetSqlClient,
      disableDivergenceAccounting: true,
    });
    await assert.rejects(
      () => noDivergenceOwner.executeRollback('any-plan'),
      (err) => err instanceof PilotCutoverError &&
        err.code === CUTOVER_ERROR_CODE.DIVERGENCE_ACCOUNTING_REQUIRED,
    );
  });

  it('routes CLI cutover subcommands (seal, status, usage errors)', async (t) => {
    const clusters = await startDualPgwireClusters();
    t.after(() => clusters.close());

    const plan = buildTestPlan({planId: 'plan-cli-router'});
    const files = new Map([
      ['/virtual/plan.json', JSON.stringify(plan)],
    ]);
    const outputs = [];
    const errors = [];

    const sealCode = await runCutoverCommand(
      ['seal', '--plan', '/virtual/plan.json'],
      {
        readFile: (p) => files.get(p),
        sqlClient: clusters.targetSqlClient,
        writeOutput: (line) => outputs.push(line),
        writeError: (line) => errors.push(line),
      },
    );
    assert.equal(sealCode, CUTOVER_CLI_EXIT_CODE.SUCCESS);

    const statusCode = await runCutoverCommand(
      ['status', '--plan-id', plan.planId],
      {
        sqlClient: clusters.targetSqlClient,
        writeOutput: (line) => outputs.push(line),
        writeError: (line) => errors.push(line),
      },
    );
    assert.equal(statusCode, CUTOVER_CLI_EXIT_CODE.SUCCESS);
    const parsedStatus = JSON.parse(outputs[1]);
    assert.equal(parsedStatus.workflowState, CUTOVER_WORKFLOW_STATE.DRAFT);

    const usageCode = await runCutoverCommand(
      ['unknown-subcommand'],
      {writeError: (line) => errors.push(line)},
    );
    assert.equal(usageCode, CUTOVER_CLI_EXIT_CODE.USAGE);
    assert.equal(
      parseCutoverCommand(['status', '--plan-id', 'p1']).subcommand,
      'status',
    );
  });
});
