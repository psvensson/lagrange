/**
 * Owner contract:
 * Owner: the vocabulary of CANCEL_REPLICA_REMOVAL, the request by which an
 * operation that retains a replica (a REPLACE whose target died after its
 * source's removal began: D2, TARGET_DEAD_SOURCE_RETAINED) asks the
 * replica's node to cancel that removal (2026-11-11). The node's removal
 * owner (replica-removal-cancellation.js) is the one owner of "this
 * replica's removal is cancelled"; the REPLACE owner consumes its answer.
 * Request: {operationId, partitionId, replicaId, replicaGeneration} - the
 * removal of exactly that replica generation (its services row's
 * created_at) under exactly that operation; idempotent: a repeat answers the
 * state the first one left.
 * Canonical output: {answer, reason} with answer one of
 *   CANCELLED        cancelled as far as this replica's own log shows: the
 *                    durable row serves again (written from the exact
 *                    REMOVING generation), the replica's own applied
 *                    configuration still names it a voter after that write
 *                    with nothing unapplied in its log, and the removal's
 *                    consensus-exit wait was released so nothing local
 *                    retires its port. It does not see a RemoveNode an
 *                    earlier leader proposed that only another survivor
 *                    holds; if that entry later commits, the replica applies
 *                    its own removal with a serving row and no removal
 *                    running, and replica-removal-settlement.js converges it
 *                    (REMOVED_OUTSIDE_REMOVAL: it stops serving, is marked
 *                    FAILED, and the repair path removes and replaces it);
 *   ALREADY_REMOVED  the RemoveNode committed: the replica's own applied
 *                    configuration no longer names it - the removal
 *                    happened and completes;
 *   NOT_IN_PROGRESS  no removal of that generation is in progress here: its
 *                    row serves and its configuration names it a voter;
 *   UNAVAILABLE      nothing is concluded (membership or row unreadable, a
 *                    write that did not apply, another operation's removal,
 *                    a different generation): the asker waits and asks
 *                    again, never treating it as retained.
 * Prohibited: no answer from a row alone about membership, no answer from
 * elapsed time.
 */

const REPLICA_REMOVAL_CANCEL_ANSWER = Object.freeze({
  CANCELLED: 'cancelled',
  ALREADY_REMOVED: 'already_removed',
  NOT_IN_PROGRESS: 'not_in_progress',
  UNAVAILABLE: 'unavailable',
});

// Why an UNAVAILABLE (or the branch a definite answer took).
const REPLICA_REMOVAL_CANCEL_REASON = Object.freeze({
  REQUIRED_FIELDS: 'cancel_requires_operation_partition_replica_generation',
  MEMBERSHIP_UNAVAILABLE: 'membership_unavailable',
  LOG_UNSETTLED: 'own_log_holds_unapplied_entries',
  ROW_UNAVAILABLE: 'lifecycle_row_unavailable',
  ROW_ABSENT: 'lifecycle_row_absent',
  GENERATION_MISMATCH: 'replica_generation_mismatch',
  OTHER_OPERATION: 'removal_owned_by_other_operation',
  REVERT_NOT_APPLIED: 'serving_row_write_not_applied',
  REPUBLISH_NOT_APPLIED: 'retiring_row_republish_not_applied',
  NO_CONSENSUS_PORT: 'no_consensus_port',
  ROW_SERVING: 'row_serving',
  ROW_REVERTED: 'row_reverted_to_serving',
  REMOVAL_APPLIED: 'removal_applied',
});

export {REPLICA_REMOVAL_CANCEL_ANSWER, REPLICA_REMOVAL_CANCEL_REASON};
