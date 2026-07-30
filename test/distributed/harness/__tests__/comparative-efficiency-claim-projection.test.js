import {readFileSync} from 'node:fs';
import {test} from '../../../../src/test-helpers/tap.js';
import * as claimEvidenceView from
  '../benchmark-resource-claim-evidence-view.js';
import {
  COMPARATIVE_EVIDENCE_CLASS,
} from '../comparative-efficiency-evidence-contract.js';
import {
  COMPARATIVE_CLAIM_CERTIFICATION_STATE,
  COMPARATIVE_CLAIM_EFFECT_OUTCOME,
  COMPARATIVE_CLAIM_METRIC,
  COMPARATIVE_CLAIM_REASON,
} from '../comparative-efficiency-claim-projection-constants.js';
import {
  classifyComparativeEfficiencyClaimEffect,
  projectComparativeEfficiencyClaims,
} from '../comparative-efficiency-claim-projection.js';
import {
  renderComparativeEfficiencyClaimTable,
  validateComparativeEfficiencyClaimTable,
} from '../comparative-efficiency-claim-table.js';
import {
  BENCHMARK_RESOURCE_NO_CURRENCY,
  createBenchmarkResourcePairedEffect,
} from '../benchmark-resource-cost-and-effects.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_EFFECT,
} from '../benchmark-resource-contract-constants.js';
import {
  createBenchmarkResourceArtifact,
} from '../benchmark-resource-evidence-data.js';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE,
  BENCHMARK_RESOURCE_MEASUREMENT_REASON,
} from '../benchmark-resource-measurement-outcome.js';
import {
  acceptBenchmarkResourceClaimEvidenceRoot,
  validateBenchmarkResourceEvidenceRoot,
} from '../benchmark-resource-evidence-root.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from '../benchmark-resource-live-observation-authority.js';
import {
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from '../benchmark-capacity-window-receipt.js';
import {
  SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
  SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
  SCALE_EVIDENCE_CONTRACT_ID,
  SCALE_EVIDENCE_SCHEMA_VERSION,
  SCALE_PROFILE_ID,
  computeScaleCertificationReceiptDigest,
  computeScaleProfileIdentity,
} from '../scale-evidence-contract.js';
import {
  createBenchmarkResourceEvidenceFixture,
} from './benchmark-resource-evidence-test-fixture.js';
import {
  artifactFixtureReport,
  preregistrationInput,
} from './benchmark-capacity-protocol-test-fixture.js';
import {
  createBenchmarkCapacityHeterogeneousEvidenceFixture,
} from './benchmark-capacity-heterogeneous-evidence-test-fixture.js';
import {
  FIXTURE_RESOURCE_MATRIX_ID,
  FIXTURE_RESOURCE_PAIR_ID,
  FIXTURE_RESOURCE_RUN_ID,
  FIXTURE_RESOURCE_SIDE_IDS,
  FIXTURE_RESOURCE_SOURCE_REVISION,
  FIXTURE_RESOURCE_VALID_UNTIL,
} from './benchmark-resource-evidence-test-fixture-constants.js';

const EVALUATED_AT = '2026-07-27T12:30:00.000Z';
const RECEIPT_ISSUED_AT = '2026-07-27T12:00:00.000Z';
const RECEIPT_VALID_UNTIL = '2026-07-27T13:00:00.000Z';
const CERTIFICATION_QUEST = 'scale-integration-profile-certification';
const CAPACITY_WINDOW_EPOCH =
  Date.parse('2026-07-27T10:00:00.000Z');
const COST_NEUTRAL_CANDIDATE_END_MULTIPLIER = 6.745928338762216;
const calibrationFixtureCache = new Map();
const capacityProtocolFixtureCache = new Map();
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectDefineProperty = Reflect.defineProperty;
const observationScalar = Object.freeze({
  BLOCK_READ_BYTES: 3_000,
  BLOCK_READ_OPERATIONS: 3,
  BLOCK_WRITE_BYTES: 4_000,
  BLOCK_WRITE_OPERATIONS: 4,
  CPU_LIMIT_NANO_CPUS: 1_000_000_000,
  CPU_PERCENT: 10,
  CPU_USAGE_NANOSECONDS: 10_000,
  MEMORY_LIMIT_BYTES: 1_000_000,
  MEMORY_USAGE_BYTES: 100_000,
  PIDS: 5,
  RX_BYTES: 1_000,
  STORAGE_LIMIT_BYTES: 5_000_000,
  STORAGE_USAGE_BYTES: 10_000,
  TX_BYTES: 2_000,
});

function replaceProperty(owner, key, value) {
  const descriptor = objectGetOwnPropertyDescriptor(owner, key);
  reflectDefineProperty(owner, key, {
    configurable: true,
    writable: true,
    value,
  });
  return () => reflectDefineProperty(owner, key, descriptor);
}

function resourceStats(timestamp, multiplier, provisionedMultiplier) {
  return {
    timestamp,
    cpuPercent: observationScalar.CPU_PERCENT * multiplier,
    cpuUsageNanoseconds:
      observationScalar.CPU_USAGE_NANOSECONDS * multiplier,
    memoryUsageBytes:
      observationScalar.MEMORY_USAGE_BYTES * multiplier,
    memoryLimitBytes:
      observationScalar.MEMORY_LIMIT_BYTES * provisionedMultiplier,
    cpuLimitNanoCpus:
      observationScalar.CPU_LIMIT_NANO_CPUS * provisionedMultiplier,
    storageLimitBytes:
      observationScalar.STORAGE_LIMIT_BYTES * provisionedMultiplier,
    pids: observationScalar.PIDS,
    rxBytes: observationScalar.RX_BYTES * multiplier,
    txBytes: observationScalar.TX_BYTES * multiplier,
    blockReadBytes: observationScalar.BLOCK_READ_BYTES * multiplier,
    blockWriteBytes: observationScalar.BLOCK_WRITE_BYTES * multiplier,
    blockReadOperations:
      observationScalar.BLOCK_READ_OPERATIONS * multiplier,
    blockWriteOperations:
      observationScalar.BLOCK_WRITE_OPERATIONS * multiplier,
    storageUsageBytes:
      observationScalar.STORAGE_USAGE_BYTES * multiplier,
  };
}

function observationComponents() {
  const components = [];
  for (let index = 0; index < FIXTURE_RESOURCE_SIDE_IDS.length; index += 1) {
    const sideId = FIXTURE_RESOURCE_SIDE_IDS[index];
    components.push({
      componentId: `${sideId}-database`,
      sideId,
      containerId: `${sideId}-database-container`,
      storagePath: `/var/lib/${sideId}`,
    });
    components.push({
      componentId: `${sideId}-client`,
      sideId,
      containerId: `${sideId}-client-container`,
      storagePath: `/tmp/${sideId}`,
    });
  }
  return components;
}

async function liveCalibrationFixture({
  candidateEndMultiplier = 9,
  candidateProvisionedMultiplier = 2,
  startedAt = Date.parse('2026-07-27T11:59:00.000Z'),
  endedAt = Date.parse('2026-07-27T12:00:00.000Z'),
} = {}) {
  const cacheKey = JSON.stringify({
    candidateEndMultiplier,
    candidateProvisionedMultiplier,
    startedAt,
    endedAt,
  });
  const cached = calibrationFixtureCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const networkId = 'claim-projection-fixture-network';
  const componentCount = FIXTURE_RESOURCE_SIDE_IDS.length * 2;
  let calls = 0;
  let cleaned = false;
  const provider = {
    async inspectContainer() {
      return {State: {Running: true}};
    },
    async inspectContainerIfExists() {
      return cleaned ? null : {State: {Running: true}};
    },
    async getContainerResourceSnapshot(containerId) {
      calls += 1;
      const endMultiplier = containerId.startsWith('candidate-') ?
        candidateEndMultiplier :
        2;
      const provisionedMultiplier =
        containerId.startsWith('candidate-') ?
          candidateProvisionedMultiplier :
          1;
      return resourceStats(
        calls <= componentCount ? startedAt : endedAt,
        calls <= componentCount ? 1 : endMultiplier,
        provisionedMultiplier,
      );
    },
    async getNetworkByName() {
      return cleaned ? null : {id: networkId};
    },
  };
  const session = await beginBenchmarkResourceLiveObservation(provider, {
    runId: FIXTURE_RESOURCE_RUN_ID,
    networkId,
    networkName: networkId,
    sourceRevision: FIXTURE_RESOURCE_SOURCE_REVISION,
    components: observationComponents(),
  });
  await captureBenchmarkResourceLiveObservation(session);
  cleaned = true;
  const finalized = await finalizeBenchmarkResourceLiveObservation(session);
  const artifact = writeExternallyObservedBenchmarkResourceCalibration(
    finalized.receipt,
    finalized.authorization,
  );
  calibrationFixtureCache.set(cacheKey, artifact);
  return artifact;
}

function normalizeCapacityReportWindowTimes(preregistration, input) {
  const report = structuredClone(input);
  const samples = [...report.warmupSamples, ...report.rawSamples];
  let cursor = CAPACITY_WINDOW_EPOCH;
  for (let index = 0; index < report.windowReceipts.length; index += 1) {
    const receipt = report.windowReceipts[index];
    const sample = samples.find(
      (entry) => entry.sampleDigest === receipt.capacitySampleDigest,
    );
    const startedAt = cursor;
    const endedAt = startedAt + sample.observationDurationMs;
    report.windowReceipts[index] = createBenchmarkCapacityWindowReceipt({
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
      resourceWindowDigest: receipt.resourceWindowDigest,
    }, sample, preregistration);
    cursor = endedAt + 1;
  }
  delete report.reportDigest;
  return {
    ...report,
    reportDigest: digestBenchmarkSemanticData(report),
  };
}

async function capacityProtocolFixture(base) {
  const cellId = base.matrix.artifact.payload.cells[0].cellId;
  const executionIdentity = {
    matrixId: FIXTURE_RESOURCE_MATRIX_ID,
    cellId,
    cellManifestDigest: digestBenchmarkSemanticData({
      matrixId: FIXTURE_RESOURCE_MATRIX_ID,
      cellId,
    }),
    profileIdentity:
      base.profileEnvelope.artifact.payload.profileIdentity,
    pairIdentity: digestBenchmarkSemanticData({
      pairId: FIXTURE_RESOURCE_PAIR_ID,
    }),
    runId: FIXTURE_RESOURCE_RUN_ID,
    liveEnvironmentContractDigest:
      base.matrix.artifact.payload.alternativeTopologyDigest,
  };
  const cacheKey = digestBenchmarkSemanticData(executionIdentity);
  const cached = capacityProtocolFixtureCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const preregistration = sealBenchmarkCapacityPreregistration(
    preregistrationInput({executionIdentity}),
  );
  const raw = await artifactFixtureReport(preregistration);
  const heterogeneous =
    createBenchmarkCapacityHeterogeneousEvidenceFixture({
      preregistration,
      report: normalizeCapacityReportWindowTimes(
        preregistration,
        raw.report,
      ),
      lagrangeSideId: FIXTURE_RESOURCE_SIDE_IDS[0],
    });
  const fixture = {
    preregistration,
    ...raw,
    report: heterogeneous.report,
    windowEvidence: heterogeneous.windowEvidence,
  };
  capacityProtocolFixtureCache.set(cacheKey, fixture);
  return fixture;
}

async function claimEligibleEvidenceFixture(
  options = {},
  calibrationOptions = {},
) {
  const calibrationArtifact =
    await liveCalibrationFixture(calibrationOptions);
  const base = createBenchmarkResourceEvidenceFixture({
    ...options,
    calibrationArtifact,
  });
  const capacityProtocol = await capacityProtocolFixture(base);
  const measuredReceipts =
    capacityProtocol.report.windowReceipts.filter(
      (receipt) => receipt.phase === 'measured',
    );
  const calibrationArtifacts = [];
  for (let index = 0; index < measuredReceipts.length; index += 1) {
    calibrationArtifacts.push(await liveCalibrationFixture({
      ...calibrationOptions,
      startedAt: measuredReceipts[index].startedAt,
      endedAt: measuredReceipts[index].endedAt,
    }));
  }
  return createBenchmarkResourceEvidenceFixture({
    ...options,
    calibrationArtifact: calibrationArtifacts[0],
    calibrationArtifacts,
    capacityProtocol,
  });
}

function absentCertification() {
  return {state: COMPARATIVE_CLAIM_CERTIFICATION_STATE.ABSENT};
}

function attachedCertification(fixture, overrides = {}) {
  const rootDigest = fixture.root.digest;
  const profileIdentity =
    fixture.profileEnvelope.artifact.payload.profileIdentity;
  const receipt = {
    contractId: SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
    schemaVersion: SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
    questId: CERTIFICATION_QUEST,
    profileIdentity,
    evidenceIdentity: rootDigest,
    issuedAt: RECEIPT_ISSUED_AT,
    validUntil: RECEIPT_VALID_UNTIL,
    ...overrides,
  };
  return {
    state: COMPARATIVE_CLAIM_CERTIFICATION_STATE.ATTACHED,
    receipt,
    expected: {
      terminalReceiptDigest:
        computeScaleCertificationReceiptDigest(receipt),
      questId: CERTIFICATION_QUEST,
      profileIdentity,
      evidenceIdentity: rootDigest,
    },
  };
}

function measuredInput(fixture, options = {}) {
  const rootedProfile = fixture.profileEnvelope?.artifact.payload ?? {
    profile: {id: SCALE_PROFILE_ID.DEVELOPMENT},
    profileIdentity: `sha256:${'a'.repeat(64)}`,
  };
  return {
    workloadId: options.workloadId || 'fixture-workload',
    expectedMatrixId: FIXTURE_RESOURCE_MATRIX_ID,
    profile: {
      id: options.profileId || rootedProfile.profile.id,
      identity: options.profileIdentity || rootedProfile.profileIdentity,
    },
    rootAcceptance:
      acceptBenchmarkResourceClaimEvidenceRoot(fixture.receipt),
    certification:
      options.certification || absentCertification(),
  };
}

function projectionInput(overrides = {}) {
  return {
    evaluatedAt: overrides.evaluatedAt || EVALUATED_AT,
    analyticalEvidence: overrides.analyticalEvidence || [],
    measuredEvidence: overrides.measuredEvidence || [],
  };
}

function effect(effectType, values) {
  return createBenchmarkResourcePairedEffect({
    effectType,
    numeratorSideId: 'candidate',
    denominatorSideId: 'alternative',
    numeratorValue: values.numerator,
    denominatorValue: values.denominator,
    confidenceInterval: {
      lower: values.lower,
      upper: values.upper,
    },
    practicalThreshold: 0.05,
    sampleCount: 3,
    sourceDigests: [`sha256:${'b'.repeat(64)}`],
    currency: effectType === BENCHMARK_RESOURCE_EFFECT.CAPACITY ?
      BENCHMARK_RESOURCE_NO_CURRENCY :
      'USD',
  });
}

test('calculator evidence remains an analytical bound with full uncertainty',
  (t) => {
    const input = JSON.parse(readFileSync(
      'test/fixtures/comparative-efficiency-opportunity/' +
        'request-enrichment.json',
      'utf8',
    ));
    const table = projectComparativeEfficiencyClaims(projectionInput({
      analyticalEvidence: [{workloadId: 'request-enrichment', input}],
    }));

    t.equal(table.rows.length, 1);
    t.equal(
      table.rows[0].evidenceClass,
      COMPARATIVE_EVIDENCE_CLASS.ANALYTICAL_BOUND,
    );
    t.equal(table.rows[0].evidence.output.uncertainty, input.uncertainty);
    t.same(
      table.rows[0].evidence.output.predictionError,
      input.calibration,
    );
    t.match(table.rows[0].statement, /not measured/u);
    t.end();
  });

test('calculator errors fail closed without suppressing the error', (t) => {
  const table = projectComparativeEfficiencyClaims(projectionInput({
    analyticalEvidence: [{
      workloadId: 'invalid-calculator-input',
      input: {fixtureId: 'incomplete'},
    }],
  }));

  t.equal(table.rows[0].evidenceClass, COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM);
  t.equal(table.rows[0].outcome, COMPARATIVE_CLAIM_EFFECT_OUTCOME.NOT_EVALUABLE);
  t.match(table.rows[0].reasonCodes, [
    COMPARATIVE_CLAIM_REASON.CALCULATOR_ERROR,
  ]);
  t.match(table.rows[0].statement, /invalid opportunity input/u);
  t.end();
});

test('calculator prediction error preserves signed unfavorable measurements',
  (t) => {
    const input = JSON.parse(readFileSync(
      'test/fixtures/comparative-efficiency-opportunity/' +
        'grouped-reduce.json',
      'utf8',
    ));
    const table = projectComparativeEfficiencyClaims(projectionInput({
      analyticalEvidence: [{workloadId: 'grouped-reduce', input}],
    }));
    const predictionError = table.rows[0].evidence.output.predictionError;

    t.equal(
      table.rows[0].evidenceClass,
      COMPARATIVE_EVIDENCE_CLASS.ANALYTICAL_BOUND,
    );
    t.equal(predictionError.state, 'measured');
    t.ok(predictionError.networkBytesPerOperation.relativeError < 0);
    t.ok(predictionError.cpuSecondsPerOperation.relativeError < 0);
    t.match(
      validateComparativeEfficiencyClaimTable(table),
      {valid: true},
    );
    t.end();
  });

test('current live P0 root publishes a win and an alternative win',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture();
    const table = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(fixture)],
    }));
    const capacity = table.rows.find(
      (row) => row.metric === COMPARATIVE_CLAIM_METRIC.CAPACITY,
    );
    const cost = table.rows.find(
      (row) => row.metric === COMPARATIVE_CLAIM_METRIC.COST,
    );

    t.equal(
      capacity.evidenceClass,
      COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0,
    );
    t.equal(
      capacity.outcome,
      COMPARATIVE_CLAIM_EFFECT_OUTCOME.CANDIDATE_WIN,
    );
    t.equal(cost.evidenceClass, COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0);
    t.equal(
      cost.outcome,
      COMPARATIVE_CLAIM_EFFECT_OUTCOME.ALTERNATIVE_WIN,
    );
    t.match(cost.statement, /candidate regression/u);
    t.end();
  });

