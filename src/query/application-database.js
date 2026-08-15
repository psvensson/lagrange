import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {types as utilTypes} from 'node:util';
import {promiseHooks} from 'node:v8';
import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
  APPLICATION_DATABASE_TRANSACTION_STATE,
} from './application-database-constants.js';
import {
  ApplicationDatabaseError,
  createApplicationDatabaseError,
} from './application-database-error.js';
import {
  snapshotApplicationDatabaseOpenOptions,
  snapshotParams,
  snapshotSql,
} from './application-database-input.js';
import {createApplicationRuntimeGeneration} from
  './application-runtime-generation.js';
import {createApplicationDatabaseExecutionOptions} from
  './application-database-statement-policy.js';

const LOCAL_STR_BEGIN = 'BEGIN';
const LOCAL_STR_COMMIT = 'COMMIT';
const LOCAL_STR_ROLLBACK = 'ROLLBACK';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_BEGIN_OPERATION = 'begin';
const LOCAL_STR_COMMIT_OPERATION = 'commit';
const LOCAL_STR_QUERY_OPERATION = 'query';
const LOCAL_STR_ROLLBACK_OPERATION = 'rollback';
const LOCAL_STR_VALUE = 'value';
const NO_RETRY_AFTER_MS = null;
const FAILURE_METADATA_PROPERTY = Object.freeze({
  CODE: 'code',
  DEFERRED: 'deferred',
  DEFER_RETRY: 'deferRetry',
  ERROR: 'error',
  ERROR_CODE: 'errorCode',
  MESSAGE: 'message',
  OPERATION: 'operation',
  PENDING: 'pending',
  RETRY_AFTER_MS: 'retryAfterMs',
  SUCCESS: 'success',
});
const PromiseConstructor = Promise;
const ArrayConstructor = Array;
const WeakSetConstructor = WeakSet;
const createPromiseHook = promiseHooks.createHook;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectIs = Object.is;
const promiseReject = Promise.reject;
const promiseResolve = Promise.resolve;
const promiseThen = Promise.prototype.then;
const queueMicrotaskFunction = queueMicrotask;
const reflectApply = Reflect.apply;
const weakSetAdd = WeakSet.prototype.add;
const weakSetHas = WeakSet.prototype.has;
const {isPromise, isProxy} = utilTypes;
const CALLBACK_SETTLEMENT_STATE = objectFreeze({
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SETTLED: 'settled',
  UNKNOWN: 'unknown',
});

function readOwnData(source, property) {
  if (
    source === null ||
    (typeof source !== 'object' && typeof source !== 'function') ||
    isProxy(source)
  ) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(source, property);
  return descriptor && objectHasOwn(descriptor, LOCAL_STR_VALUE) ?
    descriptor.value :
    undefined;
}

function resolveFailureString(value, fallback) {
  return typeof value === LOCAL_STR_STRING && value.length > 0 ?
    value :
    fallback;
}

function resolveRetryAfterMs(source) {
  const retryAfterMs = readOwnData(
    source,
    FAILURE_METADATA_PROPERTY.RETRY_AFTER_MS,
  );
  if (
    !numberIsFinite(retryAfterMs) ||
    !numberIsSafeInteger(retryAfterMs) ||
    retryAfterMs < 0
  ) {
    return NO_RETRY_AFTER_MS;
  }
  return objectIs(retryAfterMs, -0) ? 0 : retryAfterMs;
}

function translateQueryFailure(source, operation, cause = null) {
  if (!isProxy(source) && source instanceof ApplicationDatabaseError) {
    return source;
  }
  const sourceCode = readOwnData(source, FAILURE_METADATA_PROPERTY.ERROR_CODE) ??
    readOwnData(source, FAILURE_METADATA_PROPERTY.CODE);
  const sourceMessage = readOwnData(source, FAILURE_METADATA_PROPERTY.ERROR) ??
    readOwnData(source, FAILURE_METADATA_PROPERTY.MESSAGE);
  return createApplicationDatabaseError(
    resolveFailureString(
      sourceCode,
      APPLICATION_DATABASE_ERROR_CODE.QUERY_FAILED,
    ),
    resolveFailureString(
      sourceMessage,
      APPLICATION_DATABASE_ERROR_MSG.QUERY_FAILED,
    ), {
      cause,
      deferred: readOwnData(source, FAILURE_METADATA_PROPERTY.DEFER_RETRY) ===
          true ||
        readOwnData(source, FAILURE_METADATA_PROPERTY.DEFERRED) === true,
      operation,
      retryAfterMs: resolveRetryAfterMs(source),
    });
}

