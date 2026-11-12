import {CACHE_CDC_OPERATIONS} from './cache-constants.js';
import {compareSchemaVersions} from './system-table-cache-row-merge.js';
import {compareSameEntryPositions, entryPositionOf} from
  './system-table-cache-cdc-fold.js';

function resolveCdcOriginHlc(row) {
  if (typeof row?.updated_at_hlc === 'string') {
    return row.updated_at_hlc;
  }
  return typeof row?.updatedAtHlc === 'string' ? row.updatedAtHlc : null;
}

function resolveIncomingOriginHlc(data, options) {
  const candidates = [
    data?.origin_hlc,
    data?.originHlc,
    data?.updated_at_hlc,
    data?.updatedAtHlc,
    options?.timestamp,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function getOrCreateTableRevisionWatermarks(cache) {
  if (!cache || typeof cache !== 'object') {
    return null;
  }
  if (!(cache.tableRevisionWatermarks instanceof Map)) {
    cache.tableRevisionWatermarks = new Map();
  }
  return cache.tableRevisionWatermarks;
}

function hasCdcObservationMetadata(options) {
  return Boolean(
    options &&
      (Number.isSafeInteger(options.sourceLogIndex) ||
        Number.isSafeInteger(options.sourceOrdinal) ||
        typeof options.sourcePartition === 'string' ||
        typeof options.sourceReplica === 'string' ||
        Number.isFinite(options.cdcObservedAtMs)),
  );
}

function normalizeNonEmptyWatermarkString(value, fallback = null) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function normalizeSafeIntegerWatermark(value, fallback = null) {
  return Number.isSafeInteger(value) ? value : fallback;
}

function normalizeMonotonicSafeIntegerWatermark(incoming, previous = null) {
  if (!Number.isSafeInteger(incoming)) {
    return normalizeSafeIntegerWatermark(previous, null);
  }
  return Number.isSafeInteger(previous) ?
    Math.max(previous, incoming) :
    incoming;
}

function normalizeMonotonicObservedAtMs(incoming, previous = null) {
  const prevMs = Number.isFinite(previous) ? previous : null;
  if (!Number.isFinite(incoming) || incoming < 0) {
    return prevMs;
  }
  const normalizedIncoming = Math.floor(incoming);
  return prevMs === null ?
    normalizedIncoming :
    Math.max(prevMs, normalizedIncoming);
}

function resolveTableMutationRevision(cache, tableName, prev) {
  return typeof cache?.getTableMutationVersion === 'function' ?
    cache.getTableMutationVersion(tableName) :
    (prev?.tableMutationRevision ?? 0);
}

function resolveNextSourceOrdinal(options, prev, nextLastSourceLogIndex) {
  const fallback = normalizeSafeIntegerWatermark(prev?.lastSourceOrdinal, null);
  if (
    !Number.isSafeInteger(options?.sourceOrdinal) ||
    options?.sourceLogIndex !== nextLastSourceLogIndex
  ) {
    return fallback;
  }
  if (prev?.lastSourceLogIndex === nextLastSourceLogIndex) {
    return normalizeMonotonicSafeIntegerWatermark(
      options.sourceOrdinal,
      fallback,
    );
  }
  return options.sourceOrdinal;
}

function resolveNextOriginHlc(data, options, previousHlc = null) {
  const incomingOriginHlc = resolveIncomingOriginHlc(data, options);
  const fallback = normalizeNonEmptyWatermarkString(previousHlc, null);
  if (!incomingOriginHlc) {
    return fallback;
  }
  if (!fallback || compareSchemaVersions(incomingOriginHlc, fallback) >= 0) {
    return incomingOriginHlc;
  }
  return fallback;
}

function preserveAuthoritativeWatermarkFields(prev) {
  return {
    lastAuthoritativeTerm:
      normalizeSafeIntegerWatermark(prev?.lastAuthoritativeTerm, null),
    lastAuthoritativeAppliedIndex:
      normalizeSafeIntegerWatermark(prev?.lastAuthoritativeAppliedIndex, null),
    lastAuthoritativeCommitIndex:
      normalizeSafeIntegerWatermark(prev?.lastAuthoritativeCommitIndex, null),
    lastAuthoritativeServingNodeId:
      normalizeNonEmptyWatermarkString(
        prev?.lastAuthoritativeServingNodeId,
        null,
      ),
    lastAuthoritativePartitionId:
      normalizeNonEmptyWatermarkString(
        prev?.lastAuthoritativePartitionId,
        null,
      ),
    lastAuthoritativeObservedAtMs:
      normalizeMonotonicObservedAtMs(null, prev?.lastAuthoritativeObservedAtMs),
  };
}

function preserveCdcWatermarkFields(prev) {
  return {
    lastSourcePartition:
      normalizeNonEmptyWatermarkString(prev?.lastSourcePartition, null),
    lastSourceReplica:
      normalizeNonEmptyWatermarkString(prev?.lastSourceReplica, null),
    lastSourceLogIndex:
      normalizeSafeIntegerWatermark(prev?.lastSourceLogIndex, null),
    lastSourceOrdinal:
      normalizeSafeIntegerWatermark(prev?.lastSourceOrdinal, null),
    lastOriginHlc: normalizeNonEmptyWatermarkString(prev?.lastOriginHlc, null),
    lastCdcObservedAtMs:
      normalizeMonotonicObservedAtMs(null, prev?.lastCdcObservedAtMs),
  };
}

/**
 * Record CDC-side revision watermark observations for one system table.
 * @param {Object} cache
 * @param {string} tableName
 * @param {Object} data
 * @param {Object} [options]
 * @return {Object|null}
 */
function recordCdcTableObservation(cache, tableName, data, options = {}) {
  const watermarks = getOrCreateTableRevisionWatermarks(cache);
  if (!watermarks || !normalizeNonEmptyWatermarkString(tableName)) {
    return null;
  }
  const prev = watermarks.get(tableName) || {};
  const nextLastSourceLogIndex = normalizeMonotonicSafeIntegerWatermark(
    options?.sourceLogIndex,
    prev.lastSourceLogIndex,
  );
  const nextWatermark = {
    tableName,
    tableMutationRevision:
      resolveTableMutationRevision(cache, tableName, prev),
    lastSourcePartition: normalizeNonEmptyWatermarkString(
      options?.sourcePartition,
      normalizeNonEmptyWatermarkString(prev.lastSourcePartition, null),
    ),
    lastSourceReplica: normalizeNonEmptyWatermarkString(
      options?.sourceReplica,
      normalizeNonEmptyWatermarkString(prev.lastSourceReplica, null),
    ),
    lastSourceLogIndex: nextLastSourceLogIndex,
    lastSourceOrdinal: resolveNextSourceOrdinal(
      options,
      prev,
      nextLastSourceLogIndex,
    ),
    lastOriginHlc: resolveNextOriginHlc(data, options, prev.lastOriginHlc),
    lastCdcObservedAtMs: normalizeMonotonicObservedAtMs(
      options?.cdcObservedAtMs,
      prev.lastCdcObservedAtMs,
    ),
    ...preserveAuthoritativeWatermarkFields(prev),
  };
  watermarks.set(tableName, nextWatermark);
  return nextWatermark;
}

/**
 * Record authoritative owner read revision watermark observations for one
 * system table.
 * @param {Object} cache
 * @param {string} tableName
 * @param {number|null} observedAtMs
 * @param {Object} [options]
 * @return {Object|null}
 */
function recordAuthoritativeTableObservation(
  cache,
  tableName,
  observedAtMs,
  options = {},
) {
  const watermarks = getOrCreateTableRevisionWatermarks(cache);
  if (!watermarks || !normalizeNonEmptyWatermarkString(tableName)) {
    return null;
  }
  const prev = watermarks.get(tableName) || {};
  const nextWatermark = {
    tableName,
    tableMutationRevision:
      resolveTableMutationRevision(cache, tableName, prev),
    ...preserveCdcWatermarkFields(prev),
    lastAuthoritativeTerm: normalizeSafeIntegerWatermark(
      options?.term,
      normalizeSafeIntegerWatermark(prev.lastAuthoritativeTerm, null),
    ),
    lastAuthoritativeAppliedIndex: normalizeMonotonicSafeIntegerWatermark(
      options?.appliedIndex,
      prev.lastAuthoritativeAppliedIndex,
    ),
    lastAuthoritativeCommitIndex: normalizeMonotonicSafeIntegerWatermark(
      options?.commitIndex,
      prev.lastAuthoritativeCommitIndex,
    ),
    lastAuthoritativeServingNodeId: normalizeNonEmptyWatermarkString(
      options?.servingNodeId,
      normalizeNonEmptyWatermarkString(
        prev.lastAuthoritativeServingNodeId,
        null,
      ),
    ),
    lastAuthoritativePartitionId: normalizeNonEmptyWatermarkString(
      options?.partitionId,
      normalizeNonEmptyWatermarkString(
        prev.lastAuthoritativePartitionId,
        null,
      ),
    ),
    lastAuthoritativeObservedAtMs: normalizeMonotonicObservedAtMs(
      observedAtMs,
      prev.lastAuthoritativeObservedAtMs,
    ),
  };
  watermarks.set(tableName, nextWatermark);
  return nextWatermark;
}

/**
 * Return a shallow copy of the revision watermark for one table.
 * @param {Object} cache
 * @param {string} tableName
 * @return {Object|null}
 */
function getTableRevisionWatermarkSnapshot(cache, tableName) {
  const watermarks = cache?.tableRevisionWatermarks;
  if (!(watermarks instanceof Map)) {
    return null;
  }
  const entry = watermarks.get(tableName);
  return entry ? {...entry} : null;
}

/**
 * Return a plain object mapping each tracked table name to its watermark.
 * @param {Object} cache
 * @return {Object<string, Object>}
 */
function getAllTableRevisionWatermarkSnapshots(cache) {
  const snapshot = {};
  const watermarks = cache?.tableRevisionWatermarks;
  if (!(watermarks instanceof Map)) {
    return snapshot;
  }
  for (const [tableName, entry] of watermarks.entries()) {
    snapshot[tableName] = {...entry};
  }
  return snapshot;
}

/**
 * Retain CDC receipt provenance only when it names the accepted row origin.
 * Stale CDC backfills leave the newer row's observation untouched, while
 * non-CDC mutation owners invalidate CDC-only evidence.
 * @param {Object} apply
 */
function updateSystemTableCacheCdcObservation(apply) {
  if (
    apply.recordForNotification ||
    hasCdcObservationMetadata(apply.options)
  ) {
    recordCdcTableObservation(
      apply.cache,
      apply.tableName,
      apply.data,
      apply.options,
    );
  }
  if (!apply.recordForNotification) {
    return;
  }
  if (apply.operation === CACHE_CDC_OPERATIONS.DELETE) {
    apply.observationTable.delete(apply.key);
    return;
  }
  const observedAtMs = apply.options.cdcObservedAtMs;
  if (!Number.isFinite(observedAtMs) || observedAtMs < 0) {
    apply.observationTable.delete(apply.key);
    return;
  }
  if (!apply.incomingVersionAccepted) {
    return;
  }
  const incomingOriginHlc = resolveCdcOriginHlc(apply.data);
  const resultingOriginHlc = resolveCdcOriginHlc(apply.resultingRow);
  if (incomingOriginHlc && incomingOriginHlc === resultingOriginHlc) {
    apply.observationTable.set(apply.key, {
      observedAtMs: Math.floor(observedAtMs),
      originHlc: incomingOriginHlc,
    });
    return;
  }
  apply.observationTable.delete(apply.key);
}

// --- source order (CDC Stage 3): the one owner of the order of source events
// in this cache ---
//
// Two rules, one owner, one comparison (source position {logIndex, ordinal}
// within one source incarnation):
//
// 1. The position cell. Per source partition the cache holds the contiguous
//    position X through which it has applied that partition's events, in the
//    incarnation they belong to, or no position (UNKNOWN). X advances only
//    by (i) a committed range whose predecessor is at or below X, or (ii) a
//    complete leader-witnessed image (rows and the applied index they are
//    current as of, read from one leader snapshot across its pages, staged
//    off the cache and installed here - rows swapped and position recorded -
//    in one synchronous span, system-table-cache-source-image.js). A
//    committed range whose predecessor lies above X - or
//    of another incarnation, or with no position - is a GAP: none of its
//    members is merged, the cell records how far it is known to be stale
//    (`need`) and the registered relister lists the table again. A member at
//    or below X is already applied and is refused before the merge. A
//    position from another incarnation never authorizes a skip.
// 2. The within-entry rule, for the paths a range does not gate (the local
//    replica's apply, provisional ingress, a list's rows): every event of one
//    committed source entry carries that entry's origin HLC, so two versions
//    of one key from one entry tie on HLC; their ordinals order them. The
//    cache keeps, per key, the position of the last versioned event it
//    applied: a sibling of the same entry with a lower ordinal is refused, a
//    higher one supersedes that entry's own tombstone. It compares only
//    events of one entry (same origin HLC, partition and log index), so no
//    position is compared across entries or incarnations.
//
// The cell is a read-model fact (R10): it selects between apply, skip and
// list, grants nothing and discharges nothing at the source except through a
// committed receipt. It is the input of the read-currency answer below; it
// is never write or admission authority.

const SOURCE_POSITION_STATE = Object.freeze({
  // No position: nothing is known about what this cache holds of the source.
  UNKNOWN: 'unknown',
  // Contiguous through `position`, and nothing newer is known to exist.
  CURRENT: 'current',
  // Known stale: a range above `position` (through `need`) was not applied;
  // a list is owed.
  GAP: 'gap',
});

const SOURCE_RANGE_DECISION = Object.freeze({
  APPLY: 'apply',
  GAP: 'gap',
});

const SOURCE_RELIST_STATE = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  // A gap is owed a list but no relister is registered on this cache: the
  // cell stays GAP (typed), nothing is merged.
  NO_RELISTER: 'no_relister',
});

