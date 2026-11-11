// The durable record of the declared formation size (owner ruling
// 2026-11-11, stage S1 of formation-admission-design-2026-11-11.md). The
// founding seed writes it ONCE as a replicated CONFIG row beside cluster_id,
// through the same original-publication owner (seed-original-registration.js)
// and the same bootstrap system-table writer. The row is the authority
// (R10); the node's configuration only proposes the value at founding.
//
// This module owns the row's key, its value encoding, the decoder with named
// outcomes and the read contract consumers use. A read answers exactly one of
// DECLARED{count} / UNDECLARED / UNAVAILABLE{reason}; a failed or
// not-yet-hydrated read is UNAVAILABLE, never UNDECLARED and never a number.
// Every answer names the read strategy that served it (the control-plane
// read vocabulary CONTROL_PLANE_READ_STRATEGY: CACHE or AUTHORITATIVE), so a
// cache-served answer is never mistaken for an authoritative one.
import {COLUMN, TABLES} from '../constants/index.js';
import {CONFIG_VALUE_TYPE} from '../config/config-definitions.js';
import {CLUSTER_ID_CONFIG_KEY} from './cluster-identity-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_READ_STRATEGY,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {copyDenseOwnDataRecordArray, copyStrictOwnDataRecord} from
  '../utils/strict-own-data.js';

// The replicated CONFIG-row key and value type of the declared size.
const FORMATION_TARGET_CONFIG_KEY = 'formation_target_node_count';
const FORMATION_TARGET_CONFIG_VALUE_TYPE = CONFIG_VALUE_TYPE.NUMBER;
const FORMATION_TARGET_CONFIG_DESCRIPTION =
  'Declared formation size: the intended total node count of the cluster, ' +
  'written once by the founding seed';
// The value is the decimal text of a positive integer, nothing else.
const FORMATION_TARGET_VALUE_PATTERN = /^[1-9][0-9]*$/u;

const DECLARED_FORMATION_SIZE_STATE = Object.freeze({
  DECLARED: 'DECLARED',
  UNDECLARED: 'UNDECLARED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON = Object.freeze({
  // No row source was supplied to the read.
  SOURCE_ABSENT: 'source_absent',
  // The authoritative read failed or did not answer an explicit success.
  READ_FAILED: 'read_failed',
  // The view does not yet hold the cluster identity row. The founding seed
  // writes the formation row before cluster_id in the same CONFIG group, so
  // only a view that holds cluster_id can prove the formation row's absence.
  IDENTITY_NOT_VISIBLE: 'identity_not_visible',
  // A formation row exists but does not carry a positive integer.
  MALFORMED_ROW: 'malformed_row',
});

// Typed startup refusals of the founding publication.
const FORMATION_TARGET_RECORD_ERROR_CODE = Object.freeze({
  // The retained durable row carries a different size than configured.
  MISMATCH: 'FORMATION_TARGET_DURABLE_MISMATCH',
  // The durable row could not be read, or a write could not be observed.
  UNAVAILABLE: 'FORMATION_TARGET_DURABLE_UNAVAILABLE',
});

// Cluster-wide authoritative read for consumers (S2): the CONFIG partition
// owner answers, never a local replica or the cache.
const FORMATION_TARGET_AUTHORITATIVE_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});
const FORMATION_TARGET_AUTHORITATIVE_READ_OPTIONS = Object.freeze({
  readAuthority: FORMATION_TARGET_AUTHORITATIVE_READ_AUTHORITY,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});
const SELECT_FORMATION_SIZE_ROWS_SQL =
  'SELECT * FROM config WHERE config_key IN (?, ?)';

function encodeFormationTargetValue(count) {
  return String(count);
}

/**
 * Decode one formation row's value. Only the owner's encoding is a count.
 * @param {Object} row A CONFIG row whose key is FORMATION_TARGET_CONFIG_KEY.
 * @return {number|null} The count, or null for a malformed row.
 */
function decodeFormationTargetValue(row) {
  const text = row?.[COLUMN.CONFIG_VALUE];
  if (row?.[COLUMN.VALUE_TYPE] !== FORMATION_TARGET_CONFIG_VALUE_TYPE ||
      typeof text !== 'string' || !FORMATION_TARGET_VALUE_PATTERN.test(text)) {
    return null;
  }
  const count = Number(text);
  return Number.isSafeInteger(count) ? count : null;
}

/**
 * The CONFIG row the founding seed writes, shaped exactly like cluster_id's.
 * @param {Object} input {count, nodeId, timestamp}.
 * @return {Object} The row.
 */
function buildFormationTargetRow({count, nodeId, timestamp}) {
  const value = encodeFormationTargetValue(count);
  return {
    [COLUMN.CONFIG_KEY]: FORMATION_TARGET_CONFIG_KEY,
    [COLUMN.CONFIG_VALUE]: value,
    [COLUMN.VALUE_TYPE]: FORMATION_TARGET_CONFIG_VALUE_TYPE,
    [COLUMN.REQUIRES_RESTART]: 0,
    [COLUMN.DESCRIPTION]: FORMATION_TARGET_CONFIG_DESCRIPTION,
    [COLUMN.DEFAULT_VALUE]: value,
    [COLUMN.UPDATED_BY]: nodeId,
    [COLUMN.UPDATED_AT]: timestamp,
    [COLUMN.CREATED_AT]: timestamp,
  };
}

