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
import { ConfigurationManager } from '../../config/configuration-manager.js';
import { assertCritical } from '../../utils/assert.js';
import { NUM, SERVICE_STATUS, TABLES, TYPEOF } from '../../constants/index.js';
import { CONFIG_CATEGORY } from '../../config/config-constants.js';
import { resolveCanonicalActiveNodeIds } from '../../control-plane/active-node-projection.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../../control-plane/control-plane-readiness-constants.js';
import { BOOTSTRAP_API_CLUSTER_STATE, BOOTSTRAP_API_ERROR } from '../bootstrap-api-constants.js';
function canTreatSeedAsBootstrapReady(readiness) {
  if (stryMutAct_9fa48("18648")) {
    {}
  } else {
    stryCov_9fa48("18648");
    return stryMutAct_9fa48("18651") ? !!readiness && typeof readiness === TYPEOF.OBJECT || readiness.ready === true : stryMutAct_9fa48("18650") ? false : stryMutAct_9fa48("18649") ? true : (stryCov_9fa48("18649", "18650", "18651"), (stryMutAct_9fa48("18653") ? !!readiness || typeof readiness === TYPEOF.OBJECT : stryMutAct_9fa48("18652") ? true : (stryCov_9fa48("18652", "18653"), (stryMutAct_9fa48("18654") ? !readiness : (stryCov_9fa48("18654"), !(stryMutAct_9fa48("18655") ? readiness : (stryCov_9fa48("18655"), !readiness)))) && (stryMutAct_9fa48("18657") ? typeof readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("18656") ? true : (stryCov_9fa48("18656", "18657"), typeof readiness === TYPEOF.OBJECT)))) && (stryMutAct_9fa48("18659") ? readiness.ready !== true : stryMutAct_9fa48("18658") ? true : (stryCov_9fa48("18658", "18659"), readiness.ready === (stryMutAct_9fa48("18660") ? false : (stryCov_9fa48("18660"), true)))));
  }
}
class BootstrapClusterViewOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("18661")) {
      {}
    } else {
      stryCov_9fa48("18661");
      this.delegates = stryMutAct_9fa48("18664") ? options.delegates && {} : stryMutAct_9fa48("18663") ? false : stryMutAct_9fa48("18662") ? true : (stryCov_9fa48("18662", "18663", "18664"), options.delegates || {});
    }
  }
  getSystemTableCache() {
    if (stryMutAct_9fa48("18665")) {
      {}
    } else {
      stryCov_9fa48("18665");
      return stryMutAct_9fa48("18668") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("18667") ? false : stryMutAct_9fa48("18666") ? true : (stryCov_9fa48("18666", "18667", "18668"), (stryMutAct_9fa48("18669") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("18669"), this.delegates.getSystemTableCache?.())) || null);
    }
  }
  getSeedNodeId() {
    if (stryMutAct_9fa48("18670")) {
      {}
    } else {
      stryCov_9fa48("18670");
      return stryMutAct_9fa48("18673") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("18672") ? false : stryMutAct_9fa48("18671") ? true : (stryCov_9fa48("18671", "18672", "18673"), (stryMutAct_9fa48("18674") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("18674"), this.delegates.getSeedNodeId?.())) || null);
    }
  }
  getSeedNodeAddress() {
    if (stryMutAct_9fa48("18675")) {
      {}
    } else {
      stryCov_9fa48("18675");
      return stryMutAct_9fa48("18678") ? this.delegates.getSeedNodeAddress?.() && null : stryMutAct_9fa48("18677") ? false : stryMutAct_9fa48("18676") ? true : (stryCov_9fa48("18676", "18677", "18678"), (stryMutAct_9fa48("18679") ? this.delegates.getSeedNodeAddress() : (stryCov_9fa48("18679"), this.delegates.getSeedNodeAddress?.())) || null);
    }
  }
  getMessageGroups() {
    if (stryMutAct_9fa48("18680")) {
      {}
    } else {
      stryCov_9fa48("18680");
      return stryMutAct_9fa48("18683") ? this.delegates.getMessageGroups?.() && [] : stryMutAct_9fa48("18682") ? false : stryMutAct_9fa48("18681") ? true : (stryCov_9fa48("18681", "18682", "18683"), (stryMutAct_9fa48("18684") ? this.delegates.getMessageGroups() : (stryCov_9fa48("18684"), this.delegates.getMessageGroups?.())) || (stryMutAct_9fa48("18685") ? ["Stryker was here"] : (stryCov_9fa48("18685"), [])));
    }
  }
  getControlPlaneReadinessService() {
    if (stryMutAct_9fa48("18686")) {
      {}
    } else {
      stryCov_9fa48("18686");
      return stryMutAct_9fa48("18689") ? this.delegates.getControlPlaneReadinessService?.() && null : stryMutAct_9fa48("18688") ? false : stryMutAct_9fa48("18687") ? true : (stryCov_9fa48("18687", "18688", "18689"), (stryMutAct_9fa48("18690") ? this.delegates.getControlPlaneReadinessService() : (stryCov_9fa48("18690"), this.delegates.getControlPlaneReadinessService?.())) || null);
    }
  }
  getPublicationRows() {
    if (stryMutAct_9fa48("18691")) {
      {}
    } else {
      stryCov_9fa48("18691");
      const systemTableCache = this.getSystemTableCache();
      return stryMutAct_9fa48("18694") ? systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS) && [] : stryMutAct_9fa48("18693") ? false : stryMutAct_9fa48("18692") ? true : (stryCov_9fa48("18692", "18693", "18694"), (stryMutAct_9fa48("18696") ? systemTableCache.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS) : stryMutAct_9fa48("18695") ? systemTableCache?.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) : (stryCov_9fa48("18695", "18696"), systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS))) || (stryMutAct_9fa48("18697") ? ["Stryker was here"] : (stryCov_9fa48("18697"), [])));
    }
  }
  getEpochManager() {
    if (stryMutAct_9fa48("18698")) {
      {}
    } else {
      stryCov_9fa48("18698");
      return stryMutAct_9fa48("18701") ? this.delegates.getEpochManager?.() && null : stryMutAct_9fa48("18700") ? false : stryMutAct_9fa48("18699") ? true : (stryCov_9fa48("18699", "18700", "18701"), (stryMutAct_9fa48("18702") ? this.delegates.getEpochManager() : (stryCov_9fa48("18702"), this.delegates.getEpochManager?.())) || null);
    }
  }
  getStartupAuthorityReadyNodeIds(seedNodeId, observedAt = Date.now()) {
    if (stryMutAct_9fa48("18703")) {
      {}
    } else {
      stryCov_9fa48("18703");
      const readinessService = this.getControlPlaneReadinessService();
      if (stryMutAct_9fa48("18706") ? !readinessService && typeof readinessService.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("18705") ? false : stryMutAct_9fa48("18704") ? true : (stryCov_9fa48("18704", "18705", "18706"), (stryMutAct_9fa48("18707") ? readinessService : (stryCov_9fa48("18707"), !readinessService)) || (stryMutAct_9fa48("18709") ? typeof readinessService.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION : stryMutAct_9fa48("18708") ? false : (stryCov_9fa48("18708", "18709"), typeof readinessService.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("18710")) {
          {}
        } else {
          stryCov_9fa48("18710");
          return stryMutAct_9fa48("18711") ? ["Stryker was here"] : (stryCov_9fa48("18711"), []);
        }
      }
      try {
        if (stryMutAct_9fa48("18712")) {
          {}
        } else {
          stryCov_9fa48("18712");
          const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(seedNodeId, observedAt);
          return Array.isArray(stryMutAct_9fa48("18713") ? startupAuthority.canonicalStartupNodeIds : (stryCov_9fa48("18713"), startupAuthority?.canonicalStartupNodeIds)) ? stryMutAct_9fa48("18714") ? [] : (stryCov_9fa48("18714"), [...new Set(stryMutAct_9fa48("18715") ? startupAuthority.canonicalStartupNodeIds : (stryCov_9fa48("18715"), startupAuthority.canonicalStartupNodeIds.filter(stryMutAct_9fa48("18716") ? () => undefined : (stryCov_9fa48("18716"), nodeId => stryMutAct_9fa48("18719") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("18718") ? false : stryMutAct_9fa48("18717") ? true : (stryCov_9fa48("18717", "18718", "18719"), (stryMutAct_9fa48("18721") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("18720") ? true : (stryCov_9fa48("18720", "18721"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("18724") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("18723") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("18722") ? true : (stryCov_9fa48("18722", "18723", "18724"), nodeId.length > NUM.ZERO)))))))]) : stryMutAct_9fa48("18725") ? ["Stryker was here"] : (stryCov_9fa48("18725"), []);
        }
      } catch (_error) {
        if (stryMutAct_9fa48("18726")) {
          {}
        } else {
          stryCov_9fa48("18726");
          return stryMutAct_9fa48("18727") ? ["Stryker was here"] : (stryCov_9fa48("18727"), []);
        }
      }
    }
  }
  getReadyNodes(options = {}) {
    if (stryMutAct_9fa48("18728")) {
      {}
    } else {
      stryCov_9fa48("18728");
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const nodeRows = stryMutAct_9fa48("18731") ? systemTableCache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("18730") ? false : stryMutAct_9fa48("18729") ? true : (stryCov_9fa48("18729", "18730", "18731"), systemTableCache.getAll(TABLES.NODES) || (stryMutAct_9fa48("18732") ? ["Stryker was here"] : (stryCov_9fa48("18732"), [])));
      const serviceRows = stryMutAct_9fa48("18735") ? systemTableCache.getAll(TABLES.SERVICES) && [] : stryMutAct_9fa48("18734") ? false : stryMutAct_9fa48("18733") ? true : (stryCov_9fa48("18733", "18734", "18735"), systemTableCache.getAll(TABLES.SERVICES) || (stryMutAct_9fa48("18736") ? ["Stryker was here"] : (stryCov_9fa48("18736"), [])));
      const nodeEndpointRows = stryMutAct_9fa48("18739") ? systemTableCache.getAll(TABLES.NODE_ENDPOINTS) && [] : stryMutAct_9fa48("18738") ? false : stryMutAct_9fa48("18737") ? true : (stryCov_9fa48("18737", "18738", "18739"), systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || (stryMutAct_9fa48("18740") ? ["Stryker was here"] : (stryCov_9fa48("18740"), [])));
      const readinessService = this.getControlPlaneReadinessService();
      const readinessByNodeId = {};
      const candidateNodeIds = new Set();
      if (stryMutAct_9fa48("18743") ? readinessService || typeof readinessService.getNodeReadinessSync === TYPEOF.FUNCTION : stryMutAct_9fa48("18742") ? false : stryMutAct_9fa48("18741") ? true : (stryCov_9fa48("18741", "18742", "18743"), readinessService && (stryMutAct_9fa48("18745") ? typeof readinessService.getNodeReadinessSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("18744") ? true : (stryCov_9fa48("18744", "18745"), typeof readinessService.getNodeReadinessSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("18746")) {
          {}
        } else {
          stryCov_9fa48("18746");
          for (const nodeRow of nodeRows) {
            if (stryMutAct_9fa48("18747")) {
              {}
            } else {
              stryCov_9fa48("18747");
              const nodeId = stryMutAct_9fa48("18750") ? (nodeRow?.node_id || nodeRow?.nodeId) && null : stryMutAct_9fa48("18749") ? false : stryMutAct_9fa48("18748") ? true : (stryCov_9fa48("18748", "18749", "18750"), (stryMutAct_9fa48("18752") ? nodeRow?.node_id && nodeRow?.nodeId : stryMutAct_9fa48("18751") ? false : (stryCov_9fa48("18751", "18752"), (stryMutAct_9fa48("18753") ? nodeRow.node_id : (stryCov_9fa48("18753"), nodeRow?.node_id)) || (stryMutAct_9fa48("18754") ? nodeRow.nodeId : (stryCov_9fa48("18754"), nodeRow?.nodeId)))) || null);
              if (stryMutAct_9fa48("18756") ? false : stryMutAct_9fa48("18755") ? true : (stryCov_9fa48("18755", "18756"), nodeId)) {
                if (stryMutAct_9fa48("18757")) {
                  {}
                } else {
                  stryCov_9fa48("18757");
                  candidateNodeIds.add(nodeId);
                }
              }
            }
          }
          for (const serviceRow of serviceRows) {
            if (stryMutAct_9fa48("18758")) {
              {}
            } else {
              stryCov_9fa48("18758");
              const nodeId = stryMutAct_9fa48("18761") ? (serviceRow?.node_id || serviceRow?.nodeId) && null : stryMutAct_9fa48("18760") ? false : stryMutAct_9fa48("18759") ? true : (stryCov_9fa48("18759", "18760", "18761"), (stryMutAct_9fa48("18763") ? serviceRow?.node_id && serviceRow?.nodeId : stryMutAct_9fa48("18762") ? false : (stryCov_9fa48("18762", "18763"), (stryMutAct_9fa48("18764") ? serviceRow.node_id : (stryCov_9fa48("18764"), serviceRow?.node_id)) || (stryMutAct_9fa48("18765") ? serviceRow.nodeId : (stryCov_9fa48("18765"), serviceRow?.nodeId)))) || null);
              if (stryMutAct_9fa48("18767") ? false : stryMutAct_9fa48("18766") ? true : (stryCov_9fa48("18766", "18767"), nodeId)) {
                if (stryMutAct_9fa48("18768")) {
                  {}
                } else {
                  stryCov_9fa48("18768");
                  candidateNodeIds.add(nodeId);
                }
              }
            }
          }
          for (const endpointRow of nodeEndpointRows) {
            if (stryMutAct_9fa48("18769")) {
              {}
            } else {
              stryCov_9fa48("18769");
              const nodeId = stryMutAct_9fa48("18772") ? (endpointRow?.node_id || endpointRow?.nodeId) && null : stryMutAct_9fa48("18771") ? false : stryMutAct_9fa48("18770") ? true : (stryCov_9fa48("18770", "18771", "18772"), (stryMutAct_9fa48("18774") ? endpointRow?.node_id && endpointRow?.nodeId : stryMutAct_9fa48("18773") ? false : (stryCov_9fa48("18773", "18774"), (stryMutAct_9fa48("18775") ? endpointRow.node_id : (stryCov_9fa48("18775"), endpointRow?.node_id)) || (stryMutAct_9fa48("18776") ? endpointRow.nodeId : (stryCov_9fa48("18776"), endpointRow?.nodeId)))) || null);
              if (stryMutAct_9fa48("18778") ? false : stryMutAct_9fa48("18777") ? true : (stryCov_9fa48("18777", "18778"), nodeId)) {
                if (stryMutAct_9fa48("18779")) {
                  {}
                } else {
                  stryCov_9fa48("18779");
                  candidateNodeIds.add(nodeId);
                }
              }
            }
          }
          for (const nodeId of candidateNodeIds) {
            if (stryMutAct_9fa48("18780")) {
              {}
            } else {
              stryCov_9fa48("18780");
              const readiness = readinessService.getNodeReadinessSync(nodeId);
              if (stryMutAct_9fa48("18783") ? readiness || typeof readiness === TYPEOF.OBJECT : stryMutAct_9fa48("18782") ? false : stryMutAct_9fa48("18781") ? true : (stryCov_9fa48("18781", "18782", "18783"), readiness && (stryMutAct_9fa48("18785") ? typeof readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("18784") ? true : (stryCov_9fa48("18784", "18785"), typeof readiness === TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("18786")) {
                  {}
                } else {
                  stryCov_9fa48("18786");
                  readinessByNodeId[nodeId] = readiness;
                }
              }
            }
          }
        }
      }
      const readyNodes = resolveCanonicalActiveNodeIds(stryMutAct_9fa48("18787") ? {} : (stryCov_9fa48("18787"), {
        nodeRows,
        serviceRows,
        nodeEndpointRows,
        publicationRows: this.getPublicationRows(),
        requirePublishedMembership: stryMutAct_9fa48("18790") ? options.requirePublishedMembership !== true : stryMutAct_9fa48("18789") ? false : stryMutAct_9fa48("18788") ? true : (stryCov_9fa48("18788", "18789", "18790"), options.requirePublishedMembership === (stryMutAct_9fa48("18791") ? false : (stryCov_9fa48("18791"), true))),
        readinessByNodeId
      }));
      const seedNodeId = this.getSeedNodeId();
      const startupAuthorityReadyNodeIds = (stryMutAct_9fa48("18794") ? options.requirePublishedMembership !== true : stryMutAct_9fa48("18793") ? false : stryMutAct_9fa48("18792") ? true : (stryCov_9fa48("18792", "18793", "18794"), options.requirePublishedMembership === (stryMutAct_9fa48("18795") ? false : (stryCov_9fa48("18795"), true)))) ? stryMutAct_9fa48("18796") ? ["Stryker was here"] : (stryCov_9fa48("18796"), []) : this.getStartupAuthorityReadyNodeIds(seedNodeId);
      if (stryMutAct_9fa48("18800") ? startupAuthorityReadyNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("18799") ? startupAuthorityReadyNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("18798") ? false : stryMutAct_9fa48("18797") ? true : (stryCov_9fa48("18797", "18798", "18799", "18800"), startupAuthorityReadyNodeIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("18801")) {
          {}
        } else {
          stryCov_9fa48("18801");
          const filteredReadyNodeIds = stryMutAct_9fa48("18802") ? startupAuthorityReadyNodeIds : (stryCov_9fa48("18802"), startupAuthorityReadyNodeIds.filter(stryMutAct_9fa48("18803") ? () => undefined : (stryCov_9fa48("18803"), nodeId => stryMutAct_9fa48("18806") ? candidateNodeIds.size === NUM.ZERO && candidateNodeIds.has(nodeId) : stryMutAct_9fa48("18805") ? false : stryMutAct_9fa48("18804") ? true : (stryCov_9fa48("18804", "18805", "18806"), (stryMutAct_9fa48("18808") ? candidateNodeIds.size !== NUM.ZERO : stryMutAct_9fa48("18807") ? false : (stryCov_9fa48("18807", "18808"), candidateNodeIds.size === NUM.ZERO)) || candidateNodeIds.has(nodeId)))));
          if (stryMutAct_9fa48("18812") ? filteredReadyNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("18811") ? filteredReadyNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("18810") ? false : stryMutAct_9fa48("18809") ? true : (stryCov_9fa48("18809", "18810", "18811", "18812"), filteredReadyNodeIds.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("18813")) {
              {}
            } else {
              stryCov_9fa48("18813");
              return filteredReadyNodeIds;
            }
          }
        }
      }
      if (stryMutAct_9fa48("18816") ? options.requirePublishedMembership !== true && seedNodeId && !readyNodes.includes(seedNodeId) || canTreatSeedAsBootstrapReady(readinessByNodeId[seedNodeId]) : stryMutAct_9fa48("18815") ? false : stryMutAct_9fa48("18814") ? true : (stryCov_9fa48("18814", "18815", "18816"), (stryMutAct_9fa48("18818") ? options.requirePublishedMembership !== true && seedNodeId || !readyNodes.includes(seedNodeId) : stryMutAct_9fa48("18817") ? true : (stryCov_9fa48("18817", "18818"), (stryMutAct_9fa48("18820") ? options.requirePublishedMembership !== true || seedNodeId : stryMutAct_9fa48("18819") ? true : (stryCov_9fa48("18819", "18820"), (stryMutAct_9fa48("18822") ? options.requirePublishedMembership === true : stryMutAct_9fa48("18821") ? true : (stryCov_9fa48("18821", "18822"), options.requirePublishedMembership !== (stryMutAct_9fa48("18823") ? false : (stryCov_9fa48("18823"), true)))) && seedNodeId)) && (stryMutAct_9fa48("18824") ? readyNodes.includes(seedNodeId) : (stryCov_9fa48("18824"), !readyNodes.includes(seedNodeId))))) && canTreatSeedAsBootstrapReady(readinessByNodeId[seedNodeId]))) {
        if (stryMutAct_9fa48("18825")) {
          {}
        } else {
          stryCov_9fa48("18825");
          readyNodes.push(seedNodeId);
        }
      }
      return readyNodes;
    }
  }
  getTablePolicies() {
    if (stryMutAct_9fa48("18826")) {
      {}
    } else {
      stryCov_9fa48("18826");
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const tables = stryMutAct_9fa48("18829") ? systemTableCache.getAll(TABLES.TABLES) && [] : stryMutAct_9fa48("18828") ? false : stryMutAct_9fa48("18827") ? true : (stryCov_9fa48("18827", "18828", "18829"), systemTableCache.getAll(TABLES.TABLES) || (stryMutAct_9fa48("18830") ? ["Stryker was here"] : (stryCov_9fa48("18830"), [])));
      const policies = {};
      for (const table of tables) {
        if (stryMutAct_9fa48("18831")) {
          {}
        } else {
          stryCov_9fa48("18831");
          const tableName = stryMutAct_9fa48("18834") ? table.table_id && table.table_name : stryMutAct_9fa48("18833") ? false : stryMutAct_9fa48("18832") ? true : (stryCov_9fa48("18832", "18833", "18834"), table.table_id || table.table_name);
          if (stryMutAct_9fa48("18837") ? false : stryMutAct_9fa48("18836") ? true : stryMutAct_9fa48("18835") ? tableName : (stryCov_9fa48("18835", "18836", "18837"), !tableName)) {
            if (stryMutAct_9fa48("18838")) {
              {}
            } else {
              stryCov_9fa48("18838");
              continue;
            }
          }
          let policy = table.table_policies;
          if (stryMutAct_9fa48("18841") ? typeof policy === TYPEOF.STRING || policy.length > NUM.ZERO : stryMutAct_9fa48("18840") ? false : stryMutAct_9fa48("18839") ? true : (stryCov_9fa48("18839", "18840", "18841"), (stryMutAct_9fa48("18843") ? typeof policy !== TYPEOF.STRING : stryMutAct_9fa48("18842") ? true : (stryCov_9fa48("18842", "18843"), typeof policy === TYPEOF.STRING)) && (stryMutAct_9fa48("18846") ? policy.length <= NUM.ZERO : stryMutAct_9fa48("18845") ? policy.length >= NUM.ZERO : stryMutAct_9fa48("18844") ? true : (stryCov_9fa48("18844", "18845", "18846"), policy.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("18847")) {
              {}
            } else {
              stryCov_9fa48("18847");
              try {
                if (stryMutAct_9fa48("18848")) {
                  {}
                } else {
                  stryCov_9fa48("18848");
                  policy = JSON.parse(policy);
                }
              } catch (error) {
                if (stryMutAct_9fa48("18849")) {
                  {}
                } else {
                  stryCov_9fa48("18849");
                  throw new Error(stryMutAct_9fa48("18850") ? `` : (stryCov_9fa48("18850"), `Invalid table policy for ${tableName}: ${error.message}`));
                }
              }
            }
          }
          policies[tableName] = stryMutAct_9fa48("18853") ? policy && {} : stryMutAct_9fa48("18852") ? false : stryMutAct_9fa48("18851") ? true : (stryCov_9fa48("18851", "18852", "18853"), policy || {});
        }
      }
      return policies;
    }
  }
  getCurrentEpoch() {
    if (stryMutAct_9fa48("18854")) {
      {}
    } else {
      stryCov_9fa48("18854");
      const epochManager = this.getEpochManager();
      if (stryMutAct_9fa48("18857") ? false : stryMutAct_9fa48("18856") ? true : stryMutAct_9fa48("18855") ? epochManager : (stryCov_9fa48("18855", "18856", "18857"), !epochManager)) {
        if (stryMutAct_9fa48("18858")) {
          {}
        } else {
          stryCov_9fa48("18858");
          return null;
        }
      }
      const epoch = epochManager.getCurrentEpoch();
      return (stryMutAct_9fa48("18861") ? typeof epoch?.toObject !== TYPEOF.FUNCTION : stryMutAct_9fa48("18860") ? false : stryMutAct_9fa48("18859") ? true : (stryCov_9fa48("18859", "18860", "18861"), typeof (stryMutAct_9fa48("18862") ? epoch.toObject : (stryCov_9fa48("18862"), epoch?.toObject)) === TYPEOF.FUNCTION)) ? epoch.toObject() : epoch;
    }
  }
  getClusterConfiguration() {
    if (stryMutAct_9fa48("18863")) {
      {}
    } else {
      stryCov_9fa48("18863");
      const config = ConfigurationManager.getInstance();
      return stryMutAct_9fa48("18864") ? {} : (stryCov_9fa48("18864"), {
        raft: config.getCategory(CONFIG_CATEGORY.RAFT),
        messageGroup: config.getCategory(CONFIG_CATEGORY.MESSAGE_GROUP),
        partition: config.getCategory(CONFIG_CATEGORY.PARTITION),
        logging: config.getCategory(CONFIG_CATEGORY.LOGGING)
      });
    }
  }
  getClusterState() {
    if (stryMutAct_9fa48("18865")) {
      {}
    } else {
      stryCov_9fa48("18865");
      const nodes = stryMutAct_9fa48("18866") ? ["Stryker was here"] : (stryCov_9fa48("18866"), []);
      const messageGroups = stryMutAct_9fa48("18867") ? ["Stryker was here"] : (stryCov_9fa48("18867"), []);
      const activeNodeIds = new Set(this.getReadyNodes(stryMutAct_9fa48("18868") ? {} : (stryCov_9fa48("18868"), {
        requirePublishedMembership: stryMutAct_9fa48("18869") ? false : (stryCov_9fa48("18869"), true)
      })));
      nodes.push(stryMutAct_9fa48("18870") ? {} : (stryCov_9fa48("18870"), {
        nodeId: this.getSeedNodeId(),
        nodeAddress: this.getSeedNodeAddress(),
        status: activeNodeIds.has(this.getSeedNodeId()) ? SERVICE_STATUS.ACTIVE : BOOTSTRAP_API_CLUSTER_STATE.UNKNOWN,
        isSeed: stryMutAct_9fa48("18871") ? false : (stryCov_9fa48("18871"), true)
      }));
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const allNodes = stryMutAct_9fa48("18874") ? systemTableCache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("18873") ? false : stryMutAct_9fa48("18872") ? true : (stryCov_9fa48("18872", "18873", "18874"), systemTableCache.getAll(TABLES.NODES) || (stryMutAct_9fa48("18875") ? ["Stryker was here"] : (stryCov_9fa48("18875"), [])));
      for (const node of allNodes) {
        if (stryMutAct_9fa48("18876")) {
          {}
        } else {
          stryCov_9fa48("18876");
          if (stryMutAct_9fa48("18879") ? node.node_id !== this.getSeedNodeId() : stryMutAct_9fa48("18878") ? false : stryMutAct_9fa48("18877") ? true : (stryCov_9fa48("18877", "18878", "18879"), node.node_id === this.getSeedNodeId())) {
            if (stryMutAct_9fa48("18880")) {
              {}
            } else {
              stryCov_9fa48("18880");
              continue;
            }
          }
          nodes.push(stryMutAct_9fa48("18881") ? {} : (stryCov_9fa48("18881"), {
            nodeId: node.node_id,
            nodeAddress: node.node_address,
            status: activeNodeIds.has(node.node_id) ? SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("18884") ? node.status && BOOTSTRAP_API_CLUSTER_STATE.UNKNOWN : stryMutAct_9fa48("18883") ? false : stryMutAct_9fa48("18882") ? true : (stryCov_9fa48("18882", "18883", "18884"), node.status || BOOTSTRAP_API_CLUSTER_STATE.UNKNOWN),
            isSeed: stryMutAct_9fa48("18885") ? true : (stryCov_9fa48("18885"), false)
          }));
        }
      }
      const groups = this.getMessageGroups();
      for (const group of groups) {
        if (stryMutAct_9fa48("18886")) {
          {}
        } else {
          stryCov_9fa48("18886");
          messageGroups.push(stryMutAct_9fa48("18887") ? {} : (stryCov_9fa48("18887"), {
            groupId: group.group_id,
            replicaCount: stryMutAct_9fa48("18890") ? group.replicas?.length && NUM.ZERO : stryMutAct_9fa48("18889") ? false : stryMutAct_9fa48("18888") ? true : (stryCov_9fa48("18888", "18889", "18890"), (stryMutAct_9fa48("18891") ? group.replicas.length : (stryCov_9fa48("18891"), group.replicas?.length)) || NUM.ZERO),
            replicas: stryMutAct_9fa48("18894") ? group.replicas && [] : stryMutAct_9fa48("18893") ? false : stryMutAct_9fa48("18892") ? true : (stryCov_9fa48("18892", "18893", "18894"), group.replicas || (stryMutAct_9fa48("18895") ? ["Stryker was here"] : (stryCov_9fa48("18895"), [])))
          }));
        }
      }
      return stryMutAct_9fa48("18896") ? {} : (stryCov_9fa48("18896"), {
        seedNodeId: this.getSeedNodeId(),
        nodeCount: nodes.length,
        nodes,
        messageGroupCount: messageGroups.length,
        messageGroups,
        timestamp: Date.now()
      });
    }
  }
}
export { BootstrapClusterViewOwner };