test('C3 admission requires the exact repeated measured-window set',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture();
    const omitted = await claimEligibleEvidenceFixture({
      omittedProtocolCoordinate: {blockIndex: 1, loadIndex: 1},
    });
    const fabricated = await claimEligibleEvidenceFixture({
      fabricatedWindowIndex: 0,
    });
    const overlapped = await claimEligibleEvidenceFixture({
      overlapWindowIndex: 1,
    });

    t.equal(fixture.windows.length, 18);
    t.equal(
      validateBenchmarkResourceEvidenceRoot(fixture.receipt).claimEligible,
      true,
    );
    for (const attacked of [omitted, fabricated, overlapped]) {
      const validation =
        validateBenchmarkResourceEvidenceRoot(attacked.receipt);
      const table = projectComparativeEfficiencyClaims(projectionInput({
        measuredEvidence: [measuredInput(attacked)],
      }));
      t.equal(validation.valid, false);
      t.ok(table.rows.every(
        (row) => row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
      ));
      t.ok(table.rows.every(
        (row) => row.source.measurementOutcome.state ===
          BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.INVALID,
      ));
    }
    t.end();
  });

test('caller-supplied P0 identity cannot override the evidence-rooted profile',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture();
    const table = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(fixture, {
        profileIdentity: `sha256:${'f'.repeat(64)}`,
      })],
    }));

    t.ok(table.rows.every(
      (row) => row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
    ));
    t.ok(table.rows.every((row) =>
      row.reasonCodes.includes(
        COMPARATIVE_CLAIM_REASON.PROFILE_IDENTITY_MISMATCH,
      ),
    ));
    t.end();
  });

