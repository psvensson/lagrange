/**
 * Focused witnesses for Review 09:04 CET Priority 2 & 3 (§1, §2, §6, §7):
 * 1. Per-request open-loop interval decomposition (issueLagMs,
 *    workerQueueWaitMs, executionElapsedMs) and coordinator metadata wait
 *    telemetry by purpose.
 * 2. Atomic coordinator metadata transitions (manifest freeze + PREPARING,
 *    decision + COMMITTING/ROLLING_BACK) and reduced submission count.
 * 3. Bounded PGwire output batching, socket backpressure ('drain'), event-loop
 *    yielding for concurrent short queries, clean disconnect stop, and
 *    pre-row rejection of untaggable results.
 * 4. Single result representation reuse, lazy object-row materialization,
 *    duplicate column names, integer presentation, and zero-JSON.stringify
 *    resident byte accounting.
 */

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_ERROR_CODE, QUERY_OPERATION} from '../../src/query/query-constants.js';
import {TRANSACTION_METADATA_PERSIST_PURPOSE} from
  '../../src/query/distributed/distributed-transaction-telemetry.js';
import {
  applyTransactionSettlement,
  observeTransactionSettlement,
} from '../../src/query/distributed/distributed-transaction-settlement.js';
import {buildDecisionRecord} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {
  PgWireProtocolHandler,
  parseQueryMessage,
} from '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {
  decodePartitionResponseRows,
  resolvePartitionExecutionBuilders,
} from '../../src/query/query-executor-partition-request-builders.js';
import {encodeTypedRowSet} from '../../src/query/sql-value-codec.js';
import {DistributedMergeEngine} from
  '../../src/query/distributed/distributed-merge-engine.js';
import {buildSelectFanoutPlan} from
  '../../src/query/distributed/distributed-select-fanout-plan.js';
import {
  PRESENTED_SAFE_INTEGERS_SYMBOL,
  RESIDENT_RESULT_BYTES_SYMBOL,
  estimateResultBytes,
} from '../../src/query/distributed/parallel-query-execution-metrics.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {runOpenLoopOltpStep} from
  '../distributed/harness/oltp-open-loop-step-owner.js';

const TABLE = 'users';
const PARTITION = Object.freeze({
  partition_id: 'p1',
  table_name: TABLE,
  partition_key_start: null,
  partition_key_end: null,
});
const SILENT_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'tx-meta-pgwire-witness'},
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function createTxHarness(options = {}) {
  resetEnvironment();
  let clockMs = 1000;
  const persistLatencyByTable = options.persistLatencyByTable || {};
  const gateway = createTransactionPersistenceGateway({
    beforeMutation: async (mutation) => {
      clockMs += persistLatencyByTable[mutation.tableName] ?? 2;
      if (typeof options.beforeMutation === 'function') {
        await options.beforeMutation(mutation);
      }
    },
  });
  const cache = createMockSystemCache(
    [{table_name: TABLE, primaryKey: 'id'}],
    [PARTITION],
  );
  const deliveries = [];
  const router = {
    async deliver(address, message) {
      const partitionId = address.split('/')[2];
      const copy = structuredClone(message);
      deliveries.push(copy);
      clockMs += 1;
      if (message.type !== QUERY_OPERATION.TRANSACTION) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [],
          changes: 1,
        });
      }
      const reply = options.answer?.(copy, partitionId, gateway) ??
        answerParticipantTransactionRequest(copy, partitionId);
      return buildDeliveryEnvelope({acknowledged: true}, reply);
    },
  };
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: cache,
    messageRouter: router,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true,
    nowFn: () => clockMs,
  });
  engine.transactionCoordinator.sleep = async () => {};
  return {engine, gateway, deliveries};
}

