import { CDC_INTEGRATION_SERVICE_SHARED } from './cdc-integration-service-shared.js';
import { CDCIntegrationServiceSegment3 } from './cdc-integration-service-segment-3.js';

const {
  ADDRESS,
  AUTHORITATIVE_FALLBACK_OUTCOME,
  AUTHORITATIVE_FALLBACK_PHASE,
  AUTHORITATIVE_FALLBACK_RECENT_LIMIT,
  AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS,
  AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS,
  AUTHORITATIVE_FALLBACK_WINDOW_MS,
  AUTHORITATIVE_READ_SOURCE,
  AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES,
  CDCEventHandler,
  CDCOperationType,
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_EPOCH_CONFIG_KEY,
  CDC_ERROR_MSG,
  CDC_EVENT,
  CDC_INTEGRATION_SERVICE_ERROR,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CDC_LOG_MSG,
  CDC_OPERATION,
  CDC_OPERATION_LABEL,
  CDC_OWNER_HANDOFF_CLOSED_FRAGMENT,
  CDC_OWNER_HANDOFF_CONNECTION_TO_NODE_FRAGMENT,
  CDC_OWNER_HANDOFF_ROUTING_ERROR_FRAGMENTS,
  CDC_PRIMARY_KEY,
  CDC_RETRY,
  CDC_SESSION,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  CDC_SQL,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
  CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND,
  COLUMN,
  CONTROL_PLANE_MUTATION_READINESS_ERROR,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  ConfigurationManager,
  ENTITY_TYPE,
  ENTRYPOINT_DEFAULT,
  EPOCH_CONFIG_KEY,
  ERRORS,
  EventEmitter,
  HLCClockService,
  INITIAL_PARTITION_IDS,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  METRICS_LOG_TAG,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PROTOCOL,
  PressureGovernor,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  READ_MODEL_DIVERGENCE_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQL,
  SQL_RECONCILIATION_REASON,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_VISIBILITY_STATE,
  TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES,
  TABLE_WRITE_METRIC_SUPPRESSED_TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIME_MS,
  TYPEOF,
  VALID_SYSTEM_TABLES,
  WRITE_ROUTER_MODE,
  annotateSystemTableMutationError,
  buildCDCNodeJoinedResult,
  buildDivergenceEvent,
  buildOwnerContractOutcome,
  buildPendingVisibilityTimeoutResult,
  buildPressureAdmissionFailure,
  buildSystemTableMutationError,
  buildSystemTableVisibilityResult,
  canonicalizeSystemTableRow,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
  createTimeoutBudget,
  createTimeoutBudgetError,
  delay,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  getRemainingBudgetMs,
  getSchemaByTableName,
  getSystemCachePrimaryKeyFieldOrFallback,
  hasControlPlaneMutationRoutingGapFailureSignature,
  hasSystemTableOwnerHandoffFailureSignature,
  isCacheVisibilityTimeoutError,
  isRetryableControlPlaneError,
  isSystemTableOwnerHandoffFailure,
  isTableInternalCachePropagationEnabled,
  logSystemTableWriteFailure,
  materializeNormalizedDefaultValue,
  normalizeAuthoritativeFallbackOutcome,
  normalizeAuthoritativeFallbackPhase,
  normalizeControlPlaneSystemTableVisibilityState,
  normalizeDeliveryPriority,
  normalizeLocalQueryTransportReadiness,
  normalizeSystemTableVisibilityResult,
  normalizeSystemTableVisibilityState,
  normalizeSystemTableWriteMode,
  normalizeSystemWriteRecoveryCandidateSelectionKeyValue,
  resolveAuthoritativeFallbackOutcome,
  resolveNodeWebSocketAddress,
  resolveSystemTableMutationDeliveryPriority,
  resolveSystemTableOwnerHandoffFailureTableName,
  resolveSystemTableVisibilityContractOutcome,
  shouldEmitTableWriteMetric,
  shouldLogTableWriteFailure,
  sortMutationKeyObject,
  stableSerializeMutationKey,
  uuidv4,
} = CDC_INTEGRATION_SERVICE_SHARED;

