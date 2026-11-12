// Original publication is a bootstrap interaction: row owners construct the
// birth, preparation consumes its durable right, and the shared read gateway
// proves the exact committed value. There is no cache or response-only grant.
import {ORIGINAL_ALLOCATION_COLUMN as RIGHT, ORIGINAL_ALLOCATION_REASON as REASON,
  originalAllocationError} from '../raft/raft-rs-original-allocation-constants.js';
import {SYSTEM_TABLE_NAME} from './system-table-schemas-constants.js';
import {COLUMN} from '../constants/columns.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows} from
  '../control-plane/control-plane-system-table-gateway.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from
  '../cdc/cdc-integration-service-shared-constants.js';
import {CLUSTER_ID_CONFIG_KEY} from './cluster-identity-constants.js';
import {FORMATION_TARGET_CONFIG_KEY, FORMATION_TARGET_RECORD_ERROR_CODE as RECORD_ERROR,
  decodeFormationTargetValue, formationTargetRecordError} from './formation-target-record.js';

const ORIGINAL_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  localReadConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
});
const ORIGINAL_ROW_STATE = Object.freeze({
  PRESENT: 'present', ABSENT: 'absent', UNAVAILABLE: 'unavailable'});
const ORIGINAL_ROW_READ = Object.freeze({
  [SYSTEM_TABLE_NAME.SERVICES]: 'SELECT * FROM services WHERE service_id = ?',
  [SYSTEM_TABLE_NAME.CONFIG]: 'SELECT * FROM config WHERE config_key = ?',
});

// One keyed authoritative read: PRESENT with the single row, ABSENT only on
// an explicit empty success, UNAVAILABLE for any other answer.
async function readOriginalRow(writer, tableName, key) {
  const read = await readAuthoritativeControlPlaneRows(writer, tableName,
    ORIGINAL_ROW_READ[tableName], [key], {readAuthority: ORIGINAL_READ_AUTHORITY});
  if (read?.success !== true || !Array.isArray(read.rows) || read.rows.length > 1) {
    return {state: ORIGINAL_ROW_STATE.UNAVAILABLE, row: null};
  }
  return read.rows.length === 1 ?
    {state: ORIGINAL_ROW_STATE.PRESENT, row: read.rows[0]} :
    {state: ORIGINAL_ROW_STATE.ABSENT, row: null};
}

async function observeOriginalRow(writer, tableName, key, expected) {
  const {state, row} = await readOriginalRow(writer, tableName, key);
  if (state !== ORIGINAL_ROW_STATE.PRESENT) return false;
  return Object.entries(expected).every(([field, value]) => row[field] === value);
}

function originalSeedServiceRegistration(preparation, replicaId, writer) {
  const birth = preparation.serviceBirth(replicaId);
  return Object.freeze({birth,
    publish(row, submit) {
      return preparation.publishOriginalRight({replicaId, right: RIGHT.SERVICE_RIGHT,
        value: row, submit, observe: (value) =>
          observeOriginalRow(writer, SYSTEM_TABLE_NAME.SERVICES, replicaId, value)});
    }});
}

function publishOriginalSeedClusterIdentity(preparation, writer, row) {
  const identity = preparation.clusterIdentity();
  if (row[COLUMN.CONFIG_KEY] !== CLUSTER_ID_CONFIG_KEY ||
      row[COLUMN.CONFIG_VALUE] !== identity.clusterId ||
      row[COLUMN.CREATED_AT] !== identity.timestamp) {
    throw originalAllocationError(REASON.IDENTITY, identity.replicaId);
  }
  return preparation.publishOriginalRight({replicaId: identity.replicaId,
    right: RIGHT.IDENTITY_RIGHT, value: row,
    submit: (value) => writer.insertSystemTableRow(SYSTEM_TABLE_NAME.CONFIG, value),
    observe: (value) => observeOriginalRow(writer, SYSTEM_TABLE_NAME.CONFIG,
      CLUSTER_ID_CONFIG_KEY, value)});
}

// The declared formation size is written once, beside cluster_id and before
// it, through the same writer and observation. A retained row is the
// authority: the same value is not rewritten, a different value is a typed
// refusal that leaves the row unchanged, and an unreadable row refuses
// rather than writing over an unknown.
async function publishOriginalSeedFormationTarget(writer, row) {
  const configured = decodeFormationTargetValue(row);
  if (row[COLUMN.CONFIG_KEY] !== FORMATION_TARGET_CONFIG_KEY || configured === null) {
    throw formationTargetRecordError(RECORD_ERROR.UNAVAILABLE,
      {configured: row[COLUMN.CONFIG_VALUE]});
  }
  let read;
  try {
    read = await readOriginalRow(writer, SYSTEM_TABLE_NAME.CONFIG, FORMATION_TARGET_CONFIG_KEY);
  } catch (cause) {
    throw formationTargetRecordError(RECORD_ERROR.UNAVAILABLE, {configured}, cause);
  }
  const {state, row: retained} = read;
  if (state === ORIGINAL_ROW_STATE.UNAVAILABLE) {
    throw formationTargetRecordError(RECORD_ERROR.UNAVAILABLE, {configured});
  }
  if (state === ORIGINAL_ROW_STATE.PRESENT) {
    const durable = decodeFormationTargetValue(retained);
    if (durable !== configured) {
      throw formationTargetRecordError(RECORD_ERROR.MISMATCH,
        {durable: retained[COLUMN.CONFIG_VALUE], configured});
    }
    return retained;
  }
  await writer.insertSystemTableRow(SYSTEM_TABLE_NAME.CONFIG, row);
  if (!await observeOriginalRow(writer, SYSTEM_TABLE_NAME.CONFIG,
    FORMATION_TARGET_CONFIG_KEY, row)) {
    throw formationTargetRecordError(RECORD_ERROR.UNAVAILABLE, {configured});
  }
  return row;
}

export {originalSeedServiceRegistration, publishOriginalSeedClusterIdentity,
  publishOriginalSeedFormationTarget};
