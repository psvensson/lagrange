import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {NodeStorageBudgetSetup} from '../../src/bootstrap/shared/node-storage-budget-setup.js';
import {
  attachSqlRuntimeToStartupOwner,
} from '../../src/bootstrap/shared/startup-sql-runtime-handoff.js';

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
    let capturedCapabilities = null;
    let capturedOptions = null;
    const sleepDelays = [];

    const service = new BootstrapService({
      bootIncarnation: 1,
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
      sendHeartbeat: async (_stats, capabilities, options) => {
        heartbeatSent += 1;
        capturedCapabilities = capabilities;
        capturedOptions = options;
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
      'seed registration heartbeat should be published once the local query transport becomes ready');
    t.same(capturedCapabilities, [
      'partition_replica',
      'message_group_replica',
    ], 'seed registration heartbeat publishes canonical node capabilities');
    t.same(capturedOptions, {
      requireDurableVisibility: true,
    }, 'seed registration heartbeat requires durable visibility without premature READY promotion');
    t.equal(service.seedReadyPublicationPending, true,
      'seed marks READY publication pending until runtime initialization completes');
    t.same(sleepDelays, [1],
      'seed registration publication should back off before the first heartbeat when local query transport is deferred');
  });

test('BootstrapService keeps seed JOINING during control-plane registration and promotes to READY only after runtime initialization',
  async (t) => {
    initializeTestEnvironment();

    const cachedRows = new Map();
    const systemTableCache = {
      get(tableName, key) {
        return tableName === 'nodes' ? cachedRows.get(key) || null : null;
      },
      filter(tableName) {
        if (tableName === 'service_endpoints') {
          return [{
            endpoint_id: 'ep-1',
            node_id: 'seed-ready-contract-node',
            boot_incarnation: 1,
          }];
        }
        return [];
      },
    };

    const service = new BootstrapService({
      bootIncarnation: 1,
      nodeId: 'seed-ready-contract-node',
      nodeAddress: 'ws://localhost:19093',
    });
    service.systemTableCache = systemTableCache;
    service.seedCacheHydrationPhase.waitForSystemServiceLeadersInCache =
      async () => {};
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {ready: true, state: 'ready'};
      },
    };

    const originalCreate = NodeStorageBudgetSetup.create;
    const originalResolveAndPersist = NodeStorageBudgetSetup.resolveAndPersist;
    const originalGetInstance = NodeService.getInstance;
    NodeStorageBudgetSetup.create = () => ({});
    NodeStorageBudgetSetup.resolveAndPersist = async ({nodeRow}) => {
      cachedRows.set(service.nodeId, {...nodeRow});
      return {
        resolution: {
          isValid: true,
          budgetBytes: 1024,
          source: 'test',
          diskBytes: 1024,
        },
      };
    };
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      // Step 1: Control-plane registration keeps the seed row in JOINING/CONNECTED
      // so no peer can observe READY before runtime initialization and external admission.
      service.heartbeatService = {
        sendHeartbeat: async (_stats, capabilities, options) => {
          if (options?.allowReadyPromotion === true && options?.requireDurableVisibility === true) {
            cachedRows.set(service.nodeId, {
              ...cachedRows.get(service.nodeId),
              status: 'active',
              connection_state: 'ready',
              capabilities: JSON.stringify(capabilities),
              ready_lease_expires_at: Date.now() + 30000,
            });
          }
        },
      };
      await service.registerSeedNodeWithControlPlane();
      const postRegistrationRow = systemTableCache.get('nodes', service.nodeId);
      t.equal(postRegistrationRow?.status, 'joining',
        'seed row remains JOINING after control-plane registration before runtime initialization');
      t.equal(postRegistrationRow?.connection_state, 'connected',
        'seed row remains CONNECTED after control-plane registration before runtime initialization');
      t.equal(service.seedReadyPublicationPending, true,
        'seedReadyPublicationPending is armed after control-plane registration');

      // Step 2: If publishSeedReadyWithControlPlane fails to promote the row to ACTIVE/READY,
      // the explicit READY completion contract rejects fail-closed.
      service.heartbeatService = {
        sendHeartbeat: async () => {},
      };
      await t.rejects(
        service.publishSeedReadyWithControlPlane(),
        /Seed bootstrap READY contract violated/,
        'publishSeedReadyWithControlPlane rejects when the seed row remains JOINING/CONNECTED in cache',
      );

      // Step 3: Verify full checkpoint ordering across CONTROL_PLANE_READY -> RUNTIME_READY -> FINALIZED:
      // status is still JOINING while initializeRuntimeServiceHandler and openExternalTransportAdmission run,
      // and transitions to ACTIVE/READY only at FINALIZED before bootstrap completes.
      cachedRows.clear();
      const observedStates = [];
      let externalAdmissionOpen = false;
      service.messageRouter = {
        getQueryDataPlaneTransportReadiness() {
          return {ready: true, state: 'ready'};
        },
        isExternalAdmissionEnabled() {
          return externalAdmissionOpen;
        },
        setExternalAdmissionEnabled(enabled) {
          externalAdmissionOpen = enabled === true;
        },
      };
      service.heartbeatService = {
        sendHeartbeat: async (_stats, capabilities, options) => {
          if (options?.allowReadyPromotion === true && options?.requireDurableVisibility === true) {
            cachedRows.set(service.nodeId, {
              ...cachedRows.get(service.nodeId),
              status: 'active',
              connection_state: 'ready',
              capabilities: JSON.stringify(capabilities),
              ready_lease_expires_at: Date.now() + 30000,
            });
          }
        },
      };
      service.initializeReplicaHandler = () => {
        service.replicaHandler = {};
      };
      service.initializeMessageGroupServiceHandler = () => {
        service.messageGroupServiceHandler = {};
      };
      service.initializeControlPlaneService = async () => {};
      service.notifyLocalAdminRuntimeReady = async () => {
        service.localAdminRuntimeReadyNotified = true;
      };
      service.activateMessageGroupServiceRows = async () => {
        const rowDuringControlPlaneReady = systemTableCache.get('nodes', service.nodeId);
        observedStates.push({
          stage: 'control_plane_ready',
          status: rowDuringControlPlaneReady?.status,
          connectionState: rowDuringControlPlaneReady?.connection_state,
          runtimeReady: Boolean(service.runtimeServiceHandler),
          externalAdmissionOpen,
        });
      };
      service.initializeRuntimeServiceHandler = () => {
        const rowBeforeRuntimeHandler = systemTableCache.get('nodes', service.nodeId);
        observedStates.push({
          stage: 'before_runtime_handler',
          status: rowBeforeRuntimeHandler?.status,
          connectionState: rowBeforeRuntimeHandler?.connection_state,
          runtimeReady: false,
          externalAdmissionOpen,
        });
        service.runtimeServiceHandler = {};
      };
      service.openExternalTransportAdmission = () => {
        const rowBeforeExternalAdmission = systemTableCache.get('nodes', service.nodeId);
        observedStates.push({
          stage: 'before_external_admission',
          status: rowBeforeExternalAdmission?.status,
          connectionState: rowBeforeExternalAdmission?.connection_state,
          runtimeReady: Boolean(service.runtimeServiceHandler),
          externalAdmissionOpen,
        });
        externalAdmissionOpen = true;
      };
      service.completeSuccessfulBootstrap = () => {
        const rowAtFinalizeComplete = systemTableCache.get('nodes', service.nodeId);
        observedStates.push({
          stage: 'finalized_complete',
          status: rowAtFinalizeComplete?.status,
          connectionState: rowAtFinalizeComplete?.connection_state,
          runtimeReady: Boolean(service.runtimeServiceHandler),
          externalAdmissionOpen,
        });
        service.phase = 'complete';
      };
      service.hasActiveControlPlaneBackgroundWriters = () => true;

      const steps = service.buildSeedCheckpointSteps(
        {run: async () => {}},
        {phases: []},
      ).slice(5);
      for (const step of steps) {
        if (step.terminal === true) {
          await service.beforeTerminalStartupCheckpoint();
        }
        await step.run({});
      }

      t.same(observedStates, [
        {
          stage: 'control_plane_ready',
          status: 'joining',
          connectionState: 'connected',
          runtimeReady: false,
          externalAdmissionOpen: false,
        },
        {
          stage: 'before_runtime_handler',
          status: 'joining',
          connectionState: 'connected',
          runtimeReady: false,
          externalAdmissionOpen: false,
        },
        {
          stage: 'before_external_admission',
          status: 'joining',
          connectionState: 'connected',
          runtimeReady: true,
          externalAdmissionOpen: false,
        },
        {
          stage: 'finalized_complete',
          status: 'active',
          connectionState: 'ready',
          runtimeReady: true,
          externalAdmissionOpen: true,
        },
      ], 'seed remains JOINING/CONNECTED until after runtime handler and external admission are initialized');
    } finally {
      NodeStorageBudgetSetup.create = originalCreate;
      NodeStorageBudgetSetup.resolveAndPersist = originalResolveAndPersist;
      NodeService.getInstance = originalGetInstance;
    }
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
      bootIncarnation: 1,
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

