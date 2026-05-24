export function registerAdminWebSocketApiLoadReadinessTests({
  test,
  AdminWebSocketAPI,
  MessageType,
  ErrorCode,
  createInProcWebSocketPair,
  createPopulatedCache,
  connectAndReceive,
  waitForMessage,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
}) {
  test('AdminWebSocketAPI - load lane uses serveEligible instead of ' +
    'repair-only readiness', async (t) => {
    let executedQueryCount = 0;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: '1'}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync: () => ({
          nodeId: 'test-node',
          dimensions: {
            routingReady: true,
            clusterMemberHealthy: true,
            repairEligible: true,
            serveEligible: false,
            loadReady: false,
          },
          runtimeAuthority: {
            state: RUNTIME_AUTHORITY_STATE.CONFIRMED,
            visibility: {
              state: RUNTIME_AUTHORITY_VISIBILITY_STATE.CONFIRMED,
            },
          },
          reasons: [
            {code: 'load_not_ready'},
          ],
        }),
      },
    });

    await api.initialize(0, {listen: false});
    const waitForNextMessage = (ws, timeout = 2000) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timeout waiting for message'));
        }, timeout);
        ws.once('message', (data) => {
          clearTimeout(timer);
          resolve(JSON.parse(data.toString()));
        });
      });
    };
    const {clientSocket, serverSocket} = createInProcWebSocketPair();
    api.handleConnection(serverSocket, {
      query: {lane: 'load'},
    });
    await waitForNextMessage(clientSocket, 2000);
    const ws = clientSocket;

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-serve-gate',
      sql: 'SELECT 1',
    }));

    const result = await waitForNextMessage(ws, 2000);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.queryId, 'q-load-lane-serve-gate',
      'should preserve query id');
    t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
      'serve-only readiness rejection should surface as a typed admin error');
    t.match(
      String(result.error || ''),
      /serve not ready/i,
      'load-lane admission must be keyed off serveEligible',
    );
    t.equal(
      result.details?.loadLaneAdmission?.[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]
        ?.state,
      RUNTIME_AUTHORITY_STATE.CONFIRMED,
      'load-lane admission should preserve runtime authority details on serve-only rejection',
    );
    t.equal(executedQueryCount, 0,
      'load-lane admission should reject before SQL execution');

    ws.close();
    await api.shutdown();
  });

  test('AdminWebSocketAPI - query_result preserves retry metadata for deferred failures',
    async (t) => {
      const deferredReasonCode = 'publication_epoch_pending';
      const api = new AdminWebSocketAPI({
        nodeId: 'test-node',
        systemTableCache: createPopulatedCache(),
        sqlQueryEngine: {
          executeRequest: async () => ({
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: ErrorCode.INTERNAL_ERROR,
            deferRetry: true,
            retryAfterMs: 275,
            outcome: 'deferred',
            visibilityState: 'pending_visibility',
            contractState: 'deferred',
            nextAction: 'retry',
            authoritativeVisibilityConfirmed: true,
            reasonCode: deferredReasonCode,
            reasonCodes: [deferredReasonCode],
            failedDimensions: ['publishedConvergencePending'],
            runtimeAuthority: {
              state: 'establishing',
              visibility: {
                state: 'pending_publication',
              },
            },
          }),
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000);

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-retry-metadata',
        sql: 'SELECT 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.queryId, 'q-retry-metadata',
        'should preserve query id');
      t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
        'should preserve error code');
      t.equal(result.deferRetry, true,
        'should preserve deferRetry on failed query results');
      t.equal(result.retryAfterMs, 275,
        'should preserve retryAfterMs on failed query results');
      t.equal(result.outcome, 'deferred',
        'should preserve canonical outcome metadata');
      t.equal(result.visibilityState, 'pending_visibility',
        'should preserve mutation visibility state');
      t.equal(result.contractState, 'deferred',
        'should preserve the shared contract state');
      t.equal(result.nextAction, 'retry',
        'should preserve the shared next action');
      t.equal(result.authoritativeVisibilityConfirmed, true,
        'should preserve authoritative visibility confirmation');
      t.equal(result.reasonCode, deferredReasonCode,
        'should preserve the primary authority-establishment reason');
      t.same(result.reasonCodes, [deferredReasonCode],
        'should preserve authority-establishment reason codes');
      t.same(result.failedDimensions, ['publishedConvergencePending'],
        'should preserve failed readiness dimensions');
      t.equal(result.runtimeAuthority?.state, 'establishing',
        'should preserve compact runtime authority state');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane upgrades retryable participant failures',
    async (t) => {
      const api = new AdminWebSocketAPI({
        nodeId: 'test-node',
        systemTableCache: createPopulatedCache(),
        sqlQueryEngine: {
          executeRequest: async () => ({
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: ErrorCode.INTERNAL_ERROR,
          }),
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-lane-retryable-participant-failure',
        sql: 'SELECT 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.queryId, 'q-load-lane-retryable-participant-failure',
        'should preserve query id');
      t.equal(result.deferRetry, true,
        'load-lane participant failures should defer instead of hard-failing');
      t.equal(result.retryAfterMs, 250,
        'load-lane participant failures should include bounded retry metadata');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane caps SQL timeout and defers timed-out queries',
    async (t) => {
      let observedTimeoutMs = null;
      const api = new AdminWebSocketAPI({
        nodeId: 'test-node',
        systemTableCache: createPopulatedCache(),
        sqlQueryEngine: {
          executeRequest: async (sqlRequest) => {
            observedTimeoutMs = Number(sqlRequest?.timeoutMs);
            await new Promise((resolve) => setTimeout(resolve, 25));
            return {
              success: true,
              rows: [{id: 1}],
              count: 1,
            };
          },
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-lane-timeout-cap',
        sql: 'SELECT 1',
        timeoutMs: 10,
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.queryId, 'q-load-lane-timeout-cap',
        'should preserve query id');
      t.equal(result.deferRetry, true,
        'timed-out load-lane requests should remain retryable');
      t.equal(result.retryAfterMs, 250,
        'timed-out load-lane requests should include bounded retry metadata');
      t.equal(observedTimeoutMs, 10,
        'load lane should honor bounded caller timeout budgets');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane prefers async readiness when available',
    async (t) => {
      let executedQueryCount = 0;
      const api = new AdminWebSocketAPI({
        nodeId: 'test-node',
        systemTableCache: createPopulatedCache(),
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{id: '1'}],
              count: 1,
            };
          },
        },
        controlPlaneReadinessService: {
          getNodeReadinessSync: () => ({
            nodeId: 'test-node',
            dimensions: {
              serveEligible: false,
            },
            reasons: [
              {code: 'storage_budget_unavailable'},
            ],
          }),
          async getNodeReadiness() {
            return {
              nodeId: 'test-node',
              dimensions: {
                routingReady: true,
                clusterMemberHealthy: true,
                repairEligible: true,
                serveEligible: true,
                loadReady: true,
              },
              reasons: [],
            };
          },
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-lane-async-readiness',
        sql: 'SELECT 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.error, undefined,
        'async readiness should admit the load-lane query');
      t.equal(executedQueryCount, 1,
        'async readiness should allow SQL execution');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane requests authoritative readiness refresh',
    async (t) => {
      let executedQueryCount = 0;
      const readinessCalls = [];
      const api = new AdminWebSocketAPI({
        nodeId: 'test-node',
        systemTableCache: createPopulatedCache(),
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{id: '1'}],
              count: 1,
            };
          },
        },
        controlPlaneReadinessService: {
          async getNodeReadiness(nodeId, options) {
            readinessCalls.push({nodeId, options});
            return {
              nodeId,
              dimensions: {
                routingReady: true,
                clusterMemberHealthy: true,
                repairEligible: true,
                serveEligible: true,
                loadReady: true,
              },
              reasons: [],
            };
          },
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-lane-authoritative-refresh',
        sql: 'SELECT 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.error, undefined,
        'authoritative readiness refresh should admit the load-lane query');
      t.equal(executedQueryCount, 1,
        'admitted load-lane query should execute once');
      t.same(
        readinessCalls,
        [{
          nodeId: 'test-node',
          options: {
            allowAuthoritativeRefresh: true,
            requireFreshOnIneligible: true,
            decisionDimension: 'serveEligible',
            maxCachedAgeMs: 5000,
          },
        }],
        'load-lane admission should request fresh authoritative serve proof ' +
          'before rejecting cached ineligible readiness',
      );

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane requires fresh serve proof before ' +
    'rejecting a cached ineligible snapshot', async (t) => {
    let executedQueryCount = 0;
    const readinessCalls = [];
    const blockedReadiness = {
      nodeId: 'test-node',
      dimensions: {
        routingReady: true,
        clusterMemberHealthy: true,
        repairEligible: true,
        serveEligible: false,
        loadReady: false,
      },
      reasons: [
        {code: 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'},
      ],
    };
    const admittedReadiness = {
      nodeId: 'test-node',
      dimensions: {
        routingReady: true,
        clusterMemberHealthy: true,
        repairEligible: true,
        serveEligible: true,
        loadReady: true,
      },
      reasons: [],
    };
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: '1'}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return blockedReadiness;
        },
        async getNodeReadiness(nodeId, options) {
          readinessCalls.push({nodeId, options});
          return options.requireFreshOnIneligible === true ?
            admittedReadiness :
            blockedReadiness;
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-fresh-ineligible-proof',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.error, undefined,
      'fresh serve proof should admit the load-lane query');
    t.equal(executedQueryCount, 1,
      'fresh serve proof should allow SQL execution');
    t.same(
      readinessCalls,
      [{
        nodeId: 'test-node',
        options: {
          allowAuthoritativeRefresh: true,
          requireFreshOnIneligible: true,
          decisionDimension: 'serveEligible',
          maxCachedAgeMs: 5000,
        },
      }],
      'load-lane serve gating should require a fresh owner read before ' +
        'rejecting cached ineligible readiness',
    );

    ws.close();
    await api.shutdown();
  });

  test('AdminWebSocketAPI - repeated load lane requests reuse cached readiness',
    async (t) => {
      let executedQueryCount = 0;
      const readinessCalls = [];
      const api = new AdminWebSocketAPI({
        nodeId: 'test-node',
        systemTableCache: createPopulatedCache(),
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{id: String(executedQueryCount)}],
              count: 1,
            };
          },
        },
        controlPlaneReadinessService: {
          async getNodeReadiness(nodeId, options) {
            readinessCalls.push({nodeId, options});
            return {
              nodeId,
              dimensions: {
                routingReady: true,
                clusterMemberHealthy: true,
                repairEligible: true,
                serveEligible: true,
                loadReady: true,
              },
              reasons: [],
            };
          },
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-lane-cached-readiness-1',
        sql: 'SELECT 1',
      }));
      const firstResult = await waitForMessage(ws);
      t.equal(firstResult.type, MessageType.QUERY_RESULT);

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-lane-cached-readiness-2',
        sql: 'SELECT 2',
      }));
      const secondResult = await waitForMessage(ws);
      t.equal(secondResult.type, MessageType.QUERY_RESULT);

      t.equal(executedQueryCount, 2, 'both load queries should execute');
      t.same(
        readinessCalls,
        [{
          nodeId: 'test-node',
          options: {
            allowAuthoritativeRefresh: true,
            requireFreshOnIneligible: true,
            decisionDimension: 'serveEligible',
            maxCachedAgeMs: 5000,
          },
        }, {
          nodeId: 'test-node',
          options: {
            allowAuthoritativeRefresh: true,
            requireFreshOnIneligible: true,
            decisionDimension: 'serveEligible',
            maxCachedAgeMs: 5000,
          },
        }],
        'load-lane readiness should consistently request the ' +
          'fresh-on-ineligible snapshot window',
      );

      ws.close();
      await api.shutdown();
    });
}
