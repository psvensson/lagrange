#!/usr/bin/env node

import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path, {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  createMovielensGroupedReduceMatrixDatasets,
  selectMovielensGroupedReduceMatrixDataset,
} from
  '../../examples/service-data-affinity/movielens-grouped-reduce-matrix-dataset.js';
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
  runBenchmarkCapacityHeterogeneousProtocol,
} from
  '../../test/distributed/harness/benchmark-capacity-heterogeneous-protocol.js';
import {
  sealBenchmarkCapacityPreregistration,
} from
  '../../test/distributed/harness/benchmark-capacity-preregistration.js';
import {
  digestBenchmarkSemanticData,
} from
  '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  BENCHMARK_SQL_DIALECT,
  getBenchmarkSemanticContract,
} from
  '../../test/distributed/harness/benchmark-workload-semantics.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
  BENCHMARK_RESOURCE_LIMIT,
} from
  '../../test/distributed/harness/benchmark-resource-contract-constants.js';
import {
  createBenchmarkResourceSourceArtifact,
  validateBenchmarkResourceEvidenceRoot,
} from
  '../../test/distributed/harness/benchmark-resource-evidence-root.js';
import {
  createBenchmarkResourceCapacityProtocolEvidence,
} from
  '../../test/distributed/harness/benchmark-resource-capacity-protocol-evidence.js';
import {
  createBenchmarkResourceDurableResolver,
  persistBenchmarkResourceArtifacts,
} from
  '../../test/distributed/harness/benchmark-resource-durable-resolver.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  finalizeBenchmarkResourceLiveObservation,
  resolveBenchmarkResourceLiveObservationBounds,
  writeExternallyObservedBenchmarkResourceCalibration,
} from
  '../../test/distributed/harness/benchmark-resource-live-observation-authority.js';
import {
  createBenchmarkResourceMatrixManifest,
} from
  '../../test/distributed/harness/benchmark-resource-matrix-manifest.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from
  '../../test/distributed/harness/benchmark-resource-price-sheet-p0-constants.js';
import {
  SCALE_PROFILE_ID,
} from '../../test/distributed/harness/scale-evidence-contract.js';
import {
  createScaleProfileEnvelope,
} from '../../test/distributed/harness/scale-profile-envelope.js';
import {
  collectBenchmarkResourceSourceProvenance,
} from './benchmark-resource-source-provenance.js';
import {
  openMovielensPairedCapacityLiveEnvironment,
} from './movielens-paired-capacity-live-environment.js';
import {
  assertArtifactScalingHeadroom,
  assertCapacityBracketing,
  assertLagrangeNetworkObservation,
  headroom,
  hostObservation,
  parsePairedRuntimeReplayOutput,
  parseProcNetworkBytes,
  replayInFreshProcess,
  serializePairedRuntimeReport,
  writeScenarioReport,
} from './movielens-paired-capacity-live-evidence.js';

const arrayConcat = Function.call.bind(Array.prototype.concat);
const arrayIsArray = Array.isArray;
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const mathMin = Math.min;
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const ARTIFACT_DIRECTORY =
  'test-output/comparative-movielens-paired-runtime-artifacts';
