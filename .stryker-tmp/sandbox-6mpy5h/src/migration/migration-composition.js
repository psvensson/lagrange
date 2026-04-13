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
import { MigrationCoordinator } from './migration-coordinator.js';
import { MigrationPipeline } from './migration-pipeline.js';

/**
 * Build migration workflow owners for one SQL query engine.
 * @param {Object} options
 * @param {Object} options.sqlCore - SQL query engine instance.
 * @param {Object} options.systemTableCache - System cache.
 * @param {Object|null} [options.transactionCoordinator]
 * @param {Object|null} [options.logger]
 * @param {Function|null} [options.now]
 * @return {Object}
 */
function createMigrationWorkflowOwners(options = {}) {
  if (stryMutAct_9fa48("89983")) {
    {}
  } else {
    stryCov_9fa48("89983");
    const migrationCoordinator = new MigrationCoordinator(stryMutAct_9fa48("89984") ? {} : (stryCov_9fa48("89984"), {
      sqlCore: options.sqlCore,
      systemTableCache: options.systemTableCache,
      transactionCoordinator: stryMutAct_9fa48("89987") ? options.transactionCoordinator && null : stryMutAct_9fa48("89986") ? false : stryMutAct_9fa48("89985") ? true : (stryCov_9fa48("89985", "89986", "89987"), options.transactionCoordinator || null),
      logger: stryMutAct_9fa48("89990") ? options.logger && console : stryMutAct_9fa48("89989") ? false : stryMutAct_9fa48("89988") ? true : (stryCov_9fa48("89988", "89989", "89990"), options.logger || console),
      now: stryMutAct_9fa48("89993") ? options.now && (() => Date.now()) : stryMutAct_9fa48("89992") ? false : stryMutAct_9fa48("89991") ? true : (stryCov_9fa48("89991", "89992", "89993"), options.now || (stryMutAct_9fa48("89994") ? () => undefined : (stryCov_9fa48("89994"), () => Date.now())))
    }));
    const migrationPipeline = new MigrationPipeline(stryMutAct_9fa48("89995") ? {} : (stryCov_9fa48("89995"), {
      migrationCoordinator,
      logger: stryMutAct_9fa48("89998") ? options.logger && console : stryMutAct_9fa48("89997") ? false : stryMutAct_9fa48("89996") ? true : (stryCov_9fa48("89996", "89997", "89998"), options.logger || console)
    }));
    return stryMutAct_9fa48("89999") ? {} : (stryCov_9fa48("89999"), {
      migrationCoordinator,
      migrationPipeline
    });
  }
}

/**
 * Attach migration workflow owners to one SQL query engine.
 * @param {Object} options
 * @param {Object} options.sqlCore - SQL query engine instance.
 * @param {Object} options.systemTableCache - System cache.
 * @param {Object|null} [options.transactionCoordinator]
 * @param {Object|null} [options.logger]
 * @param {Function|null} [options.now]
 * @return {Object}
 */
function wireMigrationWorkflowOwners(options = {}) {
  if (stryMutAct_9fa48("90000")) {
    {}
  } else {
    stryCov_9fa48("90000");
    const owners = createMigrationWorkflowOwners(options);
    options.sqlCore.setMigrationCoordinator(owners.migrationCoordinator);
    options.sqlCore.setMigrationPipeline(owners.migrationPipeline);
    return owners;
  }
}
export { createMigrationWorkflowOwners, wireMigrationWorkflowOwners };