import {test} from '../../../../src/test-helpers/tap.js';
import {
  COMPARATIVE_EVIDENCE_CLASS,
  COMPARATIVE_INVALIDATION_STATE,
  COMPARATIVE_MEASUREMENT_STATE,
  COMPARATIVE_PARITY_STATUS,
  COMPARATIVE_RESULT_DIRECTION,
  createComparativeEvidenceReport,
  validateComparativeEvidenceReport,
} from '../comparative-efficiency-evidence-contract.js';
import {
  SCALE_CERTIFICATION_RECEIPT_STATE,
  SCALE_EVIDENCE_FIDELITY,
  SCALE_GATE_STATUS,
  SCALE_PROFILE_ID,
  computeScaleEvidenceDigest,
} from '../scale-evidence-contract.js';

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

const DIGEST = Object.freeze({
  raw: digest('1'),
  matrix: digest('2'),
  topology: digest('3'),
  parity: digest('4'),
  registration: digest('5'),
  resources: digest('6'),
  price: digest('7'),
  logs: digest('8'),
  summary: digest('9'),
  inventory: digest('a'),
  environment: digest('b'),
  data: digest('c'),
  workload: digest('d'),
  order: digest('e'),
  topologyManifest: digest('f'),
});

function artifacts() {
  return [
    ['raw_samples', DIGEST.raw],
    ['matrix_manifest', DIGEST.matrix],
    ['alternative_topology', DIGEST.topology],
    ['parity_receipt', DIGEST.parity],
    ['preregistration', DIGEST.registration],
    ['resource_samples', DIGEST.resources],
    ['price_sheet', DIGEST.price],
    ['logs', DIGEST.logs],
    ['summary', DIGEST.summary],
    ['component_inventory', DIGEST.inventory],
  ].map(([kind, artifactDigest]) => ({
    kind,
    path: `test-output/comparative/${kind}.json`,
    digest: artifactDigest,
  }));
}

function gates() {
  return {
    feasibility: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST.raw,
      reasonCodes: [],
    },
    safety: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST.raw,
      violationCount: 0,
    },
    performance: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST.raw,
      baselineId: 'sealed-comparative-p0',
      offeredOperations: 1000,
      correctOperations: 990,
      p95LatencyMs: 12,
      p99LatencyMs: 18,
      errorRate: 0.01,
    },
    resources: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST.resources,
      maxHeapBytes: 10_000,
      maxRssBytes: 20_000,
      maxFileDescriptors: 20,
      maxEventLoopLagMs: 2,
      maxQueueDepth: 4,
      maxInFlight: 8,
      retryRate: 0.01,
      diskAmplification: 3,
      retainedRaftBytes: 30_000,
    },
    convergence: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST.raw,
      sampleCount: 10,
      passRate: 1,
      confidenceInterval: {lower: 0.72, upper: 1},
      p50Ms: 100,
      p95Ms: 180,
    },
  };
}

function scaleInput() {
  const declaredArtifacts = artifacts();
  return {
    profile: {id: SCALE_PROFILE_ID.DEVELOPMENT, version: 1},
    run: {
      id: 'comparative-p0-run-1',
      startedAt: '2026-07-26T10:00:00.000Z',
      completedAt: '2026-07-26T10:10:00.000Z',
      fidelity: SCALE_EVIDENCE_FIDELITY.DETERMINISTIC_GUARD,
    },
    software: {
      revision: 'a09d887d',
      runtime: 'node-v22',
      packageVersion: '0.1.0',
    },
    hardware: {
      provider: 'local',
      region: 'local',
      instanceClass: 'comparative-fixture',
      cpuCount: 8,
      memoryBytes: 16_000_000_000,
      storageClass: 'local-ssd',
    },
    topology: {
      nodeCount: 7,
      failureDomainCount: 1,
      tableCount: 2,
      partitionCount: 16,
      replicaCount: 48,
      manifestDigest: DIGEST.topologyManifest,
    },
    data: {
      logicalBytes: 1_000_000,
      physicalBytes: 3_000_000,
      manifestDigest: DIGEST.data,
      shape: 'uniform-comparative-fixture',
    },
    workload: {
      id: 'request-enrichment-v1',
      manifestDigest: DIGEST.workload,
      duration: {warmupMs: 10_000, measuredMs: 60_000},
    },
    gates: gates(),
    provenance: {
      producer: 'comparative-evidence-contract-test',
      invocation: 'comparative-evidence-contract guard',
      environmentDigest: DIGEST.environment,
      artifactManifestDigest: computeScaleEvidenceDigest(declaredArtifacts),
    },
    artifacts: declaredArtifacts,
    certification: {
      receiptState: SCALE_CERTIFICATION_RECEIPT_STATE.ABSENT,
    },
    extensions: {},
  };
}