const SIDE_IDS = Object.freeze(['lagrange', 'postgresql']);
const MATRIX_ID = 'comparative-movielens-paired-runtime-p0-v1';
const PAIR_ID = 'lagrange-postgresql-movielens-paired-runtime-v1';
const OFFERED_LOADS = Object.freeze([3, 10]);
const MEASURED_MS = 34_000;
const VALIDITY_MS = 24 * 60 * 60 * 1_000;
const MAXIMUM_ARTIFACT_USAGE_RATIO = 0.75;
const SCENARIOS = Object.freeze([
  'comparative-efficiency-movielens-heterogeneous-capacity-observation',
  'comparative-efficiency-movielens-paired-resource-observation',
  'comparative-efficiency-movielens-paired-runtime-adapters',
]);
const AXES = Object.freeze([
  {id: 'dataset', values: ['movielens-10000-observed']},
  {id: 'replication_factor', values: ['1']},
]);
const SOURCE_PATHS = Object.freeze([
  'examples/service-data-affinity/movielens-capacity-runtime-adapters.js',
  'examples/service-data-affinity/' +
    'movielens-public-request-workload-adapter.js',
  'examples/service-data-affinity/' +
    'run-movielens-public-request-workload.js',
  'examples/service-data-affinity/postgres-baseline-session.js',
  'examples/service-data-affinity/run-postgres-baseline.js',
  'scripts/checks/benchmark-resource-source-provenance.js',
  'scripts/checks/capacity-adapter-outbound.js',
  'scripts/checks/movielens-lagrange-capacity-adapter-child.js',
  'scripts/checks/movielens-paired-capacity-live-evidence.js',
  'scripts/checks/movielens-paired-capacity-live-environment.js',
  'scripts/checks/movielens-postgresql-capacity-adapter-child.js',
  'scripts/checks/' +
    'run-comparative-efficiency-movielens-paired-runtime-adapters-live.js',
  'scripts/checks/' +
    'run-comparative-efficiency-movielens-paired-runtime-adapters-' +
    'guard.js',
  'scripts/checks/systemd-capacity-adapter-controller.js',
  'test/distributed/harness/benchmark-capacity-heterogeneous-observation.js',
  'test/distributed/harness/benchmark-capacity-heterogeneous-protocol.js',
  'test/distributed/harness/benchmark-capacity-statistics.js',
  'test/distributed/harness/benchmark-resource-c3-window-plan.js',
  'test/distributed/harness/' +
    'benchmark-resource-capacity-protocol-evidence.js',
  'test/distributed/harness/' +
    'benchmark-resource-cell-effects-validation.js',
  'test/distributed/harness/benchmark-resource-evidence-root.js',
  'test/distributed/harness/benchmark-resource-live-observation-authority.js',
  'test/distributed/harness/benchmark-resource-live-root-validation.js',
  'test/distributed/harness/benchmark-resource-mixed-provider.js',
]);
const CAPACITY_SLO = Object.freeze({
  maxP99LatencyMs: 2_000,
  maxErrorRate: 0.05,
});
const CAPACITY_REPETITIONS = Object.freeze({minimum: 3, maximum: 3});
const CAPACITY_STATISTICS = Object.freeze({
  confidenceLevel: 0.95,
  bootstrapResamples: 100,
  practicalSignificanceRatio: 0.05,
  targetRelativeCiWidth: 0.5,
});
const CAPACITY_SAMPLING = Object.freeze({
  tailQuantile: 0.99,
  tailSampleMinimum: 100,
  warmupMs: 0,
  operationTimeoutMs: 120_000,
  semanticFinalizerTimeoutMs: 120_000,
  resetTimeoutMs: 30_000,
  maxReleaseLagMs: 100,
  clientMaxInFlight: 1,
  clientMaxQueueDepth: 1_024,
});
const CAPACITY_RANDOM_SEED = 20260728;
const PROFILE_NODE_COUNT = 3;
const PROFILE_TABLE_COUNT = 4;
const PROFILE_PARTITION_COUNT = 4;
const MAXIMUM_FAILURE_CAUSE_DEPTH = 8;
const localText = Object.freeze({
  CAPACITY_STUDY: 'movielens-paired-runtime-adapter-proof-v1',
  DATA_SHAPE: 'movielens-10000-observed-grouped-reduce',
  DEVELOPER_HOST: 'developer-host',
  DOCKER_STORAGE: 'local-overlay2-and-host-filesystem',
  LAGRANGE_NODE: 'lagrange-node',
  LIVE_FAIL:
    'comparative-efficiency-movielens-paired-runtime-live: FAIL\n',
  LIVE_PASS:
    'comparative-efficiency-movielens-paired-runtime-live: PASS\n',
  FAILURE_CAUSE: '\ncaused by:\n',
  NO_EXCLUSION: 'none',
  OPERATION: 'confidence_adjusted_top_ten_grouped_reduce',
  PACKAGE_VERSION: '0.1.0',
  POSTGRESQL_CLIENT: 'postgresql-client',
  POSTGRESQL_DATABASE: 'postgresql-database',
  PROFILE_PROVIDER: 'local-isolated-cgroup-v2-and-docker',
  RESOURCE_PREREGISTRATION_VERSION:
    'movielens-paired-runtime-resource-preregistration-v1',
  TOPOLOGY_IMAGE: 'lagrange-public-wasm-and-postgresql-16',
  TOPOLOGY_VERSION: 'movielens-paired-runtime-live-topology-v1',
  WORKLOAD_ID: 'movielens-confidence-adjusted-top-ten',
  WORKLOAD_VERSION: 'movielens-paired-runtime-workload-v1',
  PROOF_AND_CLEANUP_FAILED: 'paired runtime proof and cleanup failed',
});

