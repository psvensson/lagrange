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
import { NUM, TYPEOF } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
function normalizeVisiblePartitionServices(services) {
  if (stryMutAct_9fa48("108585")) {
    {}
  } else {
    stryCov_9fa48("108585");
    return stryMutAct_9fa48("108587") ? (Array.isArray(services) ? services : []).filter(service => {
      const nodeId = String(service?.node_id || service?.nodeId || '');
      return nodeId.length > NUM.ZERO;
    }) : stryMutAct_9fa48("108586") ? (Array.isArray(services) ? services : []).filter(service => service && typeof service === TYPEOF.OBJECT) : (stryCov_9fa48("108586", "108587"), (Array.isArray(services) ? services : stryMutAct_9fa48("108588") ? ["Stryker was here"] : (stryCov_9fa48("108588"), [])).filter(stryMutAct_9fa48("108589") ? () => undefined : (stryCov_9fa48("108589"), service => stryMutAct_9fa48("108592") ? service || typeof service === TYPEOF.OBJECT : stryMutAct_9fa48("108591") ? false : stryMutAct_9fa48("108590") ? true : (stryCov_9fa48("108590", "108591", "108592"), service && (stryMutAct_9fa48("108594") ? typeof service !== TYPEOF.OBJECT : stryMutAct_9fa48("108593") ? true : (stryCov_9fa48("108593", "108594"), typeof service === TYPEOF.OBJECT))))).filter(service => {
      if (stryMutAct_9fa48("108595")) {
        {}
      } else {
        stryCov_9fa48("108595");
        const nodeId = String(stryMutAct_9fa48("108598") ? (service?.node_id || service?.nodeId) && '' : stryMutAct_9fa48("108597") ? false : stryMutAct_9fa48("108596") ? true : (stryCov_9fa48("108596", "108597", "108598"), (stryMutAct_9fa48("108600") ? service?.node_id && service?.nodeId : stryMutAct_9fa48("108599") ? false : (stryCov_9fa48("108599", "108600"), (stryMutAct_9fa48("108601") ? service.node_id : (stryCov_9fa48("108601"), service?.node_id)) || (stryMutAct_9fa48("108602") ? service.nodeId : (stryCov_9fa48("108602"), service?.nodeId)))) || (stryMutAct_9fa48("108603") ? "Stryker was here!" : (stryCov_9fa48("108603"), ''))));
        return stryMutAct_9fa48("108607") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("108606") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("108605") ? false : stryMutAct_9fa48("108604") ? true : (stryCov_9fa48("108604", "108605", "108606", "108607"), nodeId.length > NUM.ZERO);
      }
    }));
  }
}
function resolveBootstrapLeaderSelection(options = {}) {
  if (stryMutAct_9fa48("108608")) {
    {}
  } else {
    stryCov_9fa48("108608");
    const visibleServices = normalizeVisiblePartitionServices(stryMutAct_9fa48("108609") ? options.services : (stryCov_9fa48("108609"), options?.services));
    const hintedLeaderNodeId = String(stryMutAct_9fa48("108612") ? (options?.hintedLeaderNodeId || options?.bootstrapLeaderNodeId) && '' : stryMutAct_9fa48("108611") ? false : stryMutAct_9fa48("108610") ? true : (stryCov_9fa48("108610", "108611", "108612"), (stryMutAct_9fa48("108614") ? options?.hintedLeaderNodeId && options?.bootstrapLeaderNodeId : stryMutAct_9fa48("108613") ? false : (stryCov_9fa48("108613", "108614"), (stryMutAct_9fa48("108615") ? options.hintedLeaderNodeId : (stryCov_9fa48("108615"), options?.hintedLeaderNodeId)) || (stryMutAct_9fa48("108616") ? options.bootstrapLeaderNodeId : (stryCov_9fa48("108616"), options?.bootstrapLeaderNodeId)))) || (stryMutAct_9fa48("108617") ? "Stryker was here!" : (stryCov_9fa48("108617"), ''))));
    const leaderServices = stryMutAct_9fa48("108618") ? visibleServices : (stryCov_9fa48("108618"), visibleServices.filter(service => {
      if (stryMutAct_9fa48("108619")) {
        {}
      } else {
        stryCov_9fa48("108619");
        return stryMutAct_9fa48("108622") ? String(service?.raft_role || '').toLowerCase() !== String(RAFT_ROLE.LEADER).toLowerCase() : stryMutAct_9fa48("108621") ? false : stryMutAct_9fa48("108620") ? true : (stryCov_9fa48("108620", "108621", "108622"), (stryMutAct_9fa48("108623") ? String(service?.raft_role || '').toUpperCase() : (stryCov_9fa48("108623"), String(stryMutAct_9fa48("108626") ? service?.raft_role && '' : stryMutAct_9fa48("108625") ? false : stryMutAct_9fa48("108624") ? true : (stryCov_9fa48("108624", "108625", "108626"), (stryMutAct_9fa48("108627") ? service.raft_role : (stryCov_9fa48("108627"), service?.raft_role)) || (stryMutAct_9fa48("108628") ? "Stryker was here!" : (stryCov_9fa48("108628"), '')))).toLowerCase())) === (stryMutAct_9fa48("108629") ? String(RAFT_ROLE.LEADER).toUpperCase() : (stryCov_9fa48("108629"), String(RAFT_ROLE.LEADER).toLowerCase())));
      }
    }));
    if (stryMutAct_9fa48("108632") ? leaderServices.length !== NUM.ONE : stryMutAct_9fa48("108631") ? false : stryMutAct_9fa48("108630") ? true : (stryCov_9fa48("108630", "108631", "108632"), leaderServices.length === NUM.ONE)) {
      if (stryMutAct_9fa48("108633")) {
        {}
      } else {
        stryCov_9fa48("108633");
        return stryMutAct_9fa48("108634") ? {} : (stryCov_9fa48("108634"), {
          selectedService: leaderServices[NUM.ZERO],
          leaderNodeId: stryMutAct_9fa48("108637") ? (leaderServices[NUM.ZERO]?.node_id || leaderServices[NUM.ZERO]?.nodeId) && null : stryMutAct_9fa48("108636") ? false : stryMutAct_9fa48("108635") ? true : (stryCov_9fa48("108635", "108636", "108637"), (stryMutAct_9fa48("108639") ? leaderServices[NUM.ZERO]?.node_id && leaderServices[NUM.ZERO]?.nodeId : stryMutAct_9fa48("108638") ? false : (stryCov_9fa48("108638", "108639"), (stryMutAct_9fa48("108640") ? leaderServices[NUM.ZERO].node_id : (stryCov_9fa48("108640"), leaderServices[NUM.ZERO]?.node_id)) || (stryMutAct_9fa48("108641") ? leaderServices[NUM.ZERO].nodeId : (stryCov_9fa48("108641"), leaderServices[NUM.ZERO]?.nodeId)))) || null),
          selectionSource: stryMutAct_9fa48("108642") ? "" : (stryCov_9fa48("108642"), 'leader_role')
        });
      }
    }
    if (stryMutAct_9fa48("108646") ? hintedLeaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("108645") ? hintedLeaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("108644") ? false : stryMutAct_9fa48("108643") ? true : (stryCov_9fa48("108643", "108644", "108645", "108646"), hintedLeaderNodeId.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("108647")) {
        {}
      } else {
        stryCov_9fa48("108647");
        const hintedServices = stryMutAct_9fa48("108648") ? visibleServices : (stryCov_9fa48("108648"), visibleServices.filter(service => {
          if (stryMutAct_9fa48("108649")) {
            {}
          } else {
            stryCov_9fa48("108649");
            const nodeId = stryMutAct_9fa48("108652") ? (service?.node_id || service?.nodeId) && null : stryMutAct_9fa48("108651") ? false : stryMutAct_9fa48("108650") ? true : (stryCov_9fa48("108650", "108651", "108652"), (stryMutAct_9fa48("108654") ? service?.node_id && service?.nodeId : stryMutAct_9fa48("108653") ? false : (stryCov_9fa48("108653", "108654"), (stryMutAct_9fa48("108655") ? service.node_id : (stryCov_9fa48("108655"), service?.node_id)) || (stryMutAct_9fa48("108656") ? service.nodeId : (stryCov_9fa48("108656"), service?.nodeId)))) || null);
            return stryMutAct_9fa48("108659") ? nodeId !== hintedLeaderNodeId : stryMutAct_9fa48("108658") ? false : stryMutAct_9fa48("108657") ? true : (stryCov_9fa48("108657", "108658", "108659"), nodeId === hintedLeaderNodeId);
          }
        }));
        if (stryMutAct_9fa48("108662") ? hintedServices.length !== NUM.ONE : stryMutAct_9fa48("108661") ? false : stryMutAct_9fa48("108660") ? true : (stryCov_9fa48("108660", "108661", "108662"), hintedServices.length === NUM.ONE)) {
          if (stryMutAct_9fa48("108663")) {
            {}
          } else {
            stryCov_9fa48("108663");
            return stryMutAct_9fa48("108664") ? {} : (stryCov_9fa48("108664"), {
              selectedService: hintedServices[NUM.ZERO],
              leaderNodeId: hintedLeaderNodeId,
              selectionSource: stryMutAct_9fa48("108665") ? "" : (stryCov_9fa48("108665"), 'leader_hint')
            });
          }
        }
      }
    }
    if (stryMutAct_9fa48("108668") ? options?.allowSingleReplicaFallback !== false || visibleServices.length === NUM.ONE : stryMutAct_9fa48("108667") ? false : stryMutAct_9fa48("108666") ? true : (stryCov_9fa48("108666", "108667", "108668"), (stryMutAct_9fa48("108670") ? options?.allowSingleReplicaFallback === false : stryMutAct_9fa48("108669") ? true : (stryCov_9fa48("108669", "108670"), (stryMutAct_9fa48("108671") ? options.allowSingleReplicaFallback : (stryCov_9fa48("108671"), options?.allowSingleReplicaFallback)) !== (stryMutAct_9fa48("108672") ? true : (stryCov_9fa48("108672"), false)))) && (stryMutAct_9fa48("108674") ? visibleServices.length !== NUM.ONE : stryMutAct_9fa48("108673") ? true : (stryCov_9fa48("108673", "108674"), visibleServices.length === NUM.ONE)))) {
      if (stryMutAct_9fa48("108675")) {
        {}
      } else {
        stryCov_9fa48("108675");
        return stryMutAct_9fa48("108676") ? {} : (stryCov_9fa48("108676"), {
          selectedService: visibleServices[NUM.ZERO],
          leaderNodeId: stryMutAct_9fa48("108679") ? (visibleServices[NUM.ZERO]?.node_id || visibleServices[NUM.ZERO]?.nodeId) && null : stryMutAct_9fa48("108678") ? false : stryMutAct_9fa48("108677") ? true : (stryCov_9fa48("108677", "108678", "108679"), (stryMutAct_9fa48("108681") ? visibleServices[NUM.ZERO]?.node_id && visibleServices[NUM.ZERO]?.nodeId : stryMutAct_9fa48("108680") ? false : (stryCov_9fa48("108680", "108681"), (stryMutAct_9fa48("108682") ? visibleServices[NUM.ZERO].node_id : (stryCov_9fa48("108682"), visibleServices[NUM.ZERO]?.node_id)) || (stryMutAct_9fa48("108683") ? visibleServices[NUM.ZERO].nodeId : (stryCov_9fa48("108683"), visibleServices[NUM.ZERO]?.nodeId)))) || null),
          selectionSource: stryMutAct_9fa48("108684") ? "" : (stryCov_9fa48("108684"), 'single_service')
        });
      }
    }
    return stryMutAct_9fa48("108685") ? {} : (stryCov_9fa48("108685"), {
      selectedService: null,
      leaderNodeId: null,
      selectionSource: null
    });
  }
}
export { resolveBootstrapLeaderSelection };