// What one relister call ended as: RETRY - the cell may still be stale and
// the relister's own backoff has elapsed (another list is owed while the gap
// stands); STOPPED - its owner is terminal, nothing more is owed here.
const SOURCE_RELIST_OUTCOME = Object.freeze({
  RETRY: 'retry',
  STOPPED: 'stopped',
});

// Whether a complete image may be installed into the cell it was begun
// against (admitImage).
const SOURCE_IMAGE_ADMISSION = Object.freeze({
  INSTALL: 'install',
  // The cell already holds a position at or after the image's applied
  // index (ranges applied while the image was fetched): the image is older
  // than the cache and is discarded; rows are untouched.
  SUPERSEDED: 'superseded',
  // The cell was reset (the cache was cleared) or moved to an incarnation
  // that is neither the one the image was begun against nor the image's own:
  // the stage is discarded and the list restarts.
  CELL_CHANGED: 'cell_changed',
});

const SOURCE_ORDER_LOG_MSG = Object.freeze({
  NO_RELISTER: 'CDC source gap owes a list but no relister is registered on this cache',
  RELIST_FAILED: 'CDC source re-list failed; another is owed while the gap stands',
});

// A list at applied index P holds every event of every entry at or below P.
const LISTED_ORDINAL = Number.MAX_SAFE_INTEGER;
// A per-table bound of the within-entry rule: the tie only matters for
// events of an entry that is still being delivered, so the most recently
// applied keys suffice.
const SOURCE_ORDER_MAX_KEYS_PER_TABLE = 4096;

