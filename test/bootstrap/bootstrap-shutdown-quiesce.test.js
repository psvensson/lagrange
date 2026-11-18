import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';

function createSilentLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

test('BootstrapService cleanup quiesces rebalancers before service shutdown', async (t) => {
  const callOrder = [];
  const service = new BootstrapService({
    bootIncarnation: 1,
    nodeId: 'test-node',
    nodeAddress: 'localhost:8080',
  });

  service.logger = createSilentLogger();
  service.messageRouter = {
    unregister: () => {},
    shutdown: async () => {},
  };
  service.transport = service.messageRouter;
  service.replicaHandler = {
    unregisterFromRouter: () => {},
    shutdown: () => {},
  };

  service.rebalanceCoordinator = {
    shutdown: async () => {
      callOrder.push('global-coordinator-shutdown');
    },
  };

  service.partitionServices = new Map([
    ['tables-p1-r1', {
      getUnifiedAddress: () => 'test-node/partition/tables-p1-r1',
      quiesceRebalancing: async () => {
        callOrder.push('partition-quiesce');
      },
      shutdown: async () => {
        callOrder.push('partition-shutdown');
      },
    }],
  ]);

  service.messageGroupServices = new Map([
    ['mg-1-r1', {
      quiesceRebalancing: async () => {
        callOrder.push('message-group-quiesce');
      },
      shutdown: async () => {
        callOrder.push('message-group-shutdown');
      },
    }],
  ]);

  await service.seedCleanupHandler.cleanup();

  const partitionQuiesceIndex = callOrder.indexOf('partition-quiesce');
  const partitionShutdownIndex = callOrder.indexOf('partition-shutdown');
  const messageGroupQuiesceIndex = callOrder.indexOf('message-group-quiesce');
  const messageGroupShutdownIndex = callOrder.indexOf('message-group-shutdown');

  t.ok(
    partitionQuiesceIndex >= 0,
    'cleanup should quiesce partition rebalancers',
  );
  t.ok(
    messageGroupQuiesceIndex >= 0,
    'cleanup should quiesce message-group rebalancers',
  );
  t.ok(
    partitionShutdownIndex > partitionQuiesceIndex,
    'partition shutdown should run after partition quiesce',
  );
  t.ok(
    messageGroupShutdownIndex > messageGroupQuiesceIndex,
    'message-group shutdown should run after message-group quiesce',
  );
});

test('BootstrapService shutdown retries rejected cleanup and joins each in-flight attempt',
  async (t) => {
    const service = new BootstrapService({
      bootIncarnation: 1,
      nodeId: 'shutdown-retry-node',
      nodeAddress: 'localhost:8080',
    });
    service.logger = createSilentLogger();
    const failure = new Error('retained native cleanup is still pending');
    const first = Promise.withResolvers();
    const entered = Promise.withResolvers();
    let cleanupCalls = 0;
    service.seedCleanupHandler.cleanup = async () => {
      cleanupCalls += 1;
      entered.resolve();
      if (cleanupCalls === 1) await first.promise;
    };

    const initial = service.shutdown();
    const joined = service.shutdown();
    const settled = Promise.allSettled([initial, joined]);
    await entered.promise;
    t.equal(cleanupCalls, 1, 'concurrent callers join the current cleanup');
    first.reject(failure);
    const rejected = await settled;
    t.same(rejected.map((result) => result.status), ['rejected', 'rejected']);
    t.equal(rejected[0].reason, failure, 'the original cleanup failure is retained');
    t.equal(rejected[1].reason, failure, 'joined caller observes the same failure');
    t.equal(service.isShuttingDown, true, 'a failed release never reopens the owner');

    let retryFailure = null;
    try {
      await service.shutdown();
    } catch (error) {
      retryFailure = error;
    }
    t.equal(retryFailure, null, 'a new shutdown re-enters the retained cleanup owner');
    t.equal(cleanupCalls, 2, 'retry performs the outstanding cleanup');
    if (retryFailure === null) {
      await service.shutdown();
      t.equal(cleanupCalls, 2, 'completed cleanup remains idempotent');
    }
  });

