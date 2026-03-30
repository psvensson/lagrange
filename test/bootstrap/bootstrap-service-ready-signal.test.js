import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {NodeStorageBudgetSetup} from '../../src/bootstrap/shared/node-storage-budget-setup.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('BootstrapService waits for local query transport readiness before publishing the seed ready heartbeat',
  async (t) => {
    initializeTestEnvironment();

    let transportReady = false;
    let heartbeatSent = 0;
    const sleepDelays = [];

    const service = new BootstrapService({
      nodeId: 'seed-ready-transport-gate',
      nodeAddress: 'ws://localhost:19092',
    });
    service.seedCacheHydrationPhase.waitForSystemServiceLeadersInCache =
      async () => {};
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return transportReady ?
          {ready: true, state: 'ready'} :
          {
            ready: false,
            state: 'deferred',
            reason: 'Query/data-plane message-group transport is not configured',
            retryAfterMs: 1,
          };
      },
    };
    service.heartbeatService = {
      sendHeartbeat: async () => {
        heartbeatSent += 1;
      },
    };
    service.sleep = async (delayMs) => {
      sleepDelays.push(delayMs);
      transportReady = true;
    };

    const originalCreate = NodeStorageBudgetSetup.create;
    const originalResolveAndPersist = NodeStorageBudgetSetup.resolveAndPersist;
    const originalGetInstance = NodeService.getInstance;
    NodeStorageBudgetSetup.create = () => ({});
    NodeStorageBudgetSetup.resolveAndPersist = async () => ({
      resolution: {
        isValid: true,
        budgetBytes: 1024,
        source: 'test',
        diskBytes: 1024,
      },
    });
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.registerSeedNodeWithControlPlane();
    } finally {
      NodeStorageBudgetSetup.create = originalCreate;
      NodeStorageBudgetSetup.resolveAndPersist = originalResolveAndPersist;
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(heartbeatSent, 1,
      'seed ready heartbeat should be published once the local query transport becomes ready');
    t.same(sleepDelays, [1],
      'seed ready publication should back off before the first heartbeat when local query transport is deferred');
  });

test('BootstrapService waits for lifecycle metadata publication readiness before starting steady-state control-plane writers',
  async (t) => {
    initializeTestEnvironment();

    let metadataPublicationReady = false;
    const sleepDelays = [];
    let leaseStarts = 0;
    let heartbeatStarts = 0;
    let recoveryStarts = 0;

    const service = new BootstrapService({
      nodeId: 'seed-background-writer-gate',
      nodeAddress: 'ws://localhost:19094',
    });
    service.sqlQueryEngine = {
      activateDistributedTransactionRecovery() {
        recoveryStarts += 1;
      },
    };
    service.bootstrapReadinessState = {
      getSnapshot() {
        return metadataPublicationReady ?
          {
            ready: true,
            phase: 'TRAFFIC_READY',
            state: 'join_ready',
            reasons: [],
            retryAfterMs: 0,
            stableWindowMs: 1,
            stableElapsedMs: 1,
          } :
          {
            ready: false,
            phase: 'DISCOVERING',
            state: 'discovering',
            reasons: ['local_query_transport_not_ready'],
            retryAfterMs: 1,
            stableWindowMs: 1,
            stableElapsedMs: 0,
          };
      },
    };
    service.sleep = async (delayMs) => {
      sleepDelays.push(delayMs);
      metadataPublicationReady = true;
    };
    service.leaseService = {
      start() {
        leaseStarts += 1;
      },
    };
    service.heartbeatService = {
      start() {
        heartbeatStarts += 1;
      },
    };

    await service.activateControlPlaneBackgroundWriters();

    t.same(sleepDelays, [1],
      'steady-state writers should wait until metadata publication readiness is satisfied');
    t.equal(leaseStarts, 1,
      'lease writer should start once lifecycle metadata publication readiness is satisfied');
    t.equal(heartbeatStarts, 1,
      'heartbeat writer should start once lifecycle metadata publication readiness is satisfied');
    t.equal(recoveryStarts, 1,
      'deferred transaction recovery should arm once steady-state writers become active');
  });

