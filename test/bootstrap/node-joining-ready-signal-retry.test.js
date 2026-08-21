import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';

const PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE =
  'priority_control_plane_recovery_diagnostics_unavailable';
const SEED_CONTACT_STARTUP_AUTHORITY = Object.freeze({
  state: 'seed_locally_ready_unpublished',
  authorityAvailable: true,
  publicationObservationState: 'unpublished',
});
const BOOTSTRAP_INIT_DIAGNOSTICS_RECOVERY_REASONS = Object.freeze([
  LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE,
  LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.RUNTIME_WIRING_INCOMPLETE,
  PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
]);

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('NodeJoiningService retries ready heartbeat before failing join readiness',
  async (t) => {
    initializeTestEnvironment();

    let sendAttempts = 0;
    const sendOptions = [];
    let startCalls = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-retry',
      nodeAddress: 'ws://localhost:19090',
      seedNodeAddress: 'http://localhost:18080',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
    });
    service.cdcSubscriptionsActive = true;
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {ready: true, state: 'ready'};
      },
    };

    service.heartbeatService = {
      sendHeartbeat: async (_stats, _capabilities, options) => {
        sendAttempts += 1;
        sendOptions.push(options);
        if (sendAttempts < 3) {
          throw new Error('Query timeout after 30000ms');
        }
      },
      start: () => {
        startCalls += 1;
      },
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(sendAttempts, 3, 'ready signal should retry transient failures');
    t.same(
      sendOptions,
      [
        {requireDurableVisibility: true},
        {requireDurableVisibility: true},
        {requireDurableVisibility: true},
      ],
      'join completion always requests the durable publication boundary',
    );
    t.equal(
      startCalls,
      0,
      'heartbeat loop should remain frozen until control-plane activation barrier',
    );
    t.same(
      sleepDelays,
      [1, 1],
      'ready signal retries should wait between attempts',
    );
  });

test('NodeJoiningService waits for local query transport readiness before sending ready heartbeat',
  async (t) => {
    initializeTestEnvironment();

    let transportReady = false;
    let heartbeatSent = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-transport-gate',
      nodeAddress: 'ws://localhost:19091',
      seedNodeAddress: 'http://localhost:18081',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryMaxDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
        transportReady = true;
      },
    });
    service.cdcSubscriptionsActive = true;
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
      start: () => {},
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(heartbeatSent, 1,
      'ready heartbeat should be sent once the local query transport becomes ready');
    t.same(sleepDelays, [1],
      'local query transport gating should back off before the first ready heartbeat');
  });

test('NodeJoiningService opens the ready heartbeat for control-ready metadata publication',
  async (t) => {
    initializeTestEnvironment();

    let heartbeatSent = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-traffic-gate',
      nodeAddress: 'ws://localhost:19093',
      seedNodeAddress: 'http://localhost:18082',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryMaxDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
    });
    service.cdcSubscriptionsActive = true;
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {ready: true, state: 'ready'};
      },
    };
    service.bootstrapReadinessState = {
      getSnapshot() {
        return {
          ready: false,
          phase: 'CONTROL_READY',
          state: 'warming',
          reasons: ['LEADER_METADATA_INCOMPLETE'],
          retryAfterMs: 1,
          stableWindowMs: 10000,
          stableElapsedMs: 0,
        };
      },
    };
    service.heartbeatService = {
      sendHeartbeat: async () => {
        heartbeatSent += 1;
      },
      start: () => {},
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(heartbeatSent, 1,
      'ready heartbeat should be sent while lifecycle is only blocked on leader metadata');
    t.same(sleepDelays, [],
      'metadata-publication readiness should not wait for full traffic readiness');
  });

test('NodeJoiningService opens the ready heartbeat during the lifecycle stable window',
  async (t) => {
    initializeTestEnvironment();

    let heartbeatSent = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-stable-window-gate',
      nodeAddress: 'ws://localhost:19094',
      seedNodeAddress: 'http://localhost:18083',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryMaxDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
    });
    service.cdcSubscriptionsActive = true;
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {ready: true, state: 'ready'};
      },
    };
    service.bootstrapReadinessState = {
      getSnapshot() {
        return {
          ready: false,
          phase: 'JOIN_READY',
          state: 'warming',
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          retryAfterMs: 1,
          stableWindowMs: 10000,
          stableElapsedMs: 0,
        };
      },
    };
    service.heartbeatService = {
      sendHeartbeat: async () => {
        heartbeatSent += 1;
      },
      start: () => {},
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(heartbeatSent, 1,
      'ready heartbeat should be sent while the lifecycle stable window is pending');
    t.same(sleepDelays, [],
      'metadata-publication readiness should not wait through the stable window');
  });

