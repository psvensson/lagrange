/**
 * Unit tests for RouterDeliveryManager - Raft direct delivery.
 *
 * Tests the deliverRaftDirect method and the modified deliverRemote
 * routing logic that bypasses the outbound queue for Raft packets.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {RouterDeliveryManager} from '../../src/transport/router-delivery-manager.js';
import {
  CONNECTION_STATE,
  ROUTER_ADDRESS,
  ROUTER_ERROR_MSG,
  ROUTER_MESSAGE_TYPE,
} from '../../src/constants/transport.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';

/**
 * Create a minimal RouterDeliveryManager with test doubles.
 * @param {Object} overrides - Override specific options.
 * @return {Object} Manager and captured state.
 */
function createTestManager(overrides = {}) {
  const sentMessages = [];
  const enqueuedCalls = [];
  const nodeConnections = new Map();
  const pendingMessages = new Map();
  const nodeId = overrides.nodeId || 'test-node';

  const manager = new RouterDeliveryManager({
    nodeId,
    logger: {
      debug: () => {},
      warn: () => {},
      error: () => {},
    },
    nodeConnections,
    pendingMessages,
    messageTimeoutMs: 50,
    sendRaw: (_ws, message) => {
      sentMessages.push(message);
    },
    parseAddress: (addr) => {
      const parts = addr.split('/');
      return {nodeId: parts[0], entityType: parts[1], entityId: parts[2]};
    },
    isValidAddress: () => true,
    outboundQueue: {
      enqueueOutbound: (targetNodeId, fn) => {
        enqueuedCalls.push({targetNodeId});
        const result = fn();
        // For non-Raft messages going through sendMessage, the result
        // is a Promise that waits for ACK. Resolve it immediately by
        // simulating ACK via the pendingMessages map.
        if (result instanceof Promise) {
          const entry = Array.from(pendingMessages.values()).pop();
          if (entry) {
            clearTimeout(entry.timeout);
            entry.resolve({
              messageId: entry.messageId,
              acknowledged: true,
            });
          }
        }
        return Promise.resolve(result);
      },
    },
    ...overrides,
  });

  return {manager, sentMessages, enqueuedCalls, nodeConnections};
}

/**
 * Add a connected node to the connections map.
 * @param {Map} nodeConnections - Connections map.
 * @param {string} targetNodeId - Node ID to add.
 * @return {Object} The mock WebSocket object.
 */
function addConnectedNode(nodeConnections, targetNodeId) {
  const ws = {send: () => {}};
  nodeConnections.set(targetNodeId, {
    state: CONNECTION_STATE.CONNECTED,
    ws,
  });
  return ws;
}

test('RouterDeliveryManager - deliverRaftDirect', async (t) => {
  t.test('sends Raft packet directly via WebSocket', async (t) => {
    const {manager, sentMessages, nodeConnections} = createTestManager();
    const targetNodeId = 'remote-node';
    addConnectedNode(nodeConnections, targetNodeId);

    const payload = {type: RAFT_PACKET_TYPE.APPEND, data: 'test-data'};
    const targetAddress = `${targetNodeId}/partition/p1`;
    const messageId = 'msg-001';

    const result = manager.deliverRaftDirect(
      targetAddress, messageId, payload, targetNodeId,
    );

    t.equal(result.messageId, messageId);
    t.equal(result.acknowledged, true);
    t.equal(result.direct, true);
    t.equal(sentMessages.length, 1);
    t.equal(sentMessages[0].type, ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE);
    t.equal(sentMessages[0].messageId, messageId);
    t.equal(sentMessages[0].targetAddress, targetAddress);
    t.same(sentMessages[0].payload, payload);
    t.equal(
      sentMessages[0].sourceAddress,
      ROUTER_ADDRESS.buildSourceAddress('test-node'),
    );
    t.equal(sentMessages[0].sourceNodeId, 'test-node');
    t.ok(sentMessages[0].timestamp > 0);
  });

  t.test('returns not acknowledged when no connection exists', async (t) => {
    const {manager, sentMessages} = createTestManager();
    const targetNodeId = 'missing-node';

    const payload = {type: RAFT_PACKET_TYPE.VOTE, data: 'vote-data'};
    const result = manager.deliverRaftDirect(
      `${targetNodeId}/partition/p1`, 'msg-002', payload, targetNodeId,
    );

    t.equal(result.messageId, 'msg-002');
    t.equal(result.acknowledged, false);
    t.equal(
      result.error,
      ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
    );
    t.equal(sentMessages.length, 0);
  });

  t.test('returns not acknowledged when connection is disconnected',
    async (t) => {
      const {manager, sentMessages, nodeConnections} = createTestManager();
      const targetNodeId = 'disconnected-node';
      nodeConnections.set(targetNodeId, {
        state: CONNECTION_STATE.DISCONNECTED,
        ws: {send: () => {}},
      });

      const payload = {type: RAFT_PACKET_TYPE.APPENDED, data: 'ack'};
      const result = manager.deliverRaftDirect(
        `${targetNodeId}/partition/p1`, 'msg-003', payload, targetNodeId,
      );

      t.equal(result.acknowledged, false);
      t.equal(
        result.error,
        ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
      );
      t.equal(sentMessages.length, 0);
    });
});

