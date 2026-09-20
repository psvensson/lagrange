// The health a raft-rs runtime is in, and the outcome of asking it to do
// something.
//
// Both are named states rather than booleans or absences: §8 of the binding
// direction makes "a trap happened here" a property of the RUNTIME, not of
// the call that hit it, and a host that stopped dispatching must say so by
// name rather than by silence.

const RAFT_RS_RUNTIME_HEALTH = Object.freeze({
  HEALTHY: 'healthy',
  // A raft-rs fatal traps the WASM instance. The verified evidence is that
  // repeated fatals eventually make the instance unusable, so one is enough
  // to retire it.
  UNHEALTHY_AFTER_TRAP: 'unhealthy-after-trap',
});

const RAFT_RS_CALL_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  TRAPPED: 'trapped',
  RUNTIME_UNHEALTHY: 'runtime-unhealthy',
});

// A raft-rs fatal arrives in JavaScript as a bare trap with no diagnosis on
// it; the reason is written by the crate's panic hook to console.error. The
// boundary listens on that channel for the duration of one call, which is the
// only place a diagnosis exists.
const RAFT_RS_PANIC_CHANNEL = 'error';

// How the captured panic output is put back together: one console.error call
// joins its arguments the way a console does, and several calls are separate
// lines of one diagnosis.
const RAFT_RS_PANIC_JOINER = Object.freeze({
  ARGUMENTS: ' ',
  LINES: '\n',
});

const RAFT_RS_RUNTIME_ERROR_MSG = Object.freeze({
  unknownGroup: (groupId) =>
    `no group ${JSON.stringify(groupId)} is registered with this runtime; a ` +
    'runtime restores the groups it was told to hold',
  stillUnhealthy: () =>
    'this runtime trapped and has not been replaced; replaceRuntime() ' +
    'instantiates a fresh one and restores its groups from durable state',
});

export {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_PANIC_CHANNEL,
  RAFT_RS_PANIC_JOINER,
  RAFT_RS_RUNTIME_ERROR_MSG,
  RAFT_RS_RUNTIME_HEALTH,
};
