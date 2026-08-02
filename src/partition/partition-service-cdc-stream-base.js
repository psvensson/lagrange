import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PartitionServiceWriteMetricsBase} from './partition-service-write-metrics-base.js';

const {
  CDC_LIFECYCLE_LOG_MSG,
  CDC_PIPELINE_METRIC,
  CONTROL_PLANE_PARTITION_IDS,
  ERRORS,
  PARTITION_CDC_EVENT_BUILD_STATE,
  PARTITION_SERVICE_DB,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  SQL,
  STRING,
  SYSTEM_TABLE_NAME,
  fs,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceCdcStreamBase extends PartitionServiceWriteMetricsBase {
  /**
   * Generate a CDC event for a write operation.
   * @param {Object} entry - Write entry.
   * @return {Promise<void>}
   * @private
   */
  async generateCDCEvent(entry) {
    if (this.isShutdown) {
      return;
    }
    // Snapshot rows are physical state transfer, not new logical mutations.
    // Source writes applied after the snapshot remain on the ordered split
    // catch-up/live-mirror path and continue to emit their normal CDC events.
    if (entry?.splitMirrorOrigin === PARTITION_SPLIT_MIRROR_ORIGIN.SNAPSHOT) {
      return;
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATE_CDC_EVENT_CALLED, {
      partitionId: this.partitionId,
      entryType: entry.type,
      sql: entry.sql ?
        entry.sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT) :
        null,
      subscriberCount: this.cdcSubscribers.size,
    });
    const cdcGenerator = this.syncCDCGeneratorDependencies();
    const envelopeResult = cdcGenerator.resolveEventEnvelope(entry, {
      suppressNoOpWrite: true,
    });
    if (envelopeResult.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) {
      return;
    }
    const tableName = envelopeResult.cdcEventEnvelope.tableName;
    if (
      this.cdcSubscribers.size === 0 &&
      !this.shouldBufferCdcWithoutSubscribers(tableName)
    ) {
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.NO_CDC_SUBSCRIBERS, {
        partitionId: this.partitionId,
        tableName,
      });
      return;
    }
    const cdcEvent = cdcGenerator.hydrateEventEnvelope(entry, envelopeResult, {
      sequenceNumber: this.nextCDCEventSequenceNumber(),
    });
    this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
    if (
      this.cdcSubscribers.size > 0 &&
      this.cdcEventBuffer.hasEvents()
    ) {
      this.bufferCDCEventForRetry(
        cdcEvent,
        PARTITION_SERVICE_LITERAL.BUFFERED_BACKLOG_PRESENT,
      );
      return;
    }
    if (this.cdcSubscribers.size === 0) {
      if (!this.shouldBufferCdcWithoutSubscribers(tableName)) {
        return;
      }
      const buffered = this.cdcEventBuffer.buffer(cdcEvent);
      if (buffered) {
        this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_BUFFERED);
        this.logger.warn(CDC_LIFECYCLE_LOG_MSG.EVENT_BUFFERED, {
          tableName,
          operation: cdcEvent.operation,
          partitionId: this.partitionId,
        });
      } else {
        this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DROPPED);
        this.logger.warn(CDC_LIFECYCLE_LOG_MSG.NO_SUBSCRIBERS_NO_BUFFER, {
          tableName,
          operation: cdcEvent.operation,
          partitionId: this.partitionId,
        });
      }
      return;
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATED_CDC_EVENT, {
      partitionId: this.partitionId,
      operation: cdcEvent.operation,
      tableName: cdcEvent.tableName,
      dataKeys: Object.keys(cdcEvent.data),
      subscriberCount: this.cdcSubscribers.size,
    });
    const subscriberSnapshot = [...this.cdcSubscribers];
    let deliveredCount = 0;
    let deliveryFailureCount = 0;
    for (const subscriber of subscriberSnapshot) {
      try {
        await this.deliverCDCEventToSubscriber(subscriber, cdcEvent);
        deliveredCount++;
      } catch (error) {
        deliveryFailureCount++;
        this.cdcPipelineMetrics.increment(
          CDC_PIPELINE_METRIC.DELIVERY_FAILURES,
        );
        this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_DELIVERY_FAILED, {
          partitionId: this.partitionId,
          tableName: cdcEvent.tableName,
          operation: cdcEvent.operation,
          error: error.message,
        });
      }
    }
    if (deliveryFailureCount > 0) {
      this.bufferCDCEventForRetry(
        cdcEvent,
        PARTITION_SERVICE_LITERAL.SUBSCRIBER_DELIVERY_FAILED,
      );
      return;
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_COMPLETE, {
      partitionId: this.partitionId,
      deliveredCount,
      subscriberCount: this.cdcSubscribers.size,
    });
    this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
    this.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
  }
  /**
   * Track fire-and-forget CDC delivery so shutdown can await it.
   * @param {Promise<*>} promise
   * @return {Promise<*>}
   */
  trackPendingCDCEvent(promise) {
    if (!promise || typeof promise.finally !== 'function') {
      return promise;
    }
    this.pendingCDCEventDeliveries.add(promise);
    promise.finally(() => {
      this.pendingCDCEventDeliveries.delete(promise);
    });
    return promise;
  }
  /**
   * Resolve the canonical mutation type for one write entry.
   * Raw SQL queries are normalized to INSERT/UPDATE/DELETE/UPSERT when
   * possible so leader-local CDC and split-trigger paths agree on intent.
   * @param {Object} entry
   * @return {string|null}
   * @private
   */
  resolveWriteMutationType(entry) {
    let entryType = entry?.type || null;
    if (
      entryType === PARTITION_SERVICE_OPERATION.QUERY &&
      typeof entry?.sql === 'string'
    ) {
      const sqlUpper = entry.sql.trim().toUpperCase();
      if (sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase())) {
        entryType = PARTITION_SERVICE_OPERATION.UPSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT)) {
        entryType = PARTITION_SERVICE_OPERATION.INSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE)) {
        entryType = PARTITION_SERVICE_OPERATION.UPDATE;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE)) {
        entryType = PARTITION_SERVICE_OPERATION.DELETE;
      }
    }
    switch (entryType) {
    case PARTITION_SERVICE_OPERATION.INSERT:
    case PARTITION_SERVICE_OPERATION.UPDATE:
    case PARTITION_SERVICE_OPERATION.UPSERT:
    case PARTITION_SERVICE_OPERATION.DELETE:
      return entryType;
    default:
      return null;
    }
  }
  syncCDCGeneratorDependencies() {
    this.cdcGenerator.partitionId = this.partitionId;
    this.cdcGenerator.replicaId = this.replicaId;
    this.cdcGenerator.tableName = this.tableName;
    this.cdcGenerator.db = this.db;
    this.cdcGenerator.logger = this.logger;
    return this.cdcGenerator;
  }
  /**
   * Request split evaluation from the canonical local owner after a
   * successful user-table write. Partition leaders own split signals because
   * only they can evaluate live traffic for their source partition.
   * @param {Object} entry
   * @return {void}
   * @private
   */
  requestManagedSplitEvaluationAfterWrite(entry) {
    const splitManager =
      this.sqlQueryEngine?.partitionSplitMergeManager || null;
    if (
      !this.isLeader ||
      !splitManager ||
      typeof splitManager.requestEvaluation !== PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return;
    }
    if (
      CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ||
      Object.values(SYSTEM_TABLE_NAME).includes(this.tableName)
    ) {
      return;
    }
    if (!this.resolveWriteMutationType(entry)) {
      return;
    }
    const nowMs = Date.now();
    if (
      nowMs - this.lastManagedSplitWriteActivityAtMs <
      this.managedSplitWriteActivityDebounceMs
    ) {
      return;
    }
    this.lastManagedSplitWriteActivityAtMs = nowMs;
    splitManager.requestEvaluation({
      reasonCode: PARTITION_SERVICE_LITERAL.WRITE_ACTIVITY,
      tableName: this.tableName,
      partitionId: this.partitionId,
      partitionIds: [this.partitionId],
    });
  }
  waitForCommittedWrite(entryId, options = {}) {
    if (typeof entryId !== 'string' || entryId.length === 0) {
      return Promise.reject(new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE));
    }
    const timeoutMs =
      Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ?
        Math.floor(options.timeoutMs) :
        PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS;
    let resolvePending = null;
    let rejectPending = null;
    const commitPromise = new Promise((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    const timeoutId = setTimeout(() => {
      this.rejectCommittedWrite(
        entryId,
        new Error(`Raft write commit timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);
    try {
      this.proposalQueue.enqueue(entryId, {
        resolve: resolvePending,
        reject: rejectPending,
        timeoutId,
        logIndex: Number.isFinite(options?.logIndex) ? options.logIndex : null,
        result:
          options?.result && typeof options.result === 'object' ?
            {...options.result} :
            null,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
    return commitPromise;
  }
  setPendingCommittedWriteResult(entryId, result) {
    const pending = this.proposalQueue.get(entryId);
    if (!pending) {
      return false;
    }
    pending.result =
      result && typeof result === 'object' ? {...result} : null;
    return true;
  }
  getPendingCommittedWriteOutcome(entryId) {
    return this.pendingWriteOutcomes.get(entryId) || null;
  }
  setPendingCommittedWriteOutcome(entryId, outcomePromise) {
    if (
      typeof entryId !== 'string' ||
      entryId.length === 0 ||
      !outcomePromise
    ) {
      return false;
    }
    this.pendingWriteOutcomes.set(entryId, outcomePromise);
    const clearOwnedOutcome = () => {
      if (this.pendingWriteOutcomes.get(entryId) === outcomePromise) {
        this.pendingWriteOutcomes.delete(entryId);
      }
    };
    outcomePromise.then(clearOwnedOutcome, clearOwnedOutcome);
    return true;
  }
  resolveCommittedWrite(entryId, result = null) {
    const pending = this.proposalQueue.get(entryId);
    if (!pending) {
      return false;
    }
    const resolvedResult = {
      ...(pending.result && typeof pending.result === 'object' ?
        pending.result :
        {}),
      ...(result && typeof result === 'object' ? result : {}),
    };
    if (
      !Number.isFinite(resolvedResult.logIndex) &&
      Number.isFinite(pending.logIndex)
    ) {
      resolvedResult.logIndex = pending.logIndex;
    }
    return this.proposalQueue.resolve(entryId, resolvedResult);
  }
  rejectCommittedWrite(entryId, error) {
    if (typeof entryId !== 'string' || entryId.length === 0) {
      return false;
    }
    return this.proposalQueue.reject(entryId, error);
  }
  clearPendingCommittedWrites(reason) {
    this.proposalQueue.clear(reason);
  }
  /**
   * Build a stable key for identifying a committed write entry replay.
   * @param {Object} command - Write command.
   * @return {string|null} Stable key or null when unavailable.
   * @private
   */
  getCommittedEntryKey(command) {
    if (!command || !command.sql) {
      return null;
    }
    if (command.entryId) {
      return `entry:${command.entryId}`;
    }
    const params = Array.isArray(command.params) ?
      JSON.stringify(command.params) :
      STRING.EMPTY;
    return [
      command.proposedBy || STRING.EMPTY,
      String(command.proposedAt || 0),
      command.timestamp || STRING.EMPTY,
      command.sql,
      params,
    ].join(PARTITION_SERVICE_LITERAL.VALUE);
  }
  /**
   * Treat duplicate-key INSERT failures as idempotent replay.
   * Raft recovery can reapply previously-committed INSERT entries after restart.
   * @param {*} error
   * @param {Object} command
   * @return {boolean}
   * @private
   */
  isIdempotentInsertReplayConstraint(error, command) {
    if (!error || !command?.sql) {
      return false;
    }
    const sqlUpper = String(command.sql).trim().toUpperCase();
    const isInsertStatement =
      sqlUpper.startsWith(SQL.INSERT_INTO) ||
      sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO) ||
      sqlUpper.startsWith(SQL.INSERT_OR_IGNORE_INTO);
    if (!isInsertStatement) {
      return false;
    }
    const code = String(error.code || '').toUpperCase();
    if (code === PARTITION_SERVICE_LITERAL.SQLITE_CONSTRAINT_PRIMARYKEY) {
      return true;
    }
    if (code.startsWith(PARTITION_SERVICE_LITERAL.SQLITE_CONSTRAINT)) {
      const message = String(error.message || '');
      if (
        message
          .toUpperCase()
          .includes(PARTITION_SERVICE_LITERAL.UNIQUE_CONSTRAINT_FAILED)
      ) {
        return true;
      }
    }
    return false;
  }
  /**
   * Track an applied write key with bounded history for replay dedupe.
   * @param {string|null} entryKey - Stable write key.
   * @param {Object|null} durableCommitWitness - Commit identity retained for
   *   an acknowledged idempotent replay.
   * @private
   */
  trackAppliedEntryKey(entryKey, durableCommitWitness = null) {
    if (!entryKey) {
      return;
    }
    if (durableCommitWitness && typeof durableCommitWitness === 'object') {
      this.recentlyAppliedEntryWitnesses.set(
        entryKey,
        Object.freeze({...durableCommitWitness}),
      );
    }
    if (this.recentlyAppliedEntryKeys.has(entryKey)) return;
    this.recentlyAppliedEntryKeys.add(entryKey);
    this.recentlyAppliedEntryOrder.push(entryKey);
    if (this.recentlyAppliedEntryOrder.length > this.maxTrackedAppliedEntries) {
      const oldestKey = this.recentlyAppliedEntryOrder.shift();
      if (oldestKey) {
        this.recentlyAppliedEntryKeys.delete(oldestKey);
        this.recentlyAppliedEntryWitnesses.delete(oldestKey);
      }
    }
  }

  getAppliedEntryDurableCommitWitness(entryKey) {
    return this.recentlyAppliedEntryWitnesses.get(entryKey) || null;
  }
  /**
   * Extract data from INSERT SQL by querying the inserted row.
   * Delegates to partition-sql-parser.js.
   * @param {string} sql - INSERT SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractInsertDataFromSQL(sql, tableName) {
    return this.syncCDCGeneratorDependencies().extractInsertDataFromSQL(
      sql,
      tableName,
    );
  }
  /**
   * Extract data from UPDATE SQL by querying the updated row.
   * Delegates to partition-sql-parser.js.
   * @param {string} sql - UPDATE SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractUpdateDataFromSQL(sql, tableName) {
    return this.syncCDCGeneratorDependencies().extractUpdateDataFromSQL(
      sql,
      tableName,
    );
  }
  /**
   * Extract data from DELETE SQL.
   * Delegates to partition-sql-parser.js.
   * @param {string} sql - DELETE SQL statement.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDeleteDataFromSQL(sql) {
    return this.syncCDCGeneratorDependencies().extractDeleteDataFromSQL(sql);
  }
  /**
   * Extract data from parameterized SQL.
   * Delegates to partition-sql-parser.js.
   * @param {string} sql - SQL statement with ? placeholders.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @param {string} operationType - INSERT, UPDATE, or DELETE.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDataFromParameterizedSQL(sql, params, tableName, operationType) {
    return this.syncCDCGeneratorDependencies().extractDataFromParameterizedSQL(
      sql,
      params,
      tableName,
      operationType,
    );
  }
  /**
   * Fetch the stored row after an UPDATE so CDC emits canonical data.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause values for the updated row.
   * @return {Object|null} Canonical row or null when unavailable.
   * @private
   */
  fetchUpdatedCDCRow(tableName, whereClause) {
    return this.syncCDCGeneratorDependencies().fetchUpdatedRow(
      tableName,
      whereClause,
    );
  }
  /**
   * Parse values from SQL VALUES clause.
   * Delegates to partition-sql-parser.js.
   * @param {string} valuesStr - Values string.
   * @return {Array} Parsed values.
   * @private
   */
  parseValuesFromSQL(valuesStr) {
    return this.syncCDCGeneratorDependencies().parseValuesFromSQL(valuesStr);
  }
  /**
   * Parse a single value from SQL.
   * Delegates to partition-sql-parser.js.
   * @param {string} val - Value string.
   * @return {*} Parsed value.
   * @private
   */
  parseValue(val) {
    return this.syncCDCGeneratorDependencies().parseValue(val);
  }
  /**
   * Resolve whether late-subscriber external CDC is enabled for a table.
   * Control-plane propagation tables remain driven by the canonical CDC
   * policy matrix; user tables may override external CDC via tables.table_policies.
   * @param {string} tableName - Table name.
   * @return {boolean} True when external CDC buffering should remain enabled.
   * @private
   */
  /**
   * Resolve whether late-subscriber external CDC is enabled for a table.
   * Delegates to partition-cdc-delivery.js.
   * @param {string} tableName - Table name.
   * @return {boolean} True when external CDC buffering should remain enabled.
   * @private
   */
  isExternalCdcAllowedForTable(tableName) {
    return this.cdcDelivery.isExternalCdcAllowedForTable(tableName);
  }
  /**
   * Determine whether CDC events should be buffered when there are no
   * subscribers yet. Delegates to partition-cdc-delivery.js.
   * @param {string} tableName - Table name.
   * @return {boolean} True when buffering should stay enabled.
   * @private
   */
  shouldBufferCdcWithoutSubscribers(tableName) {
    return this.cdcDelivery.shouldBufferCdcWithoutSubscribers(tableName);
  }
  /**
   * Allocate next CDC event sequence number.
   * Delegates to partition-cdc-delivery.js.
   * @return {number} Monotonic sequence number.
   * @private
   */
  nextCDCEventSequenceNumber() {
    return this.cdcDelivery.nextCDCEventSequenceNumber();
  }
  /**
   * Buffer one CDC event for retry and schedule replay when possible.
   * Delegates to partition-cdc-delivery.js.
   * @param {Object} cdcEvent - Event payload.
   * @param {string} reason - Buffering reason.
   * @return {boolean} True when buffered, false when dropped.
   * @private
   */
  bufferCDCEventForRetry(cdcEvent, reason) {
    return this.cdcDelivery.bufferCDCEventForRetry(cdcEvent, reason);
  }
  /**
   * Schedule buffered CDC replay with bounded backoff.
   * Delegates to partition-cdc-delivery.js.
   * @param {string} reason - Trigger reason.
   * @private
   */
  scheduleBufferedCDCReplay(reason) {
    this.cdcDelivery.scheduleBufferedCDCReplay(reason);
  }
  /**
   * Replay buffered CDC events to current subscribers.
   * Delegates to partition-cdc-delivery.js.
   * @param {string} reason - Trigger reason.
   * @return {Promise<void>}
   * @private
   */
  async flushBufferedCDCEvents(reason) {
    return this.cdcDelivery.flushBufferedCDCEvents(reason);
  }
  /**
   * Resolve a stable subscriber identifier.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber.
   * @param {Object} options - Subscription options.
   * @return {string} Stable subscriber identifier.
   * @private
   */
  resolveCDCSubscriberId(subscriber, options = {}) {
    return this.cdcDelivery.resolveCDCSubscriberId(subscriber, options);
  }
  /**
   * Deliver one CDC event to a subscriber callback/object.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber callback/object.
   * @param {Object} cdcEvent - Event payload.
   * @return {Promise<void>}
   * @private
   */
  async deliverCDCEventToSubscriber(subscriber, cdcEvent) {
    return this.cdcDelivery.deliverCDCEventToSubscriber(subscriber, cdcEvent);
  }
  /**
   * Create a wrapper that enriches stream metadata for one subscriber.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Target subscriber.
   * @param {Object} subscriptionState - Mutable state for this subscriber.
   * @return {Function} Wrapper callback.
   * @private
   */
  buildCDCSubscriberWrapper(subscriber, subscriptionState) {
    return this.cdcDelivery.buildCDCSubscriberWrapper(
      subscriber,
      subscriptionState,
    );
  }
  /**
   * Subscribe to CDC with explicit handshake acknowledgment and catch-up.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber function or object.
   * @param {Object} [options] - Handshake options.
   * @param {string} [options.subscriberId] - Stable subscriber identifier.
   * @return {Promise<Object>} Handshake acknowledgment.
   */
  async subscribeToCDCWithHandshake(subscriber, options = {}) {
    return this.cdcDelivery.subscribeToCDCWithHandshake(subscriber, options);
  }
  /**
   * Subscribe to CDC events from this partition.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber function or object.
   */
  subscribeToCDC(subscriber) {
    this.cdcDelivery.subscribeToCDC(subscriber);
  }
  /**
   * Unsubscribe from CDC events.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber to remove.
   */
  unsubscribeFromCDC(subscriber) {
    this.cdcDelivery.unsubscribeFromCDC(subscriber);
  }
  /**
   * Get CDC subscription diagnostics for this partition.
   * Delegates to partition-cdc-delivery.js.
   * @return {Object} CDC subscription diagnostics.
   */
  getCDCSubscriptionDiagnostics() {
    return this.cdcDelivery.getCDCSubscriptionDiagnostics();
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
      const pageCount = this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_PAGE_COUNT, {
        simple: true,
      });
      const pageSize = this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_PAGE_SIZE, {
        simple: true,
      });
      const pragmaSizeBytes = pageCount * pageSize;
      if (
        this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH ||
        CONTROL_PLANE_PARTITION_IDS.has(this.partitionId)
      ) {
        return pragmaSizeBytes;
      }
      return Math.max(pragmaSizeBytes, this.calculateOnDiskPartitionSize());
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.PARTITION_SIZE_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      return 0;
    }
  }
  calculateOnDiskPartitionSize() {
    if (
      typeof this.dbPath !== 'string' ||
      this.dbPath.length === 0 ||
      this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH
    ) {
      return 0;
    }
    let totalSizeBytes = 0;
    for (const candidatePath of [this.dbPath, `${this.dbPath}-wal`]) {
      try {
        totalSizeBytes += fs.statSync(candidatePath).size;
      } catch (error) {
        if (error?.code !== PARTITION_SERVICE_LITERAL.ENOENT) {
          throw error;
        }
      }
    }
    return totalSizeBytes;
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
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.PARTITION_SIZE_UPDATED, {
        partitionId: this.partitionId,
        sizeBytes,
        sizeMB: (
          sizeBytes / PARTITION_SERVICE_VALUE.SIZE_BYTES_DIVISOR
        ).toFixed(PARTITION_SERVICE_VALUE.SIZE_MB_PRECISION),
      });
      this.emit(PARTITION_SERVICE_EVENT.SIZE_UPDATED, {
        partitionId: this.partitionId,
        sizeBytes,
        timestamp: this.lastSizeUpdate,
      });
      await this.persistPartitionSize(sizeBytes);
    } catch (error) {
      this.logger.error(
        PARTITION_SERVICE_ERROR_MSG.PARTITION_SIZE_UPDATE_FAILED,
        {partitionId: this.partitionId, error: error.message},
      );
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
    if (this.isShutdown) {
      this.logger.debug(
        PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN,
        {
          partitionId: this.partitionId,
          timer: PARTITION_SERVICE_LITERAL.SIZEUPDATETIMER,
        },
      );
      return;
    }
    this.sizeUpdateTimer = setInterval(async () => {
      const timeSinceLastUpdate = Date.now() - this.lastSizeUpdate;
      if (timeSinceLastUpdate >= this.sizeUpdateIntervalMs) {
        await this.updatePartitionSize();
      }
    }, this.sizeUpdateIntervalMs);
    this.sizeUpdateTimer.unref();
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
}

export {PartitionServiceCdcStreamBase};
