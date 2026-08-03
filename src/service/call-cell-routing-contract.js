import {createHash, randomUUID} from 'node:crypto';

const CALL_CELL_ROUTE_OPERATION = 'call_cell.invoke';
const CALL_CELL_ROUTE_MESSAGE_TYPE = 'INVOKE_CALL_CELL';
const CALL_CELL_ROUTE_CLASSIFICATION = Object.freeze({
  AMBIGUOUS: 'ambiguous',
  RETRYABLE: 'retryable',
  TERMINAL: 'terminal',
});
const CALL_CELL_ROUTE_ERROR_CODE = Object.freeze({
  ACK_ONLY: 'call_cell_ack_only',
  AUTHENTICATION_FAILED: 'call_cell_authentication_failed',
  AUTHORIZATION_FAILED: 'call_cell_authorization_failed',
  BATCH_BOUND_EXCEEDED: 'call_cell_batch_bound_exceeded',
  COMPONENT_FAILED: 'call_cell_component_failed',
  DEADLINE_EXHAUSTED: 'call_cell_deadline_exhausted',
  HANDLER_FAILED: 'call_cell_handler_failed',
  HOST_CELL_UNAVAILABLE: 'call_cell_host_cell_unavailable',
  INVALID_ARGUMENTS: 'call_cell_invalid_arguments',
  INVALID_COMPONENT_RESULT: 'call_cell_invalid_component_result',
  NOT_INVOCABLE: 'call_cell_not_invocable',
  REDUCE_INCOMPLETE: 'call_cell_reduce_incomplete',
  ROUTE_AMBIGUOUS: 'call_cell_route_ambiguous',
  ROUTE_NOT_FOUND: 'call_cell_route_not_found',
  ROUTE_UNAVAILABLE: 'call_cell_route_unavailable',
  SHUTTING_DOWN: 'call_cell_shutting_down',
  STATEMENT_INVALID: 'call_cell_statement_invalid',
  TARGET_STALE: 'call_cell_target_stale',
  TRANSPORT_FAILED: 'call_cell_transport_failed',
});
const CALL_CELL_ROUTE_ERROR_NAME = 'CallCellRoutingError';
const CALL_CELL_INVOCATION_ID_PREFIX = 'call-invocation-';
// Wire prefix the runtime invocation owner stamps onto every emitted
// partial key (call-cell-driver-invoke.js); consumers strip it to recover
// the guest's group key.
const CALL_CELL_PARTIAL_KEY_PREFIX = 'partial:';
// Per-dispatch invocation identity: one CALL invocation fans out into one
// wire identity per shard run plus one for reduce. The scoped identity is
// load-bearing twice — the runtime durable fence journals per wire
// identity (a shared identity would replay shard 1's result into shard 2
// and into reduce), and the route resolver reads the slot ordinal out of
// the identity to spread shard runs deterministically across ready
// replicas while every hop (adapter, receiver re-assert) still agrees on
// the same selection from the same string.
const CALL_CELL_SLOT_SUFFIX_SEPARATOR = '#slot-';
const CALL_CELL_REDUCE_SUFFIX = '#reduce';
// Bridged child-call identity: a request Cell's bridged binding call
// dispatches under `<outerInvocationId>#call-<ordinal>` so its durable
// fence journal and coordination rows are keyed by a system-owned
// identity derived from (and replay-scoped to) the outer request
// invocation. Deriving a child of a child is refused at the grammar
// (depth guard), and caller-supplied idempotency keys may never carry
// the separator.
const CALL_CELL_CHILD_CALL_SEPARATOR = '#call-';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const BYTE_ENCODING = 'utf8';
const CALL_CELL_CONTRACT_MESSAGE = Object.freeze({
  ARGUMENTS_JSON_INVALID:
    'Call Cell invocation arguments must be a JSON object string',
  ARGUMENTS_NOT_OBJECT: 'arguments must be a JSON object',
  CHILD_CALL_DEPTH_EXCEEDED:
    'Call child invocation identity cannot derive from an identity that ' +
    'already carries the child-call separator',
  CHILD_CALL_INPUT_INVALID:
    'Call child invocation identity requires a non-empty outer ' +
    'invocation id and a positive ordinal',
  COMPONENT_RESULT_JSON_INVALID:
    'Call Cell Component returned an invalid result JSON string',
  EMITTED_PARTIAL_INVALID:
    'Call Cell emitted partial is not a {key, partial} entry carrying a ' +
    'finite numeric aggregation value JSON',
  IDEMPOTENCY_KEY_RESERVED_SUFFIX:
    'Call invocation idempotency key contains a reserved wire-identity ' +
    'suffix separator',
  SECURITY_CONTEXT_INVALID:
    'Call authentication did not produce a canonical security context',
  SUPPLIED_INVOCATION_ID_RESERVED:
    'Call invocation id must not carry the slot/reduce wire-identity ' +
    'suffix grammar',
});

