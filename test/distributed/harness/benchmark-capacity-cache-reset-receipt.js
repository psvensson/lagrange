import {
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isNonNegativeSafeInteger,
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
    fail('root:exact_plain_data_record_required');
  }
  if (
    typeof input.sideId !== 'string' ||
    input.sideId.length === 0 ||
    input.sideId.length > BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS
  ) {
    fail('sideId:primitive_text_required');
  }
  for (let index = 0; index < 4; index += 1) {
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
    !isNonNegativeSafeInteger(input.offeredLoad) ||
    input.offeredLoad === 0
  ) {
    fail('offeredLoad:positive_safe_integer_required');
  }
  if (input.endedAt <= input.startedAt) {
    fail('time_window:positive_coverage_required');
  }
  if (input.policy !== BENCHMARK_CAPACITY_CACHE_POLICY) {
    fail('policy:unsupported');
  }
  if (!isSha256Digest(input.liveEngagementDigest)) {
    fail('liveEngagementDigest:sha256_digest_required');
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
    return {valid: false, reason: 'reset_receipt_shape_invalid'};
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
      reason: valid ? 'valid' : 'reset_receipt_digest_mismatch',
    };
  } catch {
    return {valid: false, reason: 'reset_receipt_fields_invalid'};
  }
}
