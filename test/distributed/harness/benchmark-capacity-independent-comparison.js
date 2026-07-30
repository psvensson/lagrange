import {
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
  isSha256Digest,
} from './benchmark-semantic-integrity.js';

const VERSION = 'benchmark-capacity-independent-comparison-v1';
const CAPACITY_KEYS = Object.freeze([
  'estimate',
  'confidenceInterval',
  'completedBlocks',
]);
const INTERVAL_KEYS = Object.freeze(['lower', 'upper']);
const INPUT_KEYS = Object.freeze([
  'numeratorSideId',
  'numeratorCapacity',
  'numeratorEvidenceDigest',
  'denominatorSideId',
  'denominatorCapacity',
  'denominatorEvidenceDigest',
]);
const SAMPLE_RELATION = 'independent_noncontemporaneous';
const ESTIMATOR = 'ratio_of_independent_capacity_medians';
const INTERVAL_METHOD = 'conservative_endpoint_ratio';
const localText = Object.freeze({
  CONTENT_ADDRESSED_EVIDENCE_REQUIRED:
    'content-addressed evidence required',
  DISTINCT_SIDES_REQUIRED: 'distinct sides required',
  EXACT_OWN_DATA_INPUT_REQUIRED: 'exact own-data input required',
});

function fail(reason) {
  throw new TypeError(`invalid independent capacity comparison: ${reason}`);
}

function primitiveSideId(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${name}:primitive side identifier required`);
  }
  return value;
}

function copyCapacity(capacity, name) {
  if (
    !hasExactOwnDataKeys(capacity, CAPACITY_KEYS) ||
    !hasExactOwnDataKeys(capacity.confidenceInterval, INTERVAL_KEYS) ||
    !isNonNegativeSafeNumber(capacity.estimate) ||
    capacity.estimate === 0 ||
    !isNonNegativeSafeNumber(capacity.confidenceInterval.lower) ||
    capacity.confidenceInterval.lower === 0 ||
    !isNonNegativeSafeNumber(capacity.confidenceInterval.upper) ||
    capacity.confidenceInterval.lower > capacity.estimate ||
    capacity.confidenceInterval.upper < capacity.estimate ||
    !isNonNegativeSafeInteger(capacity.completedBlocks) ||
    capacity.completedBlocks === 0
  ) {
    fail(`${name}:positive finite capacity interval required`);
  }
  return Object.freeze({
    estimate: capacity.estimate,
    confidenceInterval: Object.freeze({
      lower: capacity.confidenceInterval.lower,
      upper: capacity.confidenceInterval.upper,
    }),
    completedBlocks: capacity.completedBlocks,
  });
}

function safeRatio(numerator, denominator, name) {
  const ratio = numerator / denominator;
  if (!isNonNegativeSafeNumber(ratio)) {
    fail(`${name}:unsafe ratio`);
  }
  return ratio;
}

export function createBenchmarkCapacityIndependentComparison(input) {
  if (!hasExactOwnDataKeys(input, INPUT_KEYS)) {
    fail(localText.EXACT_OWN_DATA_INPUT_REQUIRED);
  }
  const numeratorSideId =
    primitiveSideId(input.numeratorSideId, 'numeratorSideId');
  const denominatorSideId =
    primitiveSideId(input.denominatorSideId, 'denominatorSideId');
  if (numeratorSideId === denominatorSideId) {
    fail(localText.DISTINCT_SIDES_REQUIRED);
  }
  if (
    !isSha256Digest(input.numeratorEvidenceDigest) ||
    !isSha256Digest(input.denominatorEvidenceDigest)
  ) {
    fail(localText.CONTENT_ADDRESSED_EVIDENCE_REQUIRED);
  }
  const numerator =
    copyCapacity(input.numeratorCapacity, 'numeratorCapacity');
  const denominator =
    copyCapacity(input.denominatorCapacity, 'denominatorCapacity');
  const body = Object.freeze({
    version: VERSION,
    claimEligible: false,
    sampleRelation: SAMPLE_RELATION,
    estimator: ESTIMATOR,
    intervalMethod: INTERVAL_METHOD,
    numeratorSideId,
    denominatorSideId,
    numerator,
    denominator,
    estimate: safeRatio(
      numerator.estimate,
      denominator.estimate,
      'estimate',
    ),
    confidenceInterval: Object.freeze({
      lower: safeRatio(
        numerator.confidenceInterval.lower,
        denominator.confidenceInterval.upper,
        'confidenceInterval.lower',
      ),
      upper: safeRatio(
        numerator.confidenceInterval.upper,
        denominator.confidenceInterval.lower,
        'confidenceInterval.upper',
      ),
    }),
    numeratorEvidenceDigest: input.numeratorEvidenceDigest,
    denominatorEvidenceDigest: input.denominatorEvidenceDigest,
  });
  return Object.freeze({
    ...body,
    comparisonDigest: digestBenchmarkSemanticData(body),
  });
}
