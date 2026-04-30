/**
 * Distributed debug coordinator for lineage stage handoff.
 */

import {EventEmitter} from 'node:events';
import {NUM, TABLES, TYPEOF} from '../constants/index.js';
import {CDC_EVENT} from '../cdc/cdc-constants.js';
import {
  DEBUG_METADATA_TABLE as DT,
  DEBUG_SESSION_FIELD as DSF,
} from './debug-metadata-constants.js';
import {
  DEBUG_COORDINATOR_DEFAULT as DEF,
  DEBUG_COORDINATOR_EVENT as EVENT,
  DEBUG_COORDINATOR_ERROR_MSG as ERR,
} from './debug-coordinator-constants.js';

const LOCAL_STR_MANUAL = 'manual';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_INITIAL = 'initial';
const LOCAL_STR_ADVANCE_STAGE = 'advance_stage';
const LOCAL_STR_REFRESH_STAGE = 'refresh_stage';

const COORDINATOR_CDC_EVENTS = Object.freeze([
  CDC_EVENT.INSERT,
  CDC_EVENT.UPDATE,
  CDC_EVENT.UPSERT,
]);

/**
 * Coordinates active debug endpoint by lineage+stage transitions.
 */
class DebugCoordinator {
  /**
   * @param {Object} [options]
   * @param {Object} [options.systemTableCache] - Cache owner.
   * @param {Object} [options.cdcIntegrationService] - CDC emitter.
   * @param {Function} [options.now] - Timestamp provider.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = null;
    this.now = options.now || (() => Date.now());
    this.lineageState = new Map();
    this.emitter = new EventEmitter();
    this.boundCdcHandlers = new Map();

    if (options.cdcIntegrationService) {
      this.bindCdcIntegrationService(
        options.cdcIntegrationService,
      );
    }
  }

  /**
   * Subscribe to all handoff notifications.
   *
   * @param {Function} listener - Event listener.
   * @return {Function} Unsubscribe callback.
   */
  subscribe(listener) {
    if (typeof listener !== TYPEOF.FUNCTION) {
      throw new Error(ERR.LISTENER_REQUIRED);
    }
    this.emitter.on(EVENT.HANDOFF, listener);
    return () => {
      this.emitter.off(EVENT.HANDOFF, listener);
    };
  }

  /**
   * Subscribe to lineage-specific handoff notifications.
   *
   * @param {string} lineageId - Lineage id.
   * @param {Function} listener - Event listener.
   * @return {Function} Unsubscribe callback.
   */
  subscribeLineage(lineageId, listener) {
    assertLineageId(lineageId);
    if (typeof listener !== TYPEOF.FUNCTION) {
      throw new Error(ERR.LISTENER_REQUIRED);
    }

    const wrapped = (event) => {
      if (event.lineageId === lineageId) {
        listener(event);
      }
    };
    this.emitter.on(EVENT.HANDOFF, wrapped);
    return () => {
      this.emitter.off(EVENT.HANDOFF, wrapped);
    };
  }

  /**
   * Get current endpoint record for a lineage.
   *
   * @param {Object} request
   * @param {string} request.lineageId
   * @return {Object|null}
   */
  getCurrentEndpoint(request) {
    assertRequest(request);
    assertLineageId(request.lineageId);
    const state = this.lineageState.get(request.lineageId) || null;
    return state ? {...state} : null;
  }

  /**
   * Upsert stage endpoint transition with monotonic guardrails.
   *
   * @param {Object} request
   * @param {string} request.lineageId
   * @param {number} request.stageId
   * @param {string} request.endpoint
   * @param {string} [request.nodeId]
   * @param {string} [request.sessionId]
   * @param {number} [request.updatedAt]
   * @param {string} [source] - Optional source label.
   * @return {{applied: boolean, reason: string, current: Object}}
   */
  upsertStageEndpoint(request, source = LOCAL_STR_MANUAL) {
    assertRequest(request);
    assertLineageId(request.lineageId);
    assertStageId(request.stageId);
    assertEndpoint(request.endpoint);

    const next = normalizeStageEndpointRecord(
      request,
      this.now(),
    );
    const previous = this.lineageState.get(next.lineageId) || null;
    const decision = decideMonotonicTransition(previous, next);
    if (!decision.applied) {
      return {
        applied: false,
        reason: decision.reason,
        current: previous ? {...previous} : null,
      };
    }

    this.lineageState.set(next.lineageId, next);
    this.emitter.emit(EVENT.HANDOFF, {
      lineageId: next.lineageId,
      previous,
      current: next,
      source,
      reason: decision.reason,
    });

    return {
      applied: true,
      reason: decision.reason,
      current: {...next},
    };
  }

