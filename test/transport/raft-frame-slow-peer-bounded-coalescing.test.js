// Owner Decision #3 & #4 (2026-11-22) of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md, sections
// 5.2 and 22):
//   1. Consensus envelopes for one directed peer pair coalesce into one
//      bounded batch frame per flush turn, preserving exact envelope content
//      and per-group FIFO order, and settling DELIVERED only when written to
//      the socket (never prematurely on batch enqueue).
//   2. Per-peer byte accounting includes pending application batches for that
//      peer, the socket's buffered bytes (`ws.bufferedAmount`), and the new
//      encoded batch size; at the bound, excess envelopes are refused with
//      `CONSENSUS_SEND_REFUSAL.PEER_BUFFER_EXCEEDED`, counted in
//      `consensusDelivery.sendRefusals`, their resources released, and the
//      failure reported to Raft without stalling a healthy peer.
//   3. An overall cross-peer byte bound refuses new envelopes with
//      `CONSENSUS_SEND_REFUSAL.TOTAL_BUFFER_EXCEEDED` when many slow peers
//      together reach the router's total consensus buffer limit.
//   4. Pending batches are bound to the connection incarnation: closing or
//      replacing a peer connection settles and drops the old connection's
//      pending batch (`CONNECTION_CLOSED` / `CONNECTION_REPLACED`) rather than
//      silently replaying it through a successor socket.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  CONSENSUS_SEND_REFUSAL,
  ROUTER_MESSAGE_TYPE,
} from '../../src/constants/transport.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_RS_MESSAGE_TYPE as RAFT} from '../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {sendRaftEnvelope, stepRaftEnvelope} from '../../src/raft/raft-packet-utils.js';
import {RAFT_RS_GROUP_TUNING} from '../../src/raft/raft-rs-group-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {
  ConnectionState,
  MessageRouter,
} from '../../src/transport/message-router.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
} from '../../src/transport/transport-semantic-outcome.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  DELIVERED_TO_PEER,
  PartitionNodeCluster,
} from '../raft/raft-rs-backend/partition-node-cluster.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

function configureRouterProcess(nodeId = 'c1-node-a') {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: nodeId},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetRouterProcess() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function buildEnvelope(groupId, seq, extraData = '') {
  return {
    protocol: 'raft-rs',
    groupId,
    from: '1',
    to: '2',
    message: {
      msgType: 8,
      from: '1',
      to: '2',
      term: '1',
      logTerm: '1',
      index: String(seq),
      commit: '1',
      entries: [],
      ...(extraData ? {context: extraData} : {}),
    },
  };
}

function createFakeSocket({bufferedAmount = 0, onSend = null} = {}) {
  const ws = new EventEmitter();
  ws.readyState = 1;
  ws.bufferedAmount = bufferedAmount;
  ws.sentFrames = [];
  ws.send = (raw) => {
    if (onSend) onSend(raw, ws);
    ws.sentFrames.push(JSON.parse(raw));
  };
  ws.terminate = () => {
    ws.readyState = 3;
    ws.emit('close');
  };
  return ws;
}

function attachConnectedPeer(router, peerNodeId, ws, {
  connectionId = `conn-${peerNodeId}-1`,
  bootIncarnation = TEST_BOOT_INCARNATION,
} = {}) {
  const record = {
    connectionId,
    nodeId: peerNodeId,
    address: `ws://${peerNodeId}:9999`,
    configuredAddress: `ws://${peerNodeId}:9999`,
    observedAddress: null,
    state: ConnectionState.CONNECTED,
    ws,
    isIncoming: false,
    isSelfConnection: false,
    bootIncarnation,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    reconnectDueAt: null,
    pingInterval: null,
    missedPings: 0,
    ackTimeoutStreak: 0,
    lastAckAt: null,
    lastAckTimeoutAt: null,
  };
  router.nodeConnections.set(peerNodeId, record);
  return record;
}

