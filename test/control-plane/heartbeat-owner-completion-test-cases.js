import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {STATE} from '../../src/constants/index.js';
import {CONTROL_PLANE_MESSAGE_COMPLETION_FIELD} from
  '../../src/control-plane/control-plane-constants.js';
import {NODE_LIFECYCLE_PUBLICATION_OUTCOME} from
  '../../src/control-plane/node-lifecycle-publication.js';
import {nodeStateUpdateOptionsFromLifecycleRequest} from
  '../../src/control-plane/node-lifecycle-publication-wire.js';
import {REPLICA_DISPATCH_STATE_PUBLICATION_METHODS} from
  '../../src/control-plane/replica-dispatch-state-publication.js';
import {NodeStatePublicationOwner} from
  '../../src/bootstrap/shared/node-state-publication-owner.js';
import {
  createMockCache,
  HeartbeatService,
  initEnv,
} from './heartbeat-memory-trend-test-helpers.js';
import {
  DORMANT_ALLOWED_IMPORTERS,
  NODES_TRANSITION_CLASS,
  NODES_TRANSITION_OWNERS,
  collectModuleImporters,
  collectNodesMutationSites,
} from './node-lifecycle-writer-census.js';

// A lifecycle owner stand-in that records each request and answers APPLIED
// with the requested lifecycle as the authoritative row.
function createRecordingPublication(requests, options = {}) {
  return {
    async publish(request) {
      requests.push(request);
      if (options.beforeAnswer) {
        await options.beforeAnswer(requests.length);
      }
      return {
        outcome: NODE_LIFECYCLE_PUBLICATION_OUTCOME.APPLIED,
        row: {
          ...request.telemetry,
          node_id: request.nodeId,
          connection_state: request.state,
          last_heartbeat: request.heartbeatAt,
        },
        observedAtMs: request.heartbeatAt,
      };
    },
  };
}

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

test('Heartbeat calls the injected node lifecycle operation exactly once and ' +
  'never mutates NODES itself', async (t) => {
  initEnv();
  const requests = [];
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
    nodeLifecyclePublication: createRecordingPublication(requests),
    now: () => 1000,
  });

  await service.sendHeartbeat(null, ['partition_replica']);
  t.equal(requests.length, 1,
    'the heartbeat tick awaits the lifecycle operation exactly once');
  t.match(requests[0], {
    nodeId: 'node-owner-only-ready',
    bootIncarnation: 4,
    state: STATE.READY,
    heartbeatOnly: true,
    heartbeatAt: 1000,
  }, 'the request carries identity, boot and the lifecycle ask');
  t.notOk('readyLeaseExpiresAt' in requests[0],
    'Heartbeat never computes the READY lease; the owner grants it');
  t.equal(directNodeWrites, 0,
    'HeartbeatService never mutates the NODES row directly');
});

