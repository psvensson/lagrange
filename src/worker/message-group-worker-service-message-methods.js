import {
  CACHE_MESSAGE_TYPE,
  LEADERSHIP_MESSAGE_TYPE,
  CDC_MESSAGE_TYPE,
  SEED_CACHE_MESSAGE_TYPE,
  FACADE_MESSAGE_TYPE,
  WORKER_ADDRESS,
  WORKER_RESPONSE_STATUS,
} from './worker-constants.js';
import {isRaftPacket} from '../raft/raft-packet-utils.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OK = 'ok';
const LOCAL_STR_CONSTRUCTOR = 'constructor';
const RAFT_PACKET_TYPE_APPEND_ACK = 'append ack';
const RAFT_PACKET_TYPE_APPEND_FAIL = 'append fail';

function createMessageGroupWorkerServiceMessageMethods(deps = {}) {
  const {
    handleBaseWorkerMessage,
    MESSAGE_GROUP_WORKER_DEFAULT,
    MESSAGE_GROUP_WORKER_ERROR_MSG,
    MESSAGE_GROUP_WORKER_LOG_MSG,
  } = deps;

  class MessageGroupWorkerServiceMessageMethods {
    /**
     * Handle one CDC_EVENT message through the canonical CDC dispatcher.
     * @param {Object} message - Incoming CDC message.
     * @return {Object} Worker response.
     * @private
     */
    handleCDCMessage(message) {
      const cdcEvent = message.cdcEvent || message;
      const isLeaderReplica = this.isLeaderReplica();
      let leaderAddress = null;

      if (isLeaderReplica) {
        // Avoid deadlock in single-thread worker pools:
        // leader-side CDC replication requires processing incoming append-ack
        // packets, so we must not block this handler waiting for quorum.
        this.applyCDCEvent(cdcEvent).catch((error) => {
          this.logger.error(
            MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_APPLY_FAILED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              error: error.message,
            },
          );
        });
      } else {
        leaderAddress = this.resolveLeaderAddress();
        const relayCount = Number(message.cdcRelayCount) || 0;
        const shouldRelay = leaderAddress &&
          leaderAddress !== this.unifiedAddress &&
          relayCount < MESSAGE_GROUP_WORKER_DEFAULT.CDC_RELAY_MAX_HOPS &&
          this.messageBridge;
        if (shouldRelay) {
          try {
            this.messageBridge.sendFireAndForget(leaderAddress, {
              type: CDC_MESSAGE_TYPE.CDC_EVENT,
              cdcEvent,
              cdcRelayCount: relayCount + 1,
            });
          } catch (error) {
            this.logger.warn(
              MESSAGE_GROUP_WORKER_ERROR_MSG.CDC_APPLY_FAILED,
              {
                groupId: this.groupId,
                replicaId: this.replicaId,
                leaderAddress,
                error: error.message,
              },
            );
          }
        }
      }

      return isLeaderReplica ?
        {
          status: WORKER_RESPONSE_STATUS.OK,
          replicaId: this.replicaId,
        } :
        {
          status: WORKER_RESPONSE_STATUS.OK,
          replicaId: this.replicaId,
          leaderAddress,
        };
    }

    /**
     * Handle incoming message from MessageRouter.
     * Detects Raft packets and routes them to RaftGroup.
     * @param {Object} message - Incoming message.
     * @return {Promise<Object>} Response.
     */
    async handleMessage(message) {
      // Handle Raft packets via RaftGroup
      if (isRaftPacket(message) ||
        message?.type === RAFT_PACKET_TYPE_APPEND_ACK ||
        message?.type === RAFT_PACKET_TYPE_APPEND_FAIL) {
        return this.handleRaftPacket(message);
      }

      switch (message.type) {
      case CDC_MESSAGE_TYPE.CDC_EVENT:
        return this.handleCDCMessage(message);
      case SEED_CACHE_MESSAGE_TYPE.SEED_CACHE:
        return this.handleSeedCache(message);
      case SEED_CACHE_MESSAGE_TYPE.SET_BOOTSTRAP_PHASE:
        return this.handleSetBootstrapPhase(message);
      case CACHE_MESSAGE_TYPE.CACHE_GET:
        return this.handleCacheGet(message);
      case CACHE_MESSAGE_TYPE.CACHE_QUERY:
        return this.handleCacheQuery(message);
      case CACHE_MESSAGE_TYPE.CACHE_FILTER:
        return this.handleCacheFilter(message);
      case CACHE_MESSAGE_TYPE.CACHE_GET_ALL:
        return this.handleCacheGetAll(message);
      case LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS:
        return this.handleGetLeadershipStatus();
      case FACADE_MESSAGE_TYPE.START_ELECTION:
        return this.handleStartElection();
      default:
        return handleBaseWorkerMessage(this, message);
      }
    }

    /**
     * Resolve the current leader to a unified address when possible.
     * @return {string|null} Leader unified address or null when unknown.
     * @private
     */
    resolveLeaderAddress() {
      const leaderId = this.getLeaderId();
      if (!leaderId || typeof leaderId !== LOCAL_STR_STRING) {
        return null;
      }

      if (leaderId.includes(WORKER_ADDRESS.SEPARATOR)) {
        return leaderId;
      }

      if (leaderId === this.replicaId) {
        return this.unifiedAddress;
      }

      const matchedPeer = this.peerAddresses.find((address) =>
        address.endsWith(`${WORKER_ADDRESS.SEPARATOR}${leaderId}`),
      );
      return matchedPeer || null;
    }

    /**
     * Handle incoming Raft packet via RaftGroup.
     * @param {Object} packet - Raft packet from peer.
     * @return {Object} Acknowledgment result.
     * @private
     */
    handleRaftPacket(packet) {
      if (!this.raftGroup) {
        return {
          acknowledged: false,
          error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        };
      }
      const result = this.raftGroup.handleRaftPacket(packet);
      return result || {acknowledged: false};
    }

    /**
     * Handle CACHE_GET message.
     * @param {Object} message - Cache get message.
     * @return {Object} Response with data.
     * @private
     */
    handleCacheGet(message) {
      if (!this.systemCache) {
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
          data: null,
          error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        };
      }

      const data = this.systemCache.get(
        message.tableName,
        message.key,
      );
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
        data: data || null,
      };
    }

    /**
     * Handle CACHE_QUERY message.
     * @param {Object} message - Cache query message.
     * @return {Object} Response with rows.
     * @private
     */
    handleCacheQuery(message) {
      if (!this.systemCache) {
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
          rows: [],
          error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        };
      }

      try {
        const rows = this.systemCache.query(
          message.sql,
          message.params || [],
        );
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
          rows,
        };
      } catch (error) {
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
          rows: [],
          error: error.message,
        };
      }
    }

    /**
     * Handle CACHE_FILTER message.
     * @param {Object} message - Cache filter message.
     * @return {Object} Response with records.
     * @private
     */
    handleCacheFilter(message) {
      if (!this.systemCache) {
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
          records: [],
          error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        };
      }

      try {
        const predicateFn =
          new Function('return ' + message.predicateString)();
        const records = this.systemCache.filter(
          message.tableName,
          predicateFn,
        );
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
          records,
        };
      } catch (error) {
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_FILTER_RESPONSE,
          records: [],
          error: error.message,
        };
      }
    }

    /**
     * Handle CACHE_GET_ALL message.
     * @param {Object} message - Cache get all message.
     * @return {Object} Response with records.
     * @private
     */
    handleCacheGetAll(message) {
      if (!this.systemCache) {
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL_RESPONSE,
          records: [],
          error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        };
      }

      const records = this.systemCache.getAll(message.tableName);
      return {
        type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL_RESPONSE,
        records,
      };
    }

    /**
     * Handle GET_LEADERSHIP_STATUS message.
     * @return {Object} Response with leadership status.
     * @private
     */
    handleGetLeadershipStatus() {
      return {
        type: LEADERSHIP_MESSAGE_TYPE.LEADERSHIP_STATUS,
        isLeader: this.isLeaderReplica(),
        leaderActivated: this.isLeaderActivated(),
        term: this.getCurrentTerm(),
        leaderId: this.getLeaderId(),
        replicaId: this.replicaId,
      };
    }

    /**
     * Handle START_ELECTION facade message.
     * Starts the Raft election timer via RaftGroup.
     * @return {Object} Response with status.
     * @private
     */
    handleStartElection() {
      if (this.raftGroup) {
        this.raftGroup.startElection();
      }
      return {status: LOCAL_STR_OK, replicaId: this.replicaId};
    }

    /**
     * Handle SEED_CACHE message during bootstrap.
     * @param {Object} message - SEED_CACHE message.
     * @return {Promise<Object>} SEED_CACHE_RESPONSE.
     * @private
     */
    async handleSeedCache(message) {
      this.logger.info(
        MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_RECEIVED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          entryCount: message.entries ?
            message.entries.length : 0,
          bootstrapPhase: message.bootstrapPhase,
        },
      );

      // Reject if not in bootstrap phase
      if (!this.bootstrapPhase) {
        this.logger.warn(
          MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            reason: MESSAGE_GROUP_WORKER_ERROR_MSG
              .SEED_CACHE_NOT_BOOTSTRAP_PHASE,
          },
        );
        return {
          type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
          success: false,
          entriesApplied: 0,
          error: MESSAGE_GROUP_WORKER_ERROR_MSG
            .SEED_CACHE_NOT_BOOTSTRAP_PHASE,
        };
      }

      // Reject if bootstrapPhase flag in message is false
      if (!message.bootstrapPhase) {
        this.logger.warn(
          MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            reason: MESSAGE_GROUP_WORKER_ERROR_MSG
              .SEED_CACHE_NOT_BOOTSTRAP_PHASE,
          },
        );
        return {
          type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
          success: false,
          entriesApplied: 0,
          error: MESSAGE_GROUP_WORKER_ERROR_MSG
            .SEED_CACHE_NOT_BOOTSTRAP_PHASE,
        };
      }

      // Validate entries array
      if (!message.entries || !Array.isArray(message.entries)) {
        this.logger.warn(
          MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REJECTED,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            reason: MESSAGE_GROUP_WORKER_ERROR_MSG
              .SEED_CACHE_MISSING_ENTRIES,
          },
        );
        return {
          type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
          success: false,
          entriesApplied: 0,
          error: MESSAGE_GROUP_WORKER_ERROR_MSG
            .SEED_CACHE_MISSING_ENTRIES,
        };
      }

      // Check if system cache is initialized
      if (!this.systemCache) {
        return {
          type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
          success: false,
          entriesApplied: 0,
          error: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        };
      }

      this.logger.info(
        MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_APPLYING,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          entryCount: message.entries.length,
        },
      );

      let entriesApplied = 0;

      // Apply each entry to the system cache
      for (const entry of message.entries) {
        try {
          if (this.isLeaderReplica()) {
            this.logger.debug(
              MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_REPLICATING,
              {
                groupId: this.groupId,
                replicaId: this.replicaId,
                tableName: entry.tableName,
                operation: entry.operation,
              },
            );

            await this.replicateCDCEvent({
              tableName: entry.tableName,
              operation: entry.operation,
              data: entry.data,
            });
          } else {
            this.systemCache.applyCDCEvent(
              entry.tableName,
              entry.operation,
              entry.data,
            );
          }

          entriesApplied++;

          this.logger.debug(
            MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_ENTRY_APPLIED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              tableName: entry.tableName,
              operation: entry.operation,
              entriesApplied,
            },
          );
        } catch (error) {
          this.logger.error(
            MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_APPLY_FAILED,
            {
              groupId: this.groupId,
              replicaId: this.replicaId,
              tableName: entry.tableName,
              operation: entry.operation,
              error: error.message,
            },
          );

          return {
            type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
            success: false,
            entriesApplied,
            error: `${MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_APPLY_FAILED}: ${error.message}`,
          };
        }
      }

      this.logger.info(
        MESSAGE_GROUP_WORKER_LOG_MSG.SEED_CACHE_COMPLETED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          entriesApplied,
        },
      );

      return {
        type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
        success: true,
        entriesApplied,
        error: null,
      };
    }
  }

  return Object.getOwnPropertyNames(
    MessageGroupWorkerServiceMessageMethods.prototype,
  )
    .filter((name) => name !== LOCAL_STR_CONSTRUCTOR)
    .reduce((accumulator, name) => {
      accumulator[name] =
        MessageGroupWorkerServiceMessageMethods.prototype[name];
      return accumulator;
    }, {});
}

export {createMessageGroupWorkerServiceMessageMethods};
