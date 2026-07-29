import assert from 'node:assert/strict';
import test from 'node:test';

import {
  replacePrototypeProperty,
  withHostileIntrinsics,
} from '../../../helpers/hostile-intrinsics.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
  BENCHMARK_RESOURCE_LIMIT,
} from '../benchmark-resource-contract-constants.js';
import {
  createBenchmarkResourceSourceArtifact,
  validateBenchmarkResourceEvidenceRoot,
} from '../benchmark-resource-evidence-root.js';
import {
  createBenchmarkResourceMatrixManifest,
} from '../benchmark-resource-matrix-manifest.js';
import {
  createBenchmarkResourceCapacityProtocolEvidence,
} from '../benchmark-resource-capacity-protocol-evidence.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from '../benchmark-resource-price-sheet-p0-constants.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from '../benchmark-resource-live-observation-authority.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from '../benchmark-capacity-window-receipt.js';
import {
  createBenchmarkCapacityRunSample,
} from '../benchmark-capacity-run-sample.js';
import {
  bootstrapBenchmarkPairedRatioInterval,
  summarizeBenchmarkCapacityMatrix,
} from '../benchmark-capacity-statistics.js';
import {
  assertBenchmarkCapacityHeterogeneousOperationEvidence,
  createBenchmarkCapacityAdapterIdentity,
  createBenchmarkCapacityAdapterOwnerReceipt,
  createBenchmarkCapacityHeadroomReceipt,
  createBenchmarkCapacityHeterogeneousOperationReceipt,
} from '../benchmark-capacity-heterogeneous-observation.js';
import {
  decodeBenchmarkCapacityHeterogeneousOperationEvidence,
} from '../benchmark-capacity-heterogeneous-protocol.js';
import {
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  SCALE_PROFILE_ID,
} from '../scale-evidence-contract.js';
import {
  createScaleProfileEnvelope,
} from '../scale-profile-envelope.js';
import {
  artifactFixtureReport,
  inputFromSample,
  preregistrationInput,
  semanticReceiptForCounts,
} from './benchmark-capacity-protocol-test-fixture.js';

const MATRIX_ID = 'heterogeneous-resource-adapter-fixture-matrix-v1';
const PAIR_ID = 'lagrange-postgresql-movielens-fixture-pair-v1';
const RUN_ID = 'heterogeneous-resource-adapter-fixture-run-v1';
const REVISION = 'fixture-revision';
const SIDE_IDS = ['lagrange', 'postgresql'];
const AXES = [
  {id: 'dataset', values: ['movielens-10k']},
  {id: 'topology', values: ['single-replica']},
];
const START_EPOCH = Date.parse('2026-07-28T10:00:00.000Z');
const COMPONENTS = [
  {
    sideId: SIDE_IDS[0],
    componentId: 'lagrange-node',
    containerId: 'lagrange-cgroup',
    storagePath: '/fixture/lagrange',
  },
  {
    sideId: SIDE_IDS[1],
    componentId: 'postgresql-database',
    containerId: 'postgresql-container',
    storagePath: '/fixture/postgresql',
  },
];
const POSTGRESQL_QUERY_SQL = 'SELECT grouped_reduce FROM ratings';

test('paired cost bootstrap retains observed between-block uncertainty', () => {
  const interval = bootstrapBenchmarkPairedRatioInterval([
    [0.9934236922, 1],
    [0.9896544520, 1],
    [0.9829875987, 1],
  ], 0.95, 2_000, 20_260_728);
  assert.ok(interval.lower < interval.upper);
  assert.ok(interval.lower <= interval.estimate);
  assert.ok(interval.estimate <= interval.upper);
});

function fixtureDatasetDigest() {
  return digestBenchmarkSemanticData({dataset: 'fixture'});
}

function fixtureOperationManifest() {
  return {
    version: 'movielens-capacity-operation-manifest-v2',
    datasetDigest: fixtureDatasetDigest(),
    lagrangePublicRequest: {
      method: 'POST',
      path: '/benchmarks/movielens/grouped-reduce',
    },
    postgresqlQuerySqlDigest:
      digestBenchmarkSemanticData(POSTGRESQL_QUERY_SQL),
    result: 'confidence_adjusted_top_ten',
    durability:
      'input_preserved_and_result_visible_after_completion',
  };
}

function topologyPayload() {
  return {
    version: 'benchmark-resource-live-topology-v1',
    image: 'heterogeneous-runtime-pair',
    imageId: digestBenchmarkSemanticData({pair: 'fixture'}),
    databaseContainers: ['postgresql-container'],
    sharedClientContainers: [],
    network: 'managed-bridge-and-public-loopback',
    databaseStorage: [
      '/fixture/lagrange',
      '/fixture/postgresql',
    ],
    reservedIopsPerComponent: 0,
    reservedNetworkBytesPerSecondPerComponent: 0,
    components: [
      {
        sideId: SIDE_IDS[0],
        componentId: 'lagrange-node',
        role: BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
        physicalResourceId: 'lagrange-cgroup',
      },
      {
        sideId: SIDE_IDS[1],
        componentId: 'postgresql-database',
        role: BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
        physicalResourceId: 'postgresql-container',
      },
    ],
  };
}

