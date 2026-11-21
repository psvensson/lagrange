import {test} from '../../src/test-helpers/tap.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  deliveryTransportOf,
} from '../../src/transport/transport-semantic-outcome.js';

const traceEnv = 'LAGRANGE_SERVICES_QUERY_TRACE';
process.env[traceEnv] ??= '1';
const enabled = process.env[traceEnv] === '1';

const [
  {QueryExecutor},
  {MessageGroupService},
  {createRouterEnvelopeFixture, settleUntil},
  {createMockSystemCache},
  {createCommittedServeEligibilityOwner},
  {withTestDbPath},
  {QUERY_MESSAGE_TYPE},
  {ROUTER_MESSAGE_TYPE},
] = await Promise.all([
  import('../../src/query/query-executor.js'),
  import('../../src/message-group/message-group-service.js'),
  import('./router-envelope-witness-fixture.js'),
  import('../query/query-executor-test-support.js'),
  import('../control-plane/serve-eligibility-test-support.js'),
  import('../test-helpers/message-group-db-path.js'),
  import('../../src/query/query-constants.js'),
  import('../../src/constants/transport.js'),
]);

const SENDER = 'services-query-trace-sender';
const TARGET = 'test-node';
const PARTITION = 'services-p1';
const ADDRESS = `${TARGET}/partition/${PARTITION}-r1`;
const SQL = 'SELECT field_trace_secret FROM services';
const WRITE_SQL = 'UPDATE services SET field_trace_secret = 1';

function capture(owner, records) {
  owner.logger = {
    ...owner.logger,
    logConsoleOnly: (_level, _message, record) => {
      if (record.event === 'services_query_delivery_trace') records.push(record);
    },
  };
}

test('SERVICES read trace follows the real query/MG/WS path and ACK retirement', async (t) => {
  const fixture = createRouterEnvelopeFixture(import.meta.url, SENDER);
  await fixture.setup();
  t.teardown(() => fixture.teardown());
  const sender = await fixture.start(SENDER);
  const target = await fixture.start(TARGET);
  const group = new MessageGroupService(withTestDbPath({
    groupId: 'field-trace',
    replicaId: 'field-trace-r1',
    nodeId: SENDER,
    transport: sender.router,
  }));
  // Direct-only queries exercise the actual group send owner without Raft.
  group.initialized = true;
  sender.router.setQueryMessageGroupServiceResolver(() => ({service: group}));
  let sinkWrites = 0;
  target.router.register(ADDRESS, (envelope) => {
    if (envelope.payload.payload.sql === WRITE_SQL) sinkWrites += 1;
    return {success: true, rows: []};
  });
  await fixture.connect(sender, target);
  const systemCache = createMockSystemCache([PARTITION]);
  systemCache.services[0].service_id = `${PARTITION}-r1`;
  systemCache.services[0].address = ADDRESS;
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    nodeId: SENDER, systemCache, messageRouter: sender.router,
  });
  const records = [];
  for (const owner of [executor, group, sender.router, target.router]) capture(owner, records);
  const execute = (timeoutMs) =>
    executor.executeOnPartition(PARTITION, SQL, [], true, true, false, {timeoutMs});

  t.equal((await execute(5000)).success, true, 'the real send and response completed');
  await settleUntil(t, () =>
    !enabled || records.some((entry) => entry.stage === 'response_write_callback'),
  'receiver write callback');
  const positive = records.splice(0);
  const write = await sender.router.deliver(ADDRESS, {
    type: QUERY_MESSAGE_TYPE.QUERY, sql: WRITE_SQL,
  });
  t.equal(deliveryTransportOf(write).deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
    'the ordinary write was delivered');
  t.equal(sinkWrites, 1, 'the receiving handler applied the excluded write exactly once');
  t.same(records, [], 'a write to the same partition does not consume trace budget');

  // Keep dispatch and response real. Delay the seed ACK at the socket handoff
  // until the sender's original grant has retired.
  const raw = target.router.sendRaw.bind(target.router);
  let heldAck;
  target.router.sendRaw = (ws, frame, trace) => {
    if (frame.type === ROUTER_MESSAGE_TYPE.ACK) {
      heldAck = {ws, frame, trace};
      return;
    }
    raw(ws, frame, trace);
  };
  const connection = sender.router.nodeConnections.get(TARGET);
  const failed = await sender.router.deliver(ADDRESS, {
    type: QUERY_MESSAGE_TYPE.QUERY, sql: SQL,
  }, {timeoutMs: 1000});
  const timeout = deliveryTransportOf(failed);
  t.equal(timeout.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
    'the expired delivery deferred');
  t.equal(timeout.reasonCode, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT,
    'the sender reported its spent delivery bound');
  t.ok(heldAck, 'the real seed parsed the query and tried to ACK');

  const replacement = {...connection, connectionId: 'trace-replacement'};
  sender.router.nodeConnections.set(TARGET, replacement);
  try {
    const {ws, frame, trace} = heldAck;
    raw(ws, {...frame, messageId: 'wrong-message-id'});
    raw(ws, frame, trace);
    await settleUntil(t, () => !enabled || records.some((entry) =>
      entry.stage === 'ack_received' && entry.messageId === frame.messageId), 'late ACK');
  } finally {
    sender.router.nodeConnections.set(TARGET, connection);
    target.router.sendRaw = raw;
  }
  t.equal(sender.router.pendingMessages.size, 0, 'the late ACK did not recreate a waiter');
  if (!enabled) {
    t.same([...positive, ...records], [], 'disabled diagnostics emit no records');
    return;
  }

  const outer = positive.find((entry) => entry.stage === 'outer_dispatch');
  const inner = positive.find((entry) => entry.stage === 'message_group_dispatch');
  t.equal(outer.queryId, positive.find((entry) => entry.stage === 'query_start').queryId);
  t.equal(inner.outerId, outer.messageId, 'group records the exact originating router ID');
  t.not(inner.messageId, outer.messageId, 'wire ID belongs to the inner delivery');
  const wireStages = positive.filter((entry) => entry.messageId === inner.messageId)
    .map((entry) => entry.stage);
  for (const stage of [
    'service_socket_handoff', 'service_write_callback', 'frame_parsed', 'ack_socket_handoff',
    'ack_write_callback', 'ack_received', 'ack_wait_retired', 'partition_dispatch',
    'response_socket_handoff', 'response_write_callback', 'response_received',
  ]) t.ok(wireStages.includes(stage), stage);
  const retired = records.find((entry) => entry.stage === 'ack_wait_retired');
  t.equal(retired?.accepted, false, 'the original wait retired as refused');
  const late = records.find((entry) => entry.stage === 'ack_received');
  t.equal(late?.pending, false, 'late ACK arrived after retirement');
  t.equal(late?.connectionId, connection.connectionId, 'actual receiving socket identity');
  t.equal(late?.sentConnectionId, connection.connectionId, 'original sending socket identity');
  t.equal(late?.activeConnectionId, replacement.connectionId, 'different current connection');
  const encoded = JSON.stringify([...positive, ...records]);
  t.notMatch(encoded, /wrong-message-id|field_trace_secret/, 'no unrelated message ID or SQL');
});
