import {test} from '../../src/test-helpers/tap.js';
import {
  activatePartitionServiceRows,
  PARTITION_SERVICE_ACTIVATION_ERROR,
} from '../../src/bootstrap/shared/partition-service-activation.js';

test('activatePartitionServiceRows requires initialized runtime',
  async (t) => {
    await t.rejects(
      activatePartitionServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => ({success: true}),
          upsertSystemTableRow: async () => ({success: true}),
        },
        messageRouter: {
          isRegistered: () => true,
        },
        partitionServices: new Map([
          ['p1-r1', {
            partitionId: 'p1',
            initialized: false,
          }],
        ]),
      }),
      new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR.runtimeRequired('p1-r1'),
      ),
      'activation should fail closed until local partition runtime is ready',
    );
  });

test('activatePartitionServiceRows requires per-replica handler registration',
  async (t) => {
    await t.rejects(
      activatePartitionServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => ({success: true}),
          upsertSystemTableRow: async () => ({success: true}),
        },
        messageRouter: {
          isRegistered: (address) =>
            address === 'node-a/partition/p1-r1',
        },
        partitionServices: new Map([
          ['p1-r1', {
            partitionId: 'p1',
            initialized: true,
          }],
          ['p1-r2', {
            partitionId: 'p1',
            initialized: true,
          }],
        ]),
      }),
      new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR
          .replicaHandlerRequired('p1-r2'),
      ),
      'activation should fail closed until every partition handler is routable',
    );
  });
