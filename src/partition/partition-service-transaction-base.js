import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PartitionServiceEntryApplyBase} from './partition-service-entry-apply-base.js';
import {
  trackStuckTransactionHeal,
} from '../diagnostics/raft-churn-sync-sections.js';
import {
  rollbackSqlitePreservingRaftState,
} from './partition-service-table-bootstrap.js';


const {
  LifeRaft,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL,
  PARTICIPANT_COMMIT_OUTCOME,
  RaftRole,
} = PARTITION_SERVICE_SHARED;

const LOCAL_STR_COLON = ':';
const LOCAL_NUM_WALL_CLOCK_EPOCH_THRESHOLD = 1_000_000_000_000;

class PartitionServiceTransactionBase extends PartitionServiceEntryApplyBase {
  /**
   * Irreversibly fence new transaction admission before replica removal is
   * acknowledged. Existing session retries, commits, and rollbacks remain
   * valid so the transaction owner can reach one terminal outcome.
   * @return {{activeTransactionCount:number, preparedTransactionCount:number}}
   */
  fenceServingAdmissionForRemoval() {
    this.removalServingAdmissionFenced = true;
    return {
      activeServingRequestCount: this.activeServingRequestCount,
      activeTransactionCount: this.activeTransactions.size,
      preparedTransactionCount: this.preparedTransactions.size,
    };
  }

