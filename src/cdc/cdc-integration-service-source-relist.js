// The re-list of one CDC-propagated source table into this node's cache (CDC
// Stage 3): the one path that sets a source position from a list. The
// partition leader answers its hydration image - the rows of the table and
// the applied index P (with the ledger incarnation) they are current as of,
// read in one synchronous span (partition-service-hydration-image-methods.js)
// - and this owner installs the rows (the canonical merge-safe repair and the
// leader-witnessed sweep) and the position in one synchronous span, so no
// event can interleave between them. Only a read whose witness names the
// serving replica as the partition's leader installs anything; anything else
// is a typed failure that leaves the cell as it was and owes another list
// after this owner's backoff.
//
// Bound: one image per (cache, source partition) in flight
// (system-table-cache-cdc-observation.js), each at most RELIST_IMAGE_MAX_ROWS
// rows and RELIST_IMAGE_MAX_BYTES bytes; a table above the bound is refused
// typed by its leader (partition_hydration_image_exceeds_bound) and stays
// gapped (an open item: a chunked image). Pacing: a failed or still-stale
// list waits RELIST_RETRY_DELAY_MS (or the leader's hint) before the next.
import {SOURCE_POSITION_STATE, SOURCE_RELIST_OUTCOME, SystemTableCacheSourceOrder} from
  '../cache/system-table-cache-cdc-observation.js';
import {SYSTEM_TABLE_CACHE_MUTATION_MODE} from '../cache/cache-constants.js';
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
import {PARTITION_HYDRATION_IMAGE_QUERY_FIELD} from
  '../partition/partition-service-hydration-image-methods.js';
import {QUERY_MESSAGE_TYPE} from '../query/query-constants.js';
import {QUERY_RESULT_REQUEST_FIELD} from '../query/query-result-budget.js';
import {NUM} from '../constants/numbers.js';
import {TIME_MS} from '../constants/time.js';
import {CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {issueAuthoritativeReadStage} from './cdc-terminal-gate.js';

const SOURCE_RELIST_BOUND = Object.freeze({
  // A system table's image: far above any control-plane table of a formed
  // cluster, below the router's message size.
  RELIST_IMAGE_MAX_ROWS: NUM.SIXTY_FOUR * NUM.BYTES_PER_KIB,
  RELIST_IMAGE_MAX_BYTES: NUM.SIXTEEN * NUM.BYTES_PER_KIB * NUM.BYTES_PER_KIB,
  RELIST_RETRY_DELAY_MS: TIME_MS.HALF_SECOND,
});

const SOURCE_RELIST_FAILURE = Object.freeze({
  NO_QUERY_EXECUTOR: 'source_relist_no_query_executor',
  NOT_LEADER_WITNESSED: 'source_relist_not_leader_witnessed',
  NO_SOURCE_IMAGE: 'source_relist_no_source_image',
  INVALID_ROWS: 'source_relist_invalid_rows',
  READ_FAILED: 'source_relist_read_failed',
});

const SOURCE_RELIST_LOG_MSG = Object.freeze({
  LISTED: 'CDC source table listed from its leader at a position',
  FAILED: 'CDC source table list failed; another is owed while the gap stands',
});

const RELIST_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});

function hydrationImageRequest(sql) {
  return () => ({type: QUERY_MESSAGE_TYPE.QUERY, sql, params: [],
    [PARTITION_HYDRATION_IMAGE_QUERY_FIELD]: true,
    [QUERY_RESULT_REQUEST_FIELD.MAX_ROWS]: SOURCE_RELIST_BOUND.RELIST_IMAGE_MAX_ROWS,
    [QUERY_RESULT_REQUEST_FIELD.MAX_BYTES]: SOURCE_RELIST_BOUND.RELIST_IMAGE_MAX_BYTES});
}

function hydrationImageResult(partitionId) {
  return (response) => ({partitionId, success: true, rows: response.rows,
    rowSetComplete: response.rowSetComplete === true,
    readAuthorityWitness: response.readAuthorityWitness, sourceImage: response.sourceImage});
}

function validImageRows(tableName, rows) {
  if (!Array.isArray(rows)) return false;
  const keys = new Set();
  return rows.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const key = resolveSystemCacheRowKey(tableName, row);
    if (!isUsableSystemCacheKey(key) || keys.has(String(key))) return false;
    keys.add(String(key));
    return true;
  });
}

// Why a read cannot be installed, or null.
function imageFailure(result, sourcePartition, tableName) {
  if (result?.success !== true) return result?.errorCode ?? SOURCE_RELIST_FAILURE.READ_FAILED;
  if (!isValidLeaderReadAuthorityWitness(result.readAuthorityWitness, sourcePartition)) {
    return SOURCE_RELIST_FAILURE.NOT_LEADER_WITNESSED;
  }
  const image = result.sourceImage;
  if (image?.sourcePartition !== sourcePartition || !Number.isSafeInteger(image.appliedIndex) ||
      image.appliedIndex < 0 || result.rowSetComplete !== true) {
    return SOURCE_RELIST_FAILURE.NO_SOURCE_IMAGE;
  }
  return validImageRows(tableName, result.rows) ? null : SOURCE_RELIST_FAILURE.INVALID_ROWS;
}

