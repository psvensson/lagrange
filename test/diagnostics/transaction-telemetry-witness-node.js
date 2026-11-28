/**
 * The fixture of the transaction-path telemetry witnesses (quest
 * transaction-path-telemetry-export): the contract modules, loaded on demand,
 * and a node that drives the real path (a real SQLQueryEngine, its
 * DistributedTransactionCoordinator, the in-memory transaction persistence
 * gateway, PgWireProtocolHandler on a frame-recording socket, and the admin
 * API through fastify inject without a listener).
 *
 * The contract modules are loaded on demand with literal specifiers and
 * named bindings, so the product's exports are the one definition the
 * witnesses use; on a tree without them every dependent witness is one unmet
 * property that names the missing module (the guard counts each), not a
 * crash of the whole probe.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';

import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PostgresWireAdapter} from '../../src/query/pg/postgres-wire-adapter.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
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

// The route this quest defines (transition record, section 2).
const TRANSACTION_ROUTE = '/api/admin/diagnostics/transactions';
const TABLE = 'users';
const PARTITION_ID = 'p1';
const NODE_ID = 'telemetry-witness-node';
const BOOT_INCARNATION = 7;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const SELECT_PATTERN = /^\s*SELECT\b/iu;
const FRAME_COMMAND_COMPLETE = 'C';
const FRAME_ERROR = 'E';
const FRAME_HEADER_BYTES = 5;
const ERROR_FIELD_MESSAGE = 'M';
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
const COLLECTION_MODULE_PATH = 'src/diagnostics/transaction-telemetry-collection.js';
const HISTOGRAM_MODULE_PATH = 'src/diagnostics/telemetry-histogram.js';
const ANSWER_BUILDER_MODULE_PATH = 'src/admin/admin-transaction-telemetry-answer.js';

// --- Contract loading -------------------------------------------------------

function assertContractModulePresent(relativePath, absentMeaning) {
  if (!fs.existsSync(new URL(`../../${relativePath}`, import.meta.url))) {
    assert.fail(`${relativePath} does not exist: ${absentMeaning}`);
  }
}

/**
 * The contract of transaction-telemetry-collection.js the witnesses use.
 * @return {Promise<Object>}
 */
async function loadCollectionContract() {
  assertContractModulePresent(COLLECTION_MODULE_PATH,
    'collectTransactionTelemetry, the observation catalogue, the answer ' +
    'validator and the window derivation are not implemented');
  const {
    PARTICIPANT_REQUEST_OPERATION,
    PARTICIPANT_REQUEST_OUTCOME,
    PARTICIPANT_REQUESTS_STATE,
    TRANSACTION_FAILURE_REFUSAL,
    TRANSACTION_METADATA_PERSIST_PURPOSE,
    TRANSACTION_OPERATION_KIND,
    TRANSACTION_SUB_PHASE,
    TRANSACTION_TELEMETRY_AVAILABILITY,
    TRANSACTION_TELEMETRY_CATALOGUE,
    TRANSACTION_TELEMETRY_CURSOR_PARAM,
    TRANSACTION_TELEMETRY_CURSOR_REFUSAL,
    TRANSACTION_TELEMETRY_NODE_STATE,
    TRANSACTION_TELEMETRY_OBSERVATION,
    TRANSACTION_TELEMETRY_SCHEMA_VERSION,
    TRANSACTION_TELEMETRY_SECTION,
    TRANSACTION_TELEMETRY_UNAVAILABLE_REASON,
    TRANSACTION_TELEMETRY_WINDOW_STATE,
    TRANSACTION_WITHOUT_SAMPLE_REASON,
    collectTransactionTelemetry,
    deriveTransactionTelemetryWindow,
    validateTransactionTelemetryAnswer,
  } = await import('../../src/diagnostics/transaction-telemetry-collection.js');
  return {
    PARTICIPANT_REQUEST_OPERATION,
    PARTICIPANT_REQUEST_OUTCOME,
    PARTICIPANT_REQUESTS_STATE,
    TRANSACTION_FAILURE_REFUSAL,
    TRANSACTION_METADATA_PERSIST_PURPOSE,
    TRANSACTION_OPERATION_KIND,
    TRANSACTION_SUB_PHASE,
    TRANSACTION_TELEMETRY_AVAILABILITY,
    TRANSACTION_TELEMETRY_CATALOGUE,
    TRANSACTION_TELEMETRY_CURSOR_PARAM,
    TRANSACTION_TELEMETRY_CURSOR_REFUSAL,
    TRANSACTION_TELEMETRY_NODE_STATE,
    TRANSACTION_TELEMETRY_OBSERVATION,
    TRANSACTION_TELEMETRY_SCHEMA_VERSION,
    TRANSACTION_TELEMETRY_SECTION,
    TRANSACTION_TELEMETRY_UNAVAILABLE_REASON,
    TRANSACTION_TELEMETRY_WINDOW_STATE,
    TRANSACTION_WITHOUT_SAMPLE_REASON,
    collectTransactionTelemetry,
    deriveTransactionTelemetryWindow,
    validateTransactionTelemetryAnswer,
  };
}

