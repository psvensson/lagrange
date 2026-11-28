/**
 * Witnesses of the transaction-path telemetry export (quest
 * transaction-path-telemetry-export; design record O1 section 8 as ruled,
 * rulings 1-9). One owner of every witness: the node:test file
 * transaction-telemetry-export.test.js and the sealed guard
 * scripts/checks/transaction-path-telemetry-export-guard.js both run these
 * functions, so the probe and the tests can never disagree.
 *
 * Each witness first drives the real path (a real SQLQueryEngine, its
 * DistributedTransactionCoordinator, the in-memory transaction persistence
 * gateway, PgWireProtocolHandler on a frame-recording socket, and the admin
 * API through fastify inject without a listener) and asserts that the path
 * did what the scenario needs. Only then does it read the export, so a red
 * witness names the missing export property, never a broken fixture.
 *
 * The contract modules are loaded on demand: on a tree without them every
 * dependent witness is one unmet property (the guard counts each), not a
 * crash of the whole probe.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';

import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ADMIN_ROUTE} from '../../src/admin/admin-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PARTICIPANT_TRANSACTION_FAILURE_CODE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {PostgresWireAdapter} from '../../src/query/pg/postgres-wire-adapter.js';
import {
  QUERY_ERROR_CODE,
  QUERY_OPERATION,
  QUERY_SESSION,
} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {encodeTypedRowSet} from '../../src/query/sql-value-codec.js';
import {PgWireProtocolHandler} from '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {createMockSystemCache} from '../query/sql-query-engine-test-support.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {recoveryDecisionColumns, recoveryRowsOf} from
  '../test-helpers/transaction-recovery-rows-fixture.js';

// --- The contract this quest defines (transition record, item 2) ----------

const TRANSACTION_ROUTE = '/api/admin/diagnostics/transactions';
const SINCE_SEQUENCE_PARAM = 'sinceSequence';
const COLLECTION_MODULE_PATH = 'src/diagnostics/transaction-telemetry-collection.js';
const HISTOGRAM_MODULE_PATH = 'src/diagnostics/telemetry-histogram.js';
const COORDINATOR_SECTION = 'coordinator';
const AVAILABILITY_MEASURED = 'measured';
const AVAILABILITY_UNAVAILABLE = 'unavailable';
const REASON_NOT_COMPOSED = 'NOT_COMPOSED';
const WINDOW_COMPARABLE = 'COMPARABLE';
const WINDOW_INCOMPARABLE_RESTARTED = 'INCOMPARABLE_RESTARTED';
const NODE_STATE = Object.freeze({
  ANSWERED: 'ANSWERED',
  UNREACHABLE: 'UNREACHABLE',
  TIMED_OUT: 'TIMED_OUT',
  HTTP_REFUSED: 'HTTP_REFUSED',
  MALFORMED: 'MALFORMED',
});
const OPERATION_KIND = Object.freeze({
  BEGIN: 'BEGIN',
  WRITE: 'WRITE',
  READ: 'READ',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});
const COMMIT_SUB_PHASES = Object.freeze([
  'FREEZE',
  'PREPARING_STATUS',
  'PREPARE_FANOUT',
  'PREPARED_STATUS',
  'DECISION',
  'COMMITTING_STATUS',
  'COMMIT_FANOUT',
  'SETTLEMENT',
]);
const REQUEST = Object.freeze({
  QUERY_READ: 'QUERY_READ',
  QUERY_WRITE: 'QUERY_WRITE',
  BEGIN: 'BEGIN',
  PREPARE: 'PREPARE',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  TRANSACTION_OUTCOME: 'TRANSACTION_OUTCOME',
});
const REQUEST_OUTCOME = Object.freeze({ACCEPTED: 'ACCEPTED', FAILED: 'FAILED'});
const OUTCOME_COMMITTED = 'COMMITTED';
const OUTCOME_ROLLED_BACK = 'ROLLED_BACK';
const METADATA_PURPOSES = Object.freeze([
  'registration',
  'participantAdmission',
  'statementOutcome',
  'manifestFreeze',
  'preparing',
  'decisionAndCommitting',
  'settlement',
]);
const OBSERVATION = Object.freeze({
  BEGIN_RUN: 'runMs.BEGIN',
  READ_RUN: 'runMs.READ',
  RECOVERY_FIFO_WAIT: 'fifoWaitMs.RECOVERY',
  RECOVERY_RUN: 'runMs.RECOVERY',
  QUERY_READ_REQUEST: 'participantRequestMs.QUERY_READ',
  OUTCOME_REQUEST: 'participantRequestMs.TRANSACTION_OUTCOME',
  RETRY_BACKOFF: 'participantRetryBackoffMs',
  READBACK: 'metadataReadbackCount',
});
const HISTOGRAM_BUCKET_COUNT = 23;
const HISTOGRAM_UPPER_BOUNDS_US = Object.freeze(Array.from(
  {length: HISTOGRAM_BUCKET_COUNT - 1}, (_, index) => 2 ** (index + 4)));
const SAMPLE_RING_CAPACITY = 512;
const ACCOUNTING_TOLERANCE_MS = 0.5;
const HISTOGRAM_SUM_TOLERANCE_MS = 1e-6;
const OBSERVATION_UNITS = Object.freeze(new Set(['Ms', 'Count']));

// --- Fixture constants ------------------------------------------------------

const TABLE = 'users';
const PARTITION_ID = 'p1';
const NODE_ID = 'telemetry-witness-node';
const BOOT_INCARNATION = 7;
const RESTARTED_BOOT_INCARNATION = 8;
const ROLLBACK_FANOUT_HOLD_MS = 5;
const RECOVERY_HOLD_MS = 15;
const RECOVERY_START_POLLS = 2000;
const COLLECTION_DEADLINE_MS = 100;
const COLLECTION_SLACK_MS = 2000;
const WINDOW_FIRST_BATCH = 2;
const WINDOW_SECOND_BATCH = 3;
const RING_OVERFLOW = 8;
const RECOVERED_ID = 'a'.repeat(32);
const ROW_VALUE_A = 'Alice-telemetry-row';
const ROW_VALUE_B = 'Bob-telemetry-row';
const INSERT_A = `INSERT INTO ${TABLE} (id, name) VALUES ('u1', '${ROW_VALUE_A}')`;
const INSERT_B = `INSERT INTO ${TABLE} (id, name) VALUES ('u2', '${ROW_VALUE_B}')`;
const SELECT_A = `SELECT id FROM ${TABLE} WHERE id = 'u1'`;
const SELECT_PATTERN = /^\s*SELECT\b/iu;
const SQL_TEXT_MARKERS = Object.freeze(['INSERT INTO', 'SELECT id', ROW_VALUE_A, ROW_VALUE_B]);
const TAG_BEGIN = 'BEGIN';
const TAG_INSERT = 'INSERT 0 1';
const TAG_SELECT = 'SELECT 1';
const TAG_COMMIT = 'COMMIT';
const TAG_ROLLBACK = 'ROLLBACK';
const FRAME_COMMAND_COMPLETE = 'C';
const FRAME_ERROR = 'E';
const FRAME_HEADER_BYTES = 5;
const ERROR_FIELD_MESSAGE = 'M';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_UNAVAILABLE = 503;
const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const TRUSTING_AUTH = Object.freeze({
  authenticate: async ({user, database}) => ({
    authenticated: true,
    context: {tenantId: database, principal: user, roles: ['admin']},
  }),
  authorizeQuery: () => ({authorized: true}),
});
const SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'name', type: 'TEXT'},
]});

function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

// --- Contract loading -------------------------------------------------------

async function importContractModule(relativePath, absentMeaning) {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  if (!fs.existsSync(url)) {
    assert.fail(`${relativePath} does not exist: ${absentMeaning}`);
  }
  return import(url.href);
}

async function loadCollectionContract() {
  return importContractModule(COLLECTION_MODULE_PATH,
    'collectTransactionTelemetry, the observation catalogue, the answer ' +
    'validator and the window derivation are not implemented');
}

async function loadHistogramContract() {
  return importContractModule(HISTOGRAM_MODULE_PATH,
    'the fixed base-2 telemetry histogram owner is not implemented');
}

// --- Engine, admin route and PG-wire fixture --------------------------------

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function envelopeOf(answer) {
  return buildDeliveryEnvelope({acknowledged: true}, answer);
}

function defaultAnswerOf(message, partitionId) {
  if (message.type === QUERY_OPERATION.TRANSACTION) {
    return answerParticipantTransactionRequest(message, partitionId);
  }
  if (SELECT_PATTERN.test(message.sql || '')) {
    return {success: true, rowSet: encodeTypedRowSet(['id'], [['u1']]),
      rowSetComplete: true, readGeneration: 1};
  }
  return {success: true, rows: [], changes: 1};
}

/**
 * A node: a real engine whose partitions answer through a recording router,
 * and its admin API (no listener).
 * @param {Object} [options] - {bootIncarnation, composeEngine, onDeliver}.
 *   onDeliver(message, partitionId) may await, and may return an answer that
 *   replaces the participant's default success answer.
 * @return {Promise<Object>}
 */
