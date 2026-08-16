import {test} from '../../src/test-helpers/tap.js';
import {
  createAccountingService,
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPartitionService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';
import {
  COLUMN,
  NODE_STATE,
  STATE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {OwnerKeyReconcileQueue} from '../../src/workflow/owner-key-reconcile-queue.js';

const READINESS_CHURN_NOW_MS = 1_780_000_000_000;
const READINESS_CHURN_NODE_COUNT = 5;
const OPTION_VARIANT_LIMIT = 16;
const OPTION_VARIANT_PRESSURE_COUNT = 80;
const FORMATION_STORM_REVISION = 200;

function createReadinessChurnCache() {
  return createCache({
    nodes: Array.from(
      {length: READINESS_CHURN_NODE_COUNT},
      (_, index) => createActiveNode(`node-${index}`),
    ),
  });
}

test('sync snapshot uses synchronous publication and capacity accessors ' +
  'for recovery admission', async (t) => {
  const nodeId = 'node-sync-priority-recovery';
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    }),
    storageAccountingService: {
      async getCapacitySnapshotForNode() {
        return null;
      },
      getCapacitySnapshotForNodeSync(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    membershipPublicationService: {
      async getLatestPublicationForNode() {
        return null;
      },
      getLatestPublicationForNodeSync(targetNodeId) {
        if (targetNodeId !== nodeId) {
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

  const readiness = readinessService.getNodeReadinessSync(nodeId);

  t.equal(readiness.membershipPublication.status, 'ACK_PENDING');
  t.equal(readiness.dimensions.controlPlanePublished, false);
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'sync readiness should keep recovery open when publication is pending');
  t.equal(readiness.dimensions.placementEligible, true,
    'sync readiness should honor synchronous storage capacity snapshots');
  t.notOk(
    readiness.reasons.some((reason) => {
      return reason.code === CONTROL_PLANE_READINESS_REASON
        .STORAGE_BUDGET_UNAVAILABLE;
    }),
    'sync readiness should not fabricate storage budget failures when sync capacity exists',
  );
  t.end();
});

test('sync snapshot reuses a fresher stored readiness evaluation when the ' +
  'visible cache row regresses', async (t) => {
  let now = 100000;
  const nodeId = 'node-sync-fresher';
  const freshHeartbeat = now - 100;
  const freshLease = now + 15000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.LAST_HEARTBEAT]: freshHeartbeat,
      [COLUMN.READY_LEASE_EXPIRES_AT]: freshLease,
    }],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const fresh = await readinessService.getNodeReadiness(nodeId);
  t.equal(fresh.dimensions.serveEligible, true,
    'async owner evaluation should capture a serve-eligible snapshot');

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.LAST_HEARTBEAT]: now - 60000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
  });

  const reused = readinessService.getNodeReadinessSync(nodeId);
  t.equal(reused.dimensions.serveEligible, true,
    'sync callers should reuse the fresher stored snapshot');
  t.equal(
    reused.nodeEvidence?.lastHeartbeat,
    freshHeartbeat,
    'reused sync snapshot should preserve the fresher heartbeat evidence',
  );

  now = freshLease + 1;
  const expired = readinessService.getNodeReadinessSync(nodeId);
  t.equal(expired.dimensions.serveEligible, false,
    'stored sync snapshots must stop overriding cache rows after lease expiry');
  t.end();
});