  /**
   * Hydrate lineage endpoint state from system metadata table.
   *
   * @return {number} Number of applied transitions.
   */
  hydrateFromSystemMetadata() {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return NUM.ZERO;
    }

    let rows;
    try {
      rows = this.systemTableCache.getAll(DT.SESSIONS);
    } catch (_err) {
      return NUM.ZERO;
    }
    if (!Array.isArray(rows) || rows.length === NUM.ZERO) {
      return NUM.ZERO;
    }

    const appliedRows = normalizeRowsForHydration(rows);
    let appliedCount = NUM.ZERO;
    for (const row of appliedRows) {
      const result = this.upsertStageEndpoint(row, 'cache_hydration');
      if (result.applied) {
        appliedCount += LOCAL_NUM_ONE;
      }
    }
    return appliedCount;
  }

  /**
   * Bind coordinator to CDC row change events.
   *
   * @param {Object} cdcIntegrationService - CDC emitter.
   * @return {boolean}
   */
  bindCdcIntegrationService(cdcIntegrationService) {
    if (!cdcIntegrationService ||
      typeof cdcIntegrationService.on !== TYPEOF.FUNCTION ||
      typeof cdcIntegrationService.off !== TYPEOF.FUNCTION) {
      return false;
    }

    this.unbindCdcIntegrationService();
    this.cdcIntegrationService = cdcIntegrationService;

    for (const eventName of COORDINATOR_CDC_EVENTS) {
      const handler = (event) => {
        this.handleCdcEvent(event);
      };
      this.boundCdcHandlers.set(eventName, handler);
      cdcIntegrationService.on(eventName, handler);
    }

    return true;
  }

  /**
   * Unbind CDC listeners.
   */
  unbindCdcIntegrationService() {
    if (this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.off === TYPEOF.FUNCTION) {
      for (const [eventName, handler] of this.boundCdcHandlers) {
        this.cdcIntegrationService.off(eventName, handler);
      }
    }

    this.boundCdcHandlers.clear();
    this.cdcIntegrationService = null;
  }

  /**
   * Handle one CDC event for debug session endpoint transitions.
   *
   * @param {Object} event - CDC event payload.
   * @return {boolean} True when applied.
   */
  handleCdcEvent(event) {
    if (!event || typeof event !== TYPEOF.OBJECT) {
      return false;
    }
    if (event.tableName !== DT.SESSIONS &&
      event.tableName !== TABLES.CONFIG) {
      return false;
    }
    if (event.tableName === TABLES.CONFIG) {
      return false;
    }

    const row = event.data || event.whereClause || null;
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return false;
    }

    const lineageId = row[DSF.LINEAGE_ID];
    const stageId = toStageId(row[DSF.STAGE_ID]);
    const endpoint = row[DSF.ENDPOINT];
    if (!isNonEmptyString(lineageId) ||
      stageId === null ||
      !isNonEmptyString(endpoint)) {
      return false;
    }

    const result = this.upsertStageEndpoint({
      lineageId,
      stageId,
      endpoint,
      nodeId: row[DSF.NODE_ID] || null,
      sessionId: row[DSF.SESSION_ID] || null,
      updatedAt: toTimestampOrNow(
        row[DSF.UPDATED_AT],
        this.now(),
      ),
    }, 'cdc');
    return result.applied;
  }
}

/**
 * Decide if transition should be applied.
 *
 * Guardrails:
 * - higher stageId always wins
 * - equal stageId requires updatedAt >= current.updatedAt
 * - lower stageId is rejected
 *
 * @param {Object|null} previous
 * @param {Object} next
 * @return {{applied: boolean, reason: string}}
 */
