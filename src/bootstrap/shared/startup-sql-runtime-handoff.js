import {CDCIntegrationSetup} from './cdc-integration-setup.js';
import {
  bindServiceLifecycleCommandOwnerToSqlRuntime,
} from './service-lifecycle-command-owner-binding.js';
import {
  ensureServiceInstallationReconcilerOwner,
} from './service-installation-reconciler-setup.js';

const LOCAL_STR_FUNCTION = 'function';

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

  bindServiceLifecycleCommandOwnerToSqlRuntime(
    owner.serviceLifecycleCommandOwner || null,
    sqlQueryEngine,
  );
  owner.sqlQueryEngine = sqlQueryEngine;

  const bootstrapTopologySnapshotOwner =
    owner.bootstrapTopologySnapshotOwner ||
    (typeof owner.getBootstrapTopologySnapshotOwner === 'function' ?
      owner.getBootstrapTopologySnapshotOwner() :
      null);
  if (bootstrapTopologySnapshotOwner &&
      typeof sqlQueryEngine.queryExecutor?.setBootstrapTopologySnapshotOwner ===
        LOCAL_STR_FUNCTION) {
    sqlQueryEngine.queryExecutor.setBootstrapTopologySnapshotOwner(
      bootstrapTopologySnapshotOwner,
    );
  }

  const bootstrapSystemTableSnapshots =
    owner.bootstrapResponse?.systemTableSnapshots ||
    owner.systemTableSnapshots ||
    (typeof owner.getBootstrapSystemTableSnapshots === 'function' ?
      owner.getBootstrapSystemTableSnapshots() :
      null);
  if (bootstrapSystemTableSnapshots &&
      typeof sqlQueryEngine.seedBootstrapRoutingOverlayFromSnapshots ===
        LOCAL_STR_FUNCTION) {
    sqlQueryEngine.seedBootstrapRoutingOverlayFromSnapshots(
      bootstrapSystemTableSnapshots,
    );
  }

  const cdcIntegrationService = owner.cdcIntegrationService || null;
  if (cdcIntegrationService) {
    CDCIntegrationSetup.upgrade({
      cdcIntegrationService,
      sqlQueryEngine,
      systemTableCache: options.systemTableCache,
      messageRouter: options.messageRouter || null,
      cacheMutationTarget: options.cacheMutationTarget || null,
      partitionServicesProvider:
        typeof options.partitionServicesProvider === LOCAL_STR_FUNCTION ?
          options.partitionServicesProvider :
          null,
    });
    if (typeof sqlQueryEngine.setCDCIntegrationService === LOCAL_STR_FUNCTION) {
      sqlQueryEngine.setCDCIntegrationService(cdcIntegrationService);
    }
  }

  const rebalanceCoordinator = owner.rebalanceCoordinator || null;
  if (
    rebalanceCoordinator &&
    typeof rebalanceCoordinator.syncOwnerDependencies === LOCAL_STR_FUNCTION
  ) {
    rebalanceCoordinator.syncOwnerDependencies({
      systemTableCache: options.systemTableCache,
      cdcIntegrationService,
      messageRouter: options.messageRouter || null,
      tablePolicyService: owner.tablePolicyService || null,
      sqlQueryEngine,
    });
  }

  const partitionServices = owner.partitionServices || null;
  if (partitionServices && typeof partitionServices.values === LOCAL_STR_FUNCTION) {
    for (const partitionService of partitionServices.values()) {
      if (typeof partitionService?.setSqlQueryEngine === LOCAL_STR_FUNCTION) {
        partitionService.setSqlQueryEngine(sqlQueryEngine);
        continue;
      }
      partitionService.sqlQueryEngine = sqlQueryEngine;
      if (
        partitionService.rebalanceCoordinator &&
        typeof partitionService.rebalanceCoordinator.syncOwnerDependencies ===
          LOCAL_STR_FUNCTION
      ) {
        partitionService.rebalanceCoordinator.syncOwnerDependencies({
          systemTableCache: options.systemTableCache,
          cdcIntegrationService,
          messageRouter: options.messageRouter || null,
          tablePolicyService: owner.tablePolicyService || null,
          sqlQueryEngine,
        });
      }
    }
  }

  const backgroundWritersActive =
    typeof owner.hasActiveControlPlaneBackgroundWriters === 'function' &&
    owner.hasActiveControlPlaneBackgroundWriters() === true;
  if (backgroundWritersActive === true &&
      typeof owner.activateDistributedTransactionRecovery === LOCAL_STR_FUNCTION) {
    owner.activateDistributedTransactionRecovery();
  }

  ensureServiceInstallationReconcilerOwner(owner);
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
      typeof owner.activateControlPlaneBackgroundWriters === LOCAL_STR_FUNCTION) {
    void owner.activateControlPlaneBackgroundWriters();
  }

  if (options.flushDeferredCreateSelfHostedMetadata === true &&
      typeof owner.flushDeferredCreateSelfHostedMetadata === LOCAL_STR_FUNCTION) {
    owner.flushDeferredCreateSelfHostedMetadata();
  }

  if (options.activateDistributedTransactionRecovery === true &&
      typeof owner.activateDistributedTransactionRecovery === LOCAL_STR_FUNCTION) {
    owner.activateDistributedTransactionRecovery();
  }

  if (options.startLatencyTopologyLifecycle === true &&
      typeof owner.startLatencyTopologyLifecycle === LOCAL_STR_FUNCTION) {
    owner.startLatencyTopologyLifecycle();
  }
}

export {
  activateSteadyStateRuntimeHandoff,
  attachSqlRuntimeToStartupOwner,
};
