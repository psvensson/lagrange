// The paged hydration image of one partition leader (CDC Stage 3 re-list).
//
// One image is one read snapshot of the partition's own database: a second,
// read-only connection opened in a read transaction (WAL), or for an
// in-memory database a private copy of it. The applied index P, the CDC
// ledger incarnation and every page of rows are read from that one snapshot,
// so every page of an image describes the state after every entry at or below
// P and none above it - no matter how many entries the leader applies while
// the pages are fetched. Rows are served in the snapshot's own scan order by
// one open cursor; a page is bounded by rows and by bytes, and a row larger
// than the byte bound ships alone, up to ROW_MAX_BYTES (refused typed beyond).
//
// Resource lifetime (R13). The leader holds at most OPEN_IMAGES_MAX images.
// An image is closed by: its last page; a page asked out of order; leadership
// ending (another tenure); the leader applying more than
// APPLIED_ADVANCE_MAX entries past P (a held read transaction pins the WAL,
// so this bounds the WAL the image keeps: at most that many entries'
// writes); no page asked between two sweeps (IDLE_SWEEP_MS apart, so an
// abandoned image lives at most two sweeps); the partition closing. Expiry is
// a resource decision only: a recipient that meets it is answered typed
// (EXPIRED) and restarts from page 0; its correctness never depends on when
// expiry happens.
import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {NUM} from '../constants/numbers.js';
import {TIME_MS} from '../constants/time.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {readCdcLedgerIncarnation} from './partition-cdc-obligation-ledger.js';
import {readPartitionAppliedIndex} from './partition-committed-log.js';
import {PARTITION_SERVICE_DEFAULT} from './partition-service-constants.js';

const PARTITION_HYDRATION_IMAGE_BOUND = Object.freeze({
  // A page: the recipient may ask for less, never more.
  PAGE_MAX_ROWS: NUM.FOUR * NUM.BYTES_PER_KIB,
  PAGE_MAX_BYTES: NUM.BYTES_PER_MIB,
  // The absolute bound of one row: it ships alone in one answer, below the
  // router's message size. A larger row cannot be listed (typed refusal).
  ROW_MAX_BYTES: NUM.SIXTEEN * NUM.BYTES_PER_MIB,
  // Open images per partition leader (one per re-listing recipient node).
  OPEN_IMAGES_MAX: NUM.FOUR,
  // The idle sweep's period: an image no page was asked of since the
  // previous sweep is closed.
  IDLE_SWEEP_MS: TIME_MS.SECOND * NUM.TEN,
  // Entries the leader may apply past an image's P while it is held.
  APPLIED_ADVANCE_MAX: NUM.SIXTY_FOUR * NUM.BYTES_PER_KIB,
  // The hint of an UNAVAILABLE answer (every image slot is held).
  UNAVAILABLE_RETRY_AFTER_MS: TIME_MS.HALF_SECOND,
});

// What one page request ended as.
const PARTITION_HYDRATION_IMAGE_PAGE_STATE = Object.freeze({
  PAGE: 'page',
  NOT_LEADER: 'not_leader',
  EXPIRED: 'expired',
  UNAVAILABLE: 'unavailable',
  ROW_EXCEEDS_BOUND: 'row_exceeds_bound',
});

// Why an image was closed before its last page.
const HYDRATION_IMAGE_CLOSE_REASON = Object.freeze({
  LAST_PAGE: 'last_page',
  UNKNOWN_IMAGE: 'unknown_image',
  OUT_OF_ORDER: 'out_of_order',
  LEADERSHIP: 'leadership',
  APPLIED_ADVANCE: 'applied_advance',
  IDLE: 'idle',
  ROW_EXCEEDS_BOUND: 'row_exceeds_bound',
  CLOSED: 'partition_closed',
});

const HYDRATION_IMAGE_LOG_MSG = Object.freeze({
  CLOSED: 'Partition hydration image closed before its last page',
});

const BEGIN_READ = 'BEGIN';
const BYTE_ENCODING = 'utf8';

function boundedLimit(requested, bound) {
  return Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, bound) : bound;
}

// The image's snapshot: a read transaction on a second connection, or a
// private copy of an in-memory database (no second connection can see it).
function openSnapshotDatabase(partition) {
  if (!partition.dbPath || partition.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH) {
    return new Database(partition.db.serialize());
  }
  const snapshot = new Database(partition.dbPath, {readonly: true, fileMustExist: true});
  snapshot.exec(BEGIN_READ);
  return snapshot;
}

