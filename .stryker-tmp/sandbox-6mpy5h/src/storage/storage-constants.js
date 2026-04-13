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
const STORAGE_SUBSYSTEM = stryMutAct_9fa48("151917") ? "" : (stryCov_9fa48("151917"), 'storage');
const STORAGE_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("151918") ? {} : (stryCov_9fa48("151918"), {
  DATA_DIR: stryMutAct_9fa48("151919") ? "" : (stryCov_9fa48("151919"), 'storage.dataDir')
}));
const STORAGE_DEFAULT = Object.freeze(stryMutAct_9fa48("151920") ? {} : (stryCov_9fa48("151920"), {
  DATA_DIR: stryMutAct_9fa48("151921") ? "" : (stryCov_9fa48("151921"), './data'),
  PARTITIONS_DIRNAME: stryMutAct_9fa48("151922") ? "" : (stryCov_9fa48("151922"), 'partitions'),
  WRITE_TEST_FILENAME: stryMutAct_9fa48("151923") ? "" : (stryCov_9fa48("151923"), '.write-test'),
  WRITE_TEST_CONTENT: stryMutAct_9fa48("151924") ? "" : (stryCov_9fa48("151924"), 'test'),
  DB_EXT: stryMutAct_9fa48("151925") ? "" : (stryCov_9fa48("151925"), '.db')
}));
const STORAGE_LOG_MSG = Object.freeze(stryMutAct_9fa48("151926") ? {} : (stryCov_9fa48("151926"), {
  DATA_DIR_CONFIGURED: stryMutAct_9fa48("151927") ? "" : (stryCov_9fa48("151927"), 'Data directory configured'),
  CREATED_DIRECTORY: stryMutAct_9fa48("151928") ? "" : (stryCov_9fa48("151928"), 'Created directory')
}));
const STORAGE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("151929") ? {} : (stryCov_9fa48("151929"), {
  NOT_INITIALIZED: stryMutAct_9fa48("151930") ? "" : (stryCov_9fa48("151930"), 'DataDirectoryManager not initialized'),
  MISSING_PARTITION_REPLICA_ID: stryMutAct_9fa48("151931") ? "" : (stryCov_9fa48("151931"), 'partitionId and replicaId are required'),
  MISSING_DATA_DIR_PARTITION_REPLICA_ID: stryMutAct_9fa48("151932") ? "" : (stryCov_9fa48("151932"), 'dataDir, partitionId, and replicaId are required')
}));
export { STORAGE_CONFIG_KEY, STORAGE_DEFAULT, STORAGE_ERROR_MSG, STORAGE_LOG_MSG, STORAGE_SUBSYSTEM };