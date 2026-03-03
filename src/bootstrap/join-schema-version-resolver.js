/**
 * Join Schema Version Resolver — pure helpers for schema-version
 * comparison, extraction, and resolution during node join.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * Every function is stateless; instance context (bootstrap snapshots,
 * cache handles) is passed in explicitly.
 */

import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  JOIN_READINESS_SCHEMA_FIELDS,
} from './node-joining-constants.js';

const HLC_DELIMITER = ':';

/**
 * Parse HLC-like schema version.
 * @param {string} value
 * @return {{physical: number, logical: number, nodeId: string}|null}
 */
export function tryParseJoinSchemaHlc(value) {
  const parts = String(value || '').split(HLC_DELIMITER);
  if (parts.length < NUM.THREE) {
    return null;
  }
  const physical = Number.parseInt(parts[NUM.ZERO], 10);
  const logical = Number.parseInt(parts[NUM.ONE], 10);
  if (!Number.isFinite(physical) || !Number.isFinite(logical)) {
    return null;
  }
  return {
    physical,
    logical,
    nodeId: parts.slice(NUM.TWO).join(HLC_DELIMITER),
  };
}

/**
 * Compare schema versions supporting HLC and numeric fallback.
 * @param {string} left
 * @param {string} right
 * @return {number}
 */
export function compareJoinSchemaVersions(left, right) {
  if (left === right) {
    return NUM.ZERO;
  }

  const leftHlc = tryParseJoinSchemaHlc(left);
  const rightHlc = tryParseJoinSchemaHlc(right);
  if (leftHlc && rightHlc) {
    if (leftHlc.physical !== rightHlc.physical) {
      return leftHlc.physical - rightHlc.physical;
    }
    if (leftHlc.logical !== rightHlc.logical) {
      return leftHlc.logical - rightHlc.logical;
    }
    return leftHlc.nodeId.localeCompare(rightHlc.nodeId);
  }

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return String(left).localeCompare(String(right));
}

/**
 * Normalize a schema-version value to canonical string representation.
 * @param {*} value
 * @return {string|null}
 */
export function normalizeJoinSchemaVersion(value) {
  if (typeof value === TYPEOF.STRING) {
    const normalized = value.trim();
    return normalized.length > NUM.ZERO ? normalized : null;
  }
  if (typeof value === TYPEOF.NUMBER && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === TYPEOF.BIGINT) {
    return String(value);
  }
  return null;
}

/**
 * Keep the newest schema-version watermark.
 * @param {string|null} current
 * @param {string|null} candidate
 * @return {string|null}
 */
export function selectNewestJoinSchemaVersion(current, candidate) {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }
  return compareJoinSchemaVersions(candidate, current) >= NUM.ZERO ?
    candidate :
    current;
}

/**
 * Extract one schema-version candidate from a record.
 * @param {Object} record
 * @return {string|null}
 */
export function extractJoinSchemaVersionFromRecord(record) {
  if (!record || typeof record !== TYPEOF.OBJECT) {
    return null;
  }
  for (const fieldName of JOIN_READINESS_SCHEMA_FIELDS) {
    const normalized = normalizeJoinSchemaVersion(record[fieldName]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

/**
 * Extract schema version candidate from `tables` metadata row.
 * @param {Object|null} systemTableCache
 * @param {string} tableName
 * @return {string|null}
 */
export function extractCanonicalTableMetadataSchemaVersion(
  systemTableCache,
  tableName,
) {
  if (!systemTableCache ||
      typeof systemTableCache.filter !== TYPEOF.FUNCTION) {
    return null;
  }

  let version = null;
  const rows = systemTableCache.filter(TABLES.TABLES, (row) => {
    const rowTableName = row?.table_name || row?.tableName || null;
    return rowTableName === tableName;
  });
  for (const row of rows) {
    version = selectNewestJoinSchemaVersion(
      version,
      extractJoinSchemaVersionFromRecord(row),
    );
  }
  return version;
}

/**
 * Extract schema version candidate from local cache rows for one table.
 * @param {Object|null} systemTableCache
 * @param {string} tableName
 * @return {string|null}
 */
export function extractCanonicalCacheSchemaVersion(
  systemTableCache,
  tableName,
) {
  if (!systemTableCache ||
      typeof systemTableCache.getAll !== TYPEOF.FUNCTION) {
    return null;
  }

  let version = null;
  const tableRows = systemTableCache.getAll(tableName) || [];
  for (const row of tableRows) {
    version = selectNewestJoinSchemaVersion(
      version,
      extractJoinSchemaVersionFromRecord(row),
    );
  }

  return version;
}

/**
 * Extract required schema version candidate from bootstrap snapshot scope.
 * @param {Object|null} systemTableSnapshots - bootstrapResponse.systemTableSnapshots
 * @param {string} tableName
 * @return {string|null}
 */
export function extractCanonicalSnapshotSchemaVersion(
  systemTableSnapshots,
  tableName,
) {
  if (!systemTableSnapshots ||
      typeof systemTableSnapshots !== TYPEOF.OBJECT) {
    return null;
  }

  let version = null;
  const tableSnapshotRows = Array.isArray(systemTableSnapshots[tableName]) ?
    systemTableSnapshots[tableName] :
    [];
  for (const row of tableSnapshotRows) {
    version = selectNewestJoinSchemaVersion(
      version,
      extractJoinSchemaVersionFromRecord(row),
    );
  }

  const tableMetadataRows =
    Array.isArray(systemTableSnapshots[TABLES.TABLES]) ?
      systemTableSnapshots[TABLES.TABLES] :
      [];
  for (const row of tableMetadataRows) {
    const rowTableName = row?.table_name || row?.tableName || null;
    if (rowTableName !== tableName) {
      continue;
    }
    version = selectNewestJoinSchemaVersion(
      version,
      extractJoinSchemaVersionFromRecord(row),
    );
  }

  return version;
}

/**
 * Resolve the canonical required schema version for join checks.
 * @param {string} tableName
 * @param {Object|null} systemTableCache
 * @param {Object|null} systemTableSnapshots - bootstrapResponse.systemTableSnapshots
 * @return {string|null}
 */
export function resolveCanonicalRequiredSchemaVersion(
  tableName,
  systemTableCache,
  systemTableSnapshots,
) {
  let requiredSchemaVersion = null;
  requiredSchemaVersion = selectNewestJoinSchemaVersion(
    requiredSchemaVersion,
    extractCanonicalSnapshotSchemaVersion(systemTableSnapshots, tableName),
  );
  requiredSchemaVersion = selectNewestJoinSchemaVersion(
    requiredSchemaVersion,
    extractCanonicalCacheSchemaVersion(systemTableCache, tableName),
  );
  requiredSchemaVersion = selectNewestJoinSchemaVersion(
    requiredSchemaVersion,
    extractCanonicalTableMetadataSchemaVersion(systemTableCache, tableName),
  );
  return requiredSchemaVersion;
}

/**
 * Resolve the applied schema version for canonical join checks.
 * @param {string} tableName
 * @param {Object|null} systemTableCache
 * @return {string|null}
 */
export function resolveCanonicalAppliedSchemaVersion(
  tableName,
  systemTableCache,
) {
  let appliedSchemaVersion = null;
  appliedSchemaVersion = selectNewestJoinSchemaVersion(
    appliedSchemaVersion,
    extractCanonicalCacheSchemaVersion(systemTableCache, tableName),
  );
  appliedSchemaVersion = selectNewestJoinSchemaVersion(
    appliedSchemaVersion,
    extractCanonicalTableMetadataSchemaVersion(systemTableCache, tableName),
  );
  return appliedSchemaVersion;
}
