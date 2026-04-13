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
import { RAFT_ID_MAPPER_DEFAULT, RAFT_ID_MAPPER_ERROR_MSG } from './raft-id-mapper-constants.js';

/**
 * Build deterministic external<->internal ID maps for a replica set.
 * @param {Array<string>} externalIds
 * @param {Object} [options]
 * @param {number} [options.minInternalNodeId]
 * @param {number} [options.clusterNodeIdStep]
 * @return {{
 *   externalToInternal: Map<string, string>,
 *   internalToExternal: Map<string, string>,
 * }}
 */
function buildDeterministicRaftIdMaps(externalIds, options = {}) {
  if (stryMutAct_9fa48("127952")) {
    {}
  } else {
    stryCov_9fa48("127952");
    if (stryMutAct_9fa48("127955") ? !Array.isArray(externalIds) && externalIds.length === 0 : stryMutAct_9fa48("127954") ? false : stryMutAct_9fa48("127953") ? true : (stryCov_9fa48("127953", "127954", "127955"), (stryMutAct_9fa48("127956") ? Array.isArray(externalIds) : (stryCov_9fa48("127956"), !Array.isArray(externalIds))) || (stryMutAct_9fa48("127958") ? externalIds.length !== 0 : stryMutAct_9fa48("127957") ? false : (stryCov_9fa48("127957", "127958"), externalIds.length === 0)))) {
      if (stryMutAct_9fa48("127959")) {
        {}
      } else {
        stryCov_9fa48("127959");
        throw new Error(RAFT_ID_MAPPER_ERROR_MSG.INVALID_EXTERNAL_IDS);
      }
    }
    const minInternalNodeId = Number.isInteger(options.minInternalNodeId) ? options.minInternalNodeId : RAFT_ID_MAPPER_DEFAULT.MIN_INTERNAL_NODE_ID;
    const clusterNodeIdStep = Number.isInteger(options.clusterNodeIdStep) ? options.clusterNodeIdStep : RAFT_ID_MAPPER_DEFAULT.CLUSTER_NODE_ID_STEP;
    if (stryMutAct_9fa48("127962") ? minInternalNodeId < 1 && clusterNodeIdStep < 1 : stryMutAct_9fa48("127961") ? false : stryMutAct_9fa48("127960") ? true : (stryCov_9fa48("127960", "127961", "127962"), (stryMutAct_9fa48("127965") ? minInternalNodeId >= 1 : stryMutAct_9fa48("127964") ? minInternalNodeId <= 1 : stryMutAct_9fa48("127963") ? false : (stryCov_9fa48("127963", "127964", "127965"), minInternalNodeId < 1)) || (stryMutAct_9fa48("127968") ? clusterNodeIdStep >= 1 : stryMutAct_9fa48("127967") ? clusterNodeIdStep <= 1 : stryMutAct_9fa48("127966") ? false : (stryCov_9fa48("127966", "127967", "127968"), clusterNodeIdStep < 1)))) {
      if (stryMutAct_9fa48("127969")) {
        {}
      } else {
        stryCov_9fa48("127969");
        throw new Error(RAFT_ID_MAPPER_ERROR_MSG.INVALID_INTERNAL_ID_OPTIONS);
      }
    }
    const externalToInternal = new Map();
    const internalToExternal = new Map();
    let nextId = minInternalNodeId;
    for (const externalIdValue of externalIds) {
      if (stryMutAct_9fa48("127970")) {
        {}
      } else {
        stryCov_9fa48("127970");
        if (stryMutAct_9fa48("127973") ? typeof externalIdValue !== 'string' && externalIdValue.trim() === '' : stryMutAct_9fa48("127972") ? false : stryMutAct_9fa48("127971") ? true : (stryCov_9fa48("127971", "127972", "127973"), (stryMutAct_9fa48("127975") ? typeof externalIdValue === 'string' : stryMutAct_9fa48("127974") ? false : (stryCov_9fa48("127974", "127975"), typeof externalIdValue !== (stryMutAct_9fa48("127976") ? "" : (stryCov_9fa48("127976"), 'string')))) || (stryMutAct_9fa48("127978") ? externalIdValue.trim() !== '' : stryMutAct_9fa48("127977") ? false : (stryCov_9fa48("127977", "127978"), (stryMutAct_9fa48("127979") ? externalIdValue : (stryCov_9fa48("127979"), externalIdValue.trim())) === (stryMutAct_9fa48("127980") ? "Stryker was here!" : (stryCov_9fa48("127980"), '')))))) {
          if (stryMutAct_9fa48("127981")) {
            {}
          } else {
            stryCov_9fa48("127981");
            throw new Error(RAFT_ID_MAPPER_ERROR_MSG.INVALID_EXTERNAL_ID);
          }
        }
        const externalId = String(externalIdValue);
        if (stryMutAct_9fa48("127983") ? false : stryMutAct_9fa48("127982") ? true : (stryCov_9fa48("127982", "127983"), externalToInternal.has(externalId))) {
          if (stryMutAct_9fa48("127984")) {
            {}
          } else {
            stryCov_9fa48("127984");
            throw new Error(RAFT_ID_MAPPER_ERROR_MSG.duplicateExternalId(externalId));
          }
        }
        const internalId = String(nextId);
        stryMutAct_9fa48("127985") ? nextId -= clusterNodeIdStep : (stryCov_9fa48("127985"), nextId += clusterNodeIdStep);
        externalToInternal.set(externalId, internalId);
        internalToExternal.set(internalId, externalId);
      }
    }
    assertBijectiveRaftIdMaps(externalToInternal, internalToExternal);
    return stryMutAct_9fa48("127986") ? {} : (stryCov_9fa48("127986"), {
      externalToInternal,
      internalToExternal
    });
  }
}

/**
 * Validate that the two raft ID maps are bijective.
 * @param {Map<string, string>} externalToInternal
 * @param {Map<string, string>} internalToExternal
 */
function assertBijectiveRaftIdMaps(externalToInternal, internalToExternal) {
  if (stryMutAct_9fa48("127987")) {
    {}
  } else {
    stryCov_9fa48("127987");
    if (stryMutAct_9fa48("127990") ? externalToInternal.size === internalToExternal.size : stryMutAct_9fa48("127989") ? false : stryMutAct_9fa48("127988") ? true : (stryCov_9fa48("127988", "127989", "127990"), externalToInternal.size !== internalToExternal.size)) {
      if (stryMutAct_9fa48("127991")) {
        {}
      } else {
        stryCov_9fa48("127991");
        throw new Error(RAFT_ID_MAPPER_ERROR_MSG.NON_BIJECTIVE_MAPPING);
      }
    }
    for (const [externalId, internalId] of externalToInternal.entries()) {
      if (stryMutAct_9fa48("127992")) {
        {}
      } else {
        stryCov_9fa48("127992");
        if (stryMutAct_9fa48("127995") ? internalToExternal.get(internalId) === externalId : stryMutAct_9fa48("127994") ? false : stryMutAct_9fa48("127993") ? true : (stryCov_9fa48("127993", "127994", "127995"), internalToExternal.get(internalId) !== externalId)) {
          if (stryMutAct_9fa48("127996")) {
            {}
          } else {
            stryCov_9fa48("127996");
            throw new Error(RAFT_ID_MAPPER_ERROR_MSG.NON_BIJECTIVE_MAPPING);
          }
        }
      }
    }
  }
}
export { assertBijectiveRaftIdMaps, buildDeterministicRaftIdMaps };