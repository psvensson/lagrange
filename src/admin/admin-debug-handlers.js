/**
 * Debug session HTTP handlers for the admin WebSocket API.
 *
 * This module owns all debug-session REST endpoints: session CRUD,
 * breakpoints, snapshots, DAP request forwarding, playback viewer,
 * output file serving, and trace-stream WebSocket handling. The parent
 * AdminWebSocketAPI instantiates one AdminDebugHandlers and delegates
 * all debug-related calls to it.
 *
 * Single-use helpers that exist only for debug-handler logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */

import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {
  DEBUG_METADATA_ERROR_CODE as DEBUG_METADATA_CODE,
  DEBUG_METADATA_ERROR_MSG as DEBUG_METADATA_ERR,
} from '../debug-runtime/debug-metadata-service-constants.js';
import {
  DEBUG_SESSION_STATUS as DEBUG_METADATA_SESSION_STATUS,
} from '../debug-runtime/debug-metadata-constants.js';
import {
  ADMIN_CONTENT_TYPE,
  ADMIN_DEBUG_ERROR_MSG,
  ADMIN_HEADER,
  ADMIN_LOG_MSG,
  ADMIN_TEST_ERROR_MSG,
} from './admin-constants.js';

// ── file-local constants ────────────────────────────────────────────────────
const HTTP_STATUS = Object.freeze({
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
});
const HTTP_HEADER = Object.freeze({
  CACHE_CONTROL: 'Cache-Control',
});
const HTTP_HEADER_VALUE = Object.freeze({
  NO_STORE: 'no-store',
});

// ── single-use helper functions ─────────────────────────────────────────────

/**
 * Parse comma-separated role header to string array.
 * @param {*} rolesHeader
 * @return {Array<string>}
 */
function parseHeaderRoles(rolesHeader) {
  if (typeof rolesHeader !== TYPEOF.STRING) {
    return [];
  }
  return rolesHeader.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > NUM.ZERO);
}

/**
 * Parse limit query parameter.
 * @param {*} limitParam
 * @return {number|undefined}
 */
function parseRequestLimit(limitParam) {
  if (typeof limitParam === TYPEOF.STRING) {
    const parsed = Number.parseInt(limitParam, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  if (Number.isInteger(limitParam)) {
    return limitParam;
  }
  return undefined;
}

/**
 * Build trace stream subscription filter from query params.
 * @param {Object} query
 * @return {Object}
 */
function buildTraceStreamFilter(query) {
  const filter = {};
  const lineagePrefix = normalizeQueryFilterValue(query.lineagePrefix);
  const level = normalizeQueryFilterValue(query.level);
  const nodeId = normalizeQueryFilterValue(query.nodeId);
  const source = normalizeQueryFilterValue(query.source);
  const levels = parseTraceLevels(query.levels);

  if (lineagePrefix) {
    filter.lineagePrefix = lineagePrefix;
  }
  if (level) {
    filter.level = level;
  }
  if (nodeId) {
    filter.nodeId = nodeId;
  }
  if (source) {
    filter.source = source;
  }
  if (levels.length > NUM.ZERO) {
    filter.levels = levels;
  }

  return filter;
}

/**
 * Parse comma-separated trace levels query parameter.
 * @param {*} levelsParam
 * @return {Array<string>}
 */
function parseTraceLevels(levelsParam) {
  if (typeof levelsParam !== TYPEOF.STRING) {
    return [];
  }
  return levelsParam.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > NUM.ZERO);
}

/**
 * Parse one query filter value to trimmed string.
 * @param {*} value
 * @return {string|null}
 */
function normalizeQueryFilterValue(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > NUM.ZERO ? trimmed : null;
}

/**
 * Convert snapshot payload to JSON-safe response.
 * @param {Object} snapshot
 * @return {Object}
 */
function normalizeSnapshotApiPayload(snapshot) {
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
    return snapshot;
  }
  if (!snapshot.envelope || !Buffer.isBuffer(snapshot.envelope)) {
    return snapshot;
  }

  return {
    ...snapshot,
    envelopeBase64: snapshot.envelope.toString('base64'),
    envelope: undefined,
  };
}

// ── AdminDebugHandlers class ────────────────────────────────────────────────

/**
 * Debug session handler class.
 *
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (test run service) are injected so this module
 * has no back-reference to AdminWebSocketAPI.
 */