test('Bootstrap cleanup retains a replacement installed while an exact old close settles',
  async (t) => {
    const service = new BootstrapService({
      bootIncarnation: 1,
      nodeId: 'cleanup-identity-node',
      nodeAddress: 'localhost:8080',
    });
    service.logger = createSilentLogger();
    const close = Promise.withResolvers();
    const entered = Promise.withResolvers();
    let successorCloses = 0;
    const old = {async shutdown() {
      entered.resolve();
      await close.promise;
    }};
    const successor = {async shutdown() {
      successorCloses += 1;
    }};
    const services = new Map([['same-id', old]]);
    const options = {logger: service.logger, services,
      successLogMessage: 'closed exact object', failureLogMessage: 'close pending'};
    const attempt = service.seedCleanupHandler.shutdownServiceMap(options);
    const result = Promise.allSettled([attempt]);
    await entered.promise;
    services.set('same-id', successor);
    close.resolve();
    const [settlement] = await result;
    t.equal(services.get('same-id'), successor,
      'late old completion cannot discard the successor object');
    t.equal(successorCloses, 0, 'the old close does not select a successor');
    t.equal(settlement.status, 'rejected',
      'remaining owned services cannot be reported as fully released');
    await service.seedCleanupHandler.shutdownServiceMap(options);
    t.equal(successorCloses, 1, 'a new cleanup attempt owns the current object');
    t.equal(services.size, 0, 'successful release discharges the exact object');
  });

test('Bootstrap SQL cleanup retains all exact engine references on rejection and retries',
  async (t) => {
    const service = new BootstrapService({
      bootIncarnation: 1,
      nodeId: 'sql-cleanup-retry-node',
      nodeAddress: 'localhost:8080',
    });
    service.logger = createSilentLogger();
    const failure = new Error('SQL shutdown still pending');
    const calls = [];
    let rejectShutdown = true;
    const engine = {async shutdown() {
      calls.push('engine');
      if (rejectShutdown) throw failure;
    }};
    const cdc = {sqlQueryEngine: engine, markShuttingDown() {
      calls.push('cdc');
    }};
    service.sqlQueryEngine = engine;
    service.seedRuntimeBridgeOwner.sqlQueryEngine = engine;
    service.cdcIntegrationService = cdc;
    const cleanup = service.seedCleanupHandler;
    await assert.rejects(cleanup.shutdownSqlQueryEngine(cleanup.delegates),
      (error) => error === failure);
    t.equal(service.sqlQueryEngine, engine);
    t.equal(service.seedRuntimeBridgeOwner.sqlQueryEngine, engine);
    t.equal(cdc.sqlQueryEngine, engine);
    rejectShutdown = false;
    await cleanup.shutdownSqlQueryEngine(cleanup.delegates);
    t.same(calls, ['cdc', 'engine', 'cdc', 'engine'],
      'each attempt marks CDC before the same engine shutdown');
    t.equal(service.sqlQueryEngine, null, 'successful shutdown releases bootstrap reference');
    t.equal(service.seedRuntimeBridgeOwner.sqlQueryEngine, null,
      'successful shutdown releases the acquisition owner cache');
    t.equal(cdc.sqlQueryEngine, null, 'successful shutdown releases the captured CDC reference');
  });

test('Bootstrap SQL cleanup cannot clear a replacement engine after an old shutdown',
  async (t) => {
    const service = new BootstrapService({
      bootIncarnation: 1,
      nodeId: 'sql-cleanup-identity-node',
      nodeAddress: 'localhost:8080',
    });
    service.logger = createSilentLogger();
    const entered = Promise.withResolvers();
    const settle = Promise.withResolvers();
    let successorShutdowns = 0;
    const old = {async shutdown() {
      entered.resolve();
      await settle.promise;
    }};
    const successor = {async shutdown() {
      successorShutdowns += 1;
    }};
    const cdc = {sqlQueryEngine: old, markShuttingDown() {}};
    service.sqlQueryEngine = old;
    service.seedRuntimeBridgeOwner.sqlQueryEngine = old;
    service.cdcIntegrationService = cdc;
    const cleanup = service.seedCleanupHandler;
    const attempt = cleanup.shutdownSqlQueryEngine(cleanup.delegates);
    await entered.promise;
    service.sqlQueryEngine = successor;
    service.seedRuntimeBridgeOwner.sqlQueryEngine = successor;
    cdc.sqlQueryEngine = successor;
    settle.resolve();
    await attempt;
    t.equal(service.sqlQueryEngine, successor);
    t.equal(service.seedRuntimeBridgeOwner.sqlQueryEngine, successor);
    t.equal(cdc.sqlQueryEngine, successor);
    t.equal(successorShutdowns, 0, 'the old attempt only shuts down its captured engine');
  });
