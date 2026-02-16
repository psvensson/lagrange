/**
 * Canonical service descriptor normalization and validation.
 */

import {
  ALLOWED_UNIFIED_SERVICE_TYPES,
  SERVICE_DESCRIPTOR_FIELD,
  TYPEOF,
} from '../constants/index.js';
import {validateRuntimeDescriptor} from '../wasm-service/runtime-descriptor-validator.js';
import {ServiceDescriptorValidationError} from './service-lifecycle-errors.js';

const DESCRIPTOR_ERROR = Object.freeze({
  SERVICE_ID_REQUIRED: 'serviceId is required',
  SERVICE_ID_NOT_STRING: 'serviceId must be a non-empty string',
  SERVICE_TYPE_REQUIRED: 'serviceType is required',
  SERVICE_TYPE_UNKNOWN: 'serviceType is not registered in unified service types',
  REPLICA_COUNT_INVALID: 'replicaCount must be an integer >= 0',
  ADAPTER_RESOLUTION_REQUIRED:
    'adapterResolver must return exactly one adapter for serviceType',
});

/**
 * Normalize a mixed-case descriptor into canonical camelCase fields.
 *
 * @param {Object} descriptor
 * @return {Object}
 */
function normalizeServiceDescriptor(descriptor) {
  const serviceId = descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
    descriptor?.service_id ||
    null;

  return {
    [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
    [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]:
      descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] ||
      descriptor?.service_type ||
      null,
    [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]:
      descriptor?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] ||
      descriptor?.tenant_id ||
      serviceId,
    [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]:
      descriptor?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT] ??
      descriptor?.replica_count ??
      0,
    [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]:
      descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] ||
      descriptor?.runtime_kind ||
      null,
    [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]:
      descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF] ??
      descriptor?.runtime_ref ??
      null,
    [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]:
      descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG] ??
      descriptor?.runtime_config ??
      null,
  };
}

/**
 * Validate a canonical service descriptor.
 *
 * @param {Object} descriptor
 * @param {Object} [options]
 * @param {Function} [options.adapterResolver]
 * @return {{valid: boolean, errors: string[], descriptor: Object}}
 */
function validateServiceDescriptor(descriptor, options = {}) {
  const normalized = normalizeServiceDescriptor(descriptor);
  const errors = [];

  const serviceId = normalized[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
  const serviceType = normalized[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE];
  const replicaCount = normalized[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT];

  if (serviceId === null || serviceId === undefined) {
    errors.push(DESCRIPTOR_ERROR.SERVICE_ID_REQUIRED);
  } else if (typeof serviceId !== TYPEOF.STRING || serviceId.length === 0) {
    errors.push(DESCRIPTOR_ERROR.SERVICE_ID_NOT_STRING);
  }

  if (serviceType === null || serviceType === undefined) {
    errors.push(DESCRIPTOR_ERROR.SERVICE_TYPE_REQUIRED);
  } else if (!ALLOWED_UNIFIED_SERVICE_TYPES.has(serviceType)) {
    errors.push(DESCRIPTOR_ERROR.SERVICE_TYPE_UNKNOWN);
  }

  if (!Number.isFinite(replicaCount) ||
    !Number.isInteger(replicaCount) ||
    replicaCount < 0) {
    errors.push(DESCRIPTOR_ERROR.REPLICA_COUNT_INVALID);
  }

  const runtimeValidation = validateRuntimeDescriptor({
    runtimeKind: normalized[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND],
    runtimeRef: normalized[SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF],
    runtimeConfig: normalized[SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG],
  });
  if (!runtimeValidation.valid) {
    errors.push(...runtimeValidation.errors);
  }

  if (options.adapterResolver) {
    const adapter = options.adapterResolver(serviceType);
    if (!adapter) {
      errors.push(DESCRIPTOR_ERROR.ADAPTER_RESOLUTION_REQUIRED);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    descriptor: normalized,
  };
}

/**
 * Assert a valid service descriptor and throw typed validation error on failure.
 *
 * @param {Object} descriptor
 * @param {Object} [options]
 * @return {Object}
 */
function assertServiceDescriptor(descriptor, options = {}) {
  const validation = validateServiceDescriptor(descriptor, options);
  if (!validation.valid) {
    throw new ServiceDescriptorValidationError(
      validation.errors,
      {
        serviceId: validation.descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID],
        serviceType: validation.descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE],
      },
    );
  }
  return validation.descriptor;
}

export {
  normalizeServiceDescriptor,
  validateServiceDescriptor,
  assertServiceDescriptor,
};
