// Original publication is a bootstrap interaction: row owners construct the
// birth, preparation consumes its durable right, and the shared read gateway
// proves the exact committed value. There is no cache or response-only grant.
import {ORIGINAL_ALLOCATION_COLUMN as RIGHT, ORIGINAL_ALLOCATION_REASON as REASON,
  originalAllocationError} from '../raft/raft-rs-original-allocation-constants.js';
import {SYSTEM_TABLE_NAME} from './system-table-schemas-constants.js';
import {COLUMN} from '../constants/columns.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows} from
  '../control-plane/control-plane-system-table-gateway.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from
  '../cdc/cdc-integration-service-shared-constants.js';
import {CLUSTER_ID_CONFIG_KEY} from './cluster-identity-constants.js';
import {
  FORMATION_PUBLICATION_ID,
  buildFormationDeclareBody,
  decodeFormationRecord,
  requestFormationDeclare,
} from '../control-plane/membership-publication-formation-record.js';

const ORIGINAL_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  localReadConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
});
const ORIGINAL_ROW_READ = Object.freeze({
  [SYSTEM_TABLE_NAME.SERVICES]: 'SELECT * FROM services WHERE service_id = ?',
  [SYSTEM_TABLE_NAME.CONFIG]: 'SELECT * FROM config WHERE config_key = ?',
  [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]:
    'SELECT * FROM control_plane_publications WHERE publication_id = ?',
});
const ORIGINAL_FORMATION_DECLARE_ENTRY_PREFIX = 'original-formation-declare:';

async function observeOriginalRow(writer, tableName, key, expected) {
  const read = await readAuthoritativeControlPlaneRows(writer, tableName,
    ORIGINAL_ROW_READ[tableName], [key], {readAuthority: ORIGINAL_READ_AUTHORITY});
  if (read?.success !== true || read.rows?.length !== 1) return false;
  const row = read.rows[0];
  return Object.entries(expected).every(([field, value]) => row[field] === value);
}

function originalSeedServiceRegistration(preparation, replicaId, writer) {
  const birth = preparation.serviceBirth(replicaId);
  return Object.freeze({birth,
    publish(row, submit) {
      return preparation.publishOriginalRight({replicaId, right: RIGHT.SERVICE_RIGHT,
        value: row, submit, observe: (value) =>
          observeOriginalRow(writer, SYSTEM_TABLE_NAME.SERVICES, replicaId, value)});
    }});
}

function publishOriginalSeedClusterIdentity(preparation, writer, row) {
  const identity = preparation.clusterIdentity();
  if (row[COLUMN.CONFIG_KEY] !== CLUSTER_ID_CONFIG_KEY ||
      row[COLUMN.CONFIG_VALUE] !== identity.clusterId ||
      row[COLUMN.CREATED_AT] !== identity.timestamp) {
    throw originalAllocationError(REASON.IDENTITY, identity.replicaId);
  }
  return preparation.publishOriginalRight({replicaId: identity.replicaId,
    right: RIGHT.IDENTITY_RIGHT, value: row,
    submit: (value) => writer.insertSystemTableRow(SYSTEM_TABLE_NAME.CONFIG, value),
    observe: (value) => observeOriginalRow(writer, SYSTEM_TABLE_NAME.CONFIG,
      CLUSTER_ID_CONFIG_KEY, value)});
}

async function observeOriginalFormationRow(writer, expected) {
  const read = await readAuthoritativeControlPlaneRows(
    writer,
    SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    ORIGINAL_ROW_READ[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
    [FORMATION_PUBLICATION_ID],
    {readAuthority: ORIGINAL_READ_AUTHORITY},
  );
  if (read?.success !== true || read.rows?.length !== 1) return false;
  const decoded = decodeFormationRecord(read.rows[0], {
    clusterId: expected.clusterId,
  });
  return (
    decoded.clusterId === expected.clusterId &&
    decoded.declaredHostCount === expected.declaredHostCount &&
    decoded.declaredByNodeId === expected.declaredByNodeId &&
    decoded.declaredAt === expected.declaredAt
  );
}

function publishOriginalSeedFormationDeclaration(
  preparation,
  writer,
  publicationsPartitionService,
  declarationInput,
) {
  const formation = preparation.formationDeclaration();
  const declareBody = buildFormationDeclareBody(declarationInput);
  if (
    declareBody === null ||
    declareBody.clusterId !== formation.clusterId ||
    declareBody.declaredHostCount !== formation.declaredHostCount ||
    declareBody.declaredByNodeId !== formation.declaredByNodeId ||
    declareBody.declaredAt !== formation.timestamp
  ) {
    throw originalAllocationError(REASON.IDENTITY, formation.replicaId);
  }
  return preparation.publishOriginalRight({
    replicaId: formation.replicaId,
    right: RIGHT.FORMATION_RIGHT,
    value: declareBody,
    submit: (value) => {
      if (!publicationsPartitionService) {
        throw originalAllocationError(REASON.AUTHORITY, formation.replicaId);
      }
      return requestFormationDeclare(publicationsPartitionService, {
        entryId: `${ORIGINAL_FORMATION_DECLARE_ENTRY_PREFIX}${value.clusterId}`,
        body: value,
      });
    },
    observe: (value) => observeOriginalFormationRow(writer, value),
  });
}

export {
  originalSeedServiceRegistration,
  publishOriginalSeedClusterIdentity,
  publishOriginalSeedFormationDeclaration,
};
