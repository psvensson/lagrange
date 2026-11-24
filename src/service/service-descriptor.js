/**
 * Canonical service descriptor normalization and validation.
 */

import {
  ALLOWED_UNIFIED_SERVICE_TYPES,
  SERVICE_DESCRIPTOR_FIELD,
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
const RUNTIME_EXTENSION_FIELD = Object.freeze({
  BINDING_DIGEST: 'binding_digest',
  BINDING_PROJECTION: 'binding_projection',
  BINDING_VERSION_ID: 'binding_version_id',
  RESOURCE_BUDGET: 'resource_budget',
});

const PERSISTED_SQL_DESCRIPTOR_COLUMNS = Object.freeze([
  ['service_id', SERVICE_DESCRIPTOR_FIELD.SERVICE_ID],
  ['service_type', SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE],
  ['tenant_id', SERVICE_DESCRIPTOR_FIELD.TENANT_ID],
  ['replica_count', SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT],
  ['runtime_kind', SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND],
  ['runtime_ref', SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF],
  ['runtime_config', SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG],
]);

function serializeRuntimeExtensionBudget(descriptor) {
  const budget = descriptor?.[RUNTIME_EXTENSION_FIELD.RESOURCE_BUDGET];
  return budget === undefined || typeof budget === 'string' ?
    budget :
    JSON.stringify(budget);
}

function runtimeExtensionFields(descriptor) {
  return {
    [RUNTIME_EXTENSION_FIELD.BINDING_DIGEST]:
      descriptor?.[RUNTIME_EXTENSION_FIELD.BINDING_DIGEST],
    [RUNTIME_EXTENSION_FIELD.BINDING_PROJECTION]:
      descriptor?.[RUNTIME_EXTENSION_FIELD.BINDING_PROJECTION],
    [RUNTIME_EXTENSION_FIELD.BINDING_VERSION_ID]:
      descriptor?.[RUNTIME_EXTENSION_FIELD.BINDING_VERSION_ID],
    [RUNTIME_EXTENSION_FIELD.RESOURCE_BUDGET]:
      serializeRuntimeExtensionBudget(descriptor),
  };
}

/**
 * Convert persisted SQL snake_case descriptor columns once at the boundary
 * into canonical camelCase domain fields, leaving already-canonical fields
 * authoritative when present.
 *
 * @param {Object|null|undefined} descriptor
 * @return {Object}
 */
function adaptPersistedSqlDescriptorFields(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    return {};
  }
  const adapted = {...descriptor};
  for (const [sqlColumn, canonicalField] of PERSISTED_SQL_DESCRIPTOR_COLUMNS) {
    if (adapted[canonicalField] === undefined &&
        Object.hasOwn(descriptor, sqlColumn)) {
      adapted[canonicalField] = descriptor[sqlColumn];
    }
  }
  return adapted;
}

/**
 * Normalize a persisted SQL row or canonical descriptor into canonical
 * camelCase descriptor fields.
 *
 * @param {Object} descriptor
 * @return {Object}
 */
function normalizeServiceDescriptor(descriptor) {
  const canonical = adaptPersistedSqlDescriptorFields(descriptor);
  const serviceId = canonical[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] || null;

  return {
    ...runtimeExtensionFields(canonical),
    [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
    [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]:
      canonical[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] || null,
    [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]:
      canonical[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] || serviceId,
    [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]:
      canonical[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT] ?? 0,
    [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]:
      canonical[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || null,
    [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]:
      canonical[SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF] ?? null,
    [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]:
      canonical[SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG] ?? null,
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
  } else if (typeof serviceId !== 'string' || serviceId.length === 0) {
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