test('(c1-batch) envelopes to one remote peer in the same turn coalesce ' +
  'into one CONSENSUS_ENVELOPE frame, preserve per-group order, and settle ' +
  'DELIVERED only when written to the socket', async () => {
  configureRouterProcess('node-a');
  const sender = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-a',
  });
  const receiver = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-b',
  });
  try {
    const receivedByGroup = new Map([
      ['g1', []],
      ['g2', []],
      ['g3', []],
    ]);
    for (const groupId of receivedByGroup.keys()) {
      receiver.register(`node-b/partition/${groupId}-r2`, (envelope) => {
        receivedByGroup.get(groupId).push(envelope.payload);
        return null;
      });
    }
    let writtenFrame;
    const wsToB = createFakeSocket({
      onSend: (raw) => {
        writtenFrame = raw;
        receiver.receiveConsensusEnvelope(JSON.parse(raw), null);
      },
    });
    attachConnectedPeer(sender, 'node-b', wsToB);

    const schedule = [
      ['g1', 1],
      ['g2', 1],
      ['g3', 1],
      ['g1', 2],
      ['g2', 2],
      ['g3', 2],
    ];
    let settledBeforeFlush = 0;
    const context = 'δ "Raft"';
    const deliveries = schedule.map(([groupId, seq]) => {
      const envelope = buildEnvelope(groupId, seq, context);
      const submitted = sender.deliver(`node-b/partition/${groupId}-r2`, envelope);
      envelope.message.context = 'changed after admission';
      const promise = Promise.resolve(submitted).then((outcome) => {
        if (wsToB.sentFrames.length === 0) {
          settledBeforeFlush += 1;
        }
        return outcome;
      });
      return promise;
    });

    // Synchronous check right after enqueue: nothing written to the socket yet.
    assert.equal(wsToB.sentFrames.length, 0,
      'batching defers ws.send until the flush turn');
    assert.ok(sender.getStats().consensusDelivery.pendingBatchBytes > 0,
      'pending application batch bytes are tracked before flush');

    const admittedBytes = sender.getStats().consensusDelivery.pendingBatchBytes;
    const outcomes = await Promise.all(deliveries);
    assert.equal(Buffer.byteLength(writtenFrame), admittedBytes,
      'UTF-8 bytes sent match the reservation made before the flush');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(settledBeforeFlush, 0,
      'no delivery reports DELIVERED before ws.send executes');
    assert.equal(wsToB.sentFrames.length, 1,
      'all 6 envelopes to node-b in the same turn coalesced into 1 frame');
    assert.equal(wsToB.sentFrames[0].type,
      ROUTER_MESSAGE_TYPE.CONSENSUS_ENVELOPE,
      'the coalesced frame carries CONSENSUS_ENVELOPE');
    assert.ok(outcomes.every((outcome) =>
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(outcome))),
    'every envelope settled DELIVERED once the batch frame was written');

    const stats = sender.getStats().consensusDelivery;
    assert.equal(stats.written, 6, 'all 6 envelopes counted as written');
    assert.equal(stats.framesWritten, 1, '1 wire frame counted');
    assert.equal(stats.pendingBatchBytes, 0,
      'pending batch bytes released after flush');

    for (const groupId of ['g1', 'g2', 'g3']) {
      const payloads = receivedByGroup.get(groupId);
      assert.deepEqual(payloads, [
        buildEnvelope(groupId, 1, context),
        buildEnvelope(groupId, 2, context),
      ], `group ${groupId} received its envelopes unchanged and in FIFO order`);
    }
  } finally {
    await sender.shutdown();
    await receiver.shutdown();
    resetRouterProcess();
  }
});

