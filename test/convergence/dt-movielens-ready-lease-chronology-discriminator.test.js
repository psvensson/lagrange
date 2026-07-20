import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {
  createReadOnlyCache,
} from '../../src/cache/read-only-system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  ControlPlaneSnapshotOwner,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {
  ReplicaDispatchService,
} from '../../src/control-plane/replica-dispatch-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDCEvent,
  CDCHandler,
} from '../../src/message-group/cdc-handler.js';
import {
  waitForAffinityDemoSchemaAdmission,
} from '../../examples/service-data-affinity/affinity-demo-preload-gate.js';
import {
  buildAffinityDemoLiveReport,
} from '../../examples/service-data-affinity/affinity-demo-live-report.js';

const NODE_ID = 'node-chronology';
const OLD_OWNER_WRITE_AT_MS = 1_000;
const OLD_CDC_OBSERVED_AT_MS = 1_500;
const PRODUCER_HEARTBEAT_AT_MS = 3_000;
const SNAPSHOT_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function buildInitialNodeRow() {
  return {
    node_id: NODE_ID,
    node_address: '127.0.0.1:8084',
    status: 'active',
    connection_state: 'ready',
    capabilities: '["partition_replica"]',
    last_heartbeat: OLD_OWNER_WRITE_AT_MS,
    ready_lease_expires_at: 61_000,
    updated_at_hlc: `${OLD_OWNER_WRITE_AT_MS}-0-old-write-owner`,
  };
}

function applyCdcRow(handler, row, receivedAtMs, envelopeHlc) {
  const event = new CDCEvent(
    'nodes',
    CDC_OPERATIONS.UPDATE,
    row,
    envelopeHlc,
  );
  event.receivedAt = receivedAtMs;
  handler.applyImmediate(event, {skipSubscriptionCheck: true});
}

function buildLocalSnapshot(capturedAt) {
  return {
    capturedAt,
    replicaOperations: {
      inFlightCount: 0,
      staleInFlightCount: 0,
      rows: [],
    },
    leaders: {'nodes-p1': 'node-seed'},
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation: {
        state: 'available',
        capturedAt,
        satisfied: true,
        priorityPartitionSummary: {
          satisfied: true,
          totalSpreadGap: 0,
          blockedPartitions: [],
        },
        leaderCoverage: {
          satisfied: true,
          missingLeaderPartitionCount: 0,
          missingLeaderPartitionIds: [],
        },
      },
    },
  };
}

async function resolveSnapshot(readOnlyCache, writableCache, capturedAt) {
  const controlSnapshot = new AdminControlSnapshot({
    nodeId: 'node-seed',
    systemTableCache: readOnlyCache,
    cacheMutationTarget: writableCache,
    ensureAuthoritativeDiscoveryCacheRepair: async () => ({applied: true}),
    nowFn: () => capturedAt,
  });
  const owner = new ControlPlaneSnapshotOwner({controlSnapshot});
  return owner.resolveControlSnapshot(
    buildLocalSnapshot(capturedAt),
    {allowAuthoritativeRepair: false},
  );
}

function buildHeartbeatService(options = {}) {
  return new HeartbeatService({
    nodeId: NODE_ID,
    nodeAddress: '127.0.0.1:8084',
    systemTableCache: options.systemTableCache,
    controlPlaneSystemTableGateway: {
      updateSystemTableRow: async () => ({
        success: true,
        partitionResult: {affectedRows: 1},
      }),
      upsertSystemTableRow: async () => ({
        success: true,
        partitionResult: {affectedRows: 1},
      }),
    },
    isNodeLifecycleReady: () => true,
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5_000,
    nodeStateReporter: options.nodeStateReporter,
    now: () => options.nowMs,
  });
}

