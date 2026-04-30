/**
 * Dependency lock persistence service.
 *
 * Creates, serializes, and builds SQL for dependency lock
 * records tied to module/service revisions.
 *
 * Reuses validators and serializers from wasm-meta-models.js.
 * Lock IDs are deterministic based on module identity and
 * resolved dependency digests.
 *
 * Requirements: 5.2
 */

import {createHash} from 'node:crypto';
import {NUM} from '../constants/index.js';
import {TABLES} from '../constants/tables.js';
import {
  DEPENDENCY_LOCK_FIELD as DL,
  DEPENDENCY_LOCK_COL as DL_COL,
} from './wasm-meta-models-constants.js';
import {
  MODULE_MANIFEST_FIELD as MF,
  MODULE_MANIFEST_ERROR_MSG as ERR,
} from './module-manifest-constants.js';
import {
  validateDependencyLock,
  serializeDependencyLock,
} from './wasm-meta-models.js';

const LOCAL_STR_SHA256 = 'sha256';
const LOCAL_STR_HEX = 'hex';
const LOCAL_STR_ADDED = 'added';
const LOCAL_STR_CHANGED = 'changed';

/**
 * Generate a deterministic lock ID from module identity
 * and resolved dependency digests.
 *
 * @param {string} namespace - Module namespace.
 * @param {string} name - Module name.
 * @param {string} version - Module version.
 * @param {Array<Object>} resolvedDependencies - Resolved deps
 *   with moduleId and digest fields.
 * @return {string} Deterministic hex lock ID.
 */
function generateLockId(
  namespace, name, version, resolvedDependencies,
) {
  const sorted = [...(resolvedDependencies || [])]
    .sort((a, b) => (a.moduleId || '').localeCompare(
      b.moduleId || '',
    ));
  const payload = JSON.stringify({
    namespace, name, version, deps: sorted,
  });
  return createHash(LOCAL_STR_SHA256).update(payload).digest(LOCAL_STR_HEX);
}

/**
 * Create a dependency lock record from a manifest and its
 * resolved dependencies.
 *
 * @param {Object} manifest - Module manifest with namespace,
 *   name, and version fields.
 * @param {Array<Object>} resolvedDependencies - Array of
 *   {moduleId, digest} objects from dependency resolution.
 * @param {string} [serviceId] - Optional service ID to tie
 *   the lock to a specific service revision.
 * @return {{valid: boolean, lock?: Object, errors?: string[]}}
 */
function createDependencyLock(
  manifest, resolvedDependencies, serviceId,
) {
  const namespace = manifest[MF.NAMESPACE];
  const name = manifest[MF.NAME];
  const version = manifest[MF.VERSION];
  const deps = resolvedDependencies || [];

  const lockId = generateLockId(
    namespace, name, version, deps,
  );

  const lock = {
    [DL.LOCK_ID]: lockId,
    [DL.TARGET_MODULE_NAMESPACE]: namespace,
    [DL.TARGET_MODULE_NAME]: name,
    [DL.TARGET_MODULE_VERSION]: version,
    [DL.TARGET_SERVICE_ID]: serviceId ?? null,
    [DL.RESOLVED_DEPENDENCIES]: deps,
  };

  const validation = validateDependencyLock(lock);
  if (!validation.valid) {
    return {valid: false, errors: validation.errors};
  }

  return {valid: true, lock};
}

/**
 * Build a serialized row ready for SQL INSERT from a lock.
 *
 * @param {Object} lock - Dependency lock object with
 *   camelCase field names.
 * @return {Object} Serialized row with snake_case column keys.
 */
function buildLockRow(lock) {
  return serializeDependencyLock(lock);
}

/**
 * Build a SQL INSERT statement for persisting a dependency
 * lock row.
 *
 * @param {Object} lock - Dependency lock object with
 *   camelCase field names.
 * @return {{sql: string, params: Array}} SQL statement and
 *   parameter array ready for execution via SQL engine.
 */
function buildInsertLockSQL(lock) {
  const row = serializeDependencyLock(lock);
  const columns = [
    DL_COL.LOCK_ID,
    DL_COL.TARGET_MODULE_NAMESPACE,
    DL_COL.TARGET_MODULE_NAME,
    DL_COL.TARGET_MODULE_VERSION,
    DL_COL.TARGET_SERVICE_ID,
    DL_COL.RESOLVED_DEPENDENCIES,
    DL_COL.CREATED_AT,
  ];
  const placeholders = columns.map(
    (_c, i) => `$${i + 1}`,
  ).join(', ');
  const params = columns.map((col) => row[col]);
  const sql = `INSERT INTO ${TABLES.MODULE_DEPENDENCY_LOCKS}` +
    ` (${columns.join(', ')})` +
    ` VALUES (${placeholders})`;

  return {sql, params};
}

