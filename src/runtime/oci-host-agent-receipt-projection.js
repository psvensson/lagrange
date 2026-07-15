import {canonicalizeOciHostAgentJson} from './oci-host-agent-json.js';
import {validateOciHostAgentResult} from './oci-host-agent-schema.js';
import {
  OCI_HOST_AGENT_DURABLE_ERROR,
  durableStateError,
} from './oci-host-agent-durable-errors.js';
import {
  canonicalJsonBytes,
  exactKeys,
  safeInteger,
  sha256Digest,
  validOwnerId,
} from './oci-host-agent-durable-files.js';

const LEDGER_VERSION = 1;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const OPERATION_ID_PATTERN = /^oci-v1:[0-9a-f]{64}$/u;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const NONCE_BYTES = 32;
const ENCODING_BASE64 = 'base64';
const KEY_SEPARATOR = '\n';
const INSPECT_OPERATION = 'inspect';
const MUTATING_OPERATIONS = new Set(['pull', 'create', 'start', 'stop', 'remove']);
const OPERATIONS = new Set([...MUTATING_OPERATIONS, INSPECT_OPERATION]);
const NON_DISPATCH_RESULT_STATUSES = new Set([
  'already_applied',
  'already_absent',
  'rejected',
  'retryable_failure',
]);
const RECEIPT_STATE = Object.freeze({
  ACCEPTED: 'accepted',
  MUTATION_UNRESOLVED: 'mutation_unresolved',
  TERMINAL: 'terminal',
});
const TRANSACTION_KIND = Object.freeze({
  NONCE_ADMITTED: 'nonce_admitted',
  NONCE_SATURATED: 'nonce_saturated',
  RECEIPT_ACCEPTED: 'receipt_accepted',
  MUTATION_STARTED: 'mutation_started',
  RECEIPT_COMPLETED: 'receipt_completed',
});
const LEDGER_OUTCOME = Object.freeze({
  ACCEPTED: 'accepted',
  EXISTING: 'existing',
  REPLAYED: 'replayed',
  SATURATED: 'saturated',
});
const IDENTITY_FIELDS = Object.freeze([
  'clusterIncarnation',
  'nodeId',
  'serviceId',
  'revisionId',
  'instanceId',
]);
const RECEIPT_FIELDS = Object.freeze([
  'operationId',
  'intentDigest',
  'operation',
  'identity',
  'state',
  'generation',
]);
const FENCE_FIELDS = Object.freeze([
  'token',
  'operationId',
  'intentDigest',
  'identity',
  'generation',
]);
const NONCE_ADMITTED_FIELDS = Object.freeze([
  'kind',
  'keyId',
  'nonce',
  'expiresAtMs',
]);
const NONCE_SATURATED_FIELDS = Object.freeze(['kind', 'keyId']);
const RECEIPT_TRANSACTION_FIELDS = Object.freeze(['kind', 'receipt']);
const MUTATION_TRANSACTION_FIELDS = Object.freeze([
  'kind',
  'receipt',
  'fence',
]);
const FENCE_TOKEN_FIELD = 'fenceToken';
const GENERATION_RECORD_FIELDS = Object.freeze(['body', 'digest']);
const GENERATION_BODY_FIELDS = Object.freeze([
  'version',
  'ledgerRootId',
  'sequence',
  'previousDigest',
  'transaction',
]);

function receiptUnavailable() {
  durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE);
}

function emptyProjection(header, headerDigest) {
  return {
    header,
    headerDigest,
    sequence: 0,
    tailDigest: headerDigest,
    nonces: new Map(),
    saturatedKeys: new Set(),
    receipts: new Map(),
    fences: new Map(),
  };
}

function clone(value) {
  return JSON.parse(canonicalizeOciHostAgentJson(value));
}

function sameValue(left, right) {
  return canonicalizeOciHostAgentJson(left) ===
    canonicalizeOciHostAgentJson(right);
}

function identityFieldsValid(identity) {
  return exactKeys(identity, IDENTITY_FIELDS) &&
    Object.values(identity).every(validOwnerId);
}