test('sync readiness starts one deduped authoritative refresh for stale ' +
  'ineligible remote nodes', async (t) => {
  const now = 610000;
  const nodeId = 'node-sync-background-refresh';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
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
      async executeAuthoritativeSystemTableRead(
        tableName, _sql, _params, _options,
      ) {
        authoritativeReads.push(tableName);
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
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
  const options = {
    allowAuthoritativeRefresh: true,
    requireFreshOnIneligible: true,
    decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  };
  const repairedSnapshotPublished = new Promise((resolve) => {
    const unsubscribe = readinessService.subscribeReadinessPlanningSnapshots(
      (event) => {
        if (event.ownerKey === nodeId) {
          unsubscribe();
          resolve();
        }
      },
    );
  });

  const initial = readinessService.getNodeReadinessSync(nodeId, options);
  const repeated = readinessService.getNodeReadinessSync(nodeId, options);

  t.equal(initial.dimensions.serveEligible, false,
    'stale local evidence should remain ineligible on the first sync read');
  t.equal(repeated.dimensions.serveEligible, false,
    'repeated sync reads should stay fail-closed until the owner refresh lands');
  await repairedSnapshotPublished;

  t.same(authoritativeReads, [TABLES.NODES, TABLES.SERVICES],
    'sync reads should trigger one deduped authoritative node/service refresh');

  const refreshed = readinessService.getNodeReadinessSync(nodeId, options);
  t.equal(refreshed.dimensions.serveEligible, true,
    'later sync reads should observe the repaired owner evidence');
  t.end();
});

test('missing node row sets both repairEligible and serveEligible false ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const cache = createCache({nodes: [], services: []});
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness =
    await readinessService.getNodeReadiness('node-missing');

  t.equal(readiness.dimensions.repairEligible, false,
    'missing node must not be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, false,
    'missing node must not be serve-eligible');
  t.end();
});

test('ControlPlaneReadinessService keeps self-node admitted when the local ' +
  'node row is missing but active control-plane services are live',
async (t) => {
  const nodeId = 'node-self-missing-row';
  const authoritativeReads = [];
  const cache = createCache({
    nodes: [],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.READY;
      },
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: true,
          reason: null,
          retryAfterMs: null,
        };
      },
    },
    nodeLifecycleStateMachine: {
      getState() {
        return SERVICE_STATUS.ACTIVE;
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
        authoritativeReads.push(tableName);
        return {
          success: false,
          rows: [],
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'self-node should stay cluster-member-healthy while the local row catches up');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'live local control-plane service ownership should keep self writes open');
  t.equal(readiness.dimensions.serveEligible, true,
    'load-lane admission should remain open for the live self node');
  t.same(readiness.reasons, [],
    'self-node runtime grace should not emit a synthetic missing-row failure');
  t.same(authoritativeReads, [],
    'self-node runtime grace should not force authoritative repair reads');
  t.end();
});

test('ControlPlaneReadinessService reports local query transport deferral ' +
  'instead of node_row_missing for a self node with a missing row',
async (t) => {
  const nodeId = 'node-self-missing-row-deferred';
  const authoritativeReads = [];
  const cache = createCache({
    nodes: [],
    services: [createMessageGroupService(nodeId)],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.READY;
      },
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          reason: 'local transport deferred',
          retryAfterMs: 250,
        };
      },
    },
    nodeLifecycleStateMachine: {
      getState() {
        return SERVICE_STATUS.ACTIVE;
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
        authoritativeReads.push(tableName);
        return {
          success: false,
          rows: [],
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );
  const reasonCodes = readiness.reasons.map((reason) => reason.code);

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'self runtime grace should still supply cluster-member health');
  t.equal(readiness.dimensions.serveEligible, false,
    'serve eligibility must still fail closed when the local transport is deferred');
  t.ok(reasonCodes.includes(
    CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
  ), 'local transport deferral should be surfaced as the canonical reason');
  t.notOk(reasonCodes.includes(CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING),
    'the self runtime grace path should not collapse back to node_row_missing');
  t.same(authoritativeReads, [],
    'transport deferral should still stay on the local self evidence path');
  t.end();
});