function comparePositions(left, right) {
  return left.logIndex === right.logIndex ? Math.sign(left.ordinal - right.ordinal) :
    Math.sign(left.logIndex - right.logIndex);
}

function isSourcePosition(value) {
  return value !== null && typeof value === 'object' &&
    Number.isSafeInteger(value.logIndex) && Number.isSafeInteger(value.ordinal);
}

/**
 * Whether a value is a well-formed source range: {sourcePartition,
 * incarnation (string or null), after, through} with after below through.
 * @param {*} range - The candidate.
 * @return {boolean} Whether it is one.
 */
function isSourceRange(range) {
  return range !== null && typeof range === 'object' &&
    typeof range.sourcePartition === 'string' && range.sourcePartition.length > 0 &&
    (range.incarnation === null || (typeof range.incarnation === 'string' &&
      range.incarnation.length > 0)) &&
    isSourcePosition(range.after) && isSourcePosition(range.through) &&
    comparePositions(range.after, range.through) < 0;
}

// The within-entry rule's position of one event.
function cellSnapshot(cell) {
  return Object.freeze({sourcePartition: cell.sourcePartition, tableName: cell.tableName,
    incarnation: cell.incarnation, state: cell.state, position: cell.position,
    need: cell.need, relist: cell.relist, lists: cell.lists});
}

