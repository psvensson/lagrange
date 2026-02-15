/**
 * Trace artifact recorder for distributed harness runs.
 *
 * Captures node-admin debug trace websocket events into NDJSON and
 * writes a compact manifest for scenario-level assertions/reporting.
 */

import {createWriteStream} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {URLSearchParams} from 'node:url';
import {
  DEBUG_TRACE_DEFAULTS,
  OUTPUT,
  PORTS,
} from './constants.js';

const NEWLINE = '\n';
const STREAM_FLAGS_TRUNCATE = 'w';
const TRACE_STREAM_PROTOCOL = 'ws';
const TRACE_HTTP_PROTOCOL = 'http';
const TRACE_STREAM_PATH = '/api/admin/debug/trace';
const TRACE_SESSION_PATH = '/api/admin/debug/sessions';
const TRACE_HEADER_CONTENT_TYPE = 'content-type';
const TRACE_CONTENT_TYPE_JSON = 'application/json';
const TRACE_HEADER_TENANT = 'x-tenant-id';
const TRACE_HEADER_PRINCIPAL = 'x-principal';
const TRACE_HEADER_ROLES = 'x-roles';
const TRACE_METHOD_POST = 'POST';
const TRACE_METHOD_PATCH = 'PATCH';
const TRACE_DEFAULT_NODE_ID = 'unknown-node';
const TRACE_DEFAULT_SCENARIO = 'unknown-scenario';
const TRACE_WARNING_MISSING_NODE = 'missing-node-context';
const TRACE_WARNING_SOCKET_OPEN_FAILED = 'trace-stream-open-failed';
const TRACE_WARNING_SESSION_CREATE_FAILED = 'trace-session-create-failed';
const TRACE_WARNING_SESSION_DETACH_FAILED = 'trace-session-detach-failed';
const TRACE_WARNING_MESSAGE_PARSE = 'trace-message-parse-failed';
const TRACE_WARNING_WRITE_FAILED = 'trace-write-failed';
const TRACE_WARNING_STREAM_CLOSE_FAILED = 'trace-stream-close-failed';

/**
 * Capture trace events for one scenario run.
 */
class TraceArtifactRecorder {
  /**
   * @param {Object} [options]
   * @param {string} [options.outputDir]
   */
  constructor(options = {}) {
    this._outputDir = options.outputDir || OUTPUT.DEFAULT_DIR;
    this._scenarioName = TRACE_DEFAULT_SCENARIO;
    this._node = null;
    this._config = normalizeTraceConfig({});
    this._started = false;

    this._sessionId = null;
    this._traceSocket = null;
    this._eventsStream = null;

    this._eventsPath = null;
    this._manifestPath = null;
    this._manifest = null;
    this._startedAt = null;
    this._endedAt = null;

    this._eventCount = 0;
    this._lineageIds = new Set();
    this._nodeIds = new Set();
    this._warnings = [];
  }

  /**
   * Start trace capture.
   * @param {Object} context
   * @param {Object} [context.node] - NodeHandle-like object with `ip` and `id`.
   * @param {string} [context.scenarioName]
   * @param {Object} [context.debugTrace]
   * @return {Promise<void>}
   */
  async start(context = {}) {
    if (this._started) {
      return;
    }

    this._scenarioName = context.scenarioName || TRACE_DEFAULT_SCENARIO;
    this._node = context.node || null;
    this._config = normalizeTraceConfig(context.debugTrace || {});

    if (!this._node || !this._node.ip) {
      this._recordWarning(
        TRACE_WARNING_MISSING_NODE,
        'Trace recorder started without a node context',
      );
      this._started = true;
      this._startedAt = Date.now();
      return;
    }

    const scenarioDir = join(this._outputDir, this._scenarioName);
    await mkdir(scenarioDir, {recursive: true});

    this._eventsPath = join(
      scenarioDir,
      OUTPUT.DEBUG_TRACE_EVENTS_FILENAME,
    );
    this._manifestPath = join(
      scenarioDir,
      OUTPUT.DEBUG_TRACE_MANIFEST_FILENAME,
    );

    this._eventsStream = createWriteStream(this._eventsPath, {
      flags: STREAM_FLAGS_TRUNCATE,
    });
    this._startedAt = Date.now();
    this._sessionId = this._config.sessionId ||
      `trace-session-${randomUUID()}`;

    try {
      await this._createTraceSession();
    } catch (error) {
      this._recordWarning(
        TRACE_WARNING_SESSION_CREATE_FAILED,
        error.message,
      );
    }

    try {
      await this._openTraceSocket();
    } catch (error) {
      this._recordWarning(
        TRACE_WARNING_SOCKET_OPEN_FAILED,
        error.message,
      );
    }

    this._started = true;
  }

