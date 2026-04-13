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
class BootstrapSystemTableWriter {
  constructor(cdcIntegrationService, partitionServices) {
    if (stryMutAct_9fa48("33413")) {
      {}
    } else {
      stryCov_9fa48("33413");
      this.cdcIntegrationService = cdcIntegrationService;
      this.partitionServices = partitionServices;
    }
  }
  enable() {
    if (stryMutAct_9fa48("33414")) {
      {}
    } else {
      stryCov_9fa48("33414");
      this.cdcIntegrationService.setBootstrapMode(stryMutAct_9fa48("33415") ? false : (stryCov_9fa48("33415"), true), this.partitionServices);
    }
  }
  disable() {
    if (stryMutAct_9fa48("33416")) {
      {}
    } else {
      stryCov_9fa48("33416");
      this.cdcIntegrationService.setBootstrapMode(stryMutAct_9fa48("33417") ? true : (stryCov_9fa48("33417"), false), null);
    }
  }
  upsertSystemTableRow(tableName, data) {
    if (stryMutAct_9fa48("33418")) {
      {}
    } else {
      stryCov_9fa48("33418");
      return this.cdcIntegrationService.upsertSystemTableRow(tableName, data);
    }
  }
  updateSystemTableRow(tableName, keyData, updateData) {
    if (stryMutAct_9fa48("33419")) {
      {}
    } else {
      stryCov_9fa48("33419");
      return this.cdcIntegrationService.updateSystemTableRow(tableName, keyData, updateData);
    }
  }
}
class RoutedSqlSystemTableWriter {
  constructor(cdcIntegrationService) {
    if (stryMutAct_9fa48("33420")) {
      {}
    } else {
      stryCov_9fa48("33420");
      this.cdcIntegrationService = cdcIntegrationService;
    }
  }
  enable() {
    if (stryMutAct_9fa48("33421")) {
      {}
    } else {
      stryCov_9fa48("33421");
      this.cdcIntegrationService.setBootstrapMode(stryMutAct_9fa48("33422") ? true : (stryCov_9fa48("33422"), false), null);
    }
  }
  disable() {}
  upsertSystemTableRow(tableName, data) {
    if (stryMutAct_9fa48("33423")) {
      {}
    } else {
      stryCov_9fa48("33423");
      return this.cdcIntegrationService.upsertSystemTableRow(tableName, data);
    }
  }
  updateSystemTableRow(tableName, keyData, updateData) {
    if (stryMutAct_9fa48("33424")) {
      {}
    } else {
      stryCov_9fa48("33424");
      return this.cdcIntegrationService.updateSystemTableRow(tableName, keyData, updateData);
    }
  }
}
export { BootstrapSystemTableWriter, RoutedSqlSystemTableWriter };