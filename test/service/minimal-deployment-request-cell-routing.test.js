import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RuntimeServiceHandler} from
  '../../src/node/runtime-service-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {HEALTH_STATUS} from '../../src/runtime/runtime-driver.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  RequestCellRoutingError,
} from '../../src/service/request-cell-routing-contract.js';
import {RequestCellHttpAdapter} from
  '../../src/service/request-cell-http-adapter.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  initializeTestEnvironment,
} from '../bootstrap/bootstrap-api-test-fixtures.js';
import {
  COMPONENT_RESPONSE,
  MemoryInvocationJournal,
  MutableSystemTableCache,
  SqliteInvocationJournal,
  createActualRow,
  createDeploymentRows,
  createRuntime,
} from './minimal-deployment-request-cell-routing-fixture.js';

const NODE_A = 'routing-node-a';
const NODE_B = 'routing-node-b';
const PORT_A = 14831;
const PORT_B = 14832;
const HANDLER_ADDRESS_B =
  `${NODE_B}/service/runtime-service-handler`;
const AUTHORIZATION = `Basic ${Buffer.from('ignored:ignored')
  .toString('base64')}`;
const REQUEST_HEADERS = Object.freeze({
  'authorization': AUTHORIZATION,
  'content-type': 'application/json',
});

function createHandler(nodeId, cache, runtime) {
  const handler = new RuntimeServiceHandler({
    cdcIntegrationService: {},
    nodeId,
    serviceLifecycleManager: {},
    serviceRuntimeLifecycle: runtime.lifecycle,
    systemTableCache: cache,
  });
  handler.initialize();
  handler.localReplicas.set(runtime.replicaHandle.replicaId, {
    entityId: runtime.replicaHandle.entityId,
    replicaHandle: runtime.replicaHandle,
    replicaId: runtime.replicaHandle.replicaId,
    status: ReplicaStatus.ACTIVE,
  });
  return handler;
}

async function startRuntime(runtime) {
  await runtime.lifecycle.prepare(runtime.replicaHandle, {});
  await runtime.lifecycle.start(runtime.replicaHandle);
}

function requestOptions(idempotencyKey, overrides = {}) {
  return {
    headers: {
      ...REQUEST_HEADERS,
      'idempotency-key': idempotencyKey,
      ...overrides.headers,
    },
    method: overrides.method || 'POST',
    payload: overrides.payload || {value: 7},
    url: overrides.url || '/cell',
  };
}

function parseFailure(response) {
  return JSON.parse(response.body);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(condition, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await delay(10);
  }
  assert.fail(message);
}

