/**
 * Partition Replication Handler - Manages write forwarding and replication.
 * Extracted from partition-service.js for single responsibility.
 *
 * Write path (unified):
 * - Leader receives write, both paths converge at applyCommittedEntry
 * - Single-replica: applyWrite → applyCommittedEntry → executeWriteEntry
 * - Multi-replica: applyWrite → proposeAndWaitForCommit → Raft commit
 *   → applyCommittedEntry → executeWriteEntry
 * - SQL execution logic lives in ONE place: executeWriteEntry()
 * - The isMultiReplica() check replaces the old isLiferaftLeader check
 *
 * Requirements: 1.1, 1.8, 4.1, 4.2, 4.3, 4.4, 4.5
 *
 * @module partition/partition-replication-handler
 */

import {v4 as uuidv4} from 'uuid';
import {ERRORS} from '../constants/errors.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  PARTITION_SERVICE_MESSAGE_TYPE,
} from './partition-service-constants.js';
import {
  PARTITION_REPLICATION_HANDLER_LOG_MSG,
  PARTITION_REPLICATION_HANDLER_ERROR_MSG,
  PARTITION_REPLICATION_HANDLER_DEFAULT,
} from './partition-replication-handler-constants.js';
import {ProposalQueue} from './proposal-queue.js';

const LOCAL_NUM_ONE = 1;

/**
 * Manages write forwarding and replication for partitions.
 *
 * Unified write path:
 * - All SQL execution goes through applyCommittedEntry → executeWriteEntry
 * - Single-replica: applyWrite → applyCommittedEntry directly
 * - Multi-replica: applyWrite → proposeAndWaitForCommit → Raft commit
 *   → applyCommittedEntry (via PartitionService commit listener)
 * - isMultiReplica() determines the path based on replicaIds count
 * - No duplicate SQL execution logic
 *
 * @class
 */
class PartitionReplicationHandler {
  /**
   * Create a new replication handler instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.replicaId - This replica's ID.
   * @param {Object} options.logger - Logger instance.
   */
  constructor(options = {}) {
    this.partitionId = options.partitionId;
    this.replicaId = options.replicaId;
    this.logger = options.logger || console;

    // Dependencies set via setDependencies()
    this.transport = null;
    this.buildPeerAddress = null;
    this.storage = null;
    this.db = null;
    this.raft = null;
    this.hlcClock = null;

    // Partition topology
    this.replicaIds = null;

    // Callback from PartitionService for unified commit path
    this.applyCommittedEntry = null;

    // Callbacks to parent service
    this.getRole = null;
    this.getLeaderId = null;
    this.scheduleSizeUpdate = null;
    this.generateCDCEvent = null;

    // Bounded proposal queue for pending Raft write commits.
    // Leader tracks proposed writes here; resolved by applyCommittedEntry.
    // Provides backpressure when queue reaches capacity.
    this.proposalQueue = new ProposalQueue();
  }

  /**
   * Set dependencies from the parent PartitionService.
   * Called after the partition service initializes its components.
   * @param {Object} deps - Dependencies object.
   * @param {Object} deps.transport - MessageRouter for Raft communication.
   * @param {Function} deps.buildPeerAddress - Function to resolve peer addresses.
   * @param {Object} deps.storage - PartitionRaftStorage instance.
   * @param {Object} deps.db - SQLite database instance.
   * @param {Object} deps.raft - LifeRaft instance.
   * @param {Object} deps.hlcClock - HLC clock service.
   * @param {Function} deps.getRole - Function to get current Raft role.
   * @param {Function} deps.getLeaderId - Function to get current leader ID.
   * @param {Function} deps.scheduleSizeUpdate - Callback to schedule size update.
   * @param {Function} deps.generateCDCEvent - Callback to generate CDC events.
   * @param {Array<string>} deps.replicaIds - All replica IDs in the partition.
   * @param {Function} deps.applyCommittedEntry - Callback to apply committed
   *   entries through the unified path (PartitionService.applyCommittedEntry).
   */
  setDependencies(deps) {
    this.transport = deps.transport;
    this.buildPeerAddress = deps.buildPeerAddress;
    this.storage = deps.storage;
    this.db = deps.db;
    this.raft = deps.raft;
    this.hlcClock = deps.hlcClock;
    this.getRole = deps.getRole;
    this.getLeaderId = deps.getLeaderId;
    this.scheduleSizeUpdate = deps.scheduleSizeUpdate;
    this.generateCDCEvent = deps.generateCDCEvent;
    this.replicaIds = deps.replicaIds;
    this.applyCommittedEntry = deps.applyCommittedEntry;
  }

  /**
   * Check if the handler is initialized with all dependencies.
   * @return {boolean} True if all dependencies are set.
   */
  isInitialized() {
    return this.db !== null && this.storage !== null;
  }