  /**
   * Stop trace capture and write manifest.
   * @return {Promise<Object|null>}
   */
  async stop() {
    if (!this._started) {
      return this._manifest;
    }

    this._endedAt = Date.now();

    if (this._traceSocket) {
      try {
        await closeWebSocket(this._traceSocket);
      } catch (error) {
        this._recordWarning(
          TRACE_WARNING_SOCKET_OPEN_FAILED,
          error.message,
        );
      }
      this._traceSocket = null;
    }

    if (this._sessionId && this._node && this._node.ip) {
      try {
        await this._detachTraceSession();
      } catch (error) {
        this._recordWarning(
          TRACE_WARNING_SESSION_DETACH_FAILED,
          error.message,
        );
      }
    }

    if (this._eventsStream) {
      try {
        await closeWriteStream(this._eventsStream);
      } catch (error) {
        this._recordWarning(
          TRACE_WARNING_STREAM_CLOSE_FAILED,
          error.message,
        );
      }
      this._eventsStream = null;
    }

    this._manifest = {
      sessionId: this._sessionId,
      nodeId: this._node?.id || TRACE_DEFAULT_NODE_ID,
      scenarioName: this._scenarioName,
      startedAt: this._startedAt,
      endedAt: this._endedAt,
      durationMs: this._endedAt - this._startedAt,
      eventCount: this._eventCount,
      lineageIds: Array.from(this._lineageIds.values()),
      nodeIds: Array.from(this._nodeIds.values()),
      warnings: [...this._warnings],
      files: {
        events: this._eventsPath,
        manifest: this._manifestPath,
      },
      filters: {
        lineagePrefix: this._config.lineagePrefix,
        levels: this._config.levels,
        nodeId: this._config.nodeId || null,
      },
    };

    if (this._manifestPath) {
      await writeFile(
        this._manifestPath,
        JSON.stringify(this._manifest, null, 2) + NEWLINE,
        'utf8',
      );
    }

    this._started = false;
    return this._manifest;
  }

  /**
   * @return {Object|null}
   */
  getManifest() {
    return this._manifest;
  }

  /**
   * @private
   */
  async _createTraceSession() {
    const payload = {
      sessionId: this._sessionId,
      serviceName: this._config.serviceName,
      lineageId: this._config.sessionLineageId || null,
      stageId: this._config.sessionStageId || null,
      nodeId: this._node.id || TRACE_DEFAULT_NODE_ID,
      endpoint: buildTraceSocketUrl(this._node.ip, this._config),
    };
    await this._adminRequest(TRACE_METHOD_POST, TRACE_SESSION_PATH, payload);
  }

  /**
   * @private
   */
  async _detachTraceSession() {
    const path = `${TRACE_SESSION_PATH}/${encodeURIComponent(this._sessionId)}`;
    await this._adminRequest(TRACE_METHOD_PATCH, path, {detach: true});
  }

  /**
   * @private
   */
  async _openTraceSocket() {
    const {WebSocket} = await import('ws');
    const url = buildTraceSocketUrl(this._node.ip, this._config);
    const socket = new WebSocket(url);

    socket.on('message', (data) => {
      this._onTraceFrame(data);
    });
    socket.on('error', (error) => {
      this._recordWarning(
        TRACE_WARNING_SOCKET_OPEN_FAILED,
        error.message,
      );
    });

    await waitForSocketOpen(socket, this._config.connectTimeoutMs);
    this._traceSocket = socket;
  }

  /**
   * @param {Buffer|string} data
   * @private
   */
  _onTraceFrame(data) {
    let event = null;
    try {
      event = JSON.parse(data.toString());
    } catch (error) {
      this._recordWarning(TRACE_WARNING_MESSAGE_PARSE, error.message);
      return;
    }
    this._writeTraceEvent(event);
  }