class AdminDebugHandlers {
  /**
   * @param {Object} deps
   * @param {Object|null} deps.debugMetadataStore
   * @param {Object|null} deps.debugDapRouter
   * @param {Object} deps.traceCollector
   * @param {Object} deps.logger
   * @param {Object} deps.testRunService
   */
  constructor(deps = {}) {
    this.debugMetadataStore = deps.debugMetadataStore || null;
    this.debugDapRouter = deps.debugDapRouter || null;
    this.traceCollector = deps.traceCollector || null;
    this.logger = deps.logger || null;
    this.testRunService = deps.testRunService || null;
  }

  /**
   * Create a new debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleCreateDebugSession(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const session = await store.createSession({
        securityContext,
        ...(request.body || {}),
      });
      reply.code(HTTP_STATUS.OK).send({session});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Get one debug session by ID.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleGetDebugSession(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const session = await store.getSession({
        securityContext,
        sessionId: request.params.sessionId,
      });
      if (!session) {
        reply.code(HTTP_STATUS.NOT_FOUND).send({
          error: DEBUG_METADATA_ERR.SESSION_NOT_FOUND,
        });
        return;
      }
      reply.code(HTTP_STATUS.OK).send({session});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Update or detach an existing debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleUpdateDebugSession(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    const body = request.body || {};
    const isDetachRequest = body.detach === true ||
      body.status === DEBUG_METADATA_SESSION_STATUS.DETACHED;

    try {
      const session = isDetachRequest ?
        await store.detachSession({
          securityContext,
          sessionId: request.params.sessionId,
          ...body,
        }) :
        await store.updateSession({
          securityContext,
          sessionId: request.params.sessionId,
          ...body,
        });
      reply.code(HTTP_STATUS.OK).send({session});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Attach a debugger to an existing session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleAttachDebugSession(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const session = await store.attachSession({
        securityContext,
        sessionId: request.params.sessionId,
      });
      reply.code(HTTP_STATUS.OK).send({session});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Persist breakpoints for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleWriteDebugBreakpoints(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const breakpoints = await store.writeBreakpoints({
        securityContext,
        sessionId: request.params.sessionId,
        ...(request.body || {}),
      });
      reply.code(HTTP_STATUS.OK).send({breakpoints});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * List breakpoints for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleListDebugBreakpoints(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const breakpoints = await store.listBreakpoints({
        securityContext,
        sessionId: request.params.sessionId,
        limit: parseRequestLimit(request.query?.limit),
      });
      reply.code(HTTP_STATUS.OK).send({breakpoints});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Persist one snapshot artifact for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleWriteDebugSnapshot(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const snapshot = await store.writeSnapshot({
        securityContext,
        sessionId: request.params.sessionId,
        ...(request.body || {}),
      });
      reply.code(HTTP_STATUS.OK).send({
        snapshot: normalizeSnapshotApiPayload(snapshot),
      });
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * List snapshots for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleListDebugSnapshots(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const snapshots = await store.listSnapshots({
        securityContext,
        sessionId: request.params.sessionId,
        limit: parseRequestLimit(request.query?.limit),
      });
      reply.code(HTTP_STATUS.OK).send({
        snapshots: snapshots.map((snapshot) =>
          normalizeSnapshotApiPayload(snapshot),
        ),
      });
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Fetch one snapshot by snapshotId.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleGetDebugSnapshot(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const snapshot = await store.getSnapshot({
        securityContext,
        snapshotId: request.params.snapshotId,
        sessionId: request.query?.sessionId || null,
        includeEnvelope: request.query?.includeEnvelope !== 'false',
      });
      if (!snapshot) {
        reply.code(HTTP_STATUS.NOT_FOUND).send({
          error: DEBUG_METADATA_ERR.SNAPSHOT_NOT_FOUND,
        });
        return;
      }
      reply.code(HTTP_STATUS.OK).send({
        snapshot: normalizeSnapshotApiPayload(snapshot),
      });
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Route one DAP request through admin ingress ownership.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleDebugDapRequest(request, reply) {
    const securityContext =
      this.resolveDebugSecurityContext(request, reply);
    if (!securityContext) {
      return;
    }

    if (!this.debugDapRouter ||
      typeof this.debugDapRouter.handleRequest !== TYPEOF.FUNCTION) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: ADMIN_DEBUG_ERROR_MSG.DAP_UNAVAILABLE,
      });
      return;
    }

    try {
      const response = await this.debugDapRouter.handleRequest({
        securityContext,
        ...(request.body || {}),
      });
      reply.code(HTTP_STATUS.OK).send({response});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Serve shared playback viewer page.
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handlePlaybackViewerPage(reply) {
    try {
      const page = await this.testRunService.readPlaybackViewer();
      reply
        .code(HTTP_STATUS.OK)
        .header(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_STORE)
        .type(ADMIN_CONTENT_TYPE.HTML)
        .send(page);
    } catch (error) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({
          error: ADMIN_TEST_ERROR_MSG.PLAYBACK_VIEWER_NOT_FOUND,
          details: error.message,
        });
    }
  }

  /**
   * Serve files under test-output for report/playback assets.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleOutputFile(request, reply) {
    const wildcardPath = request.params['*'];
    const filePayload =
      await this.testRunService.readOutputAsset(wildcardPath);
    if (!filePayload) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({error: ADMIN_TEST_ERROR_MSG.OUTPUT_PATH_INVALID});
      return;
    }

    reply
      .code(HTTP_STATUS.OK)
      .type(filePayload.contentType)
      .send(filePayload.body);
  }

  /**
   * Resolve security context from debug route headers.
   * @param {Object} request
   * @param {Object} reply
   * @return {Object|null}
   */
  resolveDebugSecurityContext(request, reply) {
    const tenantId = request.headers[ADMIN_HEADER.TENANT_ID];
    const principal = request.headers[ADMIN_HEADER.PRINCIPAL];
    if (!tenantId || !principal) {
      reply.code(HTTP_STATUS.UNAUTHORIZED).send({
        error: ADMIN_DEBUG_ERROR_MSG.SECURITY_CONTEXT_REQUIRED,
      });
      return null;
    }

    const rolesHeader = request.headers[ADMIN_HEADER.ROLES];
    return {
      tenantId,
      principal,
      roles: parseHeaderRoles(rolesHeader),
    };
  }