test('§1 Witness: per-request open-loop interval decomposition computes ' +
  'issueLagMs, workerQueueWaitMs, and executionElapsedMs directly from ' +
  'per-request timestamps without subtracting percentiles', async () => {
  // Two requests on worker 0 so request 1 queues behind request 0 on worker 0,
  // and a third request on worker 1 with high issueLagMs and short execution:
  // - op 0 (worker 0, intended 0): issued at 2, execStart at 2, completed at 42
  //   -> issueLagMs=2, workerQueueWaitMs=0, executionElapsedMs=40, latencyMs=42
  // - op 1 (worker 0, intended 10): issued at 11, execStart at 42, completed at 52
  //   -> issueLagMs=1, workerQueueWaitMs=31, executionElapsedMs=10, latencyMs=42
  // - op 2 (worker 1, intended 20): issued at 45, execStart at 45, completed at 49
  //   -> issueLagMs=25, workerQueueWaitMs=0, executionElapsedMs=4, latencyMs=29
  const operations = [
    {phase: 'measurement', workerId: 1, sequence: 1, kind: 'payment_tx1'},
    {phase: 'measurement', workerId: 1, sequence: 2, kind: 'payment_tx1'},
    {phase: 'measurement', workerId: 2, sequence: 1, kind: 'payment_tx1'},
  ];
  const issueClockValues = [2, 11, 45];
  const completionBySeq = new Map([
    ['1:1', {startAt: 2, endAt: 42}],
    ['1:2', {startAt: 42, endAt: 52}],
    ['2:1', {startAt: 45, endAt: 49}],
  ]);
  let nowMs = 0;
  let waitIndex = 0;
  let releaseFirstOp;
  const firstOpBarrier = new Promise((resolve) => {
    releaseFirstOp = resolve;
  });

  const adapter = {
    async executeTransaction(op) {
      const key = `${op.workerId}:${op.sequence}`;
      if (key === '1:1') {
        await firstOpBarrier;
      }
      const timing = completionBySeq.get(key);
      nowMs = timing.endAt;
      return {
        outcome: 'committed',
        attemptEvidence: {
          statements: [],
          endpoint: '127.0.0.1:5432',
          serverConnectionId: `conn-${op.workerId}`,
        },
        result: {status: 'ok'},
      };
    },
  };

  const summary = await runOpenLoopOltpStep(adapter, operations, {
    offeredRatePerSec: 100,
    startTimeMs: 0,
    watchdog: {boundMs: 60000, derivation: {source: 'test-watchdog'}},
    now: () => nowMs,
    waitUntil: async () => {
      await new Promise((r) => setImmediate(r));
      const idx = waitIndex;
      waitIndex += 1;
      nowMs = issueClockValues[idx];
      if (idx === 1) {
        setImmediate(() => releaseFirstOp());
      }
    },
  });

  assert.equal(summary.records.length, 3);
  const [rec0, rec1, rec2] = summary.records;
  assert.deepEqual(
    {
      issueLagMs: rec0.issueLagMs,
      workerQueueWaitMs: rec0.workerQueueWaitMs,
      executionElapsedMs: rec0.executionElapsedMs,
      queueDelayMs: rec0.queueDelayMs,
      latencyMs: rec0.latencyMs,
    },
    {
      issueLagMs: 2,
      workerQueueWaitMs: 0,
      executionElapsedMs: 40,
      queueDelayMs: 2,
      latencyMs: 42,
    },
  );
  assert.deepEqual(
    {
      issueLagMs: rec1.issueLagMs,
      workerQueueWaitMs: rec1.workerQueueWaitMs,
      executionElapsedMs: rec1.executionElapsedMs,
      queueDelayMs: rec1.queueDelayMs,
      latencyMs: rec1.latencyMs,
    },
    {
      issueLagMs: 1,
      workerQueueWaitMs: 31,
      executionElapsedMs: 10,
      queueDelayMs: 32,
      latencyMs: 42,
    },
  );
  assert.deepEqual(
    {
      issueLagMs: rec2.issueLagMs,
      workerQueueWaitMs: rec2.workerQueueWaitMs,
      executionElapsedMs: rec2.executionElapsedMs,
      queueDelayMs: rec2.queueDelayMs,
      latencyMs: rec2.latencyMs,
    },
    {
      issueLagMs: 25,
      workerQueueWaitMs: 0,
      executionElapsedMs: 4,
      queueDelayMs: 25,
      latencyMs: 29,
    },
  );

  // Notice that max(queueDelayMs)=32 and max(issueLagMs)=25, so subtracting
  // percentiles would falsely claim p99(workerQueueWaitMs) = 32 - 25 = 7,
  // whereas direct per-request interval decomposition reports p99 = 31!
  assert.equal(summary.issueLagMs.p99Ms, 25);
  assert.equal(summary.queueDelayMs.p99Ms, 32);
  assert.equal(
    summary.workerQueueWaitMs.p99Ms,
    31,
    'per-request workerQueueWaitMs p99 is computed directly (31), never by subtracting percentiles (32 - 25 = 7)',
  );
  assert.equal(summary.executionElapsedMs.p99Ms, 40);
  assert.equal(summary.intervalDecomposition.committed.workerQueueWaitMs.p99Ms, 31);
  assert.equal(summary.intervalDecomposition.committed.executionElapsedMs.p99Ms, 40);
});

