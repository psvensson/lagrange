/**
 * Shared topology setup owner for latency-aware services.
 */

import {assertCritical} from '../../utils/assert.js';
import {TYPEOF} from '../../constants/index.js';
import {GroupSelectionService} from '../../topology/group-selection-service.js';
import {LatencyMeasurementService} from '../../topology/latency-measurement-service.js';
import {LatencyGroupManager} from '../../topology/latency-group-manager.js';
import {LatencyTreeService} from '../../topology/latency-tree-service.js';
import {
  CDCGroupPropagationService,
} from '../../topology/cdc-group-propagation-service.js';

const LATENCY_TOPOLOGY_SETUP_ERROR = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId',
  SYSTEM_TABLE_CACHE_REQUIRED: 'systemTableCache',
  CDC_INTEGRATION_SERVICE_REQUIRED: 'cdcIntegrationService',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter',
  TOPOLOGY_OWNERS_REQUIRED: 'topologyOwners',
});

class LatencyTopologySetup {
  /**
   * Create latency topology owners.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Object} options.messageRouter
   * @return {Object}
   */
  static create(options = {}) {
    const nodeId = assertCritical(
      options.nodeId,
      LATENCY_TOPOLOGY_SETUP_ERROR.NODE_ID_REQUIRED,
    );
    const systemTableCache = assertCritical(
      options.systemTableCache,
      LATENCY_TOPOLOGY_SETUP_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const cdcIntegrationService = assertCritical(
      options.cdcIntegrationService,
      LATENCY_TOPOLOGY_SETUP_ERROR.CDC_INTEGRATION_SERVICE_REQUIRED,
    );
    const messageRouter = assertCritical(
      options.messageRouter,
      LATENCY_TOPOLOGY_SETUP_ERROR.MESSAGE_ROUTER_REQUIRED,
    );

    const groupSelectionService = new GroupSelectionService({
      systemTableCache,
      cdcIntegrationService,
    });
    groupSelectionService.initialize({
      systemTableCache,
      cdcIntegrationService,
    });

    const latencyMeasurementService = new LatencyMeasurementService({
      nodeId,
      messageRouter,
      systemTableCache,
      cdcIntegrationService,
    });
    latencyMeasurementService.initialize({
      nodeId,
      messageRouter,
      systemTableCache,
      cdcIntegrationService,
    });

    const latencyGroupManager = new LatencyGroupManager({
      nodeId,
      systemTableCache,
      cdcIntegrationService,
      latencyMeasurementService,
      groupSelectionService,
    });
    latencyGroupManager.initialize({
      nodeId,
      systemTableCache,
      cdcIntegrationService,
      latencyMeasurementService,
      groupSelectionService,
    });

    const latencyTreeService = new LatencyTreeService({
      nodeId,
      systemTableCache,
    });
    latencyTreeService.initialize({
      nodeId,
      systemTableCache,
    });

    const cdcGroupPropagationService = new CDCGroupPropagationService({
      nodeId,
      systemTableCache,
      messageRouter,
      latencyTreeService,
    });
    cdcGroupPropagationService.initialize({
      nodeId,
      systemTableCache,
      messageRouter,
      latencyTreeService,
    });

    return {
      groupSelectionService,
      latencyMeasurementService,
      latencyGroupManager,
      latencyTreeService,
      cdcGroupPropagationService,
    };
  }

  /**
   * Start latency topology owners.
   * @param {Object} topologyOwners
   * @param {Object} options
   * @param {boolean} options.runAssignmentImmediately
   */
  static start(topologyOwners, options = {}) {
    const owners = assertCritical(
      topologyOwners,
      LATENCY_TOPOLOGY_SETUP_ERROR.TOPOLOGY_OWNERS_REQUIRED,
    );

    owners.latencyTreeService.start({
      recomputeImmediately: true,
    });
    owners.cdcGroupPropagationService.start();
    owners.latencyMeasurementService.start();
    owners.latencyGroupManager.start({
      runImmediately: options.runAssignmentImmediately !== false,
    });
  }

  /**
   * Stop latency topology owners.
   * @param {Object} topologyOwners
   */
  static stop(topologyOwners) {
    const owners = topologyOwners;
    if (!owners || typeof owners !== TYPEOF.OBJECT) {
      return;
    }
    if (owners.latencyGroupManager?.stop) {
      owners.latencyGroupManager.stop();
    }
    if (owners.latencyMeasurementService?.stop) {
      owners.latencyMeasurementService.stop();
    }
    if (owners.cdcGroupPropagationService?.stop) {
      owners.cdcGroupPropagationService.stop();
    }
    if (owners.latencyTreeService?.stop) {
      owners.latencyTreeService.stop();
    }
  }
}

export {LatencyTopologySetup, LATENCY_TOPOLOGY_SETUP_ERROR};
