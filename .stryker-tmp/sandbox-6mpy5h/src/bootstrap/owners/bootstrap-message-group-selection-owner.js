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
import { buildMessageGroupOwnerNotReadyError, getBootstrapMessageGroupService, resolveOperationalMessageGroupSelection, resolveOperationalMessageGroupSelectionAsync, resolveQueryTransportMessageGroupSelection } from '../shared/message-group-selection.js';
class BootstrapMessageGroupSelectionOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("19304")) {
      {}
    } else {
      stryCov_9fa48("19304");
      this.delegates = stryMutAct_9fa48("19307") ? options.delegates && {} : stryMutAct_9fa48("19306") ? false : stryMutAct_9fa48("19305") ? true : (stryCov_9fa48("19305", "19306", "19307"), options.delegates || {});
    }
  }
  getMessageGroupServices() {
    if (stryMutAct_9fa48("19308")) {
      {}
    } else {
      stryCov_9fa48("19308");
      return stryMutAct_9fa48("19311") ? this.delegates.getMessageGroupServices?.() && null : stryMutAct_9fa48("19310") ? false : stryMutAct_9fa48("19309") ? true : (stryCov_9fa48("19309", "19310", "19311"), (stryMutAct_9fa48("19312") ? this.delegates.getMessageGroupServices() : (stryCov_9fa48("19312"), this.delegates.getMessageGroupServices?.())) || null);
    }
  }
  resolveOperationalMessageGroupSelection(options = {}) {
    if (stryMutAct_9fa48("19313")) {
      {}
    } else {
      stryCov_9fa48("19313");
      return resolveOperationalMessageGroupSelection(this.getMessageGroupServices(), options);
    }
  }
  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    if (stryMutAct_9fa48("19314")) {
      {}
    } else {
      stryCov_9fa48("19314");
      return resolveOperationalMessageGroupSelectionAsync(this.getMessageGroupServices(), options);
    }
  }
  resolveQueryTransportMessageGroupSelection() {
    if (stryMutAct_9fa48("19315")) {
      {}
    } else {
      stryCov_9fa48("19315");
      return resolveQueryTransportMessageGroupSelection(this.getMessageGroupServices());
    }
  }
  getBootstrapMessageGroupService() {
    if (stryMutAct_9fa48("19316")) {
      {}
    } else {
      stryCov_9fa48("19316");
      return getBootstrapMessageGroupService(this.getMessageGroupServices());
    }
  }
  buildMessageGroupOwnerNotReadyError(selection = {}, options = {}) {
    if (stryMutAct_9fa48("19317")) {
      {}
    } else {
      stryCov_9fa48("19317");
      return buildMessageGroupOwnerNotReadyError(selection, options);
    }
  }
}
export { BootstrapMessageGroupSelectionOwner };