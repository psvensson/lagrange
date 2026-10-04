// The delivered envelope the witnesses of a shared-core trap use to make
// the real WASM core trap through one port.
//
// It used to be a heartbeat whose commit lies beyond the recipient's log; the
// local-log guard now refuses that one before step (and holds the group for
// a reseed). What still reaches the core is an append whose own index is the
// recipient's commit index - so the crate reads its entries - carrying one
// entry that does not follow it: raft-rs's maybe_append slices its entries
// from the first conflict and runs past their end (raft_log.rs). That is the
// entry-contiguity precondition the design verification left to a schema
// check in admitRaftRsMessage (a recorded follow-up); when it closes, these
// witnesses need another trap source.

import Database from 'better-sqlite3';

import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';

// How far past the recipient's commit the lone carried entry claims to sit.
const NON_CONTIGUOUS_GAP = 5;
const NO_TERM = '0';

function termAt(dbFile, groupId, index) {
  const db = new Database(dbFile, {readonly: true});
  try {
    const row = db.prepare(`SELECT term FROM ${RAFT_RS_TABLE.LOG} ` +
      'WHERE group_id = ? AND log_index = ?').safeIntegers(true)
      .get(groupId, BigInt(index));
    return row === undefined ? NO_TERM : String(row.term);
  } finally {
    db.close();
  }
}

/**
 * The trapping envelope for one replica.
 * @param {Object} options - {dbFile, groupId, status (the recipient's port
 *   status: peerId, term, commitIndex), from (the sender's raft peer id),
 *   term (the message's term, decimal string)}.
 * @return {Object} The envelope, as the transport carries one.
 */
function coreTrappingAppend({dbFile, groupId, status, from, term}) {
  const commit = BigInt(status.commitIndex);
  return {
    groupId,
    to: status.peerId,
    message: {
      from,
      to: status.peerId,
      msgType: RAFT_RS_MESSAGE_TYPE.APPEND,
      term,
      index: String(commit),
      logTerm: termAt(dbFile, groupId, commit),
      commit: String(commit),
      entries: [{
        index: String(commit + BigInt(NON_CONTIGUOUS_GAP)),
        term,
        entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
      }],
    },
  };
}

export {coreTrappingAppend};
