import {test} from '../../../../src/test-helpers/tap.js';
import {
  replacePrototypeProperty,
  withHostileIntrinsics,
} from '../../../helpers/hostile-intrinsics.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
} from '../benchmark-resource-contract-constants.js';
import {
  createBenchmarkResourceMemoryResolver,
} from '../benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceNonMeasuringCellEvidence,
  createBenchmarkResourceSourceArtifact,
  validateBenchmarkResourceEvidenceRoot,
} from '../benchmark-resource-evidence-root.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from '../benchmark-resource-live-observation-authority.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from '../benchmark-resource-price-sheet-p0-constants.js';
import {
  buildComparativeRequestEnrichmentAffinityWitness,
} from '../comparative-efficiency-request-enrichment-affinity-witness.js';
import {
  evaluateComparativeRequestEnrichmentOracle,
} from '../comparative-efficiency-request-enrichment-admission.js';
import {
  COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
  COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  COMPARATIVE_REQUEST_ENRICHMENT_REASON,
  comparativeRequestEnrichmentEvidenceDigest,
  comparativeRequestEnrichmentExpectedResult,
  comparativeRequestEnrichmentSql,
  createComparativeRequestEnrichmentEvidence,
  inspectComparativeRequestEnrichmentEvidence,
} from '../comparative-efficiency-request-enrichment.js';

const SOURCE_REVISION = 'git-commit:c6-request-enrichment-fixture';
const PRODUCED_AT = '2026-07-28T00:00:00.000Z';
const VALID_UNTIL = '2026-07-29T00:00:00.000Z';
const SIDE_IDS = ['lagrange', 'postgresql'];
const CALIBRATION_STARTED_AT = Date.parse(PRODUCED_AT);
const CALIBRATION_ENDED_AT = CALIBRATION_STARTED_AT + 60_000;

function resourceStats(timestamp, multiplier) {
  return {
    timestamp,
    cpuPercent: 10 * multiplier,
    cpuUsageNanoseconds: 10_000 * multiplier,
    memoryUsageBytes: 100_000 * multiplier,
    memoryLimitBytes: 1_000_000,
    cpuLimitNanoCpus: 1_000_000_000,
    storageLimitBytes: 1_000_000,
    pids: 5,
    rxBytes: 1_000 * multiplier,
    txBytes: 2_000 * multiplier,
    blockReadBytes: 3_000 * multiplier,
    blockWriteBytes: 4_000 * multiplier,
    blockReadOperations: 3 * multiplier,
    blockWriteOperations: 4 * multiplier,
    storageUsageBytes: 10_000 * multiplier,
  };
}

async function calibrationFixture(sourceRevision = SOURCE_REVISION) {
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
      return resourceStats(
        calls <= 2 ? CALIBRATION_STARTED_AT : CALIBRATION_ENDED_AT,
        calls <= 2 ? 1 : 2,
      );
    },
    async getNetworkByName() {
      return cleaned ? null : {id: 'request-enrichment-network'};
    },
  };
  const session = await beginBenchmarkResourceLiveObservation(provider, {
    runId: 'request-enrichment-live-fixture',
    networkId: 'request-enrichment-network',
    networkName: 'request-enrichment-network',
    sourceRevision,
    components: [
      {
        componentId: 'postgresql-database',
        sideId: 'postgresql',
        containerId: 'postgresql-container',
        storagePath: '/var/lib/postgresql/data',
      },
      {
        componentId: 'postgresql-client',
        sideId: 'postgresql',
        containerId: 'client-container',
        storagePath: '/tmp',
      },
    ],
  });
  await captureBenchmarkResourceLiveObservation(session);
  cleaned = true;
  const finalized = await finalizeBenchmarkResourceLiveObservation(session);
  return writeExternallyObservedBenchmarkResourceCalibration(
    finalized.receipt,
    finalized.authorization,
  );
}

function provisioned() {
  return {
    cpuCores: 1,
    memoryBytes: 1_000_000,
    storageBytes: 1_000_000,
    iops: 0,
    networkBytesPerSecond: 0,
  };
}