function workloadPayload() {
  return {
    version: 'movielens-capacity-resource-fixture-v1',
    dataset: 'movielens-10k',
    operation: 'confidence_adjusted_top_ten',
    operationManifestDigest:
      digestBenchmarkSemanticData(fixtureOperationManifest()),
    semanticOracleDigest: digestBenchmarkSemanticData(fixtureRanking()),
  };
}

function fixtureRanking() {
  return Array.from({length: 10}, (_, index) => ({
    movieId: index + 1,
    rank: index + 1,
    scoreMicros: Math.trunc((5 - index / 10) * 1_000_000),
  }));
}

function fixtureTopMovies() {
  return fixtureRanking().map((row) => ({
    avgRating: row.scoreMicros / 1_000_000,
    movieId: row.movieId,
    ratingCount: 100 - row.rank,
    score: row.scoreMicros / 1_000_000,
  }));
}

function runtimeOwnerEvidence(sideId, executableDigest) {
  if (sideId === SIDE_IDS[0]) {
    return {
      version: 'movielens-lagrange-runtime-owner-evidence-v2',
      bindingName: 'movielens-public-grouped-reduce',
      bindingVersionId: 'binding-version-v1',
      datasetDigest: fixtureDatasetDigest(),
      executableDigest,
      routeServiceId: 'service-v1',
      runtimeKind: 'wasm_component',
      semanticOracleExpected: fixtureRanking(),
      operationManifest: fixtureOperationManifest(),
    };
  }
  return {
    version: 'movielens-postgresql-runtime-owner-evidence-v2',
    imageId: executableDigest,
    imageRepoDigests: ['postgres@sha256:fixture'],
    inputDigest: fixtureDatasetDigest(),
    postgresVersion: 'PostgreSQL 16.10',
    postgresVersionSql: 'SELECT version()',
    queryPlan: [{
      'QUERY PLAN': [{Plan: {'Node Type': 'Aggregate'}}],
    }],
    querySql: POSTGRESQL_QUERY_SQL,
    totalRows: 10_000,
    operationManifest: fixtureOperationManifest(),
  };
}

function fixtureLagrangeOperation(
  operationId,
  operationIndex,
  owner,
  semanticOracleDigest,
) {
  const tenantId = 'fixture';
  const body = {
    datasetDigest: owner.datasetDigest,
    resultKeyOffset: operationIndex * 10,
    workloadVersion: 'movielens-public-request-workload-v1',
  };
  const normalizedRequest = {
    body,
    headers: {'accept': '*/*', 'content-type': 'application/json'},
    method: 'POST',
    path: '/benchmarks/movielens/grouped-reduce',
    query: {},
  };
  const invocationIdentity =
    `request-invocation-${digestBenchmarkSemanticData({
      requestKey: operationId,
      tenantId,
    }).slice(7)}`;
  const requestDigest = digestBenchmarkSemanticData(normalizedRequest);
  const intentDigest = digestBenchmarkSemanticData({
    bindingVersionId: owner.bindingVersionId,
    method: normalizedRequest.method,
    path: normalizedRequest.path,
    requestDigest,
    tenantId,
  });
  const journalOperationId =
    `request-cell-operation-${digestBenchmarkSemanticData([
      tenantId,
      invocationIdentity,
    ]).slice(7)}`;
  const journalCommand =
    `invoke:${owner.routeServiceId}:${intentDigest}`;
  const invocationJournal = {
    command: journalCommand,
    created_at: '2026-07-28T00:00:00.000Z',
    error: '{}',
    idempotency_key: invocationIdentity,
    operation_id: journalOperationId,
    result: JSON.stringify(JSON.stringify({
      body: 'MovieLens grouped reduce completed',
      headers: [['x-lagrange-cell', owner.bindingName]],
      status: 200,
    })),
    state: 'completed',
    tenant_id: tenantId,
    updated_at: '2026-07-28T00:00:00.001Z',
  };
  const ranking = fixtureRanking();
  const durableResult = {
    movieRows: ranking.map((row) => ({
      key: row.rank,
      value: row.movieId,
    })),
    scoreRows: ranking.map((row) => ({
      key: row.rank,
      value: row.scoreMicros,
    })),
  };
  return {
    executableDigest: owner.executableDigest,
    requestWitness: {
      bindingVersionId: owner.bindingVersionId,
      idempotencyKey: operationId,
      intentDigest,
      invocationIdentity,
      normalizedRequest,
      requestDigest,
      routeServiceId: owner.routeServiceId,
      tenantId,
    },
    invocationJournal,
    httpStatus: 200,
    durableResult,
    semanticOracleReceipt: {
      observed: ranking,
      passed: true,
      version: 'confidence-adjusted-top-ten-v1',
    },
    semanticOracleDigest,
    durabilityPassed: true,
    durabilityDigest: digestBenchmarkSemanticData({
      datasetDigest: owner.datasetDigest,
      durableResult,
      invocationJournal,
    }),
    semanticObservation: {
      operationId: operationIndex,
      operation: 'INSERT',
      outcome: 'command_acknowledged',
    },
  };
}