async function createTelemetryNode(options = {}) {
  resetEnvironment();
  const gateway = createTransactionPersistenceGateway();
  const cache = createMockSystemCache(
    [{table_name: TABLE, primaryKey: 'id', schema: SCHEMA}],
    [{partition_id: PARTITION_ID, table_name: TABLE,
      partition_key_start: null, partition_key_end: null}],
  );
  const deliveries = [];
  const router = {
    async deliver(address, message) {
      const partitionId = address.split('/')[2];
      const copy = structuredClone(message);
      deliveries.push(copy);
      const scripted = await options.onDeliver?.(copy, partitionId);
      return envelopeOf(scripted ?? defaultAnswerOf(copy, partitionId));
    },
  };
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: cache,
    messageRouter: router,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true,
    logger: QUIET_LOGGER,
  });
  engine.transactionCoordinator.sleep = async () => {};
  const admin = new AdminWebSocketAPI({
    nodeId: NODE_ID,
    bootIncarnation: options.bootIncarnation ?? BOOT_INCARNATION,
    sqlQueryEngine: options.composeEngine === false ? null : engine,
    enableAdminStream: false,
  });
  await admin.initialize(0, {listen: false});
  const inject = async (url) => {
    const response = await admin.getFastify().inject({method: 'GET', url});
    return {status: response.statusCode, body: response.json()};
  };
  return {
    engine,
    gateway,
    deliveries,
    admin,
    inject,
    async readAnswer(sinceSequence = 0) {
      const url = `${TRANSACTION_ROUTE}?${SINCE_SEQUENCE_PARAM}=${sinceSequence}`;
      const {status, body} = await inject(url);
      assert.equal(status, HTTP_OK, `GET ${url} answered HTTP ${status}` +
        (status === HTTP_NOT_FOUND ? ': the route is not registered' : ''));
      return body;
    },
    async dispose() {
      await admin.shutdown();
      await engine.shutdown();
      gateway.db.close();
    },
  };
}

async function withTelemetryNode(options, run) {
  const node = await createTelemetryNode(options);
  try {
    return await run(node);
  } finally {
    await node.dispose();
  }
}

class FrameSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.writable = true;
    this.destroyed = false;
  }

  write(chunk) {
    this.written.push(Buffer.from(chunk));
    return true;
  }

  end() {
    this.writable = false;
  }

  destroy() {
    this.destroyed = true;
    this.emit('close');
  }

  frames() {
    const all = Buffer.concat(this.written);
    const frames = [];
    for (let offset = 0; offset + FRAME_HEADER_BYTES <= all.length;) {
      const length = all.readInt32BE(offset + 1);
      frames.push({
        type: String.fromCharCode(all[offset]),
        body: all.subarray(offset + FRAME_HEADER_BYTES, offset + 1 + length),
      });
      offset += 1 + length;
    }
    return frames;
  }
}

function startupMessage() {
  const payload = Buffer.concat([
    Buffer.alloc(4),
    Buffer.from('user\0telemetry\0database\0telemetry\0\0', 'utf8'),
  ]);
  payload.writeInt32BE(PG_PROTOCOL_VERSION.CODE, 0);
  const header = Buffer.alloc(4);
  header.writeInt32BE(payload.length + 4, 0);
  return Buffer.concat([header, payload]);
}

