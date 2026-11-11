// The partition's hydration image (CDC decision D4, owner 2026-10-26): the
// rows of one admitted read together with the durable applied index P they
// are the state after. The partition's rows, its CDC obligation ledger and
// its rs-raft applied state are written in one transaction on one
// connection (raft-rs-application-transaction-owner.js), so a read of all
// three from one snapshot holds every entry at or below P and none above it.
// A subscriber registered before the image is read counts for every
// acknowledgement after its registration, so every ledger event above P
// reaches it through the obligation lane: hydration and live CDC meet at P
// with no gap.
//
// Two readers, one rule. readHydrationImage is the seed's local read on this
// leader (one synchronous span on the partition's own connection).
// answerHydrationImageQuery is the re-list's remote read (CDC Stage 3): a
// paged image held on a read snapshot (partition-hydration-image-pages.js),
// every page naming the same P and incarnation.
//
// Leader only: the lane runs on the leader, so every event acknowledged
// before a registration has a log index at or below the leader's applied
// index. A follower's image is coherent with that only once its applied
// index reaches the leader's (read-index); the partition has no read-index
// path, so a follower answers NOT_LEADER, typed.
import {admitPartitionStatement} from './partition-statement-admission.js';
import {PARTITION_STATEMENT_KIND} from './partition-statement-admission-constants.js';
import {readPartitionAppliedIndex} from './partition-committed-log.js';
import {readCdcLedgerIncarnation} from './partition-cdc-obligation-ledger.js';
import {PARTITION_HYDRATION_IMAGE_PAGE_STATE as PAGE_STATE, PartitionHydrationImages} from
  './partition-hydration-image-pages.js';

const PARTITION_HYDRATION_IMAGE_STATE = Object.freeze({
  READ: 'read',
  NOT_LEADER: 'not_leader',
  REFUSED: 'refused',
});
// A group with no applied-state row has applied nothing.
const NOTHING_APPLIED_INDEX = '0';

// The query message fields that ask the partition for a page of its
// hydration image instead of an ordinary read (CDC Stage 3 re-list):
// `hydrationImage: true` and the page cursor {imageId (null for a new
// image), page}.
const PARTITION_HYDRATION_IMAGE_QUERY_FIELD = 'hydrationImage';
const PARTITION_HYDRATION_IMAGE_PAGE_FIELD = 'hydrationImagePage';
const PARTITION_HYDRATION_IMAGE_ERROR = Object.freeze({
  NOT_LEADER: 'partition_hydration_image_not_leader',
  REFUSED: 'partition_hydration_image_refused',
  // The image is not held here (closed, unknown, or asked out of order):
  // restart from page 0.
  EXPIRED: 'partition_hydration_image_expired',
  // Every image slot of this leader is held: retry after the hint.
  UNAVAILABLE: 'partition_hydration_image_unavailable',
  // One row is above the absolute per-row bound: it cannot be listed.
  ROW_EXCEEDS_BOUND: 'partition_hydration_image_row_exceeds_bound',
});

const PAGE_REFUSAL_CODE = Object.freeze({
  [PAGE_STATE.NOT_LEADER]: PARTITION_HYDRATION_IMAGE_ERROR.NOT_LEADER,
  [PAGE_STATE.EXPIRED]: PARTITION_HYDRATION_IMAGE_ERROR.EXPIRED,
  [PAGE_STATE.UNAVAILABLE]: PARTITION_HYDRATION_IMAGE_ERROR.UNAVAILABLE,
  [PAGE_STATE.ROW_EXCEEDS_BOUND]: PARTITION_HYDRATION_IMAGE_ERROR.ROW_EXCEEDS_BOUND,
});

function isPageCursor(cursor) {
  return cursor !== null && typeof cursor === 'object' && Number.isSafeInteger(cursor.page) &&
    cursor.page >= 0 && (cursor.imageId === null ||
      (typeof cursor.imageId === 'string' && cursor.imageId.length > 0));
}

function refusedAnswer(partition, errorCode, reason, retryAfterMs = undefined) {
  return {success: false, partitionId: partition.partitionId, deferRetry: true, errorCode,
    error: reason ?? errorCode, ...(retryAfterMs === undefined ? {} : {retryAfterMs})};
}

