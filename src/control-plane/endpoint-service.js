/**
 * EndpointService - the control-plane endpoint service lifecycle shell.
 * Extracted from ControlPlaneService. It writes no endpoint row: every
 * node_endpoints / service_endpoints mutation belongs to the endpoint
 * incarnation authority (owners/endpoint-incarnation-authority.js), whose
 * writes carry the node's exact boot incarnation.
 * Requirements: 8.4, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
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
  ENDPOINT_SVC_LOG_MSG,
  ENDPOINT_SVC_STATE,
} from './endpoint-service-constants.js';

const LOCAL_STR_ENDPOINTSERVICE = 'EndpointService';
const LOCAL_STR_SERVICEENDPOINTSOWNER = 'serviceEndpointsOwner';
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
        ownerName: LOCAL_STR_SERVICEENDPOINTSOWNER,
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
