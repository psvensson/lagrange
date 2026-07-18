import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  SERVICE_STATUS,
  STATE,
  TYPEOF,
} from '../../src/constants/index.js';

const TEST_MEMBERSHIP_PUBLICATION_STATUS = Object.freeze({
  ACK_PENDING: 'ACK_PENDING',
  OPEN: 'OPEN',
  PUBLISHED: 'PUBLISHED',
});
const HEARTBEAT_PUBLICATION_GAP_NO_PUBLICATION_ROW = null;
const PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID = 'node-1';
const PUBLICATION_UPDATE_ACK_REMOTE_NODE_ID = 'node-publication-remote';
const PUBLICATION_UPDATE_ACK_PUBLICATION_ID =
  'membership-publication:update-ack';
const PUBLICATION_UPDATE_ACK_PUBLICATION_KIND = 'cluster_membership';
const PUBLICATION_UPDATE_ACK_PUBLICATION_EPOCH = 29;
const PUBLICATION_UPDATE_ACK_RETRY_DELAY_MS = 17;
const PUBLICATION_UPDATE_ACK_INITIAL_ATTEMPT_COUNT = 1;
const PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX = 0;
const PUBLICATION_UPDATE_ACK_NO_PUBLICATION_ROW = null;
const PUBLICATION_UPDATE_ACK_MESSAGE_GROUP_SERVICE = null;
const PUBLICATION_UPDATE_ACK_RETRY_ERROR_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const PUBLICATION_UPDATE_ACK_RETRY_ERROR_MESSAGE =
  'Distributed operation failed due to participant failures';