test('digest-valid but semantically invalid rooted P0 is rejected before class selection',
  (t) => {
    const invalidBody = {
      contractId: SCALE_EVIDENCE_CONTRACT_ID,
      schemaVersion: SCALE_EVIDENCE_SCHEMA_VERSION,
      profile: {id: SCALE_PROFILE_ID.DEVELOPMENT, version: 1},
      software: 'caller',
      hardware: {cpuCount: 'unbounded-label'},
      topology: null,
      data: [],
      workload: false,
    };
    const invalidEnvelope = createBenchmarkResourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PROFILE_ENVELOPE,
      {
        ...invalidBody,
        profileIdentity: computeScaleProfileIdentity(invalidBody),
      },
    );
    const fixture = createBenchmarkResourceEvidenceFixture({
      profileEnvelopeOverride: invalidEnvelope,
    });
    const table = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(fixture)],
    }));

    t.ok(table.rows.every(
      (row) => row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
    ));
    t.ok(table.rows.every(
      (row) => row.source.measurementOutcome.state ===
        BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.INVALID,
    ));
    t.end();
  });

test('C4 acceptance is the immutable production input consumed by C10',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture();
    let drifted = false;
    let calls = 0;
    const acceptance = acceptBenchmarkResourceClaimEvidenceRoot({
      rootDigest: fixture.root.digest,
      resolver: {
        resolve(digest) {
          calls += 1;
          return drifted ? undefined : fixture.receipt.resolver.resolve(digest);
        },
      },
    });
    const callsAtAcceptance = calls;
    drifted = true;
    const acceptedInput = measuredInput(fixture);
    acceptedInput.rootAcceptance = acceptance;
    const accepted = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [acceptedInput],
    }));
    const forgedInput = measuredInput(fixture);
    forgedInput.rootAcceptance = {...acceptance};
    const forged = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [forgedInput],
    }));

    t.equal(calls, callsAtAcceptance);
    t.ok(accepted.rows.every((row) =>
      row.source.measurementOutcome.state ===
        BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.MEASURING,
    ));
    t.ok(forged.rows.every((row) =>
      row.source.measurementOutcome.state ===
        BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.INVALID &&
      row.source.measurementOutcome.reason.code ===
        BENCHMARK_RESOURCE_MEASUREMENT_REASON.IMMUTABLE_RESOLUTION_DRIFT,
    ));
    t.equal(
      Object.hasOwn(
        claimEvidenceView,
        'createBenchmarkResourceClaimEvidenceAcceptance',
      ),
      false,
    );
    t.end();
  });

