import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
  isPlainDataRecord,
  isSha256Digest,
} from './benchmark-semantic-integrity.js';
import {
  inspectBenchmarkCapacityRunSample,
} from './benchmark-capacity-run-sample.js';
import {
  buildBenchmarkResultSetEvidence,
  inspectBenchmarkSemanticReceipt,
} from './benchmark-workload-semantics.js';
import {
  deriveBenchmarkCapacityExpectedWindow,
} from './benchmark-capacity-preregistration.js';
const ADAPTER_IDENTITY_KEYS = Object.freeze([
  'adapterId', 'adapterVersion', 'sideId',
  'runtimeKind', 'invocationBoundary', 'operationManifestDigest',
  'executableDigest', 'ownerEvidenceDigest',
]);
const ADAPTER_IDENTITY_RECEIPT_KEYS = Object.freeze([
  ...ADAPTER_IDENTITY_KEYS,
  'adapterIdentityDigest',
]);
const OWNER_RECEIPT_KEYS = Object.freeze([
  'version', 'adapterIdentityDigest', 'sideId',
  'operationIds', 'operationIdsDigest', 'evidenceDigest',
  'semanticOracleDigest', 'correctOperationCount', 'receiptDigest',
]);
const HEADROOM_INPUT_KEYS = Object.freeze([
  'minimumRequiredRatio', 'observerCpu', 'hostCpu',
  'hostMemory', 'sharedNetwork', 'sharedStorage',
]);
const EXTERNAL_HEADROOM_KEYS = Object.freeze([
  'capacity',
  'observedPeak',
]);
const HEADROOM_KEYS = Object.freeze([
  'minimumRequiredRatio',
  'externalEmitter',
  'clientQueue',
  'observerCpu',
  'hostCpu',
  'hostMemory',
  'sharedNetwork',
  'sharedStorage',
  'minimumObservedRatio',
  'eligible',
  'headroomDigest',
]);
const HEADROOM_MEASUREMENT_KEYS = Object.freeze([
  'capacity',
  'observedPeak',
  'headroomRatio',
]);
const OWNER_RECEIPT_INPUT_KEYS = Object.freeze([
  'adapterIdentity',
  'operationIds',
  'evidenceDigest',
  'semanticOracleDigest',
]);
const RECEIPT_INPUT_KEYS = Object.freeze([
  'adapterIdentity',
  'sample',
  'window',
  'ownerReceipt',
  'headroom',
  'preregistration',
]);
const RECEIPT_KEYS = Object.freeze([
  'version',
  'adapterIdentity',
  'adapterIdentityDigest',
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
  'startedAt',
  'endedAt',
  'counts',
  'latencyQuantilesMs',
  'capacitySampleDigest',
  'semanticReceiptDigest',
  'semanticContractDigest',
  'semanticResultSetDigest',
  'ownerReceipt',
  'ownerReceiptDigest',
  'headroom',
  'receiptDigest',
]);
const COUNT_KEYS = Object.freeze([
  'offered',
  'emitted',
  'dispatched',
  'correct',
  'rejected',
  'timedOut',
  'errored',
  'queueOverflow',
]);
const QUANTILE_KEYS = Object.freeze(['p50', 'p95', 'p99']);
const WINDOW_KEYS = Object.freeze([
  'blockedOrderIndex',
  'startedAt',
  'endedAt',
]);
const VERSION =
  'benchmark-capacity-heterogeneous-operation-receipt-v1';
const OWNER_VERSION =
  'benchmark-capacity-adapter-owner-receipt-v1';
const QUANTILE_P50 = 0.50;
const QUANTILE_P95 = 0.95;
const QUANTILE_P99 = 0.99;
const mathCeil = Math.ceil;
const mathMax = Math.max;
const mathMin = Math.min;
const mathTrunc = Math.trunc;
const arrayJoin = Function.call.bind(Array.prototype.join);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const mapGet = Function.call.bind(Map.prototype.get);
const stringSlice = Function.call.bind(String.prototype.slice);
const OPERATION_MANIFEST_VERSION =
  'movielens-capacity-operation-manifest-v2';
const LAGRANGE_OWNER_VERSION =
  'movielens-lagrange-runtime-owner-evidence-v2';
const POSTGRES_OWNER_VERSION =
  'movielens-postgresql-runtime-owner-evidence-v2';
const LAGRANGE_RUNTIME = 'wasm_component';
const POSTGRES_RUNTIME = 'postgresql_16';
const MOVIELENS_METHOD = 'POST';
const MOVIELENS_PATH = '/benchmarks/movielens/grouped-reduce';
const MOVIELENS_ORACLE_VERSION = 'confidence-adjusted-top-ten-v1';
const MOVIELENS_RESPONSE_BODY = 'MovieLens grouped reduce completed';
const MOVIELENS_RESULT = 'confidence_adjusted_top_ten';
const MOVIELENS_DURABILITY =
  'input_preserved_and_result_visible_after_completion';
const MOVIELENS_TOP_N = 10;
const SCORE_SCALE = 1_000_000;
const HTTP_STATUS_OK = 200;
const HTTP_HEADER_ACCEPT = 'accept';
const HTTP_HEADER_CONTENT_TYPE = 'content-type';
const HTTP_ACCEPT_ANY = '*/*';
const HTTP_CONTENT_TYPE_JSON = 'application/json';
const JOURNAL_COMPLETED = 'completed';
const JOURNAL_EMPTY_ERROR = '{}';
const OWNER_EVIDENCE_DIGEST = 'ownerEvidenceDigest';
const OWNER_BINDING_NAME_PATH = 'runtimeOwner.bindingName';
const OWNER_BINDING_VERSION_PATH = 'runtimeOwner.bindingVersionId';
const OWNER_ROUTE_SERVICE_PATH = 'runtimeOwner.routeServiceId';
const POSTGRES_VERSION_PREFIX = 'PostgreSQL 16.';
const POSTGRES_VERSION_PREFIX_LENGTH = 14;
const POSTGRES_VERSION_SQL = 'SELECT version()';
const POSTGRES_PLAN_ROOT = 'QUERY PLAN';
const POSTGRES_PLAN_NODE_TYPE = 'Node Type';
const REPLAY_COORDINATE_SEPARATOR = '\u0000';
const LAGRANGE_OWNER_KEYS = Object.freeze([
  'version', 'bindingName', 'bindingVersionId',
  'datasetDigest', 'executableDigest', 'routeServiceId',
  'runtimeKind', 'semanticOracleExpected', 'operationManifest',
]);
const POSTGRES_OWNER_KEYS = Object.freeze([
  'version', 'imageId', 'imageRepoDigests', 'inputDigest',
  'postgresVersion', 'postgresVersionSql', 'queryPlan',
  'querySql', 'totalRows', 'operationManifest',
]);
const OPERATION_MANIFEST_KEYS = Object.freeze([
  'version', 'datasetDigest', 'lagrangePublicRequest',
  'postgresqlQuerySqlDigest', 'result', 'durability',
]);
const LAGRANGE_PUBLIC_REQUEST_KEYS =
  Object.freeze(['method', 'path']);