function queryMessage(sql) {
  const body = Buffer.from(`${sql}\0`, 'utf8');
  const frame = Buffer.alloc(FRAME_HEADER_BYTES + body.length);
  frame[0] = PG_FRONTEND_MSG.QUERY;
  frame.writeInt32BE(4 + body.length, 1);
  body.copy(frame, FRAME_HEADER_BYTES);
  return frame;
}

function errorMessageOf(body) {
  for (const field of body.toString('utf8').split('\0')) {
    if (field.startsWith(ERROR_FIELD_MESSAGE)) return field.slice(1);
  }
  return body.toString('utf8');
}

function completionOf(frames) {
  for (const frame of frames) {
    if (frame.type === FRAME_COMMAND_COMPLETE) {
      return frame.body.toString('utf8').replace(/\0+$/u, '');
    }
    if (frame.type === FRAME_ERROR) return `ERROR ${errorMessageOf(frame.body)}`;
  }
  return 'NO COMPLETION';
}

/**
 * One PG-wire connection to the engine: the production handler and adapter
 * on a socket that records frames.
 * @param {SQLQueryEngine} engine
 * @return {Promise<Object>}
 */
async function openPgWireSession(engine) {
  const socket = new FrameSocket();
  const adapter = new PostgresWireAdapter({sqlCore: engine, authHandler: TRUSTING_AUTH});
  const handler = new PgWireProtocolHandler({adapter, socket, logger: QUIET_LOGGER});
  handler.start();
  const send = async (buffer) => {
    socket.emit('data', buffer);
    await handler._processing;
  };
  await send(startupMessage());
  return {
    sessionId: handler.getSession().sessionId,
    async run(sql) {
      const before = socket.frames().length;
      await send(queryMessage(sql));
      return completionOf(socket.frames().slice(before));
    },
    transactionId: () => handler.getSession().transactionId,
    close: () => handler.destroy(),
  };
}

/**
 * Run one transaction block and require the PG-wire completions it must
 * produce on any tree; returns its transaction ID.
 * @param {Object} pg
 * @param {string[]} statements
 * @param {string[]} expectedTags
 * @return {Promise<string>}
 */
async function runTransactionBlock(pg, statements, expectedTags) {
  const tags = [];
  let transactionId = null;
  for (const sql of statements) {
    tags.push(await pg.run(sql));
    transactionId ??= pg.transactionId();
  }
  assert.deepEqual(tags, expectedTags, 'precondition: the PG-wire block completes');
  assert.equal(typeof transactionId, 'string', 'precondition: BEGIN opened a transaction');
  return transactionId;
}

function transactionIdOfMutation(mutation) {
  return mutation.whereClause?.transaction_id ?? mutation.row?.transaction_id ??
    mutation.rows?.[0]?.transaction_id ?? mutation.data?.transaction_id ?? null;
}

function mutationsOf(gateway, transactionId) {
  return gateway.mutations.filter((mutation) =>
    transactionIdOfMutation(mutation) === transactionId);
}

// --- Assertions on the answer shape ------------------------------------------

function coordinatorSectionOf(answer) {
  const section = answer?.sections?.[COORDINATOR_SECTION];
  assert.equal(section?.availability?.state, AVAILABILITY_MEASURED,
    'the coordinator section is measured');
  return section;
}

function sampleOf(answer, transactionId) {
  const entries = coordinatorSectionOf(answer).samples.entries;
  const sample = entries.find((entry) => entry.identity?.transactionId === transactionId);
  assert.ok(sample, `a sample of transaction ${transactionId} is retained`);
  return sample;
}

function operationsOfKind(sample, kind) {
  return sample.operations.filter((operation) => operation.kind === kind);
}

function requestsOf(operation, requestOperation) {
  return operation.participantRequests.filter((request) =>
    request.operation === requestOperation);
}

function assertSampleAccounting(sample, label) {
  const operations = sample.operations;
  const fifo = sum(operations.map((operation) => operation.fifoWaitMs));
  const run = sum(operations.map((operation) => operation.runMs));
  const {totalMs, attributedMs, betweenOperationsMs, unattributedMs} = sample.accounting;
  for (const value of [totalMs, attributedMs, betweenOperationsMs, unattributedMs]) {
    assert.equal(Number.isFinite(value), true, `${label}: accounting values are numbers`);
  }
  assert.ok(Math.abs(attributedMs - (fifo + run)) <= ACCOUNTING_TOLERANCE_MS,
    `${label}: attributedMs is the FIFO wait plus the run time of its operations`);
  assert.ok(Math.abs(totalMs - (fifo + run + betweenOperationsMs + unattributedMs)) <=
    ACCOUNTING_TOLERANCE_MS, `${label}: the phases sum to totalMs`);
  assert.ok(unattributedMs >= -ACCOUNTING_TOLERANCE_MS,
    `${label}: the unattributed remainder is reported and not negative`);
  let previousOffset = 0;
  for (const operation of operations) {
    assert.ok(operation.fifoWaitMs >= 0 && operation.runMs >= 0,
      `${label}: ${operation.kind} durations are not negative`);
    assert.ok(operation.startOffsetMs >= previousOffset,
      `${label}: operations are in FIFO order`);
    previousOffset = operation.startOffsetMs;
  }
  for (const commit of operationsOfKind(sample, OPERATION_KIND.COMMIT)) {
    const phases = sum(commit.subPhases.map((phase) => phase.ms));
    assert.ok(Math.abs(commit.runMs - (phases + commit.commitUnattributedMs)) <=
      ACCOUNTING_TOLERANCE_MS, `${label}: COMMIT run time is its sub-phases plus ` +
      'commitUnattributedMs');
  }
  assert.ok(sample.observationCount > 0, `${label}: the sample exports its observation count`);
}

function assertNoStatementText(answer) {
  const serialized = JSON.stringify(answer);
  for (const marker of SQL_TEXT_MARKERS) {
    assert.equal(serialized.includes(marker), false,
      `the answer carries no SQL text or row values (found ${marker})`);
  }
}