function comparativeInput(direction = COMPARATIVE_RESULT_DIRECTION.WIN) {
  return {
    matrix: {
      id: 'request-enrichment-initial-v1',
      cellId: 'size-1m-fanout-5-locality-80-skew-20',
      manifestDigest: DIGEST.matrix,
    },
    pair: {
      id: 'pair-001',
      lagrangeSideId: 'lagrange',
      alternativeSideId: 'postgresql',
      blockedOrderIndex: 0,
      randomizedOrderDigest: DIGEST.order,
    },
    migration: {
      state: 'origin',
    },
    alternative: {
      id: 'postgresql-18',
      name: 'PostgreSQL',
      version: '18',
      availabilityScope: 'single-region-three-zone',
      topologyInventoryDigest: DIGEST.topology,
      components: [
        {id: 'postgres-primary', role: 'database', included: true},
        {id: 'load-generator', role: 'client', included: true},
      ],
    },
    parity: {
      status: COMPARATIVE_PARITY_STATUS.PASS,
      receiptDigest: DIGEST.parity,
      resultSet: COMPARATIVE_PARITY_STATUS.PASS,
      ordering: COMPARATIVE_PARITY_STATUS.PASS,
      errorBehavior: COMPARATIVE_PARITY_STATUS.PASS,
      transaction: COMPARATIVE_PARITY_STATUS.PASS,
      durability: COMPARATIVE_PARITY_STATUS.PASS,
    },
    preregistration: {
      manifestDigest: DIGEST.registration,
      offeredLoadScheduleDigest: DIGEST.order,
      minRepetitions: 5,
      maxRepetitions: 20,
      estimator: 'paired-median-ratio',
      confidenceLevel: 0.95,
      practicalSignificanceThreshold: 0.05,
      stoppingRule: 'ci-width-or-max-n',
      multipleComparisonTreatment: 'holm',
      tailSampleMinimum: 1000,
      cachePolicy: 'blocked-warm-and-cold',
    },
    measurement: {
      state: COMPARATIVE_MEASUREMENT_STATE.MEASURED,
      reasonCodes: [],
      counts: {
        offered: 1000,
        dispatched: 995,
        correct: 990,
        rejected: 1,
        timedOut: 2,
        errored: 2,
        queueOverflow: 5,
      },
      statistics: {
        sampleCount: 10,
        estimate: direction === COMPARATIVE_RESULT_DIRECTION.LOSS ? 0.8 : 1.2,
        lower: direction === COMPARATIVE_RESULT_DIRECTION.LOSS ? 0.7 : 1.1,
        upper: direction === COMPARATIVE_RESULT_DIRECTION.LOSS ? 0.9 : 1.3,
        unit: 'correct_ops_ratio',
      },
    },
    accounting: {
      complete: true,
      componentInventoryDigest: DIGEST.inventory,
      resourceSamplesDigest: DIGEST.resources,
      provisionedCpuSeconds: 800,
      utilizedCpuSeconds: 500,
      memoryByteSeconds: 2_000_000,
      storageByteSeconds: 4_000_000,
      iops: 20_000,
      networkBytes: 8_000_000,
      costPerMillionCorrectOperations: 4.2,
    },
    price: {
      sheetDigest: DIGEST.price,
      region: 'local',
      currency: 'USD',
      priceDate: '2026-07-26',
      billingGranularity: 'second',
      reservations: 'none',
      spot: 'excluded',
      taxes: 'excluded',
      credits: 'excluded',
      exclusions: 'human-operations',
    },
    artifacts: {
      matrixManifestDigest: DIGEST.matrix,
      alternativeTopologyDigest: DIGEST.topology,
      parityReceiptDigest: DIGEST.parity,
      preregistrationDigest: DIGEST.registration,
      rawSamplesDigest: DIGEST.raw,
      componentInventoryDigest: DIGEST.inventory,
      resourceSamplesDigest: DIGEST.resources,
      priceSheetDigest: DIGEST.price,
      logsDigest: DIGEST.logs,
      summaryDigest: DIGEST.summary,
    },
    result: {
      direction,
      ratio: direction === COMPARATIVE_RESULT_DIRECTION.LOSS ? 0.8 : 1.2,
      practicalClassification: direction,
    },
    claim: {
      evidenceClass: COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
      reasonCodes: ['deterministic_guard_only'],
    },
    invalidation: {
      state: COMPARATIVE_INVALIDATION_STATE.CURRENT,
      reasonCodes: [],
    },
  };
}

