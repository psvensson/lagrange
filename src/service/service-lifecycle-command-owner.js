/**
 * Semantic owner for authenticated service lifecycle commands.
 *
 * SQL supplies grammar and projection. This owner composes the manifest,
 * artifact, and desired-state catalog owners and derives every durable identity
 * from canonical intent plus the authenticated server context.
 */

import {createHash} from 'node:crypto';

import {
  SERVICE_INSTALL_DESIRED_STATE,
  ServiceInstallCatalogError,
} from '../control-plane/owners/index.js';
import {RuntimeAccessPolicyError} from
  '../control-plane/owners/runtime-access-policy-owner.js';
import {DeploymentBindingError} from
  '../control-plane/owners/deployment-binding-contract.js';
import {deriveTenantPackageId} from
  '../control-plane/owners/service-install-catalog-contract.js';
import {SERVICE_LIFECYCLE_COMMAND as SERVICE_LIFECYCLE_SQL_COMMAND} from
  './service-lifecycle-command-contract.js';
import {
  ARTIFACT_SIGNATURE_POLICY_MODE,
} from './installable-service-artifact-resolver.js';
import {normalizeExternalServiceManifest} from './external-service-manifest.js';

const SERVICE_LIFECYCLE_COMMAND_ERROR_CODE = Object.freeze({
  ACCESS_POLICY_REJECTED: 'service_lifecycle_access_policy_rejected',
  ARTIFACT_REJECTED: 'service_lifecycle_artifact_rejected',
  CATALOG_REJECTED: 'service_lifecycle_catalog_rejected',
  BINDING_REJECTED: 'service_lifecycle_binding_rejected',
  DEPENDENCY_REQUIRED: 'service_lifecycle_dependency_required',
  IDEMPOTENCY_CONFLICT: 'service_lifecycle_idempotency_conflict',
  INVALID_CONFIG: 'service_lifecycle_invalid_config',
  INVALID_IDEMPOTENCY_KEY: 'service_lifecycle_invalid_idempotency_key',
  INVALID_SECURITY_CONTEXT: 'service_lifecycle_invalid_security_context',
  INVALID_SERVICE_NAME: 'service_lifecycle_invalid_service_name',
  MANIFEST_REJECTED: 'service_lifecycle_manifest_rejected',
  SERVICE_NOT_FOUND: 'service_lifecycle_service_not_found',
  SIGNATURE_POLICY_INVALID: 'service_lifecycle_signature_policy_invalid',
  UNSUPPORTED_COMMAND: 'service_lifecycle_unsupported_command',
});

const SERVICE_LIFECYCLE_COMMAND_STAGE = Object.freeze({
  ACCESS_POLICY: 'access_policy_submission',
  ARTIFACT: 'artifact_resolution',
  CATALOG: 'catalog_submission',
  BINDING: 'binding_submission',
  COMMAND: 'command_normalization',
  MANIFEST: 'manifest_normalization',
  SECURITY: 'security_context',
});

const SERVICE_LIFECYCLE_OPERATION_STATUS = Object.freeze({
  DURABLE: 'durable',
  REPLAYED: 'replayed',
});

const SERVICE_LIFECYCLE_COMMAND_PATH = Object.freeze({
  ACCESS_POLICY: '/access_policy',
  ARTIFACT_SOURCE: '/payload/artifact_source',
  CATALOG: '/catalog',
  CATALOG_PACKAGE: '/catalog/package',
  CATALOG_REVISION: '/catalog/revision',
  BINDING: '/binding',
  COMMAND: '/command',
  CONFIG: '/payload/config',
  DEPENDENCIES: '/dependencies',
  IDEMPOTENCY_KEY: '/payload/idempotency_key',
  MANIFEST: '/payload/manifest',
  SECURITY_CONTEXT: '/securityContext',
  SERVICE_NAME: '/payload/service_name',
  SIGNATURE_POLICY: '/signaturePolicy',
});

