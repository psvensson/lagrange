/**
 * Shared topology setup owner for latency-aware services.
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
import { assertCritical } from '../../utils/assert.js';
import { TYPEOF } from '../../constants/index.js';
import { GroupSelectionService } from '../../topology/group-selection-service.js';
import { LatencyMeasurementService } from '../../topology/latency-measurement-service.js';
import { LatencyGroupManager } from '../../topology/latency-group-manager.js';
import { LatencyTreeService } from '../../topology/latency-tree-service.js';
import { CDCGroupPropagationService } from '../../topology/cdc-group-propagation-service.js';
const LATENCY_TOPOLOGY_SETUP_ERROR = Object.freeze(stryMutAct_9fa48("28825") ? {} : (stryCov_9fa48("28825"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("28826") ? "" : (stryCov_9fa48("28826"), 'nodeId'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("28827") ? "" : (stryCov_9fa48("28827"), 'systemTableCache'),
  CDC_INTEGRATION_SERVICE_REQUIRED: stryMutAct_9fa48("28828") ? "" : (stryCov_9fa48("28828"), 'cdcIntegrationService'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("28829") ? "" : (stryCov_9fa48("28829"), 'messageRouter'),
  TOPOLOGY_OWNERS_REQUIRED: stryMutAct_9fa48("28830") ? "" : (stryCov_9fa48("28830"), 'topologyOwners')
}));
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
    if (stryMutAct_9fa48("28831")) {
      {}
    } else {
      stryCov_9fa48("28831");
      const nodeId = assertCritical(options.nodeId, LATENCY_TOPOLOGY_SETUP_ERROR.NODE_ID_REQUIRED);
      const systemTableCache = assertCritical(options.systemTableCache, LATENCY_TOPOLOGY_SETUP_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const cdcIntegrationService = assertCritical(options.cdcIntegrationService, LATENCY_TOPOLOGY_SETUP_ERROR.CDC_INTEGRATION_SERVICE_REQUIRED);
      const messageRouter = assertCritical(options.messageRouter, LATENCY_TOPOLOGY_SETUP_ERROR.MESSAGE_ROUTER_REQUIRED);
      const groupSelectionService = new GroupSelectionService(stryMutAct_9fa48("28832") ? {} : (stryCov_9fa48("28832"), {
        systemTableCache,
        cdcIntegrationService
      }));
      groupSelectionService.initialize(stryMutAct_9fa48("28833") ? {} : (stryCov_9fa48("28833"), {
        systemTableCache,
        cdcIntegrationService
      }));
      const latencyMeasurementService = new LatencyMeasurementService(stryMutAct_9fa48("28834") ? {} : (stryCov_9fa48("28834"), {
        nodeId,
        messageRouter,
        systemTableCache,
        cdcIntegrationService
      }));
      latencyMeasurementService.initialize(stryMutAct_9fa48("28835") ? {} : (stryCov_9fa48("28835"), {
        nodeId,
        messageRouter,
        systemTableCache,
        cdcIntegrationService
      }));
      const latencyGroupManager = new LatencyGroupManager(stryMutAct_9fa48("28836") ? {} : (stryCov_9fa48("28836"), {
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        latencyMeasurementService,
        groupSelectionService
      }));
      latencyGroupManager.initialize(stryMutAct_9fa48("28837") ? {} : (stryCov_9fa48("28837"), {
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        latencyMeasurementService,
        groupSelectionService
      }));
      const latencyTreeService = new LatencyTreeService(stryMutAct_9fa48("28838") ? {} : (stryCov_9fa48("28838"), {
        nodeId,
        systemTableCache
      }));
      latencyTreeService.initialize(stryMutAct_9fa48("28839") ? {} : (stryCov_9fa48("28839"), {
        nodeId,
        systemTableCache
      }));
      const cdcGroupPropagationService = new CDCGroupPropagationService(stryMutAct_9fa48("28840") ? {} : (stryCov_9fa48("28840"), {
        nodeId,
        systemTableCache,
        messageRouter,
        latencyTreeService
      }));
      cdcGroupPropagationService.initialize(stryMutAct_9fa48("28841") ? {} : (stryCov_9fa48("28841"), {
        nodeId,
        systemTableCache,
        messageRouter,
        latencyTreeService
      }));
      return stryMutAct_9fa48("28842") ? {} : (stryCov_9fa48("28842"), {
        groupSelectionService,
        latencyMeasurementService,
        latencyGroupManager,
        latencyTreeService,
        cdcGroupPropagationService
      });
    }
  }

  /**
   * Start latency topology owners.
   * @param {Object} topologyOwners
   * @param {Object} options
   * @param {boolean} options.runAssignmentImmediately
   */
  static start(topologyOwners, options = {}) {
    if (stryMutAct_9fa48("28843")) {
      {}
    } else {
      stryCov_9fa48("28843");
      const owners = assertCritical(topologyOwners, LATENCY_TOPOLOGY_SETUP_ERROR.TOPOLOGY_OWNERS_REQUIRED);
      owners.latencyTreeService.start(stryMutAct_9fa48("28844") ? {} : (stryCov_9fa48("28844"), {
        recomputeImmediately: stryMutAct_9fa48("28845") ? false : (stryCov_9fa48("28845"), true)
      }));
      owners.cdcGroupPropagationService.start();
      owners.latencyMeasurementService.start();
      owners.latencyGroupManager.start(stryMutAct_9fa48("28846") ? {} : (stryCov_9fa48("28846"), {
        runImmediately: stryMutAct_9fa48("28849") ? options.runAssignmentImmediately === false : stryMutAct_9fa48("28848") ? false : stryMutAct_9fa48("28847") ? true : (stryCov_9fa48("28847", "28848", "28849"), options.runAssignmentImmediately !== (stryMutAct_9fa48("28850") ? true : (stryCov_9fa48("28850"), false)))
      }));
    }
  }

  /**
   * Stop latency topology owners.
   * @param {Object} topologyOwners
   */
  static async stop(topologyOwners) {
    if (stryMutAct_9fa48("28851")) {
      {}
    } else {
      stryCov_9fa48("28851");
      const owners = topologyOwners;
      if (stryMutAct_9fa48("28854") ? !owners && typeof owners !== TYPEOF.OBJECT : stryMutAct_9fa48("28853") ? false : stryMutAct_9fa48("28852") ? true : (stryCov_9fa48("28852", "28853", "28854"), (stryMutAct_9fa48("28855") ? owners : (stryCov_9fa48("28855"), !owners)) || (stryMutAct_9fa48("28857") ? typeof owners === TYPEOF.OBJECT : stryMutAct_9fa48("28856") ? false : (stryCov_9fa48("28856", "28857"), typeof owners !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("28858")) {
          {}
        } else {
          stryCov_9fa48("28858");
          return;
        }
      }
      if (stryMutAct_9fa48("28861") ? owners.latencyGroupManager.stop : stryMutAct_9fa48("28860") ? false : stryMutAct_9fa48("28859") ? true : (stryCov_9fa48("28859", "28860", "28861"), owners.latencyGroupManager?.stop)) {
        if (stryMutAct_9fa48("28862")) {
          {}
        } else {
          stryCov_9fa48("28862");
          await owners.latencyGroupManager.stop();
        }
      }
      if (stryMutAct_9fa48("28865") ? owners.latencyMeasurementService.stop : stryMutAct_9fa48("28864") ? false : stryMutAct_9fa48("28863") ? true : (stryCov_9fa48("28863", "28864", "28865"), owners.latencyMeasurementService?.stop)) {
        if (stryMutAct_9fa48("28866")) {
          {}
        } else {
          stryCov_9fa48("28866");
          owners.latencyMeasurementService.stop();
        }
      }
      if (stryMutAct_9fa48("28869") ? owners.cdcGroupPropagationService.stop : stryMutAct_9fa48("28868") ? false : stryMutAct_9fa48("28867") ? true : (stryCov_9fa48("28867", "28868", "28869"), owners.cdcGroupPropagationService?.stop)) {
        if (stryMutAct_9fa48("28870")) {
          {}
        } else {
          stryCov_9fa48("28870");
          owners.cdcGroupPropagationService.stop();
        }
      }
      if (stryMutAct_9fa48("28873") ? owners.latencyTreeService.stop : stryMutAct_9fa48("28872") ? false : stryMutAct_9fa48("28871") ? true : (stryCov_9fa48("28871", "28872", "28873"), owners.latencyTreeService?.stop)) {
        if (stryMutAct_9fa48("28874")) {
          {}
        } else {
          stryCov_9fa48("28874");
          owners.latencyTreeService.stop();
        }
      }
    }
  }
}
export { LatencyTopologySetup, LATENCY_TOPOLOGY_SETUP_ERROR };