test('current terminal certification is required for certified_profile',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture({
      profileId: SCALE_PROFILE_ID.INTEGRATION,
    });
    const current = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(fixture, {
        profileId: SCALE_PROFILE_ID.INTEGRATION,
        certification: attachedCertification(fixture),
      })],
    }));
    const expired = projectComparativeEfficiencyClaims(projectionInput({
      evaluatedAt: RECEIPT_VALID_UNTIL,
      measuredEvidence: [measuredInput(fixture, {
        profileId: SCALE_PROFILE_ID.INTEGRATION,
        certification: attachedCertification(fixture),
      })],
    }));

    t.ok(current.rows.every(
      (row) =>
        row.evidenceClass ===
          COMPARATIVE_EVIDENCE_CLASS.CERTIFIED_PROFILE,
    ));
    t.ok(expired.rows.every(
      (row) => row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
    ));
    t.ok(expired.rows.every((row) =>
      row.reasonCodes.includes(
        COMPARATIVE_CLAIM_REASON.CERTIFICATION_EXPIRED,
      ),
    ));
    t.end();
  });

test('expired price evidence suppresses cost without suppressing capacity',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture({
      priceValidUntil: '2026-07-27T12:15:00.000Z',
    });
    const table = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(fixture)],
    }));
    const capacity = table.rows.find(
      (row) => row.metric === COMPARATIVE_CLAIM_METRIC.CAPACITY,
    );
    const cost = table.rows.find(
      (row) => row.metric === COMPARATIVE_CLAIM_METRIC.COST,
    );

    t.equal(
      capacity.evidenceClass,
      COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0,
    );
    t.equal(cost.evidenceClass, COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM);
    t.match(cost.reasonCodes, [COMPARATIVE_CLAIM_REASON.PRICE_EXPIRED]);
    t.end();
  });

