/**
 * SQL query builders for auditing source mapping decisions
 * and dependency lock state.
 *
 * Requirements: 4.5, 5.5
 * @module admin/admin-audit-queries
 */

import {SQL, TABLES} from '../constants/index.js';
import {
  REGISTRY_MAPPING_COL,
  REGISTRY_OVERRIDE_COL,
  DEPENDENCY_LOCK_COL,
} from '../wasm-service/wasm-meta-models-constants.js';
import {NUM} from '../constants/numbers.js';

const SELECT_ALL_FROM = `${SQL.SELECT} * FROM`;

/**
 * Build SQL to query registry mappings for audit.
 * @param {string} [namespace] - Optional namespace filter.
 * @return {{sql: string, params: Array}} Query and params.
 */
function buildMappingAuditQuery(namespace) {
  let sql =
    `${SELECT_ALL_FROM} ${TABLES.PACKAGE_REGISTRY_MAPPINGS}`;
  const params = [];

  if (namespace) {
    params.push(namespace);
    sql += ` ${SQL.WHERE} ${REGISTRY_MAPPING_COL.NAMESPACE}` +
      ` = $${params.length}`;
  }

  return {sql, params};
}

/**
 * Build SQL to query registry overrides with optional filters.
 * @param {string} [namespace] - Optional namespace filter.
 * @param {string} [name] - Optional package name filter.
 * @return {{sql: string, params: Array}} Query and params.
 */
function buildOverrideAuditQuery(namespace, name) {
  let sql =
    `${SELECT_ALL_FROM} ${TABLES.PACKAGE_REGISTRY_OVERRIDES}`;
  const conditions = [];
  const params = [];

  if (namespace) {
    params.push(namespace);
    conditions.push(
      `${REGISTRY_OVERRIDE_COL.NAMESPACE} = $${params.length}`,
    );
  }
  if (name) {
    params.push(name);
    conditions.push(
      `${REGISTRY_OVERRIDE_COL.NAME} = $${params.length}`,
    );
  }

  if (conditions.length > NUM.ZERO) {
    sql += ` ${SQL.WHERE} ${conditions.join(` ${SQL.AND} `)}`;
  }

  return {sql, params};
}

/**
 * Build SQL to query dependency locks with optional filters.
 * @param {string} [targetNamespace] - Optional target namespace.
 * @param {string} [targetName] - Optional target name.
 * @param {string} [targetVersion] - Optional target version.
 * @return {{sql: string, params: Array}} Query and params.
 */
function buildLockAuditQuery(
  targetNamespace, targetName, targetVersion,
) {
  let sql =
    `${SELECT_ALL_FROM} ${TABLES.MODULE_DEPENDENCY_LOCKS}`;
  const conditions = [];
  const params = [];

  if (targetNamespace) {
    params.push(targetNamespace);
    conditions.push(
      `${DEPENDENCY_LOCK_COL.TARGET_MODULE_NAMESPACE}` +
      ` = $${params.length}`,
    );
  }
  if (targetName) {
    params.push(targetName);
    conditions.push(
      `${DEPENDENCY_LOCK_COL.TARGET_MODULE_NAME}` +
      ` = $${params.length}`,
    );
  }
  if (targetVersion) {
    params.push(targetVersion);
    conditions.push(
      `${DEPENDENCY_LOCK_COL.TARGET_MODULE_VERSION}` +
      ` = $${params.length}`,
    );
  }

  if (conditions.length > NUM.ZERO) {
    sql += ` ${SQL.WHERE} ${conditions.join(` ${SQL.AND} `)}`;
  }

  return {sql, params};
}

/**
 * Build a combined resolution trace: override query then mapping
 * query. Caller executes both in order to trace the resolution
 * path for a given namespace/name.
 * @param {string} namespace - Namespace to trace.
 * @param {string} [name] - Optional package name.
 * @return {{overrideQuery: {sql: string, params: Array},
 *   mappingQuery: {sql: string, params: Array}}}
 */
function buildResolutionTraceQuery(namespace, name) {
  const overrideQuery =
    buildOverrideAuditQuery(namespace, name);
  const mappingQuery =
    buildMappingAuditQuery(namespace);
  return {overrideQuery, mappingQuery};
}

export {
  buildMappingAuditQuery,
  buildOverrideAuditQuery,
  buildLockAuditQuery,
  buildResolutionTraceQuery,
};
