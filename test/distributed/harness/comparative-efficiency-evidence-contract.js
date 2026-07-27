import {
  SCALE_CLAIM_REASON,
  SCALE_EVIDENCE_FIDELITY,
  SCALE_PROFILE_ID,
  computeScaleEvidenceDigest,
  createScaleEvidenceReport,
  isNonEmptyText,
  isNonNegativeInteger,
  isNonNegativeNumber,
  isPositiveInteger,
  isRatio,
  isRecord,
  pushIf,
  validateDigest,
  validateScaleEvidenceReport,
} from './scale-evidence-contract.js';

const ZERO = 0;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const COMPARATIVE_EVIDENCE_CONTRACT_ID =
  'comparative-efficiency-evidence-contract';
const COMPARATIVE_EVIDENCE_SCHEMA_VERSION =
  'comparative-efficiency-evidence-v1';

export const COMPARATIVE_MEASUREMENT_STATE = Object.freeze({
  MEASURED: 'measured',
  NON_MEASURING: 'non_measuring',
});

export const COMPARATIVE_PARITY_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  NOT_MEASURED: 'not_measured',
});

export const COMPARATIVE_RESULT_DIRECTION = Object.freeze({
  WIN: 'win',
  NEUTRAL: 'neutral',
  LOSS: 'loss',
  NO_RESULT: 'no_result',
});

export const COMPARATIVE_EVIDENCE_CLASS = Object.freeze({
  ANALYTICAL_BOUND: 'analytical_bound',
  MEASURED_P0: 'measured_p0',
  CERTIFIED_PROFILE: 'certified_profile',
  NO_CLAIM: 'no_claim',
});

export const COMPARATIVE_INVALIDATION_STATE = Object.freeze({
  CURRENT: 'current',
  INVALIDATED: 'invalidated',
});

const MEASUREMENT_STATES =
  new Set(Object.values(COMPARATIVE_MEASUREMENT_STATE));
const PARITY_STATUSES = new Set(Object.values(COMPARATIVE_PARITY_STATUS));
const RESULT_DIRECTIONS =
  new Set(Object.values(COMPARATIVE_RESULT_DIRECTION));
const EVIDENCE_CLASSES = new Set(Object.values(COMPARATIVE_EVIDENCE_CLASS));
const INVALIDATION_STATES =
  new Set(Object.values(COMPARATIVE_INVALIDATION_STATE));
const MIGRATION_STATES = new Set(['origin', 'migrated']);
const PARITY_DIMENSIONS = Object.freeze([
  'resultSet',
  'ordering',
  'errorBehavior',
  'transaction',
  'durability',
]);
const ARTIFACT_FIELDS = Object.freeze([
  'matrixManifestDigest',
  'alternativeTopologyDigest',
  'parityReceiptDigest',
  'preregistrationDigest',
  'rawSamplesDigest',
  'componentInventoryDigest',
  'resourceSamplesDigest',
  'priceSheetDigest',
  'logsDigest',
  'summaryDigest',
]);

function validateIdentity(extension, errors) {
  pushIf(
    errors,
    extension.contractId !== COMPARATIVE_EVIDENCE_CONTRACT_ID,
    'comparative.contractId:unsupported',
  );
  pushIf(
    errors,
    extension.schemaVersion !== COMPARATIVE_EVIDENCE_SCHEMA_VERSION,
    'comparative.schemaVersion:unsupported',
  );
  const matrix = extension.matrix;
  pushIf(errors, !isRecord(matrix), 'comparative.matrix:object_required');
  if (isRecord(matrix)) {
    pushIf(errors, !isNonEmptyText(matrix.id), 'comparative.matrix.id:required');
    pushIf(errors, !isNonEmptyText(matrix.cellId),
      'comparative.matrix.cellId:required');
    validateDigest(
      errors,
      matrix.manifestDigest,
      'comparative.matrix.manifestDigest',
    );
  }
  const pair = extension.pair;
  pushIf(errors, !isRecord(pair), 'comparative.pair:object_required');
  if (isRecord(pair)) {
    pushIf(errors, !isNonEmptyText(pair.id), 'comparative.pair.id:required');
    for (const field of ['lagrangeSideId', 'alternativeSideId']) {
      pushIf(errors, !isNonEmptyText(pair[field]),
        `comparative.pair.${field}:required`);
    }
    pushIf(errors, !isNonNegativeInteger(pair.blockedOrderIndex),
      'comparative.pair.blockedOrderIndex:non_negative_integer_required');
    validateDigest(
      errors,
      pair.randomizedOrderDigest,
      'comparative.pair.randomizedOrderDigest',
    );
  }
  const migration = extension.migration;
  pushIf(errors, !isRecord(migration),
    'comparative.migration:object_required');
  if (isRecord(migration)) {
    pushIf(errors, !MIGRATION_STATES.has(migration.state),
      'comparative.migration.state:unsupported');
    if (migration.state === 'origin') {
      pushIf(errors, Object.hasOwn(migration, 'fromSchemaVersion'),
        'comparative.migration.fromSchemaVersion:forbidden_for_origin');
      pushIf(errors, Object.hasOwn(migration, 'receiptDigest'),
        'comparative.migration.receiptDigest:forbidden_for_origin');
    }
    if (migration.state === 'migrated') {
      pushIf(errors, !isNonEmptyText(migration.fromSchemaVersion),
        'comparative.migration.fromSchemaVersion:required_when_migrated');
      validateDigest(
        errors,
        migration.receiptDigest,
        'comparative.migration.receiptDigest',
      );
    }
  }
}

