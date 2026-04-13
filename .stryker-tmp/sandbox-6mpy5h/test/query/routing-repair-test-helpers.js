// @ts-nocheck
import {
  ERRORS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';

/**
 * Build a stale-owner handoff fixture that can be shared across query routing
 * tests. The overlay refresh publishes the new owner metadata.
 * @param {Object} [options]
 * @return {Object}
 */
export function createStaleOverlayOwnerHandoffFixture(options = {}) {
  const partitionId = options.partitionId || 'replica_operations-p1';
  const staleOwnerNodeId = options.staleOwnerNodeId || 'old-owner';
  const refreshedOwnerNodeId = options.refreshedOwnerNodeId || 'new-owner';
  const sameServiceId = options.sameServiceId === true;

  const staleReplicaId = options.staleReplicaId || `${partitionId}-r1`;
  const refreshedReplicaId = sameServiceId ?
    staleReplicaId :
    (options.refreshedReplicaId || `${partitionId}-r4`);

  const staleAddress = options.staleAddress ||
    `${staleOwnerNodeId}/partition/${staleReplicaId}`;
  const refreshedAddress = options.refreshedAddress ||
    `${refreshedOwnerNodeId}/partition/${refreshedReplicaId}`;

  const overlayRefreshCalls = [];
  const deliveries = [];
  const routingOverlayState = new Map();

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        table_name: options.tableName || TABLES.REPLICA_OPERATIONS,
        leader_node_id: staleOwnerNodeId,
      },
    ],
    services: [
      {
        service_id: staleReplicaId,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: staleOwnerNodeId,
        raft_role: 'leader',
        address: staleAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const routingMetadataOverlay = {
    getPartitionById(partitionKey) {
      return routingOverlayState.get(partitionKey)?.partition || null;
    },
    getServicesForPartition(partitionKey) {
      return routingOverlayState.get(partitionKey)?.services || [];
    },
    async refreshPartitionRouting(partitionKey, refreshOptions = {}) {
      overlayRefreshCalls.push({partitionKey, options: refreshOptions});
      if (partitionKey !== partitionId) {
        return false;
      }
      routingOverlayState.set(partitionId, {
        partition: {
          partition_id: partitionId,
          table_name: options.tableName || TABLES.REPLICA_OPERATIONS,
          leader_node_id: refreshedOwnerNodeId,
        },
        services: [
          {
            service_id: refreshedReplicaId,
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: refreshedOwnerNodeId,
            raft_role: 'leader',
            address: refreshedAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
        ],
      });
      return true;
    },
  };

  const messageRouter = createNoHandlerRepairMessageRouter({
    staleAddress,
    refreshedAddress,
    deliveries,
    overlayRefreshCalls,
    successRows: options.successRows || [{ok: true}],
    failOnStaleAfterRefresh: options.failOnStaleAfterRefresh !== false,
  });

  return {
    partitionId,
    staleAddress,
    refreshedAddress,
    staleReplicaId,
    refreshedReplicaId,
    systemCache,
    routingMetadataOverlay,
    routingOverlayState,
    overlayRefreshCalls,
    deliveries,
    messageRouter,
  };
}

/**
 * Build a message router that reports no-handler for the stale address and
 * succeeds for the refreshed address.
 * @param {Object} options
 * @return {Object}
 */
export function createNoHandlerRepairMessageRouter(options) {
  const staleAddress = options.staleAddress;
  const refreshedAddress = options.refreshedAddress;
  const deliveries = options.deliveries || [];
  const overlayRefreshCalls = options.overlayRefreshCalls || [];
  const failOnStaleAfterRefresh = options.failOnStaleAfterRefresh === true;
  const successRows = Array.isArray(options.successRows) ? options.successRows : [{ok: true}];

  return {
    async deliver(address) {
      deliveries.push(address);

      if (address === staleAddress) {
        if (failOnStaleAfterRefresh && overlayRefreshCalls.length > 0) {
          throw new Error(
            'stale no-handler address retried after routing refresh',
          );
        }
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }

      if (address === refreshedAddress) {
        return {
          acknowledged: true,
          success: true,
          rows: successRows,
          changes: successRows.length,
        };
      }

      return {
        acknowledged: true,
        success: false,
        error: `unexpected address: ${address}`,
      };
    },
  };
}

/**
 * Assert that one no-handler witness is repaired by routing refresh and the
 * stale address is never retried afterward.
 * @param {Object} t
 * @param {Object} options
 */
export function assertNoHandlerRepairConverged(t, options = {}) {
  const deliveries = Array.isArray(options.deliveries) ? options.deliveries : [];
  const staleAddress = options.staleAddress;
  const refreshedAddress = options.refreshedAddress;
  const overlayRefreshCalls = Array.isArray(options.overlayRefreshCalls) ?
    options.overlayRefreshCalls :
    null;
  const context = options.context || 'routing repair';

  t.same(
    deliveries,
    [staleAddress, refreshedAddress],
    `${context} should retry exactly once with the refreshed endpoint`,
  );

  const staleRetryCount = deliveries
    .slice(1)
    .filter((address) => address === staleAddress)
    .length;
  t.equal(
    staleRetryCount,
    0,
    `${context} should not retry stale no-handler address after refresh`,
  );

  if (overlayRefreshCalls !== null) {
    const expectedRefreshCalls =
      Number.isFinite(options.expectedRefreshCalls) ?
        options.expectedRefreshCalls :
        1;
    t.equal(
      overlayRefreshCalls.length,
      expectedRefreshCalls,
      `${context} should run routing overlay refresh ${expectedRefreshCalls} time(s)`,
    );
  }
}
