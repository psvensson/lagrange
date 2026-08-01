import {SERVICE_DESCRIPTOR_FIELD} from '../constants/index.js';

const SERVICE_LIFECYCLE_MANAGER_LITERAL = Object.freeze({
  UNKNOWNADAPTER: 'UnknownAdapter',
  VALUE: '; ',
  ADAPTER_REJECTED_SERVICE_DEFINITION: 'adapter rejected service definition',
});
const LIFECYCLE_MGR_MSG = Object.freeze({
  ADAPTER_INSTANCE_REQUIRED: 'adapter must be an instance of ServiceTypeAdapter',
  ADAPTER_ALREADY_REGISTERED: 'adapter already registered for service type',
  OPERATION_WRITER_REQUIRED: 'operation writer must be a function',
  IDEMPOTENCY_READER_REQUIRED: 'idempotency reader must be a function',
  RECOVERY_READER_REQUIRED: 'recovery reader must be a function',
  RECOVERY_RESOLVER_REQUIRED: 'recoverPendingOperations requires resolveServiceContext function',
  RUNTIME_POLICY_CHECK_REQUIRED: 'runtime policy check must be a function',
  OPERATION_COMMAND_INVALID: 'operation command must be "<operation>:<serviceId>"',
  OPERATION_ID_REQUIRED: 'operation row is missing operation_id',
  SERVICE_ID_REQUIRED: 'service context is missing serviceId',
  SERVICE_TYPE_REQUIRED: 'service context is missing serviceType',
});
const SERVICE_POLICY_TYPE = Object.freeze({RUNTIME: 'runtime'});
const SERVICE_LIFECYCLE_LOG = Object.freeze({
  OPERATION_START: 'Service lifecycle operation started',
  OPERATION_SUCCESS: 'Service lifecycle operation completed',
  OPERATION_FAILURE: 'Service lifecycle operation failed',
  RECOVERY_START: 'Service lifecycle recovery operation started',
  RECOVERY_SUCCESS: 'Service lifecycle recovery operation completed',
  RECOVERY_FAILURE: 'Service lifecycle recovery operation failed',
});
const SERVICE_LIFECYCLE_METRIC_STATUS = Object.freeze({SUCCESS: 'success', FAILURE: 'failure'});

async function allowRuntimeLifecyclePolicy(_policyContext) {
  return undefined;
}

function resolveServiceDescriptor(serviceContext) {
  return serviceContext?.definition ?? serviceContext;
}

function resolveServiceReplicaId(serviceContext, descriptor, serviceId) {
  return serviceContext?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] ||
    descriptor?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] ||
    serviceId;
}

function resolveServiceFields(serviceContext) {
  const descriptor = resolveServiceDescriptor(serviceContext);
  const serviceId = descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
  const serviceType = descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE];
  const tenantId = descriptor?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] || serviceId;
  const replicaId = resolveServiceReplicaId(
    serviceContext,
    descriptor,
    serviceId,
  );
  if (!serviceId) {
    throw new TypeError(LIFECYCLE_MGR_MSG.SERVICE_ID_REQUIRED);
  }
  if (!serviceType) {
    throw new TypeError(LIFECYCLE_MGR_MSG.SERVICE_TYPE_REQUIRED);
  }
  return {serviceId, serviceType, tenantId, replicaId};
}

export {
  LIFECYCLE_MGR_MSG,
  SERVICE_LIFECYCLE_LOG,
  SERVICE_LIFECYCLE_MANAGER_LITERAL,
  SERVICE_LIFECYCLE_METRIC_STATUS,
  SERVICE_POLICY_TYPE,
  allowRuntimeLifecyclePolicy,
  resolveServiceFields,
};