  /**
   * Check if this partition has multiple replicas.
   * Used to decide between Raft consensus and direct commit paths.
   * @return {boolean} True if the partition has more than one replica.
   */
  isMultiReplica() {
    return Array.isArray(this.replicaIds) && this.replicaIds.length > LOCAL_NUM_ONE;
  }

  /**
   * Resolve the leader's unified address for write forwarding.
   * @return {string|null} Unified leader address or null if unavailable.
   * @private
   */
  resolveLeaderAddress() {
    const leaderId = this.getLeaderId();
    if (!leaderId) {
      return null;
    }

    return this.buildPeerAddress(leaderId);
  }

  /**
   * Propose a write operation through Raft.
   * If this replica is the leader, proposes via Raft and waits for commit.
   * If this replica is a follower, forwards the write to the leader.
   * @param {Object} operation - Write operation.
   * @param {string} operation.type - Operation type.
   * @param {string} operation.sql - SQL query string.
   * @param {Array} [operation.params] - Query parameters.
   * @param {string} [operation.tableName] - Target table name.
   * @return {Promise<Object>} Operation result (after Raft commit).
   * @throws {Error} If no leader is available for write.
   */
  async proposeWrite(operation) {
    const timestamp = this.hlcClock.now();

    const entry = {
      ...operation,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    // If we're the leader, propose through Raft
    const role = this.getRole();
    if (role === RAFT_ROLE.LEADER) {
      return this.applyWrite(entry);
    }

    // If we're not the leader, forward to leader
    const leaderId = this.getLeaderId();
    if (leaderId && this.transport) {
      const leaderAddress = this.resolveLeaderAddress();
      if (!leaderAddress) {
        throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
      }

      this.logger.debug(
        PARTITION_REPLICATION_HANDLER_LOG_MSG.FORWARDING_WRITE_TO_LEADER,
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          leaderId,
          leaderAddress,
          operationType: entry.type,
        },
      );

      const result = await this.transport.deliver(leaderAddress, {
        type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
        operation: entry,
      });

      return result;
    }

    throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  }

  /**
   * Handle forwarded write operations from followers.
   * Called when a FORWARD_WRITE message is received on the leader.
   * @param {Object} message - The message containing the write operation.
   * @param {Object} message.payload - Message payload.
   * @param {Object} message.payload.operation - Write operation to apply.
   * @return {Promise<Object>} Processing result.
   */
  async handleForwardWrite(message) {
    const payload = message.payload || message;

    this.logger.debug(
      PARTITION_REPLICATION_HANDLER_LOG_MSG.HANDLING_FORWARD_WRITE,
      {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        hasOperation: !!payload.operation,
      },
    );

    if (payload.operation) {
      return this.applyWrite(payload.operation);
    }

    return {
      acknowledged: false,
      error:
        PARTITION_REPLICATION_HANDLER_ERROR_MSG.INVALID_FORWARD_WRITE,
    };
  }

  /**
   * Apply a write operation (leader only).
   *
   * Unified approach — both single-replica and multi-replica groups
   * converge at applyCommittedEntry → executeWriteEntry:
   * - Single-replica: call applyCommittedEntry directly (simulates
   *   what Raft consensus would do after commit)
   * - Multi-replica: propose to Raft, wait for commit event which
   *   triggers applyCommittedEntry via the Raft commit listener
   *
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   *
   * @param {Object} entry - Write entry.
   * @param {string} entry.sql - SQL query string.
   * @param {Array} [entry.params] - Query parameters.
   * @param {string} entry.type - Operation type.
   * @return {Promise<Object>} Operation result (after Raft commit).
   * @private
   */
  async applyWrite(entry) {
    this.logger.debug(
      PARTITION_REPLICATION_HANDLER_LOG_MSG.APPLY_WRITE_CALLED,
      {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        entryType: entry.type,
      },
    );

    // Append to local Raft log
    const logEntry = this.storage.appendEntry(entry);

    // Stamp a unique ID for commit correlation
    const entryId = uuidv4();
    entry.entryId = entryId;

    if (this.isMultiReplica()) {
      // Multi-replica: propose through Raft consensus
      this.logger.debug(
        PARTITION_REPLICATION_HANDLER_LOG_MSG.APPLY_WRITE_MULTI_REPLICA,
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
        },
      );
      return this.proposeAndWaitForCommit(entry, logEntry);
    }

