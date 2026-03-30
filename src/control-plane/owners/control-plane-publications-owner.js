import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

class ControlPlanePublicationsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = 'control-plane-publications-owner';
  static TABLE_NAME = TABLES.CONTROL_PLANE_PUBLICATIONS;

  async getPublication(publicationId, options = {}) {
    return this.readByPrimaryKey(publicationId, options);
  }

  async getPublicationFromCache(publicationId, options = {}) {
    return this.readCachedByPrimaryKey(publicationId, options);
  }

  async listPublications(options = {}) {
    return this.listRows(options);
  }

  async listPublicationsFromCache(options = {}) {
    return this.listCachedRows(options);
  }

  async insertPublication(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertPublication(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updatePublication(publicationId, data, options = {}) {
    return this.updateByPrimaryKey(publicationId, data, options);
  }

  async removePublication(publicationId, options = {}) {
    return this.deleteByPrimaryKey(publicationId, options);
  }
}

export {ControlPlanePublicationsOwner};