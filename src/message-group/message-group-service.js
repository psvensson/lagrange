/**
 * Message Group Service - Reliable inter-service communication.
 * Implements 3-replica Raft groups with in-memory storage for message routing.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {SystemTableCache} from '../cache/system-table-cache.js';
import {createReadOnlyCache} from '../cache/read-only-system-table-cache.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';

/**
 * Message status enumeration.
 */
const MessageStatus = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  ACKNOWLEDGED: 'acknowledged',
  FAILED: 'failed',
};

/**
 * Raft role enumeration.
 */
const RaftRole = {
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
};

/**
 * In-memory Raft log entry.
 */
class RaftLogEntry {
  /**
   * Create a new Raft log entry.
   * @param {number} term - Raft term.
   * @param {number} index - Log index.
   * @param {Object} data - Entry data.
   */
  constructor(term, index, data) {
    this.term = term;
    this.index = index;
    this.data = data;
    this.timestamp = Date.now();
  }
}

/**
 * In-memory Raft storage for message groups.
 */
class InMemoryRaftStorage {
  /**
   * Create a new in-memory Raft storage.
   */
  constructor() {
    this.log = [];
    this.currentTerm = 0;
    this.votedFor = null;
    this.commitIndex = 0;
    this.lastApplied = 0;
  }

  /**
   * Append an entry to the log.
   * @param {Object} data - Entry data.
   * @return {RaftLogEntry} The appended entry.
   */
  appendEntry(data) {
    const index = this.log.length + 1;
    const entry = new RaftLogEntry(this.currentTerm, index, data);
    this.log.push(entry);
    return entry;
  }

  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index (1-based).
   * @return {Array<RaftLogEntry>} Log entries.
   */
  getEntriesFrom(startIndex) {
    if (startIndex < 1) {
      return [...this.log];
    }
    return this.log.slice(startIndex - 1);
  }

  /**
   * Get the last log entry.
   * @return {RaftLogEntry|null} Last entry or null.
   */
  getLastEntry() {
    return this.log.length > 0 ? this.log[this.log.length - 1] : null;
  }

  /**
   * Get entry at a specific index.
   * @param {number} index - Log index (1-based).
   * @return {RaftLogEntry|null} Entry or null.
   */
  getEntry(index) {
    if (index < 1 || index > this.log.length) {
      return null;
    }
    return this.log[index - 1];
  }

  /**
   * Truncate log from a specific index.
   * @param {number} fromIndex - Index to truncate from (1-based).
   */
  truncateFrom(fromIndex) {
    if (fromIndex >= 1 && fromIndex <= this.log.length) {
      this.log = this.log.slice(0, fromIndex - 1);
    }
  }

  /**
   * Get the log length.
   * @return {number} Number of entries.
   */
  getLogLength() {
    return this.log.length;
  }
}


/**
 * MessageGroupService provides reliable inter-service communication.
 * Implements a 3-replica Raft group with in-memory storage.
 */
class MessageGroupService extends EventEmitter {
  /**
   * Create a new MessageGroupService.
   * @param {Object} options - Configuration options.
   * @param {string} options.groupId - Message group ID.
   * @param {string} options.replicaId - This replica's ID.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Array<string>} options.replicaIds - All replica IDs in the group.
   * @param {Object} options.transport - Transport for Raft communication.
   */
  constructor(options = {}) {
    super();

    if (!options.groupId) {
      throw new Error('MessageGroupService requires groupId');
    }
    if (!options.replicaId) {
      throw new Error('MessageGroupService requires replicaId');
    }

    this.groupId = options.groupId;
    this.replicaId = options.replicaId;
    this.nodeId = options.nodeId || 'unknown';
    this.replicaIds = options.replicaIds || [this.replicaId];
    this.transport = options.transport || null;
    // Self-hosted group: all replicas on same node (bootstrap scenario)
    this.isSelfHostedGroup = options.isSelfHostedGroup || false;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.deliveryTimeoutMs = config.get('messageGroup.deliveryTimeoutMs') || 5000;
    this.retryMaxAttempts = config.get('messageGroup.retryMaxAttempts') || 3;
    this.retryInitialDelayMs = config.get('messageGroup.retryInitialDelayMs') || 100;
    this.retryBackoffMultiplier = config.get('messageGroup.retryBackoffMultiplier') || 2;
    this.retryMaxDelayMs = config.get('messageGroup.retryMaxDelayMs') || 10000;
    this.retryJitterFactor = config.get('messageGroup.retryJitterFactor') || 0.1;

    // Raft state
    this.storage = new InMemoryRaftStorage();
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.electionTimeout = null;
    this.heartbeatInterval = null;

    // Message tracking
    this.pendingMessages = new Map();
    this.acknowledgedMessages = new Set();
    this.messageCallbacks = new Map();

    // System table cache (owned by this replica)
    this.systemTableCache = new SystemTableCache();
    this.readOnlyCache = createReadOnlyCache(this.systemTableCache);

    // HLC clock for ordering
    this.hlcClock = new HLCClockService(this.replicaId);

    // CDC subscriptions
    this.cdcSubscriptions = new Set();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('message-group') : console;

    // State
    this.initialized = false;
    this.isLeader = false;
  }

