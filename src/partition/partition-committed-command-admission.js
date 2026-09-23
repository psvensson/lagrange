// The one owner of "may this committed command enter consensus": every path
// in the partition that proposes a committed command asks it first, and a
// refusal answers the caller at once and proposes nothing.
//
// A committed entry is applied on every replica and cannot be taken back, so
// a command the application would refuse (an unknown type fails the
// application closed; a marker from outside the transaction owner or a
// session-bound command without its session would be consumed and never
// answer its proposer) is refused here, before it is proposed, with a typed
// code of PARTITION_COMMITTED_COMMAND_ERROR_CODE:
//
// - COMMAND_TYPE_UNKNOWN: the type is not a committed command type;
// - SESSION_MISSING: a session-bound type (a transaction marker) carries no
//   sessionId;
// - MARKER_NOT_ADMISSIBLE: a transaction marker enters consensus only from the
//   transaction owner, after its local COMMIT or ROLLBACK;
// - STATEMENT_MISSING: an SQL command type carries no statement;
// - ENTRY_ID_MISSING: an SQL command carries no entryId, so the outcome row
//   the application keys it by and the pending answer have no key.
//
// It also answers which recognised types exist (the application's own
// dispatch asks it): the type lists are frozen arrays in the constants owner,
// and membership is asked here, once.

import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_COMMITTED_COMMAND_TYPES,
  PARTITION_COMMITTED_MARKER_COMMAND_TYPES,
  PARTITION_COMMITTED_SQL_COMMAND_TYPES,
  PARTITION_SERVICE_ERROR_MSG,
} from './partition-service-constants.js';

// Who asks to propose a committed command. A transaction marker enters
// consensus only from the transaction owner, after its local COMMIT or
// ROLLBACK; every other command comes through the write path (applyWrite,
// including a forwarded write).
const PARTITION_COMMITTED_COMMAND_ORIGIN = Object.freeze({
  WRITE_PATH: 'write-path',
  TRANSACTION_OWNER: 'transaction-owner',
});

// What a refused write is answered with.
const PARTITION_COMMITTED_COMMAND_ADMISSION_MSG = Object.freeze({
  commandTypeUnknown: (type) =>
    'Partition write refused before it was proposed: command type ' +
    `${JSON.stringify(type ?? null)} is not a committed command type`,
  markerNotAdmissible: (type, origin) =>
    `Partition write refused before it was proposed: the ${type} ` +
    'transaction marker enters consensus only from the transaction owner ' +
    `(origin ${origin})`,
  sessionMissing: (type) =>
    `Partition write refused before it was proposed: ${type} is bound to ` +
    'a transaction session and carries no sessionId',
  ENTRY_ID_MISSING:
    'Partition write refused before it was proposed: an SQL command carries ' +
    'no entryId, so its outcome row and its answer have no key',
});

const ADMITTED = Object.freeze({admitted: true});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * @param {*} type - A command's type.
 * @return {boolean} Whether the application recognises it.
 */
function isCommittedCommandType(type) {
  return PARTITION_COMMITTED_COMMAND_TYPES.includes(type);
}

/**
 * @param {*} type - A command's type.
 * @return {boolean} Whether the application executes it as SQL.
 */
function isCommittedSqlCommandType(type) {
  return PARTITION_COMMITTED_SQL_COMMAND_TYPES.includes(type);
}

function refused(code, reason) {
  return Object.freeze({admitted: false, code, reason});
}

function markerRefusal(command, origin) {
  if (!isNonEmptyString(command.sessionId)) {
    return refused(PARTITION_COMMITTED_COMMAND_ERROR_CODE.SESSION_MISSING,
      PARTITION_COMMITTED_COMMAND_ADMISSION_MSG.sessionMissing(command.type));
  }
  if (origin !== PARTITION_COMMITTED_COMMAND_ORIGIN.TRANSACTION_OWNER) {
    return refused(
      PARTITION_COMMITTED_COMMAND_ERROR_CODE.MARKER_NOT_ADMISSIBLE,
      PARTITION_COMMITTED_COMMAND_ADMISSION_MSG.markerNotAdmissible(
        command.type, origin));
  }
  return ADMITTED;
}

function sqlCommandRefusal(command) {
  if (!isNonEmptyString(command.sql)) {
    return refused(PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_MISSING,
      PARTITION_SERVICE_ERROR_MSG.WRITE_STATEMENT_MISSING);
  }
  if (!isNonEmptyString(command.entryId)) {
    return refused(PARTITION_COMMITTED_COMMAND_ERROR_CODE.ENTRY_ID_MISSING,
      PARTITION_COMMITTED_COMMAND_ADMISSION_MSG.ENTRY_ID_MISSING);
  }
  return ADMITTED;
}

/**
 * Decide whether a committed command may be proposed.
 * @param {Object} command - The command about to be proposed.
 * @param {Object} options - {origin}: a PARTITION_COMMITTED_COMMAND_ORIGIN.
 * @return {Object} Frozen {admitted: true}, or {admitted: false, code,
 *   reason} with a PARTITION_COMMITTED_COMMAND_ERROR_CODE.
 */
function admitCommittedCommand(command, {origin}) {
  const type = command?.type;
  if (!isCommittedCommandType(type)) {
    return refused(PARTITION_COMMITTED_COMMAND_ERROR_CODE.COMMAND_TYPE_UNKNOWN,
      PARTITION_COMMITTED_COMMAND_ADMISSION_MSG.commandTypeUnknown(type));
  }
  return PARTITION_COMMITTED_MARKER_COMMAND_TYPES.includes(type) ?
    markerRefusal(command, origin) : sqlCommandRefusal(command);
}

/**
 * The write result of a refused admission: answered at once, nothing
 * proposed.
 * @param {Object} admission - A refused admission.
 * @param {string} partitionId - The partition.
 * @return {Object} {success: false, error, failureCode, partitionId}.
 */
function committedCommandRefusalResult(admission, partitionId) {
  return {
    success: false,
    error: admission.reason,
    failureCode: admission.code,
    partitionId,
  };
}

export {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
  committedCommandRefusalResult,
  isCommittedCommandType,
  isCommittedSqlCommandType,
};
