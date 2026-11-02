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
  BULK_LOAD_ERROR_CODE,
  BULK_LOAD_REJECT_REASON,
  BulkLoadError,
  computeBatchChecksum,
  computeSchemaDigest,
  computeSourceDigest,
  readBoundedNdjsonBatches,
  validateLoadManifest,
} from '../../src/cli/bulk-load-manifest-contract.js';
import {
  BULK_LOAD_TABLES,
  ensureBulkLoadTables,
  readCheckpointChain,
  runBulkLoad,
  verifyBulkLoadCompleteness,
} from '../../src/cli/bulk-load-command.js';
import {
  BULK_LOAD_CLI_EXIT_CODE,
  parseBulkLoadCommand,
  runBulkLoadCommand,
} from '../../src/cli/bulk-load-router.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
const HOST = '127.0.0.1';
const DB_NAME = 'pilot_bulk_load';
const DB_USER = 'pilot_loader';
const TARGET_TABLE = 'pilot_accounts';
const SPLIT_KEY = 100;
const QUERY_MESSAGE = 'QUERY';
const SQL_READ_PATTERN = /^\s*(SELECT|WITH|PRAGMA)\b/iu;
const ADDRESS_PARTITION_SEGMENT = 2;
const FIXTURE_NODE = 'bulk-load-node';

const SILENT_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

const ACCOUNT_SCHEMA = Object.freeze({
  primaryKey: 'id',
  columns: Object.freeze([
    Object.freeze({name: 'id', type: 'INTEGER', nullable: false}),
    Object.freeze({name: 'name', type: 'TEXT', nullable: false}),
    Object.freeze({name: 'balance', type: 'INTEGER', nullable: false}),
    Object.freeze({name: 'region', type: 'TEXT', nullable: true}),
  ]),
});

const ACCOUNT_SCHEMA_DIGEST = computeSchemaDigest(ACCOUNT_SCHEMA);

const TABLE_DDLS = Object.freeze({
  [TARGET_TABLE]:
    `CREATE TABLE IF NOT EXISTS ${TARGET_TABLE} (` +
    'id INTEGER PRIMARY KEY, name TEXT NOT NULL, ' +
    'balance INTEGER NOT NULL, region TEXT)',
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
});

function ensureConfig() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize();
  }
}

function createMultiTablePartitionCluster(existingDatabases = null) {
  ensureConfig();
  const tableSpecs = [
    {
      name: TARGET_TABLE,
      primaryKey: 'id',
      ddl: TABLE_DDLS[TARGET_TABLE],
      partitions: [
        {
          partition_id: 'accounts-p1',
          partition_key_start: null,
          partition_key_end: SPLIT_KEY,
          partition_key_type: 'INTEGER',
        },
        {
          partition_id: 'accounts-p2',
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
      partitions: [
        {
          partition_id: 'checkpoints-p1',
          partition_key_start: null,
          partition_key_end: null,
          partition_key_type: 'TEXT',
        },
      ],
    },
    {
      name: BULK_LOAD_TABLES.REJECTS,
      primaryKey: 'reject_id',
      ddl: TABLE_DDLS[BULK_LOAD_TABLES.REJECTS],
      partitions: [
        {
          partition_id: 'rejects-p1',
          partition_key_start: null,
          partition_key_end: null,
          partition_key_type: 'TEXT',
        },
      ],
    },
  ];

  const databases = existingDatabases || new Map();
  const tables = [];
  const partitionRows = [];
  const services = [];

  for (const spec of tableSpecs) {
    tables.push({table_name: spec.name, primaryKey: spec.primaryKey});
    for (const part of spec.partitions) {
      if (!databases.has(part.partition_id)) {
        const db = new Database(':memory:');
        db.exec(spec.ddl);
        databases.set(part.partition_id, db);
      }
      partitionRows.push({
        ...part,
        table_name: spec.name,
        leader_node_id: FIXTURE_NODE,
      });
      services.push({
        service_id: part.partition_id,
        service_type: 'partition',
        partition_id: part.partition_id,
        node_id: FIXTURE_NODE,
        raft_role: 'leader',
        address: `${FIXTURE_NODE}/partition/${part.partition_id}`,
        status: 'active',
      });
    }
  }

  const byType = {partitions: partitionRows, services, tables};
  const systemCache = {
    get(type, key) {
      return type === 'tables' ?
        tables.find((entry) => entry.table_name === key) :
        null;
    },
    filter(type, predicate) {
      return (byType[type] || []).filter(predicate);
    },
    getAll(type) {
      return byType[type] || [];
    },
  };

  const messageRouter = {
    async deliver(address, message) {
      const partitionId = address.split('/')[ADDRESS_PARTITION_SEGMENT];
      if (message.type === QUERY_OPERATION.TRANSACTION) {
        return buildDeliveryEnvelope(
          {acknowledged: true},
          answerParticipantTransactionRequest(message, partitionId),
        );
      }
      const database = databases.get(partitionId);
      if (message.type !== QUERY_MESSAGE || !database) {
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      }
      const prepared = database.prepare(message.sql);
      const params = message.params || [];
      if (SQL_READ_PATTERN.test(message.sql)) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: prepared.all(...params),
        });
      }
      const {changes} = prepared.run(...params);
      return buildDeliveryEnvelope(
        {acknowledged: true},
        {success: true, rows: [], changes},
      );
    },
  };

  const gateway = createTransactionPersistenceGateway();
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    controlPlaneSystemTableGateway: gateway,
    messageRouter,
  });

  return {
    engine,
    databases,
    stopEngineOnly() {
      gateway.db.close();
    },
    closeAll() {
      gateway.db.close();
      for (const db of databases.values()) {
        db.close();
      }
    },
  };
}

