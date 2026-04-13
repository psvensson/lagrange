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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { v4 as uuidv4 } from 'uuid';
import { ERRORS } from '../constants/errors.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { PARTITION_SERVICE_MESSAGE_TYPE } from './partition-service-constants.js';
import { PARTITION_REPLICATION_HANDLER_LOG_MSG, PARTITION_REPLICATION_HANDLER_ERROR_MSG, PARTITION_REPLICATION_HANDLER_DEFAULT } from './partition-replication-handler-constants.js';
import { ProposalQueue } from './proposal-queue.js';

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
    if (stryMutAct_9fa48("100945")) {
      {}
    } else {
      stryCov_9fa48("100945");
      this.partitionId = options.partitionId;
      this.replicaId = options.replicaId;
      this.logger = stryMutAct_9fa48("100948") ? options.logger && console : stryMutAct_9fa48("100947") ? false : stryMutAct_9fa48("100946") ? true : (stryCov_9fa48("100946", "100947", "100948"), options.logger || console);

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
    if (stryMutAct_9fa48("100949")) {
      {}
    } else {
      stryCov_9fa48("100949");
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
  }

  /**
   * Check if the handler is initialized with all dependencies.
   * @return {boolean} True if all dependencies are set.
   */
  isInitialized() {
    if (stryMutAct_9fa48("100950")) {
      {}
    } else {
      stryCov_9fa48("100950");
      return stryMutAct_9fa48("100953") ? this.db !== null || this.storage !== null : stryMutAct_9fa48("100952") ? false : stryMutAct_9fa48("100951") ? true : (stryCov_9fa48("100951", "100952", "100953"), (stryMutAct_9fa48("100955") ? this.db === null : stryMutAct_9fa48("100954") ? true : (stryCov_9fa48("100954", "100955"), this.db !== null)) && (stryMutAct_9fa48("100957") ? this.storage === null : stryMutAct_9fa48("100956") ? true : (stryCov_9fa48("100956", "100957"), this.storage !== null)));
    }
  }

  /**
   * Check if this partition has multiple replicas.
   * Used to decide between Raft consensus and direct commit paths.
   * @return {boolean} True if the partition has more than one replica.
   */
  isMultiReplica() {
    if (stryMutAct_9fa48("100958")) {
      {}
    } else {
      stryCov_9fa48("100958");
      return stryMutAct_9fa48("100961") ? Array.isArray(this.replicaIds) || this.replicaIds.length > 1 : stryMutAct_9fa48("100960") ? false : stryMutAct_9fa48("100959") ? true : (stryCov_9fa48("100959", "100960", "100961"), Array.isArray(this.replicaIds) && (stryMutAct_9fa48("100964") ? this.replicaIds.length <= 1 : stryMutAct_9fa48("100963") ? this.replicaIds.length >= 1 : stryMutAct_9fa48("100962") ? true : (stryCov_9fa48("100962", "100963", "100964"), this.replicaIds.length > 1)));
    }
  }

  /**
   * Resolve the leader's unified address for write forwarding.
   * @return {string|null} Unified leader address or null if unavailable.
   * @private
   */
  resolveLeaderAddress() {
    if (stryMutAct_9fa48("100965")) {
      {}
    } else {
      stryCov_9fa48("100965");
      const leaderId = this.getLeaderId();
      if (stryMutAct_9fa48("100968") ? false : stryMutAct_9fa48("100967") ? true : stryMutAct_9fa48("100966") ? leaderId : (stryCov_9fa48("100966", "100967", "100968"), !leaderId)) {
        if (stryMutAct_9fa48("100969")) {
          {}
        } else {
          stryCov_9fa48("100969");
          return null;
        }
      }
      return this.buildPeerAddress(leaderId);
    }
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
    if (stryMutAct_9fa48("100970")) {
      {}
    } else {
      stryCov_9fa48("100970");
      const timestamp = this.hlcClock.now();
      const entry = stryMutAct_9fa48("100971") ? {} : (stryCov_9fa48("100971"), {
        ...operation,
        timestamp: timestamp.toString(),
        proposedBy: this.replicaId,
        proposedAt: Date.now()
      });

      // If we're the leader, propose through Raft
      const role = this.getRole();
      if (stryMutAct_9fa48("100974") ? role !== RAFT_ROLE.LEADER : stryMutAct_9fa48("100973") ? false : stryMutAct_9fa48("100972") ? true : (stryCov_9fa48("100972", "100973", "100974"), role === RAFT_ROLE.LEADER)) {
        if (stryMutAct_9fa48("100975")) {
          {}
        } else {
          stryCov_9fa48("100975");
          return this.applyWrite(entry);
        }
      }

      // If we're not the leader, forward to leader
      const leaderId = this.getLeaderId();
      if (stryMutAct_9fa48("100978") ? leaderId || this.transport : stryMutAct_9fa48("100977") ? false : stryMutAct_9fa48("100976") ? true : (stryCov_9fa48("100976", "100977", "100978"), leaderId && this.transport)) {
        if (stryMutAct_9fa48("100979")) {
          {}
        } else {
          stryCov_9fa48("100979");
          const leaderAddress = this.resolveLeaderAddress();
          if (stryMutAct_9fa48("100982") ? false : stryMutAct_9fa48("100981") ? true : stryMutAct_9fa48("100980") ? leaderAddress : (stryCov_9fa48("100980", "100981", "100982"), !leaderAddress)) {
            if (stryMutAct_9fa48("100983")) {
              {}
            } else {
              stryCov_9fa48("100983");
              throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
            }
          }
          this.logger.debug(PARTITION_REPLICATION_HANDLER_LOG_MSG.FORWARDING_WRITE_TO_LEADER, stryMutAct_9fa48("100984") ? {} : (stryCov_9fa48("100984"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            leaderId,
            leaderAddress,
            operationType: entry.type
          }));
          const result = await this.transport.deliver(leaderAddress, stryMutAct_9fa48("100985") ? {} : (stryCov_9fa48("100985"), {
            type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
            operation: entry
          }));
          return result;
        }
      }
      throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
    }
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
    if (stryMutAct_9fa48("100986")) {
      {}
    } else {
      stryCov_9fa48("100986");
      const payload = stryMutAct_9fa48("100989") ? message.payload && message : stryMutAct_9fa48("100988") ? false : stryMutAct_9fa48("100987") ? true : (stryCov_9fa48("100987", "100988", "100989"), message.payload || message);
      this.logger.debug(PARTITION_REPLICATION_HANDLER_LOG_MSG.HANDLING_FORWARD_WRITE, stryMutAct_9fa48("100990") ? {} : (stryCov_9fa48("100990"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        hasOperation: stryMutAct_9fa48("100991") ? !payload.operation : (stryCov_9fa48("100991"), !(stryMutAct_9fa48("100992") ? payload.operation : (stryCov_9fa48("100992"), !payload.operation)))
      }));
      if (stryMutAct_9fa48("100994") ? false : stryMutAct_9fa48("100993") ? true : (stryCov_9fa48("100993", "100994"), payload.operation)) {
        if (stryMutAct_9fa48("100995")) {
          {}
        } else {
          stryCov_9fa48("100995");
          return this.applyWrite(payload.operation);
        }
      }
      return stryMutAct_9fa48("100996") ? {} : (stryCov_9fa48("100996"), {
        acknowledged: stryMutAct_9fa48("100997") ? true : (stryCov_9fa48("100997"), false),
        error: PARTITION_REPLICATION_HANDLER_ERROR_MSG.INVALID_FORWARD_WRITE
      });
    }
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
    if (stryMutAct_9fa48("100998")) {
      {}
    } else {
      stryCov_9fa48("100998");
      this.logger.debug(PARTITION_REPLICATION_HANDLER_LOG_MSG.APPLY_WRITE_CALLED, stryMutAct_9fa48("100999") ? {} : (stryCov_9fa48("100999"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        entryType: entry.type
      }));

      // Append to local Raft log
      const logEntry = this.storage.appendEntry(entry);

      // Stamp a unique ID for commit correlation
      const entryId = uuidv4();
      entry.entryId = entryId;
      if (stryMutAct_9fa48("101001") ? false : stryMutAct_9fa48("101000") ? true : (stryCov_9fa48("101000", "101001"), this.isMultiReplica())) {
        if (stryMutAct_9fa48("101002")) {
          {}
        } else {
          stryCov_9fa48("101002");
          // Multi-replica: propose through Raft consensus
          this.logger.debug(PARTITION_REPLICATION_HANDLER_LOG_MSG.APPLY_WRITE_MULTI_REPLICA, stryMutAct_9fa48("101003") ? {} : (stryCov_9fa48("101003"), {
            partitionId: this.partitionId,
            replicaId: this.replicaId
          }));
          return this.proposeAndWaitForCommit(entry, logEntry);
        }
      }

      // Single-replica: enqueue a pending commit, then call
      // applyCommittedEntry directly. applyCommittedEntry will execute
      // the SQL and call resolveCommit, which resolves the promise
      // returned here — same flow as multi-replica after Raft commit.
      this.logger.debug(PARTITION_REPLICATION_HANDLER_LOG_MSG.APPLY_WRITE_SINGLE_REPLICA, stryMutAct_9fa48("101004") ? {} : (stryCov_9fa48("101004"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId
      }));
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("101005")) {
          {}
        } else {
          stryCov_9fa48("101005");
          this.proposalQueue.enqueue(entryId, stryMutAct_9fa48("101006") ? {} : (stryCov_9fa48("101006"), {
            resolve,
            reject,
            logIndex: logEntry.index
          }));
          this.applyCommittedEntry(entry);
        }
      });
    }
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
    if (stryMutAct_9fa48("101007")) {
      {}
    } else {
      stryCov_9fa48("101007");
      this.logger.debug(PARTITION_REPLICATION_HANDLER_LOG_MSG.EXECUTE_SQL, stryMutAct_9fa48("101008") ? {} : (stryCov_9fa48("101008"), {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        entryType: entry.type
      }));
      const stmt = this.db.prepare(entry.sql);
      const params = stryMutAct_9fa48("101011") ? entry.params && PARTITION_REPLICATION_HANDLER_DEFAULT.EMPTY_PARAMS : stryMutAct_9fa48("101010") ? false : stryMutAct_9fa48("101009") ? true : (stryCov_9fa48("101009", "101010", "101011"), entry.params || PARTITION_REPLICATION_HANDLER_DEFAULT.EMPTY_PARAMS);
      const info = stmt.run(...params);
      const result = stryMutAct_9fa48("101012") ? {} : (stryCov_9fa48("101012"), {
        success: stryMutAct_9fa48("101013") ? false : (stryCov_9fa48("101013"), true),
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId
      });
      if (stryMutAct_9fa48("101015") ? false : stryMutAct_9fa48("101014") ? true : (stryCov_9fa48("101014", "101015"), emitCdc)) {
        if (stryMutAct_9fa48("101016")) {
          {}
        } else {
          stryCov_9fa48("101016");
          this.generateCDCEvent(entry).catch(error => {
            if (stryMutAct_9fa48("101017")) {
              {}
            } else {
              stryCov_9fa48("101017");
              this.logger.error(PARTITION_REPLICATION_HANDLER_LOG_MSG.CDC_EVENT_GENERATION_FAILED, stryMutAct_9fa48("101018") ? {} : (stryCov_9fa48("101018"), {
                partitionId: this.partitionId,
                error: error.message
              }));
            }
          });
        }
      }
      this.scheduleSizeUpdate();
      return result;
    }
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
    if (stryMutAct_9fa48("101019")) {
      {}
    } else {
      stryCov_9fa48("101019");
      // Use the entryId already stamped by applyWrite
      const entryId = entry.entryId;
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("101020")) {
          {}
        } else {
          stryCov_9fa48("101020");
          const timeoutMs = PARTITION_REPLICATION_HANDLER_DEFAULT.RAFT_COMMIT_TIMEOUT_MS;
          const timeoutId = setTimeout(() => {
            if (stryMutAct_9fa48("101021")) {
              {}
            } else {
              stryCov_9fa48("101021");
              this.proposalQueue.reject(entryId, PARTITION_REPLICATION_HANDLER_ERROR_MSG.RAFT_COMMIT_TIMEOUT);
              this.logger.error(PARTITION_REPLICATION_HANDLER_ERROR_MSG.RAFT_COMMIT_TIMEOUT, stryMutAct_9fa48("101022") ? {} : (stryCov_9fa48("101022"), {
                partitionId: this.partitionId,
                timeoutMs
              }));
            }
          }, timeoutMs);
          this.proposalQueue.enqueue(entryId, stryMutAct_9fa48("101023") ? {} : (stryCov_9fa48("101023"), {
            resolve,
            reject,
            timeoutId,
            logIndex: logEntry.index
          }));

          // Propose to Raft — liferaft replicates to followers
          this.raft.command(entry).catch(err => {
            if (stryMutAct_9fa48("101024")) {
              {}
            } else {
              stryCov_9fa48("101024");
              this.proposalQueue.reject(entryId, err);
              this.logger.error(PARTITION_REPLICATION_HANDLER_ERROR_MSG.RAFT_COMMAND_FAILED, stryMutAct_9fa48("101025") ? {} : (stryCov_9fa48("101025"), {
                partitionId: this.partitionId,
                error: err.message
              }));
            }
          });
        }
      });
    }
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
    if (stryMutAct_9fa48("101026")) {
      {}
    } else {
      stryCov_9fa48("101026");
      const pending = this.proposalQueue.get(entryId);
      if (stryMutAct_9fa48("101029") ? false : stryMutAct_9fa48("101028") ? true : stryMutAct_9fa48("101027") ? pending : (stryCov_9fa48("101027", "101028", "101029"), !pending)) {
        if (stryMutAct_9fa48("101030")) {
          {}
        } else {
          stryCov_9fa48("101030");
          return stryMutAct_9fa48("101031") ? true : (stryCov_9fa48("101031"), false);
        }
      }
      if (stryMutAct_9fa48("101033") ? false : stryMutAct_9fa48("101032") ? true : (stryCov_9fa48("101032", "101033"), result.success)) {
        if (stryMutAct_9fa48("101034")) {
          {}
        } else {
          stryCov_9fa48("101034");
          return this.proposalQueue.resolve(entryId, stryMutAct_9fa48("101035") ? {} : (stryCov_9fa48("101035"), {
            ...result,
            logIndex: pending.logIndex
          }));
        }
      }
      return this.proposalQueue.reject(entryId, result.error);
    }
  }

  /**
   * Reject a pending commit (e.g. on leadership loss).
   * @param {string} entryId - The unique entry ID.
   * @param {string} errorMessage - Error message.
   * @return {boolean} True if a pending commit was rejected.
   */
  rejectCommit(entryId, errorMessage) {
    if (stryMutAct_9fa48("101036")) {
      {}
    } else {
      stryCov_9fa48("101036");
      return this.proposalQueue.reject(entryId, errorMessage);
    }
  }

  /**
   * Clear all pending commits (for shutdown or leadership loss).
   * @param {string} reason - Reason for clearing.
   */
  clearPendingCommits(reason) {
    if (stryMutAct_9fa48("101037")) {
      {}
    } else {
      stryCov_9fa48("101037");
      this.proposalQueue.clear(reason);
    }
  }

  /**
   * Get count of pending commits.
   * @return {number} Number of pending commits.
   */
  getPendingCommitCount() {
    if (stryMutAct_9fa48("101038")) {
      {}
    } else {
      stryCov_9fa48("101038");
      return this.proposalQueue.size;
    }
  }
}
export { PartitionReplicationHandler };