function fixturePostgresOperation(
  operationId,
  operationIndex,
  owner,
  semanticOracleDigest,
) {
  const topMovies = fixtureTopMovies();
  const durableResultJson = JSON.stringify(topMovies);
  return {
    requestId: operationId,
    backendPid: 123,
    imageId: owner.imageId,
    imageRepoDigestsDigest:
      digestBenchmarkSemanticData(owner.imageRepoDigests),
    inputDigest: owner.inputDigest,
    postgresVersion: owner.postgresVersion,
    queryPlanDigest: digestBenchmarkSemanticData(owner.queryPlan),
    querySqlDigest: digestBenchmarkSemanticData(owner.querySql),
    returnedAggregateRows: topMovies.length,
    durableInputRows: owner.totalRows,
    durableResultJson,
    topMovies,
    durabilityDigest: digestBenchmarkSemanticData({
      durableInputRows: owner.totalRows,
      durableResultJson,
      requestId: operationId,
      topMovies,
    }),
    durabilityPassed: true,
    semanticObservation: {
      operationId: operationIndex,
      operation: 'INSERT',
      outcome: 'command_acknowledged',
    },
    semanticOracleDigest,
  };
}

function inventorySides() {
  return [
    {
      sideId: SIDE_IDS[0],
      components: [{
        componentId: 'lagrange-node',
        role: BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
        billingTreatment:
          BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
        exclusionReason: 'none',
      }],
    },
    {
      sideId: SIDE_IDS[1],
      components: [{
        componentId: 'postgresql-database',
        role: BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
        billingTreatment:
          BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
        exclusionReason: 'none',
      }],
    },
  ];
}

function stats(timestamp, multiplier) {
  return {
    timestamp,
    cpuPercent: 10 * multiplier,
    cpuUsageNanoseconds: 1_000_000 * multiplier,
    memoryUsageBytes: 100_000 * multiplier,
    memoryLimitBytes: 10_000_000,
    cpuLimitNanoCpus: 1_000_000_000,
    storageLimitBytes: 100_000_000,
    pids: 2,
    rxBytes: 1_000 * multiplier,
    txBytes: 2_000 * multiplier,
    blockReadBytes: 3_000 * multiplier,
    blockWriteBytes: 4_000 * multiplier,
    blockReadOperations: 3 * multiplier,
    blockWriteOperations: 4 * multiplier,
    storageUsageBytes: 10_000 * multiplier,
  };
}

async function calibration(startedAt, endedAt) {
  let calls = 0;
  let cleaned = false;
  const provider = {
    async inspectContainer() {
      return {State: {Running: true}};
    },
    async inspectContainerIfExists() {
      return cleaned ? null : {State: {Running: true}};
    },
    async getContainerResourceSnapshot() {
      calls += 1;
      return calls <= COMPONENTS.length ?
        stats(startedAt, 1) :
        stats(endedAt, 2);
    },
    async getNetworkByName() {
      return cleaned ? null : {id: 'fixture-network'};
    },
  };
  const session = await beginBenchmarkResourceLiveObservation(provider, {
    runId: RUN_ID,
    networkId: 'fixture-network',
    networkName: 'fixture-network',
    sourceRevision: REVISION,
    components: COMPONENTS,
  });
  await captureBenchmarkResourceLiveObservation(session);
  cleaned = true;
  const finalization =
    await finalizeBenchmarkResourceLiveObservation(session);
  return writeExternallyObservedBenchmarkResourceCalibration(
    finalization.receipt,
    finalization.authorization,
  );
}

function normalizedReport(preregistration, sourceReport) {
  const report = structuredClone(sourceReport);
  const samples = [...report.warmupSamples, ...report.rawSamples];
  let cursor = START_EPOCH;
  for (let index = 0; index < report.windowReceipts.length; index += 1) {
    const receipt = report.windowReceipts[index];
    const sample = samples.find(
      (candidate) =>
        candidate.sampleDigest === receipt.capacitySampleDigest,
    );
    const startedAt = cursor;
    const endedAt = startedAt + sample.observationDurationMs;
    report.windowReceipts[index] =
      createBenchmarkCapacityWindowReceipt({
        blockIndex: receipt.blockIndex,
        blockedOrderIndex: receipt.blockedOrderIndex,
        sideId: receipt.sideId,
        phase: receipt.phase,
        offeredLoad: receipt.offeredLoad,
        startedAt,
        endedAt,
        capacitySampleDigest: receipt.capacitySampleDigest,
        semanticReceiptDigest: receipt.semanticReceiptDigest,
        liveEngagementDigest: receipt.liveEngagementDigest,
        resourceWindowDigest: null,
      }, sample, preregistration);
    cursor = endedAt + 1;
  }
  delete report.reportDigest;
  return {
    ...report,
    reportDigest: digestBenchmarkSemanticData(report),
  };
}

