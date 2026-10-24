// C2 witness: transport normalization composed with the canonical CDC answer.
//
// Property. For a handler reply R carrying CDC receipt metadata, the outcome O
// that the delivery caller receives from the real MessageRouter must not pass
// the canonical CDC predicate when R itself fails it. Transport may ADD facts
// (acknowledged, deliveryState, queueWaitMs) and reports a supplied deliveryState
// that contradicts its computed state as FAILED; it must never erase or rewrite
// any other explicitly supplied claim. Oracle: the canonical validators from
// src/cdc/cdc-delivery-outcome.js applied to the raw reply (no transport) and to
// the delivered outcome, plus own-property preservation of each supplied field.
//
// Receipts below are declared component fixtures built by the canonical owner's
// builders; they are not native commit evidence and claim no Raft commit.
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {buildCommittedCdcOutcome, buildProvisionalCdcOutcome,
  isCommittedCdcDelivery, isCommittedCdcOutcome, isProvisionalCdcDelivery,
  isProvisionalCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE} from '../../src/message-group/constants.js';
import {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE, TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildTransportDeliveryOutcome} from '../../src/transport/transport-semantic-outcome.js';
import {normalizeDeliveryOutcome} from
  '../../src/transport/message-router-outbound-queue-admission.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {SERVICE_RESPONSE_DISPOSITION_KIND} from
  '../../src/transport/message-router-shared-vocabulary.js';
import {WebSocketTransport} from '../../src/transport/websocket-transport.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const ports = createPortAllocator(import.meta.url);
const HOST = '127.0.0.1';
const GROUP = 'c2-target-group';
const OTHER_GROUP = 'c2-other-group';
const POSITION = Object.freeze({index: 7, term: 2});
const RETRY_MS = 250;
const NODE = Object.freeze({local: 'c2-local-node', sender: 'c2-sender-node',
  remote: 'c2-remote-node', inline: 'c2-inline-ack-node'});
const PATH = Object.freeze({LOCAL: 'LOCAL', SERVICE_RESPONSE: 'SERVICE_RESPONSE',
  INLINE_ACK: 'INLINE_ACK'});

function sourceEvent(index) {
  return {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: 'c2-roundtrip-row', config_value: `c2-body-${index}`},
    timestamp: new HLCTimestamp(1000 + index, 0, 'c2-source').toString(),
    sourcePartition: 'c2-source', sourceReplica: 'c2-source-r1',
    eventKey: `c2-occurrence-${index}`, entryId: `c2-occurrence-${index}`,
    sourceLogIndex: index + 10, sourceOrdinal: 0};
}

const EVENTS = Object.freeze([sourceEvent(0), sourceEvent(1)]);
const committed = (extra = {}, group = GROUP) =>
  ({...buildCommittedCdcOutcome(EVENTS, group, POSITION), ...extra});
const provisional = (extra = {}, group = GROUP) =>
  ({...buildProvisionalCdcOutcome(EVENTS, RETRY_MS, group), ...extra});

const KIND = Object.freeze({COMMITTED: 'COMMITTED', PROVISIONAL: 'PROVISIONAL'});
const RAW_PREDICATE = {[KIND.COMMITTED]: isCommittedCdcOutcome,
  [KIND.PROVISIONAL]: isProvisionalCdcOutcome};
const DELIVERED_PREDICATE = {[KIND.COMMITTED]: isCommittedCdcDelivery,
  [KIND.PROVISIONAL]: isProvisionalCdcDelivery};

// Each case: kind, expected predicate verdict, reply factory, supplied fields.
const CONTROLS = [
  {name: 'COMMITTED_POSITIVE', kind: KIND.COMMITTED, valid: true, reply: () => committed()},
  {name: 'PROVISIONAL_POSITIVE', kind: KIND.PROVISIONAL, valid: true,
    reply: () => provisional()},
  {name: 'COMMITTED_WRONG_GROUP', kind: KIND.COMMITTED, reply: () => committed({}, OTHER_GROUP)},
  {name: 'PROVISIONAL_WRONG_GROUP', kind: KIND.PROVISIONAL,
    reply: () => provisional({}, OTHER_GROUP)},
  {name: 'ORDINARY_SUCCESS_COMMITTED', kind: KIND.COMMITTED, reply: () => ({success: true})},
  {name: 'ORDINARY_SUCCESS_PROVISIONAL', kind: KIND.PROVISIONAL,
    reply: () => ({success: true})},
  // An undefined reply produces a plain ACK frame on the inline-ACK peer, which
  // is not the inline path; it is exercised only where it stays on its path.
  {name: 'ACK_ONLY_COMMITTED', kind: KIND.COMMITTED, reply: () => undefined,
    paths: [PATH.LOCAL, PATH.SERVICE_RESPONSE]},
];