describe('minimal deployment request Cell routing', () => {
  test('aborts and drains a held dispatch before shutdown returns',
    async () => {
      let dispatchAttempts = 0;
      let dispatchSignal = null;
      let observeDispatch;
      let releaseDispatch;
      const dispatchEntered = new Promise((resolve) => {
        observeDispatch = resolve;
      });
      const dispatchGate = new Promise((resolve) => {
        releaseDispatch = resolve;
      });
      const adapter = new RequestCellHttpAdapter({
        authenticateRequest: async () => ({
          principal: 'app-user',
          roles: ['application'],
          tenantId: 'tenant-a',
        }),
        routeResolver: {
          resolve() {
            return {
              bindingVersionId: 'binding-v1',
              replicaId: 'replica-a',
              serviceId: 'service-a',
              targetAddress: 'node-a/service/runtime-service-handler',
              targetNodeId: 'node-a',
            };
          },
        },
        serviceDispatcher: {
          async dispatch(_envelope, context) {
            dispatchAttempts += 1;
            dispatchSignal = context.signal;
            observeDispatch();
            return dispatchGate;
          },
        },
      });
      const invocation = adapter.invoke({
        headers: {'idempotency-key': 'held-shutdown'},
        method: 'POST',
        query: {},
        url: '/cell',
      });
      const observedInvocation = invocation.then(
        () => ({status: 'fulfilled'}),
        (error) => ({error, status: 'rejected'}),
      );

      await dispatchEntered;
      assert.deepEqual(
        adapter.getDiagnostics(),
        {
          activeRequests: 1,
          inFlight: 1,
          inFlightByTarget: {'node-a': 1},
          shuttingDown: false,
        },
      );
      await adapter.shutdown();
      const outcome = await observedInvocation;
      assert.equal(outcome.status, 'rejected');
      assert.equal(
        outcome.error.code,
        REQUEST_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN,
      );
      assert.equal(outcome.error.classification, 'ambiguous');
      assert.equal(outcome.error.invoked, true);
      assert.equal(dispatchSignal.aborted, true);
      assert.equal(dispatchAttempts, 1);
      assert.deepEqual(
        adapter.getDiagnostics(),
        {
          activeRequests: 0,
          inFlight: 0,
          inFlightByTarget: {},
          shuttingDown: true,
        },
      );
      await assert.rejects(
        adapter.invoke({
          headers: {'idempotency-key': 'after-shutdown'},
          method: 'POST',
          query: {},
          url: '/cell',
        }),
        (error) =>
          error.code === REQUEST_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN &&
          error.retryable === true &&
          error.invoked === false,
      );
      releaseDispatch({
        delivery: {
          componentResponse: COMPONENT_RESPONSE,
          processed: true,
        },
      });
    },
  );

  test('admits one component across concurrent durable-fence owners',
    async () => {
      initializeTestEnvironment();
      const rows = createDeploymentRows();
      const journal = new SqliteInvocationJournal();
      const runtimeA = createRuntime(
        rows,
        journal,
        `${rows.definition.service_id}-concurrent-owner-a`,
        NODE_A,
      );
      const runtimeB = createRuntime(
        rows,
        journal,
        `${rows.definition.service_id}-concurrent-owner-b`,
        NODE_B,
      );
      const invocation = {
        args: ['{}'],
        deadlineMs: Date.now() + 1_000,
        intentDigest: 'concurrent-owner-intent',
        invocationId: 'concurrent-owner-invocation',
        invocationServiceId: rows.definition.service_id,
        tenantId: 'tenant-a',
      };
      try {
        assert.match(
          journal.getIdentityIndexSql(),
          /^CREATE UNIQUE INDEX /,
        );
        assert.match(
          journal.getLegacyIdentityIndexSql(),
          /^CREATE INDEX /,
        );
        await startRuntime(runtimeA);
        await startRuntime(runtimeB);
        const outcomes = await Promise.allSettled([
          runtimeA.lifecycle.invoke(runtimeA.replicaHandle, invocation),
          runtimeB.lifecycle.invoke(runtimeB.replicaHandle, invocation),
        ]);
        assert.equal(
          runtimeA.componentInvocationCount +
            runtimeB.componentInvocationCount,
          1,
        );
        const insertOperationIds = journal.getInsertOperationIds();
        assert.equal(insertOperationIds.length, 2);
        assert.equal(new Set(insertOperationIds).size, 1);
        assert.match(
          insertOperationIds[0],
          /^request-cell-operation-[a-f0-9]{64}$/,
        );
        assert.ok(
          outcomes.some((outcome) => outcome.status === 'fulfilled'),
        );
        const replay = await runtimeB.lifecycle.invoke(
          runtimeB.replicaHandle,
          invocation,
        );
        assert.equal(replay.journaled, true);
        assert.equal(
          runtimeA.componentInvocationCount +
            runtimeB.componentInvocationCount,
          1,
        );
      } finally {
        await runtimeA.lifecycle.stop(runtimeA.replicaHandle)
          .catch(() => {});
        await runtimeB.lifecycle.stop(runtimeB.replicaHandle)
          .catch(() => {});
        journal.close();
      }
    },
  );

  test('does not repeat a component after completion persistence fails',
    async () => {
      initializeTestEnvironment();
      const rows = createDeploymentRows();
      const journal = new MemoryInvocationJournal();
      const runtime = createRuntime(
        rows,
        journal,
        `${rows.definition.service_id}-completion-failure`,
        NODE_A,
      );
      const invocation = {
        args: ['{}'],
        deadlineMs: Date.now() + 1_000,
        intentDigest: 'completion-failure-intent',
        invocationId: 'completion-failure-invocation',
        invocationServiceId: rows.definition.service_id,
        tenantId: 'tenant-a',
      };
      try {
        await startRuntime(runtime);
        journal.failNextCompletion();
        await assert.rejects(
          runtime.lifecycle.invoke(runtime.replicaHandle, invocation),
          (error) =>
            error instanceof RequestCellRoutingError &&
            error.code ===
              REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS &&
            error.classification ===
              REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS &&
            error.invoked === true,
        );
        assert.equal(runtime.componentInvocationCount, 1);
        await assert.rejects(
          runtime.lifecycle.invoke(runtime.replicaHandle, invocation),
          (error) =>
            error instanceof RequestCellRoutingError &&
            error.code ===
              REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
        );
        assert.equal(runtime.componentInvocationCount, 1);
      } finally {
        await runtime.lifecycle.stop(runtime.replicaHandle)
          .catch(() => {});
      }
    },
  );

  test('preserves a ready Cell when the final target check observes handoff',
    async () => {
      initializeTestEnvironment();
      const rows = createDeploymentRows();
      const journal = new MemoryInvocationJournal();
      const replicaId = `${rows.definition.service_id}-late-handoff`;
      const runtime = createRuntime(
        rows,
        journal,
        replicaId,
        NODE_A,
      );
      let targetChecks = 0;
      try {
        await startRuntime(runtime);
        await assert.rejects(
          runtime.lifecycle.invoke(runtime.replicaHandle, {
            args: ['{}'],
            assertCurrentTarget: () => {
              targetChecks += 1;
              if (targetChecks < 2) return;
              throw new RequestCellRoutingError(
                REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
                'target moved during final component admission',
                {
                  classification:
                    REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
                  preserveReplicaState: true,
                },
              );
            },
            deadlineMs: Date.now() + 1_000,
            intentDigest: 'late-handoff-intent',
            invocationId: 'late-handoff-invocation',
            invocationServiceId: rows.definition.service_id,
            tenantId: 'tenant-a',
          }),
          (error) =>
            error instanceof RequestCellRoutingError &&
            error.code === REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE &&
            error.retryable === true,
        );
        assert.equal(targetChecks, 2);
        assert.equal(
          (await runtime.lifecycle.health(runtime.replicaHandle)).status,
          HEALTH_STATUS.HEALTHY,
        );
        const subsequent = await runtime.lifecycle.invoke(
          runtime.replicaHandle,
          {
            args: ['{}'],
            deadlineMs: Date.now() + 1_000,
            intentDigest: 'late-handoff-intent',
            invocationId: 'late-handoff-invocation',
            invocationServiceId: rows.definition.service_id,
            tenantId: 'tenant-a',
          },
        );
        assert.equal(subsequent.journaled, true);
      } finally {
        await runtime.lifecycle.stop(runtime.replicaHandle)
          .catch(() => {});
      }
    },
  );

  test('routes genuine HTTP responses before and after handoff with fences',
    async () => {
      initializeTestEnvironment();
      const rows = createDeploymentRows();
      const cache = new MutableSystemTableCache(rows);
      const journal = new MemoryInvocationJournal();
      const replicaA = `${rows.definition.service_id}-r1`;
      const replicaB = `${rows.definition.service_id}-r2`;
      const runtimeA = createRuntime(
        rows, journal, replicaA, NODE_A,
      );
      const runtimeB = createRuntime(
        rows, journal, replicaB, NODE_B,
      );
      const routerA = new MessageRouter({
        inProcess: true,
        nodeId: NODE_A,
        wsPort: PORT_A,
      });
      const routerB = new MessageRouter({
        inProcess: true,
        nodeId: NODE_B,
        wsPort: PORT_B,
      });
      let handlerA = null;
      let handlerB = null;
      let api = null;

      try {
        await startRuntime(runtimeA);
        await startRuntime(runtimeB);
        cache.set(
          SYSTEM_TABLE_NAME.SERVICES,
          replicaA,
          createActualRow(rows.definition, replicaA, NODE_A),
        );
        handlerA = createHandler(NODE_A, cache, runtimeA);
        handlerB = createHandler(NODE_B, cache, runtimeB);
        await routerA.initialize({startServer: true});
        await routerB.initialize({startServer: true});
        handlerA.registerWithRouter(routerA);
        handlerB.registerWithRouter(routerB);
        await routerA.connectToNode(
          NODE_B,
          `ws://localhost:${PORT_B}`,
          {autoReconnect: false},
        );

        api = new BootstrapAPI({
          messageRouter: routerA,
          requestCellAuthenticateRequest: async () => ({
            principal: 'app-user',
            roles: ['application'],
            tenantId: 'tenant-a',
          }),
          requestCellDeadlineMs: 1_000,
          requestCellMaxAttempts: 2,
          seedNodeAddress: 'http://routing-node-a',
          seedNodeId: NODE_A,
          systemTableCache: cache,
        });
        await api.initialize(0, {listen: false});

        const before = await api.getFastify().inject(
          requestOptions('before-handoff'),
        );
        assert.equal(
          before.statusCode,
          COMPONENT_RESPONSE.status,
          before.body,
        );
        assert.equal(before.body, COMPONENT_RESPONSE.body);
        assert.equal(
          before.headers['x-cell-source'],
          'component',
        );
        assert.equal(runtimeA.componentInvocationCount, 1);
        assert.equal(runtimeB.componentInvocationCount, 0);

        let releaseHealth;
        let observeHealth;
        const healthEntered = new Promise(
          (resolve) => {
            observeHealth = resolve;
          },
        );
        const healthGate = new Promise(
          (resolve) => {
            releaseHealth = resolve;
          },
        );
        const originalHealthA = runtimeA.lifecycle.health.bind(
          runtimeA.lifecycle,
        );
        runtimeA.lifecycle.health = async (...args) => {
          observeHealth();
          await healthGate;
          return originalHealthA(...args);
        };

        const handoffRequest = api.getFastify().inject(
          requestOptions('during-handoff'),
        );
        await healthEntered;
        cache.delete(SYSTEM_TABLE_NAME.SERVICES, replicaA);
        cache.set(
          SYSTEM_TABLE_NAME.SERVICES,
          replicaB,
          createActualRow(rows.definition, replicaB, NODE_B),
        );
        releaseHealth();
        const after = await handoffRequest;
        runtimeA.lifecycle.health = originalHealthA;

        assert.equal(after.statusCode, COMPONENT_RESPONSE.status);
        assert.equal(after.body, COMPONENT_RESPONSE.body);
        assert.equal(runtimeA.componentInvocationCount, 1);
        assert.equal(runtimeB.componentInvocationCount, 1);

        const replay = await api.getFastify().inject(
          requestOptions('during-handoff'),
        );
        assert.equal(replay.statusCode, COMPONENT_RESPONSE.status);
        assert.equal(runtimeB.componentInvocationCount, 1);

        const conflict = await api.getFastify().inject(
          requestOptions('during-handoff', {
            payload: {value: 8},
          }),
        );
        assert.equal(conflict.statusCode, 409);
        assert.equal(
          parseFailure(conflict).code,
          REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
        );
        assert.equal(runtimeB.componentInvocationCount, 1);

        const unmatched = await api.getFastify().inject(
          requestOptions('unmatched', {url: '/missing'}),
        );
        assert.equal(unmatched.statusCode, 404);
        assert.equal(
          parseFailure(unmatched).code,
          REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND,
        );
        assert.equal(runtimeB.componentInvocationCount, 1);

        const secondRows = createDeploymentRows({
          createdAt: 2,
          name: 'routing-cell-ambiguous',
        });
        cache.set(
          SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
          secondRows.bindingRow.binding_version_id,
          secondRows.bindingRow,
        );
        const ambiguous = await api.getFastify().inject(
          requestOptions('ambiguous'),
        );
        assert.equal(ambiguous.statusCode, 409);
        assert.equal(
          parseFailure(ambiguous).code,
          REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_AMBIGUOUS,
        );
        assert.equal(runtimeB.componentInvocationCount, 1);
        cache.delete(
          SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
          secondRows.bindingRow.binding_version_id,
        );

        const authority = await api.getFastify().inject(
          requestOptions('authority', {
            headers: {'x-target-node-id': NODE_A},
          }),
        );
        assert.equal(authority.statusCode, 400);
        assert.equal(
          parseFailure(authority).code,
          REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORITY_FIELD_REJECTED,
        );
        assert.equal(runtimeB.componentInvocationCount, 1);

        const concurrentBefore = runtimeB.componentInvocationCount;
        const concurrent = await Promise.all([
          api.getFastify().inject(requestOptions('concurrent')),
          api.getFastify().inject(requestOptions('concurrent')),
        ]);
        assert.deepEqual(
          concurrent.map((response) => response.statusCode),
          [201, 201],
        );
        assert.equal(
          runtimeB.componentInvocationCount,
          concurrentBefore + 1,
        );

        const originalHandlerB =
          routerB.handlers.get(HANDLER_ADDRESS_B);
        routerB.register(
          HANDLER_ADDRESS_B,
          async (envelope) => {
            const response = await originalHandlerB(envelope);
            await delay(1_100);
            return response;
          },
        );
        const lateBefore = runtimeB.componentInvocationCount;
        const late = await api.getFastify().inject(
          requestOptions('late-response'),
        );
        assert.equal(late.statusCode, 502);
        assert.equal(
          parseFailure(late).classification,
          'ambiguous',
        );
        assert.equal(
          runtimeB.componentInvocationCount,
          lateBefore + 1,
        );
        await delay(150);
        routerB.register(HANDLER_ADDRESS_B, originalHandlerB);
        const lateReplay = await api.getFastify().inject(
          requestOptions('late-response'),
        );
        assert.equal(lateReplay.statusCode, 201);
        assert.equal(
          runtimeB.componentInvocationCount,
          lateBefore + 1,
        );

        routerB.register(
          HANDLER_ADDRESS_B,
          async () => ({acknowledged: true}),
        );
        const ackOnly = await api.getFastify().inject(
          requestOptions('ack-only'),
        );
        assert.equal(ackOnly.statusCode, 502);
        assert.equal(
          parseFailure(ackOnly).code,
          REQUEST_CELL_ROUTE_ERROR_CODE.ACK_ONLY,
        );
        assert.equal(
          runtimeB.componentInvocationCount,
          lateBefore + 1,
        );
        routerB.register(HANDLER_ADDRESS_B, originalHandlerB);

        routerB.unregister(HANDLER_ADDRESS_B);
        const noHandler = await api.getFastify().inject(
          requestOptions('no-handler'),
        );
        assert.equal(noHandler.statusCode, 503);
        assert.equal(
          parseFailure(noHandler).code,
          REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        );
        assert.equal(
          runtimeB.componentInvocationCount,
          lateBefore + 1,
        );
        routerB.register(HANDLER_ADDRESS_B, originalHandlerB);

        const adapter = api.requestCellHttpAdapter;
        const originalMaxInFlight = adapter._maxInFlight;
        adapter._maxInFlight = 1;
        let releaseOverload;
        let observeOverload;
        const overloadEntered = new Promise(
          (resolve) => {
            observeOverload = resolve;
          },
        );
        const overloadGate = new Promise(
          (resolve) => {
            releaseOverload = resolve;
          },
        );
        routerB.register(HANDLER_ADDRESS_B, async (envelope) => {
          observeOverload();
          await overloadGate;
          return originalHandlerB(envelope);
        });
        const admitted = api.getFastify().inject(
          requestOptions('overload-admitted'),
        );
        await overloadEntered;
        const overloaded = await api.getFastify().inject(
          requestOptions('overload-rejected'),
        );
        assert.equal(overloaded.statusCode, 429);
        assert.equal(
          parseFailure(overloaded).code,
          REQUEST_CELL_ROUTE_ERROR_CODE.OVERLOADED,
        );
        releaseOverload();
        assert.equal((await admitted).statusCode, 201);
        adapter._maxInFlight = originalMaxInFlight;
        routerB.register(HANDLER_ADDRESS_B, originalHandlerB);

        const restartSeed = await api.getFastify().inject(
          requestOptions('restart-replay'),
        );
        assert.equal(restartSeed.statusCode, 201);
        const restartBefore = runtimeB.componentInvocationCount;
        handlerB.unregisterFromRouter(routerB);
        handlerB.shutdown();
        await runtimeB.lifecycle.stop(runtimeB.replicaHandle);

        const restartedRuntime = createRuntime(
          rows, journal, replicaB, NODE_B,
        );
        await startRuntime(restartedRuntime);
        handlerB = createHandler(NODE_B, cache, restartedRuntime);
        handlerB.registerWithRouter(routerB);
        const restartedReplay = await api.getFastify().inject(
          requestOptions('restart-replay'),
        );
        assert.equal(restartedReplay.statusCode, 201);
        assert.equal(restartedRuntime.componentInvocationCount, 0);
        assert.equal(
          runtimeB.componentInvocationCount,
          restartBefore,
        );
        const postRestart = await api.getFastify().inject(
          requestOptions('post-restart'),
        );
        assert.equal(postRestart.statusCode, 201);
        assert.equal(restartedRuntime.componentInvocationCount, 1);

        const shutdownHandler =
          routerB.handlers.get(HANDLER_ADDRESS_B);
        let observeShutdownResponse;
        let releaseShutdownResponse;
        const shutdownResponseEntered = new Promise((resolve) => {
          observeShutdownResponse = resolve;
        });
        const shutdownResponseGate = new Promise((resolve) => {
          releaseShutdownResponse = resolve;
        });
        routerB.register(HANDLER_ADDRESS_B, async (envelope) => {
          const response = await shutdownHandler(envelope);
          observeShutdownResponse();
          await shutdownResponseGate;
          return response;
        });
        const shutdownBefore =
          restartedRuntime.componentInvocationCount;
        const shutdownRequest = api.getFastify().inject(
          requestOptions('shutdown-replay'),
        );
        await shutdownResponseEntered;
        assert.equal(
          restartedRuntime.componentInvocationCount,
          shutdownBefore + 1,
        );
        assert.equal(routerA.getStats().pendingResponses, 1);
        const shuttingDownAdapter = api.requestCellHttpAdapter;
        await api.shutdown();
        const shutdownResponse = await shutdownRequest;
        assert.equal(shutdownResponse.statusCode, 503);
        assert.equal(
          parseFailure(shutdownResponse).code,
          REQUEST_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN,
        );
        assert.equal(parseFailure(shutdownResponse).invoked, true);
        assert.deepEqual(
          shuttingDownAdapter.getDiagnostics(),
          {
            activeRequests: 0,
            inFlight: 0,
            inFlightByTarget: {},
            shuttingDown: true,
          },
        );
        assert.equal(routerA.getStats().pendingResponses, 0);
        releaseShutdownResponse();
        await waitForCondition(
          () =>
            routerA.getServiceResponseDispositionCounts()
              .late_after_cancelled === 1,
          'late shutdown response was not absorbed',
        );
        routerB.register(HANDLER_ADDRESS_B, shutdownHandler);

        api = new BootstrapAPI({
          messageRouter: routerA,
          requestCellAuthenticateRequest: async () => ({
            principal: 'app-user',
            roles: ['application'],
            tenantId: 'tenant-a',
          }),
          requestCellDeadlineMs: 1_000,
          requestCellMaxAttempts: 2,
          seedNodeAddress: 'http://routing-node-a',
          seedNodeId: NODE_A,
          systemTableCache: cache,
        });
        await api.initialize(0, {listen: false});
        const shutdownReplay = await api.getFastify().inject(
          requestOptions('shutdown-replay'),
        );
        assert.equal(shutdownReplay.statusCode, 201);
        assert.equal(
          restartedRuntime.componentInvocationCount,
          shutdownBefore + 1,
        );

        await restartedRuntime.lifecycle.stop(
          restartedRuntime.replicaHandle,
        );
        assert.deepEqual(
          api.requestCellHttpAdapter.getDiagnostics(),
          {
            activeRequests: 0,
            inFlight: 0,
            inFlightByTarget: {},
            shuttingDown: false,
          },
        );
      } finally {
        if (api) await api.shutdown().catch(() => {});
        handlerA?.unregisterFromRouter(routerA);
        handlerB?.unregisterFromRouter(routerB);
        handlerA?.shutdown();
        handlerB?.shutdown();
        await runtimeA.lifecycle.stop(runtimeA.replicaHandle)
          .catch(() => {});
        await runtimeB.lifecycle.stop(runtimeB.replicaHandle)
          .catch(() => {});
        await routerA.shutdown().catch(() => {});
        await routerB.shutdown().catch(() => {});
      }
    },
  );
});