test('BootstrapService final SQL attachment engages transaction recovery when background writers are already active',
  async (t) => {
    initializeTestEnvironment();

    const nodeAddress = 'ws://localhost:19096';
    const recoveryError = new Error(
      'Transaction recovery state is incomplete or incompatible',
    );
    recoveryError.errorCode = 'TRANSACTION_RECOVERY_INCOMPLETE';
    recoveryError.decisionDimension = 'commit_mode';
    let recoveryStarts = 0;
    const service = new BootstrapService({
      bootIncarnation: 1,
      nodeId: 'seed-active-writer-recovery-gate',
      nodeAddress,
    });
    service.bootstrapReadinessState = {
      getSnapshot: () => ({
        ready: true,
        phase: 'TRAFFIC_READY',
        state: 'join_ready',
        reasons: [],
        retryAfterMs: 0,
        stableWindowMs: 1,
        stableElapsedMs: 1,
      }),
    };
    service.leaseService = {state: 'running'};
    service.heartbeatService = {state: 'running'};
    const sqlQueryEngine = {
      activateDistributedTransactionRecovery() {
        recoveryStarts += 1;
        throw recoveryError;
      },
    };

    const recoveryPromise = attachSqlRuntimeToStartupOwner({
      owner: service,
      sqlQueryEngine,
      systemTableCache: null,
    });
    await t.rejects(
      recoveryPromise,
      {message: recoveryError.message},
      'the final attachment preserves the owner-classified rejection',
    );

    const recovery =
      service.runtimeHandoffOwner.getDistributedTransactionRecoverySnapshot();
    t.equal(
      recoveryStarts,
      1,
      'the seed composition engages recovery once at final attachment',
    );
    t.equal(
      recovery.state,
      'failed',
      'the seed startup owner records the replay failure',
    );
    t.equal(
      recovery.outcome?.decisionDimension,
      'commit_mode',
      'the seed startup owner retains the failed decision dimension',
    );
    t.equal(
      recovery.outcome?.routeSource,
      nodeAddress,
      'the seed startup owner attributes recovery to its canonical address',
    );
  });

test('BootstrapService does not start deferred steady-state writers after shutdown begins',
  async (t) => {
    initializeTestEnvironment();

    let metadataPublicationReady = false;
    let leaseStarts = 0;
    let heartbeatStarts = 0;
    let recoveryStarts = 0;

    const service = new BootstrapService({
      bootIncarnation: 1,
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
      bootIncarnation: 1,
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
      bootIncarnation: 1,
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
      bootIncarnation: 1,
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
