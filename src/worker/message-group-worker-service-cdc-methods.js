import {CDC_MESSAGE_TYPE} from './worker-constants.js';
import {NUM} from '../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_L556Q = 'Failed to subscribe to partition CDC';
const LOCAL_STR_1CVR7 = 'Failed to unsubscribe from partition CDC';
const LOCAL_STR_CDC = 'cdc';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

function isPromiseLike(value) {
  return !!value && typeof value.then === LOCAL_STR_FUNCTION;
}

function createMessageGroupWorkerServiceCDCMethods(deps = {}) {
  const {
    CDC_REPLICATION_TYPE,
    MESSAGE_GROUP_WORKER_DEFAULT,
    MESSAGE_GROUP_WORKER_ERROR_MSG,
    MESSAGE_GROUP_WORKER_LOG_MSG,
  } = deps;

  class MessageGroupWorkerServiceCDCMethods {
    /**
     * Subscribe to CDC events from partition leaders (leader only).
     * @param {Array<string>} [partitionAddresses] - Partition addresses.
     * @return {Promise<void>}
     */
    async subscribeToCDC(partitionAddresses = []) {
      if (this.cdcSubscribed) {
        return;
      }

      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SUBSCRIBING_CDC, {
        groupId: this.groupId,
        replicaId: this.replicaId,
        isLeader: this.isLeaderReplica(),
        partitionCount: partitionAddresses.length,
      });

      // Send SUBSCRIBE_CDC messages to each partition address
      for (const partitionAddress of partitionAddresses) {
        try {
          if (this.messageBridge) {
            await this.messageBridge.send(partitionAddress, {
              type: CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
              subscriberAddress: this.unifiedAddress,
            });
            this.cdcSubscriptions.add(partitionAddress);
          }
        } catch (error) {
          this.logger.warn(LOCAL_STR_L556Q, {
            groupId: this.groupId,
            partitionAddress,
            error: error.message,
          });
        }
      }

      this.cdcSubscribed = true;

      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.SUBSCRIBED_CDC, {
        groupId: this.groupId,
        replicaId: this.replicaId,
        subscriptionCount: this.cdcSubscriptions.size,
      });
    }

    /**
     * Unsubscribe from CDC events (when losing leadership).
     * @return {Promise<void>}
     */
    async unsubscribeFromCDC() {
      if (!this.cdcSubscribed) {
        return;
      }

      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.UNSUBSCRIBING_CDC, {
        groupId: this.groupId,
        replicaId: this.replicaId,
        subscriptionCount: this.cdcSubscriptions.size,
      });

      // Send UNSUBSCRIBE_CDC messages to each subscribed partition
      for (const partitionAddress of this.cdcSubscriptions) {
        try {
          if (this.messageBridge) {
            await this.messageBridge.send(partitionAddress, {
              type: CDC_MESSAGE_TYPE.UNSUBSCRIBE_CDC,
              subscriberAddress: this.unifiedAddress,
            });
          }
        } catch (error) {
          this.logger.warn(
            LOCAL_STR_1CVR7,
            {
              groupId: this.groupId,
              partitionAddress,
              error: error.message,
            },
          );
        }
      }

      this.cdcSubscriptions.clear();
      this.cdcSubscribed = false;

      this.logger.info(MESSAGE_GROUP_WORKER_LOG_MSG.UNSUBSCRIBED_CDC, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });
    }

    /**
     * Apply CDC event to local cache and replicate to followers.
     * @param {Object} cdcEvent - CDC event from partition.
     * @param {string} cdcEvent.tableName - System table name.
     * @param {string} cdcEvent.operation - CDC operation.
     * @param {Object} cdcEvent.data - Record data.
     * @return {Promise<void>}
     */
    async applyCDCEvent(cdcEvent) {
      if (!this.initialized || !this.systemCache) {
        throw new Error(
          MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        );
      }

      this.logger.debug(
        MESSAGE_GROUP_WORKER_LOG_MSG.APPLYING_CDC_EVENT,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          tableName: cdcEvent.tableName,
          operation: cdcEvent.operation,
        },
      );

      const isLeaderReplica = this.isLeaderReplica();

      if (isLeaderReplica) {
        // Leader: replicate via Raft, then apply on commit
        await this.replicateCDCEvent(cdcEvent);
      } else {
        // Follower: apply directly
        this.applyCacheMutation(
          cdcEvent.tableName,
          cdcEvent.operation,
          cdcEvent.data,
        );
      }

      if (!isLeaderReplica) {
        this.logger.debug(
          MESSAGE_GROUP_WORKER_LOG_MSG.CDC_EVENT_APPLIED,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            tableName: cdcEvent.tableName,
            operation: cdcEvent.operation,
          },
        );
      }
    }

    /**
     * Replicate CDC event to followers via Raft.
     * @param {Object} cdcEvent - CDC event to replicate.
     * @return {Promise<void>}
     * @private
     */
    async replicateCDCEvent(cdcEvent) {
      const raft = this.raftGroup ?
        this.raftGroup.getRaftInstance() : null;

      if (!raft) {
        throw new Error(
          MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        );
      }

      this.logger.debug(
        MESSAGE_GROUP_WORKER_LOG_MSG.REPLICATING_CDC,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          tableName: cdcEvent.tableName,
          operation: cdcEvent.operation,
        },
      );

      // Create Raft log entry for CDC replication
      const command = {
        type: CDC_REPLICATION_TYPE,
        entryId: this.createCDCCommitEntryId(),
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        data: cdcEvent.data,
        sourcePartitionId: cdcEvent.sourcePartitionId,
        hlcTimestamp: cdcEvent.hlcTimestamp,
        sequenceNumber: cdcEvent.sequenceNumber,
      };

      const commitPromise = this.waitForCDCCommit(
        command.entryId,
        MESSAGE_GROUP_WORKER_DEFAULT.RAFT_COMMIT_TIMEOUT_MS,
      );
      commitPromise.catch(() => {});

      try {
        await this.proposeCDCCommand(raft, command);
      } catch (error) {
        this.rejectPendingCDCCommit(command.entryId, error);
        throw error;
      }

      await commitPromise;

      this.logger.debug(
        MESSAGE_GROUP_WORKER_LOG_MSG.CDC_REPLICATED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          entryId: command.entryId,
        },
      );
    }

    /**
     * Create a unique correlation ID for one CDC commit.
     * @return {string} CDC entry ID.
     * @private
     */
    createCDCCommitEntryId() {
      this.nextCDCCommitId += NUM.ONE;
      return `${this.replicaId}:${LOCAL_STR_CDC}:${this.nextCDCCommitId}`;
    }

    /**
     * Propose a CDC command to the raw raft instance.
     * Supports both promise-returning raft nodes and callback-only mocks.
     * @param {Object} raft - Raw raft instance.
     * @param {Object} command - CDC command payload.
     * @return {Promise<void>}
     * @private
     */
    proposeCDCCommand(raft, command) {
      return new Promise((resolve, reject) => {
        let settled = false;

        const settleResolve = () => {
          if (settled) {
            return;
          }
          settled = true;
          resolve();
        };

        const settleReject = (error) => {
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        };

        try {
          const proposal = raft.command(
            JSON.stringify(command),
            (error) => {
              if (error) {
                settleReject(error);
              } else {
                settleResolve();
              }
            },
          );

          if (isPromiseLike(proposal)) {
            proposal.then(() => {
              settleResolve();
            }).catch((error) => {
              settleReject(error);
            });
          }
        } catch (error) {
          settleReject(error);
        }
      });
    }

    /**
     * Wait for the matching CDC entry to commit locally.
     * @param {string} entryId - CDC entry correlation ID.
     * @param {number} timeoutMs - Max wait budget.
     * @return {Promise<void>}
     * @private
     */
    waitForCDCCommit(entryId, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.rejectPendingCDCCommit(
            entryId,
            new Error(
              `${MESSAGE_GROUP_WORKER_ERROR_MSG.RAFT_COMMIT_TIMEOUT} after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);

        this.pendingCDCCommits.set(entryId, {
          resolve,
          reject,
          timeoutId,
        });
      });
    }

    /**
     * Resolve one pending CDC commit.
     * @param {string} entryId - CDC entry correlation ID.
     * @return {boolean} True when a pending commit was resolved.
     * @private
     */
    resolvePendingCDCCommit(entryId) {
      if (!entryId) {
        return false;
      }

      const pending = this.pendingCDCCommits.get(entryId);
      if (!pending) {
        return false;
      }

      clearTimeout(pending.timeoutId);
      this.pendingCDCCommits.delete(entryId);
      pending.resolve();
      return true;
    }

    /**
     * Reject one pending CDC commit.
     * @param {string} entryId - CDC entry correlation ID.
     * @param {Error|string} error - Rejection reason.
     * @return {boolean} True when a pending commit was rejected.
     * @private
     */
    rejectPendingCDCCommit(entryId, error) {
      const pending = this.pendingCDCCommits.get(entryId);
      if (!pending) {
        return false;
      }

      clearTimeout(pending.timeoutId);
      this.pendingCDCCommits.delete(entryId);
      pending.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
      return true;
    }

    /**
     * Reject all pending CDC commits.
     * @param {string} reason - Rejection reason.
     * @private
     */
    clearPendingCDCCommits(reason) {
      for (const entryId of this.pendingCDCCommits.keys()) {
        this.rejectPendingCDCCommit(entryId, reason);
      }
    }
  }

  return Object.getOwnPropertyNames(
    MessageGroupWorkerServiceCDCMethods.prototype,
  )
    .filter((name) => name !== LOCAL_STR_CONSTRUCTOR)
    .reduce((accumulator, name) => {
      accumulator[name] = MessageGroupWorkerServiceCDCMethods.prototype[name];
      return accumulator;
    }, {});
}

export {createMessageGroupWorkerServiceCDCMethods};