test('ControlPlaneReadinessService keeps self runtime grace when the ' +
  'local node row and control-plane service rows are both missing',
async (t) => {
  const nodeId = 'node-self-missing-row-no-services';
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache({
      nodes: [],
      services: [],
    }),
    cacheMutationTarget: createCache({
      nodes: [],
      services: [],
    }),
    messageRouter: {
      getConnectionState() {
        return STATE.READY;
      },
    },
    nodeLifecycleStateMachine: {
      getState() {
        return SERVICE_STATUS.ACTIVE;
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
        authoritativeReads.push(tableName);
        return {
          success: false,
          rows: [],
        };
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );
  const reasonCodes = readiness.reasons.map((reason) => reason.code);

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'self runtime grace should keep cluster-member health open through ' +
    'node-row and service-row cache lag');
  t.equal(readiness.dimensions.controlPlaneWritable, true,
    'self runtime grace should keep control-plane writes open when local ' +
    'service rows have not propagated yet');
  t.equal(readiness.dimensions.serveEligible, true,
    'load-lane admission should stay open when only local cache evidence is missing');
  t.notOk(reasonCodes.includes(CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING),
    'the missing-row grace path should not synthesize node_row_missing ' +
    'when local cache service evidence is also absent');
  t.same(authoritativeReads, [],
    'local self-node grace should not force authoritative repair reads');
  t.end();
});

// ── serveEligible transport evidence (task 5.2) ─────────────────────
// Validates: Requirements 1.1, 1.2, 4.2, 4.3
// Design: 1.1, 1.2, 4.2
// serveEligible must fail closed when live transport evidence is
// explicitly negative, even when the node row lease is still valid.
// repairEligible may remain true because the lease is valid and the
// cluster member is healthy from the row perspective.

test('serveEligible fails closed when router reports disconnected ' +
  'despite valid lease ' +
  '(uses ControlPlaneReadinessService — transport evidence for ' +
  'serveEligible, Req 4.3)',
async (t) => {
  const now = 1500;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-valid-lease-disconnected'),
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 5000,
      [COLUMN.LAST_HEARTBEAT]: now - 500,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    }],
    services: [
      createMessageGroupService('node-valid-lease-disconnected'),
    ],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-valid-lease-disconnected': {
        nodeId: 'node-valid-lease-disconnected',
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
    .getNodeReadiness('node-valid-lease-disconnected');

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'valid lease keeps cluster member healthy');
  t.equal(readiness.dimensions.repairEligible, true,
    'valid lease keeps repair-eligible (row evidence grace)');
  t.equal(readiness.dimensions.serveEligible, false,
    'explicit router disconnect must fail closed for serveEligible');
  t.end();
});

test('serveEligible remains true when router reports connected ' +
  'with valid lease ' +
  '(uses ControlPlaneReadinessService — transport evidence for ' +
  'serveEligible, Req 4.3)',
async (t) => {
  const now = 1500;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-connected-valid'),
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 5000,
      [COLUMN.LAST_HEARTBEAT]: now - 500,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    }],
    services: [
      createMessageGroupService('node-connected-valid'),
    ],
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
      'node-connected-valid': {
        nodeId: 'node-connected-valid',
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
    .getNodeReadiness('node-connected-valid');

  t.equal(readiness.dimensions.serveEligible, true,
    'connected transport with valid lease must be serve-eligible');
  t.equal(readiness.dimensions.repairEligible, true,
    'connected transport with valid lease must be repair-eligible');
  t.end();
});

test('serveEligible preserves row-evidence grace when router has no ' +
  'transport evidence ' +
  '(uses ControlPlaneReadinessService — transport evidence for ' +
  'serveEligible, Req 4.3)',
async (t) => {
  const now = 1500;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-no-router-evidence'),
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 5000,
      [COLUMN.LAST_HEARTBEAT]: now - 500,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    }],
    services: [
      createMessageGroupService('node-no-router-evidence'),
    ],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
    },
    storageAccountingService: createAccountingService({
      'node-no-router-evidence': {
        nodeId: 'node-no-router-evidence',
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
    .getNodeReadiness('node-no-router-evidence');

  t.equal(readiness.dimensions.serveEligible, true,
    'no router evidence preserves row-evidence grace for serveEligible');
  t.equal(readiness.dimensions.repairEligible, true,
    'no router evidence preserves row-evidence grace for repairEligible');
  t.end();
});

// ── Transport-connected lease-grace for topology changes (§1.4.12) ──

test('isClusterMemberHealthy returns false for transport-connected node ' +
  'with expired lease and stale heartbeat during topology change ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies transport is no longer alternate membership truth)',
async (t) => {
  const now = 200000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-split-lag'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 35000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 10000,
    }],
    services: [createMessageGroupService('node-split-lag')],
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
      'node-split-lag': {
        nodeId: 'node-split-lag',
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
    .getNodeReadiness('node-split-lag');

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-connected active node must not remain cluster-member-healthy ' +
    'once lease evidence is stale');
  t.equal(readiness.dimensions.serveEligible, false,
    'transport-connected active node must not remain serve-eligible ' +
    'when membership evidence is stale');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'transport-connected active node must not remain control-plane-writable ' +
    'when membership evidence is stale');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'transport-connected active node may still remain recovery-eligible');
  t.end();
});