test('complete win, neutral, and loss fixtures are equally valid', (t) => {
  for (const direction of [
    COMPARATIVE_RESULT_DIRECTION.WIN,
    COMPARATIVE_RESULT_DIRECTION.NEUTRAL,
    COMPARATIVE_RESULT_DIRECTION.LOSS,
  ]) {
    const report = createComparativeEvidenceReport(
      scaleInput(),
      comparativeInput(direction),
    );
    t.equal(validateComparativeEvidenceReport(report).valid, true, direction);
    t.equal(
      report.extensions.comparativeEfficiency.result.direction,
      direction,
    );
  }
  t.end();
});

test('comparative extension preserves the shared profile identity', (t) => {
  const first = createComparativeEvidenceReport(
    scaleInput(),
    comparativeInput(COMPARATIVE_RESULT_DIRECTION.WIN),
  );
  const secondInput = comparativeInput(COMPARATIVE_RESULT_DIRECTION.LOSS);
  secondInput.pair = {
    ...secondInput.pair,
    id: 'pair-002',
    blockedOrderIndex: 1,
  };
  const second = createComparativeEvidenceReport(scaleInput(), secondInput);

  t.equal(first.profileIdentity, second.profileIdentity);
  t.not(
    first.extensions.comparativeEfficiency.pairIdentity,
    second.extensions.comparativeEfficiency.pairIdentity,
  );
  t.not(first.reportIdentity, second.reportIdentity);
  t.end();
});

test('measured evidence rejects incomplete semantic parity', (t) => {
  const input = comparativeInput();
  input.parity.status = COMPARATIVE_PARITY_STATUS.FAIL;
  input.parity.ordering = COMPARATIVE_PARITY_STATUS.FAIL;
  t.throws(
    () => createComparativeEvidenceReport(scaleInput(), input),
    /measured_requires_complete_parity/u,
  );
  t.end();
});

test('aggregate parity pass cannot hide an unmeasured dimension', (t) => {
  const input = comparativeInput();
  input.parity.ordering = COMPARATIVE_PARITY_STATUS.NOT_MEASURED;
  t.throws(
    () => createComparativeEvidenceReport(scaleInput(), input),
    /measured_requires_complete_parity/u,
  );
  t.end();
});

test('explicit non-measuring parity failure is valid and direction-neutral', (t) => {
  const input = comparativeInput();
  input.parity.status = COMPARATIVE_PARITY_STATUS.FAIL;
  input.parity.ordering = COMPARATIVE_PARITY_STATUS.FAIL;
  input.measurement = {
    state: COMPARATIVE_MEASUREMENT_STATE.NON_MEASURING,
    reasonCodes: ['ordering_semantics_mismatch'],
  };
  input.result = {
    direction: COMPARATIVE_RESULT_DIRECTION.NO_RESULT,
    ratio: 0,
    practicalClassification: 'not_comparable',
  };
  const report = createComparativeEvidenceReport(scaleInput(), input);

  t.equal(validateComparativeEvidenceReport(report).valid, true);
  t.equal(
    report.extensions.comparativeEfficiency.measurement.state,
    COMPARATIVE_MEASUREMENT_STATE.NON_MEASURING,
  );
  t.end();
});

test('non-measuring evidence cannot promote a comparative claim', (t) => {
  const input = comparativeInput();
  input.parity.status = COMPARATIVE_PARITY_STATUS.FAIL;
  input.measurement = {
    state: COMPARATIVE_MEASUREMENT_STATE.NON_MEASURING,
    reasonCodes: ['semantic_parity_failed'],
  };
  input.result = {
    direction: COMPARATIVE_RESULT_DIRECTION.NO_RESULT,
    ratio: 0,
    practicalClassification: 'not_comparable',
  };
  input.claim.evidenceClass = COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0;
  t.throws(
    () => createComparativeEvidenceReport(scaleInput(), input),
    /ineligible_requires_no_claim/u,
  );
  t.end();
});

