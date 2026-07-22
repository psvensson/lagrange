import {TABLES} from '../../constants/index.js';
import {SD_COL} from '../../wasm-service/wasm-service-models.js';
import {
  readAuthoritativeControlPlaneRows,
} from '../control-plane-system-table-gateway.js';
import {projectBinding} from './deployment-binding-contract.js';
import {
  REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE,
  REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE,
  REQUEST_BINDING_SERVICE_DEFINITION_PATH,
  RequestBindingServiceDefinitionError,
  buildRequestBindingServiceDefinition,
  requestBindingServiceDefinitionRowsMatch,
} from './request-binding-service-definition-contract.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const LOCAL_STR_SERVICE_DEFINITIONS_OWNER = 'service-definitions-owner';
const SERVICE_DEFINITION_ROW_OWNERS = new WeakMap();

class ServiceDefinitionRowOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_SERVICE_DEFINITIONS_OWNER;
  static TABLE_NAME = TABLES.SERVICE_DEFINITIONS;

  async readByBindingVersionId(bindingVersionId, options = {}) {
    return readAuthoritativeControlPlaneRows(
      this.requireGateway(),
      this.getTableName(),
      `${this.buildSelectAllSql()} WHERE ${SD_COL.BINDING_VERSION_ID} = ?`,
      [bindingVersionId],
      {...options, owner: this.getOwnerName()},
    );
  }
}

function rowOwnerFor(owner) {
  return SERVICE_DEFINITION_ROW_OWNERS.get(owner);
}

class ServiceDefinitionsOwner {
  static OWNER_NAME = LOCAL_STR_SERVICE_DEFINITIONS_OWNER;
  static TABLE_NAME = TABLES.SERVICE_DEFINITIONS;

  constructor(options = {}) {
    if (!options.catalogOwner) {
      throw new RequestBindingServiceDefinitionError(
        REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.DEPENDENCY_REQUIRED,
        REQUEST_BINDING_SERVICE_DEFINITION_PATH.CATALOG_OWNER,
        REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.DEPENDENCY_REQUIRED,
      );
    }
    this.catalogOwner = options.catalogOwner;
    this.serialGates = new Map();
    SERVICE_DEFINITION_ROW_OWNERS.set(
      this,
      new ServiceDefinitionRowOwner(options),
    );
  }

  getOwnerName() {
    return ServiceDefinitionsOwner.OWNER_NAME;
  }

  getTableName() {
    return ServiceDefinitionsOwner.TABLE_NAME;
  }

  getGateway() {
    return rowOwnerFor(this).getGateway();
  }

  getSystemTableCache() {
    return rowOwnerFor(this).getSystemTableCache();
  }

  async getServiceDefinition(serviceDefinitionId, options = {}) {
    return rowOwnerFor(this).readByPrimaryKey(serviceDefinitionId, options);
  }

  async listServiceDefinitions(options = {}) {
    return rowOwnerFor(this).listRows(options);
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

  assertDesiredService(existing, expected) {
    if (!requestBindingServiceDefinitionRowsMatch(existing, expected)) {
      throw new RequestBindingServiceDefinitionError(
        REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.DESIRED_SERVICE_CONFLICT,
        REQUEST_BINDING_SERVICE_DEFINITION_PATH.DESIRED_SERVICE,
        REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.DESIRED_SERVICE_CONFLICT,
      );
    }
  }

  async findBindingServiceDefinition(expected, options = {}) {
    const result = await rowOwnerFor(this).readByBindingVersionId(
      expected[SD_COL.BINDING_VERSION_ID],
      options,
    );
    const rows = Array.isArray(result) ? result : result?.rows;
    if (!Array.isArray(rows) || rows.length > 1) {
      this.assertDesiredService(null, expected);
    }
    if (rows.length === 0) return null;
    this.assertDesiredService(rows[0], expected);
    return rows[0];
  }

  async reconcileRequestBinding(bindingRow, options = {}) {
    const binding = projectBinding(bindingRow);
    const artifact = await this.catalogOwner.getBindableArtifactForTenant(
      binding.declaration.target.package_id,
      binding.declaration.target.manifest_digest,
      binding.tenantId,
    );
    const expected = buildRequestBindingServiceDefinition(
      bindingRow, artifact,
    );
    return this.runSerialized(binding.bindingVersionId, async () => {
      const lineageRow = await this.findBindingServiceDefinition(
        expected, options,
      );
      if (lineageRow) {
        return Object.freeze({created: false, serviceDefinition: expected});
      }
      const existing = await this.getServiceDefinition(expected.service_id);
      if (existing) {
        this.assertDesiredService(existing, expected);
        return Object.freeze({created: false, serviceDefinition: expected});
      }
      try {
        await rowOwnerFor(this).insertRow(expected, options);
      } catch (error) {
        const recovered = await this.findBindingServiceDefinition(
          expected, options,
        );
        if (!recovered) {
          const conflicting = await this.getServiceDefinition(
            expected.service_id,
          );
          if (conflicting) this.assertDesiredService(conflicting, expected);
          throw error;
        }
        return Object.freeze({created: false, serviceDefinition: expected});
      }
      const persisted = await this.findBindingServiceDefinition(
        expected, options,
      );
      if (!persisted) {
        throw new RequestBindingServiceDefinitionError(
          REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.DESIRED_SERVICE_CONFLICT,
          REQUEST_BINDING_SERVICE_DEFINITION_PATH.DESIRED_SERVICE,
          REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.DESIRED_SERVICE_CONFLICT,
        );
      }
      return Object.freeze({created: true, serviceDefinition: expected});
    });
  }
}

export {ServiceDefinitionsOwner};
