// The canonical owner-fact read and the explicit hint read (S0 of the
// fallback-read closure). Two functions, two result vocabularies: an owner
// fact is READY or UNAVAILABLE with a named reason and carries the serving
// leader's witness; a hint is the node's projection, carries no identity
// and cannot be passed where an owner fact is required (ownerFactRows refuses
// it). Neither authorises an effect: an owner fact may schedule or propose,
// and every effect is granted by a conditional committed write that
// revalidates its own predicate.
//
// What READY means is the receiver's leader-read predicate
// (control-plane-owner-fact-read-contract.js), applied by the replica that
// answered to one observation of its consensus core and again here to the
// witness that came back. It is a leader-local read point, not a
// linearizable read; the guarantee and its limits are stated in
// architecture/contracts/authority-and-recovery.md ("Owner fact and hint").
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from './control-plane-system-table-gateway-constants.js';
import {isCompleteAuthoritativeReadResult} from
  './control-plane-system-table-gateway-read-strategies.js';
import {
  OWNER_FACT_UNAVAILABLE_REASON,
  leaderReadWitnessRefusal,
  ownerFactFailureReasonOf,
  ownerFactReadOf,
} from './control-plane-owner-fact-read-contract.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';

const OWNER_FACT_STATE = Object.freeze({
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
});
const OWNER_FACT_REQUEST_REFUSAL = Object.freeze({
  UNKNOWN_FIELD: 'owner_fact_unknown_field',
  FLOOR_REQUIRED: 'owner_fact_floor_required',
  DEADLINE_REQUIRED: 'owner_fact_deadline_required',
  ROUTING_CLASS_REQUIRED: 'owner_fact_routing_class_required',
  STATEMENT_REQUIRED: 'owner_fact_statement_required',
  TABLE_NOT_OWNER_READABLE: 'owner_fact_table_not_owner_readable',
  EXPECTED_REPLICA_MALFORMED: 'owner_fact_expected_replica_malformed',
  READER_REQUIRED: 'owner_fact_reader_required',
});
const CONTROL_PLANE_HINT_STATE = Object.freeze({
  OBSERVED: 'hint_observed',
  UNAVAILABLE: 'hint_unavailable',
});
const HINT_READ_FAILED = 'hint_read_failed';
// The fields a request draft may name; a refusal names the field it refuses.
const FIELD = Object.freeze({
  TABLE_NAME: 'tableName',
  SQL: 'sql',
  PARAMS: 'params',
  FLOOR: 'floor',
  DEADLINE: 'deadline',
  ROUTING_CLASS: 'routingReadinessDimension',
  EXPECTED_REPLICA: 'expectedReplica',
  CACHE_PREDICATE: 'cachePredicate',
  READ_LEADER_ROWS: 'readLeaderRows',
  READ_PROJECTION_ROWS: 'readProjectionRows',
});
const OWNER_FACT_REQUEST_FIELDS = new Set([FIELD.TABLE_NAME, FIELD.SQL, FIELD.PARAMS,
  FIELD.FLOOR, FIELD.DEADLINE, FIELD.ROUTING_CLASS, FIELD.EXPECTED_REPLICA]);
const DEADLINE_FIELD_COUNT = 1;
const ROUTING_CLASSES = new Set(Object.values(CONTROL_PLANE_READINESS_DIMENSION));
const HINT_REQUEST_FIELDS = new Set([FIELD.TABLE_NAME, FIELD.CACHE_PREDICATE]);
const EXPECTED_REPLICA_FIELD_COUNT = 2;
const REFUSAL_ERROR_NAME = 'OwnerFactRequestRefusal';
const NOT_AN_OWNER_FACT = 'not an owner fact: only a READY answer readOwnerFact issued has rows';

// Identity, not shape: only an answer this module issued carries the
// private brand, which no look-alike object can acquire.
class OwnerFactAnswer {
  #issued = true;

  /** @param {Object} fields - {state, rows, witness} or {state, reason, retryAfterMs?}. */
  constructor(fields) {
    Object.assign(this, fields);
    Object.freeze(this);
  }

