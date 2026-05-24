/**
 * ReplicaWorkerManager pool and message-routing methods.
 *
 * These methods are assigned to ReplicaWorkerManager.prototype by the owner
 * module to keep the public manager surface unchanged.
 *
 * @module worker/replica-worker-manager-pool-routing
 */

function createReplicaWorkerManagerPoolRoutingMethods(deps = {}) {
  const {
    Piscina,
    MANAGER_DEFAULT,
    MANAGER_LOG_MSG,
    NUM,
    WORKER_MANAGER_ADDRESS_SEGMENT,
    LOCAL_STR_ERROR,
    LOCAL_STR_MESSAGE,
    LOCAL_STR_12101,
    LOCAL_STR_O3DH7,
    LOCAL_STR_WORKER_SEND,
    LOCAL_STR_1HK0P,
    LOCAL_STR_SVWDT,
    LOCAL_STR_9XUGG,
    LOCAL_STR_7II3O,
    LOCAL_STR_J1K7I,
    LOCAL_STR_1J4DX,
  } = deps;

  return {
    /**
     * Set up piscina pool event handlers.
     * @private
     */
    setupPoolEventHandlers() {
      this.setupPoolEventHandlersFor(this.pool);
    },

    /**
     * Set up piscina pool event handlers for a specific pool.
     * @param {Piscina} pool - Piscina pool to wire.
     * @private
     */
    setupPoolEventHandlersFor(pool) {
      if (!pool) {
        return;
      }

      pool.on(LOCAL_STR_ERROR, (error) => {
        this.logger.error(MANAGER_LOG_MSG.WORKER_CRASHED, {
          nodeId: this.nodeId,
          error: error.message,
        });
      });

      pool.on(LOCAL_STR_MESSAGE, (message) => {
        this.handleWorkerMessage(message).catch((error) => {
          this.logger.error(LOCAL_STR_12101, {
            nodeId: this.nodeId,
            error: error.message,
            messageType: message?.type,
          });
        });
      });
    },

    /**
     * Check if manager should use dedicated per-replica pools.
     * Real Piscina instances use dedicated pools; mocked pools in unit tests do not.
     * @return {boolean} True if dedicated pools should be used.
     * @private
     */
    usesDedicatedReplicaPools() {
      return this.pool instanceof Piscina;
    },

    /**
     * Create a dedicated single-thread pool for one replica.
     * @param {string} replicaId - Replica ID for logging.
     * @return {Piscina} Dedicated pool.
     * @private
     */
    createDedicatedReplicaPool(replicaId) {
      const pool = new Piscina({
        filename: this.workerPath,
        maxThreads: NUM.ONE,
        minThreads: NUM.ONE,
        idleTimeout: MANAGER_DEFAULT.IDLE_TIMEOUT_MS,
      });
      this.setupPoolEventHandlersFor(pool);
      this.logger.debug(LOCAL_STR_O3DH7, {
        nodeId: this.nodeId,
        replicaId,
      });
      return pool;
    },

    /**
     * Resolve execution pool for a replica operation.
     * @param {string} replicaId - Replica ID.
     * @return {Piscina|Object|null} Pool-like object with run().
     * @private
     */
    getReplicaExecutionPool(replicaId) {
      return this.replicaPools.get(replicaId) || this.pool;
    },

    /**
     * Destroy dedicated pool for a replica if present.
     * @param {string} replicaId - Replica ID.
     * @return {Promise<void>}
     * @private
     */
    async destroyDedicatedReplicaPool(replicaId) {
      const pool = this.replicaPools.get(replicaId);
      if (!pool) {
        return;
      }
      this.replicaPools.delete(replicaId);
      await pool.destroy();
    },

    /**
     * Handle IPC message from a worker process.
     * Routes messages between workers via the MessageRouter.
     * @param {Object} message - IPC message from worker.
     * @return {Promise<void>}
     * @private
     */
    async handleWorkerMessage(message) {
      if (!message || !message.type) {
        return;
      }

      if (message.type === LOCAL_STR_WORKER_SEND) {
        await this.routeWorkerMessage(message);
        return;
      }
    },

    /**
     * Route a message from one worker to another.
     * @param {Object} envelope - Message envelope with source, target, and payload.
     * @return {Promise<void>}
     * @private
     */
    async routeWorkerMessage(envelope) {
      const {
        targetAddress,
        sourceAddress,
        payload,
        messageId,
        correlationId,
      } = envelope;

      this.logger.debug(LOCAL_STR_1HK0P, {
        nodeId: this.nodeId,
        sourceAddress,
        targetAddress,
        messageId,
      });

      const targetParts = targetAddress.split('/');
      if (targetParts.length < WORKER_MANAGER_ADDRESS_SEGMENT.MIN_LENGTH) {
        this.logger.warn(LOCAL_STR_SVWDT, {
          targetAddress,
          messageId,
        });
        return;
      }

      const targetReplicaId =
        targetParts[WORKER_MANAGER_ADDRESS_SEGMENT.REPLICA_INDEX];
      const targetHandle = this.workers.get(targetReplicaId);
      if (!targetHandle) {
        this.logger.debug(LOCAL_STR_9XUGG, {
          targetReplicaId,
          messageId,
        });
        if (this.messageRouter) {
          try {
            await this.messageRouter.deliver(targetAddress, payload);
          } catch (error) {
            this.logger.warn(LOCAL_STR_7II3O, {
              nodeId: this.nodeId,
              sourceAddress,
              targetAddress,
              messageId,
              correlationId,
              error: error.message,
            });
          }
        }
        return;
      }
      try {
        await this.deliverMessage(targetReplicaId, payload);

        this.logger.debug(LOCAL_STR_J1K7I, {
          nodeId: this.nodeId,
          targetReplicaId,
          messageId,
        });
      } catch (error) {
        this.logger.warn(LOCAL_STR_1J4DX, {
          nodeId: this.nodeId,
          sourceAddress,
          targetAddress,
          targetReplicaId,
          messageId,
          correlationId,
          error: error.message,
        });
      }
    },

    /**
     * Register a worker with MessageRouter.
     * Creates a handler that forwards messages to the worker via deliverMessage().
     * Requirements 11.1, 11.2 - Manager-based registration.
     * @param {string} replicaId - Replica ID.
     * @param {string} unifiedAddress - Worker unified address.
     * @private
     */
    registerWorkerWithRouter(replicaId, unifiedAddress) {
      const deliverToWorker = async (envelope) => {
        return this.deliverMessage(replicaId, envelope?.payload || envelope);
      };

      this.messageRouter.registerWorkerHandler(unifiedAddress, deliverToWorker);

      this.logger.debug(MANAGER_LOG_MSG.HANDLER_REGISTERED, {
        nodeId: this.nodeId,
        replicaId,
        unifiedAddress,
      });
    },

    /**
     * Unregister a worker from MessageRouter.
     * Removes the handler that forwards messages to the worker.
     * Requirements 11.4, 11.5 - Unregister handler on stop/crash.
     * @param {string} unifiedAddress - Worker unified address.
     * @private
     */
    unregisterWorkerFromRouter(unifiedAddress) {
      this.messageRouter.unregisterWorkerHandler(unifiedAddress);

      this.logger.debug(MANAGER_LOG_MSG.HANDLER_UNREGISTERED, {
        nodeId: this.nodeId,
        unifiedAddress,
      });
    },
  };
}

export {createReplicaWorkerManagerPoolRoutingMethods};