test('NodeJoiningService opens the ready heartbeat for seed-authorized INIT diagnostics lag',
  async (t) => {
    initializeTestEnvironment();

    let heartbeatSent = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-init-diagnostics-lag',
      nodeAddress: 'ws://localhost:19095',
      seedNodeAddress: 'http://localhost:18084',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryMaxDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
    });
    service.cdcSubscriptionsActive = true;
    service.bootstrapResponse = {};
    service.rpcClient = {};
    service.cdcIntegrationService = {};
    service.seedContactStartupAuthority = SEED_CONTACT_STARTUP_AUTHORITY;
    service.hasOperationalMessageGroup = () => true;
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {ready: true, state: 'ready'};
      },
    };
    service.bootstrapReadinessState = {
      evaluate() {
        return {
          ready: false,
          phase: LIFECYCLE_PHASE.INIT,
          state: 'bootstrapping',
          reasons: BOOTSTRAP_INIT_DIAGNOSTICS_RECOVERY_REASONS,
          retryAfterMs: 1,
        };
      },
    };
    service.heartbeatService = {
      sendHeartbeat: async () => {
        heartbeatSent += 1;
      },
      start: () => {},
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(
      heartbeatSent,
      1,
      'ready heartbeat should be sent when seed-authorized INIT is only diagnostics-lagged',
    );
    t.same(
      sleepDelays,
      [],
      'metadata-publication readiness should not wait on diagnostics lag',
    );
  });

test('buildLocalQueryTransportNotReadyError attaches progressContract with 10 strict keys',
  async (t) => {
    const {buildLocalQueryTransportNotReadyError} = await import('../../src/bootstrap/shared/local-query-transport-readiness.js');
    const readiness = {
      ready: false,
      state: 'deferred',
      reason: 'Query/data-plane message-group transport is not configured',
      reasonCode: 'local_query_transport_not_ready',
      errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
      retryAfterMs: 42,
    };
    const error = buildLocalQueryTransportNotReadyError(readiness);
    t.ok(error.progressContract, 'progressContract should be attached to the error');
    t.equal(error.progressContract.owner, 'startup_readiness_owner');
    t.equal(error.progressContract.boundary, 'startup_support_evidence');
    t.equal(error.progressContract.state, 'readiness_retryable');
    t.equal(error.progressContract.reason, 'local_query_transport_not_ready');
    t.equal(error.progressContract.nextAction, 'wait_for_local_query_transport');
    t.equal(error.progressContract.wakeSource, 'local_query_transport_event');
    t.equal(error.progressContract.retryAfterMs, 42);
    t.equal(error.progressContract.terminalState, 'satisfied');
    t.equal(error.progressContract.evidencePath, 'startup_support_evidence');
    t.equal(error.progressContract.blockingDependency, 'local_query_transport');

    t.ok(readiness.progressContract, 'progressContract should also be attached to the readiness object');
  });

test('buildLifecycleReadinessNotReadyError attaches progressContract with 10 strict keys',
  async (t) => {
    const {buildLifecycleReadinessNotReadyError} = await import('../../src/bootstrap/traffic-readiness-utils.js');
    const snapshot = {
      ready: false,
      phase: 'CONTROL_READY',
      state: 'warming',
      reasons: ['LEADER_METADATA_INCOMPLETE'],
      retryAfterMs: 120,
    };
    const error = buildLifecycleReadinessNotReadyError(snapshot, {
      label: 'Lifecycle metadata publication readiness',
      code: 'BOOTSTRAP_METADATA_PUBLICATION_NOT_READY',
    });
    t.ok(error.progressContract, 'progressContract should be attached to the error');
    t.equal(error.progressContract.owner, 'startup_readiness_owner');
    t.equal(error.progressContract.boundary, 'startup_support_evidence');
    t.equal(error.progressContract.state, 'readiness_retryable');
    t.equal(error.progressContract.reason, 'LEADER_METADATA_INCOMPLETE');
    t.equal(error.progressContract.nextAction, 'wait_for_metadata_publication');
    t.equal(error.progressContract.wakeSource, 'metadata_publication_event');
    t.equal(error.progressContract.retryAfterMs, 120);
    t.equal(error.progressContract.terminalState, 'satisfied');
    t.equal(error.progressContract.evidencePath, 'startup_support_evidence');
    t.equal(error.progressContract.blockingDependency, 'metadata_publication');

    t.ok(snapshot.progressContract, 'progressContract should also be attached to the snapshot object');
  });

test('BootstrapReadinessOwner buildBootstrapNotReadyResponse attaches progressContract',
  async (t) => {
    const {BootstrapReadinessOwner} = await import('../../src/bootstrap/owners/bootstrap-readiness-owner.js');
    const owner = new BootstrapReadinessOwner({
      delegates: {
        getReadinessState: () => ({
          evaluate: () => ({
            ready: false,
            phase: 'INIT',
            state: 'bootstrapping',
            reasons: ['SQL_ENGINE_UNAVAILABLE'],
            retryAfterMs: 50,
          }),
        }),
      },
    });
    const response = owner.buildBootstrapNotReadyResponse({
      error: 'Not ready',
      code: 'SQL_ENGINE_UNAVAILABLE',
    });
    t.ok(response.progressContract, 'response should contain progressContract');
    t.equal(response.progressContract.owner, 'startup_readiness_owner');
    t.equal(response.progressContract.boundary, 'startup_support_evidence');
    t.equal(response.progressContract.state, 'readiness_retryable');
    t.equal(response.progressContract.reason, 'SQL_ENGINE_UNAVAILABLE');
    t.equal(response.progressContract.nextAction, 'wait_for_sql_engine');
    t.equal(response.progressContract.wakeSource, 'sql_engine');
    t.equal(response.progressContract.retryAfterMs, 50);
    t.equal(response.progressContract.terminalState, 'satisfied');
    t.equal(response.progressContract.evidencePath, 'startup_support_evidence');
    t.equal(response.progressContract.blockingDependency, 'sql_engine');
  });