  /**
   * @param {Object} reply
   * @return {Object|null}
   */
  requireDebugMetadataStore(reply) {
    if (!this.debugMetadataStore) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: ADMIN_DEBUG_ERROR_MSG.SERVICE_UNAVAILABLE,
      });
      return null;
    }
    return this.debugMetadataStore;
  }

  /**
   * Resolve debug API HTTP status from error code.
   * @param {Error} error
   * @return {number}
   */
  resolveDebugApiErrorStatus(error) {
    switch (error?.code) {
    case DEBUG_METADATA_CODE.INVALID_CONTEXT:
      return HTTP_STATUS.UNAUTHORIZED;
    case DEBUG_METADATA_CODE.UNAUTHORIZED:
      return HTTP_STATUS.FORBIDDEN;
    case DEBUG_METADATA_CODE.ENGINE_REQUIRED:
      return HTTP_STATUS.SERVICE_UNAVAILABLE;
    case DEBUG_METADATA_CODE.INVALID_REQUEST:
    case DEBUG_METADATA_CODE.BREAKPOINTS_REQUIRED:
      return HTTP_STATUS.BAD_REQUEST;
    case DEBUG_METADATA_CODE.SESSION_NOT_FOUND:
    case DEBUG_METADATA_CODE.SNAPSHOT_NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;
    default:
      return HTTP_STATUS.INTERNAL_ERROR;
    }
  }

  /**
   * Handle one trace-stream websocket connection.
   * @param {Object} socket - WebSocket connection.
   * @param {Object} request - Fastify request.
   */
  handleDebugTraceConnection(socket, request) {
    const filter = buildTraceStreamFilter(request?.query || {});
    const subscription =
      this.traceCollector.subscribe(socket, filter);
    let closed = false;

    this.logger.info(ADMIN_LOG_MSG.TRACE_STREAM_SUBSCRIBED, {
      subscriberId: subscription.subscriberId,
      filter,
    });

    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      subscription.unsubscribe();
      this.logger.info(ADMIN_LOG_MSG.TRACE_STREAM_UNSUBSCRIBED, {
        subscriberId: subscription.subscriberId,
      });
    };

    socket.on(TRANSPORT_EVENT.CLOSE, cleanup);
    socket.on(TRANSPORT_EVENT.ERROR, cleanup);
  }
}

export {AdminDebugHandlers};
