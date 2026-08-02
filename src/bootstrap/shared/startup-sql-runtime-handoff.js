import {attachCallCellInvoker} from './call-cell-invocation-setup.js';
import {CDCIntegrationSetup} from './cdc-integration-setup.js';
import {
  bindServiceLifecycleCommandOwnerToSqlRuntime,
} from './service-lifecycle-command-owner-binding.js';
import {
  ensureServiceInstallationReconcilerOwner,
} from './service-installation-reconciler-setup.js';

const LOCAL_STR_FUNCTION = 'function';
const numberIsSafeInteger = Number.isSafeInteger;

function activateOwnerTrackedTransactionRecovery(owner) {
  let recovery;
  try {
    recovery = owner.activateDistributedTransactionRecovery();
  } catch (error) {
    // The startup owner has already classified and retained this failure.
    // Normalize a synchronous cache-load failure so non-awaiting entrypoints
    // can keep the fail-closed readiness surface alive for observation.
    recovery = Promise.reject(error);
  }
  if (recovery && typeof recovery.catch === LOCAL_STR_FUNCTION) {
    // Seed and join entrypoints intentionally do not await this attachment.
    // Mark the rejection handled without changing the returned promise so an
    // explicit caller can still await the canonical failure.
    void recovery.catch(() => undefined);
  }
  return recovery;
}

function attachRuntimeAccessPolicyOwner(owner, sqlQueryEngine) {
  const runtimeAccessPolicyOwner =
    owner.systemMetadataOwners?.runtimeAccessPolicyOwner ||
    owner.serviceLifecycleCommandOwner?.runtimeAccessPolicyOwner ||
    null;
  if (
    runtimeAccessPolicyOwner &&
    typeof sqlQueryEngine.setRuntimeAccessPolicyOwner === LOCAL_STR_FUNCTION
  ) {
    sqlQueryEngine.setRuntimeAccessPolicyOwner(runtimeAccessPolicyOwner);
  }
}

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
 * @return {*}
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
  attachCallCellInvoker({
    serviceLifecycleCommandOwner: owner.serviceLifecycleCommandOwner || null,
    sqlQueryEngine,
    systemTableCacheProvider: () => options.systemTableCache ||
      owner.getSystemTableCache?.() || null,
    messageRouterProvider: () => options.messageRouter ||
      owner.messageRouter || null,
    tunables: options.callCellInvocationTunables,
  });
  attachRuntimeAccessPolicyOwner(owner, sqlQueryEngine);
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

  let transactionRecovery = null;
  if (typeof owner.activateDistributedTransactionRecovery ===
      LOCAL_STR_FUNCTION) {
    transactionRecovery = activateOwnerTrackedTransactionRecovery(owner);
  }

  ensureServiceInstallationReconcilerOwner(owner);
  return transactionRecovery;
}

/**
 * Trigger steady-state runtime activation through the shared startup handoff
 * boundary instead of having bootstrap/join services wire each runtime concern
 * inline at phase completion.
 *
 * @param {Object} options
 * @param {Object} options.owner
 * @param {boolean} [options.activateControlPlaneBackgroundWriters]
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

  if (options.startLatencyTopologyLifecycle === true &&
      typeof owner.startLatencyTopologyLifecycle === LOCAL_STR_FUNCTION) {
    owner.startLatencyTopologyLifecycle();
  }
}

/**
 * Shape the startup runtime handoff witness payload from a distributed
 * transaction recovery snapshot. Seed (bootstrap-service) and joiner
 * (node-joining-backfill-merge-and-status) paths share this exact shape so
 * readiness consumers observe one contract.
 * @param {Object} options
 * @param {string|null} options.startupBranch
 * @param {boolean} options.infrastructureJoinComplete
 * @param {Object|null} [options.infrastructureJoinProgress]
 * @param {Object|null} options.recovery
 * @return {Object}
 */
function normalizeStartupHandoffString(value) {
  return typeof value === 'string' ? value : null;
}

function normalizeStartupHandoffPositiveInteger(value) {
  return numberIsSafeInteger(value) && value > 0 ? value : null;
}

function buildInfrastructureJoinProgressFields(progress) {
  return {
    joinPhase: normalizeStartupHandoffString(progress.phase),
    joinLifecycleState: normalizeStartupHandoffString(progress.lifecycleState),
    joinCheckpointTarget:
      normalizeStartupHandoffString(progress.checkpointTarget),
    joinReadySignalGate:
      normalizeStartupHandoffString(progress.readySignalGate),
    joinReadySignalAttempt:
      normalizeStartupHandoffPositiveInteger(progress.readySignalAttempt),
    joinReadySignalLastFailureCode:
      normalizeStartupHandoffString(progress.readySignalLastFailureCode),
  };
}

function buildStartupRuntimeHandoffSnapshot({
  startupBranch,
  infrastructureJoinComplete,
  infrastructureJoinProgress = null,
  recovery,
}) {
  const joinProgressFields =
    infrastructureJoinProgress &&
    typeof infrastructureJoinProgress === 'object' ?
      buildInfrastructureJoinProgressFields(infrastructureJoinProgress) :
      {};
  return {
    startupBranch: typeof startupBranch === 'string' ? startupBranch : null,
    infrastructureJoinComplete,
    ...joinProgressFields,
    transactionRecoveryState:
      typeof recovery?.state === 'string' ? recovery.state : null,
    transactionRecoveryReady: recovery?.ready === true,
    transactionRecoverySummary: recovery?.summary || null,
    transactionRecoveryErrorCode: recovery?.errorCode || null,
    transactionRecoveryErrorMessage: recovery?.errorMessage || null,
    transactionRecoveryOutcome:
      recovery?.outcome && typeof recovery.outcome === 'object' ?
        recovery.outcome :
        null,
  };
}

export {
  activateSteadyStateRuntimeHandoff,
  attachSqlRuntimeToStartupOwner,
  buildStartupRuntimeHandoffSnapshot,
};
