import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const LOCAL_STR_1VEZJ = 'service-definitions-owner';

class ServiceDefinitionsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_1VEZJ;
  static TABLE_NAME = TABLES.SERVICE_DEFINITIONS;

  async getServiceDefinition(serviceDefinitionId, options = {}) {
    return this.readByPrimaryKey(serviceDefinitionId, options);
  }

  async listServiceDefinitions(options = {}) {
    return this.listRows(options);
  }

  async insertServiceDefinition(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertServiceDefinition(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updateServiceDefinition(serviceDefinitionId, data, options = {}) {
    return this.updateByPrimaryKey(serviceDefinitionId, data, options);
  }

  async removeServiceDefinition(serviceDefinitionId, options = {}) {
    return this.deleteByPrimaryKey(serviceDefinitionId, options);
  }
}

export {ServiceDefinitionsOwner};