async function executeCanonical(sqlCore, sql, params, options, operation) {
  let result;
  try {
    result = await sqlCore.executeQuery(sql, params, options);
  } catch (cause) {
    throw translateQueryFailure(cause, operation, cause);
  }
  if (readOwnData(result, FAILURE_METADATA_PROPERTY.SUCCESS) !== true) {
    throw translateQueryFailure(result, operation);
  }
  return result;
}

function createSessionId(applicationId) {
  return `application:${applicationId}:${randomUUID()}`;
}

function normalizeCallbackFailure(error) {
  if (!isProxy(error) && error instanceof Error) return error;
  return createApplicationDatabaseError(
    APPLICATION_DATABASE_ERROR_CODE.QUERY_FAILED,
    APPLICATION_DATABASE_ERROR_MSG.QUERY_FAILED,
    {cause: error},
  );
}

function validateTransactionCallback(callback, inheritedRecord) {
  if (typeof callback !== 'function') {
    throw createApplicationDatabaseError(
      APPLICATION_DATABASE_ERROR_CODE.INVALID_ARGUMENT,
      APPLICATION_DATABASE_ERROR_MSG.CALLBACK_REQUIRED,
    );
  }
  if (
    inheritedRecord &&
    inheritedRecord.state !== APPLICATION_DATABASE_TRANSACTION_STATE.CLOSED
  ) {
    throw createApplicationDatabaseError(
      APPLICATION_DATABASE_ERROR_CODE.TRANSACTION_NESTED,
      APPLICATION_DATABASE_ERROR_MSG.TRANSACTION_NESTED,
    );
  }
}

async function rollbackAndThrow(sqlCore, record, controlOptions, error) {
  const primaryError = translateQueryFailure(
    error,
    readOwnData(error, FAILURE_METADATA_PROPERTY.OPERATION) ||
      LOCAL_STR_QUERY_OPERATION,
    error,
  );
  record.state = APPLICATION_DATABASE_TRANSACTION_STATE.ROLLING_BACK;
  try {
    await executeCanonical(
      sqlCore,
      LOCAL_STR_ROLLBACK,
      [],
      controlOptions,
      LOCAL_STR_ROLLBACK_OPERATION,
    );
  } catch (rollbackError) {
    throw createApplicationDatabaseError(
      primaryError.code,
      primaryError.message,
      {
        cause: primaryError,
        deferred: primaryError.deferred,
        operation: primaryError.operation,
        retryAfterMs: primaryError.retryAfterMs,
        rollbackError,
      },
    );
  }
  throw primaryError;
}

function classifyCallbackResult(value) {
  if (isPromise(value)) {
    return {pending: reflectApply(promiseResolve, PromiseConstructor, [value])};
  }
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return {value};
  }
  const then = value.then;
  if (typeof then !== 'function') return {value};
  return {
    pending: new PromiseConstructor((resolve, reject) => {
      queueMicrotaskFunction(() => {
        try {
          reflectApply(then, value, [resolve, reject]);
        } catch (error) {
          reject(error);
        }
      });
    }),
  };
}

function closeCallbackAdmission(record) {
  if (record.state === APPLICATION_DATABASE_TRANSACTION_STATE.OPEN) {
    record.state = APPLICATION_DATABASE_TRANSACTION_STATE.DRAINING;
  }
  record.callbackSettlementState = CALLBACK_SETTLEMENT_STATE.SETTLED;
  const closedError = createApplicationDatabaseError(
    APPLICATION_DATABASE_ERROR_CODE.TRANSACTION_CLOSED,
    APPLICATION_DATABASE_ERROR_MSG.TRANSACTION_CLOSED,
  );
  const admissions = takeDeferredAdmissions(record);
  for (let index = 0; index < admissions.length; index++) {
    admissions[index].reject(closedError);
  }
}

