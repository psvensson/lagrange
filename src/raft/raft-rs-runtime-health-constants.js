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

// How a group came to be in the runtime that holds it. A restart is not a
// second formation, so which of the two happened is a named fact a caller can
// read rather than something inferred from whether a configuration looks
// familiar.
const RAFT_RS_GROUP_ORIGIN = Object.freeze({
  CREATED_FRESH: 'created-fresh',
  RESTORED_FROM_DURABLE_RECORD: 'restored-from-durable-record',
  ADOPTED: 'adopted-already-running',
});

const RAFT_RS_CALL_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  // raft-rs returned an Err the binding handed back, not a fatal. The call
  // did not happen; the runtime is untouched and stays healthy.
  CORE_REFUSED: 'core-refused',
  TRAPPED: 'trapped',
  RUNTIME_UNHEALTHY: 'runtime-unhealthy',
});

// How the boundary tells a raft-rs Err from a raft-rs fatal.
//
// The binding builds every returned error with `jserr`, which is
// `JsValue::from_str`, so wasm-bindgen throws a JavaScript STRING. A fatal
// unwinds the WASM instance and reaches JavaScript as a
// `WebAssembly.RuntimeError`, which is an `Error`. The discriminator is
// therefore the binding's own error convention rather than a guess about a
// message: anything that is not an Error is the core declining a call, and
// §8's rule - a trap invalidates the runtime - applies to the other kind.
//
// This matters because §6 forbids refusing a sender absent from the
// receiver's configuration, so `step` legitimately meets messages from peers
// raft-rs no longer knows and answers `StepPeerNotFound`. Treating that as a
// fatal would let one removed replica's stale heartbeat retire a runtime
// holding every group on the node.
const RAFT_RS_FATAL_IS_AN_ERROR_INSTANCE = true;

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
  RAFT_RS_FATAL_IS_AN_ERROR_INSTANCE,
  RAFT_RS_GROUP_ORIGIN,
  RAFT_RS_PANIC_CHANNEL,
  RAFT_RS_PANIC_JOINER,
  RAFT_RS_RUNTIME_ERROR_MSG,
  RAFT_RS_RUNTIME_HEALTH,
};
