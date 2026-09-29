import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {COLUMN} from '../constants/index.js';
import {normalizeKnownNodeBootIncarnation} from
  './control-plane-error-classification.js';
import {
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from './control-plane-system-table-gateway.js';
import {
  NODE_LIFECYCLE_AUTHORITATIVE_READ,
  SELECT_NODE_ROW_SQL,
} from './node-lifecycle-publication.js';

/**
 * The exact-incarnation fence of a node's own terminal NODES transitions
 * (graceful shutdown, failed-join withdrawal). The final durable mutation
 * itself carries the canonical boot incarnation from registration, so a
 * previous process incarnation can never stop or withdraw its replacement.
 * A zero-row or unknown outcome is resolved only by an authoritative readback
 * of the NODES owner; nothing here retries or queues.
 */
const NODE_TERMINAL_TRANSITION_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  RESOLVED_BY_READBACK: 'resolved_by_readback',
  NOT_APPLIED: 'not_applied_source_unchanged',
  REFUSED_STALE_INCARNATION: 'refused_stale_incarnation',
  REFUSED_SOURCE_CHANGED: 'refused_source_changed',
  REFUSED_ROW_MISSING: 'refused_row_missing',
  REFUSED_INCARNATION_REQUIRED: 'refused_incarnation_required',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
});

const COMPLETED_OUTCOMES = Object.freeze([
  NODE_TERMINAL_TRANSITION_OUTCOME.APPLIED,
  NODE_TERMINAL_TRANSITION_OUTCOME.RESOLVED_BY_READBACK,
]);

const REFUSED_OUTCOMES = Object.freeze([
  NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_STALE_INCARNATION,
  NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_SOURCE_CHANGED,
  NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_ROW_MISSING,
  NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_INCARNATION_REQUIRED,
]);

function isNodeTerminalTransitionCompleted(outcome) {
  return COMPLETED_OUTCOMES.includes(outcome);
}

function isNodeTerminalTransitionRefused(outcome) {
  return REFUSED_OUTCOMES.includes(outcome);
}

/**
 * @param {string} nodeId
 * @param {number} bootIncarnation
 * @return {Object} The exact-incarnation predicate of the final mutation.
 */
function buildNodeIncarnationWhereClause(nodeId, bootIncarnation) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
  };
}

function affectedRowsOf(result) {
  const affectedRows = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  return Number.isFinite(affectedRows) ? affectedRows : null;
}

async function readNodeRow(gateway, nodeId) {
  let result = null;
  try {
    result = await readAuthoritativeControlPlaneRows(
      gateway,
      SYSTEM_TABLE_NAME.NODES,
      SELECT_NODE_ROW_SQL,
      [nodeId],
      NODE_LIFECYCLE_AUTHORITATIVE_READ,
    );
  } catch (_error) {
    result = null;
  }
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result)) {
    return {available: false, row: null};
  }
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return {
    available: true,
    row: rows.find((row) => row?.[COLUMN.NODE_ID] === nodeId) || null,
  };
}

function rowReachedDestination(row, destination) {
  return Object.entries(destination).every(([column, value]) =>
    row?.[column] === value);
}

function classifyReadback(read, bootIncarnation, destination) {
  if (read.available !== true) {
    return NODE_TERMINAL_TRANSITION_OUTCOME.AUTHORITY_UNAVAILABLE;
  }
  if (!read.row) return NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_ROW_MISSING;
  const knownIncarnation = normalizeKnownNodeBootIncarnation(
    read.row[COLUMN.BOOT_INCARNATION],
  );
  if (knownIncarnation > bootIncarnation) {
    return NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_STALE_INCARNATION;
  }
  if (knownIncarnation !== bootIncarnation) {
    return NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_SOURCE_CHANGED;
  }
  return rowReachedDestination(read.row, destination) ?
    NODE_TERMINAL_TRANSITION_OUTCOME.RESOLVED_BY_READBACK :
    NODE_TERMINAL_TRANSITION_OUTCOME.NOT_APPLIED;
}

/**
 * Apply one terminal transition of this node's own row at its exact
 * incarnation.
 * @param {Object} options
 * @param {Object} options.gateway - Control-plane system-table gateway.
 * @param {string} options.nodeId
 * @param {number} options.bootIncarnation - This process's incarnation.
 * @param {Object} options.destination - Lifecycle columns the transition
 *   establishes (the readback criterion).
 * @param {Function} options.write - (whereClause) => mutation result.
 * @return {Promise<Object>} Frozen {outcome, result, error, row}.
 */
async function applyNodeTerminalTransition(options) {
  const {gateway, nodeId, destination, write} = options;
  const bootIncarnation =
    normalizeKnownNodeBootIncarnation(options.bootIncarnation);
  if (bootIncarnation === 0) {
    return Object.freeze({
      outcome: NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_INCARNATION_REQUIRED,
      result: null,
      error: null,
    });
  }
  let result = null;
  let error = null;
  try {
    result = await write(buildNodeIncarnationWhereClause(nodeId, bootIncarnation));
  } catch (writeError) {
    error = writeError;
  }
  if (error === null && affectedRowsOf(result) > 0) {
    return Object.freeze({
      outcome: NODE_TERMINAL_TRANSITION_OUTCOME.APPLIED, result, error,
    });
  }
  const read = await readNodeRow(gateway, nodeId);
  return Object.freeze({
    outcome: classifyReadback(read, bootIncarnation, destination),
    result,
    error,
    knownIncarnation: normalizeKnownNodeBootIncarnation(
      read.row?.[COLUMN.BOOT_INCARNATION],
    ),
  });
}

export {
  NODE_TERMINAL_TRANSITION_OUTCOME,
  applyNodeTerminalTransition,
  isNodeTerminalTransitionCompleted,
  isNodeTerminalTransitionRefused,
};
