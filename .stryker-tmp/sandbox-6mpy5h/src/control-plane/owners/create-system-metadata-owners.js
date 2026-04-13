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
import { ControlPlanePublicationsOwner } from './control-plane-publications-owner.js';
import { LogsOwner } from './logs-owner.js';
import { MessageGroupsOwner } from './message-groups-owner.js';
import { NodesOwner } from './nodes-owner.js';
import { PartitionsOwner } from './partitions-owner.js';
import { ReplicaOperationsOwner } from './replica-operations-owner.js';
import { ServiceDefinitionsOwner } from './service-definitions-owner.js';
import { ServiceEndpointsOwner } from './service-endpoints-owner.js';
import { ServicesOwner } from './services-owner.js';
function createOwnerOptions(options = {}) {
  if (stryMutAct_9fa48("69343")) {
    {}
  } else {
    stryCov_9fa48("69343");
    return stryMutAct_9fa48("69344") ? {} : (stryCov_9fa48("69344"), {
      controlPlaneSystemTableGateway: stryMutAct_9fa48("69347") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("69346") ? false : stryMutAct_9fa48("69345") ? true : (stryCov_9fa48("69345", "69346", "69347"), options.controlPlaneSystemTableGateway || null),
      systemTableCache: stryMutAct_9fa48("69350") ? options.systemTableCache && null : stryMutAct_9fa48("69349") ? false : stryMutAct_9fa48("69348") ? true : (stryCov_9fa48("69348", "69349", "69350"), options.systemTableCache || null)
    });
  }
}
function createSystemMetadataOwners(options = {}) {
  if (stryMutAct_9fa48("69351")) {
    {}
  } else {
    stryCov_9fa48("69351");
    const ownerOptions = createOwnerOptions(options);
    return Object.freeze(stryMutAct_9fa48("69352") ? {} : (stryCov_9fa48("69352"), {
      controlPlanePublicationsOwner: new ControlPlanePublicationsOwner(ownerOptions),
      nodesOwner: new NodesOwner(ownerOptions),
      servicesOwner: new ServicesOwner(ownerOptions),
      partitionsOwner: new PartitionsOwner(ownerOptions),
      messageGroupsOwner: new MessageGroupsOwner(ownerOptions),
      replicaOperationsOwner: new ReplicaOperationsOwner(ownerOptions),
      logsOwner: new LogsOwner(ownerOptions),
      serviceEndpointsOwner: new ServiceEndpointsOwner(ownerOptions),
      serviceDefinitionsOwner: new ServiceDefinitionsOwner(ownerOptions)
    }));
  }
}
export { createSystemMetadataOwners };