const COMMITTED_CONFLICTS = [
  ['REASON_CODE_ACK_REJECTED', {reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_REJECTED}],
  ['ERROR_CODE_LOWER_CASE', {errorCode: 'x'}],
  ['DEFER_RETRY_TRUE', {deferRetry: true}],
  ['NO_HANDLER_TRUE', {noHandler: true}],
  ['NO_HANDLER_WRONG_TYPE', {noHandler: 1}],
  ['RETRY_AFTER_ZERO', {retryAfterMs: 0}],
  ['RETRY_AFTER_NEGATIVE', {retryAfterMs: -5}],
  ['RETRY_AFTER_POSITIVE', {retryAfterMs: RETRY_MS}],
  ['DELIVERY_STATE_FAILED', {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED}],
  ['DELIVERY_STATE_DEFERRED', {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED}],
  ['ERROR_EMPTY_STRING', {error: ''}],
  ['STATUS_UNKNOWN', {status: 'bogus'}],
  ['UNKNOWN_FIELD', {extraClaim: true}],
  ['ERROR_CODE_EMPTY_STRING', {errorCode: ''}],
  ['DEFER_RETRY_WRONG_TYPE', {deferRetry: 'yes'}],
  ['RETRY_AFTER_WRONG_TYPE', {retryAfterMs: String(RETRY_MS)}],
].map(([name, fields, expect = {}]) => ({name: `COMMITTED_${name}`, kind: KIND.COMMITTED,
  fields, expect, reply: () => committed(fields)}));

// A supplied deliveryState that contradicts the computed transport state is
// reported FAILED (a state conflict is never preserved as DELIVERED); every
// other supplied claim is preserved verbatim. `expect` names the fields whose
// delivered value lawfully differs from the supplied one.
const PROVISIONAL_CONFLICTS = [
  ['DEFER_RETRY_FALSE', {deferRetry: false}],
  ['DELIVERED_WITH_RETRY_HINT',
    {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED, retryAfterMs: RETRY_MS},
    {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED}],
  ['SUCCESS_TRUE', {success: true}],
  ['ERROR_NULL', {error: null}],
].map(([name, fields, expect = {}]) => ({name: `PROVISIONAL_${name}`, kind: KIND.PROVISIONAL,
  fields, expect, reply: () => provisional(fields)}));

const CONFLICTS = [...COMMITTED_CONFLICTS, ...PROVISIONAL_CONFLICTS];
const CASES = [...CONTROLS, ...CONFLICTS];
const CASE_BY_NAME = new Map(CASES.map((entry) => [entry.name, entry]));

const fixture = {routers: [], inlinePeer: null, invocations: new Map(), addresses: {}};

function caseHandler(path) {
  return (envelope) => {
    const name = envelope.payload.c2Case;
    const key = `${path}:${name}`;
    fixture.invocations.set(key, (fixture.invocations.get(key) ?? 0) + 1);
    return CASE_BY_NAME.get(name).reply();
  };
}

function address(nodeId, entity) {
  return `${nodeId}/${ENTITY_TYPE.SERVICE}/${entity}`;
}

async function startRouter(nodeId, startServer) {
  const port = startServer ? ports.getPort() : undefined;
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId,
    ...(startServer ? {wsPort: port, wsHost: HOST} : {})});
  fixture.routers.push(router);
  await router.initialize({startServer});
  return {router, port};
}

before(async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE.sender},
    logging: {level: 'fatal'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  // (a) local registration/dispatch: no server, no socket.
  const local = await startRouter(NODE.local, false);
  fixture.addresses[PATH.LOCAL] = address(NODE.local, 'c2-local');
  local.router.register(fixture.addresses[PATH.LOCAL], caseHandler(PATH.LOCAL));
  fixture.local = local.router;
  // (b) identified WebSocket SERVICE_RESPONSE between two real routers.
  const sender = await startRouter(NODE.sender, true);
  const remote = await startRouter(NODE.remote, true);
  fixture.addresses[PATH.SERVICE_RESPONSE] = address(NODE.remote, 'c2-remote');
  remote.router.register(fixture.addresses[PATH.SERVICE_RESPONSE],
    caseHandler(PATH.SERVICE_RESPONSE));
  await sender.router.connectToNode(NODE.remote, `ws://${HOST}:${remote.port}`);
  fixture.sender = sender.router;
  // (c) inline ACK: WebSocketTransport is the in-tree peer whose ACK frame
  // carries the handler result (buildServiceAcknowledgment).
  const inlinePort = ports.getPort();
  fixture.inlinePeer = new WebSocketTransport({localNodeId: NODE.inline});
  await fixture.inlinePeer.initialize();
  await fixture.inlinePeer.startServer(inlinePort, HOST);
  fixture.addresses[PATH.INLINE_ACK] = address(NODE.inline, 'c2-inline');
  fixture.inlinePeer.register(fixture.addresses[PATH.INLINE_ACK], caseHandler(PATH.INLINE_ACK));
  await sender.router.connectToNode(NODE.inline, `ws://${HOST}:${inlinePort}`);
});

