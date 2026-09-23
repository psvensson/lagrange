// The partition's committed log, as the rs-raft durable store holds it.
//
// The rs-raft durable store is the partition's only durable log. Every
// consumer of the committed log - HLC warm-up at restart, the split/merge
// mirror replay cursor, prepared-state reconstruction - asks here, so the
// consensus group a partition runs (the partition id, as the raft init owner
// names it in the partition request) and the store it reads are named once.
//
// Read-only and DDL-free: nothing here constructs the store (whose
// constructor creates its tables), proposes, applies or rewrites an entry. A
// database without the rs-raft record's tables has no applied proposals and
// no applied index. An undecodable applied entry fails closed with the
// proposal codec's typed error.

import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';

/**
 * The partition's applied proposals (the prefix its state machine holds), in
 * log order.
 * @param {Object} service - The partition (its open `db` and `partitionId`).
 * @return {Array<Object>} Frozen {index, term, command} records; index and
 *   term are decimal strings, as the store owner returns them.
 */
function readPartitionCommittedCommands(service) {
  return RaftRsDurableStore.readCommittedEntriesIn(
    service.db, service.partitionId);
}

/**
 * The partition's durable applied index: the last entry its state machine
 * holds, written atomically with the state machine's SQL.
 * @param {Object} service - The partition (its open `db` and `partitionId`).
 * @return {string|null} The applied index as a decimal string, or null when
 *   the group has no applied state yet.
 */
function readPartitionAppliedIndex(service) {
  return RaftRsDurableStore.readAppliedIndexIn(
    service.db, service.partitionId);
}

export {readPartitionAppliedIndex, readPartitionCommittedCommands};