function assertHistogramSnapshot(snapshot, id) {
  assert.equal(Number.isInteger(snapshot?.count) && snapshot.count >= 0, true,
    `${id}: count is a non-negative integer`);
  if (snapshot.bucketCounts === undefined) return;
  assert.equal(snapshot.bucketCounts.length, HISTOGRAM_BUCKET_COUNT,
    `${id}: ${HISTOGRAM_BUCKET_COUNT} fixed buckets`);
  assert.equal(sum(snapshot.bucketCounts), snapshot.count, `${id}: buckets sum to count`);
  assert.equal(snapshot.sumMs >= 0, true, `${id}: sumMs is not negative`);
}

function observationCountOf(answer, id) {
  return coordinatorSectionOf(answer).observations[id]?.count ?? 0;
}

// --- W1: the route answers a typed node answer -------------------------------

async function witnessRouteAnswer() {
  return withTelemetryNode({}, async (node) => {
    const answer = await node.readAnswer(0);
    assert.equal(ADMIN_ROUTE.TRANSACTION_DIAGNOSTICS, TRANSACTION_ROUTE,
      'the route is a sibling in ADMIN_ROUTE');
    const contract = await loadCollectionContract();
    assert.equal(typeof contract.collectTransactionTelemetry, 'function',
      'collectTransactionTelemetry exists');
    assert.equal(answer.schemaVersion, contract.TRANSACTION_TELEMETRY_SCHEMA_VERSION);
    assert.equal(answer.nodeId, NODE_ID);
    assert.equal(answer.bootIncarnation, BOOT_INCARNATION);
    assert.equal(answer.sinceSequence, 0);
    for (const field of ['capturedAtEpochMs', 'capturedAtMonotonicMs',
      'timeOriginEpochMs', 'answerBuildMs']) {
      assert.equal(Number.isFinite(answer[field]) && answer[field] >= 0, true,
        `${field} is a non-negative number`);
    }
    const section = coordinatorSectionOf(answer);
    const catalogued = contract.TRANSACTION_TELEMETRY_CATALOGUE
      .filter((entry) => entry.section === COORDINATOR_SECTION)
      .map((entry) => entry.id).sort();
    assert.deepEqual(Object.keys(section.observations).sort(), catalogued,
      'the section contains exactly the catalogued observations');
    for (const id of catalogued) assertHistogramSnapshot(section.observations[id], id);
    assert.equal(section.samples.capacity, SAMPLE_RING_CAPACITY);
    assert.deepEqual(section.samples.entries, []);
    assert.equal(section.samples.droppedCount, 0);
    assert.deepEqual(contract.validateTransactionTelemetryAnswer(answer),
      {valid: true, reason: null}, 'the answer satisfies its own validator');
    const refused = await node.inject(`${TRANSACTION_ROUTE}?${SINCE_SEQUENCE_PARAM}=-1`);
    assert.equal(refused.status, HTTP_BAD_REQUEST, 'an invalid cursor is refused, typed');
    await withTelemetryNode({composeEngine: false}, async (bare) => {
      const uncomposed = await bare.readAnswer(0);
      assert.deepEqual(uncomposed.sections[COORDINATOR_SECTION],
        {availability: {state: AVAILABILITY_UNAVAILABLE, reason: REASON_NOT_COMPOSED}},
        'a node without an engine names the coordinator section unavailable');
    });
    return {answers: [answer]};
  });
}

// --- W2: accounting, through PgWireProtocolHandler ---------------------------

async function holdRollbackFanout(message) {
  if (message.type === QUERY_OPERATION.TRANSACTION &&
      message.operation === QUERY_OPERATION.ROLLBACK) {
    await sleepMs(ROLLBACK_FANOUT_HOLD_MS);
  }
  return undefined;
}

function assertCommittedSample(sample, pg, node) {
  assert.equal(sample.outcome, OUTCOME_COMMITTED);
  assert.equal(sample.identity.sessionId, pg.sessionId,
    'the sample joins its PG-wire session by the existing session identity');
  assert.deepEqual(sample.operations.map((operation) => operation.kind),
    [OPERATION_KIND.BEGIN, OPERATION_KIND.WRITE, OPERATION_KIND.COMMIT]);
  assert.equal(sample.operationsOmittedCount, 0);
  const [write] = operationsOfKind(sample, OPERATION_KIND.WRITE);
  assert.equal(requestsOf(write, REQUEST.BEGIN).length, 1);
  assert.equal(requestsOf(write, REQUEST.QUERY_WRITE).length, 1);
  assert.equal(requestsOf(write, REQUEST.QUERY_WRITE)[0].partitionId, PARTITION_ID);
  const [commit] = operationsOfKind(sample, OPERATION_KIND.COMMIT);
  assert.deepEqual(commit.subPhases.map((phase) => phase.phase), COMMIT_SUB_PHASES,
    'COMMIT reports its sub-phases in order');
  assert.equal(requestsOf(commit, REQUEST.PREPARE).length, 1);
  assert.equal(requestsOf(commit, REQUEST.COMMIT).length, 1);
  for (const request of [...write.participantRequests, ...commit.participantRequests]) {
    assert.equal(request.outcome, REQUEST_OUTCOME.ACCEPTED);
    assert.ok(request.attempts >= 1 && request.ms >= 0);
  }
  assert.equal(sample.writeStatementCount, 1);
  assert.ok(sample.writeStatementsMs > 0, 'the write statement is timed');
  assert.equal(sample.readStatementCount, 0);
  assert.equal(sample.participantCount, 1);
  const submissions = sample.metadata.submissionCountByPurpose;
  assert.deepEqual(Object.keys(submissions).sort(), [...METADATA_PURPOSES].sort());
  assert.equal(sum(Object.values(submissions)),
    mutationsOf(node.gateway, sample.identity.transactionId).length,
    'metadata submissions by purpose account for every gateway mutation');
  assertSampleAccounting(sample, 'committed transaction');
}

function assertRolledBackSample(sample, pg) {
  assert.equal(sample.outcome, OUTCOME_ROLLED_BACK);
  assert.equal(sample.identity.sessionId, pg.sessionId);
  assert.deepEqual(sample.operations.map((operation) => operation.kind),
    [OPERATION_KIND.BEGIN, OPERATION_KIND.WRITE, OPERATION_KIND.ROLLBACK]);
  const [rollback] = operationsOfKind(sample, OPERATION_KIND.ROLLBACK);
  const [request] = requestsOf(rollback, REQUEST.ROLLBACK);
  assert.ok(request, 'the ROLLBACK operation reports its participant request');
  assert.ok(request.ms >= ROLLBACK_FANOUT_HOLD_MS - ACCOUNTING_TOLERANCE_MS,
    'the ROLLBACK fan-out time is retained');
  assert.ok(rollback.runMs >= request.ms - ACCOUNTING_TOLERANCE_MS,
    'rollback is accounted before the transaction is finalized');
  assertSampleAccounting(sample, 'rolled-back transaction');
}

