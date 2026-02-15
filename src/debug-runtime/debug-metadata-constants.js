/**
 * Constants for debug metadata table names and row fields.
 */

import {TABLES} from '../constants/index.js';

const DEBUG_METADATA_TABLE = Object.freeze({
  SESSIONS: TABLES.DEBUG_SESSIONS,
  BREAKPOINTS: TABLES.DEBUG_BREAKPOINTS,
  SNAPSHOTS: TABLES.DEBUG_SNAPSHOTS,
});

const DEBUG_SESSION_FIELD = Object.freeze({
  SESSION_ID: 'session_id',
  TENANT_ID: 'tenant_id',
  SERVICE_NAME: 'service_name',
  LINEAGE_ID: 'lineage_id',
  STAGE_ID: 'stage_id',
  NODE_ID: 'node_id',
  ENDPOINT: 'endpoint',
  STATUS: 'status',
  UPDATED_AT: 'updated_at',
  CREATED_AT: 'created_at',
});

const DEBUG_BREAKPOINT_FIELD = Object.freeze({
  BREAKPOINT_ID: 'breakpoint_id',
  SESSION_ID: 'session_id',
  MODULE_REF: 'module_ref',
  SOURCE_FILE_URL: 'source_file_url',
  LINE_NUMBER: 'line_number',
  COLUMN_NUMBER: 'column_number',
  CONDITION: 'condition',
  RESOLVED: 'resolved',
  UPDATED_AT: 'updated_at',
  CREATED_AT: 'created_at',
});

const DEBUG_SNAPSHOT_FIELD = Object.freeze({
  SNAPSHOT_ID: 'snapshot_id',
  SESSION_ID: 'session_id',
  MODULE_REF: 'module_ref',
  MODULE_DIGEST: 'module_digest',
  CAPTURED_AT: 'captured_at',
  FORMAT_VERSION: 'format_version',
  SNAPSHOT_BYTES_BASE64: 'snapshot_bytes_base64',
  MANIFEST_JSON: 'manifest_json',
  TOTAL_BYTES: 'total_bytes',
  FRAME_COUNT: 'frame_count',
  HOST_CALL_COUNT: 'host_call_count',
  UPDATED_AT: 'updated_at',
  CREATED_AT: 'created_at',
});

const DEBUG_SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  DETACHED: 'detached',
  STOPPED: 'stopped',
});

export {
  DEBUG_METADATA_TABLE,
  DEBUG_SESSION_FIELD,
  DEBUG_BREAKPOINT_FIELD,
  DEBUG_SNAPSHOT_FIELD,
  DEBUG_SESSION_STATUS,
};