function minimumFootprint() {
  return {
    instances: 1,
    cpuCores: 0,
    memoryBytes: 0,
    storageBytes: 0,
  };
}

function component(componentId, role) {
  return {
    componentId,
    role,
    billingTreatment: BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
    provisioned: provisioned(),
    minimumFootprint: minimumFootprint(),
    reservedHeadroomRatio: 0,
    exclusionReason: 'none',
  };
}

function workloadCells() {
  return COMPARATIVE_REQUEST_ENRICHMENT_CELLS.map((cell) => ({
    datasetSize: cell.datasetSize,
    fanout: cell.fanout,
    readLocality: cell.readLocality,
    skew: cell.skew,
    requestCount: cell.requestCount,
    alternativeSql: comparativeRequestEnrichmentSql(cell),
    oracleName: 'row_count_and_sum_exact',
    oracleExpected: comparativeRequestEnrichmentExpectedResult(cell),
  }));
}

function attempts() {
  return COMPARATIVE_REQUEST_ENRICHMENT_CELLS.map((cell, index) => ({
    matrixCellIndex: index,
    runId: `request-enrichment-${index}`,
    candidateEngaged: false,
    alternativeEngaged: true,
    reasonCodes: [COMPARATIVE_REQUEST_ENRICHMENT_REASON],
    liveEvidence: {
      version: 'comparative-request-enrichment-live-evidence-v1',
      matrixCellIndex: index,
      startedAt: `2026-07-28T00:00:${String(index).padStart(2, '0')}.000Z`,
      endedAt: `2026-07-28T00:00:${String(index + 20).padStart(2, '0')}.000Z`,
      candidate: {
        architectureId: 'lagrange',
        capacityAdapterEngaged: false,
        reason: 'no claim-eligible request-enrichment capacity adapter',
        affinityOwnerWitness:
          buildComparativeRequestEnrichmentAffinityWitness(cell),
      },
      alternative: {
        architectureId: 'postgresql',
        engaged: true,
        image: 'postgres:16',
        imageId: 'sha256:fixture-image',
        databaseContainerId: 'postgresql-container',
        clientContainerId: 'client-container',
        sql: comparativeRequestEnrichmentSql(cell),
        stdout: comparativeRequestEnrichmentExpectedResult(cell),
      },
      oracle: {
        name: 'row_count_and_sum_exact',
        expected: comparativeRequestEnrichmentExpectedResult(cell),
        passed: true,
      },
    },
  }));
}

async function evidenceInput(overrides = {}) {
  const calibrationArtifact =
    overrides.calibrationArtifact || await calibrationFixture();
  return {
    matrixId: 'comparative-request-enrichment-p0-v1',
    pairId: 'lagrange-postgresql-request-enrichment-v1',
    sideIds: SIDE_IDS,
    sourceRevision: SOURCE_REVISION,
    producedAt: PRODUCED_AT,
    validUntil: VALID_UNTIL,
    workloadManifest: {
      version: 'comparative-request-enrichment-workloads-v1',
      cells: workloadCells(),
      selectionPolicy: 'complete_cartesian_matrix',
    },
    alternativeTopology: {
      version: 'comparative-request-enrichment-topology-v1',
      candidate: {
        architectureId: 'lagrange',
        required: true,
        capacityAdapterEngaged: false,
        reason: 'no claim-eligible request-enrichment capacity adapter',
      },
      alternative: {
        architectureId: 'postgresql',
        image: 'postgres:16',
        imageId: 'sha256:fixture-image',
        databaseContainerId: 'postgresql-container',
        clientContainerId: 'client-container',
        network: 'managed_bridge',
      },
    },
    preregistration: {
      version: 'comparative-request-enrichment-preregistration-v1',
      axes: COMPARATIVE_REQUEST_ENRICHMENT_AXES,
      sideIds: SIDE_IDS,
      outcomePolicy: 'direction_neutral',
      invalidCellPolicy: 'publish_explicit_non_measuring',
      candidateEngagementRequired: true,
      affinityOwnerIds: COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
      requiredEvidence: [
        'paired_capacity',
        'whole_topology_resource_windows',
        'capacity_uncertainty',
        'capacity_practical_effect',
        'cost_practical_effect',
      ],
    },
    inventoryId: 'comparative-request-enrichment-inventory-v1',
    inventorySides: [
      {
        sideId: 'lagrange',
        components: [
          component(
            'lagrange-node',
            BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
          ),
        ],
      },
      {
        sideId: 'postgresql',
        components: [
          component(
            'postgresql-database',
            BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
          ),
          component(
            'postgresql-client',
            BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
          ),
        ],
      },
    ],
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    calibrationArtifact,
    attempts: overrides.attempts || attempts(),
  };
}