test('each sender encodes one canonical wrapper across separate remote flushes', async (t) => {
  configureRouterProcess();
  const stringify = JSON.stringify;
  const wrapperEncodings = [];
  t.mock.method(JSON, 'stringify', (...args) => {
    const [value] = args;
    if (value?.type === ROUTER_MESSAGE_TYPE.CONSENSUS_ENVELOPE && value.envelopes?.length === 0) {
      wrapperEncodings.push(value.sourceNodeId);
    }
    return stringify(...args);
  });
  const routers = [];
  const senderIds = ['node-"δ"', 'node-\\雪'];
  try {
    for (const nodeId of senderIds) {
      const router = new MessageRouter({nodeId, bootIncarnation: TEST_BOOT_INCARNATION});
      routers.push(router);
      const rawFrames = [];
      attachConnectedPeer(router, 'peer', createFakeSocket({onSend: (raw) => rawFrames.push(raw)}));
      const targetAddress = 'peer/partition/g-r2';
      for (let seq = 0; seq < 24; seq += 1) {
        const payload = buildEnvelope('g', seq, 'π');
        const expected = stringify({type: ROUTER_MESSAGE_TYPE.CONSENSUS_ENVELOPE,
          sourceNodeId: nodeId, envelopes: [{targetAddress, payload}]});
        const pending = router.deliver(targetAddress, payload);
        assert.equal(router.getStats().consensusDelivery.pendingBatchBytes,
          Buffer.byteLength(expected));
        assert.ok(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(await pending)));
        assert.equal(rawFrames.length, seq + 1);
        assert.equal(rawFrames[seq], expected);
      }
    }
    assert.deepEqual(wrapperEncodings, senderIds);
  } finally {
    await Promise.all(routers.map((router) => router.shutdown()));
    resetRouterProcess();
  }
});

test('remote flushes send the admitted Raft types; a throwing send is not delivered', async () => {
  configureRouterProcess();
  const router = new MessageRouter({nodeId: 'sender', bootIncarnation: TEST_BOOT_INCARNATION});
  try {
    const targetAddress = 'peer/partition/g-r2';
    let refuseWrite = false;
    const socket = createFakeSocket({onSend() {
      if (refuseWrite) throw new Error('closed during send');
    }});
    attachConnectedPeer(router, 'peer', socket);
    const types = [RAFT.HEARTBEAT, RAFT.HEARTBEAT_RESPONSE, RAFT.APPEND, RAFT.APPEND_RESPONSE,
      RAFT.REQUEST_PRE_VOTE, RAFT.REQUEST_VOTE_RESPONSE, 991];
    const deliveries = [];
    for (const type of types) {
      const payload = buildEnvelope('g', type, 'α');
      payload.message.msgType = type;
      const delivery = router.deliver(targetAddress, payload);
      payload.message.msgType = RAFT.READ_INDEX;
      if (type === RAFT.HEARTBEAT) await delivery;
      else deliveries.push(delivery);
    }
    await Promise.all(deliveries);
    assert.deepEqual(socket.sentFrames.map((frame) => frame.envelopes.length),
      [1, types.length - 1]);
    assert.deepEqual(socket.sentFrames.flatMap((frame) =>
      frame.envelopes.map((entry) => entry.payload.message.msgType)), types,
    'each frame carries the type admitted, not a later mutation');
    refuseWrite = true;
    const failed = await router.deliver(targetAddress, buildEnvelope('g', 99));
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(failed)), false);
  } finally {
    await router.shutdown();
    resetRouterProcess();
  }
});

test('independent check callbacks share one heartbeat flush at the first eligible check phase', async () => {
  configureRouterProcess();
  const router = new MessageRouter({nodeId: 'sender', bootIncarnation: TEST_BOOT_INCARNATION});
  try {
    const socket = createFakeSocket();
    attachConnectedPeer(router, 'peer', socket);
    const target = 'peer/partition/g-r2';
    const deliveries = [];
    const first = new Promise((resolve) => setImmediate(() => {
      deliveries.push(router.deliver(target, buildEnvelope('g1', 1)));
      // Queued behind the first flush, ahead of any flush rearmed by the next producer.
      setImmediate(() => resolve(socket.sentFrames.map((frame) => frame.envelopes.length)));
    }));
    const second = new Promise((resolve) => setImmediate(() => {
      const response = buildEnvelope('g2', 2);
      response.message.msgType = RAFT.HEARTBEAT_RESPONSE;
      deliveries.push(router.deliver(target, response));
      resolve(socket.sentFrames.length);
    }));
    assert.equal(await second, 0, 'first producer left the event loop free for the second');
    assert.deepEqual(await first, [2], 'second producer did not extend the first deadline');
    const results = await Promise.all(deliveries);
    assert.ok(results.every((result) =>
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result))));
  } finally {
    await router.shutdown();
    resetRouterProcess();
  }
});

