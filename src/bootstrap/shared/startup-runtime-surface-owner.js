import {
  trackControlPlaneRebindSweep,
} from '../../diagnostics/raft-churn-sync-sections.js';

const LOCAL_STR_FUNCTION = 'function';

function bindRebalanceCoordinatorToSqlEngines(owner, rebalanceCoordinator) {
  if (!owner || !rebalanceCoordinator) {
    return;
  }
  const engines = new Set([
    owner.sqlQueryEngine,
    owner.cdcIntegrationService?.sqlQueryEngine,
    owner.seedRuntimeBridgeOwner?.sqlQueryEngine,
  ]);
  for (const engine of engines) {
    engine?.setRebalanceCoordinator?.(rebalanceCoordinator);
  }
}

class StartupRuntimeSurfaceOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  bindControlPlaneServices() {
    // Sync-section attribution (instrumentation-only): this synchronous sweep
    // rebinds every coordinator during formation churn; tag it for the gap
    // watchdog. See raft-churn-sync-sections.js.
    return trackControlPlaneRebindSweep(() => {
      const tablePolicyService =
        this.delegates.getTablePolicyService?.() || null;
      const rebalanceCoordinator =
        this.delegates.getRebalanceCoordinator?.() || null;
      const owner = this.delegates.getOwner?.() || null;

      bindRebalanceCoordinatorToSqlEngines(owner, rebalanceCoordinator);

      for (const messageGroupService of
        this.delegates.getMessageGroupServices?.()?.values?.() || []) {
        if (tablePolicyService &&
            typeof messageGroupService?.setTablePolicyService ===
              LOCAL_STR_FUNCTION) {
          messageGroupService.setTablePolicyService(tablePolicyService);
        }
        if (rebalanceCoordinator &&
            typeof messageGroupService?.setRebalanceCoordinator ===
              LOCAL_STR_FUNCTION) {
          messageGroupService.setRebalanceCoordinator(rebalanceCoordinator);
        }
      }

      for (const partitionService of
        this.delegates.getPartitionServices?.()?.values?.() || []) {
        if (tablePolicyService &&
            typeof partitionService?.setTablePolicyService ===
              LOCAL_STR_FUNCTION) {
          partitionService.setTablePolicyService(tablePolicyService);
        }
        if (rebalanceCoordinator &&
            typeof partitionService?.setRebalanceCoordinator ===
              LOCAL_STR_FUNCTION) {
          partitionService.setRebalanceCoordinator(rebalanceCoordinator);
        }
      }
    });
  }

  async notifyLocalAdminRuntimeReady() {
    if (this.delegates.getLocalAdminRuntimeReadyNotified?.() === true) {
      return;
    }

    const onLocalAdminRuntimeReady =
      this.delegates.getOnLocalAdminRuntimeReady?.() || null;
    if (typeof onLocalAdminRuntimeReady !== LOCAL_STR_FUNCTION) {
      return;
    }

    this.delegates.setLocalAdminRuntimeReadyNotified?.(true);
    await onLocalAdminRuntimeReady({
      nodeId: this.delegates.getNodeId?.() || null,
      systemTableCache: this.delegates.getSystemTableCache?.() || null,
      cacheMutationTarget: this.delegates.getCacheMutationTarget?.() || null,
      messageRouter: this.delegates.getMessageRouter?.() || null,
      partitionServices: this.delegates.getPartitionServices?.() || null,
      owner: this.delegates.getOwner?.() || null,
    });
  }
}

export {StartupRuntimeSurfaceOwner};