class SystemTableCacheSourceOrder {
  constructor() {
    this.tables = new Map();
    this.cells = new Map();
    this.relister = null;
    this.logger = null;
    this.currentListeners = new Set();
  }

  /**
   * Observe a cell becoming CURRENT (the read-currency waits' wake: an image
   * install or a range that closes a gap). Observation only: it grants
   * nothing.
   * @param {Function} listener - (sourcePartition) => void.
   * @return {Function} Its removal.
   */
  onCurrent(listener) {
    this.currentListeners.add(listener);
    return () => this.currentListeners.delete(listener);
  }

  cellOf(sourcePartition, tableName = null) {
    let cell = this.cells.get(sourcePartition);
    if (!cell) {
      cell = {sourcePartition, tableName, incarnation: null, state: SOURCE_POSITION_STATE.UNKNOWN,
        position: null, need: null, relist: SOURCE_RELIST_STATE.IDLE, lists: 0};
      this.cells.set(sourcePartition, cell);
    }
    cell.tableName ??= tableName;
    return cell;
  }

  /**
   * Register the one owner that lists a source table again (the CDC
   * integration service of this node).
   * @param {Function} relister - async ({sourcePartition, tableName}) =>
   *   void; it installs the image through recordListedPosition.
   * @param {Object} [logger] - Where an owed list without a relister is said.
   */
  registerRelister(relister, logger = null) {
    this.relister = relister;
    this.logger = logger;
    for (const cell of this.cells.values()) {
      if (cell.state === SOURCE_POSITION_STATE.GAP) this.requestRelist(cell);
    }
  }

