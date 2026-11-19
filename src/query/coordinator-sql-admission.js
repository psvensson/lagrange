/**
 * Coordinator SQL admission (design coordinator-sqlite-merge §2.2, §2.5, §5.1):
 *
 * - Every SQL statement executed on a coordinator merge session or live-query
 *   session must pass the partition statement-admission owner as a read query
 *   (`SELECT` / `WITH ... SELECT`), refusing `pragma_*`, `ATTACH`, mutations,
 *   and unclassified functions.
 * - Connection-scoped SQLite functions (`changes`, `last_insert_rowid`,
 *   `total_changes`) are refused on coordinator read paths because neither a
 *   partition connection nor a merge connection holds client session state.
 *
 * @module query/coordinator-sql-admission
 */

import {
  admitPartitionStatement,
  classifyPartitionStatementHead,
} from '../partition/partition-statement-admission.js';
import {
  PARTITION_STATEMENT_KIND,
  PARTITION_STATEMENT_PATH,
} from '../partition/partition-statement-admission-constants.js';
import {
  lexPartitionStatement,
} from '../partition/partition-statement-admission-lexer.js';
import {
  namesRefusedFunction,
  resolveNamePositions,
} from '../partition/partition-statement-admission-names.js';
import {PG_EXPR_TYPE} from './pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from './query-constants.js';

const TYPEOF_OBJECT = 'object';
const OPEN_PAREN_TOKEN = '(';

const COORDINATOR_ADMISSION_DECISION = Object.freeze({
  ADMITTED: 'admitted',
  REFUSED: 'refused',
});

const CONNECTION_SCOPED_FUNCTIONS = new Set([
  'changes',
  'last_insert_rowid',
  'total_changes',
]);

const FUNCTION_NODE_TYPES = new Set([
  PG_EXPR_TYPE.FUNCTION_CALL,
  'function',
  'function_call',
  'FUNCTION_CALL',
]);

const REFUSAL_MESSAGE = Object.freeze({
  CONNECTION_FUNCTION_PREFIX:
    'A connection-state function is not supported on a coordinator read path: ',
  STATEMENT_NOT_ADMITTED_PREFIX:
    'Coordinator merge statement refused by statement admission: ',
});

const DEFAULT_ADMISSION_REFUSAL_REASON = 'statement not admitted';
const REFUSED_FUNCTION_REASON = 'statement_function';

function unsupportedFeatureError(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  error.errorCode = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  return error;
}

function firstConnectionFunctionName(node) {
  if (!node || typeof node !== TYPEOF_OBJECT) {
    return '';
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = firstConnectionFunctionName(entry);
      if (found !== '') return found;
    }
    return '';
  }
  if (
    FUNCTION_NODE_TYPES.has(node.type) &&
    CONNECTION_SCOPED_FUNCTIONS.has(String(node.name || node.func || '').toLowerCase())
  ) {
    return String(node.name || node.func);
  }
  for (const value of Object.values(node)) {
    const found = firstConnectionFunctionName(value);
    if (found !== '') return found;
  }
  return '';
}

function firstLexedConnectionFunctionName(sql) {
  const {tokens} = lexPartitionStatement(sql);
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token.identifier !== null &&
      CONNECTION_SCOPED_FUNCTIONS.has(token.identifier) &&
      next?.text === OPEN_PAREN_TOKEN
    ) {
      return token.text;
    }
  }
  return '';
}

function resolveVerdictRefusalDetail(verdict) {
  if (typeof verdict?.reason === 'string' && verdict.reason.length > 0) {
    return verdict.reason;
  }
  if (typeof verdict?.refusalLayer === 'string' && verdict.refusalLayer.length > 0) {
    return verdict.refusalLayer;
  }
  return DEFAULT_ADMISSION_REFUSAL_REASON;
}

function assertReadVerdictAdmitted(verdict) {
  if (verdict.admitted !== true || verdict.kind !== PARTITION_STATEMENT_KIND.READ) {
    throw unsupportedFeatureError(
      REFUSAL_MESSAGE.STATEMENT_NOT_ADMITTED_PREFIX + resolveVerdictRefusalDetail(verdict),
    );
  }
}

/**
 * Verify that a SQL statement string is admitted as a coordinator read query
 * by the partition statement-admission owner and calls no connection-scoped
 * function (`changes`, `last_insert_rowid`, `total_changes`).
 * @param {string} sql - SQL statement text.
 * @param {Object|null} [db] - Optional SQLite connection for full admission.
 * @throws {Error} UNSUPPORTED_SQL_FEATURE when refused.
 */
function assertCoordinatorStatementAdmitted(sql, db = null) {
  const connectionFn = firstLexedConnectionFunctionName(sql);
  if (connectionFn !== '') {
    throw unsupportedFeatureError(
      REFUSAL_MESSAGE.CONNECTION_FUNCTION_PREFIX + connectionFn,
    );
  }
  if (db !== null && typeof db === TYPEOF_OBJECT) {
    const verdict = admitPartitionStatement(
      {db},
      sql,
      [],
      PARTITION_STATEMENT_PATH.READ_ONLY,
    );
    assertReadVerdictAdmitted(verdict);
    return;
  }
  assertReadVerdictAdmitted(classifyPartitionStatementHead(sql));
  const lexed = resolveNamePositions(lexPartitionStatement(sql));
  if (namesRefusedFunction(lexed)) {
    throw unsupportedFeatureError(
      REFUSAL_MESSAGE.STATEMENT_NOT_ADMITTED_PREFIX + REFUSED_FUNCTION_REASON,
    );
  }
}

/**
 * Decide whether a coordinator SELECT AST is admissible (refusing
 * connection-state functions).
 * @param {Object} ast - SELECT AST.
 * @return {{decision: string, response?: Object}}
 */
function evaluateCoordinatorSelectAdmission(ast) {
  const connectionFn = firstConnectionFunctionName(ast);
  if (connectionFn === '') {
    return {decision: COORDINATOR_ADMISSION_DECISION.ADMITTED};
  }
  return {
    decision: COORDINATOR_ADMISSION_DECISION.REFUSED,
    response: {
      success: false,
      error: REFUSAL_MESSAGE.CONNECTION_FUNCTION_PREFIX + connectionFn,
      errorCode: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
    },
  };
}

/**
 * Verify that a live-query predicate AST calls no connection-scoped function.
 * @param {Object|null} whereClause - Parsed WHERE AST.
 */
function assertLiveQueryPredicateAdmissible(whereClause) {
  const connectionFn = firstConnectionFunctionName(whereClause);
  if (connectionFn !== '') {
    throw unsupportedFeatureError(
      REFUSAL_MESSAGE.CONNECTION_FUNCTION_PREFIX + connectionFn,
    );
  }
}

/**
 * Verify that a live-query SELECT AST calls no connection-scoped function.
 * @param {Object|null} parsedQuery - Parsed SELECT AST.
 */
function assertLiveQueryGroupAdmissible(parsedQuery) {
  if (!parsedQuery) return;
  const connectionFn = firstConnectionFunctionName(parsedQuery);
  if (connectionFn !== '') {
    throw unsupportedFeatureError(
      REFUSAL_MESSAGE.CONNECTION_FUNCTION_PREFIX + connectionFn,
    );
  }
}

export {
  COORDINATOR_ADMISSION_DECISION,
  assertCoordinatorStatementAdmitted,
  assertLiveQueryGroupAdmissible,
  assertLiveQueryPredicateAdmissible,
  evaluateCoordinatorSelectAdmission,
};