function defineArrayValue(target, index, value) {
  reflectApply(objectDefineProperty, Object, [target, index, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function takeDeferredAdmissions(record) {
  const source = record.deferredAdmissions;
  const admissions = new ArrayConstructor(source.length);
  for (let index = 0; index < source.length; index++) {
    defineArrayValue(admissions, index, source[index]);
  }
  source.length = 0;
  return admissions;
}

function admitDeferredQueries(record) {
  if (record.callbackSettlementState !== CALLBACK_SETTLEMENT_STATE.UNKNOWN) {
    return;
  }
  record.callbackSettlementState = CALLBACK_SETTLEMENT_STATE.PENDING;
  const admissions = takeDeferredAdmissions(record);
  for (let index = 0; index < admissions.length; index++) {
    admissions[index].admit();
  }
}

function createCallbackSettlementOwner(record) {
  const settledPromises = new WeakSetConstructor();
  let targetPromise = null;
  let disabled = false;
  let disableHook = null;

  function disable() {
    if (disabled) return;
    disabled = true;
    reflectApply(disableHook, undefined, []);
  }

  function close() {
    closeCallbackAdmission(record);
    disable();
  }

  function closeObservedSettlement() {
    admitDeferredQueries(record);
    close();
  }

  disableHook = reflectApply(createPromiseHook, promiseHooks, [{
    settled(promise) {
      reflectApply(weakSetAdd, settledPromises, [promise]);
      if (promise === targetPromise) closeObservedSettlement();
    },
  }]);

  function observe(invoke) {
    try {
      const settlement = classifyCallbackResult(invoke());
      if (!objectHasOwn(settlement, FAILURE_METADATA_PROPERTY.PENDING)) {
        close();
        return settlement;
      }
      targetPromise = settlement.pending;
      if (reflectApply(weakSetHas, settledPromises, [targetPromise])) {
        close();
        return settlement;
      }
      record.callbackSettlementState = CALLBACK_SETTLEMENT_STATE.UNKNOWN;
      reflectApply(promiseThen, targetPromise, [close, close]);
      queueMicrotaskFunction(() => admitDeferredQueries(record));
      return settlement;
    } catch (error) {
      close();
      throw error;
    }
  }

  return objectFreeze({close, observe});
}

function createApplicationDatabaseFacade(options) {
  const {applicationId, generation, sqlCore} = options;
  const transactionContext = new AsyncLocalStorage();

  function executeSessionQuery(sql, params, sessionId) {
    const sqlSnapshot = snapshotSql(sql);
    const paramsSnapshot = snapshotParams(params);
    return executeCanonical(
      sqlCore,
      sqlSnapshot,
      paramsSnapshot,
      createApplicationDatabaseExecutionOptions(sessionId),
      LOCAL_STR_QUERY_OPERATION,
    );
  }

  function enqueueTransactionQuery(record, sqlSnapshot, paramsSnapshot) {
    const statement = reflectApply(promiseThen, record.tail, [async () => {
      if (record.failedError) throw record.failedError;
      try {
        return await executeCanonical(
          sqlCore,
          sqlSnapshot,
          paramsSnapshot,
          createApplicationDatabaseExecutionOptions(record.sessionId),
          LOCAL_STR_QUERY_OPERATION,
        );
      } catch (error) {
        record.failedError ||= error;
        throw error;
      }
    }]);
    record.tail = reflectApply(promiseThen, statement, [
      undefined,
      () => undefined,
    ]);
    return statement;
  }

  function deferTransactionQuery(record, sql, params) {
    let sqlSnapshot;
    let paramsSnapshot;
    let validationError = null;
    try {
      sqlSnapshot = snapshotSql(sql);
      paramsSnapshot = snapshotParams(params);
    } catch (error) {
      validationError = error;
    }
    let resolveAdmission;
    let rejectAdmission;
    const pending = new PromiseConstructor((resolve, reject) => {
      resolveAdmission = resolve;
      rejectAdmission = reject;
    });
    defineArrayValue(
      record.deferredAdmissions,
      record.deferredAdmissions.length,
      objectFreeze({
        admit() {
          if (validationError) {
            record.failedError ||= validationError;
            rejectAdmission(validationError);
            return;
          }
          const statement = enqueueTransactionQuery(
            record,
            sqlSnapshot,
            paramsSnapshot,
          );
          reflectApply(promiseThen, statement, [
            resolveAdmission,
            rejectAdmission,
          ]);
        },
        reject: rejectAdmission,
      }),
    );
    return pending;
  }

  function queryInTransaction(record, sql, params) {
    if (record.state !== APPLICATION_DATABASE_TRANSACTION_STATE.OPEN) {
      return reflectApply(promiseReject, PromiseConstructor, [
        createApplicationDatabaseError(
          APPLICATION_DATABASE_ERROR_CODE.TRANSACTION_CLOSED,
          APPLICATION_DATABASE_ERROR_MSG.TRANSACTION_CLOSED,
        ),
      ]);
    }
    if (
      record.callbackSettlementState === CALLBACK_SETTLEMENT_STATE.UNKNOWN
    ) {
      return deferTransactionQuery(record, sql, params);
    }
    let sqlSnapshot;
    let paramsSnapshot;
    try {
      sqlSnapshot = snapshotSql(sql);
      paramsSnapshot = snapshotParams(params);
    } catch (error) {
      record.failedError ||= error;
      return reflectApply(promiseReject, PromiseConstructor, [error]);
    }
    return enqueueTransactionQuery(record, sqlSnapshot, paramsSnapshot);
  }

  async function query(sql, params = []) {
    const activeRecord = transactionContext.getStore();
    if (
      activeRecord &&
      activeRecord.state !== APPLICATION_DATABASE_TRANSACTION_STATE.CLOSED
    ) {
      return queryInTransaction(activeRecord, sql, params);
    }
    const release = generation.acquire();
    try {
      return await executeSessionQuery(sql, params, createSessionId(applicationId));
    } finally {
      release();
    }
  }

  async function transaction(callback) {
    const inheritedRecord = transactionContext.getStore();
    validateTransactionCallback(callback, inheritedRecord);

    const release = generation.acquire();
    const record = {
      callbackSettlementState: CALLBACK_SETTLEMENT_STATE.INACTIVE,
      deferredAdmissions: [],
      failedError: null,
      sessionId: createSessionId(applicationId),
      state: APPLICATION_DATABASE_TRANSACTION_STATE.OPEN,
      tail: reflectApply(promiseResolve, PromiseConstructor, []),
    };
    const controlOptions = createApplicationDatabaseExecutionOptions(
      record.sessionId,
      true,
    );
    try {
      await executeCanonical(
        sqlCore,
        LOCAL_STR_BEGIN,
        [],
        controlOptions,
        LOCAL_STR_BEGIN_OPERATION,
      );
      try {
        let callbackResult;
        try {
          const settlementOwner = createCallbackSettlementOwner(record);
          const settlement = settlementOwner.observe(() =>
            transactionContext.run(
              record,
              () => reflectApply(callback, undefined, [objectFreeze({
                query: (sql, params = []) =>
                  queryInTransaction(record, sql, params),
              })]),
            ));
          if (objectHasOwn(settlement, FAILURE_METADATA_PROPERTY.PENDING)) {
            callbackResult = await settlement.pending;
          } else {
            callbackResult = settlement.value;
          }
          settlementOwner.close();
        } catch (error) {
          record.failedError ||= normalizeCallbackFailure(error);
        }

        record.state = APPLICATION_DATABASE_TRANSACTION_STATE.DRAINING;
        await record.tail;
        if (record.failedError) {
          await rollbackAndThrow(
            sqlCore,
            record,
            controlOptions,
            record.failedError,
          );
        }

        record.state = APPLICATION_DATABASE_TRANSACTION_STATE.COMMITTING;
        await executeCanonical(
          sqlCore,
          LOCAL_STR_COMMIT,
          [],
          controlOptions,
          LOCAL_STR_COMMIT_OPERATION,
        );
        return callbackResult;
      } catch (error) {
        if (
          record.state === APPLICATION_DATABASE_TRANSACTION_STATE.COMMITTING ||
          record.state === APPLICATION_DATABASE_TRANSACTION_STATE.ROLLING_BACK
        ) {
          throw error;
        }
        await rollbackAndThrow(sqlCore, record, controlOptions, error);
        throw error;
      }
    } finally {
      record.state = APPLICATION_DATABASE_TRANSACTION_STATE.CLOSED;
      release();
    }
  }

  return objectFreeze({query, transaction});
}

function createBoundApplicationDatabaseRuntime(sqlCore) {
  if (!sqlCore || typeof sqlCore.executeQuery !== 'function') {
    throw createApplicationDatabaseError(
      APPLICATION_DATABASE_ERROR_CODE.SQL_CORE_UNAVAILABLE,
      APPLICATION_DATABASE_ERROR_MSG.SQL_CORE_UNAVAILABLE,
    );
  }
  const generation = createApplicationRuntimeGeneration();
  return objectFreeze({
    close: generation.closeAdmission,
    openApplicationDatabase(options) {
      return createApplicationDatabaseFacade({
        applicationId: snapshotApplicationDatabaseOpenOptions(options),
        generation,
        sqlCore,
      });
    },
  });
}

export {createBoundApplicationDatabaseRuntime};
