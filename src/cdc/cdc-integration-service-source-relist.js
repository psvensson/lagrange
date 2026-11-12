// The re-list of one CDC-propagated source table into this node's cache (CDC
// Stage 3): the one path that sets a source position from a list. The source
// partition's leader serves a paged hydration image - every page read from
// one snapshot, naming the same applied index P and ledger incarnation
// (partition-hydration-image-pages.js) - and this owner fetches it page by
// page, staging the rows off the cache, and installs it only when its last
// page arrived: rows swapped and position recorded in one synchronous span
// (system-table-cache-source-image.js). Until then the cache keeps its old
// rows and the cell stays gapped. A page that is refused, not from the
// leader, or from another image (imageId, P or incarnation changed) discards
// the stage, and the image restarts from page 0 after this owner's backoff
// (or the leader's hint); so does an install the cell refuses because it was
// reset or moved to another incarnation meanwhile. One table, any size, one
// path: a small table is a one-page image.
//
// Bounds. The page asked for is at most RELIST_PAGE_MAX_ROWS rows and
// RELIST_PAGE_MAX_BYTES bytes (the leader serves at most its own bound, and a
// single larger row alone). One page in flight per image: the next page is
// asked only after the previous one is staged. At most RELIST_IMAGES_MAX
// images are fetched at once per service (= per node cache); a further list
// waits for a slot, it is never refused. The stage holds one copy of the
// table being listed (the cache holds the same rows after the swap), so the
// peak is the cache plus RELIST_IMAGES_MAX staged tables.
import {SOURCE_IMAGE_ADMISSION, SOURCE_POSITION_STATE, SOURCE_RELIST_OUTCOME,
  SourceRelistPacingFault, SystemTableCacheSourceOrder} from '../cache/system-table-cache-source-order.js';
import {installSourceImage} from '../cache/system-table-cache-source-image.js';
import {isUsableSystemCacheKey, resolveSystemCacheRowKey} from
  '../cache/system-cache-key-descriptor.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {getControlPlaneRetryAfterMs} from
  '../control-plane/control-plane-error-classification.js';
import {canonicalizeSystemTableRow} from '../control-plane/system-row-normalizers.js';
import {PARTITION_HYDRATION_IMAGE_PAGE_FIELD, PARTITION_HYDRATION_IMAGE_QUERY_FIELD} from
  '../partition/partition-service-hydration-image-methods.js';
import {QUERY_MESSAGE_TYPE} from '../query/query-constants.js';
import {QUERY_RESULT_REQUEST_FIELD} from '../query/query-result-budget.js';
import {NUM} from '../constants/numbers.js';
import {TIME_MS} from '../constants/time.js';
import {CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {issueAuthoritativeReadStage} from './cdc-terminal-gate.js';

const SOURCE_RELIST_BOUND = Object.freeze({
  // The page this recipient asks for (its staging step).
  RELIST_PAGE_MAX_ROWS: NUM.FOUR * NUM.BYTES_PER_KIB,
  RELIST_PAGE_MAX_BYTES: NUM.BYTES_PER_MIB,
  // Images fetched at once per node cache.
  RELIST_IMAGES_MAX: NUM.TWO,
  RELIST_RETRY_DELAY_MS: TIME_MS.HALF_SECOND,
});

// Why a page could not be staged (or why an image was discarded).
const SOURCE_RELIST_FAILURE = Object.freeze({
  NO_QUERY_EXECUTOR: 'source_relist_no_query_executor',
  NOT_LEADER_WITNESSED: 'source_relist_not_leader_witnessed',
  NO_SOURCE_IMAGE: 'source_relist_no_source_image',
  // A page of another image than page 0's (imageId, P or incarnation).
  IMAGE_CHANGED: 'source_relist_image_changed',
  INVALID_ROWS: 'source_relist_invalid_rows',
  READ_FAILED: 'source_relist_read_failed',
  // The install found the cell reset or in another incarnation.
  CELL_CHANGED: 'source_relist_cell_changed',
});

const SOURCE_RELIST_LOG_MSG = Object.freeze({
  IMAGE: 'CDC source table image listed from its leader',
  PAGE_FAILED: 'CDC source image page failed; the image restarts from page 0',
});

const SOURCE_IMAGE_SLOT_STATE = Object.freeze({ACQUIRED: 'acquired', STOPPED: 'stopped'});
const SOURCE_IMAGE_ATTEMPT_OUTCOME = Object.freeze({RESTART: 'restart'});

const RELIST_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});