test('missing, malformed, tampered, or initially stale price suppresses cost only',
  async (t) => {
    const malformedPrice = createBenchmarkResourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PRICE_SHEET,
      {version: 'malformed-price-fixture'},
    );
    const fixtures = [
      await claimEligibleEvidenceFixture(),
      await claimEligibleEvidenceFixture({
        priceArtifactOverride: malformedPrice,
      }),
      await claimEligibleEvidenceFixture(),
      await claimEligibleEvidenceFixture({
        priceValidUntil: '2026-07-27T11:00:00.000Z',
      }),
    ];
    const resolverModes = ['missing', 'ordinary', 'tampered', 'ordinary'];
    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = fixtures[index];
      const mode = resolverModes[index];
      const receipt = mode === 'ordinary' ? fixture.receipt : {
        rootDigest: fixture.root.digest,
        resolver: {
          resolve(digest) {
            if (digest !== fixture.price.digest) {
              return fixture.receipt.resolver.resolve(digest);
            }
            return mode === 'missing' ?
              undefined :
              Buffer.from('tampered-price-artifact');
          },
        },
      };
      const input = measuredInput({...fixture, receipt});
      const table = projectComparativeEfficiencyClaims(projectionInput({
        measuredEvidence: [input],
      }));
      const capacity = table.rows.find(
        (row) => row.metric === COMPARATIVE_CLAIM_METRIC.CAPACITY,
      );
      const cost = table.rows.find(
        (row) => row.metric === COMPARATIVE_CLAIM_METRIC.COST,
      );
      t.equal(
        capacity.evidenceClass,
        COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0,
        `${mode} price retains capacity`,
      );
      t.equal(
        cost.evidenceClass,
        COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
        `${mode} price suppresses cost`,
      );
      t.match(cost.reasonCodes, [COMPARATIVE_CLAIM_REASON.PRICE_INVALID]);
      t.equal(
        cost.source.measurementOutcome.reason.code,
        BENCHMARK_RESOURCE_MEASUREMENT_REASON.PRICE_EVIDENCE_INVALID,
      );
    }
    t.end();
  });