test('transport-connected startup node remains recovery-eligible when a stale ' +
  'stopped message-group row is the only remaining pre-cutover service row ' +
  '(uses ControlPlaneReadinessService.hasWritableControlPlaneService, ' +
  'verifies bootstrap-to-runtime handoff does not self-block register-service)',
async (t) => {
  const now = 200000;
  const joiningNodeId = 'node-restarting';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(joiningNodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [
      {
        ...createMessageGroupService(joiningNodeId),
        [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
      },
      createPartitionService(joiningNodeId, 'services-p1-r1'),
    ],
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
      [joiningNodeId]: {
        nodeId: joiningNodeId,
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
    .getNodeReadiness(joiningNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-connected startup node should not bypass stale lease evidence');
  t.equal(readiness.dimensions.routingReady, true,
    'active partition service routing should stay available during startup recovery');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'stale membership evidence must still block ordinary control-plane writes');
  t.equal(readiness.dimensions.repairEligible, false,
    'startup recovery must not reopen repair eligibility from transport alone');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'startup recovery must remain recovery-eligible so register-service can replace the stale row');
  t.end();
});

test('transport-connected startup node remains recovery-eligible when the ' +
  'message-group row is still syncing but active partition routing is already ' +
  'available', async (t) => {
  const now = 210000;
  const joiningNodeId = 'node-restarting-syncing';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(joiningNodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [
      {
        ...createMessageGroupService(joiningNodeId),
        [COLUMN.STATUS]: 'syncing',
      },
      createPartitionService(joiningNodeId, 'sql_write_operations-p1-r2'),
    ],
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
      [joiningNodeId]: {
        nodeId: joiningNodeId,
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
    .getNodeReadiness(joiningNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'startup recovery should still respect stale membership evidence');
  t.equal(readiness.dimensions.routingReady, true,
    'active partition routing should stay available while the message-group row converges');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'ordinary control-plane writes must stay closed until active message-group service returns');
  t.equal(readiness.dimensions.repairEligible, false,
    'repair admission should stay closed until membership evidence recovers');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'recovery admission should stay open so the syncing message-group row can finish its handoff');
  t.end();
});

test('priority recovery keeps a transport-connected active node recovery-eligible ' +
  'when only routed partition service evidence remains visible', async (t) => {
  const now = 215000;
  const joiningNodeId = 'node-priority-recovery-partition-only';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(joiningNodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [
      createPartitionService(
        joiningNodeId,
        'control_plane_publications-p1-r3',
      ),
    ],
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
      [joiningNodeId]: {
        nodeId: joiningNodeId,
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
        if (targetNodeId !== joiningNodeId) {
          return null;
        }
        return {
          publicationEpoch: 41,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: ['seed-node'],
          requiredAckNodeIds: ['seed-node', joiningNodeId],
          acknowledgedNodeIds: ['seed-node'],
          priorityPartitionSummary: {
            satisfied: false,
          },
        };
      },
    },
    now: () => now,
  });

  const readiness = await readinessService
    .getNodeReadiness(joiningNodeId);

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'priority recovery should still respect stale membership evidence');
  t.equal(readiness.dimensions.routingReady, true,
    'active partition routing should remain visible while publication converges');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'partition-only evidence must not reopen ordinary control-plane writes');
  t.equal(readiness.dimensions.repairEligible, false,
    'partition-only priority recovery must not reopen steady-state repair eligibility');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'priority recovery should not fail closed when transport and routed partition service evidence remain live');
  t.end();
});