after(async () => {
  for (const router of fixture.routers) await router.shutdown();
  await fixture.inlinePeer?.shutdown();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function settledCount(router) {
  return router.getServiceResponseDispositionCounts()[
    SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED] ?? 0;
}

async function deliverThrough(path, entry) {
  const router = path === PATH.LOCAL ? fixture.local : fixture.sender;
  const settledBefore = settledCount(router);
  const payload = {type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH,
    events: EVENTS, targetGroupId: GROUP, c2Case: entry.name};
  const delivered = await router.deliver(fixture.addresses[path], payload);
  const key = `${path}:${entry.name}`;
  assert.equal(fixture.invocations.get(key), 1, `C2_${key}_HANDLER_ENGAGED_ONCE`);
  assert.equal(router.pendingResponses.size, 0, `C2_${key}_NO_PENDING_RESPONSE_LEFT`);
  assert.equal(router.pendingMessages.size, 0, `C2_${key}_NO_PENDING_ACK_LEFT`);
  const settledDelta = settledCount(router) - settledBefore;
  assert.equal(settledDelta, path === PATH.SERVICE_RESPONSE ? 1 : 0,
    `C2_${key}_${path === PATH.SERVICE_RESPONSE ? 'SETTLED_BY' : 'NOT_SETTLED_BY'}` +
    '_SERVICE_RESPONSE');
  return delivered;
}

// Every own property of the raw reply must reach the caller unchanged, except
// the fields `expect` names (a contradicted deliveryState is reported FAILED).
function preservation(raw, outcome, expect = {}) {
  if (!raw || typeof raw !== 'object') return {expected: {}, actual: {}};
  const expected = {};
  const actual = {};
  for (const field of Object.keys(raw)) {
    expected[field] = {present: true,
      value: Object.hasOwn(expect, field) ? expect[field] : raw[field]};
    actual[field] = {present: Object.hasOwn(outcome, field), value: outcome[field]};
  }
  return {expected, actual};
}

function suppliedText(entry, outcome) {
  const fields = entry.fields ?? {};
  return Object.keys(fields).map((field) =>
    `${field}: supplied ${JSON.stringify(fields[field])}, delivered ` +
    `${Object.hasOwn(outcome, field) ? JSON.stringify(outcome[field]) : '<absent>'}`)
    .join('; ');
}

for (const path of Object.values(PATH)) {
  test(`C2 ${path}: delivered CDC outcome keeps every supplied claim`, async (t) => {
    for (const entry of CASES) {
      if (entry.paths && !entry.paths.includes(path)) continue;
      await t.test(entry.name, async () => {
        const raw = entry.reply();
        const valid = entry.valid === true;
        assert.equal(RAW_PREDICATE[entry.kind](raw, EVENTS, GROUP), valid,
          `C2_${path}_${entry.name}_RAW_PREDICATE_IS_${valid}`);
        const outcome = await deliverThrough(path, entry);
        const cut = `C2_${path}_${entry.name}`;
        const kept = preservation(raw, outcome, entry.expect ?? {});
        assert.deepEqual(
          {deliveredPredicate: DELIVERED_PREDICATE[entry.kind](outcome, EVENTS, GROUP),
            preserved: kept.actual},
          {deliveredPredicate: valid, preserved: kept.expected},
          `${cut}_DELIVERED_MATCHES_RAW_VERDICT (${suppliedText(entry, outcome)}); ` +
          `delivered=${JSON.stringify(outcome)}`);
      });
    }
  });
}

function routerEnvelope(reply) {
  return {messageId: 'c2-idempotence', correlationId: 'c2-idempotence',
    acknowledged: true, ...reply};
}

test('C2 normalizeDeliveryOutcome is idempotent on CDC replies', () => {
  for (const entry of CASES) {
    const once = normalizeDeliveryOutcome(routerEnvelope(entry.reply())).result;
    const twice = normalizeDeliveryOutcome(once).result;
    assert.deepEqual(twice, once, `C2_IDEMPOTENT_${entry.name}`);
  }
});

test('C2 unit anchor: buildTransportDeliveryOutcome keeps explicit fields', async (t) => {
  for (const entry of CONFLICTS) {
    await t.test(entry.name, () => {
      const outcome = buildTransportDeliveryOutcome(routerEnvelope(entry.reply()));
      const want = (field) => Object.hasOwn(entry.expect, field) ?
        entry.expect[field] : entry.fields[field];
      const replaced = Object.keys(entry.fields).filter((field) =>
        !Object.hasOwn(outcome, field) || !Object.is(outcome[field], want(field)))
        .map((field) => `${field}: supplied ${JSON.stringify(entry.fields[field])}, ` +
          `want ${JSON.stringify(want(field))} -> ${JSON.stringify(outcome[field])}`);
      assert.deepEqual(replaced, [], `C2_ANCHOR_${entry.name}_EXPLICIT_FIELD_REPLACED`);
    });
  }
});
