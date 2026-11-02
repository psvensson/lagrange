import {createHash} from 'node:crypto';

import {
  buildIdempotencyCheckSQL,
  createOperation,
  transitionOperation,
} from '../wasm-service/operation-lifecycle.js';
import {
  DEFAULT_INVOCATION_RETENTION_WINDOW_MS,
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  RequestCellRoutingError,
  createScopedInvocationKey,
} from '../service/request-cell-routing-contract.js';

const CURRENT_SQL_REQUEST_EXECUTOR_UNAVAILABLE =
  'current SQL request executor is unavailable';
const INVOCATION_JOURNAL_DIALECT = 'postgresql';
const RUNTIME_INVOKE_OPERATION = 'invoke';
const INVOCATION_COMMAND_SEPARATOR = ':';
const INVOCATION_ERROR_SEPARATOR = '; ';
const INVOCATION_OPERATION_ID_PREFIX = 'request-cell-operation-';
const INVOCATION_OPERATION_HASH_ALGORITHM = 'sha256';
const INVOCATION_OPERATION_HASH_ENCODING = 'hex';
const ABORT_EVENT = 'abort';
const EMPTY_INVOCATION_JOURNAL_ROWS = Object.freeze([]);
const INVOCATION_OPERATION_NOT_FOUND =
  Symbol('invocation-operation-not-found');
const IN_FLIGHT_INVOCATION_NOT_FOUND =
  Symbol('in-flight-invocation-not-found');
