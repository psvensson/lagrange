import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {clearAllReservations} from '../../src/partition/partition-locking-read-reservation.js';

function createMockMessageRouter(mockPartitionData) {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: data,
          changes: 1,
        });
      }
      // A participant answers the transaction protocol (TX1 design 2.2): a
      // PREPARE names its state and digest, a COMMIT its outcome.
      if (message.type === 'TRANSACTION') {
        return buildDeliveryEnvelope({acknowledged: true},
          answerParticipantTransactionRequest(message));
      }
      return buildDeliveryEnvelope({acknowledged: true}, {success: true, changes: 1});
    },
  };
}

/**
 * Create a mock system cache with services for routing.
 */
function createMockSystemCache(tables, partitions) {
  clearAllReservations();
  const normalizedTables = tables.map((t) => ({
    primary_key: 'id',
    primaryKey: 'id',
    partition_key: 'id',
    partition_key_type: 'TEXT',
    ...t,
  }));
  const normalizedPartitions = partitions.map((partition) => ({
    partition_key_type: 'TEXT',
    ...partition,
    leader_node_id: partition.leader_node_id || partition.leaderNodeId || 'test-node',
  }));
  const services = normalizedPartitions.map((p) => ({
    service_id: p.partition_id,
    service_type: 'partition',
    partition_id: p.partition_id,
    node_id: 'test-node',
    address: `test-node/partition/${p.partition_id}`,
    status: 'active',
    raft_role: 'leader',
  }));

  return {
    tables: normalizedTables,
    partitions: normalizedPartitions,
    services,
    get: function(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
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
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      return [];
    },
  };
}

export {createMockMessageRouter, createMockSystemCache};