function decideMonotonicTransition(previous, next) {
  const transitionReason = !previous ?
    'initial' :
    next.stageId > previous.stageId ?
      'advance_stage' :
      next.stageId < previous.stageId ?
        'stale_stage' :
        next.updatedAt < previous.updatedAt ?
          'stale_timestamp' :
          next.endpoint === previous.endpoint &&
            next.nodeId === previous.nodeId &&
            next.updatedAt === previous.updatedAt ?
            'duplicate' :
            'refresh_stage';

  return {
    applied:
      transitionReason === LOCAL_STR_INITIAL ||
      transitionReason === LOCAL_STR_ADVANCE_STAGE ||
      transitionReason === LOCAL_STR_REFRESH_STAGE,
    reason: transitionReason,
  };
}

/**
 * Normalize transition row shape.
 *
 * @param {Object} row
 * @param {number} nowTs
 * @return {Object}
 */
function normalizeStageEndpointRecord(row, nowTs) {
  return {
    lineageId: row.lineageId,
    stageId: row.stageId,
    endpoint: row.endpoint,
    nodeId: row.nodeId || null,
    sessionId: row.sessionId || null,
    updatedAt: isNonNegativeInteger(row.updatedAt) ?
      row.updatedAt :
      nowTs,
  };
}

/**
 * @param {Array<Object>} rows
 * @return {Array<Object>}
 */
function normalizeRowsForHydration(rows) {
  const normalized = [];

  for (const row of rows) {
    const lineageId = row[DSF.LINEAGE_ID];
    const stageId = toStageId(row[DSF.STAGE_ID]);
    const endpoint = row[DSF.ENDPOINT];
    if (!isNonEmptyString(lineageId) ||
      stageId === null ||
      !isNonEmptyString(endpoint)) {
      continue;
    }

    normalized.push({
      lineageId,
      stageId,
      endpoint,
      nodeId: row[DSF.NODE_ID] || null,
      sessionId: row[DSF.SESSION_ID] || null,
      updatedAt: toTimestampOrNow(
        row[DSF.UPDATED_AT],
        NUM.ZERO,
      ),
    });
  }

  normalized.sort((left, right) => {
    if (left.lineageId !== right.lineageId) {
      return left.lineageId.localeCompare(right.lineageId);
    }
    if (left.stageId !== right.stageId) {
      return left.stageId - right.stageId;
    }
    return left.updatedAt - right.updatedAt;
  });
  return normalized;
}

/**
 * @param {Object} request
 */
function assertRequest(request) {
  if (!request || typeof request !== TYPEOF.OBJECT) {
    throw new Error(ERR.REQUEST_REQUIRED);
  }
}

/**
 * @param {string} lineageId
 */
function assertLineageId(lineageId) {
  if (!isNonEmptyString(lineageId)) {
    throw new Error(ERR.LINEAGE_ID_REQUIRED);
  }
}

/**
 * @param {number} stageId
 */
function assertStageId(stageId) {
  if (!isNonNegativeInteger(stageId) ||
    stageId < DEF.MIN_STAGE_ID) {
    throw new Error(ERR.STAGE_ID_REQUIRED);
  }
}

/**
 * @param {string} endpoint
 */
function assertEndpoint(endpoint) {
  if (!isNonEmptyString(endpoint)) {
    throw new Error(ERR.ENDPOINT_REQUIRED);
  }
}

/**
 * @param {*} value
 * @return {number|null}
 */
function toStageId(value) {
  if (isNonNegativeInteger(value)) {
    return value;
  }
  if (typeof value === TYPEOF.STRING &&
    value.trim().length > NUM.ZERO) {
    const parsed = Number.parseInt(value, 10);
    if (isNonNegativeInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * @param {*} value
 * @param {number} fallback
 * @return {number}
 */
function toTimestampOrNow(value, fallback) {
  return isNonNegativeInteger(value) ? value : fallback;
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= NUM.ZERO;
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === TYPEOF.STRING &&
    value.trim().length > NUM.ZERO;
}

export {
  DebugCoordinator,
  decideMonotonicTransition,
};