  /**
   * Initialize the message group service.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing message group service', {
      groupId: this.groupId,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      replicaCount: this.replicaIds.length,
    });

    // Start as follower
    this.role = RaftRole.FOLLOWER;
    this.startElectionTimer();

    this.initialized = true;

    this.logger.info('Message group service initialized', {
      groupId: this.groupId,
      replicaId: this.replicaId,
    });

    this.emit('initialized', {groupId: this.groupId, replicaId: this.replicaId});
  }

  /**
   * Send a message to a target service.
   * Implements simultaneous delivery and persistence pattern.
   * @param {string} targetService - Target service address.
   * @param {Object} message - Message payload.
   * @return {Promise<Object>} Delivery result.
   */
  async sendMessage(targetService, message) {
    if (!this.initialized) {
      throw new Error('MessageGroupService not initialized');
    }

    const messageId = uuidv4();
    const timestamp = this.hlcClock.now();

    const messageEnvelope = {
      id: messageId,
      sourceReplica: this.replicaId,
      sourceGroup: this.groupId,
      targetService,
      payload: message,
      timestamp: timestamp.toString(),
      status: MessageStatus.PENDING,
      attempts: 0,
      createdAt: Date.now(),
    };

    this.logger.debug('Sending message', {
      messageId,
      targetService,
      groupId: this.groupId,
    });

    // Track pending message
    this.pendingMessages.set(messageId, messageEnvelope);

    // Simultaneous delivery and persistence (non-blocking)
    const deliveryPromise = this.attemptDirectDelivery(messageEnvelope);
    const persistPromise = this.persistToRaftLog(messageEnvelope);

    try {
      // Wait for either delivery success or persistence
      const result = await Promise.race([
        deliveryPromise.then((r) => ({type: 'delivery', result: r})),
        persistPromise.then((r) => ({type: 'persist', result: r})),
      ]);

      if (result.type === 'delivery' && result.result.success) {
        // Direct delivery succeeded
        messageEnvelope.status = MessageStatus.DELIVERED;
        this.logger.debug('Message delivered directly', {
          messageId,
          targetService,
        });
        return {
          messageId,
          status: MessageStatus.DELIVERED,
          deliveryType: 'direct',
        };
      }

      // Wait for persistence to complete if delivery failed
      await persistPromise;

      this.logger.debug('Message persisted to Raft log', {
        messageId,
        targetService,
      });

      return {
        messageId,
        status: MessageStatus.PENDING,
        deliveryType: 'persisted',
      };
    } catch (error) {
      this.logger.error('Failed to send message', {
        messageId,
        targetService,
        error: error.message,
      });

      messageEnvelope.status = MessageStatus.FAILED;
      throw error;
    }
  }

  /**
   * Attempt direct delivery to target service.
   * @param {Object} messageEnvelope - Message envelope.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async attemptDirectDelivery(messageEnvelope) {
    const {id: messageId, targetService, payload} = messageEnvelope;
    let lastError = null;

    for (let attempt = 0; attempt < this.retryMaxAttempts; attempt++) {
      messageEnvelope.attempts++;

      try {
        // Calculate delay with exponential backoff and jitter
        if (attempt > 0) {
          const baseDelay = Math.min(
            this.retryInitialDelayMs * Math.pow(this.retryBackoffMultiplier, attempt - 1),
            this.retryMaxDelayMs,
          );
          const jitter = baseDelay * this.retryJitterFactor * Math.random();
          const delay = baseDelay + jitter;
          await this.sleep(delay);
        }

        // Attempt delivery via transport
        if (this.transport) {
          const result = await this.transport.deliver(targetService, {
            messageId,
            payload,
            sourceGroup: this.groupId,
            sourceReplica: this.replicaId,
          });

          if (result && result.acknowledged) {
            return {success: true, attempt: attempt + 1};
          }
        } else {
          // No transport - emit for local handling
          this.emit('message', {
            messageId,
            targetService,
            payload,
            sourceGroup: this.groupId,
          });
          return {success: true, attempt: attempt + 1, local: true};
        }
      } catch (error) {
        lastError = error;
        this.logger.debug('Delivery attempt failed', {
          messageId,
          targetService,
          attempt: attempt + 1,
          error: error.message,
        });
      }
    }

    return {success: false, error: lastError?.message || 'Max retries exceeded'};
  }

  /**
   * Persist message to Raft log.
   * @param {Object} messageEnvelope - Message envelope.
   * @return {Promise<Object>} Persistence result.
   * @private
   */
  async persistToRaftLog(messageEnvelope) {
    const entry = this.storage.appendEntry({
      type: 'MESSAGE',
      message: messageEnvelope,
    });

    // If we're the leader, replicate to followers
    if (this.role === RaftRole.LEADER) {
      await this.replicateEntry(entry);
    }

    return {
      success: true,
      index: entry.index,
      term: entry.term,
    };
  }


