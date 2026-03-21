import {
  ControlPlaneSystemTableGateway,
} from './control-plane-system-table-gateway.js';

function resolveProviderValue(options, fieldName, providerName) {
  if (typeof options?.[providerName] === 'function') {
    return options[providerName]() || null;
  }
  return options?.[fieldName] || null;
}

function createControlPlaneRuntimeBundle(options = {}) {
  const hasSqlQueryEngineProvider =
    typeof options.getSqlQueryEngine === 'function';
  const hasCdcIntegrationServiceProvider =
    typeof options.getCdcIntegrationService === 'function';
  const hasSystemTableCacheProvider =
    typeof options.getSystemTableCache === 'function';
  const hasMessageRouterProvider =
    typeof options.getMessageRouter === 'function';
  const cdcIntegrationService = resolveProviderValue(
    options,
    'cdcIntegrationService',
    'getCdcIntegrationService',
  );
  const systemTableCache = resolveProviderValue(
    options,
    'systemTableCache',
    'getSystemTableCache',
  );
  const messageRouter = resolveProviderValue(
    options,
    'messageRouter',
    'getMessageRouter',
  );
  const sqlQueryEngine =
    resolveProviderValue(options, 'sqlQueryEngine', 'getSqlQueryEngine') ||
    cdcIntegrationService?.sqlQueryEngine ||
    null;
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    new ControlPlaneSystemTableGateway({
      nodeId: options.nodeId || null,
      ...(hasSqlQueryEngineProvider ? {} : {sqlQueryEngine}),
      ...(hasCdcIntegrationServiceProvider ? {} : {cdcIntegrationService}),
      ...(hasSystemTableCacheProvider ? {} : {systemTableCache}),
      ...(hasMessageRouterProvider ? {} : {messageRouter}),
      getSqlQueryEngine: options.getSqlQueryEngine,
      getCdcIntegrationService: options.getCdcIntegrationService,
      getSystemTableCache: options.getSystemTableCache,
      getMessageRouter: options.getMessageRouter,
      logger: options.logger || null,
      now: options.now,
    });

  return Object.freeze({
    nodeId: options.nodeId || null,
    sqlQueryEngine,
    cdcIntegrationService,
    systemTableCache,
    messageRouter,
    controlPlaneSystemTableGateway,
  });
}

export {createControlPlaneRuntimeBundle};