  static isIssued(value) {
    return value !== null && typeof value === 'object' && #issued in value;
  }
}

/** A malformed owner-fact or hint request: a programming error, no read is issued. */
class OwnerFactRequestRefusal extends TypeError {
  /**
   * @param {string} code - An OWNER_FACT_REQUEST_REFUSAL.
   * @param {string} field - The refused field.
   */
  constructor(code, field) {
    super(`${code}: ${field}`);
    this.name = REFUSAL_ERROR_NAME;
    this.code = code;
    this.field = field;
  }
}

function refuseUnknownFields(draft, allowed) {
  for (const key of Object.keys(draft ?? {})) {
    if (!allowed.has(key)) {
      throw new OwnerFactRequestRefusal(OWNER_FACT_REQUEST_REFUSAL.UNKNOWN_FIELD, key);
    }
  }
}

function requireOwnerReadableTable(tableName) {
  const partitionId = typeof tableName === 'string' ?
    INITIAL_PARTITION_IDS[tableName] : undefined;
  if (typeof partitionId !== 'string') {
    throw new OwnerFactRequestRefusal(
      OWNER_FACT_REQUEST_REFUSAL.TABLE_NOT_OWNER_READABLE, FIELD.TABLE_NAME);
  }
  return partitionId;
}

function requireStatement(sql, params) {
  if (typeof sql !== 'string' || sql.length === 0) {
    throw new OwnerFactRequestRefusal(OWNER_FACT_REQUEST_REFUSAL.STATEMENT_REQUIRED, FIELD.SQL);
  }
  if (!Array.isArray(params)) {
    throw new OwnerFactRequestRefusal(OWNER_FACT_REQUEST_REFUSAL.STATEMENT_REQUIRED, FIELD.PARAMS);
  }
}

// The floor is a position {partitionId, index, term} of one raft group; 0 / 0
// says "no prior knowledge" explicitly. Whether it is a position of the group
// read is decided by the receiver (FLOOR_OTHER_PARTITION).
function requireFloor(draft) {
  const read = ownerFactReadOf(draft.floor);
  if (read === null) {
    throw new OwnerFactRequestRefusal(OWNER_FACT_REQUEST_REFUSAL.FLOOR_REQUIRED, FIELD.FLOOR);
  }
  return read.floor;
}

function requireDeadline(draft) {
  const {deadline} = draft;
  if (deadline === null || typeof deadline !== 'object' ||
      Object.keys(deadline).length !== DEADLINE_FIELD_COUNT ||
      !Number.isSafeInteger(deadline.timeoutMs) || deadline.timeoutMs <= 0) {
    throw new OwnerFactRequestRefusal(
      OWNER_FACT_REQUEST_REFUSAL.DEADLINE_REQUIRED, FIELD.DEADLINE);
  }
  return Object.freeze({timeoutMs: deadline.timeoutMs});
}

function requireRoutingClass(draft) {
  if (!ROUTING_CLASSES.has(draft.routingReadinessDimension)) {
    throw new OwnerFactRequestRefusal(
      OWNER_FACT_REQUEST_REFUSAL.ROUTING_CLASS_REQUIRED, FIELD.ROUTING_CLASS);
  }
  return draft.routingReadinessDimension;
}

function expectedReplicaOf(draft) {
  if (!Object.hasOwn(draft, FIELD.EXPECTED_REPLICA)) return undefined;
  const {expectedReplica} = draft;
  const named = (value) => typeof value === 'string' && value.length > 0;
  if (!named(expectedReplica?.nodeId) || !named(expectedReplica?.replicaId) ||
      Object.keys(expectedReplica).length !== EXPECTED_REPLICA_FIELD_COUNT) {
    throw new OwnerFactRequestRefusal(
      OWNER_FACT_REQUEST_REFUSAL.EXPECTED_REPLICA_MALFORMED, FIELD.EXPECTED_REPLICA);
  }
  return Object.freeze({nodeId: expectedReplica.nodeId,
    replicaId: expectedReplica.replicaId});
}

