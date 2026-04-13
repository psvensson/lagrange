import {TABLES} from '../../constants/index.js';
import {PRESSURE_WORK_CLASS} from '../pressure-governor.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

class ControlPlanePublicationsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = 'control-plane-publications-owner';
  static TABLE_NAME = TABLES.CONTROL_PLANE_PUBLICATIONS;

  buildPublicationMutationOptions(options = {}) {
    return {
      ...options,
      allowPressureDefer: false,
      deliveryPriority: 'critical',
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
    };
  }

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
    return this.insertRow(
      row,
      this.buildPublicationMutationOptions(options),
    );
  }

  async upsertPublication(row, options = {}) {
    return this.upsertRow(
      row,
      this.buildPublicationMutationOptions(options),
    );
  }

  async updatePublication(publicationId, data, options = {}) {
    return this.updateByPrimaryKey(
      publicationId,
      data,
      this.buildPublicationMutationOptions(options),
    );
  }

  async removePublication(publicationId, options = {}) {
    return this.deleteByPrimaryKey(
      publicationId,
      this.buildPublicationMutationOptions(options),
    );
  }
}

export {ControlPlanePublicationsOwner};