function reportWithAchievedThroughputBelowOffered(
  preregistration,
  sourceReport,
) {
  const report = structuredClone(sourceReport);
  const replacements = new Map();
  for (let index = 0; index < report.rawSamples.length; index += 1) {
    const sample = report.rawSamples[index];
    const input = inputFromSample(sample);
    input.counts.correct -= 1;
    input.counts.errored += 1;
    input.endToEndLatencyMs =
      input.endToEndLatencyMs.slice(0, -1);
    input.semanticReceipt = semanticReceiptForCounts(
      input.semanticDialect,
      input.counts,
      input.rejectedByReason,
    );
    const replacement =
      createBenchmarkCapacityRunSample(input);
    replacements.set(sample.sampleDigest, replacement);
    report.rawSamples[index] = replacement;
    report.rawSampleDigests[index] = replacement.sampleDigest;
  }
  for (let index = 0; index < report.windowReceipts.length; index += 1) {
    const receipt = report.windowReceipts[index];
    const sample = replacements.get(receipt.capacitySampleDigest);
    if (sample === undefined) continue;
    report.windowReceipts[index] = createBenchmarkCapacityWindowReceipt({
      blockIndex: receipt.blockIndex,
      blockedOrderIndex: receipt.blockedOrderIndex,
      sideId: receipt.sideId,
      phase: receipt.phase,
      offeredLoad: receipt.offeredLoad,
      startedAt: receipt.startedAt,
      endedAt: receipt.endedAt,
      capacitySampleDigest: sample.sampleDigest,
      semanticReceiptDigest: sample.semanticReceiptDigest,
      liveEngagementDigest: receipt.liveEngagementDigest,
      resourceWindowDigest: receipt.resourceWindowDigest,
    }, sample, preregistration);
  }
  report.summary = summarizeBenchmarkCapacityMatrix(
    report.rawSamples,
    preregistration,
    report.completedBlocks,
  );
  report.measurementState = report.summary.measurementState;
  delete report.reportDigest;
  report.reportDigest = digestBenchmarkSemanticData(report);
  return report;
}

function resignPostgresOperationEvidence(
  value,
  operationEvidence,
  runtimeOwnerEvidence,
) {
  const sourceIdentity = value.engagement.adapterIdentity;
  const adapterIdentity = createBenchmarkCapacityAdapterIdentity({
    adapterId: sourceIdentity.adapterId,
    adapterVersion: sourceIdentity.adapterVersion,
    sideId: sourceIdentity.sideId,
    runtimeKind: sourceIdentity.runtimeKind,
    invocationBoundary: sourceIdentity.invocationBoundary,
    operationManifestDigest: sourceIdentity.operationManifestDigest,
    executableDigest: runtimeOwnerEvidence.imageId,
    ownerEvidenceDigest:
      digestBenchmarkSemanticData(runtimeOwnerEvidence),
  });
  const ownerReceipt = createBenchmarkCapacityAdapterOwnerReceipt({
    adapterIdentity,
    operationIds: value.engagement.ownerReceipt.operationIds,
    evidenceDigest: digestBenchmarkSemanticData({
      adapterIdentityDigest: adapterIdentity.adapterIdentityDigest,
      coordinate: {
        blockIndex: value.sample.blockIndex,
        blockedOrderIndex: value.engagement.blockedOrderIndex,
        sideId: value.sample.sideId,
        offeredLoadPerSecond: value.sample.offeredLoadPerSecond,
        phase: value.sample.phase,
      },
      semanticOracleDigest:
        value.engagement.ownerReceipt.semanticOracleDigest,
      operations: operationEvidence,
    }),
    semanticOracleDigest:
      value.engagement.ownerReceipt.semanticOracleDigest,
  });
  return createBenchmarkCapacityHeterogeneousOperationReceipt({
    preregistration: value.preregistration,
    sample: value.sample,
    adapterIdentity,
    ownerReceipt,
    window: {
      blockedOrderIndex: value.engagement.blockedOrderIndex,
      startedAt: value.engagement.startedAt,
      endedAt: value.engagement.endedAt,
    },
    headroom: value.engagement.headroom,
  });
}

function fixtureAdapterIdentity(receipt, executableDigest, runtimeOwner) {
  const lagrange = receipt.sideId === SIDE_IDS[0];
  return createBenchmarkCapacityAdapterIdentity({
    adapterId: `movielens-${receipt.sideId}`,
    adapterVersion: 'fixture-v1',
    sideId: receipt.sideId,
    runtimeKind: lagrange ? 'wasm_component' : 'postgresql_16',
    invocationBoundary: lagrange ?
      'authenticated_http_request_binding' :
      'persistent_pg_pool_sql_query',
    operationManifestDigest:
      digestBenchmarkSemanticData(runtimeOwner.operationManifest),
    executableDigest,
    ownerEvidenceDigest: digestBenchmarkSemanticData(runtimeOwner),
  });
}

