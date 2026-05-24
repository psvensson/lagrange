/**
 * Row normalizers for SQL-backed debug metadata.
 */

import {
  TYPEOF,
} from '../constants/index.js';
import {
  DEBUG_SESSION_FIELD as DSF,
  DEBUG_BREAKPOINT_FIELD as DBF,
  DEBUG_SNAPSHOT_FIELD as DPF,
} from './debug-metadata-constants.js';
import {
  DEBUG_METADATA_DEFAULT as DEF,
} from './debug-metadata-service-constants.js';

const LOCAL_STR_BASE64 = 'base64';
const LOCAL_STR_EMPTY = '';

/**
 * @param {Object} row
 * @return {Object}
 */
function normalizeSessionRow(row) {
  return {
    sessionId: row[DSF.SESSION_ID],
    tenantId: row[DSF.TENANT_ID],
    serviceName: row[DSF.SERVICE_NAME],
    lineageId: row[DSF.LINEAGE_ID],
    stageId: row[DSF.STAGE_ID],
    nodeId: row[DSF.NODE_ID],
    endpoint: row[DSF.ENDPOINT],
    status: row[DSF.STATUS],
    createdAt: row[DSF.CREATED_AT],
    updatedAt: row[DSF.UPDATED_AT],
  };
}

/**
 * @param {Object} row
 * @return {Object}
 */
function normalizeBreakpointRow(row) {
  return {
    breakpointId: row[DBF.BREAKPOINT_ID],
    sessionId: row[DBF.SESSION_ID],
    tenantId: row[DBF.TENANT_ID],
    moduleRef: row[DBF.MODULE_REF],
    sourceFileUrl: row[DBF.SOURCE_FILE_URL],
    lineNumber: row[DBF.LINE_NUMBER],
    columnNumber: row[DBF.COLUMN_NUMBER],
    condition: row[DBF.CONDITION],
    resolved: row[DBF.RESOLVED] === DEF.RESOLVED_TRUE,
    createdAt: row[DBF.CREATED_AT],
    updatedAt: row[DBF.UPDATED_AT],
  };
}

/**
 * @param {Object} row
 * @param {boolean} includeEnvelope
 * @return {Object}
 */
function normalizeSnapshotRow(row, includeEnvelope) {
  let envelope = null;
  if (includeEnvelope) {
    envelope = Buffer.from(
      row[DPF.SNAPSHOT_BYTES_BASE64] || LOCAL_STR_EMPTY,
      LOCAL_STR_BASE64,
    );
  }

  return {
    snapshotId: row[DPF.SNAPSHOT_ID],
    sessionId: row[DPF.SESSION_ID],
    tenantId: row[DSF.TENANT_ID],
    moduleRef: row[DPF.MODULE_REF],
    moduleDigest: row[DPF.MODULE_DIGEST],
    capturedAt: row[DPF.CAPTURED_AT],
    formatVersion: row[DPF.FORMAT_VERSION],
    totalBytes: row[DPF.TOTAL_BYTES],
    frameCount: row[DPF.FRAME_COUNT],
    hostCallCount: row[DPF.HOST_CALL_COUNT],
    createdAt: row[DPF.CREATED_AT],
    updatedAt: row[DPF.UPDATED_AT],
    manifest: parseJson(row[DPF.MANIFEST_JSON], {}),
    envelope,
  };
}

/**
 * @param {string} value
 * @param {*} fallback
 * @return {*}
 */
function parseJson(value, fallback) {
  if (typeof value !== TYPEOF.STRING) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export {
  normalizeBreakpointRow,
  normalizeSessionRow,
  normalizeSnapshotRow,
};