test('effect classification retains neutral, inconclusive, insignificant, ' +
  'and alternative-favored outcomes', (t) => {
  const cases = [
    {
      values: {numerator: 100, denominator: 100, lower: 1, upper: 1},
      outcome: COMPARATIVE_CLAIM_EFFECT_OUTCOME.NEUTRAL,
    },
    {
      values: {numerator: 110, denominator: 100, lower: 0.95, upper: 1.2},
      outcome: COMPARATIVE_CLAIM_EFFECT_OUTCOME.INCONCLUSIVE,
    },
    {
      values: {numerator: 103, denominator: 100, lower: 1.02, upper: 1.04},
      outcome:
        COMPARATIVE_CLAIM_EFFECT_OUTCOME.PRACTICALLY_INSIGNIFICANT,
    },
    {
      values: {numerator: 80, denominator: 100, lower: 0.75, upper: 0.85},
      outcome: COMPARATIVE_CLAIM_EFFECT_OUTCOME.ALTERNATIVE_WIN,
    },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    t.equal(
      classifyComparativeEfficiencyClaimEffect(
        effect(BENCHMARK_RESOURCE_EFFECT.CAPACITY, cases[index].values),
      ),
      cases[index].outcome,
    );
  }
  t.equal(
    classifyComparativeEfficiencyClaimEffect(effect(
      BENCHMARK_RESOURCE_EFFECT.COST,
      {numerator: 80, denominator: 100, lower: 0.75, upper: 0.85},
    )),
    COMPARATIVE_CLAIM_EFFECT_OUTCOME.CANDIDATE_WIN,
  );
  t.end();
});

