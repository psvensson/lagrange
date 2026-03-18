import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

class ServiceEndpointsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = 'service-endpoints-owner';
  static TABLE_NAME = TABLES.SERVICE_ENDPOINTS;

  async getEndpoint(endpointId, options = {}) {
    return this.readByPrimaryKey(endpointId, options);
  }

  async listEndpoints(options = {}) {
    return this.listRows(options);
  }

  async insertEndpoint(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertEndpoint(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updateEndpoint(endpointId, data, options = {}) {
    return this.updateByPrimaryKey(endpointId, data, options);
  }

  async removeEndpoint(endpointId, options = {}) {
    return this.deleteByPrimaryKey(endpointId, options);
  }
}

export {ServiceEndpointsOwner};