test('priority recovery sync readiness retains recovery eligibility ' +
  'when a newer planning epoch lacks priority blockers', (t) => {
  const nowAtStart = 215000;
  let now = nowAtStart;
  const joiningNodeId = 'node-priority-recovery-sync-stale-grace';
  const planningReadProfile = 'planning';
  const diagnosticsPublicationRow = {
    publicationEpoch: 41,
    status: 'ACK_PENDING',
    publishedActiveNodeIds: ['seed-node'],
  };
  let planningPublicationRow = {
    publicationEpoch: 41,
    status: 'PUBLISHED',
    publishedActiveNodeIds: ['seed-node'],
    priorityPartitionSummary: {
      satisfied: false,
    },
  };
  const cache = createCache({
    nodes: [{
      ...createActiveNode(joiningNodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: nowAtStart - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: nowAtStart - 5000,
    }],
    services: [
      createPartitionService(
        joiningNodeId,
        'control_plane_publications-p1-r5',
      ),
    ],
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
      [joiningNodeId]: {
        nodeId: joiningNodeId,
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
        if (targetNodeId !== joiningNodeId) {
          return null;
        }
        return options?.readProfile === planningReadProfile ?
          planningPublicationRow :
          diagnosticsPublicationRow;
      },
    },
    now: () => now,
  });

  const activeReadiness = readinessService.getNodeReadinessSync(joiningNodeId);

  t.equal(
    activeReadiness?.dimensions?.controlPlaneRecoveryEligible,
    true,
    'sync readiness should start with active recovery eligibility',
  );

  planningPublicationRow = {
    publicationEpoch: 42,
    status: 'PUBLISHED',
    publishedActiveNodeIds: ['seed-node'],
  };
  now = nowAtStart + 1000;

  const retainedReadiness = readinessService.getNodeReadinessSync(
    joiningNodeId,
  );

  t.equal(
    retainedReadiness?.dimensions?.clusterMemberHealthy,
    false,
    'sync readiness should continue respecting stale membership evidence',
  );
  t.equal(
    retainedReadiness?.dimensions?.controlPlaneRecoveryEligible,
    true,
    'sync readiness should retain recovery eligibility when the newer planning epoch clears priority blockers',
  );

  t.end();
});

test('priority recovery keeps degraded repair-only publication recovery-eligible ' +
  'when transport and routed partition service evidence remain live',
async (t) => {
  const now = 216000;
  const joiningNodeId = 'node-priority-recovery-repair-only';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(joiningNodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 5000,
    }],
    services: [
      createPartitionService(
        joiningNodeId,
        'control_plane_publications-p1-r4',
      ),
    ],
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
      [joiningNodeId]: {
        nodeId: joiningNodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
      reasonCode: 'priority_recovery_runtime_degraded',
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    membershipPublicationService: {
      getLatestPublicationForNode(targetNodeId) {
        if (targetNodeId !== joiningNodeId) {
          return null;
        }
        return {
          publicationEpoch: 42,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: ['seed-node'],
          requiredAckNodeIds: ['seed-node', joiningNodeId],
          acknowledgedNodeIds: ['seed-node'],
          priorityPartitionSummary: {
            satisfied: false,
          },
        };
      },
    },
    now: () => now,
  });

  const readiness = await readinessService
    .getNodeReadiness(joiningNodeId);

  t.equal(readiness.dimensions.metadataPublicationHealthy, false,
    'degraded repair-only publication should remain visible to the readiness model');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'degraded repair-only publication must keep ordinary control-plane writes closed');
  t.equal(readiness.dimensions.repairEligible, false,
    'degraded repair-only publication must not reopen steady-state repair eligibility');
  t.equal(readiness.dimensions.controlPlaneRecoveryEligible, true,
    'priority recovery should stay open so degraded publication can repair back to grouped mode');
  t.end();
});