function validateAlternative(extension, errors) {
  const alternative = extension.alternative;
  pushIf(
    errors,
    !isRecord(alternative),
    'comparative.alternative:object_required',
  );
  if (!isRecord(alternative)) return;
  for (const field of ['id', 'name', 'version', 'availabilityScope']) {
    pushIf(errors, !isNonEmptyText(alternative[field]),
      `comparative.alternative.${field}:required`);
  }
  validateDigest(
    errors,
    alternative.topologyInventoryDigest,
    'comparative.alternative.topologyInventoryDigest',
  );
  pushIf(
    errors,
    !Array.isArray(alternative.components) ||
      alternative.components.length === ZERO,
    'comparative.alternative.components:non_empty_array_required',
  );
  if (Array.isArray(alternative.components)) {
    alternative.components.forEach((component, index) => {
      const path = `comparative.alternative.components.${index}`;
      pushIf(errors, !isRecord(component), `${path}:object_required`);
      if (!isRecord(component)) return;
      for (const field of ['id', 'role']) {
        pushIf(errors, !isNonEmptyText(component[field]),
          `${path}.${field}:required`);
      }
      pushIf(errors, typeof component.included !== 'boolean',
        `${path}.included:boolean_required`);
    });
  }
}

function validateParity(extension, errors) {
  const parity = extension.parity;
  pushIf(errors, !isRecord(parity), 'comparative.parity:object_required');
  if (!isRecord(parity)) return;
  pushIf(errors, !PARITY_STATUSES.has(parity.status),
    'comparative.parity.status:unsupported');
  validateDigest(
    errors,
    parity.receiptDigest,
    'comparative.parity.receiptDigest',
  );
  for (const dimension of PARITY_DIMENSIONS) {
    pushIf(
      errors,
      !PARITY_STATUSES.has(parity[dimension]),
      `comparative.parity.${dimension}:unsupported`,
    );
  }
}

function validatePreregistration(extension, errors) {
  const registration = extension.preregistration;
  pushIf(
    errors,
    !isRecord(registration),
    'comparative.preregistration:object_required',
  );
  if (!isRecord(registration)) return;
  validateDigest(
    errors,
    registration.manifestDigest,
    'comparative.preregistration.manifestDigest',
  );
  validateDigest(
    errors,
    registration.offeredLoadScheduleDigest,
    'comparative.preregistration.offeredLoadScheduleDigest',
  );
  pushIf(errors, !isPositiveInteger(registration.minRepetitions),
    'comparative.preregistration.minRepetitions:positive_integer_required');
  pushIf(errors, !isPositiveInteger(registration.maxRepetitions),
    'comparative.preregistration.maxRepetitions:positive_integer_required');
  pushIf(
    errors,
    isPositiveInteger(registration.minRepetitions) &&
      isPositiveInteger(registration.maxRepetitions) &&
      registration.minRepetitions > registration.maxRepetitions,
    'comparative.preregistration.repetitions:reversed',
  );
  for (const field of [
    'estimator',
    'stoppingRule',
    'multipleComparisonTreatment',
    'cachePolicy',
  ]) {
    pushIf(errors, !isNonEmptyText(registration[field]),
      `comparative.preregistration.${field}:required`);
  }
  pushIf(errors, !isRatio(registration.confidenceLevel),
    'comparative.preregistration.confidenceLevel:ratio_required');
  pushIf(errors, !isNonNegativeNumber(
    registration.practicalSignificanceThreshold,
  ), 'comparative.preregistration.practicalSignificanceThreshold:' +
    'non_negative_number_required');
  pushIf(errors, !isPositiveInteger(registration.tailSampleMinimum),
    'comparative.preregistration.tailSampleMinimum:positive_integer_required');
}

