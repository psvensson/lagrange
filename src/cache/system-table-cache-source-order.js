import {compareSameEntryPositions, entryPositionOf} from
  './system-table-cache-cdc-fold.js';
import {CDC_EVENT_IDENTITY} from '../constants/cdc-lifecycle-constants.js';

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

const SOURCE_EFFECT_STATE = Object.freeze({
  APPLY: 'apply',
  APPLIED: 'applied',
  COVERED: 'covered',
  UNAVAILABLE: 'unavailable',
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
  CURRENT_LISTENER_FAILED: 'CDC source-current observer failed after publication',
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

function captureSourceRange(range) {
  if (!isSourceRange(range)) {
    throw Object.assign(new Error(CDC_EVENT_IDENTITY.INVALID_MESSAGE),
      {code: CDC_EVENT_IDENTITY.INVALID_CODE});
  }
  return Object.freeze({sourcePartition: range.sourcePartition, incarnation: range.incarnation,
    after: Object.freeze({logIndex: range.after.logIndex, ordinal: range.after.ordinal}),
    through: Object.freeze({logIndex: range.through.logIndex, ordinal: range.through.ordinal})});
}

// This checks internal consistency, not ledger completeness. The source
// transaction owns which obligations exist between predecessor and tail.
function isSourceVector(range, events) {
  if (!isSourceRange(range) || typeof range.incarnation !== 'string' ||
      !Array.isArray(events) || events.length === 0) return false;
  const tableName = events[0]?.tableName;
  let previous = range.after;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || typeof tableName !== 'string' || tableName.length === 0 ||
        event.tableName !== tableName ||
        event.sourcePartition !== range.sourcePartition ||
        typeof event.eventKey !== 'string' || event.eventKey.length === 0 ||
        !Number.isSafeInteger(event.sourceLogIndex) || event.sourceLogIndex < 1 ||
        !Number.isSafeInteger(event.sourceOrdinal) || event.sourceOrdinal < 0) return false;
    const position = {logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal};
    if (comparePositions(previous, position) >= 0) return false;
    previous = position;
  }
  return comparePositions(previous, range.through) === 0;
}