// Rows and position, installed in one synchronous span.
function installImage(service, sourceOrder, request, result, read) {
  const {sourcePartition, tableName} = request;
  const witness = result.readAuthorityWitness;
  const repairOptions = {
    mutationMode: SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_OBSERVATION_RECONCILIATION,
    authoritativeObservedAtMs: witness.observedAtMs,
    authoritativeReadStartedAtMs: read.startedAtMs,
  };
  for (const row of result.rows) {
    service.applyAuthoritativeCacheRepair(tableName, 'UPSERT', row,
      resolveSystemCacheRowKey(tableName, row), repairOptions);
  }
  service.applyAuthoritativeCacheSweep(tableName, result.rows, {
    readStartedAtMs: read.startedAtMs, mutationSnapshot: read.mutationSnapshot,
    authoritativeObservedAtMs: witness.observedAtMs});
  service.cacheMutationTarget.recordAuthoritativeObservation(tableName, {
    observedAtMs: witness.observedAtMs, term: witness.term ?? null,
    appliedIndex: result.sourceImage.appliedIndex, commitIndex: witness.commitIndex ?? null,
    servingNodeId: witness.servingNodeId ?? null, partitionId: sourcePartition,
    causeId: 'cdc-source-relist'});
  return sourceOrder.recordListedPosition({sourcePartition, tableName,
    incarnation: result.sourceImage.incarnation, appliedIndex: result.sourceImage.appliedIndex});
}

async function readSourceImage(service, request) {
  const queryExecutor = service.sqlQueryEngine?.queryExecutor ?? null;
  if (queryExecutor === null) {
    return {success: false, errorCode: SOURCE_RELIST_FAILURE.NO_QUERY_EXECUTOR};
  }
  const sql = `SELECT * FROM ${request.tableName}`;
  return issueAuthoritativeReadStage(service, CDC_TERMINAL_STAGE.OWNER_RPC_READ,
    () => queryExecutor.executeOnPartition(request.sourcePartition, sql, [], true, true, false, {
      readAuthority: RELIST_READ_AUTHORITY,
      buildRequest: hydrationImageRequest(sql),
      buildSuccessResult: hydrationImageResult(request.sourcePartition),
    }));
}

/**
 * List one source table again and install rows and position together.
 * @param {Object} service - The CDC integration service.
 * @param {Object} request - {sourcePartition, tableName}.
 * @return {Promise<string>} A SOURCE_RELIST_OUTCOME: RETRY (after this
 *   owner's backoff; another list is owed if the cell is still stale) or
 *   STOPPED (the owner is terminal).
 */
async function relistSourceTable(service, request) {
  const terminal = () => Boolean(service.refuseIfTerminal(CDC_TERMINAL_STAGE.CACHE_REPAIR));
  if (terminal()) return SOURCE_RELIST_OUTCOME.STOPPED;
  const sourceOrder = service.cacheMutationTarget.sourceOrder;
  const read = {startedAtMs: service.timeSource.now(),
    mutationSnapshot: service.captureAuthoritativeCacheSweepSnapshot(request.tableName)};
  let result;
  try {
    result = await readSourceImage(service, request);
  } catch (error) {
    result = {success: false, errorCode: SOURCE_RELIST_FAILURE.READ_FAILED,
      error: error?.message ?? String(error)};
  }
  if (terminal()) return SOURCE_RELIST_OUTCOME.STOPPED;
  const failure = imageFailure(result, request.sourcePartition, request.tableName);
  if (failure === null) {
    const cell = installImage(service, sourceOrder, request, result, read);
    service.logger?.info?.(SOURCE_RELIST_LOG_MSG.LISTED, {...cell, rows: result.rows.length});
    if (cell.state !== SOURCE_POSITION_STATE.GAP) return SOURCE_RELIST_OUTCOME.RETRY;
  } else {
    service.logger?.warn?.(SOURCE_RELIST_LOG_MSG.FAILED, {...request, failure,
      error: result?.error ?? null});
  }
  const hintMs = getControlPlaneRetryAfterMs(result);
  await service.delayUntilShutdown(hintMs > 0 ? hintMs : SOURCE_RELIST_BOUND.RELIST_RETRY_DELAY_MS);
  return terminal() ? SOURCE_RELIST_OUTCOME.STOPPED : SOURCE_RELIST_OUTCOME.RETRY;
}

/**
 * Register this service as the relister of its writable cache: a GAP in
 * any source cell lists that table through relistSourceTable.
 * @param {Object} service - The CDC integration service.
 * @return {boolean} Whether a cache with a source-order owner was found.
 */
function registerSourceRelister(service) {
  const sourceOrder = service.cacheMutationTarget?.sourceOrder;
  if (!(sourceOrder instanceof SystemTableCacheSourceOrder)) return false;
  sourceOrder.registerRelister((request) => relistSourceTable(service, request), service.logger);
  return true;
}

export {SOURCE_RELIST_BOUND, SOURCE_RELIST_FAILURE, registerSourceRelister, relistSourceTable};