test('isClusterMemberHealthy returns false for transport-connected node ' +
  'with an explicit no-ready-lease watermark ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies durable rejoin quarantine beats transport grace)',
async (t) => {
  const now = 200000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-durable-rejoin'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 1000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    }],
    services: [createMessageGroupService('node-durable-rejoin')],
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
      'node-durable-rejoin': {
        nodeId: 'node-durable-rejoin',
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
    .getNodeReadiness('node-durable-rejoin');

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-connected node must stay cluster-member-unhealthy when the owner explicitly cleared its ready lease');
  t.equal(readiness.dimensions.serveEligible, false,
    'transport-connected node must not be serve-eligible while durable rejoin quarantine is active');
  t.equal(readiness.dimensions.controlPlaneWritable, false,
    'transport-connected node must not be control-plane-writable while durable rejoin quarantine is active');
  t.end();
});

test('isClusterMemberHealthy returns false for transport-disconnected ' +
  'node with expired lease even with recent heartbeat ' +
  '(uses ControlPlaneReadinessService.isClusterMemberHealthy, ' +
  'verifies §1.4.12 transport reconciliation)',
async (t) => {
  const now = 120000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-actually-down'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 5000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 2000,
    }],
    services: [createMessageGroupService('node-actually-down')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-actually-down': {
        nodeId: 'node-actually-down',
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
    .getNodeReadiness('node-actually-down');

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'transport-disconnected node must be cluster-member-unhealthy ' +
    'even with recent heartbeat');
  t.equal(readiness.dimensions.serveEligible, false,
    'transport-disconnected node must not be serve-eligible');
  t.end();
});

test('continuous formation churn cannot repeatedly jump the fair owner queue',
  async (t) => {
    const cache = createReadinessChurnCache();
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: 'node-4',
      [COLUMN.STATUS]: NODE_STATE.JOINING,
    });
    const scheduled = [];
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => READINESS_CHURN_NOW_MS,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
        getConnectedNodes: () => new Set(['node-0', 'node-4']),
      },
    });
    readiness.getNodeReadinessSync('node-0');
    const buildsBeforeStorm =
      readiness.getReadinessPlanningDiagnostics().buildOwnerKeys.length;
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: 'node-0',
      revision: 90,
    });
    const buildsByTurn = [];
    for (let turn = 0;
      turn < READINESS_CHURN_NODE_COUNT && scheduled.length > 0;
      turn++) {
      cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
        [COLUMN.NODE_ID]: 'node-4',
        [COLUMN.STATUS]: NODE_STATE.JOINING,
        revision: 100 + turn,
      });
      const before = readiness.getReadinessPlanningDiagnostics().buildCount;
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
      buildsByTurn.push(
        readiness.getReadinessPlanningDiagnostics().buildCount - before,
      );
    }
    const stormOwners = readiness.getReadinessPlanningDiagnostics()
      .buildOwnerKeys.slice(buildsBeforeStorm);
    t.equal(stormOwners[0], 'node-4',
      'formation receives one initial priority turn');
    t.ok(stormOwners.includes('node-0') && stormOwners.includes('node-1'),
      'background owners progress while formation remains continuously dirty');
    t.ok(buildsByTurn.every((count) => count <= 1),
      'continuous formation churn still performs one heavy build per turn');
    readiness.shutdownReadinessPlanningOwner();
  });