  /**
   * Classify a committed range against the cell (the group leader asks
   * before proposing; every node asks again when the committed entry
   * applies). GAP when the cell has no position, another incarnation, or a
   * position below the range's predecessor; otherwise APPLY, with the
   * position members at or below which are already applied.
   * @param {Object} range - A source range.
   * @return {Object} Frozen {decision, have, need}.
   */
  classifyRange(range) {
    const cell = this.cells.get(range.sourcePartition);
    const known = cell !== undefined && cell.position !== null &&
      cell.incarnation === range.incarnation;
    const decision = known && comparePositions(range.after, cell.position) <= 0 ?
      SOURCE_RANGE_DECISION.APPLY : SOURCE_RANGE_DECISION.GAP;
    return Object.freeze({decision, have: known ? cell.position : null, need: range.after});
  }

  /**
   * A committed range that cannot be applied here: record how far this
   * cache is known to be stale and owe a list.
   * @param {Object} range - The source range.
   * @param {string|null} tableName - Its table.
   */
  recordGap(range, tableName) {
    const cell = this.cellOf(range.sourcePartition, tableName);
    if (cell.incarnation !== range.incarnation) {
      // Another incarnation: no position of the old one is comparable.
      cell.incarnation = range.incarnation;
      cell.position = null;
      cell.need = null;
    }
    cell.need = cell.need === null || comparePositions(range.through, cell.need) > 0 ?
      range.through : cell.need;
    cell.state = SOURCE_POSITION_STATE.GAP;
    this.requestRelist(cell);
  }

