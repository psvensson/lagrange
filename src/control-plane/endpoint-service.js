/**
 * EndpointService - Endpoint registration and management.
 * Extracted from ControlPlaneService.
 * Requirements: 8.4, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  TRANSPORT_TYPE,
} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  createSystemMetadataOwnerRequiredError,
} from './system-metadata-access-error.js';
import {
  unwrapRowReadResult,
} from './owners/system-metadata-owner-base.js';
import {
  ENDPOINT_SUBSYSTEM,
  ENDPOINT_SVC_ERROR_MSG,
  ENDPOINT_SVC_EVENT,
  ENDPOINT_SVC_LOG_MSG,
  ENDPOINT_SVC_STATE,
} from './endpoint-service-constants.js';

const LOCAL_STR_ENDPOINTSERVICE = 'EndpointService';
const LOCAL_STR_1D19D = 'serviceEndpointsOwner';
const LOCAL_STR_SERVICE_ENDPOINTS = 'service_endpoints';
const LOCAL_STR_READ_WRITE = 'read_write';

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
    this.serviceEndpointsOwner = options.serviceEndpointsOwner || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
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
    if (!this.serviceEndpointsOwner) {
      throw createSystemMetadataOwnerRequiredError({
        serviceName: LOCAL_STR_ENDPOINTSERVICE,
        ownerName: LOCAL_STR_1D19D,
        tableName: LOCAL_STR_SERVICE_ENDPOINTS,
        operation: LOCAL_STR_READ_WRITE,
        message: ENDPOINT_SVC_ERROR_MSG.MISSING_OWNER,
      });
    }

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
    const existing = unwrapRowReadResult(
      await this.serviceEndpointsOwner.getEndpoint(
        endpointData.endpointId,
      ),
    );

    let result;
    if (existing) {
      // Update only mutable fields — do not reconstruct identity fields.
      const updates = {
        [COLUMN.ADDRESS]: endpointData.address,
        [COLUMN.TRANSPORT_TYPE]: endpointData.transportType ||
          TRANSPORT_TYPE.WEBSOCKET,
        [COLUMN.PRIORITY]: endpointData.priority ?? NUM.ZERO,
        [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
        [COLUMN.UPDATED_AT]: now,
      };
      if (endpointData.metadata) {
        updates[COLUMN.METADATA] = JSON.stringify(endpointData.metadata);
      }
      result = await this.serviceEndpointsOwner.updateEndpoint(
        endpointData.endpointId,
        updates,
      );
    } else {
      // Insert full canonical row shape for new endpoints.
      const row = {
        [COLUMN.ENDPOINT_ID]: endpointData.endpointId,
        [COLUMN.NODE_ID]: endpointData.nodeId || this.nodeId,
        [COLUMN.TRANSPORT_TYPE]: endpointData.transportType ||
          TRANSPORT_TYPE.WEBSOCKET,
        [COLUMN.ADDRESS]: endpointData.address,
        [COLUMN.PRIORITY]: endpointData.priority ?? NUM.ZERO,
        [COLUMN.METADATA]: endpointData.metadata ?
          JSON.stringify(endpointData.metadata) :
          JSON.stringify({}),
        [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
        [COLUMN.CREATED_AT]: now,
        [COLUMN.UPDATED_AT]: now,
      };
      result = await this.serviceEndpointsOwner.insertEndpoint(row);
    }

    this.logger.debug(ENDPOINT_SVC_LOG_MSG.REGISTERED, {
      endpointId: endpointData.endpointId,
      nodeId: endpointData.nodeId || this.nodeId,
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

    const result =
      await this.serviceEndpointsOwner.removeEndpoint(endpointId);

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
    return unwrapRowReadResult(
      await this.serviceEndpointsOwner.getEndpoint(endpointId),
    );
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