async function startPgwireHarness(existingDatabases = null) {
  const cluster = createMultiTablePartitionCluster(existingDatabases);
  const runtime = new PostgresWireRuntimeModule({logger: SILENT_LOGGER});
  const context = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: HOST,
    port: 0,
    sqlRequestExecutor: (request) => cluster.engine.executeRequest(request),
  };
  await runtime.prepare({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      host: HOST,
      authMode: 'trust',
      tlsMode: 'disable',
    }),
  });
  const started = await runtime.start(context);
  const port = started.endpointIntent.port;

  const pgClient = new pg.Client({
    host: HOST,
    port,
    database: DB_NAME,
    user: DB_USER,
    ssl: false,
  });
  await pgClient.connect();

  const sqlClient = {
    execute(sql, params = [], options = {}) {
      return cluster.engine.executeQuery(sql, params, {
        dialect: 'postgresql',
        ...options,
      });
    },
  };

  return {
    cluster,
    runtime,
    context,
    port,
    pgClient,
    sqlClient,
    async stopNodeAndKeepDisk() {
      await pgClient.end();
      await runtime.stop(context);
      cluster.stopEngineOnly();
      return cluster.databases;
    },
    async close() {
      try {
        await pgClient.end();
      } catch {
        // already closed
      }
      await runtime.stop(context);
      cluster.closeAll();
    },
  };
}

function buildTestManifest(overrides = {}) {
  const base = {
    manifestVersion: 1,
    loadId: 'load-accounts-001',
    tableName: TARGET_TABLE,
    schema: ACCOUNT_SCHEMA,
    schemaDigest: ACCOUNT_SCHEMA_DIGEST,
    source: {
      sourceId: 'accounts-stream-v1.ndjson',
    },
    batchBounds: {
      maxRows: 3,
      maxBytes: 4096,
    },
    keyRanges: [
      {startKey: 1, endKey: SPLIT_KEY},
      {startKey: SPLIT_KEY, endKey: 500},
    ],
    sampleKeys: [1, 50, 105, 220],
  };
  return {...base, ...overrides};
}