const REQUEST_CELL_INVOCATION_MESSAGE = Object.freeze({
  CANCELLED: 'Request Cell invocation was cancelled',
  CLAIM_FAILED: 'Request Cell invocation claim failed',
  CONCURRENT_INTENT_CONFLICT:
    'Concurrent invocation identity has different request intent',
  EXPIRED: 'Retained Request Cell invocation record has expired',
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
      return (sql, params) => queryExecutor.executeInternal(
        sql,
        params,
        {dialect: INVOCATION_JOURNAL_DIALECT},
      );
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

  function resolveDurableInvocationKey(tenantId, serviceId, invocation) {
    if (typeof invocation?.durableInvocationKey === 'string' &&
        invocation.durableInvocationKey.length > 0) {
      return invocation.durableInvocationKey;
    }
    const principal = invocation?.securityContext?.principal;
    if (invocation?.fetchMode === true && typeof principal === 'string') {
      return createScopedInvocationKey({
        bindingId:
          invocation.bindingId || invocation.invocationServiceId || serviceId,
        invocationId: invocation.invocationId,
        principal,
        tenantId,
      });
    }
    return invocation?.invocationId;
  }

  function resolveInvocationMountScope(serviceId, invocation) {
    if (invocation?.fetchMode === true &&
        typeof invocation?.bindingId === 'string' &&
        invocation.bindingId.length > 0) {
      return invocation.bindingId;
    }
    return invocation?.invocationServiceId || serviceId;
  }

  function resolveEffectiveIntentDigest(invocation) {
    if (typeof invocation?.semanticIntentDigest === 'string' &&
        invocation.semanticIntentDigest.length > 0) {
      return invocation.semanticIntentDigest;
    }
    return invocation?.intentDigest;
  }

  function resolveRetentionWindowMs(owner, invocation) {
    const candidate =
      invocation?.retentionWindowMs ?? owner?._invocationRetentionWindowMs;
    return Number.isFinite(candidate) && candidate > 0 ?
      candidate :
      DEFAULT_INVOCATION_RETENTION_WINDOW_MS;
  }

  function resolveOperationTimestamp(operation) {
    return Number(
      operation?.updated_at ??
      operation?.updatedAt ??
      operation?.created_at ??
      operation?.createdAt,
    );
  }

  function assertNotExpired(operation, retentionWindowMs, nowMs) {
    const recordedAt = resolveOperationTimestamp(operation);
    if (Number.isFinite(recordedAt) && nowMs - recordedAt > retentionWindowMs) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_EXPIRED,
        REQUEST_CELL_INVOCATION_MESSAGE.EXPIRED,
        {preserveReplicaState: true},
      );
    }
  }

  function resolvePinnedRevision(invocation) {
    return invocation?.pinnedBindingVersionId ||
      invocation?.bindingVersionId || null;
  }

  function buildStoredInvocationCommand(baseCommand, invocation) {
    const pinnedRevision = resolvePinnedRevision(invocation);
    if (invocation?.fetchMode === true && typeof pinnedRevision === 'string') {
      return `${baseCommand}${INVOCATION_COMMAND_SEPARATOR}${pinnedRevision}`;
    }
    return baseCommand;
  }

  function throwIntentConflict() {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
      REQUEST_CELL_INVOCATION_MESSAGE.INTENT_CONFLICT,
      {preserveReplicaState: true},
    );
  }

  function extractRecordedFetchRevision(storedCommand, baseCommand) {
    const prefix = `${baseCommand}${INVOCATION_COMMAND_SEPARATOR}`;
    if (storedCommand === baseCommand) return null;
    if (typeof storedCommand === 'string' && storedCommand.startsWith(prefix)) {
      return storedCommand.slice(prefix.length);
    }
    throwIntentConflict();
  }

  function assertInvocationIntent(operation, baseCommand, invocation) {
    const storedCommand = operation?.command;
    if (invocation?.fetchMode !== true) {
      if (storedCommand !== baseCommand) throwIntentConflict();
      return;
    }
    const recordedRevision = extractRecordedFetchRevision(
      storedCommand, baseCommand,
    );
    const explicit = invocation?.explicitBindingVersionId;
    if (typeof explicit === 'string' && explicit.length > 0 &&
        recordedRevision && recordedRevision !== explicit) {
      throwIntentConflict();
    }
  }

  function buildInvocationCancelledError(invoked) {
    return new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.CANCELLED,
      REQUEST_CELL_INVOCATION_MESSAGE.CANCELLED,
      {
        classification: invoked ?
          REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS :
          REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL,
        invoked: invoked === true,
        preserveReplicaState: true,
      },
    );
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
    executor, operation, fromState, toState, resultOrError,
  ) {
    const operationId = operation.operation_id ?? operation.operationId;
    const transition = transitionOperation(
      operationId, fromState, toState, resultOrError,
    );
    if (!transition.success) throw buildInvocationAmbiguousError();
    const result = await executeInvocationJournal(
      executor, transition.sql, transition.params,
    );
    if (invocationJournalAffectedRows(result) !== 1) {
      throw buildInvocationAmbiguousError();
    }
    return result;
  }

  async function rearmSafeInvocation(executor, operation) {
    const operationId = operation.operation_id ?? operation.operationId;
    const result = await executeInvocationJournal(
      executor,
      'UPDATE wasm_operations SET state = $1, error = $2, ' +
        'updated_at = $3 WHERE operation_id = $4 AND state = $5',
      [
        WASM_OPERATION_STATE.IN_PROGRESS, JSON.stringify({}), Date.now(),
        operationId, WASM_OPERATION_STATE.CANCELLED,
      ],
    );
    if (invocationJournalAffectedRows(result) !== 1) {
      throw buildInvocationAmbiguousError();
    }
  }

  async function createInvocationClaim(
    executor, tenantId, durableKey, command, claimContext,
  ) {
    const storedCommand = buildStoredInvocationCommand(
      command, claimContext.invocation,
    );
    const created = createOperation(tenantId, storedCommand, durableKey);
    if (!created.success) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
        created.errors.join(INVOCATION_ERROR_SEPARATOR),
        {preserveReplicaState: true},
      );
    }
    const operationId = buildInvocationOperationId(tenantId, durableKey);
    created.operation.operationId = operationId;
    created.params[0] = operationId;
    const insert = await executor(created.sql, created.params);
    if (insert?.success === true && invocationJournalAffectedRows(insert) === 1) {
      await transitionInvocationOperation(
        executor, created.operation,
        WASM_OPERATION_STATE.PENDING, WASM_OPERATION_STATE.IN_PROGRESS,
      );
      return created.operation;
    }
    const existing = await readInvocationOperation(executor, tenantId, durableKey);
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
    return resolveInvocationClaimState(executor, existing, command, claimContext);
  }

  function rethrowJournaledFailedOperation(existing) {
    const error = parseJournalValue(existing.error, {});
    if (error.classification === REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS ||
        error.code === REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS) {
      throw buildInvocationAmbiguousError();
    }
    throw new RequestCellRoutingError(
      error.code || REQUEST_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
      error.message || REQUEST_CELL_INVOCATION_MESSAGE.PRIOR_FAILURE,
      {
        classification:
          error.classification || REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL,
        invoked: true,
        preserveReplicaState: true,
      },
    );
  }

  async function resolveInvocationClaimState(
    executor, existing, command, claimContext,
  ) {
    assertNotExpired(existing, claimContext.retentionWindowMs, claimContext.nowMs);
    assertInvocationIntent(existing, command, claimContext.invocation);
    if (existing.state === WASM_OPERATION_STATE.COMPLETED) {
      return {completed: completedInvocationResult(existing)};
    }
    if (existing.state === WASM_OPERATION_STATE.PENDING) {
      await transitionInvocationOperation(
        executor, existing,
        WASM_OPERATION_STATE.PENDING, WASM_OPERATION_STATE.IN_PROGRESS,
      );
      return existing;
    }
    if (existing.state === WASM_OPERATION_STATE.CANCELLED) {
      const error = parseJournalValue(existing.error, {});
      if (error?.safeToRetry !== true) throw buildInvocationAmbiguousError();
      await rearmSafeInvocation(executor, existing);
      return existing;
    }
    if (existing.state === WASM_OPERATION_STATE.FAILED) {
      rethrowJournaledFailedOperation(existing);
    }
    throw buildInvocationAmbiguousError();
  }

  async function claimInvocationOperation(
    executor, tenantId, durableKey, command, claimContext,
  ) {
    const existing = await readInvocationOperation(executor, tenantId, durableKey);
    if (existing === INVOCATION_OPERATION_NOT_FOUND) {
      return createInvocationClaim(
        executor, tenantId, durableKey, command, claimContext,
      );
    }
    return resolveInvocationClaimState(executor, existing, command, claimContext);
  }

  function assertInvocationFenceAvailable(
    tenantId, invocationId, intentDigest, executor,
  ) {
    if (typeof tenantId !== 'string' || tenantId.length === 0 ||
        typeof invocationId !== 'string' || invocationId.length === 0 ||
        typeof intentDigest !== 'string' || intentDigest.length === 0 ||
        typeof executor !== 'function') {
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

  function assertInFlightIntentMatches(current, effectiveIntent, invocation) {
    const explicit = invocation?.explicitBindingVersionId;
    const explicitConflict =
      typeof explicit === 'string' && explicit.length > 0 &&
      typeof current.pinnedBindingVersionId === 'string' &&
      current.pinnedBindingVersionId !== explicit;
    if (current.intentDigest !== effectiveIntent || explicitConflict) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
        REQUEST_CELL_INVOCATION_MESSAGE.CONCURRENT_INTENT_CONFLICT,
        {preserveReplicaState: true},
      );
    }
  }

  function resolveCurrentInFlightInvocation(
    owner, key, effectiveIntent, invocation,
  ) {
    const current = owner._inFlightInvocations.get(key);
    if (!current) return IN_FLIGHT_INVOCATION_NOT_FOUND;
    assertInFlightIntentMatches(current, effectiveIntent, invocation);
    return current;
  }

  function attachWaiterToInFlightInvocation(entry, waiterSignal) {
    if (waiterSignal?.aborted) {
      return Promise.reject(
        waiterSignal.reason instanceof RequestCellRoutingError ?
          waiterSignal.reason : buildInvocationCancelledError(entry.driverStarted),
      );
    }
    const waiter = {signal: waiterSignal || null};
    entry.waiters.add(waiter);
    return new Promise((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        entry.waiters.delete(waiter);
        waiterSignal?.removeEventListener(ABORT_EVENT, onWaiterAbort);
      };
      function onWaiterAbort() {
        if (finished) return;
        finished = true;
        cleanup();
        const cancelError =
          waiterSignal.reason instanceof RequestCellRoutingError ?
            waiterSignal.reason : buildInvocationCancelledError(entry.driverStarted);
        if (entry.waiters.size === 0 && !entry.settled) {
          entry.invocationController.abort(cancelError);
        }
        reject(cancelError);
      }
      waiterSignal?.addEventListener(ABORT_EVENT, onWaiterAbort, {once: true});
      entry.promise.then(
        (value) => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve(value);
        },
        (error) => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(error);
        },
      );
    });
  }

  function raceWithInvocationSignal(promise, signal, isDriverStarted) {
    if (signal.aborted) {
      return Promise.reject(
        signal.reason instanceof Error ?
          signal.reason : buildInvocationCancelledError(isDriverStarted()),
      );
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      function onAbort() {
        if (settled) return;
        settled = true;
        signal.removeEventListener(ABORT_EVENT, onAbort);
        reject(
          signal.reason instanceof Error ?
            signal.reason : buildInvocationCancelledError(isDriverStarted()),
        );
      }
      signal.addEventListener(ABORT_EVENT, onAbort, {once: true});
      Promise.resolve(promise).then(
        (value) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener(ABORT_EVENT, onAbort);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener(ABORT_EVENT, onAbort);
          reject(error);
        },
      );
    });
  }

  async function settleFailedInvocation(executor, operation, error) {
    const isCancelledCode =
      error?.code === REQUEST_CELL_ROUTE_ERROR_CODE.CANCELLED;
    const safeToRetry =
      error instanceof RequestCellRoutingError &&
      error.preserveReplicaState && !error.invoked;
    const targetState = safeToRetry || isCancelledCode ?
      WASM_OPERATION_STATE.CANCELLED : WASM_OPERATION_STATE.FAILED;
    await transitionInvocationOperation(
      executor, operation, WASM_OPERATION_STATE.IN_PROGRESS, targetState,
      {
        classification: error?.classification || null,
        code: error.code || REQUEST_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
        message: error.message,
        safeToRetry,
      },
    );
  }

  async function executeClaimedInvocation(
    executor, operation, invocation, invokeDriver, entry,
  ) {
    if (operation.completed) return operation.completed;
    let value;
    try {
      if (entry.invocationController.signal.aborted) {
        throw entry.invocationController.signal.reason ||
          buildInvocationCancelledError(false);
      }
      invocation.assertCurrentTarget?.();
      entry.driverStarted = true;
      value = await raceWithInvocationSignal(
        invokeDriver(), entry.invocationController.signal, () => entry.driverStarted,
      );
    } catch (error) {
      await settleFailedInvocation(executor, operation, error);
      throw error;
    }
    try {
      await transitionInvocationOperation(
        executor, operation,
        WASM_OPERATION_STATE.IN_PROGRESS, WASM_OPERATION_STATE.COMPLETED, value,
      );
    } catch {
      throw buildInvocationAmbiguousError();
    }
    return {
      journaled: true,
      operationId: operation.operation_id ?? operation.operationId,
      replayed: false,
      value,
    };
  }

  function removeSettledInFlightInvocation(owner, key, idKey, entry) {
    entry.settled = true;
    if (owner._inFlightInvocations.get(key) === entry) {
      owner._inFlightInvocations.delete(key);
    }
    if (owner._inFlightByInvocationId?.get(idKey) === entry) {
      owner._inFlightByInvocationId.delete(idKey);
    }
  }

  function cancelInvocation(owner, tenantId, invocationId) {
    const idKey = `${tenantId}${INVOCATION_COMMAND_SEPARATOR}${invocationId}`;
    const entry =
      owner._inFlightInvocations?.get(idKey) ||
      owner._inFlightByInvocationId?.get(idKey);
    if (!entry || entry.settled) return false;
    const cancelError = buildInvocationCancelledError(entry.driverStarted);
    entry.invocationController.abort(cancelError);
    return true;
  }

  function ensureOwnerMaps(owner) {
    owner._inFlightInvocations ||= new Map();
    owner._inFlightByInvocationId ||= new Map();
  }

  function buildInFlightEntry(owner, invocation, effectiveIntent) {
    return {
      claimContext: {
        invocation,
        nowMs: typeof invocation?.now === 'function' ?
          invocation.now() : Date.now(),
        retentionWindowMs: resolveRetentionWindowMs(owner, invocation),
      },
      driverStarted: false,
      intentDigest: effectiveIntent,
      invocationController: new AbortController(),
      pinnedBindingVersionId: resolvePinnedRevision(invocation),
      promise: null,
      settled: false,
      waiters: new Set(),
    };
  }

  async function invokeWithDurableFence(
    owner, definition, serviceId, invocation, invokeDriver,
  ) {
    const tenantId = resolveInvocationTenant(definition, invocation);
    const invocationId = invocation?.invocationId;
    const executor =
      resolveInvocationJournalExecutor(owner, definition, serviceId);
    assertInvocationFenceAvailable(
      tenantId, invocationId, invocation?.intentDigest, executor,
    );
    const durableKey = resolveDurableInvocationKey(tenantId, serviceId, invocation);
    const effectiveIntent = resolveEffectiveIntentDigest(invocation);
    const mountScope = resolveInvocationMountScope(serviceId, invocation);
    const key = `${tenantId}${INVOCATION_COMMAND_SEPARATOR}${durableKey}`;
    const idKey = `${tenantId}${INVOCATION_COMMAND_SEPARATOR}${invocationId}`;
    const command = [
      RUNTIME_INVOKE_OPERATION, mountScope, effectiveIntent,
    ].join(INVOCATION_COMMAND_SEPARATOR);
    ensureOwnerMaps(owner);
    const current = resolveCurrentInFlightInvocation(
      owner, key, effectiveIntent, invocation,
    );
    if (current !== IN_FLIGHT_INVOCATION_NOT_FOUND) {
      return attachWaiterToInFlightInvocation(current, invocation?.signal);
    }
    const entry = buildInFlightEntry(owner, invocation, effectiveIntent);
    entry.promise = (async () => {
      const operation = await claimInvocationOperation(
        executor, tenantId, durableKey, command, entry.claimContext,
      );
      return executeClaimedInvocation(
        executor, operation, invocation, invokeDriver, entry,
      );
    })().finally(() => {
      removeSettledInFlightInvocation(owner, key, idKey, entry);
    });
    owner._inFlightInvocations.set(key, entry);
    owner._inFlightByInvocationId.set(idKey, entry);
    return attachWaiterToInFlightInvocation(entry, invocation?.signal);
  }

  return {
    cancelInvocation,
    injectServiceQueryExecutor,
    invokeWithDurableFence,
  };
}

export {createRequestCellInvocationOwner};