const LAGRANGE_EVIDENCE_KEYS = Object.freeze([
  'executableDigest',
  'requestWitness',
  'invocationJournal',
  'httpStatus',
  'durableResult',
  'semanticOracleReceipt',
  'durabilityDigest',
  'durabilityPassed',
  'semanticObservation',
  'semanticOracleDigest',
]);
const POSTGRES_EVIDENCE_KEYS = Object.freeze([
  'requestId',
  'backendPid',
  'imageId',
  'imageRepoDigestsDigest',
  'inputDigest',
  'postgresVersion',
  'queryPlanDigest',
  'querySqlDigest',
  'returnedAggregateRows',
  'durableInputRows',
  'durableResultJson',
  'topMovies',
  'durabilityDigest',
  'durabilityPassed',
  'semanticObservation',
  'semanticOracleDigest',
]);
const REQUEST_WITNESS_KEYS = Object.freeze([
  'bindingVersionId',
  'idempotencyKey',
  'intentDigest',
  'invocationIdentity',
  'normalizedRequest',
  'requestDigest',
  'routeServiceId',
  'tenantId',
]);
const NORMALIZED_REQUEST_KEYS = Object.freeze([
  'body',
  'headers',
  'method',
  'path',
  'query',
]);
const JOURNAL_KEYS = Object.freeze([
  'command',
  'created_at',
  'error',
  'idempotency_key',
  'operation_id',
  'result',
  'state',
  'tenant_id',
  'updated_at',
]);
const ORACLE_RECEIPT_KEYS = Object.freeze([
  'observed',
  'passed',
  'version',
]);
const DURABLE_RESULT_KEYS = Object.freeze(['movieRows', 'scoreRows']);
const RANKING_ROW_KEYS = Object.freeze(['movieId', 'rank', 'scoreMicros']);
const DURABLE_ROW_KEYS = Object.freeze(['key', 'value']);
const POSTGRES_ROW_KEYS = Object.freeze([
  'avgRating',
  'movieId',
  'ratingCount',
  'score',
]);
const SEMANTIC_OBSERVATION_KEYS = Object.freeze([
  'operationId',
  'operation',
  'outcome',
]);
const localText = Object.freeze({
  ADAPTER_IDENTITY_DIGEST_MISMATCH: 'adapterIdentity:digest_mismatch',
  ADAPTER_IDENTITY_EXACT_RECORD:
    'adapterIdentity:exact_plain_data_record_required',
  ADAPTER_IDENTITY_SHAPE_INVALID: 'adapterIdentity:shape_invalid',
  CORRECT: 'correct',
  EMITTED: 'emitted',
  HEADROOM_EXACT_RECORD: 'headroom:exact_plain_data_record_required',
  HEADROOM_INELIGIBLE_OR_DIGEST_MISMATCH:
    'headroom:ineligible_or_digest_mismatch',
  HEADROOM_MINIMUM_REQUIRED_RATIO: 'headroom.minimumRequiredRatio',
  HEADROOM_SAMPLE_INVALID: 'headroom.sample:invalid',
  HEADROOM_SHAPE_INVALID: 'headroom:shape_invalid',
  OWNER_RECEIPT_DIGEST_MISMATCH: 'ownerReceipt:digest_mismatch',
  OWNER_RECEIPT_EVIDENCE_DIGEST: 'ownerReceipt.evidenceDigest',
  OWNER_RECEIPT_EXACT_RECORD:
    'ownerReceipt:exact_plain_data_record_required',
  OWNER_RECEIPT_IDENTITY_OR_COUNT_MISMATCH:
    'ownerReceipt:identity_or_count_mismatch',
  OWNER_RECEIPT_OPERATION_IDS_DENSE:
    'ownerReceipt.operationIds:dense_array_required',
  OWNER_RECEIPT_OPERATION_IDS_MISMATCH:
    'ownerReceipt:operation_ids_mismatch',
  OWNER_RECEIPT_RECEIPT_DIGEST: 'ownerReceipt.receiptDigest',
  OWNER_RECEIPT_SEMANTIC_ORACLE_DIGEST:
    'ownerReceipt.semanticOracleDigest',
  OWNER_RECEIPT_SHAPE_INVALID: 'ownerReceipt:shape_invalid',
  OPERATION_MANIFEST_DIGEST: 'operationManifestDigest',
  POSTGRES_OPERATION_EVIDENCE: 'postgres_operation',
  POSTGRES_OWNER_EVIDENCE: 'postgres_owner',
  EXECUTABLE_DIGEST: 'executableDigest',
  RECEIPT_C2_SEMANTIC_INVALID: 'receipt:c2_semantic_receipt_invalid',
  RECEIPT_COUNTS_INVALID: 'receipt:counts_invalid',
  RECEIPT_DIGEST: 'receipt.receiptDigest',
  RECEIPT_DIGEST_MISMATCH: 'receipt:digest_mismatch',
  RECEIPT_EXACT_RECORD: 'receipt:exact_plain_data_record_required',
  RECEIPT_OBSERVATION_INVALID:
    'heterogeneous capacity observation invalid',
  RECEIPT_OPERATION_EVIDENCE_INVALID:
    'receipt:operation_evidence_invalid',
  RECEIPT_OWNER_SAMPLE_WINDOW_MISMATCH:
    'receipt:owner_sample_window_identity_mismatch',
  RECEIPT_QUANTILES_INVALID: 'receipt:quantiles_invalid',
  RECEIPT_SHAPE_OR_VERSION_INVALID:
    'receipt:shape_or_version_invalid',
  RECEIPT_VALID: 'valid',
  RECEIPT_WINDOW_SHAPE_INVALID: 'receipt:window_shape_invalid',
  SEMANTIC_PASS: 'pass',
});
const objectFreeze = Object.freeze;

function fail(reason) {
  throw new TypeError(
    `invalid heterogeneous capacity observation: ${reason}`,
  );
}

