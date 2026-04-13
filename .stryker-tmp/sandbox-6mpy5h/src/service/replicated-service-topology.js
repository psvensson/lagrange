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
import { AddressManager } from '../address/address-manager.js';
import { ENTITY_TYPE, NUM, SERVICE_TYPE, TYPEOF } from '../constants/index.js';
function normalizeString(value) {
  if (stryMutAct_9fa48("149888")) {
    {}
  } else {
    stryCov_9fa48("149888");
    return (stryMutAct_9fa48("149891") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("149890") ? false : stryMutAct_9fa48("149889") ? true : (stryCov_9fa48("149889", "149890", "149891"), typeof value === TYPEOF.STRING)) ? stryMutAct_9fa48("149892") ? value : (stryCov_9fa48("149892"), value.trim()) : stryMutAct_9fa48("149893") ? "Stryker was here!" : (stryCov_9fa48("149893"), '');
  }
}
function normalizeServiceType(serviceType) {
  if (stryMutAct_9fa48("149894")) {
    {}
  } else {
    stryCov_9fa48("149894");
    return stryMutAct_9fa48("149895") ? normalizeString(serviceType).toUpperCase() : (stryCov_9fa48("149895"), normalizeString(serviceType).toLowerCase());
  }
}
function resolveEntityTypeForServiceType(serviceType) {
  if (stryMutAct_9fa48("149896")) {
    {}
  } else {
    stryCov_9fa48("149896");
    const normalizedServiceType = normalizeServiceType(serviceType);
    if (stryMutAct_9fa48("149899") ? normalizedServiceType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("149898") ? false : stryMutAct_9fa48("149897") ? true : (stryCov_9fa48("149897", "149898", "149899"), normalizedServiceType === SERVICE_TYPE.PARTITION)) {
      if (stryMutAct_9fa48("149900")) {
        {}
      } else {
        stryCov_9fa48("149900");
        return ENTITY_TYPE.PARTITION;
      }
    }
    if (stryMutAct_9fa48("149903") ? normalizedServiceType !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("149902") ? false : stryMutAct_9fa48("149901") ? true : (stryCov_9fa48("149901", "149902", "149903"), normalizedServiceType === SERVICE_TYPE.MESSAGE_GROUP)) {
      if (stryMutAct_9fa48("149904")) {
        {}
      } else {
        stryCov_9fa48("149904");
        return ENTITY_TYPE.MESSAGE_GROUP;
      }
    }
    return null;
  }
}
function formatReplicatedServiceAddress(serviceType, nodeId, replicaId, explicitAddress = stryMutAct_9fa48("149905") ? "Stryker was here!" : (stryCov_9fa48("149905"), '')) {
  if (stryMutAct_9fa48("149906")) {
    {}
  } else {
    stryCov_9fa48("149906");
    const normalizedAddress = normalizeString(explicitAddress);
    if (stryMutAct_9fa48("149910") ? normalizedAddress.length <= NUM.ZERO : stryMutAct_9fa48("149909") ? normalizedAddress.length >= NUM.ZERO : stryMutAct_9fa48("149908") ? false : stryMutAct_9fa48("149907") ? true : (stryCov_9fa48("149907", "149908", "149909", "149910"), normalizedAddress.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("149911")) {
        {}
      } else {
        stryCov_9fa48("149911");
        return normalizedAddress;
      }
    }
    const normalizedNodeId = normalizeString(nodeId);
    const normalizedReplicaId = normalizeString(replicaId);
    const entityType = resolveEntityTypeForServiceType(serviceType);
    if (stryMutAct_9fa48("149914") ? (normalizedNodeId.length === NUM.ZERO || normalizedReplicaId.length === NUM.ZERO) && entityType === null : stryMutAct_9fa48("149913") ? false : stryMutAct_9fa48("149912") ? true : (stryCov_9fa48("149912", "149913", "149914"), (stryMutAct_9fa48("149916") ? normalizedNodeId.length === NUM.ZERO && normalizedReplicaId.length === NUM.ZERO : stryMutAct_9fa48("149915") ? false : (stryCov_9fa48("149915", "149916"), (stryMutAct_9fa48("149918") ? normalizedNodeId.length !== NUM.ZERO : stryMutAct_9fa48("149917") ? false : (stryCov_9fa48("149917", "149918"), normalizedNodeId.length === NUM.ZERO)) || (stryMutAct_9fa48("149920") ? normalizedReplicaId.length !== NUM.ZERO : stryMutAct_9fa48("149919") ? false : (stryCov_9fa48("149919", "149920"), normalizedReplicaId.length === NUM.ZERO)))) || (stryMutAct_9fa48("149922") ? entityType !== null : stryMutAct_9fa48("149921") ? false : (stryCov_9fa48("149921", "149922"), entityType === null)))) {
      if (stryMutAct_9fa48("149923")) {
        {}
      } else {
        stryCov_9fa48("149923");
        return null;
      }
    }
    return AddressManager.getInstance().format(normalizedNodeId, entityType, normalizedReplicaId);
  }
}
function buildReplicatedServiceBootstrapTopology(options = {}) {
  if (stryMutAct_9fa48("149924")) {
    {}
  } else {
    stryCov_9fa48("149924");
    const serviceType = normalizeServiceType(options.serviceType);
    const entityType = resolveEntityTypeForServiceType(serviceType);
    if (stryMutAct_9fa48("149927") ? entityType !== null : stryMutAct_9fa48("149926") ? false : stryMutAct_9fa48("149925") ? true : (stryCov_9fa48("149925", "149926", "149927"), entityType === null)) {
      if (stryMutAct_9fa48("149928")) {
        {}
      } else {
        stryCov_9fa48("149928");
        return null;
      }
    }
    const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : stryMutAct_9fa48("149929") ? ["Stryker was here"] : (stryCov_9fa48("149929"), []);
    const excludeReplicaIds = new Set(stryMutAct_9fa48("149930") ? (Array.isArray(options.excludeReplicaIds) ? options.excludeReplicaIds : []).map(replicaId => normalizeString(replicaId)) : (stryCov_9fa48("149930"), (Array.isArray(options.excludeReplicaIds) ? options.excludeReplicaIds : stryMutAct_9fa48("149931") ? ["Stryker was here"] : (stryCov_9fa48("149931"), [])).map(stryMutAct_9fa48("149932") ? () => undefined : (stryCov_9fa48("149932"), replicaId => normalizeString(replicaId))).filter(stryMutAct_9fa48("149933") ? () => undefined : (stryCov_9fa48("149933"), replicaId => stryMutAct_9fa48("149937") ? replicaId.length <= NUM.ZERO : stryMutAct_9fa48("149936") ? replicaId.length >= NUM.ZERO : stryMutAct_9fa48("149935") ? false : stryMutAct_9fa48("149934") ? true : (stryCov_9fa48("149934", "149935", "149936", "149937"), replicaId.length > NUM.ZERO)))));
    const replicaIds = stryMutAct_9fa48("149938") ? ["Stryker was here"] : (stryCov_9fa48("149938"), []);
    const peerAddresses = stryMutAct_9fa48("149939") ? ["Stryker was here"] : (stryCov_9fa48("149939"), []);
    const seenReplicaIds = new Set();
    const seenPeerAddresses = new Set();
    const appendReplicaTopology = (replicaId, nodeId, address) => {
      if (stryMutAct_9fa48("149940")) {
        {}
      } else {
        stryCov_9fa48("149940");
        const normalizedReplicaId = normalizeString(replicaId);
        const normalizedNodeId = normalizeString(nodeId);
        if (stryMutAct_9fa48("149943") ? normalizedReplicaId.length === NUM.ZERO && excludeReplicaIds.has(normalizedReplicaId) : stryMutAct_9fa48("149942") ? false : stryMutAct_9fa48("149941") ? true : (stryCov_9fa48("149941", "149942", "149943"), (stryMutAct_9fa48("149945") ? normalizedReplicaId.length !== NUM.ZERO : stryMutAct_9fa48("149944") ? false : (stryCov_9fa48("149944", "149945"), normalizedReplicaId.length === NUM.ZERO)) || excludeReplicaIds.has(normalizedReplicaId))) {
          if (stryMutAct_9fa48("149946")) {
            {}
          } else {
            stryCov_9fa48("149946");
            return;
          }
        }
        if (stryMutAct_9fa48("149949") ? false : stryMutAct_9fa48("149948") ? true : stryMutAct_9fa48("149947") ? seenReplicaIds.has(normalizedReplicaId) : (stryCov_9fa48("149947", "149948", "149949"), !seenReplicaIds.has(normalizedReplicaId))) {
          if (stryMutAct_9fa48("149950")) {
            {}
          } else {
            stryCov_9fa48("149950");
            seenReplicaIds.add(normalizedReplicaId);
            replicaIds.push(normalizedReplicaId);
          }
        }
        const resolvedAddress = formatReplicatedServiceAddress(serviceType, normalizedNodeId, normalizedReplicaId, address);
        if (stryMutAct_9fa48("149953") ? typeof resolvedAddress === TYPEOF.STRING && resolvedAddress.length > NUM.ZERO || !seenPeerAddresses.has(resolvedAddress) : stryMutAct_9fa48("149952") ? false : stryMutAct_9fa48("149951") ? true : (stryCov_9fa48("149951", "149952", "149953"), (stryMutAct_9fa48("149955") ? typeof resolvedAddress === TYPEOF.STRING || resolvedAddress.length > NUM.ZERO : stryMutAct_9fa48("149954") ? true : (stryCov_9fa48("149954", "149955"), (stryMutAct_9fa48("149957") ? typeof resolvedAddress !== TYPEOF.STRING : stryMutAct_9fa48("149956") ? true : (stryCov_9fa48("149956", "149957"), typeof resolvedAddress === TYPEOF.STRING)) && (stryMutAct_9fa48("149960") ? resolvedAddress.length <= NUM.ZERO : stryMutAct_9fa48("149959") ? resolvedAddress.length >= NUM.ZERO : stryMutAct_9fa48("149958") ? true : (stryCov_9fa48("149958", "149959", "149960"), resolvedAddress.length > NUM.ZERO)))) && (stryMutAct_9fa48("149961") ? seenPeerAddresses.has(resolvedAddress) : (stryCov_9fa48("149961"), !seenPeerAddresses.has(resolvedAddress))))) {
          if (stryMutAct_9fa48("149962")) {
            {}
          } else {
            stryCov_9fa48("149962");
            seenPeerAddresses.add(resolvedAddress);
            peerAddresses.push(resolvedAddress);
          }
        }
      }
    };
    for (const row of serviceRows) {
      if (stryMutAct_9fa48("149963")) {
        {}
      } else {
        stryCov_9fa48("149963");
        appendReplicaTopology(stryMutAct_9fa48("149966") ? (row?.service_id || row?.replica_id) && null : stryMutAct_9fa48("149965") ? false : stryMutAct_9fa48("149964") ? true : (stryCov_9fa48("149964", "149965", "149966"), (stryMutAct_9fa48("149968") ? row?.service_id && row?.replica_id : stryMutAct_9fa48("149967") ? false : (stryCov_9fa48("149967", "149968"), (stryMutAct_9fa48("149969") ? row.service_id : (stryCov_9fa48("149969"), row?.service_id)) || (stryMutAct_9fa48("149970") ? row.replica_id : (stryCov_9fa48("149970"), row?.replica_id)))) || null), stryMutAct_9fa48("149973") ? row?.node_id && null : stryMutAct_9fa48("149972") ? false : stryMutAct_9fa48("149971") ? true : (stryCov_9fa48("149971", "149972", "149973"), (stryMutAct_9fa48("149974") ? row.node_id : (stryCov_9fa48("149974"), row?.node_id)) || null), stryMutAct_9fa48("149977") ? row?.address && null : stryMutAct_9fa48("149976") ? false : stryMutAct_9fa48("149975") ? true : (stryCov_9fa48("149975", "149976", "149977"), (stryMutAct_9fa48("149978") ? row.address : (stryCov_9fa48("149978"), row?.address)) || null));
      }
    }
    appendReplicaTopology(options.targetReplicaId, options.targetNodeId, options.targetAddress);
    return stryMutAct_9fa48("149979") ? {} : (stryCov_9fa48("149979"), {
      replicaIds,
      peerAddresses
    });
  }
}
export { buildReplicatedServiceBootstrapTopology, formatReplicatedServiceAddress, resolveEntityTypeForServiceType };