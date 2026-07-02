/**
 * ReplicaWorkerManager replica creation methods.
 *
 * These methods are assigned to ReplicaWorkerManager.prototype by the owner
 * module to keep the public manager surface unchanged.
 *
 * @module worker/replica-worker-manager-replica-creation
 */

function createReplicaWorkerManagerReplicaCreationMethods(deps = {}) {
  const {
    FACADE_MESSAGE_TYPE,
    MANAGER_DEFAULT,
    MANAGER_ERROR_MSG,
    MANAGER_LOG_MSG,
    REPLICA_CREATE_PROGRESS,
    WORKER_ENTITY_TYPE,
    WORKER_EVENT,
    WORKER_HEALTH_STATUS,
    WORKER_OPERATION,
    WORKER_STATUS,
    LOCAL_STR_STRING,
    LOCAL_STR_TIMEOUT,
  } = deps;

  return {
    /**
     * Execute a promise with a timeout.
     * @param {Promise} promise - Promise to execute.
     * @param {number} timeoutMs - Timeout in milliseconds.
     * @return {Promise} Result of the promise or timeout error.
     * @private
     * @see Requirements 7.1, 7.2 - CREATE_REPLICA timeout handling
     */
    withTimeout(promise, timeoutMs) {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
      });
    },

    /**
     * Clean up a partially created replica after timeout.
     * Removes the replica from the workers map and unregisters from router.
     * @param {string} replicaId - Replica ID to clean up.
     * @return {Promise<void>}
     * @private
     * @see Requirement 7.3 - Clean up partial resources on timeout
     */
    async cleanupPartialReplica(replicaId) {
      this.logger.info(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_STARTED, {
        nodeId: this.nodeId,
        replicaId,
      });

      const handle = this.workers.get(replicaId);
      if (handle) {
        if (handle.unifiedAddress) {
          try {
            this.unregisterWorkerFromRouter(handle.unifiedAddress);
          } catch (error) {
            this.logger.warn(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_FAILED, {
              nodeId: this.nodeId,
              replicaId,
              error: error.message,
            });
          }
        }

        this.workers.delete(replicaId);
      }

      await this.destroyDedicatedReplicaPool(replicaId).catch((error) => {
        this.logger.warn(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_FAILED, {
          nodeId: this.nodeId,
          replicaId,
          error: error.message,
        });
      });

      this.logger.info(MANAGER_LOG_MSG.TIMEOUT_CLEANUP_COMPLETED, {
        nodeId: this.nodeId,
        replicaId,
      });
    },

    /**
     * Start one replica group's deferred elections once every expected replica
     * exists and is routable.
     * @param {Array<string>} replicaIds
     * @return {Promise<void>}
     * @private
     */
    async maybeStartReplicaGroupElection(replicaIds) {
      const expectedReplicaIds = Array.isArray(replicaIds) ?
        [...new Set(replicaIds.filter((replicaId) =>
          typeof replicaId === LOCAL_STR_STRING && replicaId.length > 0,
        ))] :
        [];
      if (expectedReplicaIds.length <= 1) {
        return;
      }

      const allReplicasReady = expectedReplicaIds.every((replicaId) => {
        const handle = this.workers.get(replicaId);
        return handle?.status === WORKER_STATUS.RUNNING;
      });
      if (!allReplicasReady) {
        return;
      }

      await Promise.all(expectedReplicaIds.map((replicaId) => {
        return this.deliverMessage(replicaId, {
          type: FACADE_MESSAGE_TYPE.START_ELECTION,
        });
      }));
    },

    /**
     * Create a new partition replica in a worker process.
     * After successful creation, registers handler with MessageRouter.
     * @param {Object} options - Partition configuration.
     * @param {string} options.partitionId - Partition ID.
     * @param {string} options.replicaId - Replica ID.
     * @param {string} options.tableId - Table ID.
     * @param {string} options.tableName - Table name.
     * @param {Object} options.schema - Table schema.
     * @param {string} options.dbPath - SQLite database path.
     * @param {Array<string>} [options.replicaIds] - All replica IDs.
     * @param {Array<string>} [options.peerAddresses] - Peer unified addresses.
     * @param {number} [options.timeoutMs] - Operation timeout in milliseconds.
     * @return {Promise<WorkerReplicaHandle|Object>} Handle to the worker replica or error object.
     * @see Requirements 7.1, 7.2, 7.3 - CREATE_REPLICA timeout handling
     */
    async createPartitionReplica(options) {
      if (!this.initialized) {
        throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
      }

      if (!options.partitionId) {
        throw new Error(MANAGER_ERROR_MSG.MISSING_PARTITION_ID);
      }

      if (!options.replicaId) {
        throw new Error(MANAGER_ERROR_MSG.MISSING_REPLICA_ID);
      }

      if (this.workers.has(options.replicaId)) {
        throw new Error(MANAGER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
      }

      const now = Date.now();
      const unifiedAddress =
        `${this.nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${options.replicaId}`;
      const timeoutMs = options.timeoutMs ||
        MANAGER_DEFAULT.CREATE_REPLICA_TIMEOUT_MS;
      const shouldDeferElection = Array.isArray(options.replicaIds) &&
        options.replicaIds.length > 1;

      const handle = {
        replicaId: options.replicaId,
        workerId: 0,
        entityType: WORKER_ENTITY_TYPE.PARTITION,
        unifiedAddress,
        status: WORKER_STATUS.STARTING,
        createdAt: now,
        lastHealthCheck: now,
        healthStatus: WORKER_HEALTH_STATUS.UNKNOWN,
        partitionId: options.partitionId,
        tableId: options.tableId,
        tableName: options.tableName,
      };

      this.workers.set(options.replicaId, handle);
      const creationProgress = this.startReplicaCreationProgress({
        entityType: WORKER_ENTITY_TYPE.PARTITION,
        replicaId: options.replicaId,
        serviceId: options.partitionId,
      });
      this.updateReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_SPAWNING,
      );

      let dedicatedPool = null;

      try {
        dedicatedPool = this.usesDedicatedReplicaPools() ?
          this.createDedicatedReplicaPool(options.replicaId) :
          null;
        const executionPool = dedicatedPool || this.pool;

        const result = await this.withTimeout(
          executionPool.run({
            operation: WORKER_OPERATION.CREATE_PARTITION_REPLICA,
            nodeId: this.nodeId,
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            tableId: options.tableId,
            tableName: options.tableName,
            schema: options.schema,
            dbPath: options.dbPath,
            replicaIds: options.replicaIds,
            peerAddresses: options.peerAddresses,
            deferElection: shouldDeferElection,
          }),
          timeoutMs,
        );

        handle.workerId = result.workerId || 0;
        handle.status = WORKER_STATUS.RUNNING;
        handle.healthStatus = WORKER_HEALTH_STATUS.HEALTHY;
        this.updateReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_WORKER_READY,
        );

        if (dedicatedPool) {
          this.replicaPools.set(options.replicaId, dedicatedPool);
        }

        this.updateReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_REGISTERING,
        );
        this.registerWorkerWithRouter(options.replicaId, unifiedAddress);
        await this.maybeStartReplicaGroupElection(options.replicaIds);

        this.emit(WORKER_EVENT.REPLICA_CREATED, {
          replicaId: options.replicaId,
          entityType: WORKER_ENTITY_TYPE.PARTITION,
          unifiedAddress,
        });

        this.finishReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_RUNNING,
        );
        return handle;
      } catch (error) {
        if (error.message.includes(LOCAL_STR_TIMEOUT)) {
          await this.cleanupPartialReplica(options.replicaId);
          this.failReplicaCreationProgress(
            creationProgress,
            REPLICA_CREATE_PROGRESS.STATE_TIMEOUT,
            error,
          );

          return {
            success: false,
            error: MANAGER_ERROR_MSG.createReplicaTimeout(timeoutMs),
            replicaId: options.replicaId,
          };
        }

        this.workers.delete(options.replicaId);
        if (dedicatedPool) {
          await dedicatedPool.destroy().catch(() => {});
        }
        this.failReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_FAILED,
          error,
        );

        this.logger.error(MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED, {
          nodeId: this.nodeId,
          replicaId: options.replicaId,
          error: error.message,
        });

        throw new Error(
          `${MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED}: ${error.message}`,
        );
      }
    },

    /**
     * Create a new message group replica in a worker process.
     * After successful creation, registers handler with MessageRouter.
     * @param {Object} options - Message group configuration.
     * @param {string} options.groupId - Message group ID.
     * @param {string} options.replicaId - Replica ID.
     * @param {Array<string>} [options.replicaIds] - All replica IDs in group.
     * @param {Array<string>} [options.peerAddresses] - Peer unified addresses.
     * @param {number} [options.timeoutMs] - Operation timeout in milliseconds.
     * @return {Promise<WorkerReplicaHandle|Object>} Handle to the worker replica or error object.
     * @see Requirements 7.1, 7.2, 7.3 - CREATE_REPLICA timeout handling
     */
    async createMessageGroupReplica(options) {
      if (!this.initialized) {
        throw new Error(MANAGER_ERROR_MSG.NOT_INITIALIZED);
      }

      if (!options.groupId) {
        throw new Error(MANAGER_ERROR_MSG.MISSING_GROUP_ID);
      }

      if (!options.replicaId) {
        throw new Error(MANAGER_ERROR_MSG.MISSING_REPLICA_ID);
      }

      if (this.workers.has(options.replicaId)) {
        throw new Error(MANAGER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
      }

      const now = Date.now();
      const unifiedAddress =
        `${this.nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${options.replicaId}`;
      const timeoutMs = options.timeoutMs ||
        MANAGER_DEFAULT.CREATE_REPLICA_TIMEOUT_MS;
      const shouldDeferElection = Array.isArray(options.replicaIds) &&
        options.replicaIds.length > 1;

      const handle = {
        replicaId: options.replicaId,
        workerId: 0,
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        unifiedAddress,
        status: WORKER_STATUS.STARTING,
        createdAt: now,
        lastHealthCheck: now,
        healthStatus: WORKER_HEALTH_STATUS.UNKNOWN,
        groupId: options.groupId,
      };

      this.workers.set(options.replicaId, handle);
      const creationProgress = this.startReplicaCreationProgress({
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        replicaId: options.replicaId,
        serviceId: options.groupId,
      });
      this.updateReplicaCreationProgress(
        creationProgress,
        REPLICA_CREATE_PROGRESS.STATE_SPAWNING,
      );

      let dedicatedPool = null;

      try {
        dedicatedPool = this.usesDedicatedReplicaPools() ?
          this.createDedicatedReplicaPool(options.replicaId) :
          null;
        const executionPool = dedicatedPool || this.pool;

        const result = await this.withTimeout(
          executionPool.run({
            operation: WORKER_OPERATION.CREATE_MESSAGE_GROUP_REPLICA,
            nodeId: this.nodeId,
            groupId: options.groupId,
            replicaId: options.replicaId,
            replicaIds: options.replicaIds,
            peerAddresses: options.peerAddresses,
            deferElection: shouldDeferElection,
          }),
          timeoutMs,
        );

        handle.workerId = result.workerId || 0;
        handle.status = WORKER_STATUS.RUNNING;
        handle.healthStatus = WORKER_HEALTH_STATUS.HEALTHY;
        this.updateReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_WORKER_READY,
        );

        if (dedicatedPool) {
          this.replicaPools.set(options.replicaId, dedicatedPool);
        }

        this.updateReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_REGISTERING,
        );
        this.registerWorkerWithRouter(options.replicaId, unifiedAddress);
        await this.maybeStartReplicaGroupElection(options.replicaIds);

        this.emit(WORKER_EVENT.REPLICA_CREATED, {
          replicaId: options.replicaId,
          entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          unifiedAddress,
        });

        this.finishReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_RUNNING,
        );
        return handle;
      } catch (error) {
        if (error.message.includes(LOCAL_STR_TIMEOUT)) {
          await this.cleanupPartialReplica(options.replicaId);
          this.failReplicaCreationProgress(
            creationProgress,
            REPLICA_CREATE_PROGRESS.STATE_TIMEOUT,
            error,
          );

          return {
            success: false,
            error: MANAGER_ERROR_MSG.createReplicaTimeout(timeoutMs),
            replicaId: options.replicaId,
          };
        }

        this.workers.delete(options.replicaId);
        if (dedicatedPool) {
          await dedicatedPool.destroy().catch(() => {});
        }
        this.failReplicaCreationProgress(
          creationProgress,
          REPLICA_CREATE_PROGRESS.STATE_FAILED,
          error,
        );

        this.logger.error(MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED, {
          nodeId: this.nodeId,
          replicaId: options.replicaId,
          error: error.message,
        });

        throw new Error(
          `${MANAGER_ERROR_MSG.WORKER_SPAWN_FAILED}: ${error.message}`,
        );
      }
    },
  };
}

export {createReplicaWorkerManagerReplicaCreationMethods};
