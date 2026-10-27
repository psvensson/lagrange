import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
// Mock message router that routes queries to mock partition data.
const mockPartitionData = new Map();

export function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/partitionId).
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: data,
          changes: data.length || 1,
        });
      }
      return buildDeliveryEnvelope({acknowledged: true}, {success: true, changes: 1});
    },
  };
}