test('RouterDeliveryManager - deliverRemote routing', async (t) => {
  t.test('routes Raft packets to deliverRaftDirect', async (t) => {
    const {manager, sentMessages, enqueuedCalls, nodeConnections} =
      createTestManager();
    const targetNodeId = 'remote-node';
    addConnectedNode(nodeConnections, targetNodeId);

    const raftPayload = {
      type: RAFT_PACKET_TYPE.APPEND,
      data: 'log-entry',
    };

    const result = await manager.deliverRemote(
      `${targetNodeId}/partition/p1`, 'msg-raft', raftPayload, targetNodeId,
    );

    t.equal(result.acknowledged, true);
    t.equal(result.direct, true);
    t.equal(enqueuedCalls.length, 0,
      'Raft packets must not be enqueued');
    t.equal(sentMessages.length, 1);
  });

  t.test('routes non-Raft packets to outbound queue', async (t) => {
    const {manager, enqueuedCalls, nodeConnections} = createTestManager();
    const targetNodeId = 'remote-node';
    addConnectedNode(nodeConnections, targetNodeId);

    const appPayload = {type: 'application', data: 'user-query'};

    await manager.deliverRemote(
      `${targetNodeId}/partition/p1`, 'msg-app', appPayload, targetNodeId,
    );

    t.equal(enqueuedCalls.length, 1,
      'Non-Raft packets must be enqueued');
    t.equal(enqueuedCalls[0].targetNodeId, targetNodeId);
  });

  t.test('routes all Raft packet types directly', async (t) => {
    const raftTypes = Object.values(RAFT_PACKET_TYPE);

    for (const raftType of raftTypes) {
      const {manager, enqueuedCalls, nodeConnections} = createTestManager();
      const targetNodeId = 'remote-node';
      addConnectedNode(nodeConnections, targetNodeId);

      const payload = {type: raftType, data: 'test'};
      const result = await manager.deliverRemote(
        `${targetNodeId}/partition/p1`, `msg-${raftType}`,
        payload, targetNodeId,
      );

      t.equal(result.direct, true,
        `Raft type "${raftType}" should use direct delivery`);
      t.equal(enqueuedCalls.length, 0,
        `Raft type "${raftType}" must not be enqueued`);
    }
  });

  t.test('null payload routes to outbound queue', async (t) => {
    const {manager, enqueuedCalls, nodeConnections} = createTestManager();
    const targetNodeId = 'remote-node';
    addConnectedNode(nodeConnections, targetNodeId);

    await manager.deliverRemote(
      `${targetNodeId}/partition/p1`, 'msg-null', null, targetNodeId,
    );

    t.equal(enqueuedCalls.length, 1,
      'Null payload must be enqueued');
  });

  t.test('payload without type routes to outbound queue', async (t) => {
    const {manager, enqueuedCalls, nodeConnections} = createTestManager();
    const targetNodeId = 'remote-node';
    addConnectedNode(nodeConnections, targetNodeId);

    await manager.deliverRemote(
      `${targetNodeId}/partition/p1`, 'msg-notype',
      {data: 'no-type'}, targetNodeId,
    );

    t.equal(enqueuedCalls.length, 1,
      'Payload without type must be enqueued');
  });
});


