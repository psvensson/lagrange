import {AST_TYPE} from './parser-constants.js';
import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
} from './application-database-constants.js';

const APPLICATION_DATABASE_SESSION = Symbol('applicationDatabaseSession');
const APPLICATION_DATABASE_TRANSACTION_CONTROL =
  Symbol('applicationDatabaseTransactionControl');
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const APPLICATION_STATEMENT_POLICY_ALLOW = objectFreeze({allowed: true});

function isTransactionControlType(type) {
  return type === AST_TYPE.BEGIN_TRANSACTION ||
    type === AST_TYPE.COMMIT ||
    type === AST_TYPE.ROLLBACK;
}

function createApplicationDatabaseExecutionOptions(
  sessionId,
  transactionControl = false,
) {
  const options = objectCreate(null);
  options.sessionId = sessionId;
  options[APPLICATION_DATABASE_SESSION] = true;
  if (transactionControl) {
    options[APPLICATION_DATABASE_TRANSACTION_CONTROL] = true;
  }
  return objectFreeze(options);
}

function enforceApplicationDatabaseStatementPolicy(ast, options) {
  if (options?.[APPLICATION_DATABASE_SESSION] !== true) {
    return APPLICATION_STATEMENT_POLICY_ALLOW;
  }
  if (!isTransactionControlType(ast?.type)) {
    return APPLICATION_STATEMENT_POLICY_ALLOW;
  }
  if (options[APPLICATION_DATABASE_TRANSACTION_CONTROL] === true) {
    return APPLICATION_STATEMENT_POLICY_ALLOW;
  }
  return objectFreeze({
    allowed: false,
    failure: objectFreeze({
      success: false,
      error: APPLICATION_DATABASE_ERROR_MSG.TRANSACTION_CONTROL_RESERVED,
      errorCode:
        APPLICATION_DATABASE_ERROR_CODE.TRANSACTION_CONTROL_RESERVED,
    }),
  });
}

export {
  createApplicationDatabaseExecutionOptions,
  enforceApplicationDatabaseStatementPolicy,
};
