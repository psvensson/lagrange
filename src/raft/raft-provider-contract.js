import {
  RAFT_PROVIDER_CONTRACT,
  RAFT_PROVIDER_CONTRACT_ERROR_MSG,
} from './raft-provider-contract-constants.js';

/**
 * Validate raft provider contract implementation.
 * @param {*} raftProvider
 */
function assertRaftProviderContract(raftProvider) {
  assertMethods(raftProvider, RAFT_PROVIDER_CONTRACT.REQUIRED_METHODS);
}

function assertPartitionRaftProviderContract(raftProvider) {
  assertMethods(raftProvider, RAFT_PROVIDER_CONTRACT.REQUIRED_PARTITION_METHODS);
}

function assertMethods(raftProvider, methods) {
  if (!raftProvider) {
    throw new Error(RAFT_PROVIDER_CONTRACT_ERROR_MSG.MISSING_PROVIDER);
  }

  for (const methodName of methods) {
    if (typeof raftProvider[methodName] !== 'function') {
      throw new Error(
        RAFT_PROVIDER_CONTRACT_ERROR_MSG.invalidProviderMethod(methodName),
      );
    }
  }
}

export {assertPartitionRaftProviderContract, assertRaftProviderContract};
