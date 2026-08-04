// Shared support for the cache-based-routing suites (unit + property): the
// delivery-tracking mock message router and the single-leader routing rows
// both files previously duplicated inline (duplication-ratchet extraction).
// Distinct from query-executor-mock-message-router.js, which serves rows from
// a partition-data map and does not record deliveries.

import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Create a mock message router that tracks deliveries.
 * @return {Object} Mock message router with tracking.
 */
export function createDeliveryTrackingMessageRouter() {
  const deliveries = [];

  return {
    deliver: async function(address, message) {
      deliveries.push({address, message});
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 0,
      };
    },
    getDeliveries: function() {
      return deliveries;
    },
    clearDeliveries: function() {
      deliveries.length = 0;
    },
  };
}

/**
 * One partition with one ACTIVE raft-leader service on nodeAddress - the
 * routing fixture every cache-based-routing property arm starts from.
 * @param {string} tableName
 * @param {string} partitionId
 * @param {string} nodeAddress
 * @return {{partitions: Object[], services: Object[]}}
 */
export function buildSingleLeaderRoutingRows(tableName, partitionId, nodeAddress) {
  return {
    partitions: [{
      partition_id: partitionId,
      table_name: tableName,
      start_key: '',
      end_key: '',
    }],
    services: [{
      partition_id: partitionId,
      service_type: SERVICE_TYPE.PARTITION,
      raft_role: RAFT_ROLE.LEADER,
      status: SERVICE_STATUS.ACTIVE,
      address: `${nodeAddress}/partition/${partitionId}`,
      node_id: nodeAddress,
      service_id: partitionId,
    }],
  };
}
