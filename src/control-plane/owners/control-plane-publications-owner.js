import {TABLES} from '../../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READ_RECOVERY_ROUTING,
} from '../control-plane-readiness-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane-workload-profile.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const CONTROL_PLANE_PUBLICATION_DELIVERY_PRIORITY = 'critical';
const CONTROL_PLANE_PUBLICATIONS_OWNER_NAME =
  'control-plane-publications-owner';

// Publication reads route on the recovery-eligible dimension. A read opts
// into the priority-recovery bootstrap lane only by declaring the typed lane
// value (never a boolean); every other read stays eligible-only.
function resolvePublicationReadRecoveryRouting(recoveryRouting) {
  if (
    recoveryRouting ===
      CONTROL_PLANE_READ_RECOVERY_ROUTING.PRIORITY_RECOVERY_BOOTSTRAP
  ) {
    return CONTROL_PLANE_READ_RECOVERY_ROUTING.PRIORITY_RECOVERY_BOOTSTRAP;
  }
  return CONTROL_PLANE_READ_RECOVERY_ROUTING.ELIGIBLE_ONLY;
}

class ControlPlanePublicationsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = CONTROL_PLANE_PUBLICATIONS_OWNER_NAME;
  static TABLE_NAME = TABLES.CONTROL_PLANE_PUBLICATIONS;

  buildPublicationMutationOptions(options = {}) {
    const workloadProfile = buildControlPlaneWorkloadProfile(
      CONTROL_PLANE_WORKLOAD_CLASS.PUBLICATION_MUTATION,
    );
    return {
      ...options,
      deliveryPriority: CONTROL_PLANE_PUBLICATION_DELIVERY_PRIORITY,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      workloadClass: workloadProfile.workloadClass,
      workClass: workloadProfile.workClass,
    };
  }

  buildPublicationReadOptions(options = {}) {
    return {
      ...options,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      recoveryRouting: resolvePublicationReadRecoveryRouting(
        options.recoveryRouting,
      ),
    };
  }

  async getPublication(publicationId, options = {}) {
    return this.readByPrimaryKey(
      publicationId,
      this.buildPublicationReadOptions(options),
    );
  }

  async getPublicationFromCache(publicationId, options = {}) {
    return this.readCachedByPrimaryKey(publicationId, options);
  }

  async listPublications(options = {}) {
    return this.listRows(this.buildPublicationReadOptions(options));
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
