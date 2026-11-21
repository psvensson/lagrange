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
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';

const OWNER_FACT_STATE = Object.freeze({
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
});
const OWNER_FACT_REQUEST_REFUSAL = Object.freeze({
  UNKNOWN_FIELD: 'owner_fact_unknown_field',
  FLOOR_REQUIRED: 'owner_fact_floor_required',
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
  MINIMUM_INDEX: 'minimumIndex',
  MINIMUM_TERM: 'minimumTerm',
  EXPECTED_REPLICA: 'expectedReplica',
  TIMEOUT_BUDGET: 'timeoutBudget',
  CACHE_PREDICATE: 'cachePredicate',
  READ_LEADER_ROWS: 'readLeaderRows',
  READ_PROJECTION_ROWS: 'readProjectionRows',
});
const OWNER_FACT_REQUEST_FIELDS = new Set([FIELD.TABLE_NAME, FIELD.SQL, FIELD.PARAMS,
  FIELD.MINIMUM_INDEX, FIELD.MINIMUM_TERM, FIELD.EXPECTED_REPLICA, FIELD.TIMEOUT_BUDGET]);
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

function requireFloor(draft, field) {
  if (!Number.isSafeInteger(draft[field]) || draft[field] < 0) {
    throw new OwnerFactRequestRefusal(OWNER_FACT_REQUEST_REFUSAL.FLOOR_REQUIRED, field);
  }
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
 * cannot name, omit into a default, or misspell a weaker read. Floors are
 * required (0 says "no prior knowledge" explicitly), never defaulted.
 * @param {Object} draft - {tableName, sql, params, minimumIndex, minimumTerm,
 *   expectedReplica?, timeoutBudget?}.
 * @return {Object} The frozen request, with the table's owner partitionId.
 * @throws {OwnerFactRequestRefusal} For any other key or a malformed field.
 */
function buildOwnerFactRequest(draft) {
  refuseUnknownFields(draft, OWNER_FACT_REQUEST_FIELDS);
  const partitionId = requireOwnerReadableTable(draft.tableName);
  requireStatement(draft.sql, draft.params);
  requireFloor(draft, FIELD.MINIMUM_INDEX);
  requireFloor(draft, FIELD.MINIMUM_TERM);
  const expectedReplica = expectedReplicaOf(draft);
  return Object.freeze({
    tableName: draft.tableName, partitionId, sql: draft.sql,
    params: Object.freeze([...draft.params]),
    minimumIndex: draft.minimumIndex, minimumTerm: draft.minimumTerm,
    ...(expectedReplica === undefined ? {} : {expectedReplica}),
    ...(Object.hasOwn(draft, FIELD.TIMEOUT_BUDGET) ?
      {timeoutBudget: draft.timeoutBudget} : {}),
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

function readOptionsOf(request) {
  return Object.freeze({
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    ownerFactFloor: Object.freeze({minimumIndex: request.minimumIndex,
      minimumTerm: request.minimumTerm}),
    ...(Object.hasOwn(request, FIELD.TIMEOUT_BUDGET) ?
      {timeoutBudget: request.timeoutBudget} : {}),
  });
}

function ownerFactAnswerOf(answer, request) {
  if (answer?.success !== true) {
    return unavailable(ownerFactFailureReasonOf(answer), answer?.retryAfterMs);
  }
  const read = Object.freeze({...ownerFactReadOf(request),
    ...(request.expectedReplica === undefined ? {} :
      {expectedReplica: request.expectedReplica})});
  const witness = answer.readAuthorityWitness;
  const refusal = leaderReadWitnessRefusal(witness,
    {partitionId: request.partitionId, read});
  if (refusal !== null) return unavailable(refusal);
  if (!isCompleteAuthoritativeReadResult(answer)) {
    return unavailable(OWNER_FACT_UNAVAILABLE_REASON.INCOMPLETE_ROW_SET);
  }
  return issue({state: OWNER_FACT_STATE.READY,
    rows: Object.freeze([...answer.rows]), witness: Object.freeze({...witness})});
}

/**
 * Read an owner fact: the rows of one single-partition system table as the
 * partition's leader holds them at a read point the leader itself vouches
 * for. The reader port receives a frozen leader-required token built here,
 * never from caller input; the function never retries and never sleeps (the
 * caller's existing continuation owns the next attempt).
 *
 * READY is a leader-local read point: the serving replica's core said, in one
 * observation taken in the same synchronous step as the row read, that it
 * leads, has applied its commit index, has applied every entry its log held
 * when it was elected (so every entry an earlier leader committed), and meets
 * the floors; after the read it still led in that term with an unmoved
 * applied index. It is not linearizable: the leader may already have
 * been deposed (stale by at most its check_quorum bound plus transit).
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
 * @param {Object} draft - See buildOwnerFactRequest.
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
