import {createHash} from 'node:crypto';

import {
  buildIdempotencyCheckSQL,
  createOperation,
  transitionOperation,
} from '../wasm-service/operation-lifecycle.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  RequestCellRoutingError,
} from '../service/request-cell-routing-contract.js';

const CURRENT_SQL_REQUEST_EXECUTOR_UNAVAILABLE =
  'current SQL request executor is unavailable';
const RUNTIME_INVOKE_OPERATION = 'invoke';
const INVOCATION_COMMAND_SEPARATOR = ':';
const INVOCATION_ERROR_SEPARATOR = '; ';
const INVOCATION_OPERATION_ID_PREFIX = 'request-cell-operation-';
const INVOCATION_OPERATION_HASH_ALGORITHM = 'sha256';
const INVOCATION_OPERATION_HASH_ENCODING = 'hex';
const EMPTY_INVOCATION_JOURNAL_ROWS = Object.freeze([]);
const INVOCATION_OPERATION_NOT_FOUND =
  Symbol('invocation-operation-not-found');
const IN_FLIGHT_INVOCATION_NOT_FOUND =
  Symbol('in-flight-invocation-not-found');
const REQUEST_CELL_INVOCATION_MESSAGE = Object.freeze({
  CLAIM_FAILED: 'Request Cell invocation claim failed',
  CONCURRENT_INTENT_CONFLICT:
    'Concurrent invocation identity has different request intent',
  FENCE_UNAVAILABLE:
    'Durable Request Cell invocation fencing is unavailable',
  INTENT_CONFLICT:
    'Invocation identity is already bound to different request intent',
  JOURNAL_UNAVAILABLE: 'Request Cell invocation journal is unavailable',
  IDENTITY_INVALID: 'Request Cell invocation identity is invalid',
  OUTCOME_AMBIGUOUS:
    'Invocation outcome is ambiguous; effects will not be repeated',
  PRIOR_FAILURE: 'Prior Request Cell invocation failed',
});