    // Single-replica: enqueue a pending commit, then call
    // applyCommittedEntry directly. applyCommittedEntry will execute
    // the SQL and call resolveCommit, which resolves the promise
    // returned here — same flow as multi-replica after Raft commit.
    this.logger.debug(
      PARTITION_REPLICATION_HANDLER_LOG_MSG.APPLY_WRITE_SINGLE_REPLICA,
      {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
      },
    );
    return new Promise((resolve, reject) => {
      this.proposalQueue.enqueue(entryId, {
        resolve,
        reject,
        logIndex: logEntry.index,
      });
      this.applyCommittedEntry(entry);
    });
  }

  /**
   * Execute SQL from a write entry. This is the SINGLE place where
   * write SQL is executed — used by both single-replica direct path
   * and multi-replica Raft commit path (via applyCommittedEntry).
   *
   * CDC events are only generated when emitCdc is true. The caller
   * is responsible for passing true only on the leader replica to
   * avoid duplicate CDC events across replicas.
   *
   * @param {Object} entry - Write entry with sql and params.
   * @param {boolean} emitCdc - Whether to generate CDC events.
   * @return {Object} Execution result with success, changes, partitionId.
   */
  executeWriteEntry(entry, emitCdc) {
    this.logger.debug(
      PARTITION_REPLICATION_HANDLER_LOG_MSG.EXECUTE_SQL,
      {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        entryType: entry.type,
      },
    );

    const stmt = this.db.prepare(entry.sql);
    const params =
      entry.params || PARTITION_REPLICATION_HANDLER_DEFAULT.EMPTY_PARAMS;
    const info = stmt.run(...params);

    const result = {
      success: true,
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid,
      partitionId: this.partitionId,
    };

    if (emitCdc) {
      this.generateCDCEvent(entry).catch((error) => {
        this.logger.error(
          PARTITION_REPLICATION_HANDLER_LOG_MSG
            .CDC_EVENT_GENERATION_FAILED,
          {
            partitionId: this.partitionId,
            error: error.message,
          },
        );
      });
    }

    this.scheduleSizeUpdate();
    return result;
  }

  /**
   * Propose entry to Raft and wait for the commit event.
   *
   * The leader tracks the entry by a unique ID stamped onto the command.
   * When applyCommittedEntry fires (via the Raft 'commit' event), it
   * calls resolveCommit() which resolves the promise here.
   *
   * @param {Object} entry - Write entry with sql and params.
   * @param {Object} logEntry - Raft log entry with index.
   * @return {Promise<Object>} Result resolved after Raft commit.
   * @private
   */
  proposeAndWaitForCommit(entry, logEntry) {
    // Use the entryId already stamped by applyWrite
    const entryId = entry.entryId;

    return new Promise((resolve, reject) => {
      const timeoutMs =
        PARTITION_REPLICATION_HANDLER_DEFAULT.RAFT_COMMIT_TIMEOUT_MS;

      const timeoutId = setTimeout(() => {
        this.proposalQueue.reject(
          entryId,
          PARTITION_REPLICATION_HANDLER_ERROR_MSG.RAFT_COMMIT_TIMEOUT,
        );
        this.logger.error(
          PARTITION_REPLICATION_HANDLER_ERROR_MSG.RAFT_COMMIT_TIMEOUT,
          {
            partitionId: this.partitionId,
            timeoutMs,
          },
        );
      }, timeoutMs);

      this.proposalQueue.enqueue(entryId, {
        resolve,
        reject,
        timeoutId,
        logIndex: logEntry.index,
      });

      // Propose to Raft — liferaft replicates to followers
      this.raft.command(entry).catch((err) => {
        this.proposalQueue.reject(entryId, err);
        this.logger.error(
          PARTITION_REPLICATION_HANDLER_ERROR_MSG.RAFT_COMMAND_FAILED,
          {
            partitionId: this.partitionId,
            error: err.message,
          },
        );
      });
    });
  }

  /**
   * Resolve a pending commit after Raft commit event fires.
   * Called by PartitionService.applyCommittedEntry() on the leader.
   *
   * @param {string} entryId - The unique entry ID stamped on the command.
   * @param {Object} result - SQL execution result from applyCommittedEntry.
   * @return {boolean} True if a pending commit was resolved.
   */
  resolveCommit(entryId, result) {
    const pending = this.proposalQueue.get(entryId);
    if (!pending) {
      return false;
    }

    if (result.success) {
      return this.proposalQueue.resolve(
        entryId, {...result, logIndex: pending.logIndex},
      );
    }

    return this.proposalQueue.reject(entryId, result.error);
  }

  /**
   * Reject a pending commit (e.g. on leadership loss).
   * @param {string} entryId - The unique entry ID.
   * @param {string} errorMessage - Error message.
   * @return {boolean} True if a pending commit was rejected.
   */
  rejectCommit(entryId, errorMessage) {
    return this.proposalQueue.reject(entryId, errorMessage);
  }

  /**
   * Clear all pending commits (for shutdown or leadership loss).
   * @param {string} reason - Reason for clearing.
   */
  clearPendingCommits(reason) {
    this.proposalQueue.clear(reason);
  }

  /**
   * Get count of pending commits.
   * @return {number} Number of pending commits.
   */
  getPendingCommitCount() {
    return this.proposalQueue.size;
  }
}

export {
  PartitionReplicationHandler,
};