test('readiness planning bounds queued option variants and their registry',
  async (t) => {
    const scheduled = [];
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: createReadinessChurnCache(),
      now: () => READINESS_CHURN_NOW_MS,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
      messageRouter: {
        getConnectedNodes: () => new Set(['node-0']),
      },
    });
    const owner = readiness.readinessPlanningSnapshotOwner;
    const token = owner.captureToken();
    for (let index = 0; index < OPTION_VARIANT_PRESSURE_COUNT; index++) {
      owner.enqueueBuild(
        'node-0',
        'variant_pressure',
        {decisionDimension: `variant-${index}`},
        token,
      );
    }
    t.equal(owner.buildOptionsByOwnerAndBuildKey.get('node-0').size,
      OPTION_VARIANT_LIMIT, 'the remembered per-owner option set remains capped');
    t.equal(owner.queue.size, OPTION_VARIANT_LIMIT,
      'evicted variants cannot remain as queued heavy work');
    t.equal(owner.logicalOwnerKeyByQueueOwnerKey.size, OPTION_VARIANT_LIMIT,
      'evicted variants cannot remain in the logical queue registry');
    const originalMapDescriptors = Object.getOwnPropertyDescriptors(
      Map.prototype,
    );
    const definePrototypeProperty = (target, property, descriptor) =>
      Reflect.defineProperty(target, property, descriptor);
    const restorePrototypeProperties = (target, descriptors) =>
      Object.defineProperties(target, descriptors);
    let hostileMapIntrinsicError = null;
    try {
      for (const method of [
        'clear',
        'delete',
        'entries',
        'forEach',
        'get',
        'has',
        'keys',
        'set',
        'values',
      ]) {
        definePrototypeProperty(Map.prototype, method, {
          configurable: true,
          value: () => {
            throw new Error(`hostile Map.${method}`);
          },
          writable: true,
        });
      }
      definePrototypeProperty(Map.prototype, 'size', {
        configurable: true,
        get: () => 0,
      });
      for (let index = 0; index < OPTION_VARIANT_PRESSURE_COUNT; index++) {
        owner.enqueueBuild(
          'node-0',
          'hostile_variant_pressure',
          {decisionDimension: `hostile-variant-${index}`},
          token,
        );
      }
    } catch (error) {
      hostileMapIntrinsicError = error;
    } finally {
      restorePrototypeProperties(Map.prototype, originalMapDescriptors);
    }
    t.equal(hostileMapIntrinsicError, null,
      'post-import Map method mutation cannot escape the queue owner');
    t.equal(owner.buildOptionsByOwnerAndBuildKey.get('node-0').size,
      OPTION_VARIANT_LIMIT,
      'post-import Map size mutation cannot bypass the option cap');
    t.equal(owner.queue.size, OPTION_VARIANT_LIMIT,
      'post-import Map size mutation cannot leave unbounded queued work');
    t.equal(owner.logicalOwnerKeyByQueueOwnerKey.size, OPTION_VARIANT_LIMIT,
      'post-import Map size mutation cannot grow the logical registry');
    readiness.shutdownReadinessPlanningOwner();
  });

test('retry sampling ignores numeric and named Array prototype pollution',
  async (t) => {
    for (const property of ['0', 'push']) {
      let retryTimer = null;
      const queue = new OwnerKeyReconcileQueue({
        reconcileFn: async () => {},
        setTimeoutFn: (callback) => {
          retryTimer = callback;
          return {unref() {}};
        },
        clearTimeoutFn: () => {},
        retryPolicy: {isRetryableError: () => true, maxAttempts: 3},
      });
      queue.logger = {debug() {}, error() {}, warn() {}};
      const original = Object.getOwnPropertyDescriptor(Array.prototype, property);
      const definePrototypeProperty = (target, key, descriptor) =>
        Reflect.defineProperty(target, key, descriptor);
      let escaped = null;
      try {
        const descriptor = property === '0' ?
          {configurable: true, enumerable: true, value: 'hostile'} :
          {configurable: true, get: () => {
            throw new Error('hostile push');
          }};
        definePrototypeProperty(Array.prototype, property, descriptor);
        queue._deferRetryableDrainFailure(
          'owner-a',
          {context: null, reasons: new Set(['source_changed'])},
          ['source_changed'],
          new Error('retryable'),
        );
      } catch (error) {
        escaped = error;
      } finally {
        if (original) {
          definePrototypeProperty(Array.prototype, property, original);
        } else {
          delete Array.prototype[property];
        }
      }
      t.equal(escaped, null, `${property} pollution cannot escape retry`);
      t.equal(typeof retryTimer, 'function',
        `${property} pollution cannot leave retry state without a timer`);
      t.same(queue.getDiagnostics().retryingKeys, ['owner-a'],
        `${property} pollution preserves diagnosable retry work`);
      queue.shutdown();
    }
  });