function isParityComplete(extension) {
  return extension.parity?.status === COMPARATIVE_PARITY_STATUS.PASS &&
    PARITY_DIMENSIONS.every(
      (dimension) =>
        extension.parity?.[dimension] === COMPARATIVE_PARITY_STATUS.PASS,
    );
}

function validateMeasurementCounts(measurement, errors) {
  const counts = measurement.counts;
  pushIf(errors, !isRecord(counts),
    'comparative.measurement.counts:object_required');
  if (isRecord(counts)) {
    for (const field of [
      'offered',
      'dispatched',
      'correct',
      'rejected',
      'timedOut',
      'errored',
      'queueOverflow',
    ]) {
      pushIf(errors, !isNonNegativeInteger(counts[field]),
        `comparative.measurement.counts.${field}:` +
          'non_negative_integer_required');
    }
    pushIf(
      errors,
      isNonNegativeInteger(counts.dispatched) &&
        isNonNegativeInteger(counts.offered) &&
        counts.dispatched > counts.offered,
      'comparative.measurement.counts.dispatched:exceeds_offered',
    );
    pushIf(
      errors,
      isNonNegativeInteger(counts.correct) &&
        isNonNegativeInteger(counts.dispatched) &&
        counts.correct > counts.dispatched,
      'comparative.measurement.counts.correct:exceeds_dispatched',
    );
  }
}

function validateMeasurementStatistics(measurement, errors) {
  const statistics = measurement.statistics;
  pushIf(errors, !isRecord(statistics),
    'comparative.measurement.statistics:object_required');
  if (isRecord(statistics)) {
    pushIf(errors, !isPositiveInteger(statistics.sampleCount),
      'comparative.measurement.statistics.sampleCount:' +
        'positive_integer_required');
    for (const field of ['estimate', 'lower', 'upper']) {
      pushIf(errors, !isNonNegativeNumber(statistics[field]),
        `comparative.measurement.statistics.${field}:` +
          'non_negative_number_required');
    }
    pushIf(
      errors,
      isNonNegativeNumber(statistics.lower) &&
        isNonNegativeNumber(statistics.upper) &&
        statistics.lower > statistics.upper,
      'comparative.measurement.statistics.interval:reversed',
    );
    pushIf(errors, !isNonEmptyText(statistics.unit),
      'comparative.measurement.statistics.unit:required');
  }
}

function validateMeasurement(extension, errors) {
  const measurement = extension.measurement;
  pushIf(
    errors,
    !isRecord(measurement),
    'comparative.measurement:object_required',
  );
  if (!isRecord(measurement)) return;
  pushIf(errors, !MEASUREMENT_STATES.has(measurement.state),
    'comparative.measurement.state:unsupported');
  pushIf(errors, !Array.isArray(measurement.reasonCodes),
    'comparative.measurement.reasonCodes:array_required');
  if (measurement.state === COMPARATIVE_MEASUREMENT_STATE.NON_MEASURING) {
    pushIf(
      errors,
      !Array.isArray(measurement.reasonCodes) ||
        measurement.reasonCodes.length === ZERO,
      'comparative.measurement.reasonCodes:required_when_non_measuring',
    );
    pushIf(
      errors,
      extension.result?.direction !== COMPARATIVE_RESULT_DIRECTION.NO_RESULT,
      'comparative.result.direction:non_measuring_requires_no_result',
    );
    return;
  }
  pushIf(errors, !isParityComplete(extension),
    'comparative.measurement.state:measured_requires_complete_parity');
  validateMeasurementCounts(measurement, errors);
  validateMeasurementStatistics(measurement, errors);
}

function validateAccounting(extension, errors) {
  const accounting = extension.accounting;
  pushIf(errors, !isRecord(accounting),
    'comparative.accounting:object_required');
  if (isRecord(accounting)) {
    pushIf(errors, typeof accounting.complete !== 'boolean',
      'comparative.accounting.complete:boolean_required');
    for (const field of [
      'provisionedCpuSeconds',
      'utilizedCpuSeconds',
      'memoryByteSeconds',
      'storageByteSeconds',
      'iops',
      'networkBytes',
      'costPerMillionCorrectOperations',
    ]) {
      pushIf(errors, !isNonNegativeNumber(accounting[field]),
        `comparative.accounting.${field}:non_negative_number_required`);
    }
    validateDigest(
      errors,
      accounting.componentInventoryDigest,
      'comparative.accounting.componentInventoryDigest',
    );
    validateDigest(
      errors,
      accounting.resourceSamplesDigest,
      'comparative.accounting.resourceSamplesDigest',
    );
  }
  const price = extension.price;
  pushIf(errors, !isRecord(price), 'comparative.price:object_required');
  if (!isRecord(price)) return;
  validateDigest(errors, price.sheetDigest, 'comparative.price.sheetDigest');
  for (const field of [
    'region',
    'currency',
    'priceDate',
    'billingGranularity',
    'reservations',
    'spot',
    'taxes',
    'credits',
    'exclusions',
  ]) {
    pushIf(errors, !isNonEmptyText(price[field]),
      `comparative.price.${field}:required`);
  }
}

