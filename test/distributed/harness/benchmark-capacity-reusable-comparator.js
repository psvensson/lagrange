import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
  isSha256Digest,
} from './benchmark-semantic-integrity.js';

const objectFreeze = Object.freeze;
const mathAbs = Math.abs;
const mathMax = Math.max;
const VERSION = 'benchmark-capacity-reusable-comparator-v1';
const CLAIM_ELIGIBLE = false;
const REVALIDATION_REUSABLE = 'reusable';
const REVALIDATION_CAPTURE_REQUIRED = 'capture_required';
const COMPATIBILITY_KEYS = objectFreeze([
  'datasetDigest',
  'datasetCardinality',
  'datasetSkew',
  'operationManifestDigest',
  'semanticOracleDigest',
  'postgresImageDigest',
  'postgresVersionDigest',
  'postgresConfigDigest',
  'querySqlDigest',
  'queryPlanDigest',
  'replicationFactor',
  'replicationStateDigest',
  'resourceEnvelopeDigest',
  'hostEnvelopeDigest',
  'preregistrationDigest',
  'measurementSourceDigest',
]);
const CONFIDENCE_INTERVAL_KEYS = objectFreeze(['lower', 'upper']);
const CAPACITY_INPUT_KEYS = objectFreeze([
  'estimate',
  'confidenceInterval',
  'perBlockCorrectThroughputPerSecond',
  'perBlockMaxSloOfferedLoadPerSecond',
  'tailSufficientByBlock',
  'bracketedByBlock',
  'minimumBlocks',
  'maximumBlocks',
  'completedBlocks',
  'targetRelativeCiWidth',
]);
const CAPACITY_KEYS = objectFreeze([
  ...CAPACITY_INPUT_KEYS,
  'relativeIntervalWidth',
  'tailSufficient',
  'bracketed',
  'precisionReached',
  'reusable',
]);
const EVIDENCE_INPUT_KEYS = objectFreeze([
  'sampleDigests',
  'windowReceiptDigests',
  'resourceReceiptDigests',
]);
const EVIDENCE_KEYS = objectFreeze([
  ...EVIDENCE_INPUT_KEYS,
  'evidenceRootDigest',
]);
const REVALIDATION_POLICY_KEYS = objectFreeze([
  'driftMetric',
  'baselineValue',
  'maximumRelativeDrift',
]);
const DRIFT_WITNESS_INPUT_KEYS = objectFreeze([
  'metric',
  'baselineValue',
  'observedValue',
]);
const DRIFT_WITNESS_KEYS = objectFreeze([
  ...DRIFT_WITNESS_INPUT_KEYS,
  'witnessDigest',
]);
const ARTIFACT_BODY_KEYS = objectFreeze([
  'version',
  'claimEligible',
  'comparatorId',
  'sideId',
  'protocolReportDigest',
  'compatibility',
  'compatibilityDigest',
  'capacity',
  'evidence',
  'revalidationPolicy',
  'capturedAtMs',
  'validUntilMs',
]);
const ARTIFACT_KEYS = objectFreeze([
  ...ARTIFACT_BODY_KEYS,
  'artifactDigest',
]);
const REASON = objectFreeze({
  ARTIFACT_INVALID: 'artifact_invalid',
  CLOCK_PRECEDES_CAPTURE: 'clock_precedes_capture',
  COMPATIBILITY_MISMATCH: 'compatibility_mismatch',
  DRIFT_WITNESS_INVALID: 'drift_witness_invalid',
  DRIFT_EXCEEDED: 'drift_exceeded',
  EXPIRED: 'expired',
  NOT_OBJECTIVELY_SUFFICIENT: 'not_objectively_sufficient',
});
const ERROR = objectFreeze({
  CAPACITY_BLOCK_BOUNDS_OR_COUNTS_INVALID:
    'capacity:block_bounds_or_counts_invalid',
  CAPACITY_EXACT_OWN_DATA_REQUIRED:
    'capacity:exact_own_data_required',
  CAPACITY_INTERVAL_OR_PRECISION_INVALID:
    'capacity:interval_or_precision_invalid',
  CAPACITY_RELATIVE_INTERVAL_WIDTH_INVALID:
    'capacity:relative_interval_width_invalid',
  COMPATIBILITY_EXACT_OWN_DATA_REQUIRED:
    'compatibility:exact_own_data_required',
  COMPATIBILITY_POSITIVE_INTEGER_IDENTITY_REQUIRED:
    'compatibility:positive_integer_identity_required',
  DRIFT_WITNESS_INVALID: 'driftWitness:invalid',
  EVIDENCE_EXACT_OWN_DATA_REQUIRED:
    'evidence:exact_own_data_required',
  EVIDENCE_WINDOW_RESOURCE_CARDINALITY_MISMATCH:
    'evidence:window_resource_cardinality_mismatch',
  POLICY_EXACT_OWN_DATA_REQUIRED:
    'revalidationPolicy:exact_own_data_required',
  POLICY_NUMERIC_BOUNDS_INVALID:
    'revalidationPolicy:numeric_bounds_invalid',
  PROTOCOL_REPORT_DIGEST_INVALID:
    'protocolReportDigest:sha256_digest_required',
  VALIDITY_INTERVAL_INVALID: 'validity_interval_invalid',
});
const FIELD_NAME = objectFreeze({
  CAPACITY_BRACKETED_BY_BLOCK: 'capacity.bracketedByBlock',
  CAPACITY_CORRECT_THROUGHPUT:
    'capacity.perBlockCorrectThroughputPerSecond',
  CAPACITY_MAX_SLO_OFFERED_LOAD:
    'capacity.perBlockMaxSloOfferedLoadPerSecond',
  CAPACITY_TAIL_SUFFICIENT: 'capacity.tailSufficientByBlock',
  COMPARATOR_ID: 'comparatorId',
  DATASET_SKEW: 'datasetSkew',
  DRIFT_METRIC: 'driftMetric',
  DRIFT_WITNESS_METRIC: 'driftWitness.metric',
  SIDE_ID: 'sideId',
});

