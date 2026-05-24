import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
  STATE,
  STRING,
} from '../../src/constants/index.js';

const HEARTBEAT_STATUS_REVIVAL_NODE_ID = 'node-heartbeat-status-revival';
const HEARTBEAT_STATUS_REVIVAL_NODE_ADDRESS = 'localhost:8097';
const HEARTBEAT_STATUS_REVIVAL_PUBLISHED_NODE_ID = 'node-published-peer';
const HEARTBEAT_STATUS_REVIVAL_STALE_DELTA_MS = 1000;
const HEARTBEAT_STATUS_REVIVAL_NO_PUBLICATION_ROW = null;
const HEARTBEAT_STATUS_REVIVAL_NO_READY_LEASE = null;
const HEARTBEAT_PUBLICATION_GAP_NODE_ID = 'node-heartbeat-publication-gap';
const HEARTBEAT_PUBLICATION_GAP_NODE_ADDRESS = 'localhost:8098';
const HEARTBEAT_PUBLICATION_GAP_PUBLISHED_NODE_ID = 'node-1';
const HEARTBEAT_PUBLICATION_GAP_STALE_DELTA_MS = 1000;
const HEARTBEAT_PUBLICATION_GAP_CREATED_STALE_DELTA_MS = 10000;
const HEARTBEAT_PUBLICATION_GAP_NO_PUBLICATION_ROW = null;
const HEARTBEAT_PUBLICATION_GAP_NO_READY_LEASE = null;
const HEARTBEAT_PUBLICATION_GAP_ALLOW_PENDING_VISIBILITY = true;
const HEARTBEAT_PUBLICATION_GAP_ALLOW_PRESSURE_DEFER = false;
const HEARTBEAT_PUBLICATION_GAP_SKIP_WRITE_READBACK = true;
const HEARTBEAT_PUBLICATION_GAP_TARGET_NODE_IDS = Object.freeze(
  [
    HEARTBEAT_PUBLICATION_GAP_NODE_ID,
    HEARTBEAT_PUBLICATION_GAP_PUBLISHED_NODE_ID,
  ].sort((left, right) => left.localeCompare(right)),
);

const TEST_MEMBERSHIP_PUBLICATION_STATUS = Object.freeze({
  ACK_PENDING: 'ACK_PENDING',
  OPEN: 'OPEN',
  PUBLISHED: 'PUBLISHED',
});

