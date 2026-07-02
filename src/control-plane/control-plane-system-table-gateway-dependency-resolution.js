import {
  PressureGovernor,
  buildLocalControlPlaneMutationReadinessFailure,
  getLocalControlPlaneMutationReadinessBlocker,
  requiresStableLocalControlPlaneMutationReadiness,
} from './control-plane-system-table-gateway-shared.js';

const controlPlaneSystemTableGatewayDependencyResolutionMethods = {
  /**
   * @param {Object} entry
   * @return {void}
   * @private
   */
  recordControlPlaneOperation(entry = {}) {
    if (!this.controlPlaneOperationLedger) {
      return;
    }
    this.controlPlaneOperationLedger.append({
      nodeId: entry.nodeId || this.nodeId || null,
      ...entry,
    });
  },

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getControlPlaneOperationLedgerEntries(options = {}) {
    return this.controlPlaneOperationLedger ?
      this.controlPlaneOperationLedger.getEntries(options) :
      Object.freeze([]);
  },

  get sqlQueryEngine() {
    const providedSqlQueryEngine = this.sqlQueryEngineProvider?.() || null;
    return providedSqlQueryEngine || this._sqlQueryEngine || null;
  },

  set sqlQueryEngine(sqlQueryEngine) {
    this._sqlQueryEngine = sqlQueryEngine || null;
  },

  get cdcIntegrationService() {
    const providedCdcIntegrationService =
      this.cdcIntegrationServiceProvider?.() || null;
    return providedCdcIntegrationService || this._cdcIntegrationService || null;
  },

  set cdcIntegrationService(cdcIntegrationService) {
    this._cdcIntegrationService = cdcIntegrationService || null;
  },

  get systemTableCache() {
    const providedSystemTableCache = this.systemTableCacheProvider?.() || null;
    return providedSystemTableCache || this._systemTableCache || null;
  },

  set systemTableCache(systemTableCache) {
    this._systemTableCache = systemTableCache || null;
  },

  get messageRouter() {
    const providedMessageRouter = this.messageRouterProvider?.() || null;
    return providedMessageRouter || this._messageRouter || null;
  },

  set messageRouter(messageRouter) {
    this._messageRouter = messageRouter || null;
  },

  get controlPlaneReadinessService() {
    const providedControlPlaneReadinessService =
      this.controlPlaneReadinessServiceProvider?.() || null;
    return (
      providedControlPlaneReadinessService ||
      this._controlPlaneReadinessService ||
      null
    );
  },

  set controlPlaneReadinessService(controlPlaneReadinessService) {
    this._controlPlaneReadinessService = controlPlaneReadinessService || null;
  },

  /**
   * @param {Object|null} sqlQueryEngine
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
  },

  /**
   * @param {Object|null} cdcIntegrationService
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
  },

  /**
   * @param {Object|null} systemTableCache
   */
  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
  },

  /**
   * @param {Object|null} messageRouter
   */
  setMessageRouter(messageRouter) {
    this.messageRouter = messageRouter;
  },

  /**
   * @param {Object|null} controlPlaneReadinessService
   */
  setControlPlaneReadinessService(controlPlaneReadinessService) {
    this.controlPlaneReadinessService = controlPlaneReadinessService;
  },

  resolveSqlQueryEngine() {
    if (this.sqlQueryEngine) {
      return this.sqlQueryEngine;
    }
    return this.resolveCdcIntegrationService()?.sqlQueryEngine || null;
  },

  resolveCdcIntegrationService() {
    return this.cdcIntegrationService;
  },

  resolveSystemTableCache() {
    return this.systemTableCache;
  },

  resolveMessageRouter() {
    return this.messageRouter;
  },

  resolveControlPlaneReadinessService() {
    return this.controlPlaneReadinessService;
  },

  /**
   * Return one canonical deferred mutation result when the local readiness
   * owner says background metadata work should wait for authority
   * establishment instead of adding more ingress churn.
   * @param {string} tableName
   * @param {Object} writeOptions
   * @return {Object|null}
   * @private
   */
  resolveLocalDeferredMutationReadinessFailure(tableName, writeOptions = {}) {
    if (
      writeOptions?.allowPressureDefer !== true ||
      !requiresStableLocalControlPlaneMutationReadiness(writeOptions?.workClass)
    ) {
      return null;
    }
    const controlPlaneReadinessService =
      this.resolveControlPlaneReadinessService();
    if (!controlPlaneReadinessService || !this.nodeId) {
      return null;
    }
    const blocker = getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService,
      requirePublishedConvergence: true,
    });
    if (!blocker) {
      return null;
    }
    return this.normalizeMutationResult(
      buildLocalControlPlaneMutationReadinessFailure({
        blocker,
        tableName,
        workClass: writeOptions?.workClass || null,
      }),
    );
  },

  /**
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure({
        nodeId: this.nodeId,
        messageRouter: this.resolveMessageRouter(),
        logger: this.logger,
      });
      return this.pressureGovernor;
    }
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.resolveMessageRouter(),
      logger: this.logger,
    });
    return this.pressureGovernor;
  },
};

function assignControlPlaneSystemTableGatewayDependencyResolution(targetClass) {
  Object.defineProperties(
    targetClass.prototype,
    Object.getOwnPropertyDescriptors(
      controlPlaneSystemTableGatewayDependencyResolutionMethods,
    ),
  );
}

export {assignControlPlaneSystemTableGatewayDependencyResolution};