function buildValidNdjsonLines() {
  const rows = [
    {id: 1, name: 'alice', balance: 1000, region: 'eu'},
    {id: 15, name: 'bob', balance: 2500, region: 'us'},
    {id: 50, name: 'carol', balance: 3200, region: null},
    {id: 85, name: 'dave', balance: 4100, region: 'ap'},
    {id: 105, name: 'erin', balance: 5000, region: 'eu'},
    {id: 140, name: 'frank', balance: 6200, region: 'us'},
    {id: 190, name: 'grace', balance: 7300, region: null},
    {id: 220, name: 'heidi', balance: 8400, region: 'eu'},
  ];
  return `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
}

describe('Q8 resumable-bulk-data-load', () => {
  it('validates manifest contract and rejects missing primary key or invalid bounds', () => {
    const valid = validateLoadManifest(buildTestManifest());
    assert.equal(valid.loadId, 'load-accounts-001');
    assert.equal(valid.schema.primaryKey, 'id');

    assert.throws(
      () => validateLoadManifest({
        ...buildTestManifest(),
        schema: {
          primaryKey: '',
          columns: ACCOUNT_SCHEMA.columns,
        },
      }),
      (err) => err instanceof BulkLoadError &&
        err.code === BULK_LOAD_ERROR_CODE.MISSING_PRIMARY_KEY,
    );

    assert.throws(
      () => validateLoadManifest({
        ...buildTestManifest(),
        batchBounds: {maxRows: 0, maxBytes: 1024},
      }),
      (err) => err instanceof BulkLoadError &&
        err.code === BULK_LOAD_ERROR_CODE.INVALID_BATCH_BOUNDS,
    );
  });

  it('loads multi-batch NDJSON through canonical SQL and proves completeness via external pgwire client', async (t) => {
    const harness = await startPgwireHarness();
    t.after(() => harness.close());

    const sourceText = buildValidNdjsonLines();
    const manifest = buildTestManifest({
      source: {
        sourceId: 'accounts-stream-v1.ndjson',
        sourceDigest: computeSourceDigest(sourceText),
      },
    });

    const outcome = await runBulkLoad({
      manifest,
      sourceText,
      targetTableSchema: ACCOUNT_SCHEMA,
      sqlClient: harness.sqlClient,
      externalReadClient: harness.pgClient,
    });

    assert.equal(outcome.rowsApplied, 8);
    assert.equal(outcome.rowsRejected, 0);
    assert.equal(outcome.checkpoints.length, 3);
    assert.deepEqual(
      outcome.checkpoints.map((cp) => cp.checkpointSeq),
      [0, 1, 2],
    );
    assert.equal(outcome.reconciliation.verified, true);
    assert.equal(outcome.reconciliation.totalExpectedRows, 8);
    assert.equal(outcome.reconciliation.rangeDigests.length, 2);
    assert.equal(outcome.reconciliation.sampledKeyCount, 4);

    const p1Rows = harness.cluster.databases
      .get('accounts-p1')
      .prepare(`SELECT id FROM ${TARGET_TABLE} ORDER BY id ASC`)
      .all();
    const p2Rows = harness.cluster.databases
      .get('accounts-p2')
      .prepare(`SELECT id FROM ${TARGET_TABLE} ORDER BY id ASC`)
      .all();
    assert.deepEqual(p1Rows.map((r) => r.id), [1, 15, 50, 85]);
    assert.deepEqual(p2Rows.map((r) => r.id), [105, 140, 190, 220]);
  });

  it('records durable reject rows with reason codes and excerpts while applying valid rows', async (t) => {
    const harness = await startPgwireHarness();
    t.after(() => harness.close());

    const mixedLines = [
      JSON.stringify({id: 1, name: 'alice', balance: 100, region: 'eu'}),
      '{malformed json line',
      JSON.stringify([1, 2, 3]),
      JSON.stringify({name: 'missing-pk', balance: 200}),
      JSON.stringify({id: 50, name: 'bad-type', balance: 'not-int'}),
      JSON.stringify({id: 51, name: null, balance: 300}),
      JSON.stringify({id: 52, name: 'extra', balance: 400, unknownCol: 'x'}),
      JSON.stringify({id: 105, name: 'erin', balance: 500, region: 'us'}),
    ];
    const sourceText = `${mixedLines.join('\n')}\n`;
    const manifest = buildTestManifest({
      loadId: 'load-with-rejects',
      batchBounds: {maxRows: 3, maxBytes: 4096},
      sampleKeys: [1, 105],
    });

    const outcome = await runBulkLoad({
      manifest,
      sourceText,
      targetTableSchema: ACCOUNT_SCHEMA,
      sqlClient: harness.sqlClient,
      externalReadClient: harness.pgClient,
    });

    assert.equal(outcome.rowsApplied, 2);
    assert.equal(outcome.rowsRejected, 6);
    assert.equal(outcome.rejectedRows.length, 6);
    assert.deepEqual(
      outcome.rejectedRows.map((r) => r.reasonCode),
      [
        BULK_LOAD_REJECT_REASON.MALFORMED_JSON,
        BULK_LOAD_REJECT_REASON.INVALID_RECORD_SHAPE,
        BULK_LOAD_REJECT_REASON.MISSING_PRIMARY_KEY,
        BULK_LOAD_REJECT_REASON.TYPE_MISMATCH,
        BULK_LOAD_REJECT_REASON.NULL_CONSTRAINT_VIOLATION,
        BULK_LOAD_REJECT_REASON.UNKNOWN_COLUMN,
      ],
    );
    assert.deepEqual(
      outcome.rejectedRows.map((r) => r.recordIndex),
      [1, 2, 3, 4, 5, 6],
    );
    assert.equal(outcome.reconciliation.verified, true);
  });

  it('refuses schema drift, source truncation, offset regression, and mutated replay bytes', async (t) => {
    const harness = await startPgwireHarness();
    t.after(() => harness.close());

    const sourceText = buildValidNdjsonLines();
    const manifest = buildTestManifest({loadId: 'load-drift-test'});
    const driftedTargetSchema = {
      primaryKey: 'id',
      columns: [
        {name: 'id', type: 'INTEGER', nullable: false},
        {name: 'name', type: 'TEXT', nullable: false},
        {name: 'balance', type: 'TEXT', nullable: false},
      ],
    };

    await assert.rejects(
      () => runBulkLoad({
        manifest,
        sourceText,
        targetTableSchema: driftedTargetSchema,
        sqlClient: harness.sqlClient,
        externalReadClient: harness.pgClient,
      }),
      (err) => err instanceof BulkLoadError &&
        err.code === BULK_LOAD_ERROR_CODE.SCHEMA_DRIFT,
    );

    // Partial load (stop after checkpoint 0) to test replay failure cases
    const partialManifest = buildTestManifest({loadId: 'load-replay-guards'});
    await assert.rejects(
      () => runBulkLoad({
        manifest: partialManifest,
        sourceText,
        sqlClient: harness.sqlClient,
        externalReadClient: harness.pgClient,
        faultInjector: ({stage, checkpointSeq}) => {
          if (stage === 'after_checkpoint_write' && checkpointSeq === 0) {
            throw new Error('simulated stop after checkpoint 0');
          }
        },
      }),
      /simulated stop after checkpoint 0/u,
    );

    // 1. Source truncation: stream shorter than checkpoint 0 byteOffset
    await assert.rejects(
      () => runBulkLoad({
        manifest: partialManifest,
        sourceText: '{"id":1}\n',
        sqlClient: harness.sqlClient,
        externalReadClient: harness.pgClient,
      }),
      (err) => err instanceof BulkLoadError &&
        err.code === BULK_LOAD_ERROR_CODE.SOURCE_TRUNCATED,
    );

    // 2. Mutated replay bytes: alter 'alice' to 'alicy' in batch 0
    const mutatedSource = sourceText.replace('alice', 'alicy');
    await assert.rejects(
      () => runBulkLoad({
        manifest: partialManifest,
        sourceText: mutatedSource,
        sqlClient: harness.sqlClient,
        externalReadClient: harness.pgClient,
      }),
      (err) => err instanceof BulkLoadError &&
        err.code === BULK_LOAD_ERROR_CODE.BATCH_CHECKSUM_MISMATCH,
    );

    // 3. Offset regression in readBoundedNdjsonBatches
    assert.throws(
      () => readBoundedNdjsonBatches(sourceText, partialManifest, {
        byteOffset: -5,
        recordIndex: 0,
      }),
      (err) => err instanceof BulkLoadError &&
        err.code === BULK_LOAD_ERROR_CODE.OFFSET_REGRESSION,
    );
  });

  it('resumes cleanly after mid-batch loader kill and node restart with zero duplicates and zero gaps', async () => {
    const harness1 = await startPgwireHarness();
    const sourceText = buildValidNdjsonLines();
    const manifest = buildTestManifest({loadId: 'load-crash-recovery'});

    // Kill loader during batch 1 AFTER target rows are written, BEFORE checkpoint 1 is written
    await assert.rejects(
      () => runBulkLoad({
        manifest,
        sourceText,
        targetTableSchema: ACCOUNT_SCHEMA,
        sqlClient: harness1.sqlClient,
        externalReadClient: harness1.pgClient,
        faultInjector: ({stage, checkpointSeq}) => {
          if (stage === 'after_batch_target_write' && checkpointSeq === 1) {
            throw new Error('simulated mid-batch loader crash before checkpoint');
          }
        },
      }),
      /simulated mid-batch loader crash before checkpoint/u,
    );

    // Only checkpoint 0 was persisted, even though batch 1 target rows were written
    const checkpointsBeforeRestart = await readCheckpointChain(
      harness1.sqlClient,
      manifest.loadId,
      manifest.schemaDigest,
    );
    assert.equal(checkpointsBeforeRestart.length, 1);
    assert.equal(checkpointsBeforeRestart[0].checkpointSeq, 0);

    // Simulate cluster node / SQL engine + pgwire restart over retained partition databases
    const retainedDatabases = await harness1.stopNodeAndKeepDisk();
    const harness2 = await startPgwireHarness(retainedDatabases);
    try {
      const resumedOutcome = await runBulkLoad({
        manifest,
        sourceText,
        targetTableSchema: ACCOUNT_SCHEMA,
        sqlClient: harness2.sqlClient,
        externalReadClient: harness2.pgClient,
      });

      assert.equal(resumedOutcome.rowsApplied, 8);
      assert.equal(resumedOutcome.checkpoints.length, 3);
      assert.deepEqual(
        resumedOutcome.checkpoints.map((cp) => cp.checkpointSeq),
        [0, 1, 2],
      );
      assert.equal(resumedOutcome.reconciliation.verified, true);
      assert.equal(resumedOutcome.reconciliation.totalTargetRows, 8);
    } finally {
      await harness2.close();
    }
  });

  it('fails reconciliation deterministically on red-on-revert (skipIdempotentReplay or skipCheckpointPersistence)', async (t) => {
    const harness = await startPgwireHarness();
    t.after(() => harness.close());

    const sourceText = buildValidNdjsonLines();
    const manifestNoIdempotency = buildTestManifest({
      loadId: 'load-red-no-idempotency',
    });

    await assert.rejects(
      () => runBulkLoad({
        manifest: manifestNoIdempotency,
        sourceText,
        sqlClient: harness.sqlClient,
        externalReadClient: harness.pgClient,
        skipIdempotentReplay: true,
      }),
      (err) => err instanceof BulkLoadError &&
        err.code === BULK_LOAD_ERROR_CODE.RECONCILIATION_MISMATCH,
    );

    const harness2 = await startPgwireHarness();
    t.after(() => harness2.close());

    const manifestNoCheckpoints = buildTestManifest({
      loadId: 'load-red-no-checkpoints',
    });

    await assert.rejects(
      () => runBulkLoad({
        manifest: manifestNoCheckpoints,
        sourceText,
        sqlClient: harness2.sqlClient,
        externalReadClient: harness2.pgClient,
        skipCheckpointPersistence: true,
      }),
      (err) => err instanceof BulkLoadError &&
        err.code === BULK_LOAD_ERROR_CODE.RECONCILIATION_MISMATCH,
    );
  });

  it('routes CLI bulk-load run and verify commands', async (t) => {
    const harness = await startPgwireHarness();
    t.after(() => harness.close());

    const sourceText = buildValidNdjsonLines();
    const manifest = buildTestManifest({loadId: 'load-cli-router'});
    const files = new Map([
      ['/virtual/manifest.json', JSON.stringify(manifest)],
      ['/virtual/source.ndjson', sourceText],
    ]);
    const outputs = [];
    const errors = [];

    const runCode = await runBulkLoadCommand(
      ['run', '--manifest', '/virtual/manifest.json', '--source', '/virtual/source.ndjson', '--max-rows', '4'],
      {
        readFile: (p) => files.get(p),
        sqlClient: harness.sqlClient,
        externalReadClient: harness.pgClient,
        writeOutput: (line) => outputs.push(line),
        writeError: (line) => errors.push(line),
      },
    );
    assert.equal(runCode, BULK_LOAD_CLI_EXIT_CODE.SUCCESS);
    assert.equal(errors.length, 0);
    const parsedOutput = JSON.parse(outputs[0]);
    assert.equal(parsedOutput.rowsApplied, 8);
    assert.equal(parsedOutput.checkpoints.length, 2);

    const verifyCode = await runBulkLoadCommand(
      ['verify', '--manifest', '/virtual/manifest.json', '--source', '/virtual/source.ndjson'],
      {
        readFile: (p) => files.get(p),
        sqlClient: harness.sqlClient,
        externalReadClient: harness.pgClient,
        writeOutput: (line) => outputs.push(line),
        writeError: (line) => errors.push(line),
      },
    );
    assert.equal(verifyCode, BULK_LOAD_CLI_EXIT_CODE.SUCCESS);

    const usageCode = await runBulkLoadCommand(
      ['--unknown-flag'],
      {
        writeError: (line) => errors.push(line),
      },
    );
    assert.equal(usageCode, BULK_LOAD_CLI_EXIT_CODE.USAGE);
    assert.equal(
      parseBulkLoadCommand(['--manifest', 'm.json', '--source', 's.ndjson']).subcommand,
      'run',
    );
    assert.equal(typeof computeBatchChecksum, 'function');
    assert.equal(typeof ensureBulkLoadTables, 'function');
    assert.equal(typeof verifyBulkLoadCompleteness, 'function');
  });
});
