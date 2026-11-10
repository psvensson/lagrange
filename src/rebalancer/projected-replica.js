/**
 * The one record type of a replica the rebalancer plans over (quest
 * system-table-row-decoders, lead ruling 2). A projected replica is built
 * from a DECODED services row (services-row-decoder.js) or from a planned
 * change the operation ledger has already proven (the target of a terminal
 * successful create), never by reading a stored row's columns: nothing
 * decodes a projected replica as a services row, and no consumer reads a
 * stored spelling from it. It carries exactly the fields its consumers read
 * (the move planner, the replica inventory, the priority placement census,
 * the leader placement cure and the publication overflow check), in one
 * spelling, frozen.
 *
 * Values are the stored values, as stored (case included; a value outside
 * its column's decoding, ROW_UNRECOGNISED, reads as its raw value), SQL NULL
 * as ROW_ABSENT. A column a partial row never observed (ROW_NOT_OBSERVED: a
 * seed projection's or the cache's observed-columns projection's outside
 * column) reads as declared in PROJECTED_REPLICA_NOT_OBSERVED_READING:
 * ROW_ABSENT for every field. Before the decoders every consumer read the
 * raw row, whose missing key it read like NULL; each consumer that read the
 * stored value differently from as stored (lower-cased, `status || ACTIVE`,
 * node truthiness) declares that reading itself (readPlacementStatus,
 * readLowerCaseReplicaText, hasReplicaNode; the consumer census in the quest
 * notes).
 * `replicaId` is the replica's identity: the stored replica_id when the row
 * carries a non-empty one, else its service_id (HEAD's `replica_id ||
 * service_id`: NULL, '' and never observed alike; the one owner of that derivation; a
 * partition row stores the same value in both or none, a runtime-service
 * row a replica_id distinct from its service_id). A terminal create target
 * without a stored row yet carries ROW_ABSENT in every field the ledger does
 * not state (address, groupId and the lifecycle forensics).
 */
import {SERVICE_TYPE} from '../constants/service.js';
import {
  decodeServicesRow,
  defineServicesNotObservedReading,
} from '../control-plane/services-row-decoder.js';
import {
  FULL_ROW_PROJECTION_NAME,
  ROW_ABSENT,
  readDecodedRow,
} from '../control-plane/system-table-row-decoding.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {ReplicaStatus} from './replica-status.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const PROJECTED_REPLICA_FIELD = Object.freeze({
  REPLICA_ID: 'replicaId',
  SERVICE_ID: 'serviceId',
  SERVICE_TYPE: 'serviceType',
  PARTITION_ID: 'partitionId',
  GROUP_ID: 'groupId',
  NODE_ID: 'nodeId',
  STATUS: 'status',
  RAFT_ROLE: 'raftRole',
  ADDRESS: 'address',
  CREATED_AT: 'createdAt',
  STATE_ENTERED_AT: 'stateEnteredAt',
  CREATE_ATTEMPT_TOKEN: 'createAttemptToken',
  PREVIOUS_STATE: 'previousState',
  CLEANUP_TOKEN: 'cleanupToken',
});

const PROJECTED_REPLICA_FIELDS = Object.freeze(Object.values(PROJECTED_REPLICA_FIELD));

// The builder's reading of a column the services row never observed: every
// projected field (replicaId included: it then derives from serviceId, as
// HEAD's `replica_id || service_id` did) reads ROW_ABSENT.
const PROJECTED_REPLICA_NOT_OBSERVED_READING = defineServicesNotObservedReading(
  'projectReplicaFromServicesRow',
  Object.fromEntries(PROJECTED_REPLICA_FIELDS.map((field) => [field, ROW_ABSENT])),
);

