/**
 * Shared test support for the SQL Query Engine suites.
 *
 * Houses the mock builders that were previously duplicated verbatim across
 * sql-query-engine.test.js and its split test-part files. Helper bodies are
 * preserved unchanged; this module is the single semantic home for them.
 */

import {COLUMN} from '../../src/constants/index.js';

// Mock partition data for routing
export const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
export function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/replicaId)
      const parts = address.split('/');
      const replicaId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      return {acknowledged: true, success: true};
    },
  };
}

// Mock system cache with services for routing
export function createMockSystemCache(tables, partitions, services, nodes = []) {
  const resolvedServices = services || partitions.map((p) => ({
    service_id: p.partition_id,
    service_type: 'partition',
    partition_id: p.partition_id,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${p.partition_id}`,
    status: 'active',
  }));
  const resolvedPartitions = partitions.map((partition) => {
    if (Object.prototype.hasOwnProperty.call(partition, 'leader_node_id') ||
        Object.prototype.hasOwnProperty.call(partition, 'leaderNodeId')) {
      return partition;
    }
    const leaderService = resolvedServices.find((service) =>
      service.partition_id === partition.partition_id &&
      service.raft_role === 'leader',
    ) || resolvedServices.find((service) =>
      service.partition_id === partition.partition_id,
    );
    return {
      ...partition,
      leader_node_id: leaderService?.node_id || 'test-node',
    };
  });
  return {
    tables,
    partitions: resolvedPartitions,
    services: resolvedServices,
    get: function(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      if (type === 'nodes') {
        return nodes.find((node) => node[COLUMN.NODE_ID] === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'nodes') {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      if (type === 'nodes') return nodes;
      return [];
    },
  };
}

export function uniqueNodeIds(nodeIds) {
  return [...new Set(nodeIds)];
}

export function createAdmittedSplitAdmissionService() {
  return {
    async checkSplit(options = {}) {
      return {
        allowed: true,
        decisionType: 'admitted',
        decision: 'admitted',
        operationType: 'partition_split',
        requiredReplicaCount: options.requiredReplicaCount || 1,
        candidateTargetNodeIds: Array.isArray(options.targetNodeIds) ?
          [...options.targetNodeIds] :
          [],
        eligibleNodeIds: Array.isArray(options.targetNodeIds) ?
          [...options.targetNodeIds] :
          [],
        sourceRoutableNodeIds: Array.isArray(options.sourceRoutableNodeIds) ?
          [...options.sourceRoutableNodeIds] :
          [],
      };
    },
  };
}