test('local and routed ingress adapters produce identical lifecycle publish ' +
  'requests', async (t) => {
  initEnv();
  const localRequests = [];
  const routedRequests = [];
  const shared = {
    nodeId: 'node-ready-ingress-parity',
    nodeAddress: '10.0.0.15:8080',
    bootIncarnation: 7,
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    now: () => 1000,
  };
  // Routed ingress: the reporter serializes the request into the real
  // NODE_STATE_UPDATE publication owner; the receiving replica's dispatch
  // adapter rebuilds it and calls its local lifecycle owner.
  const receivingReplica = {
    nodeLifecyclePublication: createRecordingPublication(routedRequests),
    buildMissingNodeRowError: (nodeId) => new Error(nodeId),
    ...REPLICA_DISPATCH_STATE_PUBLICATION_METHODS,
  };
  const publicationOwner = new NodeStatePublicationOwner({
    nodeId: shared.nodeId,
    nodeAddress: shared.nodeAddress,
    bootIncarnation: shared.bootIncarnation,
    delegates: {
      getNow: () => 1000,
      getLogger: () => ({info() {}, warn() {}, debug() {}, error() {}}),
      getControlPlaneKernelIngress: () => ({
        resolveNodeStateUpdateTargetCandidates: () => ['seed-1/message-group/mg-1'],
      }),
      getMessageRouter: () => ({
        deliver: async (_targetAddress, message) => ({
          acknowledged: true,
          ...(await receivingReplica.publishNodeLifecycleMessage(message)),
        }),
      }),
    },
  });
  const routed = new HeartbeatService({
    ...shared,
    cdcIntegrationService: {
      applyAuthoritativeCacheRepair: () => true,
      upsertSystemTableRow: async () => ({success: true}),
    },
    nodeStateReporter: (request) =>
      publicationOwner.sendControlPlaneNodeStateUpdate(
        nodeStateUpdateOptionsFromLifecycleRequest(request),
      ),
    nodeLifecyclePublication: createRecordingPublication([]),
  });
  const local = new HeartbeatService({
    ...shared,
    cdcIntegrationService: {
      applyAuthoritativeCacheRepair: () => true,
      upsertSystemTableRow: async () => ({success: true}),
    },
    nodeLifecyclePublication: createRecordingPublication(localRequests),
  });

  await routed.sendHeartbeat(null, ['partition_replica'], {
    requireDurableVisibility: true,
  });
  await local.sendHeartbeat(null, ['partition_replica'], {
    requireDurableVisibility: true,
  });

  t.equal(routedRequests.length, 1,
    'the routed adapter reaches the receiving replica lifecycle owner once');
  t.equal(localRequests.length, 1,
    'the local adapter calls its lifecycle owner once');
  t.same(routedRequests[0], localRequests[0],
    'both ingress adapters produce the identical publish request');
});

test('no semantic NODES mutation path exists outside the classified ' +
  'transition owners, and READY/CONNECTED publication has exactly one owner',
(t) => {
  const sites = collectNodesMutationSites();
  const classified = Object.keys(NODES_TRANSITION_OWNERS);
  t.same(
    sites.filter((site) => !classified.includes(site)),
    [],
    'every NODES mutation site holds a classified transition (a new, ' +
      'unclassified mutation path fails here)',
  );
  t.same(
    classified.filter((site) => !sites.includes(site)),
    [],
    'every classified owner is still a live site (entries only shrink)',
  );
  t.same(
    Object.entries(NODES_TRANSITION_OWNERS)
      .filter(([, owner]) => owner.transitionClass ===
        NODES_TRANSITION_CLASS.LIFECYCLE_PUBLICATION)
      .map(([site]) => site),
    ['src/control-plane/node-lifecycle-publication.js#applyPublication'],
    'NodeLifecyclePublication is the one CONNECTED/READY publisher',
  );
  const dormantFiles = [...new Set(Object.entries(NODES_TRANSITION_OWNERS)
    .filter(([, owner]) =>
      owner.transitionClass === NODES_TRANSITION_CLASS.DORMANT_DEBT)
    .map(([site]) => site.split('#')[0]))];
  for (const file of dormantFiles) {
    t.same(
      collectModuleImporters(file)
        .filter((importer) => !DORMANT_ALLOWED_IMPORTERS.includes(importer)),
      [],
      `${file} stays dormant debt: no runtime module constructs it`,
    );
  }
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
    nodeLifecyclePublication: createRecordingPublication(publications),
    setIntervalFn: () => ({unref() {}}),
    clearIntervalFn: () => {},
  });
  service.initialize();
  service.start();
  await new Promise((resolve) => setImmediate(resolve));

  t.equal(publications.length, 1,
    'startup handoff immediately wakes the existing registration');
  t.match(publications[0], {
    state: STATE.READY,
    bootIncarnation: 5,
    telemetry: {status: 'active', connection_state: STATE.READY},
  }, 'the wake asks the lifecycle owner for READY on the exact boot');
  service.stop();
});

test('R2 an event during the immediate wake is recovered by the next ' +
  'level-triggered tick', async (t) => {
  initEnv();
  const intervals = [];
  const releases = [];
  const requests = [];
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
    nodeLifecyclePublication: createRecordingPublication(requests, {
      beforeAnswer: async (count) => {
        if (count === 1) {
          await new Promise((resolve) => releases.push(resolve));
        }
      },
    }),
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
  t.equal(requests.length, 1,
    'an in-flight wake is not overlapped by a racing tick');
  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  now += 10;
  intervals[0]();
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(requests.length, 2,
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
