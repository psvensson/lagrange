// Cluster identity at join (stage S4 of formation-admission-design-2026-11-11
// .md, decision D6, findings F3e and the joiner overwrite). Both sides of one
// comparison:
//   - the server (any node answering /bootstrap) answers a join only when it
//     KNOWS its own identity, read from the durable owner (the CONFIG
//     partition, through the control-plane gateway's authoritative read);
//     when it cannot, it answers a typed retryable "identity unavailable",
//     never admits on unknown; a joiner naming another cluster is refused;
//   - the joiner refuses a response for a cluster other than the one it
//     durably holds, and adopts the response's id only on its first join.
// Each compared fact is one JOIN_IDENTITY_FACTS entry (its CONFIG key and
// its request and response fields): a second identity fact is one more
// entry, read by the same query and compared by the same functions.
import {COLUMN, HTTP_STATUS, TABLES} from '../constants/index.js';
import {BOOTSTRAP_PIPELINE_ERROR_CODE} from './bootstrap-constants.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
} from './bootstrap-api-constants.js';
import {
  CLUSTER_ID_CONFIG_KEY,
  CLUSTER_ID_MATCH_STATE,
  classifyClusterIdMatch,
} from './cluster-identity-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';

const JOIN_IDENTITY_FACTS = Object.freeze([
  Object.freeze({
    name: 'clusterId',
    configKey: CLUSTER_ID_CONFIG_KEY,
    requestField: 'expectedClusterId',
    responseField: 'clusterId',
  }),
]);
const CLUSTER_ID_FACT = JOIN_IDENTITY_FACTS[0];

const SERVER_IDENTITY_STATE = Object.freeze({
  KNOWN: 'known',
  UNAVAILABLE: 'unavailable',
});

const SERVER_IDENTITY_UNAVAILABLE_REASON = Object.freeze({
  // No control-plane gateway is attached yet.
  SOURCE_ABSENT: 'source_absent',
  // The authoritative read failed or did not answer an explicit success.
  READ_FAILED: 'read_failed',
  // The read succeeded but the identity row is not committed yet.
  ROW_ABSENT: 'row_absent',
});

const JOIN_IDENTITY_DECISION = Object.freeze({
  ADMIT: 'admit',
  REFUSE_MISMATCH: 'refuse_mismatch',
  DEFER_UNAVAILABLE: 'defer_unavailable',
});

const NO_IDENTITY_TEXT = 'none';
const KEEP_HELD_IDENTITY_TEXT = 'refusing to join and keeping the held identity';

// The handler stage name of an identity-unavailable deferral.
const IDENTITY_DEFER_STAGE = 'cluster_identity';

const JOIN_RESPONSE_IDENTITY_STATE = Object.freeze({
  FIRST_JOIN: 'first_join',
  // A node holding no identity met a response without one (a server outside
  // this contract): nothing to compare and nothing to adopt; the hints
  // persistence records the id once this node's cache holds the CONFIG row.
  FIRST_JOIN_UNSTAMPED: 'first_join_unstamped',
  MATCH: 'match',
  MISMATCH: 'mismatch',
  IDENTITY_ABSENT: 'identity_absent',
});

const JOIN_IDENTITY_REFUSAL_CODE = Object.freeze({
  REQUEST_MISMATCH: 'CLUSTER_ID_JOIN_REQUEST_MISMATCH',
  RESPONSE_MISMATCH: 'CLUSTER_ID_JOIN_RESPONSE_MISMATCH',
  RESPONSE_IDENTITY_ABSENT: 'CLUSTER_ID_JOIN_RESPONSE_IDENTITY_ABSENT',
});

const IDENTITY_READ_OPTIONS = Object.freeze({
  readAuthority: buildControlPlaneReadAuthority({
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  }),
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});
const SELECT_IDENTITY_ROWS_SQL = `SELECT * FROM ${TABLES.CONFIG} WHERE ` +
  `${COLUMN.CONFIG_KEY} IN (${JOIN_IDENTITY_FACTS.map(() => '?').join(', ')})`;