class CallCellRoutingError extends Error {
  constructor(code, message, options = {}) {
    super(message, {cause: options.cause});
    this.name = CALL_CELL_ROUTE_ERROR_NAME;
    this.code = code;
    this.classification =
      options.classification ||
      CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL;
    this.retryable =
      this.classification === CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE;
    this.ambiguous =
      this.classification === CALL_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS;
    this.invoked = options.invoked === true;
    this.preserveReplicaState = options.preserveReplicaState === true;
  }
}

function createCallRoutingFailure(code, message, options = {}) {
  return new CallCellRoutingError(code, message, options);
}

function createCallInvocationIdentity(idempotencyKey) {
  if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
    // The slot/reduce suffixes are the wire-identity grammar the route
    // spread and the durable fence parse, and the child-call separator
    // is system-owned bridged-call identity; a caller-supplied key
    // carrying any of them would mis-split into a foreign base identity
    // or forge a bridged-call chain. Refuse typed.
    if (idempotencyKey.includes(CALL_CELL_SLOT_SUFFIX_SEPARATOR) ||
        idempotencyKey.includes(CALL_CELL_REDUCE_SUFFIX) ||
        idempotencyKey.includes(CALL_CELL_CHILD_CALL_SEPARATOR)) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
        CALL_CELL_CONTRACT_MESSAGE.IDEMPOTENCY_KEY_RESERVED_SUFFIX,
      );
    }
    return Object.freeze({invocationId: idempotencyKey});
  }
  return Object.freeze({
    invocationId: `${CALL_CELL_INVOCATION_ID_PREFIX}${randomUUID()}`,
  });
}

// System-owned child identity for one bridged binding call: the request
// Cell's outer invocation id plus the fixed child ordinal. The grammar
// refuses deriving a child of a child, so a bridged call can never chain
// a second bridged call under a deeper identity.
function createCallChildInvocationId(outerInvocationId, ordinal) {
  if (typeof outerInvocationId !== 'string' ||
      outerInvocationId.length === 0 ||
      !Number.isSafeInteger(ordinal) || ordinal <= 0) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      CALL_CELL_CONTRACT_MESSAGE.CHILD_CALL_INPUT_INVALID,
    );
  }
  if (outerInvocationId.includes(CALL_CELL_CHILD_CALL_SEPARATOR)) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      CALL_CELL_CONTRACT_MESSAGE.CHILD_CALL_DEPTH_EXCEEDED,
    );
  }
  return `${outerInvocationId}${CALL_CELL_CHILD_CALL_SEPARATOR}${ordinal}`;
}

// Gate for a caller-supplied base identity (the invoker's optional
// `invocationId` request field): system-owned ids — including the
// '#call-' child grammar — pass verbatim, while the slot/reduce wire
// grammar is refused so a supplied base can never mis-split into a
// foreign identity downstream.
function assertCallBaseInvocationId(invocationId) {
  if (typeof invocationId !== 'string' || invocationId.length === 0 ||
      invocationId.includes(CALL_CELL_SLOT_SUFFIX_SEPARATOR) ||
      invocationId.includes(CALL_CELL_REDUCE_SUFFIX)) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      CALL_CELL_CONTRACT_MESSAGE.SUPPLIED_INVOCATION_ID_RESERVED,
    );
  }
  return invocationId;
}

function createCallSlotInvocationId(invocationId, slotId) {
  return `${invocationId}${CALL_CELL_SLOT_SUFFIX_SEPARATOR}${slotId}`;
}

function createCallReduceInvocationId(invocationId) {
  return `${invocationId}${CALL_CELL_REDUCE_SUFFIX}`;
}

