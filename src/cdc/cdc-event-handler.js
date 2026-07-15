/**
 * CDC Event Handler - Handles CDC events for system state changes.
 *
 * This module provides CDC event handling logic extracted from CDCIntegrationService.
 * It handles epoch changes, node state changes, and node join events.
 *
 * Requirements: 1.4, 1.8
 *
 * @module cdc/cdc-event-handler
 */

import {COLUMN, CDC_OPERATION, STATE} from
  '../constants/index.js';
import {METRICS_LOG_TAG} from '../constants/index.js';
import {deriveTransportWebSocketAddress} from
  '../config/listener-port-model.js';
import {LoggingService} from '../logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {AssignmentEpoch} from '../rebalancer/assignment-epoch.js';
import {
  CDC_EPOCH_CONFIG_KEY,
  CDC_ERROR_MSG,
  CDC_EVENT,
  CDC_LOG_MSG,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  CDC_SUBSYSTEM,
} from './cdc-constants.js';
import {
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  resolveNodeWebSocketAddress,
} from
  '../transport/node-address-resolution.js';

/**
 * CDCEventHandler processes CDC events for system state changes.
 *
 * This class is responsible for:
 * - Handling epoch change events from the config table
 * - Handling node state change events from the nodes table
 * - Handling node join events for mesh connectivity
 *
 * @interface
 *
 * @description
 * CDCEventHandler provides event handling logic that was previously embedded
 * in CDCIntegrationService. It works with an EventHandlerContext to access
 * epoch manager, rebalancer, message router, and emit events.
 *
 * Requirements: 1.4, 1.8
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.nodeId - Current node ID (REQUIRED)
 * @param {Object} options.eventContext - Context for event handling (REQUIRED)
 *
 * @example
 * const handler = new CDCEventHandler({
 *   nodeId: 'node-1',
 *   eventContext: context,
 * });
 *
 * const result = handler.handleEpochChangeCDC(cdcEvent);
 */
const CONSTRUCTOR_ERROR_NODE_ID =
  'CDCEventHandler requires nodeId';
const CONSTRUCTOR_ERROR_EVENT_CONTEXT =
  'CDCEventHandler requires eventContext';
const CDC_EVENT_HANDLER_ERROR = Object.freeze({
  MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS:
    'Missing canonical node_endpoints websocket address',
});

function buildNodeStateCDCResult(options = {}) {
  const result = {
    processed: options.processed !== false,
    nodeId: options.nodeId,
    oldState: Object.hasOwn(options, 'oldState') ? options.oldState : null,
    newState: Object.hasOwn(options, 'newState') ? options.newState : null,
    stateChanged: options.stateChanged === true,
    staleEventIgnored: options.staleEventIgnored === true,
  };
  if (Number.isFinite(options.eventTimestamp)) {
    result.eventTimestamp = options.eventTimestamp;
  }
  if (Number.isFinite(options.lastTimestamp)) {
    result.lastTimestamp = options.lastTimestamp;
  }
  return result;
}

function buildNodeJoinedCDCResult(options = {}) {
  const result = {
    processed: options.processed === true,
    nodeId: options.nodeId,
    connected: options.connected === true,
    skipped: options.skipped === true,
  };
  if (options.reason) {
    result.reason = options.reason;
  }
  if (options.error) {
    result.error = options.error;
  }
  if (options.wsAddress) {
    result.wsAddress = options.wsAddress;
  }
  return result;
}

class CDCEventHandler {
  /**
   * Create a new CDCEventHandler instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.eventContext - Context for event handling.
   */
  constructor(options = {}) {
    if (!options.nodeId) {
      throw new Error(CONSTRUCTOR_ERROR_NODE_ID);
    }
    if (!options.eventContext) {
      throw new Error(CONSTRUCTOR_ERROR_EVENT_CONTEXT);
    }

    this.nodeId = options.nodeId;
    this.eventContext = options.eventContext;

    // Track previous node states for detecting changes
    this._nodeStates = new Map();
    this._nodeStateEventTimestamps = new Map();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CDC_SUBSYSTEM.INTEGRATION) : console;
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
    const handlerStartMs = Date.now();

    // Validate cdcEvent
    if (!cdcEvent || typeof cdcEvent !== 'object') {
      return {
        applied: false,
        error: CDC_ERROR_MSG.INVALID_EVENT,
      };
    }

    // Check if this is an epoch change event
    const configKey = cdcEvent.data?.[COLUMN.CONFIG_KEY];
    if (configKey !== CDC_EPOCH_CONFIG_KEY) {
      return {
        applied: false,
        error: `${CDC_ERROR_MSG.NOT_EPOCH_CHANGE_PREFIX}'${configKey}'`,
      };
    }

