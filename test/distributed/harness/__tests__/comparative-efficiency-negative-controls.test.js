import {test} from '../../../../src/test-helpers/tap.js';
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
  evaluateComparativeNegativeControlOracle,
} from '../comparative-efficiency-negative-controls-admission.js';
import {
  COMPARATIVE_NEGATIVE_CONTROL_IDS,
  COMPARATIVE_NEGATIVE_CONTROL_REASON,
  COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS,
  comparativeNegativeControlEvidenceDigest,
  createComparativeNegativeControlEvidence,
  inspectComparativeNegativeControlEvidence,
} from '../comparative-efficiency-negative-controls.js';

const SOURCE_REVISION = 'git-commit:c5-negative-control-fixture';
const PRODUCED_AT = '2026-07-27T20:00:00.000Z';
const VALID_UNTIL = '2026-07-28T20:00:00.000Z';
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
      return cleaned ? null : {id: 'negative-control-network'};
    },
  };
  const session = await beginBenchmarkResourceLiveObservation(provider, {
    runId: 'negative-control-live-fixture',
    networkId: 'negative-control-network',
    networkName: 'negative-control-network',
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

function attempts() {
  return COMPARATIVE_NEGATIVE_CONTROL_IDS.map((controlId, index) => ({
    controlId,
    runId: `negative-control-${index}`,
    candidateEngaged: false,
    alternativeEngaged: true,
    reasonCodes: [COMPARATIVE_NEGATIVE_CONTROL_REASON],
    liveEvidence: {
      version: 'comparative-negative-control-live-evidence-v1',
      controlId,
      startedAt: `2026-07-27T20:00:0${index}.000Z`,
      endedAt: `2026-07-27T20:00:1${index}.000Z`,
      candidate: {
        architectureId: 'lagrange',
        engaged: false,
        reason: 'no Lagrange adapter exists for this control identity',
      },
      alternative: {
        architectureId: 'postgresql',
        engaged: true,
        image: 'postgres:16',
        imageId: 'sha256:fixture-image',
        databaseContainerId: 'postgresql-container',
        clientContainerId: 'client-container',
        sql: COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS[index].alternativeSql,
        stdout: index === 4 ? 'Index Scan\n64' :
          COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS[index].oracleExpected[0],
      },
      oracle: {
        name: COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS[index].oracleName,
        passed: true,
      },
    },
  }));
}

async function evidenceFixture(overrides = {}) {
  const calibrationArtifact =
    overrides.calibrationArtifact || await calibrationFixture();
  return createComparativeNegativeControlEvidence({
    matrixId: 'comparative-negative-controls-p0-v1',
    pairId: 'lagrange-postgresql-negative-controls-v1',
    sideIds: SIDE_IDS,
    sourceRevision: SOURCE_REVISION,
    producedAt: PRODUCED_AT,
    validUntil: VALID_UNTIL,
    workloadManifest: {
      version: 'comparative-negative-controls-workloads-v1',
      controls: COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS,
      selectionPolicy: 'complete_preregistered_matrix',
    },
    alternativeTopology: {
      version: 'comparative-negative-controls-topology-v1',
      candidate: {
        architectureId: 'lagrange',
        required: true,
        engaged: false,
        reason: 'no Lagrange adapter exists for this control identity',
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
      version: 'comparative-negative-controls-preregistration-v1',
      controls: COMPARATIVE_NEGATIVE_CONTROL_IDS,
      sideIds: SIDE_IDS,
      outcomePolicy: 'direction_neutral',
      invalidCellPolicy: 'publish_explicit_non_measuring',
      candidateEngagementRequired: true,
      requiredEvidence: [
        'paired_capacity',
        'whole_topology_resource_windows',
        'capacity_uncertainty',
        'capacity_practical_effect',
        'cost_practical_effect',
      ],
    },
    inventoryId: 'comparative-negative-controls-inventory-v1',
    inventorySides: [
      {
        sideId: 'lagrange',
        components: [
          component('lagrange-node', BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE),
        ],
      },
      {
        sideId: 'postgresql',
        components: [
          component('postgresql-database', BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE),
          component('postgresql-client', BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT),
        ],
      },
    ],
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    calibrationArtifact,
    attempts: overrides.attempts || attempts(),
  });
}

function rebuiltSourceReceipt(evidence, mutate, options = {}) {
  const targetIndex = options.index || 0;
  const originalSource = evidence.engagements[targetIndex];
  const originalCell = evidence.cells[targetIndex];
  const payload =
    JSON.parse(JSON.stringify(originalSource.artifact.payload));
  mutate(payload);
  const references =
    options.references || originalSource.artifact.references;
  const source = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
    payload,
    references,
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

function relabeledRevisionReceipt(evidence) {
  const sourceRevision = 'git-commit:forged-revision';
  const replacements = [];
  for (let index = 0; index < evidence.cells.length; index += 1) {
    const payload = evidence.cells[index].artifact.payload;
    replacements.push(createBenchmarkResourceNonMeasuringCellEvidence({
      matrixManifestDigest: payload.matrixManifestDigest,
      matrixId: payload.matrixId,
      cellId: payload.cellId,
      pairId: payload.pairId,
      runId: payload.runId,
      sideIds: payload.sideIds,
      reasonCodes: payload.reasonCodes,
      sourceDigests: payload.sourceDigests,
      sourceRevision,
      producedAt: payload.producedAt,
      validUntil: payload.validUntil,
    }));
  }
  const oldCellDigests = new Set(
    evidence.cells.map((cell) => cell.digest),
  );
  const artifacts = evidence.artifacts.filter(
    (artifact) => !oldCellDigests.has(artifact.digest),
  );
  artifacts.push(...replacements);
  const payload = evidence.root.artifact.payload;
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: payload.matrixManifestDigest,
    componentInventoryDigest: payload.componentInventoryDigest,
    priceSheetDigest: payload.priceSheetDigest,
    cellEvidenceDigests: replacements.map((cell) => cell.digest),
    sourceRevision,
    producedAt: payload.producedAt,
    validUntil: payload.validUntil,
    artifacts,
  });
  return {
    rootDigest: root.digest,
    resolver: createBenchmarkResourceMemoryResolver([...artifacts, root]),
  };
}

test('negative-control matrix publishes every invalid cell without a claim',
  async (t) => {
    const evidence = await evidenceFixture();
    const inspection =
      inspectComparativeNegativeControlEvidence(evidence.receipt);

    t.same(inspection, {
      valid: true,
      reason: 'valid',
      complete: true,
      claimEligible: false,
      measuringCellCount: 0,
      nonMeasuringCellCount: 5,
      matrixId: 'comparative-negative-controls-p0-v1',
      matrixDigest: evidence.matrix.digest,
      rootDigest: evidence.root.digest,
    });
    t.equal(evidence.cells.length, COMPARATIVE_NEGATIVE_CONTROL_IDS.length);
    t.equal(evidence.engagements.length, COMPARATIVE_NEGATIVE_CONTROL_IDS.length);
    t.match(
      comparativeNegativeControlEvidenceDigest(evidence),
      /^sha256:[0-9a-f]{64}$/u,
    );
    t.end();
  });

test('negative-control matrix rejects selective omission', async (t) => {
  const selected = attempts().slice(0, 3);
  await t.rejects(
    evidenceFixture({attempts: selected}),
    /attempts:exact_matrix_required/u,
  );
  t.end();
});

test('negative-control matrix rejects reordered result selection', async (t) => {
  const reordered = attempts();
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  await t.rejects(
    evidenceFixture({attempts: reordered}),
    /control_order_mismatch/u,
  );
  t.end();
});

test('negative-control matrix rejects a surrogate candidate measurement',
  async (t) => {
    const surrogate = attempts();
    surrogate[0].candidateEngaged = true;
    await t.rejects(
      evidenceFixture({attempts: surrogate}),
      /candidate_must_be_absent/u,
    );
    t.end();
  });

test('negative-control matrix requires the alternative live attempt',
  async (t) => {
    const disconnected = attempts();
    disconnected[2].alternativeEngaged = false;
    await t.rejects(
      evidenceFixture({attempts: disconnected}),
      /alternative_must_be_engaged/u,
    );
    t.end();
  });

test('negative-control matrix requires explicit candidate absence reason',
  async (t) => {
    const unexplained = attempts();
    unexplained[3].reasonCodes = ['unknown'];
    await t.rejects(
      evidenceFixture({attempts: unexplained}),
      /candidate_absence_reason_required/u,
    );
    t.end();
  });

test('negative-control root rejects tampered raw live bytes', async (t) => {
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
  const inspection = inspectComparativeNegativeControlEvidence(receipt);
  t.equal(inspection.valid, false);
  t.match(inspection.reason, /digest_mismatch|canonical/u);
  t.end();
});

test('negative-control matrix rejects mismatched live source revision',
  async (t) => {
    const calibrationArtifact = await calibrationFixture(
      'git-commit:different-source',
    );
    await t.rejects(
      evidenceFixture({calibrationArtifact}),
      /external_observation_required/u,
    );
    t.end();
  });

test('negative-control admission binds every live source identity',
  async (t) => {
    const evidence = await evidenceFixture();
    const attacks = [
      {
        name: 'pair',
        mutate(payload) {
          payload.pairId = 'forged-pair';
        },
      },
      {
        name: 'side',
        mutate(payload) {
          payload.sideIds = ['postgresql', 'lagrange'];
        },
      },
      {
        name: 'reason',
        mutate(payload) {
          payload.reasonCodes = [
            COMPARATIVE_NEGATIVE_CONTROL_REASON,
            'forged-reason',
          ];
        },
      },
      {
        name: 'control',
        mutate(payload) {
          payload.controlId = 'uniform-access';
        },
      },
      {
        name: 'oracle',
        mutate(payload) {
          payload.liveEvidence.oracle.passed = false;
        },
      },
    ];
    for (let index = 0; index < attacks.length; index += 1) {
      const attack = attacks[index];
      const receipt = rebuiltSourceReceipt(evidence, attack.mutate);
      t.equal(
        validateBenchmarkResourceEvidenceRoot(receipt).valid,
        true,
        `${attack.name} attack retains a valid generic C4 root`,
      );
      t.equal(
        inspectComparativeNegativeControlEvidence(receipt).valid,
        false,
        `${attack.name} attack is rejected by C5 admission`,
      );
    }
    t.end();
  });

test('negative-control admission requires the referenced live calibration',
  async (t) => {
    const evidence = await evidenceFixture();
    const receipt = rebuiltSourceReceipt(
      evidence,
      (payload) => {
        payload.calibrationDigest = evidence.price.digest;
      },
      {
        references: [
          evidence.price.digest,
          ...evidence.engagements[0].artifact.references.slice(1),
        ],
      },
    );
    t.equal(validateBenchmarkResourceEvidenceRoot(receipt).valid, true);
    const inspection = inspectComparativeNegativeControlEvidence(receipt);
    t.equal(inspection.valid, false);
    t.match(inspection.reason, /external_observation_required/u);
    t.end();
  });

test('negative-control calibration revision is bound to the evidence root',
  async (t) => {
    const evidence = await evidenceFixture();
    const receipt = relabeledRevisionReceipt(evidence);
    t.equal(validateBenchmarkResourceEvidenceRoot(receipt).valid, true);
    const inspection = inspectComparativeNegativeControlEvidence(receipt);
    t.equal(inspection.valid, false);
    t.match(inspection.reason, /external_observation_required/u);
    t.end();
  });

test('negative-control inspection resolves each artifact at most once',
  async (t) => {
    const evidence = await evidenceFixture();
    const calls = new Map();
    const resolver = evidence.receipt.resolver;
    const receipt = {
      rootDigest: evidence.root.digest,
      resolver: {
        resolve(digest) {
          const count = (calls.get(digest) || 0) + 1;
          calls.set(digest, count);
          if (count > 1) throw new Error('stateful resolver reread');
          return resolver.resolve(digest);
        },
      },
    };
    const inspection = inspectComparativeNegativeControlEvidence(receipt);
    t.equal(inspection.valid, true);
    for (const count of calls.values()) t.equal(count, 1);
    t.end();
  });

test('negative-control inspection never invokes a hostile error getter',
  async (t) => {
    let getterCalls = 0;
    const hostile = {};
    Object.defineProperty(hostile, 'message', {
      get() {
        getterCalls += 1;
        return 'attacker-controlled-message';
      },
    });
    const inspection = inspectComparativeNegativeControlEvidence({
      rootDigest:
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      resolver: {
        resolve() {
          throw hostile;
        },
      },
    });
    t.equal(inspection.valid, false);
    t.equal(getterCalls, 0);
    t.notMatch(inspection.reason, /attacker-controlled-message/u);
    t.end();
  });

test('negative-control source is joined to workload, topology, and window',
  async (t) => {
    const evidence = await evidenceFixture();
    const receipt = rebuiltSourceReceipt(evidence, (payload) => {
      payload.liveEvidence.startedAt = '2099-01-01T00:00:00.000Z';
      payload.liveEvidence.endedAt = '2099-01-01T00:00:01.000Z';
      payload.liveEvidence.alternative.sql = 'SELECT 999';
      payload.liveEvidence.alternative.stdout = '999';
      payload.liveEvidence.alternative.databaseContainerId = 'forged-database';
      payload.liveEvidence.alternative.clientContainerId = 'forged-client';
      payload.liveEvidence.oracle.name = 'forged-oracle';
    });
    t.equal(validateBenchmarkResourceEvidenceRoot(receipt).valid, true);
    const inspection = inspectComparativeNegativeControlEvidence(receipt);
    t.equal(inspection.valid, false);
    t.match(
      inspection.reason,
      /live_attempt_source_mismatch|external_observation_required/u,
    );
    t.end();
  });

test('negative-control resolver validates bytes before cloning', async (t) => {
  let valueOfCalls = 0;
  const hostile = {
    valueOf() {
      valueOfCalls += 1;
      return 1;
    },
  };
  const inspection = inspectComparativeNegativeControlEvidence({
    rootDigest:
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    resolver: {
      resolve() {
        return hostile;
      },
    },
  });
  t.equal(inspection.valid, false);
  t.equal(valueOfCalls, 0);
  t.end();
});

test('negative-control oracle ignores poisoned String intrinsics',
  async (t) => {
    const evidence = await evidenceFixture();
    const splitReceipt = rebuiltSourceReceipt(evidence, (payload) => {
      payload.liveEvidence.alternative.stdout = 'forged';
    });
    const splitDescriptor =
      Object.getOwnPropertyDescriptor(String.prototype, 'split');
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic test
    Object.defineProperty(String.prototype, 'split', {
      ...splitDescriptor,
      value: () => ['1'],
    });
    try {
      t.equal(
        inspectComparativeNegativeControlEvidence(splitReceipt).valid,
        false,
      );
      t.equal(
        evaluateComparativeNegativeControlOracle(
          COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS[0],
          'forged',
        ),
        false,
      );
    } finally {
      // eslint-disable-next-line no-extend-native -- restore tested intrinsic
      Object.defineProperty(String.prototype, 'split', splitDescriptor);
    }

    const indexReceipt = rebuiltSourceReceipt(
      evidence,
      (payload) => {
        payload.liveEvidence.alternative.stdout = '64';
      },
      {index: 4},
    );
    const indexDescriptor =
      Object.getOwnPropertyDescriptor(String.prototype, 'indexOf');
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic test
    Object.defineProperty(String.prototype, 'indexOf', {
      ...indexDescriptor,
      value: () => 0,
    });
    try {
      t.equal(
        inspectComparativeNegativeControlEvidence(indexReceipt).valid,
        false,
      );
      t.equal(
        evaluateComparativeNegativeControlOracle(
          COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS[4],
          '64',
        ),
        false,
      );
    } finally {
      // eslint-disable-next-line no-extend-native -- restore tested intrinsic
      Object.defineProperty(String.prototype, 'indexOf', indexDescriptor);
    }
    t.end();
  });

test('negative-control reason admission ignores poisoned Array includes',
  async (t) => {
    const poisoned = attempts();
    poisoned[0].reasonCodes = ['forged-reason'];
    const descriptor =
      Object.getOwnPropertyDescriptor(Array.prototype, 'includes');
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic test
    Object.defineProperty(Array.prototype, 'includes', {
      ...descriptor,
      value: () => true,
    });
    try {
      await t.rejects(
        evidenceFixture({attempts: poisoned}),
        /candidate_absence_reason_required/u,
      );
    } finally {
      // eslint-disable-next-line no-extend-native -- restore tested intrinsic
      Object.defineProperty(Array.prototype, 'includes', descriptor);
    }
    t.end();
  });
