import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {STATE} from '../../src/constants/index.js';
import {
  createMockCache,
  HeartbeatService,
  initEnv,
} from './heartbeat-memory-trend-test-helpers.js';

test('HeartbeatService membership reconciliation cannot retain heartbeat ' +
  'attempt ownership', async (t) => {
  initEnv();

  const scheduled = [];
  let heartbeatWrites = 0;
  let now = 1000;
  const service = new HeartbeatService({
    nodeId: 'node-independent-reconcile',
    nodeAddress: '10.0.0.11:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        heartbeatWrites += 1;
        return {success: true};
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    now: () => now,
    setIntervalFn: (callback) => {
      const handle = {callback, unref() {}};
      scheduled.push(handle);
      return handle;
    },
    clearIntervalFn: () => {},
  });
  service.runScheduledMembershipPublicationReconcileTick = () => {
    return new Promise(() => {});
  };

  try {
    service.initialize();
    service.start();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(heartbeatWrites, 1, 'the immediate tick publishes one heartbeat');
    t.equal(
      service.heartbeatInFlight,
      false,
      'the independent reconciliation cannot retain heartbeat attempt ownership',
    );

    now = 20000;
    scheduled[0].callback();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      heartbeatWrites,
      2,
      'a later interval publishes while the independent reconciliation is pending',
    );
  } finally {
    service.stop();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService join-critical reporter publication consumes the ' +
  'durable owner completion', async (t) => {
  initEnv();

  let reporterAttempts = 0;
  const reporterPayloads = [];
  const service = new HeartbeatService({
    nodeId: 'node-strict-ready-visibility',
    nodeAddress: '10.0.0.41:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeStateReporter: async (payload) => {
      reporterAttempts += 1;
      reporterPayloads.push(payload);
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
        completionKind: 'durable_state_publication',
        completionCompleted: true,
      };
    },
    verifyReporterVisibilityOnSuccess: true,
    now: () => 1000,
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica'], {
      requireDurableVisibility: true,
    });
    await service.sendHeartbeat(null, ['partition_replica'], {
      requireDurableVisibility: true,
    });
    t.equal(
      reporterAttempts,
      2,
      'a second strict publication is not downgraded to a coalesced cache hit',
    );
    t.equal(
      reporterPayloads.every((payload) => {
        return payload.requireDurableCompletion === true;
      }),
      true,
      'every join-critical write requests the receiver-owned completion boundary',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService join-critical reporter publication rejects a transport ' +
  'ACK without durable READY visibility', async (t) => {
  initEnv();

  let authoritativeReads = 0;
  const service = new HeartbeatService({
    nodeId: 'node-strict-ready-gap',
    nodeAddress: '10.0.0.42:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      executeAuthoritativeSystemTableRead: async () => {
        authoritativeReads += 1;
        return {
          success: true,
          rows: [{
            node_id: 'node-strict-ready-gap',
            last_heartbeat: 999,
            status: 'joining',
            connection_state: STATE.CONNECTED,
          }],
        };
      },
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeStateReporter: async () => ({
      publicationPath: 'node_state_reporter',
      targetAddress: 'seed-1/message-group/mg-1',
    }),
    verifyReporterVisibilityOnSuccess: true,
    now: () => 1000,
  });

  try {
    await t.rejects(
      service.sendHeartbeat(null, ['partition_replica'], {
        requireDurableVisibility: true,
      }),
      /Authoritative node heartbeat visibility was not confirmed/,
      'transport delivery cannot complete the join-critical publication',
    );
    t.equal(
      authoritativeReads,
      0,
      'a missing completion cannot be rescued by an unrelated read owner',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService join-critical reporter publication fails closed without ' +
  'the typed owner completion', async (t) => {
  initEnv();

  const service = new HeartbeatService({
    nodeId: 'node-strict-ready-no-authority',
    nodeAddress: '10.0.0.43:8080',
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeStateReporter: async () => ({
      publicationPath: 'node_state_reporter',
      targetAddress: 'seed-1/message-group/mg-1',
    }),
    verifyReporterVisibilityOnSuccess: true,
    now: () => 1000,
  });

  try {
    await t.rejects(
      service.sendHeartbeat(null, ['partition_replica'], {
        requireDurableVisibility: true,
      }),
      /Authoritative node heartbeat visibility was not confirmed/,
      'an untyped transport return cannot be interpreted as durable completion',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