test('urgent Raft input expedites queued heartbeat FIFO and receipt settlement', async () => {
  configureRouterProcess();
  const router = new MessageRouter({nodeId: 'sender', bootIncarnation: TEST_BOOT_INCARNATION});
  try {
    const socket = createFakeSocket();
    attachConnectedPeer(router, 'peer', socket);
    const target = 'peer/partition/g-r2';
    for (const [type, context] of [[RAFT.APPEND], [RAFT.APPEND_RESPONSE], [RAFT.REQUEST_VOTE],
      [RAFT.TIMEOUT_NOW], [RAFT.HEARTBEAT, 'YQ=='], [RAFT.HEARTBEAT_RESPONSE, 'YQ==']]) {
      const before = socket.sentFrames.length;
      const receipts = [];
      const send = (envelope) => router.deliver(target, envelope).then((result) => {
        assert.ok(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)));
        receipts.push(envelope.groupId);
      });
      const first = send(buildEnvelope('ordinary', 1));
      await Promise.resolve();
      assert.equal(socket.sentFrames.length, before);
      const urgent = buildEnvelope('urgent', 2, context);
      urgent.message.msgType = type;
      const second = send(urgent);
      assert.deepEqual(receipts, []);
      await Promise.resolve();
      assert.equal(socket.sentFrames.length, before + 1, 'urgent work flushes before check phase');
      assert.deepEqual(socket.sentFrames[before].envelopes.map((entry) => entry.payload.groupId),
        ['ordinary', 'urgent']);
      await Promise.all([first, second]);
      assert.deepEqual(receipts, ['ordinary', 'urgent']);
    }
  } finally {
    await router.shutdown();
    resetRouterProcess();
  }
});

test('one synchronous burst of 129 heartbeats splits at the 64-item frame bound', async () => {
  configureRouterProcess();
  const router = new MessageRouter({nodeId: 'sender', bootIncarnation: TEST_BOOT_INCARNATION});
  try {
    const socket = createFakeSocket();
    attachConnectedPeer(router, 'peer', socket);
    const deliveries = Array.from({length: 129}, (_, index) =>
      router.deliver('peer/partition/g-r2', buildEnvelope('g', index)));
    const results = await Promise.all(deliveries);
    assert.ok(results.every((result) =>
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result))));
    assert.deepEqual(socket.sentFrames.map((frame) => frame.envelopes.length), [64, 64, 1]);
    const order = socket.sentFrames.flatMap((frame) =>
      frame.envelopes.map((entry) => entry.payload.message.index));
    assert.deepEqual(order, Array.from({length: 129}, (_, index) => String(index)));
    assert.equal(router.getStats().consensusDelivery.pendingBatchBytes, 0);
  } finally {
    await router.shutdown();
    resetRouterProcess();
  }
});

test('an envelope whose heartbeat classification throws is refused before any batch state changes',
  async () => {
    configureRouterProcess();
    const router = new MessageRouter({nodeId: 'sender', bootIncarnation: TEST_BOOT_INCARNATION});
    try {
      const socket = createFakeSocket();
      attachConnectedPeer(router, 'peer', socket);
      const target = 'peer/partition/g-r2';
      const unreadable = buildEnvelope('g', 1);
      // Serializes like any heartbeat (JSON.stringify never asks `has`); only
      // the presence test of its context field fails.
      unreadable.message = new Proxy(unreadable.message, {
        has() {
          throw new Error('context presence unreadable');
        },
      });
      await assert.rejects(router.deliver(target, unreadable), /context presence unreadable/);
      const stats = router.getStats().consensusDelivery;
      assert.equal(stats.pendingBatchBytes, 0, 'no bytes were admitted for the refused envelope');
      assert.equal(router.consensusDelivery.pendingBatches.size, 0, 'no batch was opened');
      assert.equal(stats.written, 0);
      const next = await router.deliver(target, buildEnvelope('g', 2));
      assert.ok(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(next)),
        'the next envelope to the same peer is not stuck behind a half-admitted batch');
      assert.deepEqual(socket.sentFrames.map((frame) =>
        frame.envelopes.map((entry) => entry.payload.message.index)), [['2']]);
    } finally {
      await router.shutdown();
      resetRouterProcess();
    }
  });

