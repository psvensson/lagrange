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
  AST_TYPE.ALTER_TABLE,
  AST_TYPE.DROP_TABLE,
]);

const FORMATION_ADMITTED_READ_STATEMENT_TYPES = new Set([
  AST_TYPE.SELECT,
  AST_TYPE.BEGIN_TRANSACTION,
  AST_TYPE.COMMIT,
  AST_TYPE.ROLLBACK,
]);

const FORMATION_SYSTEM_TABLE_DML_TYPES = new Set([
  AST_TYPE.INSERT,
  AST_TYPE.UPDATE,
  AST_TYPE.DELETE,
]);

const FORMATION_STATE_FORMED = 'FORMED';
const FORMATION_STATE_UNAVAILABLE = 'UNAVAILABLE';
const FORMATION_WAIT_SUFFIX = '; writes and DDL wait for formation';
const FORMATION_PENDING_HINT =
  'start the missing hosts; if fewer hosts exist than declared, re-found ' +
  'the cluster with the correct declared host count. Re-founding discards ' +
  'state written during formation: artifact payloads, service definitions, ' +
  'dynamic config, functions';

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
  const target = ast.table ?? ast.tableName;
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
 * Resolve the formation answer passed directly or through execution options.
 * @param {Object} options - SqlCore execution options.
 * @param {Object|null|undefined} formation - Formation answer.
 * @return {Object|null}
 */
function resolveFormationAnswer(options, formation) {
  const candidate = formation ?? options?.formation ?? null;
  return candidate &&
    typeof candidate === 'object' &&
    typeof candidate.state === LOCAL_STR_STRING ?
    candidate :
    null;
}

function buildFormationPendingMessage(formation) {
  if (
    Number.isSafeInteger(formation?.declaredHostCount) &&
    Number.isSafeInteger(formation?.readyHostCount)
  ) {
    return (
      `cluster formation pending: ${formation.readyHostCount} of ` +
      `${formation.declaredHostCount} declared hosts ready` +
      FORMATION_WAIT_SUFFIX
    );
  }
  const stateLabel = formation?.state || FORMATION_STATE_UNAVAILABLE;
  const reasonPart =
    typeof formation?.reason === LOCAL_STR_STRING &&
    formation.reason.length > 0 ?
      ` (${formation.reason})` :
      '';
  return (
    `${QUERY_ERROR_MSG.FORMATION_PENDING}: ${stateLabel}${reasonPart}` +
    FORMATION_WAIT_SUFFIX
  );
}

function buildFormationPendingRefusal(formation) {
  return objectFreeze({
    success: false,
    error: buildFormationPendingMessage(formation),
    errorCode: QUERY_ERROR_CODE.FORMATION_PENDING,
    reasonCode: formation?.reason || formation?.state || null,
    retryable: true,
    formation,
    detail: formation,
    hint: FORMATION_PENDING_HINT,
  });
}

/**
 * Admit or refuse one parsed statement under the cluster formation latch.
 * Evaluates independent of STATEMENT_INGRESS: reads and system-table DML are
 * admitted while not FORMED; user-table writes, all DDL and unresolvable
 * targets are refused with FORMATION_PENDING.
 * @param {Object} ast - Parsed statement.
 * @param {Object} options - SqlCore execution options.
 * @param {Object|null|undefined} [formation] - Formation answer.
 * @return {{state: string, failure?: Object}}
 */
function checkFormationStatementAdmission(ast, options, formation = undefined) {
  const formationAnswer = resolveFormationAnswer(options, formation);
  if (
    formationAnswer === null ||
    formationAnswer.state === FORMATION_STATE_FORMED
  ) {
    return ADMITTED;
  }
  if (FORMATION_ADMITTED_READ_STATEMENT_TYPES.has(ast?.type)) {
    return ADMITTED;
  }
  if (FORMATION_SYSTEM_TABLE_DML_TYPES.has(ast?.type)) {
    const target = ast.table ?? ast.tableName;
    if (
      typeof target === LOCAL_STR_STRING &&
      target.length > 0 &&
      isSystemTableName(target)
    ) {
      return ADMITTED;
    }
  }
  return objectFreeze({
    state: SYSTEM_TABLE_WRITE_ADMISSION.REFUSED,
    failure: buildFormationPendingRefusal(formationAnswer),
  });
}

/**
 * The one engine-entry refusal of an inadmissible client statement: the
 * embedded application's statement policy, the system-table write admission,
 * then the cluster formation latch gate. Null when the statement may run.
 * @param {Object} ast - Parsed statement.
 * @param {Object} options - SqlCore execution options.
 * @param {Object|null|undefined} [formation] - Formation answer.
 * @return {Object|null} The typed refusal, or null.
 */
function resolveClientStatementRefusal(ast, options, formation = undefined) {
  const applicationDecision =
    enforceApplicationDatabaseStatementPolicy(ast, options);
  if (applicationDecision.allowed !== true) {
    return applicationDecision.failure;
  }
  const admission = admitClientSystemTableWrite(ast, options);
  if (admission.state === SYSTEM_TABLE_WRITE_ADMISSION.REFUSED) {
    return admission.failure;
  }
  const formationAdmission = checkFormationStatementAdmission(
    ast,
    options,
    formation,
  );
  return formationAdmission.state === SYSTEM_TABLE_WRITE_ADMISSION.REFUSED ?
    formationAdmission.failure :
    null;
}

/**
 * The partition's own refusal of a routed client write to a system table:
 * a statement forwarded with client origin is refused where it lands too.
 * @param {Object} payload - Partition QUERY request.
 * @param {string} partitionTableName - The partition's table.
 * @return {Object|null} The refusal, or null when the write may proceed.
 */
function refuseRoutedClientSystemTableWrite(payload, partitionTableName) {
  if (resolveStatementIngress(payload) !== STATEMENT_INGRESS.CLIENT ||
      !isSystemTableName(partitionTableName)) {
    return null;
  }
  return buildSystemTableWriteRefusal(partitionTableName,
    SYSTEM_TABLE_WRITE_REFUSAL_REASON.CLIENT_INGRESS);
}

/**
 * Refuse schema mutation (MIGRATION_ALTER_TABLE / DDL) against any system
 * table at the partition boundary.
 * @param {string} partitionTableName - The partition's table.
 * @return {Object|null} The refusal, or null when the table is not a system
 *   table.
 */
function refuseSystemTableSchemaMutation(partitionTableName) {
  if (!isSystemTableName(partitionTableName)) {
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
  refuseSystemTableSchemaMutation,
  resolveClientStatementRefusal,
  resolveStatementIngress,
};
