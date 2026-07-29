import {
  BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  BENCHMARK_CAPACITY_CACHE_POLICY,
  BENCHMARK_CAPACITY_ESTIMATOR,
  BENCHMARK_CAPACITY_INTERVAL,
  BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
  BENCHMARK_CAPACITY_REJECT_POLICY,
  BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
  BENCHMARK_CAPACITY_STOPPING_RULE,
  BENCHMARK_CAPACITY_TIMEOUT_POLICY,
} from
  '../../test/distributed/harness/benchmark-capacity-protocol-constants.js';
import {
  sealBenchmarkCapacityPreregistration,
} from
  '../../test/distributed/harness/benchmark-capacity-preregistration.js';
import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from
  '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  BENCHMARK_SQL_DIALECT,
  getBenchmarkSemanticContract,
} from
  '../../test/distributed/harness/benchmark-workload-semantics.js';
import {
  MOVIELENS_MEASURED_P0_CAPACITY,
  MOVIELENS_MEASURED_P0_IDENTITY,
  MOVIELENS_MEASURED_P0_SIDE_IDS,
} from
  '../../test/distributed/harness/comparative-efficiency-movielens-measured-p0-constants.js';

const BLOCKED_ORDER_INDEX = 0;
const CAMPAIGN_DIALECT = BENCHMARK_SQL_DIALECT.POSTGRESQL;
const SIDE_IDS = MOVIELENS_MEASURED_P0_SIDE_IDS;
const localText = Object.freeze({
  CAPACITY_PROFILE_ABSENT: 'comparator capacity profile is absent',
  ENVIRONMENT_MODE: 'independent-comparator-development',
  MATRIX_SUFFIX: 'observed-replicated',
  RUN_SUFFIX: ':run:0',
  STUDY_SUFFIX: '.capacity',
  TOPOLOGY: 'replicated',
});

function fail(reason) {
  throw new TypeError(`invalid comparator plan: ${reason}`);
}

function capacityProfile(dataset) {
  const profile =
    MOVIELENS_MEASURED_P0_CAPACITY
      .profilesByDatasetSize[dataset.cardinality];
  if (profile === undefined) fail(localText.CAPACITY_PROFILE_ABSENT);
  return profile;
}

function sideSemanticContracts() {
  const semanticContract =
    getBenchmarkSemanticContract(CAMPAIGN_DIALECT);
  const contracts = [];
  for (let index = 0; index < SIDE_IDS.length; index += 1) {
    appendOwnArrayValue(contracts, {
      sideId: SIDE_IDS[index],
      dialect: CAMPAIGN_DIALECT,
      contractDigest: semanticContract.contractDigest,
    });
  }
  return contracts;
}

function comparatorPreregistration({
  identity,
  matrixId,
  runId,
  dataset,
  profile,
  replicationFactor,
}) {
  const cellIdentity = digestBenchmarkSemanticData({
    identity,
    matrixId,
  });
  const profileIdentity = digestBenchmarkSemanticData({
    datasetDigest: dataset.digest,
    profile,
  });
  const environmentIdentity = digestBenchmarkSemanticData({
    mode: localText.ENVIRONMENT_MODE,
    replicationFactor,
  });
  return sealBenchmarkCapacityPreregistration({
    studyId: `${identity}${localText.STUDY_SUFFIX}`,
    sideIds: SIDE_IDS,
    sideSemanticContracts: sideSemanticContracts(),
    offeredLoadPerSecond: profile.offeredLoadsPerSecond,
    slo: profile.slo,
    repetitions: MOVIELENS_MEASURED_P0_CAPACITY.repetitions,
    statistics: {
      estimator: BENCHMARK_CAPACITY_ESTIMATOR,
      interval: BENCHMARK_CAPACITY_INTERVAL,
      ...MOVIELENS_MEASURED_P0_CAPACITY.statistics,
      stoppingRule: BENCHMARK_CAPACITY_STOPPING_RULE,
      multipleComparisonTreatment:
        BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
    },
    sampling: profile.sampling,
    cachePolicy: BENCHMARK_CAPACITY_CACHE_POLICY,
    runOrderPolicy: BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
    timeoutPolicy: BENCHMARK_CAPACITY_TIMEOUT_POLICY,
    rejectPolicy: BENCHMARK_CAPACITY_REJECT_POLICY,
    artifactPolicy: BENCHMARK_CAPACITY_ARTIFACT_POLICY,
    randomization: {
      algorithm: BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
      seed: MOVIELENS_MEASURED_P0_CAPACITY.randomSeed,
    },
    executionIdentity: {
      matrixId,
      cellId: cellIdentity,
      cellManifestDigest: cellIdentity,
      profileIdentity,
      pairIdentity: digestBenchmarkSemanticData({
        pairId: MOVIELENS_MEASURED_P0_IDENTITY.PAIR,
      }),
      runId,
      liveEnvironmentContractDigest: environmentIdentity,
    },
  });
}

export function planMovielensMeasuredP0ComparatorCell({
  dataset,
  preflight,
  identity,
}) {
  const profile = capacityProfile(dataset);
  const cell = {
    datasetSize: dataset.cardinality,
    replicationFactor: preflight.postgres.replicationFactor,
    skew: dataset.skew,
    topology: localText.TOPOLOGY,
  };
  const matrixId =
    `movielens-${dataset.cardinality}-${localText.MATRIX_SUFFIX}`;
  const runId = `${identity}${localText.RUN_SUFFIX}`;
  return {
    blockedOrderIndex: BLOCKED_ORDER_INDEX,
    capacityProfile: profile,
    capacityPreregistration: comparatorPreregistration({
      identity,
      matrixId,
      runId,
      dataset,
      profile,
      replicationFactor: cell.replicationFactor,
    }),
    cell,
    dataset,
    matrixId,
    runId,
    seal: preflight,
  };
}