  /**
   * Receive a message from another service or replica.
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Processing result.
   */
  async receiveMessage(message) {
    if (!this.initialized) {
      throw new Error('MessageGroupService not initialized');
    }

    // Handle Raft vote requests
    if (message.payload && message.payload.type === 'RAFT_REQUEST_VOTE') {
      return this.handleVoteRequest(message.payload);
    }

    // Handle Raft heartbeats/append entries
    if (message.payload && message.payload.type === 'RAFT_APPEND_ENTRIES') {
      this.handleHeartbeat(message.payload);
      return {acknowledged: true};
    }

    const {messageId, payload, sourceGroup, sourceReplica} = message;

    this.logger.debug('Received message', {
      messageId,
      sourceGroup,
      sourceReplica,
      groupId: this.groupId,
    });

    // Check for duplicate
    if (this.acknowledgedMessages.has(messageId)) {
      this.logger.debug('Duplicate message ignored', {messageId});
      return {
        messageId,
        status: 'duplicate',
        acknowledged: true,
      };
    }

    // Update HLC from remote timestamp if present
    if (message.timestamp) {
      const remoteTimestamp = HLCTimestamp.fromString(message.timestamp);
      this.hlcClock.update(remoteTimestamp);
    }

    // Process the message
    try {
      this.emit('messageReceived', {
        messageId,
        payload,
        sourceGroup,
        sourceReplica,
      });

      return {
        messageId,
        status: 'received',
        acknowledged: false,
      };
    } catch (error) {
      this.logger.error('Error processing received message', {
        messageId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle a Raft vote request from a candidate.
   * @param {Object} voteRequest - Vote request data.
   * @return {Object} Vote response.
   * @private
   */
  handleVoteRequest(voteRequest) {
    const {term, candidateId, lastLogIndex, lastLogTerm} = voteRequest;

    // If candidate's term is less than ours, reject
    if (term < this.storage.currentTerm) {
      return {
        term: this.storage.currentTerm,
        voteGranted: false,
      };
    }

    // If candidate's term is greater, update our term and become follower
    if (term > this.storage.currentTerm) {
      this.storage.currentTerm = term;
      this.storage.votedFor = null;
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
      this.stopHeartbeat();
    }

    // Check if we can vote for this candidate
    const canVote = (this.storage.votedFor === null ||
                     this.storage.votedFor === candidateId);

    // Check if candidate's log is at least as up-to-date as ours
    const ourLastEntry = this.storage.getLastEntry();
    const ourLastTerm = ourLastEntry?.term || 0;
    const ourLastIndex = this.storage.getLogLength();

    const logIsUpToDate = (lastLogTerm > ourLastTerm) ||
      (lastLogTerm === ourLastTerm && lastLogIndex >= ourLastIndex);

    if (canVote && logIsUpToDate) {
      this.storage.votedFor = candidateId;
      this.startElectionTimer(); // Reset election timer

      this.logger.debug('Granted vote', {
        candidateId,
        term,
        replicaId: this.replicaId,
      });

      return {
        term: this.storage.currentTerm,
        voteGranted: true,
      };
    }

    return {
      term: this.storage.currentTerm,
      voteGranted: false,
    };
  }

  /**
   * Acknowledge a message as successfully processed.
   * @param {string} messageId - Message ID to acknowledge.
   * @return {Promise<Object>} Acknowledgment result.
   */
  async acknowledgeMessage(messageId) {
    if (!this.initialized) {
      throw new Error('MessageGroupService not initialized');
    }

    this.logger.debug('Acknowledging message', {
      messageId,
      groupId: this.groupId,
    });

    // Mark as acknowledged
    this.acknowledgedMessages.add(messageId);

    // Remove from pending if present
    const pendingMessage = this.pendingMessages.get(messageId);
    if (pendingMessage) {
      pendingMessage.status = MessageStatus.ACKNOWLEDGED;
      this.pendingMessages.delete(messageId);
    }

    // Persist acknowledgment to Raft log
    const entry = this.storage.appendEntry({
      type: 'ACK',
      messageId,
      timestamp: this.hlcClock.now().toString(),
    });

    // Notify callback if registered
    const callback = this.messageCallbacks.get(messageId);
    if (callback) {
      callback({messageId, status: MessageStatus.ACKNOWLEDGED});
      this.messageCallbacks.delete(messageId);
    }

    this.emit('messageAcknowledged', {messageId});

    return {
      messageId,
      status: MessageStatus.ACKNOWLEDGED,
      logIndex: entry.index,
    };
  }

  /**
   * Subscribe to CDC events from a system table.
   * @param {string} tableName - System table name.
   * @return {Promise<void>}
   */
  async subscribeToCDC(tableName) {
    if (this.cdcSubscriptions.has(tableName)) {
      return;
    }

    this.cdcSubscriptions.add(tableName);

    this.logger.debug('Subscribed to CDC', {
      tableName,
      groupId: this.groupId,
    });
  }

  /**
   * Apply a CDC event to the system table cache.
   * @param {string} tableName - System table name.
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
   * @param {Object} data - Record data.
   * @return {Promise<void>}
   */
  async applyCDCEvent(tableName, operation, data) {
    if (!this.cdcSubscriptions.has(tableName)) {
      this.logger.debug('Ignoring CDC event for unsubscribed table', {
        tableName,
        operation,
      });
      return;
    }

    this.logger.debug('Applying CDC event', {
      tableName,
      operation,
      recordId: data.id,
      groupId: this.groupId,
    });

    // Apply to cache
    this.systemTableCache.applySystemTableChange(tableName, operation, data);

    // Persist CDC event to Raft log for replication
    const entry = this.storage.appendEntry({
      type: 'CDC',
      tableName,
      operation,
      data,
      timestamp: this.hlcClock.now().toString(),
    });

    // Replicate if leader
    if (this.role === RaftRole.LEADER) {
      await this.replicateEntry(entry);
    }

    this.emit('cdcApplied', {tableName, operation, data});
  }

  /**
   * Query the system table cache.
   * Returns a read-only view of the cache.
   * @param {string} tableName - System table name.
   * @param {Object} query - Query parameters.
   * @return {Promise<*>} Query result.
   */
  async querySystemCache(tableName, query = {}) {
    if (!this.initialized) {
      throw new Error('MessageGroupService not initialized');
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
   * Replicate a log entry to followers.
   * @param {RaftLogEntry} entry - Entry to replicate.
   * @return {Promise<void>}
   * @private
   */
  async replicateEntry(entry) {
    if (this.role !== RaftRole.LEADER) {
      return;
    }

    // In a real implementation, this would send AppendEntries RPCs
    // For now, emit an event for testing
    this.emit('replicateEntry', {
      entry,
      term: this.storage.currentTerm,
      leaderId: this.replicaId,
    });
  }

  /**
   * Start the election timer.
   * @private
   */
  startElectionTimer() {
    this.stopElectionTimer();

    const config = ConfigurationManager.getInstance();
    const minTimeout = config.get('raft.electionTimeoutMinMs') || 150;
    const maxTimeout = config.get('raft.electionTimeoutMaxMs') || 300;
    const timeout = minTimeout + Math.random() * (maxTimeout - minTimeout);

    this.electionTimeout = setTimeout(() => {
      this.startElection();
    }, timeout);
  }

  /**
   * Stop the election timer.
   * @private
   */
  stopElectionTimer() {
    if (this.electionTimeout) {
      clearTimeout(this.electionTimeout);
      this.electionTimeout = null;
    }
  }

  /**
   * Start a leader election.
   * @private
   */
  async startElection() {
    if (this.role === RaftRole.LEADER) {
      return;
    }

    this.role = RaftRole.CANDIDATE;
    this.storage.currentTerm++;
    this.storage.votedFor = this.replicaId;

    this.logger.debug('Starting election', {
      term: this.storage.currentTerm,
      replicaId: this.replicaId,
      groupId: this.groupId,
    });

    // For single-node or testing, become leader immediately
    // This includes the self-hosted bootstrap case where all replicas
    // are on the same node (same nodeId)
    if (this.replicaIds.length === 1 ||
        this.replicaIds.every((id) => id === this.replicaId) ||
        this.isSelfHostedGroup) {
      this.becomeLeader();
      return;
    }

    // Request votes from other replicas via transport
    if (this.transport) {
      await this.requestVotesFromPeers();
    } else {
      // No transport - emit event for testing/local handling
      this.emit('requestVote', {
        term: this.storage.currentTerm,
        candidateId: this.replicaId,
        lastLogIndex: this.storage.getLogLength(),
        lastLogTerm: this.storage.getLastEntry()?.term || 0,
      });
    }

    // Restart election timer in case we don't win
    this.startElectionTimer();
  }

  /**
   * Request votes from peer replicas via transport.
   * @return {Promise<void>}
   * @private
   */
  async requestVotesFromPeers() {
    const voteRequest = {
      type: 'RAFT_REQUEST_VOTE',
      term: this.storage.currentTerm,
      candidateId: this.replicaId,
      lastLogIndex: this.storage.getLogLength(),
      lastLogTerm: this.storage.getLastEntry()?.term || 0,
    };

    let votesReceived = 1; // Vote for self
    let peersReached = 0;
    const majority = Math.floor(this.replicaIds.length / 2) + 1;

    // Request votes from all other replicas
    for (const peerId of this.replicaIds) {
      if (peerId === this.replicaId) continue;

      try {
        const result = await this.transport.deliver(peerId, voteRequest);
        if (result && result.acknowledged) {
          peersReached++;
          if (result.result && result.result.voteGranted) {
            votesReceived++;
          }
        }
      } catch (error) {
        this.logger.debug('Vote request failed', {
          peerId,
          error: error.message,
        });
      }
    }

    // Check if we won the election
    if (votesReceived >= majority && this.role === RaftRole.CANDIDATE) {
      this.becomeLeader();
    } else if (peersReached === 0 && this.role === RaftRole.CANDIDATE) {
      // No peers reachable - become leader (bootstrap/single-node scenario)
      this.logger.debug('No peers reachable, becoming leader', {
        replicaId: this.replicaId,
        term: this.storage.currentTerm,
      });
      this.becomeLeader();
    }
  }

  /**
   * Become the leader.
   * @private
   */
  becomeLeader() {
    this.role = RaftRole.LEADER;
    this.leaderId = this.replicaId;
    this.isLeader = true;

    this.stopElectionTimer();
    this.startHeartbeat();

    this.logger.info('Became leader', {
      term: this.storage.currentTerm,
      replicaId: this.replicaId,
      groupId: this.groupId,
    });

    this.emit('leaderElected', {
      leaderId: this.replicaId,
      term: this.storage.currentTerm,
      groupId: this.groupId,
    });
  }

  /**
   * Start sending heartbeats as leader.
   * @private
   */
  startHeartbeat() {
    this.stopHeartbeat();

    const config = ConfigurationManager.getInstance();
    const interval = config.get('raft.heartbeatIntervalMs') || 50;

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
  }

  /**
   * Stop sending heartbeats.
   * @private
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send heartbeat to followers.
   * @private
   */
  sendHeartbeat() {
    if (this.role !== RaftRole.LEADER) {
      return;
    }

    this.emit('heartbeat', {
      term: this.storage.currentTerm,
      leaderId: this.replicaId,
      groupId: this.groupId,
    });
  }

  /**
   * Handle receiving a heartbeat from leader.
   * @param {Object} heartbeat - Heartbeat data.
   */
  handleHeartbeat(heartbeat) {
    if (heartbeat.term >= this.storage.currentTerm) {
      this.storage.currentTerm = heartbeat.term;
      this.leaderId = heartbeat.leaderId;

      if (this.role !== RaftRole.FOLLOWER) {
        this.role = RaftRole.FOLLOWER;
        this.isLeader = false;
        this.stopHeartbeat();
      }

      // Reset election timer
      this.startElectionTimer();
    }
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.role === RaftRole.LEADER;
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    return this.leaderId;
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    return this.role;
  }

  /**
   * Get the current term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    return this.storage.currentTerm;
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
      term: this.storage.currentTerm,
      logLength: this.storage.getLogLength(),
      pendingMessages: this.pendingMessages.size,
      acknowledgedMessages: this.acknowledgedMessages.size,
      cdcSubscriptions: Array.from(this.cdcSubscriptions),
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
    this.logger.info('Shutting down message group service', {
      groupId: this.groupId,
      replicaId: this.replicaId,
    });

    this.stopElectionTimer();
    this.stopHeartbeat();

    this.initialized = false;
    this.pendingMessages.clear();
    this.messageCallbacks.clear();

    this.emit('shutdown', {groupId: this.groupId, replicaId: this.replicaId});
  }
}

export {
  MessageGroupService,
  MessageStatus,
  RaftRole,
  RaftLogEntry,
  InMemoryRaftStorage,
};
