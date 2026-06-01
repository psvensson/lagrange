import {
  assignReplicaHandlerRuntimeMetadataMethods,
} from './replica-handler-runtime-metadata-methods.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaHandlerRuntimeMethods(ReplicaHandler, options = {}) {
  assignReplicaHandlerRuntimeMetadataMethods(ReplicaHandler, options);
  const {
    AddressManager,
    NUM,
    REPLICA_HANDLER_ADDRESS,
    REPLICA_HANDLER_ERRNO,
    REPLICA_HANDLER_EVENT,
    REPLICA_HANDLER_LOG_MSG,
    REPLICA_HANDLER_NUM,
    REPLICA_HANDLER_SERVICE,
    REPLICA_HANDLER_TYPEOF,
    ReplicaStatus,
    STORAGE_DEFAULT,
    SYSTEM_TABLE_NAME,
    fs,
    path,
  } = options;
  class ReplicaHandlerRuntimeMethods {
    /**
     * Clean up local resources for a replica.
     * @param {string} partitionId - Partition ID.
     * @param {string} replicaId - Replica ID.
     * @return {Promise<void>}
     * @private
     */
    async cleanupRemovedReplicaLocalRuntime(
      replicaId,
      partitionId,
      service = null,
    ) {
      if (
        service &&
        typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        this.logger.debug(REPLICA_HANDLER_LOG_MSG.GRACEFUL_SHUTDOWN, {
          replicaId,
          nodeId: this.nodeId,
        });
        await service.shutdown();
      }
      await this.cleanupReplicaResources(partitionId, replicaId);
    }
    /**
     * Clean up local resources for a replica.
     * @param {string} partitionId - Partition ID.
     * @param {string} replicaId - Replica ID.
     * @return {Promise<void>}
     * @private
     */
    async cleanupReplicaResources(partitionId, replicaId) {
      const dbPath = this.getPartitionDbPath(partitionId, replicaId);
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.CLEANUP_RESOURCES, {
        replicaId,
        partitionId,
        dbPath,
        nodeId: this.nodeId,
      });
      try {
        // Remove SQLite database file
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
          this.logger.debug(REPLICA_HANDLER_LOG_MSG.REMOVED_DB_FILE, {
            dbPath,
          });
        }
        // Remove WAL and SHM files if they exist
        const walPath = `${dbPath}-wal`;
        const shmPath = `${dbPath}-shm`;
        if (fs.existsSync(walPath)) {
          fs.unlinkSync(walPath);
        }
        if (fs.existsSync(shmPath)) {
          fs.unlinkSync(shmPath);
        }
        // Try to remove partition directory if empty
        const partitionDir = path.dirname(dbPath);
        try {
          if (!fs.existsSync(partitionDir)) {
            return;
          }
          const files = fs.readdirSync(partitionDir);
          if (files.length === REPLICA_HANDLER_NUM.ZERO) {
            fs.rmdirSync(partitionDir);
            this.logger.debug(REPLICA_HANDLER_LOG_MSG.REMOVED_EMPTY_DIR, {
              partitionDir,
            });
          }
        } catch (dirError) {
          if (dirError?.code === REPLICA_HANDLER_ERRNO.ENOENT) {
            return;
          }
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.CLEANUP_FAILED, {
            replicaId,
            dbPath,
            error: dirError.message,
          });
          throw dirError;
        }
      } catch (error) {
        if (error?.code === REPLICA_HANDLER_ERRNO.ENOENT) {
          return;
        }
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.CLEANUP_FAILED, {
          replicaId,
          dbPath,
          error: error.message,
        });
        throw error;
      }
    }
    /**
     * Get the database path for a partition replica.
     * @param {string} partitionId - Partition ID.
     * @param {string} replicaId - Replica ID.
     * @return {string} Database file path.
     * @private
     */
    getPartitionDbPath(partitionId, replicaId) {
      return path.join(
        this.dataDir,
        STORAGE_DEFAULT.PARTITIONS_DIRNAME,
        partitionId,
        `${replicaId}${STORAGE_DEFAULT.DB_EXT}`,
      );
    }
    /**
     * Get local replica by ID.
     * Reads from System_Table_Cache and merges with local service reference.
     * @param {string} replicaId - Replica ID.
     * @return {Object|null} Local replica info or null.
     */
    getLocalReplica(replicaId) {
      const localReplica = this.localReplicas.get(replicaId);
      if (
        localReplica &&
        typeof localReplica === REPLICA_HANDLER_TYPEOF.OBJECT
      ) {
        const trackedService = this.getTrackedService(replicaId);
        if (!localReplica.replicaId) {
          localReplica.replicaId = replicaId;
        }
        if (localReplica.service === undefined) {
          localReplica.service = trackedService;
        } else if (!localReplica.service && trackedService) {
          localReplica.service = trackedService;
        }
        return localReplica;
      }
      // Read durable placement from cache and merge tracked local runtime service.
      const cacheEntry = this.systemTableCache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        replicaId,
      );
      const service = this.getTrackedService(replicaId);
      // Check if this replica belongs to this node
      if (!cacheEntry || cacheEntry.node_id !== this.nodeId) {
        // Compatibility fallback for legacy tests that seed in-memory local replicas
        // directly on the lifecycle manager.
        if (
          service &&
          typeof service === REPLICA_HANDLER_TYPEOF.OBJECT &&
          service.status
        ) {
          const compatibilityService =
            service.service ||
            (typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION ||
            typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION ?
              service :
              null);
          return {
            replicaId: service.replicaId || replicaId,
            partitionId: service.partitionId || null,
            tableName: service.tableName || null,
            status: service.status,
            service: compatibilityService,
          };
        }
        return null;
      }
      // Merge cache state with local service reference
      return {
        replicaId: cacheEntry.service_id || cacheEntry.replica_id,
        partitionId: cacheEntry.partition_id,
        tableName: null,
        // Not stored in services table
        status: cacheEntry.status,
        service: service || null,
      };
    }
    /**
     * Get all local replicas.
     * Reads from System_Table_Cache filtered by node_id.
     * @return {Array<Object>} Array of local replica info.
     */
    getAllLocalReplicas() {
      const replicasById = new Map();
      const localServices = this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (row) => row.node_id === this.nodeId,
      );
      for (const cacheEntry of localServices) {
        const replicaId = cacheEntry.service_id || cacheEntry.replica_id;
        const tracked = this.localReplicas.get(replicaId);
        replicasById.set(replicaId, {
          replicaId,
          partitionId: cacheEntry.partition_id,
          tableName: tracked?.tableName || null,
          status: tracked?.status || cacheEntry.status,
          service: this.getTrackedService(replicaId),
        });
      }
      for (const [replicaId, trackedReplica] of this.localReplicas.entries()) {
        if (!replicasById.has(replicaId)) {
          replicasById.set(replicaId, {
            replicaId: trackedReplica?.replicaId || replicaId,
            partitionId: trackedReplica?.partitionId || null,
            tableName: trackedReplica?.tableName || null,
            status: trackedReplica?.status || null,
            service: this.getTrackedService(replicaId),
          });
        }
      }
      return Array.from(replicasById.values());
    }
    /**
     * Register an existing replica (created during bootstrap).
     * Stores only the service reference in localServices.
     * This method is idempotent - duplicate registrations are ignored.
     * @param {Object} replicaInfo - Replica information.
     * @param {string} replicaInfo.replicaId - Unique replica identifier.
     * @param {string} replicaInfo.partitionId - Partition identifier.
     * @param {string} replicaInfo.tableName - Table name.
     * @param {string} [replicaInfo.status] - Replica status (default: 'active').
     * @param {Object} [replicaInfo.service] - Partition service instance.
     */
    registerExistingReplica(replicaInfo) {
      const {replicaId, service} = replicaInfo;
      // Idempotent: no error on duplicate registration
      if (this.localReplicas.has(replicaId)) {
        this.logger.debug(REPLICA_HANDLER_LOG_MSG.ALREADY_REGISTERED, {
          replicaId,
          nodeId: this.nodeId,
        });
        return;
      }
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId: replicaInfo.partitionId || null,
        tableName: replicaInfo.tableName || null,
        status: replicaInfo.status || ReplicaStatus.ACTIVE,
        service: service || null,
      });
      // Store service reference when provided
      if (service) {
        this.localServices.set(replicaId, service);
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_REPLICA, {
        replicaId,
        partitionId: replicaInfo.partitionId,
        tableName: replicaInfo.tableName,
        nodeId: this.nodeId,
      });
    }
    /**
     * Aggregate pending-request tracker telemetry from local replica services.
     * @return {Object}
     * @private
     */
    getPendingRequestTrackerAggregate() {
      const aggregate = {
        pendingCount: NUM.ZERO,
        maxPendingRequests: NUM.ZERO,
        availableCapacity: NUM.ZERO,
        saturationPercent: NUM.ZERO,
        trackedTotal: NUM.ZERO,
        resolvedTotal: NUM.ZERO,
        rejectedTotal: NUM.ZERO,
        timedOutTotal: NUM.ZERO,
        staleCleanedTotal: NUM.ZERO,
        backpressureRejectTotal: NUM.ZERO,
        maxPendingObserved: NUM.ZERO,
        replicaCountWithTracker: NUM.ZERO,
      };
      for (const service of this.localServices.values()) {
        if (
          !service ||
          typeof service.getStats !== REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          continue;
        }
        let serviceStats = null;
        try {
          serviceStats = service.getStats();
        } catch (_error) {
          continue;
        }
        const tracker = serviceStats?.pendingRequestTracker;
        if (!tracker || typeof tracker !== REPLICA_HANDLER_TYPEOF.OBJECT) {
          continue;
        }
        aggregate.replicaCountWithTracker += NUM.ONE;
        aggregate.pendingCount += Number.isFinite(tracker.pendingCount) ?
          tracker.pendingCount :
          NUM.ZERO;
        aggregate.maxPendingRequests += Number.isFinite(
          tracker.maxPendingRequests,
        ) ?
          tracker.maxPendingRequests :
          NUM.ZERO;
        aggregate.availableCapacity += Number.isFinite(
          tracker.availableCapacity,
        ) ?
          tracker.availableCapacity :
          NUM.ZERO;
        aggregate.trackedTotal += Number.isFinite(tracker.trackedTotal) ?
          tracker.trackedTotal :
          NUM.ZERO;
        aggregate.resolvedTotal += Number.isFinite(tracker.resolvedTotal) ?
          tracker.resolvedTotal :
          NUM.ZERO;
        aggregate.rejectedTotal += Number.isFinite(tracker.rejectedTotal) ?
          tracker.rejectedTotal :
          NUM.ZERO;
        aggregate.timedOutTotal += Number.isFinite(tracker.timedOutTotal) ?
          tracker.timedOutTotal :
          NUM.ZERO;
        aggregate.staleCleanedTotal += Number.isFinite(
          tracker.staleCleanedTotal,
        ) ?
          tracker.staleCleanedTotal :
          NUM.ZERO;
        aggregate.backpressureRejectTotal += Number.isFinite(
          tracker.backpressureRejectTotal,
        ) ?
          tracker.backpressureRejectTotal :
          NUM.ZERO;
        aggregate.maxPendingObserved = Math.max(
          aggregate.maxPendingObserved,
          Number.isFinite(tracker.maxPendingObserved) ?
            tracker.maxPendingObserved :
            NUM.ZERO,
        );
      }
      if (aggregate.maxPendingRequests > NUM.ZERO) {
        aggregate.saturationPercent = Math.round(
          (aggregate.pendingCount / aggregate.maxPendingRequests) * NUM.HUNDRED,
        );
      }
      return aggregate;
    }
    /**
     * Get handler statistics.
     * @return {Object} Statistics object.
     */
    getStats() {
      const pendingRequestTracker = this.getPendingRequestTrackerAggregate();
      return {
        nodeId: this.nodeId,
        initialized: this.initialized,
        localReplicaCount: this.localReplicas.size,
        inProgressOperationCount: this.inProgressOperations.size,
        pendingRequestTracker,
      };
    }
    /**
     * Register this handler with a message router.
     * Registers at ${nodeId}/service/replica-handler address.
     * Requirements: 3.1
     * @param {Object} messageRouter - Message router instance.
     * @param {Object} [options={}] - Registration options.
     * @param {Object} [options.rpcClient] - RPC client for response handling.
     */
    registerWithRouter(messageRouter, options = {}) {
      if (!messageRouter) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.NO_MESSAGE_ROUTER);
        return;
      }
      this.messageRouter = messageRouter;
      const handlerAddress =
        `${this.nodeId}/${REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
        `${REPLICA_HANDLER_ADDRESS.HANDLER_ID}`;
      // Store RPC client if provided
      if (options.rpcClient) {
        this.rpcClient = options.rpcClient;
      }
      // Create handler that wraps handleMessage
      const routerHandler = async (envelope) => {
        const response = await this.handleMessage(envelope);
        // If RPC client is available, also notify it of the response
        // This handles the case where the coordinator is on the same node
        if (this.rpcClient && response.correlationId) {
          this.rpcClient.handleResponse(response.correlationId, response);
        }
        return {
          acknowledged: true,
          ...response,
        };
      };
      messageRouter.register(handlerAddress, routerHandler);
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_ROUTER, {
        address: handlerAddress,
        nodeId: this.nodeId,
      });
    }
    /**
     * Unregister this handler from a message router.
     * @param {Object} messageRouter - Message router instance.
     */
    unregisterFromRouter(messageRouter) {
      if (!messageRouter) {
        return;
      }
      const handlerAddress =
        `${this.nodeId}/${REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
        `${REPLICA_HANDLER_ADDRESS.HANDLER_ID}`;
      messageRouter.unregister(handlerAddress);
      if (this.messageRouter === messageRouter) {
        this.messageRouter = null;
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.UNREGISTERED_ROUTER, {
        address: handlerAddress,
        nodeId: this.nodeId,
      });
    }
    /**
     * Shutdown the replica handler.
     */
    async shutdown() {
      if (this.shutdownPromise) {
        return this.shutdownPromise;
      }
      this.shutdownPromise = (async () => {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN, {
          nodeId: this.nodeId,
        });
        this.shuttingDown = true;
        for (const progress of this.creationProgressByReplica.values()) {
          this.creationProgressReporter.fail(
            progress,
            REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN,
            {stage: ReplicaStatus.FAILED},
          );
        }
        await Promise.allSettled([...this.operationTasks]);
        const servicesToShutdown = new Set([
          ...this.localServices.values(),
          ...[...this.localReplicas.values()]
            .map((replica) => replica?.service)
            .filter(Boolean),
        ]);
        for (const service of servicesToShutdown) {
          try {
            if (typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION) {
              await service.shutdown();
            }
          } catch (error) {
            this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
              nodeId: this.nodeId,
              error: error.message,
            });
          }
        }
        this.creationProgressByReplica.clear();
        this.inProgressOperations.clear();
        this.localServices.clear();
        this.localReplicas.clear();
        this.initialized = false;
        this.emit(REPLICA_HANDLER_EVENT.SHUTDOWN, {nodeId: this.nodeId});
      })();
      return this.shutdownPromise;
    }
    /**
     * Get service reference for a replica from local tracking.
     * @param {string} replicaId - Replica ID.
     * @return {Object|null} Service instance or null.
     * @private
     */
    getTrackedService(replicaId) {
      const service = this.localServices.get(replicaId);
      if (service) {
        return service;
      }
      const trackedReplica = this.localReplicas.get(replicaId);
      if (
        !trackedReplica ||
        typeof trackedReplica !== REPLICA_HANDLER_TYPEOF.OBJECT
      ) {
        return null;
      }
      if (trackedReplica.service) {
        return trackedReplica.service;
      }
      if (
        typeof trackedReplica.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION ||
        typeof trackedReplica.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return trackedReplica;
      }
      return null;
    }
    /**
     * Determine whether CREATE_REPLICA idempotency is already satisfied.
     * Durable ownership alone is not enough; the local runtime service must
     * still be tracked and available on this node.
     * @param {Object|null} replica - Replica snapshot.
     * @return {boolean} True when the active replica is locally tracked.
     * @private
     */
    isReplicaCreateAlreadySatisfied(replica) {
      return Boolean(
        replica && replica.status === ReplicaStatus.ACTIVE && replica.service,
      );
    }
    /**
     * Get normalized raft role from the locally tracked service owner.
     * @param {string} replicaId - Replica ID.
     * @return {string|null} Lower-cased raft role or null.
     * @private
     */
    getTrackedReplicaRole(replicaId) {
      const service = this.getTrackedService(replicaId);
      if (!service) {
        return null;
      }
      const role =
        typeof service.getRole === REPLICA_HANDLER_TYPEOF.FUNCTION ?
          service.getRole() :
          service.role;
      return typeof role === REPLICA_HANDLER_TYPEOF.STRING ?
        role.toLowerCase() :
        null;
    }
    /**
     * Build the canonical service address for a tracked replica.
     * @param {string} replicaId - Replica ID.
     * @return {string} Formatted address.
     * @private
     */
    buildTrackedServiceAddress(replicaId) {
      const addressManager = AddressManager.getInstance();
      return addressManager.format(
        this.nodeId,
        REPLICA_HANDLER_SERVICE.TYPE,
        replicaId,
      );
    }
    /**
     * Update local replica metadata while preserving existing fields.
     * @param {string} replicaId - Replica ID.
     * @param {Object} updates - Fields to merge.
     * @return {Object} Updated local replica metadata.
     * @private
     */
    setLocalReplica(replicaId, updates) {
      const existing = this.localReplicas.get(replicaId) || {};
      const merged = {
        ...existing,
        ...updates,
        replicaId: updates.replicaId || existing.replicaId || replicaId,
      };
      this.localReplicas.set(replicaId, merged);
      return merged;
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerRuntimeMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRuntimeMethods.prototype,
        methodName,
      ),
    );
  }
}
export {assignReplicaHandlerRuntimeMethods};