test('RouterDeliveryManager - registerPendingResponse', async (t) => {
  t.test('resolves when resolvePendingResponse called with result',
    async (t) => {
      const {manager} = createTestManager();
      const messageId = 'msg-pending-001';
      const expectedResult = {status: 'ok', data: 42};

      const responsePromise = manager.registerPendingResponse(
        messageId, 5000,
      );

      const resolved = manager.resolvePendingResponse(
        messageId, expectedResult, undefined,
      );

      t.equal(resolved, true);
      const result = await responsePromise;
      t.same(result, expectedResult);
      t.equal(manager.pendingResponses.size, 0,
        'Entry removed after resolve');
    });

  t.test('rejects when resolvePendingResponse called with error',
    async (t) => {
      const {manager} = createTestManager();
      const messageId = 'msg-pending-002';

      const responsePromise = manager.registerPendingResponse(
        messageId, 5000,
      );

      const resolved = manager.resolvePendingResponse(
        messageId, undefined, 'Handler failed',
      );

      t.equal(resolved, true);
      try {
        await responsePromise;
        t.fail('Should have rejected');
      } catch (err) {
        t.equal(err.message, 'Handler failed');
      }
      t.equal(manager.pendingResponses.size, 0,
        'Entry removed after reject');
    });

  t.test('rejects with timeout when no response arrives', async (t) => {
    const {manager} = createTestManager({messageTimeoutMs: 50});
    const messageId = 'msg-pending-003';

    try {
      await manager.registerPendingResponse(messageId, 30);
      t.fail('Should have rejected with timeout');
    } catch (err) {
      t.equal(err.message, ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT);
    }
    t.equal(manager.pendingResponses.size, 0,
      'Entry removed after timeout');
  });
});

test('RouterDeliveryManager - resolvePendingResponse', async (t) => {
  t.test('returns false when no pending response exists', async (t) => {
    const {manager} = createTestManager();

    const resolved = manager.resolvePendingResponse(
      'nonexistent-id', {data: 'test'}, undefined,
    );

    t.equal(resolved, false);
  });

  t.test('clears timeout on successful resolve', async (t) => {
    const {manager} = createTestManager();
    const messageId = 'msg-timeout-clear';

    const responsePromise = manager.registerPendingResponse(
      messageId, 5000,
    );

    t.equal(manager.pendingResponses.size, 1);
    manager.resolvePendingResponse(messageId, 'done', undefined);

    const result = await responsePromise;
    t.equal(result, 'done');
    t.equal(manager.pendingResponses.size, 0);
  });

  t.test('handles null result correctly', async (t) => {
    const {manager} = createTestManager();
    const messageId = 'msg-null-result';

    const responsePromise = manager.registerPendingResponse(
      messageId, 5000,
    );

    manager.resolvePendingResponse(messageId, null, undefined);

    const result = await responsePromise;
    t.equal(result, null);
  });
});

test('RouterDeliveryManager - clearPendingResponses', async (t) => {
  t.test('resolves all pending responses with shutdown result', async (t) => {
    const {manager} = createTestManager();
    const results = [];

    const p1 = manager.registerPendingResponse('msg-a', 5000)
      .then((res) => results.push(res));
    const p2 = manager.registerPendingResponse('msg-b', 5000)
      .then((res) => results.push(res));

    t.equal(manager.pendingResponses.size, 2);

    manager.clearPendingResponses('Router shutdown');

    await Promise.all([p1, p2]);

    t.equal(results.length, 2);
    t.equal(results[0].acknowledged, false);
    t.equal(results[0].error, 'Router shutdown');
    t.equal(results[0].shutdown, true);
    t.equal(results[1].acknowledged, false);
    t.equal(results[1].error, 'Router shutdown');
    t.equal(results[1].shutdown, true);
    t.equal(manager.pendingResponses.size, 0);
  });

  t.test('handles empty map gracefully', async (t) => {
    const {manager} = createTestManager();

    manager.clearPendingResponses('No-op shutdown');

    t.equal(manager.pendingResponses.size, 0);
  });
});