async function witnessCommitAndRollbackAccounting() {
  return withTelemetryNode({onDeliver: holdRollbackFanout}, async (node) => {
    const pg = await openPgWireSession(node.engine);
    try {
      const committedId = await runTransactionBlock(pg, ['BEGIN', INSERT_A, 'COMMIT'],
        [TAG_BEGIN, TAG_INSERT, TAG_COMMIT]);
      const rolledBackId = await runTransactionBlock(pg, ['BEGIN', INSERT_B, 'ROLLBACK'],
        [TAG_BEGIN, TAG_INSERT, TAG_ROLLBACK]);
      assert.equal(node.deliveries.some((message) =>
        message.operation === QUERY_OPERATION.ROLLBACK), true,
      'precondition: the rolled-back transaction fanned out a participant ROLLBACK');
      const answer = await node.readAnswer(0);
      assert.equal(coordinatorSectionOf(answer).samples.entries.length, 2);
      assertCommittedSample(sampleOf(answer, committedId), pg, node);
      assertRolledBackSample(sampleOf(answer, rolledBackId), pg);
      assertNoStatementText(answer);
      return answer;
    } finally {
      pg.close();
    }
  });
}

function typedParticipantFailure(message, partitionId, fields) {
  return {success: false, operation: message.operation, partitionId,
    transactionId: message.transactionId, participantId: message.participantId,
    failureCode: PARTICIPANT_TRANSACTION_FAILURE_CODE.NOT_ACTIVE, ...fields};
}

function createRetryMissScript() {
  const seen = {prepare: 0, commit: 0, outcome: 0};
  const onDeliver = (message, partitionId) => {
    if (message.type !== QUERY_OPERATION.TRANSACTION) return undefined;
    if (message.operation === QUERY_OPERATION.PREPARE && ++seen.prepare === 1) {
      return typedParticipantFailure(message, partitionId, {error: 'not yet active'});
    }
    if (message.operation === QUERY_OPERATION.COMMIT && ++seen.commit === 1) {
      return typedParticipantFailure(message, partitionId,
        {errorCode: QUERY_ERROR_CODE.NO_TRANSACTION, error: 'commit answer lost'});
    }
    if (message.operation === QUERY_OPERATION.TRANSACTION_OUTCOME) {
      seen.outcome += 1;
      return {...answerParticipantTransactionRequest(message, partitionId),
        durable: true, state: OUTCOME_COMMITTED, outcome: OUTCOME_COMMITTED};
    }
    return undefined;
  };
  return {seen, onDeliver};
}

// The gateway applies the first participant-set update but its answer does
// not certify the one changed row, so the engine reads the row back.
function loseFirstParticipantSetCertification(gateway) {
  const counters = {uncertified: 0, readbacks: 0};
  const submit = gateway.submitMutation.bind(gateway);
  gateway.submitMutation = async (mutation, options) => {
    const result = await submit(mutation, options);
    if (mutation.tableName !== TABLES.SQL_TRANSACTIONS ||
        mutation.data?.participant_set_text === undefined ||
        counters.uncertified > 0) {
      return result;
    }
    counters.uncertified += 1;
    const {affectedRows: _rows, changes: _changes, partitionResult: _partition,
      ...uncertified} = result;
    return uncertified;
  };
  const read = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (...args) => {
    counters.readbacks += 1;
    return read(...args);
  };
  return counters;
}

async function witnessRetryMissAndReadback() {
  const script = createRetryMissScript();
  return withTelemetryNode({onDeliver: script.onDeliver}, async (node) => {
    const lost = loseFirstParticipantSetCertification(node.gateway);
    const pg = await openPgWireSession(node.engine);
    try {
      const transactionId = await runTransactionBlock(pg, ['BEGIN', INSERT_A, 'COMMIT'],
        [TAG_BEGIN, TAG_INSERT, TAG_COMMIT]);
      assert.deepEqual(script.seen, {prepare: 2, commit: 1, outcome: 1},
        'precondition: PREPARE was retried and the lost COMMIT answer was read back');
      assert.equal(lost.readbacks >= 1, true,
        'precondition: the uncertified participant-set update was read back');
      const answer = await node.readAnswer(0);
      const sample = sampleOf(answer, transactionId);
      const [commit] = operationsOfKind(sample, OPERATION_KIND.COMMIT);
      assert.deepEqual(requestsOf(commit, REQUEST.PREPARE).map((request) => request.outcome),
        [REQUEST_OUTCOME.FAILED, REQUEST_OUTCOME.ACCEPTED]);
      assert.deepEqual(requestsOf(commit, REQUEST.COMMIT).map((request) => request.outcome),
        [REQUEST_OUTCOME.FAILED]);
      assert.deepEqual(requestsOf(commit, REQUEST.TRANSACTION_OUTCOME)
        .map((request) => request.outcome), [REQUEST_OUTCOME.ACCEPTED]);
      assert.equal(sample.metadata.readbackCount, lost.readbacks,
        'metadata readbacks have their real producer');
      assert.equal(observationCountOf(answer, OBSERVATION.RETRY_BACKOFF), 1,
        'the participant retry backoff is recorded separately');
      assert.equal(observationCountOf(answer, OBSERVATION.OUTCOME_REQUEST), 1);
      assert.equal(observationCountOf(answer, OBSERVATION.READBACK), lost.readbacks);
      assertSampleAccounting(sample, 'retried transaction');
      return answer;
    } finally {
      pg.close();
    }
  });
}

/**
 * W2: a committed and a rolled-back transaction through the PG-wire handler
 * have phases that sum to totalMs with the remainder reported; a third
 * transaction drives the participant retry backoff, the TRANSACTION_OUTCOME
 * request and the metadata readback the catalogue names W2 for.
 * @return {Promise<{answers: Object[]}>}
 */
