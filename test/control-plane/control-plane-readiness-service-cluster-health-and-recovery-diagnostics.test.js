import {test} from '../../src/test-helpers/tap.js';
import {
  createAccountingService,
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';
import {
  COLUMN,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  PROJECTION_READINESS_CONTRACT_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
} from '../../src/control-plane/projection-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
} from '../../src/cdc/cdc-integration-service.js';
import {
} from '../../src/control-plane/priority-recovery-snapshot.js';


test('isClusterMemberHealthy returns true for transport-connected ready ' +
  'node with expired lease but recent heartbeat ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies stale-ready heartbeat grace)', async (t) => {
  const now = 120000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-cache-lag-remote'),
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.LAST_HEARTBEAT]: now - 5000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 2000,
    }],
    services: [createMessageGroupService('node-cache-lag-remote')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-cache-lag-remote': {
        nodeId: 'node-cache-lag-remote',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService
    .getNodeReadiness('node-cache-lag-remote');

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'transport-connected node should stay cluster-member-healthy while heartbeat evidence is still fresh');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'transport-connected node with fresh heartbeat grace should keep control-plane writes admitted');
  t.equal(readiness.dimensions.serveEligible, true,
    'transport-connected node with fresh heartbeat grace should stay serve-eligible');
  t.end();
});

// ── Remote-peer "slow, not dead" grace (§1.4.12 lease-sweep parity) ──
// Reproduces run1 MODE-A: a coordinator with lagging heartbeat INGESTION
// (its own "Heartbeat failing repeatedly") sees a healthy, transport-
// connected, connection-ready peer as ~195s heartbeat-stale and denies all
// placement onto it — zeroing the eligible-node set and stranding a data
// table at 1/3. Live router state must veto the stale INGESTED heartbeat.
test('isClusterMemberHealthy grants remote membership on live transport ' +
  'when the ingested heartbeat is stale (CDC ingest-lag parity with ' +
  'lease-sweep) ' +
  '(uses ControlPlaneReadinessService.getNodeReadiness, verifies the ' +
  'remote-peer slow-not-dead grace)', async (t) => {
  const now = 500000;
  const nodeId = 'node-ingest-lag-remote';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.LAST_HEARTBEAT]: now - 195000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 2000,
    }],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {nodeId, budgetBytes: 1000, pressureState: 'normal'},
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'a transport-connected, connection-ready remote peer with a stale ' +
    'INGESTED heartbeat must stay cluster-member-healthy (live router ' +
    'vetoes the stale cached heartbeat)');
  t.equal(readiness.dimensions.provisioningEligible, true,
    'the live-transport grace must restore provisioning eligibility so ' +
    'placement is not stranded by an ingest-lag transient');
  t.end();
});

test('isClusterMemberHealthy denies a stale-heartbeat remote peer when the ' +
  'LIVE router state is absent (cached connection_state=ready alone is ' +
  'insufficient — the grace fails closed) ' +
  '(uses ControlPlaneReadinessService.getNodeReadiness)', async (t) => {
  const now = 500000;
  const nodeId = 'node-no-live-router';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.LAST_HEARTBEAT]: now - 195000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 2000,
    }],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      // No live router entry for the peer: the cached rowState=ready still
      // passes the transport-connected fallback, but the grace must require
      // the LIVE routerState, so a genuinely-untracked peer fails closed.
      getConnectionState() {
        return '';
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {nodeId, budgetBytes: 1000, pressureState: 'normal'},
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'without live router evidence, a stale-heartbeat peer must not be ' +
    'graced into cluster membership on a cached connection_state alone');
  t.end();
});

test('load-lane readiness forces fresh evaluation on cache invalidation ' +
  'instead of serving stale snapshot ' +
  '(uses ControlPlaneReadinessService.getNodeReadiness, ' +
  'verifies load-lane does not use allowStaleOnCacheChange)',
async (t) => {
  const now = 120000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-cache-lag'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
    }],
    services: [createMessageGroupService('node-cache-lag')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-cache-lag': {
        nodeId: 'node-cache-lag',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const first = await readinessService.getNodeReadiness(
    'node-cache-lag',
    {maxCachedAgeMs: 5000},
  );
  t.equal(first.dimensions.serveEligible, true,
    'initial snapshot must be serve-eligible');

  readinessService.handleCacheChange(TABLES.SERVICES, {
    [COLUMN.NODE_ID]: 'node-cache-lag',
    [COLUMN.SERVICE_ID]: 'svc-changed',
  });

  const second = await readinessService.getNodeReadiness(
    'node-cache-lag',
    {
      maxCachedAgeMs: 5000,
      allowStaleOnCacheChange: false,
      requireFreshOnIneligible: true,
      decisionDimension:
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );

  t.not(first, second,
    'cache invalidation must force fresh evaluation when ' +
    'allowStaleOnCacheChange is false');
  t.end();
});

