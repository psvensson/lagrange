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
import { ADDRESS, NUM, TYPEOF } from '../constants/index.js';
const ADDRESS_COMPONENT = Object.freeze(stryMutAct_9fa48("168") ? {} : (stryCov_9fa48("168"), {
  NODE_ID: stryMutAct_9fa48("169") ? "" : (stryCov_9fa48("169"), 'nodeId'),
  SERVICE_TYPE: stryMutAct_9fa48("170") ? "" : (stryCov_9fa48("170"), 'serviceType'),
  SERVICE_ID: stryMutAct_9fa48("171") ? "" : (stryCov_9fa48("171"), 'serviceId')
}));
const ADDRESS_TYPE = Object.freeze(stryMutAct_9fa48("172") ? {} : (stryCov_9fa48("172"), {
  NODE: stryMutAct_9fa48("173") ? "" : (stryCov_9fa48("173"), 'node'),
  SERVICE: stryMutAct_9fa48("174") ? "" : (stryCov_9fa48("174"), 'service')
}));
const ADDRESS_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("175") ? {} : (stryCov_9fa48("175"), {
  NAME: stryMutAct_9fa48("176") ? "" : (stryCov_9fa48("176"), 'address')
}));
const ADDRESS_ERROR_NAME = Object.freeze(stryMutAct_9fa48("177") ? {} : (stryCov_9fa48("177"), {
  MALFORMED: stryMutAct_9fa48("178") ? "" : (stryCov_9fa48("178"), 'MalformedAddressError'),
  EMPTY_COMPONENT: stryMutAct_9fa48("179") ? "" : (stryCov_9fa48("179"), 'EmptyComponentError')
}));
const ADDRESS_LOG_MSG = Object.freeze(stryMutAct_9fa48("180") ? {} : (stryCov_9fa48("180"), {
  GENERATED_NODE: stryMutAct_9fa48("181") ? "" : (stryCov_9fa48("181"), 'Generated node address'),
  GENERATED_SERVICE: stryMutAct_9fa48("182") ? "" : (stryCov_9fa48("182"), 'Generated service address'),
  INVALID_NODE_FORMAT: stryMutAct_9fa48("183") ? "" : (stryCov_9fa48("183"), 'Invalid node address format'),
  NODE_CONFLICT: stryMutAct_9fa48("184") ? "" : (stryCov_9fa48("184"), 'Node address conflict detected'),
  REGISTERED_NODE: stryMutAct_9fa48("185") ? "" : (stryCov_9fa48("185"), 'Registered node address'),
  INVALID_SERVICE_FORMAT: stryMutAct_9fa48("186") ? "" : (stryCov_9fa48("186"), 'Invalid service address format'),
  SERVICE_CONFLICT: stryMutAct_9fa48("187") ? "" : (stryCov_9fa48("187"), 'Service address conflict detected'),
  REGISTERED_SERVICE: stryMutAct_9fa48("188") ? "" : (stryCov_9fa48("188"), 'Registered service address'),
  UNREGISTERED_NODE: stryMutAct_9fa48("189") ? "" : (stryCov_9fa48("189"), 'Unregistered node address'),
  UNREGISTERED_SERVICE: stryMutAct_9fa48("190") ? "" : (stryCov_9fa48("190"), 'Unregistered service address'),
  CLEARED: stryMutAct_9fa48("191") ? "" : (stryCov_9fa48("191"), 'Cleared all addresses')
}));
const ADDRESS_ERROR_MSG = Object.freeze(stryMutAct_9fa48("192") ? {} : (stryCov_9fa48("192"), {
  MUST_BE_STRING: stryMutAct_9fa48("193") ? "" : (stryCov_9fa48("193"), 'Address must be a string'),
  componentEmpty: stryMutAct_9fa48("194") ? () => undefined : (stryCov_9fa48("194"), component => stryMutAct_9fa48("195") ? `` : (stryCov_9fa48("195"), `Address component '${component}' cannot be empty`)),
  mustHaveComponents: stryMutAct_9fa48("196") ? () => undefined : (stryCov_9fa48("196"), count => (stryMutAct_9fa48("197") ? `` : (stryCov_9fa48("197"), `Address must have exactly ${NUM.THREE} components separated by `)) + (stryMutAct_9fa48("198") ? `` : (stryCov_9fa48("198"), `'${ADDRESS.SEPARATOR}', got ${count}`))),
  componentCannotBeEmpty: stryMutAct_9fa48("199") ? () => undefined : (stryCov_9fa48("199"), component => stryMutAct_9fa48("200") ? `` : (stryCov_9fa48("200"), `${component} component cannot be empty`))
}));
const ADDRESS_FORMAT = Object.freeze(stryMutAct_9fa48("201") ? {} : (stryCov_9fa48("201"), {
  EMPTY: stryMutAct_9fa48("202") ? "Stryker was here!" : (stryCov_9fa48("202"), ''),
  build: stryMutAct_9fa48("203") ? () => undefined : (stryCov_9fa48("203"), (nodeId, serviceType, serviceId) => stryMutAct_9fa48("204") ? `` : (stryCov_9fa48("204"), `${nodeId}${ADDRESS.SEPARATOR}${serviceType}${ADDRESS.SEPARATOR}${serviceId}`))
}));
const ADDRESS_VALIDATE = Object.freeze(stryMutAct_9fa48("205") ? {} : (stryCov_9fa48("205"), {
  TYPEOF_STRING: TYPEOF.STRING,
  COMPONENT_COUNT: NUM.THREE
}));
export { ADDRESS_COMPONENT, ADDRESS_ERROR_MSG, ADDRESS_ERROR_NAME, ADDRESS_FORMAT, ADDRESS_LOG_MSG, ADDRESS_SUBSYSTEM, ADDRESS_TYPE, ADDRESS_VALIDATE };