test('origin schema variant rejects nullable migration fields', (t) => {
  const input = comparativeInput();
  input.migration.fromSchemaVersion = null;
  t.throws(
    () => createComparativeEvidenceReport(scaleInput(), input),
    /fromSchemaVersion:forbidden_for_origin/u,
  );
  t.end();
});

test('deterministic P0 cannot self-promote its evidence class', (t) => {
  for (const evidenceClass of [
    COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0,
    COMPARATIVE_EVIDENCE_CLASS.CERTIFIED_PROFILE,
  ]) {
    const input = comparativeInput();
    input.claim.evidenceClass = evidenceClass;
    t.throws(
      () => createComparativeEvidenceReport(scaleInput(), input),
      /requires_(?:live_p0|scale_receipt)/u,
      evidenceClass,
    );
  }
  t.end();
});

test('measured P0 requires live fidelity and every shared scale gate green',
  (t) => {
    const liveInput = scaleInput();
    liveInput.run.fidelity = SCALE_EVIDENCE_FIDELITY.LIVE;
    const comparative = comparativeInput();
    comparative.claim = {
      evidenceClass: COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0,
      reasonCodes: [],
    };
    const valid = createComparativeEvidenceReport(liveInput, comparative);
    t.equal(validateComparativeEvidenceReport(valid).valid, true);

    for (const status of [
      SCALE_GATE_STATUS.FAIL,
      SCALE_GATE_STATUS.NOT_MEASURED,
    ]) {
      const gatedInput = scaleInput();
      gatedInput.run.fidelity = SCALE_EVIDENCE_FIDELITY.LIVE;
      gatedInput.gates.safety.status = status;
      t.throws(
        () => createComparativeEvidenceReport(gatedInput, comparative),
        /measured_p0_requires_green_scale_gates/u,
        status,
      );
    }
    const contradictorySafety = scaleInput();
    contradictorySafety.run.fidelity = SCALE_EVIDENCE_FIDELITY.LIVE;
    contradictorySafety.gates.safety.violationCount = 1;
    t.throws(
      () => createComparativeEvidenceReport(
        contradictorySafety,
        comparative,
      ),
      /gates\.safety\.violationCount:pass_requires_zero/u,
    );

    const contradictoryFeasibility = scaleInput();
    contradictoryFeasibility.run.fidelity = SCALE_EVIDENCE_FIDELITY.LIVE;
    contradictoryFeasibility.gates.feasibility.reasonCodes = [
      'insufficient_capacity',
    ];
    t.throws(
      () => createComparativeEvidenceReport(
        contradictoryFeasibility,
        comparative,
      ),
      /gates\.feasibility\.reasonCodes:pass_requires_empty/u,
    );
    t.end();
  });

test('all comparative artifact identities must resolve to shared artifacts',
  (t) => {
    const input = comparativeInput();
    input.artifacts.priceSheetDigest = digest('0');
    t.throws(
      () => createComparativeEvidenceReport(scaleInput(), input),
      /priceSheetDigest:artifact_not_found/u,
    );
    t.end();
  });

test('price and repetition contracts reject incomplete or reversed inputs',
  (t) => {
    const input = comparativeInput();
    delete input.price.currency;
    input.preregistration.minRepetitions = 21;
    t.throws(
      () => createComparativeEvidenceReport(scaleInput(), input),
      /repetitions:reversed.*price\.currency:required/u,
    );
    t.end();
  });

test('tampering a sealed matrix invalidates base and comparative identities',
  (t) => {
    const report = createComparativeEvidenceReport(
      scaleInput(),
      comparativeInput(),
    );
    report.extensions.comparativeEfficiency.matrix.cellId = 'selected-win-only';
    const result = validateComparativeEvidenceReport(report);

    t.equal(result.valid, false);
    t.ok(result.errors.includes('scale.reportIdentity:mismatch'));
    t.ok(result.errors.includes('comparative.matrixIdentity:mismatch'));
    t.end();
  });

test('correct operations cannot exceed dispatched operations', (t) => {
  const input = comparativeInput();
  input.measurement.counts.dispatched = 900;
  t.throws(
    () => createComparativeEvidenceReport(scaleInput(), input),
    /correct:exceeds_dispatched/u,
  );
  t.end();
});