function pageRequest(sql, cursor) {
  return () => ({type: QUERY_MESSAGE_TYPE.QUERY, sql, params: [],
    [PARTITION_HYDRATION_IMAGE_QUERY_FIELD]: true,
    [PARTITION_HYDRATION_IMAGE_PAGE_FIELD]: {imageId: cursor.imageId, page: cursor.page},
    [QUERY_RESULT_REQUEST_FIELD.MAX_ROWS]: SOURCE_RELIST_BOUND.RELIST_PAGE_MAX_ROWS,
    [QUERY_RESULT_REQUEST_FIELD.MAX_BYTES]: SOURCE_RELIST_BOUND.RELIST_PAGE_MAX_BYTES});
}

function pageResult(partitionId) {
  return (response) => ({partitionId, success: true, rows: response.rows,
    readAuthorityWitness: response.readAuthorityWitness, sourceImage: response.sourceImage,
    imagePage: response.imagePage});
}

// Read one page through the owner-RPC query path, at the source's leader.
// The executor answers ordinary failures typed. An unexpected throw remains
// a defect diagnostic and returns to this same owner's paced image retry.
async function readImagePage(service, request, cursor) {
  const queryExecutor = service.sqlQueryEngine?.queryExecutor ?? null;
  if (queryExecutor === null) {
    return {success: false, errorCode: SOURCE_RELIST_FAILURE.NO_QUERY_EXECUTOR};
  }
  const sql = `SELECT * FROM ${request.tableName}`;
  return issueAuthoritativeReadStage(service, CDC_TERMINAL_STAGE.OWNER_RPC_READ,
    () => queryExecutor.executeOnPartition(request.sourcePartition, sql, [], true, true, false, {
      readAuthority: RELIST_READ_AUTHORITY,
      buildRequest: pageRequest(sql, cursor),
      buildSuccessResult: pageResult(request.sourcePartition),
    }));
}

function isImagePage(page, cursor) {
  return page !== null && typeof page === 'object' && typeof page.imageId === 'string' &&
    page.imageId.length > 0 && page.page === cursor.page && typeof page.last === 'boolean' &&
    Number.isSafeInteger(page.byteCount) && page.byteCount >= 0;
}

// A failed read restarts under its own code (an image expired, a leader
// changed); a failure the reader typed with no code is READ_FAILED.
function readFailureReason(result) {
  return typeof result?.errorCode === 'string' ?
    result.errorCode : SOURCE_RELIST_FAILURE.READ_FAILED;
}

// Source image and page shape are checked before captured-image continuity.
function isInvalidSourceImagePage(image, result, request, cursor) {
  return image?.sourcePartition !== request.sourcePartition ||
    !Number.isSafeInteger(image.appliedIndex) || image.appliedIndex < 0 ||
    !(image.incarnation === null ||
      (typeof image.incarnation === 'string' && image.incarnation.length > 0)) ||
    !isImagePage(result.imagePage, cursor);
}

// Why a page cannot be staged, or null. Every page must name page 0's image:
// the same imageId, applied index and incarnation.
function pageFailure(result, request, cursor, first) {
  if (result?.success !== true) return readFailureReason(result);
  if (!isValidLeaderReadAuthorityWitness(result.readAuthorityWitness, request.sourcePartition)) {
    return SOURCE_RELIST_FAILURE.NOT_LEADER_WITNESSED;
  }
  const image = result.sourceImage;
  if (isInvalidSourceImagePage(image, result, request, cursor)) {
    return SOURCE_RELIST_FAILURE.NO_SOURCE_IMAGE;
  }
  if (first !== null && (result.imagePage.imageId !== first.imageId ||
      image.appliedIndex !== first.appliedIndex || image.incarnation !== first.incarnation)) {
    return SOURCE_RELIST_FAILURE.IMAGE_CHANGED;
  }
  return Array.isArray(result.rows) ? null : SOURCE_RELIST_FAILURE.INVALID_ROWS;
}

// Stage one page's rows: canonical, one per key across the whole image.
function stagePage(stage, tableName, rows) {
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const canonical = canonicalizeSystemTableRow(tableName, row);
    const key = resolveSystemCacheRowKey(tableName, canonical);
    if (!isUsableSystemCacheKey(key) || stage.has(key)) return false;
    stage.set(key, canonical);
  }
  return true;
}

function sourceImagePageFailureOutcome(result, failure) {
  return {failure, error: result?.error ?? null,
    retryAfterMs: getControlPlaneRetryAfterMs(result)};
}

