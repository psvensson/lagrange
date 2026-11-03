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

const PARTITION_HYDRATION_IMAGE_STATE = Object.freeze({
  READ: 'read',
  NOT_LEADER: 'not_leader',
  REFUSED: 'refused',
});
// A group with no applied-state row has applied nothing.
const NOTHING_APPLIED_INDEX = '0';

const PARTITION_SERVICE_HYDRATION_IMAGE_METHODS = Object.freeze({
  /**
   * Read a hydration image: the rows of one read statement and the durable
   * applied index P, in one synchronous span on the leader.
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
    const rows = collectBoundedSqliteRows(admission.statement, [], {});
    const appliedIndex = readPartitionAppliedIndex(this) ?? NOTHING_APPLIED_INDEX;
    return Object.freeze({state: PARTITION_HYDRATION_IMAGE_STATE.READ, rows,
      appliedIndex, tenure: this.leadershipTenure, partitionId: this.partitionId});
  },
});

export {PARTITION_HYDRATION_IMAGE_STATE, PARTITION_SERVICE_HYDRATION_IMAGE_METHODS};
