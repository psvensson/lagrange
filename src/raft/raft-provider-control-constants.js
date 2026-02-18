const RAFT_PROVIDER_CONTROL = Object.freeze({
  ENV_KEY: 'RAFT_PROVIDER',
  LIFERAFT: 'liferaft',
  RAFT_LOGIC: 'raft_logic',
  RAFT_LOGIC_SPIKE: 'raft_logic_spike',
});

const RAFT_PROVIDER_ERROR_MSG = Object.freeze({
  INVALID_PROVIDER:
    'Unsupported raft provider value; expected liferaft, raft_logic, or raft_logic_spike',
  processProviderLocked: (selected, requested) =>
    `Raft provider already selected for process: ${selected}; ` +
    `cannot switch to ${requested} without restart`,
  runtimeProviderNotImplemented: (provider) =>
    `Configured raft provider ${provider} is not available in this runtime path; ` +
    'use liferaft',
});

const RAFT_PROVIDER_LOG_MSG = Object.freeze({
  SELECTED: 'Selected raft provider for process startup',
});

export {
  RAFT_PROVIDER_CONTROL,
  RAFT_PROVIDER_ERROR_MSG,
  RAFT_PROVIDER_LOG_MSG,
};
