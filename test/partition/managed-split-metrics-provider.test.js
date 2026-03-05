import {test} from '../../src/test-helpers/tap.js';
import {createManagedSplitMetricsProvider} from '../../src/partition/managed-split-metrics-provider.js';

test('createManagedSplitMetricsProvider prefers live local leader size over stale ' +
  'partition row size', async (t) => {
  const partitionServices = new Map([
    ['users-p1-r1', {
      partitionId: 'users-p1',
      isLeader: true,
      getSize() {
        return 622592;
      },
    }],
  ]);

  const getPartitionMetrics = createManagedSplitMetricsProvider({
    partitionServices,
  });

  t.same(
    getPartitionMetrics('users-p1', {
      partition_id: 'users-p1',
      size_bytes: 0,
    }),
    {
      sizeBytes: 622592,
      queriesPerMinute: 0,
    },
  );
});

test('createManagedSplitMetricsProvider falls back to persisted partition row size',
  async (t) => {
    const getPartitionMetrics = createManagedSplitMetricsProvider({
      partitionServices: new Map(),
    });

    t.same(
      getPartitionMetrics('users-p1', {
        partition_id: 'users-p1',
        size_bytes: 16384,
      }),
      {
        sizeBytes: 16384,
        queriesPerMinute: 0,
      },
    );
  });