async function witnessAccounting() {
  const accounting = await witnessCommitAndRollbackAccounting();
  const retried = await witnessRetryMissAndReadback();
  return {answers: [accounting, retried]};
}

// --- W3: in-transaction reads are timed and counted --------------------------

async function witnessReads() {
  return withTelemetryNode({}, async (node) => {
    const pg = await openPgWireSession(node.engine);
    try {
      const transactionId = await runTransactionBlock(pg,
        ['BEGIN', SELECT_A, INSERT_A, SELECT_A, 'COMMIT'],
        [TAG_BEGIN, TAG_SELECT, TAG_INSERT, TAG_SELECT, TAG_COMMIT]);
      const transactionalReads = node.deliveries.filter((message) =>
        message.transactionId === transactionId && SELECT_PATTERN.test(message.sql || ''));
      assert.equal(transactionalReads.length, 2,
        'precondition: both reads reached the participant inside the transaction');
      const answer = await node.readAnswer(0);
      const sample = sampleOf(answer, transactionId);
      assert.deepEqual(sample.operations.map((operation) => operation.kind),
        [OPERATION_KIND.BEGIN, OPERATION_KIND.READ, OPERATION_KIND.WRITE,
          OPERATION_KIND.READ, OPERATION_KIND.COMMIT]);
      assert.equal(sample.readStatementCount, 2, 'in-transaction reads are counted');
      assert.ok(sample.readStatementsMs > 0, 'in-transaction reads are timed');
      assert.equal(sample.writeStatementCount, 1);
      for (const read of operationsOfKind(sample, OPERATION_KIND.READ)) {
        const requests = requestsOf(read, REQUEST.QUERY_READ);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].partitionId, PARTITION_ID);
        assert.equal(requests[0].outcome, REQUEST_OUTCOME.ACCEPTED);
      }
      assert.ok(observationCountOf(answer, OBSERVATION.READ_RUN) >= 2);
      assert.ok(observationCountOf(answer, OBSERVATION.QUERY_READ_REQUEST) >= 2);
      assertSampleAccounting(sample, 'read transaction');
      return {answers: [answer]};
    } finally {
      pg.close();
    }
  });
}

// --- W4: a RECOVERY operation holds the lane ----------------------------------

async function witnessFifoWait() {
  const hold = Promise.withResolvers();
  let recoveryHolding = false;
  const onDeliver = async (message) => {
    if (message.transactionId === RECOVERED_ID) {
      recoveryHolding = true;
      await hold.promise;
    }
    return undefined;
  };
  return withTelemetryNode({onDeliver}, async (node) => {
    const coordinator = node.engine.transactionCoordinator;
    const rows = recoveryRowsOf({transactionId: RECOVERED_ID, sessionId: QUERY_SESSION.DEFAULT,
      overrides: {status: 'COMMITTING',
        ...recoveryDecisionColumns(RECOVERED_ID, [PARTITION_ID])}});
    coordinator.recoverFromSystemTables(rows);
    rows.transactions.forEach((row) => node.gateway.seed(TABLES.SQL_TRANSACTIONS, row));
    rows.participants.forEach((row) =>
      node.gateway.seed(TABLES.SQL_TRANSACTION_PARTICIPANTS, row));
    const resumed = coordinator.resumeRecoveredTransactions();
    for (let polls = 0; !recoveryHolding && polls < RECOVERY_START_POLLS; polls += 1) {
      await sleepMs(1);
    }
    assert.equal(recoveryHolding, true,
      'precondition: recovery is holding the DEFAULT session lane');
    const queuedAt = performance.now();
    const beginning = node.engine.executeQuery('BEGIN', [], {});
    await sleepMs(RECOVERY_HOLD_MS);
    hold.resolve();
    const replay = await resumed;
    const begun = await beginning;
    const beginWaitMs = performance.now() - queuedAt;
    assert.equal(replay.resumed, 1, 'precondition: recovery completed the recorded COMMIT');
    assert.equal(begun.success, true, 'precondition: BEGIN ran after recovery');
    assert.ok(beginWaitMs >= RECOVERY_HOLD_MS, 'precondition: BEGIN waited behind recovery');
    const committed = await node.engine.executeQuery('COMMIT', [],
      {expectedTransactionId: begun.transactionId});
    assert.equal(committed.success, true, 'precondition: the user transaction committed');
    const answer = await node.readAnswer(0);
    const sample = sampleOf(answer, begun.transactionId);
    assert.equal(sample.identity.sessionId, QUERY_SESSION.DEFAULT);
    const [begin] = sample.operations;
    assert.equal(begin.kind, OPERATION_KIND.BEGIN);
    assert.ok(begin.fifoWaitMs > 0, 'the user operation shows its FIFO wait');
    assert.ok(begin.fifoWaitMs <= beginWaitMs + ACCOUNTING_TOLERANCE_MS,
      'the FIFO wait is bounded by the observed wait');
    assert.ok(observationCountOf(answer, OBSERVATION.RECOVERY_FIFO_WAIT) >= 1);
    assert.ok(observationCountOf(answer, OBSERVATION.RECOVERY_RUN) >= 1);
    assertSampleAccounting(sample, 'transaction queued behind recovery');
    return {answers: [answer]};
  });
}

// --- W7: the window -----------------------------------------------------------

async function commitEmptyTransactions(engine, sessionId, count) {
  for (let index = 0; index < count; index += 1) {
    const begun = await engine.executeQuery('BEGIN', [], {sessionId});
    const committed = await engine.executeQuery('COMMIT', [],
      {sessionId, expectedTransactionId: begun.transactionId});
    assert.equal(begun.success && committed.success, true,
      'precondition: the empty transaction commits');
  }
}