function nonEmptyText(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function serverIdentityUnavailable(reason, cause = null) {
  return Object.freeze({state: SERVER_IDENTITY_STATE.UNAVAILABLE, reason,
    cause, facts: null});
}

/**
 * Read this server's identity facts from the durable owner. Only an explicit
 * success holding every fact's row is KNOWN; anything else is UNAVAILABLE
 * with its reason, never an absent identity treated as compatible.
 * @param {Object|null} gateway The control-plane system table gateway.
 * @return {Promise<Object>} Frozen {state, reason, cause, facts}.
 */
async function readServerClusterIdentity(gateway) {
  if (!gateway) {
    return serverIdentityUnavailable(SERVER_IDENTITY_UNAVAILABLE_REASON.SOURCE_ABSENT);
  }
  let result;
  try {
    result = await readAuthoritativeControlPlaneRows(gateway, TABLES.CONFIG,
      SELECT_IDENTITY_ROWS_SQL, JOIN_IDENTITY_FACTS.map((fact) => fact.configKey),
      IDENTITY_READ_OPTIONS);
  } catch (error) {
    return serverIdentityUnavailable(SERVER_IDENTITY_UNAVAILABLE_REASON.READ_FAILED,
      error?.message ?? String(error));
  }
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result)) {
    return serverIdentityUnavailable(SERVER_IDENTITY_UNAVAILABLE_REASON.READ_FAILED,
      result?.error ?? null);
  }
  const facts = {};
  for (const fact of JOIN_IDENTITY_FACTS) {
    const row = result.rows.find((candidate) =>
      candidate?.[COLUMN.CONFIG_KEY] === fact.configKey);
    const value = nonEmptyText(row?.[COLUMN.CONFIG_VALUE]);
    if (value === null) {
      return serverIdentityUnavailable(SERVER_IDENTITY_UNAVAILABLE_REASON.ROW_ABSENT,
        fact.configKey);
    }
    facts[fact.name] = value;
  }
  return Object.freeze({state: SERVER_IDENTITY_STATE.KNOWN, reason: null,
    cause: null, facts: Object.freeze(facts)});
}

/**
 * Decide a join's identity admission. A request without an expected value
 * for a fact (a fresh node's first join) is not compared, but the server
 * still answers only when it knows its identity: the response always
 * carries it.
 * @param {Object} serverIdentity readServerClusterIdentity answer.
 * @param {Object} requestBody The bootstrap request body.
 * @return {Object} Frozen {decision, serverIdentity, fact, expected, actual}.
 */
function decideJoinIdentityAdmission(serverIdentity, requestBody) {
  if (serverIdentity.state !== SERVER_IDENTITY_STATE.KNOWN) {
    return Object.freeze({decision: JOIN_IDENTITY_DECISION.DEFER_UNAVAILABLE,
      serverIdentity, fact: null, expected: null, actual: null});
  }
  for (const fact of JOIN_IDENTITY_FACTS) {
    const expected = nonEmptyText(requestBody?.[fact.requestField]);
    const actual = serverIdentity.facts[fact.name];
    if (classifyClusterIdMatch(expected, actual) === CLUSTER_ID_MATCH_STATE.MISMATCH) {
      return Object.freeze({decision: JOIN_IDENTITY_DECISION.REFUSE_MISMATCH,
        serverIdentity, fact: fact.name, expected, actual});
    }
  }
  return Object.freeze({decision: JOIN_IDENTITY_DECISION.ADMIT, serverIdentity,
    fact: null, expected: null, actual: null});
}

function answerIdentityUnavailable(owner, reply, decision, request) {
  const retryAfterMs = owner.getBootstrapAdmissionRetryAfterMs();
  owner.logBootstrapRequestDeferred({...request,
    deferStage: IDENTITY_DEFER_STAGE,
    reasonCode: BOOTSTRAP_API_PROBE_REASON.CLUSTER_IDENTITY_UNAVAILABLE,
    retryAfterMs});
  reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
  return {...owner.buildBootstrapNotReadyResponse({
    error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
    code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    reasonCode: BOOTSTRAP_API_PROBE_REASON.CLUSTER_IDENTITY_UNAVAILABLE,
    retryAfterMs,
  }), identityUnavailableReason: decision.serverIdentity.reason};
}

function answerIdentityMismatch(owner, reply, decision, request) {
  owner.getLogger().warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, {...request,
    error: BOOTSTRAP_API_ERROR.CLUSTER_ID_MISMATCH, fact: decision.fact,
    expected: decision.expected, actual: decision.actual});
  reply.code(HTTP_STATUS.CONFLICT);
  return {error: BOOTSTRAP_API_ERROR.CLUSTER_ID_MISMATCH,
    code: JOIN_IDENTITY_REFUSAL_CODE.REQUEST_MISMATCH, fact: decision.fact,
    expected: decision.expected, actual: decision.actual};
}