test('§1 & §2 Witness: 1-participant 1-write explicit transaction executes ' +
  'atomic manifest-freeze+PREPARING and atomic decision+COMMITTING with ' +
  'per-purpose metadata persistence telemetry', async (t) => {
  const replyBoundaryRows = [];
  const harness = createTxHarness({
    answer: (message, partitionId, gateway) => {
      const row = gateway.db.prepare(
        `SELECT * FROM ${TABLES.SQL_TRANSACTIONS} WHERE transaction_id = ?`,
      ).get(message.transactionId);
      replyBoundaryRows.push({
        operation: message.operation,
        status: row?.status ?? null,
        participantSetState: row?.participant_set_state ?? null,
        commitMode: row?.commit_mode ?? null,
        decision: row?.decision ?? null,
      });
      return answerParticipantTransactionRequest(message, partitionId);
    },
  });
  t.after(async () => {
    await harness.engine.shutdown();
    harness.gateway.db.close();
  });

  const sessionId = 'atomic-tx-witness';
  const begun = await harness.engine.executeQuery('BEGIN', [], {sessionId});
  assert.equal(begun.success, true);
  const written = await harness.engine.executeQuery(
    `INSERT INTO ${TABLE} (id, name) VALUES (?, ?)`,
    ['u1', 'Alice'],
    {sessionId},
  );
  assert.equal(written.success, true);
  const committed = await harness.engine.executeQuery('COMMIT', [], {
    sessionId,
    expectedTransactionId: begun.transactionId,
  });
  assert.equal(committed.success, true);

  // Verify sql_transactions mutations:
  // 1. INSERT (ACTIVE, OPEN)
  // 2. UPDATE (participant admission)
  // 3. UPDATE (atomic manifest freeze + status='PREPARING')
  // 4. UPDATE (status='PREPARED')
  // 5. UPDATE (atomic decision='COMMIT' + status='COMMITTING')
  // 6. UPDATE (status='COMMITTED')
  const txMutations = harness.gateway.mutations.filter(
    (m) => m.tableName === TABLES.SQL_TRANSACTIONS,
  );
  assert.equal(txMutations.length, 6, 'eliminated 2 serial sql_transactions round-trips');

  const freezeMutation = txMutations[2];
  assert.equal(freezeMutation.data.participant_set_state, 'FROZEN');
  assert.equal(freezeMutation.data.commit_mode, 'TWO_PHASE_COMMIT');
  assert.equal(freezeMutation.data.frozen_participant_count, 1);
  assert.equal(
    freezeMutation.data.status,
    'PREPARING',
    'manifest freeze atomically transitions status to PREPARING',
  );

  const decisionMutation = txMutations[4];
  assert.equal(decisionMutation.whereClause.decision, null);
  assert.equal(decisionMutation.data.decision, 'COMMIT');
  assert.equal(
    decisionMutation.data.status,
    'COMMITTING',
    'decision mutation atomically transitions status to COMMITTING',
  );

  // Verify durable state at PREPARE and COMMIT wire boundaries
  const atPrepare = replyBoundaryRows.find((r) => r.operation === QUERY_OPERATION.PREPARE);
  assert.deepEqual(atPrepare, {
    operation: QUERY_OPERATION.PREPARE,
    status: 'PREPARING',
    participantSetState: 'FROZEN',
    commitMode: 'TWO_PHASE_COMMIT',
    decision: null,
  });
  const atCommit = replyBoundaryRows.find((r) => r.operation === QUERY_OPERATION.COMMIT);
  assert.deepEqual(atCommit, {
    operation: QUERY_OPERATION.COMMIT,
    status: 'COMMITTING',
    participantSetState: 'FROZEN',
    commitMode: 'TWO_PHASE_COMMIT',
    decision: 'COMMIT',
  });

  // Verify telemetry by purpose
  const breakdown = harness.engine.transactionCoordinator.getLastTransactionBreakdown();
  assert.ok(breakdown);
  assert.equal(breakdown.transactionId, begun.transactionId);
  assert.equal(
    breakdown.metadataMutations,
    harness.gateway.mutations.length,
    'elided transient participant statuses are not counted as gateway submissions',
  );
  for (const purpose of Object.values(TRANSACTION_METADATA_PERSIST_PURPOSE)) {
    assert.equal(typeof breakdown.metadataSubmissionsByPurpose[purpose], 'number');
    assert.equal(typeof breakdown.metadataPersistMsByPurpose[purpose], 'number');
  }
  assert.equal(breakdown.metadataSubmissionsByPurpose.registration, 1);
  assert.equal(breakdown.metadataSubmissionsByPurpose.participantAdmission, 2);
  assert.equal(breakdown.metadataSubmissionsByPurpose.statementOutcome, 1);
  assert.equal(breakdown.metadataSubmissionsByPurpose.manifestFreeze, 1);
  assert.equal(breakdown.metadataSubmissionsByPurpose.preparing, 2);
  assert.equal(breakdown.metadataSubmissionsByPurpose.decisionAndCommitting, 1);
  assert.equal(breakdown.metadataSubmissionsByPurpose.settlement, 2);
  assert.equal(harness.gateway.mutations.length, 10);

  const summary = harness.engine.transactionCoordinator.getTransactionTelemetrySummary();
  assert.equal(summary.transactionCount, 1);
  assert.ok(summary.avgMetadataSubmissionsByPurpose);
  assert.ok(summary.avgMetadataPersistMsByPurpose);
});