test('BootstrapService does not start deferred steady-state writers after shutdown begins',
  async (t) => {
    initializeTestEnvironment();

    let metadataPublicationReady = false;
    let leaseStarts = 0;
    let heartbeatStarts = 0;
    let recoveryStarts = 0;

    const service = new BootstrapService({
      nodeId: 'seed-background-writer-shutdown-race',
      nodeAddress: 'ws://localhost:19095',
    });
    service.sqlQueryEngine = {
      activateDistributedTransactionRecovery() {
        recoveryStarts += 1;
      },
    };
    service.bootstrapReadinessState = {
      getSnapshot() {
        return metadataPublicationReady ?
          {
            ready: true,
            phase: 'TRAFFIC_READY',
            state: 'join_ready',
            reasons: [],
            retryAfterMs: 0,
            stableWindowMs: 1,
            stableElapsedMs: 1,
          } :
          {
            ready: false,
            phase: 'DISCOVERING',
            state: 'discovering',
            reasons: ['local_query_transport_not_ready'],
            retryAfterMs: 1,
            stableWindowMs: 1,
            stableElapsedMs: 0,
          };
      },
    };
    service.sleep = async () => {
      service.isShuttingDown = true;
      metadataPublicationReady = true;
    };
    service.leaseService = {
      start() {
        leaseStarts += 1;
      },
    };
    service.heartbeatService = {
      start() {
        heartbeatStarts += 1;
      },
    };

    await service.activateControlPlaneBackgroundWriters();

    t.equal(leaseStarts, 0,
      'lease writer should not start once shutdown has begun');
    t.equal(heartbeatStarts, 0,
      'heartbeat writer should not start once shutdown has begun');
    t.equal(recoveryStarts, 0,
      'deferred recovery should not start once shutdown has begun');
  });

test('BootstrapService cancels deferred latency topology startup when shutdown begins',
  async (t) => {
    initializeTestEnvironment();

    const service = new BootstrapService({
      nodeId: 'seed-latency-topology-shutdown-race',
      nodeAddress: 'ws://localhost:19096',
    });

    let topologyStarts = 0;
    service.seedCacheHydrationPhase.startLatencyTopologyLifecycle = () => {
      topologyStarts += 1;
    };

    service.deferredLatencyTopologyStartKind = 'timeout';
    service.deferredLatencyTopologyStartHandle = setTimeout(() => {
      service.seedCacheHydrationPhase.startLatencyTopologyLifecycle();
    }, 50);

    await service.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 80));

    t.equal(topologyStarts, 0,
      'deferred latency topology startup should not run after shutdown begins');
  });

test('BootstrapService shutdown gates already-queued deferred latency topology startup',
  async (t) => {
    initializeTestEnvironment();

    const service = new BootstrapService({
      nodeId: 'seed-latency-topology-immediate-shutdown-race',
      nodeAddress: 'ws://localhost:19098',
    });

    let topologyStarts = 0;
    service.seedCacheHydrationPhase.startLatencyTopologyLifecycle = () => {
      topologyStarts += 1;
    };

    service.deferredLatencyTopologyStartKind = 'immediate';
    service.deferredLatencyTopologyStartHandle = setImmediate(() => {
      service.deferredLatencyTopologyStartHandle = null;
      service.deferredLatencyTopologyStartKind = null;
      if (service.isShuttingDown === true) {
        return;
      }
      service.seedCacheHydrationPhase.startLatencyTopologyLifecycle();
    });

    await service.shutdown();

    t.equal(topologyStarts, 0,
      'already-queued deferred topology startup should observe shutdown gating');
  });

test('BootstrapService shutdown tears down runtime service handler before infrastructure cleanup',
  async (t) => {
    initializeTestEnvironment();

    const service = new BootstrapService({
      nodeId: 'seed-runtime-handler-shutdown',
      nodeAddress: 'ws://localhost:19097',
    });

    const callOrder = [];
    service.runtimeServiceHandler = {
      unregisterFromRouter: () => {
        callOrder.push('runtime-handler-unregister');
      },
      shutdown: async () => {
        callOrder.push('runtime-handler-shutdown');
      },
    };
    service.messageRouter = {
      unregister() {},
      shutdown: async () => {
        callOrder.push('message-router-shutdown');
      },
    };
    service.transport = service.messageRouter;

    await service.shutdown();

    t.same(callOrder, [
      'runtime-handler-unregister',
      'runtime-handler-shutdown',
      'message-router-shutdown',
    ],
    'shutdown should unregister and stop the runtime handler before router shutdown');
    t.equal(service.runtimeServiceHandler, null,
      'shutdown should clear the runtime service handler reference');
  });
