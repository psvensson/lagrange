import {registerMessageRouterTailMoreTests} from './message-router-tail-more-test-cases.js';

export async function registerMessageRouterTailTests({
  t,
  net,
  EventEmitter,
  MessageRouter,
  ConnectionState,
  RouterMessageType,
  ConfigurationManager,
  LoggingService,
  initializeTestEnvironment,
  cleanupTestEnvironment,
}) {
  t.test('should replace superseded heartbeat NODE_STATE_UPDATE deliveries in the pending queue',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 3,
        outboundQueueCriticalReserve: 1,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const deliveredHeartbeatAts = [];
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const secondDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatAts.push(1);
          return {acknowledged: true, heartbeatAt: 1};
        },
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/service/control-plane',
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: 'node-2',
            heartbeat_only: true,
            heartbeat_at: 1,
          },
        },
      );
      await Promise.resolve();

      const thirdDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatAts.push(2);
          return {acknowledged: true, heartbeatAt: 2};
        },
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/service/control-plane',
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: 'node-2',
            heartbeat_only: true,
            heartbeat_at: 2,
          },
        },
      );

      const supersededResult = await secondDelivery;
      t.equal(
        supersededResult?.result?.acknowledged,
        true,
        'superseded heartbeat node-state update should resolve without surfacing an error',
      );
      t.equal(
        supersededResult?.result?.replacedPending,
        true,
        'superseded heartbeat node-state update should be marked as replaced pending work',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        1,
        'heartbeat node-state replacement should keep only one pending update',
      );

      releaseFirstSend();
      await firstDelivery;
      const finalHeartbeatResult = await thirdDelivery;

      t.same(
        deliveredHeartbeatAts,
        [2],
        'only the newest queued heartbeat node-state update should be delivered',
      );
      t.equal(
        finalHeartbeatResult?.result?.heartbeatAt,
        2,
        'latest heartbeat node-state update should be the one that drains',
      );

      await router.shutdown();
    });

  t.test('should replace superseded Raft heartbeat appends in the pending queue',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 2,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const deliveredHeartbeatIds = [];
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const secondDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatIds.push('second');
          return {acknowledged: true, heartbeatId: 'second'};
        },
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/message-group/mg-1-r2',
          message: {type: 'append', data: []},
        },
      );
      await Promise.resolve();

      const thirdDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatIds.push('third');
          return {acknowledged: true, heartbeatId: 'third'};
        },
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/message-group/mg-1-r2',
          message: {type: 'append'},
        },
      );

      const supersededResult = await secondDelivery;
      t.equal(
        supersededResult?.result?.acknowledged,
        true,
        'superseded heartbeat should resolve without surfacing an error',
      );
      t.equal(
        supersededResult?.result?.replacedPending,
        true,
        'superseded heartbeat should be marked as replaced pending work',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        1,
        'heartbeat replacement should keep only one pending heartbeat',
      );
      t.equal(
        queue.pending[0].deliverySource,
        'raft:append:heartbeat',
        'pending heartbeat should use the explicit heartbeat delivery source',
      );

      releaseFirstSend();
      await firstDelivery;
      const finalHeartbeatResult = await thirdDelivery;

      t.same(
        deliveredHeartbeatIds,
        ['third'],
        'only the latest queued heartbeat should be delivered',
      );
      t.equal(
        finalHeartbeatResult?.result?.heartbeatId,
        'third',
        'latest heartbeat should be the one that actually drains',
      );

      await router.shutdown();
    });

  t.test('should replace superseded Raft append-fail notifications in the ' +
    'pending queue for the same target replica',
  async (t) => {
    const router = new MessageRouter({
      nodeId: 'test-node',
      outboundQueueMaxConcurrent: 1,
      outboundQueueMaxPending: 2,
      outboundQueueCriticalReserve: 0,
    });
    await router.initialize();

    let releaseFirstSend = null;
    const deliveredFailureIndexes = [];
    const firstDelivery = router.enqueueOutbound(
      'remote-node',
      () => new Promise((resolve) => {
        releaseFirstSend = () => resolve({acknowledged: true});
      }),
      {deliveryPriority: 'background'},
    );
    await Promise.resolve();

    const secondDelivery = router.enqueueOutbound(
      'remote-node',
      async () => {
        deliveredFailureIndexes.push('second');
        return {acknowledged: true, appendFailIndex: 12};
      },
      {
        deliveryPriority: 'background',
        targetAddress: 'remote-node/partition/sql_transactions-p1-r4',
        message: {
          type: 'append fail',
          data: {index: 12, term: 4},
        },
      },
    );
    await Promise.resolve();

    const thirdDelivery = router.enqueueOutbound(
      'remote-node',
      async () => {
        deliveredFailureIndexes.push('third');
        return {acknowledged: true, appendFailIndex: 11};
      },
      {
        deliveryPriority: 'background',
        targetAddress: 'remote-node/partition/sql_transactions-p1-r4',
        message: {
          type: 'append fail',
          data: {index: 11, term: 4},
        },
      },
    );

    const supersededResult = await secondDelivery;
    t.equal(
      supersededResult?.result?.acknowledged,
      true,
      'superseded append-fail should resolve without surfacing an error',
    );
    t.equal(
      supersededResult?.result?.replacedPending,
      true,
      'superseded append-fail should be marked as replaced pending work',
    );

    const queue = router.getOutboundQueue('remote-node');
    t.equal(
      queue.pending.length,
      1,
      'append-fail replacement should keep only one pending failure notification',
    );
    t.equal(
      queue.pending[0].deliverySource,
      'message:append fail',
      'pending append-fail should preserve the original delivery-source classification',
    );

    releaseFirstSend();
    await firstDelivery;
    const finalAppendFailResult = await thirdDelivery;

    t.same(
      deliveredFailureIndexes,
      ['third'],
      'only the latest queued append-fail should be delivered',
    );
    t.equal(
      finalAppendFailResult?.result?.appendFailIndex,
      11,
      'latest append-fail should be the one that actually drains',
    );

    await router.shutdown();
  });

  t.test('should drain critical deliveries ahead of background backlog',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 1,
      });
      await router.initialize();

      const executionOrder = [];
      let releaseFirstSend = null;

      const firstDelivery = router.enqueueOutbound(
        'node-1',
        async () => {
          executionOrder.push('first');
          await new Promise((resolve) => {
            releaseFirstSend = resolve;
          });
          return {acknowledged: true};
        },
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      const backgroundQueued = router.enqueueOutbound(
        'node-1',
        async () => {
          executionOrder.push('background');
          return {acknowledged: true};
        },
        {deliveryPriority: 'background'},
      );
      const criticalQueued = router.enqueueOutbound(
        'node-1',
        async () => {
          executionOrder.push('critical');
          return {acknowledged: true};
        },
        {deliveryPriority: 'critical'},
      );

      releaseFirstSend();
      await firstDelivery;
      await criticalQueued;
      await backgroundQueued;

      t.same(
        executionOrder,
        ['first', 'critical', 'background'],
        'critical queue lane should drain before background backlog',
      );

      await router.shutdown();
    });

  t.test('should get registered addresses', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/service-a', () => ({}));
    router.register('test-node/service/service-b', () => ({}));
    router.register('test-node/service/service-c', () => ({}));

    const addresses = router.getRegisteredAddresses();

    t.equal(addresses.length, 3, 'should have three addresses');
    t.ok(addresses.includes('test-node/service/service-a'), 'should include service-a');
    t.ok(addresses.includes('test-node/service/service-b'), 'should include service-b');
    t.ok(addresses.includes('test-node/service/service-c'), 'should include service-c');

    await router.shutdown();
  });

  t.test('should get stats', async (t) => {
    const router = new MessageRouter({
      nodeId: 'stats-test-node',
      nodeAddress: 'ws://localhost:8080',
    });
    await router.initialize();

    router.register('stats-test-node/service/service-1', () => ({}));
    router.register('stats-test-node/service/service-2', () => ({}));

    const stats = router.getStats();

    t.equal(stats.nodeId, 'stats-test-node', 'should have node ID');
    t.equal(stats.nodeAddress, 'ws://localhost:8080', 'should have node address');
    t.equal(stats.initialized, true, 'should be initialized');
    t.equal(stats.handlers, 2, 'should have two handlers');
    t.equal(stats.messageCount, 0, 'should have zero messages');
    t.equal(stats.pendingMessages, 0, 'should have zero pending');
    t.equal(stats.connectedNodes, 0, 'should have zero connections');

    await router.shutdown();
  });

  t.test('should increment message count on deliver attempt', async (t) => {
    // Message count increments even when delivery fails (no connection)
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/counter-service', () => ({acknowledged: true}));

    // These will fail without connection but still increment counter
    await router.deliver('test-node/service/counter-service', {data: '1'});
    await router.deliver('test-node/service/counter-service', {data: '2'});
    await router.deliver('test-node/service/counter-service', {data: '3'});

    const stats = router.getStats();
    t.equal(stats.messageCount, 3, 'should count three messages');

    await router.shutdown();
  });

  t.test('should export ConnectionState enum', async (t) => {
    t.equal(ConnectionState.DISCONNECTED, 'disconnected');
    t.equal(ConnectionState.CONNECTING, 'connecting');
    t.equal(ConnectionState.CONNECTED, 'connected');
    t.equal(ConnectionState.RECONNECTING, 'reconnecting');
    t.equal(ConnectionState.CLOSED, 'closed');
  });

  t.test('should export RouterMessageType enum', async (t) => {
    t.equal(RouterMessageType.SERVICE_MESSAGE, 'service_message');
    t.equal(RouterMessageType.ACK, 'ack');
    t.equal(RouterMessageType.IDENTIFY, 'identify');
    t.equal(RouterMessageType.PING, 'ping');
    t.equal(RouterMessageType.PONG, 'pong');
  });

  t.test('connectToSelf uses bound server address', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-bound-host-test',
      wsPort: 9882,
    });

    router.server = {
      address: () => ({address: '::1', family: 'IPv6', port: 9882}),
    };

    const calls = [];
    router.connectToNode = async (nodeId, address, options) => {
      calls.push({nodeId, address, options});
    };

    await router.connectToSelf();

    t.equal(calls.length, 1, 'should make one self-connect attempt');
    t.equal(calls[0].nodeId, 'self-bound-host-test', 'should target local node ID');
    t.equal(calls[0].address, 'ws://[::1]:9882', 'should use bound IPv6 host');
    t.same(
      calls[0].options,
      {isSelfConnection: true},
      'should mark connection as self-connection',
    );
  });

  t.test('connectToNode enforces websocket handshake timeouts', async (t) => {
    cleanupTestEnvironment();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
      transport: {messageTimeoutMs: 5000},
      timeout: {websocketConnectMs: 1000},
    });
    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const slowServer = net.createServer((socket) => {
      socket.on('data', () => {});
    });
    await new Promise((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    t.teardown(async () => {
      await new Promise((resolve) => slowServer.close(resolve));
    });

    const address = slowServer.address();
    const port = typeof address === 'object' && address ? address.port : null;
    const router = new MessageRouter({nodeId: 'timeout-test-node'});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown();
    });

    const outcome = await Promise.race([
      router.connectToNode('slow-node', `ws://127.0.0.1:${port}`, { autoReconnect: false })
        .then(() => 'connected')
        .catch((error) => error),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 1100)),
    ]);

    t.type(outcome, Error, 'should reject stalled handshakes');
    t.match(outcome.message, /timeout/i, 'should surface a timeout error');
    t.equal(
      router.getConnectionState('slow-node'),
      ConnectionState.DISCONNECTED,
      'should mark timed out connections as disconnected',
    );
  });

  t.test('scheduleReconnect retries failed reconnects without unhandled rejections',
    async (t) => {
      const router = new MessageRouter({nodeId: 'reconnect-retry-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown();
      });

      router.reconnectIntervalMs = 5;
      router.reconnectBackoffMultiplier = 1;
      router.reconnectMaxAttempts = 4;

      const connectionInfo = {
        connectionId: 'reconnect-1',
        nodeId: 'remote-node',
        address: 'ws://remote-node:8082',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isIncoming: false,
        isSelfConnection: false,
        createdAt: Date.now(),
      };
      router.nodeConnections.set(connectionInfo.nodeId, connectionInfo);

      let attempts = 0;
      router.establishConnection = async (connection) => {
        attempts++;
        if (attempts < 3) {
          connection.state = ConnectionState.DISCONNECTED;
          throw new Error(`dial failed ${attempts}`);
        }
        connection.state = ConnectionState.CONNECTED;
        connection.reconnectAttempts = 0;
        connection.ws = {};
      };

      const unhandledRejections = [];
      const onUnhandledRejection = (error) => {
        unhandledRejections.push(error);
      };
      process.on('unhandledRejection', onUnhandledRejection);
      t.teardown(() => {
        process.off('unhandledRejection', onUnhandledRejection);
      });

      router.scheduleReconnect(connectionInfo);
      await new Promise((resolve) => setTimeout(resolve, 50));

      t.equal(attempts, 3, 'should keep retrying until a reconnect succeeds');
      t.equal(
        connectionInfo.state,
        ConnectionState.CONNECTED,
        'should mark the connection connected after a successful retry',
      );
      t.equal(
        connectionInfo.reconnectTimeout,
        null,
        'should clear the reconnect timer after callback execution',
      );
      t.same(
        unhandledRejections,
        [],
        'should not surface reconnect failures as unhandled rejections',
      );
    });

  t.test('scheduleReconnect closes after max failed attempts without throwing',
    async (t) => {
      const router = new MessageRouter({nodeId: 'reconnect-max-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown();
      });

      router.reconnectIntervalMs = 5;
      router.reconnectBackoffMultiplier = 1;
      router.reconnectMaxAttempts = 2;

      const connectionInfo = {
        connectionId: 'reconnect-2',
        nodeId: 'remote-node',
        address: 'ws://remote-node:8082',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isIncoming: false,
        isSelfConnection: false,
        createdAt: Date.now(),
      };
      router.nodeConnections.set(connectionInfo.nodeId, connectionInfo);

      let attempts = 0;
      router.establishConnection = async (connection) => {
        attempts++;
        connection.state = ConnectionState.DISCONNECTED;
        throw new Error('dial failed');
      };

      const unhandledRejections = [];
      const onUnhandledRejection = (error) => {
        unhandledRejections.push(error);
      };
      process.on('unhandledRejection', onUnhandledRejection);
      t.teardown(() => {
        process.off('unhandledRejection', onUnhandledRejection);
      });

      router.scheduleReconnect(connectionInfo);
      await new Promise((resolve) => setTimeout(resolve, 40));

      t.equal(attempts, 2, 'should stop after the configured max reconnect attempts');
      t.equal(
        connectionInfo.state,
        ConnectionState.CLOSED,
        'should close the connection after exhausting retries',
      );
      t.equal(
        connectionInfo.reconnectTimeout,
        null,
        'should not leave a reconnect timer armed after exhaustion',
      );
      t.same(
        unhandledRejections,
        [],
        'should not crash the process when retries are exhausted',
      );
    });

  t.test('scheduleReconnect suppresses a stale timer after the peer connection is superseded',
    async (t) => {
      const router = new MessageRouter({nodeId: 'reconnect-superseded-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown();
      });

      router.reconnectIntervalMs = 5;
      router.reconnectBackoffMultiplier = 1;
      router.reconnectMaxAttempts = 2;

      const staleConnection = {
        connectionId: 'reconnect-stale',
        nodeId: 'remote-node',
        address: 'ws://remote-node:8082',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isIncoming: false,
        isSelfConnection: false,
        retired: false,
        createdAt: Date.now(),
      };
      router.nodeConnections.set(staleConnection.nodeId, staleConnection);

      let attempts = 0;
      router.establishConnection = async () => {
        attempts++;
      };

      router.scheduleReconnect(staleConnection);
      router.nodeConnections.set(staleConnection.nodeId, {
        connectionId: 'incoming-current',
        nodeId: 'remote-node',
        address: 'ws://remote-node:8082',
        ws: {},
        state: ConnectionState.CONNECTED,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isIncoming: true,
        isSelfConnection: false,
        retired: false,
        createdAt: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      t.equal(attempts, 0, 'superseded reconnect timer should not redial');
      t.equal(
        staleConnection.state,
        ConnectionState.CLOSED,
        'superseded connection should be marked closed',
      );
      t.equal(
        staleConnection.reconnectTimeout,
        null,
        'superseded reconnect timer should be cleared after the callback runs',
      );
      t.equal(
        staleConnection.retired,
        true,
        'superseded connection should be retired once the timer is suppressed',
      );
    });

  t.test('connectToNode retires a replaced reconnecting entry before dialing a new connection',
    async (t) => {
      const router = new MessageRouter({nodeId: 'replace-reconnecting-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown();
      });

      let staleReconnectTimerFired = false;
      const staleReconnectTimeout = setTimeout(() => {
        staleReconnectTimerFired = true;
      }, 15);
      t.teardown(() => {
        clearTimeout(staleReconnectTimeout);
      });

      const stalePingInterval = setInterval(() => {}, 1000);
      t.teardown(() => {
        clearInterval(stalePingInterval);
      });

      const staleConnection = {
        connectionId: 'stale-reconnecting',
        nodeId: 'remote-node',
        address: 'ws://stale-node:8082',
        configuredAddress: 'ws://stale-node:8082',
        observedAddress: null,
        ws: null,
        state: ConnectionState.RECONNECTING,
        reconnectAttempts: 1,
        reconnectTimeout: staleReconnectTimeout,
        pingInterval: stalePingInterval,
        isIncoming: false,
        isSelfConnection: false,
        retired: false,
        createdAt: Date.now(),
      };
      router.nodeConnections.set(staleConnection.nodeId, staleConnection);

      router.establishConnection = async (connection) => {
        connection.state = ConnectionState.CONNECTED;
        connection.ws = {};
      };

      await router.connectToNode('remote-node', 'ws://fresh-node:8082');
      await new Promise((resolve) => setTimeout(resolve, 20));

      t.equal(
        staleReconnectTimerFired,
        false,
        'replaced reconnect timer should be cleared before it can fire',
      );
      t.equal(
        staleConnection.retired,
        true,
        'replaced reconnecting entry should be retired',
      );
      t.equal(
        staleConnection.reconnectTimeout,
        null,
        'replaced reconnecting entry should clear its timer',
      );
      t.equal(
        staleConnection.pingInterval,
        null,
        'replaced reconnecting entry should clear its heartbeat interval',
      );
      t.not(
        router.nodeConnections.get('remote-node')?.connectionId,
        staleConnection.connectionId,
        'active peer entry should no longer point at the stale reconnecting object',
      );
    });

  t.test('should emit nodeConnected on identification', async (t) => {
    const router = new MessageRouter({nodeId: 'local-node'});
    await router.initialize({startServer: false});

    const connectionId = 'incoming-connection';
    router.nodeConnections.set(connectionId, {
      connectionId,
      nodeId: null,
      nodeAddress: null,
      ws: {},
      state: ConnectionState.CONNECTED,
      reconnectAttempts: 0,
      isIncoming: true,
      isSelfConnection: false,
      createdAt: Date.now(),
    });

    let eventPayload = null;
    router.on('nodeConnected', (payload) => {
      eventPayload = payload;
    });

    router.handleIdentification(connectionId, {}, {
      type: RouterMessageType.IDENTIFY,
      nodeId: 'remote-node',
      nodeAddress: 'ws://remote-node:9999',
    });

    t.ok(eventPayload, 'should emit nodeConnected');
    t.equal(eventPayload.nodeId, 'remote-node', 'should include nodeId');
    t.equal(eventPayload.nodeAddress, 'ws://remote-node:9999', 'should include nodeAddress');
    t.equal(eventPayload.connectionId, connectionId, 'should include connectionId');
    t.ok(router.nodeConnections.has('remote-node'), 'should re-key connection by nodeId');
    t.notOk(router.nodeConnections.has(connectionId), 'should remove old connection key');

    await router.shutdown();
  });

  t.test('should normalize bare host:port to ws:// at ' +
    'identification storage time ' +
    '(uses normalizeToWebSocketAddress)', async (t) => {
    const router = new MessageRouter({nodeId: 'local-node'});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    const connectionId = 'conn-bare-id';
    router.nodeConnections.set(connectionId, {
      connectionId,
      nodeId: null,
      nodeAddress: null,
      ws: {},
      state: ConnectionState.CONNECTED,
      reconnectAttempts: 0,
      isIncoming: true,
      isSelfConnection: false,
      createdAt: Date.now(),
      configuredAddress: null,
      observedAddress: null,
    });

    router.handleIdentification(connectionId, {}, {
      type: RouterMessageType.IDENTIFY,
      nodeId: 'remote-bare',
      nodeAddress: 'ddb-test-node-3:8080',
    });

    const conn = router.nodeConnections.get('remote-bare');
    t.ok(conn, 'connection should be re-keyed by nodeId');
    t.equal(conn.nodeAddress, 'ws://ddb-test-node-3:8082',
      'nodeAddress should be normalized to ws:// with ' +
      'WS port offset');
    t.equal(conn.configuredAddress,
      'ws://ddb-test-node-3:8082',
      'configuredAddress should be normalized to ws:// ' +
      'with WS port offset');
  });

  t.test('should preserve an existing preferred incoming connection on duplicate identification',
    async (t) => {
      const router = new MessageRouter({nodeId: 'z-local-node'});
      await router.initialize({startServer: false});

      const existingWs = {
        terminateCalled: false,
        terminate() {
          this.terminateCalled = true;
        },
      };
      router.nodeConnections.set('a-remote-node', {
        connectionId: 'existing-preferred-incoming',
        nodeId: 'a-remote-node',
        nodeAddress: 'ws://remote-node:9999',
        ws: existingWs,
        state: ConnectionState.CONNECTED,
        reconnectAttempts: 0,
        isIncoming: true,
        isSelfConnection: false,
        createdAt: Date.now(),
      });

      const duplicateWs = {
        terminateCalled: false,
        terminate() {
          this.terminateCalled = true;
        },
      };
      router.nodeConnections.set('incoming-duplicate', {
        connectionId: 'incoming-duplicate',
        nodeId: null,
        nodeAddress: null,
        ws: duplicateWs,
        state: ConnectionState.CONNECTED,
        reconnectAttempts: 0,
        isIncoming: true,
        isSelfConnection: false,
        createdAt: Date.now(),
      });

      router.handleIdentification('incoming-duplicate', duplicateWs, {
        type: RouterMessageType.IDENTIFY,
        nodeId: 'a-remote-node',
        nodeAddress: 'ws://remote-node:9999',
      });

      t.equal(
        router.nodeConnections.get('a-remote-node')?.connectionId,
        'existing-preferred-incoming',
        'router should keep the already-connected preferred incoming link',
      );
      t.equal(
        existingWs.terminateCalled,
        false,
        'router should not terminate the stable preferred incoming socket',
      );
      t.equal(
        duplicateWs.terminateCalled,
        true,
        'router should terminate the duplicate incoming socket',
      );
      t.notOk(
        router.nodeConnections.has('incoming-duplicate'),
        'duplicate connection key should be removed after identification',
      );

      await router.shutdown();
    });

  t.test('should mark a rekeyed incoming connection disconnected when its socket closes',
    async (t) => {
      const router = new MessageRouter({nodeId: 'z-local-node'});
      await router.initialize({startServer: false});

      const ws = new EventEmitter();
      ws.readyState = 1;
      ws.terminate = () => {
        ws.readyState = 3;
      };

      const closedEvents = [];
      router.on('connectionClosed', (event) => {
        closedEvents.push(event);
      });

      router.handleIncomingConnection(ws, null);
      const incomingConnectionId = Array.from(router.nodeConnections.keys())[0];

      router.handleIdentification(incomingConnectionId, ws, {
        type: RouterMessageType.IDENTIFY,
        nodeId: 'a-remote-node',
        nodeAddress: 'ws://remote-node:9999',
      });

      t.equal(
        router.nodeConnections.get('a-remote-node')?.state,
        ConnectionState.CONNECTED,
        'identified incoming connection should be tracked under the remote node ID',
      );

      ws.emit('close');

      t.equal(
        router.nodeConnections.get('a-remote-node')?.state,
        ConnectionState.DISCONNECTED,
        'closing a rekeyed incoming socket should update the live node entry',
      );
      t.same(
        closedEvents,
        [{nodeId: 'a-remote-node'}],
        'connectionClosed should be emitted for the identified remote node',
      );

      await router.shutdown();
    });


  await registerMessageRouterTailMoreTests({
    t,
    net,
    EventEmitter,
    MessageRouter,
    ConnectionState,
    RouterMessageType,
    ConfigurationManager,
    LoggingService,
    initializeTestEnvironment,
    cleanupTestEnvironment,
  });
}
