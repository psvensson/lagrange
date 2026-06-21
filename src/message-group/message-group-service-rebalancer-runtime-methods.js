const MESSAGE_GROUP_SERVICE_REBALANCER_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

function createMessageGroupServiceRebalancerRuntimeMethods(deps = {}) {
  const {
    MESSAGE_GROUP_SERVICE_ERROR_MSG,
    MESSAGE_GROUP_SERVICE_LITERAL,
    RebalancerEntityType,
    TYPEOF,
    UnifiedRebalancer,
  } = deps;

  class MessageGroupServiceRebalancerRuntimeMethods {
    /**
     * Set the CDC integration service for raft role updates.
     * @param {Object} cdcIntegrationService - CDC integration service.
     */
    setCdcIntegrationService(cdcIntegrationService) {
      this.cdcIntegrationService = cdcIntegrationService;
      this.maybeInitializeRebalancer();
      this.flushRoleUpdate().catch((error) => {
        this.logger.warn(
          MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_PERSIST_ROLE_UPDATE_AFTER_CDC_SERVICE_SET,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      });
      this.flushLeaderNodeUpdate().catch((error) => {
        this.logger.warn(
          MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_PERSIST_LEADER_UPDATE_AFTER_CDC_SERVICE_SET,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      });
    }

    /**
     * Set table policy service for message-group rebalancing.
     * @param {Object} tablePolicyService - Table policy service.
     */
    setTablePolicyService(tablePolicyService) {
      this.tablePolicyService = tablePolicyService;
      this.maybeInitializeRebalancer();
    }

    /**
     * Set rebalance coordinator for message-group rebalancing.
     * @param {Object} rebalanceCoordinator - Rebalance coordinator.
     */
    setRebalanceCoordinator(rebalanceCoordinator) {
      this.rebalanceCoordinator = rebalanceCoordinator;
      this.maybeInitializeRebalancer();
    }

    /**
     * Initialize message-group rebalancer when leader and dependencies are ready.
     * @private
     */
    maybeInitializeRebalancer() {
      const backgroundReady = this.isBackgroundWorkReady();
      if (this.rebalancer) {
        this.rebalancer.systemTableCache = this.systemTableCache;
        this.rebalancer.cdcIntegrationService = this.cdcIntegrationService;
        this.rebalancer.tablePolicyService = this.tablePolicyService;
        if (
          typeof this.rebalancer.setRebalanceCoordinator !== TYPEOF.FUNCTION
        ) {
          throw new Error(
            MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_REBALANCER_SET_COORDINATOR,
          );
        }
        this.rebalancer.setRebalanceCoordinator(this.rebalanceCoordinator);
        this.rebalancer.messageRouter = this.transport;
        this.rebalancer.sqlQueryEngine =
          this.cdcIntegrationService?.sqlQueryEngine || null;
        this.rebalancer.setLeader(this.resolveRebalancerLeadership());
        return;
      }
      if (!backgroundReady || !this.initialized || !this.isLeaderReplica()) {
        return;
      }
      if (
        !this.systemTableCache ||
        !this.cdcIntegrationService ||
        !this.tablePolicyService ||
        !this.rebalanceCoordinator ||
        !this.transport
      ) {
        return;
      }
      this.rebalancer = new UnifiedRebalancer({
        entityId: this.groupId,
        entityType: RebalancerEntityType.MESSAGE_GROUP,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        tablePolicyService: this.tablePolicyService,
        nodeId: this.nodeId,
        messageRouter: this.transport,
        sqlQueryEngine: this.cdcIntegrationService.sqlQueryEngine,
        rebalanceCoordinator: this.rebalanceCoordinator,
      });
      this.rebalancer.initialize();
      this.rebalancer.setLeader(this.resolveRebalancerLeadership());
    }

    /**
     * Update rebalancer leadership when raft role changes.
     * @private
     */
    updateRebalancerLeadership() {
      if (this.rebalancer) {
        this.rebalancer.setLeader(this.resolveRebalancerLeadership());
        return;
      }
      this.maybeInitializeRebalancer();
    }

    /**
     * Stop message-group rebalancing activity.
     * @return {Promise<void>}
     */
    async quiesceRebalancing() {
      if (this.rebalancer) {
        this.rebalancer.setLeader(false);
        this.rebalancer.shutdown();
        this.rebalancer = null;
      }
    }
  }

  return MessageGroupServiceRebalancerRuntimeMethods;
}

function defineMessageGroupServiceRebalancerRuntimeMethods(
  prototype,
  deps = {},
) {
  const MessageGroupServiceRebalancerRuntimeMethods =
    createMessageGroupServiceRebalancerRuntimeMethods(deps);
  const descriptors = Object.getOwnPropertyDescriptors(
    MessageGroupServiceRebalancerRuntimeMethods.prototype,
  );
  delete descriptors[
    MESSAGE_GROUP_SERVICE_REBALANCER_RUNTIME_LITERAL.CONSTRUCTOR
  ];
  Object.defineProperties(prototype, descriptors);
}

export {defineMessageGroupServiceRebalancerRuntimeMethods};