  /**
   * A source this cache must hold a position of (its node joined a message
   * group that applies the source's ranges): a cell with no position owes a
   * list now, without waiting for the source's next range.
   * @param {string} sourcePartition - The source partition.
   * @param {string} tableName - Its table.
   */
  requireListed(sourcePartition, tableName) {
    const cell = this.cellOf(sourcePartition, tableName);
    if (cell.position !== null) return;
    cell.state = SOURCE_POSITION_STATE.GAP;
    this.requestRelist(cell);
  }

  /**
   * Whether a member of an applying range is already applied (at or below
   * the cell's position, same incarnation).
   * @param {Object} range - The source range.
   * @param {{logIndex: number, ordinal: number}} position - The member's.
   * @return {boolean} Whether to refuse it before the merge.
   */
  memberApplied(range, position) {
    const cell = this.cells.get(range.sourcePartition);
    return cell !== undefined && cell.position !== null &&
      cell.incarnation === range.incarnation && comparePositions(position, cell.position) <= 0;
  }

  /**
   * An applied range advances the cell to its last member.
   * @param {Object} range - The source range.
   * @param {string|null} tableName - Its table.
   */
  advance(range, tableName) {
    const cell = this.cellOf(range.sourcePartition, tableName);
    if (cell.incarnation !== range.incarnation || cell.position === null) return;
    if (comparePositions(range.through, cell.position) > 0) cell.position = range.through;
    this.settleNeed(cell);
  }

  settleNeed(cell) {
    const before = cell.state;
    if (cell.need !== null && comparePositions(cell.need, cell.position) <= 0) cell.need = null;
    cell.state = cell.need === null ? SOURCE_POSITION_STATE.CURRENT : SOURCE_POSITION_STATE.GAP;
    if (cell.state === SOURCE_POSITION_STATE.GAP) this.requestRelist(cell);
    else if (before !== SOURCE_POSITION_STATE.CURRENT) {
      for (const listener of [...this.currentListeners]) listener(cell.sourcePartition);
    }
  }

  /**
   * Install the position of a complete leader-witnessed image: the caller
   * applied its rows in the same synchronous span. Another incarnation
   * replaces the cell; the same one only moves it forward.
   * @param {Object} image - {sourcePartition, tableName, incarnation,
   *   appliedIndex (a safe integer)}.
   * @return {Object} The cell after the install.
   */
  recordListedPosition({sourcePartition, tableName, incarnation, appliedIndex}) {
    const cell = this.cellOf(sourcePartition, tableName);
    const listed = {logIndex: appliedIndex, ordinal: LISTED_ORDINAL};
    cell.lists += 1;
    if (cell.incarnation !== incarnation) {
      cell.incarnation = incarnation;
      cell.position = listed;
      cell.need = null;
    } else if (cell.position === null || comparePositions(listed, cell.position) > 0) {
      cell.position = listed;
    }
    this.settleNeed(cell);
    return cellSnapshot(cell);
  }

  /**
   * Begin a list of one source: the token its install is admitted against.
   * @param {string} sourcePartition - The source partition.
   * @return {Object|null} A frozen token, or null when the cell owes no
   *   list (it is not GAP).
   */
  beginImage(sourcePartition) {
    const cell = this.cells.get(sourcePartition);
    if (cell === undefined || cell.state !== SOURCE_POSITION_STATE.GAP) return null;
    return Object.freeze({cell, incarnation: cell.incarnation});
  }

  /**
   * Decide whether a complete image may be installed (rows swapped and the
   * position recorded in the same synchronous span as this answer).
   * @param {Object} token - From beginImage.
   * @param {Object} image - {sourcePartition, incarnation, appliedIndex}.
   * @return {string} A SOURCE_IMAGE_ADMISSION.
   */
  admitImage(token, {sourcePartition, incarnation, appliedIndex}) {
    const cell = this.cells.get(sourcePartition);
    if (cell !== token.cell ||
        (cell.incarnation !== token.incarnation && cell.incarnation !== incarnation)) {
      return SOURCE_IMAGE_ADMISSION.CELL_CHANGED;
    }
    const listed = {logIndex: appliedIndex, ordinal: LISTED_ORDINAL};
    return cell.incarnation === incarnation && cell.position !== null &&
      comparePositions(listed, cell.position) <= 0 ?
      SOURCE_IMAGE_ADMISSION.SUPERSEDED : SOURCE_IMAGE_ADMISSION.INSTALL;
  }

