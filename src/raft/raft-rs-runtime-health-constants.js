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
  // JavaScript outside Rust failed: a durable write, a send hook, an address
  // resolver, an application callback, a value the generated glue could not
  // convert. It says nothing about the runtime, which stays healthy.
  HOST_FAILED: 'host-failed',
  RUNTIME_UNHEALTHY: 'runtime-unhealthy',
});

// What ONE INVOCATION of a core primitive reported. Three, and no more: the
// binding returned normally, the binding returned its own refusal, or the
// call trapped. Anything else that comes out of an invocation is not the
// core's and is never given one of these names.
const RAFT_RS_INVOCATION_RESULT = Object.freeze({
  CORE_OK: 'core-ok',
  CORE_REFUSED: 'core-refused',
  CORE_FATAL: 'core-fatal',
});

// What KIND of operation an entry into the core is. The gate owns the
// difference and nothing else does: an active entry takes part in the group
// and a retired replica is refused one; a read inspects this replica's own
// state; a teardown releases its handle.
const RAFT_RS_CORE_ENTRY = Object.freeze({
  ACTIVE: 'active',
  READ: 'read',
  TEARDOWN: 'teardown',
});

// WHERE a failure came from. Three domains, and the outcome above is the
// consequence of one of them (prerequisite addendum §1).
const RAFT_RS_FAILURE_ORIGIN = Object.freeze({
  // The core itself declined a normal operation and returned. Nothing
  // unwound, so the runtime and every group in it are exactly as they were.
  CORE_REFUSAL: 'core-refusal',
  // The invocation trapped or panicked. §8's policy applies to this and to
  // nothing else.
  WASM_INVOCATION: 'wasm-invocation',
  // JavaScript outside Rust. It has its own recovery semantics and is never
  // evidence about the runtime.
  HOST: 'host',
});

// What each origin means for the call that met it: one mapping, used for a
// failure raised inside an invocation and for one raised in host code alike,
// so the two can never be answered differently by accident.
const RAFT_RS_ORIGIN_OUTCOME = Object.freeze({
  [RAFT_RS_FAILURE_ORIGIN.CORE_REFUSAL]: RAFT_RS_CALL_OUTCOME.CORE_REFUSED,
  [RAFT_RS_FAILURE_ORIGIN.WASM_INVOCATION]: RAFT_RS_CALL_OUTCOME.TRAPPED,
  [RAFT_RS_FAILURE_ORIGIN.HOST]: RAFT_RS_CALL_OUTCOME.HOST_FAILED,
});

// How the boundary tells the three apart, derived from the binding rather
// than from what a failure says.
//
// The fork builds every returned error with `jserr`, which is
// `JsValue::from_str` and is the only `Err` constructor in the whole crate,
// so wasm-bindgen throws a JavaScript STRING for a refusal - including for
// the arguments the binding itself rejects. A raft-rs fatal aborts on
// wasm32, and the abort reaches JavaScript as a `WebAssembly.RuntimeError`.
// Anything else thrown is JavaScript that is not the binding's refusal and
// not the core's trap: host code, or a value the generated glue could not
// convert. Nothing here depends on what a failure says, only on what it is.
//
// This matters because §6 forbids refusing a sender absent from the
// receiver's configuration, so `step` legitimately meets messages from peers
// raft-rs no longer knows and answers `StepPeerNotFound`. Treating that as a
// fatal would let one removed replica's stale heartbeat retire a runtime
// holding every group on the node.
const RAFT_RS_CORE_REFUSAL_TYPE = 'string';

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
  RAFT_RS_CORE_ENTRY,
  RAFT_RS_CORE_REFUSAL_TYPE,
  RAFT_RS_INVOCATION_RESULT,
  RAFT_RS_FAILURE_ORIGIN,
  RAFT_RS_GROUP_ORIGIN,
  RAFT_RS_ORIGIN_OUTCOME,
  RAFT_RS_PANIC_CHANNEL,
  RAFT_RS_PANIC_JOINER,
  RAFT_RS_RUNTIME_ERROR_MSG,
  RAFT_RS_RUNTIME_HEALTH,
};
