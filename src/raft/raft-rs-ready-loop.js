// One raft-rs Ready cycle, run in the order the host contract states.
//
// The loop keeps no order of its own: it iterates RAFT_RS_HOST_STEPS and
// dispatches each step id to the handler of the same name. Reordering the
// loop means reordering the contract, and the contract's order is the one
// raft-rs 0.7's own sources impose (see raft-rs-host-contract.js).
//
// Every durable write goes through the store the caller supplied. The store
// is the only durable authority here: the WASM module's MemStorage is process
// memory, and a restart is rebuilt from the store alone.

import {
  RAFT_RS_HOST_STEP,
  RAFT_RS_HOST_STEPS,
} from './raft-rs-host-contract.js';
import {
  RAFT_RS_APPLY_PHASE,
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
  RAFT_RS_CYCLE_OUTCOME,
  RAFT_RS_LOOP_ERROR_MSG,
} from './raft-rs-ready-loop-constants.js';
import {
  RAFT_RS_READY_DRAIN_MAX_CYCLES,
} from './raft-rs-group-constants.js';

/**
 * Apply one committed entry and durably record the applied index together
 * with the configuration that index includes.
 *
 * A configuration entry is decoded and applied by the core; the ConfState the
 * core RETURNS is what gets stored. A normal entry leaves the configuration
 * alone, so the configuration read back from the core is stored with it - the
 * pair is written by one statement either way.
 * @param {Object} context - The cycle context.
 * @param {Object} entry - A committed entry from the core.
 * @param {string} phase - Which half of the cycle delivered it.
 */
function applyCommittedEntry(context, entry, phase) {
  const {core, handle, store, groupId, applyEntry} = context;
  if (RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(entry.entryType)) {
    const change = core.decode_conf_change_entry(entry.entryType, entry.data);
    const confState = core.apply_conf_change(handle, change);
    core.set_conf_state(handle, confState);
    store.putAppliedState(groupId, entry.index, confState);
    context.applied.push({index: entry.index, phase, confChange: change});
    return;
  }
  if (entry.data !== undefined && typeof applyEntry === 'function') {
    applyEntry(entry);
  }
  store.putAppliedState(groupId, entry.index, core.conf_state(handle));
  context.applied.push({index: entry.index, phase, confChange: null});
}

const STEP_HANDLER = Object.freeze({
  [RAFT_RS_HOST_STEP.TAKE_READY]: (context) => {
    context.ready = context.core.take_ready(context.handle);
  },
  [RAFT_RS_HOST_STEP.SEND_READY_MESSAGES]: (context) => {
    context.send(context.ready.messages || []);
  },
  [RAFT_RS_HOST_STEP.PERSIST_SNAPSHOT]: (context) => {
    if (context.ready.snapshot) {
      context.store.putSnapshot(context.groupId, context.ready.snapshot);
    }
  },
  [RAFT_RS_HOST_STEP.PERSIST_ENTRIES]: (context) => {
    context.store.appendEntries(context.groupId, context.ready.entries || []);
  },
  [RAFT_RS_HOST_STEP.PERSIST_HARD_STATE]: (context) => {
    if (context.ready.hardState) {
      context.store.putHardState(context.groupId, context.ready.hardState);
    }
    // The three writes of the contract's snapshot, entries and hard-state
    // steps are now durable. `persist_ready` is the binding's one call that
    // makes the SAME three writes into the core's own Storage, which is the
    // Storage trait the RawNode reads through. It runs last, so the core
    // never believes something the durable record does not already hold.
    context.core.persist_ready(context.handle);
  },
  [RAFT_RS_HOST_STEP.APPLY_READY_COMMITTED_ENTRIES]: (context) => {
    for (const entry of context.ready.committedEntries || []) {
      applyCommittedEntry(context, entry, RAFT_RS_APPLY_PHASE.READY);
    }
  },
  [RAFT_RS_HOST_STEP.SEND_PERSISTED_MESSAGES]: (context) => {
    context.send(context.ready.persistedMessages || []);
  },
  [RAFT_RS_HOST_STEP.ADVANCE_APPEND]: (context) => {
    context.lightReady = context.core.advance_append(context.handle);
  },
  [RAFT_RS_HOST_STEP.PERSIST_LIGHT_COMMIT_INDEX]: (context) => {
    if (context.lightReady.commitIndex !== undefined) {
      context.store.putCommitIndex(
        context.groupId, context.lightReady.commitIndex);
      // Durable first, then the same commit index into the core's Storage.
      context.core.persist_commit_index(
        context.handle, context.lightReady.commitIndex);
    }
  },
  [RAFT_RS_HOST_STEP.SEND_LIGHT_MESSAGES]: (context) => {
    context.send(context.lightReady.messages || []);
  },
  [RAFT_RS_HOST_STEP.APPLY_LIGHT_COMMITTED_ENTRIES]: (context) => {
    for (const entry of context.lightReady.committedEntries || []) {
      applyCommittedEntry(context, entry, RAFT_RS_APPLY_PHASE.LIGHT_READY);
    }
  },
  [RAFT_RS_HOST_STEP.ADVANCE_APPLY]: (context) => {
    context.core.advance_apply(context.handle);
  },
});

/**
 * Run one Ready cycle if the core has one ready.
 * @param {Object} options - The cycle inputs.
 * @param {Object} options.core - The raft-rs primitive facade.
 * @param {number} options.handle - This group's core handle.
 * @param {Object} options.store - The durable Raft record.
 * @param {string} options.groupId - The group whose record is written.
 * @param {Function} [options.send] - Sends the messages a step produced.
 * @param {Function} [options.applyEntry] - Applies a normal committed entry.
 * @return {Object} A named outcome: NOTHING_READY when the core had no Ready,
 *   otherwise CYCLE_RAN with what the cycle did.
 */
function runReadyCycle({core, handle, store, groupId, send, applyEntry}) {
  if (!core.has_ready(handle)) {
    return {outcome: RAFT_RS_CYCLE_OUTCOME.NOTHING_READY};
  }
  const context = {
    core, handle, store, groupId, applyEntry,
    ready: null,
    lightReady: null,
    applied: [],
    sent: [],
    stepsRun: [],
    send(messages) {
      context.sent.push(...messages);
    },
  };
  if (typeof send === 'function') {
    context.send = (messages) => {
      context.sent.push(...messages);
      send(messages);
    };
  }
  for (const step of RAFT_RS_HOST_STEPS) {
    const handler = STEP_HANDLER[step.id];
    if (!handler) {
      throw new Error(RAFT_RS_LOOP_ERROR_MSG.unknownStep(step.id));
    }
    handler(context);
    context.stepsRun.push(step.id);
  }
  return {
    outcome: RAFT_RS_CYCLE_OUTCOME.CYCLE_RAN,
    ready: context.ready,
    lightReady: context.lightReady,
    applied: context.applied,
    sent: context.sent,
    stepsRun: context.stepsRun,
  };
}

/**
 * Run Ready cycles until the core has nothing ready, bounded.
 * @param {Object} options - The same inputs as runReadyCycle.
 * @param {number} [options.maxCycles] - The bound on cycles.
 * @return {Array<Object>} What each cycle did.
 */
function drainReady(options) {
  const maxCycles = options.maxCycles ?? RAFT_RS_READY_DRAIN_MAX_CYCLES;
  const cycles = [];
  while (cycles.length < maxCycles) {
    const cycle = runReadyCycle(options);
    if (cycle.outcome === RAFT_RS_CYCLE_OUTCOME.NOTHING_READY) {
      break;
    }
    cycles.push(cycle);
  }
  return cycles;
}

export {drainReady};
