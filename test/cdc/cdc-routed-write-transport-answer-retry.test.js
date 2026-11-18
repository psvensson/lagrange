// A CDC routed system-table write meets a transport failure at the router
// port, and the write still applies exactly once (defect D2, 2026-11-11).
//
// The transport owner names three outcomes of a failed hop, and the control
// plane's one code table (CONTROL_PLANE_ERROR_CODE_DECISION) decides each:
// - not sent (a closed connection before a frame left): safe to re-send;
// - ambiguous (a spent lifetime after the target accepted the message,
//   reasonCode answer_timeout: the write may have been applied): re-sent
//   only because every attempt is the same entry under the write's one key,
//   answered from its outcome row (R14);
// - owner moved (the partition's own reroutable answer): the routed loop
//   hands it to the owner loop (cdc-integration-service-execute-sql-and-
//   delivery.test.js pins that one).
// A transport failure is never an owner handoff: the routed loop re-sends it
// within its budget. Each test pairs the refusal with the resumed work, from
// the production entry point (insertSystemTableRow -> the real routed loop
// -> SQLQueryEngine -> QueryExecutor -> PartitionService on rs-raft), with
// the fault injected at the router port's deliver().

import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';

import {TABLES} from '../../src/constants/index.js';
import {ROUTER_ERROR_MSG, TRANSPORT_ERROR_MSG} from
  '../../src/constants/transport.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  TYPED_DISTRIBUTED_FAILURE_DECISION,
  classifyTypedDistributedFailure,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  buildDeliveryEnvelope,
  deliveryTransportOf,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  EXECUTOR_RETRY_DELAY_MS,
  JOINER_ID,
  NODE_ID,
  nodeRow,
  rowsOf,
  selectRows,
  withSurface,
} from '../query/unknown-outcome-surface-fixture.js';

const TEST_TIMEOUT_MS = 60000;
// Room for several engine attempts (each gets the routed loop's 1 s floor).
const CDC_ROUTED_BUDGET_MS = 6000;
const WRITERS = new Set();
const OUTCOMES_SQL = 'SELECT entry_key, outcome FROM ' +
  '_partition_statement_outcomes WHERE entry_key = ?';

// The router's answer for a closed connection before any frame left
// (message-router-delivery-behaviors.js: the real text and code).
function closedBeforeSend() {
  return buildDeliveryEnvelope({
    errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    error: ROUTER_ERROR_MSG.connectionClosed(NODE_ID),
    recoverableBeforeSend: true,
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT,
  });
}

// The router's answer for a spent lifetime after the target accepted the
// message (message-router-delivery-lifetime.js): an answer timeout.
function answerTimeout() {
  return buildDeliveryEnvelope({
    errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
    deferRetry: true,
    acknowledgement: TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED,
  });
}

// The router port faults every delivery while `faulted()` holds; `apply`
// says whether the faulted delivery reached the partition first (the
// ambiguous case) or never left (the not-sent case).
function faultRouterPort(messageRouter, {faulted, apply, envelope}) {
  const deliver = messageRouter.deliver.bind(messageRouter);
  const faults = [];
  messageRouter.deliver = async (address, message, ...rest) => {
    if (!faulted()) {
      return deliver(address, message, ...rest);
    }
    if (apply) {
      await deliver(address, message, ...rest);
    }
    const failed = envelope();
    faults.push({entryId: message.entryId,
      reasonCode: deliveryTransportOf(failed).reasonCode});
    return failed;
  };
  return faults;
}

function routedCdcWriter(engine) {
  const cdc = new CDCIntegrationService({nodeId: NODE_ID,
    sqlQueryEngine: engine});
  cdc.initialize();
  cdc.retryDelayMs = EXECUTOR_RETRY_DELAY_MS;
  WRITERS.add(cdc);
  const engineCalls = {count: 0};
  const executeQuery = engine.executeQuery.bind(engine);
  engine.executeQuery = (...args) => {
    engineCalls.count += 1;
    return executeQuery(...args);
  };
  return {cdc, engineCalls};
}

function assertAppliedOnce(surface, deliveries) {
  const entryIds = new Set(deliveries.map((delivery) => delivery.entryId));
  assert.equal(entryIds.size, 1,
    `every delivery that reached the partition was one entry (${[...entryIds]})`);
  assert.deepEqual(rowsOf(surface.dbPath, TABLES.NODES, 'node_id'),
    [JOINER_ID], 'one row');
  assert.deepEqual(selectRows(surface.dbPath, OUTCOMES_SQL,
    [`entry:${[...entryIds][0]}`]).map((row) => row.outcome), ['applied'],
  'the entry was applied exactly once (one outcome row, APPLIED)');
}

