/**
 * Constants for snapshot replay runtime and determinism checks.
 */

const REPLAY_RUNTIME_DEFAULT = Object.freeze({
  INSTANCE_ID_PREFIX: 'replay-',
  INITIAL_FRAME_CURSOR: 0,
  INITIAL_HOST_CALL_CURSOR: 0,
});

const REPLAY_DRIFT_REASON = Object.freeze({
  LEDGER_EXHAUSTED: 'ledger_exhausted',
  HOST_CALL_MISMATCH: 'host_call_mismatch',
  HOST_CALL_ARGS_MISMATCH: 'host_call_args_mismatch',
  UNCONSUMED_LEDGER_ENTRIES: 'unconsumed_ledger_entries',
});

const REPLAY_RUNTIME_ERROR_MSG = Object.freeze({
  REQUEST_REQUIRED: 'Replay request is required',
  SNAPSHOT_REQUIRED: 'Replay runtime requires snapshot object',
  MANIFEST_REQUIRED: 'Replay runtime requires manifest object',
  INSTANCE_HANDLE_REQUIRED:
    'Replay runtime requires instanceHandle',
  INSTANCE_NOT_READY: 'Replay runtime instance is not loaded',
  HOST_CALL_REQUIRED:
    'Replay runtime host-call request requires namespace and functionName',
});

export {
  REPLAY_RUNTIME_DEFAULT,
  REPLAY_DRIFT_REASON,
  REPLAY_RUNTIME_ERROR_MSG,
};