const PUBLICATION_UPDATE_ACK_ACTIVE_NODE_IDS = Object.freeze([
  PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID,
  PUBLICATION_UPDATE_ACK_REMOTE_NODE_ID,
]);
const PUBLICATION_UPDATE_ACK_ACKNOWLEDGED_NODE_IDS = Object.freeze([]);
const PUBLICATION_UPDATE_ACK_EMPTY_PUBLICATION_ROWS = Object.freeze([]);
const PUBLICATION_UPDATE_ACK_OPTION = Object.freeze({
  PUBLICATION_ROWS: 'publicationRows',
});
const PUBLICATION_UPDATE_ACK_READY_READINESS = Object.freeze({
  dimensions: Object.freeze({
    [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
  }),
});

function flushScheduledMembershipPublicationAdvance() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function buildPublicationUpdateAckRow() {
  return {
    publicationId: PUBLICATION_UPDATE_ACK_PUBLICATION_ID,
    publicationKind: PUBLICATION_UPDATE_ACK_PUBLICATION_KIND,
    publicationEpoch: PUBLICATION_UPDATE_ACK_PUBLICATION_EPOCH,
    status: TEST_MEMBERSHIP_PUBLICATION_STATUS.OPEN,
    publishedActiveNodeIds: PUBLICATION_UPDATE_ACK_ACTIVE_NODE_IDS,
    requiredAckNodeIds: PUBLICATION_UPDATE_ACK_ACTIVE_NODE_IDS,
    acknowledgedNodeIds: PUBLICATION_UPDATE_ACK_ACKNOWLEDGED_NODE_IDS,
  };
}

function buildPublicationUpdateAckRetryError() {
  const error = new Error(PUBLICATION_UPDATE_ACK_RETRY_ERROR_MESSAGE);
  error.code = PUBLICATION_UPDATE_ACK_RETRY_ERROR_CODE;
  return error;
}

function resolvePublicationUpdateAckRowFromOptions(options, fallbackRow) {
  const publicationRows = Array.isArray(
    options?.[PUBLICATION_UPDATE_ACK_OPTION.PUBLICATION_ROWS],
  ) ?
    options[PUBLICATION_UPDATE_ACK_OPTION.PUBLICATION_ROWS] :
    PUBLICATION_UPDATE_ACK_EMPTY_PUBLICATION_ROWS;
  return publicationRows[PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX] ||
    fallbackRow;
}

function createPublicationUpdateAckReadinessService({
  publicationRow,
  acknowledgementCalls,
  reconcileCalls,
  readinessChecks,
}) {
  return {
    getNodeReadinessSync(nodeId) {
      readinessChecks.push(nodeId);
      return PUBLICATION_UPDATE_ACK_READY_READINESS;
    },
    membershipPublicationService: {
      getLatestPublicationRowSync(options) {
        return resolvePublicationUpdateAckRowFromOptions(
          options,
          publicationRow,
        );
      },
      getLatestPublicationForNodeSync(nodeId, options) {
        if (nodeId !== PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID) {
          return PUBLICATION_UPDATE_ACK_NO_PUBLICATION_ROW;
        }
        return resolvePublicationUpdateAckRowFromOptions(
          options,
          publicationRow,
        );
      },
      enqueueClusterMembershipReconcile(reason, context) {
        reconcileCalls.push({reason, context});
        return true;
      },
      async acknowledgeMembershipPublicationForNode(nodeId, options) {
        acknowledgementCalls.push({nodeId, options});
        return resolvePublicationUpdateAckRowFromOptions(
          options,
          publicationRow,
        );
      },
    },
  };
}

export function registerReplicaDispatchNodeStatePublicationUpdateAckTests({
  createService,
  initEnv,
}) {
  test('ReplicaDispatchService acknowledges local membership publication when ' +
    'a publication cache row arrives for an already READY node',
  async (t) => {
    initEnv();

    const publicationRow = buildPublicationUpdateAckRow();
    const acknowledgementCalls = [];
    const reconcileCalls = [];
    const readinessChecks = [];
    const service = createService({
      cdcIntegrationService: {},
      controlPlaneReadinessService: createPublicationUpdateAckReadinessService({
        publicationRow,
        acknowledgementCalls,
        reconcileCalls,
        readinessChecks,
      }),
    });

    service.handleCacheNodeChange(
      SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      publicationRow,
    );
    await flushScheduledMembershipPublicationAdvance();

    t.same(
      readinessChecks,
      [PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID],
      'publication cache updates should gate the local acknowledgement on READY',
    );
    t.equal(
      reconcileCalls.length,
      1,
      'publication cache updates should re-enter the publication owner queue',
    );
    t.equal(
      reconcileCalls[PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX]
        ?.reason,
      RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CACHE_UPDATE,
      'cache-triggered publication repair should use the cache reason',
    );
    t.same(
      acknowledgementCalls.map((call) => call.nodeId),
      [PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID],
      'publication cache updates should acknowledge the local ready node',
    );
    t.equal(
      acknowledgementCalls[PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX]
        ?.options?.[PUBLICATION_UPDATE_ACK_OPTION.PUBLICATION_ROWS]
        ?.[PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX],
      publicationRow,
      'cache-triggered acknowledgement should carry the visible publication row',
    );

    service.stop();
  });

  test('ReplicaDispatchService acknowledges local membership publication when ' +
    'a publication CDC row arrives for an already READY node',
  async (t) => {
    initEnv();

    const publicationRow = buildPublicationUpdateAckRow();
    const acknowledgementCalls = [];
    const reconcileCalls = [];
    const readinessChecks = [];
    const service = createService({
      cdcIntegrationService: {},
      controlPlaneReadinessService: createPublicationUpdateAckReadinessService({
        publicationRow,
        acknowledgementCalls,
        reconcileCalls,
        readinessChecks,
      }),
    });

    await service.handleCdcApplied(PUBLICATION_UPDATE_ACK_MESSAGE_GROUP_SERVICE, {
      tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      data: publicationRow,
    });
    await flushScheduledMembershipPublicationAdvance();

    t.same(
      readinessChecks,
      [PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID],
      'publication CDC updates should gate the local acknowledgement on READY',
    );
    t.equal(
      reconcileCalls.length,
      1,
      'publication CDC updates should re-enter the publication owner queue',
    );
    t.equal(
      reconcileCalls[PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX]
        ?.reason,
      RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CDC_UPDATE,
      'CDC-triggered publication repair should use the CDC reason',
    );
    t.same(
      acknowledgementCalls.map((call) => call.nodeId),
      [PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID],
      'publication CDC updates should acknowledge the local ready node',
    );
    t.equal(
      acknowledgementCalls[PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX]
        ?.options?.[PUBLICATION_UPDATE_ACK_OPTION.PUBLICATION_ROWS]
        ?.[PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX],
      publicationRow,
      'CDC-triggered acknowledgement should carry the visible publication row',
    );

    service.stop();
  });

  test('ReplicaDispatchService retries transient membership publication ACK ' +
    'write failures from the publication update path',
  async (t) => {
    initEnv();

    const publicationRow = buildPublicationUpdateAckRow();
    const acknowledgementCalls = [];
    const reconcileCalls = [];
    const readinessChecks = [];
    const scheduledRetries = [];
    const service = createService({
      cdcIntegrationService: {},
      nodeStateUpdateRetryAfterMs: PUBLICATION_UPDATE_ACK_RETRY_DELAY_MS,
      setTimeoutFn(callback, delayMs) {
        const handle = {callback, delayMs};
        scheduledRetries.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          readinessChecks.push(nodeId);
          return PUBLICATION_UPDATE_ACK_READY_READINESS;
        },
        membershipPublicationService: {
          getLatestPublicationRowSync(options) {
            return resolvePublicationUpdateAckRowFromOptions(
              options,
              publicationRow,
            );
          },
          getLatestPublicationForNodeSync(nodeId, options) {
            if (nodeId !== PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID) {
              return PUBLICATION_UPDATE_ACK_NO_PUBLICATION_ROW;
            }
            return resolvePublicationUpdateAckRowFromOptions(
              options,
              publicationRow,
            );
          },
          enqueueClusterMembershipReconcile(reason, context) {
            reconcileCalls.push({reason, context});
            return true;
          },
          async acknowledgeMembershipPublicationForNode(nodeId, options) {
            acknowledgementCalls.push({nodeId, options});
            if (
              acknowledgementCalls.length ===
              PUBLICATION_UPDATE_ACK_INITIAL_ATTEMPT_COUNT
            ) {
              throw buildPublicationUpdateAckRetryError();
            }
            return publicationRow;
          },
        },
      },
    });

    service.handleCacheNodeChange(
      SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      publicationRow,
    );
    await flushScheduledMembershipPublicationAdvance();

    t.equal(
      scheduledRetries.length,
      1,
      'transient publication ACK failures should arm one deferred retry',
    );
    t.equal(
      scheduledRetries[PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX]
        ?.delayMs,
      PUBLICATION_UPDATE_ACK_RETRY_DELAY_MS,
      'publication ACK retry should use the dispatch retry delay',
    );

    scheduledRetries[
      PUBLICATION_UPDATE_ACK_FIRST_PUBLICATION_ROW_INDEX
    ].callback();
    await flushScheduledMembershipPublicationAdvance();

    t.same(
      acknowledgementCalls.map((call) => call.nodeId),
      [
        PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID,
        PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID,
      ],
      'deferred publication ACK retry should retry the local node',
    );
    t.equal(
      typeof acknowledgementCalls[
        PUBLICATION_UPDATE_ACK_INITIAL_ATTEMPT_COUNT
      ]?.options,
      TYPEOF.UNDEFINED,
      'deferred publication ACK retry should re-read the current publication',
    );
    t.same(
      reconcileCalls.map((call) => call.reason),
      [
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CACHE_UPDATE,
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_ACK_RETRY,
      ],
      'publication ACK retry should re-enter publication reconciliation',
    );
    t.same(
      readinessChecks,
      [
        PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID,
        PUBLICATION_UPDATE_ACK_LOCAL_NODE_ID,
      ],
      'publication update and deferred ACK retry should be readiness gated',
    );

    service.stop();
  });
}