// ── Self-node admission denial regression (§1.4.12) ────────────────
// Reproduces: 7-node partition-split harness node 11601fe0 self-denial
// during CDC propagation delay. The local node's cache has an expired
// ready_lease_expires_at because the heartbeat CDC event has not
// propagated back yet. The node must NOT deny its own cluster membership
// when it is the one running the readiness check.

test('isClusterMemberHealthy returns true for self-node with expired ' +
  'lease and stale row connection_state ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 self-node fast path)',
async (t) => {
  const now = 200000;
  const selfNodeId = 'node-self';
  // Simulate CDC propagation delay: the node row in cache has an
  // expired lease AND a stale/missing connection_state. The
  // messageRouter also returns null (no connection entry). This
  // reproduces the 7-node harness scenario where node 11601fe0
  // denied its own load-lane admission during a partition split.
  const cache = createCache({
    nodes: [{
      ...createActiveNode(selfNodeId),
      [COLUMN.LAST_HEARTBEAT]: now - 35000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 10000,
    }],
    services: [createMessageGroupService(selfNodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: selfNodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      [selfNodeId]: {
        nodeId: selfNodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService
    .getNodeReadiness(selfNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'self-node must remain cluster-member-healthy despite expired ' +
    'lease and no transport evidence — the node is alive and ' +
    'running the check (§1.4.12)');
  t.equal(readiness.dimensions.serveEligible, true,
    'self-node must remain serve-eligible when only the cache ' +
    'lease is stale');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'self-node must remain control-plane-writable when only the ' +
    'cache lease is stale');
  t.end();
});

test('isClusterMemberHealthy self-node fast path does not apply to ' +
  'remote nodes ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 self-node scope)',
async (t) => {
  const now = 200000;
  const selfNodeId = 'node-self';
  const remoteNodeId = 'node-remote';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(remoteNodeId),
      [COLUMN.LAST_HEARTBEAT]: now - 35000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 10000,
    }],
    services: [createMessageGroupService(remoteNodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: selfNodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      [remoteNodeId]: {
        nodeId: remoteNodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService
    .getNodeReadiness(remoteNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'remote node with expired lease and no transport must be ' +
    'cluster-member-unhealthy — self-node fast path must not ' +
    'apply to other nodes');
  t.end();
});

test('isClusterMemberHealthy self-node fast path requires active ' +
  'status ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 self-node scope)',
async (t) => {
  const now = 200000;
  const selfNodeId = 'node-self-inactive';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(selfNodeId),
      [COLUMN.STATUS]: 'shutting_down',
      [COLUMN.LAST_HEARTBEAT]: now - 35000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 10000,
    }],
    services: [createMessageGroupService(selfNodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: selfNodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      [selfNodeId]: {
        nodeId: selfNodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService
    .getNodeReadiness(selfNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'self-node with non-active status must not use the self-node ' +
    'fast path — shutting_down nodes are not healthy cluster ' +
    'members');
  t.end();
});

test('ControlPlaneReadinessService retains recovery admission on live ' +
  'transport and service evidence', async (t) => {
  const now = 500000;
  const nodeId = 'node-recovery-grace';
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [{
        ...createActiveNode(nodeId),
        [COLUMN.LAST_HEARTBEAT]: now - 60000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
      }],
      services: [createMessageGroupService(nodeId)],
    }),
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-backed reconciliation should not keep cluster membership healthy');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'active control-plane service evidence should not remain writable without membership evidence');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'recovery eligibility should stay open on live transport and service evidence');
  t.equal(readiness.dimensions.repairEligible, false,
    'transport-backed recovery grace must not keep repair admission open');
  t.end();
});

test('ControlPlaneReadinessService records recovery participation ' +
  'decisions in the diagnostics ledger', (t) => {
  const nodeId = 'node-recovery-ledger';
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });
  readinessService.recordAuthoritativeReadinessRepair({
    nodeId,
    repairKey: 'repair:node-participation-ledger',
    stage: 'completed',
    outcome: 'repaired',
    repaired: true,
    serviceRowCount: 1,
  });

  const participation = readinessService.getControlPlaneParticipationSync(
    nodeId,
    {
      participationKind:
        CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY,
      decisionDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      tableName: TABLES.SERVICES,
      partitionId: 'services-p1',
    },
  );
  const ledgerEntries =
    readinessService.getParticipationDecisionLedgerEntries();
  const latestEntry = ledgerEntries[ledgerEntries.length - 1] || null;

  t.equal(participation.eligible, true, 'recovery participation should pass');
  t.match(latestEntry, {
    nodeId,
    tableName: TABLES.SERVICES,
    partitionId: 'services-p1',
    participationKind:
      CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY,
    decisionDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    eligible: true,
    cacheWatermark: {
      lastHeartbeat: 1000,
      readyLeaseExpiresAt: 2000,
    },
    transportState: {
      connected: true,
      rowState: null,
      routerState: 'connected',
    },
    authoritativeRepair: {
      stage: 'completed',
      outcome: 'repaired',
      repaired: true,
      serviceRowCount: 1,
    },
    lifecyclePhase: 'active',
  });
  t.end();
});

test('ControlPlaneReadinessService records authoritative repair attempts ' +
  'and recovery epochs', async (t) => {
  let now = 520000;
  const nodeId = 'node-recovery-epoch';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: 'syncing',
    }],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName) {
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.LAST_HEARTBEAT]: now - 25,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 15000,
            }],
            source: 'sql_query_engine',
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
            source: 'sql_query_engine',
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  await readinessService.getNodeReadiness(nodeId, {
    allowAuthoritativeRefresh: false,
  });
  now += 1000;
  const repairedReadiness = await readinessService.getNodeReadiness(
    nodeId,
    {allowAuthoritativeRefresh: true},
  );
  const repairStages =
    readinessService.getAuthoritativeReadinessRepairLedgerEntries()
      .map((entry) => entry.stage);
  const recoveryEpochs =
    readinessService.getRecoveryEpochHistoryByNodeId()[nodeId] || [];

  t.equal(repairedReadiness.dimensions.clusterMemberHealthy, true,
    'authoritative repair should restore healthy membership');
  t.ok(repairStages.includes('scheduled'),
    'repair ledger should retain the scheduled stage');
  t.ok(repairStages.includes('completed'),
    'repair ledger should retain the completed stage');
  t.equal(recoveryEpochs.length, 1,
    'closed recovery history should retain one completed epoch');
  t.equal(recoveryEpochs[0].open, false,
    'repaired readiness should close the recovery epoch');
  t.ok(recoveryEpochs[0].events.length >= 2,
    'recovery epoch should retain both degraded and recovered observations');
  t.end();
});