  /**
   * @param {Object} event
   * @private
   */
  _writeTraceEvent(event) {
    if (!this._eventsStream) {
      return;
    }

    try {
      this._eventsStream.write(
        JSON.stringify(event) + NEWLINE,
      );
      this._eventCount += 1;
      if (typeof event.lineageId === 'string' &&
        event.lineageId.length > 0) {
        this._lineageIds.add(event.lineageId);
      }
      if (typeof event.nodeId === 'string' &&
        event.nodeId.length > 0) {
        this._nodeIds.add(event.nodeId);
      }
    } catch (error) {
      this._recordWarning(TRACE_WARNING_WRITE_FAILED, error.message);
    }
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {Object} payload
   * @return {Promise<Object|null>}
   * @private
   */
  async _adminRequest(method, path, payload) {
    const url = buildAdminHttpUrl(
      this._node.ip,
      this._config.adminApiPort,
      path,
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this._config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          [TRACE_HEADER_CONTENT_TYPE]: TRACE_CONTENT_TYPE_JSON,
          [TRACE_HEADER_TENANT]: this._config.tenantId,
          [TRACE_HEADER_PRINCIPAL]: this._config.principal,
          [TRACE_HEADER_ROLES]: this._config.roles,
        },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      const body = await response.text();
      const parsed = body ? parseJsonSafe(body) : null;
      if (!response.ok) {
        throw new Error(
          `${method} ${path} failed: HTTP ${response.status}`,
        );
      }
      return parsed;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * @param {string} code
   * @param {string} message
   * @private
   */
  _recordWarning(code, message) {
    this._warnings.push({
      code,
      message,
      timestamp: Date.now(),
    });
  }
}

/**
 * @param {string} host
 * @param {Object} config
 * @return {string}
 */
function buildTraceSocketUrl(host, config) {
  const query = new URLSearchParams();
  if (config.lineagePrefix) {
    query.set('lineagePrefix', config.lineagePrefix);
  }
  if (Array.isArray(config.levels) && config.levels.length > 0) {
    query.set('levels', config.levels.join(','));
  }
  if (config.nodeId) {
    query.set('nodeId', config.nodeId);
  }
  const queryString = query.toString();
  const path = queryString ?
    `${TRACE_STREAM_PATH}?${queryString}` :
    TRACE_STREAM_PATH;
  return `${TRACE_STREAM_PROTOCOL}://${host}:${config.adminApiPort}${path}`;
}

/**
 * @param {string} host
 * @param {number} port
 * @param {string} path
 * @return {string}
 */
function buildAdminHttpUrl(host, port, path) {
  return `${TRACE_HTTP_PROTOCOL}://${host}:${port}${path}`;
}

/**
 * @param {Object} config
 * @return {Object}
 */
function normalizeTraceConfig(config) {
  return {
    enabled: config.enabled === true,
    required: config.required === true,
    serviceName:
      config.serviceName || DEBUG_TRACE_DEFAULTS.serviceName,
    lineagePrefix: config.lineagePrefix || null,
    requiredLineagePrefix: config.requiredLineagePrefix || null,
    levels: normalizeLevels(config.levels),
    sessionLineageId: config.sessionLineageId || config.lineageId || null,
    sessionStageId: Number.isInteger(config.sessionStageId) ?
      config.sessionStageId :
      null,
    tenantId: config.tenantId || DEBUG_TRACE_DEFAULTS.tenantId,
    principal: config.principal || DEBUG_TRACE_DEFAULTS.principal,
    roles: config.roles || DEBUG_TRACE_DEFAULTS.roles,
    connectTimeoutMs: Number.isInteger(config.connectTimeoutMs) &&
      config.connectTimeoutMs > 0 ?
      config.connectTimeoutMs :
      DEBUG_TRACE_DEFAULTS.connectTimeoutMs,
    requestTimeoutMs: Number.isInteger(config.requestTimeoutMs) &&
      config.requestTimeoutMs > 0 ?
      config.requestTimeoutMs :
      DEBUG_TRACE_DEFAULTS.requestTimeoutMs,
    adminApiPort: Number.isInteger(config.adminApiPort) &&
      config.adminApiPort > 0 ?
      config.adminApiPort :
      PORTS.ADMIN_API,
    sessionId: config.sessionId || null,
    nodeId: config.nodeId || null,
  };
}

/**
 * @param {*} levels
 * @return {Array<string>|null}
 */
function normalizeLevels(levels) {
  if (Array.isArray(levels)) {
    const normalized = levels
      .map((level) => String(level || '').trim())
      .filter((level) => level.length > 0);
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof levels === 'string') {
    const normalized = levels.split(',')
      .map((level) => level.trim())
      .filter((level) => level.length > 0);
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

/**
 * @param {string} value
 * @return {*}
 */
function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * @param {Object} socket
 * @param {number} timeoutMs
 * @return {Promise<void>}
 */
function waitForSocketOpen(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error('Timed out waiting for trace socket open'));
    }, timeoutMs);

    const onOpen = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const onError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    socket.once('open', onOpen);
    socket.once('error', onError);
  });
}

/**
 * @param {Object} socket
 * @return {Promise<void>}
 */
function closeWebSocket(socket) {
  return new Promise((resolve) => {
    if (!socket || socket.readyState !== 1) {
      resolve();
      return;
    }
    socket.once('close', () => {
      resolve();
    });
    socket.close();
  });
}

/**
 * @param {Object} stream
 * @return {Promise<void>}
 */
function closeWriteStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end(() => {
      resolve();
    });
    stream.once('error', (error) => {
      reject(error);
    });
  });
}

export {
  TraceArtifactRecorder,
  normalizeTraceConfig,
  buildTraceSocketUrl,
};