function rowBytesOf(row) {
  return Buffer.byteLength(JSON.stringify(row), BYTE_ENCODING);
}

class PartitionHydrationImages {
  /**
   * @param {Object} partition - The partition service whose leader serves.
   */
  constructor(partition) {
    this.partition = partition;
    this.images = new Map();
    this.sweepTimer = null;
  }

  servingTenure() {
    const partition = this.partition;
    return partition.isLeader === true && !partition.isShutdown && partition.db ?
      partition.leadershipTenure ?? null : undefined;
  }

  appliedAdvanceOf(image) {
    const applied = Number(readPartitionAppliedIndex(this.partition) ?? 0);
    return applied - image.appliedIndex;
  }

  /**
   * Serve one page of an image: page 0 with no image opens one.
   * @param {string} sql - The admitted read statement.
   * @param {Object} cursor - {imageId: string|null, page: number}.
   * @param {Object} limits - {maxRows, maxBytes}: the recipient's page.
   * @return {Object} {state: PAGE, image: {imageId, appliedIndex,
   *   incarnation}, page: {page, rows, rowCount, byteCount, last}} or
   *   {state, reason}.
   */
  page(sql, cursor, limits) {
    const tenure = this.servingTenure();
    if (tenure === undefined) {
      this.closeAll(HYDRATION_IMAGE_CLOSE_REASON.LEADERSHIP);
      return {state: PARTITION_HYDRATION_IMAGE_PAGE_STATE.NOT_LEADER, reason: null};
    }
    if (cursor.imageId === null) {
      if (cursor.page !== 0) {
        return {state: PARTITION_HYDRATION_IMAGE_PAGE_STATE.EXPIRED,
          reason: HYDRATION_IMAGE_CLOSE_REASON.OUT_OF_ORDER};
      }
      if (this.images.size >= PARTITION_HYDRATION_IMAGE_BOUND.OPEN_IMAGES_MAX) {
        return {state: PARTITION_HYDRATION_IMAGE_PAGE_STATE.UNAVAILABLE, reason: 'images_held',
          retryAfterMs: PARTITION_HYDRATION_IMAGE_BOUND.UNAVAILABLE_RETRY_AFTER_MS};
      }
      return this.nextPage(this.open(sql, tenure), limits);
    }
    const image = this.images.get(cursor.imageId);
    const expiry = image === undefined ? HYDRATION_IMAGE_CLOSE_REASON.UNKNOWN_IMAGE :
      image.tenure !== tenure ? HYDRATION_IMAGE_CLOSE_REASON.LEADERSHIP :
        cursor.page !== image.served ? HYDRATION_IMAGE_CLOSE_REASON.OUT_OF_ORDER :
          this.appliedAdvanceOf(image) > PARTITION_HYDRATION_IMAGE_BOUND.APPLIED_ADVANCE_MAX ?
            HYDRATION_IMAGE_CLOSE_REASON.APPLIED_ADVANCE : null;
    if (expiry !== null) {
      if (image !== undefined) this.close(image, expiry);
      return {state: PARTITION_HYDRATION_IMAGE_PAGE_STATE.EXPIRED, reason: expiry};
    }
    return this.nextPage(image, limits);
  }