async function witnessHistogramLayout() {
  const histogram = await loadHistogramContract();
  assert.equal(histogram.TELEMETRY_HISTOGRAM_BUCKET_COUNT, HISTOGRAM_BUCKET_COUNT);
  assert.deepEqual([...histogram.TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US],
    HISTOGRAM_UPPER_BOUNDS_US, 'upper bounds 2^k microseconds, k = 4..25');
  const recorded = histogram.createTelemetryHistogram();
  const before = histogram.snapshotTelemetryHistogram(recorded);
  for (const ms of [0, 0.008, 0.024, 1, 40000]) {
    histogram.recordTelemetryHistogram(recorded, ms);
  }
  const delta = histogram.subtractTelemetryHistogramSnapshots(
    histogram.snapshotTelemetryHistogram(recorded), before);
  const expectedBuckets = Array(HISTOGRAM_BUCKET_COUNT).fill(0);
  expectedBuckets[0] = 2;
  expectedBuckets[1] = 1;
  expectedBuckets[6] = 1;
  expectedBuckets[HISTOGRAM_BUCKET_COUNT - 1] = 1;
  assert.deepEqual(delta.bucketCounts, expectedBuckets,
    'a delta is a bucket-wise subtraction over the fixed layout');
  assert.equal(delta.count, 5);
  assert.ok(Math.abs(delta.sumMs - 40001.032) < HISTOGRAM_SUM_TOLERANCE_MS);
}

/**
 * W7: two reads give a delta, the cursor returns exactly the new samples,
 * overflowing the ring reports droppedCount, and a changed incarnation is
 * INCOMPARABLE_RESTARTED.
 * @return {Promise<{answers: Object[]}>}
 */
async function witnessWindow() {
  const contract = await loadCollectionContract();
  await witnessHistogramLayout();
  const sessionId = 'telemetry-window-session';
  return withTelemetryNode({}, async (node) => {
    await commitEmptyTransactions(node.engine, sessionId, WINDOW_FIRST_BATCH);
    const first = await node.readAnswer(0);
    const firstSamples = coordinatorSectionOf(first).samples;
    assert.deepEqual(firstSamples.entries.map((entry) => entry.completionSequence), [1, 2]);
    await commitEmptyTransactions(node.engine, sessionId, WINDOW_SECOND_BATCH);
    const second = await node.readAnswer(firstSamples.lastCompletionSequence);
    const secondSamples = coordinatorSectionOf(second).samples;
    assert.deepEqual(secondSamples.entries.map((entry) => entry.completionSequence),
      [3, 4, 5], 'the cursor returns exactly the new samples');
    assert.equal(secondSamples.droppedCount, 0);
    const window = contract.deriveTransactionTelemetryWindow(first, second);
    assert.equal(window.state, WINDOW_COMPARABLE);
    assert.equal(window.sections[COORDINATOR_SECTION].observations[OBSERVATION.BEGIN_RUN]
      .count, WINDOW_SECOND_BATCH, 'two reads give a delta');
    await commitEmptyTransactions(node.engine, sessionId, SAMPLE_RING_CAPACITY + RING_OVERFLOW);
    const third = await node.readAnswer(secondSamples.lastCompletionSequence);
    const thirdSamples = coordinatorSectionOf(third).samples;
    assert.equal(thirdSamples.entries.length, SAMPLE_RING_CAPACITY);
    assert.equal(thirdSamples.droppedCount, RING_OVERFLOW,
      'overflowing the ring reports droppedCount');
    assert.equal(thirdSamples.firstRetainedSequence,
      secondSamples.lastCompletionSequence + RING_OVERFLOW + 1);
    const restarted = await withTelemetryNode(
      {bootIncarnation: RESTARTED_BOOT_INCARNATION},
      (restartedNode) => restartedNode.readAnswer(0));
    const incomparable = contract.deriveTransactionTelemetryWindow(third, restarted);
    assert.equal(incomparable.state, WINDOW_INCOMPARABLE_RESTARTED);
    assert.equal(incomparable.sections, undefined, 'no delta across a restart');
    return {answers: [first, second, third]};
  });
}

// --- W8: collection from a list of nodes --------------------------------------

function refusedConnectionError() {
  const error = new Error('connect ECONNREFUSED 127.0.0.1:9');
  error.code = 'ECONNREFUSED';
  return error;
}

/**
 * W8: one typed entry per node: one answers, one refuses the connection,
 * one times out, one refuses over HTTP, one answers malformed and one
 * answers for another node.
 * @return {Promise<{answers: Object[]}>}
 */
async function witnessCollection() {
  const contract = await loadCollectionContract();
  return withTelemetryNode({}, async (node) => {
    const requested = [];
    let timedOutSignal = null;
    const injectRoute = (url) => {
      const {pathname, search} = new URL(url);
      return node.inject(`${pathname}${search}`);
    };
    // The answering node is the real node; node-f is asked but the answer
    // that comes back is the real node's (another node answered).
    const answerers = new Map([
      [NODE_ID, injectRoute],
      ['node-b', async () => {
        throw refusedConnectionError();
      }],
      ['node-c', (_url, signal) => {
        timedOutSignal = signal;
        return new Promise(() => {});
      }],
      ['node-d', async () => ({status: HTTP_UNAVAILABLE, body: {error: 'unavailable'}})],
      ['node-e', async () => ({status: HTTP_OK, body: {schemaVersion: 1, nodeId: 'node-e'}})],
      ['node-f', injectRoute],
    ]);
    const nodes = [...answerers.keys()].map((nodeId) => ({nodeId,
      adminUrl: `http://${nodeId}.invalid:8080`, sinceSequence: 0}));
    const startedAt = performance.now();
    const entries = await contract.collectTransactionTelemetry({
      nodes,
      deadlineMs: COLLECTION_DEADLINE_MS,
      fetchAnswer: ({nodeId, url, signal}) => {
        requested.push({nodeId, url});
        return answerers.get(nodeId)(url, signal);
      },
    });
    const elapsedMs = performance.now() - startedAt;
    assert.ok(elapsedMs < COLLECTION_DEADLINE_MS + COLLECTION_SLACK_MS,
      'collection is bounded by its deadline');
    assert.equal(requested.find((entry) => entry.nodeId === NODE_ID)?.url,
      `http://${NODE_ID}.invalid:8080${TRANSACTION_ROUTE}?${SINCE_SEQUENCE_PARAM}=0`,
      'the collection function owns the route and the cursor parameter');
    assert.deepEqual(entries.map((entry) => [entry.nodeId, entry.state]), [
      [NODE_ID, NODE_STATE.ANSWERED],
      ['node-b', NODE_STATE.UNREACHABLE],
      ['node-c', NODE_STATE.TIMED_OUT],
      ['node-d', NODE_STATE.HTTP_REFUSED],
      ['node-e', NODE_STATE.MALFORMED],
      ['node-f', NODE_STATE.MALFORMED],
    ], 'one typed entry per node, in the order asked');
    const [answered, unreachable, timedOut, refused, malformed, misrouted] = entries;
    assert.equal(answered.answer.nodeId, NODE_ID);
    assert.equal(unreachable.errorCode, 'ECONNREFUSED');
    assert.equal(timedOut.deadlineMs, COLLECTION_DEADLINE_MS);
    assert.equal(timedOutSignal?.aborted, true, 'the timed-out request is cancelled');
    assert.equal(refused.httpStatus, HTTP_UNAVAILABLE);
    for (const entry of [malformed, misrouted]) {
      assert.equal(typeof entry.reason, 'string', 'a malformed answer names its reason');
    }
    return {answers: [answered.answer]};
  });
}

