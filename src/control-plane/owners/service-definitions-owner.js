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
  buildActivatedRequestBindingServiceDefinition,
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

  async activateBindingServiceDefinition(expected, options = {}) {
    return this.updateByPrimaryKey(
      expected[SD_COL.SERVICE_ID],
      {
        [SD_COL.STATUS]: expected[SD_COL.STATUS],
      },
      options,
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
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.some((candidate) =>
      requestBindingServiceDefinitionRowsMatch(existing, candidate))) {
      throw new RequestBindingServiceDefinitionError(
        REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.DESIRED_SERVICE_CONFLICT,
        REQUEST_BINDING_SERVICE_DEFINITION_PATH.DESIRED_SERVICE,
        REQUEST_BINDING_SERVICE_DEFINITION_MESSAGE.DESIRED_SERVICE_CONFLICT,
      );
    }
  }

  async readBindingServiceDefinition(expected, options = {}) {
    const result = await rowOwnerFor(this).readByBindingVersionId(
      expected[SD_COL.BINDING_VERSION_ID],
      options,
    );
    const rows = Array.isArray(result) ? result : result?.rows;
    if (!Array.isArray(rows) || rows.length > 1) {
      this.assertDesiredService(null, expected);
    }
    if (rows.length === 0) return null;
    return rows[0];
  }

  async insertBindingServiceDefinition(compiled, allowedStates, options) {
    try {
      await rowOwnerFor(this).insertRow(compiled, options);
    } catch (error) {
      const recovered = await this.readBindingServiceDefinition(
        compiled, options,
      );
      if (!recovered) {
        const conflicting = await this.getServiceDefinition(
          compiled.service_id,
        );
        if (conflicting) this.assertDesiredService(conflicting, compiled);
        throw error;
      }
      this.assertDesiredService(recovered, allowedStates);
      return {created: false, lineageRow: recovered};
    }
    const lineageRow = await this.readBindingServiceDefinition(
      compiled, options,
    );
    this.assertDesiredService(lineageRow, compiled);
    return {created: true, lineageRow};
  }

  async resolveBindingServiceDefinition(
    compiled,
    expected,
    allowedStates,
    options,
  ) {
    const lineageRow = await this.readBindingServiceDefinition(
      expected, options,
    );
    if (lineageRow) {
      this.assertDesiredService(lineageRow, allowedStates);
      return {created: false, lineageRow};
    }
    const existing = await this.getServiceDefinition(compiled.service_id);
    if (existing) {
      this.assertDesiredService(existing, allowedStates);
      return {created: false, lineageRow: existing};
    }
    return this.insertBindingServiceDefinition(
      compiled, allowedStates, options,
    );
  }

  async ensureBindingServiceDefinitionActive(lineageRow, expected, options) {
    if (requestBindingServiceDefinitionRowsMatch(lineageRow, expected)) return;
    try {
      await rowOwnerFor(this).activateBindingServiceDefinition(
        expected, options,
      );
    } catch (error) {
      const recovered = await this.readBindingServiceDefinition(
        expected, options,
      );
      if (!requestBindingServiceDefinitionRowsMatch(recovered, expected)) {
        throw error;
      }
    }
  }

  async reconcileRequestBinding(bindingRow, options = {}) {
    const binding = projectBinding(bindingRow);
    const artifact = await this.catalogOwner.getBindableArtifactForTenant(
      binding.declaration.target.package_id,
      binding.declaration.target.manifest_digest,
      binding.tenantId,
    );
    const compiled = buildRequestBindingServiceDefinition(
      bindingRow, artifact,
    );
    const expected = buildActivatedRequestBindingServiceDefinition(
      compiled, binding,
    );
    const allowedStates = [compiled, expected];
    return this.runSerialized(binding.bindingVersionId, async () => {
      const {created, lineageRow} =
        await this.resolveBindingServiceDefinition(
          compiled,
          expected,
          allowedStates,
          options,
        );
      await this.ensureBindingServiceDefinitionActive(
        lineageRow,
        expected,
        options,
      );
      const persisted = await this.readBindingServiceDefinition(
        expected, options,
      );
      this.assertDesiredService(persisted, expected);
      return Object.freeze({created, serviceDefinition: persisted});
    });
  }
}

export {ServiceDefinitionsOwner};
