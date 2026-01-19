/**
 * Partition Service - SQLite-backed Raft group for data storage.
 * Implements table partitions with Raft consensus for replication.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4, 35.1, 35.5
 */

import {EventEmitter} from 'events';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';

/**
 * Partition state enumeration.
 */
const PartitionState = {
  NORMAL: 'NORMAL',
  SPLITTING: 'SPLITTING',
  MERGING: 'MERGING',
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
 * CDC operation types.
 */
const CDCOperation = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * Raft log entry for partition operations.
 */
class PartitionRaftLogEntry {
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
 * SQLite-backed Raft storage for partitions.
 */
class SQLiteRaftStorage {
  /**
   * Create a new SQLite Raft storage.
   * @param {Database} db - SQLite database instance.
   * @param {string} partitionId - Partition ID.
   */
  constructor(db, partitionId) {
    this.db = db;
    this.partitionId = partitionId;
    this.currentTerm = 0;
    this.votedFor = null;
    this.commitIndex = 0;
    this.lastApplied = 0;

    // In-memory log for Raft entries
    this.log = [];

    this.initializeRaftTables();
  }

  /**
   * Initialize Raft metadata tables.
   * @private
   */
  initializeRaftTables() {
    // Create Raft state table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _raft_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Create Raft log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Load persisted state
    this.loadPersistedState();
  }

  /**
   * Load persisted Raft state from SQLite.
   * @private
   */
  loadPersistedState() {
    const termRow = this.db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?',
    ).get('currentTerm');
    if (termRow) {
      this.currentTerm = parseInt(termRow.value, 10);
    }

    const votedRow = this.db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?',
    ).get('votedFor');
    if (votedRow) {
      this.votedFor = votedRow.value;
    }

    // Load log entries
    const entries = this.db.prepare(
      'SELECT log_index, term, data, timestamp FROM _raft_log ORDER BY log_index',
    ).all();

    this.log = entries.map((row) => new PartitionRaftLogEntry(
      row.term,
      row.log_index,
      JSON.parse(row.data),
    ));

    if (this.log.length > 0) {
      this.commitIndex = this.log[this.log.length - 1].index;
      this.lastApplied = this.commitIndex;
    }
  }

  /**
   * Persist current term to SQLite.
   */
  persistTerm() {
    this.db.prepare(
      'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)',
    ).run('currentTerm', String(this.currentTerm));
  }

  /**
   * Persist voted for to SQLite.
   */
  persistVotedFor() {
    this.db.prepare(
      'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)',
    ).run('votedFor', this.votedFor || '');
  }

  /**
   * Append an entry to the log.
   * @param {Object} data - Entry data.
   * @return {PartitionRaftLogEntry} The appended entry.
   */
  appendEntry(data) {
    const index = this.log.length + 1;
    const entry = new PartitionRaftLogEntry(this.currentTerm, index, data);
    this.log.push(entry);

    // Persist to SQLite
    this.db.prepare(
      'INSERT INTO _raft_log (log_index, term, data, timestamp) VALUES (?, ?, ?, ?)',
    ).run(entry.index, entry.term, JSON.stringify(entry.data), entry.timestamp);

    return entry;
  }

  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index (1-based).
   * @return {Array<PartitionRaftLogEntry>} Log entries.
   */
  getEntriesFrom(startIndex) {
    if (startIndex < 1) {
      return [...this.log];
    }
    return this.log.slice(startIndex - 1);
  }

  /**
   * Get the last log entry.
   * @return {PartitionRaftLogEntry|null} Last entry or null.
   */
  getLastEntry() {
    return this.log.length > 0 ? this.log[this.log.length - 1] : null;
  }

  /**
   * Get entry at a specific index.
   * @param {number} index - Log index (1-based).
   * @return {PartitionRaftLogEntry|null} Entry or null.
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

      // Truncate in SQLite
      this.db.prepare('DELETE FROM _raft_log WHERE log_index >= ?').run(fromIndex);
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
 * PartitionService implements a SQLite-backed Raft group for data storage.
 * Each partition is a Raft consensus group with odd-numbered replicas.
 */
class PartitionService extends EventEmitter {
  /**
   * Create a new PartitionService.
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.tableId - Table ID this partition belongs to.
   * @param {string} options.tableName - Table name.
   * @param {Object} options.schema - Table schema definition.
   * @param {Object} options.keyRange - Partition key range {start, end}.
   * @param {string} options.replicaId - This replica's ID.
   * @param {Array<string>} options.replicaIds - All replica IDs in the partition.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Object} options.transport - MessageGroupTransport for Raft communication.
   * @param {string} options.dbPath - Path to SQLite database file.
   */
  constructor(options = {}) {
    super();

    if (!options.partitionId) {
      throw new Error('PartitionService requires partitionId');
    }
    if (!options.tableId) {
      throw new Error('PartitionService requires tableId');
    }
    if (!options.replicaId) {
      throw new Error('PartitionService requires replicaId');
    }

    this.partitionId = options.partitionId;
    this.tableId = options.tableId;
    this.tableName = options.tableName || options.tableId;
    this.schema = options.schema || null;
    this.keyRange = options.keyRange || {start: null, end: null};
    this.replicaId = options.replicaId;
    this.replicaIds = options.replicaIds || [this.replicaId];
    this.nodeId = options.nodeId || 'unknown';
    this.transport = options.transport || null;
    this.dbPath = options.dbPath || ':memory:';
    // Self-hosted group: all replicas on same node (bootstrap scenario)
    this.isSelfHostedGroup = options.isSelfHostedGroup || false;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount = config.get('partition.defaultReplicaCount') || 3;
    this.sizeUpdateDebounceMs = config.get('partition.sizeUpdateDebounceMs') || 5000;
    this.sizeUpdateIntervalMs = config.get('partition.sizeUpdateIntervalMs') || 60000;

    // SQLite database
    this.db = null;
    this.storage = null;

    // Raft state
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.electionTimeout = null;
    this.heartbeatInterval = null;

    // Partition state
    this.state = PartitionState.NORMAL;

    // Size tracking
    this.sizeBytes = 0;
    this.sizeUpdatePending = false;
    this.lastSizeUpdate = 0;
    this.sizeUpdateTimer = null;

    // CDC subscribers
    this.cdcSubscribers = new Set();

    // HLC clock for ordering
    this.hlcClock = new HLCClockService(this.replicaId);

    // Transaction state
    this.activeTransaction = null;
    this.transactionOperations = [];

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('partition') : console;

    // State
    this.initialized = false;
    this.isLeader = false;
  }

  /**
   * Initialize the partition service.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing partition service', {
      partitionId: this.partitionId,
      tableId: this.tableId,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      replicaCount: this.replicaIds.length,
      dbPath: this.dbPath,
    });

    // Ensure directory exists for file-based databases
    if (this.dbPath !== ':memory:') {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, {recursive: true});
        this.logger.debug('Created partition directory', {path: dbDir});
      }
    }

    // Open SQLite database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Initialize Raft storage
    this.storage = new SQLiteRaftStorage(this.db, this.partitionId);

    // Create table if schema provided
    if (this.schema) {
      this.createTable();
    }

    // Register with transport if available
    if (this.transport) {
      this.transport.register(this.replicaId, this.handleTransportMessage.bind(this));
    }

    // Start as follower
    this.role = RaftRole.FOLLOWER;

    // For single-replica or self-hosted groups, become leader immediately
    if (this.replicaIds.length === 1 ||
        this.replicaIds.every((id) => id === this.replicaId) ||
        this.isSelfHostedGroup) {
      this.becomeLeader();
    } else {
      this.startElectionTimer();
    }

    // Start periodic size updates
    this.startPeriodicSizeUpdates();

    // Calculate initial size
    await this.updatePartitionSize();

    this.initialized = true;

    this.logger.info('Partition service initialized', {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      sizeBytes: this.sizeBytes,
    });

    this.emit('initialized', {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }

  /**
   * Create the table based on schema.
   * @private
   */
  createTable() {
    if (!this.schema || !this.schema.columns) {
      return;
    }

    const columns = this.schema.columns.map((col) => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) {
        def += ' PRIMARY KEY';
      }
      if (col.notNull) {
        def += ' NOT NULL';
      }
      if (col.defaultValue !== undefined) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      return def;
    }).join(', ');

    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns})`;
    this.db.exec(sql);

    this.logger.debug('Created table', {
      tableName: this.tableName,
      partitionId: this.partitionId,
    });
  }

  /**
   * Handle incoming transport message.
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response.
   * @private
   */
  async handleTransportMessage(envelope) {
    const {payload} = envelope;

    if (!payload || !payload.type) {
      return {acknowledged: false, error: 'Invalid message'};
    }

    switch (payload.type) {
    case 'mg_raft_append_entries':
      return this.handleAppendEntries(payload);
    case 'mg_raft_request_vote':
      return this.handleRequestVote(payload);
    case 'mg_raft_append_entries_response':
      return this.handleAppendEntriesResponse(payload);
    case 'mg_raft_request_vote_response':
      return this.handleRequestVoteResponse(payload);
    default:
      return {acknowledged: false, error: `Unknown message type: ${payload.type}`};
    }
  }


  /**
   * Begin a transaction on this partition.
   * Uses SQLite's transaction support for READ COMMITTED isolation.
   * @return {Promise<Object>} Transaction result.
   */
  async beginTransaction() {
    if (!this.initialized) {
      throw new Error('PartitionService not initialized');
    }

    if (this.activeTransaction) {
      throw new Error('Transaction already active on this partition');
    }

    this.logger.debug('Beginning transaction', {
      partitionId: this.partitionId,
    });

    try {
      // Use SQLite's BEGIN for transaction support
      this.db.exec('BEGIN IMMEDIATE');
      this.activeTransaction = {
        startTime: Date.now(),
        operations: [],
      };
      this.transactionOperations = [];

      return {
        success: true,
        operation: 'BEGIN_TRANSACTION',
        partitionId: this.partitionId,
        inTransaction: true,
      };
    } catch (error) {
      this.logger.error('Failed to begin transaction', {
        partitionId: this.partitionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Commit the active transaction.
   * Ensures durability through Raft replication before acknowledging.
   * @return {Promise<Object>} Commit result.
   */
  async commitTransaction() {
    if (!this.initialized) {
      throw new Error('PartitionService not initialized');
    }

    if (!this.activeTransaction) {
      throw new Error('No active transaction to commit');
    }

    this.logger.debug('Committing transaction', {
      partitionId: this.partitionId,
      operationCount: this.transactionOperations.length,
    });

    try {
      // Replicate transaction operations through Raft for durability
      const raftEntry = await this.replicateTransactionCommit();

      // Commit in SQLite
      this.db.exec('COMMIT');

      const duration = Date.now() - this.activeTransaction.startTime;
      const operationCount = this.transactionOperations.length;

      // Generate CDC events for all operations
      for (const op of this.transactionOperations) {
        await this.generateCDCEvent(op);
      }

      // Clear transaction state
      this.activeTransaction = null;
      this.transactionOperations = [];

      // Schedule size update
      this.scheduleSizeUpdate();

      return {
        success: true,
        operation: 'COMMIT',
        partitionId: this.partitionId,
        committed: true,
        durationMs: duration,
        operationCount,
        raftLogIndex: raftEntry?.index || null,
      };
    } catch (error) {
      this.logger.error('Failed to commit transaction', {
        partitionId: this.partitionId,
        error: error.message,
      });

      // Rollback on failure
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }

      this.activeTransaction = null;
      this.transactionOperations = [];

      throw error;
    }
  }

  /**
   * Rollback the active transaction.
   * @return {Promise<Object>} Rollback result.
   */
  async rollbackTransaction() {
    if (!this.initialized) {
      throw new Error('PartitionService not initialized');
    }

    if (!this.activeTransaction) {
      throw new Error('No active transaction to rollback');
    }

    this.logger.debug('Rolling back transaction', {
      partitionId: this.partitionId,
      operationCount: this.transactionOperations.length,
    });

    try {
      // Rollback in SQLite - this reverts all changes
      this.db.exec('ROLLBACK');

      const duration = Date.now() - this.activeTransaction.startTime;
      const operationCount = this.transactionOperations.length;

      // Clear transaction state
      this.activeTransaction = null;
      this.transactionOperations = [];

      return {
        success: true,
        operation: 'ROLLBACK',
        partitionId: this.partitionId,
        rolledBack: true,
        durationMs: duration,
        operationCount,
      };
    } catch (error) {
      this.logger.error('Failed to rollback transaction', {
        partitionId: this.partitionId,
        error: error.message,
      });

      // Clear transaction state anyway
      this.activeTransaction = null;
      this.transactionOperations = [];

      throw error;
    }
  }

  /**
   * Check if a transaction is active.
   * @return {boolean} True if transaction is active.
   */
  isInTransaction() {
    return this.activeTransaction !== null;
  }

  /**
   * Replicate transaction commit through Raft for durability.
   * @return {Promise<Object>} Raft log entry.
   * @private
   */
  async replicateTransactionCommit() {
    if (this.transactionOperations.length === 0) {
      return null;
    }

    const timestamp = this.hlcClock.now();

    const entry = {
      type: 'TRANSACTION_COMMIT',
      operations: this.transactionOperations,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    // Append to Raft log
    const logEntry = this.storage.appendEntry(entry);

    // Replicate to followers if we're the leader
    if (this.role === RaftRole.LEADER) {
      await this.replicateEntry(logEntry);
    }

    return logEntry;
  }

  /**
   * Execute a SQL query on this partition.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   */
  async executeQuery(sql, params = []) {
    if (!this.initialized) {
      throw new Error('PartitionService not initialized');
    }

    this.logger.debug('Executing query', {
      partitionId: this.partitionId,
      sql: sql.substring(0, 100),
    });

    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

      if (isSelect) {
        const rows = stmt.all(...params);
        return {
          success: true,
          rows,
          count: rows.length,
          partitionId: this.partitionId,
        };
      } else {
        // For write operations within a transaction, execute directly
        if (this.activeTransaction) {
          return this.executeTransactionWrite({type: 'QUERY', sql, params});
        }
        // For write operations outside transaction, go through Raft
        return this.proposeWrite({type: 'QUERY', sql, params});
      }
    } catch (error) {
      this.logger.error('Query execution failed', {
        partitionId: this.partitionId,
        sql: sql.substring(0, 100),
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute a write operation within an active transaction.
   * @param {Object} operation - Write operation.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async executeTransactionWrite(operation) {
    if (!this.activeTransaction) {
      throw new Error('No active transaction');
    }

    const timestamp = this.hlcClock.now();

    const entry = {
      ...operation,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    try {
      const stmt = this.db.prepare(entry.sql);
      const info = stmt.run(...(entry.params || []));

      // Track operation for later CDC generation and Raft replication
      this.transactionOperations.push(entry);

      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
        inTransaction: true,
      };
    } catch (error) {
      this.logger.error('Transaction write failed', {
        partitionId: this.partitionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Insert data into the partition.
   * @param {string} tableName - Table name.
   * @param {Object} data - Data to insert.
   * @return {Promise<Object>} Insert result.
   */
  async insertData(tableName, data) {
    if (!this.initialized) {
      throw new Error('PartitionService not initialized');
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

    return this.proposeWrite({
      type: 'INSERT',
      tableName,
      data,
      sql,
      params: values,
    });
  }

  /**
   * Update data in the partition.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause conditions.
   * @param {Object} data - Data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateData(tableName, whereClause, data) {
    if (!this.initialized) {
      throw new Error('PartitionService not initialized');
    }

    const setClauses = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    const whereClauses = Object.keys(whereClause).map((k) => `${k} = ?`).join(' AND ');
    const sql = `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClauses}`;
    const params = [...Object.values(data), ...Object.values(whereClause)];

    return this.proposeWrite({
      type: 'UPDATE',
      tableName,
      data,
      whereClause,
      sql,
      params,
    });
  }

  /**
   * Delete data from the partition.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause conditions.
   * @return {Promise<Object>} Delete result.
   */
  async deleteData(tableName, whereClause) {
    if (!this.initialized) {
      throw new Error('PartitionService not initialized');
    }

    const whereClauses = Object.keys(whereClause).map((k) => `${k} = ?`).join(' AND ');
    const sql = `DELETE FROM ${tableName} WHERE ${whereClauses}`;
    const params = Object.values(whereClause);

    return this.proposeWrite({
      type: 'DELETE',
      tableName,
      whereClause,
      sql,
      params,
    });
  }

  /**
   * Upsert data in the partition (insert or replace on conflict).
   * @param {string} tableName - Table name.
   * @param {Object} data - Data to upsert.
   * @return {Promise<Object>} Upsert result.
   */
  async upsertData(tableName, data) {
    if (!this.initialized) {
      throw new Error('PartitionService not initialized');
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${tableName} ` +
      `(${columns.join(', ')}) VALUES (${placeholders})`;

    return this.proposeWrite({
      type: 'UPSERT',
      tableName,
      data,
      sql,
      params: values,
    });
  }

  /**
   * Propose a write operation through Raft.
   * @param {Object} operation - Write operation.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async proposeWrite(operation) {
    const timestamp = this.hlcClock.now();

    const entry = {
      ...operation,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    // If we're the leader, append and replicate
    if (this.role === RaftRole.LEADER) {
      return this.applyWrite(entry);
    }

    // If we're not the leader, forward to leader
    if (this.leaderId && this.transport) {
      try {
        const result = await this.transport.deliver(this.leaderId, {
          type: 'FORWARD_WRITE',
          operation: entry,
        });
        return result;
      } catch (error) {
        throw new Error(`Failed to forward write to leader: ${error.message}`);
      }
    }

    throw new Error('No leader available for write operation');
  }

  /**
   * Apply a write operation (leader only).
   * @param {Object} entry - Write entry.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async applyWrite(entry) {
    // Append to Raft log
    const logEntry = this.storage.appendEntry(entry);

    // Execute the SQL
    let result;
    try {
      const stmt = this.db.prepare(entry.sql);
      const info = stmt.run(...(entry.params || []));

      result = {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
        logIndex: logEntry.index,
      };

      // Generate CDC event
      await this.generateCDCEvent(entry);

      // Schedule size update
      this.scheduleSizeUpdate();
    } catch (error) {
      result = {
        success: false,
        error: error.message,
        partitionId: this.partitionId,
      };
    }

    // Replicate to followers
    if (this.role === RaftRole.LEADER) {
      await this.replicateEntry(logEntry);
    }

    return result;
  }

  /**
   * Generate a CDC event for a write operation.
   * @param {Object} entry - Write entry.
   * @return {Promise<void>}
   * @private
   */
  async generateCDCEvent(entry) {
    if (this.cdcSubscribers.size === 0) {
      return;
    }

    let operation;
    switch (entry.type) {
    case 'INSERT':
      operation = CDCOperation.INSERT;
      break;
    case 'UPDATE':
      operation = CDCOperation.UPDATE;
      break;
    case 'DELETE':
      operation = CDCOperation.DELETE;
      break;
    default:
      return; // No CDC for other operations
    }

    // For UPDATE operations, merge whereClause (contains primary key) with data
    // This ensures CDC events always include the primary key field
    let cdcData = entry.data || {};
    if (entry.type === 'UPDATE' && entry.whereClause) {
      cdcData = {...entry.whereClause, ...cdcData};
    }

    const cdcEvent = {
      tableName: entry.tableName || this.tableName,
      operation,
      data: cdcData,
      timestamp: entry.timestamp,
      sourcePartition: this.partitionId,
      sourceReplica: this.replicaId,
    };

    this.logger.debug('Generated CDC event', {
      partitionId: this.partitionId,
      operation,
      tableName: cdcEvent.tableName,
    });

    // Deliver to subscribers
    for (const subscriber of this.cdcSubscribers) {
      try {
        if (typeof subscriber === 'function') {
          await subscriber(cdcEvent);
        } else if (subscriber.handleCDCEvent) {
          await subscriber.handleCDCEvent(cdcEvent);
        }
      } catch (error) {
        this.logger.error('Failed to deliver CDC event', {
          partitionId: this.partitionId,
          error: error.message,
        });
      }
    }

    this.emit('cdcEvent', cdcEvent);
  }

  /**
   * Subscribe to CDC events from this partition.
   * @param {Function|Object} subscriber - Subscriber function or object.
   */
  subscribeToCDC(subscriber) {
    this.cdcSubscribers.add(subscriber);
    this.logger.debug('CDC subscriber added', {
      partitionId: this.partitionId,
      subscriberCount: this.cdcSubscribers.size,
    });
  }

  /**
   * Unsubscribe from CDC events.
   * @param {Function|Object} subscriber - Subscriber to remove.
   */
  unsubscribeFromCDC(subscriber) {
    this.cdcSubscribers.delete(subscriber);
    this.logger.debug('CDC subscriber removed', {
      partitionId: this.partitionId,
      subscriberCount: this.cdcSubscribers.size,
    });
  }


  /**
   * Calculate the partition size using SQLite pragmas.
   * @return {Promise<number>} Size in bytes.
   */
  async calculatePartitionSize() {
    if (!this.db) {
      return 0;
    }

    try {
      const pageCount = this.db.pragma('page_count', {simple: true});
      const pageSize = this.db.pragma('page_size', {simple: true});
      return pageCount * pageSize;
    } catch (error) {
      this.logger.error('Failed to calculate partition size', {
        partitionId: this.partitionId,
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Update the partition size and emit event.
   * @return {Promise<void>}
   */
  async updatePartitionSize() {
    try {
      const sizeBytes = await this.calculatePartitionSize();
      this.sizeBytes = sizeBytes;
      this.lastSizeUpdate = Date.now();

      this.logger.debug('Partition size updated', {
        partitionId: this.partitionId,
        sizeBytes,
        sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
      });

      this.emit('sizeUpdated', {
        partitionId: this.partitionId,
        sizeBytes,
        timestamp: this.lastSizeUpdate,
      });
    } catch (error) {
      this.logger.error('Failed to update partition size', {
        partitionId: this.partitionId,
        error: error.message,
      });
    }
  }

  /**
   * Schedule an asynchronous size update (debounced).
   * @private
   */
  scheduleSizeUpdate() {
    if (this.sizeUpdatePending) {
      return;
    }

    const timeSinceLastUpdate = Date.now() - this.lastSizeUpdate;
    if (timeSinceLastUpdate < this.sizeUpdateDebounceMs) {
      return;
    }

    this.sizeUpdatePending = true;

    setImmediate(async () => {
      try {
        await this.updatePartitionSize();
      } finally {
        this.sizeUpdatePending = false;
      }
    });
  }

  /**
   * Start periodic size updates.
   * @private
   */
  startPeriodicSizeUpdates() {
    if (this.sizeUpdateTimer) {
      return;
    }

    this.sizeUpdateTimer = setInterval(async () => {
      const timeSinceLastUpdate = Date.now() - this.lastSizeUpdate;
      if (timeSinceLastUpdate >= this.sizeUpdateIntervalMs) {
        await this.updatePartitionSize();
      }
    }, this.sizeUpdateIntervalMs);
  }

  /**
   * Stop periodic size updates.
   * @private
   */
  stopPeriodicSizeUpdates() {
    if (this.sizeUpdateTimer) {
      clearInterval(this.sizeUpdateTimer);
      this.sizeUpdateTimer = null;
    }
  }

  /**
   * Get the current partition size.
   * @return {number} Size in bytes.
   */
  getSize() {
    return this.sizeBytes;
  }

  /**
   * Get the partition key range.
   * @return {Object} Key range {start, end}.
   */
  getKeyRange() {
    return {...this.keyRange};
  }

  /**
   * Set the partition key range.
   * @param {Object} keyRange - New key range {start, end}.
   */
  setKeyRange(keyRange) {
    this.keyRange = {...keyRange};
    this.emit('keyRangeChanged', {
      partitionId: this.partitionId,
      keyRange: this.keyRange,
    });
  }

  /**
   * Check if a key falls within this partition's range.
   * @param {*} key - Key to check.
   * @return {boolean} True if key is in range.
   */
  isKeyInRange(key) {
    const {start, end} = this.keyRange;

    // NULL start means unbounded lower
    // NULL end means unbounded upper
    if (start === null && end === null) {
      return true;
    }

    if (start === null) {
      return key < end;
    }

    if (end === null) {
      return key >= start;
    }

    return key >= start && key < end;
  }

  /**
   * Replicate a log entry to followers.
   * @param {PartitionRaftLogEntry} entry - Entry to replicate.
   * @return {Promise<void>}
   * @private
   */
  async replicateEntry(entry) {
    if (this.role !== RaftRole.LEADER || !this.transport) {
      return;
    }

    const appendEntries = {
      type: 'mg_raft_append_entries',
      term: this.storage.currentTerm,
      leaderId: this.replicaId,
      prevLogIndex: entry.index - 1,
      prevLogTerm: entry.index > 1 ?
        (this.storage.getEntry(entry.index - 1)?.term || 0) : 0,
      entries: [entry],
      leaderCommit: this.storage.commitIndex,
    };

    // Send to all other replicas
    for (const replicaId of this.replicaIds) {
      if (replicaId !== this.replicaId) {
        try {
          await this.transport.deliver(replicaId, appendEntries);
        } catch (error) {
          this.logger.debug('Failed to replicate to follower', {
            partitionId: this.partitionId,
            targetReplica: replicaId,
            error: error.message,
          });
        }
      }
    }

    this.emit('replicateEntry', {
      entry,
      term: this.storage.currentTerm,
      leaderId: this.replicaId,
    });
  }

  /**
   * Handle AppendEntries RPC.
   * @param {Object} request - AppendEntries request.
   * @return {Object} Response.
   * @private
   */
  handleAppendEntries(request) {
    const {term, leaderId, entries} = request;

    // Update term if needed
    if (term > this.storage.currentTerm) {
      this.storage.currentTerm = term;
      this.storage.persistTerm();
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
      this.stopHeartbeat();
    }

    // Reset election timer
    this.startElectionTimer();

    // Update leader
    this.leaderId = leaderId;

    // Apply entries
    if (entries && entries.length > 0) {
      for (const entry of entries) {
        // Apply the write operation
        if (entry.data && entry.data.sql) {
          try {
            const stmt = this.db.prepare(entry.data.sql);
            stmt.run(...(entry.data.params || []));
          } catch (error) {
            this.logger.error('Failed to apply replicated entry', {
              partitionId: this.partitionId,
              error: error.message,
            });
          }
        }
      }
    }

    return {
      acknowledged: true,
      term: this.storage.currentTerm,
      success: true,
    };
  }

  /**
   * Handle RequestVote RPC.
   * @param {Object} request - RequestVote request.
   * @return {Object} Response.
   * @private
   */
  handleRequestVote(request) {
    const {term, candidateId, lastLogIndex, lastLogTerm} = request;

    // Update term if needed
    if (term > this.storage.currentTerm) {
      this.storage.currentTerm = term;
      this.storage.votedFor = null;
      this.storage.persistTerm();
      this.storage.persistVotedFor();
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
    }

    // Check if we can vote for this candidate
    let voteGranted = false;
    if (term >= this.storage.currentTerm) {
      if (this.storage.votedFor === null ||
          this.storage.votedFor === candidateId) {
        // Check log is at least as up-to-date
        const lastEntry = this.storage.getLastEntry();
        const localLastTerm = lastEntry?.term || 0;
        const localLastIndex = lastEntry?.index || 0;

        if (lastLogTerm > localLastTerm ||
            (lastLogTerm === localLastTerm && lastLogIndex >= localLastIndex)) {
          voteGranted = true;
          this.storage.votedFor = candidateId;
          this.storage.persistVotedFor();
          this.startElectionTimer();
        }
      }
    }

    return {
      acknowledged: true,
      term: this.storage.currentTerm,
      voteGranted,
    };
  }

  /**
   * Handle AppendEntries response.
   * @param {Object} response - Response from follower.
   * @private
   */
  handleAppendEntriesResponse(response) {
    if (response.term > this.storage.currentTerm) {
      this.storage.currentTerm = response.term;
      this.storage.persistTerm();
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
      this.stopHeartbeat();
      this.startElectionTimer();
    }
  }

  /**
   * Handle RequestVote response.
   * @param {Object} response - Response from voter.
   * @private
   */
  handleRequestVoteResponse(response) {
    if (response.term > this.storage.currentTerm) {
      this.storage.currentTerm = response.term;
      this.storage.persistTerm();
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
    }
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
    this.storage.persistTerm();
    this.storage.persistVotedFor();

    this.logger.debug('Starting election', {
      term: this.storage.currentTerm,
      replicaId: this.replicaId,
      partitionId: this.partitionId,
    });

    // For single-node, testing, or self-hosted groups, become leader immediately
    if (this.replicaIds.length === 1 ||
        this.replicaIds.every((id) => id === this.replicaId) ||
        this.isSelfHostedGroup) {
      this.becomeLeader();
      return;
    }

    // Request votes from other replicas
    if (this.transport) {
      const requestVote = {
        type: 'mg_raft_request_vote',
        term: this.storage.currentTerm,
        candidateId: this.replicaId,
        lastLogIndex: this.storage.getLogLength(),
        lastLogTerm: this.storage.getLastEntry()?.term || 0,
      };

      for (const replicaId of this.replicaIds) {
        if (replicaId !== this.replicaId) {
          try {
            await this.transport.deliver(replicaId, requestVote);
          } catch (error) {
            this.logger.debug('Failed to request vote', {
              partitionId: this.partitionId,
              targetReplica: replicaId,
              error: error.message,
            });
          }
        }
      }
    }

    this.emit('requestVote', {
      term: this.storage.currentTerm,
      candidateId: this.replicaId,
      lastLogIndex: this.storage.getLogLength(),
      lastLogTerm: this.storage.getLastEntry()?.term || 0,
    });

    // Restart election timer in case we don't win
    this.startElectionTimer();
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
      partitionId: this.partitionId,
    });

    this.emit('leaderElected', {
      leaderId: this.replicaId,
      term: this.storage.currentTerm,
      partitionId: this.partitionId,
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
  async sendHeartbeat() {
    if (this.role !== RaftRole.LEADER || !this.transport) {
      return;
    }

    const appendEntries = {
      type: 'mg_raft_append_entries',
      term: this.storage.currentTerm,
      leaderId: this.replicaId,
      prevLogIndex: this.storage.getLogLength(),
      prevLogTerm: this.storage.getLastEntry()?.term || 0,
      entries: [],
      leaderCommit: this.storage.commitIndex,
    };

    for (const replicaId of this.replicaIds) {
      if (replicaId !== this.replicaId) {
        try {
          await this.transport.deliver(replicaId, appendEntries);
        } catch {
          // Heartbeat failures are expected during network issues
        }
      }
    }

    this.emit('heartbeat', {
      term: this.storage.currentTerm,
      leaderId: this.replicaId,
      partitionId: this.partitionId,
    });
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
    return this.storage?.currentTerm || 0;
  }

  /**
   * Get the partition state.
   * @return {string} Partition state.
   */
  getState() {
    return this.state;
  }

  /**
   * Get service status.
   * @return {Object} Service status.
   */
  getStatus() {
    return {
      partitionId: this.partitionId,
      tableId: this.tableId,
      tableName: this.tableName,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      role: this.role,
      isLeader: this.isLeader,
      leaderId: this.leaderId,
      term: this.storage?.currentTerm || 0,
      logLength: this.storage?.getLogLength() || 0,
      state: this.state,
      keyRange: this.keyRange,
      sizeBytes: this.sizeBytes,
      replicaCount: this.replicaIds.length,
      cdcSubscribers: this.cdcSubscribers.size,
      initialized: this.initialized,
    };
  }

  /**
   * Shutdown the partition service.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info('Shutting down partition service', {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    this.stopElectionTimer();
    this.stopHeartbeat();
    this.stopPeriodicSizeUpdates();

    // Unregister from transport
    if (this.transport) {
      this.transport.unregister(this.replicaId);
    }

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.initialized = false;
    this.cdcSubscribers.clear();

    this.emit('shutdown', {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }
}

export {
  PartitionService,
  PartitionState,
  RaftRole,
  CDCOperation,
  PartitionRaftLogEntry,
  SQLiteRaftStorage,
};
