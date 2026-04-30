import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const LOCAL_STR_SERVICES_OWNER = 'services-owner';

class ServicesOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_SERVICES_OWNER;
  static TABLE_NAME = TABLES.SERVICES;

  async getService(serviceId, options = {}) {
    return this.readByPrimaryKey(serviceId, options);
  }

  async getServiceFromCache(serviceId, options = {}) {
    return this.readCachedByPrimaryKey(serviceId, options);
  }

  async listServices(options = {}) {
    return this.listRows(options);
  }

  async listServicesFromCache(options = {}) {
    return this.listCachedRows(options);
  }

  async listServicesForNodeFromCache(nodeId, options = {}) {
    return this.filterCachedRows((row) => {
      return row?.node_id === nodeId;
    }, options);
  }

  async insertService(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertService(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updateService(serviceId, data, options = {}) {
    return this.updateByPrimaryKey(serviceId, data, options);
  }

  async removeService(serviceId, options = {}) {
    return this.deleteByPrimaryKey(serviceId, options);
  }
}

export {ServicesOwner};