async function evidenceFixture(overrides = {}) {
  return createComparativeRequestEnrichmentEvidence(
    await evidenceInput(overrides),
  );
}

function rebuiltSourceReceipt(evidence, mutate, targetIndex = 0) {
  const originalSource = evidence.engagements[targetIndex];
  const originalCell = evidence.cells[targetIndex];
  const payload =
    JSON.parse(JSON.stringify(originalSource.artifact.payload));
  mutate(payload);
  const source = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
    payload,
    originalSource.artifact.references,
  );
  const cellPayload = originalCell.artifact.payload;
  const cell = createBenchmarkResourceNonMeasuringCellEvidence({
    matrixManifestDigest: cellPayload.matrixManifestDigest,
    matrixId: cellPayload.matrixId,
    cellId: cellPayload.cellId,
    pairId: cellPayload.pairId,
    runId: cellPayload.runId,
    sideIds: cellPayload.sideIds,
    reasonCodes: cellPayload.reasonCodes,
    sourceDigests: [source.digest],
    sourceRevision: cellPayload.sourceRevision,
    producedAt: cellPayload.producedAt,
    validUntil: cellPayload.validUntil,
  });
  const artifacts = evidence.artifacts.filter((artifact) => (
    artifact.digest !== originalSource.digest &&
    artifact.digest !== originalCell.digest
  ));
  artifacts.push(source, cell);
  const rootPayload = evidence.root.artifact.payload;
  const cellDigests = [...rootPayload.cellEvidenceDigests];
  cellDigests[targetIndex] = cell.digest;
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: rootPayload.matrixManifestDigest,
    componentInventoryDigest: rootPayload.componentInventoryDigest,
    priceSheetDigest: rootPayload.priceSheetDigest,
    cellEvidenceDigests: cellDigests,
    sourceRevision: rootPayload.sourceRevision,
    producedAt: rootPayload.producedAt,
    validUntil: rootPayload.validUntil,
    artifacts,
  });
  return {
    rootDigest: root.digest,
    resolver: createBenchmarkResourceMemoryResolver([...artifacts, root]),
  };
}

test('request-enrichment publishes the complete matrix without a claim',
  async (t) => {
    const evidence = await evidenceFixture();
    t.same(inspectComparativeRequestEnrichmentEvidence(evidence.receipt), {
      valid: true,
      reason: 'valid',
      complete: true,
      claimEligible: false,
      claimDisposition: 'non_measuring_candidate_capacity_absent',
      measuringCellCount: 0,
      nonMeasuringCellCount: 16,
      alternativeOraclePassCount: 16,
      affinityOwnerWitnessCount: 16,
      matrixId: 'comparative-request-enrichment-p0-v1',
      matrixDigest: evidence.matrix.digest,
      rootDigest: evidence.root.digest,
    });
    t.equal(evidence.cells.length, 16);
    t.match(
      comparativeRequestEnrichmentEvidenceDigest(evidence),
      /^sha256:[0-9a-f]{64}$/u,
    );
    t.end();
  });

test('request-enrichment rejects selective matrix omission', async (t) => {
  await t.rejects(
    evidenceFixture({attempts: attempts().slice(0, 15)}),
    /attempts:exact_matrix_required/u,
  );
  t.end();
});