  /**
   * Wait until every transaction admitted before the removal fence reaches a
   * terminal outcome. The existing transaction timeout/heal owner remains
   * responsible for stuck sessions; removal does not invent a second timeout.
   * @param {Object} [options]
   * @param {number} [options.pollIntervalMs]
   * @return {Promise<void>}
   */
  async waitForRemovalServingDrain(options = {}) {
    const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
      options.pollIntervalMs > 0 ?
      Math.floor(options.pollIntervalMs) :
      10;
    while (this.activeServingRequestCount > 0 || this.isInTransaction()) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * Reconstruct prepared transaction state from the persisted Raft log.
   * @return {{preparedTransactionCount: number, prepareLostCount: number}}
   *   Reconstruction summary.
   */
  reconstructPreparedState() {
    const reconstructedPreparedTransactions = /* @__PURE__ */ new Map();
    const terminalSessions = /* @__PURE__ */ new Set();
    const prepareLostSessions = /* @__PURE__ */ new Set();
    const logEntries = this.storage?.getEntriesFrom(1) || [];
    for (const logEntry of logEntries) {
      const data = logEntry?.data || null;
      if (!data || typeof data !== PARTITION_SERVICE_LITERAL.OBJECT) {
        continue;
      }
      const sessionId = this.normalizeTransactionSessionId(
        data.sessionId || null,
      );
      if (!sessionId) {
        continue;
      }
      if (data.type === PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION) {
        if (!Array.isArray(data.writeSet)) {
          prepareLostSessions.add(sessionId);
          reconstructedPreparedTransactions.delete(sessionId);
          continue;
        }
        reconstructedPreparedTransactions.set(sessionId, {
          sessionId,
          transactionEpoch: Number.isFinite(data.epoch) ? data.epoch : null,
          startTime: Number.isFinite(data.proposedAt) ?
            data.proposedAt :
            Date.now(),
          operations: [],
          writeSet: new Set(data.writeSet),
          readSet: /* @__PURE__ */ new Set(),
          raftLogIndex: Number.isFinite(logEntry?.index) ?
            logEntry.index :
            null,
          preparedAt: Number.isFinite(data.proposedAt) ?
            data.proposedAt :
            Date.now(),
        });
        continue;
      }
      if (
        data.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT ||
        data.type === PARTITION_SERVICE_OPERATION.COMMIT ||
        data.type === PARTITION_SERVICE_OPERATION.ROLLBACK
      ) {
        terminalSessions.add(sessionId);
        reconstructedPreparedTransactions.delete(sessionId);
        prepareLostSessions.delete(sessionId);
      }
    }
    this.preparedTransactions.clear();
    for (const [
      sessionId,
      state,
    ] of reconstructedPreparedTransactions.entries()) {
      if (terminalSessions.has(sessionId)) {
        continue;
      }
      this.preparedTransactions.set(sessionId, state);
    }
    for (const sessionId of terminalSessions) {
      this.preparedStateLostSessions.delete(sessionId);
    }
    for (const sessionId of prepareLostSessions) {
      this.preparedTransactions.delete(sessionId);
      this.preparedStateLostSessions.add(sessionId);
    }
    this.syncLegacyTransactionAliases();
    return {
      preparedTransactionCount: this.preparedTransactions.size,
      prepareLostCount: this.preparedStateLostSessions.size,
    };
  }
  /**
   * Resolve the primary-key column used for write-set tracking.
   * @return {string|null} Primary-key column name.
   * @private
   */
  resolveTransactionPrimaryKeyColumn() {
    if (!this.schema || !Array.isArray(this.schema.columns)) {
      return null;
    }
    const primaryKeyColumn = this.schema.columns.find(
      (column) => column.primaryKey,
    );
    return primaryKeyColumn?.name || null;
  }
  /**
   * Resolve the primary-key columns used for write-set tracking.
   * @return {string[]} Primary-key column names.
   * @private
   */
  resolveTransactionPrimaryKeyColumns() {
    const singlePk = this.resolveTransactionPrimaryKeyColumn();
    if (typeof singlePk === 'string') {
      return [singlePk];
    }
    if (Array.isArray(this.schema?.primaryKey) && this.schema.primaryKey.length > 0) {
      return this.schema.primaryKey;
    }
    if (Array.isArray(this.schema?.tableConstraints)) {
      const pkConstraint = this.schema.tableConstraints.find(
        (c) => c?.type === 'PRIMARY KEY' && Array.isArray(c.columns) && c.columns.length > 0,
      );
      if (pkConstraint) {
        return pkConstraint.columns;
      }
    }
    if (this._pragmaPrimaryKeyColumns) {
      return this._pragmaPrimaryKeyColumns;
    }
    if (this.db && typeof this.tableName === 'string' && this.tableName) {
      try {
        const rows = this.db.prepare(`PRAGMA table_info("${this.tableName}")`).all();
        const pkCols = rows
          .filter((col) => Number(col.pk) > 0)
          .sort((a, b) => Number(a.pk) - Number(b.pk))
          .map((col) => col.name);
        if (pkCols.length > 0) {
          this._pragmaPrimaryKeyColumns = pkCols;
          return pkCols;
        }
      } catch (_err) {
        void _err;
      }
    }
    return [];
  }
  /**
   * Resolve one write-set key from a transaction entry.
   * @param {Object} entry - Transaction write entry.
   * @param {Array|null} [matchedRows=null] - Pre-mutation matched rows.
   * @return {string|null} Write-set key.
   * @private
   */
  resolveTransactionWriteSetKey(entry, matchedRows = null) {
    const primaryKeyColumn = this.resolveTransactionPrimaryKeyColumn();
    const tableName = entry.tableName || this.tableName;
    if (primaryKeyColumn) {
      if (
        entry?.whereClause &&
        Object.prototype.hasOwnProperty.call(entry.whereClause, primaryKeyColumn)
      ) {
        return `${tableName}:${entry.whereClause[primaryKeyColumn]}`;
      }
      if (
        entry?.data &&
        Object.prototype.hasOwnProperty.call(entry.data, primaryKeyColumn)
      ) {
        return `${tableName}:${entry.data[primaryKeyColumn]}`;
      }
      try {
        const routingKey = this.extractSplitRoutingKey(entry, primaryKeyColumn);
        if (routingKey !== void 0 && routingKey !== null) {
          return `${tableName}:${routingKey}`;
        }
      } catch (_err) {
        void _err;
      }
      if (
        Array.isArray(matchedRows) &&
        matchedRows.length > 0 &&
        matchedRows[0]?.[primaryKeyColumn] !== undefined &&
        matchedRows[0]?.[primaryKeyColumn] !== null
      ) {
        return `${tableName}:${matchedRows[0][primaryKeyColumn]}`;
      }
      return null;
    }

    const pkColumns = this.resolveTransactionPrimaryKeyColumns();
    if (pkColumns.length > 0) {
      const candidateSources = [
        matchedRows?.[0],
        entry?.whereClause,
        entry?.data,
      ].filter(Boolean);

      for (const source of candidateSources) {
        const hasAllKeys = pkColumns.every(
          (col) => source[col] !== undefined && source[col] !== null,
        );
        if (hasAllKeys) {
          return `${tableName}:${pkColumns.map((col) => source[col]).join(LOCAL_STR_COLON)}`;
        }
      }
    }
    return null;
  }
  /**
   * Track one transaction write-set key.
   * @param {Object} transactionState - Active transaction state.
   * @param {Object} entry - Transaction write entry.
   * @param {Array|null} [matchedRows=null] - Pre-mutation matched rows.
   * @private
   */
  trackTransactionWriteSetKey(transactionState, entry, matchedRows = null) {
    if (!transactionState?.writeSet) {
      return;
    }
    const pkColumns = this.resolveTransactionPrimaryKeyColumns();
    const tableName = entry?.tableName || this.tableName;
    if (Array.isArray(matchedRows) && matchedRows.length > 0 && pkColumns.length > 0) {
      for (const row of matchedRows) {
        const hasAllKeys = pkColumns.every(
          (col) => row[col] !== undefined && row[col] !== null,
        );
        if (hasAllKeys) {
          transactionState.writeSet.add(
            `${tableName}:${pkColumns.map((col) => row[col]).join(LOCAL_STR_COLON)}`,
          );
        }
      }
    }
    if (
      typeof entry?.sql === 'string' &&
      Array.isArray(entry.params) &&
      pkColumns.length > 0
    ) {
      const match = entry.sql.match(/INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/i);
      if (match) {
        const colList = match[2].split(',').map((c) => c.trim().replace(/[`"']/g, ''));
        const pkIndices = pkColumns.map((pk) => colList.indexOf(pk));
        if (pkIndices.every((idx) => idx >= 0 && idx < entry.params.length)) {
          const keyValues = pkIndices.map((idx) => entry.params[idx]);
          if (keyValues.every((val) => val !== undefined && val !== null)) {
            transactionState.writeSet.add(
              `${tableName}:${keyValues.join(LOCAL_STR_COLON)}`,
            );
          }
        }
      }
    }
    const writeSetKey = this.resolveTransactionWriteSetKey(entry, matchedRows);
    if (writeSetKey) {
      transactionState.writeSet.add(writeSetKey);
    }
  }
  /**
   * Check whether a write set conflicts with later committed writes.
   * @param {Set<string>} writeSet - Transaction write set.
   * @param {number|null} transactionEpoch - Transaction snapshot epoch.
   * @return {Object} Conflict check result.
   */
  checkWriteConflicts(writeSet, transactionEpoch) {
    if (!(writeSet instanceof Set) || writeSet.size === 0) {
      return {hasConflict: false, conflicts: []};
    }
    if (!Number.isFinite(transactionEpoch)) {
      return {hasConflict: false, conflicts: []};
    }
    const conflicts = [];
    const isWallClockEpoch =
      transactionEpoch >= LOCAL_NUM_WALL_CLOCK_EPOCH_THRESHOLD;
    for (const commitRecord of this.committedWriteLog) {
      const commitEpoch = isWallClockEpoch ?
        (Number.isFinite(commitRecord?.committedAt) ?
          Math.max(Number(commitRecord?.epoch || 0), commitRecord.committedAt) :
          commitRecord?.epoch) :
        commitRecord?.epoch;
      if (
        !Number.isFinite(commitEpoch) ||
        commitEpoch <= transactionEpoch
      ) {
        continue;
      }
      for (const key of writeSet) {
        if (!commitRecord.writeSet.has(key)) {
          continue;
        }
        conflicts.push({key, conflictingEpoch: commitRecord.epoch});
      }
    }
    return {hasConflict: conflicts.length > 0, conflicts};
  }
  /**
   * Resolve oldest retained commit epoch from the write log.
   * @return {number|null} Oldest retained commit epoch.
   * @private
   */
  getOldestRetainedCommitEpoch() {
    let oldest = null;
    for (const commitRecord of this.committedWriteLog) {
      if (!Number.isFinite(commitRecord?.epoch)) {
        continue;
      }
      if (oldest === null || commitRecord.epoch < oldest) {
        oldest = commitRecord.epoch;
      }
    }
    return oldest;
  }
  /**
   * Determine whether a transaction snapshot epoch is no longer available.
   * @param {number|null} transactionEpoch - Transaction snapshot epoch.
   * @return {boolean} True when snapshot history has expired.
   * @private
   */
  isSnapshotExpired(transactionEpoch) {
    if (!Number.isFinite(transactionEpoch)) {
      return false;
    }
    if (this.committedWriteLog.length < this.maxCommittedWriteLogEntries) {
      return false;
    }
    const oldestRetainedEpoch = this.getOldestRetainedCommitEpoch();
    if (!Number.isFinite(oldestRetainedEpoch)) {
      return false;
    }
    return transactionEpoch < oldestRetainedEpoch;
  }
  /**
   * Apply snapshot visibility filtering for transactional reads.
   * @param {Object[]} rows - SQLite result rows.
   * @param {Object} transactionState - Active transaction state.
   * @return {Object[]} Snapshot-visible rows.
   * @private
   */
  applySnapshotReadFilter(rows, transactionState) {
    if (
      !transactionState ||
      !Number.isFinite(transactionState.transactionEpoch)
    ) {
      return rows;
    }
    if (transactionState.transactionEpoch >= LOCAL_NUM_WALL_CLOCK_EPOCH_THRESHOLD) {
      return rows;
    }
    if (this.isSnapshotExpired(transactionState.transactionEpoch)) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.SNAPSHOT_EXPIRED);
    }
    const primaryKeyColumn = this.resolveTransactionPrimaryKeyColumn();
    if (!primaryKeyColumn) {
      return rows;
    }
    const filteredRows = [];
    for (const row of rows) {
      const primaryKeyValue = row?.[primaryKeyColumn];
      const writeSetKey = `${this.tableName}:${primaryKeyValue}`;
      const isOwnWrite = transactionState.writeSet.has(writeSetKey);
      const commitEpoch = this.rowCommitEpoch.get(writeSetKey);
      const committedBeforeSnapshot =
        !Number.isFinite(commitEpoch) ||
        commitEpoch < transactionState.transactionEpoch;
      if (!isOwnWrite && !committedBeforeSnapshot) {
        continue;
      }
      transactionState.readSet.add(writeSetKey);
      filteredRows.push(row);
    }
    return filteredRows;
  }
  /**
   * Trim retained commit history to the configured maximum.
   * @private
   */
  pruneCommittedWriteLog() {
    while (this.committedWriteLog.length > this.maxCommittedWriteLogEntries) {
      this.committedWriteLog.shift();
    }
  }
  /**
   * Release prepared transaction state that exceeded the hold timeout.
   * @param {number} [nowMs] - Clock override for deterministic tests.
   * @return {number} Number of released prepared transactions.
   */
  collectExpiredPreparedSessions(nowMs) {
    const expiredPreparedSessions = [];
    for (const [sessionId, state] of this.preparedTransactions.entries()) {
      if (!Number.isFinite(state?.preparedAt)) {
        continue;
      }
      const holdDurationMs = nowMs - state.preparedAt;
      if (holdDurationMs < this.preparedStateHoldTimeoutMs) {
        continue;
      }
      expiredPreparedSessions.push({
        sessionId,
        holdDurationMs,
        preparedAt: state.preparedAt,
      });
    }
    return expiredPreparedSessions;
  }

  // An ACTIVE participant hold past the legal window is the run-23 zombie
  // class: an orphaned BEGIN that silently absorbs every later write on the
  // connection. It sweeps under the same bound as the prepared holds.
  collectExpiredActiveSessions(nowMs) {
    const expiredActiveSessions = [];
    for (const [sessionId, state] of this.activeTransactions.entries()) {
      if (this.preparedTransactions.has(sessionId)) {
        continue;
      }
      if (!Number.isFinite(state?.startTime)) {
        continue;
      }
      const holdDurationMs = nowMs - state.startTime;
      if (holdDurationMs < this.preparedStateHoldTimeoutMs) {
        continue;
      }
      expiredActiveSessions.push({
        sessionId,
        holdDurationMs,
        startedAt: state.startTime,
      });
    }
    return expiredActiveSessions;
  }

  // A swept/healed rollback is NOT crash-equivalent for JS memory: the apply
  // dedup set and the adapter's monotonic committed-index cache survive it and
  // would make post-heal catch-up skip re-execution and clamp the durable
  // watermark forever (verifier finding Z1). Both MUST be cleared together so
  // the replica genuinely re-applies what the rollback evaporated; kept as one
  // method so the two clears never drift apart.
  clearPostRollbackApplyState() {
    this.recentlyAppliedEntryKeys?.clear?.();
    this.recentlyAppliedEntryWitnesses?.clear?.();
    this.logAdapter?.refreshCommittedIndexCacheFromStore?.();
  }

  enforcePreparedStateHoldTimeouts(nowMs = Date.now()) {
    // Sync-section attribution (instrumentation-only): this synchronous sweep
    // (and its heal-deferred warn path) runs continuously on the seed; tag it
    // for the gap watchdog. See raft-churn-sync-sections.js.
    return trackStuckTransactionHeal(
      () => this.runPreparedStateHoldTimeoutSweep(nowMs),
    );
  }

  /**
   * @param {number} nowMs
   * @return {number} Number of released stuck transactions.
   * @private
   */
  runPreparedStateHoldTimeoutSweep(nowMs) {
    const expiredPreparedSessions = this.collectExpiredPreparedSessions(nowMs);
    const expiredActiveSessions = this.collectExpiredActiveSessions(nowMs);
    if (
      expiredPreparedSessions.length === 0 &&
      expiredActiveSessions.length === 0
    ) {
      return 0;
    }
    // Rolling back on a LEADER (or a CANDIDATE, whose solicited votes
    // reference the in-memory log head) re-mints already-acked raft indices
    // and makes followers truncate committed entries — the heal must wait
    // for the durability-fitness demotion. A solo group is the carve-out:
    // no follower exists to truncate, and demotion is impossible there.
    if (!this.isStuckTransactionHealPermitted()) {
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.STUCK_TRANSACTION_HEAL_DEFERRED,
        {
          partitionId: this.partitionId,
          role: this.role,
          expiredPreparedSessionCount: expiredPreparedSessions.length,
          expiredActiveSessionCount: expiredActiveSessions.length,
        },
      );
      return 0;
    }
    try {
      this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
    } catch (error) {
      this.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.ROLLBACK_TRANSACTION_FAILED,
        {partitionId: this.partitionId, error: error.message},
      );
    }
    this.clearPostRollbackApplyState();
    for (const expiredSession of expiredPreparedSessions) {
      this.preparedTransactions.delete(expiredSession.sessionId);
      this.activeTransactions.delete(expiredSession.sessionId);
      this.preparedStateLostSessions.add(expiredSession.sessionId);
      this.logger.warn(PARTITION_SERVICE_LOG_MSG.PREPARED_STATE_HOLD_TIMEOUT, {
        partitionId: this.partitionId,
        transactionId: expiredSession.sessionId,
        sessionId: expiredSession.sessionId,
        holdDurationMs: expiredSession.holdDurationMs,
        preparedAt: expiredSession.preparedAt,
      });
    }
    for (const expiredSession of expiredActiveSessions) {
      this.activeTransactions.delete(expiredSession.sessionId);
      this.preparedStateLostSessions.add(expiredSession.sessionId);
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.ACTIVE_TRANSACTION_HOLD_TIMEOUT,
        {
          partitionId: this.partitionId,
          transactionId: expiredSession.sessionId,
          sessionId: expiredSession.sessionId,
          holdDurationMs: expiredSession.holdDurationMs,
          startedAt: expiredSession.startedAt,
        },
      );
    }
    this.syncLegacyTransactionAliases();
    return expiredPreparedSessions.length + expiredActiveSessions.length;
  }

  /**
   * Healing a stuck transaction in place (bare ROLLBACK) is raft-safe only
   * where no follower can be made to truncate committed entries: on a
   * FOLLOWER/LEARNER (crash-equivalent locally) or in a solo group (no
   * follower exists; demotion is structurally impossible there).
   * @return {boolean}
   * @private
   */
  isStuckTransactionHealPermitted() {
    if (this.role !== RaftRole.LEADER && this.role !== RaftRole.CANDIDATE) {
      return true;
    }
    return this.isSoloReplicaGroup();
  }

  /**
   * Same predicate family as raft-init's isSingleReplica: a solo group is a
   * single configured replica with NO joined raft peers (a joined peer means
   * a follower exists that a leader-side rollback could make truncate).
   * @return {boolean}
   * @private
   */
  isSoloReplicaGroup() {
    const peerCount = Array.isArray(this.raft?.nodes) ?
      this.raft.nodes.length :
      0;
    return (
      (!Array.isArray(this.replicaIds) || this.replicaIds.length <= 1) &&
      peerCount === 0
    );
  }
  /**
   * Start periodic prepared-state hold-timeout enforcement.
   * @private
   */
  startPreparedStateHoldTimeoutSweep() {
    if (this.preparedStateHoldTimer) {
      return;
    }
    if (this.isShutdown) {
      this.logger.debug(
        PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN,
        {
          partitionId: this.partitionId,
          timer: PARTITION_SERVICE_LITERAL.PREPAREDSTATEHOLDTIMER,
        },
      );
      return;
    }
    this.preparedStateHoldTimer = setInterval(() => {
      const nowMs = Date.now();
      this.enforcePreparedStateHoldTimeouts(nowMs);
      // Leadership durability fitness rides the same sweep cadence: a
      // connection stuck non-durable (zombie transaction, silent adapter
      // close) must surface and shed leadership instead of freezing the
      // cluster silently (run-23).
      this.enforceLeaderDurabilityFitness?.(nowMs);
      // Snapshot checkpoint cadence rides this sweep (S6; gates live there).
      void this.runSnapshotCadenceTick?.(nowMs);
    }, this.preparedStateHoldSweepIntervalMs);
    this.preparedStateHoldTimer.unref();
  }
  /**
   * Stop periodic prepared-state hold-timeout enforcement.
   * @private
   */
  stopPreparedStateHoldTimeoutSweep() {
    if (this.preparedStateHoldTimer) {
      clearInterval(this.preparedStateHoldTimer);
      this.preparedStateHoldTimer = null;
    }
  }
  /**
   * Begin a transaction on this partition.
   * Uses SQLite's transaction support for READ COMMITTED isolation.
   * @param {string} [sessionId] - Transaction session ID.
   * @param {number} [transactionEpoch] - Snapshot epoch for this transaction.
   * @return {Promise<Object>} Transaction result.
   */
  async beginTransaction(sessionId = null, transactionEpoch = null) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
    const openTransaction =
      this.resolveOpenTransactionState(transactionSessionId);
    if (openTransaction) {
      const requestedEpoch = Number.isFinite(transactionEpoch) ?
        transactionEpoch :
        null;
      const openEpoch = Number.isFinite(openTransaction.state.transactionEpoch) ?
        openTransaction.state.transactionEpoch :
        null;
      if (
        requestedEpoch === null ||
        openEpoch === null ||
        requestedEpoch === openEpoch
      ) {
        return {
          success: true,
          operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
          partitionId: this.partitionId,
          inTransaction: true,
          idempotent: true,
          sessionId: transactionSessionId,
          transactionEpoch: openTransaction.state.transactionEpoch,
        };
      }
      throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }
    if (this.removalServingAdmissionFenced === true) {
      const error = new Error(
        PARTITION_SERVICE_ERROR_MSG.SERVING_ADMISSION_FENCED_FOR_REMOVAL,
      );
      error.deferRetry = true;
      throw error;
    }
    if (
      this.activeTransactions.size > 0 ||
      this.preparedTransactions.size > 0
    ) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }
    this.preparedStateLostSessions.delete(transactionSessionId);
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.BEGINNING_TRANSACTION, {
      partitionId: this.partitionId,
      sessionId: transactionSessionId,
      transactionEpoch,
    });
    try {
      this._activeTxRaftBaselineIndex =
        this.logAdapter?.getLastInfo?.()?.index || 0;
      this.db.exec(PARTITION_SERVICE_SQL.BEGIN_IMMEDIATE);
      this._maxObservedTransactionEpoch = Math.max(
        this._maxObservedTransactionEpoch || 0,
        Number.isFinite(transactionEpoch) ? transactionEpoch : 0,
      );
      const transactionState = {
        sessionId: transactionSessionId,
        transactionEpoch,
        startTime: Date.now(),
        operations: [],
        writeSet: /* @__PURE__ */ new Set(),
        readSet: /* @__PURE__ */ new Set(),
        beforeImages: new Map(),
      };
      this.activeTransactions.set(transactionSessionId, transactionState);
      this.syncLegacyTransactionAliases();
      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
        partitionId: this.partitionId,
        inTransaction: true,
        sessionId: transactionSessionId,
        transactionEpoch,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.BEGIN_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      throw error;
    }
  }
  /**
   * Prepare one active transaction on this partition.
   * @param {string|null} sessionId - Transaction session ID.
   * @return {Promise<Object>} Prepare result.
   */
  async prepareTransaction(sessionId = null, transactionEpoch = null) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const transaction =
      this.resolveActiveTransactionState(sessionId) ||
      this.resolvePreparedTransactionState(sessionId);
    if (!transaction) {
      return {
        success: false,
        operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
        partitionId: this.partitionId,
        error: PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_PREPARE,
      };
    }
    const {sessionId: transactionSessionId, state: transactionState} =
      transaction;
    if (
      Number.isFinite(transactionEpoch) &&
      Number.isFinite(transactionState?.transactionEpoch) &&
      transactionEpoch < transactionState.transactionEpoch
    ) {
      return {
        success: false,
        operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
        partitionId: this.partitionId,
        error: PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_PREPARE,
      };
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.PREPARING_TRANSACTION, {
      partitionId: this.partitionId,
      sessionId: transactionSessionId,
      operationCount: transactionState.operations.length,
      writeSetSize: transactionState.writeSet.size,
    });
    const conflictCheck = this.checkWriteConflicts(
      transactionState.writeSet,
      transactionState.transactionEpoch,
    );
    if (conflictCheck.hasConflict) {
      return {
        success: false,
        operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
        partitionId: this.partitionId,
        error: PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT,
        conflicts: conflictCheck.conflicts,
      };
    }
    const raftEntry = await this.replicatePreparedTransaction(
      transactionSessionId,
      transactionState,
    );
    this.activeTransactions.delete(transactionSessionId);
    this.preparedTransactions.set(transactionSessionId, {
      sessionId: transactionSessionId,
      transactionEpoch: transactionState.transactionEpoch,
      startTime: transactionState.startTime,
      operations: transactionState.operations,
      writeSet: transactionState.writeSet,
      readSet: transactionState.readSet,
      raftLogIndex: raftEntry?.index || null,
      preparedAt: Date.now(),
    });
    this.syncLegacyTransactionAliases();
    return {
      success: true,
      operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
      partitionId: this.partitionId,
      prepared: true,
      sessionId: transactionSessionId,
      raftLogIndex: raftEntry?.index || null,
    };
  }
  /**
   * Commit the active transaction.
   * Ensures durability through Raft replication before acknowledging.
   * @return {Promise<Object>} Commit result.
   */
  async commitTransaction(sessionId = null, transactionEpoch = null) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
    if (this.preparedStateLostSessions.has(transactionSessionId)) {
      return this.buildPrepareLostResponse(
        PARTITION_SERVICE_OPERATION.COMMIT,
        transactionSessionId,
      );
    }
    const activeTransaction =
      this.resolveActiveTransactionState(transactionSessionId);
    const transaction =
      activeTransaction ||
      this.resolvePreparedTransactionState(transactionSessionId);
    if (!transaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_COMMIT);
    }
    const {sessionId: resolvedSessionId, state: transactionState} =
      transaction;
    if (
      Number.isFinite(transactionEpoch) &&
      Number.isFinite(transactionState?.transactionEpoch) &&
      transactionEpoch < transactionState.transactionEpoch
    ) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_COMMIT);
    }
    if (activeTransaction) {
      const conflictCheck = this.checkWriteConflicts(
        transactionState.writeSet,
        transactionState.transactionEpoch,
      );
      if (conflictCheck.hasConflict) {
        try {
          rollbackSqlitePreservingRaftState(this);
        } catch (_rollbackErr) {
          void _rollbackErr;
        }
        this.activeTransactions.delete(resolvedSessionId);
        this.preparedTransactions.delete(resolvedSessionId);
        this.syncLegacyTransactionAliases();
        return {
          success: false,
          operation: PARTITION_SERVICE_OPERATION.COMMIT,
          partitionId: this.partitionId,
          error: PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT,
          conflicts: conflictCheck.conflicts,
        };
      }
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.COMMITTING_TRANSACTION, {
      partitionId: this.partitionId,
      sessionId: resolvedSessionId,
      operationCount: transactionState.operations.length,
    });
    try {
      const raftEntry = await this.replicateTransactionCommit(
        transactionState.operations,
        resolvedSessionId,
        transactionState.transactionEpoch,
      );
      this.recordTransactionCommitOutcome(
        resolvedSessionId,
        transactionState.transactionEpoch,
      );
      this.db.exec(PARTITION_SERVICE_SQL.COMMIT);
      const duration = Date.now() - transactionState.startTime;
      const operationCount = transactionState.operations.length;
      for (const op of transactionState.operations) {
        await this.generateCDCEvent(op);
      }
      if (transactionState.writeSet.size > 0) {
        const committedAt = Math.max(
          Date.now(),
          (Number(transactionState.transactionEpoch) || 0) + 1,
          (this._maxObservedTransactionEpoch || 0) + 1,
          (this._lastCommitWallClock || 0) + 1,
        );
        this._lastCommitWallClock = committedAt;
        for (const writeSetKey of transactionState.writeSet) {
          this.rowCommitEpoch.set(
            writeSetKey,
            Number.isFinite(transactionState.transactionEpoch) ?
              transactionState.transactionEpoch :
              committedAt,
          );
        }
        this.committedWriteLog.push({
          epoch: transactionState.transactionEpoch,
          writeSet: new Set(transactionState.writeSet),
          committedAt,
        });
        this.pruneCommittedWriteLog();
      }
      this.activeTransactions.delete(resolvedSessionId);
      this.preparedTransactions.delete(resolvedSessionId);
      this.preparedStateLostSessions.delete(resolvedSessionId);
      this.syncLegacyTransactionAliases();
      this.scheduleSizeUpdate();
      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.COMMIT,
        partitionId: this.partitionId,
        committed: true,
        durationMs: duration,
        operationCount,
        raftLogIndex: raftEntry?.index || null,
        sessionId: resolvedSessionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.COMMIT_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        sessionId: resolvedSessionId,
        error: error.message,
      });
      try {
        rollbackSqlitePreservingRaftState(this);
      } catch (_rollbackErr) {
        void _rollbackErr;
      }
      this.activeTransactions.delete(resolvedSessionId);
      this.preparedTransactions.delete(resolvedSessionId);
      this.syncLegacyTransactionAliases();
      throw error;
    }
  }
  /**
   * Rollback the active transaction.
   * @return {Promise<Object>} Rollback result.
   */
  async rollbackTransaction(sessionId = null, transactionEpoch = null) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
    if (this.preparedStateLostSessions.has(transactionSessionId)) {
      return this.buildPrepareLostResponse(
        PARTITION_SERVICE_OPERATION.ROLLBACK,
        transactionSessionId,
      );
    }
    const transaction =
      this.resolveActiveTransactionState(transactionSessionId) ||
      this.resolvePreparedTransactionState(transactionSessionId);
    if (!transaction) {
      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
        partitionId: this.partitionId,
        rolledBack: true,
        idempotent: true,
        sessionId: transactionSessionId,
      };
    }
    const {sessionId: resolvedSessionId, state: transactionState} =
      transaction;
    if (
      Number.isFinite(transactionEpoch) &&
      Number.isFinite(transactionState?.transactionEpoch) &&
      transactionEpoch < transactionState.transactionEpoch
    ) {
      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
        partitionId: this.partitionId,
        rolledBack: true,
        idempotent: true,
        sessionId: resolvedSessionId,
      };
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.ROLLING_BACK_TRANSACTION, {
      partitionId: this.partitionId,
      sessionId: resolvedSessionId,
      operationCount: transactionState.operations.length,
    });
    try {
      rollbackSqlitePreservingRaftState(this);
      const raftEntry = await this.replicateTransactionRollback(
        resolvedSessionId,
        transactionState.transactionEpoch,
      );
      const duration = Date.now() - transactionState.startTime;
      const operationCount = transactionState.operations.length;
      this.activeTransactions.delete(resolvedSessionId);
      this.preparedTransactions.delete(resolvedSessionId);
      this.preparedStateLostSessions.delete(resolvedSessionId);
      this.syncLegacyTransactionAliases();
      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
        partitionId: this.partitionId,
        rolledBack: true,
        durationMs: duration,
        operationCount,
        sessionId: resolvedSessionId,
        raftLogIndex: raftEntry?.index || null,
      };
    } catch (error) {
      this.logger.error(
        PARTITION_SERVICE_ERROR_MSG.ROLLBACK_TRANSACTION_FAILED,
        {
          partitionId: this.partitionId,
          sessionId: resolvedSessionId,
          error: error.message,
        },
      );
      // The failed path previously deleted the bookkeeping WITHOUT executing
      // ROLLBACK — the stranded open transaction became invisible to every
      // sweep forever (a run-23 zombie source). Attempt the ROLLBACK where
      // the role permits; when it cannot run, KEEP the session registered so
      // the ACTIVE-hold sweep (and durability fitness) still see it.
      let stuckStateReleased = false;
      if (this.isStuckTransactionHealPermitted()) {
        try {
          this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
          this.clearPostRollbackApplyState();
          stuckStateReleased = true;
        } catch {
          // The connection itself is wedged: leave the session visible.
        }
      }
      if (stuckStateReleased) {
        this.activeTransactions.delete(resolvedSessionId);
        this.preparedTransactions.delete(resolvedSessionId);
      }
      this.syncLegacyTransactionAliases();
      throw error;
    }
  }
  /**
   * Check if a transaction is active.
   * @return {boolean} True if transaction is active.
   */
  isInTransaction() {
    return (
      this.activeTransactions.size > 0 ||
      this.preparedTransactions.size > 0
    );
  }

  recordTransactionCommitOutcome(sessionId, transactionEpoch = null) {
    const normalizedEpoch = Number.isFinite(transactionEpoch) ?
      Math.floor(transactionEpoch) :
      0;
    this.db.prepare(PARTITION_SERVICE_SQL.UPSERT_TRANSACTION_OUTCOME).run(
      this.normalizeTransactionSessionId(sessionId),
      PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
      normalizedEpoch,
      Date.now(),
    );
  }

  resolveTransactionCommitOutcome(sessionId = null, transactionEpoch = null) {
    const normalizedSessionId = this.normalizeTransactionSessionId(sessionId);
    const normalizedEpoch = Number.isFinite(transactionEpoch) ?
      Math.floor(transactionEpoch) :
      0;
    const row = this.db
      .prepare(PARTITION_SERVICE_SQL.SELECT_TRANSACTION_OUTCOME)
      .get(normalizedSessionId, normalizedEpoch);
    if (row?.outcome === PARTICIPANT_COMMIT_OUTCOME.COMMITTED) {
      return PARTICIPANT_COMMIT_OUTCOME.COMMITTED;
    }
    const openTransaction =
      this.resolveOpenTransactionState(normalizedSessionId);
    if (
      openTransaction &&
      Number(openTransaction.state.transactionEpoch || 0) === normalizedEpoch
    ) {
      return PARTICIPANT_COMMIT_OUTCOME.UNKNOWN;
    }
    if (this.preparedStateLostSessions.has(normalizedSessionId)) {
      return PARTICIPANT_COMMIT_OUTCOME.UNKNOWN;
    }
    return PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED;
  }
  /**
   * Replicate transaction commit through Raft for durability.
   * @return {Promise<Object>} Raft log entry.
   * @private
   */
  async replicateTransactionCommit(
    operations = [],
    sessionId = null,
    transactionEpoch = null,
  ) {
    const timestamp = this.hlcClock.now();
    const entry = {
      type: PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
      sessionId,
      transactionEpoch,
      operations: Array.isArray(operations) ? operations : [],
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };
    const logEntry = this.storage.appendEntry(entry);
    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      this.raftProvider.propose(this.raft, entry, (err) => {
        if (err) {
          this.logger.debug(
            PARTITION_SERVICE_ERROR_MSG.TRANSACTION_COMMIT_RAFT_FAILED,
            {partitionId: this.partitionId, error: err.message},
          );
        }
      });
    }
    return logEntry;
  }
  /**
   * Replicate one transaction rollback marker through Raft.
   * @param {string} sessionId - Transaction session ID.
   * @param {number|null} transactionEpoch - Transaction snapshot epoch.
   * @return {Promise<Object>} Raft log entry.
   * @private
   */
  async replicateTransactionRollback(
    sessionId = null,
    transactionEpoch = null,
  ) {
    const timestamp = this.hlcClock.now();
    const entry = {
      type: PARTITION_SERVICE_OPERATION.ROLLBACK,
      sessionId,
      transactionEpoch,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };
    const logEntry = this.storage.appendEntry(entry);
    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      this.raftProvider.propose(this.raft, entry, (err) => {
        if (err) {
          this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
            partitionId: this.partitionId,
            error: err.message,
          });
        }
      });
    }
    return logEntry;
  }
  /**
   * Replicate prepared transaction state through Raft for durability.
   * @param {string} sessionId - Transaction session ID.
   * @param {Object} transactionState - Active transaction state.
   * @return {Promise<Object>} Raft log entry.
   * @private
   */
  async replicatePreparedTransaction(sessionId, transactionState) {
    const timestamp = this.hlcClock.now();
    const entry = {
      type: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
      sessionId,
      epoch: transactionState.transactionEpoch,
      writeSet: [...transactionState.writeSet],
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };
    const logEntry = this.storage.appendEntry(entry);
    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      this.raftProvider.propose(this.raft, entry, (err) => {
        if (err) {
          this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
            partitionId: this.partitionId,
            error: err.message,
          });
        }
      });
    }
    return logEntry;
  }
}

export {PartitionServiceTransactionBase};
