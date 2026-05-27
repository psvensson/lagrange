import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';

const {
  ADMIN_LOG_MSG,
  DebugMetadataStore,
  ERRNO,
  TYPEOF,
  resolvePreferredControlPlaneReadinessService,
  resolveSqlEngineControlPlaneReadinessService,
} = ADMIN_WEBSOCKET_API_SHARED;

const ADMIN_WEBSOCKET_LIFECYCLE_METHODS = {
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
    this.subscribeToCacheNotifications();
  },

  setSQLQueryEngine(engine) {
    this.sqlQueryEngine = engine;
    const resolvedControlPlaneReadinessService =
      resolveSqlEngineControlPlaneReadinessService(engine);
    this.controlPlaneReadinessService =
      resolvePreferredControlPlaneReadinessService(
        this.controlPlaneReadinessService,
        resolvedControlPlaneReadinessService,
      );
    if (this.controlSnapshot) {
      this.controlSnapshot.sqlQueryEngine = engine || null;
      this.controlSnapshot.controlPlaneReadinessService =
        resolvePreferredControlPlaneReadinessService(
          this.controlSnapshot.controlPlaneReadinessService,
          this.controlPlaneReadinessService,
        );
    }
    if (this.preflightSnapshot) {
      this.preflightSnapshot.sqlQueryEngine = engine || null;
    }
    if (
      this.liveQueryManager &&
      typeof this.liveQueryManager.initialize === TYPEOF.FUNCTION
    ) {
      this.liveQueryManager.initialize({
        sqlQueryEngine: engine,
      });
    }
    if (
      this.debugMetadataStore &&
      typeof this.debugMetadataStore.setSqlQueryEngine === TYPEOF.FUNCTION
    ) {
      this.debugMetadataStore.setSqlQueryEngine(engine);
      return;
    }
    if (!this.debugMetadataStore && engine) {
      this.debugMetadataStore = new DebugMetadataStore({
        sqlQueryEngine: engine,
      });
      this.debugHandlers.debugMetadataStore = this.debugMetadataStore;
    }
  },

  getClientCount() {
    return this.clients.size;
  },

  getFastify() {
    return this.fastify;
  },

  isInitialized() {
    return this.initialized;
  },

  isListening() {
    return this.listening;
  },

  async shutdown() {
    for (const clientInfo of this.clients) {
      try {
        clientInfo.socket.terminate();
      } catch (_closeErr) {
        // Ignore close errors during shutdown
      }
    }
    this.clients.clear();

    if (this.fastify) {
      const server = this.fastify.server;
      if (server && typeof server.closeAllConnections === TYPEOF.FUNCTION) {
        server.closeAllConnections();
      }
      await this.fastify.close();
      if (server && typeof server.close === TYPEOF.FUNCTION) {
        await new Promise((resolve) => {
          server.close((error) => {
            if (error && error.code !== ERRNO.NOT_RUNNING) {
              this.logger.warn(ADMIN_LOG_MSG.SERVER_CLOSE_ERROR, {
                error: error.message,
              });
            }
            resolve();
          });
        });
      }
      if (server && typeof server.unref === TYPEOF.FUNCTION) {
        server.unref();
      }
      this.fastify = null;
    }

    this.initialized = false;

    this.logger.info(ADMIN_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
    });
  },
};

export {ADMIN_WEBSOCKET_LIFECYCLE_METHODS};