function fail(reason) {
  throw new Error(`paired MovieLens live proof failed: ${reason}`);
}

function formatLiveFailure(error, depth = 0) {
  const stack =
    typeof error?.stack === 'string' ? error.stack : String(error);
  if (
    depth >= MAXIMUM_FAILURE_CAUSE_DEPTH ||
    !arrayIsArray(error?.errors) ||
    error.errors.length === 0
  ) {
    return stack;
  }
  return stack + localText.FAILURE_CAUSE + arrayJoin(
    arrayMap(
      error.errors,
      (cause) => formatLiveFailure(cause, depth + 1),
    ),
    localText.FAILURE_CAUSE,
  );
}

function topology(environment) {
  const primary = environment.postgresql.metadata.primaryContainerId;
  return {
    version: localText.TOPOLOGY_VERSION,
    image: localText.TOPOLOGY_IMAGE,
    imageId: digestBenchmarkSemanticData({
      lagrangeExecutable:
        environment.lagrange.metadata.artifact.executableDigest,
      postgresqlImage: environment.postgresql.metadata.imageId,
    }),
    databaseContainers: [primary],
    sharedClientContainers: [environment.postgresqlResourceId],
    network: environment.networkName,
    databaseStorage:
      arrayMap(
        environment.components,
        (component) => component.storagePath,
      ),
    reservedIopsPerComponent: 0,
    reservedNetworkBytesPerSecondPerComponent: 0,
    components: [
      {
        sideId: SIDE_IDS[0],
        componentId: localText.LAGRANGE_NODE,
        role: BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
        physicalResourceId: environment.lagrangeResourceId,
      },
      {
        sideId: SIDE_IDS[1],
        componentId: localText.POSTGRESQL_DATABASE,
        role: BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
        physicalResourceId: primary,
      },
      {
        sideId: SIDE_IDS[1],
        componentId: localText.POSTGRESQL_CLIENT,
        role: BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
        physicalResourceId: environment.postgresqlResourceId,
      },
    ],
  };
}

function workload(dataset, environment) {
  return {
    version: localText.WORKLOAD_VERSION,
    dataset: {
      cardinality: dataset.cardinality,
      digest: dataset.digest,
      sizeBytes: dataset.bytes.length,
      skew: dataset.skew,
    },
    operation: localText.OPERATION,
    operationManifestDigest: environment.operationManifestDigest,
    semanticOracleDigest: environment.semanticOracleDigest,
  };
}

function inventorySides() {
  const included =
    BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED;
  return [
    {
      sideId: SIDE_IDS[0],
      components: [{
        componentId: localText.LAGRANGE_NODE,
        role: BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
        billingTreatment: included,
        exclusionReason: localText.NO_EXCLUSION,
      }],
    },
    {
      sideId: SIDE_IDS[1],
      components: [
        {
          componentId: localText.POSTGRESQL_DATABASE,
          role: BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
          billingTreatment: included,
          exclusionReason: localText.NO_EXCLUSION,
        },
        {
          componentId: localText.POSTGRESQL_CLIENT,
          role: BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
          billingTreatment: included,
          exclusionReason: localText.NO_EXCLUSION,
        },
      ],
    },
  ];
}

