/**
 * Acceptance scenario and evidence contract for `standard-http-service-api-acceptance`
 * (solve/specs/standard-http-service-api/requirements.md Section 7.2).
 *
 * Validates that a candidate acceptance report for the standard HTTP service API
 * epic contains original, non-synthetic evidence across all six required receipt
 * families (`pinned-toolchain-hono-component`, `fetch-http-semantics`,
 * `service-capability-boundary`, `request-call-lifecycle`,
 * `compiled-public-hono-journey`, `successor-contract-cutover`), and fails closed
 * when a report relies on handwritten booleans, substitutes Node execution for a
 * compiled WASM component guest, drops or truncates contributions, bypasses the
 * replicated ArtifactPayloadStore, fails to refuse legacy pre-successor artifacts,
 * or makes numeric performance claims without physical lab/GCP comparator receipts.
 */

const STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID =
  'standard-http-service-api-acceptance';

const STANDARD_HTTP_RECEIPT_ID = Object.freeze({
  COMPILED_PUBLIC_HONO_JOURNEY: 'compiled-public-hono-journey',
  FETCH_HTTP_SEMANTICS: 'fetch-http-semantics',
  PINNED_TOOLCHAIN_HONO_COMPONENT: 'pinned-toolchain-hono-component',
  REQUEST_CALL_LIFECYCLE: 'request-call-lifecycle',
  SERVICE_CAPABILITY_BOUNDARY: 'service-capability-boundary',
  SUCCESSOR_CONTRACT_CUTOVER: 'successor-contract-cutover',
});

const STANDARD_HTTP_REQUIRED_RECEIPT_IDS = Object.freeze([
  STANDARD_HTTP_RECEIPT_ID.PINNED_TOOLCHAIN_HONO_COMPONENT,
  STANDARD_HTTP_RECEIPT_ID.FETCH_HTTP_SEMANTICS,
  STANDARD_HTTP_RECEIPT_ID.SERVICE_CAPABILITY_BOUNDARY,
  STANDARD_HTTP_RECEIPT_ID.REQUEST_CALL_LIFECYCLE,
  STANDARD_HTTP_RECEIPT_ID.COMPILED_PUBLIC_HONO_JOURNEY,
  STANDARD_HTTP_RECEIPT_ID.SUCCESSOR_CONTRACT_CUTOVER,
]);

const STANDARD_HTTP_ACCEPTANCE_ERROR_CODE = Object.freeze({
  BYPASSED_ARTIFACT_STORAGE_REJECTED: 'bypassed_artifact_storage_rejected',
  DROPPED_CONTRIBUTIONS_REJECTED: 'dropped_contributions_rejected',
  HANDWRITTEN_SUMMARY_REJECTED: 'handwritten_summary_rejected',
  INVALID_REPORT_ENVELOPE: 'invalid_report_envelope',
  LEGACY_ARTIFACT_NOT_REFUSED: 'legacy_artifact_not_refused',
  MISSING_RECEIPT_FAMILY: 'missing_receipt_family',
  NODE_GUEST_SUBSTITUTION_REJECTED: 'node_guest_substitution_rejected',
  UNMEASURED_PERFORMANCE_CLAIM_REJECTED:
    'unmeasured_performance_claim_rejected',
});

const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const TYPEOF_NUMBER = 'number';
const ZERO = 0;
const SHA256_PREFIX = 'sha256:';
const EXPECTED_LEGACY_REFUSAL_CODES = Object.freeze([
  'legacy_artifact_rebuild_required',
  'legacy_artifact_abi_unsupported',
]);
const EXECUTION_RUNTIME_WASM = 'wasm_component';
const EXECUTION_RUNTIME_NODE = 'node';
const PERFORMANCE_STATUS_UNMEASURED = 'unmeasured';
const PERFORMANCE_STATUS_MEASURED = 'measured';
const ENVIRONMENT_GCP = 'gcp';
const ENVIRONMENT_LAB = 'lab';

const STANDARD_HTTP_ACCEPTANCE_MESSAGE = Object.freeze({
  CUTOVER_RECEIPT_INVALID:
    'successor-contract-cutover receipt must prove scaffold/typings/capability consistency and explicit legacy_artifact_rebuild_required refusal',
  PERFORMANCE_OBJECT_REQUIRED:
    'performance section must be an object with explicit status',
  PERFORMANCE_RECEIPT_REQUIRED:
    'numeric performance or cost claims require physical lab/GCP comparator receipts; keep unmeasured outcomes explicit',
});

function isPlainRecord(value) {
  return typeof value === TYPEOF_OBJECT && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value) {
  return typeof value === TYPEOF_STRING && value.trim().length > ZERO;
}

function hasDigestPrefix(value) {
  return isNonEmptyText(value) && value.startsWith(SHA256_PREFIX);
}

function pushViolation(violations, code, receiptId, message) {
  violations.push(Object.freeze({
    code,
    message,
    receiptId: receiptId || null,
  }));
}

function checkReceiptProvenance(receiptId, receipt, violations) {
  const hasObservations =
    isPlainRecord(receipt.observations) &&
    Object.keys(receipt.observations).length > ZERO;
  const hasOracle = isPlainRecord(receipt.oracle);
  const hasFailureRecords =
    Array.isArray(receipt.failureRecords) &&
    receipt.failureRecords.length > ZERO;
  if (!isNonEmptyText(receipt.sourceCommit) ||
      !hasDigestPrefix(receipt.artifactDigest) ||
      !hasObservations ||
      !hasOracle ||
      !hasFailureRecords) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.HANDWRITTEN_SUMMARY_REJECTED,
      receiptId,
      `receipt ${receiptId} is missing original provenance (sourceCommit, artifactDigest, observations, oracle, or failureRecords)`,
    );
  }
}

