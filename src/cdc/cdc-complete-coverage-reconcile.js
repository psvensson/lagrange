import {randomUUID} from 'node:crypto';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {AUTHORITATIVE_READ_SOURCE} from
  './cdc-integration-service-shared-constants.js';
import {CDC_COVERAGE_QUERY_FIELD, CDC_COVERAGE_REQUEST_MODE,
  CDC_COVERAGE_RESPONSE_STATE} from './cdc-coverage-protocol.js';
import {
  armCdcCoverageReconcile,
  CDC_COVERAGE_RECONCILE_REASON,
  clampCdcCoverageBackoff,
} from './cdc-coverage-reconcile-owner.js';
import {classifyTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../transport/transport-semantic-outcome.js';
import {
  acquireWitnessedCdcSourceScope,
  buildCdcCoverageReadAuthority,
} from './cdc-source-scope-reconciliation.js';
import {consumeCdcCoverageOffer} from
  './cdc-coverage-fragment-consumer.js';
import {consumerTransferReservationBytes} from
  '../partition/partition-cdc-coverage-transfer.js';
import {releaseCdcCoverageTransfer, reserveCdcCoverageTransfer,
  resizeCdcCoverageTransfer} from
  './cdc-coverage-transfer-owner.js';
import {RAFT_ROLE} from '../raft/constants.js';

const CDC_COMPLETE_COVERAGE_REASON = Object.freeze({
  CAPACITY_UNAVAILABLE: 'cdc_coverage_capacity_unavailable',
  INSTALL_REFUSED: 'cdc_coverage_install_refused',
  PAGE_INVALID: 'cdc_coverage_page_invalid',
  SOURCE_SCOPE_CHANGED: 'cdc_coverage_source_scope_changed',
  TARGET_INVALID: 'cdc_coverage_target_invalid',
});
const CDC_COVERAGE_PAGE_MAX_BYTES = 16 * 1024 * 1024;

function deferred(reasonCode, extra = {}) {
  return Object.freeze({success: false, deferRetry: true, reasonCode, ...extra});
}

function failed(reasonCode, extra = {}) {
  return Object.freeze({success: false, deferRetry: false, reasonCode, ...extra});
}

function coverageBinding(service, context) {
  return Object.freeze({requestId: randomUUID(), targetNodeId: service.nodeId,
    targetLifecycleId: context.lifecycle.lifecycleIncarnation,
    reconcileGenerationId: String(context.generationId),
    deadlineMs: context.deadlineMs});
}

function isCoverageHandlerResponse(response) {
  return response?.acknowledged === true &&
    response.noHandler !== true &&
    Object.values(CDC_COVERAGE_RESPONSE_STATE).includes(response.state) &&
    (response.state !== CDC_COVERAGE_RESPONSE_STATE.COMPLETE ||
      hasDenseCoverageRows(response.rows));
}

function preserveCoverageHandlerResponse(response) {
  return response.state === CDC_COVERAGE_RESPONSE_STATE.COMPLETE ?
    {...response, rows: response.rows} : {...response, rows: []};
}

function hasDenseCoverageRows(rows) {
  if (!Array.isArray(rows) || rows.length > 256) return false;
  for (let index = 0; index < rows.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(rows, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
  }
  return true;
}

function readOptions(context, scope, pageStart, binding, transfer = {}) {
  return {readAuthority: buildCdcCoverageReadAuthority(),
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    deliveryPriority: PRESSURE_WORK_CLASS.BACKGROUND,
    queryOptions: {timeoutMs: context.remainingMs(),
      isSuccessfulResponse: isCoverageHandlerResponse,
      buildSuccessResult: preserveCoverageHandlerResponse,
      [CDC_COVERAGE_QUERY_FIELD.COMPLETE]: true,
      [CDC_COVERAGE_QUERY_FIELD.EXPECTED_SCOPE_ID]: scope.scopeId,
      [CDC_COVERAGE_QUERY_FIELD.REQUEST_ID]: binding.requestId,
      [CDC_COVERAGE_QUERY_FIELD.TARGET_NODE_ID]: binding.targetNodeId,
      [CDC_COVERAGE_QUERY_FIELD.TARGET_LIFECYCLE_ID]:
        binding.targetLifecycleId,
      [CDC_COVERAGE_QUERY_FIELD.RECONCILE_GENERATION_ID]:
        binding.reconcileGenerationId,
      [CDC_COVERAGE_QUERY_FIELD.DEADLINE_MS]: binding.deadlineMs,
      [CDC_COVERAGE_QUERY_FIELD.MODE]:
        transfer.mode ?? CDC_COVERAGE_REQUEST_MODE.PAGE,
      ...(pageStart === null ? {} :
        {[CDC_COVERAGE_QUERY_FIELD.PAGE_START]: pageStart}),
      ...(transfer.transferId ? {
        [CDC_COVERAGE_QUERY_FIELD.TRANSFER_ID]: transfer.transferId,
      } : {}),
      ...(Number.isSafeInteger(transfer.chunkOrdinal) ? {
        [CDC_COVERAGE_QUERY_FIELD.CHUNK_ORDINAL]: transfer.chunkOrdinal,
      } : {})}};
}

function exactCompletePage(page, request, scope, binding, pageStart) {
  return page?.success === true &&
    page.state === CDC_COVERAGE_RESPONSE_STATE.COMPLETE &&
    page.source === AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE &&
    page.sourceScope?.scopeId === scope.scopeId &&
    page.sourcePrefix?.partitionId === request.partitionId &&
    page.requestId === binding.requestId &&
    page.targetNodeId === binding.targetNodeId &&
    page.targetLifecycleId === binding.targetLifecycleId &&
    page.reconcileGenerationId === binding.reconcileGenerationId &&
    page.deadlineMs === binding.deadlineMs &&
    page.logicalCoverage?.lower === pageStart &&
    page.logicalCoverage?.upper === page.nextPageStart &&
    hasDenseCoverageRows(page.rows) &&
    typeof page.sourceLifecycle?.lifecycleIncarnation === 'string' &&
    page.sourceLifecycle.lifecycleIncarnation.length > 0 &&
    page.sourceLifecycle.role === RAFT_ROLE.LEADER &&
    isValidLeaderReadAuthorityWitness(page.readAuthorityWitness,
      request.partitionId);
}

function exactCoverageOffer(page, request, scope, binding) {
  return page?.success === true &&
    page.state === CDC_COVERAGE_RESPONSE_STATE.OFFER &&
    page.source === AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE &&
    page.sourceScope?.scopeId === scope.scopeId &&
    page.sourcePrefix?.partitionId === request.partitionId &&
    page.requestId === binding.requestId &&
    page.targetNodeId === binding.targetNodeId &&
    page.targetLifecycleId === binding.targetLifecycleId &&
    page.reconcileGenerationId === binding.reconcileGenerationId &&
    page.deadlineMs === binding.deadlineMs &&
    isValidLeaderReadAuthorityWitness(page.readAuthorityWitness,
      request.partitionId);
}

function exactResponseBinding(page, binding) {
  return page?.requestId === binding.requestId &&
    page.targetNodeId === binding.targetNodeId &&
    page.targetLifecycleId === binding.targetLifecycleId &&
    page.reconcileGenerationId === binding.reconcileGenerationId &&
    page.deadlineMs === binding.deadlineMs;
}

const RETRYABLE_TRANSPORT_REASONS = new Set([
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_CONNECTION,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.OUTBOUND_QUEUE_BACKPRESSURED,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.QUERY_TRANSPORT_NOT_READY,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.TRANSPORT_DEFERRED,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.WEBSOCKET_CONNECT_TIMEOUT,
]);

function normalizeCoveragePageFailure(page, remaining) {
  const classified = classifyTransportDeliveryOutcome(page);
  if (RETRYABLE_TRANSPORT_REASONS.has(classified.reasonCode)) {
    const retryAfterMs = clampCdcCoverageBackoff(
      remaining, classified.retryAfterMs);
    return deferred(classified.reasonCode,
      retryAfterMs === null ? {} : {retryAfterMs});
  }
  if (page?.deferRetry === true) {
    return deferred(page.reasonCode ?? page.reason ?? page.error ??
      CDC_COMPLETE_COVERAGE_REASON.PAGE_INVALID,
    {retryAfterMs: page.retryAfterMs});
  }
  return failed(page?.reasonCode ?? page?.reason ?? page?.error ??
    CDC_COMPLETE_COVERAGE_REASON.PAGE_INVALID);
}

function installPage(context, target, page) {
  if (!context.isCurrent()) {
    return deferred(CDC_COVERAGE_RECONCILE_REASON.LIFECYCLE_STALE);
  }
  const installed = target.installCompleteCdcCoverage(page, {
    // The cache owner invokes this synchronously after throwable staging and
    // immediately before its visibility swap. An overdue timer is not fresh
    // permission to publish after the operation's absolute deadline.
    canPublish: () => context.isCurrent() && context.remainingMs() > 0,
  });
  if (installed?.installed === true) return installed;
  return installed?.deferRetry === true ?
    deferred(installed.reason ?? CDC_COMPLETE_COVERAGE_REASON.INSTALL_REFUSED,
      {retryAfterMs: installed.retryAfterMs}) :
    failed(installed?.reason ?? CDC_COMPLETE_COVERAGE_REASON.INSTALL_REFUSED);
}

async function cancelCoverageTransfer(service, request, context, scope,
  pageStart, binding, transferId) {
  if (typeof transferId !== 'string' || transferId.length === 0 ||
      !context.isCurrent() || context.remainingMs() <= 0) return;
  await service.executeAuthoritativeSystemTableRead(
    request.tableName, `SELECT * FROM ${request.tableName}`, [],
    readOptions(context, scope, pageStart, binding, {
      mode: CDC_COVERAGE_REQUEST_MODE.CANCEL,
      transferId,
    }));
}

async function acquireScope(service, request, context) {
  return acquireWitnessedCdcSourceScope(service, {
    tableId: request.tableId,
    tableName: request.tableName,
    partitionId: request.partitionId,
    deadlineMs: context.deadlineMs,
    lifecycle: context.lifecycle,
  });
}

async function readAndInstallPage(service, request, context, target, scope,
  pageStart) {
  const binding = coverageBinding(service, context);
  const consumerTransferId = `page-consumer:${binding.requestId}`;
  const publicationBytes =
    target.estimateCdcCoverageInstallRetainedBytes?.();
  if (!Number.isSafeInteger(publicationBytes) || publicationBytes < 0) {
    return {result: deferred(
      CDC_COMPLETE_COVERAGE_REASON.CAPACITY_UNAVAILABLE)};
  }
  const retainedBytes = consumerTransferReservationBytes(
    CDC_COVERAGE_PAGE_MAX_BYTES, publicationBytes);
  const consumerSession = reserveCdcCoverageTransfer(service, {
    transferId: consumerTransferId, retainedBytes,
    category: 'consumer-page', ttlMs: Math.max(1, context.remainingMs()),
    value: Object.freeze({binding, sourceScope: scope, pageStart}),
  });
  if (consumerSession === null) {
    return {result: deferred(
      CDC_COMPLETE_COVERAGE_REASON.CAPACITY_UNAVAILABLE)};
  }
  let page;
  let releaseConsumed = null;
  let resizeConsumed = null;
  let chunks = 0;
  try {
    page = await service.executeAuthoritativeSystemTableRead(
      request.tableName, `SELECT * FROM ${request.tableName}`, [],
      readOptions(context, scope, pageStart, binding));
  } catch (error) {
    releaseCdcCoverageTransfer(service, consumerTransferId);
    return {result: normalizeCoveragePageFailure({success: false,
      error: error?.code || error?.message || String(error)},
    context.remainingMs())};
  }
  if (!context.isCurrent()) {
    releaseCdcCoverageTransfer(service, consumerTransferId);
    return {result: deferred(CDC_COVERAGE_RECONCILE_REASON.LIFECYCLE_STALE)};
  }
  let completePage = page;
  if (exactCoverageOffer(page, request, scope, binding)) {
    releaseCdcCoverageTransfer(service, consumerTransferId);
    const consumed = await consumeCdcCoverageOffer(service, {
      binding, context, offer: page, pageStart, scope, publicationBytes,
      readChunk: async (chunkOrdinal) => {
        const result = await service.executeAuthoritativeSystemTableRead(
          request.tableName, `SELECT * FROM ${request.tableName}`, [],
          readOptions(context, scope, pageStart, binding, {
            mode: CDC_COVERAGE_REQUEST_MODE.CHUNK,
            transferId: page.transferId,
            chunkOrdinal,
          }));
        if (result?.success === true) return result;
        return normalizeCoveragePageFailure(result, context.remainingMs());
      },
    });
    if (consumed.success !== true) {
      await cancelCoverageTransfer(service, request, context, scope,
        pageStart, binding, page.transferId);
      return {result: consumed};
    }
    releaseConsumed = consumed.release;
    resizeConsumed = consumed.resize;
    chunks = page.chunkCount;
    completePage = {...consumed.page,
      source: page.source,
      readAuthorityWitness: page.readAuthorityWitness};
  }
  if (!exactCompletePage(completePage, request, scope, binding, pageStart)) {
    releaseConsumed?.();
    releaseCdcCoverageTransfer(service, consumerTransferId);
    if (exactResponseBinding(completePage, binding)) {
      await cancelCoverageTransfer(service, request, context, scope,
        pageStart, binding, completePage?.transferId);
    }
    return {result: normalizeCoveragePageFailure(page, context.remainingMs())};
  }
  const currentPublicationBytes =
    target.estimateCdcCoverageInstallRetainedBytes?.();
  if (!Number.isSafeInteger(currentPublicationBytes) ||
      currentPublicationBytes < 0) {
    releaseConsumed?.();
    releaseCdcCoverageTransfer(service, consumerTransferId);
    await cancelCoverageTransfer(service, request, context, scope,
      pageStart, binding, completePage.transferId);
    return {result: deferred(
      CDC_COMPLETE_COVERAGE_REASON.CAPACITY_UNAVAILABLE)};
  }
  const resized = resizeConsumed ? resizeConsumed(currentPublicationBytes) :
    resizeCdcCoverageTransfer(service, consumerTransferId, consumerSession,
      consumerTransferReservationBytes(
        CDC_COVERAGE_PAGE_MAX_BYTES, currentPublicationBytes));
  if (!resized) {
    releaseConsumed?.();
    releaseCdcCoverageTransfer(service, consumerTransferId);
    await cancelCoverageTransfer(service, request, context, scope,
      pageStart, binding, completePage.transferId);
    return {result: deferred(
      CDC_COMPLETE_COVERAGE_REASON.CAPACITY_UNAVAILABLE)};
  }
  let installed;
  try {
    installed = installPage(context, target, completePage);
  } finally {
    releaseConsumed?.();
    releaseCdcCoverageTransfer(service, consumerTransferId);
    await cancelCoverageTransfer(service, request, context, scope,
      pageStart, binding, completePage.transferId);
  }
  if (installed.installed !== true) return {result: installed};
  if (completePage.nextPageStart === null) {
    return {complete: true, changes: installed.changes, chunks};
  }
  if (typeof completePage.nextPageStart !== 'string' ||
      completePage.nextPageStart === pageStart) {
    return {result: failed(CDC_COMPLETE_COVERAGE_REASON.PAGE_INVALID)};
  }
  return {complete: false, changes: installed.changes,
    chunks, pageStart: completePage.nextPageStart};
}

async function executeCompleteCoverage(service, request, context) {
  const target = context.lifecycle.cacheMutationTarget;
  if (typeof target?.installCompleteCdcCoverage !== 'function') {
    return failed(CDC_COMPLETE_COVERAGE_REASON.TARGET_INVALID);
  }
  const acquired = await acquireScope(service, request, context);
  if (acquired.success !== true) return acquired;
  if (!context.isCurrent()) {
    return deferred(CDC_COVERAGE_RECONCILE_REASON.LIFECYCLE_STALE);
  }
  const scope = acquired.sourceScope;
  let pageStart = null;
  let pages = 0;
  let chunks = 0;
  let changes = 0;
  while (context.isCurrent() && context.remainingMs() > 0) {
    const step = await readAndInstallPage(
      service, request, context, target, scope, pageStart);
    if (step.result) return Object.freeze({...step.result, pages, chunks});
    pages += 1;
    chunks += step.chunks;
    changes += step.changes;
    if (step.complete) {
      return Object.freeze({success: true, pages, chunks, changes,
        sourceScope: scope, observationId: acquired.observationId});
    }
    pageStart = step.pageStart;
  }
  return deferred(CDC_COVERAGE_RECONCILE_REASON.DEADLINE);
}

function reconcileCompleteCdcCoverage(service, request = {}) {
  const operationRequest = Object.freeze({
    partitionId: request.partitionId,
    tableId: request.tableId,
    tableName: request.tableName,
  });
  return armCdcCoverageReconcile(service, request,
    (context) => executeCompleteCoverage(service, operationRequest, context));
}

export {
  CDC_COMPLETE_COVERAGE_REASON,
  normalizeCoveragePageFailure,
  reconcileCompleteCdcCoverage,
};
