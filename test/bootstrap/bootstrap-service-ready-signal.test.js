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
    service.seedCacheHydrationPhase.waitForReadyNodeInCache =
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
    t.equal(service.messageGroupServiceEndpointsPublished, true,
      'seed registration should still complete after local query transport readiness is satisfied');
  });

test('BootstrapService waits for lifecycle traffic readiness before starting steady-state control-plane writers',
  async (t) => {
    initializeTestEnvironment();

    let trafficReady = false;
    const sleepDelays = [];
    let leaseStarts = 0;
    let heartbeatStarts = 0;

    const service = new BootstrapService({
      nodeId: 'seed-background-writer-gate',
      nodeAddress: 'ws://localhost:19094',
    });
    service.bootstrapReadinessState = {
      getSnapshot() {
        return trafficReady ?
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
            phase: 'JOIN_READY',
            state: 'warming',
            reasons: ['READINESS_STABLE_WINDOW_PENDING'],
            retryAfterMs: 1,
            stableWindowMs: 1,
            stableElapsedMs: 0,
          };
      },
    };
    service.sleep = async (delayMs) => {
      sleepDelays.push(delayMs);
      trafficReady = true;
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
      'steady-state writers should wait through the lifecycle stable window');
    t.equal(leaseStarts, 1,
      'lease writer should start once lifecycle traffic readiness is satisfied');
    t.equal(heartbeatStarts, 1,
      'heartbeat writer should start once lifecycle traffic readiness is satisfied');
  });