export function registerReplicaDispatchNodeStateHeartbeatPublicationTests({
  createService,
  initEnv,
}) {
  test('ReplicaDispatchService revives stale stopped rows on READY ' +
    'heartbeat-only node-state updates',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const reconcileCalls = [];
    const acknowledgementCalls = [];
    const cacheNode = {
      node_id: HEARTBEAT_STATUS_REVIVAL_NODE_ID,
      node_address: HEARTBEAT_STATUS_REVIVAL_NODE_ADDRESS,
      status: SERVICE_STATUS.STOPPED,
      connection_state: STATE.READY,
      capabilities: STRING.EMPTY_JSON_ARRAY,
      last_heartbeat: now - HEARTBEAT_STATUS_REVIVAL_STALE_DELTA_MS,
      ready_lease_expires_at: HEARTBEAT_STATUS_REVIVAL_NO_READY_LEASE,
      created_at: now - HEARTBEAT_STATUS_REVIVAL_STALE_DELTA_MS,
    };
    const membershipPublicationService = {
      getLatestPublicationForNodeSync() {
        return HEARTBEAT_STATUS_REVIVAL_NO_PUBLICATION_ROW;
      },
      getLatestPublicationRowSync() {
        return {
          status: TEST_MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
          publishedActiveNodeIds: [HEARTBEAT_STATUS_REVIVAL_PUBLISHED_NODE_ID],
        };
      },
      enqueueClusterMembershipReconcile(reason, context) {
        reconcileCalls.push({reason, context});
        return true;
      },
      async acknowledgeMembershipPublicationForNode(nodeId) {
        acknowledgementCalls.push(nodeId);
        return HEARTBEAT_STATUS_REVIVAL_NO_PUBLICATION_ROW;
      },
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        membershipPublicationService,
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: HEARTBEAT_STATUS_REVIVAL_NODE_ID,
      [ControlPlaneField.NODE_ADDRESS]: HEARTBEAT_STATUS_REVIVAL_NODE_ADDRESS,
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_ONLY]: true,
      [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(updates.length, 1, 'persists one heartbeat-only node-state update');
    t.equal(
      updates[0].row.status,
      SERVICE_STATUS.ACTIVE,
      'READY heartbeat-only recovery should revive a stale stopped node row',
    );
    t.equal(
      updates[0].row.connection_state,
      STATE.READY,
      'revival update should preserve the READY connection state',
    );
    t.equal(
      reconcileCalls.length,
      1,
      'revived READY visibility should re-enter membership publication',
    );
    t.equal(
      reconcileCalls[0]?.context?.nodeRow?.status,
      SERVICE_STATUS.ACTIVE,
      'publication repair should receive the revived active row shape',
    );
    t.same(
      acknowledgementCalls,
      [HEARTBEAT_STATUS_REVIVAL_NODE_ID],
      'revived rows missing from publication should still probe the ACK owner',
    );

    service.stop();
  });

  test('ReplicaDispatchService re-enters membership publication when a READY ' +
    'heartbeat-only update reaches a node missing from the latest publication',
  async (t) => {
    initEnv();

    const now = Date.now();
    const reconcileCalls = [];
    const acknowledgementCalls = [];
    const cacheNode = {
      node_id: HEARTBEAT_PUBLICATION_GAP_NODE_ID,
      node_address: HEARTBEAT_PUBLICATION_GAP_NODE_ADDRESS,
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now - HEARTBEAT_PUBLICATION_GAP_STALE_DELTA_MS,
      ready_lease_expires_at: HEARTBEAT_PUBLICATION_GAP_NO_READY_LEASE,
      created_at: now - HEARTBEAT_PUBLICATION_GAP_CREATED_STALE_DELTA_MS,
    };
    const membershipPublicationService = {
      getLatestPublicationForNodeSync() {
        return HEARTBEAT_PUBLICATION_GAP_NO_PUBLICATION_ROW;
      },
      getLatestPublicationRowSync() {
        return {
          status: TEST_MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
          publishedActiveNodeIds: [HEARTBEAT_PUBLICATION_GAP_PUBLISHED_NODE_ID],
        };
      },
      enqueueClusterMembershipReconcile(reason, context) {
        reconcileCalls.push({reason, context});
        return true;
      },
      async acknowledgeMembershipPublicationForNode(nodeId) {
        acknowledgementCalls.push(nodeId);
        return null;
      },
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({
          success: true,
          partitionResult: {affectedRows: 1},
        }),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        membershipPublicationService,
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: HEARTBEAT_PUBLICATION_GAP_NODE_ID,
      [ControlPlaneField.NODE_ADDRESS]: HEARTBEAT_PUBLICATION_GAP_NODE_ADDRESS,
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_ONLY]: true,
      [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(
      reconcileCalls.length,
      1,
      'heartbeat-only READY visibility should re-enter membership publication',
    );
    t.equal(
      reconcileCalls[0]?.reason,
      RECONCILE_REASON.NODE_STATE_UPDATE_READY,
      'heartbeat-owned recovery should use the READY publication reason',
    );
    t.equal(
      reconcileCalls[0]?.context?.nodeId,
      HEARTBEAT_PUBLICATION_GAP_NODE_ID,
      'publication repair should target the missing node',
    );
    t.equal(
      reconcileCalls[0]?.context?.state,
      STATE.READY,
      'publication repair should preserve READY state context',
    );
    t.equal(
      reconcileCalls[0]?.context?.nodeRow?.connection_state,
      STATE.READY,
      'publication repair should carry the visible READY row shape',
    );
    t.same(
      reconcileCalls[0]?.context?.publishedActiveNodeIds,
      [...HEARTBEAT_PUBLICATION_GAP_TARGET_NODE_IDS],
      'publication repair should carry an explicit published-active target',
    );
    t.same(
      reconcileCalls[0]?.context?.requiredAckNodeIds,
      [...HEARTBEAT_PUBLICATION_GAP_TARGET_NODE_IDS],
      'publication repair should close required ACKs for the explicit target',
    );
    t.same(
      reconcileCalls[0]?.context?.acknowledgedNodeIds,
      [...HEARTBEAT_PUBLICATION_GAP_TARGET_NODE_IDS],
      'publication repair should mark the visible READY target acknowledged',
    );
    t.equal(
      reconcileCalls[0]?.context?.allowPendingVisibility,
      HEARTBEAT_PUBLICATION_GAP_ALLOW_PENDING_VISIBILITY,
      'publication repair should accept pending visibility for the explicit target',
    );
    t.equal(
      reconcileCalls[0]?.context?.allowPressureDefer,
      HEARTBEAT_PUBLICATION_GAP_ALLOW_PRESSURE_DEFER,
      'publication repair should bypass pressure deferral for the explicit target',
    );
    t.equal(
      reconcileCalls[0]?.context?.skipPublicationWriteReadback,
      HEARTBEAT_PUBLICATION_GAP_SKIP_WRITE_READBACK,
      'publication repair should avoid readback while durable visibility is pending',
    );
    t.same(
      acknowledgementCalls,
      [
        HEARTBEAT_PUBLICATION_GAP_NODE_ID,
      ],
      'cache-stale publication membership should still probe the ACK owner',
    );

    service.stop();
  });

  test('ReplicaDispatchService cache-visible READY rows re-enter membership ' +
    'publication when the latest publication is still open for that node',
  async (t) => {
    initEnv();

    const now = Date.now();
    const reconcileCalls = [];
    const acknowledgementCalls = [];
    const readyNode = {
      node_id: 'node-cache-publication-gap',
      node_address: 'localhost:8099',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now,
      ready_lease_expires_at: now + 60000,
    };
    const membershipPublicationRow = {
      publicationId: 'membership-publication:17:test',
      status: TEST_MEMBERSHIP_PUBLICATION_STATUS.OPEN,
      requiredAckNodeIds: ['node-cache-publication-gap'],
      publishedActiveNodeIds: ['node-1'],
    };
    const membershipPublicationService = {
      getLatestPublicationForNodeSync(nodeId) {
        return nodeId === 'node-cache-publication-gap' ?
          membershipPublicationRow :
          null;
      },
      getLatestPublicationRowSync() {
        return membershipPublicationRow;
      },
      enqueueClusterMembershipReconcile(reason, context) {
        reconcileCalls.push({reason, context});
        return true;
      },
      async acknowledgeMembershipPublicationForNode(nodeId) {
        acknowledgementCalls.push(nodeId);
        return membershipPublicationRow;
      },
    };

    const service = createService({
      cacheNodes: [readyNode],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        membershipPublicationService,
      },
    });

    service.handleCacheNodeChange(SYSTEM_TABLE_NAME.NODES, readyNode);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      reconcileCalls.length,
      1,
      'cache-visible READY rows should reopen membership publication repair',
    );
    t.equal(
      reconcileCalls[0]?.reason,
      RECONCILE_REASON.NODES_CACHE_READY,
      'cache-triggered repair should use the nodes-cache reconcile reason',
    );
    t.same(
      acknowledgementCalls,
      ['node-cache-publication-gap'],
      'open publication rows should be acknowledged once READY visibility appears',
    );

    service.stop();
  });

  test('ReplicaDispatchService delegates READY acknowledgements through the ' +
    'publication owner when in-flight publication membership is cache-stale',
  async (t) => {
    initEnv();

    const now = Date.now();
    const reconcileCalls = [];
    const acknowledgementCalls = [];
    const readyNode = {
      node_id: 'node-inflight-publication-gap',
      node_address: 'localhost:8100',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now,
      ready_lease_expires_at: now + 60000,
    };
    const membershipPublicationRow = {
      publicationId: 'membership-publication:18:test',
      status: TEST_MEMBERSHIP_PUBLICATION_STATUS.ACK_PENDING,
      requiredAckNodeIds: ['node-inflight-publication-gap'],
      publishedActiveNodeIds: ['node-1'],
    };
    const membershipPublicationService = {
      getLatestPublicationForNodeSync() {
        return null;
      },
      getLatestPublicationRowSync() {
        return membershipPublicationRow;
      },
      enqueueClusterMembershipReconcile(reason, context) {
        reconcileCalls.push({reason, context});
        return true;
      },
      async acknowledgeMembershipPublicationForNode(nodeId) {
        acknowledgementCalls.push(nodeId);
        return membershipPublicationRow;
      },
    };

    const service = createService({
      cacheNodes: [readyNode],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        membershipPublicationService,
      },
    });

    service.handleCacheNodeChange(SYSTEM_TABLE_NAME.NODES, readyNode);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.same(
      membershipPublicationRow.requiredAckNodeIds,
      ['node-inflight-publication-gap'],
      'fixture should keep the READY node in the required acknowledgement set even when per-node cache visibility is stale',
    );
    t.equal(
      reconcileCalls.length,
      1,
      'cache-stale in-flight publications should still reconcile ready visibility',
    );
    t.same(
      acknowledgementCalls,
      ['node-inflight-publication-gap'],
      'in-flight publications should delegate acknowledgement ownership ' +
        'even when cache membership lags',
    );

    service.stop();
  });
}