test('production seams retain owner-write to CDC chronology in MovieLens report',
  async (t) => {
    initializeEnvironment();
    const writableCache = new SystemTableCache();
    const readOnlyCache = createReadOnlyCache(writableCache);
    const cdcHandler = new CDCHandler(writableCache);
    const initialRow = buildInitialNodeRow();
    applyCdcRow(
      cdcHandler,
      initialRow,
      OLD_CDC_OBSERVED_AT_MS,
      '2000-0-receiving-replica',
    );

    let ownerWriteCount = 0;
    const failedHeartbeat = buildHeartbeatService({
      systemTableCache: readOnlyCache,
      nowMs: 2_000,
      nodeStateReporter: async () => {
        throw new Error('canonical node-state publication unavailable');
      },
    });
    await t.rejects(
      failedHeartbeat.sendHeartbeat(null, ['partition_replica']),
      /canonical node-state publication unavailable/,
      'the real heartbeat intent path reports publication failure',
    );
    t.equal(ownerWriteCount, 0, 'publication failure cannot invent an owner write');

    const failedPublicationSnapshot = await resolveSnapshot(
      readOnlyCache,
      writableCache,
      70_000,
    );
    t.match(
      failedPublicationSnapshot.controlPlaneDiagnostics.readyLeaseAgeWitness,
      {
        state: 'available',
        nodeId: NODE_ID,
        ownerWrite: {
          state: 'available',
          atMs: OLD_OWNER_WRITE_AT_MS,
        },
        cdcObservation: {
          state: 'available',
          observedAtMs: OLD_CDC_OBSERVED_AT_MS,
        },
      },
      'failed publication leaves the last visible owner/CDC chain explicit',
    );

    let pendingCdcRow = null;
    let producerPayload = null;
    const dispatchGateway = {
      async updateSystemTableRow(tableName, _whereClause, row) {
        ownerWriteCount += 1;
        const ownerWriteAtMs = row.last_heartbeat;
        pendingCdcRow = {
          ...row,
          updated_at_hlc: `${ownerWriteAtMs}-0-canonical-write-owner`,
        };
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async upsertSystemTableRow() {
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    };
    const dispatchService = new ReplicaDispatchService({
      nodeId: 'node-seed',
      messageRouter: {},
      cdcIntegrationService: dispatchGateway,
      controlPlaneSystemTableGateway: dispatchGateway,
      systemTableCache: readOnlyCache,
      controlPlaneReadinessService: {},
      rebalanceCoordinator: {
        executeOperation: async () => ({success: true}),
      },
    });
    dispatchService.initialize();

    const heartbeat = buildHeartbeatService({
      systemTableCache: readOnlyCache,
      nowMs: PRODUCER_HEARTBEAT_AT_MS,
      nodeStateReporter: async (payload) => {
        producerPayload = payload;
        await dispatchService.handleNodeStateUpdate(payload);
        return {
          publicationPath: 'node_state_reporter',
          targetAddress: 'node-seed/message-group/nodes-p1',
        };
      },
    });

    try {
      await heartbeat.sendHeartbeat(null, ['partition_replica']);

      t.equal(ownerWriteCount, 1, 'canonical publication owner writes once');
      t.ok(
        pendingCdcRow.last_heartbeat > producerPayload.heartbeatAt,
        'write owner rebases delivery delay instead of consuming sender lease',
      );
      t.equal(
        pendingCdcRow.ready_lease_expires_at,
        pendingCdcRow.last_heartbeat + dispatchService.readyLeaseMs,
        'canonical owner still mints the unchanged full ready lease',
      );

      const ownerWriteAtMs = pendingCdcRow.last_heartbeat;
      const cdcObservedAtMs =
        ownerWriteAtMs + dispatchService.readyLeaseMs + 5_000;
      applyCdcRow(
        cdcHandler,
        pendingCdcRow,
        cdcObservedAtMs,
        `${cdcObservedAtMs}-0-receiving-replica`,
      );
      const capturedAt = cdcObservedAtMs + 1_000;
      const staleSnapshot = await resolveSnapshot(
        readOnlyCache,
        writableCache,
        capturedAt,
      );
      const witness =
        staleSnapshot.controlPlaneDiagnostics.readyLeaseAgeWitness;

      t.equal(witness.nodeId, NODE_ID);
      t.equal(witness.ownerWrite.atMs, ownerWriteAtMs);
      t.equal(witness.cdcObservation.observedAtMs, cdcObservedAtMs);
      t.equal(
        witness.cdcObservation.ownerToCdcDelayMs,
        dispatchService.readyLeaseMs + 5_000,
        'per-key receipt exposes CDC delay beyond the owner-minted lease',
      );
      t.equal(witness.readyLease.ageMs, 6_000);
      t.equal(
        staleSnapshot.snapshotObservation.state,
        'stale_usable',
        'the witness does not weaken snapshot freshness',
      );

      let nowMs = capturedAt;
      const schemaError = await t.rejects(
        waitForAffinityDemoSchemaAdmission({
          target: SNAPSHOT_TARGET,
          query: async () => ({rows: [staleSnapshot]}),
          now: () => nowMs,
          sleep: async () => {
            nowMs += 1;
          },
          timeoutMs: 1,
          pollIntervalMs: 0,
          stableWindowMs: 0,
        }),
        /MovieLens schema admission timed out/,
      );
      const report = buildAffinityDemoLiveReport({
        timestamp: '2026-07-20T18:30:00.000Z',
        error: schemaError,
      });
      const reportWitness = report.standardSummary.scenarios[0].detail
        .schemaAdmission.snapshot.readyLeaseAgeWitness;

      t.same(
        reportWitness,
        witness,
        'the same bounded chronology reaches the sealed MovieLens report',
      );
      t.equal(
        schemaError.message,
        'MovieLens schema admission timed out: ' +
          'snapshot_query_error=control snapshot observation failed ' +
          '(stale_usable): cache_stale_watermark',
        'chronology values stay out of stable admission error identity',
      );
    } finally {
      dispatchService.stop();
      cdcHandler.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
    t.end();
  });
