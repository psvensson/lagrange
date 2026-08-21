import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  SERVICE_TYPE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';

function initializeAtomicClaimTestEnvironment() {
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

function claimPendingOperation(operation, operationId) {
  const currentOperationId =
    operation?.operation_id ||
    operation?.operationId ||
    null;
  const currentStep =
    operation?.workflow_step ||
    operation?.workflowStep ||
    null;
  if (!currentOperationId ||
      currentOperationId !== operationId ||
      currentStep !== WORKFLOW_STEP.PENDING) {
    return null;
  }

  const updatedAt = Date.now();
  if (Object.prototype.hasOwnProperty.call(operation, 'workflow_step') ||
      Object.prototype.hasOwnProperty.call(operation, 'operation_id')) {
    operation.workflow_step = WORKFLOW_STEP.SENDING;
    operation.updated_at = updatedAt;
  }
  if (Object.prototype.hasOwnProperty.call(operation, 'workflowStep') ||
      Object.prototype.hasOwnProperty.call(operation, 'operationId')) {
    operation.workflowStep = WORKFLOW_STEP.SENDING;
    operation.updatedAt = updatedAt;
  }

  return {operationId};
}

function createCanonicalPartitionOperationRow(operationRow) {
  return {
    ...operationRow,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: operationRow.partition_id,
  };
}

export {
  claimPendingOperation,
  createCanonicalPartitionOperationRow,
  initializeAtomicClaimTestEnvironment,
};
