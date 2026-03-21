import {
  ControlPlaneSystemTableGateway,
} from './control-plane-system-table-gateway.js';

function createControlPlaneRuntimeBundle(options = {}) {
  const sqlQueryEngine =
    options.sqlQueryEngine ||
    options.cdcIntegrationService?.sqlQueryEngine ||
    null;
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    new ControlPlaneSystemTableGateway({
      nodeId: options.nodeId || null,
      sqlQueryEngine,
      cdcIntegrationService: options.cdcIntegrationService || null,
      systemTableCache: options.systemTableCache || null,
      messageRouter: options.messageRouter || null,
      logger: options.logger || null,
      now: options.now,
    });

  return Object.freeze({
    nodeId: options.nodeId || null,
    sqlQueryEngine,
    cdcIntegrationService: options.cdcIntegrationService || null,
    systemTableCache: options.systemTableCache || null,
    messageRouter: options.messageRouter || null,
    controlPlaneSystemTableGateway,
  });
}

export {createControlPlaneRuntimeBundle};
