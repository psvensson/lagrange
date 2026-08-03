import {TABLES} from '../../constants/index.js';
import {RUNTIME_KIND} from '../../constants/runtime.js';
import {
  DEPLOYMENT_BINDING_ERROR_CODE,
  DEPLOYMENT_BINDING_MESSAGE,
  DEPLOYMENT_BINDING_PATH,
  DeploymentBindingError,
  bindDeploymentArtifact,
  bindingRowsMatch,
  buildBindingRow,
  canonicalJson,
  deriveBindingId,
  deriveBindingVersionId,
  normalizeDeploymentBinding,
  projectBinding,
  rebindStoredDeploymentArtifact,
  validateSecurityContext,
} from './deployment-binding-contract.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const DEPLOYMENT_BINDING_OWNER_NAME = 'deployment-binding-owner';

// Payload-seal bindable gate (brief
// docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md §1
// "Installation State Machine"): with the cluster payload store
// attached, a wasm_component artifact is bindable only once a SEALED
// internal payload exists for its artifact digest. Pre-store
// installations must run the explicit migration/import path first.
const ARTIFACT_PAYLOAD_NOT_INTERNALIZED = Object.freeze({
  CODE: 'binding_artifact_payload_not_internalized',
  MESSAGE: 'artifact payload is not internalized in the cluster payload ' +
    'store; migrate or import the artifact payload before binding',
});

class DeploymentBindingOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = DEPLOYMENT_BINDING_OWNER_NAME;
  static TABLE_NAME = TABLES.SERVICE_BINDINGS;

  constructor(options = {}) {
    super(options);
    if (!options.catalogOwner) {
      throw new DeploymentBindingError(
        DEPLOYMENT_BINDING_ERROR_CODE.DEPENDENCY_REQUIRED,
        DEPLOYMENT_BINDING_PATH.CATALOG_OWNER,
        DEPLOYMENT_BINDING_MESSAGE.DEPENDENCY_REQUIRED,
      );
    }
    this.catalogOwner = options.catalogOwner;
    this.artifactPayloadStore = options.artifactPayloadStore || null;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.serialGates = new Map();
  }

  timestamp() {
    const value = this.now();
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new DeploymentBindingError(
        DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
        DEPLOYMENT_BINDING_PATH.NOW,
        DEPLOYMENT_BINDING_MESSAGE.INVALID_FIELD,
      );
    }
    return value;
  }

  async runSerialized(key, operation) {
    const predecessor = this.serialGates.get(key);
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    this.serialGates.set(key, gate);
    if (predecessor) await predecessor;
    try {
      return await operation();
    } finally {
      release();
      if (this.serialGates.get(key) === gate) this.serialGates.delete(key);
    }
  }

  async readBindingRow(bindingVersionId) {
    const row = await this.readByPrimaryKey(bindingVersionId);
    if (row === null) return null;
    return projectBinding(row).tenantId ? row : null;
  }

  async resolveArtifact(declaration, securityContext) {
    const artifact = await this.catalogOwner.getBindableArtifactForTenant(
      declaration.target.package_id,
      declaration.target.manifest_digest,
      securityContext.tenantId,
    );
    if (!artifact) {
      throw new DeploymentBindingError(
        DEPLOYMENT_BINDING_ERROR_CODE.ARTIFACT_NOT_FOUND,
        DEPLOYMENT_BINDING_PATH.TARGET,
        DEPLOYMENT_BINDING_MESSAGE.ARTIFACT_MISSING,
      );
    }
    await this.assertPayloadInternalized(artifact);
    return artifact;
  }

  // Composition-gated: no attached store keeps the pre-store behavior;
  // non-WASM artifacts stay out of scope (brief §1 "OCI Containers").
  async assertPayloadInternalized(artifact) {
    if (!this.artifactPayloadStore ||
        artifact.manifest?.runtime?.kind !== RUNTIME_KIND.WASM_COMPONENT) {
      return;
    }
    const sealed = await this.artifactPayloadStore
      .findSealedPayloadByArtifactDigest(artifact.artifactDigest);
    if (sealed.found !== true) {
      throw new DeploymentBindingError(
        ARTIFACT_PAYLOAD_NOT_INTERNALIZED.CODE,
        DEPLOYMENT_BINDING_PATH.TARGET,
        ARTIFACT_PAYLOAD_NOT_INTERNALIZED.MESSAGE,
      );
    }
  }

  assertReplay(existing, requested) {
    if (!bindingRowsMatch(existing, requested)) {
      throw new DeploymentBindingError(
        DEPLOYMENT_BINDING_ERROR_CODE.BINDING_CONFLICT,
        DEPLOYMENT_BINDING_PATH.NAME,
        DEPLOYMENT_BINDING_MESSAGE.BINDING_IMMUTABLE,
      );
    }
    return projectBinding(existing, true);
  }

  async createBinding(input, securityContext, options = {}) {
    const context = validateSecurityContext(securityContext);
    const normalized = normalizeDeploymentBinding(input);
    const artifact = await this.resolveArtifact(normalized, context);
    const declaration = bindDeploymentArtifact(normalized, artifact);
    const row = buildBindingRow(declaration, context, this.timestamp());
    return this.runSerialized(row.binding_version_id, async () => {
      const existing = await this.readBindingRow(row.binding_version_id);
      if (existing) return this.assertReplay(existing, row);
      try {
        await this.insertRow(row, options);
      } catch (error) {
        const recovered = await this.readBindingRow(row.binding_version_id);
        if (recovered) return this.assertReplay(recovered, row);
        throw error;
      }
      const persisted = await this.readBindingRow(row.binding_version_id);
      if (!persisted) {
        throw new DeploymentBindingError(
          DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
          DEPLOYMENT_BINDING_PATH.BINDING,
          DEPLOYMENT_BINDING_MESSAGE.CORRUPT_RECORD,
        );
      }
      this.assertReplay(persisted, row);
      return projectBinding(persisted, false);
    });
  }

  async getBindingByName(bindingName, securityContext) {
    const context = validateSecurityContext(securityContext);
    const bindingId = deriveBindingId(context.tenantId, bindingName);
    const row = await this.readBindingRow(deriveBindingVersionId(bindingId));
    if (!row) return null;
    const binding = projectBinding(row);
    if (binding.tenantId !== context.tenantId) return null;
    const artifact = await this.resolveArtifact(binding.declaration, context);
    const rebound = rebindStoredDeploymentArtifact(
      binding.declaration,
      artifact,
    );
    if (canonicalJson(rebound) !== row.normalized_binding) {
      throw new DeploymentBindingError(
        DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
        DEPLOYMENT_BINDING_PATH.BINDING,
        DEPLOYMENT_BINDING_MESSAGE.CORRUPT_RECORD,
      );
    }
    return binding;
  }
}

export {ARTIFACT_PAYLOAD_NOT_INTERNALIZED, DeploymentBindingOwner};
