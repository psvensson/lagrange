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
      sqlQueryEngine,
      cdcIntegrationService,
      systemTableCache,
      messageRouter,
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
