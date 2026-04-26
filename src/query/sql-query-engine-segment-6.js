import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineSegment5} from './sql-query-engine-segment-5.js';

const {
  AuthoritativeControlPlaneView,
  CONNECTION_STATE_CONNECTED,
  CONNECTION_STATE_READY,
  ConfigurationManager,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  RETRYABLE_CONTROL_PLANE_TIMEOUT_CLASSIFICATIONS,
  SERVICE_TYPE,
  STATUS_ACTIVE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  createTimeoutBudgetError,
  getRemainingBudgetMs,
  getSchemaByTableName,
  isNodeRecordReady,
  isRetryableControlPlaneError,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineSegment6 extends SQLQueryEngineSegment5 {
  resolveInitialPartitionBootstrapLeaderNodeId(
    partitionId,
    plannedOperations = [],
  ) {
    const currentServices = this.getPartitionServiceRows(partitionId);
    const currentLeaderService = currentServices.find(
      (service) => String(service?.raft_role || '').toLowerCase() === 'leader',
    );
    const currentLeaderNodeId =
      currentLeaderService?.node_id || currentLeaderService?.nodeId || null;
    if (
      typeof currentLeaderNodeId === 'string' &&
      currentLeaderNodeId.length > 0
    ) {
      return currentLeaderNodeId;
    }

    const currentR1Service = currentServices.find((service) => {
      const replicaId = String(
        service?.service_id || service?.replica_id || '',
      );
      return /-r1$/.test(replicaId);
    });
    const currentR1NodeId =
      currentR1Service?.node_id || currentR1Service?.nodeId || null;
    if (typeof currentR1NodeId === 'string' && currentR1NodeId.length > 0) {
      return currentR1NodeId;
    }

    const plannedR1Operation =
      plannedOperations.find((operation) => {
        const replicaId = String(operation?.replicaId || '');
        return /-r1$/.test(replicaId);
      }) || null;
    const plannedR1NodeId =
      plannedR1Operation?.targetNodeId || plannedR1Operation?.nodeId || null;
    if (typeof plannedR1NodeId === 'string' && plannedR1NodeId.length > 0) {
      return plannedR1NodeId;
    }

    const firstCurrentNodeId =
      currentServices.find((service) => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.node_id ||
      currentServices.find((service) => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId ||
      null;
    if (
      typeof firstCurrentNodeId === 'string' &&
      firstCurrentNodeId.length > 0
    ) {
      return firstCurrentNodeId;
    }

    const firstPlannedNodeId =
      plannedOperations.find((operation) => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.targetNodeId ||
      plannedOperations.find((operation) => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId ||
      null;
    return typeof firstPlannedNodeId === 'string' &&
      firstPlannedNodeId.length > 0 ?
      firstPlannedNodeId :
      null;
  }

  /**
   * Resolve active node IDs eligible for initial replica provisioning.
   * Prefers local node first to keep early routing local.
   * @param {number} requestedReplicaCount
   * @return {Array<string>} Ordered node IDs.
   * @private
   */
  resolveProvisionTargetNodeIds(requestedReplicaCount) {
    return this.resolveProvisionTargetNodeIdsWithDiagnostics(
      requestedReplicaCount,
    ).nodeIds;
  }

  /**
   * Resolve active node IDs plus eligibility diagnostics.
   * @param {number} requestedReplicaCount
   * @return {{nodeIds: string[], diagnostics: Object}}
   * @private
   */
  resolveProvisionTargetNodeIdsWithDiagnostics(requestedReplicaCount) {
    const desiredReplicaCount =
      Number.isInteger(requestedReplicaCount) && requestedReplicaCount > 0 ?
        requestedReplicaCount :
        1;

    const diagnostics =
      this.resolveProvisionTargetNodeDiagnostics(desiredReplicaCount);
    let selectedNodeIds = diagnostics.selectedNodeIds;
    if (selectedNodeIds.length === 0) {
      selectedNodeIds = [this.nodeId];
    } else if (!selectedNodeIds.includes(this.nodeId)) {
      selectedNodeIds = [this.nodeId, ...selectedNodeIds];
    }

    const orderedNodeIds = this.orderProvisionTargetNodeIds(selectedNodeIds);
    const cappedNodeIds = orderedNodeIds.slice(
      0,
      Math.max(1, Math.min(desiredReplicaCount, orderedNodeIds.length)),
    );

    return {
      nodeIds: cappedNodeIds,
      diagnostics: {
        ...diagnostics,
        selectedNodeIds: orderedNodeIds,
        resolvedNodeIds: cappedNodeIds,
      },
    };
  }

  /**
   * Order node IDs lexicographically while keeping the local node first.
   * @param {Array<string>} nodeIds
   * @return {Array<string>}
   * @private
   */
  orderProvisionTargetNodeIds(nodeIds) {
    const uniqueNodeIds = [...new Set(nodeIds)];
    uniqueNodeIds.sort((left, right) => left.localeCompare(right));
    if (uniqueNodeIds.includes(this.nodeId)) {
      uniqueNodeIds.splice(uniqueNodeIds.indexOf(this.nodeId), 1);
      uniqueNodeIds.unshift(this.nodeId);
    }
    return uniqueNodeIds;
  }

  /**
   * Resolve provision-target diagnostics from local cache state.
   * @param {number} requestedReplicaCount
   * @return {Object}
   * @private
   */
  resolveProvisionTargetNodeDiagnostics(requestedReplicaCount) {
    const desiredReplicaCount =
      Number.isInteger(requestedReplicaCount) && requestedReplicaCount > 0 ?
        requestedReplicaCount :
        1;
    if (!this.systemCache) {
      return {
        requestedReplicaCount: desiredReplicaCount,
        activeNodeRowCount: 0,
        activeServiceRowCount: 0,
        strictNodeIds: [],
        degradedFallbackNodeIds: [],
        selectedNodeIds: [],
        usedDegradedFallback: false,
      };
    }

    const activeNodeRows = [];
    const serviceRows = [];
    if (typeof this.systemCache.filter === 'function') {
      const filteredRows = this.systemCache.filter(TABLES.NODES, (nodeRow) => {
        const status = String(
          nodeRow?.status || nodeRow?.state || '',
        ).toLowerCase();
        return status === STATUS_ACTIVE;
      });
      if (Array.isArray(filteredRows)) {
        activeNodeRows.push(...filteredRows);
      }
      const filteredServiceRows = this.systemCache.filter(
        TABLES.SERVICES,
        (serviceRow) => {
          const status = String(serviceRow?.status || '').toLowerCase();
          const nodeId = serviceRow?.node_id || serviceRow?.nodeId || null;
          return (
            status === STATUS_ACTIVE &&
            typeof nodeId === 'string' &&
            nodeId.length > 0
          );
        },
      );
      if (Array.isArray(filteredServiceRows)) {
        serviceRows.push(...filteredServiceRows);
      }
    } else if (typeof this.systemCache.getAll === 'function') {
      const allRows = this.systemCache.getAll(TABLES.NODES);
      if (Array.isArray(allRows)) {
        for (const nodeRow of allRows) {
          const status = String(
            nodeRow?.status || nodeRow?.state || '',
          ).toLowerCase();
          if (status === STATUS_ACTIVE) {
            activeNodeRows.push(nodeRow);
          }
        }
      }
      const allServiceRows = this.systemCache.getAll(TABLES.SERVICES);
      if (Array.isArray(allServiceRows)) {
        for (const serviceRow of allServiceRows) {
          const status = String(serviceRow?.status || '').toLowerCase();
          const nodeId = serviceRow?.node_id || serviceRow?.nodeId || null;
          if (
            status === STATUS_ACTIVE &&
            typeof nodeId === 'string' &&
            nodeId.length > 0
          ) {
            serviceRows.push(serviceRow);
          }
        }
      }
    }

    const activeNodeSeenById = new Set();
    const activeNodeReadinessById = new Map();
    const activeNodeConnectionById = new Map();
    for (const row of activeNodeRows) {
      const nodeId = row?.node_id || row?.nodeId || row?.id || null;
      if (typeof nodeId !== 'string' || nodeId.length === 0) {
        continue;
      }
      activeNodeSeenById.add(nodeId);
      const leaseExpiry = Number(
        row?.ready_lease_expires_at ?? row?.readyLeaseExpiresAt,
      );
      const hasReadyLease = Number.isFinite(leaseExpiry);
      const connectionState = String(
        row?.connection_state || row?.connectionState || '',
      ).toLowerCase();
      const hasConnectionState = connectionState.length > 0;
      const isConnectionReady =
        connectionState === CONNECTION_STATE_CONNECTED ||
        connectionState === CONNECTION_STATE_READY;
      const connectionEligible = !hasConnectionState || isConnectionReady;
      const isNodeReady = hasReadyLease ?
        isNodeRecordReady(row, {requireActiveStatus: true}) :
        true;
      activeNodeReadinessById.set(nodeId, isNodeReady);
      activeNodeConnectionById.set(nodeId, connectionEligible);
    }

    const strictNodeIds = this.orderProvisionTargetNodeIds(
      [...activeNodeReadinessById.entries()]
        .filter(
          ([nodeId, ready]) =>
            ready === true && activeNodeConnectionById.get(nodeId) === true,
        )
        .map(([nodeId]) => nodeId),
    );

    const strictServiceNodeIds = [];
    const degradedServiceNodeIds = [];
    const seenServiceNodeIds = new Set();
    for (const row of serviceRows) {
      const nodeId = row?.node_id || row?.nodeId || null;
      if (
        typeof nodeId !== 'string' ||
        nodeId.length === 0 ||
        seenServiceNodeIds.has(nodeId)
      ) {
        continue;
      }
      seenServiceNodeIds.add(nodeId);
      if (!activeNodeSeenById.has(nodeId)) {
        strictServiceNodeIds.push(nodeId);
        continue;
      }
      if (activeNodeReadinessById.get(nodeId) === true) {
        strictServiceNodeIds.push(nodeId);
        continue;
      }
      if (activeNodeConnectionById.get(nodeId) === true) {
        degradedServiceNodeIds.push(nodeId);
      }
    }

    const mergedStrictNodeIds = this.orderProvisionTargetNodeIds([
      ...strictNodeIds,
      ...strictServiceNodeIds,
    ]);
    const strictNodeIdSet = new Set(mergedStrictNodeIds);
    const degradedFallbackNodeIds = this.orderProvisionTargetNodeIds(
      degradedServiceNodeIds.filter((nodeId) => !strictNodeIdSet.has(nodeId)),
    );
    let selectedNodeIds = mergedStrictNodeIds;
    let usedDegradedFallback = false;
    if (
      selectedNodeIds.length < desiredReplicaCount &&
      degradedFallbackNodeIds.length > 0
    ) {
      selectedNodeIds = this.orderProvisionTargetNodeIds([
        ...selectedNodeIds,
        ...degradedFallbackNodeIds,
      ]);
      usedDegradedFallback = true;
    }

    return {
      requestedReplicaCount: desiredReplicaCount,
      activeNodeRowCount: activeNodeRows.length,
      activeServiceRowCount: serviceRows.length,
      strictNodeIds: mergedStrictNodeIds,
      degradedFallbackNodeIds,
      selectedNodeIds,
      usedDegradedFallback,
    };
  }

  /**
   * Resolve target nodes for one provisioning context.
   * Explicit targets override readiness-discovered nodes.
   * @param {string[]|undefined|null} explicitTargetNodeIds
   * @param {number} requestedReplicaCount
   * @param {Object|null} [provisionTargetDiagnostics]
   * @return {Array<string>}
   * @private
   */
  resolveProvisionTargetNodeIdsForContext(
    explicitTargetNodeIds,
    requestedReplicaCount,
    provisionTargetDiagnostics = null,
  ) {
    const explicitTargets = this.normalizeTargetNodeIds(explicitTargetNodeIds);
    if (explicitTargets.length === 0) {
      const diagnostics =
        provisionTargetDiagnostics &&
        typeof provisionTargetDiagnostics === 'object' ?
          provisionTargetDiagnostics :
          this.resolveProvisionTargetNodeIdsWithDiagnostics(
            requestedReplicaCount,
          ).diagnostics;
      const selectedNodeIds = Array.isArray(diagnostics?.selectedNodeIds) ?
        diagnostics.selectedNodeIds :
        [];
      if (selectedNodeIds.length > 0) {
        return selectedNodeIds;
      }
      return this.resolveProvisionTargetNodeIds(requestedReplicaCount);
    }

    return explicitTargets;
  }

  /**
   * Normalize one node-id list to unique non-empty string IDs.
   * @param {Array<string>|undefined|null} targetNodeIds
   * @return {Array<string>}
   * @private
   */
  normalizeTargetNodeIds(targetNodeIds) {
    if (!Array.isArray(targetNodeIds)) {
      return [];
    }

    const normalizedNodeIds = [];
    const seenNodeIds = new Set();
    for (const nodeId of targetNodeIds) {
      const normalizedNodeId = String(nodeId || '');
      if (normalizedNodeId.length === 0 || seenNodeIds.has(normalizedNodeId)) {
        continue;
      }
      seenNodeIds.add(normalizedNodeId);
      normalizedNodeIds.push(normalizedNodeId);
    }

    return normalizedNodeIds;
  }

  /**
   * Capture the canonical topology snapshot for one managed split attempt.
   * The workflow reuses this persisted context for admission and child
   * provisioning instead of re-resolving targets mid-attempt.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  captureManagedSplitTopologySnapshot(options = {}) {
    const requiredReplicaCount =
      Number.isInteger(options.requiredReplicaCount) &&
      options.requiredReplicaCount > 0 ?
        options.requiredReplicaCount :
        1;
    const provisionTargetDiagnostics =
      this.resolveProvisionTargetNodeDiagnostics(requiredReplicaCount);
    return {
      ...(options.baseSnapshot || {}),
      capturedAt: new Date(this.nowFn()).toISOString(),
      sourceLeaderNodeId:
        options.partitionInfo?.leader_node_id ||
        options.partitionInfo?.leaderNodeId ||
        null,
      activePartitionVersion:
        options.tableInfo?.active_partition_version ||
        options.tableInfo?.activePartitionVersion ||
        null,
      targetPartitionVersion: options.targetVersion,
      requiredReplicaCount,
      sourceRoutableNodeIds: this.normalizeTargetNodeIds(
        options.sourceRoutableNodeIds,
      ),
      discoveredTargetNodeIds: this.normalizeTargetNodeIds(
        options.discoveredTargetNodeIds,
      ),
      candidateTargetNodeIds: this.normalizeTargetNodeIds(
        options.candidateTargetNodeIds,
      ),
      provisionTargetDiagnostics,
    };
  }

  /**
   * Estimate bytes for split admission using the canonical storage
   * accounting model when it is available.
   * @param {Object} partitionInfo
   * @return {number}
   * @private
   */
  estimateSplitAdmissionBytes(partitionInfo) {
    const sizeBytes = Number(
      partitionInfo?.size_bytes ?? partitionInfo?.sizeBytes,
    );
    const normalizedSizeBytes =
      Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
    const accountingService =
      this.rebalanceCoordinator?.storageAccountingService || null;

    if (
      accountingService &&
      typeof accountingService.estimateReplicaBytes === 'function'
    ) {
      const splitAmplificationFactor =
        ConfigurationManager.getInstance().get(
          STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR,
        ) || STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR;
      return accountingService.estimateReplicaBytes({
        entityType: SERVICE_TYPE.PARTITION,
        sizeBytes: normalizedSizeBytes,
        amplificationFactor: splitAmplificationFactor,
      });
    }

    return Math.max(1, Math.ceil(normalizedSizeBytes));
  }

  /**
   * Calculate the minimum majority-sized cohort required for a routable Raft
   * partition during split bootstrap.
   * @param {number} replicaCount
   * @return {number}
   * @private
   */
  calculateQuorumReplicaCount(replicaCount) {
    const normalizedReplicaCount =
      Number.isInteger(replicaCount) && replicaCount > 0 ? replicaCount : 1;
    return Math.floor(normalizedReplicaCount / 2) + 1;
  }

  /**
   * Get active node IDs from local system cache.
   * Prefers strict readiness and uses degraded service-backed fallback only
   * when strict candidates are insufficient for the requested cohort size.
   * @param {number} requestedReplicaCount
   * @return {Array<string>}
   * @private
   */
  getActiveNodeIdsFromCache(requestedReplicaCount) {
    return this.resolveProvisionTargetNodeDiagnostics(requestedReplicaCount)
      .selectedNodeIds;
  }

  /**
   * Create one control-plane timeout budget.
   * @param {number} configuredBudgetMs
   * @return {Object}
   * @private
   */
  createControlPlaneTimeoutBudget(configuredBudgetMs) {
    return this.controlPlaneTimeoutPolicy.createTopLevelBudget({
      configuredBudgetMs,
    });
  }

  /**
   * Allocate one nested timeout budget from the remaining deadline.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  allocateControlPlaneTimeoutBudget(options = {}) {
    return this.controlPlaneTimeoutPolicy.allocateOrThrow({
      timeoutBudget: options.timeoutBudget || null,
      requestedBudgetMs: options.requestedBudgetMs,
      minimumBudgetMs:
        options.minimumBudgetMs ||
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      classification: options.classification,
      nestedOperation: options.nestedOperation,
      timeoutError: options.timeoutError,
    });
  }

  /**
   * Wait for a condition with bounded timeout.
   * @param {Function} predicate - Condition callback.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @param {number} intervalMs - Poll interval in milliseconds.
   * @param {string} timeoutError - Timeout error message.
   * @return {Promise<void>}
   * @private
   */
  async waitForCondition(
    predicate,
    timeoutMs,
    intervalMs,
    timeoutError,
    timeoutOptions = {},
  ) {
    if (await predicate()) {
      return;
    }

    const effectiveBudget = timeoutOptions?.timeoutBudget ?
      this.allocateControlPlaneTimeoutBudget({
        timeoutBudget: timeoutOptions.timeoutBudget,
        requestedBudgetMs: timeoutMs,
        minimumBudgetMs:
            timeoutOptions.minimumBudgetMs ||
            TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        classification:
            timeoutOptions.classification ||
            TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
        nestedOperation:
            timeoutOptions.nestedOperation || 'wait_for_condition',
        timeoutError,
      }) :
      this.createControlPlaneTimeoutBudget(timeoutMs);

    while (true) {
      if (await predicate()) {
        return;
      }
      const remainingMs = getRemainingBudgetMs(effectiveBudget, {
        now: this.nowFn,
      });
      if (remainingMs <= 0) {
        break;
      }
      await this.sleep(Math.min(intervalMs, remainingMs));
    }

    if (await predicate()) {
      return;
    }
    throw createTimeoutBudgetError({
      message: timeoutError,
      budget: effectiveBudget,
      classification:
        timeoutOptions.classification ||
        TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      nestedOperation: timeoutOptions.nestedOperation || 'wait_for_condition',
      now: this.nowFn,
    });
  }

  /**
   * Delay helper for provisioning polling loops.
   * @param {number} ms - Delay in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute a SELECT statement.
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSelect(
    ast,
    params,
    sessionId,
    queryOptions = {},
    rawSql = null,
  ) {
    // FROM-less SELECT (e.g., SELECT 1, SELECT 1+1) — route to any
    // available partition and let SQLite evaluate the expression.
    if (!ast.from) {
      return this.executeFromlessSelect(ast, params, sessionId);
    }

    const tableName = ast.from.name;
    const tableInfo = this.getTableInfo(tableName);
    const dualWriteMode = this.isDualWriteModeActiveForTable(tableInfo);
    const authoritativeLocalResult =
      await this.tryExecuteAuthoritativeSystemTableSelect(
        tableName,
        ast,
        rawSql,
        params,
        queryOptions,
      );
    if (authoritativeLocalResult) {
      return authoritativeLocalResult;
    }

    const planningStartTimeMs = Date.now();
    const distributedPlan = this.distributedQueryPlanner.planSelect(
      ast,
      params,
      {sessionId},
    );
    const planningDurationMs = Date.now() - planningStartTimeMs;
    const rootAlias = ast.from.alias || tableName;
    const rootPlan =
      distributedPlan.tablePlans.get(rootAlias) ||
      distributedPlan.tablePlans.get(tableName) ||
      null;

    if (!rootPlan || rootPlan.partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    const partitionIds = rootPlan.partitions;

    this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS_SELECT, {
      tableName,
      totalPartitions: partitionIds.length,
      targetPartitions: partitionIds.length,
      sessionId,
    });

    const preferLeader = this.isSystemTable(tableName);
    for (const join of ast.joins || []) {
      const joinTableName = join.table?.name;
      if (!joinTableName) {
        continue;
      }
      const joinAlias = join.table.alias || joinTableName;
      const joinPlan =
        distributedPlan.tablePlans.get(joinAlias) ||
        distributedPlan.tablePlans.get(joinTableName) ||
        null;
      if (!joinPlan || joinPlan.partitions.length === 0) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${joinTableName}`,
          errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
        };
      }
    }

    // Execute on resolved partitions
    const executionStartTimeMs = Date.now();
    const deliveryPriority = this.resolveRoutedDeliveryPriority(
      tableName,
      queryOptions.deliveryPriority,
    );
    const result = await this.queryExecutor.executeSelect(
      ast,
      partitionIds,
      params,
      {
        preferLeader,
        deliveryPriority,
        distributedPlan,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
        timeoutMs: queryOptions.timeoutMs,
        cancellationToken: queryOptions.cancellationToken || null,
      },
    );
    const executionDurationMs = Date.now() - executionStartTimeMs;

    return {
      ...result,
      tableName,
      dualWriteMode,
      distributedPlan,
      distributedDiagnostics: distributedPlan.diagnostics,
      distributedMetrics: {
        planningDurationMs,
        executionDurationMs,
        fanout: result.distributedMetrics?.fanout || null,
        mergeDurationMs: result.distributedMetrics?.mergeDurationMs || 0,
      },
    };
  }

  /**
   * Prefer node-local authoritative reads for single-table system-table
   * selects when a local partition replica is available. This avoids routing
   * hot control-plane reads back through the cluster under pressure.
   * @param {string} tableName
   * @param {Object} ast
   * @param {string|null} rawSql
   * @param {Array<*>} params
   * @param {Object} queryOptions
   * @return {Promise<Object|null>}
   * @private
   */
  async tryExecuteAuthoritativeSystemTableSelect(
    tableName,
    ast,
    rawSql,
    params,
    queryOptions = {},
  ) {
    const authoritativeControlPlaneView =
      this.getAuthoritativeControlPlaneView();
    if (
      !rawSql ||
      !this.isSystemTable(tableName) ||
      !authoritativeControlPlaneView ||
      (Array.isArray(ast?.joins) && ast.joins.length > 0)
    ) {
      return null;
    }

    const confirmEmptyLocalReadWithOwnerRpc =
      this.shouldConfirmEmptyAuthoritativeSystemTableRead(tableName, ast);
    const localResult = await authoritativeControlPlaneView.readRows(
      tableName,
      rawSql,
      params,
      {
        allowSqlFallback: false,
        queryTimeoutMs: queryOptions?.timeoutMs,
        confirmEmptyLocalReadWithOwnerRpc,
        replicaFallbackConsistency:
          LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
      },
    );
    if (!localResult?.success) {
      return null;
    }

    const partitions = this.getTablePartitions(tableName)
      .map((partition) => partition?.partition_id)
      .filter((partitionId) => typeof partitionId === 'string');

    return {
      ...localResult,
      partitions,
      tableName,
      distributedPlan: null,
      distributedDiagnostics: null,
      distributedMetrics: {
        planningDurationMs: 0,
        executionDurationMs: 0,
        fanout: partitions.length,
        mergeDurationMs: 0,
      },
    };
  }

  /**
   * Determine whether one system-table read should confirm empty local rows
   * through the authoritative owner lane before accepting the result.
   * @param {string} tableName
   * @param {Object} ast
   * @return {boolean}
   * @private
   */
  shouldConfirmEmptyAuthoritativeSystemTableRead(tableName, ast) {
    const primaryKeyColumns = this.getSystemTablePrimaryKeyColumns(tableName);
    if (primaryKeyColumns.length !== 1) {
      return false;
    }
    const primaryKeyColumn = primaryKeyColumns[0];
    const tableAlias = ast?.from?.alias || null;
    const whereClause = ast?.where || null;
    if (!whereClause || typeof whereClause !== 'object') {
      return false;
    }
    if (whereClause.type === 'binary' && whereClause.operator === '=') {
      return (
        this.isSystemTablePrimaryKeyColumnReference(
          whereClause.left,
          tableName,
          tableAlias,
          primaryKeyColumn,
        ) && this.isBoundSystemTableLookupValue(whereClause.right)
      );
    }
    if (whereClause.type === 'in' && whereClause.negated !== true) {
      return (
        this.isSystemTablePrimaryKeyColumnReference(
          whereClause.expression,
          tableName,
          tableAlias,
          primaryKeyColumn,
        ) &&
        Array.isArray(whereClause.values) &&
        whereClause.values.length > 0 &&
        whereClause.values.every((value) =>
          this.isBoundSystemTableLookupValue(value),
        )
      );
    }
    return false;
  }

  /**
   * Resolve primary-key columns from the canonical system-table schema.
   * @param {string} tableName
   * @return {string[]}
   * @private
   */
  getSystemTablePrimaryKeyColumns(tableName) {
    const schema = getSchemaByTableName(tableName);
    if (!schema) {
      return [];
    }
    if (Array.isArray(schema.primaryKey) && schema.primaryKey.length > 0) {
      return schema.primaryKey.filter(
        (columnName) => typeof columnName === 'string' && columnName.length > 0,
      );
    }
    if (!Array.isArray(schema.columns)) {
      return [];
    }
    return schema.columns
      .filter((column) => column?.primaryKey === true)
      .map((column) => column.name)
      .filter(
        (columnName) => typeof columnName === 'string' && columnName.length > 0,
      );
  }

  /**
   * Check whether one lookup expression is a literal or a bound parameter.
   * @param {Object|null} expression
   * @return {boolean}
   * @private
   */
  isBoundSystemTableLookupValue(expression) {
    return expression?.type === 'literal' || expression?.type === 'parameter';
  }

  /**
   * Check whether one expression references the expected system-table primary
   * key column.
   * @param {Object|null} expression
   * @param {string} tableName
   * @param {string|null} tableAlias
   * @param {string} primaryKeyColumn
   * @return {boolean}
   * @private
   */
  isSystemTablePrimaryKeyColumnReference(
    expression,
    tableName,
    tableAlias,
    primaryKeyColumn,
  ) {
    if (!expression || expression.type !== 'column_ref') {
      return false;
    }
    if (expression.column !== primaryKeyColumn) {
      return false;
    }
    return (
      expression.table === null ||
      expression.table === undefined ||
      expression.table === tableName ||
      expression.table === tableAlias
    );
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      now: this.nowFn,
    });
    return this.authoritativeControlPlaneView;
  }

  /**
   * Execute a SELECT without a FROM clause (e.g., SELECT 1, SELECT 1+1).
   * Routes to any available partition and lets SQLite evaluate the
   * expression directly.
   * @param {Object} ast - Parsed SELECT AST with null from.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeFromlessSelect(ast, params, _sessionId) {
    const allPartitions = this.systemCache?.getAll?.(TABLES.PARTITIONS) || [];
    if (allPartitions.length === 0) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_PARTITIONS_FOR_TABLE,
        errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND,
      };
    }

    const targetPartitionId = allPartitions[0].partition_id;
    const cols = ast.columns.map((col) =>
      this.queryExecutor.buildColumnSQL(col),
    );
    const sql = `SELECT ${cols.join(', ')}`;

    const results = await this.queryExecutor.executeOnPartitions(
      [targetPartitionId],
      sql,
      params,
      null,
      true,
      false,
      false,
      {
        routingReadinessDimension: this.defaultRoutingReadinessDimension,
      },
    );

    const first = results[0];
    if (!first || !first.success) {
      return {
        success: false,
        error: first?.error || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED,
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    }

    return {
      success: true,
      rows: first.rows || [],
      count: first.rows?.length || 0,
      partitions: [targetPartitionId],
      tableName: null,
      distributedPlan: null,
      distributedDiagnostics: null,
      distributedMetrics: {
        planningDurationMs: 0,
        executionDurationMs: 0,
        fanout: null,
        mergeDurationMs: 0,
      },
    };
  }

  isRetryableControlPlaneMutationFailure(error) {
    if (isRetryableControlPlaneError(error)) {
      return true;
    }
    const timeoutClassification =
      error?.timeoutClassification &&
      typeof error.timeoutClassification === 'object' ?
        error.timeoutClassification :
        null;
    const classifications = [
      timeoutClassification?.classification,
      timeoutClassification?.originalClassification,
    ];
    return classifications.some((classification) => {
      return (
        typeof classification === 'string' &&
        RETRYABLE_CONTROL_PLANE_TIMEOUT_CLASSIFICATIONS.has(classification)
      );
    });
  }

  /**
   * Return one canonical deferred result when a retryable control-plane table
   * lifecycle mutation times out while authority establishment is still
   * pending.
   * @param {string|null} tableName
   * @param {*} error
   * @param {Object} [queryOptions={}]
   * @return {Object|null}
   * @private
   */
}

export {SQLQueryEngineSegment6};
