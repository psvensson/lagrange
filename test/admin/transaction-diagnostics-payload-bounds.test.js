/**
 * Regression bound of GET /api/admin/diagnostics/transactions (quest
 * transaction-path-telemetry-export), like the sibling diagnostics routes'
 * bounds in admin-diagnostics-payload-bounds.test.js. Every ring of the
 * answer is filled to its worst case: 512 samples of 64 operations each
 * (one COMMIT with its six sub-phases), 16384 participant request records
 * all joined into those samples, and 128 transactions completed without a
 * sample. The answer stays under its bound with every retained entry
 * preserved. Measured 2026-11-28: 7,701,148 bytes (7.34 MiB), built in
 * 12 ms on a cold process; the bound leaves about 9% for field growth.
 */
import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ADMIN_ROUTE} from '../../src/admin/admin-constants.js';
import {createTransactionTelemetryAnswerBuilder} from
  '../../src/admin/admin-transaction-telemetry-answer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {readTelemetryClockMs} from '../../src/diagnostics/telemetry-histogram.js';
import {
  TRANSACTION_OPERATION_KIND,
  TRANSACTION_SUB_PHASE,
} from '../../src/diagnostics/transaction-telemetry-collection.js';
import {
  createCoordinatorTelemetryStore,
  createTransactionTelemetry,
  distributedTransactionTelemetryReadMethods,
  finalizeTransactionTelemetry,
  noteTransactionSubPhase,
  queueTransactionOperation,
  settleTransactionOperation,
  startTransactionOperation,
} from '../../src/query/distributed/distributed-transaction-telemetry.js';
import {
  begin,
  createParticipantRequestTelemetryStore,
  noteSubmission,
  settle,
} from '../../src/query/query-executor-delivery-telemetry.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const NODE_ID = '00000000-0000-4000-8000-000000000001';
const SAMPLE_RING_CAPACITY = 512;
const OPERATIONS_PER_SAMPLE = 64;
const REQUEST_RING_CAPACITY = 16384;
const REQUESTS_PER_SAMPLE = REQUEST_RING_CAPACITY / SAMPLE_RING_CAPACITY;
const WITHOUT_SAMPLE_CAPACITY = 128;
const MAX_TRANSACTION_DIAGNOSTICS_BYTES = 8 * 1024 * 1024;
const HTTP_OK = 200;
const KIND = TRANSACTION_OPERATION_KIND;
const COMMIT_PHASES = Object.freeze([TRANSACTION_SUB_PHASE.FREEZE,
  TRANSACTION_SUB_PHASE.PREPARE_FANOUT, TRANSACTION_SUB_PHASE.PREPARED_STATUS,
  TRANSACTION_SUB_PHASE.DECISION, TRANSACTION_SUB_PHASE.COMMIT_FANOUT,
  TRANSACTION_SUB_PHASE.SETTLEMENT]);

function sessionIdOf(index) {
  return `pgwire-00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function transactionIdOf(index) {
  return index.toString(16).padStart(32, '0');
}

// BEGIN, then writes and reads in turn, then COMMIT.
function kindOf(step) {
  if (step === 0) return KIND.BEGIN;
  if (step === OPERATIONS_PER_SAMPLE - 1) return KIND.COMMIT;
  return step % 2 === 1 ? KIND.WRITE : KIND.READ;
}

function runOperation(coordinator, tx, kind) {
  const operation = queueTransactionOperation(coordinator, kind);
  startTransactionOperation(coordinator, tx.sessionId, operation);
  if (kind === KIND.COMMIT) {
    for (const phase of COMMIT_PHASES) {
      noteTransactionSubPhase(coordinator, tx, phase, readTelemetryClockMs());
    }
    finalizeTransactionTelemetry(coordinator, tx, 'COMMITTED');
  }
  settleTransactionOperation(coordinator, tx.sessionId, operation);
}

function deliverRequests(executor, transactionId) {
  for (let index = 0; index < REQUESTS_PER_SAMPLE; index += 1) {
    const record = begin(`orders-p${index % 4}`, index % 2 === 0);
    noteSubmission(record, {type: QUERY_OPERATION.TRANSACTION,
      operation: QUERY_OPERATION.PREPARE, transactionId});
    settle(executor, record, {success: true});
  }
}

// Every ring at its worst case, through the telemetry's own recording paths.
function fillWorstCase() {
  const coordinator = {transactionTelemetry: createCoordinatorTelemetryStore(),
    transactionsBySession: new Map(), ...distributedTransactionTelemetryReadMethods};
  const queryExecutor = {participantRequestTelemetry: createParticipantRequestTelemetryStore()};
  for (let index = 0; index < SAMPLE_RING_CAPACITY; index += 1) {
    const sessionId = sessionIdOf(index);
    const transactionId = transactionIdOf(index);
    const tx = {sessionId, transactionId, participants: new Map([['p1', {}]])};
    tx.telemetry = createTransactionTelemetry(coordinator, transactionId, sessionId, index + 1);
    coordinator.transactionsBySession.set(sessionId, tx);
    for (let step = 0; step < OPERATIONS_PER_SAMPLE; step += 1) {
      runOperation(coordinator, tx, kindOf(step));
      if (step === 1) deliverRequests(queryExecutor, transactionId);
    }
    coordinator.transactionsBySession.delete(sessionId);
  }
  for (let index = 0; index < WITHOUT_SAMPLE_CAPACITY; index += 1) {
    finalizeTransactionTelemetry(coordinator, {recoveryDiscovered: true,
      sessionId: sessionIdOf(SAMPLE_RING_CAPACITY + index),
      transactionId: transactionIdOf(SAMPLE_RING_CAPACITY + index), transactionEpoch: 1},
    'COMMITTED');
  }
  return {transactionCoordinator: coordinator, queryExecutor};
}

test('GET /api/admin/diagnostics/transactions stays under its bound with every ring at its ' +
  'worst case and every retained entry preserved', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: NODE_ID,
    sqlQueryEngine: fillWorstCase(),
    transactionTelemetryAnswerBuilder: createTransactionTelemetryAnswerBuilder({
      nodeId: NODE_ID, bootIncarnation: 1}),
    enableAdminStream: false,
  });
  await api.initialize(0, {listen: false});
  t.teardown(async () => {
    await api.shutdown();
  });
  const response = await api.getFastify().inject({method: 'GET',
    url: ADMIN_ROUTE.TRANSACTION_DIAGNOSTICS});
  const payloadBytes = Buffer.byteLength(response.body, 'utf8');
  const answer = response.json();
  t.equal(response.statusCode, HTTP_OK, 'the route answers 200');
  t.ok(payloadBytes < MAX_TRANSACTION_DIAGNOSTICS_BYTES,
    `the answer (${payloadBytes} bytes) stays below ${MAX_TRANSACTION_DIAGNOSTICS_BYTES} bytes`);
  const {samples, withoutSample} = answer.sections.coordinator;
  t.equal(samples.entries.length, SAMPLE_RING_CAPACITY, 'every retained sample is preserved');
  t.ok(samples.entries.every((sample) => sample.operations.length === OPERATIONS_PER_SAMPLE &&
    sample.participantRequests.entries.length === REQUESTS_PER_SAMPLE),
  'every sample keeps its operations and its joined participant requests');
  t.equal(withoutSample.entries.length, WITHOUT_SAMPLE_CAPACITY,
    'every transaction completed without a sample is preserved');
  t.equal(answer.sections.delivery.requests.retainedCount, REQUEST_RING_CAPACITY);
});
