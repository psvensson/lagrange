// The query executor's write routing decides a transport failure from the
// transport's one delivery-failure decision (transport-delivery-failure.js)
// plus its one local fact: whether every delivery of the write carries the
// same entryId (R14). Paired witnesses from the production entry point
// (QueryExecutor.executeOnPartition), faults injected at the router port
// with the router's real codes, texts and acknowledgement facts:
// - not sent (connect timeout, backpressure, no connection): re-sent within
//   the write's budget, and the write is answered;
// - ambiguous (an answer timeout after the partition accepted it): re-sent
//   only under the write's one entryId; a caller-built request that names no
//   entry is never re-sent, and its write ends as the typed unknown outcome;
// - rejected (the partition handler threw): never re-sent.
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT,
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {createMockSystemCache} from './query-executor-test-support.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

const PARTITION = 'wr-write';
const ENTRY = 'wr-entry-1';
const BUDGET_MS = 400;
const SQL = 'UPDATE users SET n = n + 1';

const NOT_SENT = Object.freeze({
  'connect timeout': () => buildDeliveryEnvelope({
    errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
    error: 'WebSocket connection timeout after 2000ms',
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT}),
  'backpressure': () => buildDeliveryEnvelope({
    errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
    error: ROUTER_ERROR_MSG.outboundQueueBackpressured('n2', 256),
    deferRetry: true, retryAfterMs: 1,
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT}),
  'no connection': () => buildDeliveryEnvelope({
    errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
    error: ROUTER_ERROR_MSG.noConnectionToNode('n2'), deferRetry: true,
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT}),
});

const answerTimeout = () => buildDeliveryEnvelope({
  errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  error: ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT, deferRetry: true,
  acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED});
const handlerFailed = () => buildDeliveryEnvelope({
  errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE, error: 'handler threw',
  acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED});

// The executor with its router port faulted on the first `faultCount`
// deliveries; `applied` counts the deliveries the partition applied (an
// ambiguous fault is applied before its answer is lost).
function faultedExecutor({fault, faultCount = 1, appliesBeforeFault = false}) {
  ConfigurationManager.getInstance().initialize();
  let now = 1000;
  const port = {deliveries: [], applied: 0};
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    nodeId: 'test-node', systemCache: createMockSystemCache([PARTITION]),
    messageRouter: {
      async deliver(_address, request) {
        port.deliveries.push(request);
        now += 5;
        if (port.deliveries.length <= faultCount) {
          if (appliesBeforeFault) port.applied += 1;
          return fault();
        }
        port.applied += 1;
        return buildDeliveryEnvelope({acknowledged: true},
          {success: true, rows: [], rowCount: 1});
      },
    },
  });
  executor.nowFn = () => now;
  executor.delay = async (ms) => {
    now += ms;
  };
  return {executor, port};
}

const write = (executor, options) => executor.executeOnPartition(PARTITION,
  SQL, [], false, true, false, {timeoutMs: BUDGET_MS, ...options});

for (const [name, fault] of Object.entries(NOT_SENT)) {
  test(`not sent (${name}): the write is re-sent and answered`, async (t) => {
    const {executor, port} = faultedExecutor({fault});
    const result = await write(executor, {entryId: ENTRY});
    t.ok(port.deliveries.length >= 2, 'the refusal was followed by a ' +
      `re-send (${port.deliveries.length} deliveries)`);
    t.equal(result.success, true, 'the resumed work: the write is answered');
    t.equal(port.applied, 1, 'applied once');
  });
}

test('ambiguous under the write\'s entryId: re-sent as the same entry and ' +
  'answered', async (t) => {
  const {executor, port} = faultedExecutor({fault: answerTimeout,
    appliesBeforeFault: true});
  const result = await write(executor, {entryId: ENTRY});
  t.ok(port.deliveries.length >= 2, 'the lost answer was re-sent');
  t.same([...new Set(port.deliveries.map((request) => request.entryId))],
    [ENTRY], 'every delivery is the one entry (the partition dedupes it)');
  t.equal(result.success, true, 'the resumed work: answered');
});

test('ambiguous without an entry identity: never re-sent; the write ends ' +
  'as the typed unknown outcome', async (t) => {
  const {executor, port} = faultedExecutor({fault: answerTimeout,
    faultCount: 9, appliesBeforeFault: true});
  const result = await write(executor, {buildRequest: () => ({sql: SQL})});
  t.equal(port.deliveries.length, 1, 'no re-send without the identity the ' +
    'partition dedupes on');
  t.equal(result.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
    'the ambiguity surfaces typed, never as a definite failure');
});

test('rejected: a handler failure is never re-sent', async (t) => {
  const {executor, port} = faultedExecutor({fault: handlerFailed,
    faultCount: 9});
  const result = await write(executor, {entryId: ENTRY});
  t.equal(port.deliveries.length, 1, 'no re-send of a rejected write');
  t.not(result.success, true, 'the refusal surfaces');
});