class CDCIntegrationService extends CDCIntegrationServiceSegment3 {
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    this.validateTableName(tableName);
    this.validateData(whereClause, CDC_OPERATION_LABEL.DELETE_WHERE);
    const idField = this.getPrimaryKeyField(tableName);
    const id = whereClause[idField] || whereClause[CDC_PRIMARY_KEY.FALLBACK];
    if (!id) {
      throw new Error(`${CDC_ERROR_MSG.DELETE_PRIMARY_KEY_PREFIX}${idField}` + `${CDC_ERROR_MSG.DELETE_PRIMARY_KEY_SUFFIX}`);
    }
    const singleFlightKey = this.buildMutationSingleFlightKey(CDC_OPERATION.DELETE, tableName, id, {
      whereClause
    }, options);
    this.logger.debug(CDC_LOG_MSG.DELETING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId
    });
    return this.runCoalescedMutation(singleFlightKey, async () => {
      try {
        const {
          whereStr,
          values
        } = this.buildWhereParts(whereClause);
        const sql = `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereStr}`;
        const result = await this.executeSQL(sql, values, {
          queryTimeoutMs: options?.queryTimeoutMs,
          cancellationToken: options?.cancellationToken || null,
          sessionId: options?.sessionId,
          disableSystemWriteSession: options?.disableSystemWriteSession,
          coalescingKey: options?.coalescingKey,
          recoveryCandidateSelectionKey:
            options?.recoveryCandidateSelectionKey,
          routingReadinessDimension: options?.routingReadinessDimension,
          workClass: options?.workClass,
          allowPressureDefer: options?.allowPressureDefer,
          pressureRetryAfterMs: options?.pressureRetryAfterMs,
          deliveryPriority: options?.deliveryPriority
        });
        if (!result.success) {
          throw buildSystemTableMutationError(result, CDC_ERROR_MSG.DELETE_FAILED);
        }
        let visibilityResult = buildSystemTableVisibilityResult();
        if (typeof result.affectedRows !== TYPEOF.NUMBER || result.affectedRows > NUM.ZERO) {
          visibilityResult = normalizeSystemTableVisibilityResult(await this.waitForCacheUpdate(tableName, id, false, {
            allowPendingVisibility: options?.allowPendingVisibility === true
          }));
        }
        this.stats.deletes++;
        this.logger.debug(CDC_LOG_MSG.DELETED_ROW, {
          tableName,
          id,
          success: true,
          changes: result.affectedRows
        });
        this.emit(CDC_EVENT.DELETE, {
          tableName,
          whereClause,
          id,
          result
        });
        return {
          success: true,
          operation: CDCOperationType.DELETE,
          tableName,
          whereClause,
          id,
          partitionResult: result,
          visibilityState: visibilityResult.visibilityState,
          contractState: visibilityResult.contractState,
          nextAction: visibilityResult.nextAction,
          authoritativeVisibilityConfirmed: visibilityResult.authoritativeVisibilityConfirmed,
          retryAfterMs: visibilityResult.retryAfterMs
        };
      } catch (error) {
        this.stats.failures++;
        if (shouldLogTableWriteFailure(tableName)) {
          logSystemTableWriteFailure(this, CDC_LOG_MSG.DELETE_FAILED, {
            tableName,
            id,
            error: error.message,
            nodeId: this.nodeId,
            causeId: typeof options?.causeId === TYPEOF.STRING ? options.causeId : null,
            operation: CDC_OPERATION.DELETE,
            primaryKey: {
              [idField]: id
            }
          }, error);
        }
        this.emitErrorEvent({
          operation: CDCOperationType.DELETE,
          tableName,
          whereClause,
          error: error.message
        });
        throw error;
      }
    });
  }

  /**
   * Upsert a row in a system table (insert or replace on conflict).
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to upsert (must include primary key).
   * @return {Promise<Object>} Upsert result.
   */
  async upsertSystemTableRow(tableName, data, options = {}) {
    this.validateTableName(tableName);
    this.validateData(data, CDC_OPERATION_LABEL.UPSERT);
    const upsertData = this.prepareInsertData(tableName, data, {
      generatePrimaryKey: false
    });
    const idField = this.getPrimaryKeyField(tableName);
    const id = upsertData[idField];
    if (!id) {
      throw new Error(`${CDC_ERROR_MSG.UPSERT_PRIMARY_KEY_PREFIX}${idField}` + `${CDC_ERROR_MSG.UPSERT_PRIMARY_KEY_SUFFIX}`);
    }
    const singleFlightKey = this.buildMutationSingleFlightKey(CDC_OPERATION.UPSERT, tableName, id, upsertData, options);
    this.logger.debug(CDC_LOG_MSG.UPSERTING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId
    });
    return this.runCoalescedMutation(singleFlightKey, async () => {
      try {
        const {
          columns,
          placeholders,
          values
        } = this.buildInsertParts(upsertData);
        // SQLite INSERT OR REPLACE
        const sql = `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} (${columns}) ` + `${SQL.VALUES} (${placeholders})`;
        const result = await this.executeSQL(sql, values, {
          queryTimeoutMs: options?.queryTimeoutMs,
          cancellationToken: options?.cancellationToken || null,
          sessionId: options?.sessionId,
          disableSystemWriteSession: options?.disableSystemWriteSession,
          coalescingKey: options?.coalescingKey,
          recoveryCandidateSelectionKey:
            options?.recoveryCandidateSelectionKey,
          routingReadinessDimension: options?.routingReadinessDimension,
          workClass: options?.workClass,
          allowPressureDefer: options?.allowPressureDefer,
          pressureRetryAfterMs: options?.pressureRetryAfterMs,
          deliveryPriority: options?.deliveryPriority
        });
        if (!result.success) {
          throw buildSystemTableMutationError(result, CDC_ERROR_MSG.UPSERT_FAILED);
        }
        let visibilityResult = buildSystemTableVisibilityResult();
        if (options?.skipCacheWait !== true) {
          visibilityResult = normalizeSystemTableVisibilityResult(await this.waitForCacheUpdate(tableName, id, true, {
            allowPendingVisibility: options?.allowPendingVisibility === true
          }));
        }
        this.stats.updates++;
        this.logger.debug(CDC_LOG_MSG.UPSERTED_ROW, {
          tableName,
          id,
          success: true
        });
        this.emit(CDC_EVENT.UPSERT, {
          tableName,
          data: upsertData,
          result
        });
        return {
          success: true,
          operation: CDCOperationType.UPSERT,
          tableName,
          data: upsertData,
          partitionResult: result,
          visibilityState: visibilityResult.visibilityState,
          contractState: visibilityResult.contractState,
          nextAction: visibilityResult.nextAction,
          authoritativeVisibilityConfirmed: visibilityResult.authoritativeVisibilityConfirmed,
          retryAfterMs: visibilityResult.retryAfterMs
        };
      } catch (error) {
        this.stats.failures++;
        if (shouldLogTableWriteFailure(tableName)) {
          logSystemTableWriteFailure(this, CDC_LOG_MSG.UPSERT_FAILED, {
            tableName,
            id,
            error: error.message,
            nodeId: this.nodeId,
            causeId: typeof options?.causeId === TYPEOF.STRING ? options.causeId : null,
            operation: CDC_OPERATION.UPSERT,
            primaryKey: {
              [idField]: id
            }
          }, error);
        }
        this.emitErrorEvent({
          operation: CDCOperationType.UPSERT,
          tableName,
          data: upsertData,
          error: error.message
        });
        throw error;
      }
    });
  }

  /**
   * Get the primary key field name for a system table.
   * @param {string} tableName - System table name.
   * @return {string} Primary key field name.
   * @private
   */
  getPrimaryKeyField(tableName) {
    return getSystemCachePrimaryKeyFieldOrFallback(tableName, CDC_PRIMARY_KEY.FALLBACK);
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    return {
      ...this.stats,
      total: this.stats.inserts + this.stats.updates + this.stats.deletes
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {
      ...CDC_STATS_DEFAULT
    };
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Set the epoch manager reference for CDC epoch change handling.
   * @param {AssignmentEpochManager} epochManager - The epoch manager instance.
   */
  setEpochManager(epochManager) {
    if (!epochManager) {
      throw new Error(CDC_ERROR_MSG.EPOCH_MANAGER_REQUIRED);
    }
    this.epochManager = epochManager;
    this.logger.debug(CDC_LOG_MSG.EPOCH_MANAGER_SET, {
      nodeId: this.nodeId
    });
  }

  /**
   * Handle epoch change CDC event.
   * Listens for epoch changes in the config table and updates the local
   * AssignmentEpochManager.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be config).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.config_key - The config key.
   * @param {string} cdcEvent.data.config_value - The config value (epoch JSON).
   * @return {{applied: boolean, epoch?: number, error?: string}}
   *   Result object indicating if epoch was applied.
   */
  handleEpochChangeCDC(cdcEvent) {
    return this.ensureEventHandler().handleEpochChangeCDC(cdcEvent);
  }

  /**
   * Set the rebalancer reference for node state change handling.
   * @param {Object} rebalancer - The rebalancer instance (must have onNodeStateChange method).
   */
  setRebalancer(rebalancer) {
    if (!rebalancer) {
      throw new Error(CDC_ERROR_MSG.REBALANCER_REQUIRED);
    }
    this.rebalancer = rebalancer;
    this.logger.debug(CDC_LOG_MSG.REBALANCER_SET, {
      nodeId: this.nodeId
    });
  }

  /**
   * Handle node state change CDC event.
   * Listens for node state changes in the nodes table and triggers
   * the rebalancer when appropriate.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.status - The node status/state.
   * @return {{processed: boolean, nodeId?: string, oldState?: string,
   *   newState?: string, error?: string}}
   *   Result object indicating if the event was processed.
   */
  handleNodeStateCDC(cdcEvent) {
    return this.ensureEventHandler().handleNodeStateCDC(cdcEvent);
  }

  /**
   * Set the message router reference for mesh connectivity.
   * When set, the CDC service will establish connections to new nodes
   * when they are added to the nodes table via CDC events.
   * @param {Object} messageRouter - The message router instance.
   */
  setMessageRouter(messageRouter) {
    if (!messageRouter) {
      throw new Error(CDC_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }
    this.messageRouter = messageRouter;
    this.logger.debug(CDC_LOG_MSG.MESSAGE_ROUTER_SET, {
      nodeId: this.nodeId
    });
  }

  /**
   * Handle node joined CDC event for mesh connectivity.
   * When a new node is added to the nodes table, this method establishes
   * an outbound WebSocket connection to that node, ensuring full mesh
   * connectivity across the cluster.
   *
   * All nodes are equal peers - no special treatment for any node.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.node_address - The node address.
   * @return {Promise<{processed: boolean, nodeId?: string, connected?: boolean,
   *   error?: string}>} Result object indicating if connection was established.
   */
  async handleNodeJoinedCDC(cdcEvent) {
    // Validate cdcEvent
    if (!cdcEvent || typeof cdcEvent !== TYPEOF.OBJECT) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.INVALID_EVENT
      };
    }

    // Check if this is a nodes table INSERT event
    const tableName = cdcEvent.tableName;
    if (tableName !== SYSTEM_TABLE_NAME.NODES) {
      return {
        processed: false,
        error: `${CDC_ERROR_MSG.NOT_NODES_TABLE_PREFIX}'${tableName}'`
      };
    }

    // Only process INSERT operations (new nodes joining)
    const operation = cdcEvent.operation;
    if (operation !== CDC_OPERATION.INSERT) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.NOT_INSERT_OPERATION
      };
    }

    // Extract node data
    const targetNodeId = cdcEvent.data?.[COLUMN.NODE_ID];
    const nodeAddress = cdcEvent.data?.[COLUMN.NODE_ADDRESS];
    if (!targetNodeId) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.NODE_ID_MISSING
      };
    }

    // Skip if this is our own node
    if (targetNodeId === this.nodeId) {
      this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_SELF, {
        nodeId: this.nodeId,
        targetNodeId
      });
      return buildCDCNodeJoinedResult({
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: CDC_SKIP_REASON.SELF
      });
    }

    // Skip if no message router is set
    if (!this.messageRouter) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.MESSAGE_ROUTER_NOT_SET
      };
    }
    const connectionState = typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION ? this.messageRouter.getConnectionState(targetNodeId) : this.messageRouter.nodeConnections?.get(targetNodeId)?.state || null;
    if (connectionState === STATE.CONNECTED) {
      this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_CONNECTED, {
        nodeId: this.nodeId,
        targetNodeId
      });
      return buildCDCNodeJoinedResult({
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: CDC_SKIP_REASON.ALREADY_CONNECTED
      });
    }
    const wsAddressResolution = resolveNodeWebSocketAddress({
      targetNodeId,
      systemTableCache: this.systemTableCache
    });
    if (wsAddressResolution.state !== NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED) {
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: this.nodeId,
        targetNodeId,
        nodeAddress,
        error: CDC_INTEGRATION_SERVICE_ERROR.MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS
      });
      return buildCDCNodeJoinedResult({
        processed: false,
        nodeId: targetNodeId,
        error: CDC_INTEGRATION_SERVICE_ERROR.MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS
      });
    }
    const wsAddress = wsAddressResolution.address;
    this.logger.info(CDC_LOG_MSG.NEW_NODE_DETECTED, {
      nodeId: this.nodeId,
      targetNodeId,
      wsAddress
    });

    // Establish connection to the new node
    try {
      await this.messageRouter.connectToNode(targetNodeId, wsAddress);
      this.logger.info(CDC_LOG_MSG.NEW_NODE_CONNECTED, {
        nodeId: this.nodeId,
        targetNodeId,
        wsAddress
      });

      // Emit nodeJoined event
      this.emit(CDC_EVENT.NODE_JOINED, {
        nodeId: targetNodeId,
        nodeAddress,
        wsAddress,
        timestamp: Date.now(),
        source: CDC_SOURCE.CDC
      });
      return buildCDCNodeJoinedResult({
        processed: true,
        nodeId: targetNodeId,
        connected: true,
        wsAddress
      });
    } catch (connectError) {
      // Log but don't fail - the node might be temporarily unavailable
      // Raft will handle retries and leader election
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: this.nodeId,
        targetNodeId,
        wsAddress,
        error: connectError.message
      });
      return buildCDCNodeJoinedResult({
        processed: false,
        nodeId: targetNodeId,
        error: connectError.message
      });
    }
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   * @private
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    if (!nodeAddress || typeof nodeAddress !== TYPEOF.STRING) {
      return null;
    }

    // Parse hostname:port format
    const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
    if (colonIndex === NUM.NEGATIVE_ONE || colonIndex === NUM.ZERO) {
      // No colon found or colon at start (empty hostname)
      return null;
    }
    const hostname = nodeAddress.substring(NUM.ZERO, colonIndex);
    if (!hostname || hostname.length === NUM.ZERO) {
      return null;
    }
    const portStr = nodeAddress.substring(colonIndex + NUM.ONE);
    const restPort = parseInt(portStr, NUM.TEN);
    if (!Number.isFinite(restPort) || restPort <= NUM.ZERO) {
      return null;
    }

    // WebSocket port = REST port + WS_PORT_OFFSET
    const wsPort = restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
    return `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`;
  }
}
export { CDCIntegrationService, CDCOperationType, EPOCH_CONFIG_KEY, LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY, VALID_SYSTEM_TABLES };

