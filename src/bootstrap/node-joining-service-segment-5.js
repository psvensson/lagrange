import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {NodeJoiningPublicationActivation} from './node-joining-publication-activation.js';

const {
  BootstrapTopologySnapshotOwner,
  CACHE_DEFAULT,
  CDCPipelineReadinessGate,
  CDC_PROPAGATED_TABLES,
  COLUMN,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOIN_BACKFILL_QUERY,
  NODE_JOINING_SERVICE_LITERAL,
  NUM,
  NodeService,
  NodeStorageBudgetSetup,
  RAFT_ROLE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TIME_MS,
  TYPEOF,
  canonicalizeSystemTableRow,
  classifyTransportDeliveryOutcome,
  compareJoinSchemaVersions,
  extractJoinSchemaVersionFromRecord,
  getSystemCachePrimaryKeyFieldOrFallback,
  isDeliveredTransportDeliveryOutcome,
  resolveCanonicalLeaderIdentitySnapshot,
} = NODE_JOINING_SERVICE_SHARED;

class NodeJoiningServiceSegment5 extends NodeJoiningPublicationActivation {
  async resolveAuthoritativeBackfillRows(
    sqlQueryEngine,
    tableName,
    options = {},
  ) {
    const sql = `SELECT * FROM ${tableName}`;
    const rowSets = [];
    const systemTableSnapshots =
      this.bootstrapResponse?.systemTableSnapshots || null;
    const hasBootstrapSnapshot =
      systemTableSnapshots !== null &&
      typeof systemTableSnapshots === TYPEOF.OBJECT &&
      Object.prototype.hasOwnProperty.call(systemTableSnapshots, tableName);
    const bootstrapSnapshotRows = Array.isArray(
      systemTableSnapshots?.[tableName],
    ) ?
      systemTableSnapshots[tableName] :
      [];
    if (hasBootstrapSnapshot) {
      rowSets.push(bootstrapSnapshotRows);
    }
    if (options.preferBootstrapSnapshot === true && hasBootstrapSnapshot) {
      return this.mergeBackfillRowSets(tableName, rowSets);
    }
    const routedResult = await sqlQueryEngine.executeQuery(sql, [], {
      deliveryPriority: options.deliveryPriority,
      timeoutMs: options.queryTimeoutMs,
    });
    if (routedResult?.success) {
      rowSets.push(Array.isArray(routedResult.rows) ? routedResult.rows : []);
    }
    const replicaQuery = await this.queryBackfillRowsAcrossReplicas(
      sqlQueryEngine,
      tableName,
      sql,
      options,
    );
    if (replicaQuery && replicaQuery.rowSets.length > NUM.ZERO) {
      rowSets.push(...replicaQuery.rowSets);
      const observedCounts = replicaQuery.rowSets.map((rows) => rows.length);
      const mergedCount = this.mergeBackfillRowSets(
        tableName,
        replicaQuery.rowSets,
      ).length;
      const minReplicaCount = Math.min(...observedCounts);
      const maxReplicaCount = Math.max(...observedCounts);
      if (
        minReplicaCount !== maxReplicaCount ||
        mergedCount > maxReplicaCount
      ) {
        this.logger.warn(
          NODE_JOINING_SERVICE_LITERAL.JOIN_BACKFILL_DETECTED_REPLICA_DIVERGENCE,
          {
            nodeId: this.nodeId,
            tableName,
            partitionId: replicaQuery.partitionId,
            replicaCount: replicaQuery.rowSets.length,
            observedCounts,
            mergedCount,
          },
        );
      }
    }
    if (rowSets.length === NUM.ZERO) {
      throw new Error(
        `Failed to backfill propagated table ${tableName}: ` +
          `${routedResult?.error || NODE_JOINING_SERVICE_LITERAL.QUERY_FAILED}`,
      );
    }
    return this.mergeBackfillRowSets(tableName, rowSets);
  }
  /**
   * Query all known routable replicas for one propagated table and return
   * successful row sets. This is used only during join-time cache repair.
   * @param {Object} sqlQueryEngine
   * @param {string} tableName
   * @param {string} sql
   * @return {Promise<{partitionId: string, rowSets: Object[][]}|null>}
   * @private
   */
  async queryBackfillRowsAcrossReplicas(
    sqlQueryEngine,
    tableName,
    sql,
    options = {},
  ) {
    if (options.allowReplicaFanout === false) {
      return null;
    }
    const partitions =
      typeof sqlQueryEngine?.getTablePartitions === TYPEOF.FUNCTION ?
        sqlQueryEngine.getTablePartitions(tableName) :
        [];
    if (!Array.isArray(partitions) || partitions.length !== NUM.ONE) {
      return null;
    }
    const partitionId =
      partitions[0]?.partition_id || partitions[0]?.partitionId || null;
    if (!partitionId) {
      return null;
    }
    const queryExecutor = sqlQueryEngine?.queryExecutor || null;
    const partitionServices =
      typeof queryExecutor?.getRoutablePartitionServices === TYPEOF.FUNCTION ?
        queryExecutor.getRoutablePartitionServices(partitionId) :
        [];
    if (
      !Array.isArray(partitionServices) ||
      partitionServices.length === NUM.ZERO
    ) {
      return null;
    }
    const seenAddresses = new Set();
    const deliveryTargets = [];
    for (const service of partitionServices) {
      const address = service?.address || null;
      if (
        typeof address !== TYPEOF.STRING ||
        address.length === NUM.ZERO ||
        seenAddresses.has(address)
      ) {
        continue;
      }
      seenAddresses.add(address);
      deliveryTargets.push(address);
    }
    if (deliveryTargets.length === NUM.ZERO) {
      return null;
    }
    const messageRouter =
      queryExecutor?.messageRouter || this.messageRouter || null;
    if (!messageRouter || typeof messageRouter.deliver !== TYPEOF.FUNCTION) {
      return null;
    }
    const replicaResults = [];
    for (const address of deliveryTargets) {
      replicaResults.push(
        await this.queryBackfillReplicaAddress(
          messageRouter,
          address,
          sql,
          options,
        ),
      );
    }
    const rowSets = replicaResults
      .filter((result) => result.success)
      .map((result) => result.rows);
    return rowSets.length > NUM.ZERO ? {partitionId, rowSets} : null;
  }
  /**
   * Query one partition replica address for join backfill.
   * @param {Object} messageRouter
   * @param {string} address
   * @param {string} sql
   * @return {Promise<{success: boolean, rows: Object[], error?: string}>}
   * @private
   */
  async queryBackfillReplicaAddress(
    messageRouter,
    address,
    sql,
    options = {},
    seenAddresses = new Set(),
  ) {
    if (seenAddresses.has(address)) {
      return {
        success: false,
        rows: [],
        error: `redirect loop detected for ${address}`,
      };
    }
    const nextSeenAddresses = new Set(seenAddresses);
    nextSeenAddresses.add(address);
    try {
      const response = classifyTransportDeliveryOutcome(
        await messageRouter.deliver(
          address,
          {type: JOIN_BACKFILL_QUERY.MESSAGE_TYPE, sql, params: []},
          {deliveryPriority: options.deliveryPriority},
        ),
      );
      if (
        response?.redirect ===
          JOIN_BACKFILL_QUERY.RESPONSE_TYPE.LEADER_REDIRECT &&
        response?.leaderAddress
      ) {
        return this.queryBackfillReplicaAddress(
          messageRouter,
          response.leaderAddress,
          sql,
          options,
          nextSeenAddresses,
        );
      }
      if (isDeliveredTransportDeliveryOutcome(response) && response?.success) {
        return {
          success: true,
          rows: Array.isArray(response.rows) ? response.rows : [],
        };
      }
      return {
        success: false,
        rows: [],
        error: response?.error || NODE_JOINING_SERVICE_LITERAL.QUERY_FAILED,
      };
    } catch (error) {
      return {success: false, rows: [], error: error.message};
    }
  }
  /**
   * Merge replicated row sets by primary key, preferring the freshest row.
   * @param {string} tableName
   * @param {Object[][]} rowSets
   * @return {Object[]}
   * @private
   */
  mergeBackfillRowSets(tableName, rowSets) {
    const keyField = getSystemCachePrimaryKeyFieldOrFallback(
      tableName,
      CACHE_DEFAULT.PRIMARY_KEY_FALLBACK,
    );
    const mergedRows = new Map();
    for (const rowSet of rowSets) {
      const rows = Array.isArray(rowSet) ? rowSet : [];
      for (const row of rows) {
        const canonicalRow = canonicalizeSystemTableRow(tableName, row);
        const key =
          canonicalRow?.[keyField] ??
          canonicalRow?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK];
        if (typeof key === TYPEOF.UNDEFINED || key === null) {
          continue;
        }
        const existing = mergedRows.get(key);
        if (!existing || this.isBackfillRowNewer(canonicalRow, existing)) {
          mergedRows.set(key, canonicalRow);
        }
      }
    }
    return [...mergedRows.values()];
  }
  /**
   * Prefer the row with the newest schema/version watermark.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isBackfillRowNewer(candidate, existing) {
    const candidateVersion = extractJoinSchemaVersionFromRecord(candidate);
    const existingVersion = extractJoinSchemaVersionFromRecord(existing);
    if (candidateVersion && existingVersion) {
      return (
        compareJoinSchemaVersions(candidateVersion, existingVersion) > NUM.ZERO
      );
    }
    if (candidateVersion && !existingVersion) {
      return true;
    }
    if (!candidateVersion && existingVersion) {
      return false;
    }
    return JSON.stringify(candidate).length > JSON.stringify(existing).length;
  }
  /**
   * Make an HTTP POST request.
   * @param {string} url - URL to post to.
   * @param {Object} body - Request body.
   * @return {Promise<Object>} Response body.
   * @private
   */
  async httpPost(url, body, options = {}) {
    const timeoutMs = Number.isFinite(options?.timeoutMs) &&
      options.timeoutMs > NUM.ZERO ?
      Math.floor(options.timeoutMs) :
      this.config.httpTimeoutMs;
    // AbortController is a global in Node.js 22+
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );
    try {
      const response = await fetch(url, {
        method: JOINING_HTTP.METHOD_POST,
        headers: {
          [JOINING_HTTP.HEADER_CONTENT_TYPE]: JOINING_HTTP.CONTENT_TYPE_JSON,
          [JOINING_HTTP.HEADER_CONNECTION]: JOINING_HTTP.CONNECTION_CLOSE,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryAfterHeader = response.headers.get(
          JOINING_HTTP.HEADER_RETRY_AFTER,
        );
        const errorBody = await response.text();
        let parsedBody = null;
        try {
          parsedBody = JSON.parse(errorBody);
        } catch (_parseError) {
          parsedBody = null;
        }
        const httpStatusError = JOINING_ERROR_MSG.httpStatus;
        const error = new Error(httpStatusError(response.status, errorBody));
        error.statusCode = response.status;
        error.responseBody = errorBody;
        error.responseJson = parsedBody;
        const retryAfterHintMs = this.parseRetryAfterHeaderMs(retryAfterHeader);
        const retryAfterBodyMs = Number.isFinite(parsedBody?.retryAfterMs) ?
          Math.floor(parsedBody.retryAfterMs) :
          null;
        const retryAfterMs =
          Number.isFinite(retryAfterHintMs) && Number.isFinite(retryAfterBodyMs) ?
            Math.max(retryAfterHintMs, retryAfterBodyMs) :
            Number.isFinite(retryAfterHintMs) ?
              retryAfterHintMs :
              retryAfterBodyMs;
        if (Number.isFinite(retryAfterMs)) {
          error.retryAfterMs = retryAfterMs;
        }
        throw error;
      }
      const responseBody = await response.json();
      clearTimeout(timeoutId);
      return responseBody;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === JOINING_ERROR_NAME.ABORT) {
        const httpTimeoutError = JOINING_ERROR_MSG.httpTimeout;
        const timeoutError = new Error(httpTimeoutError(timeoutMs));
        // A request timeout is transient by nature. Mark it so the
        // join-level retryable-resume classification preserves join state
        // (CL-006) instead of running the destructive cleanup — phases with
        // their own classifiers (seed contact, message-group registration)
        // already treated this message as retryable in-phase, but the
        // verdict was dropped once the bare error crossed the phase
        // boundary (witness: querying_state failures in
        // stat-gate-20260610T172830Z runs 1/3/4).
        timeoutError.deferRetry = true;
        throw timeoutError;
      }
      throw error;
    }
  }
  /**
   * Parse Retry-After header into milliseconds when possible.
   * Supports delta-seconds and HTTP date formats.
   * @param {string|null} retryAfterHeader
   * @return {number|null}
   * @private
   */
  parseRetryAfterHeaderMs(retryAfterHeader) {
    if (
      typeof retryAfterHeader !== TYPEOF.STRING ||
      retryAfterHeader.length === NUM.ZERO
    ) {
      return null;
    }
    const deltaSeconds = Number(retryAfterHeader);
    if (Number.isFinite(deltaSeconds) && deltaSeconds >= NUM.ZERO) {
      return Math.floor(deltaSeconds * TIME_MS.SECOND);
    }
    const retryAtMs = Date.parse(retryAfterHeader);
    if (!Number.isFinite(retryAtMs)) {
      return null;
    }
    return Math.max(NUM.ZERO, retryAtMs - this.now());
  }
  /**
   * Create the shared CDC pipeline readiness gate.
   * Tests override this to inject manual time instead of wall-clock waits.
   * @param {Object} systemTableCache
   * @return {CDCPipelineReadinessGate}
   */
  createCdcPipelineReadinessGate(systemTableCache) {
    return new CDCPipelineReadinessGate({
      systemTableCache,
      cdcPropagatedTables: CDC_PROPAGATED_TABLES,
      now: () => this.now(),
      sleep: (delayMs) => this.sleep(delayMs),
    });
  }
  /**
   * Handle joining failure.
   * @param {Error} error - The error that caused failure.
   * @param {Object} [options] - Severity options (preserveForResume).
   * @return {Object} Failure result.
   * @private
   */
  async handleJoiningFailure(error, options = {}) {
    return this.joinCleanupHandler.handleJoiningFailure(error, options);
  }
  /**
   * Clean up a failed join in reverse phase order.
   * Each cleanup step undoes the work of the corresponding join phase.
   * Errors are logged but never thrown — cleanup is best-effort.
   * @param {string} failedPhase - The JOINING_PHASE that failed.
   * @param {Object} cleanupContext - Tracking info for cleanup.
   * @param {string} cleanupContext.registeredNodeId - Node ID if
   *   registered before failure.
   * @param {string[]} cleanupContext.createdServiceIds - Service IDs
   *   created before failure.
   * @param {string[]} cleanupContext.createdMessageGroupIds - Message
   *   group IDs created before failure.
   * @return {Promise<void>}
   */
  async cleanupFailedJoin(failedPhase, cleanupContext) {
    return this.joinCleanupHandler.cleanupFailedJoin(
      failedPhase,
      cleanupContext,
    );
  }
  /**
   * Execute a single join cleanup step. Each step is wrapped in
   * try/catch so that cleanup errors are logged but never thrown.
   * @param {string} step - The cleanup step to execute.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _executeJoinCleanupStep(step, cleanupContext) {
    return this.joinCleanupHandler._executeJoinCleanupStep(
      step,
      cleanupContext,
    );
  }
  /**
   * Cleanup step: remove self from nodes table and remove
   * service entries created during join.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupQueryingState(cleanupContext) {
    return this.joinCleanupHandler._cleanupQueryingState(cleanupContext);
  }
  /**
   * Cleanup step: stop message group services that were
   * waiting for leadership.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupWaitingLeadership() {
    return this.joinCleanupHandler._cleanupWaitingLeadership();
  }
  /**
   * Cleanup step: stop message group replicas and remove
   * their service entries.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupMessageGroup(cleanupContext) {
    return this.joinCleanupHandler._cleanupMessageGroup(cleanupContext);
  }
  /**
   * Cleanup step: disconnect from seed node and stop
   * the message router.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupConnectingWebSocket() {
    return this.joinCleanupHandler._cleanupConnectingWebSocket();
  }
  /**
   * Clean up partially initialized services.
   * @return {Promise<void>}
   * @private
   */
  async cleanup() {
    return this.joinCleanupHandler.cleanup();
  }
  /**
   * Get the node storage budget service.
   * @return {NodeStorageBudgetService}
   * @private
   */
  getNodeStorageBudgetService() {
    if (this.nodeStorageBudgetService) {
      return this.nodeStorageBudgetService;
    }
    const service = NodeStorageBudgetSetup.create({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
    });
    this.nodeStorageBudgetService = service;
    return service;
  }
  /**
   * Expose the bootstrap topology owner surface to the steady-state SQL
   * runtime so joined nodes can retain canonical leader identity while local
   * system-table rows converge after bootstrap.
   * @return {BootstrapTopologySnapshotOwner}
   */
  getBootstrapTopologySnapshotOwner() {
    if (!this.bootstrapTopologySnapshotOwner) {
      this.bootstrapTopologySnapshotOwner = new BootstrapTopologySnapshotOwner({
        delegates: {
          getSystemTableCache: () =>
            NodeService.getInstance().getSystemTableCache(),
          getPartitionServices: () => this.partitionServices,
          getSeedNodeId: () => this.seedNodeId,
          getLogger: () => this.logger,
          getCurrentEpoch: () =>
            this.epochManager?.getCurrentEpoch?.() || null,
        },
      });
    }
    return this.bootstrapTopologySnapshotOwner;
  }
  /**
   * Get the current joining phase.
   * @return {string} Current phase.
   */
  getPhase() {
    return this.phase;
  }
  /**
   * Get joining status.
   * @return {Object} Joining status.
   */
  getStatus() {
    const baseStatus = {
      nodeId: this.nodeId,
      phase: this.phase,
      lifecycleState: this.lifecycleStateMachine.getState(),
      startTime: this.startTime,
      duration: this.startTime ? this.now() - this.startTime : NUM.ZERO,
      messageGroupCount: this.messageGroupServices.size,
      lastError: this.lastError?.message || null,
    };
    if (
      !this.joinReadinessEvaluator ||
      typeof this.joinReadinessEvaluator.buildCanonicalJoinReadinessSnapshot !==
        TYPEOF.FUNCTION ||
      typeof this.joinReadinessEvaluator
        .evaluateCanonicalJoinReadinessSnapshot !== TYPEOF.FUNCTION
    ) {
      return baseStatus;
    }
    try {
      const readinessSnapshot =
        this.joinReadinessEvaluator.buildCanonicalJoinReadinessSnapshot();
      const evaluation =
        this.joinReadinessEvaluator.evaluateCanonicalJoinReadinessSnapshot(
          readinessSnapshot,
        );
      return {
        ...baseStatus,
        promotionState: evaluation?.promotionState || null,
        promotionReasons: Array.isArray(evaluation?.promotionReasons) ?
          [...evaluation.promotionReasons] :
          [],
        snapshotRevision: evaluation?.snapshotRevision ?? null,
        snapshotRevisionState: evaluation?.snapshotRevisionState || null,
        snapshotExpectedMinimumRevision:
          evaluation?.snapshotExpectedMinimumRevision ?? null,
        snapshotRevisionGap: evaluation?.snapshotRevisionGap ?? null,
        snapshotResumeToken: evaluation?.snapshotResumeToken || null,
      };
    } catch (_error) {
      return baseStatus;
    }
  }
  /**
   * Get the node lifecycle state machine.
   * @return {NodeLifecycleStateMachine} The lifecycle state machine.
   */
  getLifecycleStateMachine() {
    return this.lifecycleStateMachine;
  }
  /**
   * Check if joining has local message group replica with leadership.
   * @return {boolean} True if has operational message group.
   */
  hasOperationalMessageGroup() {
    return this.getLeaderMessageGroupService() !== null;
  }
  /**
   * Return seed-contact startup authority captured before full admission.
   * @return {Object|null}
   */
  getSeedContactStartupAuthoritySnapshot() {
    return this.seedContactStartupAuthority &&
      typeof this.seedContactStartupAuthority === TYPEOF.OBJECT ?
      this.seedContactStartupAuthority :
      null;
  }
  /**
   * Check if any joined message group has a leader in the system cache.
   * @param {Object} systemTableCache - System table cache.
   * @return {boolean} True if cache reports a leader for any joined group.
   * @private
   */
  hasMessageGroupLeaderInCache(systemTableCache) {
    if (!systemTableCache) {
      return false;
    }
    const groupIds = new Set();
    for (const service of this.messageGroupServices.values()) {
      if (service?.groupId) {
        groupIds.add(service.groupId);
      }
    }
    if (groupIds.size === NUM.ZERO) {
      return false;
    }
    const services =
      typeof systemTableCache.filter === TYPEOF.FUNCTION ?
        systemTableCache.filter(
          TABLES.SERVICES,
          (service) =>
            service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
              groupIds.has(service?.[COLUMN.GROUP_ID]) &&
              service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
        ) :
        (systemTableCache.getAll?.(TABLES.SERVICES) || []).filter(
          (service) =>
            service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
              groupIds.has(service?.[COLUMN.GROUP_ID]) &&
              service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
        );
    if (services.length === NUM.ZERO) {
      return false;
    }
    const groupRows =
      typeof systemTableCache.filter === TYPEOF.FUNCTION ?
        systemTableCache.filter(TABLES.MESSAGE_GROUPS, (group) =>
          groupIds.has(group?.[COLUMN.GROUP_ID]),
        ) :
        (systemTableCache.getAll?.(TABLES.MESSAGE_GROUPS) || []).filter(
          (group) => groupIds.has(group?.[COLUMN.GROUP_ID]),
        );
    const activeServiceExistsForCanonicalLeader = groupRows.some((group) => {
      const groupId =
        group?.[COLUMN.GROUP_ID] || group?.group_id || group?.groupId || null;
      if (typeof groupId !== TYPEOF.STRING || groupId.length === NUM.ZERO) {
        return false;
      }
      const groupServices = services.filter(
        (service) => service?.[COLUMN.GROUP_ID] === groupId,
      );
      if (groupServices.length === NUM.ZERO) {
        return false;
      }
      const leaderIdentity = resolveCanonicalLeaderIdentitySnapshot({
        partition: group,
        partitionPresent: true,
        serviceRows: groupServices,
      });
      return (
        typeof leaderIdentity?.leaderNodeId === TYPEOF.STRING &&
        leaderIdentity.leaderNodeId.length > NUM.ZERO
      );
    });
    if (activeServiceExistsForCanonicalLeader) {
      return true;
    }
    return services.some((service) => {
      return (
        String(service?.[COLUMN.RAFT_ROLE] || STRING.EMPTY).toLowerCase() ===
        String(RAFT_ROLE.LEADER).toLowerCase()
      );
    });
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
}

export {NodeJoiningServiceSegment5};
