import {test} from '../../../../src/test-helpers/tap.js';
import {
  replacePrototypeProperty,
  withHostileIntrinsics,
} from '../../../helpers/hostile-intrinsics.js';
import {
  normalizeComparativePostgresOutput,
} from
  '../../../../scripts/checks/comparative-efficiency-postgres-nonmeasuring-live.js';
import {
  validateBenchmarkResourceEvidenceRoot,
} from '../benchmark-resource-evidence-root.js';
import {
  comparativePostgresNonMeasuringInventorySides,
  createComparativePostgresCalibrationFixture,
  exerciseComparativeNonMeasuringHostileIntrinsics,
  rebuildComparativeNonMeasuringSourceReceipt as rebuiltSourceReceipt,
} from './comparative-efficiency-postgres-nonmeasuring-test-fixture.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from '../benchmark-resource-price-sheet-p0-constants.js';
import {
  buildComparativeChangeRateCrossoverPolicyWitness,
} from '../comparative-efficiency-change-rate-crossover-policy-witness.js';
import {
  evaluateComparativeChangeRateCrossoverOracle,
} from '../comparative-efficiency-change-rate-crossover-admission.js';
import {
  COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON,
  comparativeChangeRateCrossoverMutationCount,
  comparativeChangeRateCrossoverEvidenceDigest,
  comparativeChangeRateCrossoverExpectedResult,
  comparativeChangeRateCrossoverSql,
  createComparativeChangeRateCrossoverEvidence,
  inspectComparativeChangeRateCrossoverEvidence,
} from '../comparative-efficiency-change-rate-crossover.js';

const SOURCE_REVISION = 'git-commit:c6-change-rate-crossover-fixture';
const PRODUCED_AT = '2026-07-28T00:00:00.000Z';
const VALID_UNTIL = '2026-07-29T00:00:00.000Z';
const SIDE_IDS = ['lagrange', 'postgresql'];

async function calibrationFixture(sourceRevision = SOURCE_REVISION) {
  return createComparativePostgresCalibrationFixture({
    sourceRevision,
    producedAt: PRODUCED_AT,
    fixtureName: 'change-rate-crossover',
  });
}

function workloadCells() {
  return COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.map((cell) => ({
    datasetSize: cell.datasetSize,
    mutationRate: cell.mutationRate,
    mutationDivisor: cell.mutationDivisor,
    workloadDiversity: cell.workloadDiversity,
    diversityCount: cell.diversityCount,
    skew: cell.skew,
    policy: cell.policy,
    requestCount: cell.requestCount,
    alternativeSql: comparativeChangeRateCrossoverSql(cell),
    oracleName: 'row_count_sum_and_diversity_exact',
    oracleExpected: comparativeChangeRateCrossoverExpectedResult(cell),
  }));
}

function attempts() {
  return COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.map((cell, index) => ({
    matrixCellIndex: index,
    runId: `change-rate-crossover-${index}`,
    candidateEngaged: false,
    alternativeEngaged: true,
    reasonCodes: [COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON],
    liveEvidence: {
      version: 'comparative-change-rate-crossover-live-evidence-v1',
      matrixCellIndex: index,
      startedAt: `2026-07-28T00:00:${String(index).padStart(2, '0')}.000Z`,
      endedAt: `2026-07-28T00:00:${String(index + 20).padStart(2, '0')}.000Z`,
      candidate: {
        architectureId: 'lagrange',
        capacityAdapterEngaged: false,
        reason: 'no claim-eligible change-rate-crossover capacity adapter',
        policyWitness:
          buildComparativeChangeRateCrossoverPolicyWitness(cell),
      },
      alternative: {
        architectureId: 'postgresql',
        engaged: true,
        image: 'postgres:16',
        imageId: 'sha256:fixture-image',
        databaseContainerId: 'postgresql-container',
        clientContainerId: 'client-container',
        sql: comparativeChangeRateCrossoverSql(cell),
        stdout: comparativeChangeRateCrossoverExpectedResult(cell),
      },
      oracle: {
        name: 'row_count_sum_and_diversity_exact',
        expected: comparativeChangeRateCrossoverExpectedResult(cell),
        passed: true,
      },
      measurementDisposition: {
        state: 'non_measuring',
        capacityConfidenceInterval: 'absent',
        wholeTopologyResourceBreakdown: 'absent',
        infrastructureCostProjection: 'absent',
        practicalEffectClassification: 'not_evaluable',
        crossoverClassification: 'not_evaluable',
      },
    },
  }));
}