test('§2 Witness: atomic freeze+PREPARING lost-answer readback and settlement ' +
  'DECIDE atomic status transition', async (t) => {
  const txId = 'b'.repeat(32);
  const participantId = `${txId}:p1`;
  const manifest = JSON.stringify([[participantId, 'p1']]);
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());

  gateway.seed(TABLES.SQL_TRANSACTIONS, {
    transaction_id: txId,
    session_id: 's1',
    transaction_epoch: 3,
    transaction_mode: 'EXPLICIT',
    status: 'ACTIVE',
    timeout_deadline: 5000,
    participant_set_state: 'OPEN',
    participant_set_text: manifest,
    frozen_participant_count: 0,
    commit_mode: 'NOT_SELECTED',
    created_at: 1,
    updated_at: 1,
  });

  const freezeCmd = {
    kind: 'FREEZE',
    transactionId: txId,
    sessionId: 's1',
    transactionEpoch: 3,
    participantSetText: manifest,
  };
  assert.equal(observeTransactionSettlement(gateway.db, freezeCmd).outcome, 'ready');
  assert.equal(applyTransactionSettlement(gateway.db, freezeCmd).outcome, 'applied');

  const record = buildDecisionRecord(txId, 'ROLLBACK', [[participantId, null]]);
  const decideCmd = {
    kind: 'DECIDE',
    transactionId: txId,
    sessionId: 's1',
    transactionEpoch: 3,
    participantSetText: manifest,
    decision: 'ROLLBACK',
    decisionText: record.decisionText,
    decisionDigest: record.decisionDigest,
  };
  const decided = applyTransactionSettlement(gateway.db, decideCmd);
  assert.equal(decided.outcome, 'applied');
  const rowAfterDecide = gateway.db.prepare(
    `SELECT * FROM ${TABLES.SQL_TRANSACTIONS} WHERE transaction_id = ?`,
  ).get(txId);
  assert.equal(rowAfterDecide.decision, 'ROLLBACK');
  assert.equal(
    rowAfterDecide.status,
    'ROLLING_BACK',
    'settlement DECIDE atomically sets progress status ROLLING_BACK',
  );
  // Re-applying PROGRESS with ROLLING_BACK is idempotently answered 'replayed'
  const progressRollingBack = {
    kind: 'PROGRESS',
    transactionId: txId,
    sessionId: 's1',
    transactionEpoch: 3,
    participantSetText: manifest,
    decisionDigest: record.decisionDigest,
    status: 'ROLLING_BACK',
  };
  assert.equal(
    applyTransactionSettlement(gateway.db, progressRollingBack).outcome,
    'replayed',
  );
});