test('(c1-peer-bound) per-peer slow-socket (ws.bufferedAmount + pending ' +
  'batch) refuses excess envelopes with PEER_BUFFER_EXCEEDED, counts them, ' +
  'reports failure to Raft, and never stalls a healthy peer', async () => {
  configureRouterProcess('node-a');
  const firstEnvelope = buildEnvelope('g1', 1);
  const secondEnvelope = buildEnvelope('g1', 2, 'x'.repeat(250));
  const singleFrameBytes = Buffer.byteLength(JSON.stringify({
    type: ROUTER_MESSAGE_TYPE.CONSENSUS_ENVELOPE,
    sourceNodeId: 'node-a',
    envelopes: [{
      targetAddress: 'node-slow/partition/g1-r2',
      payload: firstEnvelope,
    }],
  }));
  const initialBuffered = 600;
  // Allow the first envelope (initialBuffered + singleFrameBytes), but refuse
  // the second envelope in the same turn.
  const maxPeerBufferedBytes = initialBuffered + singleFrameBytes + 40;

  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-a',
    consensusMaxPeerBufferedBytes: maxPeerBufferedBytes,
    consensusMaxTotalBufferedBytes: maxPeerBufferedBytes * 4,
  });
  try {
    const wsSlow = createFakeSocket({bufferedAmount: initialBuffered});
    const wsHealthy = createFakeSocket({bufferedAmount: 0});
    attachConnectedPeer(router, 'node-slow', wsSlow);
    attachConnectedPeer(router, 'node-healthy', wsHealthy);

    const slowFirst = router.deliver(
      'node-slow/partition/g1-r2', firstEnvelope);
    const pendingAfterFirst = router.getStats().consensusDelivery.pendingBatchBytes;
    assert.equal(pendingAfterFirst, singleFrameBytes,
      'the first fitting envelope is accounted in pendingBatchBytes');

    const slowSecondPromise = router.deliver(
      'node-slow/partition/g1-r2', secondEnvelope);
    assert.equal(router.getStats().consensusDelivery.pendingBatchBytes,
      pendingAfterFirst,
      'refused envelope released its bytes without corrupting the fitting batch');

    const healthyFirst = router.deliver(
      'node-healthy/partition/g1-r3', buildEnvelope('g1', 1));
    const healthySecond = router.deliver(
      'node-healthy/partition/g2-r3', buildEnvelope('g2', 1));

    const [
      slowFirstOutcome,
      slowSecond,
      healthyFirstOutcome,
      healthySecondOutcome,
    ] = await Promise.all([
      slowFirst,
      slowSecondPromise,
      healthyFirst,
      healthySecond,
    ]);

    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(slowSecond)),
      false,
      'the second envelope exceeding ws.bufferedAmount + pendingBatch is refused',
    );
    assert.equal(deliveryTransportOf(slowSecond).reasonCode,
      CONSENSUS_SEND_REFUSAL.PEER_BUFFER_EXCEEDED,
      'refusal names PEER_BUFFER_EXCEEDED');
    assert.equal(deliveryTransportOf(slowSecond).errorCode,
      OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
      'refusal carries the backpressure error code');

    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(slowFirstOutcome)),
      true,
      'the fitting first envelope to slow-peer still flushed and settled DELIVERED',
    );
    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(healthyFirstOutcome)),
      true,
      'healthy peer first envelope settled DELIVERED',
    );
    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(healthySecondOutcome)),
      true,
      'healthy peer second envelope settled DELIVERED',
    );
    assert.equal(wsSlow.sentFrames.length, 1,
      'slow peer received only the 1 fitting envelope');
    assert.equal(wsSlow.sentFrames[0].envelopes.length, 1,
      'refused second envelope was never sent to slow peer');
    assert.equal(wsHealthy.sentFrames.length, 1,
      'healthy peer received both of its envelopes coalesced in 1 frame');
    assert.equal(wsHealthy.sentFrames[0].envelopes.length, 2,
      'healthy peer batch carried both envelopes');

    const stats = router.getStats().consensusDelivery;
    assert.equal(stats.written, 3, '3 envelopes written in total');
    assert.equal(stats.notWritten, 1, '1 envelope refused');
    assert.equal(stats.sendRefusals[CONSENSUS_SEND_REFUSAL.PEER_BUFFER_EXCEEDED],
      1, 'PEER_BUFFER_EXCEEDED incremented in consensusDelivery.sendRefusals');
    assert.equal(stats.pendingBatchBytes, 0,
      'all pending batch bytes released after flush');

    // Now verify through a real 3-replica Raft partition: when slow-peer's
    // socket exceeds the per-peer buffer bound, Raft records the delivery
    // failure on slow-peer while committing and applying with healthy-peer.
    const clock = new VirtualTimeSource({startMs: 0});
    const replicaNodeMap = new Map([
      ['p-r1', 'node-a'],
      ['p-r2', 'node-healthy'],
      ['p-r3', 'node-slow'],
    ]);
    let cluster = null;
    const stepHealthy = (raw) => {
      const frame = JSON.parse(raw);
      for (const item of frame.envelopes) {
        if (item.targetAddress === 'node-healthy/partition/p-r2') {
          stepRaftEnvelope(cluster.node('p-r2'), item.payload);
        }
      }
    };
    const wsHealthyRaft = createFakeSocket({bufferedAmount: 0, onSend: stepHealthy});
    const wsSlowRaft = createFakeSocket({
      bufferedAmount: maxPeerBufferedBytes,
    });
    attachConnectedPeer(router, 'node-healthy', wsHealthyRaft,
      {connectionId: 'conn-healthy-raft'});
    attachConnectedPeer(router, 'node-slow', wsSlowRaft,
      {connectionId: 'conn-slow-raft'});

    cluster = new PartitionNodeCluster({
      partitionId: 'c1-raft-p1',
      replicaIds: ['p-r1', 'p-r2', 'p-r3'],
      substrateFor: () => ({timeSource: clock}),
      resolveFor: (_from, peer) =>
        `${replicaNodeMap.get(peer)}/partition/${peer}`,
      sendFor: (from, address, envelope) => {
        if (from === 'p-r1') {
          return sendRaftEnvelope(router, address, envelope);
        }
        const targetReplica = address.split('/')[2];
        cluster.node(targetReplica).step(envelope);
        return DELIVERED_TO_PEER;
      },
    });
    try {
      await turnChainValue(cluster.node('p-r1').campaign());
      for (let round = 0; round < 20; round += 1) {
        clock.advance(0);
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(cluster.node('p-r1').readStatus().role, RAFT_ROLE.LEADER,
        'leader elected with healthy-peer vote despite slow-peer buffer refusal');

      await turnChainValue(cluster.node('p-r1').propose({cmd: 'healthy-quorum'}));
      for (let tick = 0; tick < RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK; tick += 1) {
        cluster.node('p-r1').tick();
      }
      for (let round = 0; round < 20; round += 1) {
        clock.advance(0);
        await new Promise((resolve) => setImmediate(resolve));
      }

      const leaderStatus = cluster.node('p-r1').readStatus();
      const slowPeerStatus = leaderStatus.peers.find(
        (peer) => peer.address === 'node-slow/partition/p-r3');
      const healthyPeerStatus = leaderStatus.peers.find(
        (peer) => peer.address === 'node-healthy/partition/p-r2');
      assert.equal(slowPeerStatus?.delivery?.outcome, 'failed',
        'Raft recorded the delivery failure for the buffer-exceeded slow peer');
      assert.equal(healthyPeerStatus?.delivery?.outcome, 'delivered',
        'Raft recorded DELIVERED for the healthy peer');
      assert.equal(cluster.replica('p-r1').appliedCommands.length, 1,
        'leader committed and applied the proposal with the healthy follower');
      assert.equal(cluster.replica('p-r2').appliedCommands.length, 1,
        'healthy follower applied the committed proposal');
    } finally {
      cluster.dispose();
    }
  } finally {
    await router.shutdown();
    resetRouterProcess();
  }
});