function assertText(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${path}:primitive_text_required`);
  }
}

function assertDigest(value, path) {
  if (!isSha256Digest(value)) fail(`${path}:sha256_digest_required`);
}

function assertRatio(value, path) {
  if (
    !isNonNegativeSafeNumber(value) ||
    value > 1
  ) {
    fail(`${path}:ratio_required`);
  }
}

function identityBody(value) {
  const body = {};
  for (let index = 0; index < ADAPTER_IDENTITY_KEYS.length; index += 1) {
    const key = ADAPTER_IDENTITY_KEYS[index];
    body[key] = value[key];
  }
  return body;
}

function isAdapterDigestField(key) {
  return key === localText.OPERATION_MANIFEST_DIGEST ||
    key === localText.EXECUTABLE_DIGEST ||
    key === OWNER_EVIDENCE_DIGEST;
}

export function createBenchmarkCapacityAdapterIdentity(input) {
  if (
    !isPlainDataRecord(input) ||
    !hasExactOwnDataKeys(input, ADAPTER_IDENTITY_KEYS)
  ) {
    fail(localText.ADAPTER_IDENTITY_EXACT_RECORD);
  }
  for (let index = 0; index < ADAPTER_IDENTITY_KEYS.length; index += 1) {
    const key = ADAPTER_IDENTITY_KEYS[index];
    if (isAdapterDigestField(key)) {
      assertDigest(input[key], `adapterIdentity.${key}`);
    } else {
      assertText(input[key], `adapterIdentity.${key}`);
    }
  }
  const body = identityBody(input);
  return objectFreeze({
    ...body,
    adapterIdentityDigest: digestBenchmarkSemanticData(body),
  });
}

function inspectAdapterIdentity(value) {
  if (!hasExactOwnDataKeys(value, ADAPTER_IDENTITY_RECEIPT_KEYS)) {
    fail(localText.ADAPTER_IDENTITY_SHAPE_INVALID);
  }
  const reconstructed = createBenchmarkCapacityAdapterIdentity(
    identityBody(value),
  );
  if (
    reconstructed.adapterIdentityDigest !==
      value.adapterIdentityDigest
  ) {
    fail(localText.ADAPTER_IDENTITY_DIGEST_MISMATCH);
  }
  return reconstructed;
}

function ownerReceiptBody(receipt) {
  const body = {};
  for (let index = 0; index < OWNER_RECEIPT_KEYS.length - 1; index += 1) {
    const key = OWNER_RECEIPT_KEYS[index];
    body[key] = receipt[key];
  }
  return body;
}

function ownerReceiptMatchesIdentity(receipt, identity, sample) {
  return receipt.version === OWNER_VERSION &&
    receipt.adapterIdentityDigest === identity.adapterIdentityDigest &&
    receipt.sideId === identity.sideId &&
    receipt.sideId === sample.sideId &&
    isDenseDataArray(receipt.operationIds) &&
    isNonNegativeSafeInteger(receipt.correctOperationCount) &&
    receipt.correctOperationCount === sample.counts.correct;
}

function inspectOwnerReceipt(receipt, identity, sample) {
  if (!hasExactOwnDataKeys(receipt, OWNER_RECEIPT_KEYS)) {
    fail(localText.OWNER_RECEIPT_SHAPE_INVALID);
  }
  if (!ownerReceiptMatchesIdentity(receipt, identity, sample)) {
    fail(localText.OWNER_RECEIPT_IDENTITY_OR_COUNT_MISMATCH);
  }
  const operationIds = [];
  for (let index = 0; index < receipt.operationIds.length; index += 1) {
    assertText(receipt.operationIds[index], `ownerReceipt.operationIds.${index}`);
    appendOwnArrayValue(operationIds, receipt.operationIds[index]);
  }
  if (
    operationIds.length !== sample.counts.correct ||
    digestBenchmarkSemanticData(operationIds) !==
      receipt.operationIdsDigest
  ) {
    fail(localText.OWNER_RECEIPT_OPERATION_IDS_MISMATCH);
  }
  assertDigest(
    receipt.evidenceDigest,
    localText.OWNER_RECEIPT_EVIDENCE_DIGEST,
  );
  assertDigest(
    receipt.semanticOracleDigest,
    localText.OWNER_RECEIPT_SEMANTIC_ORACLE_DIGEST,
  );
  assertDigest(
    receipt.receiptDigest,
    localText.OWNER_RECEIPT_RECEIPT_DIGEST,
  );
  if (
    digestBenchmarkSemanticData(ownerReceiptBody(receipt)) !==
      receipt.receiptDigest
  ) {
    fail(localText.OWNER_RECEIPT_DIGEST_MISMATCH);
  }
}

export function createBenchmarkCapacityAdapterOwnerReceipt(input) {
  if (
    !isPlainDataRecord(input) ||
    !hasExactOwnDataKeys(input, OWNER_RECEIPT_INPUT_KEYS)
  ) {
    fail(localText.OWNER_RECEIPT_EXACT_RECORD);
  }
  const identity = inspectAdapterIdentity(input.adapterIdentity);
  if (!isDenseDataArray(input.operationIds)) {
    fail(localText.OWNER_RECEIPT_OPERATION_IDS_DENSE);
  }
  const operationIds = [];
  for (let index = 0; index < input.operationIds.length; index += 1) {
    assertText(input.operationIds[index], `ownerReceipt.operationIds.${index}`);
    appendOwnArrayValue(operationIds, input.operationIds[index]);
  }
  assertDigest(
    input.evidenceDigest,
    localText.OWNER_RECEIPT_EVIDENCE_DIGEST,
  );
  assertDigest(
    input.semanticOracleDigest,
    localText.OWNER_RECEIPT_SEMANTIC_ORACLE_DIGEST,
  );
  const body = {
    version: OWNER_VERSION,
    adapterIdentityDigest: identity.adapterIdentityDigest,
    sideId: identity.sideId,
    operationIds,
    operationIdsDigest: digestBenchmarkSemanticData(operationIds),
    evidenceDigest: input.evidenceDigest,
    semanticOracleDigest: input.semanticOracleDigest,
    correctOperationCount: operationIds.length,
  };
  return objectFreeze({
    ...body,
    receiptDigest: digestBenchmarkSemanticData(body),
  });
}

function headroomMeasurement(input, path) {
  if (!hasExactOwnDataKeys(input, EXTERNAL_HEADROOM_KEYS)) {
    fail(`${path}:exact_plain_data_record_required`);
  }
  if (
    !isNonNegativeSafeNumber(input.capacity) ||
    input.capacity <= 0 ||
    !isNonNegativeSafeNumber(input.observedPeak) ||
    input.observedPeak > input.capacity
  ) {
    fail(`${path}:bounded_measurement_required`);
  }
  return {
    capacity: input.capacity,
    observedPeak: input.observedPeak,
    headroomRatio:
      (input.capacity - input.observedPeak) / input.capacity,
  };
}

function maximumNonNull(values) {
  let maximum = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== null && values[index] > maximum) {
      maximum = values[index];
    }
  }
  return maximum;
}

function headroomBody(input, sample) {
  if (
    !isPlainDataRecord(input) ||
    !hasExactOwnDataKeys(input, HEADROOM_INPUT_KEYS)
  ) {
    fail(localText.HEADROOM_EXACT_RECORD);
  }
  assertRatio(
    input.minimumRequiredRatio,
    localText.HEADROOM_MINIMUM_REQUIRED_RATIO,
  );
  const externalEmitter = headroomMeasurement({
    capacity: mathMax(1, sample.maxReleaseLagMs),
    observedPeak: maximumNonNull(sample.releaseLagMs),
  }, 'headroom.externalEmitter');
  const clientQueue = headroomMeasurement({
    capacity: sample.operationTimeoutMs,
    observedPeak: maximumNonNull(sample.clientQueueDelayMs),
  }, 'headroom.clientQueue');
  const body = {
    minimumRequiredRatio: input.minimumRequiredRatio,
    externalEmitter,
    clientQueue,
  };
  for (let index = 1; index < HEADROOM_INPUT_KEYS.length; index += 1) {
    const key = HEADROOM_INPUT_KEYS[index];
    body[key] = headroomMeasurement(input[key], `headroom.${key}`);
  }
  let minimumObservedRatio = 1;
  for (let index = 1;
    index < HEADROOM_INPUT_KEYS.length + 2;
    index += 1) {
    minimumObservedRatio = mathMin(
      minimumObservedRatio,
      body[HEADROOM_KEYS[index]].headroomRatio,
    );
  }
  return {
    ...body,
    minimumObservedRatio,
    eligible:
      sample.counts.queueOverflow === 0 &&
      minimumObservedRatio >= input.minimumRequiredRatio,
  };
}

export function createBenchmarkCapacityHeadroomReceipt(input, sample) {
  const inspection = inspectBenchmarkCapacityRunSample(sample);
  if (!inspection.valid) fail(localText.HEADROOM_SAMPLE_INVALID);
  const body = headroomBody(input, sample);
  return objectFreeze({
    ...body,
    headroomDigest: digestBenchmarkSemanticData(body),
  });
}

function inspectHeadroom(receipt, sample) {
  if (!hasExactOwnDataKeys(receipt, HEADROOM_KEYS)) {
    fail(localText.HEADROOM_SHAPE_INVALID);
  }
  const input = {minimumRequiredRatio: receipt.minimumRequiredRatio};
  for (let index = 1; index < HEADROOM_INPUT_KEYS.length; index += 1) {
    const key = HEADROOM_INPUT_KEYS[index];
    if (!hasExactOwnDataKeys(receipt[key], HEADROOM_MEASUREMENT_KEYS)) {
      fail(`headroom.${key}:shape_invalid`);
    }
    input[key] = {
      capacity: receipt[key].capacity,
      observedPeak: receipt[key].observedPeak,
    };
  }
  const reconstructed =
    createBenchmarkCapacityHeadroomReceipt(input, sample);
  if (
    reconstructed.headroomDigest !== receipt.headroomDigest ||
    reconstructed.eligible !== true
  ) {
    fail(localText.HEADROOM_INELIGIBLE_OR_DIGEST_MISMATCH);
  }
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return null;
  const index = mathMin(
    sorted.length - 1,
    mathCeil(probability * sorted.length) - 1,
  );
  return sorted[index];
}

function latencyQuantiles(values) {
  const sorted = [];
  for (let index = 0; index < values.length; index += 1) {
    appendOwnArrayValue(sorted, values[index]);
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    let insertionIndex = index;
    while (
      insertionIndex > 0 &&
      sorted[insertionIndex - 1] > current
    ) {
      sorted[insertionIndex] = sorted[insertionIndex - 1];
      insertionIndex -= 1;
    }
    sorted[insertionIndex] = current;
  }
  return {
    p50: quantile(sorted, QUANTILE_P50),
    p95: quantile(sorted, QUANTILE_P95),
    p99: quantile(sorted, QUANTILE_P99),
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

function assertReceiptInputWindow(input, identity, sampleInspection) {
  if (
    !sampleInspection.valid ||
    identity.sideId !== input.sample.sideId ||
    !isNonNegativeSafeInteger(input.window.startedAt) ||
    !isNonNegativeSafeInteger(input.window.endedAt) ||
    input.window.endedAt <= input.window.startedAt ||
    input.sample.observationDurationMs >
      input.window.endedAt - input.window.startedAt
  ) {
    fail(localText.RECEIPT_OWNER_SAMPLE_WINDOW_MISMATCH);
  }
}

export function createBenchmarkCapacityHeterogeneousOperationReceipt(input) {
  if (
    !isPlainDataRecord(input) ||
    !hasExactOwnDataKeys(input, RECEIPT_INPUT_KEYS)
  ) {
    fail(localText.RECEIPT_EXACT_RECORD);
  }
  const identity = inspectAdapterIdentity(input.adapterIdentity);
  const sampleInspection =
    inspectBenchmarkCapacityRunSample(input.sample);
  if (!hasExactOwnDataKeys(input.window, WINDOW_KEYS)) {
    fail(localText.RECEIPT_WINDOW_SHAPE_INVALID);
  }
  const expected = deriveBenchmarkCapacityExpectedWindow(
    input.preregistration,
    {
      blockIndex: input.sample.blockIndex,
      blockedOrderIndex: input.window.blockedOrderIndex,
      sideId: input.sample.sideId,
      offeredLoad: input.sample.offeredLoadPerSecond,
      phase: input.sample.phase,
    },
  );
  assertReceiptInputWindow(input, identity, sampleInspection);
  inspectOwnerReceipt(input.ownerReceipt, identity, input.sample);
  inspectHeadroom(input.headroom, input.sample);
  const semanticInspection = inspectBenchmarkSemanticReceipt(
    input.sample.semanticReceipt,
    input.sample.semanticDialect,
  );
  if (
    !semanticInspection.statusPassed ||
    !semanticInspection.digestMatches
  ) {
    fail(localText.RECEIPT_C2_SEMANTIC_INVALID);
  }
  const counts = {};
  for (let index = 0; index < COUNT_KEYS.length; index += 1) {
    const key = COUNT_KEYS[index];
    counts[key] = key === localText.EMITTED ?
      input.sample.counts.offered - input.sample.unreleasedOperations :
      input.sample.counts[key];
  }
  const body = {
    version: VERSION,
    adapterIdentity: identity,
    adapterIdentityDigest: identity.adapterIdentityDigest,
    matrixId: expected.matrixId,
    cellId: expected.cellId,
    cellManifestDigest: expected.cellManifestDigest,
    profileIdentity: expected.profileIdentity,
    pairIdentity: expected.pairIdentity,
    runId: expected.runId,
    liveEnvironmentContractDigest:
      expected.liveEnvironmentContractDigest,
    blockIndex: input.sample.blockIndex,
    blockedOrderIndex: input.window.blockedOrderIndex,
    sideId: input.sample.sideId,
    phase: input.sample.phase,
    offeredLoad: input.sample.offeredLoadPerSecond,
    startedAt: input.window.startedAt,
    endedAt: input.window.endedAt,
    counts,
    latencyQuantilesMs:
      latencyQuantiles(input.sample.endToEndLatencyMs),
    capacitySampleDigest: input.sample.sampleDigest,
    semanticReceiptDigest: input.sample.semanticReceiptDigest,
    semanticContractDigest:
      input.sample.semanticReceipt.contractDigest,
    semanticResultSetDigest:
      input.sample.semanticReceipt.resultSet.digest,
    ownerReceipt: input.ownerReceipt,
    ownerReceiptDigest: input.ownerReceipt.receiptDigest,
    headroom: input.headroom,
  };
  return objectFreeze({
    ...body,
    receiptDigest: digestBenchmarkSemanticData(body),
  });
}

function assertReceiptCoordinateIdentity(receipt, sample, expected, identity) {
  if (
    identity.sideId !== sample.sideId ||
    receipt.adapterIdentityDigest !== identity.adapterIdentityDigest ||
    receipt.matrixId !== expected.matrixId ||
    receipt.cellId !== expected.cellId ||
    receipt.cellManifestDigest !== expected.cellManifestDigest ||
    receipt.profileIdentity !== expected.profileIdentity ||
    receipt.pairIdentity !== expected.pairIdentity ||
    receipt.runId !== expected.runId ||
    receipt.liveEnvironmentContractDigest !==
      expected.liveEnvironmentContractDigest
  ) {
    fail(localText.RECEIPT_OWNER_SAMPLE_WINDOW_MISMATCH);
  }
}

function assertReceiptSampleIdentity(receipt, sample) {
  if (
    receipt.blockIndex !== sample.blockIndex ||
    receipt.sideId !== sample.sideId ||
    receipt.phase !== sample.phase ||
    receipt.offeredLoad !== sample.offeredLoadPerSecond ||
    receipt.capacitySampleDigest !== sample.sampleDigest ||
    receipt.semanticReceiptDigest !== sample.semanticReceiptDigest ||
    receipt.semanticContractDigest !==
      sample.semanticReceipt.contractDigest ||
    receipt.semanticResultSetDigest !==
      sample.semanticReceipt.resultSet.digest
  ) {
    fail(localText.RECEIPT_OWNER_SAMPLE_WINDOW_MISMATCH);
  }
}

function assertReceiptBounds(receipt, sample) {
  if (
    !isNonNegativeSafeInteger(receipt.startedAt) ||
    !isNonNegativeSafeInteger(receipt.endedAt) ||
    receipt.endedAt <= receipt.startedAt ||
    sample.observationDurationMs > receipt.endedAt - receipt.startedAt
  ) {
    fail(localText.RECEIPT_OWNER_SAMPLE_WINDOW_MISMATCH);
  }
}

export function assertBenchmarkCapacityHeterogeneousOperationReceipt(
  receipt,
  sample,
  preregistration,
) {
  if (
    !hasExactOwnDataKeys(receipt, RECEIPT_KEYS) ||
    receipt.version !== VERSION ||
    !inspectBenchmarkCapacityRunSample(sample).valid
  ) {
    fail(localText.RECEIPT_SHAPE_OR_VERSION_INVALID);
  }
  const identity = inspectAdapterIdentity(receipt.adapterIdentity);
  const expected = deriveBenchmarkCapacityExpectedWindow(
    preregistration,
    {
      blockIndex: sample.blockIndex,
      blockedOrderIndex: receipt.blockedOrderIndex,
      sideId: sample.sideId,
      offeredLoad: sample.offeredLoadPerSecond,
      phase: sample.phase,
    },
  );
  assertReceiptCoordinateIdentity(receipt, sample, expected, identity);
  assertReceiptSampleIdentity(receipt, sample);
  assertReceiptBounds(receipt, sample);
  inspectOwnerReceipt(receipt.ownerReceipt, identity, sample);
  if (
    receipt.ownerReceiptDigest !== receipt.ownerReceipt.receiptDigest
  ) {
    fail(localText.OWNER_RECEIPT_DIGEST_MISMATCH);
  }
  inspectHeadroom(receipt.headroom, sample);
  const expectedCounts = {};
  for (let index = 0; index < COUNT_KEYS.length; index += 1) {
    const key = COUNT_KEYS[index];
    expectedCounts[key] = key === localText.EMITTED ?
      sample.counts.offered - sample.unreleasedOperations :
      sample.counts[key];
    if (receipt.counts[key] !== expectedCounts[key]) {
      fail(localText.RECEIPT_COUNTS_INVALID);
    }
  }
  if (
    digestBenchmarkSemanticData(receipt.latencyQuantilesMs) !==
      digestBenchmarkSemanticData(
        latencyQuantiles(sample.endToEndLatencyMs),
      ) ||
    digestBenchmarkSemanticData(receiptBody(receipt)) !==
      receipt.receiptDigest
  ) {
    fail(localText.RECEIPT_DIGEST_MISMATCH);
  }
  return true;
}

function operationRecordHasIdentity(operation) {
  return isPlainDataRecord(operation) &&
    isNonNegativeSafeInteger(operation.operationIndex) &&
    typeof operation.operationId === 'string' &&
    operation.operationId.length > 0;
}

function assertExactRecord(value, keys) {
  if (!hasExactOwnDataKeys(value, keys)) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
}

function assertNoEvidenceMismatch(
  mismatches,
  context = localText.RECEIPT_OPERATION_EVIDENCE_INVALID,
) {
  for (let index = 0; index < mismatches.length; index += 1) {
    if (mismatches[index]) {
      fail(
        `${localText.RECEIPT_OPERATION_EVIDENCE_INVALID}:` +
        `${context}:${index}`,
      );
    }
  }
}

function samePlainData(left, right) {
  return digestBenchmarkSemanticData(left) ===
    digestBenchmarkSemanticData(right);
}

function assertSemanticObservation(operation, evidence) {
  assertExactRecord(
    evidence.semanticObservation,
    SEMANTIC_OBSERVATION_KEYS,
  );
  if (
    evidence.semanticObservation.operationId !== operation.operationIndex ||
    typeof evidence.semanticObservation.operation !== 'string' ||
    evidence.semanticObservation.operation.length === 0
  ) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
}

function assertRanking(value) {
  if (!isDenseDataArray(value) || value.length !== MOVIELENS_TOP_N) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    assertExactRecord(row, RANKING_ROW_KEYS);
    if (
      !isNonNegativeSafeInteger(row.movieId) ||
      row.movieId === 0 ||
      row.rank !== index + 1 ||
      !isNonNegativeSafeInteger(row.scoreMicros)
    ) {
      fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
    }
  }
}

function rankingFromDurableResult(result) {
  assertExactRecord(result, DURABLE_RESULT_KEYS);
  assertNoEvidenceMismatch([
    !isDenseDataArray(result.movieRows),
    !isDenseDataArray(result.scoreRows),
    result.movieRows.length !== MOVIELENS_TOP_N,
    result.scoreRows.length !== MOVIELENS_TOP_N,
  ]);
  const ranking = new Array(MOVIELENS_TOP_N);
  for (let index = 0; index < MOVIELENS_TOP_N; index += 1) {
    const movie = result.movieRows[index];
    const score = result.scoreRows[index];
    assertExactRecord(movie, DURABLE_ROW_KEYS);
    assertExactRecord(score, DURABLE_ROW_KEYS);
    assertNoEvidenceMismatch([
      !isNonNegativeSafeInteger(movie.key),
      movie.key === 0,
      movie.key > MOVIELENS_TOP_N,
      score.key !== movie.key,
      !isNonNegativeSafeInteger(movie.value),
      movie.value === 0,
      !isNonNegativeSafeInteger(score.value),
      ranking[movie.key - 1] !== undefined,
    ]);
    ranking[movie.key - 1] = {
      movieId: movie.value,
      rank: movie.key,
      scoreMicros: score.value,
    };
  }
  assertRanking(ranking);
  return ranking;
}

function assertRequestWitness(operation, witness, owner) {
  assertExactRecord(witness, REQUEST_WITNESS_KEYS);
  assertExactRecord(witness.normalizedRequest, NORMALIZED_REQUEST_KEYS);
  assertExactRecord(witness.normalizedRequest.headers, [
    HTTP_HEADER_ACCEPT,
    HTTP_HEADER_CONTENT_TYPE,
  ]);
  assertExactRecord(witness.normalizedRequest.query, []);
  const body = witness.normalizedRequest.body;
  const invocationIdentity =
    `request-invocation-${stringSlice(
      digestBenchmarkSemanticData({
        requestKey: witness.idempotencyKey,
        tenantId: witness.tenantId,
      }),
      7,
    )}`;
  const requestDigest =
    digestBenchmarkSemanticData(witness.normalizedRequest);
  const intentDigest = digestBenchmarkSemanticData({
    bindingVersionId: witness.bindingVersionId,
    method: witness.normalizedRequest.method,
    path: witness.normalizedRequest.path,
    requestDigest,
    tenantId: witness.tenantId,
  });
  const journalOperationId =
    `request-cell-operation-${stringSlice(
      digestBenchmarkSemanticData([
        witness.tenantId,
        invocationIdentity,
      ]),
      7,
    )}`;
  assertNoEvidenceMismatch([
    witness.idempotencyKey !== operation.operationId,
    witness.bindingVersionId !== owner.bindingVersionId,
    witness.routeServiceId !== owner.routeServiceId,
    witness.normalizedRequest.method !== MOVIELENS_METHOD,
    witness.normalizedRequest.path !== MOVIELENS_PATH,
    witness.normalizedRequest.headers[HTTP_HEADER_ACCEPT] !==
      HTTP_ACCEPT_ANY,
    witness.normalizedRequest.headers[HTTP_HEADER_CONTENT_TYPE] !==
      HTTP_CONTENT_TYPE_JSON,
    !samePlainData(body, witness.normalizedRequest.body),
    body.datasetDigest !== owner.datasetDigest,
    !isNonNegativeSafeInteger(body.resultKeyOffset),
    typeof body.workloadVersion !== 'string',
    witness.invocationIdentity !== invocationIdentity,
    witness.requestDigest !== requestDigest,
    witness.intentDigest !== intentDigest,
  ]);
  return {
    journalCommand: `invoke:${witness.routeServiceId}:${intentDigest}`,
    journalOperationId,
  };
}

function assertInvocationJournal(journal, witness) {
  assertExactRecord(journal, JOURNAL_KEYS);
  const expectedResult = jsonStringify(jsonStringify({
    body: MOVIELENS_RESPONSE_BODY,
    headers: [['x-lagrange-cell', witness.bindingName]],
    status: HTTP_STATUS_OK,
  }));
  if (
    journal.command !== witness.journalCommand ||
    journal.idempotency_key !== witness.invocationIdentity ||
    journal.operation_id !== witness.journalOperationId ||
    journal.tenant_id !== witness.tenantId ||
    journal.state !== JOURNAL_COMPLETED ||
    journal.error !== JOURNAL_EMPTY_ERROR ||
    journal.result !== expectedResult ||
    typeof journal.created_at !== 'string' ||
    typeof journal.updated_at !== 'string'
  ) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
}

function assertLagrangeOperation(operation, evidence, receipt, owner) {
  assertExactRecord(evidence, LAGRANGE_EVIDENCE_KEYS);
  const requestJoin =
    assertRequestWitness(operation, evidence.requestWitness, owner);
  assertInvocationJournal(
    evidence.invocationJournal,
    {
      ...evidence.requestWitness,
      bindingName: owner.bindingName,
      ...requestJoin,
    },
  );
  assertExactRecord(evidence.semanticOracleReceipt, ORACLE_RECEIPT_KEYS);
  assertRanking(evidence.semanticOracleReceipt.observed);
  const durableRanking = rankingFromDurableResult(evidence.durableResult);
  const oracleDigest =
    digestBenchmarkSemanticData(evidence.semanticOracleReceipt.observed);
  const durabilityDigest = digestBenchmarkSemanticData({
    datasetDigest: owner.datasetDigest,
    durableResult: evidence.durableResult,
    invocationJournal: evidence.invocationJournal,
  });
  assertNoEvidenceMismatch([
    evidence.executableDigest !== owner.executableDigest,
    evidence.httpStatus !== HTTP_STATUS_OK,
    evidence.semanticOracleReceipt.version !==
      MOVIELENS_ORACLE_VERSION,
    evidence.semanticOracleReceipt.passed !== true,
    !samePlainData(
      owner.semanticOracleExpected,
      evidence.semanticOracleReceipt.observed,
    ),
    !samePlainData(durableRanking, evidence.semanticOracleReceipt.observed),
    evidence.semanticOracleDigest !== oracleDigest,
    oracleDigest !== receipt.ownerReceipt.semanticOracleDigest,
    evidence.durabilityDigest !== durabilityDigest,
    evidence.durabilityPassed !== true,
  ]);
  assertSemanticObservation(operation, evidence);
}

function postgresRanking(topMovies) {
  if (!isDenseDataArray(topMovies) || topMovies.length !== MOVIELENS_TOP_N) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  const ranking = [];
  for (let index = 0; index < topMovies.length; index += 1) {
    const row = topMovies[index];
    assertExactRecord(row, POSTGRES_ROW_KEYS);
    if (
      !isNonNegativeSafeNumber(row.avgRating) ||
      !isNonNegativeSafeInteger(row.movieId) ||
      row.movieId === 0 ||
      !isNonNegativeSafeInteger(row.ratingCount) ||
      !isNonNegativeSafeNumber(row.score)
    ) {
      fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
    }
    appendOwnArrayValue(ranking, {
      movieId: row.movieId,
      rank: index + 1,
      scoreMicros: mathTrunc(row.score * SCORE_SCALE),
    });
  }
  assertRanking(ranking);
  return ranking;
}

function assertPostgresOperation(operation, evidence, receipt, owner) {
  assertExactRecord(evidence, POSTGRES_EVIDENCE_KEYS);
  let durableResult;
  try {
    durableResult = jsonParse(evidence.durableResultJson);
  } catch {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  const ranking = postgresRanking(evidence.topMovies);
  const oracleDigest = digestBenchmarkSemanticData(ranking);
  const durabilityDigest = digestBenchmarkSemanticData({
    durableInputRows: evidence.durableInputRows,
    durableResultJson: evidence.durableResultJson,
    requestId: evidence.requestId,
    topMovies: evidence.topMovies,
  });
  assertNoEvidenceMismatch([
    evidence.requestId !== operation.operationId,
    evidence.imageId !== owner.imageId,
    evidence.imageRepoDigestsDigest !==
      digestBenchmarkSemanticData(owner.imageRepoDigests),
    evidence.inputDigest !== owner.inputDigest,
    evidence.postgresVersion !== owner.postgresVersion,
    evidence.queryPlanDigest !==
      digestBenchmarkSemanticData(owner.queryPlan),
    evidence.querySqlDigest !== digestBenchmarkSemanticData(owner.querySql),
    !isNonNegativeSafeInteger(evidence.backendPid),
    evidence.backendPid === 0,
    evidence.returnedAggregateRows !== evidence.topMovies.length,
    evidence.durableInputRows !== owner.totalRows,
    !samePlainData(durableResult, evidence.topMovies),
    evidence.semanticOracleDigest !== oracleDigest,
    oracleDigest !== receipt.ownerReceipt.semanticOracleDigest,
    evidence.durabilityDigest !== durabilityDigest,
    evidence.durabilityPassed !== true,
  ], localText.POSTGRES_OPERATION_EVIDENCE);
  assertSemanticObservation(operation, evidence);
}

function assertOperationManifest(receipt, owner) {
  const manifest = owner.operationManifest;
  assertExactRecord(manifest, OPERATION_MANIFEST_KEYS);
  assertExactRecord(
    manifest.lagrangePublicRequest,
    LAGRANGE_PUBLIC_REQUEST_KEYS,
  );
  assertNoEvidenceMismatch([
    manifest.version !== OPERATION_MANIFEST_VERSION,
    !isSha256Digest(manifest.datasetDigest),
    manifest.lagrangePublicRequest.method !== MOVIELENS_METHOD,
    manifest.lagrangePublicRequest.path !== MOVIELENS_PATH,
    !isSha256Digest(manifest.postgresqlQuerySqlDigest),
    manifest.result !== MOVIELENS_RESULT,
    manifest.durability !== MOVIELENS_DURABILITY,
    digestBenchmarkSemanticData(manifest) !==
      receipt.adapterIdentity.operationManifestDigest,
  ]);
}

function assertRuntimeOwnerEvidence(receipt, owner) {
  if (receipt.adapterIdentity.runtimeKind === LAGRANGE_RUNTIME) {
    assertExactRecord(owner, LAGRANGE_OWNER_KEYS);
    assertOperationManifest(receipt, owner);
    assertNoEvidenceMismatch([
      owner.version !== LAGRANGE_OWNER_VERSION,
      owner.runtimeKind !== LAGRANGE_RUNTIME,
      owner.executableDigest !== receipt.adapterIdentity.executableDigest,
      !isSha256Digest(owner.datasetDigest),
      owner.datasetDigest !== owner.operationManifest.datasetDigest,
      digestBenchmarkSemanticData(owner.semanticOracleExpected) !==
        receipt.ownerReceipt.semanticOracleDigest,
    ]);
    assertText(owner.bindingName, OWNER_BINDING_NAME_PATH);
    assertText(owner.bindingVersionId, OWNER_BINDING_VERSION_PATH);
    assertText(owner.routeServiceId, OWNER_ROUTE_SERVICE_PATH);
    assertRanking(owner.semanticOracleExpected);
  } else if (receipt.adapterIdentity.runtimeKind === POSTGRES_RUNTIME) {
    assertExactRecord(owner, POSTGRES_OWNER_KEYS);
    assertOperationManifest(receipt, owner);
    const planDocument =
      owner.queryPlan[0]?.[POSTGRES_PLAN_ROOT];
    assertNoEvidenceMismatch([
      owner.version !== POSTGRES_OWNER_VERSION,
      owner.imageId !== receipt.adapterIdentity.executableDigest,
      !isDenseDataArray(owner.imageRepoDigests),
      owner.imageRepoDigests.length === 0,
      !isSha256Digest(owner.inputDigest),
      !isNonNegativeSafeInteger(owner.totalRows),
      owner.totalRows === 0,
      typeof owner.postgresVersion !== 'string',
      stringSlice(owner.postgresVersion, 0, POSTGRES_VERSION_PREFIX_LENGTH) !==
        POSTGRES_VERSION_PREFIX,
      owner.postgresVersionSql !== POSTGRES_VERSION_SQL,
      typeof owner.querySql !== 'string',
      owner.querySql.length === 0,
      digestBenchmarkSemanticData(owner.querySql) !==
        owner.operationManifest.postgresqlQuerySqlDigest,
      !isDenseDataArray(owner.queryPlan),
      owner.queryPlan.length === 0,
      !isDenseDataArray(planDocument),
      planDocument?.length !== 1,
      !isPlainDataRecord(planDocument?.[0]?.Plan),
      typeof planDocument?.[0]?.Plan?.[POSTGRES_PLAN_NODE_TYPE] !== 'string',
    ], localText.POSTGRES_OWNER_EVIDENCE);
    for (let index = 0; index < owner.imageRepoDigests.length; index += 1) {
      assertText(
        owner.imageRepoDigests[index],
        `runtimeOwner.imageRepoDigests.${index}`,
      );
    }
  } else {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  if (
    digestBenchmarkSemanticData(owner) !==
      receipt.adapterIdentity.ownerEvidenceDigest
  ) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
}

function assertOperationEvidenceRecord(
  operation,
  receipt,
  runtimeOwnerEvidence,
) {
  if (!operationRecordHasIdentity(operation)) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  if (operation.status !== localText.CORRECT) return false;
  const evidence = operation.evidence;
  if (!isPlainDataRecord(evidence)) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  if (receipt.adapterIdentity.runtimeKind === LAGRANGE_RUNTIME) {
    assertLagrangeOperation(
      operation,
      evidence,
      receipt,
      runtimeOwnerEvidence,
    );
  } else if (receipt.adapterIdentity.runtimeKind === POSTGRES_RUNTIME) {
    assertPostgresOperation(
      operation,
      evidence,
      receipt,
      runtimeOwnerEvidence,
    );
  } else {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  return true;
}

function ownerSemanticObservations(receipt, operationEvidence) {
  const observations = [];
  for (let ownerIndex = 0;
    ownerIndex < receipt.ownerReceipt.operationIds.length;
    ownerIndex += 1) {
    const operationId = receipt.ownerReceipt.operationIds[ownerIndex];
    let matchingOperation = null;
    for (let evidenceIndex = 0;
      evidenceIndex < operationEvidence.length;
      evidenceIndex += 1) {
      if (operationEvidence[evidenceIndex].operationId === operationId) {
        if (matchingOperation !== null) {
          fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
        }
        matchingOperation = operationEvidence[evidenceIndex];
      }
    }
    if (matchingOperation?.status !== localText.CORRECT) {
      fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
    }
    appendOwnArrayValue(
      observations,
      matchingOperation.evidence.semanticObservation,
    );
  }
  return observations;
}

function assertSemanticEvidence(
  receipt,
  semanticReceipt,
  correctOperationCount,
  observations,
) {
  if (
    correctOperationCount !== receipt.ownerReceipt.correctOperationCount ||
    semanticReceipt.durability.status !== localText.SEMANTIC_PASS ||
    semanticReceipt.durability.observed !== correctOperationCount ||
    semanticReceipt.durability.expected !== correctOperationCount ||
    semanticReceipt.durability.missingIds.length !== 0 ||
    buildBenchmarkResultSetEvidence(observations).digest !==
      semanticReceipt.resultSet.digest ||
    semanticReceipt.resultSet.digest !== receipt.semanticResultSetDigest
  ) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
}

export function assertBenchmarkCapacityHeterogeneousOperationEvidence(
  receipt,
  operationEvidence,
  semanticReceipt,
  runtimeOwnerEvidence,
) {
  if (
    !isDenseDataArray(operationEvidence) ||
    operationEvidence.length !== receipt.counts.dispatched ||
    digestBenchmarkSemanticData({
      adapterIdentityDigest: receipt.adapterIdentityDigest,
      coordinate: {
        blockIndex: receipt.blockIndex,
        blockedOrderIndex: receipt.blockedOrderIndex,
        sideId: receipt.sideId,
        offeredLoadPerSecond: receipt.offeredLoad,
        phase: receipt.phase,
      },
      semanticOracleDigest:
        receipt.ownerReceipt.semanticOracleDigest,
      operations: operationEvidence,
    }) !== receipt.ownerReceipt.evidenceDigest
  ) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  assertRuntimeOwnerEvidence(receipt, runtimeOwnerEvidence);
  let correctOperationCount = 0;
  for (let index = 0; index < operationEvidence.length; index += 1) {
    if (assertOperationEvidenceRecord(
      operationEvidence[index],
      receipt,
      runtimeOwnerEvidence,
    )) {
      correctOperationCount += 1;
    }
  }
  const observations = ownerSemanticObservations(
    receipt,
    operationEvidence,
  );
  assertSemanticEvidence(
    receipt,
    semanticReceipt,
    correctOperationCount,
    observations,
  );
  return true;
}

function replayCoordinateKey(value) {
  return arrayJoin([
    value.cellId,
    value.blockIndex,
    value.blockedOrderIndex,
    value.sideId,
    value.offeredLoad,
    value.loadIndex,
    value.phase,
  ], REPLAY_COORDINATE_SEPARATOR);
}

function replayProtocolForSide(sources, sideId, resolveProtocol) {
  for (let index = 0; index < sources.length; index += 1) {
    const protocol = resolveProtocol(sources[index]);
    if (protocol.protocolSideId === sideId) {
      return protocol;
    }
  }
  fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
}

function replaySampleForDigest(report, digest) {
  for (let index = 0; index < report.rawSamples.length; index += 1) {
    if (report.rawSamples[index].sampleDigest === digest) {
      return report.rawSamples[index];
    }
  }
  fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
}

function bindReplayCoordinate(
  plan,
  sources,
  resolveProtocol,
  coordinate,
) {
  const expected = mapGet(
    plan.byCoordinate,
    replayCoordinateKey(coordinate),
  );
  if (expected === undefined) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  const protocol = replayProtocolForSide(
    sources,
    coordinate.sideId,
    resolveProtocol,
  );
  const sample = replaySampleForDigest(
    protocol.report,
    expected.receipt.capacitySampleDigest,
  );
  const passingLoads =
    protocol.report.summary.capacityBySide[
      protocol.protocolSideId
    ].perBlock;
  expected.correctOperations =
    sample.correctThroughputPerSecond === passingLoads[sample.blockIndex] ?
      sample.counts.correct :
      0;
  expected.preregistration = protocol.preregistration;
  expected.sample = sample;
}

export function completeBenchmarkCapacityHeterogeneousReplayPlan(
  plan,
  sources,
  workload,
  resolveProtocol = (source) => source,
) {
  if (plan === null) return null;
  if (
    !isDenseDataArray(sources) ||
    typeof resolveProtocol !== 'function' ||
    !isSha256Digest(workload?.operationManifestDigest) ||
    !isSha256Digest(workload?.semanticOracleDigest)
  ) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  plan.operationManifestDigest = workload.operationManifestDigest;
  plan.semanticOracleDigest = workload.semanticOracleDigest;
  for (let index = 0; index < plan.coordinates.length; index += 1) {
    bindReplayCoordinate(
      plan,
      sources,
      resolveProtocol,
      plan.coordinates[index],
    );
  }
  return plan;
}

export function assertBenchmarkCapacityHeterogeneousWindowReplay(
  plan,
  window,
  liveEvidence,
) {
  if (plan === null) return;
  const expected = mapGet(plan.byCoordinate, replayCoordinateKey(window));
  if (expected === undefined) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
  assertBenchmarkCapacityHeterogeneousOperationReceipt(
    liveEvidence.heterogeneousOperationReceipt,
    expected.sample,
    expected.preregistration,
  );
  assertBenchmarkCapacityHeterogeneousOperationEvidence(
    liveEvidence.heterogeneousOperationReceipt,
    liveEvidence.operationEvidence,
    expected.sample.semanticReceipt,
    liveEvidence.runtimeOwnerEvidence,
  );
  if (
    liveEvidence.heterogeneousOperationReceipt
      .adapterIdentity.operationManifestDigest !==
        plan.operationManifestDigest ||
    liveEvidence.heterogeneousOperationReceipt
      .ownerReceipt.semanticOracleDigest !== plan.semanticOracleDigest
  ) {
    fail(localText.RECEIPT_OPERATION_EVIDENCE_INVALID);
  }
}

export function inspectBenchmarkCapacityHeterogeneousOperationReceipt(
  receipt,
) {
  try {
    if (
      !hasExactOwnDataKeys(receipt, RECEIPT_KEYS) ||
      receipt.version !== VERSION
    ) {
      fail(localText.RECEIPT_SHAPE_OR_VERSION_INVALID);
    }
    for (let index = 0; index < COUNT_KEYS.length; index += 1) {
      if (!isNonNegativeSafeInteger(receipt.counts[COUNT_KEYS[index]])) {
        fail(localText.RECEIPT_COUNTS_INVALID);
      }
    }
    for (let index = 0; index < QUANTILE_KEYS.length; index += 1) {
      const value = receipt.latencyQuantilesMs[QUANTILE_KEYS[index]];
      if (value !== null && !isNonNegativeSafeNumber(value)) {
        fail(localText.RECEIPT_QUANTILES_INVALID);
      }
    }
    assertDigest(receipt.receiptDigest, localText.RECEIPT_DIGEST);
    if (
      digestBenchmarkSemanticData(receiptBody(receipt)) !==
        receipt.receiptDigest
    ) {
      fail(localText.RECEIPT_DIGEST_MISMATCH);
    }
    return {valid: true, reason: localText.RECEIPT_VALID};
  } catch (error) {
    return {
      valid: false,
      reason:
        typeof error?.message === 'string' ?
          error.message :
          localText.RECEIPT_OBSERVATION_INVALID,
    };
  }
}
