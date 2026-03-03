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

import {ADDRESS, COLUMN, NUM, PROTOCOL, CDC_OPERATION, STATE, TYPEOF} from
  '../constants/index.js';
import {METRICS_LOG_TAG} from '../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../constants/entrypoint.js';
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
    if (!cdcEvent || typeof cdcEvent !== TYPEOF.OBJECT) {
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
      if (typeof configValue === TYPEOF.STRING) {
        epochData = JSON.parse(configValue);
      } else if (
        typeof configValue === TYPEOF.OBJECT && configValue !== null
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
    if (!cdcEvent || typeof cdcEvent !== TYPEOF.OBJECT) {
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
        return {
          processed: true,
          nodeId,
          oldState,
          newState: oldState,
          stateChanged: false,
          staleEventIgnored: true,
          eventTimestamp,
          lastTimestamp,
        };
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
      return {
        processed: true,
        nodeId,
        oldState,
        newState,
        stateChanged: false,
      };
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

    return {
      processed: true,
      nodeId,
      oldState,
      newState,
      stateChanged: true,
    };
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
    if (!cdcEvent || typeof cdcEvent !== TYPEOF.OBJECT) {
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
      return {
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: CDC_SKIP_REASON.SELF,
      };
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
      return {
        processed: true,
        nodeId: targetNodeId,
        connected: false,
        skipped: true,
        reason: CDC_SKIP_REASON.ALREADY_CONNECTED,
      };
    }

    // Check if we have a node address to connect to
    if (!nodeAddress) {
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_MISSING_ADDRESS, {
        nodeId: this.nodeId,
        targetNodeId,
      });
      return {
        processed: false,
        nodeId: targetNodeId,
        error: 'Missing node_address',
      };
    }

    // Derive WebSocket address from node address
    const wsAddress = this.deriveWsAddressFromNodeAddress(nodeAddress);
    if (!wsAddress) {
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: this.nodeId,
        targetNodeId,
        nodeAddress,
        error: 'Could not derive WebSocket address',
      });
      return {
        processed: false,
        nodeId: targetNodeId,
        error: 'Could not derive WebSocket address',
      };
    }

    this.logger.info(CDC_LOG_MSG.NEW_NODE_DETECTED, {
      nodeId: this.nodeId,
      targetNodeId,
      wsAddress,
    });

    // Establish connection to the new node
    try {
      await messageRouter.connectToNode(targetNodeId, wsAddress);
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

      return {
        processed: true,
        nodeId: targetNodeId,
        connected: true,
        wsAddress,
      };
    } catch (connectError) {
      // Log but don't fail - the node might be temporarily unavailable
      // Raft will handle retries and leader election
      this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, {
        nodeId: this.nodeId,
        targetNodeId,
        wsAddress,
        error: connectError.message,
      });
      return {
        processed: false,
        nodeId: targetNodeId,
        error: connectError.message,
      };
    }
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

    if (typeof messageRouter.getConnectionState === TYPEOF.FUNCTION) {
      return messageRouter.getConnectionState(targetNodeId);
    }

    const connectionEntry = messageRouter.nodeConnections?.get(targetNodeId);
    if (typeof connectionEntry === TYPEOF.STRING) {
      return connectionEntry;
    }
    if (connectionEntry === true) {
      return STATE.CONNECTED;
    }
    if (connectionEntry && typeof connectionEntry === TYPEOF.OBJECT) {
      const state = connectionEntry.state;
      if (typeof state === TYPEOF.STRING) {
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
      if (Number.isFinite(timestamp) && timestamp > NUM.ZERO) {
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
    if (Number.isFinite(timestamp) && timestamp > NUM.ZERO) {
      this._nodeStateEventTimestamps.set(nodeId, timestamp);
    }
  }
}

export {CDCEventHandler};
