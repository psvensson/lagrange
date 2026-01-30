import {ADDRESS, NUM, TYPEOF} from '../constants/index.js';

const ADDRESS_COMPONENT = Object.freeze({
  NODE_ID: 'nodeId',
  SERVICE_TYPE: 'serviceType',
  SERVICE_ID: 'serviceId',
});

const ADDRESS_TYPE = Object.freeze({
  NODE: 'node',
  SERVICE: 'service',
});

const ADDRESS_SUBSYSTEM = Object.freeze({
  NAME: 'address',
});

const ADDRESS_ERROR_NAME = Object.freeze({
  MALFORMED: 'MalformedAddressError',
  EMPTY_COMPONENT: 'EmptyComponentError',
});

const ADDRESS_LOG_MSG = Object.freeze({
  GENERATED_NODE: 'Generated node address',
  GENERATED_SERVICE: 'Generated service address',
  INVALID_NODE_FORMAT: 'Invalid node address format',
  NODE_CONFLICT: 'Node address conflict detected',
  REGISTERED_NODE: 'Registered node address',
  INVALID_SERVICE_FORMAT: 'Invalid service address format',
  SERVICE_CONFLICT: 'Service address conflict detected',
  REGISTERED_SERVICE: 'Registered service address',
  UNREGISTERED_NODE: 'Unregistered node address',
  UNREGISTERED_SERVICE: 'Unregistered service address',
  CLEARED: 'Cleared all addresses',
});

const ADDRESS_ERROR_MSG = Object.freeze({
  MUST_BE_STRING: 'Address must be a string',
  COMPONENT_EMPTY: (component) =>
    `Address component '${component}' cannot be empty`,
  MUST_HAVE_COMPONENTS: (count) =>
    `Address must have exactly ${NUM.THREE} components separated by ` +
    `'${ADDRESS.SEPARATOR}', got ${count}`,
  COMPONENT_CANNOT_BE_EMPTY: (component) =>
    `${component} component cannot be empty`,
});

const ADDRESS_FORMAT = Object.freeze({
  EMPTY: '',
  build: (nodeId, serviceType, serviceId) =>
    `${nodeId}${ADDRESS.SEPARATOR}${serviceType}${ADDRESS.SEPARATOR}${serviceId}`,
});

const ADDRESS_VALIDATE = Object.freeze({
  TYPEOF_STRING: TYPEOF.STRING,
  COMPONENT_COUNT: NUM.THREE,
});

export {
  ADDRESS_COMPONENT,
  ADDRESS_ERROR_MSG,
  ADDRESS_ERROR_NAME,
  ADDRESS_FORMAT,
  ADDRESS_LOG_MSG,
  ADDRESS_SUBSYSTEM,
  ADDRESS_TYPE,
  ADDRESS_VALIDATE,
};
