/**
 * CDC module exports.
 */

export {
  CDCIntegrationService,
  CDCOperationType,
  VALID_SYSTEM_TABLES,
} from './cdc-integration-service.js';

export {
  WRITE_ROUTER_ERROR_MSG,
  WRITE_ROUTER_MODE,
  BootstrapDirectWriteRouter,
  SqlWriteRouter,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
} from './write-router/index.js';