/**
 * Build the one owner-fact request shape. It has no mode field: a caller
 * cannot name, omit into a default, or misspell a weaker read. The floor, the
 * deadline and the routing class are required, never defaulted.
 * @param {Object} draft - {tableName, sql, params, floor: {partitionId, index,
 *   term}, deadline: {timeoutMs}, routingReadinessDimension, expectedReplica?}.
 * @return {Object} The frozen request, with the table's owner partitionId.
 * @throws {OwnerFactRequestRefusal} For any other key or a malformed field.
 */
function buildOwnerFactRequest(draft) {
  refuseUnknownFields(draft, OWNER_FACT_REQUEST_FIELDS);
  const partitionId = requireOwnerReadableTable(draft.tableName);
  requireStatement(draft.sql, draft.params);
  const floor = requireFloor(draft);
  const deadline = requireDeadline(draft);
  const routingReadinessDimension = requireRoutingClass(draft);
  const expectedReplica = expectedReplicaOf(draft);
  return Object.freeze({
    tableName: draft.tableName, partitionId, sql: draft.sql,
    params: Object.freeze([...draft.params]),
    floor, deadline, routingReadinessDimension,
    ...(expectedReplica === undefined ? {} : {expectedReplica}),
  });
}

function issue(answer) {
  return new OwnerFactAnswer(answer);
}

function unavailable(reason, retryAfterMs = null) {
  return issue({state: OWNER_FACT_STATE.UNAVAILABLE, reason,
    ...(Number.isSafeInteger(retryAfterMs) && retryAfterMs > 0 ?
      {retryAfterMs} : {})});
}

// The deadline and the routing class travel as the gateway's own read
// options (timeoutMs, routingReadinessDimension); the floor as the owner-fact
// read point the request builder sends to the receiver.
function readOptionsOf(request) {
  return Object.freeze({
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    ownerFactFloor: request.floor,
    timeoutMs: request.deadline.timeoutMs,
    routingReadinessDimension: request.routingReadinessDimension,
  });
}

function ownerFactAnswerOf(answer, request) {
  if (answer?.success !== true) {
    return unavailable(ownerFactFailureReasonOf(answer), answer?.retryAfterMs);
  }
  const read = Object.freeze({...ownerFactReadOf(request.floor),
    ...(request.expectedReplica === undefined ? {} :
      {expectedReplica: request.expectedReplica})});
  const witness = answer.readAuthorityWitness;
  const refusal = leaderReadWitnessRefusal(witness,
    {partitionId: request.partitionId, read});
  if (refusal !== null) return unavailable(refusal);
  if (!isCompleteAuthoritativeReadResult(answer)) {
    return unavailable(OWNER_FACT_UNAVAILABLE_REASON.INCOMPLETE_ROW_SET);
  }
  // Each answer owns its rows: a copy of every row, frozen.
  return issue({state: OWNER_FACT_STATE.READY,
    rows: Object.freeze(answer.rows.map((row) => Object.freeze({...row}))),
    witness: Object.freeze({...witness})});
}

/**
 * Read an owner fact: the rows of one single-partition system table as the
 * partition's leader holds them at a read point the leader itself vouches
 * for. The reader port receives a frozen leader-required token built here,
 * never from caller input; the function never retries and never sleeps (the
 * caller's existing continuation owns the next attempt).
 *
 * READY is a leader-local read point: the serving replica decided, on its
 * raft core's current observation, that it leads, has applied an entry of
 * its own term (so every entry an earlier leader committed) and
 * that the floor is a position of its group it has reached; the rows and the
 * applied position the witness names were read in one read transaction of
 * its connection, which no foreign transaction held; after the read it still
 * led in that term; and the answer echoes this request. It is not
 * linearizable: the leader may already have been deposed (stale by at most
 * its check_quorum bound plus transit).
 *
 * PRECONDITION for consumers: an empty READY is absence only because the
 * receiver refuses an insufficient read point (apply behind commit, election
 * log not applied) with a typed reason; that refusal is witnessed in
 * test/cdc/cdc-owner-fact-receiver-read-point.test.js. A consumer that
 * concludes absence from an empty result may migrate onto this function, and
 * onto no other leader-REQUIRED read (whose receiver does not refuse an
 * insufficient read point: test/cdc/cdc-leader-required-fresh-leader-absence.test.js).
 * @param {Function} readLeaderRows - (tableName, sql, params, readOptions) ->
 *   Promise<gateway read result>.
 * @param {Object} draft - {tableName, sql, params, floor: {partitionId, index,
 *   term}, deadline: {timeoutMs}, routingReadinessDimension, expectedReplica?}
 *   (see buildOwnerFactRequest); every field but expectedReplica is required.
 * @return {Promise<Object>} {state: READY, rows, witness} |
 *   {state: UNAVAILABLE, reason, retryAfterMs?}.
 * @throws {OwnerFactRequestRefusal} Before any read, for a malformed request.
 */