  // One list in flight per source partition on this cache. A list that ends
  // with the cell still stale (the image predates what was missed) owes
  // another; the relister paces its own retries.
  requestRelist(cell) {
    if (cell.relist === SOURCE_RELIST_STATE.RUNNING) return;
    if (this.relister === null) {
      if (cell.relist !== SOURCE_RELIST_STATE.NO_RELISTER) {
        this.logger?.warn?.(SOURCE_ORDER_LOG_MSG.NO_RELISTER, cellSnapshot(cell));
      }
      cell.relist = SOURCE_RELIST_STATE.NO_RELISTER;
      return;
    }
    cell.relist = SOURCE_RELIST_STATE.RUNNING;
    const relister = this.relister;
    let outcome = SOURCE_RELIST_OUTCOME.STOPPED;
    Promise.resolve()
      .then(() => relister({sourcePartition: cell.sourcePartition, tableName: cell.tableName}))
      .then((answer) => {
        outcome = answer;
      }, (error) => this.logger?.warn?.(SOURCE_ORDER_LOG_MSG.RELIST_FAILED,
        {...cellSnapshot(cell), error: error?.message ?? String(error)}))
      .finally(() => {
        cell.relist = SOURCE_RELIST_STATE.IDLE;
        // The relister paces its own attempts (it returns RETRY only after
        // its backoff); STOPPED (its owner is terminal) owes nothing more.
        if (outcome === SOURCE_RELIST_OUTCOME.RETRY &&
            cell.state === SOURCE_POSITION_STATE.GAP &&
            this.cells.get(cell.sourcePartition) === cell) {
          this.requestRelist(cell);
        }
      });
  }

  /**
   * What this cache holds of one source partition (diagnostics and the
   * read-currency answer).
   * @param {string} sourcePartition - The partition.
   * @return {Object} Frozen cell snapshot (UNKNOWN when none).
   */
  positionOf(sourcePartition) {
    return cellSnapshot(this.cells.get(sourcePartition) ?? this.cellOf(sourcePartition));
  }

  /**
   * Order an event against the one its key last applied from the same
   * source entry (same origin HLC, partition and log index), by ordinal.
   * @param {string} tableName
   * @param {string} key
   * @param {Object} data - The event's row data (carries the origin HLC).
   * @param {Object} options - The apply options.
   * @return {number} Negative: older; positive: newer; 0: the same event, or
   *   no event of this entry was applied (the merge alone decides).
   */
  compareInSameEntry(tableName, key, data, options) {
    return compareSameEntryPositions(this.tables.get(tableName)?.get(key),
      entryPositionOf(data, options));
  }

  /**
   * Record the source position of an event the key applied.
   * @param {string} tableName
   * @param {string} key
   * @param {Object} data
   * @param {Object} options
   */
  record(tableName, key, data, options) {
    const position = entryPositionOf(data, options);
    if (position === null) return;
    let table = this.tables.get(tableName);
    if (!table) {
      table = new Map();
      this.tables.set(tableName, table);
    }
    table.delete(key);
    table.set(key, position);
    if (table.size > SOURCE_ORDER_MAX_KEYS_PER_TABLE) table.delete(table.keys().next().value);
  }

  // A cleared cache holds nothing of any source: every cell is UNKNOWN.
  clear() {
    this.tables.clear();
    this.cells.clear();
  }
}

export {
  SOURCE_IMAGE_ADMISSION,
  SOURCE_POSITION_STATE,
  SOURCE_RANGE_DECISION,
  SOURCE_RELIST_OUTCOME,
  SystemTableCacheSourceOrder,
  getAllTableRevisionWatermarkSnapshots,
  getTableRevisionWatermarkSnapshot,
  isSourceRange,
  recordAuthoritativeTableObservation,
  updateSystemTableCacheCdcObservation,
};
