/**
 * Admin storage diagnostics command handlers.
 *
 * Provides capacity snapshot and reservation visibility for admin/CLI
 * consumers. Follows the same handler pattern as admin-meta-command-handlers.
 *
 * Requirements: 10.3, 10.4, 10.5
 */

import {SQL, TABLES, COLUMN, NUM} from '../constants/index.js';
import {
  RESERVATION_STATUS,
  STORAGE_ADMIN_COMMAND,
} from '../rebalancer/storage-capacity-constants.js';

const LOCAL_STR_FZHH8 = 'accountingService not available';

const SELECT_ALL_FROM = `${SQL.SELECT} * FROM`;

/**
 * Handle getStorageCapacity command.
 * Returns capacity snapshots from the accounting service.
 * Optionally filtered by nodeId.
 * @param {Object} params - Optional {nodeId}.
 * @param {Object} context - {accountingService}.
 * @return {Promise<Object>} result with snapshots.
 */
async function handleGetStorageCapacity(params, context) {
  const accountingService = context?.accountingService;
  if (!accountingService) {
    return {
      success: false,
      errors: [LOCAL_STR_FZHH8],
    };
  }

  if (params && params.nodeId) {
    const snapshot = await accountingService
      .getCapacitySnapshotForNode(params.nodeId);
    return {
      success: true,
      command: STORAGE_ADMIN_COMMAND.GET_STORAGE_CAPACITY,
      snapshots: snapshot ? [snapshot] : [],
    };
  }

  const snapshots = await accountingService.getCapacitySnapshots();
  return {
    success: true,
    command: STORAGE_ADMIN_COMMAND.GET_STORAGE_CAPACITY,
    snapshots: snapshots || [],
  };
}

/**
 * Handle getStorageReservations command.
 * Returns SQL to query storage_reservations table with optional filters.
 * @param {Object} params - Optional {nodeId, status}.
 * @return {Object} result with sql/params for execution.
 */
function handleGetStorageReservations(params) {
  let sql = `${SELECT_ALL_FROM} ${TABLES.STORAGE_RESERVATIONS}`;
  const filters = [];
  const sqlParams = [];

  if (params && params.nodeId) {
    sqlParams.push(params.nodeId);
    filters.push(
      `${COLUMN.TARGET_NODE_ID} = ?${sqlParams.length}`,
    );
  }

  if (params && params.status) {
    sqlParams.push(params.status);
    filters.push(
      `${COLUMN.STATUS} = ?${sqlParams.length}`,
    );
  } else {
    sqlParams.push(RESERVATION_STATUS.ACTIVE);
    filters.push(
      `${COLUMN.STATUS} = ?${sqlParams.length}`,
    );
  }

  if (filters.length > NUM.ZERO) {
    sql += ` ${SQL.WHERE} ${filters.join(` ${SQL.AND} `)}`;
  }

  return {
    success: true,
    command: STORAGE_ADMIN_COMMAND.GET_STORAGE_RESERVATIONS,
    sql,
    params: sqlParams,
  };
}

export {
  handleGetStorageCapacity,
  handleGetStorageReservations,
};
