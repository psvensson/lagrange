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

test('activatePartitionServiceRows can defer pressure admission failures',
  async (t) => {
    const deferred = [];

    await t.resolves(
      activatePartitionServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => {
            const error = new Error('control_plane_pressure_degraded');
            error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
            error.deferRetry = true;
            error.retryAfterMs = 250;
            throw error;
          },
          upsertSystemTableRow: async () => {
            const error = new Error('control_plane_pressure_degraded');
            error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
            error.deferRetry = true;
            error.retryAfterMs = 250;
            throw error;
          },
        },
        messageRouter: {
          isRegistered: () => true,
        },
        partitionServices: new Map([
          ['p1-r1', {
            partitionId: 'p1',
            initialized: true,
          }],
        ]),
        deferTransientFailures: true,
        onDeferredActivation: (details) => deferred.push(details),
      }),
      'seed/join activation should not fail hard on pressure admission deferrals when deferral is enabled',
    );

    t.equal(
      deferred.length,
      1,
      'pressure admission deferral should be surfaced via deferred callback',
    );
    t.equal(
      deferred[0]?.replicaId,
      'p1-r1',
      'callback should identify the deferred partition replica',
    );
  });
