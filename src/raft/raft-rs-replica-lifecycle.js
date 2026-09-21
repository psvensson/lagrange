// Whether THIS LOCAL REPLICA may take an active part in its group at all.
//
// It is the Lagrange runtime-lifecycle question, and it sits above raft-rs
// (prerequisite addendum §5 and §7). It is NOT membership, and the two
// deliberately disagree: a replica removed while it could not hear the
// cluster still holds a configuration that lists itself as a voter, and that
// configuration is preserved, because it is what this node last knew about
// consensus membership. Retirement records something else entirely - whether
// this local runtime may participate - and it is read from the replica's own
// durable record, which is the only authority that survives a restart and the
// only one available before anything in the process has learned anything.
//
// Everything that may refuse an active call asks THIS object, so there is one
// answer in the process rather than one per caller: the node asks it before
// touching the core, the tick driver asks it before scheduling, and the
// election guard asks it before campaigning. A retired identity is never
// reactivated here, because nothing in this owner ever clears the record.

import {
  RAFT_RS_NODE_ADMISSION,
  RAFT_RS_NODE_ERROR_MSG,
} from './raft-rs-node-constants.js';
import {
  RAFT_RS_SCHEDULING_ELIGIBILITY,
} from './raft-rs-durable-store-constants.js';

const ADMITTED = Object.freeze({
  admitted: true,
  outcome: RAFT_RS_NODE_ADMISSION.ADMITTED,
  detail: null,
});

/**
 * One local replica's lifecycle, read from its own durable record.
 */
class RaftRsReplicaLifecycle {
  /**
   * @param {Object} parts - What identifies this local replica.
   * @param {Object} parts.store - Its durable Raft record.
   * @param {string} parts.groupId - The group.
   * @param {string} parts.peerId - Its raft peer id, as a decimal string.
   */
  constructor({store, groupId, peerId}) {
    this.store = store;
    this.groupId = groupId;
    this.peerId = peerId;
    // Read at construction, which for a restart is before a tick driver
    // exists and before any message can arrive.
    this.record = store.readRetirement(groupId, peerId);
  }

  /** @return {boolean} Whether the durable record retired this replica. */
  get retired() {
    return this.record.eligibility === RAFT_RS_SCHEDULING_ELIGIBILITY.RETIRED;
  }

  /** @return {string|null} When the decision was taken, or null. */
  get retiredAt() {
    return this.record.retiredAt;
  }

  /**
   * Durably retire this replica, and answer from the record afterwards.
   *
   * Idempotent, because the durable owner is: retiring twice keeps the first
   * moment. The configuration is not touched - retirement is not a
   * membership change and never pretends to be one.
   * @param {string} retiredAt - When the decision was taken.
   * @return {string} The recorded retirement moment.
   */
  retire(retiredAt) {
    const recorded = this.store.putRetirement(
      this.groupId, this.peerId, retiredAt);
    this.record = this.store.readRetirement(this.groupId, this.peerId);
    return recorded;
  }

  /**
   * Whether tearing this replica down is admitted.
   *
   * It always is, and that is a decision rather than an omission: freeing a
   * retired replica's handle is how the host stops using it, and refusing
   * would leak the very resource retirement is telling it to release.
   * Teardown takes no part in the group - it can originate nothing.
   * @return {Object} {admitted, outcome, detail}.
   */
  admitTeardown() {
    return ADMITTED;
  }

  /**
   * Whether an active call on this replica is admitted.
   *
   * A frozen named result either way: a caller can never read admission out
   * of an absent error, and the refusal carries what it refused and why.
   * @return {Object} {admitted, outcome, detail}.
   */
  admit() {
    if (!this.retired) {
      return ADMITTED;
    }
    return Object.freeze({
      admitted: false,
      outcome: RAFT_RS_NODE_ADMISSION.REPLICA_RETIRED,
      detail: RAFT_RS_NODE_ERROR_MSG.replicaRetired(
        this.groupId, this.peerId, this.retiredAt),
    });
  }
}

export {RaftRsReplicaLifecycle};
