/**
 * Admin storage diagnostics command handlers.
 *
 * Provides capacity snapshot and reservation visibility for admin/CLI
 * consumers. Follows the same handler pattern as admin-meta-command-handlers.
 *
 * Requirements: 10.3, 10.4, 10.5
 */
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
import { SQL, TABLES, COLUMN, NUM } from '../constants/index.js';
import { RESERVATION_STATUS, STORAGE_ADMIN_COMMAND } from '../rebalancer/storage-capacity-constants.js';
const SELECT_ALL_FROM = stryMutAct_9fa48("7160") ? `` : (stryCov_9fa48("7160"), `${SQL.SELECT} * FROM`);

/**
 * Handle getStorageCapacity command.
 * Returns capacity snapshots from the accounting service.
 * Optionally filtered by nodeId.
 * @param {Object} params - Optional {nodeId}.
 * @param {Object} context - {accountingService}.
 * @return {Promise<Object>} result with snapshots.
 */
async function handleGetStorageCapacity(params, context) {
  if (stryMutAct_9fa48("7161")) {
    {}
  } else {
    stryCov_9fa48("7161");
    const accountingService = stryMutAct_9fa48("7162") ? context.accountingService : (stryCov_9fa48("7162"), context?.accountingService);
    if (stryMutAct_9fa48("7165") ? false : stryMutAct_9fa48("7164") ? true : stryMutAct_9fa48("7163") ? accountingService : (stryCov_9fa48("7163", "7164", "7165"), !accountingService)) {
      if (stryMutAct_9fa48("7166")) {
        {}
      } else {
        stryCov_9fa48("7166");
        return stryMutAct_9fa48("7167") ? {} : (stryCov_9fa48("7167"), {
          success: stryMutAct_9fa48("7168") ? true : (stryCov_9fa48("7168"), false),
          errors: stryMutAct_9fa48("7169") ? [] : (stryCov_9fa48("7169"), [stryMutAct_9fa48("7170") ? "" : (stryCov_9fa48("7170"), 'accountingService not available')])
        });
      }
    }
    if (stryMutAct_9fa48("7173") ? params || params.nodeId : stryMutAct_9fa48("7172") ? false : stryMutAct_9fa48("7171") ? true : (stryCov_9fa48("7171", "7172", "7173"), params && params.nodeId)) {
      if (stryMutAct_9fa48("7174")) {
        {}
      } else {
        stryCov_9fa48("7174");
        const snapshot = await accountingService.getCapacitySnapshotForNode(params.nodeId);
        return stryMutAct_9fa48("7175") ? {} : (stryCov_9fa48("7175"), {
          success: stryMutAct_9fa48("7176") ? false : (stryCov_9fa48("7176"), true),
          command: STORAGE_ADMIN_COMMAND.GET_STORAGE_CAPACITY,
          snapshots: snapshot ? stryMutAct_9fa48("7177") ? [] : (stryCov_9fa48("7177"), [snapshot]) : stryMutAct_9fa48("7178") ? ["Stryker was here"] : (stryCov_9fa48("7178"), [])
        });
      }
    }
    const snapshots = await accountingService.getCapacitySnapshots();
    return stryMutAct_9fa48("7179") ? {} : (stryCov_9fa48("7179"), {
      success: stryMutAct_9fa48("7180") ? false : (stryCov_9fa48("7180"), true),
      command: STORAGE_ADMIN_COMMAND.GET_STORAGE_CAPACITY,
      snapshots: stryMutAct_9fa48("7183") ? snapshots && [] : stryMutAct_9fa48("7182") ? false : stryMutAct_9fa48("7181") ? true : (stryCov_9fa48("7181", "7182", "7183"), snapshots || (stryMutAct_9fa48("7184") ? ["Stryker was here"] : (stryCov_9fa48("7184"), [])))
    });
  }
}

/**
 * Handle getStorageReservations command.
 * Returns SQL to query storage_reservations table with optional filters.
 * @param {Object} params - Optional {nodeId, status}.
 * @return {Object} result with sql/params for execution.
 */
function handleGetStorageReservations(params) {
  if (stryMutAct_9fa48("7185")) {
    {}
  } else {
    stryCov_9fa48("7185");
    let sql = stryMutAct_9fa48("7186") ? `` : (stryCov_9fa48("7186"), `${SELECT_ALL_FROM} ${TABLES.STORAGE_RESERVATIONS}`);
    const filters = stryMutAct_9fa48("7187") ? ["Stryker was here"] : (stryCov_9fa48("7187"), []);
    const sqlParams = stryMutAct_9fa48("7188") ? ["Stryker was here"] : (stryCov_9fa48("7188"), []);
    if (stryMutAct_9fa48("7191") ? params || params.nodeId : stryMutAct_9fa48("7190") ? false : stryMutAct_9fa48("7189") ? true : (stryCov_9fa48("7189", "7190", "7191"), params && params.nodeId)) {
      if (stryMutAct_9fa48("7192")) {
        {}
      } else {
        stryCov_9fa48("7192");
        sqlParams.push(params.nodeId);
        filters.push(stryMutAct_9fa48("7193") ? `` : (stryCov_9fa48("7193"), `${COLUMN.TARGET_NODE_ID} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("7196") ? params || params.status : stryMutAct_9fa48("7195") ? false : stryMutAct_9fa48("7194") ? true : (stryCov_9fa48("7194", "7195", "7196"), params && params.status)) {
      if (stryMutAct_9fa48("7197")) {
        {}
      } else {
        stryCov_9fa48("7197");
        sqlParams.push(params.status);
        filters.push(stryMutAct_9fa48("7198") ? `` : (stryCov_9fa48("7198"), `${COLUMN.STATUS} = ?${sqlParams.length}`));
      }
    } else {
      if (stryMutAct_9fa48("7199")) {
        {}
      } else {
        stryCov_9fa48("7199");
        sqlParams.push(RESERVATION_STATUS.ACTIVE);
        filters.push(stryMutAct_9fa48("7200") ? `` : (stryCov_9fa48("7200"), `${COLUMN.STATUS} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("7204") ? filters.length <= NUM.ZERO : stryMutAct_9fa48("7203") ? filters.length >= NUM.ZERO : stryMutAct_9fa48("7202") ? false : stryMutAct_9fa48("7201") ? true : (stryCov_9fa48("7201", "7202", "7203", "7204"), filters.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("7205")) {
        {}
      } else {
        stryCov_9fa48("7205");
        sql += stryMutAct_9fa48("7206") ? `` : (stryCov_9fa48("7206"), ` ${SQL.WHERE} ${filters.join(stryMutAct_9fa48("7207") ? `` : (stryCov_9fa48("7207"), ` ${SQL.AND} `))}`);
      }
    }
    return stryMutAct_9fa48("7208") ? {} : (stryCov_9fa48("7208"), {
      success: stryMutAct_9fa48("7209") ? false : (stryCov_9fa48("7209"), true),
      command: STORAGE_ADMIN_COMMAND.GET_STORAGE_RESERVATIONS,
      sql,
      params: sqlParams
    });
  }
}
export { handleGetStorageCapacity, handleGetStorageReservations };