/**
 * DebugSessionResolver resolves tenant/service/lineage-scoped
 * trace sessions from SQL/CDC-propagated metadata.
 */

import {NUM, TABLES, TYPEOF} from '../constants/index.js';
import {
  DEBUG_DEFAULT,
  DEBUG_ERROR_MSG,
  DEBUG_SESSION_STATUS,
  DEBUG_TRACE_SOURCE,
} from './debug-constants.js';

const SESSION_FIELD = Object.freeze({
  SESSION_ID: 'session_id',
  SERVICE_NAME: 'service_name',
  LINEAGE_ID: 'lineage_id',
  STAGE_ID: 'stage_id',
  STATUS: 'status',
  UPDATED_AT: 'updated_at',
  CREATED_AT: 'created_at',
});

/**
 * Resolve active tracing sessions from debug metadata.
 */
class DebugSessionResolver {
  /**
   * @param {Object} [options]
   * @param {Object} [options.systemTableCache] - Read-only system cache.
   * @param {Function} [options.readSessions] - Optional metadata reader.
   * @param {Function} [options.now] - Clock function.
   * @param {number} [options.maxSessionAgeMs] - Stale-session threshold.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.readSessions = options.readSessions || null;
    this.now = options.now || (() => Date.now());
    this.maxSessionAgeMs = options.maxSessionAgeMs ??
      DEBUG_DEFAULT.MAX_SESSION_AGE_MS;
  }

  /**
   * Resolve active trace session for a service scope.
   * @param {Object} scope
   * @return {Object|null}
   */
  resolveServiceSession(scope = {}) {
    const serviceName = resolveServiceName(scope);
    if (!serviceName) {
      return null;
    }
    const sessions = this.getActiveSessions().filter((session) =>
      session.serviceName === serviceName &&
      !session.lineageId,
    );
    return sessions[NUM.ZERO] || null;
  }

  /**
   * Resolve active trace session for callback scope.
   * @param {Object} scope
   * @return {Object|null}
   */
  resolveCallbackSession(scope = {}) {
    const lineageId = resolveLineageId(scope);
    if (!lineageId) {
      return null;
    }
    const stageId = normalizeNullableInteger(
      scope.stageId ?? scope.stage_id,
    );
    const serviceName = resolveServiceName(scope);

    const sessions = this.getActiveSessions().filter((session) => {
      if (session.lineageId !== lineageId) {
        return false;
      }
      if (serviceName &&
        session.serviceName !== serviceName) {
        return false;
      }
      if (stageId === null) {
        return true;
      }
      return session.stageId === null ||
        session.stageId === stageId;
    });
    return sessions[NUM.ZERO] || null;
  }

  /**
   * Resolve active session for either service or callback scope.
   * @param {Object} scope
   * @return {Object|null}
   */
  resolveSession(scope = {}) {
    if (!scope || typeof scope !== TYPEOF.OBJECT) {
      throw new Error(DEBUG_ERROR_MSG.TRACE_RESOLVER_SCOPE_REQUIRED);
    }

    const source = scope.source || inferSource(scope);
    if (source === DEBUG_TRACE_SOURCE.PARTITION_CALLBACK) {
      return this.resolveCallbackSession(scope);
    }
    return this.resolveServiceSession(scope);
  }

  /**
   * Cheap active-trace gate for hot paths.
   * @param {Object} scope
   * @return {boolean}
   */
  isTraceActive(scope = {}) {
    return Boolean(this.resolveSession(scope));
  }

  /**
   * Read all active non-stale sessions sorted by recency.
   * @return {Array<Object>}
   */
  getActiveSessions() {
    const now = this.now();
    const rows = this.readSessionRows();
    const sessions = [];
    for (const row of rows) {
      const normalized = normalizeSessionRow(row);
      if (!normalized) {
        continue;
      }
      if (normalized.status !== DEBUG_SESSION_STATUS.ACTIVE) {
        continue;
      }
      if (this.isSessionStale(normalized, now)) {
        continue;
      }
      sessions.push(normalized);
    }

    sessions.sort((a, b) => (b.updatedAt || NUM.ZERO) - (a.updatedAt || NUM.ZERO));
    return sessions;
  }

  /**
   * @param {Object} session
   * @param {number} now
   * @return {boolean}
   */
  isSessionStale(session, now) {
    if (this.maxSessionAgeMs <= NUM.ZERO) {
      return false;
    }
    if (session.updatedAt === null) {
      return false;
    }
    return now - session.updatedAt > this.maxSessionAgeMs;
  }

  /**
   * @return {Array<Object>}
   * @private
   */
  readSessionRows() {
    if (typeof this.readSessions === TYPEOF.FUNCTION) {
      const rows = this.readSessions();
      return Array.isArray(rows) ? rows : [];
    }

    if (this.systemTableCache &&
      typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {
      const rows = this.systemTableCache.getAll(TABLES.DEBUG_SESSIONS);
      return Array.isArray(rows) ? rows : [];
    }

    return [];
  }
}

/**
 * @param {Object} scope
 * @return {string|null}
 */
function resolveServiceName(scope) {
  const value = scope.serviceDefinitionId ??
    scope.service_definition_id ??
    scope.serviceName ??
    scope.service_name ??
    scope.serviceId ??
    scope.service_id ??
    null;
  return normalizeNullableString(value);
}

/**
 * @param {Object} scope
 * @return {string|null}
 */
function resolveLineageId(scope) {
  return normalizeNullableString(
    scope.lineageId ?? scope.lineage_id ?? null,
  );
}

/**
 * @param {Object} scope
 * @return {string}
 */
function inferSource(scope) {
  if (resolveLineageId(scope)) {
    return DEBUG_TRACE_SOURCE.PARTITION_CALLBACK;
  }
  return DEBUG_TRACE_SOURCE.SERVICE;
}

/**
 * @param {Object} row
 * @return {Object|null}
 */
function normalizeSessionRow(row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return null;
  }
  const sessionId = normalizeNullableString(
    row[SESSION_FIELD.SESSION_ID] ?? row.sessionId ?? null,
  );
  const serviceName = normalizeNullableString(
    row[SESSION_FIELD.SERVICE_NAME] ?? row.serviceName ?? null,
  );
  if (!sessionId || !serviceName) {
    return null;
  }

  const lineageId = normalizeNullableString(
    row[SESSION_FIELD.LINEAGE_ID] ?? row.lineageId ?? null,
  );
  const stageId = normalizeNullableInteger(
    row[SESSION_FIELD.STAGE_ID] ?? row.stageId,
  );
  const updatedAt = normalizeNullableInteger(
    row[SESSION_FIELD.UPDATED_AT] ?? row.updatedAt ??
      row[SESSION_FIELD.CREATED_AT] ?? row.createdAt,
  );
  const status = normalizeNullableString(
    row[SESSION_FIELD.STATUS] ?? row.status ?? DEBUG_SESSION_STATUS.ACTIVE,
  ) || DEBUG_SESSION_STATUS.ACTIVE;

  return {
    sessionId,
    serviceName,
    lineageId,
    stageId,
    status,
    updatedAt,
    raw: row,
  };
}

/**
 * @param {*} value
 * @return {string|null}
 */
function normalizeNullableString(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > NUM.ZERO ? trimmed : null;
}

/**
 * @param {*} value
 * @return {number|null}
 */
function normalizeNullableInteger(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

export {
  DebugSessionResolver,
  inferSource,
  normalizeSessionRow,
};