test('(c1-total-bound) total cross-peer buffer bound refuses an envelope ' +
  'with TOTAL_BUFFER_EXCEEDED when many slow peers together reach the router ' +
  'limit', async () => {
  configureRouterProcess('node-a');
  const sampleEnvelope = buildEnvelope('g1', 1);
  const singleFrameBytes = Buffer.byteLength(JSON.stringify({
    type: ROUTER_MESSAGE_TYPE.CONSENSUS_ENVELOPE,
    sourceNodeId: 'node-a',
    envelopes: [{
      targetAddress: 'peer-1/partition/g1-r2',
      payload: sampleEnvelope,
    }],
  }));
  const socketBufferedEach = 500;
  const perPeerOccupancy = socketBufferedEach + singleFrameBytes;
  // Each peer is well below the per-peer limit, but two peers with
  // socketBufferedEach + singleFrameBytes leave less than singleFrameBytes
  // of total cross-peer headroom for peer-3.
  const maxPeerBufferedBytes = perPeerOccupancy + 1000;
  const maxTotalBufferedBytes = perPeerOccupancy * 2 + 40;

  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-a',
    consensusMaxPeerBufferedBytes: maxPeerBufferedBytes,
    consensusMaxTotalBufferedBytes: maxTotalBufferedBytes,
  });
  try {
    const ws1 = createFakeSocket({bufferedAmount: socketBufferedEach});
    const ws2 = createFakeSocket({bufferedAmount: socketBufferedEach});
    const ws3 = createFakeSocket({bufferedAmount: 0});
    attachConnectedPeer(router, 'peer-1', ws1);
    attachConnectedPeer(router, 'peer-2', ws2);
    attachConnectedPeer(router, 'peer-3', ws3);

    const d1 = router.deliver('peer-1/partition/g1-r2', sampleEnvelope);
    const d2 = router.deliver('peer-2/partition/g1-r2', sampleEnvelope);
    const d3Outcome = await router.deliver(
      'peer-3/partition/g1-r2', sampleEnvelope);

    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(d3Outcome)),
      false,
      'peer-3 envelope is refused at the total cross-peer buffer bound',
    );
    assert.equal(deliveryTransportOf(d3Outcome).reasonCode,
      CONSENSUS_SEND_REFUSAL.TOTAL_BUFFER_EXCEEDED,
      'refusal names TOTAL_BUFFER_EXCEEDED');
    assert.equal(deliveryTransportOf(d3Outcome).errorCode,
      OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
      'refusal carries the backpressure error code');

    const [o1, o2] = await Promise.all([d1, d2]);
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(o1)),
      true, 'admitted peer-1 batch still flushes and settles DELIVERED');
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(o2)),
      true, 'admitted peer-2 batch still flushes and settles DELIVERED');
    assert.equal(ws1.sentFrames.length, 1, 'peer-1 received its frame');
    assert.equal(ws2.sentFrames.length, 1, 'peer-2 received its frame');
    assert.equal(ws3.sentFrames.length, 0, 'peer-3 received no frame');

    const stats = router.getStats().consensusDelivery;
    assert.equal(stats.written, 2, '2 envelopes written');
    assert.equal(stats.notWritten, 1, '1 envelope refused at total bound');
    assert.equal(
      stats.sendRefusals[CONSENSUS_SEND_REFUSAL.TOTAL_BUFFER_EXCEEDED],
      1,
      'TOTAL_BUFFER_EXCEEDED incremented in consensusDelivery.sendRefusals',
    );
    assert.equal(stats.pendingBatchBytes, 0,
      'pendingBatchBytes returned to 0 after flush');
  } finally {
    await router.shutdown();
    resetRouterProcess();
  }
});

