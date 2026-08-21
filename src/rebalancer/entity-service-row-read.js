/**
 * Canonical authoritative SERVICES-row read for one rebalancer entity.
 *
 * The entity identity owner lives here so admission, workflow safety, and
 * placement cannot each invent a different SQL projection. In particular,
 * runtime replicas use canonical `${entityId}-rN` identities while message
 * groups are keyed by group_id and partitions by partition_id.
 */

import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {UNIFIED_SERVICE_TYPE} from
  '../constants/unified-service-lifecycle.js';
import {
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  runtimeServiceReplicaBelongsToEntity,
} from './runtime-service-replica-identity.js';

const ENTITY_SERVICE_ROW_READ_SQL = Object.freeze({
  PARTITION: `SELECT * FROM services
    WHERE service_type = ? AND partition_id = ?`,
  MESSAGE_GROUP: `SELECT * FROM services
    WHERE service_type = ? AND group_id = ?`,
  RUNTIME_SERVICE: `SELECT * FROM services
    WHERE service_type = ? AND service_id LIKE ?`,
});
const UNSUPPORTED_REBALANCER_ENTITY_TYPE_REASON =
  'unsupported_rebalancer_entity_type';

function buildEntityServiceRowRead({entityType, entityId}) {
  if (entityType === SERVICE_TYPE.PARTITION) {
    return Object.freeze({
      sql: ENTITY_SERVICE_ROW_READ_SQL.PARTITION,
      params: [entityType, entityId],
    });
  }
  if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {
    return Object.freeze({
      sql: ENTITY_SERVICE_ROW_READ_SQL.MESSAGE_GROUP,
      params: [entityType, entityId],
    });
  }
  if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
    return Object.freeze({
      sql: ENTITY_SERVICE_ROW_READ_SQL.RUNTIME_SERVICE,
      params: [entityType, `${entityId}-r%`],
    });
  }
  return null;
}

function entityServiceRowBelongsToIdentity(
  row,
  {entityType, entityId},
) {
  const serviceType = row?.service_type ?? null;
  if (!row || serviceType !== entityType) {
    return false;
  }
  if (entityType === SERVICE_TYPE.PARTITION) {
    return row.partition_id === entityId;
  }
  if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {
    return row.group_id === entityId;
  }
  if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
    return runtimeServiceReplicaBelongsToEntity(
      row.service_id,
      entityId,
    );
  }
  return false;
}

async function readAuthoritativeEntityServiceRows(
  gateway,
  identity,
  readOptions,
) {
  const read = buildEntityServiceRowRead(identity);
  if (!read) {
    return Object.freeze({
      success: false,
      rows: [],
      error: `Unsupported rebalancer entity type: ${identity?.entityType}`,
      reasonCode: UNSUPPORTED_REBALANCER_ENTITY_TYPE_REASON,
    });
  }
  const result = await readAuthoritativeControlPlaneRows(
    gateway,
    SYSTEM_TABLE_NAME.SERVICES,
    read.sql,
    read.params,
    readOptions,
  );
  return {
    ...result,
    rows: Array.isArray(result?.rows) ?
      result.rows.filter((row) =>
        entityServiceRowBelongsToIdentity(row, identity)) :
      result?.rows,
  };
}

export {
  ENTITY_SERVICE_ROW_READ_SQL,
  entityServiceRowBelongsToIdentity,
  readAuthoritativeEntityServiceRows,
};
