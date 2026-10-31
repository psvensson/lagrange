import {timingSafeEqual} from 'node:crypto';
import Fastify from 'fastify';
import {
  ERRNO,
  HOST,
  HTTP_STATUS,
} from '../constants/index.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HEALTH_STATUS,
  BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_ROUTE,
} from './bootstrap-api-constants.js';
import {installBootstrapApiMethods} from './bootstrap-api-method-installer.js';
import {ManagementV1Owner} from './owners/management-v1-owner.js';

const LOCAL_STR_METRICS_BOOTSTRAP_API_HEALTH_INITIALIZIN = 'metrics.bootstrap_api.health.initializing';
const REQUEST_CELL_HTTP_METHODS = Object.freeze([
  'DELETE',
  'GET',
  'PATCH',
  'POST',
  'PUT',
]);
const REQUEST_CELL_HTTP_ROUTES = Object.freeze(['/', '/*']);
const COMPLETE_PHASE = 'complete';
const FUNCTION_TYPE = 'function';

function safeStringEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  const width = Math.max(actualBytes.length, expectedBytes.length, 1);
  const actualPadded = Buffer.alloc(width);
  const expectedPadded = Buffer.alloc(width);
  actualBytes.copy(actualPadded);
  expectedBytes.copy(expectedPadded);
  return timingSafeEqual(actualPadded, expectedPadded) &&
    actualBytes.length === expectedBytes.length;
}

async function ensureInProcessSeedTransportReady(adapter) {
  if (adapter?.phase === COMPLETE_PHASE &&
      typeof adapter?.startWebSocketServer === FUNCTION_TYPE) {
    await adapter.startWebSocketServer();
  }
}

const ENCODING_BASE64 = 'base64';
const ENCODING_UTF8 = 'utf8';
const ERR_AUTHENTICATION_REQUIRED = 'Authentication required';

function parseBasicCredentialsHeader(authHeader) {
  if (typeof authHeader !== 'string') return null;
  const match = /^Basic\s+(.+)$/iu.exec(authHeader.trim());
  if (!match) return null;
  let decoded = '';
  try {
    decoded = Buffer.from(match[1], ENCODING_BASE64).toString(ENCODING_UTF8);
  } catch (_err) {
    return null;
  }
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) return null;
  return {
    user: decoded.slice(0, colonIndex),
    password: decoded.slice(colonIndex + 1),
  };
}

function sendControlPlaneUnauthorized(reply) {
  reply.code(HTTP_STATUS.UNAUTHORIZED).send({error: ERR_AUTHENTICATION_REQUIRED});
  return false;
}

