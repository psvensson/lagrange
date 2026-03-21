import {TYPEOF} from '../constants/index.js';
import {
  ControlPlaneSystemTableGateway,
} from './control-plane-system-table-gateway.js';

function syncControlPlaneSystemTableGateway(gateway, options = {}) {
  if (!gateway) {
    return null;
  }

  if (options.cdcIntegrationService &&
      typeof gateway.setCdcIntegrationService === TYPEOF.FUNCTION) {
    gateway.setCdcIntegrationService(options.cdcIntegrationService);
  }
  if (options.sqlQueryEngine &&
      typeof gateway.setSqlQueryEngine === TYPEOF.FUNCTION) {
    gateway.setSqlQueryEngine(options.sqlQueryEngine);
  }
  if (options.systemTableCache &&
      typeof gateway.setSystemTableCache === TYPEOF.FUNCTION) {
    gateway.setSystemTableCache(options.systemTableCache);
  }
  if (options.messageRouter &&
      typeof gateway.setMessageRouter === TYPEOF.FUNCTION) {
    gateway.setMessageRouter(options.messageRouter);
  }
  return gateway;
}

function resolveControlPlaneSystemTableGateway(options = {}) {
  const existingGateway =
    options.controlPlaneSystemTableGateway ||
    options.sourceGateway ||
    null;
  const sqlQueryEngine =
    options.sqlQueryEngine ||
    options.cdcIntegrationService?.sqlQueryEngine ||
    null;

  if (existingGateway) {
    return syncControlPlaneSystemTableGateway(existingGateway, {
      cdcIntegrationService: options.cdcIntegrationService,
      sqlQueryEngine,
      systemTableCache: options.systemTableCache,
      messageRouter: options.messageRouter,
    });
  }

  const hasOwnedDependencies =
    options.cdcIntegrationService ||
    sqlQueryEngine ||
    options.systemTableCache;
  if (!hasOwnedDependencies) {
    return null;
  }

  return new ControlPlaneSystemTableGateway({
    nodeId: options.nodeId || null,
    cdcIntegrationService: options.cdcIntegrationService || null,
    sqlQueryEngine,
    systemTableCache: options.systemTableCache || null,
    messageRouter: options.messageRouter || null,
    logger: options.logger || null,
    now: options.now,
  });
}

export {
  resolveControlPlaneSystemTableGateway,
  syncControlPlaneSystemTableGateway,
};