const SERVICE_LIFECYCLE_COMMAND_MESSAGE = Object.freeze({
  ACCESS_POLICY_OWNER_REQUIRED:
    'runtime access policy owner is required for access configuration',
  ARTIFACT_REJECTED: 'installable service artifact was rejected',
  CATALOG_PACKAGE_MISSING: 'catalog revision references a missing package',
  CATALOG_REVISION_MISSING:
    'catalog installation references a missing revision',
  COMMAND_FAILED: 'service lifecycle command failed',
  CONFIG_INVALID: 'service revision config must be a JSON object',
  DEPENDENCIES_REQUIRED: 'catalog and artifact owners are required',
  IDEMPOTENCY_CONFLICT:
    'idempotency key is already bound to different lifecycle intent',
  IDEMPOTENCY_KEY_INVALID:
    'idempotency_key must be a bounded non-empty string',
  MANIFEST_REJECTED: 'external service manifest was rejected',
  SECURITY_CONTEXT_INVALID:
    'authenticated tenant, principal, and roles are required',
  SERVICE_NAME_INVALID:
    'service_name must match the external manifest name contract',
  SERVICE_NOT_FOUND: 'service has no catalog installation to remove',
  SIGNATURE_POLICY_REQUIRED:
    'service lifecycle owner requires an explicit signature policy',
  UNSUPPORTED_COMMAND: 'service lifecycle command is unsupported',
});

const SERVICE_LIFECYCLE_COMMAND_LITERAL = Object.freeze({
  ERROR_NAME: 'ServiceLifecycleCommandError',
});

const SERVICE_LIFECYCLE_ID_KIND = Object.freeze({
  DEFINITION: 'definition',
  INSTALLATION: 'installation',
  OPERATION: 'operation',
  REVISION: 'revision',
});

const SERVICE_LIFECYCLE_OWNER_RESULT_STATUS = Object.freeze({
  REJECTED: 'rejected',
  RESOLVED: 'resolved',
});

const SERVICE_LIFECYCLE_REPLAY_STATE = Object.freeze({
  ABSENT: 'absent',
  REPLAYED: 'replayed',
});

const SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY = Object.freeze({
  mode: ARTIFACT_SIGNATURE_POLICY_MODE.VERIFY_IF_PRESENT,
  trusted_keys: Object.freeze({}),
});

const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,127}$/u;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';