function profileEnvelope({
  sourceRevision,
  topologyDigest,
  workloadDigest,
  dataset,
}) {
  return createScaleProfileEnvelope({
    profile: {id: SCALE_PROFILE_ID.DEVELOPMENT, version: 1},
    software: {
      revision: sourceRevision,
      runtime: process.version,
      packageVersion: localText.PACKAGE_VERSION,
    },
    hardware: {
      provider: localText.PROFILE_PROVIDER,
      region: BENCHMARK_RESOURCE_P0_PRICE_SHEET.region,
      instanceClass: localText.DEVELOPER_HOST,
      cpuCount: os.cpus().length,
      memoryBytes: os.totalmem(),
      storageClass: localText.DOCKER_STORAGE,
    },
    topology: {
      manifestDigest: topologyDigest,
      nodeCount: PROFILE_NODE_COUNT,
      failureDomainCount: 1,
      tableCount: PROFILE_TABLE_COUNT,
      partitionCount: PROFILE_PARTITION_COUNT,
      replicaCount: 1,
    },
    data: {
      manifestDigest: workloadDigest,
      logicalBytes: dataset.bytes.length,
      physicalBytes: dataset.bytes.length,
      shape: localText.DATA_SHAPE,
    },
    workload: {
      id: localText.WORKLOAD_ID,
      manifestDigest: workloadDigest,
      duration: {warmupMs: 0, measuredMs: MEASURED_MS},
    },
  });
}

function capacityPreregistration({
  cellId,
  profileIdentity,
  runId,
  topologyDigest,
}) {
  const contract =
    getBenchmarkSemanticContract(BENCHMARK_SQL_DIALECT.POSTGRESQL);
  return sealBenchmarkCapacityPreregistration({
    studyId: localText.CAPACITY_STUDY,
    sideIds: SIDE_IDS,
    sideSemanticContracts: arrayMap(SIDE_IDS, (sideId) => ({
      sideId,
      dialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
      contractDigest: contract.contractDigest,
    })),
    offeredLoadPerSecond: OFFERED_LOADS,
    slo: CAPACITY_SLO,
    repetitions: CAPACITY_REPETITIONS,
    statistics: {
      estimator: BENCHMARK_CAPACITY_ESTIMATOR,
      interval: BENCHMARK_CAPACITY_INTERVAL,
      ...CAPACITY_STATISTICS,
      stoppingRule: BENCHMARK_CAPACITY_STOPPING_RULE,
      multipleComparisonTreatment:
        BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
    },
    sampling: {
      ...CAPACITY_SAMPLING,
      measuredMs: MEASURED_MS,
    },
    ...capacityExecutionPolicies(),
    randomization: {
      algorithm: BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
      seed: CAPACITY_RANDOM_SEED,
    },
    executionIdentity: {
      matrixId: MATRIX_ID,
      cellId,
      cellManifestDigest:
        digestBenchmarkSemanticData({matrixId: MATRIX_ID, cellId}),
      profileIdentity,
      pairIdentity: digestBenchmarkSemanticData({pairId: PAIR_ID}),
      runId,
      liveEnvironmentContractDigest: topologyDigest,
    },
  });
}

function capacityExecutionPolicies() {
  return {
    cachePolicy: BENCHMARK_CAPACITY_CACHE_POLICY,
    runOrderPolicy: BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
    timeoutPolicy: BENCHMARK_CAPACITY_TIMEOUT_POLICY,
    rejectPolicy: BENCHMARK_CAPACITY_REJECT_POLICY,
    artifactPolicy: BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  };
}

