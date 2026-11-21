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
  ownerFactRows,
  readHint,
  readOwnerFact,
} from '../control-plane/control-plane-owner-fact-read.js';
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
// The coordinator holds no position in the SERVICES partition yet, so its
// owner-fact reads ask for none: a leader that has applied its election log
// and its commit. A SERVICES position carried on the ledger's last terminal
// operation is the design candidate for this floor (stage-2 record).
const NO_SERVICES_POSITION = Object.freeze({minimumIndex: 0, minimumTerm: 0});

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

function requireEntityServiceRowRead(identity) {
  const read = buildEntityServiceRowRead(identity);
  if (!read) {
    throw new TypeError(
      `${UNSUPPORTED_REBALANCER_ENTITY_TYPE_REASON}: ${identity?.entityType}`);
  }
  return read;
}

/**
 * The SERVICES rows of one rebalancer entity as an owner fact of the
 * services-p1 leader (control-plane-owner-fact-read.js): the one adapter of
 * the coordinator's inventory consumers onto readOwnerFact, so a change of
 * the read's call shape is made here only. The answer is READY or
 * UNAVAILABLE with a reason; its rows are taken with
 * ownerFactEntityServiceRows. The caller's deadline and recovery routing
 * dimension are carried under the read's own options (which win), because
 * the read does not take them yet.
 * @param {Object} gateway - The control-plane system-table gateway.
 * @param {Object} identity - {entityType, entityId}.
 * @param {Object} queryOptions - The caller's deadline and routing options.
 * @return {Promise<Object>} The readOwnerFact answer.
 * @throws {TypeError} For an entity type with no SERVICES identity.
 */
async function readEntityServiceRowsOwnerFact(gateway, identity, queryOptions) {
  const read = requireEntityServiceRowRead(identity);
  return readOwnerFact(
    (tableName, sql, params, readOptions) =>
      gateway.readAuthoritativeRows(tableName, sql, params,
        {...queryOptions, ...readOptions}),
    {tableName: SYSTEM_TABLE_NAME.SERVICES, sql: read.sql, params: read.params,
      ...NO_SERVICES_POSITION});
}

/**
 * The entity's rows of a READY owner fact (throws for anything else).
 * @param {Object} fact - A readEntityServiceRowsOwnerFact answer.
 * @param {Object} identity - {entityType, entityId}.
 * @return {Array<Object>} The rows that belong to the entity.
 */
function ownerFactEntityServiceRows(fact, identity) {
  return ownerFactRows(fact).filter((row) =>
    entityServiceRowBelongsToIdentity(row, identity));
}

/**
 * The SERVICES rows of one entity as the node's projection holds them: a
 * hint (readHint), never an owner fact. A row the projection has not
 * received is not yet known; nothing may be concluded from its absence.
 * @param {Object} systemTableCache - The node's system-table projection.
 * @param {Object} identity - {entityType, entityId}.
 * @return {Promise<Object>} {state: hint_observed, rows} | {state: hint_unavailable}.
 */
function readEntityServiceRowsHint(systemTableCache, identity) {
  return readHint(
    (tableName, {cachePredicate}) => ({success: true,
      rows: systemTableCache.filter(tableName, cachePredicate)}),
    {tableName: SYSTEM_TABLE_NAME.SERVICES,
      cachePredicate: (row) => entityServiceRowBelongsToIdentity(row, identity)});
}

export {
  ENTITY_SERVICE_ROW_READ_SQL,
  entityServiceRowBelongsToIdentity,
  ownerFactEntityServiceRows,
  readAuthoritativeEntityServiceRows,
  readEntityServiceRowsHint,
  readEntityServiceRowsOwnerFact,
};
