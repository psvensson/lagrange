import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

class EndpointMetadataOwnerBase extends SystemMetadataOwnerBase {
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

export {EndpointMetadataOwnerBase};
