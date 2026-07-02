const LOCAL_STR_OK = 'ok';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NO_SUCH_TABLE = 'no such table';
const LOCAL_NUM_FOUR = 4;
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_DQUOTE = '"';
const LOCAL_STR_1RJW3 = '`';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

function createMessageGroupWorkerServiceRuntimeMethods(deps = {}) {
  const {
    getBaseWorkerStats,
    INSERT_SQL_COLUMNS_PATTERN,
    MESSAGE_GROUP_WORKER_LOG_MSG,
    RAFT_GROUP_ROLE,
  } = deps;

  class MessageGroupWorkerServiceRuntimeMethods {
    /**
     * Set the bootstrap phase flag.
     * @param {boolean} phase - Whether in bootstrap phase.
     */
    setBootstrapPhase(phase) {
      this.bootstrapPhase = phase;
      this.logger.info(
        MESSAGE_GROUP_WORKER_LOG_MSG.BOOTSTRAP_PHASE_UPDATED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          bootstrapPhase: phase,
        },
      );
    }

    /**
     * Handle SET_BOOTSTRAP_PHASE message.
     * @param {Object} message - Message with bootstrapPhase flag.
     * @return {Object} Response with status.
     * @private
     */
    handleSetBootstrapPhase(message) {
      const newPhase = message.bootstrapPhase === true;
      this.setBootstrapPhase(newPhase);
      return {
        status: LOCAL_STR_OK,
        replicaId: this.replicaId,
        bootstrapPhase: this.bootstrapPhase,
      };
    }

    /**
     * Check if the service is in bootstrap phase.
     * @return {boolean} True if in bootstrap phase.
     */
    isInBootstrapPhase() {
      return this.bootstrapPhase;
    }

    /**
     * Get the message group ID.
     * @return {string} Message group ID.
     */
    getGroupId() {
      return this.groupId;
    }

    /**
     * Apply CDC mutation to local cache.
     * Supports both structured system-table CDC records and user-table CDC
     * payloads that carry raw SQL + params.
     * @param {string} tableName - Target table name.
     * @param {string} operation - CDC operation.
     * @param {Object} data - CDC data payload.
     * @private
     */
    applyCacheMutation(tableName, operation, data) {
      if (data && typeof data.sql === LOCAL_STR_STRING) {
        this.applyRawCDCMutation(tableName, data.sql, data.params || []);
        return;
      }

      this.systemCache.applyCDCEvent(tableName, operation, data);
    }

    /**
     * Apply raw SQL CDC mutation to cache. If the target table does not yet
     * exist and the SQL is INSERT-like, create a compatible dynamic table first.
     * @param {string} tableName - Target table name.
     * @param {string} sql - SQL statement from CDC event.
     * @param {Array} params - SQL parameters.
     * @private
     */
    applyRawCDCMutation(tableName, sql, params) {
      try {
        this.systemCache.executeRawSQL(sql, params);
      } catch (error) {
        if (!this.isMissingTableError(error)) {
          throw error;
        }

        const columns = this.extractInsertColumns(sql, tableName);
        if (!columns || columns.length === 0) {
          throw error;
        }

        if (!this.systemCache.hasTable(tableName)) {
          this.systemCache.createDynamicTable(tableName, columns);
        }

        this.systemCache.executeRawSQL(sql, params);
      }
    }

    /**
     * Check if a SQLite error indicates a missing table.
     * @param {Error} error - Error thrown by SQLite.
     * @return {boolean} True when table is missing.
     * @private
     */
    isMissingTableError(error) {
      return Boolean(error &&
        typeof error.message === LOCAL_STR_STRING &&
        error.message.includes(LOCAL_STR_NO_SUCH_TABLE));
    }

    /**
     * Extract column list from INSERT SQL.
     * @param {string} sql - SQL statement.
     * @param {string} expectedTableName - Expected table name.
     * @return {Array<string>|null} Extracted columns or null.
     * @private
     */
    extractInsertColumns(sql, expectedTableName) {
      const match = INSERT_SQL_COLUMNS_PATTERN.exec(sql);
      if (!match) {
        return null;
      }

      const parsedTableName = this.normalizeIdentifier(
        match[1] || match[2] || match[3] || '',
      );
      if (parsedTableName !== this.normalizeIdentifier(expectedTableName)) {
        return null;
      }

      return match[LOCAL_NUM_FOUR]
        .split(LOCAL_STR_COMMA)
        .map((column) => this.normalizeIdentifier(column))
        .filter((column) => column.length > 0);
    }

    /**
     * Normalize SQL identifiers by trimming and removing wrapper quotes.
     * @param {string} identifier - Raw SQL identifier.
     * @return {string} Normalized identifier.
     * @private
     */
    normalizeIdentifier(identifier) {
      const trimmed = String(identifier).trim();
      if (trimmed.length < 2) {
        return trimmed;
      }
      const starts = trimmed[0];
      const ends = trimmed[trimmed.length - 1];
      if ((starts === LOCAL_STR_DQUOTE && ends === LOCAL_STR_DQUOTE) ||
        (starts === LOCAL_STR_1RJW3 && ends === LOCAL_STR_1RJW3)) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    }

    /**
     * Get the current Raft role.
     * @return {string} Current role.
     */
    getRole() {
      return this.raftGroup ?
        this.raftGroup.getRole() : RAFT_GROUP_ROLE.FOLLOWER;
    }

    /**
     * Check if this replica is the leader.
     * @return {boolean} True if leader.
     */
    isLeaderReplica() {
      return this.raftGroup ?
        this.raftGroup.isLeaderReplica() : false;
    }

    /**
     * Check if leader activation has completed.
     * @return {boolean} True if activation completed.
     */
    isLeaderActivated() {
      return this.leaderActivated;
    }

    /**
     * Get the current leader ID.
     * @return {string|null} Leader replica ID or null.
     */
    getLeaderId() {
      return this.raftGroup ?
        this.raftGroup.getLeaderId() : null;
    }

    /**
     * Get the current Raft term.
     * @return {number} Current term.
     */
    getCurrentTerm() {
      return this.raftGroup ?
        this.raftGroup.getCurrentTerm() : 0;
    }

    /**
     * Check if CDC subscriptions are active.
     * @return {boolean} True if subscribed to CDC events.
     */
    isCDCSubscribed() {
      return this.cdcSubscribed;
    }

    /**
     * Get the number of active CDC subscriptions.
     * @return {number} Number of subscriptions.
     */
    getCDCSubscriptionCount() {
      return this.cdcSubscriptions.size;
    }

    /**
     * Get the RaftGroup instance.
     * @return {RaftGroup|null} RaftGroup instance.
     */
    getRaftGroup() {
      return this.raftGroup;
    }

    /**
     * Get statistics about the message group worker.
     * @return {Object} Message group worker statistics.
     */
    getStats() {
      const baseStats = getBaseWorkerStats(this);
      return {
        ...baseStats,
        groupId: this.groupId,
        role: this.getRole(),
        isLeader: this.isLeaderReplica(),
        leaderActivated: this.isLeaderActivated(),
        leaderId: this.getLeaderId(),
        term: this.getCurrentTerm(),
        cdcSubscribed: this.cdcSubscribed,
        cdcSubscriptionCount: this.cdcSubscriptions.size,
        replicaCount: this.replicaIds.length,
        bootstrapPhase: this.bootstrapPhase,
        cacheStats: this.systemCache ?
          this.systemCache.getStats() : null,
      };
    }
  }

  return Object.getOwnPropertyNames(
    MessageGroupWorkerServiceRuntimeMethods.prototype,
  )
    .filter((name) => name !== LOCAL_STR_CONSTRUCTOR)
    .reduce((accumulator, name) => {
      accumulator[name] = MessageGroupWorkerServiceRuntimeMethods.prototype[name];
      return accumulator;
    }, {});
}

export {createMessageGroupWorkerServiceRuntimeMethods};