/**
 * The bootstrap handler's identity gate: read, decide, and on refusal set
 * the reply status and build its body (409 mismatch, 503 typed retryable
 * unavailability on the joiner's existing seed-contact retry path).
 * @param {Object} owner The bootstrap request owner.
 * @param {Object} reply The HTTP reply.
 * @param {Object} requestBody The bootstrap request body.
 * @return {Promise<Object>} {refusal: body|null, clusterId: string|null}.
 */
async function gateJoinClusterIdentity(owner, reply, requestBody) {
  const decision = decideJoinIdentityAdmission(
    await owner.readClusterIdentity(), requestBody);
  const request = {nodeId: requestBody?.nodeId ?? null,
    nodeAddress: requestBody?.nodeAddress ?? null};
  if (decision.decision === JOIN_IDENTITY_DECISION.DEFER_UNAVAILABLE) {
    return {refusal: answerIdentityUnavailable(owner, reply, decision, request),
      clusterId: null};
  }
  if (decision.decision === JOIN_IDENTITY_DECISION.REFUSE_MISMATCH) {
    return {refusal: answerIdentityMismatch(owner, reply, decision, request),
      clusterId: null};
  }
  return {refusal: null,
    clusterId: decision.serverIdentity.facts[CLUSTER_ID_FACT.name]};
}

/**
 * Classify a successful bootstrap response's identity against the identity
 * this node durably holds.
 * @param {string|null} heldClusterId The id this node durably holds.
 * @param {Object} response The bootstrap response.
 * @return {string} A JOIN_RESPONSE_IDENTITY_STATE.
 */
function classifyJoinResponseIdentity(heldClusterId, response) {
  const responseId = nonEmptyText(response?.[CLUSTER_ID_FACT.responseField]);
  if (nonEmptyText(heldClusterId) === null) {
    return responseId === null ? JOIN_RESPONSE_IDENTITY_STATE.FIRST_JOIN_UNSTAMPED :
      JOIN_RESPONSE_IDENTITY_STATE.FIRST_JOIN;
  }
  if (responseId === null) return JOIN_RESPONSE_IDENTITY_STATE.IDENTITY_ABSENT;
  return heldClusterId === responseId ? JOIN_RESPONSE_IDENTITY_STATE.MATCH :
    JOIN_RESPONSE_IDENTITY_STATE.MISMATCH;
}

/**
 * The joiner's acceptance of a bootstrap response: the cluster id it may
 * persist, or a typed terminal refusal naming both ids. A node holding an id
 * accepts only the same id (MATCH); a node holding none adopts the
 * response's (FIRST_JOIN). Nothing is persisted on refusal.
 * @param {string|null} heldClusterId The id this node durably holds.
 * @param {Object} response The bootstrap response.
 * @return {string|null} The cluster id to persist (null only on
 *   FIRST_JOIN_UNSTAMPED).
 */
function acceptJoinResponseClusterIdentity(heldClusterId, response) {
  const state = classifyJoinResponseIdentity(heldClusterId, response);
  if (state === JOIN_RESPONSE_IDENTITY_STATE.FIRST_JOIN ||
      state === JOIN_RESPONSE_IDENTITY_STATE.MATCH) {
    return response[CLUSTER_ID_FACT.responseField];
  }
  if (state === JOIN_RESPONSE_IDENTITY_STATE.FIRST_JOIN_UNSTAMPED) return null;
  const responseId = nonEmptyText(response?.[CLUSTER_ID_FACT.responseField]);
  const code = state === JOIN_RESPONSE_IDENTITY_STATE.MISMATCH ?
    JOIN_IDENTITY_REFUSAL_CODE.RESPONSE_MISMATCH :
    JOIN_IDENTITY_REFUSAL_CODE.RESPONSE_IDENTITY_ABSENT;
  throw Object.assign(new Error(`${code}: this node durably holds cluster ` +
    `${heldClusterId ?? NO_IDENTITY_TEXT}; the bootstrap response is for ` +
    `cluster ${responseId ?? NO_IDENTITY_TEXT}; ${KEEP_HELD_IDENTITY_TEXT}`), {
    code, state, heldClusterId, responseClusterId: responseId, retryable: false,
  });
}

export {
  JOIN_IDENTITY_REFUSAL_CODE,
  JOIN_RESPONSE_IDENTITY_STATE,
  SERVER_IDENTITY_STATE,
  acceptJoinResponseClusterIdentity,
  gateJoinClusterIdentity,
  readServerClusterIdentity,
};