class ServiceLifecycleCommandError extends Error {
  constructor(code, stage, path, message, detail = {}) {
    super(message);
    this.name = SERVICE_LIFECYCLE_COMMAND_LITERAL.ERROR_NAME;
    this.code = code;
    this.stage = stage;
    this.path = path;
    this.detail = detail;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function shortHash(value) {
  return createHash(HASH_ALGORITHM)
    .update(stableJson(value))
    .digest(HASH_ENCODING);
}

function derivedId(kind, value) {
  return `service-${kind}-${shortHash(value)}`;
}

function commandFailure(code, stage, path, message, detail = {}) {
  throw new ServiceLifecycleCommandError(code, stage, path, message, detail);
}

function validateSignaturePolicy(signaturePolicy) {
  if (!isPlainObject(signaturePolicy) ||
      !Object.values(ARTIFACT_SIGNATURE_POLICY_MODE)
        .includes(signaturePolicy.mode)) {
    commandFailure(
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.SIGNATURE_POLICY_INVALID,
      SERVICE_LIFECYCLE_COMMAND_STAGE.COMMAND,
      SERVICE_LIFECYCLE_COMMAND_PATH.SIGNATURE_POLICY,
      SERVICE_LIFECYCLE_COMMAND_MESSAGE.SIGNATURE_POLICY_REQUIRED,
    );
  }
  return deepFreeze(canonicalize(signaturePolicy));
}

function validateSecurityContext(securityContext) {
  const rolesValid = Array.isArray(securityContext?.roles) &&
    securityContext.roles.every((role) => typeof role === 'string');
  if (typeof securityContext?.tenantId !== 'string' ||
      securityContext.tenantId.length === 0 ||
      typeof securityContext?.principal !== 'string' ||
      securityContext.principal.length === 0 || !rolesValid) {
    commandFailure(
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.INVALID_SECURITY_CONTEXT,
      SERVICE_LIFECYCLE_COMMAND_STAGE.SECURITY,
      SERVICE_LIFECYCLE_COMMAND_PATH.SECURITY_CONTEXT,
      SERVICE_LIFECYCLE_COMMAND_MESSAGE.SECURITY_CONTEXT_INVALID,
    );
  }
  return securityContext;
}

function validateServiceName(serviceName) {
  if (typeof serviceName !== 'string' ||
      !SERVICE_NAME_PATTERN.test(serviceName)) {
    commandFailure(
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.INVALID_SERVICE_NAME,
      SERVICE_LIFECYCLE_COMMAND_STAGE.COMMAND,
      SERVICE_LIFECYCLE_COMMAND_PATH.SERVICE_NAME,
      SERVICE_LIFECYCLE_COMMAND_MESSAGE.SERVICE_NAME_INVALID,
    );
  }
  return serviceName;
}

function validateIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim() !== idempotencyKey ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    commandFailure(
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.INVALID_IDEMPOTENCY_KEY,
      SERVICE_LIFECYCLE_COMMAND_STAGE.COMMAND,
      SERVICE_LIFECYCLE_COMMAND_PATH.IDEMPOTENCY_KEY,
      SERVICE_LIFECYCLE_COMMAND_MESSAGE.IDEMPOTENCY_KEY_INVALID,
    );
  }
  return idempotencyKey;
}

function normalizeConfig(config) {
  const effective = config === undefined ? {} : config;
  if (!isPlainObject(effective)) {
    commandFailure(
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.INVALID_CONFIG,
      SERVICE_LIFECYCLE_COMMAND_STAGE.COMMAND,
      SERVICE_LIFECYCLE_COMMAND_PATH.CONFIG,
      SERVICE_LIFECYCLE_COMMAND_MESSAGE.CONFIG_INVALID,
    );
  }
  return canonicalize(effective);
}

function buildIntentIdentity(command, payload, securityContext, manifest) {
  const config = normalizeConfig(payload.config);
  const packageId = deriveTenantPackageId(manifest, securityContext.tenantId);
  const revisionId = derivedId(SERVICE_LIFECYCLE_ID_KIND.REVISION, {
    artifactSource: canonicalize(payload.artifact_source),
    config,
    packageId,
  });
  const serviceDefinitionId = derivedId(SERVICE_LIFECYCLE_ID_KIND.DEFINITION, {
    tenantId: securityContext.tenantId,
    serviceName: manifest.name,
  });
  const operationId = derivedId(SERVICE_LIFECYCLE_ID_KIND.OPERATION, {
    action: command,
    idempotencyKey: validateIdempotencyKey(payload.idempotency_key),
    principal: securityContext.principal,
    tenantId: securityContext.tenantId,
  });
  return deepFreeze({
    config,
    desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
    installationId: derivedId(
      SERVICE_LIFECYCLE_ID_KIND.INSTALLATION,
      {operationId},
    ),
    operationId,
    packageId,
    revisionId,
    serviceDefinitionId,
    serviceName: manifest.name,
  });
}

function buildRemovalIdentity(command, payload, securityContext) {
  const serviceName = validateServiceName(payload.service_name);
  const serviceDefinitionId = derivedId(SERVICE_LIFECYCLE_ID_KIND.DEFINITION, {
    tenantId: securityContext.tenantId,
    serviceName,
  });
  const operationId = derivedId(SERVICE_LIFECYCLE_ID_KIND.OPERATION, {
    action: command,
    idempotencyKey: validateIdempotencyKey(payload.idempotency_key),
    principal: securityContext.principal,
    tenantId: securityContext.tenantId,
  });
  return deepFreeze({
    desiredState: SERVICE_INSTALL_DESIRED_STATE.REMOVED,
    installationId: derivedId(
      SERVICE_LIFECYCLE_ID_KIND.INSTALLATION,
      {operationId},
    ),
    operationId,
    serviceDefinitionId,
    serviceName,
  });
}

