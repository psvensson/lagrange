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

test('createManagedSplitMetricsProvider derives queries-per-minute from local ' +
  'leader CDC write counters', async (t) => {
  let nowMs = 1_000_000;
  let generatedCount = 10;
  const partitionServices = new Map([
    ['users-p1-r1', {
      partitionId: 'users-p1',
      isLeader: true,
      getSize() {
        return 622592;
      },
      cdcPipelineMetrics: {
        getSnapshot() {
          return {eventsGenerated: generatedCount};
        },
      },
    }],
  ]);

  const getPartitionMetrics = createManagedSplitMetricsProvider({
    partitionServices,
    now: () => nowMs,
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
    'first observation establishes the baseline sample',
  );

  nowMs += 1000;
  generatedCount = 22;

  const metrics = getPartitionMetrics('users-p1', {
    partition_id: 'users-p1',
    size_bytes: 0,
  });
  t.equal(
    metrics.queriesPerMinute,
    720,
    'delta writes over one second should be projected to minute-rate',
  );
});

test('createManagedSplitMetricsProvider ignores non-monotonic local leader CDC ' +
  'counter regressions', async (t) => {
  let nowMs = 1_000_000;
  let generatedCount = 50;
  const partitionServices = new Map([
    ['users-p1-r1', {
      partitionId: 'users-p1',
      isLeader: true,
      getSize() {
        return 622592;
      },
      cdcPipelineMetrics: {
        getSnapshot() {
          return {eventsGenerated: generatedCount};
        },
      },
    }],
  ]);

  const getPartitionMetrics = createManagedSplitMetricsProvider({
    partitionServices,
    now: () => nowMs,
  });

  getPartitionMetrics('users-p1', {
    partition_id: 'users-p1',
    size_bytes: 0,
  });

  nowMs += 1000;
  generatedCount = 10;

  t.equal(
    getPartitionMetrics('users-p1', {
      partition_id: 'users-p1',
      size_bytes: 0,
    }).queriesPerMinute,
    0,
    'counter resets should not produce negative or stale throughput',
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
