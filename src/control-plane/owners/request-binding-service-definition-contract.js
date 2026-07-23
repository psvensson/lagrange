import {createHash} from 'node:crypto';

import {
  RUNTIME_KIND,
  SERVICE_PROFILE,
  SERVICE_READ_LOCALITY,
} from '../../constants/index.js';
import {UNIFIED_SERVICE_TYPE} from '../../constants/unified-service-lifecycle.js';
import {validateServiceDescriptor} from '../../service/service-descriptor.js';
import {
  READ_CONSISTENCY_MODE,
  WASM_SERVICE_DEFAULT,
  WASM_SERVICE_DEFINITION_STATUS,
  WRITE_CONSISTENCY_MODE,
} from '../../wasm-service/wasm-service-constants.js';
import {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
} from '../../wasm-service/wasm-service-models.js';
import {
  formatOciReference,
  parseOciReference,
} from '../../wasm-service/oci-reference.js';
import {
  DEPLOYMENT_BINDING_SOURCE_INTERFACE,
  DEPLOYMENT_BINDING_SOURCE_KIND,
  canonicalJson,
  projectBinding,
} from './deployment-binding-contract.js';

const REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE = Object.freeze({
  ARTIFACT_MISMATCH: 'request_binding_artifact_mismatch',
  DEPENDENCY_REQUIRED: 'request_binding_compiler_dependency_required',
  DESIRED_SERVICE_CONFLICT: 'request_binding_desired_service_conflict',
  INVALID_RUNTIME_DESCRIPTOR: 'request_binding_runtime_descriptor_invalid',
  SOURCE_UNSUPPORTED: 'request_binding_source_unsupported',
});

const REQUEST_BINDING_SERVICE_DEFINITION_PATH = Object.freeze({
  ARTIFACT: '/artifact',
  BINDING: '/binding',
  CATALOG_OWNER: '/catalogOwner',
  DESIRED_SERVICE: '/desiredService',
  RUNTIME: '/runtime',
  SOURCE: '/binding/source',
});

const REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE = Object.freeze({
  ARTIFACT_MISMATCH:
    'Binding Artifact does not match its immutable target',
  DEPENDENCY_REQUIRED:
    'Binding desired-service compiler dependencies are required',
  DESIRED_SERVICE_CONFLICT:
    'Binding desired service conflicts with durable state',
  INVALID_RUNTIME_DESCRIPTOR:
    'Binding does not compile to a valid runtime descriptor',
  SOURCE_UNSUPPORTED:
    'only request, change, time, once, boot, and call Bindings compile to desired services',
});

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const REQUEST_BINDING_SERVICE_DEFINITION_ERROR_NAME =
  'RequestBindingServiceDefinitionError';
const SERVICE_ID_PREFIX = 'binding-service-';
const COMPILED_SOURCE_KINDS = new Set([
  DEPLOYMENT_BINDING_SOURCE_KIND.BOOT,
  DEPLOYMENT_BINDING_SOURCE_KIND.CALL,
  DEPLOYMENT_BINDING_SOURCE_KIND.CHANGE,
  DEPLOYMENT_BINDING_SOURCE_KIND.ONCE,
  DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST,
  DEPLOYMENT_BINDING_SOURCE_KIND.TIME,
]);
const BINDING_LINEAGE_FIELDS = Object.freeze([
  SD_COL.BINDING_VERSION_ID,
  SD_COL.BINDING_DIGEST,
  SD_COL.BINDING_PROJECTION,
]);

class RequestBindingServiceDefinitionError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = REQUEST_BINDING_SERVICE_DEFINITION_ERROR_NAME;
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new RequestBindingServiceDefinitionError(code, path, message);
}

function deriveRequestServiceDefinitionId(bindingVersionId) {
  return `${SERVICE_ID_PREFIX}${createHash(HASH_ALGORITHM)
    .update(bindingVersionId)
    .digest(HASH_ENCODING)}`;
}

function hasRequestBindingServiceDefinitionLineage(row) {
  return BINDING_LINEAGE_FIELDS.some((field) =>
    row?.[field] !== null && row?.[field] !== undefined) ||
    (typeof row?.[SD_COL.SERVICE_ID] === 'string' &&
      row[SD_COL.SERVICE_ID].startsWith(SERVICE_ID_PREFIX));
}

function supportsBindingServiceDefinitionSourceKind(sourceKind) {
  return COMPILED_SOURCE_KINDS.has(sourceKind);
}

function assertArtifactMatchesBinding(binding, artifact) {
  const target = binding.declaration.target;
  if (!artifact || artifact.packageId !== target.package_id ||
      artifact.manifestDigest !== target.manifest_digest ||
      artifact.artifactDigest !== artifact.manifest?.artifact?.digest) {
    fail(
      REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.ARTIFACT_MISMATCH,
      REQUEST_BINDING_SERVICE_DEFINITION_PATH.ARTIFACT,
      REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.ARTIFACT_MISMATCH,
    );
  }
  const selectedExport = artifact.manifest.exports?.find(
    (entry) => entry.name === target.export_name,
  );
  const expectedInterface = DEPLOYMENT_BINDING_SOURCE_INTERFACE[
    binding.declaration.source.kind
  ];
  if (!selectedExport || selectedExport.interface !== expectedInterface) {
    fail(
      REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.ARTIFACT_MISMATCH,
      REQUEST_BINDING_SERVICE_DEFINITION_PATH.ARTIFACT,
      REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.ARTIFACT_MISMATCH,
    );
  }
}

