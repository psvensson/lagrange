import {createHash} from 'node:crypto';
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
const BACKGROUND_ADDRESS = `${TARGET}/partition/partitions-p1-r1`;
const BACKGROUND_SQL = 'SELECT field_trace_background FROM partitions';
const OTHER_CALLER = 'services-query-trace-other-caller';
const WRONG_ACK_ID = 'wrong-message-id';
const ADMIN_QUERY_ID = 'q-1795320000000-formation';
const SHARED_SNAPSHOT_SQL = 'SELECT * FROM services WHERE service_type = \'partition\'';

function bindQueryGroup(router, groupId) {
  const group = new MessageGroupService(withTestDbPath({
    groupId, replicaId: `${groupId}-r1`, nodeId: router.nodeId, transport: router,
  }));
  // Direct-only queries exercise the actual group send owner without Raft.
  group.initialized = true;
  router.setQueryMessageGroupServiceResolver(() => ({service: group}));
  return group;
}

function captureResponseBytes(connection) {
  const frames = new Map();
  connection.ws.on('message', (data) => {
    const frame = JSON.parse(data.toString());
    if (frame.type === ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE) {
      frames.set(frame.messageId, data.byteLength);
    }
  });
  return frames;
}

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
  const otherCaller = await fixture.start(OTHER_CALLER);
  const group = bindQueryGroup(sender.router, 'field-trace');
  bindQueryGroup(otherCaller.router, 'other-field-trace');
  let sinkWrites = 0;
  target.router.register(ADDRESS, (envelope) => {
    if (envelope.payload.payload.sql === WRITE_SQL) sinkWrites += 1;
    return {success: true, rows: []};
  });
  const backgroundWireIds = new Map();
  target.router.register(BACKGROUND_ADDRESS, (envelope) => {
    backgroundWireIds.set(envelope.sourceNodeId, envelope.messageId);
    return {success: true, rows: [{label: 'räksmörgås'.repeat(16)}]};
  });
  await fixture.connect(sender, target);
  await fixture.connect(otherCaller, target);
  const connection = sender.router.nodeConnections.get(TARGET);
  const otherConnection = otherCaller.router.nodeConnections.get(TARGET);
  const frames = captureResponseBytes(connection);
  const otherFrames = captureResponseBytes(otherConnection);
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
    executor.executeOnPartition(PARTITION, SHARED_SNAPSHOT_SQL, [], true, true, false,
      {timeoutMs, sessionId: ADMIN_QUERY_ID});
  const sendBackground = async (caller, received) => {
    const response = await caller.router.deliver(BACKGROUND_ADDRESS, {
      type: QUERY_MESSAGE_TYPE.QUERY, sql: BACKGROUND_SQL, params: [],
    });
    const transport = deliveryTransportOf(response);
    t.equal(transport.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
      'background read traversed the real partition handler and socket');
    return received.get(backgroundWireIds.get(caller.router.nodeId));
  };
  const firstBackground = await sendBackground(sender, frames);
  const wrongSocketBytes = await sendBackground(otherCaller, otherFrames);
  t.ok(firstBackground > 0 && wrongSocketBytes > 0, 'measured actual WS payload lengths');

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
  const secondBackground = await sendBackground(sender, frames);
  const raw = target.router.sendRaw.bind(target.router);
  let heldAck;
  target.router.sendRaw = (ws, frame, trace, replyFamily) => {
    if (frame.type === ROUTER_MESSAGE_TYPE.ACK) {
      heldAck = {ws, frame, trace, pending: sender.router.pendingMessages.get(frame.messageId)};
      return;
    }
    raw(ws, frame, trace, replyFamily);
  };
  const failed = await sender.router.deliver(ADDRESS, {
    type: QUERY_MESSAGE_TYPE.QUERY, sql: SQL,
  }, {timeoutMs: 1000});
  const timeout = deliveryTransportOf(failed);
  t.equal(timeout.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
    'the expired delivery deferred');
  t.equal(timeout.reasonCode, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT,
    'the sender reported its spent delivery bound');
  t.ok(heldAck?.pending, 'the held ACK belongs to a live wire waiter');
  const {ws, frame, trace} = heldAck;
  const {messageId} = frame;
  // The public delivery and the MessageGroup's wire delivery have distinct
  // grants. Observe retirement of the precise wire waiter before releasing ACKs.
  await settleUntil(t, () => !sender.router.pendingMessages.has(messageId),
    'retirement of the held ACK waiter');

  const replacement = {
    ...connection, connectionId: 'trace-replacement', ws: otherConnection.ws,
  };
  const expectedAckIds = new Set([WRONG_ACK_ID, messageId]);
  const observedAcks = new Map();
  const observeAck = (data) => {
    const received = JSON.parse(data.toString());
    if (received.type === ROUTER_MESSAGE_TYPE.ACK && expectedAckIds.has(received.messageId)) {
      // The router's synchronous message listener was installed at connect.
      observedAcks.set(received.messageId, sender.router.pendingMessages.has(messageId));
    }
  };
  connection.ws.on('message', observeAck);
  sender.router.nodeConnections.set(TARGET, replacement);
  try {
    raw(ws, {...frame, messageId: WRONG_ACK_ID});
    raw(ws, frame, trace);
    await settleUntil(t, () => observedAcks.size === expectedAckIds.size,
      'wrong and late ACK received on original WebSocket');
    t.equal(observedAcks.get(WRONG_ACK_ID), false, 'the wrong ACK left the wire waiter retired');
    t.equal(observedAcks.get(messageId), false, 'the late ACK left the wire waiter retired');
    t.equal(sender.router.pendingMessages.has(WRONG_ACK_ID), false, 'the wrong ACK owns no waiter');
  } finally {
    connection.ws.off('message', observeAck);
    sender.router.nodeConnections.set(TARGET, connection);
    target.router.sendRaw = raw;
  }
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
  const firstCut = positive.find((entry) => entry.stage === 'response_socket_handoff');
  const failedCut = records.find((entry) => entry.stage === 'response_socket_handoff');
  t.equal(firstCut?.otherPartitionQueryFrames, 1, 'wrong-socket background is excluded');
  t.equal(firstCut?.otherPartitionQueryEncodedBytes, firstBackground,
    'successful read follows the exact encoded size of the preceding response');
  t.equal(failedCut?.otherPartitionQueryFrames, 2, 'failed read follows both same-socket frames');
  t.equal(failedCut?.otherPartitionQueryEncodedBytes, firstBackground + secondBackground);
  t.equal(firstCut?.sharedServicesSnapshotFrames, 0, 'current response excluded from its own prefix');
  t.equal(failedCut?.sharedServicesSnapshotFrames, 1, 'earlier shared-shape response included');
  t.equal(failedCut?.sharedServicesSnapshotEncodedBytes, firstCut?.encodedBytes);
  t.equal(firstCut?.encodedBytes, frames.get(inner.messageId), 'traced response bytes match ws data');
  t.equal(failedCut?.encodedBytes, frames.get(heldAck.frame.messageId));
  t.equal(firstCut?.adminQueryIdDigest, createHash('sha256').update(ADMIN_QUERY_ID).digest('hex'),
    'pre-existing session identity correlates without adding metadata to the frame');
  t.equal(firstCut?.tcpLocalPort, connection.ws._socket.remotePort);
  t.equal(firstCut?.tcpRemotePort, connection.ws._socket.localPort);
  t.equal(failedCut?.tcpRemotePort, firstCut?.tcpRemotePort, 'same TCP stream as the success');
  t.ok(Number.isFinite(firstCut?.wsBufferedAmountBefore), 'sampled ws before submission');
  t.ok(Number.isFinite(firstCut?.wsBufferedAmount), 'sampled ws after submission');
  const parsedAck = records.find((entry) =>
    entry.stage === 'frame_parsed' && entry.frameType === ROUTER_MESSAGE_TYPE.ACK);
  t.equal(parsedAck?.tcpLocalPort, firstCut?.tcpRemotePort, 'late ACK used the original stream');
  t.not(parsedAck?.tcpLocalPort, replacement.ws._socket.localPort);
  const encoded = JSON.stringify([...positive, ...records]);
  t.notMatch(encoded, /wrong-message-id|field_trace_secret|field_trace_background|räksmörgås|q-1795320000000/, 'no unrelated message ID or SQL');
});