test('not sent: a connection closed before send is re-sent by the routed ' +
  'loop and the write applies once', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.NODES], async ({engine, deliveries, messageRouter,
    of}) => {
    const {cdc, engineCalls} = routedCdcWriter(engine);
    const faults = faultRouterPort(messageRouter, {
      faulted: () => engineCalls.count === 1, apply: false,
      envelope: closedBeforeSend});
    const answer = await cdc.insertSystemTableRow(TABLES.NODES, nodeRow(),
      {queryTimeoutMs: CDC_ROUTED_BUDGET_MS, idempotencyKey: 'd2-not-sent'});
    assert.ok(faults.length >= 1, 'the refusal: the first engine attempt ' +
      'met a closed connection');
    assert.ok(faults.every((fault) => fault.reasonCode ===
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED),
    'named connection_closed by the transport owner');
    assert.equal(deliveries.length >= 1, true, 'setup: a later attempt ' +
      'reached the partition');
    assert.ok(engineCalls.count >= 2, 'the routed loop re-sent the write ' +
      `(engine attempts ${engineCalls.count})`);
    assert.equal(answer?.success, true, 'the resumed work: the write is ' +
      'answered applied');
    assertAppliedOnce(of(TABLES.NODES), deliveries);
  });
});

test('ambiguous: an answer timeout after the partition applied the write is ' +
  're-sent under its one key and answered from its outcome row, applied once',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.NODES], async ({engine, deliveries, messageRouter,
    of}) => {
    const {cdc, engineCalls} = routedCdcWriter(engine);
    const faults = faultRouterPort(messageRouter, {
      faulted: () => engineCalls.count === 1, apply: true,
      envelope: answerTimeout});
    const answer = await cdc.insertSystemTableRow(TABLES.NODES, nodeRow(),
      {queryTimeoutMs: CDC_ROUTED_BUDGET_MS, idempotencyKey: 'd2-ambiguous'});
    assert.ok(faults.length >= 1, 'the refusal: the first engine attempt ' +
      'lost its answer');
    assert.ok(faults.every((fault) => fault.reasonCode ===
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ANSWER_TIMEOUT),
    'named answer_timeout by the transport owner');
    assert.ok(engineCalls.count >= 2, 'the routed loop re-sent the write ' +
      `(engine attempts ${engineCalls.count})`);
    assert.equal(answer?.success, true, 'the resumed work: the re-send is ' +
      'answered applied (a second run of the INSERT would fail its key)');
    assert.ok(deliveries.length >= 2, 'the partition saw the entry again');
    assertAppliedOnce(of(TABLES.NODES), deliveries);
  });
});

test('interruption: an answer timeout on every attempt spends the routed ' +
  'budget typed; the re-drive under the same key is that applied entry',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.NODES], async ({engine, deliveries, messageRouter,
    of}) => {
    const {cdc, engineCalls} = routedCdcWriter(engine);
    const interrupted = {on: true};
    faultRouterPort(messageRouter, {faulted: () => interrupted.on,
      apply: true, envelope: answerTimeout});
    cdc.retryMaxAttempts = 3;
    const write = () => cdc.insertSystemTableRow(TABLES.NODES, nodeRow(),
      {queryTimeoutMs: CDC_ROUTED_BUDGET_MS,
        idempotencyKey: 'd2-interrupted'});
    let thrown = null;
    await write().catch((error) => {
      thrown = error;
    });
    assert.ok(thrown, 'the spent loop ends in a failure, never success');
    assert.equal(classifyTypedDistributedFailure(thrown),
      TYPED_DISTRIBUTED_FAILURE_DECISION.RETRYABLE,
      'the failure it ends with is the retryable transport answer (the fan-out ' +
      'wrapper links the participant\'s timeout), not a handoff or terminal');
    assert.equal(engineCalls.count, 3, 'every attempt of the budget was ' +
      'spent re-sending (none surfaced as an owner handoff)');
    interrupted.on = false;
    const again = await write();
    assert.equal(again?.success, true, 'the recovery path: the re-drive is ' +
      'answered applied');
    assertAppliedOnce(of(TABLES.NODES), deliveries);
  });
});

afterEach(() => {
  for (const cdc of WRITERS) cdc.markShuttingDown();
  WRITERS.clear();
});