test('ControlPlaneReadinessService getNodeReadiness remains read-only for ' +
  'lifecycle and placement state when no authoritative refresh is requested',
async (t) => {
  const nodeId = 'node-read-only';
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    cacheMutationTarget: {
      applySystemTableChange() {
        t.fail('readiness projection must not mutate cached lifecycle or placement rows');
      },
    },
    controlPlaneSystemTableGateway: {
      reconcileAuthoritativeCacheRows() {
        t.fail('readiness projection must not reconcile authoritative rows without an explicit refresh path');
      },
      submitMutation() {
        t.fail('readiness projection must not submit lifecycle or placement mutations');
      },
      executeQuery() {
        t.fail('readiness projection must not execute write queries');
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 610000,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId, {
    allowAuthoritativeRefresh: false,
  });

  t.equal(typeof readiness.dimensions.repairEligible, 'boolean',
    'readiness should still derive repair eligibility as projection state');
  t.equal(typeof readiness.dimensions.placementEligible, 'boolean',
    'readiness should still derive placement eligibility as projection state');
  t.end();
});

test('ControlPlaneReadinessService authoritative refresh reconciles ' +
  'projection cache evidence without submitting lifecycle or placement writes',
async (t) => {
  let now = 620000;
  const nodeId = 'node-projection-reconcile-only';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: 'syncing',
    }],
  });
  const gatewayCalls = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: {
      applySystemTableChange() {
        t.fail('authoritative refresh must delegate projection repair through the gateway');
      },
    },
    controlPlaneSystemTableGateway: {
      async reconcileAuthoritativeCacheRows(tableName, rows, options) {
        gatewayCalls.push({tableName, rows, options});
        return {
          success: true,
          mutationCount: Array.isArray(rows) ? rows.length : 0,
        };
      },
      submitMutation() {
        t.fail('authoritative readiness refresh must not submit lifecycle or placement mutations');
      },
      executeQuery() {
        t.fail('authoritative readiness refresh must not execute write queries');
      },
    },
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName) {
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.LAST_HEARTBEAT]: now - 25,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 15000,
            }],
            source: 'sql_query_engine',
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
            source: 'sql_query_engine',
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  await readinessService.getNodeReadiness(nodeId, {
    allowAuthoritativeRefresh: false,
  });
  now += 1000;
  const repairedReadiness = await readinessService.getNodeReadiness(nodeId, {
    allowAuthoritativeRefresh: true,
    decisionDimension: 'repairEligible',
  });

  t.equal(typeof repairedReadiness.dimensions.repairEligible, 'boolean',
    'authoritative refresh should still return one projected readiness snapshot');
  t.same(
    gatewayCalls.map((call) => call.tableName),
    [TABLES.NODES, TABLES.SERVICES, TABLES.PARTITIONS],
    'authoritative refresh should reconcile projected node, service, and partition rows',
  );
  t.ok(gatewayCalls.every((call) => call.options?.causeId),
    'authoritative refresh should preserve reconciliation cause ids');
  t.end();
});

