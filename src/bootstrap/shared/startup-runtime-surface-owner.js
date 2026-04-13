class StartupRuntimeSurfaceOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  bindControlPlaneServices() {
    const tablePolicyService = this.delegates.getTablePolicyService?.() || null;
    const rebalanceCoordinator =
      this.delegates.getRebalanceCoordinator?.() || null;

    for (const messageGroupService of
      this.delegates.getMessageGroupServices?.()?.values?.() || []) {
      if (tablePolicyService &&
          typeof messageGroupService?.setTablePolicyService === 'function') {
        messageGroupService.setTablePolicyService(tablePolicyService);
      }
      if (rebalanceCoordinator &&
          typeof messageGroupService?.setRebalanceCoordinator === 'function') {
        messageGroupService.setRebalanceCoordinator(rebalanceCoordinator);
      }
    }

    for (const partitionService of
      this.delegates.getPartitionServices?.()?.values?.() || []) {
      if (tablePolicyService &&
          typeof partitionService?.setTablePolicyService === 'function') {
        partitionService.setTablePolicyService(tablePolicyService);
      }
      if (rebalanceCoordinator &&
          typeof partitionService?.setRebalanceCoordinator === 'function') {
        partitionService.setRebalanceCoordinator(rebalanceCoordinator);
      }
    }
  }

  async notifyLocalAdminRuntimeReady() {
    if (this.delegates.getLocalAdminRuntimeReadyNotified?.() === true) {
      return;
    }

    const onLocalAdminRuntimeReady =
      this.delegates.getOnLocalAdminRuntimeReady?.() || null;
    if (typeof onLocalAdminRuntimeReady !== 'function') {
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