async function executeLiveProof(dataset, provenance) {
  const runId = `movielens-paired-runtime-${process.pid}-${Date.now()}`;
  const environment =
    await openMovielensPairedCapacityLiveEnvironment({
      runId,
      sideIds: SIDE_IDS,
      dataset,
      workingDirectory: process.cwd(),
    });
  const topologyPayload = topology(environment);
  const workloadPayload = workload(dataset, environment);
  const topologyArtifact = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
    topologyPayload,
  );
  const workloadArtifact = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
    workloadPayload,
  );
  const profile = profileEnvelope({
    sourceRevision: provenance.sourceRevision,
    topologyDigest: topologyArtifact.digest,
    workloadDigest: workloadArtifact.digest,
    dataset,
  });
  const placeholderPreregistration =
    createBenchmarkResourceSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
      {version: 'movielens-paired-runtime-cell-identity-placeholder-v1'},
    );
  const matrix = createBenchmarkResourceMatrixManifest({
    matrixId: MATRIX_ID,
    axes: AXES,
    sideIds: SIDE_IDS,
    workloadManifestDigest: workloadArtifact.digest,
    alternativeTopologyDigest: topologyArtifact.digest,
    preregistrationDigest: placeholderPreregistration.digest,
    profileEnvelopeDigest: digestBenchmarkSemanticData(profile),
  });
  const preregistration = capacityPreregistration({
    cellId: matrix.artifact.payload.cells[0].cellId,
    profileIdentity: profile.profileIdentity,
    runId,
    topologyDigest: topologyArtifact.digest,
  });
  const captured = [];
  let cleanupReceipt;
  let protocol;
  let closeAttempted = false;
  try {
    protocol = await runBenchmarkCapacityHeterogeneousProtocol({
      preregistration,
      adapters: environment.adapters,
      async beginResourceObservation(context) {
        const host = await hostObservation(process.cwd());
        const session = await beginBenchmarkResourceLiveObservation(
          environment.provider,
          {
            runId,
            networkId: environment.networkId,
            networkName: environment.networkName,
            sourceRevision: provenance.sourceRevision,
            components: environment.components,
          },
        );
        return {context, host, session};
      },
      async completeResourceObservation({
        resourceObservation,
        context,
      }) {
        await captureBenchmarkResourceLiveObservation(
          resourceObservation.session,
        );
        const bounds = resolveBenchmarkResourceLiveObservationBounds(
          resourceObservation.session,
          context.sideId,
        );
        const host = await hostObservation(process.cwd());
        arrayPush(captured, resourceObservation);
        return {
          ...bounds,
          headroom: headroom(
            resourceObservation.host,
            host,
            bounds.endedAt - bounds.startedAt,
          ),
        };
      },
    });
    assertCapacityBracketing(
      protocol.report,
      preregistration,
      OFFERED_LOADS,
      SIDE_IDS,
    );
    closeAttempted = true;
    cleanupReceipt = await environment.close();
  } catch (error) {
    if (!closeAttempted) {
      try {
        await environment.close();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          localText.PROOF_AND_CLEANUP_FAILED,
        );
      }
    }
    throw error;
  }
  const calibrationBySession = new Map();
  for (let observationIndex = 0;
    observationIndex < captured.length;
    observationIndex += 1) {
    const observation = captured[observationIndex];
    const finalization =
      await finalizeBenchmarkResourceLiveObservation(observation.session);
    mapSet(
      calibrationBySession,
      observation.session,
      writeExternallyObservedBenchmarkResourceCalibration(
        finalization.receipt,
        finalization.authorization,
      ),
    );
  }
  const windowEvidence = arrayMap(protocol.windows, (c3) => ({
    c3,
    calibration:
      mapGet(calibrationBySession, c3.resourceObservation.session),
  }));
  assertLagrangeNetworkObservation(
    windowEvidence,
    SIDE_IDS[0],
    localText.LAGRANGE_NODE,
  );
  const producedAt = new Date().toISOString();
  const validUntil =
    new Date(Date.parse(producedAt) + VALIDITY_MS).toISOString();
  const resourcePreregistration = {
    version: localText.RESOURCE_PREREGISTRATION_VERSION,
    sideIds: SIDE_IDS,
    capacityProtocolReportDigest: protocol.report.reportDigest,
    capacityProtocolPreregistrationDigest:
      preregistration.manifestDigest,
  };
  const evidence = createBenchmarkResourceCapacityProtocolEvidence({
    matrixId: MATRIX_ID,
    axes: AXES,
    pairId: PAIR_ID,
    runId,
    sideIds: SIDE_IDS,
    sourceRevision: provenance.sourceRevision,
    producedAt,
    validUntil,
    workloadManifest: workloadPayload,
    alternativeTopology: topologyPayload,
    resourcePreregistration,
    profileEnvelope: profile,
    inventoryId: 'movielens-paired-runtime-inventory-v1',
    inventorySides: inventorySides(),
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    capacityPreregistration: preregistration,
    capacityReport: protocol.report,
    windowEvidence,
    practicalThreshold: 0.05,
  });
  const memory = validateBenchmarkResourceEvidenceRoot(evidence.receipt);
  if (!memory.valid || !memory.claimEligible) {
    fail(`memory evidence replay rejected: ${memory.reason}`);
  }
  const allArtifacts = arrayConcat(evidence.artifacts, evidence.root);
  const maximumArtifactBytes =
    assertArtifactScalingHeadroom(
      allArtifacts,
      MAXIMUM_ARTIFACT_USAGE_RATIO,
    );
  const artifactDirectory = resolve(ARTIFACT_DIRECTORY);
  const persisted = await persistBenchmarkResourceArtifacts(
    artifactDirectory,
    allArtifacts,
  );
  const durable = validateBenchmarkResourceEvidenceRoot({
    rootDigest: evidence.root.digest,
    resolver: createBenchmarkResourceDurableResolver(artifactDirectory),
  });
  if (!durable.valid || !durable.claimEligible) {
    fail(`durable evidence replay rejected: ${durable.reason}`);
  }
  const fresh = await replayInFreshProcess(
    evidence.root.digest,
    artifactDirectory,
  );
  if (!fresh.valid || !fresh.claimEligible) {
    fail(`fresh evidence replay rejected: ${fresh.reason}`);
  }
  let minimumObservedHeadroomRatio = Infinity;
  for (let windowIndex = 0;
    windowIndex < protocol.windows.length;
    windowIndex += 1) {
    minimumObservedHeadroomRatio = mathMin(
      minimumObservedHeadroomRatio,
      protocol.windows[windowIndex].headroom.minimumObservedRatio,
    );
  }
  return {
    artifactCount: persisted.length,
    calibrationCount: captured.length,
    capacityBySide: protocol.report.summary.capacityBySide,
    cleanupReceipt,
    comparativeClaimEligible: true,
    durableReplayValid: true,
    evidenceRootDigest: evidence.root.digest,
    freshProcessReplayValid: true,
    matrixClaimPublished: false,
    maximumArtifactBytes,
    maximumArtifactUsageRatio:
      maximumArtifactBytes /
        BENCHMARK_RESOURCE_LIMIT.ARTIFACT_BYTES,
    adapterProofOnly: true,
    minimumObservedHeadroomRatio,
    operationManifestDigest: environment.operationManifestDigest,
    semanticOracleDigest: environment.semanticOracleDigest,
    sourceRevision: provenance.sourceRevision,
    windowCount: protocol.windows.length,
  };
}