// --- W9 and the negative controls ---------------------------------------------

// The witnesses a catalogue entry may name, each with the scenario that
// drives its entries.
const CATALOGUE_DRIVERS = Object.freeze([
  ['W2', witnessAccounting],
  ['W3', witnessReads],
  ['W4', witnessFifoWait],
  ['W7', witnessWindow],
  ['W8', witnessCollection],
]);

/**
 * Report every catalogue entry its named witness did not drive above zero.
 * @param {Object[]} catalogue - The product catalogue.
 * @param {Map<string, Object[]>} answersByWitness - Answers each witness read.
 * @return {Object[]} {id, witness, reason} per unmet entry.
 */
function findUndrivenCatalogueEntries(catalogue, answersByWitness) {
  const knownWitnesses = new Set(CATALOGUE_DRIVERS.map(([witness]) => witness));
  const unmet = [];
  for (const entry of catalogue) {
    const name = entry.id.split('.')[0];
    if (!knownWitnesses.has(entry.witness)) {
      unmet.push({id: entry.id, witness: entry.witness, reason: 'WITNESS_UNKNOWN'});
      continue;
    }
    if (!OBSERVATION_UNITS.has(entry.unit) || !name.endsWith(entry.unit) ||
        !fs.existsSync(new URL(`../../${entry.owner}`, import.meta.url))) {
      unmet.push({id: entry.id, witness: entry.witness, reason: 'ENTRY_MALFORMED'});
      continue;
    }
    const answers = answersByWitness.get(entry.witness) ?? [];
    const driven = answers.some((answer) =>
      (answer?.sections?.[entry.section]?.observations?.[entry.id]?.count ?? 0) > 0);
    if (!driven) unmet.push({id: entry.id, witness: entry.witness, reason: 'NOT_DRIVEN'});
  }
  return unmet;
}

/**
 * W9: every catalogue entry is driven above zero by its named witness.
 * @param {Map<string, Object[]>} [answersByWitness] - Answers already read
 *   by the drivers in this process; the drivers run when absent.
 */
async function witnessCatalogueCoverage(answersByWitness = null) {
  const contract = await loadCollectionContract();
  let answers = answersByWitness;
  if (answers === null) {
    answers = new Map();
    for (const [witness, drive] of CATALOGUE_DRIVERS) {
      answers.set(witness, (await drive()).answers);
    }
  }
  const unmet = findUndrivenCatalogueEntries(contract.TRANSACTION_TELEMETRY_CATALOGUE, answers);
  assert.deepEqual(unmet, [], 'every catalogue entry is driven by its named witness');
}

async function readOneCommittedAnswer() {
  return withTelemetryNode({}, async (node) => {
    await commitEmptyTransactions(node.engine, 'telemetry-control-session', 1);
    return node.readAnswer(0);
  });
}

/**
 * N1: the validator, and the collection function through it, reject an
 * answer whose phases sum to more than totalMs.
 */
async function negativeControlAccountingOverrun() {
  const contract = await loadCollectionContract();
  const answer = await readOneCommittedAnswer();
  assert.deepEqual(contract.validateTransactionTelemetryAnswer(answer),
    {valid: true, reason: null}, 'the unmodified answer is valid');
  const overrun = structuredClone(answer);
  const [sample] = overrun.sections[COORDINATOR_SECTION].samples.entries;
  sample.operations[0].fifoWaitMs += sample.accounting.totalMs + 1;
  assert.equal(contract.validateTransactionTelemetryAnswer(overrun).valid, false,
    'phases that sum to more than totalMs are rejected');
  const [entry] = await contract.collectTransactionTelemetry({
    nodes: [{nodeId: NODE_ID, adminUrl: 'http://overrun.invalid:8080', sinceSequence: 0}],
    deadlineMs: COLLECTION_DEADLINE_MS,
    fetchAnswer: async () => ({status: HTTP_OK, body: overrun}),
  });
  assert.equal(entry.state, NODE_STATE.MALFORMED);
}

/**
 * N2: the coverage checker rejects a catalogue entry left at count 0 by the
 * witness that should have driven it (the logAppendMs class), and accepts
 * the same answers with every entry driven.
 */
async function negativeControlUndrivenEntry() {
  const contract = await loadCollectionContract();
  const catalogue = contract.TRANSACTION_TELEMETRY_CATALOGUE;
  assert.ok(catalogue.length > 0, 'the catalogue lists its observation points');
  const driven = new Map();
  for (const entry of catalogue) {
    const answers = driven.get(entry.witness) ?? [{sections: {}}];
    const sections = answers[0].sections;
    sections[entry.section] ??= {observations: {}};
    sections[entry.section].observations[entry.id] = {count: 1};
    driven.set(entry.witness, answers);
  }
  assert.deepEqual(findUndrivenCatalogueEntries(catalogue, driven), [],
    'every entry driven: nothing is reported');
  const [victim] = catalogue;
  driven.get(victim.witness)[0].sections[victim.section].observations[victim.id] = {count: 0};
  assert.deepEqual(findUndrivenCatalogueEntries(catalogue, driven),
    [{id: victim.id, witness: victim.witness, reason: 'NOT_DRIVEN'}],
    'an entry at count 0 is reported');
}

export {
  findUndrivenCatalogueEntries,
  negativeControlAccountingOverrun,
  negativeControlUndrivenEntry,
  witnessAccounting,
  witnessCatalogueCoverage,
  witnessCollection,
  witnessFifoWait,
  witnessReads,
  witnessRouteAnswer,
  witnessWindow,
};