function validateComparisonEligibility(extension, claim, invalidation, errors) {
  const comparisonIneligible =
    extension.measurement?.state ===
      COMPARATIVE_MEASUREMENT_STATE.NON_MEASURING ||
    !isParityComplete(extension) ||
    invalidation?.state === COMPARATIVE_INVALIDATION_STATE.INVALIDATED ||
    extension.accounting?.complete !== true;
  pushIf(
    errors,
    comparisonIneligible &&
      claim?.evidenceClass !== COMPARATIVE_EVIDENCE_CLASS.NO_CLAIM,
    'comparative.claim.evidenceClass:ineligible_requires_no_claim',
  );
}

function validateClaimClassEligibility(report, claim, errors) {
  const evidenceClass = claim?.evidenceClass;
  pushIf(
    errors,
    evidenceClass === COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0 &&
      (report.profile?.id !== SCALE_PROFILE_ID.DEVELOPMENT ||
        report.run?.fidelity !== SCALE_EVIDENCE_FIDELITY.LIVE),
    'comparative.claim.evidenceClass:measured_p0_requires_live_p0',
  );
  pushIf(
    errors,
    evidenceClass === COMPARATIVE_EVIDENCE_CLASS.MEASURED_P0 &&
      report.claimEligibility?.reasonCodes?.includes(
        SCALE_CLAIM_REASON.REQUIRED_GATE_NOT_PASSING,
      ),
    'comparative.claim.evidenceClass:' +
      'measured_p0_requires_green_scale_gates',
  );
  pushIf(
    errors,
    evidenceClass === COMPARATIVE_EVIDENCE_CLASS.CERTIFIED_PROFILE &&
      report.claimEligibility?.scaleCertification !== true,
    'comparative.claim.evidenceClass:certified_profile_requires_scale_receipt',
  );
}

function validateOutcome(report, extension, errors) {
  const result = extension.result;
  pushIf(errors, !isRecord(result), 'comparative.result:object_required');
  if (isRecord(result)) {
    pushIf(errors, !RESULT_DIRECTIONS.has(result.direction),
      'comparative.result.direction:unsupported');
    pushIf(errors, !isNonNegativeNumber(result.ratio),
      'comparative.result.ratio:non_negative_number_required');
    pushIf(errors, !isNonEmptyText(result.practicalClassification),
      'comparative.result.practicalClassification:required');
  }
  const claim = extension.claim;
  pushIf(errors, !isRecord(claim), 'comparative.claim:object_required');
  if (isRecord(claim)) {
    pushIf(errors, !EVIDENCE_CLASSES.has(claim.evidenceClass),
      'comparative.claim.evidenceClass:unsupported');
    pushIf(errors, !Array.isArray(claim.reasonCodes),
      'comparative.claim.reasonCodes:array_required');
  }
  const invalidation = extension.invalidation;
  pushIf(errors, !isRecord(invalidation),
    'comparative.invalidation:object_required');
  if (isRecord(invalidation)) {
    pushIf(errors, !INVALIDATION_STATES.has(invalidation.state),
      'comparative.invalidation.state:unsupported');
    pushIf(errors, !Array.isArray(invalidation.reasonCodes),
      'comparative.invalidation.reasonCodes:array_required');
    pushIf(
      errors,
      invalidation.state === COMPARATIVE_INVALIDATION_STATE.INVALIDATED &&
        (!Array.isArray(invalidation.reasonCodes) ||
          invalidation.reasonCodes.length === ZERO),
      'comparative.invalidation.reasonCodes:required_when_invalidated',
    );
  }
  validateComparisonEligibility(extension, claim, invalidation, errors);
  validateClaimClassEligibility(report, claim, errors);
}

