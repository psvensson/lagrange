// The delivered envelope the witnesses of a shared-core trap use to make
// the core trap through one port.
//
// No peer input can trap the core any more: the ingress refuses every shape
// raft-rs traps on (raft-rs-ingress.js; the fuzz witness
// raft-rs-ingress-fuzz.test.js drives thousands of hostile envelopes through
// a real port and observes no trap). It used to be a non-contiguous append,
// and before that a heartbeat beyond the recipient's log. So the trap is
// injected at the core boundary instead (the runtime owner's
// setCoreFaultInjector test seam): the envelope is a well-formed,
// admissible append carrying no entries, and the core's `step` of exactly
// that message throws a WebAssembly.RuntimeError inside the runtime's core
// containment, as a real trap does - the runtime is marked unhealthy and
// replaced, every group restored from its durable record, exactly as before.
// The injection is one-shot and matches only this message.

import Database from 'better-sqlite3';

import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {setCoreFaultInjector} from
  '../../../src/raft/raft-rs-runtime-owner.js';

const NO_TERM = '0';
const STEP = 'step';
const TRAP_MESSAGE = 'unreachable';

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

function sameMessage(stepped, message) {
  return stepped?.msgType === message.msgType &&
    stepped.from === message.from && stepped.to === message.to &&
    stepped.term === message.term && stepped.index === message.index;
}

// Arm the one-shot trap: the core's step of exactly `message` in `groupId`
// throws as a trapped WASM instance does.
function armTrapOn(groupId, message) {
  setCoreFaultInjector((stepGroupId, operation, args) => {
    if (stepGroupId === groupId && operation === STEP &&
        sameMessage(args[0], message)) {
      setCoreFaultInjector(null);
      throw new globalThis.WebAssembly.RuntimeError(TRAP_MESSAGE);
    }
  });
}

/**
 * The trapping envelope for one replica (the trap is armed by this call).
 * @param {Object} options - {dbFile, groupId, status (the recipient's port
 *   status: peerId, term, commitIndex), from (the sender's raft peer id),
 *   term (the message's term, decimal string)}.
 * @return {Object} The envelope, as the transport carries one.
 */
function coreTrappingAppend({dbFile, groupId, status, from, term}) {
  const commit = BigInt(status.commitIndex);
  const message = {
    from,
    to: status.peerId,
    msgType: RAFT_RS_MESSAGE_TYPE.APPEND,
    term,
    index: String(commit),
    logTerm: termAt(dbFile, groupId, commit),
    commit: String(commit),
    entries: [],
  };
  armTrapOn(groupId, message);
  return {groupId, to: status.peerId, message};
}

export {coreTrappingAppend};