/**
 * Fetch one complete image, page by page: the next page is asked only once
 * the previous one is staged. A failed page discards the whole stage.
 * @param {Function} readPage - async (cursor {imageId, page}) => the page's
 *   answer (the hydration-image query answer, or a typed failure).
 * @param {Object} request - {sourcePartition, tableName}.
 * @param {Function} stopped - () => whether this fetch must stop (terminal
 *   lifecycle or an obsolete logical request).
 * @return {Promise<Object>} {image: {sourcePartition, tableName,
 *   incarnation, appliedIndex, rows, pages, bytes}} | {failure,
 *   retryAfterMs} | {stopped: true}.
 */
async function fetchSourceImage(readPage, request, stopped = () => false) {
  const stage = new Map();
  let first = null;
  let bytes = 0;
  for (let page = 0; ; page += 1) {
    if (stopped()) return {stopped: true};
    const cursor = {imageId: first?.imageId ?? null, page};
    const result = await readPage(cursor);
    if (stopped()) return {stopped: true};
    let failure = pageFailure(result, request, cursor, first);
    if (failure === null && !stagePage(stage, request.tableName, result.rows)) {
      failure = SOURCE_RELIST_FAILURE.INVALID_ROWS;
    }
    if (failure !== null) {
      return sourceImagePageFailureOutcome(result, failure);
    }
    first ??= {imageId: result.imagePage.imageId, appliedIndex: result.sourceImage.appliedIndex,
      incarnation: result.sourceImage.incarnation};
    bytes += result.imagePage.byteCount;
    if (result.imagePage.last) {
      return {image: {sourcePartition: request.sourcePartition, tableName: request.tableName,
        incarnation: first.incarnation, appliedIndex: first.appliedIndex,
        rows: [...stage.values()], pages: page + 1, bytes,
        witness: result.readAuthorityWitness}};
    }
  }
}

// The per-service image slots: a list beyond RELIST_IMAGES_MAX waits, in
// order, for a slot to be released (an event, no timer).
function releaseImageSlot(slots) {
  const next = slots.waiting.shift();
  if (next) next.grant();
  else slots.held -= 1;
}

function heldImageSlot(slots) {
  let owned = true;
  return {state: SOURCE_IMAGE_SLOT_STATE.ACQUIRED, release() {
    if (!owned) return;
    owned = false;
    releaseImageSlot(slots);
  }};
}

function queueImageSlot(service, slots) {
  return new Promise((resolve, reject) => {
    let stopHolding;
    const waiter = {grant() {
      try {
        stopHolding();
        resolve(heldImageSlot(slots));
      } catch (error) {
        reject(error);
        releaseImageSlot(slots);
      }
    }};
    const remove = () => {
      const index = slots.waiting.indexOf(waiter);
      if (index < 0) return false;
      slots.waiting.splice(index, 1);
      return true;
    };
    slots.waiting.push(waiter);
    try {
      stopHolding = service.holdUntilShutdown(() => {
        // A grant may already have disposed the hold, even if shutdown's
        // release snapshot had captured it. Cancellation owns no slot then.
        if (remove()) resolve({state: SOURCE_IMAGE_SLOT_STATE.STOPPED});
      });
    } catch (error) {
      remove();
      reject(error);
    }
  });
}

function acquireImageSlot(service) {
  service.relistImageSlots ??= {held: 0, waiting: []};
  const slots = service.relistImageSlots;
  if (service.isShuttingDown === true) {
    return Promise.resolve({state: SOURCE_IMAGE_SLOT_STATE.STOPPED});
  }
  if (slots.held < SOURCE_RELIST_BOUND.RELIST_IMAGES_MAX) {
    slots.held += 1;
    return Promise.resolve(heldImageSlot(slots));
  }
  return queueImageSlot(service, slots);
}

function countRestart(record, reason, error = null) {
  record.restarts += 1;
  record.restartReasons[reason] = (record.restartReasons[reason] ?? 0) + 1;
  record.lastFailure = {reason, error};
}

// The logger can call its persistence sink synchronously. A diagnostic is
// an observer of this attempt, never custody of the owed image or its pace.
// Keep its failure in the same bounded attempt record; do not switch sinks.
function emitImageDiagnostic(record, emit) {
  try {
    emit();
  } catch (error) {
    record.diagnosticFailures += 1;
    record.lastDiagnosticError = error;
  }
}