// Parse a wire invocation identity back into its base identity and slot
// ordinal. The ordinal is 0 for the base identity and for reduce — both
// route from the invocation's primary selection — and the shard slot id
// for slot-scoped identities, giving the resolver its deterministic
// spread offset.
function parseCallInvocationIdentity(wireInvocationId) {
  const value = String(wireInvocationId ?? '');
  if (value.endsWith(CALL_CELL_REDUCE_SUFFIX)) {
    return Object.freeze({
      baseInvocationId:
        value.slice(0, value.length - CALL_CELL_REDUCE_SUFFIX.length),
      slotOrdinal: 0,
    });
  }
  const separatorIndex = value.lastIndexOf(CALL_CELL_SLOT_SUFFIX_SEPARATOR);
  if (separatorIndex < 0) {
    return Object.freeze({baseInvocationId: value, slotOrdinal: 0});
  }
  const ordinal = Number(
    value.slice(separatorIndex + CALL_CELL_SLOT_SUFFIX_SEPARATOR.length));
  if (!Number.isInteger(ordinal) || ordinal <= 0) {
    return Object.freeze({baseInvocationId: value, slotOrdinal: 0});
  }
  return Object.freeze({
    baseInvocationId: value.slice(0, separatorIndex),
    slotOrdinal: ordinal,
  });
}

function createCallInvocationIntentDigest(fields) {
  return createHash(HASH_ALGORITHM)
    .update(JSON.stringify(fields), BYTE_ENCODING)
    .digest(HASH_ENCODING);
}

function normalizeCallComponentResult(value) {
  if (typeof value !== 'string') {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
      CALL_CELL_CONTRACT_MESSAGE.COMPONENT_RESULT_JSON_INVALID,
    );
  }
  try {
    JSON.parse(value);
  } catch (error) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
      CALL_CELL_CONTRACT_MESSAGE.COMPONENT_RESULT_JSON_INVALID,
      {cause: error},
    );
  }
  return value;
}

// The emitted-partial wire contract for reduce coordination: every emit
// carries a finite numeric aggregation value as its partial JSON, keyed by
// the guest's group key. The coordinator's completeness gate re-validates
// the same shape fail-closed; this normalization exists so the invocation
// owner refuses an incoherent component before anything is published.
function normalizeEmittedPartialEntries(partials) {
  const entries = Array.isArray(partials) ? partials : [];
  return entries.map((entry) => {
    const key = entry?.key;
    const partial = entry?.partial;
    if (typeof key !== 'string' ||
        !key.startsWith(CALL_CELL_PARTIAL_KEY_PREFIX) ||
        typeof partial !== 'string') {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
        CALL_CELL_CONTRACT_MESSAGE.EMITTED_PARTIAL_INVALID,
      );
    }
    let aggValue;
    try {
      aggValue = JSON.parse(partial);
    } catch (error) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
        CALL_CELL_CONTRACT_MESSAGE.EMITTED_PARTIAL_INVALID,
        {cause: error},
      );
    }
    if (typeof aggValue !== 'number' || !Number.isFinite(aggValue)) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
        CALL_CELL_CONTRACT_MESSAGE.EMITTED_PARTIAL_INVALID,
      );
    }
    return Object.freeze({
      aggValue,
      groupKey: key.slice(CALL_CELL_PARTIAL_KEY_PREFIX.length),
    });
  });
}

const EMPTY_ARGUMENTS_JSON = '{}';

function normalizeCallArguments(value) {
  if (value === undefined) return EMPTY_ARGUMENTS_JSON;
  if (typeof value !== 'string') {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      CALL_CELL_CONTRACT_MESSAGE.ARGUMENTS_JSON_INVALID,
    );
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' ||
        Array.isArray(parsed)) {
      throw new TypeError(
        CALL_CELL_CONTRACT_MESSAGE.ARGUMENTS_NOT_OBJECT);
    }
  } catch (error) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      CALL_CELL_CONTRACT_MESSAGE.ARGUMENTS_JSON_INVALID,
      {cause: error},
    );
  }
  return value;
}

export {
  CALL_CELL_INVOCATION_ID_PREFIX,
  CALL_CELL_PARTIAL_KEY_PREFIX,
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_CELL_ROUTE_MESSAGE_TYPE,
  CALL_CELL_ROUTE_OPERATION,
  CallCellRoutingError,
  assertCallBaseInvocationId,
  createCallChildInvocationId,
  createCallInvocationIdentity,
  createCallInvocationIntentDigest,
  createCallReduceInvocationId,
  createCallRoutingFailure,
  createCallSlotInvocationId,
  normalizeCallArguments,
  normalizeCallComponentResult,
  normalizeEmittedPartialEntries,
  parseCallInvocationIdentity,
};
