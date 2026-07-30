const GP3_INCLUDED_IOPS = 3_000;
const GP3_INCLUDED_THROUGHPUT_MIB_PER_SECOND = 125;
const CAPACITY_BOOTSTRAP_RESAMPLES = 2_000;
const FAMILY_WISE_ALPHA = 0.05;
const EFFECT_COUNT = 16;
const MOVIELENS_MEASURED_P0_OPERATION_TIMEOUT_MS = 120_000;
const CAPACITY_SLO = Object.freeze({
  maxErrorRate: 0.05,
  maxP99LatencyMs: 5_000,
});
const COMMON_SAMPLING = Object.freeze({
  clientMaxInFlight: 1,
  clientMaxQueueDepth: 1,
  maxReleaseLagMs: 100,
  operationTimeoutMs: MOVIELENS_MEASURED_P0_OPERATION_TIMEOUT_MS,
  resetTimeoutMs: 30_000,
  semanticFinalizerTimeoutMs: 120_000,
  tailQuantile: 0.99,
  tailSampleMinimum: 100,
});
const CAPACITY_PROFILES_BY_DATASET_SIZE = Object.freeze({
  10000: Object.freeze({
    offeredLoadsPerSecond: Object.freeze([3, 10, 240, 480]),
    sampling: Object.freeze({
      ...COMMON_SAMPLING,
      windows: Object.freeze([
        Object.freeze({
          offeredLoadPerSecond: 3,
          measuredMs: 34_000,
          warmupMs: 5_000,
        }),
        Object.freeze({
          offeredLoadPerSecond: 10,
          measuredMs: 34_000,
          warmupMs: 5_000,
        }),
        Object.freeze({
          offeredLoadPerSecond: 240,
          measuredMs: 34_000,
          warmupMs: 5_000,
        }),
        Object.freeze({
          offeredLoadPerSecond: 480,
          measuredMs: 34_000,
          warmupMs: 5_000,
        }),
      ]),
    }),
    slo: CAPACITY_SLO,
  }),
  100000: Object.freeze({
    offeredLoadsPerSecond: Object.freeze([0.2, 1, 80, 120]),
    sampling: Object.freeze({
      ...COMMON_SAMPLING,
      windows: Object.freeze([
        Object.freeze({
          offeredLoadPerSecond: 0.2,
          measuredMs: 510_000,
          warmupMs: 15_000,
        }),
        Object.freeze({
          offeredLoadPerSecond: 1,
          measuredMs: 305_000,
          warmupMs: 10_000,
        }),
        Object.freeze({
          offeredLoadPerSecond: 80,
          measuredMs: 305_000,
          warmupMs: 10_000,
        }),
        Object.freeze({
          offeredLoadPerSecond: 120,
          measuredMs: 305_000,
          warmupMs: 10_000,
        }),
      ]),
    }),
    slo: CAPACITY_SLO,
  }),
});

export const MOVIELENS_MEASURED_P0_IDENTITY = Object.freeze({
  CAMPAIGN:
    'comparative-efficiency-movielens-measured-p0-campaign-v1',
  PAIR: 'lagrange-postgresql-movielens-measured-p0-v1',
  STUDY: 'movielens-measured-p0-capacity-v2',
  WORKLOAD: 'movielens-confidence-adjusted-top-ten',
});

export const MOVIELENS_MEASURED_P0_SIDE_IDS =
  Object.freeze(['lagrange', 'postgresql']);

export const MOVIELENS_MEASURED_P0_CAPACITY = Object.freeze({
  profilesByDatasetSize: CAPACITY_PROFILES_BY_DATASET_SIZE,
  calibrationBasis: Object.freeze({
    status: 'non_outcome_pre_campaign_live_calibration',
    commonSloPolicy: 'fixed_across_all_eight_cells',
    maximumObservedCorrectLagrange100kOperationMs: 3_030.0355,
    minimumObservedCorrectPostgresql100kOperationMs: 14.656428,
    maximumObservedPostgresql10kCorrectThroughputPerSecond: 414.7,
    maximumObservedPostgresql100kCorrectThroughputPerSecond: 85.9968,
    lowLoadPolicy:
      'five_second_release_interval_exceeds_observed_correct_latency',
    highLoadPolicy:
      '480_qps_at_10k_and_120_qps_at_100k_exceed_observed_serial_ceilings',
    durationPolicy:
      'minimum_100_correct_tail_samples_at_each_sealed_coordinate',
    overloadQueuePolicy:
      'one_waiting_operation_bounds_terminal_drain_without_hiding_rejection',
  }),
  repetitions: Object.freeze({
    maximum: 5,
    minimum: 3,
  }),
  statistics: Object.freeze({
    bootstrapResamples: CAPACITY_BOOTSTRAP_RESAMPLES,
    confidenceLevel: 1 - FAMILY_WISE_ALPHA / EFFECT_COUNT,
    practicalSignificanceRatio: 0.05,
    targetRelativeCiWidth: 0.35,
  }),
  randomSeed: 20_260_728,
});

export const MOVIELENS_MEASURED_P0_STORAGE_GATES = Object.freeze({
  maximumIops: GP3_INCLUDED_IOPS,
  maximumThroughputMiBPerSecond:
    GP3_INCLUDED_THROUGHPUT_MIB_PER_SECOND,
});