    // Check if epoch manager is set
    const epochManager = this.eventContext.epochManager;
    if (!epochManager) {
      this.logger.warn(CDC_LOG_MSG.EPOCH_MANAGER_MISSING, {
        nodeId: this.nodeId,
      });
      return {
        applied: false,
        error: CDC_ERROR_MSG.EPOCH_MANAGER_NOT_SET,
      };
    }

    // Parse the epoch data from config_value
    let epochData;
    try {
      const configValue = cdcEvent.data?.[COLUMN.CONFIG_VALUE];
      if (typeof configValue === 'string') {
        epochData = JSON.parse(configValue);
      } else if (
        typeof configValue === 'object' && configValue !== null
      ) {
        epochData = configValue;
      } else {
        throw new Error(CDC_ERROR_MSG.EPOCH_DATA_INVALID);
      }
    } catch (parseError) {
      this.logger.error(CDC_LOG_MSG.EPOCH_PARSE_FAILED, {
        nodeId: this.nodeId,
        error: parseError.message,
      });
      return {
        applied: false,
        error: `${CDC_ERROR_MSG.PARSE_EPOCH_PREFIX}${parseError.message}`,
      };
    }

    // Create AssignmentEpoch from the parsed data
    let epoch;
    try {
      epoch = AssignmentEpoch.fromObject(epochData);
    } catch (epochError) {
      this.logger.error(CDC_LOG_MSG.EPOCH_CREATE_FAILED, {
        nodeId: this.nodeId,
        error: epochError.message,
      });
      return {
        applied: false,
        error: `${CDC_ERROR_MSG.CREATE_EPOCH_PREFIX}${epochError.message}`,
      };
    }

    // Apply the epoch to the epoch manager
    const applied = epochManager.applyEpoch(epoch);

    if (applied) {
      this.eventContext.incrementEpochChanges();

      this.logger.info(CDC_LOG_MSG.EPOCH_APPLIED, {
        nodeId: this.nodeId,
        epoch: epoch.epoch,
        proposedBy: epoch.proposedBy,
      });

      // Emit epochChange event
      this.eventContext.emit(CDC_EVENT.EPOCH_CHANGE, {
        epoch: epoch.epoch,
        assignments: epoch.assignments,
        timestamp: epoch.timestamp,
        proposedBy: epoch.proposedBy,
        source: CDC_SOURCE.CDC,
      });
    } else {
      this.logger.debug(CDC_LOG_MSG.EPOCH_SKIPPED, {
        nodeId: this.nodeId,
        incomingEpoch: epoch.epoch,
      });
    }

    try {
      const handlerDurationMs = Date.now() - handlerStartMs;
      const metricsData = {
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        handlerDurationMs,
      };
      if (cdcEvent.timestamp != null) {
        metricsData.eventAgeMs = Date.now() - cdcEvent.timestamp;
      }
      this.logger.info(METRICS_LOG_TAG.CDC_PROPAGATION, metricsData);
    } catch (metricsErr) {
      this.logger.debug(CDC_LOG_MSG.METRICS_LOG_FAILED, {
        error: metricsErr.message,
      });
    }

    if (applied) {
      return {
        applied: true,
        epoch: epoch.epoch,
      };
    }

    return {
      applied: false,
      error: CDC_ERROR_MSG.EPOCH_NOT_APPLIED,
      epoch: epoch.epoch,
    };
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
    const handlerStartMs = Date.now();

    // Validate cdcEvent
    if (!cdcEvent || typeof cdcEvent !== 'object') {
      return {
        processed: false,
        error: CDC_ERROR_MSG.INVALID_EVENT,
      };
    }

    // Check if this is a nodes table event
    const tableName = cdcEvent.tableName;
    if (tableName !== SYSTEM_TABLE_NAME.NODES) {
      return {
        processed: false,
        error: `${CDC_ERROR_MSG.NOT_NODES_TABLE_PREFIX}'${tableName}'`,
      };
    }

    // Extract node data
    const nodeId = cdcEvent.data?.[COLUMN.NODE_ID];
    const newState = cdcEvent.data?.[COLUMN.STATUS];