function assertReplayMatches(existing, identity) {
  const matches = existing.installationId === identity.installationId &&
    existing.revisionId === identity.revisionId &&
    existing.serviceDefinitionId === identity.serviceDefinitionId &&
    existing.desiredState === identity.desiredState &&
    existing.operationId === identity.operationId;
  if (!matches) {
    commandFailure(
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.IDEMPOTENCY_CONFLICT,
      SERVICE_LIFECYCLE_COMMAND_STAGE.CATALOG,
      SERVICE_LIFECYCLE_COMMAND_PATH.IDEMPOTENCY_KEY,
      SERVICE_LIFECYCLE_COMMAND_MESSAGE.IDEMPOTENCY_CONFLICT,
    );
  }
}

function operationRow(command, identity, installation, replayed) {
  return deepFreeze({
    action: command,
    desired_state: installation.desiredState,
    installation_id: installation.installationId,
    operation_id: installation.operationId,
    operation_status: replayed ?
      SERVICE_LIFECYCLE_OPERATION_STATUS.REPLAYED :
      SERVICE_LIFECYCLE_OPERATION_STATUS.DURABLE,
    package_id: identity.packageId || '',
    revision_id: installation.revisionId,
    rollout_state: installation.rolloutState,
    service_definition_id: installation.serviceDefinitionId,
    service_name: identity.serviceName,
  });
}

function bindingOperationRow(command, binding) {
  return deepFreeze({
    action: command,
    binding_id: binding.bindingId,
    binding_name: binding.name,
    binding_version_id: binding.bindingVersionId,
    export_name: binding.declaration.target.export_name,
    generation: binding.generation,
    manifest_digest: binding.declaration.target.manifest_digest,
    operation_status: binding.replayed ?
      SERVICE_LIFECYCLE_OPERATION_STATUS.REPLAYED :
      SERVICE_LIFECYCLE_OPERATION_STATUS.DURABLE,
    package_id: binding.declaration.target.package_id,
    source_kind: binding.declaration.source.kind,
  });
}

function successResult(command, rows, changes = 0) {
  return deepFreeze({
    success: true,
    operation: command,
    rows,
    rowCount: rows.length,
    changes,
  });
}

function classifyDelegatedFailure(error) {
  if (error instanceof RuntimeAccessPolicyError) {
    return {
      code: SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.ACCESS_POLICY_REJECTED,
      stage: SERVICE_LIFECYCLE_COMMAND_STAGE.ACCESS_POLICY,
      known: true,
    };
  }
  if (error instanceof DeploymentBindingError) {
    return {
      code: SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.BINDING_REJECTED,
      stage: SERVICE_LIFECYCLE_COMMAND_STAGE.BINDING,
      known: true,
    };
  }
  if (error instanceof ServiceInstallCatalogError) {
    return {
      code: SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.CATALOG_REJECTED,
      stage: SERVICE_LIFECYCLE_COMMAND_STAGE.CATALOG,
      known: true,
    };
  }
  return {
    code: SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.CATALOG_REJECTED,
    stage: SERVICE_LIFECYCLE_COMMAND_STAGE.CATALOG,
    known: false,
  };
}

function failureResult(error) {
  const delegated = classifyDelegatedFailure(error);
  const lifecycle = error instanceof ServiceLifecycleCommandError;
  const known = lifecycle || delegated.known;
  const code = lifecycle ? error.code : delegated.code;
  const stage = lifecycle ? error.stage : delegated.stage;
  const path = known ? error.path : SERVICE_LIFECYCLE_COMMAND_PATH.CATALOG;
  const ownerCode = delegated.known ? error.code : undefined;
  return deepFreeze({
    success: false,
    error: known ? error.message :
      SERVICE_LIFECYCLE_COMMAND_MESSAGE.COMMAND_FAILED,
    errorCode: code,
    detail: {
      ...(known ? error.detail : {}),
      ...(ownerCode ? {ownerCode} : {}),
      path,
      stage,
    },
  });
}

