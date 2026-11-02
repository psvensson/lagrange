/**
 * Direct public CALL BINDING identity, durable admission record, and replay owner.
 *
 * Enforces scoped `(tenantId, principal, invocationKey)` identity, intent
 * conflict refusal, pinned `binding_version_id` / generation across retries,
 * terminal result/error retention, expiry refusal within the tombstone window,
 * and fail-closed `INVOCATION_AMBIGUOUS` (`outcome_uncertain`) when a prior
 * keyed execution is orphaned or uncertain.
 */

import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  callFailureProvesNoExecution,
  createCallInvocationIntentDigest,
  createCallRoutingFailure,
  createScopedDirectCallInvocationId,
  normalizeCallArguments,
} from './call-cell-routing-contract.js';

const DEFAULT_DIRECT_CALL_RETENTION_WINDOW_MS = 86_400_000;
const DEFAULT_GENERATION = 1;
const EMPTY_STRING = '';
const EMPTY_MESSAGE_FALLBACK = 'Call invocation failed';

const DIRECT_CALL_INSPECT_ACTION = Object.freeze({
  ADMIT_FRESH: 'admit_fresh',
  AWAIT_IN_FLIGHT: 'await_in_flight',
  REPLAY_COMPLETED: 'replay_completed',
  RETRY_PINNED: 'retry_pinned',
});

const DIRECT_CALL_RECORD_STATUS = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed',
  PENDING: 'pending',
  RETRYABLE_FAILED: 'retryable_failed',
  UNCERTAIN: 'uncertain',
});

const DIRECT_CALL_REPLAY_MESSAGE = Object.freeze({
  AMBIGUOUS:
    'Direct call invocation outcome is uncertain or in progress after ' +
    'interruption; automatic retry is refused',
  CONFLICT:
    'Direct call invocation_key is already bound to different invocation ' +
    'intent (operation, arguments, generation, or authority)',
  EXPIRED:
    'Direct call invocation_key has expired beyond the retention window',
  UNKEYED_UNCERTAIN_WARNING:
    'invocation_key omitted; outcome is uncertain and cannot be reconciled by replay',
});

function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJsonValue(value[key])]),
    );
  }
  return value;
}

function computeCanonicalArgumentsDigest(argumentsJson) {
  const normalizedJson = normalizeCallArguments(argumentsJson);
  const parsed = JSON.parse(normalizedJson);
  return createCallInvocationIntentDigest(canonicalizeJsonValue(parsed));
}

function extractWitnessMeta(resultRow) {
  if (!resultRow) return {found: false, meta: null};
  const rawWitness = resultRow.source_snapshot_json;
  if (!rawWitness) return {found: false, meta: null};
  try {
    const parsed = typeof rawWitness === 'string' ?
      JSON.parse(rawWitness) :
      rawWitness;
    const meta = parsed?.admissionMeta || null;
    return {found: Boolean(meta), meta};
  } catch {
    return {found: false, meta: null};
  }
}

function assertIntentMatchesMeta(meta, intent) {
  const baseMatches =
    meta.name === intent.name &&
    meta.argumentsDigest === intent.argumentsDigest &&
    meta.callerServiceId === intent.callerServiceId &&
    meta.tenantId === intent.tenantId &&
    meta.principal === intent.principal;
  const versionMatches =
    intent.explicitBindingVersionId === undefined ||
    intent.explicitBindingVersionId === meta.pinnedBindingVersionId;
  const generationMatches =
    intent.explicitGeneration === undefined ||
    intent.explicitGeneration === meta.pinnedGeneration;
  if (!baseMatches || !versionMatches || !generationMatches) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
      DIRECT_CALL_REPLAY_MESSAGE.CONFLICT,
    );
  }
}

function assertRecordNotExpired(meta, nowMs, retentionWindowMs) {
  if (Number.isFinite(meta.recordedAtMs) &&
      nowMs - meta.recordedAtMs > retentionWindowMs) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_EXPIRED,
      DIRECT_CALL_REPLAY_MESSAGE.EXPIRED,
    );
  }
}

function reconstructTerminalFailure(meta) {
  const errInfo = meta.errorPayload || {};
  return createCallRoutingFailure(
    errInfo.code || CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
    errInfo.message || DIRECT_CALL_REPLAY_MESSAGE.AMBIGUOUS,
    {
      classification:
        errInfo.classification || CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL,
      invoked: Boolean(errInfo.invoked),
    },
  );
}

function createAmbiguousReplayFailure() {
  const error = createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
    DIRECT_CALL_REPLAY_MESSAGE.AMBIGUOUS,
    {
      classification: CALL_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS,
      invocationExecutionStarted: true,
      invoked: true,
    },
  );
  return error;
}