class BackpressuredMockSocket extends EventEmitter {
  constructor({backpressureEveryWrites = 1} = {}) {
    super();
    this.written = [];
    this.queuedBytes = 0;
    this.maxQueuedBytes = 0;
    this.backpressured = false;
    this.writesWhileBackpressured = 0;
    this.writeCount = 0;
    this.backpressureEveryWrites = backpressureEveryWrites;
    this.destroyed = false;
    this.writableEnded = false;
    this.writable = true;
  }

  write(chunk) {
    const buf = Buffer.from(chunk);
    if (this.backpressured) {
      this.writesWhileBackpressured += 1;
    }
    this.written.push(buf);
    this.writeCount += 1;
    this.queuedBytes += buf.length;
    if (this.queuedBytes > this.maxQueuedBytes) {
      this.maxQueuedBytes = this.queuedBytes;
    }
    if (this.writeCount % this.backpressureEveryWrites === 0) {
      this.backpressured = true;
      return false;
    }
    return true;
  }

  drain() {
    this.queuedBytes = 0;
    this.backpressured = false;
    this.emit('drain');
  }

  end() {
    this.writableEnded = true;
    this.writable = false;
  }

  destroy() {
    this.destroyed = true;
    this.writable = false;
    this.emit('close');
  }

  decodeFrames() {
    const all = Buffer.concat(this.written);
    const frames = [];
    for (let offset = 0; offset + 5 <= all.length;) {
      const type = all[offset];
      const len = all.readInt32BE(offset + 1);
      const body = all.subarray(offset + 5, offset + 1 + len);
      frames.push({type, body});
      offset += 1 + len;
    }
    return frames;
  }
}

function buildStartupBuffer() {
  const parts = [
    Buffer.alloc(4),
    Buffer.from('user\0test\0database\0test\0\0', 'utf8'),
  ];
  parts[0].writeInt32BE(PG_PROTOCOL_VERSION.CODE, 0);
  const payload = Buffer.concat(parts);
  const header = Buffer.alloc(4);
  header.writeInt32BE(payload.length + 4, 0);
  return Buffer.concat([header, payload]);
}

function buildQueryBuffer(sql) {
  const body = Buffer.from(`${sql}\0`, 'utf8');
  const frame = Buffer.alloc(1 + 4 + body.length);
  frame[0] = PG_FRONTEND_MSG.QUERY;
  frame.writeInt32BE(4 + body.length, 1);
  body.copy(frame, 5);
  return frame;
}

