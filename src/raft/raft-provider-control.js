import {
  RAFT_PROVIDER_CONTROL,
  RAFT_PROVIDER_ERROR_MSG,
} from './raft-provider-control-constants.js';

const SUPPORTED_RAFT_PROVIDERS = new Set([
  RAFT_PROVIDER_CONTROL.LIFERAFT,
  RAFT_PROVIDER_CONTROL.RAFT_LOGIC,
  RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE,
]);

let processRaftProvider = null;

/**
 * Resolve configured raft provider from environment input.
 * @param {Object<string, string|undefined>} [env=process.env]
 * @return {string}
 */
function resolveRaftProvider(env = process.env) {
  const rawValue = env &&
    Object.prototype.hasOwnProperty.call(env, RAFT_PROVIDER_CONTROL.ENV_KEY) ?
    env[RAFT_PROVIDER_CONTROL.ENV_KEY] :
    null;

  if (!rawValue) {
    return RAFT_PROVIDER_CONTROL.LIFERAFT;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (SUPPORTED_RAFT_PROVIDERS.has(normalized)) {
    return normalized;
  }

  throw new Error(RAFT_PROVIDER_ERROR_MSG.INVALID_PROVIDER);
}

/**
 * Resolve and lock the raft provider selection for this process lifetime.
 * @param {Object<string, string|undefined>} [env=process.env]
 * @return {string}
 */
function getProcessRaftProvider(env = process.env) {
  const requestedProvider = resolveRaftProvider(env);
  if (!processRaftProvider) {
    processRaftProvider = requestedProvider;
    return processRaftProvider;
  }

  if (processRaftProvider !== requestedProvider) {
    throw new Error(
      RAFT_PROVIDER_ERROR_MSG.processProviderLocked(
        processRaftProvider,
        requestedProvider,
      ),
    );
  }

  return processRaftProvider;
}

/**
 * Ensure the active runtime path uses liferaft until cutover is complete.
 * @param {Object<string, string|undefined>} [env=process.env]
 * @return {string}
 */
function ensureLiferaftProviderForRuntime(env = process.env) {
  const selectedProvider = getProcessRaftProvider(env);
  if (selectedProvider !== RAFT_PROVIDER_CONTROL.LIFERAFT) {
    throw new Error(
      RAFT_PROVIDER_ERROR_MSG.runtimeProviderNotImplemented(selectedProvider),
    );
  }
  return selectedProvider;
}

/**
 * Test helper: clear process provider lock.
 */
function resetProcessRaftProviderForTests() {
  processRaftProvider = null;
}

export {
  ensureLiferaftProviderForRuntime,
  getProcessRaftProvider,
  resetProcessRaftProviderForTests,
  resolveRaftProvider,
};