function classifyFailureRecordStatus(error, executionStarted) {
  const noExecution = !executionStarted && callFailureProvesNoExecution(error);
  if (noExecution &&
      error?.classification === CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE) {
    return DIRECT_CALL_RECORD_STATUS.RETRYABLE_FAILED;
  }
  if (noExecution ||
      error?.code === CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED ||
      error?.code === CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT ||
      error?.code === CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED) {
    return DIRECT_CALL_RECORD_STATUS.FAILED;
  }
  return DIRECT_CALL_RECORD_STATUS.UNCERTAIN;
}

class DirectCallReplayCoordinator {
  constructor(options = {}) {
    this._reduceCoordinator = options.reduceCoordinator;
    this._nowProvider = options.nowProvider || (() => Date.now());
    this._retentionWindowMs =
      Number.isSafeInteger(options.retentionWindowMs) &&
      options.retentionWindowMs > 0 ?
        options.retentionWindowMs :
        DEFAULT_DIRECT_CALL_RETENTION_WINDOW_MS;
    this._fallbackRecords = new Map();
    this._inFlight = new Map();
  }

  clearInFlightOnRestartSimulation() {
    this._inFlight.clear();
  }

  async _readMeta(scopedInvocationId) {
    if (typeof this._reduceCoordinator?.readResultRow === 'function') {
      const row = await this._reduceCoordinator.readResultRow(
        scopedInvocationId);
      const fromRow = extractWitnessMeta(row);
      if (fromRow.found) {
        return {
          meta: fromRow.meta,
          resultJson: row.result_json || EMPTY_STRING,
        };
      }
    }
    return this._fallbackRecords.get(scopedInvocationId) || null;
  }

  async _writeMeta(scopedInvocationId, meta, resultJson = EMPTY_STRING, witness = null) {
    const mergedWitness = witness ?
      {...witness, admissionMeta: meta} :
      {admissionMeta: meta};
    this._fallbackRecords.set(scopedInvocationId, {meta, resultJson});
    if (typeof this._reduceCoordinator?.updateResultWitness === 'function') {
      await this._reduceCoordinator.updateResultWitness(
        scopedInvocationId,
        mergedWitness,
      );
    }
    return mergedWitness;
  }

  buildIntent(request) {
    const rawKey = request.invocationKey ?? request.idempotencyKey;
    if (rawKey === undefined || rawKey === null) {
      return null;
    }
    const tenantId = String(request.securityContext?.tenantId ?? EMPTY_STRING);
    const principal = String(request.securityContext?.principal ?? EMPTY_STRING);
    const scopedInvocationId = createScopedDirectCallInvocationId({
      invocationKey: rawKey,
      principal,
      tenantId,
    });
    return Object.freeze({
      argumentsDigest: computeCanonicalArgumentsDigest(request.argumentsJson),
      callerServiceId: request.callerServiceId ?? null,
      explicitBindingVersionId: request.explicitBindingVersionId,
      explicitGeneration: request.explicitGeneration,
      invocationKey: rawKey,
      name: request.name,
      principal,
      scopedInvocationId,
      tenantId,
    });
  }

  async inspectExisting(intent) {
    const nowMs = Number(this._nowProvider());
    const inFlightEntry = this._inFlight.get(intent.scopedInvocationId);
    if (inFlightEntry) {
      assertIntentMatchesMeta(inFlightEntry.meta, intent);
      return {
        action: DIRECT_CALL_INSPECT_ACTION.AWAIT_IN_FLIGHT,
        meta: inFlightEntry.meta,
        promise: inFlightEntry.promise,
      };
    }
    const existing = await this._readMeta(intent.scopedInvocationId);
    if (!existing) {
      return {action: DIRECT_CALL_INSPECT_ACTION.ADMIT_FRESH, meta: null};
    }
    const {meta, resultJson} = existing;
    assertRecordNotExpired(meta, nowMs, this._retentionWindowMs);
    assertIntentMatchesMeta(meta, intent);
    if (meta.status === DIRECT_CALL_RECORD_STATUS.COMPLETED) {
      return {
        action: DIRECT_CALL_INSPECT_ACTION.REPLAY_COMPLETED,
        meta,
        resultJson,
      };
    }
    if (meta.status === DIRECT_CALL_RECORD_STATUS.FAILED) {
      throw reconstructTerminalFailure(meta);
    }
    if (meta.status === DIRECT_CALL_RECORD_STATUS.RETRYABLE_FAILED) {
      return {action: DIRECT_CALL_INSPECT_ACTION.RETRY_PINNED, meta};
    }
    throw createAmbiguousReplayFailure();
  }

  createAdmissionMeta(intent, resolution, existingMeta) {
    const nowMs = Number(this._nowProvider());
    return Object.freeze({
      argumentsDigest: intent.argumentsDigest,
      callerServiceId: intent.callerServiceId,
      invocationKey: intent.invocationKey,
      name: intent.name,
      pinnedBindingVersionId:
        existingMeta?.pinnedBindingVersionId ?? resolution.bindingVersionId,
      pinnedGeneration:
        existingMeta?.pinnedGeneration ??
        resolution.generation ??
        DEFAULT_GENERATION,
      principal: intent.principal,
      recordedAtMs: existingMeta?.recordedAtMs ?? nowMs,
      status: DIRECT_CALL_RECORD_STATUS.PENDING,
      tenantId: intent.tenantId,
    });
  }