const bootstrapApiServerMethods = {
  /**
   * Initialize and start the API server.
   * @param {number} port - Port to listen on (optional, 0 for random port).
   * @param {Object} [options] - Initialization options.
   * @param {boolean} [options.listen] - Whether to listen on a TCP port.
   * @return {Promise<void>}
   */
  async initialize(port, options = {}) {
    if (this.initialized) {
      return;
    }

    // Use provided port (including 0 for random), or fall back to configured port
    const listenPort = port !== undefined ? port : this.port;
    const shouldListen = options.listen !== false;

    this.fastify = Fastify({
      logger: false, // We use our own logger
    });

    this.startMoveReplicaAssignmentSweep();

    // Register routes
    this.registerRoutes();

    // Start server if required
    if (shouldListen) {
      try {
        await this.fastify.listen({port: listenPort, host: HOST.ANY});
      } catch (err) {
        // Some sandboxes disallow binding to 0.0.0.0; fall back to localhost.
        if (err && (err.code === ERRNO.EPERM || err.code === ERRNO.EACCES)) {
          await this.fastify.listen({port: listenPort, host: HOST.LOCALHOST});
        } else {
          throw err;
        }
      }
    } else {
      await ensureInProcessSeedTransportReady(this.bootstrapStartupAdapter);
      await this.fastify.ready();
    }
    this.initialized = true;

    this.logger.info(BOOTSTRAP_API_LOG_MSG.STARTED, {
      port: shouldListen ? listenPort : null,
      listen: shouldListen,
      seedNodeId: this.seedNodeId,
    });
  },

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    // Process liveness probe (does not assert join readiness).
    this.fastify.get(BOOTSTRAP_API_ROUTE.LIVEZ, async (_request, reply) => {
      return this.handleLivenessProbeRequest(reply);
    });

    // One-time startup completion probe.
    this.fastify.get(BOOTSTRAP_API_ROUTE.STARTUPZ, async (_request, reply) => {
      return this.handleStartupProbeRequest(reply);
    });

    // Readiness probe for join/admin traffic.
    this.fastify.get(BOOTSTRAP_API_ROUTE.READYZ, async (_request, reply) => {
      return this.handleReadinessProbeRequest(reply);
    });

    // Lightweight bootstrap-join readiness probe.
    this.fastify.get(BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY, async (_request, reply) => {
      return this.handleBootstrapReadinessProbeRequest(reply);
    });

    // Health check endpoint
    this.fastify.get(BOOTSTRAP_API_ROUTE.HEALTH, async (_request, reply) => {
      if (!this.getSqlQueryEngine()) {
        this.logger.debug(LOCAL_STR_METRICS_BOOTSTRAP_API_HEALTH_INITIALIZIN, {
          seedNodeId: this.seedNodeId,
          sqlEngineReady: false,
        });
        reply.code(HTTP_STATUS.OK);
        return {
          status: BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING,
          nodeId: this.seedNodeId,
          ready: false,
        };
      }
      return {
        status: BOOTSTRAP_API_HEALTH_STATUS,
        nodeId: this.seedNodeId,
        ready: true,
      };
    });

    // Bootstrap endpoint for new node registration
    this.fastify.post(BOOTSTRAP_API_ROUTE.BOOTSTRAP, async (request, reply) => {
      if (!(await this.verifyControlPlaneAuth(request, reply))) return;
      return this.handleBootstrapRequest(request, reply);
    });

    // Register service endpoint - inserts service into services system table
    this.fastify.post(BOOTSTRAP_API_ROUTE.REGISTER_SERVICE, async (request, reply) => {
      if (!(await this.verifyControlPlaneAuth(request, reply))) return;
      return this.handleRegisterServiceRequest(request, reply);
    });

    // Get cluster state endpoint
    this.fastify.get(BOOTSTRAP_API_ROUTE.CLUSTER_STATE, async (request, reply) => {
      if (!(await this.verifyControlPlaneAuth(request, reply))) return;
      return this.getClusterState();
    });

    this.fastify.get(BOOTSTRAP_API_ROUTE.MANAGEMENT_FACTS, async (request, reply) =>
      this.getManagementV1Owner().handleGetFactsRequest(request, reply));
    this.fastify.post(BOOTSTRAP_API_ROUTE.MANAGEMENT_OPERATIONS, async (request, reply) =>
      this.getManagementV1Owner().handlePostOperationRequest(request, reply));
    this.fastify.get(BOOTSTRAP_API_ROUTE.MANAGEMENT_OPERATION_BY_ID, async (request, reply) =>
      this.getManagementV1Owner().handleGetOperationStatusRequest(request, reply));

    for (const method of REQUEST_CELL_HTTP_METHODS) {
      for (const url of REQUEST_CELL_HTTP_ROUTES) {
        this.fastify.route({
          handler: async (request, reply) =>
            this.requestCellHttpAdapter.handle(request, reply),
          method,
          url,
        });
      }
    }
  },

  /**
   * Verify HTTP authentication for internal control plane endpoints.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<boolean>} Whether the request is authorized.
   */
  async verifyControlPlaneAuth(request, reply) {
    if (typeof this.authenticateControlRequest === FUNCTION_TYPE) {
      try {
        const authorized = await this.authenticateControlRequest(request);
        return authorized ? true : sendControlPlaneUnauthorized(reply);
      } catch (_err) {
        return sendControlPlaneUnauthorized(reply);
      }
    }

    const expectedUser = this.controlAuthEnv?.PGWIRE_AUTH_USER;
    const expectedPassword = this.controlAuthEnv?.PGWIRE_AUTH_PASSWORD;
    if (!expectedUser || !expectedPassword) {
      return true;
    }
    const creds = parseBasicCredentialsHeader(request.headers?.authorization);
    if (!creds ||
        !safeStringEqual(creds.user, expectedUser) ||
        !safeStringEqual(creds.password, expectedPassword)) {
      return sendControlPlaneUnauthorized(reply);
    }
    return true;
  },

  /**
   * Handle register node request - inserts node into nodes system table.
   * Uses SQL query engine to route to the correct partition leader.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Registration response.
   */
  async handleRegisterNodeRequest(request, reply) {
    this.logger.warn(BOOTSTRAP_API_LOG_MSG.REGISTER_NODE_UNSUPPORTED, {
      seedNodeId: this.seedNodeId,
    });
    reply.code(HTTP_STATUS.GONE);
    throw new Error(BOOTSTRAP_API_ERROR.REGISTER_NODE_UNSUPPORTED);
  },

  getManagementV1Owner() {
    if (!this.managementV1Owner) {
      this.managementV1Owner = new ManagementV1Owner({
        getClusterId: () => this.getClusterId?.() || this.seedNodeId,
      });
    }
    return this.managementV1Owner;
  },
};

function installBootstrapApiServerMethods(BootstrapAPI) {
  installBootstrapApiMethods(BootstrapAPI, bootstrapApiServerMethods);
}

export {installBootstrapApiServerMethods};
