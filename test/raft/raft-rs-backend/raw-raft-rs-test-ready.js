// Historical low-level Ready driver used only by the pre-port phase probes.
import {
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
  RAFT_RS_CYCLE_OUTCOME,
} from '../../../src/raft/raft-rs-ready-loop-constants.js';
import {RAFT_RS_HOST_STEPS} from
  '../../../src/raft/raft-rs-host-contract.js';
import {
  RAFT_RS_READY_DRAIN_MAX_CYCLES,
} from '../../../src/raft/raft-rs-group-constants.js';

function applyEntry(context, entry) {
  let confState;
  if (RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(entry.entryType)) {
    const change = context.core.decode_conf_change_entry(
      entry.entryType, entry.data);
    confState = context.core.apply_conf_change(context.handle, change);
    context.core.set_conf_state(context.handle, confState);
    context.applied.push({index: entry.index, confChange: change});
  } else {
    context.applyEntry?.(entry);
    confState = context.core.conf_state(context.handle);
    context.applied.push({index: entry.index, confChange: null});
  }
  context.store.putAppliedState(context.groupId, entry.index, confState);
}

function persistReadyState(options, ready) {
  const {core, handle, store, groupId} = options;
  if (ready.snapshot) {
    store.putSnapshot(groupId, ready.snapshot);
  }
  store.appendEntries(groupId, ready.entries || []);
  if (ready.hardState) {
    store.putHardState(groupId, ready.hardState);
  }
  core.persist_ready(handle);
}

function runReadyCycle(options) {
  const {core, handle, store, groupId} = options;
  if (!core.has_ready(handle)) {
    return {outcome: RAFT_RS_CYCLE_OUTCOME.NOTHING_READY};
  }
  const ready = core.take_ready(handle);
  const applied = [];
  const sent = [];
  const send = (messages) => {
    sent.push(...messages);
    options.send?.(messages);
  };
  send(ready.messages || []);
  persistReadyState(options, ready);
  const context = {...options, applied};
  for (const entry of ready.committedEntries || []) {
    applyEntry(context, entry);
  }
  send(ready.persistedMessages || []);
  const lightReady = core.advance_append(handle);
  if (lightReady.commitIndex !== undefined) {
    store.putCommitIndex(groupId, lightReady.commitIndex);
    core.persist_commit_index(handle, lightReady.commitIndex);
  }
  send(lightReady.messages || []);
  for (const entry of lightReady.committedEntries || []) {
    applyEntry(context, entry);
  }
  core.advance_apply(handle);
  return {
    outcome: RAFT_RS_CYCLE_OUTCOME.CYCLE_RAN,
    ready,
    lightReady,
    applied,
    sent,
    stepsRun: RAFT_RS_HOST_STEPS.map((step) => step.id),
  };
}

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
