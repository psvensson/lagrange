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
import {TYPEOF} from '../constants/types.js';
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

// --- Default configuration values ---

const PGWIRE_DEFAULT = Object.freeze({
  HOST: '0.0.0.0',
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
});

// --- Module state constants ---

const LISTENER_STATE = Object.freeze({
  BOUND: 'bound',
  CLOSED: 'closed',
});

/**
 * Parse and resolve runtime config from a service definition.
 *
 * @param {Object} definition - The service definition.
 * @param {Object} [overrides] - Optional overrides from replica
 *   context (e.g. dynamic port allocation).
 * @return {{host: string, port: number, maxSessions: number}}
 */
function resolveConfig(definition, overrides) {
  const raw = definition.runtimeConfig ??
    definition.runtime_config ?? null;
  let parsed = {};
  if (raw && typeof raw === TYPEOF.STRING) {
    parsed = JSON.parse(raw);
  } else if (raw && typeof raw === TYPEOF.OBJECT) {
    parsed = raw;
  }
  return {
    host: overrides?.host ??
      parsed[PGWIRE_CONFIG_FIELD.HOST] ??
      PGWIRE_DEFAULT.HOST,
    port: overrides?.port ??
      parsed[PGWIRE_CONFIG_FIELD.PORT] ??
      PGWIRE_DEFAULT.PORT,
    maxSessions: overrides?.maxSessions ??
      parsed[PGWIRE_CONFIG_FIELD.MAX_SESSIONS] ??
      PGWIRE_DEFAULT.MAX_SESSIONS,
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
  constructor() {
    /** @type {Map<string, Object>} Prepared config by serviceId */
    this._prepared = new Map();

    /** @type {Map<string, Object>} Running state by serviceId */
    this._running = new Map();
  }

  /**
   * Validate runtime config and prepare the module for a service.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} [_context] - Preparation context (unused).
   * @return {Promise<{status: string, error?: string}>}
   */
  async prepare(definition, _context) {
    if (!definition || typeof definition !== TYPEOF.OBJECT) {
      return {
        status: PREPARE_STATUS.FAILED,
        error: PGWIRE_MODULE_ERROR.DEFINITION_REQUIRED,
      };
    }

    const configStr = definition.runtimeConfig ??
      definition.runtime_config ?? null;
    const validation = validatePgwireRuntimeConfig(configStr);
    if (!validation.valid) {
      return {
        status: PREPARE_STATUS.FAILED,
        error: `${PGWIRE_MODULE_ERROR.CONFIG_INVALID}: ` +
          `${validation.errors.join('; ')}`,
      };
    }

    const serviceId = definition.serviceId ??
      definition.service_id;
    const config = resolveConfig(definition);
    this._prepared.set(serviceId, {config, definition});

    return {status: PREPARE_STATUS.READY};
  }

  /**
   * Bind a TCP listener and return endpoint intent.
   *
   * The listener accepts PostgreSQL client connections. Actual
   * protocol handling is wired externally (Task 12); this module
   * owns only the listener lifecycle.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, endpointIntent?: Object,
   *   error?: string}>}
   */
  async start(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      return {
        status: START_STATUS.FAILED,
        error: PGWIRE_MODULE_ERROR.REPLICA_CONTEXT_REQUIRED,
      };
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      return {
        status: START_STATUS.FAILED,
        error: PGWIRE_MODULE_ERROR.SERVICE_ID_REQUIRED,
      };
    }

    if (!this._prepared.has(serviceId)) {
      return {
        status: START_STATUS.FAILED,
        error: `${PGWIRE_MODULE_ERROR.NOT_PREPARED}: '${serviceId}'`,
      };
    }

    if (this._running.has(serviceId)) {
      // Idempotent: return existing endpoint intent
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
    const server = net.createServer();
    const connections = new Set();

    server.on('connection', (socket) => {
      if (connections.size >= config.maxSessions) {
        socket.destroy();
        return;
      }
      connections.add(socket);
      socket.on('close', () => connections.delete(socket));
    });

    const boundPort = await new Promise((resolve, reject) => {
      server.once('error', (err) => reject(err));
      server.listen(config.port, config.host, () => {
        server.removeAllListeners('error');
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
      connections,
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
        typeof replicaContext !== TYPEOF.OBJECT) {
      return;
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      return;
    }

    const entry = this._running.get(serviceId);
    if (!entry) {
      // Idempotent: not running, clean up prepared state
      this._prepared.delete(serviceId);
      return;
    }

    // Destroy all active connections first
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
    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: PGWIRE_MODULE_ERROR.REPLICA_CONTEXT_REQUIRED,
      };
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: PGWIRE_MODULE_ERROR.SERVICE_ID_REQUIRED,
      };
    }

    if (!this._running.has(serviceId)) {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: `${PGWIRE_MODULE_ERROR.NOT_STARTED}: '${serviceId}'`,
      };
    }

    const entry = this._running.get(serviceId);
    const listening = entry.server.listening;

    if (!listening) {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: 'TCP listener is not accepting connections',
      };
    }

    return {
      status: HEALTH_STATUS.HEALTHY,
      sessions: entry.connections.size,
      maxSessions: entry.config.maxSessions,
    };
  }
}

export {
  PostgresWireRuntimeModule,
  PGWIRE_MODULE_ERROR,
  PGWIRE_DEFAULT,
  LISTENER_STATE,
  resolveConfig,
};
