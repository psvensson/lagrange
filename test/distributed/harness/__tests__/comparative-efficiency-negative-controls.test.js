import {test} from '../../../../src/test-helpers/tap.js';
import {
  createBenchmarkResourceMemoryResolver,
} from '../benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceNonMeasuringCellEvidence,
  validateBenchmarkResourceEvidenceRoot,
} from '../benchmark-resource-evidence-root.js';
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
import {
  comparativePostgresNonMeasuringInventorySides,
  createComparativePostgresCalibrationFixture,
  rebuildComparativeNonMeasuringSourceReceipt as rebuiltSourceReceipt,
} from './comparative-efficiency-postgres-nonmeasuring-test-fixture.js';

const SOURCE_REVISION = 'git-commit:c5-negative-control-fixture';
const PRODUCED_AT = '2026-07-27T20:00:00.000Z';
const VALID_UNTIL = '2026-07-28T20:00:00.000Z';
const SIDE_IDS = ['lagrange', 'postgresql'];

async function calibrationFixture(sourceRevision = SOURCE_REVISION) {
  return createComparativePostgresCalibrationFixture({
    sourceRevision,
    producedAt: PRODUCED_AT,
    fixtureName: 'negative-control',
  });
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
    inventorySides: comparativePostgresNonMeasuringInventorySides(),
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    calibrationArtifact,
    attempts: overrides.attempts || attempts(),
  });
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
      claimDisposition: 'non_measuring_candidate_not_engaged',
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