test('positive readiness veto signatures distinguish delimiter-bearing ' +
  'metadata states', async (t) => {
  let metadataState = {currentMode: 'a:b', reasonCode: 'c'};
  const readiness = new ControlPlaneReadinessService({
    nodeId: 'node-0',
    systemTableCache: createReadinessChurnCache(),
    now: () => READINESS_CHURN_NOW_MS,
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics: () => metadataState,
    },
    messageRouter: {
      getConnectedNodes: () => new Set(['node-0']),
    },
  });
  const owner = readiness.readinessPlanningSnapshotOwner;
  const snapshot = {
    dimensions: {serveEligible: true},
    nodeEvidence: {
      lastHeartbeat: READINESS_CHURN_NOW_MS,
      readyLeaseExpiresAt: READINESS_CHURN_NOW_MS + 10_000,
    },
  };
  const firstSignature = owner.capturePositiveDecisionLiveVeto(
    'node-0', snapshot, READINESS_CHURN_NOW_MS,
  );
  const completed = {
    snapshot,
    completedAtMs: READINESS_CHURN_NOW_MS,
    positiveDecisionLiveVeto: firstSignature,
  };
  metadataState = {currentMode: 'a', reasonCode: 'b:c'};
  const secondSignature = owner.capturePositiveDecisionLiveVeto(
    'node-0', snapshot, READINESS_CHURN_NOW_MS,
  );
  t.not(firstSignature, secondSignature,
    'distinct metadata tuples have injective veto signatures');
  t.equal(owner.isCompletedSnapshotLive('node-0', completed), false,
    'a delimiter-bearing metadata change invalidates the prior positive');
  readiness.shutdownReadinessPlanningOwner();
});

test('alternating formation owners cannot repeatedly jump the fair owner queue',
  async (t) => {
    const cache = createReadinessChurnCache();
    for (const nodeId of ['node-3', 'node-4']) {
      cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STATUS]: NODE_STATE.JOINING,
      });
    }
    const scheduled = [];
    let connectedFormationOwner = 'node-3';
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => READINESS_CHURN_NOW_MS,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
      messageRouter: {
        getConnectionState: (nodeId) =>
          nodeId === connectedFormationOwner || nodeId === 'node-0' ?
            STATE.CONNECTED : STATE.DISCONNECTED,
        getConnectedNodes: () =>
          new Set(['node-0', connectedFormationOwner]),
      },
    });
    readiness.getNodeReadinessSync('node-0');
    const buildsBeforeStorm =
      readiness.getReadinessPlanningDiagnostics().buildOwnerKeys.length;
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: 'node-0',
      revision: FORMATION_STORM_REVISION - 10,
    });
    for (let turn = 0;
      turn < READINESS_CHURN_NODE_COUNT && scheduled.length > 0;
      turn++) {
      connectedFormationOwner = turn % 2 === 0 ? 'node-3' : 'node-4';
      cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
        [COLUMN.NODE_ID]: connectedFormationOwner,
        [COLUMN.STATUS]: NODE_STATE.JOINING,
        revision: FORMATION_STORM_REVISION + turn,
      });
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
    const stormOwners = readiness.getReadinessPlanningDiagnostics()
      .buildOwnerKeys.slice(buildsBeforeStorm);
    t.ok(stormOwners.includes('node-1'),
      'an unrelated dirty owner progresses despite alternating formation owners');
    t.ok(stormOwners.filter((ownerKey) =>
      ownerKey === 'node-3' || ownerKey === 'node-4').length <= 2,
    'each formation owner receives at most one priority turn per epoch');
    readiness.shutdownReadinessPlanningOwner();
  });

