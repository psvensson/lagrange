import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HeartbeatService as RawHeartbeatService,
} from '../../src/control-plane/heartbeat-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';

const HEARTBEAT_REPORTER_PUBLICATION_PATH = Object.freeze({
  NODE_STATE_REPORTER: 'node_state_reporter',
  NODE_STATE_REPORTER_UNVERIFIED: 'node_state_reporter_unverified',
});

const HEARTBEAT_REPORTER_FAILURE_STAGE = Object.freeze({
  REPORTER_VISIBILITY: 'reporter_visibility',
});

const HEARTBEAT_REPORTER_FAILURE_REASON = Object.freeze({
  VISIBILITY_NOT_CONFIRMED: 'reporter_visibility_not_confirmed',
});

const HEARTBEAT_REPORTER_VISIBILITY_ROUTING_DIMENSION =
  'controlPlaneRecoveryEligible';
const HEARTBEAT_RECOVERY_FAILURE_RETRY_REASON = 'recovery_failure_retry';
const HEARTBEAT_STATUS_ACTIVE = 'active';
const HEARTBEAT_CONNECTION_STATE_READY = 'ready';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createMockCache() {
  const store = new Map();
  return {
    get: (_table, key) => store.get(key) || null,
  };
}

function createMockCdc() {
  return {
    updateSystemTableRow: async () => ({success: true}),
    upsertSystemTableRow: async () => ({success: true}),
  };
}

function createHeartbeatService(options = {}) {
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    new ControlPlaneSystemTableGateway({
      nodeId: options.nodeId || null,
      cdcIntegrationService: options.cdcIntegrationService || null,
      sqlQueryEngine: options.cdcIntegrationService?.sqlQueryEngine || null,
      systemTableCache: options.systemTableCache || null,
      messageRouter: options.messageRouter || null,
    });
  return new RawHeartbeatService({
    ...options,
    controlPlaneSystemTableGateway,
  });
}

function HeartbeatService(options = {}) {
  return createHeartbeatService(options);
}

HeartbeatService.prototype = RawHeartbeatService.prototype;

function createHeartbeatUpdateRow(nodeAddress = '10.0.0.1:8080') {
  return {
    node_address: nodeAddress,
    cpu_cores: 4,
    memory_mb: 1024,
    disk_gb: 100,
    cpu_usage_percent: 10,
    memory_usage_percent: 20,
    disk_usage_percent: 30,
    status: HEARTBEAT_STATUS_ACTIVE,
    connection_state: HEARTBEAT_CONNECTION_STATE_READY,
    capabilities: '[]',
  };
}

export {
  createHeartbeatUpdateRow,
  createMockCache,
  createMockCdc,
  HeartbeatService,
  HEARTBEAT_RECOVERY_FAILURE_RETRY_REASON,
  HEARTBEAT_REPORTER_FAILURE_REASON,
  HEARTBEAT_REPORTER_FAILURE_STAGE,
  HEARTBEAT_REPORTER_PUBLICATION_PATH,
  HEARTBEAT_REPORTER_VISIBILITY_ROUTING_DIMENSION,
  initEnv,
};
