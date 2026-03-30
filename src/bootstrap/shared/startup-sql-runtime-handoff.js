import {CDCIntegrationSetup} from './cdc-integration-setup.js';

/**
 * Attach the final runtime SQL engine to the canonical startup owner.
 *
 * This consolidates the bootstrap-to-runtime handoff boundary for both seed
 * and join paths so the owner, CDC integration service, and deferred
 * transaction recovery all switch to the same runtime engine together.
 *
 * @param {Object} options
 * @param {Object} options.owner
 * @param {Object} options.sqlQueryEngine
 * @param {Object} options.systemTableCache
 * @param {Object|null} [options.cacheMutationTarget]
 * @param {Object|null} [options.messageRouter]
 * @param {Function|null} [options.partitionServicesProvider]
 * @return {void}
 */
function attachSqlRuntimeToStartupOwner(options) {
  const owner = options.owner || null;
  const sqlQueryEngine = options.sqlQueryEngine || null;
  if (!owner || !sqlQueryEngine) {
    return;
  }

  owner.sqlQueryEngine = sqlQueryEngine;

  const cdcIntegrationService = owner.cdcIntegrationService || null;
  if (cdcIntegrationService) {
    CDCIntegrationSetup.upgrade({
      cdcIntegrationService,
      sqlQueryEngine,
      systemTableCache: options.systemTableCache,
      messageRouter: options.messageRouter || null,
      cacheMutationTarget: options.cacheMutationTarget || null,
      partitionServicesProvider:
        typeof options.partitionServicesProvider === 'function' ?
          options.partitionServicesProvider :
          null,
    });
    if (typeof sqlQueryEngine.setCDCIntegrationService === 'function') {
      sqlQueryEngine.setCDCIntegrationService(cdcIntegrationService);
    }
  }

  const backgroundWritersActive =
    typeof owner.hasActiveControlPlaneBackgroundWriters === 'function' &&
    owner.hasActiveControlPlaneBackgroundWriters() === true;
  if (backgroundWritersActive === true &&
      typeof owner.activateDistributedTransactionRecovery === 'function') {
    owner.activateDistributedTransactionRecovery();
  }
}

/**
 * Trigger steady-state runtime activation through the shared startup handoff
 * boundary instead of having bootstrap/join services wire each runtime concern
 * inline at phase completion.
 *
 * @param {Object} options
 * @param {Object} options.owner
 * @param {boolean} [options.activateControlPlaneBackgroundWriters]
 * @param {boolean} [options.activateDistributedTransactionRecovery]
 * @param {boolean} [options.flushDeferredCreateSelfHostedMetadata]
 * @param {boolean} [options.startLatencyTopologyLifecycle]
 * @return {void}
 */
function activateSteadyStateRuntimeHandoff(options) {
  const owner = options?.owner || null;
  if (!owner) {
    return;
  }

  if (options.activateControlPlaneBackgroundWriters === true &&
      typeof owner.activateControlPlaneBackgroundWriters === 'function') {
    void owner.activateControlPlaneBackgroundWriters();
  }

  if (options.flushDeferredCreateSelfHostedMetadata === true &&
      typeof owner.flushDeferredCreateSelfHostedMetadata === 'function') {
    owner.flushDeferredCreateSelfHostedMetadata();
  }

  if (options.activateDistributedTransactionRecovery === true &&
      typeof owner.activateDistributedTransactionRecovery === 'function') {
    owner.activateDistributedTransactionRecovery();
  }

  if (options.startLatencyTopologyLifecycle === true &&
      typeof owner.startLatencyTopologyLifecycle === 'function') {
    owner.startLatencyTopologyLifecycle();
  }
}

export {
  activateSteadyStateRuntimeHandoff,
  attachSqlRuntimeToStartupOwner,
};