function checkReceiptRuntimeFidelity(receiptId, receipt, violations) {
  if (receipt.executionRuntime === EXECUTION_RUNTIME_NODE ||
      receipt.executionRuntime !== EXECUTION_RUNTIME_WASM ||
      receipt.wasmComponentExecuted !== true) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.NODE_GUEST_SUBSTITUTION_REJECTED,
      receiptId,
      `receipt ${receiptId} must execute a compiled WASM component guest rather than a Node source import`,
    );
  }
}

function checkReceiptContributionIntegrity(receiptId, receipt, violations) {
  const dropped = Number(receipt.droppedContributions ?? ZERO);
  if (dropped > ZERO || receipt.completeReduction === false) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.DROPPED_CONTRIBUTIONS_REJECTED,
      receiptId,
      `receipt ${receiptId} dropped or truncated contributions before reduction`,
    );
  }
}

function checkReceiptArtifactStorage(receiptId, receipt, violations) {
  if (receipt.bypassedArtifactStore === true ||
      receipt.filesystemFallbackUsed === true ||
      receipt.loadedFromArtifactPayloadStore === false) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.BYPASSED_ARTIFACT_STORAGE_REJECTED,
      receiptId,
      `receipt ${receiptId} bypassed replicated ArtifactPayloadStore during deployment or activation`,
    );
  }
}

function checkSuccessorCutoverReceipt(receipt, violations) {
  const cutover = receipt.observations;
  if (!isPlainRecord(cutover) ||
      cutover.legacyArtifactRefused !== true ||
      !EXPECTED_LEGACY_REFUSAL_CODES.includes(cutover.legacyRefusalCode) ||
      cutover.scaffoldTypingsConsistent !== true ||
      cutover.capabilityCheckerValid !== true) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.LEGACY_ARTIFACT_NOT_REFUSED,
      STANDARD_HTTP_RECEIPT_ID.SUCCESSOR_CONTRACT_CUTOVER,
      STANDARD_HTTP_ACCEPTANCE_MESSAGE.CUTOVER_RECEIPT_INVALID,
    );
  }
}

function checkSingleReceipt(receiptId, receipts, violations) {
  const receipt = isPlainRecord(receipts) ? receipts[receiptId] : null;
  if (!isPlainRecord(receipt)) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.MISSING_RECEIPT_FAMILY,
      receiptId,
      `missing required receipt family: ${receiptId}`,
    );
    return;
  }
  checkReceiptProvenance(receiptId, receipt, violations);
  checkReceiptRuntimeFidelity(receiptId, receipt, violations);
  checkReceiptContributionIntegrity(receiptId, receipt, violations);
  checkReceiptArtifactStorage(receiptId, receipt, violations);
  if (receiptId === STANDARD_HTTP_RECEIPT_ID.SUCCESSOR_CONTRACT_CUTOVER) {
    checkSuccessorCutoverReceipt(receipt, violations);
  }
}

function hasValidPhysicalComparatorReceipt(performance) {
  const env = performance.environment;
  const validEnv = env === ENVIRONMENT_GCP || env === ENVIRONMENT_LAB;
  return validEnv &&
    hasDigestPrefix(performance.comparatorReceiptDigest) &&
    isNonEmptyText(performance.hostTopologyId);
}

function checkPerformanceClaims(report, violations) {
  const perf = report.performance;
  if (perf === undefined || perf === null) {
    return;
  }
  if (!isPlainRecord(perf)) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.UNMEASURED_PERFORMANCE_CLAIM_REJECTED,
      null,
      STANDARD_HTTP_ACCEPTANCE_MESSAGE.PERFORMANCE_OBJECT_REQUIRED,
    );
    return;
  }
  const hasNumericClaim =
    typeof perf.coldStartMs === TYPEOF_NUMBER ||
    typeof perf.p99LatencyMs === TYPEOF_NUMBER ||
    typeof perf.memoryBytes === TYPEOF_NUMBER;
  if (perf.status === PERFORMANCE_STATUS_UNMEASURED && !hasNumericClaim) {
    return;
  }
  if (perf.status !== PERFORMANCE_STATUS_MEASURED ||
      !hasValidPhysicalComparatorReceipt(perf)) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.UNMEASURED_PERFORMANCE_CLAIM_REJECTED,
      null,
      STANDARD_HTTP_ACCEPTANCE_MESSAGE.PERFORMANCE_RECEIPT_REQUIRED,
    );
  }
}

function validateStandardHttpAcceptanceReport(report) {
  const violations = [];
  if (!isPlainRecord(report) ||
      report.scenario !== STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID) {
    pushViolation(
      violations,
      STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.INVALID_REPORT_ENVELOPE,
      null,
      `report scenario must be ${STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID}`,
    );
    return Object.freeze({
      scenario: STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID,
      valid: false,
      violations: Object.freeze(violations),
    });
  }
  for (const receiptId of STANDARD_HTTP_REQUIRED_RECEIPT_IDS) {
    checkSingleReceipt(receiptId, report.receipts, violations);
  }
  checkPerformanceClaims(report, violations);
  return Object.freeze({
    scenario: STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID,
    valid: violations.length === ZERO,
    violations: Object.freeze(violations),
  });
}

export {
  STANDARD_HTTP_ACCEPTANCE_ERROR_CODE,
  STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID,
  STANDARD_HTTP_RECEIPT_ID,
  STANDARD_HTTP_REQUIRED_RECEIPT_IDS,
  validateStandardHttpAcceptanceReport,
};
