/**
 * Client SQL ingress and the system-table write admission.
 *
 * A statement is CLIENT when it entered through a client contract: the
 * canonical SqlRequest dispatch (admin WebSocket, PG wire, the runtime
 * request executors) marks its own options, an embedded application session
 * carries the facade's private marker, and runtime-service SQL names its
 * issuing service. Any other statement is an in-process owner statement
 * (the control-plane gateway's route). No caller opts in or out: the
 * engine's client entries set the marker themselves.
 *
 * A CLIENT INSERT/UPDATE/DELETE whose target is a system table - or whose
 * target cannot be resolved - is refused SYSTEM_TABLE_WRITE_REFUSED before
 * anything executes. The origin travels with the statement to the
 * partitions it is routed to (QUERY_MESSAGE_FIELD_STATEMENT_INGRESS), where
 * the partition refuses the same write a second time.
 */

import {AST_TYPE} from './parser-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';
import {
  enforceApplicationDatabaseStatementPolicy,
  isApplicationDatabaseSession,
} from './application-database-statement-policy.js';
import {isSystemTableName} from
  '../bootstrap/system-table-schema-shared-constants.js';

const objectFreeze = Object.freeze;
const LOCAL_STR_STRING = 'string';

const STATEMENT_INGRESS = objectFreeze({
  CLIENT: 'client',
  IN_PROCESS_OWNER: 'in_process_owner',
});

const SYSTEM_TABLE_WRITE_ADMISSION = objectFreeze({
  ADMITTED: 'admitted',
  REFUSED: 'refused',
});

const SYSTEM_TABLE_WRITE_REFUSAL_REASON = objectFreeze({
  CLIENT_INGRESS: 'client_ingress',
  UNRESOLVED_TARGET: 'unresolved_target',
});

const CLIENT_STATEMENT_INGRESS = Symbol('clientStatementIngress');

// The routed-statement field that carries a statement's origin to the
// partitions it reaches (execution options and the partition QUERY request).
const STATEMENT_INGRESS_FIELD = 'statementIngress';

const WRITE_STATEMENT_TYPES = new Set([
  AST_TYPE.INSERT,
  AST_TYPE.UPDATE,
  AST_TYPE.DELETE,
]);

const ADMITTED = objectFreeze({state: SYSTEM_TABLE_WRITE_ADMISSION.ADMITTED});

/**
 * The ingress of one statement from its execution options.
 * @param {Object} options - SqlCore execution options.
 * @return {string} STATEMENT_INGRESS value.
 */
function resolveStatementIngress(options) {
  if (options?.[CLIENT_STATEMENT_INGRESS] === true ||
      options?.[STATEMENT_INGRESS_FIELD] === STATEMENT_INGRESS.CLIENT ||
      isApplicationDatabaseSession(options) ||
      (typeof options?.issuingServiceId === LOCAL_STR_STRING &&
        options.issuingServiceId.length > 0)) {
    return STATEMENT_INGRESS.CLIENT;
  }
  return STATEMENT_INGRESS.IN_PROCESS_OWNER;
}

/**
 * The typed refusal of a client system-table write.
 * @param {string|null} tableName
 * @param {string} reasonCode
 * @return {Object}
 */
function buildSystemTableWriteRefusal(tableName, reasonCode) {
  return objectFreeze({
    success: false,
    error: QUERY_ERROR_MSG.SYSTEM_TABLE_WRITE_REFUSED,
    errorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    reasonCode,
    tableName,
  });
}

/**
 * Admit or refuse one parsed statement by its ingress and write target.
 * @param {Object} ast - Parsed statement.
 * @param {Object} options - SqlCore execution options.
 * @return {{state: string, failure?: Object}}
 */
function admitClientSystemTableWrite(ast, options) {
  if (!WRITE_STATEMENT_TYPES.has(ast?.type) ||
      resolveStatementIngress(options) !== STATEMENT_INGRESS.CLIENT) {
    return ADMITTED;
  }
  const target = ast.table;
  if (typeof target !== LOCAL_STR_STRING || target.length === 0) {
    return objectFreeze({
      state: SYSTEM_TABLE_WRITE_ADMISSION.REFUSED,
      failure: buildSystemTableWriteRefusal(null,
        SYSTEM_TABLE_WRITE_REFUSAL_REASON.UNRESOLVED_TARGET),
    });
  }
  if (!isSystemTableName(target)) {
    return ADMITTED;
  }
  return objectFreeze({
    state: SYSTEM_TABLE_WRITE_ADMISSION.REFUSED,
    failure: buildSystemTableWriteRefusal(target,
      SYSTEM_TABLE_WRITE_REFUSAL_REASON.CLIENT_INGRESS),
  });
}

/**
 * The one engine-entry refusal of an inadmissible client statement: the
 * embedded application's statement policy, then the system-table write
 * admission. Null when the statement may run.
 * @param {Object} ast - Parsed statement.
 * @param {Object} options - SqlCore execution options.
 * @return {Object|null} The typed refusal, or null.
 */
function resolveClientStatementRefusal(ast, options) {
  const applicationDecision =
    enforceApplicationDatabaseStatementPolicy(ast, options);
  if (applicationDecision.allowed !== true) {
    return applicationDecision.failure;
  }
  const admission = admitClientSystemTableWrite(ast, options);
  return admission.state === SYSTEM_TABLE_WRITE_ADMISSION.REFUSED ?
    admission.failure : null;
}

/**
 * The partition's own refusal of a routed client write to a system table:
 * a statement forwarded with client origin is refused where it lands too.
 * @param {Object} payload - Partition QUERY request.
 * @param {string} partitionTableName - The partition's table.
 * @return {Object|null} The refusal, or null when the write may proceed.
 */
function refuseRoutedClientSystemTableWrite(payload, partitionTableName) {
  if (payload?.[STATEMENT_INGRESS_FIELD] !== STATEMENT_INGRESS.CLIENT ||
      !isSystemTableName(partitionTableName)) {
    return null;
  }
  return buildSystemTableWriteRefusal(partitionTableName,
    SYSTEM_TABLE_WRITE_REFUSAL_REASON.CLIENT_INGRESS);
}

export {
  CLIENT_STATEMENT_INGRESS,
  STATEMENT_INGRESS_FIELD,
  STATEMENT_INGRESS,
  SYSTEM_TABLE_WRITE_ADMISSION,
  admitClientSystemTableWrite,
  refuseRoutedClientSystemTableWrite,
  resolveClientStatementRefusal,
  resolveStatementIngress,
};