test('request-enrichment rejects reordered matrix results', async (t) => {
  const reordered = attempts();
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  await t.rejects(
    evidenceFixture({attempts: reordered}),
    /matrix_cell_order_mismatch/u,
  );
  t.end();
});

test('request-enrichment rejects surrogate candidate capacity', async (t) => {
  const surrogate = attempts();
  surrogate[0].candidateEngaged = true;
  await t.rejects(
    evidenceFixture({attempts: surrogate}),
    /candidate_must_be_absent/u,
  );
  t.end();
});

test('request-enrichment requires the alternative live attempt', async (t) => {
  const disconnected = attempts();
  disconnected[0].alternativeEngaged = false;
  await t.rejects(
    evidenceFixture({attempts: disconnected}),
    /alternative_must_be_engaged/u,
  );
  t.end();
});

test('request-enrichment requires explicit capacity absence', async (t) => {
  const unexplained = attempts();
  unexplained[0].reasonCodes = ['unknown'];
  await t.rejects(
    evidenceFixture({attempts: unexplained}),
    /candidate_absence_reason_required/u,
  );
  t.end();
});

test('request-enrichment owner witnesses use production semantics', (t) => {
  for (let index = 0;
    index < COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index];
    const witness = buildComparativeRequestEnrichmentAffinityWitness(cell);
    const readCount = Object.values(
      witness.attribution.partitionReads,
    ).reduce((sum, value) => sum + value, 0);
    t.equal(readCount, cell.requestCount * cell.fanout);
    t.equal(
      witness.routing.preferSameLatencyGroup,
      cell.readLocality === 'same_group',
    );
    t.same(witness.decay.staleNodeWeights, {});
    t.same(witness.decay.staleGroupWeights, {});
    t.equal(witness.hysteresis.atMarginTriggers, false);
    t.equal(witness.hysteresis.aboveMarginTriggers, true);
  }
  t.end();
});

test('request-enrichment alternative oracles bind every cell', (t) => {
  for (let index = 0;
    index < COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index];
    const expected = comparativeRequestEnrichmentExpectedResult(cell);
    t.equal(evaluateComparativeRequestEnrichmentOracle(cell, expected), true);
    t.equal(
      evaluateComparativeRequestEnrichmentOracle(cell, `${expected}0`),
      false,
    );
  }
  t.end();
});

test('request-enrichment rejects a rebuilt affinity-owner witness',
  async (t) => {
    const evidence = await evidenceFixture();
    const receipt = rebuiltSourceReceipt(evidence, (payload) => {
      payload.liveEvidence.candidate.affinityOwnerWitness.routing
        .preferSameLatencyGroup = true;
    });
    t.equal(validateBenchmarkResourceEvidenceRoot(receipt).valid, true);
    t.equal(inspectComparativeRequestEnrichmentEvidence(receipt).valid, false);
    t.end();
  });

test('request-enrichment rejects rebuilt SQL and oracle output',
  async (t) => {
    const evidence = await evidenceFixture();
    const receipt = rebuiltSourceReceipt(evidence, (payload) => {
      payload.liveEvidence.alternative.sql = 'SELECT 1';
      payload.liveEvidence.alternative.stdout = '128|1';
      payload.liveEvidence.oracle.expected = '128|1';
    });
    t.equal(validateBenchmarkResourceEvidenceRoot(receipt).valid, true);
    t.equal(inspectComparativeRequestEnrichmentEvidence(receipt).valid, false);
    t.end();
  });

test('request-enrichment calibration revision is root-bound', async (t) => {
  const calibrationArtifact =
    await calibrationFixture('git-commit:different-source');
  await t.rejects(
    evidenceFixture({calibrationArtifact}),
    /external_observation_required/u,
  );
  t.end();
});