const PARTITION_SERVICE_HYDRATION_IMAGE_METHODS = Object.freeze({
  /**
   * Read a hydration image: the rows of one read statement and the durable
   * applied index P, in one synchronous span on the leader (the seed's
   * local read).
   * @param {string} sql - A read statement (admitted by the statement owner).
   * @return {Object} {state: READ, rows, appliedIndex (decimal string),
   *   tenure} or {state: NOT_LEADER | REFUSED, partitionId, reason}.
   */
  readHydrationImage(sql) {
    if (!this.isLeader || this.isShutdown) {
      return Object.freeze({state: PARTITION_HYDRATION_IMAGE_STATE.NOT_LEADER,
        partitionId: this.partitionId, reason: null});
    }
    const admission = admitPartitionStatement(this, sql, []);
    if (!admission.admitted || admission.kind !== PARTITION_STATEMENT_KIND.READ) {
      return Object.freeze({state: PARTITION_HYDRATION_IMAGE_STATE.REFUSED,
        partitionId: this.partitionId, reason: admission.reason ?? null});
    }
    const rows = admission.statement.all();
    const appliedIndex = readPartitionAppliedIndex(this) ?? NOTHING_APPLIED_INDEX;
    // The ledger incarnation the position belongs to, from the same span.
    const incarnation = this.db ? readCdcLedgerIncarnation(this.db) : null;
    return Object.freeze({state: PARTITION_HYDRATION_IMAGE_STATE.READ, rows,
      appliedIndex, incarnation, tenure: this.leadershipTenure, partitionId: this.partitionId});
  },

  /**
   * Answer one page of a hydration image (CDC Stage 3 re-list): the page's
   * rows, the leader witness and the source position {sourcePartition,
   * incarnation, appliedIndex} every page of the image is current as of,
   * plus the page {imageId, page, last, rowCount, byteCount}. Anything else
   * is a typed refusal the caller installs nothing from.
   * @param {string} sql - The image's read statement.
   * @param {Object} request - {cursor: {imageId, page}, maxRows, maxBytes}.
   * @return {Object} The answer.
   */
  answerHydrationImageQuery(sql, {cursor, maxRows, maxBytes}) {
    if (!isPageCursor(cursor)) {
      return refusedAnswer(this, PARTITION_HYDRATION_IMAGE_ERROR.REFUSED, 'page cursor');
    }
    if (cursor.imageId === null && this.isLeader && !this.isShutdown) {
      const admission = admitPartitionStatement(this, sql, []);
      if (!admission.admitted || admission.kind !== PARTITION_STATEMENT_KIND.READ) {
        return refusedAnswer(this, PARTITION_HYDRATION_IMAGE_ERROR.REFUSED,
          admission.reason ?? null);
      }
    }
    this.hydrationImages ??= new PartitionHydrationImages(this);
    let answer;
    try {
      answer = this.hydrationImages.page(sql, cursor, {maxRows, maxBytes});
    } catch (error) {
      return refusedAnswer(this, PARTITION_HYDRATION_IMAGE_ERROR.REFUSED,
        error?.message ?? String(error));
    }
    if (answer.state !== PAGE_STATE.PAGE) {
      return refusedAnswer(this, PAGE_REFUSAL_CODE[answer.state], answer.reason,
        answer.retryAfterMs);
    }
    const {image, page} = answer;
    return {success: true, rows: page.rows, rowSetComplete: page.last,
      partitionId: this.partitionId,
      readAuthorityWitness: {...this.buildRemoteReadAuthorityWitness(false),
        appliedIndex: image.appliedIndex},
      sourceImage: {sourcePartition: this.partitionId, incarnation: image.incarnation,
        appliedIndex: image.appliedIndex},
      imagePage: {imageId: image.imageId, page: page.page, last: page.last,
        rowCount: page.rowCount, byteCount: page.byteCount}};
  },
});

export {PARTITION_HYDRATION_IMAGE_ERROR, PARTITION_HYDRATION_IMAGE_PAGE_FIELD,
  PARTITION_HYDRATION_IMAGE_QUERY_FIELD, PARTITION_HYDRATION_IMAGE_STATE,
  PARTITION_SERVICE_HYDRATION_IMAGE_METHODS};