// The one line per image: table, pages, rows, bytes, duration, restarts.
function logImage(service, record, outcome, extra = {}) {
  emitImageDiagnostic(record, () => service.logger?.info?.(SOURCE_RELIST_LOG_MSG.IMAGE, {
    tableName: record.tableName, sourcePartition: record.sourcePartition, outcome,
    pages: record.pages, rows: record.rows, bytes: record.bytes,
    durationMs: service.timeSource.now() - record.startedAtMs, restarts: record.restarts,
    restartReasons: record.restartReasons, lastFailure: record.lastFailure,
    diagnosticFailures: record.diagnosticFailures,
    lastDiagnosticError: record.lastDiagnosticError, ...extra}));
}

// Rows and position, in one synchronous span, plus the table's authoritative
// watermark (term and applied index; no observation time: the position
// orders what follows the image, never a wall-clock fence).
function installFetchedImage(cache, token, image) {
  return installSourceImage(cache, token, image);
}

async function listImageAttempt(service, request, record, terminal) {
  const stopped = terminal();
  if (!request.isCurrent()) return {outcome: SOURCE_RELIST_OUTCOME.RETRY};
  if (stopped) return {outcome: SOURCE_RELIST_OUTCOME.STOPPED};
  const cache = service.cacheMutationTarget;
  const sourceOrder = cache.sourceOrder;
  const slot = await acquireImageSlot(service);
  if (slot.state === SOURCE_IMAGE_SLOT_STATE.STOPPED) return {outcome: SOURCE_RELIST_OUTCOME.STOPPED};
  try {
    const stoppedAfterAcquire = terminal();
    if (!request.isCurrent()) return {outcome: SOURCE_RELIST_OUTCOME.RETRY};
    if (stoppedAfterAcquire) return {outcome: SOURCE_RELIST_OUTCOME.STOPPED};
    // The cell may have closed its gap meanwhile (ranges applied): no list.
    const token = sourceOrder.beginImage(request.sourcePartition);
    if (token === null) return {outcome: SOURCE_RELIST_OUTCOME.RETRY};
    const fetched = await fetchSourceImage((cursor) => readImagePage(service, request, cursor),
      request, () => terminal() || !request.isCurrent());
    const stoppedAfterFetch = terminal();
    if (!request.isCurrent()) return {outcome: SOURCE_RELIST_OUTCOME.RETRY};
    if (fetched.stopped || stoppedAfterFetch) return {outcome: SOURCE_RELIST_OUTCOME.STOPPED};
    if (fetched.image) {
      const installed = installFetchedImage(cache, token, fetched.image);
      if (installed.admission !== SOURCE_IMAGE_ADMISSION.CELL_CHANGED) {
        Object.assign(record, {pages: fetched.image.pages, rows: fetched.image.rows.length,
          bytes: fetched.image.bytes});
        return {outcome: SOURCE_RELIST_OUTCOME.RETRY, installed};
      }
      countRestart(record, SOURCE_RELIST_FAILURE.CELL_CHANGED);
    } else {
      countRestart(record, fetched.failure, fetched.error);
      emitImageDiagnostic(record, () => service.logger?.debug?.(
        SOURCE_RELIST_LOG_MSG.PAGE_FAILED, {...request,
          failure: fetched.failure, error: fetched.error}));
    }
    return {outcome: SOURCE_IMAGE_ATTEMPT_OUTCOME.RESTART, retryAfterMs: fetched.retryAfterMs ?? 0};
  } finally {
    slot.release();
  }
}

async function paceImageRetry(service, cause, delayMs) {
  try {
    await service.delayUntilShutdown(delayMs);
  } catch (pacingCause) {
    throw new SourceRelistPacingFault(cause, pacingCause);
  }
}

async function listOneImage(service, request, record, terminal) {
  for (;;) {
    const attempt = await listImageAttempt(service, request, record, terminal);
    if (attempt.outcome !== SOURCE_IMAGE_ATTEMPT_OUTCOME.RESTART) return attempt;
    // A logical retry owns no physical image slot while it paces. Re-check
    // identity after diagnostic callbacks and before holding the old owner.
    if (!request.isCurrent()) return {outcome: SOURCE_RELIST_OUTCOME.RETRY};
    const hintMs = attempt.retryAfterMs;
    await paceImageRetry(service, record.lastFailure, hintMs > 0 ? hintMs :
      SOURCE_RELIST_BOUND.RELIST_RETRY_DELAY_MS);
  }
}

