import {
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS,
} from './comparative-efficiency-movielens-grouped-reduce-constants.js';

const HOURS_PER_BILLING_MONTH = 730;
const SECONDS_PER_HOUR = 3_600;
const BYTES_PER_GIGABYTE = 1_000_000_000;
const C7I_LARGE_VCPU_COUNT = 2;
const C7I_LARGE_MEMORY_BYTES = 4_294_967_296;
const C7I_LARGE_HOURLY_USD = 0.09555;
const GP3_GIGABYTE_MONTHLY_USD = 0.0836;
const REGIONAL_TRANSFER_GIGABYTE_USD = 0.01;
const GP3_INCLUDED_IOPS = 3_000;
const GP3_INCLUDED_THROUGHPUT_MIB_PER_SECOND = 125;
const INSTANCE_STORAGE_BYTES = 20 * BYTES_PER_GIGABYTE;
const CAPACITY_BOOTSTRAP_RESAMPLES = 2_000;
const FAMILY_WISE_ALPHA = 0.05;
const EFFECT_COUNT = 16;
export const MOVIELENS_MEASURED_P0_OPERATION_TIMEOUT_MS = 120_000;
export const MOVIELENS_MEASURED_P0_REQUEST_CELL_TARGET_REPLICA_COUNT = 3;
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