function assertPostgresOwnerTamperingRejected(postgresReplay) {
  const ownerMutations = {
    version: (owner) => {
      owner.version = 'forged-owner-version';
    },
    imageId: (owner) => {
      owner.imageId = digestBenchmarkSemanticData({forged: 'image'});
    },
    imageRepoDigests: (owner) => {
      owner.imageRepoDigests = ['postgres@sha256:forged'];
    },
    inputDigest: (owner) => {
      owner.inputDigest = digestBenchmarkSemanticData({forged: 'input'});
    },
    postgresVersion: (owner) => {
      owner.postgresVersion = 'PostgreSQL 16.11 forged';
    },
    postgresVersionSql: (owner) => {
      owner.postgresVersionSql = 'SELECT forged_version()';
    },
    queryPlan: (owner) => {
      owner.queryPlan = [{Plan: {'Node Type': 'Forged'}}];
    },
    querySql: (owner) => {
      owner.querySql = 'SELECT forged_grouped_reduce FROM ratings';
    },
    totalRows: (owner) => {
      owner.totalRows += 1;
    },
    operationManifest: (owner) => {
      owner.operationManifest.postgresqlQuerySqlDigest =
        digestBenchmarkSemanticData({forged: 'query'});
    },
  };
  for (const [label, mutate] of Object.entries(ownerMutations)) {
    const owner = structuredClone(postgresReplay.runtimeOwner);
    mutate(owner);
    const receipt = resignPostgresOperationEvidence(
      postgresReplay,
      postgresReplay.operationEvidence,
      owner,
    );
    assert.throws(
      () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
        receipt,
        postgresReplay.operationEvidence,
        postgresReplay.sample.semanticReceipt,
        owner,
      ),
      /operation_evidence_invalid/u,
      label,
    );
  }
}

function assertCoherentPostgresQueryForgeryRejected(postgresReplay) {
  const owner = structuredClone(postgresReplay.runtimeOwner);
  owner.querySql = 'SELECT 1 AS forged_grouped_reduce';
  owner.queryPlan = [{
    'QUERY PLAN': [{Plan: {'Node Type': 'Result'}}],
  }];
  owner.operationManifest.postgresqlQuerySqlDigest =
    digestBenchmarkSemanticData(owner.querySql);
  const operations =
    structuredClone(postgresReplay.operationEvidence);
  for (let index = 0; index < operations.length; index += 1) {
    if (operations[index].status !== 'correct') continue;
    operations[index].evidence.querySqlDigest =
      digestBenchmarkSemanticData(owner.querySql);
    operations[index].evidence.queryPlanDigest =
      digestBenchmarkSemanticData(owner.queryPlan);
  }
  const receipt = resignPostgresOperationEvidence(
    postgresReplay,
    operations,
    owner,
  );
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      receipt,
      operations,
      postgresReplay.sample.semanticReceipt,
      owner,
    ),
    /operation_evidence_invalid/u,
  );
}

function liveEngagementArtifacts(evidence) {
  return evidence.artifacts.filter(
    (artifact) =>
      artifact.artifact.kind ===
        BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
  );
}

function assertEncodedOperationEvidenceTamperingRejected(
  source,
  windowEvidence,
) {
  const payload = source.artifact.payload.evidence;
  const receipt = payload.heterogeneousOperationReceipt;
  const runtimeKind = receipt.adapterIdentity.runtimeKind;
  const window = windowEvidence.find(
    (candidate) =>
      candidate.c3.engagement.receiptDigest ===
        payload.liveEngagementDigest,
  );
  const decoded =
    decodeBenchmarkCapacityHeterogeneousOperationEvidence(
      payload.encodedOperationEvidence,
      runtimeKind,
    );
  assert.deepEqual(
    decoded,
    window.c3.adapterEvidence.operationEvidence,
  );
  assert.doesNotThrow(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      receipt,
      decoded,
      window.c3.sample.semanticReceipt,
      payload.runtimeOwnerEvidence,
    ),
  );

  const changed = structuredClone(payload.encodedOperationEvidence);
  if (runtimeKind === 'wasm_component') {
    changed.dictionary[0].value.movieRows[0].value += 1;
  } else {
    changed.dictionary[0].value += ' ';
  }
  assert.throws(
    () => decodeBenchmarkCapacityHeterogeneousOperationEvidence(
      changed,
      runtimeKind,
    ),
    /operation_evidence_invalid/u,
  );

  const resigned = structuredClone(payload.encodedOperationEvidence);
  const oldDigest = resigned.dictionary[0].digest;
  if (runtimeKind === 'wasm_component') {
    resigned.dictionary[0].value.movieRows[0].value += 1;
  } else {
    resigned.dictionary[0].value += ' ';
  }
  const newDigest =
    digestBenchmarkSemanticData(resigned.dictionary[0].value);
  resigned.dictionary[0].digest = newDigest;
  for (let index = 0; index < resigned.operations.length; index += 1) {
    const operation = resigned.operations[index];
    if (operation.evidence?.durableResult?.digest === oldDigest) {
      operation.evidence.durableResult.digest = newDigest;
    }
    if (operation.evidence?.durableResultJson?.digest === oldDigest) {
      operation.evidence.durableResultJson.digest = newDigest;
    }
  }
  const resignedDecoded =
    decodeBenchmarkCapacityHeterogeneousOperationEvidence(
      resigned,
      runtimeKind,
    );
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      receipt,
      resignedDecoded,
      window.c3.sample.semanticReceipt,
      payload.runtimeOwnerEvidence,
    ),
    /operation_evidence_invalid/u,
  );

  const duplicate = structuredClone(payload.encodedOperationEvidence);
  duplicate.dictionary.push(structuredClone(duplicate.dictionary[0]));
  assert.throws(
    () => decodeBenchmarkCapacityHeterogeneousOperationEvidence(
      duplicate,
      runtimeKind,
    ),
    /operation_evidence_invalid/u,
  );

  const unused = structuredClone(payload.encodedOperationEvidence);
  const unusedValue = {unused: 'raw-evidence-smuggling'};
  unused.dictionary.push({
    digest: digestBenchmarkSemanticData(unusedValue),
    value: unusedValue,
  });
  assert.throws(
    () => decodeBenchmarkCapacityHeterogeneousOperationEvidence(
      unused,
      runtimeKind,
    ),
    /operation_evidence_invalid/u,
  );
}

