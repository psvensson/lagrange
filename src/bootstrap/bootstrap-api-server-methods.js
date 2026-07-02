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

const LOCAL_STR_METRICS_BOOTSTRAP_API_HEALTH_INITIALIZIN = 'metrics.bootstrap_api.health.initializing';

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
      return this.handleBootstrapRequest(request, reply);
    });

    // Register service endpoint - inserts service into services system table
    this.fastify.post(BOOTSTRAP_API_ROUTE.REGISTER_SERVICE, async (request, reply) => {
      return this.handleRegisterServiceRequest(request, reply);
    });

    // Get cluster state endpoint
    this.fastify.get(BOOTSTRAP_API_ROUTE.CLUSTER_STATE, async (_request, _reply) => {
      return this.getClusterState();
    });
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
};

function installBootstrapApiServerMethods(BootstrapAPI) {
  installBootstrapApiMethods(BootstrapAPI, bootstrapApiServerMethods);
}

export {installBootstrapApiServerMethods};