test('ControlPlaneReadinessService exposes controlPlanePublished while keeping recovery eligibility open during publication convergence', async (t) => {
  const now = 610000;
  const nodeId = 'node-publication-pending';
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    membershipPublicationService: {
      getLatestPublicationForNode(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          publicationEpoch: 14,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: [nodeId],
          requiredAckNodeIds: [nodeId],
          acknowledgedNodeIds: [],
        };
      },
    },
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId);

  t.equal(
    readiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
    ],
    false,
    'canonical readiness should expose a false controlPlanePublished dimension until the durable publication epoch is closed',
  );
  t.equal(
    readiness.dimensions.controlPlaneRecoveryEligible,
    true,
    'recovery eligibility should stay open while the publication epoch is still awaiting acknowledgement so recovery traffic can finish convergence',
  );
  t.match(readiness.projectionReadinessContract, {
    state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
    ready: false,
    recoveryOpen: true,
    publication: {
      ready: false,
      boundaryOutcome: {
        ready: false,
        active: true,
      },
    },
    readiness: {
      recoveryEligible: true,
      serveEligible: false,
    },
    priorityRecovery: {
      active: true,
    },
  }, 'readiness should expose one canonical projection/readiness contract');
  t.equal(
    readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE],
    false,
    'serveEligible dimension should consume the projection serve lane',
  );
  t.equal(
    readiness.projectionReadinessContract.lanes.repair.ready,
    true,
    'repair lane should stay open for publication convergence',
  );
  t.equal(
    readiness.projectionReadinessContract.lanes.serve.ready,
    false,
    'serve lane should stay closed until publication convergence is ready',
  );
  t.equal(
    readiness.projectionReadinessContract.activeGate.state,
    PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY,
    'readiness should expose downstream active-gate repair state',
  );
  const participation = await readinessService.getControlPlaneParticipation(
    nodeId,
    {
      maxCachedAgeMs: 0,
      participationKind:
        CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY,
    },
  );
  t.equal(
    participation.summary.projectionReadinessState,
    PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
    'participation diagnostics should consume the canonical projection/readiness contract state',
  );
  t.equal(
    participation.summary.projectionReadinessContract.priorityRecovery.active,
    true,
    'participation diagnostics should carry priority recovery through the canonical contract',
  );
  t.end();
});

