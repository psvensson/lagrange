/**
 * A direct Raft frame is one-way: the sender waits for nothing and the
 * recipient answers nothing. This suite proves the sender keeps no
 * pending-ACK entry, pending response, queue slot, timer or response
 * disposition count for such a frame, and that the recipient emits no ACK or
 * SERVICE_RESPONSE in any handler outcome (answer, throw, no handler).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  MessageRouter,
  ConnectionState,
  RouterMessageType,
} from '../../src/transport/message-router.js';
import {RealTimeSource} from '../../src/time/time-source.js';
import {
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const TARGET_ADDRESS = 'node-r2/partition/one-way-p1-r2';

function raftPayload() {
  return {
    protocol: 'raft-rs',
    groupId: 'one-way-p1',
    from: '101',
    to: '202',
    message: {
      msgType: 3, from: '101', to: '202', term: '1', logTerm: '0',
      index: '0', commit: '0', entries: [],
    },
  };
}

// The router's one clock, with every timer it arms accounted for.
function createTimerCountingTimeSource() {
  const real = new RealTimeSource();
  const live = new Set();
  return {
    live,
    now: () => real.now(),
    setTimeout: (callback, delayMs) => {
      const handle = real.setTimeout(() => {
        live.delete(handle);
        callback();
      }, delayMs);
      live.add(handle);
      return handle;
    },
    clearTimeout: (handle) => {
      live.delete(handle);
      real.clearTimeout(handle);
    },
    setInterval: (callback, delayMs) => {
      const handle = real.setInterval(callback, delayMs);
      live.add(handle);
      return handle;
    },
    clearInterval: (handle) => {
      live.delete(handle);
      real.clearInterval(handle);
    },
  };
}

function frameCollectingSocket() {
  const frames = [];
  return {
    frames,
    readyState: 1,
    send(bytes) {
      frames.push(JSON.parse(String(bytes)));
    },
  };
}

test('the sender keeps nothing behind for a one-way Raft frame', async (t) => {
  const timeSource = createTimerCountingTimeSource();
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-r1',
    inProcess: true,
    timeSource,
  });
  await router.initialize({startServer: false});
  t.teardown(async () => {
    await router.shutdown().catch(() => {});
  });
  const ws = frameCollectingSocket();
  router.nodeConnections.set('node-r2', {
    nodeId: 'node-r2',
    connectionId: 'node-r2-conn-1',
    state: ConnectionState.CONNECTED,
    isIncoming: false,
    isSelfConnection: false,
    ws,
  });
  const timersBefore = timeSource.live.size;
  const dispositionsBefore = router.serviceResponseDispositionCounts.size;

  const delivered = await router.deliver(TARGET_ADDRESS, raftPayload());

  t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivered)),
    true, 'the direct Raft delivery is acknowledged at the socket handoff');
  t.equal(ws.frames.length, 1, 'exactly one frame left the sender');
  t.equal(ws.frames[0].type, RouterMessageType.SERVICE_MESSAGE,
    'it is a service message');
  t.equal(ws.frames[0].oneWay, true, 'stamped one-way');
  t.equal(router.pendingMessages.size, 0, 'no pending-ACK entry is left');
  t.equal(router.pendingResponses.size, 0, 'no pending response is left');
  t.equal(router.retiredPendingResponses.size, 0,
    'no retired pending response is left');
  t.equal(router.outboundQueues.get('node-r2'), undefined,
    'no outbound queue slot was taken');
  t.equal(timeSource.live.size, timersBefore,
    'no timer armed for the delivery is left running');
  t.equal(router.serviceResponseDispositionCounts.size, dispositionsBefore,
    'no response disposition is counted for a frame that expects none');
  const connection = router.nodeConnections.get('node-r2');
  t.equal(connection.ackTimeoutStreak ?? 0, 0,
    'a one-way frame cannot start an ACK-timeout streak');
});

for (const outcome of ['answers', 'throws', 'is not registered']) {
  test(`the recipient answers nothing when the handler ${outcome}`,
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'node-r2',
        inProcess: true,
      });
      let handled = 0;
      if (outcome === 'answers') {
        router.register(TARGET_ADDRESS, () => {
          handled += 1;
          return {ok: true};
        });
      } else if (outcome === 'throws') {
        router.register(TARGET_ADDRESS, () => {
          handled += 1;
          throw new Error('raft step failed');
        });
      }
      const ws = frameCollectingSocket();

      router.handleServiceMessage(ws, {
        type: RouterMessageType.SERVICE_MESSAGE,
        messageId: 'one-way-1',
        targetAddress: TARGET_ADDRESS,
        sourceAddress: 'node-r1/router/node-r1',
        sourceNodeId: 'node-r1',
        payload: raftPayload(),
        timestamp: 1,
        oneWay: true,
      });
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(handled, outcome === 'is not registered' ? 0 : 1,
        'the handler ran exactly when one is registered');
      t.same(ws.frames, [],
        'no ACK and no SERVICE_RESPONSE is sent for a one-way frame');
    });
}

test('a two-way frame is still acknowledged and answered', async (t) => {
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-r2',
    inProcess: true,
  });
  router.register(TARGET_ADDRESS, () => ({ok: true}));
  const ws = frameCollectingSocket();

  router.handleServiceMessage(ws, {
    type: RouterMessageType.SERVICE_MESSAGE,
    messageId: 'two-way-1',
    targetAddress: TARGET_ADDRESS,
    sourceAddress: 'node-r1/router/node-r1',
    sourceNodeId: 'node-r1',
    payload: {type: 'TEST'},
    timestamp: 1,
  });
  await new Promise((resolve) => setImmediate(resolve));

  t.same(ws.frames.map((frame) => frame.type),
    [RouterMessageType.ACK, RouterMessageType.SERVICE_RESPONSE],
    'the one-way suppression is keyed on the frame, not on the handler');
});

test('handling a service message does not enumerate the handler registry',
  async (t) => {
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-r2',
      inProcess: true,
    });
    router.register(TARGET_ADDRESS, () => null);
    let enumerations = 0;
    const handlers = router.handlers;
    for (const method of ['keys', 'values', 'entries', Symbol.iterator]) {
      const original = handlers[method];
      handlers[method] = function countedEnumeration(...args) {
        enumerations += 1;
        return original.apply(this, args);
      };
    }

    router.handleServiceMessage(frameCollectingSocket(), {
      type: RouterMessageType.SERVICE_MESSAGE,
      messageId: 'no-enumeration-1',
      targetAddress: TARGET_ADDRESS,
      sourceAddress: 'node-r1/router/node-r1',
      sourceNodeId: 'node-r1',
      payload: {type: 'TEST'},
      timestamp: 1,
    });
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(enumerations, 0,
      'no per-message copy of the registered addresses is built for a log line');
  });
