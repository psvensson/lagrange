import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {BOOTSTRAP_PHASE} from '../../src/bootstrap/bootstrap-constants.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_WRITE_HEALTH_STATE,
  createControlPlaneWriteHealthProvider,
} from '../../src/bootstrap/control-plane-write-health-owner.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function buildMessageRouterStats(overrides = {}) {
  const queue = {
    pending: 52,
    pendingCritical: 4,
    pendingBackground: 48,
    criticalReserve: 16,
    backgroundPendingLimit: 48,
    maxPending: 64,
    ...overrides,
  };
  return {
    outboundQueues: {
      'remote-node': queue,
    },
  };
}

function buildOwner(options = {}) {
  const heartbeatService = {
    heartbeatConsecutiveFailures: options.consecutiveFailures ?? 0,
    lastHeartbeatPublicationDecision: {
      publicationMode:
        options.publicationMode ||
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
    },
    getHeartbeatPublicationDiagnostics() {
      return {
        consecutiveFailures: options.consecutiveFailures ?? 0,
        lastFailureStage: options.lastFailureStage || 'register',
        lastFailureReason: options.lastFailureReason || 'transport_backpressure',
      };
    },
  };
  return {
    nodeId: 'node-a',
    heartbeatService,
    messageRouter: {
      getStats() {
        return buildMessageRouterStats(options.queueOverrides || {});
      },
    },
  };
}

test('createControlPlaneWriteHealthProvider keeps healthy state below the failure threshold', async (t) => {
  initializeTestEnvironment();

  const provider = createControlPlaneWriteHealthProvider(buildOwner({
    consecutiveFailures: 1,
  }), {
    failureThreshold: 3,
  });
  const health = provider();

  t.equal(health.healthy, true, 'provider should stay healthy below threshold');
  t.equal(
    health.classification,
    LIFECYCLE_DEPENDENCY_CLASS.HARD,
    'healthy outcome should preserve hard dependency classification',
  );
  t.equal(
    health.state,
    CONTROL_PLANE_WRITE_HEALTH_STATE.HEALTHY,
    'healthy outcome should use the explicit healthy state',
  );

  cleanupTestEnvironment();
});

test('createControlPlaneWriteHealthProvider prefers the canonical publication story when available', async (t) => {
  initializeTestEnvironment();

  const provider = createControlPlaneWriteHealthProvider({
    nodeId: 'node-a',
    heartbeatService: {
      heartbeatConsecutiveFailures: 4,
      lastHeartbeatPublicationDecision: {
        publicationMode:
          CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      },
    },
    controlPlaneReadinessService: {
      getControlPlanePublicationStorySync() {
        return {
          nodeStatePublication: {
            consecutiveFailures: 4,
            lastFailureStage: 'node_state_publication',
            lastFailureReason: 'reporter_visibility_not_confirmed',
            publicationMode:
              CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
          },
        };
      },
    },
    messageRouter: {
      getStats() {
        return buildMessageRouterStats({
          pending: 44,
          pendingCritical: 16,
          pendingBackground: 28,
          criticalReserve: 16,
          backgroundPendingLimit: 48,
          maxPending: 64,
        });
      },
    },
  }, {
    failureThreshold: 3,
  });
  const health = provider();

  t.equal(
    health.details?.lastFailureStage,
    'node_state_publication',
    'write health should consume the readiness-owned publication story',
  );
  t.equal(
    health.details?.lastFailureReason,
    'reporter_visibility_not_confirmed',
    'write health should preserve canonical publication-story failure reasons',
  );
  t.equal(
    health.details?.publicationMode,
    CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
    'write health should preserve publication mode from the canonical story',
  );

  cleanupTestEnvironment();
});

test('createControlPlaneWriteHealthProvider contains background backlog when critical reserve remains available', async (t) => {
  initializeTestEnvironment();

  const provider = createControlPlaneWriteHealthProvider(buildOwner({
    consecutiveFailures: 5,
    publicationMode:
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
  }), {
    failureThreshold: 3,
  });
  const health = provider();

  t.equal(health.healthy, false, 'contained backlog remains degraded evidence');
  t.equal(
    health.classification,
    LIFECYCLE_DEPENDENCY_CLASS.SOFT,
    'contained backlog should degrade the soft path instead of hard blocking readiness',
  );
  t.equal(
    health.state,
    CONTROL_PLANE_WRITE_HEALTH_STATE.BACKGROUND_BACKLOG_CONTAINED,
    'contained backlog should use the explicit contained state',
  );
  t.equal(
    health.details?.pressureSummary?.backpressured,
    false,
    'control-plane partition should remain admissible while reserve is available',
  );

  cleanupTestEnvironment();
});

