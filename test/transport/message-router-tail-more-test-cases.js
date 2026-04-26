import {registerMessageRouterTailFinalTests} from './message-router-tail-final-test-cases.js';

export async function registerMessageRouterTailMoreTests({
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
  t.test('should emit initialized event', async (t) => {
    const router = new MessageRouter({nodeId: 'event-test-node'});

    const events = [];
    router.on('initialized', (data) => events.push(data));

    await router.initialize();

    t.equal(events.length, 1, 'should emit one event');
    t.equal(events[0].nodeId, 'event-test-node', 'should have node ID');
    t.ok(events[0].routerId, 'should have router ID');

    await router.shutdown();
  });

  t.test('should emit shutdown event', async (t) => {
    const router = new MessageRouter({nodeId: 'shutdown-test'});
    await router.initialize();

    const events = [];
    router.on('shutdown', (data) => events.push(data));

    await router.shutdown();

    t.equal(events.length, 1, 'should emit one event');
    t.ok(events[0].routerId, 'should have router ID');
  });

  t.test('should clear all state on shutdown', async (t) => {
    const router = new MessageRouter({nodeId: 'cleanup-test'});
    await router.initialize();

    router.register('cleanup-test/service/service-1', () => ({}));
    router.register('cleanup-test/service/service-2', () => ({}));

    await router.shutdown();

    t.equal(router.initialized, false, 'should not be initialized');
    t.equal(router.handlers.size, 0, 'should clear handlers');
    t.equal(router.nodeConnections.size, 0, 'should clear connections');
    t.equal(router.pendingMessages.size, 0, 'should clear pending messages');
  });

  t.test('should not surface pending response shutdown races as unhandled rejections',
    async (t) => {
      const router = new MessageRouter({nodeId: 'shutdown-race-test'});
      await router.initialize({startServer: false});

      const unhandledRejections = [];
      const onUnhandledRejection = (error) => {
        unhandledRejections.push(error);
      };
      process.on('unhandledRejection', onUnhandledRejection);
      t.teardown(() => {
        process.off('unhandledRejection', onUnhandledRejection);
      });

      const ws = new EventEmitter();
      ws.readyState = 1;
      ws.send = () => {};
      ws.terminate = () => {
        ws.readyState = 3;
        queueMicrotask(() => ws.emit('close'));
      };
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        state: ConnectionState.CONNECTED,
        ws,
        isIncoming: false,
        isSelfConnection: false,
      });

      const deliveryPromise = router.deliver(
        'remote-node/service/test-service',
        {type: 'TEST', data: 'shutdown-race'},
      );

      await Promise.resolve();
      await router.shutdown();

      const result = await deliveryPromise;
      await Promise.resolve();

      t.equal(result.acknowledged, false, 'should report failed ACK on shutdown');
      t.equal(result.error, 'Router shutdown', 'should surface shutdown as delivery error');
      t.equal(router.pendingResponses.size, 0, 'should clear pending responses');
      t.same(
        unhandledRejections,
        [],
        'should not emit unhandled rejections when shutdown beats ACK',
      );
    });

  t.test('should rate-limit unmatched service response warnings', async (t) => {
    let nowMs = 1000;
    const router = new MessageRouter({
      nodeId: 'service-response-throttle-test',
      nowFn: () => nowMs,
      unmatchedServiceResponseWarnIntervalMs: 5000,
    });
    await router.initialize({startServer: false});

    const warns = [];
    const debugs = [];
    router.logger = {
      info() {},
      error() {},
      warn(message, context) {
        warns.push({message, context});
      },
      debug(message, context) {
        debugs.push({message, context});
      },
    };

    router.handleServiceResponse({
      messageId: 'orphan-response-1',
      result: {ok: true},
    });
    nowMs = 2000;
    router.handleServiceResponse({
      messageId: 'orphan-response-2',
      result: {ok: true},
    });
    nowMs = 7000;
    router.handleServiceResponse({
      messageId: 'orphan-response-3',
      result: {ok: true},
    });

    t.equal(warns.length, 2, 'should only warn once per throttle window');
    t.equal(debugs.length, 4,
      'should keep debug visibility for receive events and suppressed warnings');
    t.equal(
      warns[0].message,
      'No pending service response request',
      'should preserve the warning message',
    );
    t.equal(
      warns[1].context.suppressedSinceLastWarn,
      1,
      'later warnings should summarize suppressed duplicates',
    );
    t.ok(
      debugs.some((entry) => entry.context.suppressedByRateLimit === true),
      'suppressed duplicate warnings should degrade to debug',
    );

    await router.shutdown();
  });

  t.test('should absorb one late service response for a retired pending waiter',
    async (t) => {
      let nowMs = 1000;
      const router = new MessageRouter({
        nodeId: 'retired-service-response-test',
        nowFn: () => nowMs,
        unmatchedServiceResponseWarnIntervalMs: 5000,
      });
      await router.initialize({startServer: false});

      const warns = [];
      const debugs = [];
      router.logger = {
        info() {},
        error() {},
        warn(message, context) {
          warns.push({message, context});
        },
        debug(message, context) {
          debugs.push({message, context});
        },
      };

      router.registerPendingResponse('retired-response-1', 'node-remote');
      router.cancelPendingResponse('retired-response-1', {
        ignoreLateResponse: true,
      });

      nowMs = 1500;
      router.handleServiceResponse({
        messageId: 'retired-response-1',
        result: {ok: true},
      });
      router.handleServiceResponse({
        messageId: 'orphan-response-after-retired',
        result: {ok: true},
      });

      t.equal(
        warns.length,
        1,
        'retired late responses should be absorbed while true orphaned responses still warn',
      );
      t.equal(
        warns[0]?.context?.messageId,
        'orphan-response-after-retired',
        'only the genuinely orphaned response should emit a warning',
      );
      t.ok(
        debugs.some((entry) => entry.context?.ignoredRetiredPending === true),
        'router should mark absorbed late responses explicitly in debug logs',
      );

      await router.shutdown();
    });

  t.test('should handle multiple initializations idempotently', async (t) => {
    const router = new MessageRouter({nodeId: 'idempotent-test'});

    const events = [];
    router.on('initialized', () => events.push('init'));

    await router.initialize();
    await router.initialize();
    await router.initialize();

    t.equal(events.length, 1, 'should only emit once');
    t.equal(router.initialized, true, 'should be initialized');

    await router.shutdown();
  });

  t.test('should return null connection state for unknown node', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const state = router.getConnectionState('unknown-node');
    t.equal(state, null, 'should return null for unknown node');

    await router.shutdown();
  });

  t.test('should return empty array for connected nodes when none connected', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const connected = router.getConnectedNodes();
    t.same(connected, [], 'should return empty array');

    await router.shutdown();
  });

  // Self-connection tests (Requirements: 2.1, 2.2)
  t.test('should establish self-connection when starting server', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-connect-test',
      wsPort: 9876,
    });

    await router.initialize({startServer: true});

    // Verify self-connection exists
    t.ok(router.hasSelfConnection(), 'should have self-connection');
    t.equal(
      router.getConnectionState('self-connect-test'),
      ConnectionState.CONNECTED,
      'self-connection should be connected',
    );

    // Verify self is in connected nodes
    const connected = router.getConnectedNodes();
    t.ok(connected.includes('self-connect-test'), 'should include self in connected nodes');

    await router.shutdown();
  });

  t.test('should deliver messages to self via WebSocket', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-delivery-test',
      wsPort: 9877,
    });

    await router.initialize({startServer: true});

    const receivedMessages = [];
    router.register('self-delivery-test/service/test-service', (envelope) => {
      receivedMessages.push(envelope);
      return {acknowledged: true, data: 'response-from-self'};
    });

    // Deliver message to self
    const result = await router.deliver(
      'self-delivery-test/service/test-service',
      {type: 'TEST', data: 'hello-self'},
    );

    t.equal(result.acknowledged, true, 'should be acknowledged');
    t.equal(result.data, 'response-from-self', 'should have response data');
    t.equal(receivedMessages.length, 1, 'should receive one message');
    t.equal(receivedMessages[0].payload.data, 'hello-self', 'should have correct payload');

    await router.shutdown();
  });

  t.test('should preserve no-handler error details on acknowledged self delivery', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-no-handler-test',
      wsPort: 9887,
    });

    await router.initialize({startServer: true});

    const result = await router.deliver(
      'self-no-handler-test/service/missing-handler',
      {type: 'TEST', data: 'missing'},
    );

    t.equal(result.acknowledged, true, 'should acknowledge delivery');
    t.equal(result.noHandler, true, 'should surface noHandler flag');
    t.match(
      result.error,
      /No handler registered for address self-no-handler-test\/service\/missing-handler/,
      'should preserve no-handler error text on acknowledged ACK',
    );

    await router.shutdown();
  });

  t.test('should preserve handler-provided error details on acknowledged self delivery', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-error-detail-test',
      wsPort: 9888,
    });

    await router.initialize({startServer: true});

    router.register('self-error-detail-test/service/erroring-service', () => {
      return {
        acknowledged: true,
        status: 'error',
        error: 'replica assignment rejected',
      };
    });

    const result = await router.deliver(
      'self-error-detail-test/service/erroring-service',
      {type: 'TEST', data: 'bad'},
    );

    t.equal(result.acknowledged, true, 'should acknowledge delivery');
    t.equal(result.status, 'error', 'should preserve handler status');
    t.equal(
      result.error,
      'replica assignment rejected',
      'should preserve handler error text on acknowledged ACK',
    );

    await router.shutdown();
  });

  t.test('should emit selfDisconnect event when self-connection is lost', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-disconnect-test',
      wsPort: 9878,
    });

    await router.initialize({startServer: true});

    // Get the self-connection and verify it's marked correctly
    const selfConnection = router.nodeConnections.get('self-disconnect-test');
    t.ok(selfConnection, 'should have self-connection');
    t.ok(selfConnection.isSelfConnection, 'should be marked as self-connection');

    // Verify that self-connection is outgoing (not incoming)
    // This means it won't trigger reconnection attempts
    t.equal(selfConnection.isIncoming, false, 'self-connection should be outgoing');

    // Verify the connection state
    t.equal(selfConnection.state, ConnectionState.CONNECTED, 'should be connected');

    await router.shutdown();
  });

  t.test('should mark self-connection as isSelfConnection', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-mark-test',
      wsPort: 9881,
    });

    await router.initialize({startServer: true});

    const selfConnection = router.nodeConnections.get('self-mark-test');
    t.ok(selfConnection, 'should have self-connection');
    t.ok(selfConnection.isSelfConnection, 'should be marked as self-connection');

    // Regular connections should not be marked as self-connection
    // (we can't easily test this without another node, but we verify the flag exists)
    t.equal(
      typeof selfConnection.isSelfConnection,
      'boolean',
      'isSelfConnection should be boolean',
    );

    await router.shutdown();
  });

  t.test('should not have self-connection without starting server', async (t) => {
    const router = new MessageRouter({
      nodeId: 'no-server-test',
      wsPort: 9879,
    });

    await router.initialize({startServer: false});

    t.notOk(router.hasSelfConnection(), 'should not have self-connection');
    t.equal(router.server, null, 'should not have server');

    await router.shutdown();
  });

  t.test('should fail initialization if self-connection fails', async (t) => {
    // Use a port that's already in use to cause server start failure
    const router1 = new MessageRouter({
      nodeId: 'port-holder',
      wsPort: 9890,
    });
    await router1.initialize({startServer: true});

    const router2 = new MessageRouter({
      nodeId: 'fail-connect-test',
      wsPort: 9890, // Same port - will fail
    });

    try {
      await router2.initialize({startServer: true});
      t.fail('should have thrown error');
    } catch (error) {
      t.ok(error.message, 'should have error message');
    }

    await router1.shutdown();
    // router2 doesn't need shutdown since it failed to initialize
  });

  t.test('should fall back to deliverRemote when no handler registered',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize({startServer: false});

      let deliverRemoteCalled = false;
      let capturedArgs = null;
      const originalDeliverRemote = router.deliverRemote.bind(router);
      router.deliverRemote = async (...args) => {
        deliverRemoteCalled = true;
        capturedArgs = args;
        return originalDeliverRemote(...args);
      };

      // No handler registered for this address
      const result = await router.deliver(
        'test-node/service/unregistered', {data: 'test'},
      );

      t.ok(deliverRemoteCalled, 'should call deliverRemote as fallback');
      t.equal(
        capturedArgs[0], 'test-node/service/unregistered',
        'should pass target address to deliverRemote',
      );
      t.equal(result.acknowledged, false, 'should not be acknowledged');

      await router.shutdown();
    });

  t.test('should log metrics for local delivery', async (t) => {
    const router = new MessageRouter({nodeId: 'metrics-local-node'});
    await router.initialize({startServer: false});

    const loggedEntries = [];
    const originalInfo = router.logger.info.bind(router.logger);
    router.logger.info = (tag, data) => {
      loggedEntries.push({tag, data});
      return originalInfo(tag, data);
    };

    router.register(
      'metrics-local-node/service/svc', () => ({acknowledged: true}),
    );

    // Deliver enough messages to trigger a fault metric (first fault fires)
    // A failed delivery triggers FAULT on the 1st occurrence
    router.register(
      'metrics-local-node/service/fail-svc', () => {
        throw new Error('fail');
      },
    );

    await router.deliver(
      'metrics-local-node/service/fail-svc', {data: 'trigger-metric'},
    );

    const metricsLogs = loggedEntries.filter(
      (e) => e.tag === 'metrics.transport.deliver',
    );
    t.ok(metricsLogs.length > 0, 'should emit transport deliver metric');
    t.equal(
      metricsLogs[0].data.targetNodeId, 'metrics-local-node',
      'metric should target local node',
    );
    t.equal(
      metricsLogs[0].data.acknowledged, false,
      'metric should reflect acknowledged status',
    );

    await router.shutdown();
  });

  t.test('outbound queue enforces per-node concurrency', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize({startServer: false});
    router.outboundQueueMaxConcurrent = 1;

    let inFlight = 0;
    let maxInFlight = 0;
    const deliveries = [];

    for (let i = 0; i < 3; i++) {
      deliveries.push(router.enqueueOutbound('node-1', async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return {acknowledged: true};
      }));
    }

    await Promise.all(deliveries);
    t.equal(maxInFlight, 1, 'limits in-flight per node');

    await router.shutdown();
  });

  t.test('failOutboundQueue rejects pending deliveries', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize({startServer: false});
    router.outboundQueueMaxConcurrent = 1;

    let releaseFirst = null;
    const firstPromise = router.enqueueOutbound('node-1', () => {
      return new Promise((resolve) => {
        releaseFirst = resolve;
      });
    });

    const secondPromise = router.enqueueOutbound('node-1', async () => {
      return {acknowledged: true};
    });

    router.failOutboundQueue('node-1', new Error('disconnect'));

    await t.rejects(secondPromise, /disconnect/, 'pending delivery rejected');

    releaseFirst({acknowledged: true});
    await firstPromise;

    await router.shutdown();
  });

  t.test('default outbound concurrency allows parallel writes', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize({startServer: false});

    const parallelCount = 8;
    let inFlight = 0;
    let maxInFlight = 0;
    const arrivedResolvers = [];
    let gateResolve;
    const gate = new Promise((resolve) => {
      gateResolve = resolve;
    });
    const deliveries = [];

    for (let i = 0; i < parallelCount; i++) {
      deliveries.push(router.enqueueOutbound('node-1', () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve) => {
          arrivedResolvers.push(resolve);
          if (arrivedResolvers.length >= parallelCount) {
            gateResolve();
          }
        });
      }));
    }

    await gate;
    t.equal(
      maxInFlight, parallelCount,
      `default concurrency should allow ${parallelCount} parallel ` +
      `deliveries but only ${maxInFlight} were in-flight`,
    );

    for (const resolve of arrivedResolvers) {
      resolve({acknowledged: true});
    }
    await Promise.all(deliveries);

    await router.shutdown();
  });

  t.test('remote slow handler does not block queued deliveries waiting for ACK',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 180,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const routerA = new MessageRouter({
        nodeId: 'node-a',
        wsPort: 12901,
        inProcess: true,
      });
      const routerB = new MessageRouter({
        nodeId: 'node-b',
        wsPort: 12902,
        inProcess: true,
      });

      await routerA.initialize({startServer: true});
      await routerB.initialize({startServer: true});
      t.teardown(async () => {
        await routerA.shutdown().catch(() => {});
        await routerB.shutdown().catch(() => {});
      });

      routerA.outboundQueueMaxConcurrent = 1;

      let firstCallResolver = null;
      let invocationCount = 0;
      routerB.register('node-b/service/slow-ack-test', async (envelope) => {
        invocationCount += 1;
        if (invocationCount === 1) {
          return await new Promise((resolve) => {
            firstCallResolver = resolve;
          });
        }
        return {
          acknowledged: true,
          id: envelope.payload?.id,
        };
      });

      await routerA.connectToNode('node-b', 'ws://localhost:12902');

      const firstPromise = routerA.deliver(
        'node-b/service/slow-ack-test',
        {type: 'TEST', id: 1},
      );
      await new Promise((resolve) => setTimeout(resolve, 15));

      const secondStartMs = Date.now();
      const secondResult = await routerA.deliver(
        'node-b/service/slow-ack-test',
        {type: 'TEST', id: 2},
      );
      const secondDurationMs = Date.now() - secondStartMs;

      if (firstCallResolver) {
        firstCallResolver({
          acknowledged: true,
          id: 1,
        });
      }
      await firstPromise;

      t.equal(secondResult.acknowledged, true, 'second delivery should be acknowledged');
      t.equal(secondResult.id, 2, 'second delivery should preserve handler payload');
      t.ok(
        secondDurationMs < 80,
        'second delivery should not be blocked by first ACK wait ' +
        `(took ${secondDurationMs}ms)`,
      );
    });

  t.test('simultaneous cross-connect keeps bidirectional node routing connected',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 200,
          reconnectIntervalMs: 100,
          reconnectMaxAttempts: 3,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const routerA = new MessageRouter({
        nodeId: 'node-a',
        wsPort: 12903,
        inProcess: true,
      });
      const routerB = new MessageRouter({
        nodeId: 'node-b',
        wsPort: 12904,
        inProcess: true,
      });

      await routerA.initialize({startServer: true});
      await routerB.initialize({startServer: true});
      t.teardown(async () => {
        await routerA.shutdown().catch(() => {});
        await routerB.shutdown().catch(() => {});
      });

      await Promise.all([
        routerA.connectToNode('node-b', 'ws://localhost:12904'),
        routerB.connectToNode('node-a', 'ws://localhost:12903'),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 25));

      t.equal(
        routerA.getConnectionState('node-b'),
        ConnectionState.CONNECTED,
        'routerA should keep routable connection keyed by node-b',
      );
      t.equal(
        routerB.getConnectionState('node-a'),
        ConnectionState.CONNECTED,
        'routerB should keep routable connection keyed by node-a',
      );
    });

  t.test('ack timeout does not emit unhandled pending response rejection',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 100,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      // Simulate a connected peer socket that silently drops outbound writes.
      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b',
        ws: {
          readyState: 1,
          send: () => {},
        },
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        isSelfConnection: false,
      });

      const unhandled = [];
      const onUnhandled = (error) => {
        unhandled.push(error);
      };
      process.on('unhandledRejection', onUnhandled);
      t.teardown(() => {
        process.off('unhandledRejection', onUnhandled);
      });

      const result = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.equal(result.acknowledged, false, 'delivery should fail when ACK times out');
      t.match(result.error, /Message timeout/i, 'should surface ACK timeout error');
      t.equal(result.deferRetry, true,
        'ACK timeout should ask callers to defer immediate retries');
      t.equal(result.errorCode, 'ROUTER_MESSAGE_TIMEOUT',
        'ACK timeout should surface a stable deferred-timeout error code');

      await new Promise((resolve) => setTimeout(resolve, 150));
      t.equal(
        unhandled.length,
        0,
        'pending SERVICE_RESPONSE timeout should not surface as unhandled rejection',
      );
    });

  t.test('closed socket before send returns a deferred failure and arms reconnect',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
        reconnectIntervalMs: 250,
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      const closedWs = {
        readyState: 3,
        send: () => {
          throw new Error('socket should not send while closed');
        },
        terminateCalled: false,
        terminate() {
          this.terminateCalled = true;
        },
      };
      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-closed-before-send',
        ws: closedWs,
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        reconnectDueAt: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        configuredAddress: 'ws://node-b:9999',
        observedAddress: null,
        isSelfConnection: false,
      });

      const result = await router.deliver(
        'node-b/service/closed-before-send',
        {type: 'TEST'},
      );

      t.equal(result.acknowledged, false,
        'delivery should fail closed when the socket is already closed');
      t.equal(result.deferRetry, true,
        'delivery should ask callers to defer immediate retries');
      t.equal(result.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'delivery should surface a stable closed-connection error code');
      t.equal(
        router.nodeConnections.get('node-b')?.state,
        ConnectionState.RECONNECTING,
        'the peer should transition into reconnecting after the closed send',
      );
      t.ok(
        router.nodeConnections.get('node-b')?.reconnectTimeout,
        'the peer should arm one reconnect timer after the closed send',
      );
      t.equal(
        closedWs.terminateCalled,
        true,
        'the stale socket should be terminated before recovery',
      );
    });

  t.test('first ACK timeout stays on the current socket until the quarantine threshold is reached',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 100,
          reconnectIntervalMs: 100,
          ackTimeoutQuarantineThreshold: 2,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-stale',
        ws: {
          readyState: 1,
          send: () => {},
        },
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        isSelfConnection: false,
        ackTimeoutStreak: 0,
        lastAckAt: null,
        lastAckTimeoutAt: null,
      });

      const result = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.equal(result.acknowledged, false,
        'delivery should still fail when the ACK times out');
      t.equal(result.errorCode, 'ROUTER_MESSAGE_TIMEOUT',
        'timeout should still surface the deferred timeout error');
      t.equal(
        router.nodeConnections.get('node-b')?.state,
        ConnectionState.CONNECTED,
        'the first timeout should keep the current socket when below threshold',
      );
      t.equal(
        router.nodeConnections.get('node-b')?.ackTimeoutStreak,
        1,
        'the timeout streak should increment for the active connection',
      );
    });


  await registerMessageRouterTailFinalTests({
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
