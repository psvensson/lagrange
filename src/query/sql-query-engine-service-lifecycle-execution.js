/**
 * SQL-engine dispatch for the first-class service lifecycle statement family.
 */

import {
  SERVICE_LIFECYCLE_SQL_CLASSIFICATION,
  SERVICE_LIFECYCLE_EXECUTION_DISPOSITION,
  ServiceLifecycleSqlError,
  classifyServiceLifecycleSql,
  parseServiceLifecycleSql,
} from './service-lifecycle-sql-contract.js';
import {SQLQueryEngineRequestDispatch} from
  './sql-query-engine-request-dispatch.js';

const SERVICE_LIFECYCLE_EXECUTION_ERROR_CODE = Object.freeze({
  COMMAND_OWNER_UNAVAILABLE: 'service_lifecycle_command_owner_unavailable',
  EXECUTION_FAILED: 'service_lifecycle_execution_failed',
  SECURITY_CONTEXT_REQUIRED: 'service_lifecycle_security_context_required',
  TRANSACTION_UNSUPPORTED: 'service_lifecycle_transaction_unsupported',
});

const SERVICE_LIFECYCLE_COMMAND_OWNER_STATE = Object.freeze({
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
});

const SERVICE_LIFECYCLE_EXECUTION_PATH = Object.freeze({
  COMMAND_OWNER: '/commandOwner',
  SECURITY_CONTEXT: '/securityContext',
  STATEMENT: '/statement',
});

const SERVICE_LIFECYCLE_EXECUTION_STAGE = Object.freeze({
  OWNER_SUBMISSION: 'owner_submission',
  SECURITY_CONTEXT: 'security_context',
  SQL_NORMALIZATION: 'sql_normalization',
  TRANSACTION_BOUNDARY: 'transaction_boundary',
});

const SERVICE_LIFECYCLE_EXECUTION_MESSAGE = Object.freeze({
  COMMAND_EXECUTION_FAILED: 'service lifecycle command execution failed',
  COMMAND_OWNER_UNAVAILABLE: 'service lifecycle command owner is unavailable',
  SECURITY_CONTEXT_REQUIRED:
    'service lifecycle SQL requires authenticated server context',
  SQL_NORMALIZATION_FAILED: 'service lifecycle SQL normalization failed',
  TRANSACTION_UNSUPPORTED:
    'service lifecycle SQL cannot execute inside a SQL transaction',
});

function handled(result) {
  return Object.freeze({
    disposition: SERVICE_LIFECYCLE_EXECUTION_DISPOSITION.HANDLED,
    result,
  });
}

function failure(errorCode, error, detail) {
  return handled(Object.freeze({
    success: false,
    error,
    errorCode,
    detail: Object.freeze(detail),
  }));
}

function hasCanonicalSecurityContext(securityContext) {
  return typeof securityContext?.tenantId === 'string' &&
    securityContext.tenantId.length > 0 &&
    typeof securityContext?.principal === 'string' &&
    securityContext.principal.length > 0 &&
    Array.isArray(securityContext?.roles) &&
    securityContext.roles.every((role) => typeof role === 'string');
}

class SQLQueryEngineServiceLifecycleExecution extends
  SQLQueryEngineRequestDispatch {
  constructor(options = {}) {
    super(options);
    this.serviceLifecycleCommandOwnerBinding = Object.freeze({
      state: SERVICE_LIFECYCLE_COMMAND_OWNER_STATE.UNAVAILABLE,
    });
  }

  setServiceLifecycleCommandOwner(owner) {
    this.serviceLifecycleCommandOwnerBinding = Object.freeze({
      state: SERVICE_LIFECYCLE_COMMAND_OWNER_STATE.READY,
      owner,
    });
  }

  async tryExecuteServiceLifecycleSql(statement, parameters, options = {}) {
    const classification = classifyServiceLifecycleSql(statement);
    if (classification.kind !== SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE) {
      return Object.freeze({
        disposition: SERVICE_LIFECYCLE_EXECUTION_DISPOSITION.ORDINARY_SQL,
      });
    }
    if (!hasCanonicalSecurityContext(options.securityContext)) {
      return failure(
        SERVICE_LIFECYCLE_EXECUTION_ERROR_CODE.SECURITY_CONTEXT_REQUIRED,
        SERVICE_LIFECYCLE_EXECUTION_MESSAGE.SECURITY_CONTEXT_REQUIRED,
        {
          path: SERVICE_LIFECYCLE_EXECUTION_PATH.SECURITY_CONTEXT,
          stage: SERVICE_LIFECYCLE_EXECUTION_STAGE.SECURITY_CONTEXT,
        },
      );
    }
    if (this.hasActiveTransaction(options.sessionId)) {
      return failure(
        SERVICE_LIFECYCLE_EXECUTION_ERROR_CODE.TRANSACTION_UNSUPPORTED,
        SERVICE_LIFECYCLE_EXECUTION_MESSAGE.TRANSACTION_UNSUPPORTED,
        {
          path: SERVICE_LIFECYCLE_EXECUTION_PATH.STATEMENT,
          stage: SERVICE_LIFECYCLE_EXECUTION_STAGE.TRANSACTION_BOUNDARY,
        },
      );
    }
    const commandOwnerBinding = this.serviceLifecycleCommandOwnerBinding;
    if (commandOwnerBinding.state !==
        SERVICE_LIFECYCLE_COMMAND_OWNER_STATE.READY ||
        typeof commandOwnerBinding.owner?.execute !== 'function') {
      return failure(
        SERVICE_LIFECYCLE_EXECUTION_ERROR_CODE.COMMAND_OWNER_UNAVAILABLE,
        SERVICE_LIFECYCLE_EXECUTION_MESSAGE.COMMAND_OWNER_UNAVAILABLE,
        {
          path: SERVICE_LIFECYCLE_EXECUTION_PATH.COMMAND_OWNER,
          stage: SERVICE_LIFECYCLE_EXECUTION_STAGE.OWNER_SUBMISSION,
        },
      );
    }
    let parsed;
    try {
      parsed = parseServiceLifecycleSql(statement, parameters);
    } catch (error) {
      if (error instanceof ServiceLifecycleSqlError) {
        return failure(error.code, error.message, {
          path: error.path,
          stage: SERVICE_LIFECYCLE_EXECUTION_STAGE.SQL_NORMALIZATION,
        });
      }
      return failure(
        SERVICE_LIFECYCLE_EXECUTION_ERROR_CODE.EXECUTION_FAILED,
        SERVICE_LIFECYCLE_EXECUTION_MESSAGE.SQL_NORMALIZATION_FAILED,
        {
          path: SERVICE_LIFECYCLE_EXECUTION_PATH.STATEMENT,
          stage: SERVICE_LIFECYCLE_EXECUTION_STAGE.SQL_NORMALIZATION,
        },
      );
    }
    try {
      return handled(await commandOwnerBinding.owner.execute(
        parsed.command,
        parsed.payload,
        options.securityContext,
      ));
    } catch (_error) {
      return failure(
        SERVICE_LIFECYCLE_EXECUTION_ERROR_CODE.EXECUTION_FAILED,
        SERVICE_LIFECYCLE_EXECUTION_MESSAGE.COMMAND_EXECUTION_FAILED,
        {
          path: SERVICE_LIFECYCLE_EXECUTION_PATH.COMMAND_OWNER,
          stage: SERVICE_LIFECYCLE_EXECUTION_STAGE.OWNER_SUBMISSION,
        },
      );
    }
  }
}

export {
  SQLQueryEngineServiceLifecycleExecution,
};
