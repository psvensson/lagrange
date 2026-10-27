// Resource custody is part of lifecycle preparation, never allocation authority.
// Keep failed acquisitions reachable even after the public startup ledger has
// unwound and no runtime handle was returned to its caller.
import Database from 'better-sqlite3';
import {ORIGINAL_ALLOCATION_REASON as REASON,
  originalAllocationError} from './raft-rs-original-allocation-constants.js';

const retainedPreparations = new Set();
const SLOT_STATE = Object.freeze({OPENING: 'OPENING', OPEN: 'OPEN', CLOSED: 'CLOSED'});

class RaftRsPreparationCustody {
  #slots = new Map();

  open(member, options = {}) {
    if (this.#slots.has(member.replicaId)) {
      throw originalAllocationError(REASON.RESOURCE, member.replicaId);
    }
    const slot = {member, state: SLOT_STATE.OPENING, db: null};
    this.#slots.set(member.replicaId, slot);
    retainedPreparations.add(this);
    try {
      // Nothing callback-capable may intervene between return and assignment.
      // A native constructor failure returns no handle; that dependency owns
      // its internal cleanup, separately from the formatter-failure window.
      slot.db = new Database(member.dbPath, options);
      slot.state = SLOT_STATE.OPEN;
      return slot.db;
    } catch (error) {
      slot.state = SLOT_STATE.CLOSED;
      this.#slots.delete(member.replicaId);
      if (this.#slots.size === 0) retainedPreparations.delete(this);
      throw error;
    }
  }

  closeAll() {
    const errors = [];
    for (const [key, slot] of this.#slots) {
      try {
        slot.db.close();
        if (slot.db.open !== false) throw originalAllocationError(REASON.RESOURCE, key);
        slot.state = SLOT_STATE.CLOSED;
        this.#slots.delete(key);
      } catch (error) {
        errors.push(error);
      }
    }
    if (this.#slots.size === 0) retainedPreparations.delete(this);
    if (errors.length > 0) throw new AggregateError(errors, REASON.RESOURCE);
  }

  observe() {
    return Object.freeze([...this.#slots.values()].map(({member, state, db}) =>
      Object.freeze({replicaId: member.replicaId, dbPath: member.dbPath,
        state, open: db?.open === true})));
  }
}

export {RaftRsPreparationCustody};
