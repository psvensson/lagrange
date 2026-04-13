/**
 * EndpointService - Endpoint registration and management.
 * Extracted from ControlPlaneService.
 * Requirements: 8.4, 8.6
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { COLUMN, ENDPOINT_STATUS, NUM, TRANSPORT_TYPE } from '../constants/index.js';
import { assertCritical } from '../utils/assert.js';
import { createSystemMetadataOwnerRequiredError } from './system-metadata-access-error.js';
import { unwrapRowReadResult } from './owners/system-metadata-owner-base.js';
import { ENDPOINT_SUBSYSTEM, ENDPOINT_SVC_ERROR_MSG, ENDPOINT_SVC_EVENT, ENDPOINT_SVC_LOG_MSG, ENDPOINT_SVC_STATE } from './endpoint-service-constants.js';
class EndpointService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("64611")) {
      {}
    } else {
      stryCov_9fa48("64611");
      super();
      this.nodeId = stryMutAct_9fa48("64614") ? options.nodeId && null : stryMutAct_9fa48("64613") ? false : stryMutAct_9fa48("64612") ? true : (stryCov_9fa48("64612", "64613", "64614"), options.nodeId || null);
      this.serviceEndpointsOwner = stryMutAct_9fa48("64617") ? options.serviceEndpointsOwner && null : stryMutAct_9fa48("64616") ? false : stryMutAct_9fa48("64615") ? true : (stryCov_9fa48("64615", "64616", "64617"), options.serviceEndpointsOwner || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("64620") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("64619") ? false : stryMutAct_9fa48("64618") ? true : (stryCov_9fa48("64618", "64619", "64620"), options.controlPlaneSystemTableGateway || null);
      this.state = ENDPOINT_SVC_STATE.CREATED;
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(ENDPOINT_SUBSYSTEM) : console;
    }
  }

  /**
   * Initialize the endpoint service.
   * Transitions: CREATED → INITIALIZED
   */
  initialize() {
    if (stryMutAct_9fa48("64621")) {
      {}
    } else {
      stryCov_9fa48("64621");
      assertCritical(this.nodeId, ENDPOINT_SVC_ERROR_MSG.MISSING_NODE_ID);
      if (stryMutAct_9fa48("64624") ? false : stryMutAct_9fa48("64623") ? true : stryMutAct_9fa48("64622") ? this.serviceEndpointsOwner : (stryCov_9fa48("64622", "64623", "64624"), !this.serviceEndpointsOwner)) {
        if (stryMutAct_9fa48("64625")) {
          {}
        } else {
          stryCov_9fa48("64625");
          throw createSystemMetadataOwnerRequiredError(stryMutAct_9fa48("64626") ? {} : (stryCov_9fa48("64626"), {
            serviceName: stryMutAct_9fa48("64627") ? "" : (stryCov_9fa48("64627"), 'EndpointService'),
            ownerName: stryMutAct_9fa48("64628") ? "" : (stryCov_9fa48("64628"), 'serviceEndpointsOwner'),
            tableName: stryMutAct_9fa48("64629") ? "" : (stryCov_9fa48("64629"), 'service_endpoints'),
            operation: stryMutAct_9fa48("64630") ? "" : (stryCov_9fa48("64630"), 'read_write'),
            message: ENDPOINT_SVC_ERROR_MSG.MISSING_OWNER
          }));
        }
      }
      this.state = ENDPOINT_SVC_STATE.INITIALIZED;
      this.logger.info(ENDPOINT_SVC_LOG_MSG.INITIALIZED, stryMutAct_9fa48("64631") ? {} : (stryCov_9fa48("64631"), {
        nodeId: this.nodeId
      }));
    }
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
    if (stryMutAct_9fa48("64632")) {
      {}
    } else {
      stryCov_9fa48("64632");
      assertCritical(stryMutAct_9fa48("64633") ? endpointData.endpointId : (stryCov_9fa48("64633"), endpointData?.endpointId), ENDPOINT_SVC_ERROR_MSG.MISSING_ENDPOINT_ID);
      const now = Date.now();
      const existing = unwrapRowReadResult(await this.serviceEndpointsOwner.getEndpoint(endpointData.endpointId));
      let result;
      if (stryMutAct_9fa48("64635") ? false : stryMutAct_9fa48("64634") ? true : (stryCov_9fa48("64634", "64635"), existing)) {
        if (stryMutAct_9fa48("64636")) {
          {}
        } else {
          stryCov_9fa48("64636");
          // Update only mutable fields — do not reconstruct identity fields.
          const updates = stryMutAct_9fa48("64637") ? {} : (stryCov_9fa48("64637"), {
            [COLUMN.ADDRESS]: endpointData.address,
            [COLUMN.TRANSPORT_TYPE]: stryMutAct_9fa48("64640") ? endpointData.transportType && TRANSPORT_TYPE.WEBSOCKET : stryMutAct_9fa48("64639") ? false : stryMutAct_9fa48("64638") ? true : (stryCov_9fa48("64638", "64639", "64640"), endpointData.transportType || TRANSPORT_TYPE.WEBSOCKET),
            [COLUMN.PRIORITY]: stryMutAct_9fa48("64641") ? endpointData.priority && NUM.ZERO : (stryCov_9fa48("64641"), endpointData.priority ?? NUM.ZERO),
            [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
            [COLUMN.UPDATED_AT]: now
          });
          if (stryMutAct_9fa48("64643") ? false : stryMutAct_9fa48("64642") ? true : (stryCov_9fa48("64642", "64643"), endpointData.metadata)) {
            if (stryMutAct_9fa48("64644")) {
              {}
            } else {
              stryCov_9fa48("64644");
              updates[COLUMN.METADATA] = JSON.stringify(endpointData.metadata);
            }
          }
          result = await this.serviceEndpointsOwner.updateEndpoint(endpointData.endpointId, updates);
        }
      } else {
        if (stryMutAct_9fa48("64645")) {
          {}
        } else {
          stryCov_9fa48("64645");
          // Insert full canonical row shape for new endpoints.
          const row = stryMutAct_9fa48("64646") ? {} : (stryCov_9fa48("64646"), {
            [COLUMN.ENDPOINT_ID]: endpointData.endpointId,
            [COLUMN.NODE_ID]: stryMutAct_9fa48("64649") ? endpointData.nodeId && this.nodeId : stryMutAct_9fa48("64648") ? false : stryMutAct_9fa48("64647") ? true : (stryCov_9fa48("64647", "64648", "64649"), endpointData.nodeId || this.nodeId),
            [COLUMN.TRANSPORT_TYPE]: stryMutAct_9fa48("64652") ? endpointData.transportType && TRANSPORT_TYPE.WEBSOCKET : stryMutAct_9fa48("64651") ? false : stryMutAct_9fa48("64650") ? true : (stryCov_9fa48("64650", "64651", "64652"), endpointData.transportType || TRANSPORT_TYPE.WEBSOCKET),
            [COLUMN.ADDRESS]: endpointData.address,
            [COLUMN.PRIORITY]: stryMutAct_9fa48("64653") ? endpointData.priority && NUM.ZERO : (stryCov_9fa48("64653"), endpointData.priority ?? NUM.ZERO),
            [COLUMN.METADATA]: endpointData.metadata ? JSON.stringify(endpointData.metadata) : JSON.stringify({}),
            [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
            [COLUMN.CREATED_AT]: now,
            [COLUMN.UPDATED_AT]: now
          });
          result = await this.serviceEndpointsOwner.insertEndpoint(row);
        }
      }
      this.logger.debug(ENDPOINT_SVC_LOG_MSG.REGISTERED, stryMutAct_9fa48("64654") ? {} : (stryCov_9fa48("64654"), {
        endpointId: endpointData.endpointId,
        nodeId: stryMutAct_9fa48("64657") ? endpointData.nodeId && this.nodeId : stryMutAct_9fa48("64656") ? false : stryMutAct_9fa48("64655") ? true : (stryCov_9fa48("64655", "64656", "64657"), endpointData.nodeId || this.nodeId)
      }));
      this.emit(ENDPOINT_SVC_EVENT.REGISTERED, stryMutAct_9fa48("64658") ? {} : (stryCov_9fa48("64658"), {
        endpointId: endpointData.endpointId
      }));
      return result;
    }
  }

  /**
   * Remove an endpoint.
   * @param {string} endpointId - Endpoint ID to remove.
   * @return {Promise<Object>} Deletion result.
   */
  async removeEndpoint(endpointId) {
    if (stryMutAct_9fa48("64659")) {
      {}
    } else {
      stryCov_9fa48("64659");
      assertCritical(endpointId, ENDPOINT_SVC_ERROR_MSG.MISSING_ENDPOINT_ID);
      const result = await this.serviceEndpointsOwner.removeEndpoint(endpointId);
      this.logger.debug(ENDPOINT_SVC_LOG_MSG.REMOVED, stryMutAct_9fa48("64660") ? {} : (stryCov_9fa48("64660"), {
        endpointId
      }));
      this.emit(ENDPOINT_SVC_EVENT.REMOVED, stryMutAct_9fa48("64661") ? {} : (stryCov_9fa48("64661"), {
        endpointId
      }));
      return result;
    }
  }

  /**
   * Get an endpoint by ID.
   * @param {string} endpointId - Endpoint ID.
   * @return {Promise<Object|null>} Endpoint data or null.
   */
  async getEndpoint(endpointId) {
    if (stryMutAct_9fa48("64662")) {
      {}
    } else {
      stryCov_9fa48("64662");
      return unwrapRowReadResult(await this.serviceEndpointsOwner.getEndpoint(endpointId));
    }
  }

  /**
   * Stop the endpoint service.
   */
  stop() {
    if (stryMutAct_9fa48("64663")) {
      {}
    } else {
      stryCov_9fa48("64663");
      this.state = ENDPOINT_SVC_STATE.STOPPED;
      this.logger.info(ENDPOINT_SVC_LOG_MSG.STOPPED, stryMutAct_9fa48("64664") ? {} : (stryCov_9fa48("64664"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */
  getState() {
    if (stryMutAct_9fa48("64665")) {
      {}
    } else {
      stryCov_9fa48("64665");
      return this.state;
    }
  }
}
export { EndpointService };