    if (!nodeId) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.NODE_ID_MISSING,
      };
    }

    if (!newState) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.NODE_STATUS_MISSING,
      };
    }

    // Get the previous state for this node.
    const oldState = this._nodeStates.get(nodeId) || null;

    // Ignore stale/out-of-order node state events when a monotonic
    // timestamp is present in CDC payload.
    const eventTimestamp = this.getNodeStateEventTimestamp(cdcEvent);
    if (Number.isFinite(eventTimestamp)) {
      const lastTimestamp =
          this._nodeStateEventTimestamps.get(nodeId);
      if (
        Number.isFinite(lastTimestamp) &&
          eventTimestamp < lastTimestamp
      ) {
        this.logger.debug(CDC_LOG_MSG.NODE_STATE_UNCHANGED, {
          nodeId,
          state: oldState,
          staleEventIgnored: true,
          eventTimestamp,
          lastTimestamp,
        });
        return buildNodeStateCDCResult({
          processed: true,
          nodeId,
          oldState,
          newState: oldState,
          stateChanged: false,
          staleEventIgnored: true,
          eventTimestamp,
          lastTimestamp,
        });
      }
      this._nodeStateEventTimestamps.set(nodeId, eventTimestamp);
    }

    // Update tracked state
    this._nodeStates.set(nodeId, newState);

    // Check if state actually changed
    if (oldState === newState) {
      this.logger.debug(CDC_LOG_MSG.NODE_STATE_UNCHANGED, {
        nodeId,
        state: newState,
      });
      return buildNodeStateCDCResult({
        processed: true,
        nodeId,
        oldState,
        newState,
        stateChanged: false,
      });
    }

    // Increment stats
    this.eventContext.incrementNodeStateChanges();

    this.logger.info(CDC_LOG_MSG.NODE_STATE_DETECTED, {
      nodeId,
      oldState,
      newState,
    });

    // Emit nodeStateChange event
    this.eventContext.emit(CDC_EVENT.NODE_STATE_CHANGE, {
      nodeId,
      oldState,
      newState,
      timestamp: Date.now(),
      source: CDC_SOURCE.CDC,
    });

    // Trigger rebalancer if set
    const rebalancer = this.eventContext.rebalancer;
    if (rebalancer) {
      try {
        rebalancer.onNodeStateChange(nodeId, oldState, newState);
        this.logger.debug(CDC_LOG_MSG.REBALANCER_NOTIFIED, {
          nodeId,
          oldState,
          newState,
        });
      } catch (rebalancerError) {
        this.logger.error(CDC_LOG_MSG.REBALANCER_NOTIFY_FAILED, {
          nodeId,
          oldState,
          newState,
          error: rebalancerError.message,
        });
        throw rebalancerError;
      }
    } else {
      this.logger.debug(CDC_LOG_MSG.REBALANCER_NOT_SET, {
        nodeId,
      });
    }

    try {
      const handlerDurationMs = Date.now() - handlerStartMs;
      const metricsData = {
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        handlerDurationMs,
      };
      if (cdcEvent.timestamp != null) {
        metricsData.eventAgeMs = Date.now() - cdcEvent.timestamp;
      }
      this.logger.info(
        METRICS_LOG_TAG.CDC_PROPAGATION, metricsData,
      );
    } catch (metricsErr) {
      this.logger.debug(CDC_LOG_MSG.METRICS_LOG_FAILED, {
        error: metricsErr.message,
      });
    }

    return buildNodeStateCDCResult({
      processed: true,
      nodeId,
      oldState,
      newState,
      stateChanged: true,
    });
  }

  /**
   * Handle node joined CDC event for mesh connectivity.
   * When a new node is added to the nodes table, this method establishes
   * an outbound WebSocket connection to that node, ensuring full mesh
   * connectivity across the cluster.
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
    if (!cdcEvent || typeof cdcEvent !== 'object') {
      return {
        processed: false,
        error: CDC_ERROR_MSG.INVALID_EVENT,
      };
    }

    // Check if this is a nodes table INSERT event
    const tableName = cdcEvent.tableName;
    if (tableName !== SYSTEM_TABLE_NAME.NODES) {
      return {
        processed: false,
        error: `${CDC_ERROR_MSG.NOT_NODES_TABLE_PREFIX}'${tableName}'`,
      };
    }

    // Only process INSERT operations (new nodes joining)
    const operation = cdcEvent.operation;
    if (operation !== CDC_OPERATION.INSERT) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.NOT_INSERT_OPERATION,
      };
    }

    // Extract node data
    const targetNodeId = cdcEvent.data?.[COLUMN.NODE_ID];
    const nodeAddress = cdcEvent.data?.[COLUMN.NODE_ADDRESS];

    if (!targetNodeId) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.NODE_ID_MISSING,
      };
    }

    // Skip if this is our own node
    if (targetNodeId === this.nodeId) {
      this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_SELF, {
        nodeId: this.nodeId,
        targetNodeId,
      });
      return buildNodeJoinedCDCResult({
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: CDC_SKIP_REASON.SELF,
      });
    }

    // Skip if no message router is set
    const messageRouter = this.eventContext.messageRouter;
    if (!messageRouter) {
      return {
        processed: false,
        error: CDC_ERROR_MSG.MESSAGE_ROUTER_NOT_SET,
      };
    }

    const connectionState = this.resolveRouterConnectionState(
      messageRouter,
      targetNodeId,
    );
    if (connectionState === STATE.CONNECTED) {
      this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_CONNECTED, {
        nodeId: this.nodeId,
        targetNodeId,
      });
      return buildNodeJoinedCDCResult({
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: CDC_SKIP_REASON.ALREADY_CONNECTED,
      });
    }

    const wsAddressResolution =
      (typeof this.eventContext.resolveNodeWebSocketAddress ===
        'function' ?
        this.eventContext.resolveNodeWebSocketAddress(
          targetNodeId,
        ) :
        resolveNodeWebSocketAddress({
          targetNodeId,
          systemTableCache: this.eventContext?._service?.systemTableCache ||
            null,
        }));
    if (wsAddressResolution.state !==
        NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED) {
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: this.nodeId,
        targetNodeId,
        nodeAddress,
        error:
          CDC_EVENT_HANDLER_ERROR
            .MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS,
      });
      return buildNodeJoinedCDCResult({
        processed: false,
        nodeId: targetNodeId,
        error:
          CDC_EVENT_HANDLER_ERROR
            .MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS,
      });
    }
    const wsAddress = wsAddressResolution.address;

    this.logger.info(CDC_LOG_MSG.NEW_NODE_DETECTED, {
      nodeId: this.nodeId,
      targetNodeId,
      wsAddress,
    });

    // Establish connection to the new node asynchronously
    const connectPromise = messageRouter.connectToNode(targetNodeId, wsAddress)
      .then(() => {
        this.logger.info(CDC_LOG_MSG.NEW_NODE_CONNECTED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
        });

        // Emit nodeJoined event
        this.eventContext.emit(CDC_EVENT.NODE_JOINED, {
          nodeId: targetNodeId,
          nodeAddress,
          wsAddress,
          timestamp: Date.now(),
          source: CDC_SOURCE.CDC,
        });
        return {success: true};
      })
      .catch((connectError) => {
        // Log but don't fail - the node might be temporarily unavailable
        // Raft will handle retries and leader election
        this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
          error: connectError.message,
        });
        return {success: false, error: connectError};
      });

    const result = buildNodeJoinedCDCResult({
      processed: true,
      nodeId: targetNodeId,
      connected: true,
      wsAddress,
    });
    result.connectPromise = connectPromise;
    return result;
  }

  /**
   * Resolve connection state for one node from message router.
   * @param {Object} messageRouter - Message router instance.
   * @param {string} targetNodeId - Remote node ID.
   * @return {string|null} Connection state or null when unavailable.
   * @private
   */
  resolveRouterConnectionState(messageRouter, targetNodeId) {
    if (!messageRouter || !targetNodeId) {
      return null;
    }

    if (typeof messageRouter.getConnectionState === 'function') {
      return messageRouter.getConnectionState(targetNodeId);
    }

    const connectionEntry = messageRouter.nodeConnections?.get(targetNodeId);
    if (typeof connectionEntry === 'string') {
      return connectionEntry;
    }
    if (connectionEntry === true) {
      return STATE.CONNECTED;
    }
    if (connectionEntry && typeof connectionEntry === 'object') {
      const state = connectionEntry.state;
      if (typeof state === 'string') {
        return state;
      }
    }
    return null;
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    return deriveTransportWebSocketAddress(nodeAddress);
  }

  /**
   * Get the tracked node states map.
   * @return {Map<string, string>} Map of node ID to state.
   */
  getNodeStates() {
    return this._nodeStates;
  }

  /**
   * Extract comparable timestamp from a node-state CDC event.
   * Prefers updated_at, then last_heartbeat, then created_at.
   * @param {Object} cdcEvent - CDC event payload.
   * @return {number|null} Comparable timestamp or null when unavailable.
   * @private
   */
  getNodeStateEventTimestamp(cdcEvent) {
    const candidates = [
      cdcEvent?.data?.[COLUMN.UPDATED_AT],
      cdcEvent?.data?.[COLUMN.LAST_HEARTBEAT],
      cdcEvent?.data?.[COLUMN.CREATED_AT],
    ];

    for (const candidate of candidates) {
      const timestamp = Number(candidate);
      if (Number.isFinite(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }

    return null;
  }

  /**
   * Set a node state (for initialization from external source).
   * @param {string} nodeId - Node ID.
   * @param {string} state - Node state.
   */
  setNodeState(nodeId, state, updatedAt = null) {
    this._nodeStates.set(nodeId, state);
    const timestamp = Number(updatedAt);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      this._nodeStateEventTimestamps.set(nodeId, timestamp);
    }
  }
}

export {CDCEventHandler};
