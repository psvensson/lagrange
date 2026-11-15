/**
 * Unit tests for Quest node-ready-lease-renewal-cadence:
 * (a) NodeReadyLeaseAuthority single canonical renewal cadence (5000 ms for a
 *     15000 ms TTL) and HeartbeatService write coalescing renewing at +5000 ms
 *     so sub-millisecond negative timer jitter at +4998 ms renews on +9998 ms
 *     before the 15000 ms lease expires;
 * (b) NodeReadyLeaseAuthority.isExpired and holdsLiveLease null-expiry
 *     semantics (ready_lease_expires_at: null is not expired and not live);
 * (c) LeaseService.sweepExpiredLeases ignoring JOINING nodes with
 *     ready_lease_expires_at: null and noteLeaseSkipObservation logging
 *     leaseExpiredForMs: null instead of now - 0 (~1.79e12 ms);
 * (d) node-readiness-policy.js null-safe timestamp parsing and
 *     isNodeReadyLeaseExplicitlyCleared({ status: 'STOPPING',
 *     ready_lease_expires_at: null }) === true;
 * (e) message-group-target-resolver.js isReadyNodeRow rejecting
 *     ready_lease_expires_at: null.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {HEARTBEAT_DEFAULT} from
  '../../src/control-plane/heartbeat-service-constants.js';
import {assembleHeartbeatService} from
  '../../src/control-plane/heartbeat-service.js';
import {
  FIXTURE_BOOT_INCARNATION,
  createNodeLifecyclePublicationFixture,
} from '../test-helpers/node-lifecycle-publication-fixture.js';
import {
  DEFAULT_RENEWAL_CADENCE_DIVISOR,
  DEFAULT_RENEWAL_INTERVAL_MS,
  DEFAULT_TTL_MS,
  NodeReadyLeaseAuthority,
  parseLeaseExpiresAt,
  resolveRenewalIntervalMs,
} from '../../src/control-plane/node-ready-lease-authority.js';
import {
  LeaseService,
  noteLeaseSkipObservation,
} from '../../src/control-plane/lease-service.js';
import {
  getNodeHeartbeatWatermark,
  getNodeLastHeartbeat,
  getNodeReadyLeaseExpiresAt,
  isNodeReadyLeaseExplicitlyCleared,
  wasNodeRecordReadyWhenWritten,
} from '../../src/node/node-readiness-policy.js';
import {isReadyNodeRow} from
  '../../src/message-group/message-group-target-resolver.js';
import {
  createMockCache,
  createMockCdc,
  HeartbeatService,
  initEnv,
  insertViaUpsert,
} from './heartbeat-memory-trend-test-helpers.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const leaseAuthorityModule = {
  DEFAULT_RENEWAL_CADENCE_DIVISOR,
  DEFAULT_RENEWAL_INTERVAL_MS,
  DEFAULT_TTL_MS,
  NodeReadyLeaseAuthority,
  parseLeaseExpiresAt,
  resolveRenewalIntervalMs,
};
const leaseServiceModule = {
  LeaseService,
  noteLeaseSkipObservation,
};
const readinessPolicyModule = {
  getNodeHeartbeatWatermark,
  getNodeLastHeartbeat,
  getNodeReadyLeaseExpiresAt,
  isNodeReadyLeaseExplicitlyCleared,
  wasNodeRecordReadyWhenWritten,
};
const targetResolverModule = {
  isReadyNodeRow,
};

test(
  'R1 NodeReadyLeaseAuthority owns the 5000ms renewal cadence and ' +
    'HeartbeatService renews before 15000ms lease expiry under -2ms jitter',
  async (t) => {
    initEnv();

    t.equal(
      leaseAuthorityModule.DEFAULT_TTL_MS,
      15000,
      'NodeReadyLeaseAuthority exports DEFAULT_TTL_MS === 15000',
    );
    t.equal(
      leaseAuthorityModule.DEFAULT_RENEWAL_CADENCE_DIVISOR,
      3,
      'NodeReadyLeaseAuthority exports DEFAULT_RENEWAL_CADENCE_DIVISOR === 3',
    );
    t.equal(
      leaseAuthorityModule.DEFAULT_RENEWAL_INTERVAL_MS,
      5000,
      'NodeReadyLeaseAuthority exports DEFAULT_RENEWAL_INTERVAL_MS === 5000',
    );
    t.equal(
      typeof leaseAuthorityModule.resolveRenewalIntervalMs,
      'function',
      'NodeReadyLeaseAuthority exports resolveRenewalIntervalMs',
    );
    t.equal(
      leaseAuthorityModule.resolveRenewalIntervalMs?.(15000),
      5000,
      'resolveRenewalIntervalMs(15000) returns 5000',
    );

    const authority = new NodeReadyLeaseAuthority({readyLeaseMs: 15000});
    t.equal(
      authority.renewalIntervalMs,
      5000,
      'authority.renewalIntervalMs is 5000 for a 15000ms lease',
    );

    t.equal(
      HEARTBEAT_DEFAULT.INTERVAL_MS,
      5000,
      'HEARTBEAT_DEFAULT.INTERVAL_MS derives from 5000ms renewal cadence',
    );
    t.equal(
      HEARTBEAT_DEFAULT.NODE_METADATA_MIN_UPDATE_INTERVAL_MS,
      5000,
      'NODE_METADATA_MIN_UPDATE_INTERVAL_MS matches 5000ms renewal cadence',
    );
    t.equal(
      HEARTBEAT_DEFAULT.NODE_METADATA_MAX_STALENESS_MS,
      5000,
      'NODE_METADATA_MAX_STALENESS_MS matches 5000ms renewal cadence',
    );

    let now = 100000;
    const nodeWrites = [];
    let currentRow = {
      node_id: 'node-cadence',
      node_address: '10.0.0.21:8080',
      boot_incarnation: TEST_BOOT_INCARNATION,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now - 5000,
      ready_lease_expires_at: now + 10000,
      created_at: now - 60000,
      storage_budget_bytes: 1024,
      storage_budget_source: 'absolute',
    };

    const service = new HeartbeatService({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-cadence',
      nodeAddress: '10.0.0.21:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async (_table, _where, updateRow) => {
          currentRow = {...currentRow, ...updateRow};
          nodeWrites.push({at: now, row: {...currentRow}});
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        insertSystemTableRow(...args) {
          return insertViaUpsert(this, args);
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: createMockCache(),
      authoritativeNodeRow: () => ({...currentRow}),
      now: () => now,
    });

    try {
      // Initial heartbeat at t = 100000 grants lease until t = 115000.
      await service.sendHeartbeat(null, ['partition_replica']);
      t.equal(nodeWrites.length, 1, 'initial heartbeat writes once');
      t.equal(
        currentRow.ready_lease_expires_at,
        115000,
        'initial READY lease expires at t = 115000',
      );

      // Tick 1 arrives with -2ms timer jitter at t = 104998 (elapsed 4998ms).
      now = 104998;
      await service.sendHeartbeat(null, ['partition_replica']);
      t.equal(
        nodeWrites.length,
        1,
        'sub-5000ms tick at +4998ms is coalesced',
      );

      // Tick 2 arrives 5000ms later at t = 109998 (elapsed 9998ms >= 5000ms).
      // With 5000ms renewal cadence, this tick MUST write and renew the lease
      // to 124998 (5002ms before the initial 115000 lease expires).
      now = 109998;
      await service.sendHeartbeat(null, ['partition_replica']);
      t.equal(
        nodeWrites.length,
        2,
        'tick at +9998ms renews the READY lease instead of deferring to +15000ms',
      );
      t.equal(
        currentRow.ready_lease_expires_at,
        124998,
        'renewed READY lease extends to t = 124998 before 115000 expiry',
      );
      t.equal(
        authority.holdsLiveLease(currentRow, 115000),
        true,
        'node still holds a live READY lease at the original 115000 deadline',
      );
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'R2 NodeReadyLeaseAuthority treats ready_lease_expires_at: null as ' +
    'neither expired nor live',
  (t) => {
    const now = 1794661095516;
    const authority = new NodeReadyLeaseAuthority({readyLeaseMs: 15000});

    t.equal(
      typeof leaseAuthorityModule.parseLeaseExpiresAt,
      'function',
      'NodeReadyLeaseAuthority exports parseLeaseExpiresAt',
    );
    t.equal(
      leaseAuthorityModule.parseLeaseExpiresAt?.({ready_lease_expires_at: null}),
      null,
      'parseLeaseExpiresAt returns null for null',
    );
    t.equal(
      leaseAuthorityModule.parseLeaseExpiresAt?.({
        ready_lease_expires_at: undefined,
      }),
      null,
      'parseLeaseExpiresAt returns null for undefined',
    );
    t.equal(
      leaseAuthorityModule.parseLeaseExpiresAt?.({ready_lease_expires_at: ''}),
      null,
      'parseLeaseExpiresAt returns null for empty string',
    );
    t.equal(
      leaseAuthorityModule.parseLeaseExpiresAt?.({
        ready_lease_expires_at: false,
      }),
      null,
      'parseLeaseExpiresAt returns null for boolean',
    );
    t.equal(
      leaseAuthorityModule.parseLeaseExpiresAt?.({ready_lease_expires_at: 0}),
      null,
      'parseLeaseExpiresAt returns null for non-positive 0',
    );

    t.equal(
      authority.isExpired({ready_lease_expires_at: null}, now),
      false,
      'isExpired({ ready_lease_expires_at: null }, now) must be false',
    );
    t.equal(
      authority.holdsLiveLease({ready_lease_expires_at: null}, now),
      false,
      'holdsLiveLease({ ready_lease_expires_at: null }, now) must be false',
    );
    t.equal(
      authority.holdsLiveLease({ready_lease_expires_at: null}, -10),
      false,
      'holdsLiveLease({ ready_lease_expires_at: null }, -10) must be false',
    );
    t.equal(
      authority.isExpired({ready_lease_expires_at: now}, now),
      true,
      'finite positive lease at now is expired',
    );
    t.equal(
      authority.holdsLiveLease({ready_lease_expires_at: now + 1}, now),
      true,
      'finite positive lease after now is live',
    );
    t.end();
  },
);

test(
  'R3 LeaseService.sweepExpiredLeases does not sweep JOINING nodes with ' +
    'ready_lease_expires_at: null and never logs 1.79e12ms in ' +
    'noteLeaseSkipObservation',
  async (t) => {
    initEnv();
    const now = 1794661095516;
    const connectedJoiningNode = {
      node_id: 'node-joining-connected',
      status: 'joining',
      connection_state: STATE.CONNECTED,
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
    };
    const disconnectedJoiningNode = {
      node_id: 'node-joining-disconnected',
      status: 'joining',
      connection_state: STATE.CONNECTED,
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
    };

    let disconnectWrites = 0;
    const infoLogs = [];
    const leaseService = new LeaseService({
      nodeId: 'node-seed',
      messageGroupServices: new Map([
        ['mg-1', {isLeaderReplica: () => true}],
      ]),
      messageRouter: {
        getConnectionState: (nodeId) =>
          nodeId === connectedJoiningNode.node_id ?
            STATE.CONNECTED :
            STATE.DISCONNECTED,
      },
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: async () => ({
          success: true,
          rows: [connectedJoiningNode, disconnectedJoiningNode],
        }),
      },
      nodeLeaseOwner: {
        disconnectNodeDueToLeaseExpiry: async () => {
          disconnectWrites += 1;
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        reapStrandedJoiningNodeRow: async () => ({
          success: true,
          partitionResult: {affectedRows: 0},
        }),
      },
      cdcIntegrationService: createMockCdc(),
      systemTableCache: createMockCache(),
      now: () => now,
      setIntervalFn: () => ({unref() {}}),
      clearIntervalFn: () => {},
    });
    leaseService.initialize();
    leaseService.logger = {
      info: (msg, meta) => {
        infoLogs.push({msg, meta});
      },
      warn: () => {},
      error: () => {},
      debug: () => {},
    };

    try {
      await leaseService.sweepExpiredLeases();

      const skippedLogs = infoLogs.filter(
        (entry) => entry.meta?.skippedNodeId === connectedJoiningNode.node_id,
      );
      t.equal(
        skippedLogs.length,
        0,
        'connected JOINING node with null lease is not logged as expired-skip',
      );
      t.equal(
        disconnectWrites,
        0,
        'disconnected JOINING node with null lease is not swept as expired',
      );

      t.equal(
        typeof leaseServiceModule.noteLeaseSkipObservation,
        'function',
        'lease-service exports noteLeaseSkipObservation',
      );
      const skipObservation = leaseServiceModule.noteLeaseSkipObservation?.(
        new Map(),
        connectedJoiningNode,
        now,
      );
      t.equal(
        skipObservation?.leaseExpiredForMs,
        null,
        'noteLeaseSkipObservation returns leaseExpiredForMs: null for null lease',
      );
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'R4 node-readiness-policy.js returns null for null timestamps and ' +
    'recognizes ready_lease_expires_at: null as explicitly cleared',
  (t) => {
    t.equal(
      typeof readinessPolicyModule.getNodeReadyLeaseExpiresAt,
      'function',
      'node-readiness-policy exports getNodeReadyLeaseExpiresAt',
    );
    t.equal(
      readinessPolicyModule.getNodeReadyLeaseExpiresAt?.({
        ready_lease_expires_at: null,
      }),
      null,
      'getNodeReadyLeaseExpiresAt({ ready_lease_expires_at: null }) is null',
    );
    t.equal(
      readinessPolicyModule.getNodeLastHeartbeat?.({
        last_heartbeat: null,
      }),
      null,
      'getNodeLastHeartbeat({ last_heartbeat: null }) is null',
    );
    t.same(
      readinessPolicyModule.getNodeHeartbeatWatermark({
        last_heartbeat: null,
        lastHeartbeatAt: null,
        ready_lease_expires_at: null,
        readyLeaseExpires: null,
        connection_state: 'CONNECTED',
      }),
      {
        lastHeartbeat: null,
        readyLeaseExpiresAt: null,
        connectionState: 'connected',
      },
      'getNodeHeartbeatWatermark does not coerce null timestamps to 0',
    );
    t.equal(
      readinessPolicyModule.isNodeReadyLeaseExplicitlyCleared({
        status: 'STOPPING',
        ready_lease_expires_at: null,
      }),
      true,
      'isNodeReadyLeaseExplicitlyCleared returns true for STOPPING + null lease',
    );
    t.equal(
      readinessPolicyModule.isNodeReadyLeaseExplicitlyCleared({
        status: SERVICE_STATUS.ACTIVE,
        ready_lease_expires_at: null,
        readyLeaseExpires: null,
      }),
      true,
      'isNodeReadyLeaseExplicitlyCleared returns true when null reaches Number()',
    );
    t.equal(
      readinessPolicyModule.isNodeReadyLeaseExplicitlyCleared({
        status: SERVICE_STATUS.ACTIVE,
        ready_lease_expires_at: 15000,
      }),
      false,
      'isNodeReadyLeaseExplicitlyCleared returns false for finite lease',
    );
    t.equal(
      readinessPolicyModule.wasNodeRecordReadyWhenWritten(
        {
          status: SERVICE_STATUS.ACTIVE,
          last_heartbeat: null,
          ready_lease_expires_at: 100,
        },
        {now: 5000},
      ),
      false,
      'wasNodeRecordReadyWhenWritten falls back to options.now when last_heartbeat is null',
    );
    t.equal(
      readinessPolicyModule.wasNodeRecordReadyWhenWritten(
        {
          status: SERVICE_STATUS.ACTIVE,
          last_heartbeat: -5,
          ready_lease_expires_at: null,
        },
        {now: -5},
      ),
      false,
      'wasNodeRecordReadyWhenWritten rejects null lease even for negative clock',
    );
    t.end();
  },
);

test(
  'R5 message-group-target-resolver isReadyNodeRow rejects ' +
    'ready_lease_expires_at: null',
  (t) => {
    t.equal(
      typeof targetResolverModule.isReadyNodeRow,
      'function',
      'message-group-target-resolver exports isReadyNodeRow',
    );
    t.equal(
      targetResolverModule.isReadyNodeRow?.(
        {
          node_id: 'node-1',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.READY,
          ready_lease_expires_at: null,
        },
        1000,
      ),
      false,
      'isReadyNodeRow rejects ready_lease_expires_at: null at positive nowMs',
    );
    t.equal(
      targetResolverModule.isReadyNodeRow?.(
        {
          node_id: 'node-1',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.READY,
          ready_lease_expires_at: null,
        },
        -10,
      ),
      false,
      'isReadyNodeRow rejects ready_lease_expires_at: null even when nowMs < 0',
    );
    t.equal(
      targetResolverModule.isReadyNodeRow?.(
        {
          node_id: 'node-1',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.READY,
          ready_lease_expires_at: 2000,
        },
        1000,
      ),
      true,
      'isReadyNodeRow accepts READY row with live positive lease',
    );
    t.end();
  },
);

test(
  'assembleHeartbeatService derives 2000 ms heartbeat and metadata coalescing ' +
    'intervals from readyLeaseMs: 6000 so a 6 s lease renews every 2 s without ' +
    'manual internal overrides',
  async (t) => {
    initEnv();
    const configuredLeaseMs = 6000;
    const expectedCadenceMs = resolveRenewalIntervalMs(configuredLeaseMs);
    t.equal(expectedCadenceMs, 2000);
    let nowMs = 100_000;
    const nodeWrites = [];
    const cdc = {
      insertSystemTableRow: async () => ({
        success: true,
        partitionResult: {affectedRows: 1},
      }),
      updateSystemTableRow: async (tableName, whereClause, row) => {
        if (tableName === 'nodes') {
          nodeWrites.push({at: nowMs, whereClause, row: {...row}});
        }
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      upsertSystemTableRow: async () => ({success: true}),
    };
    const cache = createMockCache();
    const service = assembleHeartbeatService({
      nodeId: 'node-short-lease',
      nodeAddress: '127.0.0.1:8080',
      bootIncarnation: FIXTURE_BOOT_INCARNATION,
      readyLeaseMs: configuredLeaseMs,
      cdcIntegrationService: cdc,
      systemTableCache: cache,
      nodeLifecyclePublication: createNodeLifecyclePublicationFixture({
        nodeId: 'node-short-lease',
        bootIncarnation: FIXTURE_BOOT_INCARNATION,
        readyLeaseMs: configuredLeaseMs,
        controlPlaneSystemTableGateway: cdc,
        systemTableCache: cache,
        now: () => nowMs,
      }),
      now: () => nowMs,
    });
    t.equal(service.readyLeaseMs, 6000);
    t.equal(service.heartbeatIntervalMs, 2000);
    t.equal(service.nodeMetadataMinUpdateIntervalMs, 2000);
    t.equal(service.nodeMetadataMaxStalenessMs, 2000);

    await service.sendHeartbeat(null, ['partition_replica']);
    t.equal(nodeWrites.length, 1, 'initial heartbeat writes at t=100000');
    t.equal(nodeWrites[0].row.ready_lease_expires_at, 106_000);

    nowMs = 102_000;
    await service.sendHeartbeat(null, ['partition_replica']);
    t.equal(nodeWrites.length, 2, 'heartbeat renews at +2000 ms');
    t.equal(nodeWrites[1].row.ready_lease_expires_at, 108_000);

    nowMs = 104_000;
    await service.sendHeartbeat(null, ['partition_replica']);
    t.equal(
      nodeWrites.length,
      3,
      'heartbeat renews at +4000 ms before 106000 expiry',
    );
    t.equal(nodeWrites[2].row.ready_lease_expires_at, 110_000);
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    t.end();
  },
);
