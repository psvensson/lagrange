import {
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
  isSha256Digest,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_CACHE_POLICY,
  BENCHMARK_CAPACITY_CACHE_RESET_RECEIPT_VERSION,
  BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS,
  BENCHMARK_CAPACITY_RECEIPT_CLOCK,
  BENCHMARK_CAPACITY_RECEIPT_INTERVAL,
  BENCHMARK_CAPACITY_RESET_PHASE,
} from './benchmark-capacity-protocol-constants.js';
import {
  deriveBenchmarkCapacityExpectedWindow,
} from './benchmark-capacity-preregistration.js';

const INPUT_KEYS = [
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'offeredLoad',
  'startedAt',
  'endedAt',
  'policy',
  'liveEngagementDigest',
];
const RECEIPT_KEYS = [
  'version',
  'matrixId',
  'cellId',
  'cellManifestDigest',
  'profileIdentity',
  'pairIdentity',
  'runId',
  'liveEnvironmentContractDigest',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'clock',
  'interval',
  'startedAt',
  'endedAt',
  'policy',
  'liveEngagementDigest',
  'resetReceiptDigest',
];
const objectFreeze = Object.freeze;
const COORDINATE_FIELD_COUNT = 4;
const localText = objectFreeze({
  LIVE_ENGAGEMENT_DIGEST:
    'liveEngagementDigest:sha256_digest_required',
  OFFERED_LOAD: 'offeredLoad:positive_safe_number_required',
  POLICY_UNSUPPORTED: 'policy:unsupported',
  RESET_DIGEST_MISMATCH: 'reset_receipt_digest_mismatch',
  RESET_FIELDS_INVALID: 'reset_receipt_fields_invalid',
  RESET_SHAPE_INVALID: 'reset_receipt_shape_invalid',
  ROOT_SHAPE: 'root:exact_plain_data_record_required',
  SIDE_ID: 'sideId:primitive_text_required',
  TIME_POSITIVE: 'time_window:positive_coverage_required',
  VALID: 'valid',
});

function fail(reason) {
  throw new TypeError(`invalid capacity cache reset receipt: ${reason}`);
}

function inputFromReceipt(receipt) {
  return {
    blockIndex: receipt.blockIndex,
    blockedOrderIndex: receipt.blockedOrderIndex,
    sideId: receipt.sideId,
    offeredLoad: receipt.offeredLoad,
    startedAt: receipt.startedAt,
    endedAt: receipt.endedAt,
    policy: receipt.policy,
    liveEngagementDigest: receipt.liveEngagementDigest,
  };
}

function receiptBody(receipt) {
  const body = {};
  for (let index = 0; index < RECEIPT_KEYS.length - 1; index += 1) {
    const key = RECEIPT_KEYS[index];
    body[key] = receipt[key];
  }
  return body;
}

export function createBenchmarkCapacityCacheResetReceipt(
  input,
  preregistration,
) {
  if (!hasExactOwnDataKeys(input, INPUT_KEYS)) {
    fail(localText.ROOT_SHAPE);
  }
  if (
    typeof input.sideId !== 'string' ||
    input.sideId.length === 0 ||
    input.sideId.length > BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS
  ) {
    fail(localText.SIDE_ID);
  }
  for (let index = 0; index < COORDINATE_FIELD_COUNT; index += 1) {
    const field = [
      'blockIndex',
      'blockedOrderIndex',
      'startedAt',
      'endedAt',
    ][index];
    if (!isNonNegativeSafeInteger(input[field])) {
      fail(`${field}:non_negative_safe_integer_required`);
    }
  }
  if (
    !isNonNegativeSafeNumber(input.offeredLoad) ||
    input.offeredLoad === 0
  ) {
    fail(localText.OFFERED_LOAD);
  }
  if (input.endedAt <= input.startedAt) {
    fail(localText.TIME_POSITIVE);
  }
  if (input.policy !== BENCHMARK_CAPACITY_CACHE_POLICY) {
    fail(localText.POLICY_UNSUPPORTED);
  }
  if (!isSha256Digest(input.liveEngagementDigest)) {
    fail(localText.LIVE_ENGAGEMENT_DIGEST);
  }
  const expected = deriveBenchmarkCapacityExpectedWindow(
    preregistration,
    {
      blockIndex: input.blockIndex,
      blockedOrderIndex: input.blockedOrderIndex,
      sideId: input.sideId,
      offeredLoad: input.offeredLoad,
      phase: BENCHMARK_CAPACITY_RESET_PHASE,
    },
  );
  const body = {
    version: BENCHMARK_CAPACITY_CACHE_RESET_RECEIPT_VERSION,
    matrixId: expected.matrixId,
    cellId: expected.cellId,
    cellManifestDigest: expected.cellManifestDigest,
    profileIdentity: expected.profileIdentity,
    pairIdentity: expected.pairIdentity,
    runId: expected.runId,
    liveEnvironmentContractDigest:
      expected.liveEnvironmentContractDigest,
    blockIndex: input.blockIndex,
    blockedOrderIndex: input.blockedOrderIndex,
    sideId: input.sideId,
    phase: BENCHMARK_CAPACITY_RESET_PHASE,
    offeredLoad: input.offeredLoad,
    clock: BENCHMARK_CAPACITY_RECEIPT_CLOCK,
    interval: BENCHMARK_CAPACITY_RECEIPT_INTERVAL,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    policy: input.policy,
    liveEngagementDigest: input.liveEngagementDigest,
  };
  return objectFreeze({
    ...body,
    resetReceiptDigest: digestBenchmarkSemanticData(body),
  });
}

export function inspectBenchmarkCapacityCacheResetReceipt(
  receipt,
  preregistration,
) {
  if (!hasExactOwnDataKeys(receipt, RECEIPT_KEYS)) {
    return {valid: false, reason: localText.RESET_SHAPE_INVALID};
  }
  try {
    const reconstructed = createBenchmarkCapacityCacheResetReceipt(
      inputFromReceipt(receipt),
      preregistration,
    );
    const valid =
      receipt.version === BENCHMARK_CAPACITY_CACHE_RESET_RECEIPT_VERSION &&
      receipt.phase === BENCHMARK_CAPACITY_RESET_PHASE &&
      receipt.clock === BENCHMARK_CAPACITY_RECEIPT_CLOCK &&
      receipt.interval === BENCHMARK_CAPACITY_RECEIPT_INTERVAL &&
      isSha256Digest(receipt.resetReceiptDigest) &&
      digestBenchmarkSemanticData(receiptBody(receipt)) ===
        receipt.resetReceiptDigest &&
      reconstructed.resetReceiptDigest === receipt.resetReceiptDigest;
    return {
      valid,
      reason: valid ?
        localText.VALID :
        localText.RESET_DIGEST_MISMATCH,
    };
  } catch {
    return {valid: false, reason: localText.RESET_FIELDS_INVALID};
  }
}
