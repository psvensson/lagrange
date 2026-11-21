import {CONTROL_PLANE_PUBLICATIONS_SCHEMA} from
  '../../bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../constants/index.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane-system-table-gateway.js';
import {FORMATION_PUBLICATION_ID, FORMATION_PUBLICATION_KIND} from
  '../membership-publication-formation-record.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane-readiness-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane-workload-profile.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const CONTROL_PLANE_PUBLICATION_DELIVERY_PRIORITY = 'critical';
const CONTROL_PLANE_PUBLICATIONS_OWNER_NAME =
  'control-plane-publications-owner';

const PUBLICATION_AUTHORITY_UNAVAILABLE = 'PUBLICATION_AUTHORITY_UNAVAILABLE';
const INVALID_PUBLICATION_MUTATION = 'INVALID_PUBLICATION_MUTATION';
const INVALID_PUBLICATION_MUTATION_MESSAGE =
  'Expected an ordinary publication and its exact preimage';
const PUBLICATION_COLUMNS = CONTROL_PLANE_PUBLICATIONS_SCHEMA.columns.map(({name}) => name);
const UPDATE = 'update';

function publicationAuthorityUnavailable(publicationId) {
  return Object.assign(new Error(`Publication authority unavailable for ${publicationId}`), {
    code: PUBLICATION_AUTHORITY_UNAVAILABLE, deferRetry: true,
  });
}

function assertPublicationMutationRow(row, preimage) {
  if (typeof row?.publication_id !== 'string' || row.publication_id.length === 0 ||
      row.publication_id === FORMATION_PUBLICATION_ID ||
      row.publication_kind === FORMATION_PUBLICATION_KIND ||
      (preimage !== null && preimage?.publication_id !== row.publication_id)) {
    throw Object.assign(new Error(INVALID_PUBLICATION_MUTATION_MESSAGE), {
      code: INVALID_PUBLICATION_MUTATION,
    });
  }
}

function isStoredPublicationValue(value) {
  return value === null || typeof value === 'string' ||
    typeof value === 'bigint' || Number.isSafeInteger(value);
}

function publicationWritePredicate(row) {
  if (PUBLICATION_COLUMNS.some((column) =>
    !Object.hasOwn(row, column) || !isStoredPublicationValue(row[column]))) {
    throw publicationAuthorityUnavailable(row.publication_id);
  }
  return Object.fromEntries(PUBLICATION_COLUMNS.map((column) => [column, row[column]]));
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
    };
  }

  async getPublication(publicationId, options = {}) {
    const observed = await this.readByPrimaryKeyObservation(publicationId,
      this.buildPublicationReadOptions({
        ...options, leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      }));
    if (observed?.success !== true || observed.rowSetComplete !== true ||
        !Array.isArray(observed.rows) || observed.rows.length > 1 ||
        (observed.rows.length === 1 && observed.rows[0]?.publication_id !== publicationId)) {
      throw publicationAuthorityUnavailable(publicationId);
    }
    return observed.rows[0] ?? null;
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
    assertPublicationMutationRow(row, null);
    return this.insertRow(
      row,
      this.buildPublicationMutationOptions(options),
    );
  }

  async upsertPublication(row, options = {}) {
    const {expectedPublicationRow, ...writeOptions} = options;
    assertPublicationMutationRow(row, expectedPublicationRow);
    const mutationOptions = this.buildPublicationMutationOptions(writeOptions);
    if (expectedPublicationRow === null) {
      return this.insertRow(row, mutationOptions);
    }
    const whereClause = publicationWritePredicate(expectedPublicationRow);
    return this.executeMutation(UPDATE, {whereClause, data: row}, mutationOptions,
      (attemptOptions) => this.requireGateway().updateSystemTableRow(
        this.getTableName(), whereClause, row, attemptOptions));
  }

  async updatePublication(publicationId, data, options = {}) {
    assertPublicationMutationRow({...data, publication_id: publicationId}, null);
    return this.updateByPrimaryKey(
      publicationId,
      data,
      this.buildPublicationMutationOptions(options),
    );
  }
}

export {ControlPlanePublicationsOwner};
