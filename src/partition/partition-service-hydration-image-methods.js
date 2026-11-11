// The partition's hydration image (CDC decision D4, owner 2026-10-26): the
// rows of one admitted read together with the durable applied index P they
// are the state after. The partition's rows, its CDC obligation ledger and
// its rs-raft applied state are written in one transaction on one
// connection (raft-rs-application-transaction-owner.js), and both reads
// below are synchronous on that connection, so the image holds every entry
// at or below P and none above it. A subscriber registered before the image
// is read counts for every acknowledgement after its registration, so every
// ledger event above P reaches it through the obligation lane: hydration
// and live CDC meet at P with no gap.
//
// Leader only: the lane runs on the leader, so every event acknowledged
// before a registration has a log index at or below the leader's applied
// index. A follower's image is coherent with that only once its applied
// index reaches the leader's (read-index); the partition has no read-index
// path, so a follower answers NOT_LEADER, typed.
import {collectBoundedSqliteRows} from '../query/query-result-budget.js';
import {admitPartitionStatement} from './partition-statement-admission.js';
import {PARTITION_STATEMENT_KIND} from './partition-statement-admission-constants.js';
import {readPartitionAppliedIndex} from './partition-committed-log.js';
import {readCdcLedgerIncarnation} from './partition-cdc-obligation-ledger.js';

const PARTITION_HYDRATION_IMAGE_STATE = Object.freeze({
  READ: 'read',
  NOT_LEADER: 'not_leader',
  REFUSED: 'refused',
});
// A group with no applied-state row has applied nothing.
const NOTHING_APPLIED_INDEX = '0';

// The query message field that asks the partition for its hydration image
// instead of an ordinary read (CDC Stage 3 re-list): the rows and the
// position they are current as of come from one image.
const PARTITION_HYDRATION_IMAGE_QUERY_FIELD = 'hydrationImage';
const PARTITION_HYDRATION_IMAGE_ERROR = Object.freeze({
  NOT_LEADER: 'partition_hydration_image_not_leader',
  REFUSED: 'partition_hydration_image_refused',
  EXCEEDS_BOUND: 'partition_hydration_image_exceeds_bound',
});

function positiveLimit(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

const PARTITION_SERVICE_HYDRATION_IMAGE_METHODS = Object.freeze({
  /**
   * Read a hydration image: the rows of one read statement and the durable
   * applied index P, in one synchronous span on the leader.
   * @param {string} sql - A read statement (admitted by the statement owner).
   * @return {Object} {state: READ, rows, appliedIndex (decimal string),
   *   tenure} or {state: NOT_LEADER | REFUSED, partitionId, reason}.
   */
  readHydrationImage(sql, limits = {}) {
    if (!this.isLeader || this.isShutdown) {
      return Object.freeze({state: PARTITION_HYDRATION_IMAGE_STATE.NOT_LEADER,
        partitionId: this.partitionId, reason: null});
    }
    const admission = admitPartitionStatement(this, sql, []);
    if (!admission.admitted || admission.kind !== PARTITION_STATEMENT_KIND.READ) {
      return Object.freeze({state: PARTITION_HYDRATION_IMAGE_STATE.REFUSED,
        partitionId: this.partitionId, reason: admission.reason ?? null});
    }
    const rows = collectBoundedSqliteRows(admission.statement, [],
      {maxRows: positiveLimit(limits.maxRows), maxBytes: positiveLimit(limits.maxBytes)});
    const appliedIndex = readPartitionAppliedIndex(this) ?? NOTHING_APPLIED_INDEX;
    // The ledger incarnation the position belongs to, from the same span.
    const incarnation = this.db ? readCdcLedgerIncarnation(this.db) : null;
    return Object.freeze({state: PARTITION_HYDRATION_IMAGE_STATE.READ, rows,
      appliedIndex, incarnation, tenure: this.leadershipTenure, partitionId: this.partitionId});
  },

  /**
   * Answer a hydration-image query (CDC Stage 3 re-list): the image's rows,
   * the leader witness and the source position {sourcePartition,
   * incarnation, appliedIndex} the rows are current as of, all read in one
   * synchronous span on this leader. Anything else is a typed refusal: the
   * caller installs nothing.
   * @param {string} sql - The image's read statement.
   * @param {Object} limits - {maxRows, maxBytes}: the image's bound.
   * @return {Object} The answer.
   */
  answerHydrationImageQuery(sql, limits) {
    let image;
    try {
      image = this.readHydrationImage(sql, limits);
    } catch (error) {
      return {success: false, partitionId: this.partitionId,
        errorCode: PARTITION_HYDRATION_IMAGE_ERROR.EXCEEDS_BOUND,
        error: error?.message ?? String(error), deferRetry: true};
    }
    if (image.state !== PARTITION_HYDRATION_IMAGE_STATE.READ) {
      return {success: false, partitionId: this.partitionId, deferRetry: true,
        errorCode: image.state === PARTITION_HYDRATION_IMAGE_STATE.NOT_LEADER ?
          PARTITION_HYDRATION_IMAGE_ERROR.NOT_LEADER : PARTITION_HYDRATION_IMAGE_ERROR.REFUSED,
        error: image.reason ?? image.state};
    }
    const appliedIndex = Number(image.appliedIndex);
    return {success: true, rows: image.rows, rowSetComplete: true,
      partitionId: this.partitionId,
      readAuthorityWitness: {...this.buildRemoteReadAuthorityWitness(false), appliedIndex},
      sourceImage: {sourcePartition: this.partitionId, incarnation: image.incarnation,
        appliedIndex}};
  },
});

export {PARTITION_HYDRATION_IMAGE_ERROR, PARTITION_HYDRATION_IMAGE_QUERY_FIELD,
  PARTITION_HYDRATION_IMAGE_STATE, PARTITION_SERVICE_HYDRATION_IMAGE_METHODS};