function createRequestCellInvocationOwner(deps) {
  const {
    QUERY_EXECUTOR_FACTORY_EVENT,
    WASM_OPERATION_STATE,
  } = deps;

  function resolveIssuingServiceIdentity(definition, replicaServiceId) {
    return definition.entityId ??
      definition.service_id ?? replicaServiceId;
  }

  function executeWithCurrentSqlRequestExecutor(
    owner,
    issuingServiceIdentity,
    request,
  ) {
    const currentQueryExecutor = owner._queryExecutorFactory?.(
      issuingServiceIdentity,
    );
    if (typeof currentQueryExecutor?.executeRequest !== 'function') {
      throw new Error(CURRENT_SQL_REQUEST_EXECUTOR_UNAVAILABLE);
    }
    return currentQueryExecutor.executeRequest(request);
  }

  function injectServiceQueryExecutor(
    owner,
    definition,
    serviceId,
    replicaContext,
    runtimeKind,
  ) {
    if (!owner._queryExecutorFactory) return;
    const issuingServiceIdentity =
      resolveIssuingServiceIdentity(definition, serviceId);
    const queryExecutor = owner._queryExecutorFactory(issuingServiceIdentity);
    replicaContext.queryExecutor = queryExecutor;
    if (typeof queryExecutor?.executeRequest === 'function') {
      replicaContext.sqlRequestExecutor = (request) =>
        executeWithCurrentSqlRequestExecutor(
          owner,
          issuingServiceIdentity,
          request,
        );
    }
    owner.emit(
      QUERY_EXECUTOR_FACTORY_EVENT.EXECUTOR_INJECTED,
      {runtimeKind, serviceId},
    );
  }

  function resolveInvocationTenant(definition, invocation) {
    if (typeof invocation?.tenantId === 'string' &&
        invocation.tenantId.length > 0) {
      return invocation.tenantId;
    }
    if (typeof definition?.tenantId === 'string' &&
        definition.tenantId.length > 0) {
      return definition.tenantId;
    }
    try {
      const projection = JSON.parse(definition?.binding_projection);
      return projection.tenant_id;
    } catch {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        REQUEST_CELL_INVOCATION_MESSAGE.FENCE_UNAVAILABLE,
        {
          classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
          preserveReplicaState: true,
        },
      );
    }
  }

  function resolveInvocationJournalExecutor(
    owner,
    definition,
    serviceId,
  ) {
    const issuingServiceIdentity =
      resolveIssuingServiceIdentity(definition, serviceId);
    const queryExecutor =
      owner._queryExecutorFactory?.(issuingServiceIdentity);
    if (typeof queryExecutor?.executeInternal === 'function') {
      return queryExecutor.executeInternal;
    }
    if (typeof queryExecutor === 'function') return queryExecutor;
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      REQUEST_CELL_INVOCATION_MESSAGE.JOURNAL_UNAVAILABLE,
      {
        classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
        preserveReplicaState: true,
      },
    );
  }

  async function executeInvocationJournal(executor, sql, params) {
    const result = await executor(sql, params);
    if (result?.success !== true) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        result?.error ||
          REQUEST_CELL_INVOCATION_MESSAGE.JOURNAL_UNAVAILABLE,
        {
          classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
          preserveReplicaState: true,
        },
      );
    }
    return result;
  }

  function journalRows(result) {
    if (Array.isArray(result?.rows)) return result.rows;
    if (Array.isArray(result)) return result;
    return EMPTY_INVOCATION_JOURNAL_ROWS;
  }

  function invocationJournalAffectedRows(result) {
    const affectedRows =
      result?.partitionResult?.affectedRows ??
      result?.affectedRows ??
      result?.changes;
    return Number.isFinite(Number(affectedRows)) ?
      Number(affectedRows) :
      null;
  }

  async function readInvocationOperation(
    executor,
    tenantId,
    invocationId,
  ) {
    const check = buildIdempotencyCheckSQL(tenantId, invocationId);
    if (!check.success) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
        REQUEST_CELL_INVOCATION_MESSAGE.IDENTITY_INVALID,
        {preserveReplicaState: true},
      );
    }
    const result = await executeInvocationJournal(
      executor,
      check.sql,
      check.params,
    );
    return journalRows(result)[0] || INVOCATION_OPERATION_NOT_FOUND;
  }

  function parseJournalValue(value, fallback = null) {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || value.length === 0) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function assertInvocationIntent(operation, command) {
    if (operation?.command !== command) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
        REQUEST_CELL_INVOCATION_MESSAGE.INTENT_CONFLICT,
      );
    }
  }

  function buildInvocationAmbiguousError() {
    return new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
      REQUEST_CELL_INVOCATION_MESSAGE.OUTCOME_AMBIGUOUS,
      {
        classification: REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS,
        invoked: true,
        preserveReplicaState: true,
      },
    );
  }

  function buildInvocationOperationId(tenantId, invocationId) {
    const digest = createHash(INVOCATION_OPERATION_HASH_ALGORITHM)
      .update(JSON.stringify([tenantId, invocationId]))
      .digest(INVOCATION_OPERATION_HASH_ENCODING);
    return `${INVOCATION_OPERATION_ID_PREFIX}${digest}`;
  }

  function completedInvocationResult(operation) {
    return {
      journaled: true,
      operationId: operation.operation_id ?? operation.operationId,
      replayed: true,
      value: parseJournalValue(operation.result),
    };
  }

  async function transitionInvocationOperation(
    executor,
    operation,
    fromState,
    toState,
    resultOrError,
  ) {
    const operationId = operation.operation_id ?? operation.operationId;
    const transition = transitionOperation(
      operationId,
      fromState,
      toState,
      resultOrError,
    );
    if (!transition.success) throw buildInvocationAmbiguousError();
    const result = await executeInvocationJournal(
      executor,
      transition.sql,
      transition.params,
    );
    if (invocationJournalAffectedRows(result) !== 1) {
      throw buildInvocationAmbiguousError();
    }
    return result;
  }

  async function rearmSafeInvocation(executor, operation) {
    const operationId = operation.operation_id ?? operation.operationId;
    const now = Date.now();
    const result = await executeInvocationJournal(
      executor,
      'UPDATE wasm_operations SET state = $1, error = $2, ' +
        'updated_at = $3 WHERE operation_id = $4 AND state = $5',
      [
        WASM_OPERATION_STATE.IN_PROGRESS,
        JSON.stringify({}),
        now,
        operationId,
        WASM_OPERATION_STATE.CANCELLED,
      ],
    );
    if (invocationJournalAffectedRows(result) !== 1) {
      throw buildInvocationAmbiguousError();
    }
  }

  async function createInvocationClaim(
    executor,
    tenantId,
    invocationId,
    command,
  ) {
    const created = createOperation(tenantId, command, invocationId);
    if (!created.success) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
        created.errors.join(INVOCATION_ERROR_SEPARATOR),
        {preserveReplicaState: true},
      );
    }
    const operationId = buildInvocationOperationId(
      tenantId,
      invocationId,
    );
    created.operation.operationId = operationId;
    created.params[0] = operationId;
    const insert = await executor(created.sql, created.params);
    if (
      insert?.success === true &&
      invocationJournalAffectedRows(insert) === 1
    ) {
      await transitionInvocationOperation(
        executor,
        created.operation,
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      return created.operation;
    }
    const existing = await readInvocationOperation(
      executor,
      tenantId,
      invocationId,
    );
    if (existing === INVOCATION_OPERATION_NOT_FOUND) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        insert?.error || REQUEST_CELL_INVOCATION_MESSAGE.CLAIM_FAILED,
        {
          classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
          preserveReplicaState: true,
        },
      );
    }
    return resolveInvocationClaimState(executor, existing, command);
  }

  async function resolveInvocationClaimState(
    executor,
    existing,
    command,
  ) {
    assertInvocationIntent(existing, command);
    if (existing.state === WASM_OPERATION_STATE.COMPLETED) {
      return {completed: completedInvocationResult(existing)};
    }
    if (existing.state === WASM_OPERATION_STATE.PENDING) {
      await transitionInvocationOperation(
        executor,
        existing,
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      return existing;
    }
    if (existing.state === WASM_OPERATION_STATE.CANCELLED) {
      const error = parseJournalValue(existing.error, {});
      if (error?.safeToRetry !== true) {
        throw buildInvocationAmbiguousError();
      }
      await rearmSafeInvocation(executor, existing);
      return existing;
    }
    if (existing.state === WASM_OPERATION_STATE.FAILED) {
      const error = parseJournalValue(existing.error, {});
      throw new RequestCellRoutingError(
        error.code || REQUEST_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
        error.message || REQUEST_CELL_INVOCATION_MESSAGE.PRIOR_FAILURE,
        {invoked: true, preserveReplicaState: true},
      );
    }
    throw buildInvocationAmbiguousError();
  }

  async function claimInvocationOperation(
    executor,
    tenantId,
    invocationId,
    command,
  ) {
    const existing = await readInvocationOperation(
      executor,
      tenantId,
      invocationId,
    );
    if (existing === INVOCATION_OPERATION_NOT_FOUND) {
      return createInvocationClaim(
        executor,
        tenantId,
        invocationId,
        command,
      );
    }
    return resolveInvocationClaimState(executor, existing, command);
  }

  function assertInvocationFenceAvailable(
    tenantId,
    invocationId,
    intentDigest,
    executor,
  ) {
    if (
      typeof tenantId !== 'string' ||
      tenantId.length === 0 ||
      typeof invocationId !== 'string' ||
      invocationId.length === 0 ||
      typeof intentDigest !== 'string' ||
      intentDigest.length === 0 ||
      typeof executor !== 'function'
    ) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        REQUEST_CELL_INVOCATION_MESSAGE.FENCE_UNAVAILABLE,
        {
          classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
          preserveReplicaState: true,
        },
      );
    }
  }

  function resolveCurrentInFlightInvocation(
    owner,
    key,
    intentDigest,
  ) {
    const current = owner._inFlightInvocations.get(key);
    if (!current) return IN_FLIGHT_INVOCATION_NOT_FOUND;
    if (current.intentDigest !== intentDigest) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
        REQUEST_CELL_INVOCATION_MESSAGE.CONCURRENT_INTENT_CONFLICT,
      );
    }
    return current.promise;
  }

  async function settleFailedInvocation(executor, operation, error) {
    const safeToRetry =
      error instanceof RequestCellRoutingError &&
      error.preserveReplicaState &&
      !error.invoked;
    await transitionInvocationOperation(
      executor,
      operation,
      WASM_OPERATION_STATE.IN_PROGRESS,
      safeToRetry ?
        WASM_OPERATION_STATE.CANCELLED :
        WASM_OPERATION_STATE.FAILED,
      {
        code: error.code || REQUEST_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
        message: error.message,
        safeToRetry,
      },
    );
  }

  async function executeClaimedInvocation(
    executor,
    operation,
    invocation,
    invokeDriver,
  ) {
    if (operation.completed) return operation.completed;
    let value;
    try {
      invocation.assertCurrentTarget?.();
      value = await invokeDriver();
    } catch (error) {
      await settleFailedInvocation(executor, operation, error);
      throw error;
    }
    try {
      await transitionInvocationOperation(
        executor,
        operation,
        WASM_OPERATION_STATE.IN_PROGRESS,
        WASM_OPERATION_STATE.COMPLETED,
        value,
      );
    } catch {
      throw buildInvocationAmbiguousError();
    }
    return {
      journaled: true,
      operationId:
        operation.operation_id ?? operation.operationId,
      replayed: false,
      value,
    };
  }

  function removeSettledInFlightInvocation(owner, key, promise) {
    if (owner._inFlightInvocations.get(key)?.promise === promise) {
      owner._inFlightInvocations.delete(key);
    }
  }

  async function invokeWithDurableFence(
    owner,
    definition,
    serviceId,
    invocation,
    invokeDriver,
  ) {
    const tenantId = resolveInvocationTenant(definition, invocation);
    const invocationId = invocation?.invocationId;
    const intentDigest = invocation?.intentDigest;
    const executor =
      resolveInvocationJournalExecutor(owner, definition, serviceId);
    assertInvocationFenceAvailable(
      tenantId,
      invocationId,
      intentDigest,
      executor,
    );
    const key =
      `${tenantId}${INVOCATION_COMMAND_SEPARATOR}${invocationId}`;
    const command = [
      RUNTIME_INVOKE_OPERATION,
      invocation.invocationServiceId || serviceId,
      intentDigest,
    ].join(INVOCATION_COMMAND_SEPARATOR);
    owner._inFlightInvocations ||= new Map();
    const current = resolveCurrentInFlightInvocation(
      owner,
      key,
      intentDigest,
    );
    if (current !== IN_FLIGHT_INVOCATION_NOT_FOUND) return current;
    const promise = (async () => {
      const operation = await claimInvocationOperation(
        executor,
        tenantId,
        invocationId,
        command,
      );
      return executeClaimedInvocation(
        executor,
        operation,
        invocation,
        invokeDriver,
      );
    })().finally(() => {
      removeSettledInFlightInvocation(owner, key, promise);
    });
    owner._inFlightInvocations.set(key, {intentDigest, promise});
    return promise;
  }

  return {
    injectServiceQueryExecutor,
    invokeWithDurableFence,
  };
}

export {createRequestCellInvocationOwner};
