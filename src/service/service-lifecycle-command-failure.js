/**
 * Failure vocabulary and result projection of the service lifecycle command
 * owner (extracted from service-lifecycle-command-owner.js, which re-exports
 * the public names). failureResult is the ONE projection of a command
 * failure onto the lifecycle SQL result that the PostgreSQL wire encodes.
 */

import {ServiceInstallCatalogError} from '../control-plane/owners/index.js';
import {RuntimeAccessPolicyError} from
  '../control-plane/owners/runtime-access-policy-owner.js';
import {DeploymentBindingError} from
  '../control-plane/owners/deployment-binding-contract.js';
import {deepFreeze} from '../utils/deep-freeze.js';
import {ArtifactPayloadStoreError} from './artifact-payload-store.js';
import {
  CALL_OUTCOME_CLASS,
  CallCellRoutingError,
  publicCallOutcomeOf,
} from './call-cell-routing-contract.js';
import {SERVICE_LIFECYCLE_COMMAND as SERVICE_LIFECYCLE_SQL_COMMAND} from
  './service-lifecycle-command-contract.js';

const SERVICE_LIFECYCLE_COMMAND_FAILED_MESSAGE =
  'service lifecycle command failed';

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
  CALL_INVOCATION: 'call_invocation',
  COMMAND: 'command_normalization',
  MANIFEST: 'manifest_normalization',
  SECURITY: 'security_context',
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

const SERVICE_LIFECYCLE_COMMAND_LITERAL = Object.freeze({
  ERROR_NAME: 'ServiceLifecycleCommandError',
});

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

function commandFailure(code, stage, path, message, detail = {}) {
  throw new ServiceLifecycleCommandError(code, stage, path, message, detail);
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
  if (error instanceof CallCellRoutingError) {
    return {
      code: error.code,
      stage: SERVICE_LIFECYCLE_COMMAND_STAGE.CALL_INVOCATION,
      known: true,
    };
  }
  if (error instanceof ArtifactPayloadStoreError) {
    return {code: SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.ARTIFACT_REJECTED,
      known: true, stage: SERVICE_LIFECYCLE_COMMAND_STAGE.ARTIFACT};
  }
  return {
    code: SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.CATALOG_REJECTED,
    stage: SERVICE_LIFECYCLE_COMMAND_STAGE.CATALOG,
    known: false,
  };
}

function describeFailure(error) {
  const delegated = classifyDelegatedFailure(error);
  const lifecycle = error instanceof ServiceLifecycleCommandError;
  const known = lifecycle || delegated.known;
  return {
    code: lifecycle ? error.code : delegated.code,
    detail: {
      ...(known ? error.detail : {}),
      ...(delegated.known ? {ownerCode: error.code} : {}),
      path: known ? error.path : SERVICE_LIFECYCLE_COMMAND_PATH.CATALOG,
      stage: lifecycle ? error.stage : delegated.stage,
    },
    lifecycle,
    message: known ? error.message : SERVICE_LIFECYCLE_COMMAND_FAILED_MESSAGE,
  };
}

// A CALL BINDING failure additionally carries its public outcome class
// and retry safety, derived by the call routing contract; the command
// owner's own refusals happen before any invocation.
function callFailureOutcome(error, described) {
  if (described.lifecycle) {
    return Object.freeze({
      message: described.message,
      outcomeClass: CALL_OUTCOME_CLASS.DEFINITELY_NOT_EXECUTED,
      retrySafe: false,
    });
  }
  return publicCallOutcomeOf(error);
}

function failureResult(error, command) {
  const described = describeFailure(error);
  if (command !== SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING) {
    return deepFreeze({
      success: false,
      error: described.message,
      errorCode: described.code,
      detail: described.detail,
    });
  }
  const call = callFailureOutcome(error, described);
  return deepFreeze({
    success: false,
    error: call.message,
    errorCode: described.code,
    detail: {
      ...described.detail,
      outcomeClass: call.outcomeClass,
      retrySafe: call.retrySafe,
    },
  });
}

export {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_COMMAND_PATH,
  SERVICE_LIFECYCLE_COMMAND_STAGE,
  ServiceLifecycleCommandError,
  commandFailure,
  failureResult,
};