async function evidenceInput(overrides = {}) {
  const calibrationArtifact =
    overrides.calibrationArtifact || await calibrationFixture();
  return {
    matrixId: 'comparative-change-rate-crossover-p0-v1',
    pairId: 'lagrange-postgresql-change-rate-crossover-v1',
    sideIds: SIDE_IDS,
    sourceRevision: SOURCE_REVISION,
    producedAt: PRODUCED_AT,
    validUntil: VALID_UNTIL,
    workloadManifest: {
      version: 'comparative-change-rate-crossover-workloads-v1',
      cells: workloadCells(),
      selectionPolicy: 'complete_cartesian_matrix',
    },
    alternativeTopology: {
      version: 'comparative-change-rate-crossover-topology-v1',
      candidate: {
        architectureId: 'lagrange',
        required: true,
        capacityAdapterEngaged: false,
        reason: 'no claim-eligible change-rate-crossover capacity adapter',
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
      version: 'comparative-change-rate-crossover-preregistration-v1',
      axes: COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
      sideIds: SIDE_IDS,
      outcomePolicy: 'direction_neutral',
      invalidCellPolicy: 'publish_explicit_non_measuring',
      candidateEngagementRequired: true,
      policyOwnerIds: COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
      requiredEvidence: [
        'paired_capacity',
        'whole_topology_resource_windows',
        'capacity_uncertainty',
        'capacity_practical_effect',
        'cost_practical_effect',
        'crossover_classification',
        'immutable_raw_artifacts',
      ],
    },
    inventoryId: 'comparative-change-rate-crossover-inventory-v1',
    inventorySides: comparativePostgresNonMeasuringInventorySides(),
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    calibrationArtifact,
    attempts: overrides.attempts || attempts(),
  };
}

async function evidenceFixture(overrides = {}) {
  return createComparativeChangeRateCrossoverEvidence(
    await evidenceInput(overrides),
  );
}

test('change-rate-crossover publishes the complete matrix without a claim',
  async (t) => {
    const evidence = await evidenceFixture();
    t.same(inspectComparativeChangeRateCrossoverEvidence(evidence.receipt), {
      valid: true,
      reason: 'valid',
      complete: true,
      claimEligible: false,
      claimDisposition: 'non_measuring_crossover_not_evaluable',
      measuringCellCount: 0,
      nonMeasuringCellCount: 32,
      alternativeOraclePassCount: 32,
      policyWitnessCount: 32,
      matrixId: 'comparative-change-rate-crossover-p0-v1',
      matrixDigest: evidence.matrix.digest,
      rootDigest: evidence.root.digest,
    });
    t.equal(evidence.cells.length, 32);
    t.match(
      comparativeChangeRateCrossoverEvidenceDigest(evidence),
      /^sha256:[0-9a-f]{64}$/u,
    );
    t.end();
  });

test('change-rate-crossover rejects selective matrix omission', async (t) => {
  await t.rejects(
    evidenceFixture({attempts: attempts().slice(0, 31)}),
    /attempts:exact_matrix_required/u,
  );
  t.end();
});

test('change-rate-crossover rejects reordered matrix results', async (t) => {
  const reordered = attempts();
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  await t.rejects(
    evidenceFixture({attempts: reordered}),
    /matrix_cell_order_mismatch/u,
  );
  t.end();
});

test('change-rate-crossover rejects surrogate candidate capacity', async (t) => {
  const surrogate = attempts();
  surrogate[0].candidateEngaged = true;
  await t.rejects(
    evidenceFixture({attempts: surrogate}),
    /candidate_must_be_absent/u,
  );
  t.end();
});

test('change-rate-crossover requires the alternative live attempt', async (t) => {
  const disconnected = attempts();
  disconnected[0].alternativeEngaged = false;
  await t.rejects(
    evidenceFixture({attempts: disconnected}),
    /alternative_must_be_engaged/u,
  );
  t.end();
});

test('change-rate-crossover requires explicit capacity absence', async (t) => {
  const unexplained = attempts();
  unexplained[0].reasonCodes = ['unknown'];
  await t.rejects(
    evidenceFixture({attempts: unexplained}),
    /candidate_absence_reason_required/u,
  );
  t.end();
});

test('change-rate-crossover policy witnesses bind every swept owner', (t) => {
  for (let index = 0;
    index < COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS[index];
    const witness = buildComparativeChangeRateCrossoverPolicyWitness(cell);
    t.equal(
      witness.mutationSchedule.mutationCount,
      comparativeChangeRateCrossoverMutationCount(cell),
    );
    t.equal(
      witness.workloadDiversity.groupCount,
      cell.diversityCount,
    );
    t.equal(witness.accessSkew.id, cell.skew);
    t.equal(witness.recomputationMaterializationPolicy.id, cell.policy);
  }
  t.end();
});

test('change-rate-crossover alternative oracles bind every cell', (t) => {
  for (let index = 0;
    index < COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS[index];
    const expected = comparativeChangeRateCrossoverExpectedResult(cell);
    t.equal(evaluateComparativeChangeRateCrossoverOracle(cell, expected), true);
    t.equal(
      evaluateComparativeChangeRateCrossoverOracle(cell, `${expected}0`),
      false,
    );
  }
  t.end();
});

test('change-rate-crossover rejects a rebuilt policy-owner witness',
  async (t) => {
    const evidence = await evidenceFixture();
    const receipt = rebuiltSourceReceipt(evidence, (payload) => {
      payload.liveEvidence.candidate.policyWitness.mutationSchedule
        .mutationCount += 1;
    });
    t.equal(validateBenchmarkResourceEvidenceRoot(receipt).valid, true);
    t.equal(inspectComparativeChangeRateCrossoverEvidence(receipt).valid, false);
    t.end();
  });

test('change-rate-crossover rejects rebuilt SQL and oracle output',
  async (t) => {
    const evidence = await evidenceFixture();
    const receipt = rebuiltSourceReceipt(evidence, (payload) => {
      payload.liveEvidence.alternative.sql = 'SELECT 1';
      payload.liveEvidence.alternative.stdout = '128|1';
      payload.liveEvidence.oracle.expected = '128|1';
    });
    t.equal(validateBenchmarkResourceEvidenceRoot(receipt).valid, true);
    t.equal(inspectComparativeChangeRateCrossoverEvidence(receipt).valid, false);
    t.end();
  });

test('change-rate-crossover rejects fabricated measurement fields',
  async (t) => {
    const evidence = await evidenceFixture();
    const receipt = rebuiltSourceReceipt(evidence, (payload) => {
      payload.liveEvidence.measurementDisposition
        .capacityConfidenceInterval = '[1,2]';
    });
    t.equal(validateBenchmarkResourceEvidenceRoot(receipt).valid, true);
    t.equal(inspectComparativeChangeRateCrossoverEvidence(receipt).valid, false);
    t.end();
  });

test('change-rate-crossover snapshots evidence before caller mutation',
  async (t) => {
    const input = await evidenceInput();
    const evidence = createComparativeChangeRateCrossoverEvidence(input);
    input.attempts[0].liveEvidence.oracle.passed = false;
    input.attempts[0].liveEvidence.alternative.stdout = 'forged';
    const inspection =
      inspectComparativeChangeRateCrossoverEvidence(evidence.receipt);
    t.equal(inspection.valid, true);
    t.equal(inspection.alternativeOraclePassCount, 32);
    t.end();
  });

test('change-rate-crossover rejects receipt accessors without invoking them',
  (t) => {
    let getterCalls = 0;
    const receipt = {
      get rootDigest() {
        getterCalls += 1;
        return 'sha256:forged';
      },
      resolver: {resolve() {}},
    };
    const inspection = inspectComparativeChangeRateCrossoverEvidence(receipt);
    t.equal(inspection.valid, false);
    t.equal(getterCalls, 0);
    t.end();
  });

test('change-rate-crossover rejects proxy receipts', (t) => {
  const receipt = new Proxy({}, {
    get() {
      throw new Error('proxy trap must not establish evidence');
    },
  });
  const inspection = inspectComparativeChangeRateCrossoverEvidence(receipt);
  t.equal(inspection.valid, false);
  t.end();
});

test('change-rate-crossover calibration revision is root-bound', async (t) => {
  const calibrationArtifact =
    await calibrationFixture('git-commit:different-source');
  await t.rejects(
    evidenceFixture({calibrationArtifact}),
    /external_observation_required/u,
  );
  t.end();
});

test('change-rate-crossover root rejects tampered raw live bytes', async (t) => {
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
  const inspection = inspectComparativeChangeRateCrossoverEvidence(receipt);
  t.equal(inspection.valid, false);
  t.match(inspection.reason, /digest_mismatch|canonical/u);
  t.end();
});

test('change-rate-crossover validates resolver bytes before cloning', (t) => {
  let valueOfCalls = 0;
  const hostile = {
    valueOf() {
      valueOfCalls += 1;
      return 1;
    },
  };
  const inspection = inspectComparativeChangeRateCrossoverEvidence({
    rootDigest:
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    resolver: {resolve: () => hostile},
  });
  t.equal(inspection.valid, false);
  t.equal(valueOfCalls, 0);
  t.end();
});

test('change-rate-crossover ignores poisoned String trim', (t) => {
  const cell = COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS[0];
  const expected = comparativeChangeRateCrossoverExpectedResult(cell);
  withHostileIntrinsics([
    replacePrototypeProperty(
      String.prototype,
      'trim',
      () => 'forged',
    ),
  ], () => {
    t.equal(evaluateComparativeChangeRateCrossoverOracle(cell, expected), true);
    t.equal(evaluateComparativeChangeRateCrossoverOracle(cell, 'forged'), false);
  });
  t.end();
});

test('shared PostgreSQL output normalization ignores poisoned String trim',
  (t) => {
    let normalized;
    withHostileIntrinsics([
      replacePrototypeProperty(
        String.prototype,
        'trim',
        () => 'forged-postgresql-output',
      ),
    ], () => {
      normalized = normalizeComparativePostgresOutput(
        '  externally observed PostgreSQL output  \n',
      );
    });
    t.equal(normalized, 'externally observed PostgreSQL output');
    t.end();
  });

test('change-rate-crossover admission ignores mutable owner intrinsics',
  async (t) => {
    const input = await evidenceInput();
    const evidence = createComparativeChangeRateCrossoverEvidence(input);
    const {
      calls,
      inspection,
      produced,
      witness,
    } = exerciseComparativeNonMeasuringHostileIntrinsics({
      input,
      evidence,
      firstCell: COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS[0],
      buildWitness: buildComparativeChangeRateCrossoverPolicyWitness,
      createEvidence: createComparativeChangeRateCrossoverEvidence,
      inspectEvidence: inspectComparativeChangeRateCrossoverEvidence,
    });
    t.equal(
      witness.version,
      'comparative-change-rate-crossover-policy-witness-v1',
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
