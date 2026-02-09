/**
 * EndpointService - Endpoint registration and management.
 * Extracted from ControlPlaneService.
 * Requirements: 8.4, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  TRANSPORT_TYPE,
} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  ENDPOINT_SUBSYSTEM,
  ENDPOINT_SVC_ERROR_MSG,
  ENDPOINT_SVC_EVENT,
  ENDPOINT_SVC_LOG_MSG,
  ENDPOINT_SVC_STATE,
} from './endpoint-service-constants.js';

class EndpointService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.state = ENDPOINT_SVC_STATE.CREATED;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(ENDPOINT_SUBSYSTEM) : console;
  }

  /**
   * Initialize the endpoint service.
   * Transitions: CREATED → INITIALIZED
   */
  initialize() {
    assertCritical(this.nodeId, ENDPOINT_SVC_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(
      this.cdcIntegrationService, ENDPOINT_SVC_ERROR_MSG.MISSING_CDC,
    );
    assertCritical(
      this.systemTableCache, ENDPOINT_SVC_ERROR_MSG.MISSING_CACHE,
    );

    this.state = ENDPOINT_SVC_STATE.INITIALIZED;
    this.logger.info(ENDPOINT_SVC_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Register or update an endpoint.
   * @param {Object} endpointData - Endpoint data.
   * @param {string} endpointData.endpointId - Endpoint ID.
   * @param {string} endpointData.nodeId - Node ID.
   * @param {string} endpointData.address - Endpoint address.
   * @param {string} [endpointData.transportType] - Transport type.
   * @param {number} [endpointData.priority] - Priority.
   * @param {Object} [endpointData.metadata] - Metadata.
   * @return {Promise<Object>} Registration result.
   */
  async registerEndpoint(endpointData) {
    assertCritical(
      endpointData?.endpointId,
      ENDPOINT_SVC_ERROR_MSG.MISSING_ENDPOINT_ID,
    );

    const now = Date.now();
    let existing = null;
    if (this.sqlQueryEngine) {
      const result = await this.sqlQueryEngine.executeQuery(
        'SELECT * FROM node_endpoints WHERE endpoint_id = ?',
        [endpointData.endpointId],
      );
      existing = result.rows?.[0] || null;
    }

    const row = {
      [COLUMN.ENDPOINT_ID]: endpointData.endpointId,
      [COLUMN.NODE_ID]: endpointData.nodeId || this.nodeId,
      [COLUMN.TRANSPORT_TYPE]: endpointData.transportType ||
        TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: endpointData.address,
      [COLUMN.PRIORITY]: endpointData.priority ?? NUM.ZERO,
      [COLUMN.METADATA]: endpointData.metadata ?
        JSON.stringify(endpointData.metadata) :
        (existing?.[COLUMN.METADATA] || JSON.stringify({})),
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.CREATED_AT]: existing?.[COLUMN.CREATED_AT] || now,
      [COLUMN.UPDATED_AT]: now,
    };

    const result = await this.cdcIntegrationService.upsertSystemTableRow(
      SystemTableName.NODE_ENDPOINTS, row,
    );

    this.logger.debug(ENDPOINT_SVC_LOG_MSG.REGISTERED, {
      endpointId: endpointData.endpointId,
      nodeId: row[COLUMN.NODE_ID],
    });

    this.emit(ENDPOINT_SVC_EVENT.REGISTERED, {
      endpointId: endpointData.endpointId,
    });

    return result;
  }

  /**
   * Remove an endpoint.
   * @param {string} endpointId - Endpoint ID to remove.
   * @return {Promise<Object>} Deletion result.
   */
  async removeEndpoint(endpointId) {
    assertCritical(endpointId, ENDPOINT_SVC_ERROR_MSG.MISSING_ENDPOINT_ID);

    const result = await this.cdcIntegrationService.deleteSystemTableRow(
      SystemTableName.NODE_ENDPOINTS,
      {[COLUMN.ENDPOINT_ID]: endpointId},
    );

    this.logger.debug(ENDPOINT_SVC_LOG_MSG.REMOVED, {
      endpointId,
    });

    this.emit(ENDPOINT_SVC_EVENT.REMOVED, {endpointId});
    return result;
  }

  /**
   * Get an endpoint by ID.
   * @param {string} endpointId - Endpoint ID.
   * @return {Promise<Object|null>} Endpoint data or null.
   */
  async getEndpoint(endpointId) {
    if (this.sqlQueryEngine) {
      const result = await this.sqlQueryEngine.executeQuery(
        'SELECT * FROM node_endpoints WHERE endpoint_id = ?',
        [endpointId],
      );
      return result.rows?.[0] || null;
    }
    return null;
  }

  /**
   * Stop the endpoint service.
   */
  stop() {
    this.state = ENDPOINT_SVC_STATE.STOPPED;
    this.logger.info(ENDPOINT_SVC_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */
  getState() {
    return this.state;
  }
}

export {EndpointService};