function buildPinnedRuntimeRef(artifact) {
  const parsed = parseOciReference(artifact.manifest.artifact.ref);
  if (!parsed.valid ||
      (parsed.digest && parsed.digest !== artifact.artifactDigest)) {
    fail(
      REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.ARTIFACT_MISMATCH,
      REQUEST_BINDING_SERVICE_DEFINITION_PATH.RUNTIME,
      REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.ARTIFACT_MISMATCH,
    );
  }
  const formatted = formatOciReference({
    registry: parsed.registry,
    repository: parsed.repository,
    tag: parsed.tag,
    digest: artifact.artifactDigest,
  });
  if (!formatted.valid) {
    fail(
      REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.ARTIFACT_MISMATCH,
      REQUEST_BINDING_SERVICE_DEFINITION_PATH.RUNTIME,
      REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.ARTIFACT_MISMATCH,
    );
  }
  return formatted.reference;
}

function buildRuntimeConfig(binding, artifact) {
  const config = {export_name: binding.declaration.target.export_name};
  if (artifact.manifest.runtime.entrypoint !== undefined) {
    config.entrypoint = artifact.manifest.runtime.entrypoint;
  }
  if (artifact.manifest.runtime.runtime_options !== undefined) {
    config.runtime_options = artifact.manifest.runtime.runtime_options;
  }
  return canonicalJson(config);
}

function buildBindingProjection(bindingRow, binding) {
  return canonicalJson({
    binding_digest: bindingRow.binding_digest,
    binding_version_id: binding.bindingVersionId,
    declaration: binding.declaration,
    tenant_id: binding.tenantId,
  });
}

function buildRequestBindingServiceDefinition(bindingRow, artifact) {
  const binding = projectBinding(bindingRow);
  if (!supportsBindingServiceDefinitionSourceKind(
    binding.declaration.source.kind,
  )) {
    fail(
      REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.SOURCE_UNSUPPORTED,
      REQUEST_BINDING_SERVICE_DEFINITION_PATH.SOURCE,
      REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.SOURCE_UNSUPPORTED,
    );
  }
  assertArtifactMatchesBinding(binding, artifact);
  const serviceId = deriveRequestServiceDefinitionId(binding.bindingVersionId);
  const runtimeKind = artifact.manifest.runtime.kind;
  const runtimeRef = buildPinnedRuntimeRef(artifact);
  const runtimeConfig = buildRuntimeConfig(binding, artifact);
  const descriptor = validateServiceDescriptor({
    serviceId,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    replicaCount: 0,
    runtimeKind,
    runtimeRef,
    runtimeConfig,
  });
  if (!descriptor.valid ||
      ![RUNTIME_KIND.OCI_CONTAINER, RUNTIME_KIND.WASM_COMPONENT]
        .includes(runtimeKind)) {
    fail(
      REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.INVALID_RUNTIME_DESCRIPTOR,
      REQUEST_BINDING_SERVICE_DEFINITION_PATH.RUNTIME,
      REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.INVALID_RUNTIME_DESCRIPTOR,
    );
  }
  return Object.freeze({
    [SD_COL.SERVICE_ID]: serviceId,
    [SD_COL.SERVICE_NAME]: serviceId,
    [SD_COL.SERVICE_PROFILE]: SERVICE_PROFILE.DEFAULT,
    [SD_COL.HANDLER_FUNCTION_ID]:
      runtimeKind === RUNTIME_KIND.WASM_COMPONENT ? runtimeRef : null,
    [SD_COL.READ_CONSISTENCY]: READ_CONSISTENCY_MODE.STRONG,
    [SD_COL.WRITE_CONSISTENCY]: WRITE_CONSISTENCY_MODE.STRONG,
    [SD_COL.READ_LOCALITY]: SERVICE_READ_LOCALITY.ANY,
    [SD_COL.REPLICA_COUNT]: 0,
    [SD_COL.PROTOCOL]: WASM_SERVICE_DEFAULT.PROTOCOL,
    [SD_COL.RESOURCE_BUDGET]: canonicalJson(binding.declaration.budgets),
    [SD_COL.SAFETY_INTERVAL_MS]: WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    [SD_COL.RUNTIME_KIND]: runtimeKind,
    [SD_COL.RUNTIME_REF]: runtimeRef,
    [SD_COL.RUNTIME_CONFIG]: runtimeConfig,
    [SD_COL.BINDING_VERSION_ID]: binding.bindingVersionId,
    [SD_COL.BINDING_DIGEST]: bindingRow.binding_digest,
    [SD_COL.BINDING_PROJECTION]:
      buildBindingProjection(bindingRow, binding),
    [SD_COL.STATUS]: WASM_SERVICE_DEFINITION_STATUS.INACTIVE,
    [SD_COL.CREATED_AT]: binding.createdAt,
    [SD_COL.UPDATED_AT]: binding.createdAt,
  });
}

function requestBindingServiceDefinitionRowsMatch(left, right) {
  return SERVICE_DEFINITION_COLUMN_LIST.every(
    (field) => left?.[field] === right?.[field],
  );
}

export {
  REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE,
  REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE,
  REQUEST_BINDING_SERVICE_DEFINITION_PATH,
  RequestBindingServiceDefinitionError,
  buildRequestBindingServiceDefinition,
  deriveRequestServiceDefinitionId,
  hasRequestBindingServiceDefinitionLineage,
  requestBindingServiceDefinitionRowsMatch,
  supportsBindingServiceDefinitionSourceKind,
};