test('request-enrichment root rejects tampered raw live bytes', async (t) => {
  const evidence = await evidenceFixture();
  const target = evidence.engagements[0];
  const tampered = Buffer.from(target.bytes);
  tampered[tampered.length - 2] ^= 1;
  const receipt = {
    rootDigest: evidence.root.digest,
    resolver: {
      resolve(digest) {
        if (digest === target.digest) return tampered;
        return evidence.receipt.resolver.resolve(digest);
      },
    },
  };
  const inspection = inspectComparativeRequestEnrichmentEvidence(receipt);
  t.equal(inspection.valid, false);
  t.match(inspection.reason, /digest_mismatch|canonical/u);
  t.end();
});

test('request-enrichment validates resolver bytes before cloning', (t) => {
  let valueOfCalls = 0;
  const hostile = {
    valueOf() {
      valueOfCalls += 1;
      return 1;
    },
  };
  const inspection = inspectComparativeRequestEnrichmentEvidence({
    rootDigest:
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    resolver: {resolve: () => hostile},
  });
  t.equal(inspection.valid, false);
  t.equal(valueOfCalls, 0);
  t.end();
});

test('request-enrichment ignores poisoned String trim', (t) => {
  const cell = COMPARATIVE_REQUEST_ENRICHMENT_CELLS[0];
  const expected = comparativeRequestEnrichmentExpectedResult(cell);
  const descriptor =
    Object.getOwnPropertyDescriptor(String.prototype, 'trim');
  // eslint-disable-next-line no-extend-native -- adversarial intrinsic test
  Object.defineProperty(String.prototype, 'trim', {
    ...descriptor,
    value: () => 'forged',
  });
  try {
    t.equal(evaluateComparativeRequestEnrichmentOracle(cell, expected), true);
    t.equal(evaluateComparativeRequestEnrichmentOracle(cell, 'forged'), false);
  } finally {
    // eslint-disable-next-line no-extend-native -- restore tested intrinsic
    Object.defineProperty(String.prototype, 'trim', descriptor);
  }
  t.end();
});

test('request-enrichment admission ignores mutable owner intrinsics',
  async (t) => {
    const input = await evidenceInput();
    const evidence = createComparativeRequestEnrichmentEvidence(input);
    const calls = {
      arrayFilter: 0,
      arrayIterator: 0,
      arrayMap: 0,
      jsonStringify: 0,
      mapGet: 0,
      mapSet: 0,
      mathFloor: 0,
    };
    function poison(name) {
      return function poisonedIntrinsic() {
        calls[name] += 1;
        throw new Error(`mutable intrinsic invoked: ${name}`);
      };
    }
    let inspection;
    let produced;
    let witness;
    withHostileIntrinsics([
      replacePrototypeProperty(
        Array.prototype,
        'filter',
        poison('arrayFilter'),
      ),
      replacePrototypeProperty(
        Array.prototype,
        Symbol.iterator,
        poison('arrayIterator'),
      ),
      replacePrototypeProperty(
        Array.prototype,
        'map',
        poison('arrayMap'),
      ),
      replacePrototypeProperty(
        JSON,
        'stringify',
        poison('jsonStringify'),
      ),
      replacePrototypeProperty(Map.prototype, 'get', poison('mapGet')),
      replacePrototypeProperty(Map.prototype, 'set', poison('mapSet')),
      replacePrototypeProperty(Math, 'floor', poison('mathFloor')),
    ], () => {
      witness = buildComparativeRequestEnrichmentAffinityWitness(
        COMPARATIVE_REQUEST_ENRICHMENT_CELLS[0],
      );
      produced = createComparativeRequestEnrichmentEvidence(input);
      inspection =
        inspectComparativeRequestEnrichmentEvidence(evidence.receipt);
    });
    t.equal(
      witness.version,
      'comparative-request-enrichment-affinity-owner-witness-v1',
    );
    t.equal(produced.root.digest, evidence.root.digest);
    t.equal(inspection.valid, true);
    t.equal(inspection.complete, true);
    t.same(calls, {
      arrayFilter: 0,
      arrayIterator: 0,
      arrayMap: 0,
      jsonStringify: 0,
      mapGet: 0,
      mapSet: 0,
      mathFloor: 0,
    });
    t.end();
  });