test('ControlPlaneReadinessService awaits async membership publication reads before computing recovery eligibility', async (t) => {
  const nodeId = 'node-publication-async';
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    membershipPublicationService: {
      async getLatestPublicationForNode(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          publicationEpoch: 22,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: [nodeId],
          requiredAckNodeIds: [nodeId],
          acknowledgedNodeIds: [],
        };
      },
    },
    now: () => 610000,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId, {
    maxCachedAgeMs: 0,
  });

  t.equal(readiness.membershipPublication.status, 'ACK_PENDING');
  t.equal(readiness.dimensions.controlPlanePublished, false);
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'async readiness should await publication state and keep recovery open during convergence');
  t.end();
});

test('ControlPlaneReadinessService splits publication diagnostics from recovery planning when computing readiness', async (t) => {
  const nodeId = 'node-publication-lane-split';
  const capturedReadProfiles = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    membershipPublicationService: {
      async getLatestPublicationForNode(targetNodeId, options = {}) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        capturedReadProfiles.push(options);
        if (options.readProfile === 'diagnostics') {
          return null;
        }
        return {
          publicationEpoch: 23,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: [nodeId],
          requiredAckNodeIds: [nodeId],
          acknowledgedNodeIds: [],
        };
      },
      getLatestPublicationForNodeSync(targetNodeId, options = {}) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        capturedReadProfiles.push(options);
        if (options.readProfile === 'diagnostics') {
          return null;
        }
        return {
          publicationEpoch: 23,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: [nodeId],
          requiredAckNodeIds: [nodeId],
          acknowledgedNodeIds: [],
        };
      },
    },
    now: () => 620000,
  });

  const readiness = await readinessService.getNodeReadiness(nodeId, {
    maxCachedAgeMs: 0,
  });

  t.same(
    capturedReadProfiles.map((options) => options.readProfile).sort(),
    ['diagnostics', 'planning', 'planning'],
    'readiness should use diagnostics for publication truth and planning for recovery truth',
  );
  t.equal(
    readiness.membershipPublication,
    null,
    'diagnostics publication truth should remain null when no durable publication row is visible',
  );
  t.equal(
    readiness.dimensions.controlPlanePublished,
    true,
    'diagnostics publication truth should stay open when no durable pending publication row is visible',
  );
  t.equal(
    readiness.dimensions.controlPlaneRecoveryEligible,
    true,
    'recovery eligibility should stay open when the planning snapshot still shows an in-flight publication epoch',
  );
  t.same(
    readiness.priorityControlPlaneRecovery.reasonCodes,
    [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING],
    'priority recovery reasons should come from the recovery planning snapshot',
  );
  t.match(readiness.projectionReadinessContract, {
    state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
    recoveryOpen: true,
    publication: {
      ready: true,
      boundaryOutcome: null,
    },
    priorityRecovery: {
      active: true,
      reasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      ],
    },
  }, 'projection/readiness contract should derive priority recovery from the planning lane without rebuilding publication diagnostics');
  t.end();
});

test('ControlPlaneReadinessService sync readiness splits publication diagnostics from recovery planning', (t) => {
  const nodeId = 'node-publication-lane-split-sync';
  const capturedReadProfiles = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    membershipPublicationService: {
      getLatestPublicationForNodeSync(targetNodeId, options = {}) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        capturedReadProfiles.push(options);
        if (options.readProfile === 'diagnostics') {
          return null;
        }
        return {
          publicationEpoch: 24,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: [nodeId],
          requiredAckNodeIds: [nodeId],
          acknowledgedNodeIds: [],
        };
      },
    },
    now: () => 630000,
  });

  const readiness = readinessService.getNodeReadinessSync(nodeId, {
    maxCachedAgeMs: 0,
  });

  t.same(
    capturedReadProfiles.map((options) => options.readProfile).sort(),
    ['diagnostics', 'planning'],
    'sync readiness should read diagnostics and planning publication lanes separately',
  );
  t.equal(
    readiness.membershipPublication,
    null,
    'sync diagnostics publication truth should remain null when no durable publication row is visible',
  );
  t.equal(readiness.dimensions.controlPlanePublished, true);
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true);
  t.same(
    readiness.priorityControlPlaneRecovery.reasonCodes,
    [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING],
  );
  t.end();
});