export const MOVIELENS_MEASURED_P0_SCENARIO = Object.freeze({
  CAMPAIGN: 'comparative-efficiency-movielens-measured-p0-campaign',
  CAPACITY: 'comparative-efficiency-movielens-measured-p0-capacity',
  COST: 'comparative-efficiency-movielens-measured-p0-cost',
  PROJECTION: 'comparative-efficiency-movielens-measured-p0-projection',
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

export const MOVIELENS_MEASURED_P0_AXES =
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES;

export const MOVIELENS_MEASURED_P0_CELLS =
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS;

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

export const MOVIELENS_MEASURED_P0_TOPOLOGY = Object.freeze({
  provider: 'aws-regional-price-projection',
  region: 'eu-north-1',
  availabilityZonePolicy: 'single_zone_no_inter_zone_bytes',
  lagrange: Object.freeze({
    nodeCount: 7,
    requestEndpointCount: 1,
    automaticEndpointFailover: false,
    tableReplicaCountByTopology: Object.freeze({
      replicated: 3,
      single_replica: 1,
    }),
  }),
  postgresql: Object.freeze({
    majorVersion: 16,
    queryEndpointCount: 1,
    automaticEndpointFailover: false,
    streamingReplicaCountByTopology: Object.freeze({
      replicated: 2,
      single_replica: 0,
    }),
  }),
  equivalenceScope:
    'warm-steady-state-single-query-endpoint-with-matched-durable-copy-count',
});

export const MOVIELENS_MEASURED_P0_SKU_PROJECTION = Object.freeze({
  instance: Object.freeze({
    instanceType: 'c7i.large',
    operatingSystem: 'Linux',
    preinstalledSoftware: 'NA',
    tenancy: 'Shared',
    capacityStatus: 'Used',
    sku: 'C89GPF3EGC875HD6',
    hourlyUsd: C7I_LARGE_HOURLY_USD,
    vcpuCount: C7I_LARGE_VCPU_COUNT,
    memoryBytes: C7I_LARGE_MEMORY_BYTES,
  }),
  storage: Object.freeze({
    volumeType: 'gp3',
    storageSku: 'H33YTQG3Y9XKNSF3',
    iopsSku: 'XS8EGK3XM47WU7KN',
    throughputSku: '5S36SXRUX9DP4FTA',
    bytesPerInstance: INSTANCE_STORAGE_BYTES,
    includedIops: GP3_INCLUDED_IOPS,
    includedThroughputMiBPerSecond:
      GP3_INCLUDED_THROUGHPUT_MIB_PER_SECOND,
  }),
  transfer: Object.freeze({
    regionalSku: '9SM7SWX5Q58YJD7K',
    usdPerGigabyte: REGIONAL_TRANSFER_GIGABYTE_USD,
  }),
});

export const MOVIELENS_MEASURED_P0_PRICE_SOURCE = Object.freeze({
  version: 'movielens-measured-p0-aws-price-source-v1',
  sealedBeforeExecution: true,
  provider: 'Amazon Web Services',
  region: 'eu-north-1',
  currency: 'USD',
  priceDate: '2026-07-28',
  selectedRecordsCanonicalization:
    'jq-cS-products-and-on-demand-price-dimensions-with-final-newline',
  ec2: Object.freeze({
    locator:
      'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/' +
      'AmazonEC2/20260728175247/eu-north-1/index.json',
    publicationDate: '2026-07-28T17:52:47Z',
    fileSha256:
      'sha256:4ce8e797c5fddf453aded6d16117f21ee6832f49df7623a4a7cc7bb09351fd84',
    selectedRecordsSha256:
      'sha256:ff10414a28aac9f3b73a22980e2374cc4c8dd01cfecf5f706ec6aaf06577ed43',
  }),
  dataTransfer: Object.freeze({
    locator:
      'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/' +
      'AWSDataTransfer/20260720184645/eu-north-1/index.json',
    publicationDate: '2026-07-20T18:46:45Z',
    fileSha256:
      'sha256:9b6fde4e3d8c58ad7edd13cad59d58ca06b457e6713a948267f68d80109a10b8',
    selectedRecordsSha256:
      'sha256:e15ff8babf5b4135913801b9e5a17bdde30b5487a65ae76beec4b422f34516e1',
  }),
  skuProjection: MOVIELENS_MEASURED_P0_SKU_PROJECTION,
});

export const MOVIELENS_MEASURED_P0_PRICE_SHEET = Object.freeze({
  priceSheetId: 'aws-eu-north-1-c7i-large-gp3-on-demand-2026-07-28-v1',
  region: 'eu-north-1',
  currency: 'USD',
  priceDate: '2026-07-28',
  validFrom: '2026-07-28T00:00:00.000Z',
  validUntil: '2026-08-28T00:00:00.000Z',
  billingGranularity: 'per_second_projection_from_hourly_and_monthly_rates',
  reservationPolicy: 'on_demand_no_upfront',
  spotPolicy: 'excluded',
  taxPolicy: 'excluded',
  creditPolicy: 'excluded',
  exclusions: Object.freeze([
    'tax',
    'credits',
    'spot_discount',
    'operator_labor',
    'load_generator_symmetric',
  ]),
  unitPrices: Object.freeze({
    cpuCoreSecond:
      C7I_LARGE_HOURLY_USD /
      (C7I_LARGE_VCPU_COUNT * SECONDS_PER_HOUR),
    interZoneNetworkByte:
      REGIONAL_TRANSFER_GIGABYTE_USD / BYTES_PER_GIGABYTE,
    iop: 0,
    memoryByteSecond: 0,
    networkByte: 0,
    storageByteSecond:
      GP3_GIGABYTE_MONTHLY_USD /
      (
        BYTES_PER_GIGABYTE *
        HOURS_PER_BILLING_MONTH *
        SECONDS_PER_HOUR
      ),
  }),
});

export const MOVIELENS_MEASURED_P0_INSTANCE_PROVISIONING =
  Object.freeze({
    cpuCores: C7I_LARGE_VCPU_COUNT,
    iops: 0,
    memoryBytes: C7I_LARGE_MEMORY_BYTES,
    networkBytesPerSecond: 0,
    storageBytes: INSTANCE_STORAGE_BYTES,
  });

export const MOVIELENS_MEASURED_P0_STORAGE_GATES = Object.freeze({
  maximumIops: GP3_INCLUDED_IOPS,
  maximumThroughputMiBPerSecond:
    GP3_INCLUDED_THROUGHPUT_MIB_PER_SECOND,
});

export const MOVIELENS_MEASURED_P0_EXECUTION_POLICY = Object.freeze({
  artifactRetention:
    'digest_addressed_all_attempts_preserved_until_campaign_handoff',
  cacheState: 'fresh_process_fresh_database_then_sealed_warmup',
  exclusionPolicy: 'no_operator_exclusions',
  hostInterference:
    'exclusive_local_docker_campaign_no_uninventoried_workloads',
  matrixOrder:
    'seeded_fisher_yates_over_all_eight_cells_before_first_outcome',
  preprocessing:
    'dataset_load_and_replication_excluded_from_warm_steady_state_result',
  retryPolicy:
    'one_automatic_retry_only_for_typed_transient_infrastructure_failure',
  stoppingPolicy:
    'c3_adaptive_minimum_three_maximum_five_blocks_no_selective_rerun',
});