test('(c1-incarnation-fence) closing or replacing a connection incarnation ' +
  'settles and drops the old connection\'s pending batch rather than ' +
  'replaying it through a successor socket', async () => {
  configureRouterProcess('node-a');
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-a',
  });
  try {
    const wsOld = createFakeSocket();
    const wsNew = createFakeSocket();
    const wsClosing = createFakeSocket();
    const connOld = attachConnectedPeer(router, 'peer-b', wsOld,
      {connectionId: 'conn-peer-b-old'});
    const connClosing = attachConnectedPeer(router, 'peer-c', wsClosing,
      {connectionId: 'conn-peer-c-1'});

    // Enqueue 2 envelopes on connOld (peer-b) and 1 envelope on connClosing (peer-c).
    let oldSettledSynchronously = false;
    const oldDelivery1 = Promise.resolve(router.deliver(
      'peer-b/partition/g1-r2', buildEnvelope('g1', 1))).then((res) => {
      oldSettledSynchronously = true;
      return res;
    });
    const oldDelivery2 = router.deliver(
      'peer-b/partition/g2-r2', buildEnvelope('g2', 1));
    const closingDelivery = router.deliver(
      'peer-c/partition/g1-r3', buildEnvelope('g1', 9));

    assert.equal(oldSettledSynchronously, false,
      'pending batch has not settled DELIVERED on enqueue');

    // Replace peer-b's connection with a new connection incarnation (connNew,
    // wsNew) before the flush turn runs, and enqueue a fresh envelope on connNew.
    router.retireConnection(connOld);
    attachConnectedPeer(router, 'peer-b', wsNew,
      {connectionId: 'conn-peer-b-new'});
    const newDelivery = router.deliver(
      'peer-b/partition/g1-r2', buildEnvelope('g1', 2));

    // Close peer-c's connection before the flush turn runs.
    router.handleConnectionClose('peer-c', connClosing.connectionId);

    const [outOld1, outOld2, outNew, outClosing] = await Promise.all([
      oldDelivery1,
      oldDelivery2,
      newDelivery,
      closingDelivery,
    ]);

    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(outOld1)),
      false,
      'first envelope on replaced connection settled FAILED, never DELIVERED',
    );
    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(outOld2)),
      false,
      'second envelope on replaced connection settled FAILED, never DELIVERED',
    );
    assert.equal(deliveryTransportOf(outOld1).reasonCode,
      CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED,
      'replaced-connection batch settles with CONNECTION_REPLACED');
    assert.equal(deliveryTransportOf(outOld2).reasonCode,
      CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED,
      'replaced-connection batch settles with CONNECTION_REPLACED');

    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(outClosing)),
      false,
      'envelope on closed connection settled FAILED, never DELIVERED',
    );
    assert.equal(deliveryTransportOf(outClosing).reasonCode,
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED,
      'closed-connection batch settles with connection_closed');

    assert.equal(
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(outNew)),
      true,
      'fresh envelope on successor connection settled DELIVERED',
    );
    assert.equal(wsOld.sentFrames.length, 0,
      'retired socket received 0 frames');
    assert.equal(wsClosing.sentFrames.length, 0,
      'closed socket received 0 frames');
    assert.equal(wsNew.sentFrames.length, 1,
      'successor socket received 1 frame');
    assert.deepEqual(wsNew.sentFrames[0].envelopes, [{
      targetAddress: 'peer-b/partition/g1-r2',
      payload: buildEnvelope('g1', 2),
    }], 'successor socket carried ONLY the new connection incarnation\'s envelope');

    const stats = router.getStats().consensusDelivery;
    assert.equal(stats.written, 1, 'only the 1 successor envelope was written');
    assert.equal(stats.notWritten, 3,
      'the 2 replaced-connection envelopes and 1 closed-connection envelope were counted notWritten');
    assert.equal(
      stats.sendRefusals[CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED],
      2,
      'CONNECTION_REPLACED counted for both dropped envelopes of the old incarnation',
    );
    assert.equal(
      stats.sendRefusals[CONSENSUS_SEND_REFUSAL.CONNECTION_CLOSED],
      1,
      'CONNECTION_CLOSED counted for the closed connection\'s pending envelope',
    );
    assert.equal(stats.pendingBatchBytes, 0,
      'all pending batch bytes released');
  } finally {
    await router.shutdown();
    resetRouterProcess();
  }
});