async function readOwnerFact(readLeaderRows, draft) {
  if (typeof readLeaderRows !== 'function') {
    throw new OwnerFactRequestRefusal(
      OWNER_FACT_REQUEST_REFUSAL.READER_REQUIRED, FIELD.READ_LEADER_ROWS);
  }
  const request = buildOwnerFactRequest(draft);
  let answer;
  try {
    answer = await readLeaderRows(request.tableName, request.sql,
      request.params, readOptionsOf(request));
  } catch {
    return unavailable(OWNER_FACT_UNAVAILABLE_REASON.READ_FAILED);
  }
  return ownerFactAnswerOf(answer, request);
}

/**
 * Whether a value is an answer readOwnerFact issued (identity, not shape).
 * @param {*} value
 * @return {boolean}
 */
function isOwnerFactAnswer(value) {
  return OwnerFactAnswer.isIssued(value);
}

/**
 * The rows of a READY owner fact. The only way a consumer that requires an
 * owner fact takes rows: a hint, a look-alike or an UNAVAILABLE answer throws.
 * @param {Object} answer - A readOwnerFact answer.
 * @return {Array<Object>} Its rows.
 */
function ownerFactRows(answer) {
  if (!OwnerFactAnswer.isIssued(answer) || answer.state !== OWNER_FACT_STATE.READY) {
    throw new TypeError(NOT_AN_OWNER_FACT);
  }
  return answer.rows;
}

/**
 * Read a hint: the node's projection of a system table (one source). A hint
 * may schedule a turn; it is never an owner fact and has no identity.
 * @param {Function} readProjectionRows - (tableName, {cachePredicate}) ->
 *   Promise<projection read result>.
 * @param {Object} draft - {tableName, cachePredicate?}.
 * @return {Promise<Object>} {state: OBSERVED, rows} | {state: UNAVAILABLE, reason}.
 */
async function readHint(readProjectionRows, draft) {
  if (typeof readProjectionRows !== 'function') {
    throw new OwnerFactRequestRefusal(
      OWNER_FACT_REQUEST_REFUSAL.READER_REQUIRED, FIELD.READ_PROJECTION_ROWS);
  }
  refuseUnknownFields(draft, HINT_REQUEST_FIELDS);
  requireOwnerReadableTable(draft.tableName);
  let result;
  try {
    result = await readProjectionRows(draft.tableName,
      {cachePredicate: draft.cachePredicate});
  } catch {
    result = null;
  }
  return result?.success === true && Array.isArray(result.rows) ?
    Object.freeze({state: CONTROL_PLANE_HINT_STATE.OBSERVED,
      rows: Object.freeze([...result.rows])}) :
    Object.freeze({state: CONTROL_PLANE_HINT_STATE.UNAVAILABLE,
      reason: HINT_READ_FAILED});
}

export {
  CONTROL_PLANE_HINT_STATE,
  OWNER_FACT_REQUEST_REFUSAL,
  OWNER_FACT_STATE,
  OWNER_FACT_UNAVAILABLE_REASON,
  OwnerFactRequestRefusal,
  buildOwnerFactRequest,
  isOwnerFactAnswer,
  ownerFactRows,
  readHint,
  readOwnerFact,
};