test('§6 Witness: PGwire slow-reader backpressure bounds queued memory, ' +
  'awaits drain, yields for concurrent short queries, preserves frame/tag ' +
  'order, rejects untaggable results before rows, and stops on disconnect', async () => {
  const rowCount = 2500;
  const largeRawRows = Array.from({length: rowCount}, (_, index) => [
    index + 1,
    `payload-row-${String(index + 1).padStart(6, '0')}-${'x'.repeat(48)}`,
  ]);
  const batchMaxBytes = 4096;

  const adapter = {
    async authenticate() {},
    async describe() {
      return {
        success: true,
        described: true,
        statementType: 'SELECT',
        returnsRows: true,
        paramCount: 0,
        paramOids: [],
        columns: [
          {name: 'id', oid: 23, typeSize: 4, typeModifier: -1, formatCode: 0},
          {name: 'payload', oid: 25, typeSize: -1, typeModifier: -1, formatCode: 0},
        ],
      };
    },
    async execute(_sessionId, sql) {
      if (sql.includes('LARGE_RESULT')) {
        return {
          success: true,
          statementType: 'SELECT',
          columns: ['id', 'payload'],
          rawRows: largeRawRows,
          get rows() {
            return largeRawRows.map(([id, payload]) => ({id, payload}));
          },
        };
      }
      if (sql.includes('UNTAGGABLE')) {
        return {
          success: true,
          // Missing statementType / operation -> untaggable
          columns: ['id'],
          rows: [{id: 1}, {id: 2}],
        };
      }
      return {
        success: true,
        statementType: 'SELECT',
        columns: ['ok'],
        rawRows: [[1]],
        rows: [{ok: 1}],
      };
    },
    closeSession() {},
  };

  // 1. Slow reader socket with 4 KiB batch cap + concurrent fast reader
  const slowSocket = new BackpressuredMockSocket({backpressureEveryWrites: 1});
  const slowHandler = new PgWireProtocolHandler({
    adapter,
    socket: slowSocket,
    logger: SILENT_LOGGER,
    outputBatchMaxBytes: batchMaxBytes,
  });
  slowHandler.start();
  slowSocket.emit('data', buildStartupBuffer());
  while (slowSocket.backpressured) {
    slowSocket.drain();
    await new Promise((r) => setImmediate(r));
  }
  await slowHandler._processing;
  slowSocket.written = [];
  slowSocket.maxQueuedBytes = 0;
  slowSocket.queuedBytes = 0;
  slowSocket.backpressured = false;
  slowSocket.writesWhileBackpressured = 0;

  const fastSocket = new BackpressuredMockSocket({backpressureEveryWrites: 1000});
  const fastHandler = new PgWireProtocolHandler({
    adapter,
    socket: fastSocket,
    logger: SILENT_LOGGER,
  });
  fastHandler.start();
  fastSocket.emit('data', buildStartupBuffer());
  await fastHandler._processing;
  fastSocket.written = [];

  // Start the 2,500-row query on the slow reader
  slowSocket.emit('data', buildQueryBuffer('SELECT * FROM LARGE_RESULT'));
  await new Promise((r) => setImmediate(r));

  // Slow reader is now parked waiting for 'drain' after RowDescription
  assert.equal(slowSocket.backpressured, true);
  assert.equal(slowSocket.writesWhileBackpressured, 0);

  // Drain once so the first DataRow batch is written, then issue a concurrent
  // short query on fastHandler while slowHandler is still mid-stream!
  slowSocket.drain();
  await new Promise((r) => setImmediate(r));
  assert.equal(slowSocket.backpressured, true);

  let fastCompletedWhileSlowDraining = false;
  fastSocket.emit('data', buildQueryBuffer('SELECT 1'));
  await fastHandler._processing;
  const fastFrames = fastSocket.decodeFrames();
  if (
    slowSocket.backpressured &&
    fastFrames.some((f) => f.type === PG_BACKEND_MSG.READY_FOR_QUERY)
  ) {
    fastCompletedWhileSlowDraining = true;
  }
  assert.equal(
    fastCompletedWhileSlowDraining,
    true,
    'unrelated short query completes promptly while slow reader is backpressured',
  );

  // Now drain the remaining batches on the slow reader until _processing finishes
  let drainEvents = 1;
  let slowFinished = false;
  slowHandler._processing.then(() => {
    slowFinished = true;
  });
  while (!slowFinished) {
    if (slowSocket.backpressured) {
      slowSocket.drain();
      drainEvents += 1;
    }
    await new Promise((r) => setImmediate(r));
  }
  await slowHandler._processing;

  assert.equal(
    slowSocket.writesWhileBackpressured,
    0,
    'never writes to socket while backpressured before drain',
  );
  assert.ok(
    slowSocket.maxQueuedBytes <= batchMaxBytes + 256,
    `maxQueuedBytes (${slowSocket.maxQueuedBytes}) bounded by batchMaxBytes (${batchMaxBytes})`,
  );
  assert.ok(drainEvents > 10, `expected multiple batched drains, got ${drainEvents}`);

  const slowFrames = slowSocket.decodeFrames();
  assert.equal(slowFrames[0].type, PG_BACKEND_MSG.ROW_DESCRIPTION);
  const dataRowFrames = slowFrames.filter((f) => f.type === PG_BACKEND_MSG.DATA_ROW);
  assert.equal(dataRowFrames.length, rowCount);
  assert.equal(slowFrames.at(-2).type, PG_BACKEND_MSG.COMMAND_COMPLETE);
  assert.equal(
    slowFrames.at(-2).body.toString('utf8'),
    `SELECT ${rowCount}\0`,
  );
  assert.equal(slowFrames.at(-1).type, PG_BACKEND_MSG.READY_FOR_QUERY);

  // 2. Pre-row rejection of untaggable result (0 RowDescription / DataRow frames)
  slowSocket.written = [];
  slowSocket.backpressured = false;
  slowSocket.emit('data', buildQueryBuffer('SELECT * FROM UNTAGGABLE'));
  let untaggableDone = false;
  slowHandler._processing.then(() => {
    untaggableDone = true;
  });
  while (!untaggableDone) {
    if (slowSocket.backpressured) {
      slowSocket.drain();
    }
    await new Promise((r) => setImmediate(r));
  }
  await slowHandler._processing;
  const untaggableFrames = slowSocket.decodeFrames();
  assert.equal(
    untaggableFrames.filter(
      (f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION || f.type === PG_BACKEND_MSG.DATA_ROW,
    ).length,
    0,
    'untaggable result is rejected before any RowDescription or DataRow is emitted',
  );
  assert.equal(untaggableFrames[0].type, PG_BACKEND_MSG.ERROR_RESPONSE);
  assert.equal(untaggableFrames.at(-1).type, PG_BACKEND_MSG.READY_FOR_QUERY);

  // 3. Clean stop on mid-stream disconnect
  slowSocket.written = [];
  slowSocket.backpressured = false;
  slowSocket.emit('data', buildQueryBuffer('SELECT * FROM LARGE_RESULT'));
  await new Promise((r) => setImmediate(r));
  slowSocket.drain();
  await new Promise((r) => setImmediate(r));
  const writesBeforeDisconnect = slowSocket.written.length;
  slowSocket.destroy();
  await slowHandler._processing;
  assert.equal(
    slowSocket.written.length,
    writesBeforeDisconnect,
    'disconnect during backpressure stops encoding/writing immediately',
  );
  assert.equal(typeof parseQueryMessage, 'function');
  fastHandler.destroy();
});

test('§7 Witness: single result representation reuse, lazy object rows, ' +
  'duplicate column names, integer presentation, and zero JSON.stringify', async () => {
  const columns = ['id', 'label', 'label'];
  const encoded = encodeTypedRowSet(columns, [
    [10n, 'first-a', 'first-b'],
    [20n, 'second-a', 'second-b'],
  ]);

  let stringifyCalls = 0;
  const originalStringify = JSON.stringify;
  JSON.stringify = function(...args) {
    stringifyCalls += 1;
    return originalStringify.apply(this, args);
  };

  let decoded;
  let builtResult;
  let estimatedBytes;
  let fastPathMerged;
  try {
    decoded = decodePartitionResponseRows({rowSet: encoded}, {safeIntegers: false});
    // Before accessing .rows, lazy getter has not materialized object rows
    const rawDescriptor = Object.getOwnPropertyDescriptor(decoded, 'rows');
    assert.equal(typeof rawDescriptor?.get, 'function', 'decodedPayload.rows is lazy');

    const builders = resolvePartitionExecutionBuilders({
      executionOptions: {safeIntegers: false},
      forRead: true,
      params: [],
      partitionId: 'p1',
      sql: 'SELECT id, label, label FROM items',
    });
    builtResult = builders.buildSuccessResult({
      success: true,
      rowSet: encoded,
      rowSetComplete: true,
      readGeneration: 4,
    });
    assert.equal(
      typeof Object.getOwnPropertyDescriptor(builtResult, 'rows')?.get,
      'function',
      'partition result preserves lazy .rows before access',
    );

    // Single-partition fast path in DistributedMergeEngine preserves lazy .rows
    // and reuses rawRows by reference without re-presenting
    const mergeEngine = new DistributedMergeEngine();
    const ast = new SQLParser('SELECT id, label FROM items').parse();
    const singlePartitionPlan = buildSelectFanoutPlan(ast, [], 1);
    fastPathMerged = await mergeEngine.mergePartitionResults(
      [builtResult],
      ast,
      null,
      singlePartitionPlan,
      [],
      {safeIntegers: false},
    );
    assert.equal(
      fastPathMerged.rawRows,
      builtResult.rawRows,
      'single-partition fast path reuses presented rawRows by reference',
    );
    assert.equal(
      typeof Object.getOwnPropertyDescriptor(fastPathMerged, 'rows')?.get,
      'function',
      'single-partition fast path preserves lazy .rows until read',
    );

    // Accessing .rows materializes once and shares the cached array
    const materializedRows = fastPathMerged.rows;
    assert.equal(
      materializedRows,
      builtResult.rows,
      'lazy materializer caches and shares the single object-row array',
    );
    assert.deepEqual(fastPathMerged.columns, ['id', 'label', 'label']);
    assert.deepEqual(fastPathMerged.rawRows, [
      [10, 'first-a', 'first-b'],
      [20, 'second-a', 'second-b'],
    ]);
    assert.deepEqual(materializedRows, [
      {id: 10, label: 'first-b'},
      {id: 20, label: 'second-b'},
    ]);
    assert.equal(materializedRows[PRESENTED_SAFE_INTEGERS_SYMBOL], false);
    assert.ok(Number.isSafeInteger(materializedRows[RESIDENT_RESULT_BYTES_SYMBOL]));

    // Second merge call after .rows is already materialized reuses .rows by reference
    const secondFastPath = await mergeEngine.mergePartitionResults(
      [builtResult],
      ast,
      null,
      singlePartitionPlan,
      [],
      {safeIntegers: false},
    );
    assert.equal(secondFastPath.rows, materializedRows);
    assert.equal(secondFastPath.rawRows, builtResult.rawRows);

    // estimateResultBytes returns precomputed bytes in O(1) with 0 JSON.stringify calls
    estimatedBytes = estimateResultBytes(materializedRows);
    assert.equal(
      estimatedBytes,
      materializedRows[RESIDENT_RESULT_BYTES_SYMBOL],
    );

    // Also test structural estimator on an unannotated plain array with 0 JSON.stringify calls
    const plainRows = [
      {id: 1, name: 'alpha', active: true, extra: null},
      {id: 2, name: 'beta "quoted"\nline', active: false, extra: null},
    ];
    const structuralBytes = estimateResultBytes(plainRows);
    assert.equal(
      structuralBytes,
      originalStringify(plainRows).length * 2,
      'structural byte estimator matches exact UTF-16 JSON byte length',
    );
  } finally {
    JSON.stringify = originalStringify;
  }

  assert.equal(
    stringifyCalls,
    0,
    'zero JSON.stringify calls during decode, single-partition merge, and estimateResultBytes',
  );
  assert.equal(
    estimatedBytes,
    JSON.stringify(fastPathMerged.rows).length * 2,
    'precomputed resident bytes during decode match exact UTF-16 JSON bytes',
  );

  // Integer precision refusal when safeIntegers: false vs preserved BigInt when safeIntegers: true
  const unsafeRowSet = encodeTypedRowSet(['big'], [[9007199254740993n]]);
  assert.throws(
    () => decodePartitionResponseRows({rowSet: unsafeRowSet}, {safeIntegers: false}),
    {code: QUERY_ERROR_CODE.INTEGER_PRECISION_UNREPRESENTABLE},
  );
  const safeDecoded = decodePartitionResponseRows(
    {rowSet: unsafeRowSet},
    {safeIntegers: true},
  );
  assert.deepEqual(safeDecoded.rawRows, [[9007199254740993n]]);
  assert.deepEqual(safeDecoded.rows, [{big: 9007199254740993n}]);
});