test('createControlPlaneWriteHealthProvider keeps recovery heartbeat failures soft when critical reserve remains available', async (t) => {
  initializeTestEnvironment();

  const provider = createControlPlaneWriteHealthProvider(buildOwner({
    consecutiveFailures: 5,
    publicationMode:
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
  }), {
    failureThreshold: 3,
  });
  const health = provider();

  t.equal(health.healthy, false, 'recovery write failures remain degraded evidence');
  t.equal(
    health.classification,
    LIFECYCLE_DEPENDENCY_CLASS.SOFT,
    'recovery heartbeat failures should not hard-block readiness while reserve remains available',
  );
  t.equal(
    health.state,
    CONTROL_PLANE_WRITE_HEALTH_STATE.RECOVERY_WRITE_DEFERRED,
    'recovery heartbeat failures should use the explicit deferred state',
  );
  t.equal(
    health.details?.pressureSummary?.backpressured,
    false,
    'control-plane partition should remain admissible while recovery writes retry',
  );

  cleanupTestEnvironment();
});

test('createControlPlaneWriteHealthProvider hard-blocks when critical control-plane capacity is exhausted', async (t) => {
  initializeTestEnvironment();

  const provider = createControlPlaneWriteHealthProvider(buildOwner({
    consecutiveFailures: 5,
    publicationMode:
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
    queueOverrides: {
      pending: 44,
      pendingCritical: 16,
      pendingBackground: 28,
      criticalReserve: 16,
      backgroundPendingLimit: 48,
      maxPending: 64,
    },
  }), {
    failureThreshold: 3,
  });
  const health = provider();

  t.equal(health.healthy, false, 'critical exhaustion remains unhealthy');
  t.equal(
    health.classification,
    LIFECYCLE_DEPENDENCY_CLASS.HARD,
    'critical exhaustion should remain a hard dependency failure',
  );
  t.equal(
    health.state,
    CONTROL_PLANE_WRITE_HEALTH_STATE.CRITICAL_WRITE_UNHEALTHY,
    'critical exhaustion should use the explicit critical-unhealthy state',
  );
  t.equal(
    health.details?.pressureSummary?.backpressured,
    true,
    'control-plane pressure summary should show critical reserve exhaustion',
  );

  cleanupTestEnvironment();
});

test('BootstrapAPI keeps readiness available while surfacing contained observability backlog as degraded context', async (t) => {
  initializeTestEnvironment();

  const owner = buildOwner({
    consecutiveFailures: 5,
    publicationMode:
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
  });
  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: {},
    bootstrapService: {
      phase: BOOTSTRAP_PHASE.COMPLETE,
      messageRouter: owner.messageRouter,
    },
    readinessState: new BootstrapReadinessState({readyStableWindowMs: 0}),
    controlPlaneWriteHealthProvider: createControlPlaneWriteHealthProvider(owner, {
      failureThreshold: 3,
    }),
    controlPlaneReadinessService: {
      getPriorityControlPlaneRecoveryHealthSync() {
        return {
          healthy: true,
          reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
          details: null,
        };
      },
    },
  });

  await api.initialize(0, {listen: false});
  api.setSqlQueryEngine({executeQuery: async () => ({success: true})});
  api.getLeaderReadinessStatusForProbe = () => ({ready: true});

  const snapshot = api.evaluateReadinessSnapshot();

  t.equal(snapshot.ready, true, 'soft write-health degradation should keep readiness available');
  t.ok(
    Array.isArray(snapshot.degradedReasons) &&
      snapshot.degradedReasons.includes(LIFECYCLE_REASON.OBSERVABILITY_BACKLOG),
    'contained backlog should still be surfaced as degraded context',
  );
  t.notOk(
    Array.isArray(snapshot.reasons) &&
      snapshot.reasons.includes(LIFECYCLE_REASON.OBSERVABILITY_BACKLOG),
    'contained backlog should not remain a hard readiness blocker',
  );

  await api.shutdown();
  cleanupTestEnvironment();
});