function validateArtifactIdentityMappings(extension, artifacts, errors) {
  const expectedMappings = [
    ['matrixManifestDigest', extension.matrix?.manifestDigest],
    ['alternativeTopologyDigest',
      extension.alternative?.topologyInventoryDigest],
    ['parityReceiptDigest', extension.parity?.receiptDigest],
    ['preregistrationDigest', extension.preregistration?.manifestDigest],
    ['componentInventoryDigest',
      extension.accounting?.componentInventoryDigest],
    ['resourceSamplesDigest', extension.accounting?.resourceSamplesDigest],
    ['priceSheetDigest', extension.price?.sheetDigest],
  ];
  for (const [field, expected] of expectedMappings) {
    pushIf(errors, artifacts[field] !== expected,
      `comparative.artifacts.${field}:identity_mismatch`);
  }
}

function validateArtifactReferences(report, extension, errors) {
  const artifacts = extension.artifacts;
  pushIf(errors, !isRecord(artifacts),
    'comparative.artifacts:object_required');
  if (!isRecord(artifacts)) return;
  const declaredDigests = new Set(
    Array.isArray(report.artifacts) ?
      report.artifacts.map((artifact) => artifact?.digest) :
      [],
  );
  for (const field of ARTIFACT_FIELDS) {
    validateDigest(errors, artifacts[field], `comparative.artifacts.${field}`);
    pushIf(
      errors,
      SHA256_PATTERN.test(String(artifacts[field] || '')) &&
        !declaredDigests.has(artifacts[field]),
      `comparative.artifacts.${field}:artifact_not_found`,
    );
  }
  validateArtifactIdentityMappings(extension, artifacts, errors);
}

function computeComparativeMatrixIdentity(report) {
  const extension = report.extensions?.comparativeEfficiency;
  return computeScaleEvidenceDigest({
    profileIdentity: report.profileIdentity,
    matrix: extension?.matrix,
    preregistration: extension?.preregistration,
  });
}

function computeComparativePairIdentity(report) {
  const extension = report.extensions?.comparativeEfficiency;
  return computeScaleEvidenceDigest({
    matrixIdentity: extension?.matrixIdentity,
    pair: extension?.pair,
    alternative: extension?.alternative,
  });
}

export function validateComparativeEvidenceReport(report, scaleOptions = {}) {
  const baseValidation = validateScaleEvidenceReport(report, scaleOptions);
  const errors = baseValidation.valid ?
    [] :
    baseValidation.errors.map((error) => `scale.${error}`);
  const extension = report?.extensions?.comparativeEfficiency;
  pushIf(
    errors,
    !isRecord(extension),
    'comparative:object_required',
  );
  if (!isRecord(extension)) return {valid: false, errors};

  validateIdentity(extension, errors);
  validateAlternative(extension, errors);
  validateParity(extension, errors);
  validatePreregistration(extension, errors);
  validateMeasurement(extension, errors);
  validateAccounting(extension, errors);
  validateOutcome(report, extension, errors);
  validateArtifactReferences(report, extension, errors);

  const expectedMatrixIdentity = computeComparativeMatrixIdentity(report);
  pushIf(errors, extension.matrixIdentity !== expectedMatrixIdentity,
    'comparative.matrixIdentity:mismatch');
  const expectedPairIdentity = computeComparativePairIdentity(report);
  pushIf(errors, extension.pairIdentity !== expectedPairIdentity,
    'comparative.pairIdentity:mismatch');

  return {valid: errors.length === ZERO, errors};
}

export function createComparativeEvidenceReport(
  scaleInput,
  comparativeInput,
  scaleOptions = {},
) {
  const extension = {
    ...structuredClone(comparativeInput),
    contractId: COMPARATIVE_EVIDENCE_CONTRACT_ID,
    schemaVersion: COMPARATIVE_EVIDENCE_SCHEMA_VERSION,
  };
  const initial = createScaleEvidenceReport({
    ...structuredClone(scaleInput),
    extensions: {
      ...structuredClone(scaleInput.extensions || {}),
      comparativeEfficiency: extension,
    },
  }, scaleOptions);
  extension.matrixIdentity = computeComparativeMatrixIdentity(initial);
  extension.pairIdentity = computeComparativePairIdentity({
    ...initial,
    extensions: {
      ...initial.extensions,
      comparativeEfficiency: extension,
    },
  });
  const report = createScaleEvidenceReport({
    ...structuredClone(scaleInput),
    extensions: {
      ...structuredClone(scaleInput.extensions || {}),
      comparativeEfficiency: extension,
    },
  }, scaleOptions);
  const validation = validateComparativeEvidenceReport(report, scaleOptions);
  if (!validation.valid) {
    throw new TypeError(
      `invalid comparative evidence: ${validation.errors.join(', ')}`,
    );
  }
  return report;
}