function latestByServiceDefinition(installations) {
  const latest = new Map();
  for (const installation of installations) {
    latest.set(installation.serviceDefinitionId, installation);
  }
  return [...latest.values()];
}

class ServiceLifecycleCommandOwner {
  constructor(options = {}) {
    if (!options.catalogOwner || !options.artifactResolver) {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.DEPENDENCY_REQUIRED,
        SERVICE_LIFECYCLE_COMMAND_STAGE.COMMAND,
        SERVICE_LIFECYCLE_COMMAND_PATH.DEPENDENCIES,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.DEPENDENCIES_REQUIRED,
      );
    }
    this.catalogOwner = options.catalogOwner;
    this.bindingOwner = options.bindingOwner || null;
    this.runtimeAccessPolicyOwner = options.runtimeAccessPolicyOwner || null;
    this.artifactResolver = options.artifactResolver;
    this.signaturePolicy = validateSignaturePolicy(options.signaturePolicy);
  }

  async execute(command, payload, securityContext) {
    try {
      const context = validateSecurityContext(securityContext);
      switch (command) {
      case SERVICE_LIFECYCLE_SQL_COMMAND.CONFIGURE_ACCESS:
        return await this.configureAccess(command, payload, context);
      case SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING:
        return await this.submitBinding(command, payload, context);
      case SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL:
      case SERVICE_LIFECYCLE_SQL_COMMAND.UPGRADE:
        return await this.submitArtifactIntent(command, payload, context);
      case SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE:
        return await this.submitRemovalIntent(command, payload, context);
      case SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE:
        return await this.showOne(payload, context);
      case SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL:
        return await this.showAll(context);
      default:
        commandFailure(
          SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.UNSUPPORTED_COMMAND,
          SERVICE_LIFECYCLE_COMMAND_STAGE.COMMAND,
          SERVICE_LIFECYCLE_COMMAND_PATH.COMMAND,
          SERVICE_LIFECYCLE_COMMAND_MESSAGE.UNSUPPORTED_COMMAND,
        );
      }
    } catch (error) {
      return failureResult(error);
    }
  }

  normalizeManifest(payload) {
    const result = normalizeExternalServiceManifest(payload.manifest);
    if (result.status === SERVICE_LIFECYCLE_OWNER_RESULT_STATUS.REJECTED) {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.MANIFEST_REJECTED,
        SERVICE_LIFECYCLE_COMMAND_STAGE.MANIFEST,
        SERVICE_LIFECYCLE_COMMAND_PATH.MANIFEST,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.MANIFEST_REJECTED,
        {errors: result.errors},
      );
    }
    return result.manifest;
  }

  async configureAccess(command, payload, securityContext) {
    if (!this.runtimeAccessPolicyOwner) {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.DEPENDENCY_REQUIRED,
        SERVICE_LIFECYCLE_COMMAND_STAGE.ACCESS_POLICY,
        SERVICE_LIFECYCLE_COMMAND_PATH.ACCESS_POLICY,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.ACCESS_POLICY_OWNER_REQUIRED,
      );
    }
    const policy = await this.runtimeAccessPolicyOwner.configureBindingAccess(
      payload,
      securityContext,
    );
    return successResult(command, [{
      binding_version_id: policy.bindingVersionId,
      schema_version: policy.schemaVersion,
      service_id: policy.serviceId,
      table_slots: policy.tables.length,
    }], 1);
  }

  async submitBinding(command, payload, securityContext) {
    if (typeof this.bindingOwner?.createBinding !== 'function') {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.DEPENDENCY_REQUIRED,
        SERVICE_LIFECYCLE_COMMAND_STAGE.BINDING,
        SERVICE_LIFECYCLE_COMMAND_PATH.BINDING,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.DEPENDENCIES_REQUIRED,
      );
    }
    const binding = await this.bindingOwner.createBinding(
      payload, securityContext);
    return successResult(
      command,
      [bindingOperationRow(command, binding)],
      binding.replayed ? 0 : 1,
    );
  }

  async resolveArtifact(manifest, artifactSource) {
    const result = await this.artifactResolver.resolve({
      manifest,
      source: artifactSource,
      signaturePolicy: this.signaturePolicy,
    });
    if (result?.status !== SERVICE_LIFECYCLE_OWNER_RESULT_STATUS.RESOLVED) {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.ARTIFACT_REJECTED,
        SERVICE_LIFECYCLE_COMMAND_STAGE.ARTIFACT,
        SERVICE_LIFECYCLE_COMMAND_PATH.ARTIFACT_SOURCE,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.ARTIFACT_REJECTED,
        {errors: result?.errors || []},
      );
    }
    return result;
  }

  async loadComponentArtifact(target) {
    const artifact = await this.catalogOwner.getBindableArtifact(
      target.packageId,
      target.manifestDigest,
    );
    const selectedExport = artifact?.manifest?.exports?.find(
      (entry) => entry.name === target.exportName,
    );
    if (!artifact ||
        artifact.artifactDigest !== target.artifactDigest ||
        !selectedExport) {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.ARTIFACT_REJECTED,
        SERVICE_LIFECYCLE_COMMAND_STAGE.ARTIFACT,
        SERVICE_LIFECYCLE_COMMAND_PATH.ARTIFACT_SOURCE,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.ARTIFACT_REJECTED,
      );
    }
    const payload = await this.artifactResolver.loadComponentPayload({
      artifactDigest: target.artifactDigest,
      manifest: artifact.manifest,
    });
    return {
      ...artifact,
      bytes: payload.bytes,
      payloadDigest: payload.payloadDigest,
    };
  }

  async replayIfDurable(command, identity) {
    const existing = await this.catalogOwner.getInstallationByOperationId(
      identity.operationId,
    );
    if (!existing) {
      return Object.freeze({state: SERVICE_LIFECYCLE_REPLAY_STATE.ABSENT});
    }
    assertReplayMatches(existing, identity);
    return Object.freeze({
      state: SERVICE_LIFECYCLE_REPLAY_STATE.REPLAYED,
      result: successResult(
        command,
        [operationRow(command, identity, existing, true)],
      ),
    });
  }

  async submitArtifactIntent(command, payload, securityContext) {
    const manifest = this.normalizeManifest(payload);
    const identity = buildIntentIdentity(
      command, payload, securityContext, manifest,
    );
    const replay = await this.replayIfDurable(command, identity);
    if (replay.state === SERVICE_LIFECYCLE_REPLAY_STATE.REPLAYED) {
      return replay.result;
    }
    const resolvedArtifact = await this.resolveArtifact(
      manifest, payload.artifact_source,
    );
    await this.catalogOwner.recordPackage({
      packageId: identity.packageId,
      manifest,
      resolvedArtifact,
    });
    await this.catalogOwner.recordRevision({
      revisionId: identity.revisionId,
      packageId: identity.packageId,
      config: identity.config,
    });
    const installation = await this.catalogOwner.requestInstallation({
      installationId: identity.installationId,
      revisionId: identity.revisionId,
      serviceDefinitionId: identity.serviceDefinitionId,
      desiredState: identity.desiredState,
      operationId: identity.operationId,
    });
    return successResult(
      command,
      [operationRow(command, identity, installation, false)],
      1,
    );
  }

  async submitRemovalIntent(command, payload, securityContext) {
    const identity = buildRemovalIdentity(command, payload, securityContext);
    const existing = await this.catalogOwner.getInstallationByOperationId(
      identity.operationId,
    );
    if (existing) {
      const replayIdentity = {...identity, revisionId: existing.revisionId};
      assertReplayMatches(existing, replayIdentity);
      return successResult(
        command,
        [operationRow(command, replayIdentity, existing, true)],
      );
    }
    const installations = await this.catalogOwner.listInstallations();
    const current = installations
      .filter((entry) =>
        entry.serviceDefinitionId === identity.serviceDefinitionId)
      .at(-1);
    if (!current) {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.SERVICE_NOT_FOUND,
        SERVICE_LIFECYCLE_COMMAND_STAGE.CATALOG,
        SERVICE_LIFECYCLE_COMMAND_PATH.SERVICE_NAME,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.SERVICE_NOT_FOUND,
      );
    }
    const removalIdentity = deepFreeze({
      ...identity,
      revisionId: current.revisionId,
    });
    const installation = await this.catalogOwner.requestInstallation({
      installationId: removalIdentity.installationId,
      revisionId: removalIdentity.revisionId,
      serviceDefinitionId: removalIdentity.serviceDefinitionId,
      desiredState: removalIdentity.desiredState,
      operationId: removalIdentity.operationId,
    });
    return successResult(
      command,
      [operationRow(command, removalIdentity, installation, false)],
      1,
    );
  }

  async statusRow(installation) {
    const revision = await this.catalogOwner.getRevision(
      installation.revisionId,
    );
    if (!revision) {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.CATALOG_REJECTED,
        SERVICE_LIFECYCLE_COMMAND_STAGE.CATALOG,
        SERVICE_LIFECYCLE_COMMAND_PATH.CATALOG_REVISION,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.CATALOG_REVISION_MISSING,
      );
    }
    const servicePackage = await this.catalogOwner.getPackage(
      revision.packageId,
    );
    if (!servicePackage) {
      commandFailure(
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.CATALOG_REJECTED,
        SERVICE_LIFECYCLE_COMMAND_STAGE.CATALOG,
        SERVICE_LIFECYCLE_COMMAND_PATH.CATALOG_PACKAGE,
        SERVICE_LIFECYCLE_COMMAND_MESSAGE.CATALOG_PACKAGE_MISSING,
      );
    }
    return deepFreeze({
      desired_state: installation.desiredState,
      installation_id: installation.installationId,
      latest_failure_id: installation.latestFailureId,
      operation_id: installation.operationId,
      revision_id: installation.revisionId,
      rollout_state: installation.rolloutState,
      service_definition_id: installation.serviceDefinitionId,
      service_name: servicePackage.name,
      version: servicePackage.version,
    });
  }

  async showOne(payload, securityContext) {
    const serviceName = validateServiceName(payload.service_name);
    const serviceDefinitionId = derivedId(
      SERVICE_LIFECYCLE_ID_KIND.DEFINITION,
      {
        tenantId: securityContext.tenantId,
        serviceName,
      },
    );
    const installations = await this.catalogOwner.listInstallations();
    const installation = installations
      .filter((entry) => entry.serviceDefinitionId === serviceDefinitionId)
      .at(-1);
    const rows = installation ? [await this.statusRow(installation)] : [];
    return successResult(SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE, rows);
  }

  async showAll(securityContext) {
    const installations = latestByServiceDefinition(
      await this.catalogOwner.listInstallations(),
    );
    const projected = await Promise.all(
      installations.map((installation) => this.statusRow(installation)),
    );
    const rows = projected.filter((row) =>
      row.service_definition_id === derivedId(
        SERVICE_LIFECYCLE_ID_KIND.DEFINITION,
        {
          tenantId: securityContext.tenantId,
          serviceName: row.service_name,
        },
      ));
    rows.sort((left, right) =>
      left.service_name.localeCompare(right.service_name));
    return successResult(SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL, rows);
  }
}

export {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandError,
  ServiceLifecycleCommandOwner,
};
