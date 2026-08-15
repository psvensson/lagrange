import {BaseError} from '../utils/base-error.js';
import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
} from './application-database-constants.js';

const LOCAL_STR_APPLICATIONDATABASE = 'ApplicationDatabase';
const LOCAL_STR_QUERY = 'query';
const objectCreate = Object.create;
const objectFreeze = Object.freeze;

class ApplicationDatabaseError extends BaseError {
  constructor(message, options = {}) {
    const operation = options.operation || LOCAL_STR_QUERY;
    super(message, {
      cause: options.cause,
      context: objectFreeze({
        component: LOCAL_STR_APPLICATIONDATABASE,
        operation,
      }),
    });
    this.code = options.code || APPLICATION_DATABASE_ERROR_CODE.QUERY_FAILED;
    this.deferred = options.deferred === true;
    this.operation = operation;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.rollbackError = options.rollbackError || null;
    objectFreeze(this);
  }
}

function createApplicationDatabaseError(code, message, options = {}) {
  const errorOptions = objectCreate(null);
  errorOptions.code = code;
  errorOptions.cause = options.cause;
  errorOptions.deferred = options.deferred;
  errorOptions.operation = options.operation;
  errorOptions.retryAfterMs = options.retryAfterMs;
  errorOptions.rollbackError = options.rollbackError;
  return new ApplicationDatabaseError(
    message || APPLICATION_DATABASE_ERROR_MSG.QUERY_FAILED,
    errorOptions,
  );
}

export {
  ApplicationDatabaseError,
  createApplicationDatabaseError,
};