// What a terminal successful ADD or REPLACE proves about its target: the
// replica reached voter readiness as a follower.
const TERMINAL_CREATE_TARGET_REPLICA_STATE = Object.freeze({
  [PROJECTED_REPLICA_FIELD.STATUS]: ReplicaStatus.ACTIVE,
  [PROJECTED_REPLICA_FIELD.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
});

const PROJECTED_REPLICA_ERROR_CODE = 'PROJECTED_REPLICA_REFUSED';
const PROJECTED_REPLICA_ERROR_NAME = 'ProjectedReplicaError';

const PROJECTED_REPLICA_REFUSAL = Object.freeze({
  // The source is not the full decoded services row the decoder returns.
  NOT_A_DECODED_SERVICES_ROW: 'not_a_decoded_services_row',
  // A planned change names an empty identity, partition or node.
  PLANNED_CHANGE_INCOMPLETE: 'planned_change_incomplete',
  // A value handed to a consumer is not a projected replica.
  NOT_A_PROJECTED_REPLICA: 'not_a_projected_replica',
});

/**
 * A typed refusal to build or accept a projected replica.
 */
class ProjectedReplicaError extends Error {
  /**
   * @param {string} reason a PROJECTED_REPLICA_REFUSAL value
   * @param {string|undefined} field the offending field, when one
   */
  constructor(reason, field) {
    super(`projected replica refused: ${reason}` +
      `${field === undefined ? '' : ` at ${field}`}`);
    this.name = PROJECTED_REPLICA_ERROR_NAME;
    this.code = PROJECTED_REPLICA_ERROR_CODE;
    this.reason = reason;
    this.field = field;
  }
}

function isRecord(value) {
  return typeof value === LOCAL_STR_OBJECT && value !== null && !Array.isArray(value);
}

// Whether the row names a replica id of its own: HEAD derived the identity
// as `replica_id || service_id`, so a stored '' reads like NULL.
function hasStoredReplicaId(fields) {
  return typeof fields.replicaId === LOCAL_STR_STRING && fields.replicaId.length > 0;
}

/**
 * Build the projected replica of one stored services row.
 * @param {Object} decodedRow the FULL decoded services row
 *   (decodeServicesRow with the full-row projection)
 * @return {Object} the frozen projected replica
 * @throws {ProjectedReplicaError} when the source is not a full decoded row
 */
function projectReplicaFromServicesRow(decodedRow) {
  if (!isRecord(decodedRow) || decodedRow.projection !== FULL_ROW_PROJECTION_NAME) {
    throw new ProjectedReplicaError(
      PROJECTED_REPLICA_REFUSAL.NOT_A_DECODED_SERVICES_ROW);
  }
  const fields = readDecodedRow(PROJECTED_REPLICA_NOT_OBSERVED_READING, decodedRow);
  return Object.freeze({
    ...fields,
    [PROJECTED_REPLICA_FIELD.REPLICA_ID]:
      hasStoredReplicaId(fields) ? fields.replicaId : fields.serviceId,
  });
}

/**
 * Decode stored services rows and project each.
 * @param {Array<Object>} rows full stored services rows (SELECT * or cache)
 * @return {Array<Object>} the frozen projected replicas
 */
function projectReplicasFromServicesRows(rows) {
  return rows.map((row) => projectReplicaFromServicesRow(decodeServicesRow(row)));
}

function requireIdentity(value, field) {
  if (typeof value !== LOCAL_STR_STRING || value.length === 0) {
    throw new ProjectedReplicaError(
      PROJECTED_REPLICA_REFUSAL.PLANNED_CHANGE_INCOMPLETE, field);
  }
  return value;
}

/**
 * The projected replica of a terminal successful create's target that has
 * no stored services row yet: a partition replica the ledger proves ACTIVE
 * as a FOLLOWER on its target node.
 * @param {Object} target `{replicaId, partitionId, nodeId}`
 * @return {Object} the frozen projected replica
 * @throws {ProjectedReplicaError} when an identity is missing
 */
function buildTerminalCreateTargetReplica({replicaId, partitionId, nodeId}) {
  const identity = requireIdentity(replicaId, PROJECTED_REPLICA_FIELD.REPLICA_ID);
  return Object.freeze({
    [PROJECTED_REPLICA_FIELD.REPLICA_ID]: identity,
    [PROJECTED_REPLICA_FIELD.SERVICE_ID]: identity,
    [PROJECTED_REPLICA_FIELD.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [PROJECTED_REPLICA_FIELD.PARTITION_ID]:
      requireIdentity(partitionId, PROJECTED_REPLICA_FIELD.PARTITION_ID),
    [PROJECTED_REPLICA_FIELD.GROUP_ID]: ROW_ABSENT,
    [PROJECTED_REPLICA_FIELD.NODE_ID]:
      requireIdentity(nodeId, PROJECTED_REPLICA_FIELD.NODE_ID),
    ...TERMINAL_CREATE_TARGET_REPLICA_STATE,
    [PROJECTED_REPLICA_FIELD.ADDRESS]: ROW_ABSENT,
    [PROJECTED_REPLICA_FIELD.CREATED_AT]: ROW_ABSENT,
    [PROJECTED_REPLICA_FIELD.STATE_ENTERED_AT]: ROW_ABSENT,
    [PROJECTED_REPLICA_FIELD.CREATE_ATTEMPT_TOKEN]: ROW_ABSENT,
    [PROJECTED_REPLICA_FIELD.PREVIOUS_STATE]: ROW_ABSENT,
    [PROJECTED_REPLICA_FIELD.CLEANUP_TOKEN]: ROW_ABSENT,
  });
}

/**
 * The placement readers' status of a projected replica (the move planner's
 * active placement and failed-replica cure, the budget planner's healthy
 * and ready-occupied sets, the control-plane trim overflow): before the
 * decoders each read the raw row's `status || ACTIVE`, so a row whose
 * status is absent (never observed or a stored NULL) or '' reads ACTIVE;
 * any other status as stored.
 * @param {Object} replica a projected replica
 * @return {*} the status
 */
function readPlacementStatus(replica) {
  const {status} = replica;
  return status === ROW_ABSENT || status === '' ? ReplicaStatus.ACTIVE : status;
}

/**
 * A projected replica's text value as the readers that lower-cased the
 * stored row read it (normalizeServiceRow's readLowerText,
 * `String(value || '').toLowerCase()`): absent reads '', any other value
 * its lower-cased text.
 * @param {*} value a projected replica's field value
 * @return {string} the lower-cased text
 */
function readLowerCaseReplicaText(value) {
  return value === ROW_ABSENT ? '' : stringToLowerCase(String(value));
}

/**
 * Whether a projected replica names its node: before the decoders the
 * placement readers skipped a raw row without node_id (`replica.node_id`
 * truthiness); a row that never observed its node reads ROW_ABSENT here.
 * @param {Object} replica a projected replica
 * @return {boolean} whether the replica has a node
 */
function hasReplicaNode(replica) {
  return typeof replica.nodeId === LOCAL_STR_STRING && replica.nodeId.length > 0;
}

/**
 * Refuse a value that is not a projected replica.
 * @param {*} value the value a consumer received
 * @return {Object} the same projected replica
 * @throws {ProjectedReplicaError} naming the first missing field
 */
function assertProjectedReplica(value) {
  if (!isRecord(value)) {
    throw new ProjectedReplicaError(PROJECTED_REPLICA_REFUSAL.NOT_A_PROJECTED_REPLICA);
  }
  for (const field of PROJECTED_REPLICA_FIELDS) {
    if (!Object.hasOwn(value, field)) {
      throw new ProjectedReplicaError(
        PROJECTED_REPLICA_REFUSAL.NOT_A_PROJECTED_REPLICA, field);
    }
  }
  return value;
}

/**
 * The projected replica of a stored row whose terminal successful create
 * the ledger has proven: the same replica, ACTIVE as a FOLLOWER.
 * @param {Object} replica the projected replica of the stored row
 * @return {Object} the frozen projected replica with the planned change
 */
function projectReplicaAsTerminalCreateTarget(replica) {
  return Object.freeze({
    ...assertProjectedReplica(replica),
    ...TERMINAL_CREATE_TARGET_REPLICA_STATE,
  });
}

export {
  PROJECTED_REPLICA_ERROR_CODE,
  PROJECTED_REPLICA_FIELD,
  PROJECTED_REPLICA_FIELDS,
  PROJECTED_REPLICA_REFUSAL,
  ProjectedReplicaError,
  TERMINAL_CREATE_TARGET_REPLICA_STATE,
  assertProjectedReplica,
  buildTerminalCreateTargetReplica,
  hasReplicaNode,
  projectReplicaAsTerminalCreateTarget,
  projectReplicaFromServicesRow,
  projectReplicasFromServicesRows,
  readLowerCaseReplicaText,
  readPlacementStatus,
};