  registerInFlight(scopedInvocationId, meta, promise) {
    this._fallbackRecords.set(scopedInvocationId, {
      meta,
      resultJson: EMPTY_STRING,
    });
    this._inFlight.set(scopedInvocationId, {meta, promise});
  }

  clearInFlight(scopedInvocationId) {
    this._inFlight.delete(scopedInvocationId);
  }

  async recordCompleted(scopedInvocationId, meta, resultJson, witness) {
    const completedMeta = Object.freeze({
      ...meta,
      status: DIRECT_CALL_RECORD_STATUS.COMPLETED,
    });
    this._fallbackRecords.set(scopedInvocationId, {
      meta: completedMeta,
      resultJson,
    });
    return Object.freeze({
      ...(witness || {}),
      admissionMeta: completedMeta,
    });
  }

  async recordFailure(scopedInvocationId, meta, error, executionStarted) {
    const status = classifyFailureRecordStatus(error, executionStarted);
    const updatedMeta = Object.freeze({
      ...meta,
      errorPayload: Object.freeze({
        classification:
          error?.classification || CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL,
        code: error?.code || CALL_CELL_ROUTE_ERROR_CODE.HANDLER_FAILED,
        invoked: Boolean(error?.invoked || executionStarted),
        message: String(error?.message || EMPTY_MESSAGE_FALLBACK),
      }),
      status,
    });
    await this._writeMeta(scopedInvocationId, updatedMeta, EMPTY_STRING, null);
  }
}

function annotateUnkeyedUncertainFailure(error, hasInvocationKey, executionStarted) {
  if (!hasInvocationKey &&
      (executionStarted || !callFailureProvesNoExecution(error)) &&
      error && typeof error === 'object') {
    error.unkeyedWarning = DIRECT_CALL_REPLAY_MESSAGE.UNKEYED_UNCERTAIN_WARNING;
  }
  return error;
}

function resolveKeyedDirectCallRoute(
  routeResolver,
  request,
  existingMeta,
  resolveProbePrefix,
) {
  const pinnedVersionId =
    existingMeta?.pinnedBindingVersionId ?? request.explicitBindingVersionId;
  const resolution = routeResolver.resolve({
    ...(pinnedVersionId !== undefined ?
      {bindingVersionId: pinnedVersionId} :
      {}),
    callerServiceId: request.callerServiceId,
    invocationId: `${resolveProbePrefix}${request.name}`,
    name: request.name,
    securityContext: request.securityContext,
  });
  if (request.explicitGeneration !== undefined &&
      resolution.generation !== undefined &&
      request.explicitGeneration !== resolution.generation) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
      DIRECT_CALL_REPLAY_MESSAGE.CONFLICT,
    );
  }
  return resolution;
}

async function executeWithDirectCallReplay({
  executionEvidence,
  replayCoordinator,
  request,
  resolveProbePrefix,
  routeResolver,
  runCore,
}) {
  const directIntent = replayCoordinator.buildIntent(request);
  if (directIntent === null) {
    try {
      return await runCore(request);
    } catch (error) {
      throw annotateUnkeyedUncertainFailure(
        error,
        false,
        executionEvidence.started,
      );
    }
  }
  const existing = await replayCoordinator.inspectExisting(directIntent);
  if (existing.action === DIRECT_CALL_INSPECT_ACTION.AWAIT_IN_FLIGHT) {
    return existing.promise;
  }
  if (existing.action === DIRECT_CALL_INSPECT_ACTION.REPLAY_COMPLETED) {
    return existing.resultJson;
  }
  const resolution = resolveKeyedDirectCallRoute(
    routeResolver,
    request,
    existing.meta,
    resolveProbePrefix,
  );
  const admissionMeta = replayCoordinator.createAdmissionMeta(
    directIntent,
    resolution,
    existing.meta,
  );
  const execPromise = runCore({
    ...request,
    _admissionMeta: admissionMeta,
    _preResolvedRoute: resolution,
    _skipSeedIfRetry: Boolean(existing.meta),
    invocationId: directIntent.scopedInvocationId,
  });
  replayCoordinator.registerInFlight(
    directIntent.scopedInvocationId,
    admissionMeta,
    execPromise,
  );
  try {
    return await execPromise;
  } catch (error) {
    await replayCoordinator.recordFailure(
      directIntent.scopedInvocationId,
      admissionMeta,
      error,
      executionEvidence.started,
    );
    throw error;
  } finally {
    replayCoordinator.clearInFlight(directIntent.scopedInvocationId);
  }
}

export {
  DirectCallReplayCoordinator,
  executeWithDirectCallReplay,
};