export function registerReplicaDispatchNodeStateReadyMembershipPublicationTests({
  createService,
  initEnv,
}) {
  test('ReplicaDispatchService acknowledges required membership publication ' +
    'for READY node-state updates', async (t) => {
    initEnv();

    const now = Date.now();
    const acknowledgements = [];
    const cacheNode = {
      node_id: 'node-publication-ack',
      node_address: 'localhost:8087',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
      created_at: now - 5000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({
          success: true,
          partitionResult: {affectedRows: 1},
        }),
      },
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async acknowledgeMembershipPublicationForNode(nodeId, options) {
            acknowledgements.push({nodeId, options});
            return options?.publicationRow || null;
          },
        },
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-publication-ack',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8087',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(
      acknowledgements.length,
      1,
      'ready node-state updates should delegate cluster publication ' +
        'acknowledgement to publication service',
    );
    t.equal(
      acknowledgements[0]?.nodeId,
      'node-publication-ack',
      'acknowledgement should target the ready node id',
    );
    t.equal(
      typeof acknowledgements[0]?.options,
      TYPEOF.UNDEFINED,
      'dispatch should pass only the node id to the publication owner API',
    );

    service.stop();
  });

  test('ReplicaDispatchService delegates stale cache READY acknowledgements to ' +
    'the publication owner API', async (t) => {
    initEnv();

    const now = Date.now();
    const refreshCalls = [];
    const acknowledgements = [];
    const cacheNode = {
      node_id: 'node-publication-refresh-ack',
      node_address: 'localhost:8088',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
      created_at: now - 5000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({
          success: true,
          partitionResult: {affectedRows: 1},
        }),
      },
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async acknowledgeMembershipPublicationForNode(nodeId, options) {
            refreshCalls.push({nodeId, options});
            acknowledgements.push({nodeId, options});
            return options?.publicationRow || null;
          },
        },
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-publication-refresh-ack',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8088',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(
      acknowledgements.length,
      1,
      'publication owner should receive one READY acknowledgement delegation call',
    );
    t.equal(
      acknowledgements[0]?.options,
      undefined,
      'dispatch should pass only the node id to the publication owner API',
    );
    t.equal(refreshCalls.length, 1, 'dispatch should call the owner API once');
    t.equal(
      refreshCalls[0]?.nodeId,
      'node-publication-refresh-ack',
      'owner API should be called for the ready node',
    );

    service.stop();
  });

  test('ReplicaDispatchService READY node-state updates enqueue cluster ' +
    'membership reconcile through the publication owner queue', async (t) => {
    initEnv();

    const now = Date.now();
    const nodeId = 'node-publication-reconcile';
    const nodeAddress = 'localhost:8089';
    const publicationPeerNodeId = 'node-publication-reconcile-peer';
    const publicationTargetNodeIds = [
      nodeId,
      publicationPeerNodeId,
    ].sort((left, right) => left.localeCompare(right));
    const reconcileEnqueues = [];
    const cacheNode = {
      node_id: nodeId,
      node_address: nodeAddress,
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
      created_at: now - 5000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({
          success: true,
          partitionResult: {affectedRows: 1},
        }),
      },
      controlPlaneReadinessService: {
        membershipPublicationService: {
          getLatestPublicationForNodeSync() {
            return HEARTBEAT_PUBLICATION_GAP_NO_PUBLICATION_ROW;
          },
          getLatestPublicationRowSync() {
            return {
              status: TEST_MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds: [publicationPeerNodeId],
            };
          },
          enqueueClusterMembershipReconcile(reason, context) {
            reconcileEnqueues.push({reason, context});
            return true;
          },
        },
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: nodeId,
      [ControlPlaneField.NODE_ADDRESS]: nodeAddress,
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(
      reconcileEnqueues.length,
      1,
      'READY node-state updates should re-enter the canonical membership publication owner queue',
    );
    t.equal(
      reconcileEnqueues[0]?.context?.nodeId,
      nodeId,
      'reconcile enqueue should preserve the ready node id',
    );
    t.same(
      reconcileEnqueues[0]?.context?.publishedActiveNodeIds,
      publicationTargetNodeIds,
      'ready reconcile should carry an explicit published-active target',
    );

    service.stop();
  });
}
