// @ts-nocheck
// Shared SQL fragments used across subsystems. Keep these small and composable
// (keywords + common operators) so callers can still build readable SQL.
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
const SQL = Object.freeze(stryMutAct_9fa48("54775") ? {} : (stryCov_9fa48("54775"), {
  INSERT_INTO: stryMutAct_9fa48("54776") ? "" : (stryCov_9fa48("54776"), 'INSERT INTO'),
  INSERT_OR_REPLACE_INTO: stryMutAct_9fa48("54777") ? "" : (stryCov_9fa48("54777"), 'INSERT OR REPLACE INTO'),
  INSERT_OR_IGNORE_INTO: stryMutAct_9fa48("54778") ? "" : (stryCov_9fa48("54778"), 'INSERT OR IGNORE INTO'),
  UPDATE: stryMutAct_9fa48("54779") ? "" : (stryCov_9fa48("54779"), 'UPDATE'),
  DELETE_FROM: stryMutAct_9fa48("54780") ? "" : (stryCov_9fa48("54780"), 'DELETE FROM'),
  SELECT: stryMutAct_9fa48("54781") ? "" : (stryCov_9fa48("54781"), 'SELECT'),
  WHERE: stryMutAct_9fa48("54782") ? "" : (stryCov_9fa48("54782"), 'WHERE'),
  VALUES: stryMutAct_9fa48("54783") ? "" : (stryCov_9fa48("54783"), 'VALUES'),
  SET: stryMutAct_9fa48("54784") ? "" : (stryCov_9fa48("54784"), 'SET'),
  AND: stryMutAct_9fa48("54785") ? "" : (stryCov_9fa48("54785"), 'AND'),
  OR: stryMutAct_9fa48("54786") ? "" : (stryCov_9fa48("54786"), 'OR'),
  IN: stryMutAct_9fa48("54787") ? "" : (stryCov_9fa48("54787"), 'IN'),
  LIMIT: stryMutAct_9fa48("54788") ? "" : (stryCov_9fa48("54788"), 'LIMIT'),
  ORDER_BY: stryMutAct_9fa48("54789") ? "" : (stryCov_9fa48("54789"), 'ORDER BY'),
  GROUP_BY: stryMutAct_9fa48("54790") ? "" : (stryCov_9fa48("54790"), 'GROUP BY'),
  RETURNING: stryMutAct_9fa48("54791") ? "" : (stryCov_9fa48("54791"), 'RETURNING')
}));
export { SQL };