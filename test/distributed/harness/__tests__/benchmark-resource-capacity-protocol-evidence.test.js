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
import {
  benchmarkCapacityHeterogeneousWorkloadPayload,
  createBenchmarkCapacityHeterogeneousEvidenceFixture,
} from './benchmark-capacity-heterogeneous-evidence-test-fixture.js';

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

test('paired cost bootstrap uses the effect owner averaging arithmetic', () => {
  const pairs = [
    [0.2378, 0.14570000000000002],
    [0.2378, 0.14570000000000002],
    [0.2378, 0.14570000000000002],
  ];
  const interval =
    bootstrapBenchmarkPairedRatioInterval(
      pairs,
      0.95,
      2_000,
      20_260_728,
    );
  const expected =
    (pairs[0][0] + pairs[1][0] + pairs[2][0]) / pairs.length /
    ((pairs[0][1] + pairs[1][1] + pairs[2][1]) / pairs.length);
  assert.equal(interval.estimate, expected);
  assert.ok(interval.lower <= expected);
  assert.ok(expected <= interval.upper);
});

test('paired cost bootstrap rejects Proxy-backed samples', () => {
  const pair = [2, 1];
  let lengthReads = 0;
  const outerProxy = new Proxy([pair], {
    get(target, property, receiver) {
      if (property === 'length') {
        lengthReads += 1;
        return lengthReads === 1 ? 1 : 2;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => bootstrapBenchmarkPairedRatioInterval(
      outerProxy,
      0.95,
      1,
      1,
    ),
    /paired ratio bootstrap contract required/u,
  );
  assert.equal(lengthReads, 0);
  assert.throws(
    () => bootstrapBenchmarkPairedRatioInterval(
      [new Proxy(pair, {})],
      0.95,
      1,
      1,
    ),
    /unsafe paired ratio sample at 0/u,
  );
});

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
    benchmarkCapacityHeterogeneousWorkloadPayload(),
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
  const heterogeneousFixture =
    createBenchmarkCapacityHeterogeneousEvidenceFixture({
      preregistration: capacityPreregistration,
      report: normalizedReport(
        capacityPreregistration,
        achievedBelowOffered,
      ),
      lagrangeSideId: SIDE_IDS[0],
    });
  const capacityReport = heterogeneousFixture.report;
  const postgresReplay = heterogeneousFixture.postgresqlReplay;
  const windowEvidence = [];
  for (let index = 0;
    index < heterogeneousFixture.windowEvidence.length;
    index += 1) {
    const c3 = heterogeneousFixture.windowEvidence[index];
    windowEvidence.push({
      c3,
      calibration: await calibration(
        c3.receipt.startedAt,
        c3.receipt.endedAt,
      ),
    });
  }
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
      workloadManifest: benchmarkCapacityHeterogeneousWorkloadPayload(),
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