/**
 * Compare resolved dependencies against an existing lock
 * to detect mutable dependency drift.
 *
 * Rejects when:
 * - A dependency digest changed from the locked value
 *   (DEPENDENCY_VERSION_MUTABLE)
 * - A new dependency appears that was not in the lock
 *   (UNDECLARED_IMPORT)
 *
 * @param {Object} currentLock - Existing dependency lock with
 *   resolvedDependencies array of {moduleId, digest}.
 * @param {Array<Object>} newResolvedDependencies - Newly
 *   resolved deps with moduleId and digest fields.
 * @return {{valid: boolean, errors?: string[],
 *   driftedDependencies?: Array<Object>}}
 */
function validateLockConsistency(
  currentLock, newResolvedDependencies,
) {
  const lockedDeps = currentLock[DL.RESOLVED_DEPENDENCIES] ||
    [];
  const lockedMap = new Map(
    lockedDeps.map((d) => [d.moduleId, d.digest]),
  );
  const newDeps = newResolvedDependencies || [];

  const errors = [];
  const driftedDependencies = [];

  for (const dep of newDeps) {
    const lockedDigest = lockedMap.get(dep.moduleId);
    if (lockedDigest === undefined) {
      errors.push(
        `${ERR.UNDECLARED_IMPORT}: ${dep.moduleId}`,
      );
      driftedDependencies.push({
        moduleId: dep.moduleId,
        reason: LOCAL_STR_ADDED,
      });
    } else if (lockedDigest !== dep.digest) {
      errors.push(
        `${ERR.DEPENDENCY_VERSION_MUTABLE}: ${dep.moduleId}`,
      );
      driftedDependencies.push({
        moduleId: dep.moduleId,
        lockedDigest,
        newDigest: dep.digest,
        reason: LOCAL_STR_CHANGED,
      });
    }
  }

  if (errors.length > NUM.ZERO) {
    return {valid: false, errors, driftedDependencies};
  }

  return {valid: true};
}

/**
 * Full activation validation combining lock consistency
 * with explicit rollout bypass.
 *
 * When isExplicitRollout is true, drift checks are skipped
 * to allow lock updates during intentional rollouts.
 *
 * @param {Object} _manifest - Module manifest (reserved for
 *   future manifest-level checks).
 * @param {Object} existingLock - Current dependency lock.
 * @param {Array<Object>} resolvedDependencies - Newly
 *   resolved deps with moduleId and digest fields.
 * @param {boolean} isExplicitRollout - Whether this is an
 *   explicit rollout that may update lock state.
 * @return {{valid: boolean, errors?: string[],
 *   driftedDependencies?: Array<Object>}}
 */
function validateActivationLock(
  _manifest, existingLock, resolvedDependencies,
  isExplicitRollout,
) {
  if (isExplicitRollout) {
    return {valid: true};
  }

  return validateLockConsistency(
    existingLock, resolvedDependencies,
  );
}

/**
 * Build a SQL SELECT for a single lock by lock_id.
 *
 * @param {string} lockId - The lock ID to query.
 * @return {{sql: string, params: Array}} SQL statement and
 *   parameter array.
 */
function buildSelectLockSQL(lockId) {
  const sql = `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}` +
    ` WHERE ${DL_COL.LOCK_ID} = $1`;
  return {sql, params: [lockId]};
}

/**
 * Build a SQL SELECT for all locks matching a module
 * identity (namespace + name + version).
 *
 * @param {string} namespace - Module namespace.
 * @param {string} name - Module name.
 * @param {string} version - Module version.
 * @return {{sql: string, params: Array}} SQL statement and
 *   parameter array.
 */
function buildSelectLocksByModuleSQL(
  namespace, name, version,
) {
  const sql = `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}` +
    ` WHERE ${DL_COL.TARGET_MODULE_NAMESPACE} = $1` +
    ` AND ${DL_COL.TARGET_MODULE_NAME} = $2` +
    ` AND ${DL_COL.TARGET_MODULE_VERSION} = $3`;
  return {sql, params: [namespace, name, version]};
}

/**
 * Build a SQL SELECT for all locks tied to a specific
 * service.
 *
 * @param {string} serviceId - The service ID to query.
 * @return {{sql: string, params: Array}} SQL statement and
 *   parameter array.
 */
function buildSelectLocksByServiceSQL(serviceId) {
  const sql = `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}` +
    ` WHERE ${DL_COL.TARGET_SERVICE_ID} = $1`;
  return {sql, params: [serviceId]};
}

export {
  generateLockId,
  createDependencyLock,
  buildLockRow,
  buildInsertLockSQL,
  buildSelectLockSQL,
  buildSelectLocksByModuleSQL,
  buildSelectLocksByServiceSQL,
  validateLockConsistency,
  validateActivationLock,
};