test('C4 assembler admits a repeated heterogeneous C3 measuring pair', async () => {
  const workload = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
    workloadPayload(),
  );
  const topology = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
    topologyPayload(),
  );
  const profileEnvelope = createScaleProfileEnvelope({
    profile: {id: SCALE_PROFILE_ID.DEVELOPMENT, version: 1},
    software: {
      revision: REVISION,
      runtime: process.version,
      packageVersion: '0.1.0',
    },
    hardware: {
      provider: 'fixture',
      region: BENCHMARK_RESOURCE_P0_PRICE_SHEET.region,
      instanceClass: 'fixture-host',
      cpuCount: 2,
      memoryBytes: 20_000_000,
      storageClass: 'fixture-storage',
    },
    topology: {
      manifestDigest: topology.digest,
      nodeCount: 2,
      failureDomainCount: 1,
      tableCount: 4,
      partitionCount: 4,
      replicaCount: 1,
    },
    data: {
      manifestDigest: workload.digest,
      logicalBytes: 10_000,
      physicalBytes: 20_000,
      shape: 'movielens-grouped-reduce',
    },
    workload: {
      id: 'movielens-grouped-reduce',
      manifestDigest: workload.digest,
      duration: {warmupMs: 100, measuredMs: 1_010},
    },
  });
  const placeholderPreregistration =
    createBenchmarkResourceSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
      {version: 'placeholder-v1'},
    );
  const matrix = createBenchmarkResourceMatrixManifest({
    matrixId: MATRIX_ID,
    axes: AXES,
    sideIds: SIDE_IDS,
    workloadManifestDigest: workload.digest,
    alternativeTopologyDigest: topology.digest,
    preregistrationDigest: placeholderPreregistration.digest,
    profileEnvelopeDigest: digestBenchmarkSemanticData(profileEnvelope),
  });
  const cellId = matrix.artifact.payload.cells[0].cellId;
  const capacityPreregistrationInput = preregistrationInput({
    offeredLoadPerSecond: [100, 340],
    executionIdentity: {
      matrixId: MATRIX_ID,
      cellId,
      cellManifestDigest: digestBenchmarkSemanticData({
        matrixId: MATRIX_ID,
        cellId,
      }),
      profileIdentity: profileEnvelope.profileIdentity,
      pairIdentity: digestBenchmarkSemanticData({pairId: PAIR_ID}),
      runId: RUN_ID,
      liveEnvironmentContractDigest: topology.digest,
    },
  });
  capacityPreregistrationInput.sampling = {
    ...capacityPreregistrationInput.sampling,
    windows: [
      {
        offeredLoadPerSecond: 100,
        warmupMs: 100,
        measuredMs: 1_010,
      },
      {
        offeredLoadPerSecond: 340,
        warmupMs: 100,
        measuredMs: 1_010,
      },
    ],
  };
  const capacityPreregistration = sealBenchmarkCapacityPreregistration(
    capacityPreregistrationInput,
  );
  const raw = await artifactFixtureReport(capacityPreregistration);
  const achievedBelowOffered =
    reportWithAchievedThroughputBelowOffered(
      capacityPreregistration,
      raw.report,
    );
  const capacityReport = normalizedReport(
    capacityPreregistration,
    achievedBelowOffered,
  );
  const windowEvidence = [];
  let postgresReplay = null;
  const semanticOracleDigest =
    digestBenchmarkSemanticData(fixtureRanking());
  for (let index = 0;
    index < capacityReport.windowReceipts.length;
    index += 1) {
    const receipt = capacityReport.windowReceipts[index];
    if (receipt.phase !== 'measured') continue;
    const sample = capacityReport.rawSamples.find(
      (candidate) =>
        candidate.sampleDigest === receipt.capacitySampleDigest,
    );
    const executableDigest =
      digestBenchmarkSemanticData({runtime: receipt.sideId});
    const runtimeOwner =
      runtimeOwnerEvidence(receipt.sideId, executableDigest);
    const adapterIdentity =
      fixtureAdapterIdentity(receipt, executableDigest, runtimeOwner);
    const operationIds = [];
    const operationEvidence = [];
    for (let operationIndex = 0;
      operationIndex < sample.counts.dispatched;
      operationIndex += 1) {
      const operationId =
        `${receipt.sideId}-${receipt.blockIndex}-` +
        `${receipt.offeredLoad}-${operationIndex}`;
      if (operationIndex < sample.counts.correct) {
        operationIds.push(operationId);
        operationEvidence.push({
          status: 'correct',
          operationIndex,
          operationId,
          evidence:
            receipt.sideId === SIDE_IDS[0] ?
              fixtureLagrangeOperation(
                operationId,
                operationIndex,
                runtimeOwner,
                semanticOracleDigest,
              ) :
              fixturePostgresOperation(
                operationId,
                operationIndex,
                runtimeOwner,
                semanticOracleDigest,
              ),
        });
      } else {
        operationEvidence.push({
          status: 'errored',
          operationIndex,
          operationId,
          failure: {name: 'Error', message: 'fixture operation failed'},
        });
      }
    }
    const coordinate = {
      blockIndex: receipt.blockIndex,
      blockedOrderIndex: receipt.blockedOrderIndex,
      sideId: receipt.sideId,
      offeredLoadPerSecond: receipt.offeredLoad,
      phase: receipt.phase,
    };
    const ownerReceipt = createBenchmarkCapacityAdapterOwnerReceipt({
      adapterIdentity,
      operationIds,
      evidenceDigest: digestBenchmarkSemanticData({
        adapterIdentityDigest: adapterIdentity.adapterIdentityDigest,
        coordinate,
        semanticOracleDigest,
        operations: operationEvidence,
      }),
      semanticOracleDigest,
    });
    const engagement =
      createBenchmarkCapacityHeterogeneousOperationReceipt({
        preregistration: capacityPreregistration,
        sample,
        adapterIdentity,
        ownerReceipt,
        window: {
          blockedOrderIndex: receipt.blockedOrderIndex,
          startedAt: receipt.startedAt,
          endedAt: receipt.endedAt,
        },
        headroom: createBenchmarkCapacityHeadroomReceipt({
          minimumRequiredRatio: 0.1,
          observerCpu: {capacity: 100, observedPeak: 5},
          hostCpu: {capacity: 16, observedPeak: 4},
          hostMemory: {capacity: 64_000, observedPeak: 16_000},
          sharedNetwork: {capacity: 10_000, observedPeak: 2_000},
          sharedStorage: {capacity: 10_000, observedPeak: 1_000},
        }, sample),
      });
    assert.doesNotThrow(
      () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
        engagement,
        operationEvidence,
        sample.semanticReceipt,
        runtimeOwner,
      ),
      `${receipt.sideId} block ${receipt.blockIndex} operation evidence`,
    );
    const rawEvidenceBytes = Buffer.byteLength(JSON.stringify({
      heterogeneousOperationReceipt: engagement,
      operationEvidence,
      runtimeOwnerEvidence: runtimeOwner,
    }));
    assert.ok(
      rawEvidenceBytes < BENCHMARK_RESOURCE_LIMIT.ARTIFACT_BYTES,
      `${receipt.sideId} raw evidence is ${rawEvidenceBytes} bytes`,
    );
    if (receipt.sideId === SIDE_IDS[1] && postgresReplay === null) {
      postgresReplay = {
        preregistration: capacityPreregistration,
        sample,
        engagement,
        operationEvidence,
        runtimeOwner,
      };
    }
    const boundReceipt = createBenchmarkCapacityWindowReceipt({
      blockIndex: receipt.blockIndex,
      blockedOrderIndex: receipt.blockedOrderIndex,
      sideId: receipt.sideId,
      phase: receipt.phase,
      offeredLoad: receipt.offeredLoad,
      startedAt: receipt.startedAt,
      endedAt: receipt.endedAt,
      capacitySampleDigest: receipt.capacitySampleDigest,
      semanticReceiptDigest: receipt.semanticReceiptDigest,
      liveEngagementDigest: engagement.receiptDigest,
      resourceWindowDigest: null,
    }, sample, capacityPreregistration);
    capacityReport.windowReceipts[index] = boundReceipt;
    windowEvidence.push({
      c3: {
        receipt: boundReceipt,
        sample,
        engagement,
        adapterEvidence: {
          operationEvidence,
          runtimeOwnerEvidence: runtimeOwner,
        },
      },
      calibration: await calibration(
        boundReceipt.startedAt,
        boundReceipt.endedAt,
      ),
    });
  }
  delete capacityReport.reportDigest;
  capacityReport.reportDigest =
    digestBenchmarkSemanticData(capacityReport);
  const resourcePreregistration = {
    version: 'movielens-resource-preregistration-fixture-v1',
    sideIds: SIDE_IDS,
    capacityProtocolReportDigest: capacityReport.reportDigest,
    capacityProtocolPreregistrationDigest:
      capacityPreregistration.manifestDigest,
  };
  let evidence;
  let validation;
  let poisonedStack = '';
  const poison = () => {
    const error = new Error('poisoned mutable intrinsic');
    poisonedStack = error.stack;
    throw error;
  };
  withHostileIntrinsics([
    replacePrototypeProperty(Array.prototype, 'filter', poison),
    replacePrototypeProperty(Array.prototype, 'find', poison),
    replacePrototypeProperty(Array.prototype, 'includes', poison),
    replacePrototypeProperty(Array.prototype, 'indexOf', poison),
    replacePrototypeProperty(Array.prototype, 'map', poison),
    replacePrototypeProperty(Array.prototype, 'slice', poison),
    replacePrototypeProperty(Array.prototype, 'sort', poison),
    replacePrototypeProperty(Array.prototype, Symbol.iterator, poison),
  ], () => {
    evidence = createBenchmarkResourceCapacityProtocolEvidence({
      matrixId: MATRIX_ID,
      axes: AXES,
      pairId: PAIR_ID,
      runId: RUN_ID,
      sideIds: SIDE_IDS,
      sourceRevision: REVISION,
      producedAt: '2026-07-28T12:00:00.000Z',
      validUntil: '2026-07-29T12:00:00.000Z',
      workloadManifest: workloadPayload(),
      alternativeTopology: topologyPayload(),
      resourcePreregistration,
      profileEnvelope,
      inventoryId: 'heterogeneous-resource-fixture-inventory-v1',
      inventorySides: inventorySides(),
      priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
      capacityPreregistration,
      capacityReport,
      windowEvidence,
      practicalThreshold: 0.05,
    });
  });
  withHostileIntrinsics([
    replacePrototypeProperty(Math, 'max', poison),
    replacePrototypeProperty(Math, 'min', poison),
  ], () => {
    validation = validateBenchmarkResourceEvidenceRoot(
      evidence.receipt,
    );
  });
  assert.equal(
    validation.valid,
    true,
    `${validation.reason}: ${validation.detail || ''}\n${poisonedStack}`,
  );
  assert.equal(validation.claimEligible, true);
  assert.equal(evidence.windows.length, windowEvidence.length);
  assert.equal(evidence.cellEvidence.artifact.payload.state, 'measuring');
  const liveEngagements = liveEngagementArtifacts(evidence);
  const maximumLiveEngagementBytes = Math.max(
    ...liveEngagements.map((artifact) => artifact.byteLength),
  );
  assert.ok(
    maximumLiveEngagementBytes <
      BENCHMARK_RESOURCE_LIMIT.ARTIFACT_BYTES * 0.75,
    `encoded live engagement is ${maximumLiveEngagementBytes} bytes`,
  );
  const lagrangeHighLoad = liveEngagements.find(
    (artifact) =>
      artifact.artifact.payload.sideId === SIDE_IDS[0] &&
      artifact.artifact.payload.offeredLoad === 340,
  );
  assert.notEqual(lagrangeHighLoad, undefined);
  assertEncodedOperationEvidenceTamperingRejected(
    lagrangeHighLoad,
    windowEvidence,
  );
  const postgresqlHighLoad = liveEngagements.find(
    (artifact) =>
      artifact.artifact.payload.sideId === SIDE_IDS[1] &&
      artifact.artifact.payload.offeredLoad === 340,
  );
  assert.notEqual(postgresqlHighLoad, undefined);
  assertEncodedOperationEvidenceTamperingRejected(
    postgresqlHighLoad,
    windowEvidence,
  );
  const costWindows = evidence.windows.filter(
    (window) =>
      window.artifact.payload.correctSloEligibleOperations > 0,
  );
  assert.equal(costWindows.length, 6);
  assert.equal(evidence.costEffect.sampleCount, 3);
  assert.equal(
    evidence.costEffect.sourceDigests.length,
    2 + costWindows.length,
  );
  for (let index = 0; index < evidence.windows.length; index += 1) {
    const payload = evidence.windows[index].artifact.payload;
    const selectedCapacity =
      capacityReport.summary.capacityBySide[payload.sideId]
        .maxSloOfferedLoadPerSecond;
    assert.equal(
      payload.correctSloEligibleOperations > 0,
      payload.offeredLoad === selectedCapacity,
    );
    if (payload.correctSloEligibleOperations > 0) {
      assert.notEqual(
        capacityReport.summary.capacityBySide[payload.sideId]
          .perBlock[payload.blockIndex],
        payload.offeredLoad,
      );
    }
  }
  assert.notEqual(postgresReplay, null);
  assertPostgresOwnerTamperingRejected(postgresReplay);
  assertCoherentPostgresQueryForgeryRejected(postgresReplay);
});
