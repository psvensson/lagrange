/**
 * PostgreSQL wire runtime module — lifecycle-capable native JS
 * module resolved by `runtime_ref = 'postgres-wire-runtime'`.
 *
 * Implements the runtime lifecycle contract:
 *   prepare(definition, context) — validates runtime config
 *   start(replicaContext)        — binds TCP listener, returns
 *                                  endpoint intent
 *   stop(replicaContext)         — closes listener and connections
 *   health(replicaContext)       — reports bind/session health
 *
 * The module does NOT write system tables directly. Endpoint
 * intent returned from start() is published by the lifecycle
 * owner through the SQL/CDC path.
 *
 * Requirements: 2.1, 6.1, 7.1, 9.1
 *
 * @module runtime/pgwire-runtime-module
 */

import net from 'node:net';
import {WASM_SERVICE_PROTOCOL} from
  '../wasm-service/wasm-service-constants.js';
import {
  validatePgwireRuntimeConfig,
  PGWIRE_CONFIG_FIELD,
} from './pgwire-descriptor.js';
import {
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from './runtime-driver.js';
import {classifyBindError} from './pgwire-port-allocator.js';
import {PostgresWireAdapter} from '../query/pg/postgres-wire-adapter.js';
import {PgWireProtocolHandler} from './pgwire-protocol-handler.js';
import {PgWireAuthHandler} from './pgwire-auth-handler.js';
import {
  PGWIRE_AUTH_ACTION,
} from './pgwire-auth-constants.js';
import {
  PGWIRE_AUTH_MODE,
  PGWIRE_LOOPBACK_HOSTS,
} from './pgwire-descriptor.js';

// --- Default configuration values ---

const PGWIRE_DEFAULT = Object.freeze({
  HOST: '127.0.0.1',
  PORT: 5432,
  MAX_SESSIONS: 100,
});

// --- Error messages ---

const PGWIRE_MODULE_ERROR = Object.freeze({
  DEFINITION_REQUIRED:
    'service definition is required',
  REPLICA_CONTEXT_REQUIRED:
    'replicaContext is required',
  SERVICE_ID_REQUIRED:
    'replicaContext.serviceId is required',
  NOT_PREPARED:
    'module has not been prepared for this service',
  NOT_STARTED:
    'service is not started',
  ALREADY_STARTED:
    'listener is already started for this service',
  CONFIG_INVALID:
    'runtime config validation failed',
  BIND_FAILED:
    'TCP listener bind failed',
  LISTENER_NOT_ACCEPTING:
    'TCP listener is not accepting connections',
  SQL_REQUEST_EXECUTOR_REQUIRED:
    'replicaContext.sqlRequestExecutor is required',
  CREDENTIAL_VERIFIER_REQUIRED:
    'password authentication requires a credential verifier',
  TRUST_REQUIRES_LOOPBACK:
    'trust authentication may only bind to a loopback host',
});

// --- Module state constants ---

const LISTENER_STATE = Object.freeze({
  BOUND: 'bound',
  CLOSED: 'closed',
});

const PGWIRE_EVENT = Object.freeze({
  CONNECTION: 'connection',
  CLOSE: 'close',
  ERROR: 'error',
});

const PGWIRE_CONTEXT_FIELD = Object.freeze({
  SERVICE_ID: 'serviceId',
  SERVICE_ID_LEGACY: 'service_id',
});

const PGWIRE_CONFIG_OVERRIDE_FIELD = Object.freeze({
  HOST: 'host',
  PORT: 'port',
  MAX_SESSIONS: 'maxSessions',
});

const PGWIRE_RESULT_FIELD = Object.freeze({
  ERROR: 'error',
  DETAIL: 'detail',
});

const PGWIRE_SEPARATOR = Object.freeze({
  DETAIL: ': ',
  ERROR_LIST: '; ',
});

function buildStatusResult(status, detailKey, detailValueKey, detailValue) {
  const result = {status};
  if (detailKey && detailValue) {
    result[detailKey] = detailValue;
  }
  if (detailValueKey !== undefined) {
    result[detailValueKey] = detailValue;
  }
  return result;
}

function buildPgwireServiceScopedError(baseMessage, serviceId) {
  return `${baseMessage}: '${serviceId}'`;
}

/**
 * Parse and resolve runtime config from a service definition.
 *
 * @param {Object} definition - The service definition.
 * @param {Object} [overrides] - Optional overrides from replica
 *   context (e.g. dynamic port allocation).
 * @return {{host: string, port: number, maxSessions: number}}
 */
function resolveConfigValue(overrides, overrideKey, parsed, configKey, fallback) {
  if (overrides?.[overrideKey] !== undefined) {
    return overrides[overrideKey];
  }
  return parsed[configKey] ?? fallback;
}

function resolveConfig(definition, overrides) {
  const raw = definition.runtimeConfig ??
    definition.runtime_config;
  let parsed = {};
  if (raw && typeof raw === 'string') {
    parsed = JSON.parse(raw);
  } else if (raw && typeof raw === 'object') {
    parsed = raw;
  }
  return {
    host: resolveConfigValue(
      overrides,
      PGWIRE_CONFIG_OVERRIDE_FIELD.HOST,
      parsed,
      PGWIRE_CONFIG_FIELD.HOST,
      PGWIRE_DEFAULT.HOST,
    ),
    port: resolveConfigValue(
      overrides,
      PGWIRE_CONFIG_OVERRIDE_FIELD.PORT,
      parsed,
      PGWIRE_CONFIG_FIELD.PORT,
      PGWIRE_DEFAULT.PORT,
    ),
    maxSessions: resolveConfigValue(
      overrides,
      PGWIRE_CONFIG_OVERRIDE_FIELD.MAX_SESSIONS,
      parsed,
      PGWIRE_CONFIG_FIELD.MAX_SESSIONS,
      PGWIRE_DEFAULT.MAX_SESSIONS,
    ),
    authMode: parsed[PGWIRE_CONFIG_FIELD.AUTH_MODE],
    tlsMode: parsed[PGWIRE_CONFIG_FIELD.TLS_MODE],
  };
}

/**
 * PostgresWireRuntimeModule — lifecycle-capable native JS module
 * for the sys-postgres-wire replicated service.
 *
 * Each prepared service gets a config snapshot. Each started
 * service gets a TCP server and connection tracking.
 */
class PostgresWireRuntimeModule {
  constructor(options = {}) {
    /** @type {Map<string, Object>} Prepared config by serviceId */
    this._prepared = new Map();

    /** @type {Map<string, Object>} Running state by serviceId */
    this._running = new Map();
    this._logger = options.logger || console;
    this._credentialVerifier = options.credentialVerifier || null;
    this._authHandlerFactory = options.authHandlerFactory ||
      ((config, replicaContext) => new PgWireAuthHandler({
        mode: config.authMode,
        authenticator: config.authMode === PGWIRE_AUTH_MODE.PASSWORD ?
          (replicaContext.pgwireCredentialVerifier ||
            this._credentialVerifier) : undefined,
        policy: {
          allowedActions: new Set([PGWIRE_AUTH_ACTION.EXECUTE_QUERY]),
        },
        logger: this._logger,
      }));
  }

  /**
   * Validate runtime config and prepare the module for a service.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} [_context] - Preparation context (unused).
   * @return {Promise<{status: string, error?: string}>}
   */
  async prepare(definition, _context) {
    let result;
    if (!definition || typeof definition !== 'object') {
      result = buildStatusResult(
        PREPARE_STATUS.FAILED,
        PGWIRE_RESULT_FIELD.ERROR,
        undefined,
        PGWIRE_MODULE_ERROR.DEFINITION_REQUIRED,
      );
    } else {
      const configStr = definition.runtimeConfig ??
        definition.runtime_config;
      const validation = validatePgwireRuntimeConfig(configStr);
      if (!validation.valid) {
        result = buildStatusResult(
          PREPARE_STATUS.FAILED,
          PGWIRE_RESULT_FIELD.ERROR,
          undefined,
          `${PGWIRE_MODULE_ERROR.CONFIG_INVALID}` +
            `${PGWIRE_SEPARATOR.DETAIL}` +
            `${validation.errors.join(PGWIRE_SEPARATOR.ERROR_LIST)}`,
        );
      } else {
        const serviceId = definition[PGWIRE_CONTEXT_FIELD.SERVICE_ID] ??
          definition[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY];
        const config = resolveConfig(definition);
        this._prepared.set(serviceId, {config, definition});
        result = buildStatusResult(PREPARE_STATUS.READY);
      }
    }
    return result;
  }

  /**
   * Bind a TCP listener and return endpoint intent.
   *
   * The listener owns protocol handlers and their authenticated sessions.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, endpointIntent?: Object,
   *   error?: string}>}
   */
  async start(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== 'object') {
      return buildStatusResult(
        START_STATUS.FAILED,
        PGWIRE_RESULT_FIELD.ERROR,
        undefined,
        PGWIRE_MODULE_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] ??
      replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY];
    if (!serviceId) {
      return buildStatusResult(
        START_STATUS.FAILED,
        PGWIRE_RESULT_FIELD.ERROR,
        undefined,
        PGWIRE_MODULE_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    if (!this._prepared.has(serviceId)) {
      return buildStatusResult(
        START_STATUS.FAILED,
        PGWIRE_RESULT_FIELD.ERROR,
        undefined,
        buildPgwireServiceScopedError(
          PGWIRE_MODULE_ERROR.NOT_PREPARED,
          serviceId,
        ),
      );
    }

    if (this._running.has(serviceId)) {
      const state = this._running.get(serviceId);
      return {
        status: START_STATUS.RUNNING,
        endpointIntent: state.endpointIntent,
      };
    }

    const prepared = this._prepared.get(serviceId);
    const overrides = {
      host: replicaContext.host,
      port: replicaContext.port,
      maxSessions: replicaContext.maxSessions,
    };
    const config = resolveConfig(prepared.definition, overrides);
    if (
      config.authMode === PGWIRE_AUTH_MODE.TRUST &&
      !PGWIRE_LOOPBACK_HOSTS.has(config.host)
    ) {
      return buildStatusResult(
        START_STATUS.FAILED,
        PGWIRE_RESULT_FIELD.ERROR,
        undefined,
        PGWIRE_MODULE_ERROR.TRUST_REQUIRES_LOOPBACK,
      );
    }
    if (typeof replicaContext.sqlRequestExecutor !== 'function') {
      return buildStatusResult(
        START_STATUS.FAILED,
        PGWIRE_RESULT_FIELD.ERROR,
        undefined,
        PGWIRE_MODULE_ERROR.SQL_REQUEST_EXECUTOR_REQUIRED,
      );
    }
    const credentialVerifier =
      replicaContext.pgwireCredentialVerifier || this._credentialVerifier;
    if (
      config.authMode === PGWIRE_AUTH_MODE.PASSWORD &&
      typeof credentialVerifier !== 'function'
    ) {
      return buildStatusResult(
        START_STATUS.FAILED,
        PGWIRE_RESULT_FIELD.ERROR,
        undefined,
        PGWIRE_MODULE_ERROR.CREDENTIAL_VERIFIER_REQUIRED,
      );
    }
    const authHandler = this._authHandlerFactory(config, {
      ...replicaContext,
      pgwireCredentialVerifier: credentialVerifier,
    });
    const adapter = new PostgresWireAdapter({
      sqlCore: {executeRequest: replicaContext.sqlRequestExecutor},
      authHandler,
      logger: this._logger,
    });
    const server = net.createServer();
    const connections = new Set();
    const handlers = new Map();

    server.on(PGWIRE_EVENT.CONNECTION, (socket) => {
      if (connections.size >= config.maxSessions) {
        socket.destroy();
        return;
      }
      connections.add(socket);
      const handler = new PgWireProtocolHandler({
        adapter,
        socket,
        authMode: config.authMode,
        logger: this._logger,
      });
      handlers.set(socket, handler);
      socket.on(PGWIRE_EVENT.CLOSE, () => {
        handler.destroy();
        handlers.delete(socket);
        connections.delete(socket);
      });
      handler.start();
    });

    const boundPort = await new Promise((resolve, reject) => {
      server.once(PGWIRE_EVENT.ERROR, (err) => reject(err));
      server.listen(config.port, config.host, () => {
        server.removeAllListeners(PGWIRE_EVENT.ERROR);
        const addr = server.address();
        resolve(addr.port);
      });
    }).catch((err) => {
      throw classifyBindError(err, config.port);
    });

    const endpointIntent = {
      host: config.host,
      port: boundPort,
      protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    };

    this._running.set(serviceId, {
      server,
      adapter,
      connections,
      handlers,
      config,
      endpointIntent,
      state: LISTENER_STATE.BOUND,
    });

    return {
      status: START_STATUS.RUNNING,
      endpointIntent,
    };
  }

  /**
   * Close the TCP listener and all active connections.
   *
   * Deterministic cleanup: destroys all sockets, then closes
   * the server. Idempotent: stopping an already-stopped service
   * is a no-op.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<void>}
   */
  async stop(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== 'object') {
      return;
    }

    const serviceId = replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] ??
      replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY];
    if (!serviceId) {
      return;
    }

    const entry = this._running.get(serviceId);
    if (!entry) {
      // Idempotent: not running, clean up prepared state
      this._prepared.delete(serviceId);
      return;
    }

    for (const handler of entry.handlers.values()) {
      handler.destroy();
    }
    entry.handlers.clear();
    for (const socket of entry.connections) {
      socket.destroy();
    }
    entry.connections.clear();

    // Close the TCP server
    await new Promise((resolve) => {
      entry.server.close(() => resolve());
    });

    entry.state = LISTENER_STATE.CLOSED;
    this._running.delete(serviceId);
    this._prepared.delete(serviceId);
  }

  /**
   * Report listener bind and session health.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, detail?: string,
   *   sessions?: number, maxSessions?: number}>}
   */
  async health(replicaContext) {
    let result;
    if (!replicaContext ||
        typeof replicaContext !== 'object') {
      result = buildStatusResult(
        HEALTH_STATUS.UNKNOWN,
        PGWIRE_RESULT_FIELD.DETAIL,
        undefined,
        PGWIRE_MODULE_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    } else {
      const serviceId = replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] ??
        replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY];
      if (!serviceId) {
        result = buildStatusResult(
          HEALTH_STATUS.UNKNOWN,
          PGWIRE_RESULT_FIELD.DETAIL,
          undefined,
          PGWIRE_MODULE_ERROR.SERVICE_ID_REQUIRED,
        );
      } else if (!this._running.has(serviceId)) {
        result = buildStatusResult(
          HEALTH_STATUS.UNHEALTHY,
          PGWIRE_RESULT_FIELD.DETAIL,
          undefined,
          buildPgwireServiceScopedError(
            PGWIRE_MODULE_ERROR.NOT_STARTED,
            serviceId,
          ),
        );
      } else {
        const entry = this._running.get(serviceId);
        if (!entry.server.listening) {
          result = buildStatusResult(
            HEALTH_STATUS.UNHEALTHY,
            PGWIRE_RESULT_FIELD.DETAIL,
            undefined,
            PGWIRE_MODULE_ERROR.LISTENER_NOT_ACCEPTING,
          );
        } else {
          result = {
            status: HEALTH_STATUS.HEALTHY,
            sessions: entry.connections.size,
            maxSessions: entry.config.maxSessions,
          };
        }
      }
    }
    return result;
  }
}

export {
  PostgresWireRuntimeModule,
  PGWIRE_MODULE_ERROR,
  PGWIRE_DEFAULT,
  LISTENER_STATE,
  resolveConfig,
};
