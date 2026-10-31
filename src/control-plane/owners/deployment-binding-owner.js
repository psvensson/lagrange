import {TABLES} from '../../constants/index.js';
import {RUNTIME_KIND} from '../../constants/runtime.js';
import {
  DEPLOYMENT_BINDING_ERROR_CODE,
  DEPLOYMENT_BINDING_MESSAGE,
  DEPLOYMENT_BINDING_PATH,
  DEPLOYMENT_BINDING_SOURCE_KIND,
  DeploymentBindingError,
  bindDeploymentArtifact,
  bindingRowsMatch,
  buildBindingRow,
  canonicalJson,
  deriveBindingId,
  inspectBindingRow,
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

function bindingSourceIdentitiesMatch(latestSource, requestedSource) {
  if (latestSource.kind !== requestedSource.kind) return false;
  switch (latestSource.kind) {
  case DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST:
    return latestSource.method === requestedSource.method &&
      latestSource.path === requestedSource.path;
  case DEPLOYMENT_BINDING_SOURCE_KIND.CALL:
  case DEPLOYMENT_BINDING_SOURCE_KIND.PUSHDOWN:
    return latestSource.name === requestedSource.name;
  default:
    return true;
  }
}

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

  async readBindingRowsByName(tenantId, bindingName, options = {}) {
    let rows;
    if (this.getGateway()) {
      const result = await this.listRows(options);
      rows = Array.isArray(result) ? result : (result?.rows || []);
    } else if (this.getSystemTableCache()?.getAll) {
      rows = this.getSystemTableCache().getAll(this.getTableName()) || [];
    } else {
      rows = [];
    }
    return rows
      .filter((row) =>
        row?.tenant_id === tenantId && row?.binding_name === bindingName)
      .sort((a, b) => (a.generation || 0) - (b.generation || 0));
  }

  // Composition-gated: WASM artifacts require a sealed payload in the
  // cluster payload store. Non-WASM artifacts stay out of scope.
  async assertPayloadInternalized(artifact) {
    if (artifact.manifest?.runtime?.kind !== RUNTIME_KIND.WASM_COMPONENT) {
      return;
    }
    if (!this.artifactPayloadStore) {
      throw new DeploymentBindingError(
        ARTIFACT_PAYLOAD_NOT_INTERNALIZED.CODE,
        DEPLOYMENT_BINDING_PATH.TARGET,
        ARTIFACT_PAYLOAD_NOT_INTERNALIZED.MESSAGE,
      );
    }
    const sealed = await this.artifactPayloadStore
      .findSealedPayloadByArtifactDigest(artifact.artifactDigest);
    if (sealed?.found !== true) {
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
    const bindingId = deriveBindingId(context.tenantId, declaration.name);

    return this.runSerialized(bindingId, async () => {
      const existingRows = await this.readBindingRowsByName(
        context.tenantId, declaration.name, options);

      if (existingRows.length > 0) {
        const latest = existingRows[existingRows.length - 1];
        const latestInspected = inspectBindingRow(latest);
        const requestedSameGen = buildBindingRow(
          declaration, context, latest.created_at, latest.generation);

        if (bindingRowsMatch(latest, requestedSameGen)) {
          return projectBinding(latest, true);
        }

        if (!bindingSourceIdentitiesMatch(
          latestInspected.declaration.source,
          declaration.source,
        )) {
          throw new DeploymentBindingError(
            DEPLOYMENT_BINDING_ERROR_CODE.BINDING_CONFLICT,
            DEPLOYMENT_BINDING_PATH.NAME,
            DEPLOYMENT_BINDING_MESSAGE.BINDING_IMMUTABLE,
          );
        }

        const nextGeneration = latest.generation + 1;
        const newRow = buildBindingRow(
          declaration, context, this.timestamp(), nextGeneration);

        try {
          await this.insertRow(newRow, options);
        } catch (error) {
          const recovered = await this.readBindingRowsByName(
            context.tenantId, declaration.name, options);
          const match = recovered.find((r) => bindingRowsMatch(r, newRow));
          if (match) return projectBinding(match, true);
          throw error;
        }

        const persisted = await this.readBindingRow(newRow.binding_version_id);
        if (!persisted) {
          throw new DeploymentBindingError(
            DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
            DEPLOYMENT_BINDING_PATH.BINDING,
            DEPLOYMENT_BINDING_MESSAGE.CORRUPT_RECORD,
          );
        }
        this.assertReplay(persisted, newRow);
        return projectBinding(persisted, false);
      }

      const initialGeneration = 1;
      const row = buildBindingRow(
        declaration, context, this.timestamp(), initialGeneration);
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
    const rows = await this.readBindingRowsByName(
      context.tenantId, bindingName);
    if (rows.length === 0) return null;
    const row = rows[rows.length - 1];
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
