import {readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {STATE} from '../../src/constants/index.js';
import {CONTROL_PLANE_MESSAGE_COMPLETION_FIELD} from
  '../../src/control-plane/control-plane-constants.js';
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

test('HeartbeatService has no direct durable READY writer when routed reporter ' +
  'is absent', async (t) => {
  initEnv();
  let publisherCalls = 0;
  let directNodeWrites = 0;
  const service = new HeartbeatService({
    nodeId: 'node-owner-only-ready',
    nodeAddress: '10.0.0.12:8080',
    bootIncarnation: 4,
    cdcIntegrationService: {
      applyAuthoritativeCacheRepair: () => true,
    },
    controlPlaneSystemTableGateway: {
      updateSystemTableRow: async () => {
        directNodeWrites += 1;
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createMockCache(),
    nodeStatePublisher: async (payload) => {
      publisherCalls += 1;
      return {
        completionKind: 'durable_state_publication',
        completionCompleted: true,
        [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW]: {
          ...payload.nodeRow,
          node_id: 'node-owner-only-ready',
        },
        [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD
          .AUTHORITATIVE_OBSERVED_AT_MS]: 1000,
      };
    },
    now: () => 1000,
  });

  await service.sendHeartbeat(null, ['partition_replica']);
  t.equal(publisherCalls, 1,
    'reporter-absent ingress invokes the canonical publication adapter');
  t.equal(directNodeWrites, 0,
    'HeartbeatService never mutates the NODES row directly');
});

test('ordinary local ingress and durable-rejoin routed ingress publish the ' +
  'same READY owner contract', async (t) => {
  initEnv();
  const routedPayloads = [];
  const localPayloads = [];
  const routedFallbackPayloads = [];
  const projectionRows = [];
  const buildCompletion = (payload, nodeId) => ({
    completionKind: 'durable_state_publication',
    completionCompleted: true,
    [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW]: {
      ...payload.nodeRow,
      node_id: nodeId,
    },
    [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_OBSERVED_AT_MS]:
      1000,
  });
  const createCdc = () => ({
    applyAuthoritativeCacheRepair(_tableName, _rowId, row) {
      projectionRows.push(row);
      return true;
    },
    upsertSystemTableRow: async () => ({success: true}),
  });
  const shared = {
    nodeId: 'node-ready-ingress-parity',
    nodeAddress: '10.0.0.15:8080',
    bootIncarnation: 7,
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    now: () => 1000,
  };
  const routed = new HeartbeatService({
    ...shared,
    cdcIntegrationService: createCdc(),
    nodeStateReporter: async (payload) => {
      routedPayloads.push(payload);
      return buildCompletion(payload, shared.nodeId);
    },
    nodeStatePublisher: async (payload) => {
      routedFallbackPayloads.push(payload);
      return buildCompletion(payload, shared.nodeId);
    },
  });
  const local = new HeartbeatService({
    ...shared,
    cdcIntegrationService: createCdc(),
    nodeStatePublisher: async (payload) => {
      localPayloads.push(payload);
      return buildCompletion(payload, shared.nodeId);
    },
  });

  await routed.sendHeartbeat(null, ['partition_replica'], {
    requireDurableVisibility: true,
  });
  await local.sendHeartbeat(null, ['partition_replica'], {
    requireDurableVisibility: true,
  });

  t.equal(routedPayloads.length, 1,
    'durable rejoin selects the routed ingress adapter');
  t.equal(routedFallbackPayloads.length, 0,
    'the local adapter is fallback ingress, never a second publisher');
  t.equal(localPayloads.length, 1,
    'ordinary join without a reporter selects local canonical ingress');
  t.same(localPayloads[0], routedPayloads[0],
    'both ingress adapters carry identical lifecycle, lease, and identity');
  t.equal(projectionRows.length, 2,
    'both owner completions install the same authoritative projection');
  t.same(projectionRows[0], projectionRows[1],
    'ingress choice does not change the durable completion contract');
});

test('Heartbeat READY publication has exactly one semantic durable owner',
  (t) => {
    const heartbeatSource = readFileSync(new URL(
      '../../src/control-plane/heartbeat-service-publication-methods.js',
      import.meta.url,
    ), 'utf8');
    const dispatchSource = readFileSync(new URL(
      '../../src/control-plane/replica-dispatch-state-publication.js',
      import.meta.url,
    ), 'utf8');
    const heartbeatReadyWriter = heartbeatSource.slice(
      heartbeatSource.indexOf('async writeNodeHeartbeat'),
      heartbeatSource.indexOf('getControlPlaneSystemTableGateway()'),
    );

    t.notMatch(heartbeatReadyWriter, /updateSystemTableRow/u,
      'Heartbeat READY observation cannot write NODES through the gateway');
    t.match(dispatchSource,
      /updateSystemTableRow\(\s*SYSTEM_TABLE_NAME\.NODES/u,
      'ReplicaDispatch remains the sole semantic READY persistence owner');
    t.end();
  });

test('R1 the last local prerequisite level-triggers READY publication without ' +
  'registration replay', async (t) => {
  initEnv();
  const publications = [];
  const service = new HeartbeatService({
    nodeId: 'node-r1-ready-edge',
    nodeAddress: '10.0.0.13:8080',
    bootIncarnation: 5,
    cdcIntegrationService: {upsertSystemTableRow: async () => ({success: true})},
    systemTableCache: createMockCache(),
    isNodeLifecycleReady: () => true,
    nodeStatePublisher: async (payload) => {
      publications.push(payload);
      return {};
    },
    setIntervalFn: () => ({unref() {}}),
    clearIntervalFn: () => {},
  });
  service.initialize();
  service.start();
  await new Promise((resolve) => setImmediate(resolve));

  t.equal(publications.length, 1,
    'startup handoff immediately wakes the existing registration');
  t.match(publications[0].nodeRow, {
    status: 'active',
    connection_state: STATE.READY,
    boot_incarnation: 5,
  }, 'the wake projects the exact boot into READY');
  service.stop();
});

test('R2 an event during the immediate wake is recovered by the next ' +
  'level-triggered tick', async (t) => {
  initEnv();
  const intervals = [];
  const releases = [];
  let publications = 0;
  let now = 1000;
  const service = new HeartbeatService({
    nodeId: 'node-r2-wake-race',
    nodeAddress: '10.0.0.14:8080',
    bootIncarnation: 6,
    cdcIntegrationService: {upsertSystemTableRow: async () => ({success: true})},
    systemTableCache: createMockCache(),
    isNodeLifecycleReady: () => true,
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 1,
    now: () => now,
    nodeStatePublisher: async () => {
      publications += 1;
      if (publications === 1) {
        await new Promise((resolve) => releases.push(resolve));
      }
      return {};
    },
    setIntervalFn: (callback) => {
      intervals.push(callback);
      return {unref() {}};
    },
    clearIntervalFn: () => {},
  });
  service.initialize();
  service.start();
  await new Promise((resolve) => setImmediate(resolve));
  intervals[0]();
  t.equal(publications, 1,
    'an in-flight wake is not overlapped by a racing tick');
  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  now += 10;
  intervals[0]();
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(publications, 2,
    'the next level-triggered tick re-observes and republishes');
  service.stop();
});

test('HeartbeatService join-critical reporter publication consumes the ' +
  'durable owner completion', async (t) => {
  initEnv();

  let reporterAttempts = 0;
  const reporterPayloads = [];
  const projectionInstalls = [];
  const service = new HeartbeatService({
    nodeId: 'node-strict-ready-visibility',
    nodeAddress: '10.0.0.41:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      applyAuthoritativeCacheRepair(...args) {
        projectionInstalls.push(args);
        return true;
      },
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
        [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW]: {
          node_id: 'node-strict-ready-visibility',
          last_heartbeat: 1000,
          status: 'active',
          connection_state: STATE.READY,
        },
        [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD
          .AUTHORITATIVE_OBSERVED_AT_MS]: 1000,
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
    t.equal(projectionInstalls.length, 2,
      'each exact owner completion level-triggers local projection');
    t.match(projectionInstalls[0][2], {
      node_id: 'node-strict-ready-visibility',
      status: 'active',
      connection_state: STATE.READY,
    }, 'projection installs only the authoritative READY row');
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService join-critical reporter completion cannot install stale ' +
  'authoritative readiness', async (t) => {
  initEnv();

  let projectionInstalls = 0;
  const service = new HeartbeatService({
    nodeId: 'node-strict-ready-stale-owner',
    nodeAddress: '10.0.0.44:8080',
    cdcIntegrationService: {
      applyAuthoritativeCacheRepair() {
        projectionInstalls += 1;
        return true;
      },
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeStateReporter: async () => ({
      publicationPath: 'node_state_reporter',
      targetAddress: 'seed-1/message-group/mg-1',
      completionKind: 'durable_state_publication',
      completionCompleted: true,
      [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW]: {
        node_id: 'node-strict-ready-stale-owner',
        last_heartbeat: 1000,
        status: 'joining',
        connection_state: STATE.CONNECTED,
      },
      [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD
        .AUTHORITATIVE_OBSERVED_AT_MS]: 1000,
    }),
    now: () => 1000,
  });

  try {
    await t.rejects(
      service.sendHeartbeat(null, ['partition_replica'], {
        requireDurableVisibility: true,
      }),
      /Authoritative node heartbeat visibility was not confirmed/,
      'typed completion cannot upgrade stale authoritative lifecycle evidence',
    );
    t.equal(projectionInstalls, 0,
      'stale owner evidence must refuse before local projection');
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