function resourceKey(identity) {
  if (!identityFieldsValid(identity)) {
    durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.INVALID_CONFIGURATION);
  }
  return canonicalizeOciHostAgentJson(identity);
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function validNonce(value) {
  if (typeof value !== 'string' || !BASE64_PATTERN.test(value)) return false;
  const decoded = Buffer.from(value, ENCODING_BASE64);
  return decoded.length === NONCE_BYTES &&
    decoded.toString(ENCODING_BASE64) === value;
}

function validateReceipt(receipt, sequence, state) {
  const terminalOptional = state === RECEIPT_STATE.TERMINAL ? ['result'] : [];
  return exactKeys(receipt, RECEIPT_FIELDS, terminalOptional) &&
    OPERATION_ID_PATTERN.test(receipt.operationId) &&
    validDigest(receipt.intentDigest) && OPERATIONS.has(receipt.operation) &&
    identityFieldsValid(receipt.identity) && receipt.state === state &&
    receipt.generation === sequence &&
    (state !== RECEIPT_STATE.TERMINAL || Boolean(receipt.result));
}

function validateFence(fence, receipt, sequence) {
  return exactKeys(fence, FENCE_FIELDS) && validDigest(fence.token) &&
    fence.operationId === receipt.operationId &&
    fence.intentDigest === receipt.intentDigest &&
    sameValue(fence.identity, receipt.identity) && fence.generation === sequence;
}

function receiptIntentMatches(receipt, candidate) {
  return receipt.operationId === candidate.operationId &&
    receipt.intentDigest === candidate.intentDigest &&
    receipt.operation === candidate.operation &&
    sameValue(receipt.identity, candidate.identity);
}

function terminalResultMatches(result, receipt) {
  try {
    validateOciHostAgentResult(result, receipt.operationId);
    return result.operation === receipt.operation &&
      result.intentDigest === receipt.intentDigest &&
      sameValue(result.identity, receipt.identity);
  } catch {
    return false;
  }
}

function applyNonceAdmitted(projection, transaction) {
  if (!exactKeys(transaction, NONCE_ADMITTED_FIELDS) ||
      !validOwnerId(transaction.keyId) || !validNonce(transaction.nonce) ||
      !safeInteger(transaction.expiresAtMs, 1)) receiptUnavailable();
  projection.nonces.set(
    `${transaction.keyId}${KEY_SEPARATOR}${transaction.nonce}`,
    {keyId: transaction.keyId, nonce: transaction.nonce,
      expiresAtMs: transaction.expiresAtMs},
  );
}

function applyNonceSaturated(projection, transaction) {
  if (!exactKeys(transaction, NONCE_SATURATED_FIELDS) ||
      !validOwnerId(transaction.keyId)) receiptUnavailable();
  projection.saturatedKeys.add(transaction.keyId);
}

function applyReceiptAccepted(projection, transaction, sequence) {
  const receipt = transaction.receipt;
  if (!exactKeys(transaction, RECEIPT_TRANSACTION_FIELDS) ||
      !validateReceipt(receipt, sequence, RECEIPT_STATE.ACCEPTED) ||
      projection.receipts.has(receipt.operationId) ||
      receipt.identity.clusterIncarnation !==
        projection.header.clusterIncarnation) receiptUnavailable();
  projection.receipts.set(receipt.operationId, receipt);
}

function applyMutationStarted(projection, transaction, sequence) {
  const receipt = transaction.receipt;
  if (!exactKeys(transaction, MUTATION_TRANSACTION_FIELDS) ||
      !validateReceipt(receipt, sequence, RECEIPT_STATE.MUTATION_UNRESOLVED) ||
      !validateFence(transaction.fence, receipt, sequence)) receiptUnavailable();
  const previous = projection.receipts.get(receipt.operationId);
  const key = resourceKey(receipt.identity);
  if (!previous || previous.state !== RECEIPT_STATE.ACCEPTED ||
      !receiptIntentMatches(previous, receipt) || projection.fences.has(key)) {
    receiptUnavailable();
  }
  projection.receipts.set(receipt.operationId, receipt);
  projection.fences.set(key, transaction.fence);
}