function fail(reason) {
  throw new TypeError(`invalid reusable comparator: ${reason}`);
}

function primitiveText(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${name}:primitive_text_required`);
  }
  return value;
}

function copyDigestArray(values, name) {
  if (!isDenseDataArray(values) || values.length === 0) {
    fail(`${name}:non_empty_dense_array_required`);
  }
  const copy = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!isSha256Digest(values[index])) {
      fail(`${name}.${index}:sha256_required`);
    }
    appendOwnArrayValue(copy, values[index]);
  }
  return objectFreeze(copy);
}

function copyNumberArray(values, name) {
  if (!isDenseDataArray(values) || values.length === 0) {
    fail(`${name}:non_empty_dense_array_required`);
  }
  const copy = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!isNonNegativeSafeNumber(values[index])) {
      fail(`${name}.${index}:non_negative_safe_number_required`);
    }
    appendOwnArrayValue(copy, values[index]);
  }
  return objectFreeze(copy);
}

function copyBooleanArray(values, name) {
  if (!isDenseDataArray(values) || values.length === 0) {
    fail(`${name}:non_empty_dense_array_required`);
  }
  const copy = [];
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== 'boolean') {
      fail(`${name}.${index}:boolean_required`);
    }
    appendOwnArrayValue(copy, values[index]);
  }
  return objectFreeze(copy);
}

function everyTrue(values) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== true) return false;
  }
  return true;
}

function copyCompatibility(input) {
  if (!hasExactOwnDataKeys(input, COMPATIBILITY_KEYS)) {
    fail(ERROR.COMPATIBILITY_EXACT_OWN_DATA_REQUIRED);
  }
  const digestFields = [
    'datasetDigest',
    'operationManifestDigest',
    'semanticOracleDigest',
    'postgresImageDigest',
    'postgresVersionDigest',
    'postgresConfigDigest',
    'querySqlDigest',
    'queryPlanDigest',
    'replicationStateDigest',
    'resourceEnvelopeDigest',
    'hostEnvelopeDigest',
    'preregistrationDigest',
    'measurementSourceDigest',
  ];
  for (let index = 0; index < digestFields.length; index += 1) {
    if (!isSha256Digest(input[digestFields[index]])) {
      fail(`compatibility.${digestFields[index]}:sha256_required`);
    }
  }
  if (
    !isNonNegativeSafeInteger(input.datasetCardinality) ||
    input.datasetCardinality === 0 ||
    !isNonNegativeSafeInteger(input.replicationFactor) ||
    input.replicationFactor === 0
  ) {
    fail(ERROR.COMPATIBILITY_POSITIVE_INTEGER_IDENTITY_REQUIRED);
  }
  return objectFreeze({
    datasetDigest: input.datasetDigest,
    datasetCardinality: input.datasetCardinality,
    datasetSkew:
      primitiveText(input.datasetSkew, FIELD_NAME.DATASET_SKEW),
    operationManifestDigest: input.operationManifestDigest,
    semanticOracleDigest: input.semanticOracleDigest,
    postgresImageDigest: input.postgresImageDigest,
    postgresVersionDigest: input.postgresVersionDigest,
    postgresConfigDigest: input.postgresConfigDigest,
    querySqlDigest: input.querySqlDigest,
    queryPlanDigest: input.queryPlanDigest,
    replicationFactor: input.replicationFactor,
    replicationStateDigest: input.replicationStateDigest,
    resourceEnvelopeDigest: input.resourceEnvelopeDigest,
    hostEnvelopeDigest: input.hostEnvelopeDigest,
    preregistrationDigest: input.preregistrationDigest,
    measurementSourceDigest: input.measurementSourceDigest,
  });
}

function copyCapacitySeries(input) {
  if (
    !hasExactOwnDataKeys(input, CAPACITY_INPUT_KEYS) ||
    !hasExactOwnDataKeys(
      input.confidenceInterval,
      CONFIDENCE_INTERVAL_KEYS,
    )
  ) {
    fail(ERROR.CAPACITY_EXACT_OWN_DATA_REQUIRED);
  }
  return {
    correct: copyNumberArray(
      input.perBlockCorrectThroughputPerSecond,
      FIELD_NAME.CAPACITY_CORRECT_THROUGHPUT,
    ),
    offered: copyNumberArray(
      input.perBlockMaxSloOfferedLoadPerSecond,
      FIELD_NAME.CAPACITY_MAX_SLO_OFFERED_LOAD,
    ),
    tail: copyBooleanArray(
      input.tailSufficientByBlock,
      FIELD_NAME.CAPACITY_TAIL_SUFFICIENT,
    ),
    bracketedByBlock: copyBooleanArray(
      input.bracketedByBlock,
      FIELD_NAME.CAPACITY_BRACKETED_BY_BLOCK,
    ),
  };
}

function assertCapacityBlockBounds(input) {
  if (
    !isNonNegativeSafeInteger(input.completedBlocks) ||
    !isNonNegativeSafeInteger(input.minimumBlocks) ||
    !isNonNegativeSafeInteger(input.maximumBlocks)
  ) {
    fail(ERROR.CAPACITY_BLOCK_BOUNDS_OR_COUNTS_INVALID);
  }
  if (
    input.minimumBlocks === 0 ||
    input.completedBlocks < input.minimumBlocks ||
    input.completedBlocks > input.maximumBlocks
  ) fail(ERROR.CAPACITY_BLOCK_BOUNDS_OR_COUNTS_INVALID);
}

function assertCapacitySeriesCounts(input, series) {
  if (
    series.correct.length !== input.completedBlocks ||
    series.offered.length !== input.completedBlocks ||
    series.tail.length !== input.completedBlocks ||
    series.bracketedByBlock.length !== input.completedBlocks
  ) {
    fail(ERROR.CAPACITY_BLOCK_BOUNDS_OR_COUNTS_INVALID);
  }
}

function assertCapacityInterval(input) {
  const interval = input.confidenceInterval;
  if (
    !isNonNegativeSafeNumber(input.estimate) ||
    !isNonNegativeSafeNumber(interval.lower) ||
    !isNonNegativeSafeNumber(interval.upper) ||
    interval.lower > input.estimate ||
    interval.upper < input.estimate ||
    (
      input.estimate === 0 &&
      (interval.lower !== 0 || interval.upper !== 0)
    ) ||
    !isNonNegativeSafeNumber(input.targetRelativeCiWidth) ||
    input.targetRelativeCiWidth === 0
  ) {
    fail(ERROR.CAPACITY_INTERVAL_OR_PRECISION_INVALID);
  }
}

function deriveCapacity(input) {
  const series = copyCapacitySeries(input);
  assertCapacityBlockBounds(input);
  assertCapacitySeriesCounts(input, series);
  assertCapacityInterval(input);
  const interval = input.confidenceInterval;
  const relativeIntervalWidth = input.estimate === 0 ?
    Number.MAX_SAFE_INTEGER :
    (interval.upper - interval.lower) / input.estimate;
  if (!isNonNegativeSafeNumber(relativeIntervalWidth)) {
    fail(ERROR.CAPACITY_RELATIVE_INTERVAL_WIDTH_INVALID);
  }
  const tailSufficient = everyTrue(series.tail);
  const bracketed = everyTrue(series.bracketedByBlock);
  const precisionReached =
    input.estimate > 0 &&
    relativeIntervalWidth <= input.targetRelativeCiWidth;
  const reusable =
    input.completedBlocks >= input.minimumBlocks &&
    tailSufficient &&
    bracketed &&
    precisionReached;
  return objectFreeze({
    estimate: input.estimate,
    confidenceInterval: objectFreeze({
      lower: interval.lower,
      upper: interval.upper,
    }),
    perBlockCorrectThroughputPerSecond: series.correct,
    perBlockMaxSloOfferedLoadPerSecond: series.offered,
    tailSufficientByBlock: series.tail,
    bracketedByBlock: series.bracketedByBlock,
    minimumBlocks: input.minimumBlocks,
    maximumBlocks: input.maximumBlocks,
    completedBlocks: input.completedBlocks,
    targetRelativeCiWidth: input.targetRelativeCiWidth,
    relativeIntervalWidth,
    tailSufficient,
    bracketed,
    precisionReached,
    reusable,
  });
}

function inspectCapacity(capacity) {
  if (!hasExactOwnDataKeys(capacity, CAPACITY_KEYS)) return false;
  const input = {};
  for (let index = 0; index < CAPACITY_INPUT_KEYS.length; index += 1) {
    const key = CAPACITY_INPUT_KEYS[index];
    input[key] = capacity[key];
  }
  try {
    const derived = deriveCapacity(input);
    return digestBenchmarkSemanticData(derived) ===
      digestBenchmarkSemanticData(capacity);
  } catch {
    return false;
  }
}

function buildEvidence(input) {
  if (!hasExactOwnDataKeys(input, EVIDENCE_INPUT_KEYS)) {
    fail(ERROR.EVIDENCE_EXACT_OWN_DATA_REQUIRED);
  }
  const sampleDigests =
    copyDigestArray(input.sampleDigests, 'evidence.sampleDigests');
  const windowReceiptDigests =
    copyDigestArray(
      input.windowReceiptDigests,
      'evidence.windowReceiptDigests',
    );
  const resourceReceiptDigests =
    copyDigestArray(
      input.resourceReceiptDigests,
      'evidence.resourceReceiptDigests',
    );
  if (
    sampleDigests.length > windowReceiptDigests.length ||
    windowReceiptDigests.length !== resourceReceiptDigests.length
  ) {
    fail(ERROR.EVIDENCE_WINDOW_RESOURCE_CARDINALITY_MISMATCH);
  }
  const body = objectFreeze({
    sampleDigests,
    windowReceiptDigests,
    resourceReceiptDigests,
  });
  return objectFreeze({
    sampleDigests: body.sampleDigests,
    windowReceiptDigests: body.windowReceiptDigests,
    resourceReceiptDigests: body.resourceReceiptDigests,
    evidenceRootDigest: digestBenchmarkSemanticData(body),
  });
}

function inspectEvidence(evidence) {
  if (!hasExactOwnDataKeys(evidence, EVIDENCE_KEYS)) return false;
  try {
    const rebuilt = buildEvidence({
      sampleDigests: evidence.sampleDigests,
      windowReceiptDigests: evidence.windowReceiptDigests,
      resourceReceiptDigests: evidence.resourceReceiptDigests,
    });
    return rebuilt.evidenceRootDigest === evidence.evidenceRootDigest;
  } catch {
    return false;
  }
}

function copyRevalidationPolicy(input) {
  if (!hasExactOwnDataKeys(input, REVALIDATION_POLICY_KEYS)) {
    fail(ERROR.POLICY_EXACT_OWN_DATA_REQUIRED);
  }
  if (
    !isNonNegativeSafeNumber(input.baselineValue) ||
    input.baselineValue === 0 ||
    !isNonNegativeSafeNumber(input.maximumRelativeDrift) ||
    input.maximumRelativeDrift === 0 ||
    input.maximumRelativeDrift >= 1
  ) {
    fail(ERROR.POLICY_NUMERIC_BOUNDS_INVALID);
  }
  return objectFreeze({
    driftMetric:
      primitiveText(input.driftMetric, FIELD_NAME.DRIFT_METRIC),
    baselineValue: input.baselineValue,
    maximumRelativeDrift: input.maximumRelativeDrift,
  });
}

function artifactBody(input) {
  if (!isSha256Digest(input.protocolReportDigest)) {
    fail(ERROR.PROTOCOL_REPORT_DIGEST_INVALID);
  }
  const compatibility = copyCompatibility(input.compatibility);
  const capacity = deriveCapacity(input.capacity);
  const evidence = buildEvidence(input.evidence);
  const revalidationPolicy =
    copyRevalidationPolicy(input.revalidationPolicy);
  if (
    !isNonNegativeSafeInteger(input.capturedAtMs) ||
    !isNonNegativeSafeInteger(input.validUntilMs) ||
    input.validUntilMs <= input.capturedAtMs
  ) {
    fail(ERROR.VALIDITY_INTERVAL_INVALID);
  }
  return objectFreeze({
    version: VERSION,
    claimEligible: CLAIM_ELIGIBLE,
    comparatorId:
      primitiveText(input.comparatorId, FIELD_NAME.COMPARATOR_ID),
    sideId: primitiveText(input.sideId, FIELD_NAME.SIDE_ID),
    protocolReportDigest: input.protocolReportDigest,
    compatibility,
    compatibilityDigest: digestBenchmarkSemanticData(compatibility),
    capacity,
    evidence,
    revalidationPolicy,
    capturedAtMs: input.capturedAtMs,
    validUntilMs: input.validUntilMs,
  });
}

export function createBenchmarkCapacityReusableComparator(input) {
  const body = artifactBody(input);
  return objectFreeze({
    version: body.version,
    claimEligible: body.claimEligible,
    comparatorId: body.comparatorId,
    sideId: body.sideId,
    protocolReportDigest: body.protocolReportDigest,
    compatibility: body.compatibility,
    compatibilityDigest: body.compatibilityDigest,
    capacity: body.capacity,
    evidence: body.evidence,
    revalidationPolicy: body.revalidationPolicy,
    capturedAtMs: body.capturedAtMs,
    validUntilMs: body.validUntilMs,
    artifactDigest: digestBenchmarkSemanticData(body),
  });
}

function comparatorIdentityIsValid(artifact) {
  return (
    !hasExactOwnDataKeys(artifact, ARTIFACT_KEYS) ||
    artifact.version !== VERSION ||
    artifact.claimEligible !== CLAIM_ELIGIBLE ||
    typeof artifact.comparatorId !== 'string' ||
    artifact.comparatorId.length === 0 ||
    typeof artifact.sideId !== 'string' ||
    artifact.sideId.length === 0 ||
    !isSha256Digest(artifact.protocolReportDigest)
  ) === false;
}

function comparatorDerivedFieldsAreValid(artifact, compatibility) {
  if (
    artifact.compatibilityDigest !==
      digestBenchmarkSemanticData(compatibility) ||
    !inspectCapacity(artifact.capacity) ||
    !inspectEvidence(artifact.evidence)
  ) return false;
  return (
    isNonNegativeSafeInteger(artifact.capturedAtMs) &&
    isNonNegativeSafeInteger(artifact.validUntilMs) &&
    artifact.validUntilMs > artifact.capturedAtMs &&
    isSha256Digest(artifact.artifactDigest)
  );
}

function copyComparatorContracts(artifact) {
  try {
    return {
      compatibility: copyCompatibility(artifact.compatibility),
      policy: copyRevalidationPolicy(artifact.revalidationPolicy),
    };
  } catch {
    return null;
  }
}

export function inspectBenchmarkCapacityReusableComparator(artifact) {
  if (!comparatorIdentityIsValid(artifact)) {
    return objectFreeze({valid: false, reason: REASON.ARTIFACT_INVALID});
  }
  const contracts = copyComparatorContracts(artifact);
  if (
    contracts === null ||
    !comparatorDerivedFieldsAreValid(
      artifact,
      contracts.compatibility,
    )
  ) {
    return objectFreeze({valid: false, reason: REASON.ARTIFACT_INVALID});
  }
  const body = {};
  for (let index = 0; index < ARTIFACT_BODY_KEYS.length; index += 1) {
    const key = ARTIFACT_BODY_KEYS[index];
    body[key] = artifact[key];
  }
  if (digestBenchmarkSemanticData(body) !== artifact.artifactDigest) {
    return objectFreeze({valid: false, reason: REASON.ARTIFACT_INVALID});
  }
  return objectFreeze({
    valid: true,
    reason: null,
    compatibility: contracts.compatibility,
    policy: contracts.policy,
  });
}

export function createBenchmarkCapacityComparatorDriftWitness(input) {
  if (
    !hasExactOwnDataKeys(input, DRIFT_WITNESS_INPUT_KEYS) ||
    !isNonNegativeSafeNumber(input.baselineValue) ||
    input.baselineValue === 0 ||
    !isNonNegativeSafeNumber(input.observedValue)
  ) {
    fail(ERROR.DRIFT_WITNESS_INVALID);
  }
  const body = objectFreeze({
    metric:
      primitiveText(input.metric, FIELD_NAME.DRIFT_WITNESS_METRIC),
    baselineValue: input.baselineValue,
    observedValue: input.observedValue,
  });
  return objectFreeze({
    metric: body.metric,
    baselineValue: body.baselineValue,
    observedValue: body.observedValue,
    witnessDigest: digestBenchmarkSemanticData(body),
  });
}

function inspectDriftWitness(witness, policy) {
  if (!hasExactOwnDataKeys(witness, DRIFT_WITNESS_KEYS)) return null;
  let rebuilt;
  try {
    rebuilt = createBenchmarkCapacityComparatorDriftWitness({
      metric: witness.metric,
      baselineValue: witness.baselineValue,
      observedValue: witness.observedValue,
    });
  } catch {
    return null;
  }
  if (
    rebuilt.witnessDigest !== witness.witnessDigest ||
    witness.metric !== policy.driftMetric ||
    witness.baselineValue !== policy.baselineValue
  ) {
    return null;
  }
  return mathAbs(witness.observedValue - witness.baselineValue) /
    mathMax(witness.baselineValue, Number.MIN_VALUE);
}

function createRevalidationFindings() {
  return [];
}

export function revalidateBenchmarkCapacityReusableComparator({
  artifact,
  expectedCompatibility,
  driftWitness,
  nowMs,
}) {
  const decisionFindings = createRevalidationFindings();
  const inspection =
    inspectBenchmarkCapacityReusableComparator(artifact);
  if (!inspection.valid) {
    appendOwnArrayValue(decisionFindings, REASON.ARTIFACT_INVALID);
  } else {
    let compatibilityDigest = null;
    try {
      compatibilityDigest = digestBenchmarkSemanticData(
        copyCompatibility(expectedCompatibility),
      );
    } catch {
      compatibilityDigest = null;
    }
    if (compatibilityDigest !== artifact.compatibilityDigest) {
      appendOwnArrayValue(
        decisionFindings,
        REASON.COMPATIBILITY_MISMATCH,
      );
    }
    if (!artifact.capacity.reusable) {
      appendOwnArrayValue(
        decisionFindings,
        REASON.NOT_OBJECTIVELY_SUFFICIENT,
      );
    }
    if (
      !isNonNegativeSafeInteger(nowMs) ||
      nowMs < artifact.capturedAtMs
    ) {
      appendOwnArrayValue(
        decisionFindings,
        REASON.CLOCK_PRECEDES_CAPTURE,
      );
    } else if (nowMs > artifact.validUntilMs) {
      appendOwnArrayValue(decisionFindings, REASON.EXPIRED);
    }
    const relativeDrift =
      inspectDriftWitness(driftWitness, inspection.policy);
    if (relativeDrift === null) {
      appendOwnArrayValue(
        decisionFindings,
        REASON.DRIFT_WITNESS_INVALID,
      );
    } else if (
      relativeDrift > inspection.policy.maximumRelativeDrift
    ) {
      appendOwnArrayValue(decisionFindings, REASON.DRIFT_EXCEEDED);
    }
  }
  return objectFreeze({
    state: decisionFindings.length === 0 ?
      REVALIDATION_REUSABLE :
      REVALIDATION_CAPTURE_REQUIRED,
    artifactDigest:
      inspection.valid ? artifact.artifactDigest : null,
    reasons: objectFreeze(decisionFindings),
  });
}

export const BENCHMARK_CAPACITY_REUSABLE_COMPARATOR = objectFreeze({
  VERSION,
  CLAIM_ELIGIBLE,
  REVALIDATION_REUSABLE,
  REVALIDATION_CAPTURE_REQUIRED,
});