/**
 * List one source table again: fetch a complete paged image and install
 * rows and position together.
 * @param {Object} service - The CDC integration service.
 * @param {Object} request - {sourcePartition, tableName, isCurrent}, captured
 *   by the source-order owner for this exact registration and cell.
 * @return {Promise<string>} A SOURCE_RELIST_OUTCOME: RETRY (after this
 *   owner's backoff when the cell is still stale; another list is owed while
 *   it is) or STOPPED (the owner is terminal).
 */
async function relistSourceTable(service, request) {
  const terminal = () => Boolean(service.refuseIfTerminal(CDC_TERMINAL_STAGE.CACHE_REPAIR));
  const stopped = terminal();
  if (!request.isCurrent()) return SOURCE_RELIST_OUTCOME.RETRY;
  if (stopped) return SOURCE_RELIST_OUTCOME.STOPPED;
  const sourceOrder = service.cacheMutationTarget.sourceOrder;
  const record = {...request, startedAtMs: service.timeSource.now(), pages: 0, rows: 0,
    bytes: 0, restarts: 0, restartReasons: {}, lastFailure: null,
    diagnosticFailures: 0, lastDiagnosticError: null};
  let listed;
  try {
    listed = await listOneImage(service, request, record, terminal);
  } catch (error) {
    if (SourceRelistPacingFault.failureOf(error) !== null) throw error;
    countRestart(record, SOURCE_RELIST_FAILURE.READ_FAILED, error);
    emitImageDiagnostic(record, () => service.logger.error(SOURCE_RELIST_LOG_MSG.PAGE_FAILED,
      {...request, failure: SOURCE_RELIST_FAILURE.READ_FAILED, error: record.lastFailure.error}));
    listed = {outcome: SOURCE_RELIST_OUTCOME.RETRY, failure: record.lastFailure};
  }
  if (!request.isCurrent()) return SOURCE_RELIST_OUTCOME.RETRY;
  // The cell as it stands after the (synchronous) install, or after none.
  const cell = sourceOrder.positionOf(request.sourcePartition);
  // An installed image's outcome is its admission; else the list's own.
  const imageOutcome = listed.installed === undefined ? listed.outcome :
    listed.installed.admission;
  logImage(service, record, imageOutcome,
    {state: cell.state, appliedIndex: cell.position?.logIndex ?? null,
      upserted: listed.installed?.upserted ?? 0, deleted: listed.installed?.deleted ?? 0});
  if (listed.outcome === SOURCE_RELIST_OUTCOME.STOPPED) return listed.outcome;
  // Logging can itself reenter an authoritative mutation. Decide the pace
  // from the current cell after every observer, not the pre-log snapshot.
  if (!request.isCurrent() ||
      sourceOrder.positionOf(request.sourcePartition).state !==
      SOURCE_POSITION_STATE.GAP) return SOURCE_RELIST_OUTCOME.RETRY;
  await paceImageRetry(service, listed.failure ?? listed, SOURCE_RELIST_BOUND.RELIST_RETRY_DELAY_MS);
  return terminal() ? SOURCE_RELIST_OUTCOME.STOPPED : SOURCE_RELIST_OUTCOME.RETRY;
}

// The service lifecycle owns one registration. Clear its slot before release
// so a reentrant or repeated release cannot revoke a replacement registration.
function releaseSourceRelister(service) {
  const release = service.sourceRelisterRelease;
  service.sourceRelisterRelease = null;
  if (release !== null) release();
}

/**
 * Register this service as the relister of its writable cache: a GAP in
 * any source cell lists that table through relistSourceTable.
 * @param {Object} service - The CDC integration service.
 * @return {boolean} Whether this live service acquired a source-order registration.
 */
function registerSourceRelister(service) {
  releaseSourceRelister(service);
  if (service.isShuttingDown === true) return false;
  const sourceOrder = service.cacheMutationTarget?.sourceOrder;
  if (!(sourceOrder instanceof SystemTableCacheSourceOrder)) return false;
  service.sourceRelisterRelease = sourceOrder.registerRelister({
    list: (request) => relistSourceTable(service, request),
    isStopped: () => service.isShuttingDown === true,
    paceAfterFailure: () => service.delayUntilShutdown(SOURCE_RELIST_BOUND.RELIST_RETRY_DELAY_MS),
  }, service.logger);
  return true;
}

export {SOURCE_RELIST_BOUND, SOURCE_RELIST_FAILURE, fetchSourceImage, registerSourceRelister,
  releaseSourceRelister, relistSourceTable};