function completionShapeValid(transaction, receipt, sequence, mutationCompletion) {
  return exactKeys(
    transaction,
    RECEIPT_TRANSACTION_FIELDS,
    mutationCompletion ? [FENCE_TOKEN_FIELD] : [],
  ) && validateReceipt(receipt, sequence, RECEIPT_STATE.TERMINAL);
}

function mutationCompletionValid(transaction, previous, fence) {
  return Boolean(fence) && fence.operationId === previous.operationId &&
    transaction.fenceToken === fence.token;
}

function nonMutationCompletionValid(transaction, previous, fence) {
  return previous.state === RECEIPT_STATE.ACCEPTED && !fence &&
    !Object.hasOwn(transaction, FENCE_TOKEN_FIELD);
}

function applyReceiptCompleted(projection, transaction, sequence) {
  const receipt = transaction.receipt;
  const previous = projection.receipts.get(receipt?.operationId);
  const mutationCompletion = previous?.state ===
    RECEIPT_STATE.MUTATION_UNRESOLVED;
  if (!completionShapeValid(transaction, receipt, sequence, mutationCompletion) ||
      !previous || !terminalResultMatches(receipt.result, previous)) {
    receiptUnavailable();
  }
  const key = resourceKey(receipt.identity);
  const fence = projection.fences.get(key);
  const transitionValid = mutationCompletion ?
    mutationCompletionValid(transaction, previous, fence) :
    nonMutationCompletionValid(transaction, previous, fence);
  if (!transitionValid) receiptUnavailable();
  projection.receipts.set(receipt.operationId, receipt);
  if (mutationCompletion) projection.fences.delete(key);
}

const TRANSACTION_APPLIER = new Map([
  [TRANSACTION_KIND.NONCE_ADMITTED, applyNonceAdmitted],
  [TRANSACTION_KIND.NONCE_SATURATED, applyNonceSaturated],
  [TRANSACTION_KIND.RECEIPT_ACCEPTED, applyReceiptAccepted],
  [TRANSACTION_KIND.MUTATION_STARTED, applyMutationStarted],
  [TRANSACTION_KIND.RECEIPT_COMPLETED, applyReceiptCompleted],
]);

function applyTransaction(projection, transaction, sequence) {
  const apply = transaction && typeof transaction === 'object' ?
    TRANSACTION_APPLIER.get(transaction.kind) : undefined;
  if (!apply) receiptUnavailable();
  apply(projection, transaction, sequence);
}

function validateGeneration(record, projection, expectedSequence) {
  if (!exactKeys(record, GENERATION_RECORD_FIELDS) ||
      !validDigest(record.digest) ||
      !exactKeys(record.body, GENERATION_BODY_FIELDS) ||
      record.body.version !== LEDGER_VERSION ||
      record.body.ledgerRootId !== projection.header.ledgerRootId ||
      record.body.sequence !== expectedSequence ||
      record.body.previousDigest !== projection.tailDigest ||
      sha256Digest(canonicalJsonBytes(record.body)) !== record.digest) {
    receiptUnavailable();
  }
  applyTransaction(projection, record.body.transaction, expectedSequence);
  projection.sequence = expectedSequence;
  projection.tailDigest = record.digest;
}

function validateOperation(candidate, clusterIncarnation) {
  if (!candidate || !OPERATION_ID_PATTERN.test(candidate.operationId) ||
      !validDigest(candidate.intentDigest) || !OPERATIONS.has(candidate.operation) ||
      !identityFieldsValid(candidate.identity) ||
      candidate.identity.clusterIncarnation !== clusterIncarnation) {
    durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.INVALID_CONFIGURATION);
  }
}

function nonDispatchResultAllowed(receipt, result) {
  if (receipt.operation === INSPECT_OPERATION) return true;
  return NON_DISPATCH_RESULT_STATUSES.has(result.status);
}

export {
  LEDGER_OUTCOME,
  LEDGER_VERSION,
  MUTATING_OPERATIONS,
  RECEIPT_STATE,
  TRANSACTION_KIND,
  applyTransaction,
  clone,
  emptyProjection,
  nonDispatchResultAllowed,
  receiptIntentMatches,
  resourceKey,
  terminalResultMatches,
  validDigest,
  validNonce,
  validateGeneration,
  validateOperation,
};