  // The snapshot, P and the incarnation, then the open cursor: all one read.
  open(sql, tenure) {
    const db = openSnapshotDatabase(this.partition);
    try {
      const appliedIndex = Number(RaftRsDurableStore.readAppliedIndexIn(db,
        this.partition.partitionId) ?? 0);
      const incarnation = readCdcLedgerIncarnation(db);
      const rows = db.prepare(sql).iterate();
      const image = {imageId: randomUUID(), db, rows, pending: null, appliedIndex, incarnation,
        tenure, served: 0, sweptAt: -1};
      this.images.set(image.imageId, image);
      this.armSweep();
      return image;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  nextPage(image, limits) {
    const maxRows = boundedLimit(limits.maxRows, PARTITION_HYDRATION_IMAGE_BOUND.PAGE_MAX_ROWS);
    const maxBytes = boundedLimit(limits.maxBytes, PARTITION_HYDRATION_IMAGE_BOUND.PAGE_MAX_BYTES);
    const rows = [];
    let byteCount = 0;
    let last = false;
    for (;;) {
      const next = image.pending ?? this.readRow(image);
      if (next === null) {
        last = true;
        break;
      }
      if (next.bytes > PARTITION_HYDRATION_IMAGE_BOUND.ROW_MAX_BYTES) {
        this.close(image, HYDRATION_IMAGE_CLOSE_REASON.ROW_EXCEEDS_BOUND);
        return {state: PARTITION_HYDRATION_IMAGE_PAGE_STATE.ROW_EXCEEDS_BOUND,
          reason: `row of ${next.bytes} bytes`};
      }
      // A full page keeps the next row for the next page; a single row
      // above the byte bound fills a page alone.
      if (rows.length > 0 && (rows.length >= maxRows || byteCount + next.bytes > maxBytes)) {
        image.pending = next;
        break;
      }
      image.pending = null;
      rows.push(next.row);
      byteCount += next.bytes;
    }
    const page = image.served;
    image.served += 1;
    if (last) this.close(image, HYDRATION_IMAGE_CLOSE_REASON.LAST_PAGE);
    return {state: PARTITION_HYDRATION_IMAGE_PAGE_STATE.PAGE,
      image: {imageId: image.imageId, appliedIndex: image.appliedIndex,
        incarnation: image.incarnation},
      page: {page, rows, rowCount: rows.length, byteCount, last}};
  }

  readRow(image) {
    const step = image.rows.next();
    return step.done ? null : {row: step.value, bytes: rowBytesOf(step.value)};
  }

  close(image, reason) {
    if (this.images.get(image.imageId) !== image) return;
    this.images.delete(image.imageId);
    image.rows.return?.();
    image.db.close();
    if (reason !== HYDRATION_IMAGE_CLOSE_REASON.LAST_PAGE) {
      this.partition.logger?.debug?.(HYDRATION_IMAGE_LOG_MSG.CLOSED, {
        partitionId: this.partition.partitionId, imageId: image.imageId,
        appliedIndex: image.appliedIndex, pagesServed: image.served, reason});
    }
    if (this.images.size === 0) this.disarmSweep();
  }

  /**
   * Close every image (leadership ended, or the partition closes).
   * @param {string} reason - A HYDRATION_IMAGE_CLOSE_REASON.
   */
  closeAll(reason = HYDRATION_IMAGE_CLOSE_REASON.CLOSED) {
    for (const image of [...this.images.values()]) this.close(image, reason);
  }

  armSweep() {
    if (this.sweepTimer !== null) return;
    const timeSource = this.partition.timeSource;
    this.sweepTimer = timeSource.setTimeout(() => {
      this.sweepTimer = null;
      this.sweep();
    }, PARTITION_HYDRATION_IMAGE_BOUND.IDLE_SWEEP_MS);
    this.sweepTimer?.unref?.();
  }

  disarmSweep() {
    if (this.sweepTimer === null) return;
    this.partition.timeSource.clearTimeout(this.sweepTimer);
    this.sweepTimer = null;
  }

  sweep() {
    const tenure = this.servingTenure();
    for (const image of [...this.images.values()]) {
      const reason = image.tenure !== tenure ? HYDRATION_IMAGE_CLOSE_REASON.LEADERSHIP :
        image.sweptAt === image.served ? HYDRATION_IMAGE_CLOSE_REASON.IDLE :
          this.appliedAdvanceOf(image) > PARTITION_HYDRATION_IMAGE_BOUND.APPLIED_ADVANCE_MAX ?
            HYDRATION_IMAGE_CLOSE_REASON.APPLIED_ADVANCE : null;
      if (reason === null) image.sweptAt = image.served;
      else this.close(image, reason);
    }
    if (this.images.size > 0) this.armSweep();
  }

  /**
   * @return {Object} {open, images: [{imageId, appliedIndex, served}]}.
   */
  diagnostics() {
    return {open: this.images.size, images: [...this.images.values()].map((image) => ({
      imageId: image.imageId, appliedIndex: image.appliedIndex, served: image.served}))};
  }
}

export {HYDRATION_IMAGE_CLOSE_REASON, PARTITION_HYDRATION_IMAGE_BOUND,
  PARTITION_HYDRATION_IMAGE_PAGE_STATE, PartitionHydrationImages};