function isSourceMember(range, event) {
  if (!isSourceRange(range) || typeof range.incarnation !== 'string' ||
      event.sourcePartition !== range.sourcePartition ||
      !Number.isSafeInteger(event.sourceLogIndex) || event.sourceLogIndex < 1 ||
      !Number.isSafeInteger(event.sourceOrdinal) || event.sourceOrdinal < 0) {
    return false;
  }
  const position = {logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal};
  return comparePositions(range.after, position) < 0 &&
    comparePositions(position, range.through) <= 0;
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
        position: null, need: null, relist: SOURCE_RELIST_STATE.IDLE, lists: 0,
        generation: Symbol(), effectGeneration: Symbol()};
      this.cells.set(sourcePartition, cell);
    }
    cell.tableName ??= tableName;
    return cell;
  }

  captureEffectContext(sourcePartition, tableName, incarnation) {
    const cell = this.cellOf(sourcePartition, tableName);
    if (cell.tableName !== tableName || typeof incarnation !== 'string' || incarnation.length === 0) {
      throw Object.assign(new Error(CDC_EVENT_IDENTITY.INVALID_MESSAGE),
        {code: CDC_EVENT_IDENTITY.INVALID_CODE});
    }
    return Object.freeze({cell, incarnation, generation: cell.effectGeneration});
  }

  sourceTableMatches(sourcePartition, tableName) {
    const cell = this.cells.get(sourcePartition);
    return cell === undefined || cell.tableName === null || cell.tableName === tableName;
  }

  effectContextIsCurrent(context) {
    return context?.cell !== undefined && context.cell !== null &&
      this.cells.get(context.cell.sourcePartition) === context.cell &&
      context.cell.effectGeneration === context.generation;
  }

  effectCoversContext(effect, context) {
    return (effect?.state === SOURCE_EFFECT_STATE.APPLIED ||
      effect?.state === SOURCE_EFFECT_STATE.COVERED) &&
      effect.context?.cell === context.cell && effect.context.incarnation === context.incarnation &&
      effect.context.generation === context.generation &&
      this.effectContextIsCurrent(context);
  }

  applicationContextIsCurrent(context, tableName, metadata) {
    return this.effectContextIsCurrent(context) && context.cell.tableName === tableName &&
      context.cell.sourcePartition === metadata.sourcePartition &&
      context.incarnation === metadata.sourceIncarnation;
  }

  tableGeneration(tableName) {
    for (const cell of this.cells.values()) {
      if (cell.tableName === tableName) return cell.generation;
    }
    return null;
  }

  // A non-source authority replaced effects this prefix described. The same
  // relister repairs the basis; the old position cannot certify new effects.
  invalidateTable(tableName) {
    this.tables.delete(tableName);
    for (const cell of this.cells.values()) {
      if (cell.tableName !== tableName) continue;
      cell.effectGeneration = Symbol();
      cell.position = null;
      cell.state = SOURCE_POSITION_STATE.GAP;
      this.requestRelist(cell);
    }
  }

  classifyEffect(tableName, key, data, options) {
    const incoming = entryPositionOf(data, options);
    if (incoming === null || typeof incoming.incarnation !== 'string' ||
        typeof incoming.eventKey !== 'string') return SOURCE_EFFECT_STATE.UNAVAILABLE;
    const cell = this.cellOf(incoming.partition, tableName);
    if (cell.incarnation !== null && cell.incarnation !== incoming.incarnation) {
      return SOURCE_EFFECT_STATE.UNAVAILABLE;
    }
    if (cell.position !== null) {
      if (cell.incarnation !== incoming.incarnation) return SOURCE_EFFECT_STATE.UNAVAILABLE;
      if (comparePositions(incoming, cell.position) <= 0) return SOURCE_EFFECT_STATE.COVERED;
    }
    const applied = this.tables.get(tableName)?.get(key);
    return applied?.partition === incoming.partition &&
      applied.incarnation === incoming.incarnation &&
      comparePositions(incoming, applied) <= 0 ?
      SOURCE_EFFECT_STATE.COVERED : SOURCE_EFFECT_STATE.APPLY;
  }

  retainEffectRecovery(event, range) {
    this.recordGap({sourcePartition: event.sourcePartition,
      incarnation: range.incarnation,
      through: {logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal}}, event.tableName);
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
      cell.generation = Symbol();
      cell.effectGeneration = Symbol();
      this.tables.delete(tableName);
    }
    if (cell.position !== null && comparePositions(range.through, cell.position) <= 0) {
      this.settleNeed(cell);
      return;
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
  advance(range, tableName, context) {
    if (!this.effectContextIsCurrent(context)) return false;
    const cell = this.cellOf(range.sourcePartition, tableName);
    if (cell.incarnation !== range.incarnation || cell.position === null) return false;
    if (comparePositions(range.through, cell.position) > 0) cell.position = range.through;
    this.settleNeed(cell);
    return this.effectContextIsCurrent(context);
  }

  settleNeed(cell) {
    const before = cell.state;
    if (cell.need !== null && comparePositions(cell.need, cell.position) <= 0) cell.need = null;
    cell.state = cell.need === null ? SOURCE_POSITION_STATE.CURRENT : SOURCE_POSITION_STATE.GAP;
    if (cell.state === SOURCE_POSITION_STATE.GAP) this.requestRelist(cell);
    else if (before !== SOURCE_POSITION_STATE.CURRENT) {
      for (const listener of [...this.currentListeners]) {
        try {
          listener(cell.sourcePartition);
        } catch (error) {
          this.logger?.warn?.(SOURCE_ORDER_LOG_MSG.CURRENT_LISTENER_FAILED,
            {sourcePartition: cell.sourcePartition, error: error.message});
        }
      }
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
    cell.generation = Symbol();
    cell.effectGeneration = Symbol();
    this.tables.delete(tableName);
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
    return Object.freeze({cell, incarnation: cell.incarnation, generation: cell.effectGeneration});
  }

  /**
   * Decide whether a complete image may be installed (rows swapped and the
   * position recorded in the same synchronous span as this answer).
   * @param {Object} token - From beginImage.
   * @param {Object} image - {sourcePartition, incarnation, appliedIndex}.
   * @return {string} A SOURCE_IMAGE_ADMISSION.
   */
  admitImage(token, {sourcePartition, tableName, incarnation, appliedIndex}) {
    const cell = this.cells.get(sourcePartition);
    if (cell !== token.cell || cell.tableName !== tableName ||
        cell.effectGeneration !== token.generation ||
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

export {SOURCE_EFFECT_STATE, SOURCE_IMAGE_ADMISSION, SOURCE_POSITION_STATE, SOURCE_RANGE_DECISION,
  SOURCE_RELIST_OUTCOME, SystemTableCacheSourceOrder, captureSourceRange,
  isSourceMember, isSourceRange, isSourceVector};