test('projected cost retains neutral and practically insignificant outcomes',
  async (t) => {
    const neutralFixture = await claimEligibleEvidenceFixture({}, {
      candidateEndMultiplier:
        COST_NEUTRAL_CANDIDATE_END_MULTIPLIER,
      candidateProvisionedMultiplier: 1,
    });
    const insignificantFixture = await claimEligibleEvidenceFixture({}, {
      candidateEndMultiplier:
        COST_NEUTRAL_CANDIDATE_END_MULTIPLIER + 0.05,
      candidateProvisionedMultiplier: 1,
    });
    const neutral = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(neutralFixture)],
    })).rows.find((row) => row.metric === COMPARATIVE_CLAIM_METRIC.COST);
    const insignificant =
      projectComparativeEfficiencyClaims(projectionInput({
        measuredEvidence: [measuredInput(insignificantFixture)],
      })).rows.find((row) => row.metric === COMPARATIVE_CLAIM_METRIC.COST);
    t.equal(neutral.outcome, COMPARATIVE_CLAIM_EFFECT_OUTCOME.NEUTRAL);
    t.equal(
      neutral.evidenceClass,
      COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0,
    );
    t.equal(
      insignificant.outcome,
      COMPARATIVE_CLAIM_EFFECT_OUTCOME.PRACTICALLY_INSIGNIFICANT,
    );
    t.equal(
      insignificant.evidenceClass,
      COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
    );
    t.match(insignificant.reasonCodes, [
      COMPARATIVE_CLAIM_REASON.EFFECT_PRACTICALLY_INSIGNIFICANT,
    ]);
    t.end();
  });

test('historical or invalid evidence produces explicit no_claim rows', (t) => {
  const historical = {
    receipt: {
      rootDigest: 'historical-comparator-report',
      resolver: {resolve() {
        return Buffer.from('historical');
      }},
    },
  };
  const table = projectComparativeEfficiencyClaims(projectionInput({
    measuredEvidence: [{
      ...measuredInput(historical),
      expectedMatrixId: 'historical-comparator',
    }],
  }));

  t.equal(table.rows.length, 2);
  t.ok(table.rows.every(
    (row) => row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
  ));
  t.ok(table.rows.every((row) =>
    row.reasonCodes.includes(
      COMPARATIVE_CLAIM_REASON.EVIDENCE_INVALID,
    ),
  ));
  t.end();
});

test('schema-valid synthetic measuring evidence cannot promote a claim',
  (t) => {
    const fixture = createBenchmarkResourceEvidenceFixture();
    const table = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(fixture)],
    }));

    t.ok(table.rows.every(
      (row) => row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
    ));
    t.ok(table.rows.every((row) =>
      row.reasonCodes.includes(
        COMPARATIVE_CLAIM_REASON.EVIDENCE_NOT_CLAIM_ELIGIBLE,
      ),
    ));
    t.end();
  });

test('non-P0 evidence requires a bound current certification', async (t) => {
  const fixture = await claimEligibleEvidenceFixture({
    profileId: SCALE_PROFILE_ID.INTEGRATION,
  });
  const absent = projectComparativeEfficiencyClaims(projectionInput({
    measuredEvidence: [measuredInput(fixture, {
      profileId: SCALE_PROFILE_ID.INTEGRATION,
    })],
  }));
  const mismatchedCertification =
    attachedCertification(fixture);
  mismatchedCertification.expected.evidenceIdentity =
    `sha256:${'c'.repeat(64)}`;
  const mismatched = projectComparativeEfficiencyClaims(projectionInput({
    measuredEvidence: [measuredInput(fixture, {
      profileId: SCALE_PROFILE_ID.INTEGRATION,
      certification: mismatchedCertification,
    })],
  }));

  t.ok(absent.rows.every(
    (row) => row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
  ));
  t.ok(absent.rows.every((row) =>
    row.reasonCodes.includes(
      COMPARATIVE_CLAIM_REASON.CERTIFICATION_ABSENT,
    ),
  ));
  t.ok(mismatched.rows.every((row) =>
    row.reasonCodes.includes(
      COMPARATIVE_CLAIM_REASON.CERTIFICATION_INVALID,
    ),
  ));
  t.end();
});

