import {TABLES} from '../../constants/index.js';
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
  validateSecurityContext,
} from './deployment-binding-contract.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const DEPLOYMENT_BINDING_OWNER_NAME = 'deployment-binding-owner';

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
    return artifact;
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
    const {capabilities: _capabilities, ...input} = binding.declaration;
    const artifact = await this.resolveArtifact(input, context);
    const rebound = bindDeploymentArtifact(
      normalizeDeploymentBinding(input), artifact);
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

export {DeploymentBindingOwner};
