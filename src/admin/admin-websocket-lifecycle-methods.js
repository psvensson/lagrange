import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {
  ADMIN_WEBSOCKET_LIFECYCLE_STATE,
} from './admin-websocket-lifecycle-state.js';

const {
  ADMIN_ERROR_MESSAGE,
  ADMIN_LOG_MSG,
  DebugMetadataStore,
  ERRNO,
  resolvePreferredControlPlaneReadinessService,
  resolveSqlEngineControlPlaneReadinessService,
} = ADMIN_WEBSOCKET_API_SHARED;
const LOCAL_STR_CACHE_MUTATION_TARGET = 'cacheMutationTarget';

function hasOwnCacheMutationTarget(options) {
  return Object.prototype.hasOwnProperty.call(
    options,
    LOCAL_STR_CACHE_MUTATION_TARGET,
  );
}

function resolveReplacementCacheMutationTarget(api, cache, options) {
  if (hasOwnCacheMutationTarget(options)) {
    return options.cacheMutationTarget || null;
  }
  if (api.cacheMutationTarget === api.systemTableCache) {
    return cache;
  }
  return api.cacheMutationTarget;
}

function resolveCacheOwnerParticipants(api) {
  const participants = [
    api.controlSnapshot,
    api.preflightSnapshot,
    api.serviceDiscovery,
  ];
  if (participants.some(
    (participant) => typeof participant?.setCacheOwner !== 'function',
  )) {
    throw new Error(ADMIN_ERROR_MESSAGE.CACHE_OWNER_TRANSITION_UNAVAILABLE);
  }
  return participants;
}

const ADMIN_WEBSOCKET_LIFECYCLE_METHODS = {
  setSystemTableCache(cache, options = {}) {
    const cacheMutationTarget = resolveReplacementCacheMutationTarget(
      this,
      cache,
      options,
    );
    if (
      this.systemTableCache === cache &&
      this.cacheMutationTarget === cacheMutationTarget
    ) {
      this.subscribeToCacheNotifications();
      return;
    }

    const cacheOwnerParticipants = resolveCacheOwnerParticipants(this);
    this.unsubscribeFromCacheNotifications();
    this.systemTableCache = cache;
    this.cacheMutationTarget = cacheMutationTarget;
    for (const participant of cacheOwnerParticipants) {
      participant.setCacheOwner(cache, cacheMutationTarget);
    }
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
      typeof this.liveQueryManager.initialize === 'function'
    ) {
      this.liveQueryManager.initialize({
        sqlQueryEngine: engine,
      });
    }
    if (
      this.debugMetadataStore &&
      typeof this.debugMetadataStore.setSqlQueryEngine === 'function'
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

  shutdown() {
    this.lifecycleState = ADMIN_WEBSOCKET_LIFECYCLE_STATE.STOPPING;
    this.unsubscribeFromCacheNotifications();

    const transition = this.lifecycleTransitionTail.then(() =>
      this.shutdownAdminServer(),
    );
    this.lifecycleTransitionTail = transition.catch(() => undefined);
    return transition;
  },

  async shutdownAdminServer() {
    try {
      for (const clientInfo of this.clients) {
        try {
          clientInfo.socket.terminate();
        } catch (closeError) {
          this.logger.debug(ADMIN_LOG_MSG.CLIENT_TERMINATE_ERROR, {
            nodeId: this.nodeId,
            error: closeError.message,
          });
        }
      }
      this.clients.clear();

      if (this.fastify) {
        const closingFastify = this.fastify;
        this.fastify = null;
        const server = closingFastify.server;
        if (server && typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        await closingFastify.close();
        if (server && typeof server.close === 'function') {
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
        if (server && typeof server.unref === 'function') {
          server.unref();
        }
      }
    } finally {
      this.initialized = false;
      this.listening = false;
      this.lifecycleState = ADMIN_WEBSOCKET_LIFECYCLE_STATE.STOPPED;
      this.unsubscribeFromCacheNotifications();
    }

    this.logger.info(ADMIN_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
    });
  },
};

export {ADMIN_WEBSOCKET_LIFECYCLE_METHODS};