/**
 * The fixed base-2 histogram owner.
 * @return {Promise<Object>}
 */
async function loadHistogramContract() {
  assertContractModulePresent(HISTOGRAM_MODULE_PATH,
    'the fixed base-2 telemetry histogram owner is not implemented');
  const {
    TELEMETRY_HISTOGRAM_BUCKET_COUNT,
    TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US,
    createTelemetryHistogram,
    recordTelemetryHistogram,
    snapshotTelemetryHistogram,
    subtractTelemetryHistogramSnapshots,
  } = await import('../../src/diagnostics/telemetry-histogram.js');
  return {
    TELEMETRY_HISTOGRAM_BUCKET_COUNT,
    TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US,
    createTelemetryHistogram,
    recordTelemetryHistogram,
    snapshotTelemetryHistogram,
    subtractTelemetryHistogramSnapshots,
  };
}

async function loadAnswerBuilder() {
  assertContractModulePresent(ANSWER_BUILDER_MODULE_PATH,
    'the route\'s answer builder, bound with the durable boot incarnation, is not ' +
    'implemented');
  const {createTransactionTelemetryAnswerBuilder} =
    await import('../../src/admin/admin-transaction-telemetry-answer.js');
  return createTransactionTelemetryAnswerBuilder;
}

// --- Engine and admin route -------------------------------------------------

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'fatal'});
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

// The query of one cursor: 0, or {sinceSequence, bootIncarnation,
// telemetryEpoch} read from an earlier answer.
function cursorQueryOf(cursor) {
  if (typeof cursor === 'number') return `sinceSequence=${cursor}`;
  return `sinceSequence=${cursor.sinceSequence}&bootIncarnation=${cursor.bootIncarnation}` +
    `&telemetryEpoch=${cursor.telemetryEpoch}`;
}

/**
 * The cursor after an answer: its last completion and its window.
 * @param {Object} answer
 * @return {Object}
 */
function cursorAfter(answer) {
  const coordinator = answer.sections.coordinator;
  return {sinceSequence: coordinator.samples.lastCompletionSequence,
    bootIncarnation: answer.bootIncarnation, telemetryEpoch: coordinator.telemetryEpoch};
}

/**
 * A node: a real engine whose partitions answer through a recording router,
 * and its admin API (no listener).
 * @param {Object} [options] - {bootIncarnation, composeEngine, answerBuilder,
 *   onDeliver}. onDeliver(message, partitionId) may await, and may return an
 *   answer that replaces the participant's default success answer. The answer
 *   builder is bound as the production composition binds it unless
 *   answerBuilder replaces it (null: none bound).
 * @return {Promise<Object>}
 */
async function createTelemetryNode(options = {}) {
  const createTransactionTelemetryAnswerBuilder = await loadAnswerBuilder();
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
      return buildDeliveryEnvelope({acknowledged: true},
        scripted ?? defaultAnswerOf(copy, partitionId));
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
  const answerBuilder = Object.hasOwn(options, 'answerBuilder') ? options.answerBuilder :
    createTransactionTelemetryAnswerBuilder({nodeId: NODE_ID,
      bootIncarnation: options.bootIncarnation ?? BOOT_INCARNATION});
  const admin = new AdminWebSocketAPI({
    nodeId: NODE_ID,
    sqlQueryEngine: options.composeEngine === false ? null : engine,
    transactionTelemetryAnswerBuilder: answerBuilder,
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
    readCursor: (cursor) => inject(`${TRANSACTION_ROUTE}?${cursorQueryOf(cursor)}`),
    async readAnswer(cursor = 0) {
      const url = `${TRANSACTION_ROUTE}?${cursorQueryOf(cursor)}`;
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

// --- PG-wire ------------------------------------------------------------------

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

/**
 * @param {Object} gateway
 * @param {string} transactionId
 * @return {Object[]} The gateway mutations of one transaction.
 */
function mutationsOf(gateway, transactionId) {
  return gateway.mutations.filter((mutation) =>
    transactionIdOfMutation(mutation) === transactionId);
}

export {
  BOOT_INCARNATION,
  NODE_ID,
  PARTITION_ID,
  TABLE,
  TRANSACTION_ROUTE,
  cursorAfter,
  loadCollectionContract,
  loadHistogramContract,
  mutationsOf,
  openPgWireSession,
  runTransactionBlock,
  withTelemetryNode,
};
