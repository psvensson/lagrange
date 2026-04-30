const LOCAL_STR_3UV4P = 'SystemMetadataAccessError';
const LOCAL_STR_2WQV7 = 'SystemMetadataConsumer';
const LOCAL_STR_15PSZ = 'System metadata access error';

const SYSTEM_METADATA_ACCESS_ERROR_CODE = Object.freeze({
  OWNER_REQUIRED: 'SYSTEM_METADATA_OWNER_REQUIRED',
  GATEWAY_REQUIRED: 'SYSTEM_METADATA_GATEWAY_REQUIRED',
});

const SYSTEM_METADATA_ACCESS_OUTCOME = Object.freeze({
  OWNER_NOT_READY: 'owner_not_ready',
});

function createSystemMetadataAccessError({
  code,
  message,
  ownerName = null,
  tableName = null,
  operation = null,
  serviceName = null,
} = {}) {
  const error = new Error(message || 'System metadata access error');
  error.name = LOCAL_STR_3UV4P;
  error.code = code || SYSTEM_METADATA_ACCESS_ERROR_CODE.GATEWAY_REQUIRED;
  error.outcome = SYSTEM_METADATA_ACCESS_OUTCOME.OWNER_NOT_READY;
  if (ownerName) {
    error.ownerName = ownerName;
  }
  if (tableName) {
    error.tableName = tableName;
  }
  if (operation) {
    error.operation = operation;
  }
  if (serviceName) {
    error.serviceName = serviceName;
  }
  return error;
}

function createSystemMetadataOwnerRequiredError({
  serviceName,
  ownerName,
  tableName = null,
  operation = null,
  message = null,
} = {}) {
  return createSystemMetadataAccessError({
    code: SYSTEM_METADATA_ACCESS_ERROR_CODE.OWNER_REQUIRED,
    message: message ||
      `${serviceName || LOCAL_STR_2WQV7} requires ${ownerName}`,
    ownerName,
    tableName,
    operation,
    serviceName,
  });
}

function createSystemMetadataGatewayRequiredError({
  ownerName,
  tableName = null,
  operation = null,
  message = null,
  serviceName = null,
} = {}) {
  const ownerLabel = ownerName || serviceName || 'SystemMetadataConsumer';
  return createSystemMetadataAccessError({
    code: SYSTEM_METADATA_ACCESS_ERROR_CODE.GATEWAY_REQUIRED,
    message: message ||
      `${ownerLabel} requires controlPlaneSystemTableGateway`,
    ownerName,
    tableName,
    operation,
    serviceName,
  });
}

function buildSystemMetadataOwnerNotReadyFailure(error) {
  return {
    success: false,
    outcome: SYSTEM_METADATA_ACCESS_OUTCOME.OWNER_NOT_READY,
    error: error?.message || LOCAL_STR_15PSZ,
    errorCode:
      error?.code || SYSTEM_METADATA_ACCESS_ERROR_CODE.GATEWAY_REQUIRED,
  };
}

export {
  SYSTEM_METADATA_ACCESS_ERROR_CODE,
  SYSTEM_METADATA_ACCESS_OUTCOME,
  buildSystemMetadataOwnerNotReadyFailure,
  createSystemMetadataAccessError,
  createSystemMetadataGatewayRequiredError,
  createSystemMetadataOwnerRequiredError,
};