async function main() {
  const provenance =
    await collectBenchmarkResourceSourceProvenance(SOURCE_PATHS);
  const datasetDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'movielens-paired-runtime-dataset-'),
  );
  let detail;
  try {
    const variants =
      await createMovielensGroupedReduceMatrixDatasets(datasetDirectory);
    const dataset = selectMovielensGroupedReduceMatrixDataset(
      variants,
      10_000,
      'observed',
    );
    detail = await executeLiveProof(dataset, provenance);
  } finally {
    await rm(datasetDirectory, {recursive: true, force: true});
  }
  const reportPath = await writeScenarioReport(
    {
      ...detail,
      datasetDirectoryRemoved: true,
      sourceProvenance: provenance,
    },
    SCENARIOS,
  );
  process.stdout.write(
    localText.LIVE_PASS +
    `rootDigest: ${detail.evidenceRootDigest}\n` +
    `scenarioReport: ${reportPath}\n`,
  );
}

if (
  typeof process.argv[1] === 'string' &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((error) => {
    process.stderr.write(
      localText.LIVE_FAIL +
      `${formatLiveFailure(error)}\n`,
    );
    process.exitCode = 1;
  });
}

export {
  parsePairedRuntimeReplayOutput,
  parseProcNetworkBytes,
  serializePairedRuntimeReport,
};
