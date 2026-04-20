const OWNER_CONTRACT_STATE = Object.freeze({
  READY: 'ready',
  PENDING: 'pending',
  DEFERRED: 'deferred',
  BLOCKED: 'blocked',
  FAILED: 'failed',
});

const OWNER_CONTRACT_NEXT_ACTION = Object.freeze({
  PROCEED: 'proceed',
  WAIT: 'wait',
  RETRY: 'retry',
  STOP: 'stop',
});

function normalizeOwnerContractState(value, fallback = null) {
  for (const contractState of Object.values(OWNER_CONTRACT_STATE)) {
    if (value === contractState) {
      return contractState;
    }
  }
  return fallback;
}

function normalizeOwnerContractNextAction(value, fallback = null) {
  for (const nextAction of Object.values(OWNER_CONTRACT_NEXT_ACTION)) {
    if (value === nextAction) {
      return nextAction;
    }
  }
  return fallback;
}

function buildOwnerContractOutcome(options = {}) {
  return Object.freeze({
    contractState: normalizeOwnerContractState(
      options?.contractState,
      OWNER_CONTRACT_STATE.FAILED,
    ),
    nextAction: normalizeOwnerContractNextAction(
      options?.nextAction,
      OWNER_CONTRACT_NEXT_ACTION.STOP,
    ),
  });
}

export {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
  normalizeOwnerContractNextAction,
  normalizeOwnerContractState,
};