test('an attached receipt cannot promote current P0 beyond measured_p0',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture();
    const table = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(fixture, {
        certification: attachedCertification(fixture),
      })],
    }));

    t.ok(table.rows.every(
      (row) =>
        row.evidenceClass === COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0,
    ));
    t.end();
  });

test('expired roots and matrix mismatches remain explicit no_claim evidence',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture();
    const expired = projectComparativeEfficiencyClaims(projectionInput({
      evaluatedAt: FIXTURE_RESOURCE_VALID_UNTIL,
      measuredEvidence: [measuredInput(fixture)],
    }));
    const mismatch = measuredInput(fixture);
    mismatch.expectedMatrixId = 'a-different-matrix';
    const mismatched = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [mismatch],
    }));

    t.ok(expired.rows.every((row) =>
      row.reasonCodes.includes(COMPARATIVE_CLAIM_REASON.EVIDENCE_EXPIRED),
    ));
    t.ok(mismatched.rows.every((row) =>
      row.reasonCodes.includes(
        COMPARATIVE_CLAIM_REASON.MATRIX_ID_MISMATCH,
      ),
    ));
    t.end();
  });

test('projection and effect classification reject hostile or invalid input',
  (t) => {
    let getterCalls = 0;
    const hostile = {
      analyticalEvidence: [],
      measuredEvidence: [],
    };
    Object.defineProperty(hostile, 'evaluatedAt', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('evaluatedAt getter executed');
      },
    });
    const table = projectComparativeEfficiencyClaims(hostile);
    const invalidEffect = structuredClone(effect(
      BENCHMARK_RESOURCE_EFFECT.CAPACITY,
      {numerator: 100, denominator: 100, lower: 1, upper: 1},
    ));
    invalidEffect.estimate = 2;

    t.equal(getterCalls, 0);
    t.equal(table.rows[0].evidenceClass, COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM);
    t.throws(
      () => classifyComparativeEfficiencyClaimEffect(invalidEffect),
      /claimEffect/u,
    );
    t.end();
  });

test('captured collection intrinsics preserve projection and rendering',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture();
    const input = projectionInput({
      measuredEvidence: [measuredInput(fixture)],
    });
    const baseline = projectComparativeEfficiencyClaims(input);
    const baselineMarkdown =
      renderComparativeEfficiencyClaimTable(baseline);
    const restorations = [
      replaceProperty(Array.prototype, 'join', () => {
        throw new TypeError('poisoned Array.prototype.join executed');
      }),
      replaceProperty(Array.prototype, Symbol.iterator, function empty() {
        return {next: () => ({done: true})};
      }),
      replaceProperty(Map.prototype, 'set', function noSet() {
        return this;
      }),
    ];
    let projected;
    let markdown;
    try {
      projected = projectComparativeEfficiencyClaims(input);
      markdown = renderComparativeEfficiencyClaimTable(baseline);
    } finally {
      for (
        let restoreIndex = restorations.length - 1;
        restoreIndex >= 0;
        restoreIndex -= 1
      ) {
        restorations[restoreIndex]();
      }
    }

    t.equal(projected.tableDigest, baseline.tableDigest);
    t.equal(projected.rows.length, baseline.rows.length);
    t.equal(markdown, baselineMarkdown);
    t.match(
      validateComparativeEfficiencyClaimTable(projected),
      {valid: true},
    );
    t.end();
  });

test('human table is a digest-bound rendering of every machine row',
  async (t) => {
    const fixture = await claimEligibleEvidenceFixture();
    const table = projectComparativeEfficiencyClaims(projectionInput({
      measuredEvidence: [measuredInput(fixture)],
    }));
    const markdown = renderComparativeEfficiencyClaimTable(table);

    t.match(markdown, new RegExp(table.tableDigest, 'u'));
    for (let index = 0; index < table.rows.length; index += 1) {
      t.match(markdown, new RegExp(table.rows[index].rowId, 'u'));
      t.match(markdown, new RegExp(table.rows[index].evidenceClass, 'u'));
      t.ok(markdown.includes(table.rows[index].statement));
    }
    const tamperedRow = structuredClone(table);
    tamperedRow.rows[0].statement = 'promotional replacement';
    const tamperedTable = structuredClone(table);
    tamperedTable.tableDigest = `sha256:${'d'.repeat(64)}`;
    t.match(
      validateComparativeEfficiencyClaimTable(tamperedRow),
      {valid: false},
    );
    t.throws(
      () => renderComparativeEfficiencyClaimTable(tamperedRow),
      /digest_mismatch/u,
    );
    t.match(
      validateComparativeEfficiencyClaimTable(tamperedTable),
      {valid: false},
    );
    t.end();
  });
