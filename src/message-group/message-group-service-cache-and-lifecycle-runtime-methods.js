const MESSAGE_GROUP_SERVICE_CACHE_AND_LIFECYCLE_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

function createMessageGroupServiceCacheAndLifecycleRuntimeMethods(deps = {}) {
  const {
    CONTROL_PLANE_READINESS_DIMENSION,
    INITIAL_MESSAGE_GROUP_ID,
    MESSAGE_GROUP_SERVICE_LITERAL,
    SYSTEM_TABLE_NAME,
    TYPEOF,
    isSystemTableWriteReady,
  } = deps;

  class MessageGroupServiceCacheAndLifecycleRuntimeMethods {
    /**
     * Query the system table cache.
     * Returns a read-only view of the cache.
     * @param {string} tableName - System table name.
     * @param {Object} query - Query parameters.
     * @return {Promise<*>} Query result.
     */
    async querySystemCache(tableName, query = {}) {
      if (!this.initialized) {
        throw new Error(
          MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED,
        );
      }
      // Use read-only cache wrapper
      if (query.key) {
        return this.readOnlyCache.get(tableName, query.key);
      }
      if (query.predicate) {
        if (query.findOne) {
          return this.readOnlyCache.find(tableName, query.predicate);
        }
        return this.readOnlyCache.filter(tableName, query.predicate);
      }
      return this.readOnlyCache.getAll(tableName);
    }
    /**
     * Get the read-only system table cache.
     * @return {ReadOnlySystemTableCache} Read-only cache wrapper.
     */
    getReadOnlyCache() {
      return this.readOnlyCache;
    }
    /**
     * Get the underlying writable cache (for CDC handlers only).
     * @return {SystemTableCache} Writable cache.
     */
    getWritableCache() {
      return this.systemTableCache;
    }
    /**
     * Check if the message_groups partition leader is available for writes.
     * @return {boolean} True if a leader with an address is known.
     * @private
     */
    isMessageGroupsLeaderAvailable() {
      if (
        isSystemTableWriteReady(
          this.systemTableCache,
          SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        )
      ) {
        return true;
      }
      return (
        this.cdcIntegrationService?.canWriteSystemTableLocally?.(
          SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        ) === true
      );
    }
    /**
     * Check if the services table is writable through either cache-visible
     * routing metadata or the local services-p1 leader owner.
     * @return {boolean} True if writes can be issued safely.
     * @private
     */
    isServicesLeaderAvailable() {
      if (
        isSystemTableWriteReady(
          this.systemTableCache,
          SYSTEM_TABLE_NAME.SERVICES,
        )
      ) {
        return true;
      }
      return (
        this.cdcIntegrationService?.canWriteSystemTableLocally?.(
          SYSTEM_TABLE_NAME.SERVICES,
        ) === true
      );
    }
    getMetadataPublicationDeliveryPriority() {
      return this.groupId === INITIAL_MESSAGE_GROUP_ID ?
        MESSAGE_GROUP_SERVICE_LITERAL.CRITICAL :
        MESSAGE_GROUP_SERVICE_LITERAL.BACKGROUND;
    }
    getMetadataPublicationReadinessDimension() {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    /**
     * Get pending message count.
     * @return {number} Number of pending messages.
     */
    getPendingMessageCount() {
      return this.pendingMessages.size;
    }
    /**
     * Get service status.
     * @return {Object} Service status.
     */
    getStatus() {
      return {
        groupId: this.groupId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        role: this.role,
        isLeader: this.isLeader,
        leaderId: this.leaderId,
        term: this.raft ?
          this.raftProvider.getCurrentTerm(this.raft) :
          this.operationLedger.currentTerm,
        logLength: this.operationLedger.getLogLength(),
        pendingMessages: this.pendingMessages.size,
        acknowledgedMessages: this.acknowledgedMessages.size,
        cdcSubscriptions: this.cdcHandler.getSubscriptions(),
        initialized: this.initialized,
      };
    }
    /**
     * Sleep for a specified duration.
     * @param {number} ms - Milliseconds to sleep.
     * @return {Promise<void>}
     * @private
     */
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Shutdown the message group service.
     * @return {Promise<void>}
     */
    async shutdown() {
      this.logger.info(
        MESSAGE_GROUP_SERVICE_LITERAL.SHUTTING_DOWN_MESSAGE_GROUP_SERVICE,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
        },
      );
      this.leaderActivationGate.shutdown();
      this.peerReconciliationScheduled = false;
      if (
        this.systemTableCache &&
        typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION &&
        this.systemTableCacheChangeListener
      ) {
        this.systemTableCache.offCacheChange(
          this.systemTableCacheChangeListener,
        );
      }
      if (this.raftRuntime) {
        await this.raftRuntime.shutdown();
        this.raftRuntime = null;
      }
      this.raft = null;
      this.joinSuppressedHeartbeat = null;
      if (
        typeof this.releaseMetadataPublicationReadinessListener ===
        TYPEOF.FUNCTION
      ) {
        this.releaseMetadataPublicationReadinessListener();
      }
      this.releaseMetadataPublicationReadinessListener = null;
      this._metadataPublicationReadinessState = null;
      this.roleMutationHelper.shutdown();
      this.leaderNodeMutationHelper.shutdown();
      await this.quiesceRebalancing();
      this.cdcHandler.shutdown();
      this.initialized = false;
      this.pendingMessages.clear();
      this.messageCallbacks.clear();
      this.emit(MESSAGE_GROUP_SERVICE_LITERAL.SHUTDOWN, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });
    }
  }

  return MessageGroupServiceCacheAndLifecycleRuntimeMethods;
}

function defineMessageGroupServiceCacheAndLifecycleRuntimeMethods(
  prototype,
  deps = {},
) {
  const MessageGroupServiceCacheAndLifecycleRuntimeMethods =
    createMessageGroupServiceCacheAndLifecycleRuntimeMethods(deps);
  const descriptors = Object.getOwnPropertyDescriptors(
    MessageGroupServiceCacheAndLifecycleRuntimeMethods.prototype,
  );
  delete descriptors[
    MESSAGE_GROUP_SERVICE_CACHE_AND_LIFECYCLE_RUNTIME_LITERAL.CONSTRUCTOR
  ];
  Object.defineProperties(prototype, descriptors);
}

export {defineMessageGroupServiceCacheAndLifecycleRuntimeMethods};
