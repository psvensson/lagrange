export async function registerMessageRouterTailFinalTests({
  t,
  MessageRouter,
  ConnectionState,
  ConfigurationManager,
  LoggingService,
  cleanupTestEnvironment,
}) {
  t.test('delivery timeout override bounds ACK waits per call', async (t) => {
    cleanupTestEnvironment();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'node-a'},
      logging: {level: 'error'},
      transport: {
        messageTimeoutMs: 100,
        reconnectIntervalMs: 100,
      },
    });
    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const router = new MessageRouter({nodeId: 'node-a'});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    router.nodeConnections.set('node-b', {
      nodeId: 'node-b',
      nodeAddress: 'ws://node-b:9999',
      connectionId: 'node-b-timeout-override',
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

    const startMs = Date.now();
    const result = await router.deliver(
      'node-b/service/no-ack',
      {type: 'TEST'},
      {timeoutMs: 20},
    );
    const elapsedMs = Date.now() - startMs;

    t.equal(result.acknowledged, false,
      'delivery should still fail when the ACK times out');
    t.equal(result.errorCode, 'ROUTER_MESSAGE_TIMEOUT',
      'timeout override should preserve the deferred timeout error code');
    t.ok(elapsedMs < 80,
      'delivery should honor the per-call timeout override instead of the router default');
  });

  t.test('ack timeout quarantines stale remote connection so the next delivery can reconnect',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 100,
          reconnectIntervalMs: 100,
          ackTimeoutQuarantineThreshold: 1,
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

      const staleWs = {
        readyState: 1,
        send: () => {},
        terminateCalled: false,
        terminate() {
          this.terminateCalled = true;
        },
      };
      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-stale',
        ws: staleWs,
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

      const firstResult = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.equal(
        firstResult.acknowledged,
        false,
        'first delivery should fail when ACK times out',
      );
      t.match(
        firstResult.error,
        /Message timeout/i,
        'first delivery should surface the ACK timeout',
      );
      t.equal(
        firstResult.deferRetry,
        true,
        'first delivery should ask callers to defer while recovery is pending',
      );
      t.equal(
        firstResult.errorCode,
        'ROUTER_MESSAGE_TIMEOUT',
        'first delivery should surface the deferred-timeout error code',
      );
      t.equal(
        router.nodeConnections.get('node-b')?.state,
        ConnectionState.RECONNECTING,
        'timed-out connection should enter reconnecting state',
      );
      t.equal(
        staleWs.terminateCalled,
        false,
        'timed-out connection should not hard-close the stale socket immediately',
      );

      const connectCalls = [];
      router.establishConnection = async (connectionInfo) => {
        connectCalls.push({
          nodeId: connectionInfo.nodeId,
          address: connectionInfo.address,
        });
        connectionInfo.ws = {
          readyState: 1,
          send: () => {},
        };
        connectionInfo.state = ConnectionState.CONNECTED;
        connectionInfo.reconnectAttempts = 0;
        connectionInfo.reconnectTimeout = null;
        connectionInfo.reconnectDueAt = null;
      };
      router.sendMessage = async (
        _connection,
        _targetAddress,
        messageId,
        _payload,
        targetNodeId,
        correlationId,
      ) => {
        return {
          messageId,
          correlationId,
          acknowledged: true,
          targetNodeId,
          recovered: true,
        };
      };

      const secondResult = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.same(connectCalls, [],
        'next delivery should respect the armed reconnect owner');
      t.equal(
        secondResult.acknowledged,
        false,
        'next delivery should still fail closed while reconnect is pending',
      );
      t.equal(
        secondResult.deferRetry,
        true,
        'next delivery should ask callers to defer while reconnect is pending',
      );
      t.equal(
        secondResult.errorCode,
        'ROUTER_CONNECTION_CLOSED',
        'next delivery should surface the reconnect-in-progress error code',
      );

      await new Promise((resolve) => setTimeout(resolve, 140));

      const thirdResult = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.same(
        connectCalls,
        [{nodeId: 'node-b', address: 'ws://node-b:9999'}],
        'scheduled reconnect should eventually redial exactly once',
      );
      t.equal(
        thirdResult.acknowledged,
        true,
        'delivery should succeed after the scheduled reconnect completes',
      );
      t.equal(
        thirdResult.recovered,
        true,
        'delivery should use the recovered connection after reconnect completes',
      );
    });

  t.test('should fall back from observed reconnect address to configured resolver address',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://node-b:9999' : null;
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-stale-ip',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://172.19.0.8:9999',
        configuredAddress: 'ws://node-b:9999',
        observedAddress: 'ws://172.19.0.8:9999',
        isSelfConnection: false,
      });

      const connectCalls = [];
      router.connectToNode = async (nodeId, address) => {
        connectCalls.push({nodeId, address});
        if (address === 'ws://172.19.0.8:9999') {
          throw new Error('connect ECONNREFUSED 172.19.0.8:9999');
        }
        router.nodeConnections.set(nodeId, {
          nodeId,
          nodeAddress: address,
          connectionId: 'node-b-fresh-fallback',
          ws: {
            readyState: 1,
            send: () => {},
          },
          state: ConnectionState.CONNECTED,
          isIncoming: false,
          reconnectAttempts: 0,
          reconnectTimeout: null,
          pingInterval: null,
          address,
          configuredAddress: 'ws://node-b:9999',
          observedAddress: null,
          isSelfConnection: false,
        });
      };
      router.sendMessage = async (
        _connection,
        _targetAddress,
        messageId,
        _payload,
        targetNodeId,
        correlationId,
      ) => {
        return {
          messageId,
          correlationId,
          acknowledged: true,
          targetNodeId,
          recovered: true,
        };
      };

      const result = await router.deliver(
        'node-b/service/fallback-reconnect',
        {type: 'TEST'},
      );

      t.same(
        connectCalls,
        [
          {nodeId: 'node-b', address: 'ws://node-b:9999'},
        ],
        'delivery recovery should prefer canonical reconnect authority over the observed transport address',
      );
      t.equal(
        result.acknowledged,
        true,
        'delivery should succeed after reconnecting via the configured address',
      );
      t.equal(
        result.recovered,
        true,
        'delivery should use the recovered connection after fallback',
      );
    });

  t.test('should keep the preserved observed reconnect address as bounded fallback behind canonical authority',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://node-b:9999' : null;
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-regressed-address',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        configuredAddress: 'ws://node-b:9999',
        observedAddress: 'ws://172.19.0.8:9999',
        isSelfConnection: false,
      });

      const connectCalls = [];
      router.connectToNode = async (nodeId, address) => {
        connectCalls.push({nodeId, address});
        router.nodeConnections.set(nodeId, {
          nodeId,
          nodeAddress: address,
          connectionId: 'node-b-fresh-observed',
          ws: {
            readyState: 1,
            send: () => {},
          },
          state: ConnectionState.CONNECTED,
          isIncoming: false,
          reconnectAttempts: 0,
          reconnectTimeout: null,
          pingInterval: null,
          address,
          configuredAddress: 'ws://node-b:9999',
          observedAddress: 'ws://172.19.0.8:9999',
          isSelfConnection: false,
        });
      };
      router.sendMessage = async (
        _connection,
        _targetAddress,
        messageId,
        _payload,
        targetNodeId,
        correlationId,
      ) => {
        return {
          messageId,
          correlationId,
          acknowledged: true,
          targetNodeId,
          recovered: true,
        };
      };

      const result = await router.deliver(
        'node-b/service/prefer-observed-reconnect',
        {type: 'TEST'},
      );

      t.same(
        connectCalls,
        [{nodeId: 'node-b', address: 'ws://node-b:9999'}],
        'delivery recovery should reconnect through canonical authority before considering observed fallback addresses',
      );
      t.equal(
        result.acknowledged,
        true,
        'delivery should succeed after reconnecting via canonical authority',
      );
      t.equal(
        result.recovered,
        true,
        'delivery should use the recovered connection after the canonical reconnect',
      );
    });

  t.test('should suppress a stale reconnect address across deliveries after ENOTFOUND',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://node-b-fresh:9999' : null;
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b-stale:9999',
        connectionId: 'node-b-stale-dns',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b-stale:9999',
        configuredAddress: 'ws://node-b-stale:9999',
        observedAddress: 'ws://node-b-stale:9999',
        isSelfConnection: false,
      });

      const connectCalls = [];
      router.establishConnection = async (connectionInfo) => {
        connectCalls.push(connectionInfo.address);
        if (connectionInfo.address === 'ws://node-b-stale:9999') {
          throw new Error('getaddrinfo ENOTFOUND node-b-stale');
        }
        connectionInfo.ws = {
          readyState: 1,
          send: () => {},
        };
        connectionInfo.state = ConnectionState.CONNECTED;
        connectionInfo.reconnectAttempts = 0;
        router.rememberReconnectAddress(
          connectionInfo,
          null,
          connectionInfo.configuredAddress || connectionInfo.address,
        );
      };
      router.sendMessage = async (
        _connection,
        _targetAddress,
        messageId,
        _payload,
        targetNodeId,
        correlationId,
      ) => {
        return {
          messageId,
          correlationId,
          acknowledged: true,
          targetNodeId,
          recovered: true,
        };
      };

      const firstResult = await router.deliver(
        'node-b/service/stale-reconnect-suppression',
        {type: 'TEST'},
      );
      t.equal(
        firstResult.acknowledged,
        true,
        'first delivery should recover through the fresh resolver-owned address',
      );

      const activeConnection = router.nodeConnections.get('node-b');
      activeConnection.state = ConnectionState.DISCONNECTED;
      activeConnection.ws = null;

      const secondResult = await router.deliver(
        'node-b/service/stale-reconnect-suppression',
        {type: 'TEST'},
      );
      t.equal(
        secondResult.acknowledged,
        true,
        'second delivery should also recover',
      );
      t.same(
        connectCalls,
        [
          'ws://node-b-fresh:9999',
          'ws://node-b-fresh:9999',
        ],
        'canonical reconnect authority should bypass the stale reconnect address once fresh endpoint data exists',
      );
    });

  t.test('should suppress handshake-failed reconnect candidates and retry current authority',
    async (t) => {
      const staleAddress = 'ws://172.18.0.2:8082';
      const freshAddress = 'ws://172.20.0.2:8082';
      const cases = [
        {
          name: 'connect timeout',
          code: 'WS_CONNECT_TIMEOUT',
          message: 'WebSocket connection timeout after 25ms',
        },
        {
          name: 'closed before open',
          code: null,
          message: 'WebSocket connection closed before open for node node-b',
        },
      ];

      for (const testCase of cases) {
        await t.test(testCase.name, async (t) => {
          const router = new MessageRouter({nodeId: 'node-a'});
          await router.initialize({startServer: false});
          t.teardown(async () => {
            await router.shutdown().catch(() => {});
          });

          router.setServiceNodeResolver((address) => {
            const match = address.match(/^([^/]+)\//);
            return match ? match[1] : null;
          });
          let authorityReads = 0;
          router.setNodeAddressResolver((nodeId) => {
            if (nodeId !== 'node-b') {
              return null;
            }
            authorityReads += 1;
            return authorityReads <= 2 ? staleAddress : freshAddress;
          });

          router.nodeConnections.set('node-b', {
            nodeId: 'node-b',
            nodeAddress: staleAddress,
            connectionId: 'node-b-stale-handshake',
            ws: null,
            state: ConnectionState.DISCONNECTED,
            isIncoming: false,
            reconnectAttempts: 0,
            reconnectTimeout: null,
            pingInterval: null,
            address: staleAddress,
            configuredAddress: staleAddress,
            observedAddress: staleAddress,
            isSelfConnection: false,
          });

          const warnings = [];
          router.logger.warn = (message, details) => {
            warnings.push({message, details});
          };
          const connectCalls = [];
          router.connectToNode = async (nodeId, address) => {
            connectCalls.push(address);
            if (address === staleAddress) {
              const error = new Error(testCase.message);
              if (testCase.code) {
                error.code = testCase.code;
              }
              throw error;
            }
            router.nodeConnections.set(nodeId, {
              nodeId,
              nodeAddress: address,
              connectionId: 'node-b-fresh-handshake',
              ws: {readyState: 1, send: () => {}},
              state: ConnectionState.CONNECTED,
              isIncoming: false,
              reconnectAttempts: 0,
              reconnectTimeout: null,
              pingInterval: null,
              address,
              configuredAddress: address,
              observedAddress: null,
              isSelfConnection: false,
            });
          };
          router.sendMessage = async (
            _connection,
            _targetAddress,
            messageId,
            _payload,
            targetNodeId,
            correlationId,
          ) => ({
            messageId,
            correlationId,
            acknowledged: true,
            targetNodeId,
            recovered: true,
          });

          const result = await router.deliver(
            'node-b/service/handshake-stale-reconnect-suppression',
            {type: 'TEST'},
          );
          const staleWarning = warnings.find(
            (entry) => entry.details?.address === staleAddress,
          );

          t.equal(result.acknowledged, true,
            'delivery should recover through freshly resolved authority');
          t.same(connectCalls, [staleAddress, freshAddress],
            'delivery should suppress stale handshake failure then dial fresh authority');
          t.equal(
            router.isReconnectAddressSuppressed('node-b', staleAddress),
            true,
            'stale handshake candidate should remain suppressed',
          );
          t.equal(
            router.nodeConnections.get('node-b')?.configuredAddress,
            freshAddress,
            'stored configured authority should be refreshed to the fresh address',
          );
          t.equal(
            staleWarning?.message,
            'Failed to reconnect target node before delivery',
            'warning should preserve the reconnect-before-delivery event name',
          );
          t.equal(staleWarning?.details?.candidateSource, 'canonical',
            'warning should identify the primary stale candidate source');
          t.same(
            staleWarning?.details?.candidateSources,
            ['canonical', 'configured', 'current', 'preferred', 'observed'],
            'warning should list every authority source for the stale candidate',
          );
          t.equal(staleWarning?.details?.error, testCase.message,
            'warning should include the handshake failure message');
        });
      }
    });

  t.test('should replace a stale configured reconnect address with the current authoritative resolver address',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://172.20.0.2:8082' : null;
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://ddb-test-reuse-5-1:8082',
        connectionId: 'node-b-stale-configured-address',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://ddb-test-reuse-5-1:8082',
        configuredAddress: 'ws://ddb-test-reuse-5-1:8082',
        observedAddress: null,
        isSelfConnection: false,
      });

      const connectCalls = [];
      router.connectToNode = async (nodeId, address) => {
        connectCalls.push({nodeId, address});
        router.nodeConnections.set(nodeId, {
          nodeId,
          nodeAddress: address,
          connectionId: 'node-b-authoritative-address',
          ws: {
            readyState: 1,
            send: () => {},
          },
          state: ConnectionState.CONNECTED,
          isIncoming: false,
          reconnectAttempts: 0,
          reconnectTimeout: null,
          pingInterval: null,
          address,
          configuredAddress: address,
          observedAddress: null,
          isSelfConnection: false,
        });
      };
      router.sendMessage = async (
        _connection,
        _targetAddress,
        messageId,
        _payload,
        targetNodeId,
        correlationId,
      ) => {
        return {
          messageId,
          correlationId,
          acknowledged: true,
          targetNodeId,
          recovered: true,
        };
      };

      const result = await router.deliver(
        'node-b/service/authoritative-reconnect-address',
        {type: 'TEST'},
      );

      t.same(
        connectCalls,
        [{nodeId: 'node-b', address: 'ws://172.20.0.2:8082'}],
        'delivery recovery should dial the authoritative resolver address instead of the stale configured hostname',
      );
      t.equal(
        result.acknowledged,
        true,
        'delivery should recover through the authoritative address',
      );
    });

  t.test('scheduled reconnect should refresh to the current authoritative resolver address before redialing',
    async (t) => {
      const router = new MessageRouter({nodeId: 'node-a'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.reconnectIntervalMs = 5;
      router.reconnectBackoffMultiplier = 1;
      router.reconnectMaxAttempts = 2;
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://172.20.0.2:8082' : null;
      });

      const connectionInfo = {
        nodeId: 'node-b',
        nodeAddress: 'ws://ddb-test-reuse-5-1:8082',
        connectionId: 'node-b-refresh-scheduled-reconnect',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        reconnectDueAt: null,
        pingInterval: null,
        address: 'ws://ddb-test-reuse-5-1:8082',
        configuredAddress: 'ws://ddb-test-reuse-5-1:8082',
        observedAddress: null,
        isSelfConnection: false,
        retired: false,
      };
      router.nodeConnections.set('node-b', connectionInfo);

      const dialedAddresses = [];
      router.establishConnection = async (connection) => {
        dialedAddresses.push(connection.address);
        connection.ws = {
          readyState: 1,
          send: () => {},
        };
        connection.state = ConnectionState.CONNECTED;
        connection.reconnectAttempts = 0;
      };

      router.scheduleReconnect(connectionInfo);
      await new Promise((resolve) => setTimeout(resolve, 25));

      t.same(
        dialedAddresses,
        ['ws://172.20.0.2:8082'],
        'scheduled reconnect should redial the authoritative resolver address instead of the stale configured hostname',
      );
      t.equal(
        connectionInfo.configuredAddress,
        'ws://172.20.0.2:8082',
        'scheduled reconnect should refresh the stored configured address to the authoritative value',
      );
    });

  t.test('should normalize bare host:port addresses to ws:// in ' +
    'reconnect candidates (uses normalizeToWebSocketAddress)',
  async (t) => {
    const router = new MessageRouter({
      nodeId: 'node-a',
    });
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    router.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[1] : null;
    });
    router.setNodeAddressResolver(() => null);

    // Simulate a connection whose configuredAddress is a bare REST
    // address (no ws:// prefix) — this happens when the IDENTIFY
    // message carries the node's REST API address.
    router.nodeConnections.set('node-b', {
      nodeId: 'node-b',
      nodeAddress: 'ddb-test-node-5:8080',
      connectionId: 'node-b-bare-addr',
      ws: null,
      state: ConnectionState.DISCONNECTED,
      isIncoming: false,
      reconnectAttempts: 0,
      reconnectTimeout: null,
      pingInterval: null,
      address: 'ddb-test-node-5:8080',
      configuredAddress: 'ddb-test-node-5:8080',
      observedAddress: null,
      isSelfConnection: false,
    });

    const connectCalls = [];
    router.connectToNode = async (nodeId, address) => {
      connectCalls.push({nodeId, address});
      router.nodeConnections.set(nodeId, {
        nodeId,
        nodeAddress: address,
        connectionId: 'node-b-recovered',
        ws: {readyState: 1, send: () => {}},
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address,
        configuredAddress: address,
        observedAddress: null,
        isSelfConnection: false,
      });
    };
    router.sendMessage = async (
      _connection, _targetAddress, messageId,
      _payload, targetNodeId, correlationId,
    ) => ({
      messageId, correlationId,
      acknowledged: true, targetNodeId,
      recovered: true,
    });

    const result = await router.deliver(
      'node-b/service/bare-address-test',
      {type: 'TEST'},
    );

    t.equal(result.acknowledged, true,
      'delivery should succeed after normalizing the bare address');
    t.equal(connectCalls.length, 1,
      'should attempt exactly one reconnect');
    t.equal(connectCalls[0].address, 'ws://ddb-test-node-5:8082',
      'bare host:port should be normalized to ws:// with WS port offset');
  });
}