function answer(readStrategy, state, fields = {}) {
  return Object.freeze({state, count: fields.count ?? null,
    reason: fields.reason ?? null, readStrategy});
}

function unavailable(readStrategy, reason) {
  return answer(readStrategy, DECLARED_FORMATION_SIZE_STATE.UNAVAILABLE, {reason});
}

/**
 * Decide the declared formation size from the CONFIG rows one view holds.
 * @param {string} readStrategy CONTROL_PLANE_READ_STRATEGY that served rows.
 * @param {Object|null} identityRow The cluster_id row, or null if absent.
 * @param {Object|null} formationRow The formation row, or null if absent.
 * @return {Object} Frozen {state, count, reason, readStrategy}.
 */
function decideDeclaredFormationSize(readStrategy, identityRow, formationRow) {
  if (identityRow === null) {
    return unavailable(readStrategy,
      DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON.IDENTITY_NOT_VISIBLE);
  }
  if (formationRow === null) {
    return answer(readStrategy, DECLARED_FORMATION_SIZE_STATE.UNDECLARED);
  }
  const count = decodeFormationTargetValue(formationRow);
  return count === null ?
    unavailable(readStrategy, DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON.MALFORMED_ROW) :
    answer(readStrategy, DECLARED_FORMATION_SIZE_STATE.DECLARED, {count});
}

/**
 * The declared formation size from the local system-table cache. The answer
 * is marked CACHE: a hint for diagnostics, never authority for a decision.
 * @param {Object|null} systemTableCache The node's system table cache.
 * @return {Object} Frozen {state, count, reason, readStrategy: 'cache'}.
 */
function readCachedDeclaredFormationSize(systemTableCache) {
  const strategy = CONTROL_PLANE_READ_STRATEGY.CACHE;
  if (!systemTableCache) {
    return unavailable(strategy, DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON.SOURCE_ABSENT);
  }
  return decideDeclaredFormationSize(strategy,
    systemTableCache.get(TABLES.CONFIG, CLUSTER_ID_CONFIG_KEY) ?? null,
    systemTableCache.get(TABLES.CONFIG, FORMATION_TARGET_CONFIG_KEY) ?? null);
}

function rowByKey(rows, key) {
  return rows.find((row) => row[COLUMN.CONFIG_KEY] === key) ?? null;
}

async function readAuthoritativeDeclaredFormationSize(gateway) {
  const strategy = CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
  if (!gateway) {
    return unavailable(strategy, DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON.SOURCE_ABSENT);
  }
  let result;
  try {
    result = copyStrictOwnDataRecord(await readAuthoritativeControlPlaneRows(gateway,
      TABLES.CONFIG, SELECT_FORMATION_SIZE_ROWS_SQL,
      [CLUSTER_ID_CONFIG_KEY, FORMATION_TARGET_CONFIG_KEY],
      FORMATION_TARGET_AUTHORITATIVE_READ_OPTIONS));
  } catch {
    return unavailable(strategy, DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON.READ_FAILED);
  }
  const rows = isAuthoritativeControlPlaneRowReadSuccessful(result) ?
    copyDenseOwnDataRecordArray(result.rows) : null;
  if (rows === null) {
    return unavailable(strategy, DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON.READ_FAILED);
  }
  return decideDeclaredFormationSize(strategy,
    rowByKey(rows, CLUSTER_ID_CONFIG_KEY), rowByKey(rows, FORMATION_TARGET_CONFIG_KEY));
}

/**
 * The read contract for the declared formation size. AUTHORITATIVE asks the
 * CONFIG partition owner through the control-plane gateway; CACHE answers
 * from the local system-table cache. Every answer carries its readStrategy.
 * @param {Object} source {readStrategy, gateway, systemTableCache}.
 * @return {Promise<Object>} Frozen {state, count, reason, readStrategy}.
 */
async function readDeclaredFormationSize({readStrategy, gateway = null,
  systemTableCache = null} = {}) {
  if (readStrategy === CONTROL_PLANE_READ_STRATEGY.CACHE) {
    return readCachedDeclaredFormationSize(systemTableCache);
  }
  if (readStrategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE) {
    return readAuthoritativeDeclaredFormationSize(gateway);
  }
  throw new TypeError(`Unsupported declared formation size read strategy: ${readStrategy}`);
}

function formationTargetRecordError(code, detail, cause = undefined) {
  const error = new Error(`${code}: ${JSON.stringify(detail)}`, {cause});
  error.code = code;
  error.detail = Object.freeze({...detail});
  return Object.freeze(error);
}

export {
  DECLARED_FORMATION_SIZE_STATE,
  DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON,
  FORMATION_TARGET_CONFIG_KEY,
  FORMATION_TARGET_RECORD_ERROR_CODE,
  buildFormationTargetRow,
  decodeFormationTargetValue,
  formationTargetRecordError,
  readCachedDeclaredFormationSize,
  readDeclaredFormationSize,
};
