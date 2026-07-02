import {
  RAFT_PROVIDER_CONTRACT,
  RAFT_PROVIDER_CONTRACT_ERROR_MSG,
} from './raft-provider-contract-constants.js';

/**
 * Validate raft provider contract implementation.
 * @param {*} raftProvider
 */
function assertRaftProviderContract(raftProvider) {
  if (!raftProvider) {
    throw new Error(RAFT_PROVIDER_CONTRACT_ERROR_MSG.MISSING_PROVIDER);
  }

  for (const methodName of RAFT_PROVIDER_CONTRACT.REQUIRED_METHODS) {
    if (typeof raftProvider[methodName] !== 'function') {
      throw new Error(
        RAFT_PROVIDER_CONTRACT_ERROR_MSG.invalidProviderMethod(methodName),
      );
    }
  }
}

export {assertRaftProviderContract};
