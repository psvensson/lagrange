/**
 * Canonical partition quorum and management cluster snapshot authority.
 *
 * Contract for `hasPartitionQuorum === true`:
 * 1. Explicit canonical authority port is wired (`AuthoritativeControlPlaneView`
 *    reading complete `SELECT *` inventories through `local_partition_replica`
 *    or `owner_rpc_lane` with `leaderMode: REQUIRED`). Missing ports or
 *    `SystemTableCache` projections remain unavailable (`null` snapshot) and
 *    never grant management permission.
 * 2. Complete, leader-witnessed system-table inventories are returned for
 *    `nodes`, `partitions`, and `services` (`success === true`,
 *    `rowSetComplete === true`, `partial !== true`, non-cache owner source, and
 *    a valid leader `readAuthorityWitness` for each table's owner partition).
 * 3. `nodes` and `partitions` inventories are non-empty, carry unique own
 *    primary identities (`Object.create(null)` + `Object.hasOwn`), zero
 *    duplicate `(service_id)`, `(partition_id, replica_id)`, or active
 *    `(partition_id, node_id)` rows exist, and every partition declares a
 *    positive integer replication factor via `resolveDesiredReplicationFactor`.
 * 4. Every partition has a majority (`floor(RF / 2) + 1`) of distinct `ACTIVE`
 *    voter replicas (`status === 'active'`, `isVoterRaftRole(raft_role)`)
 *    hosted on `ACTIVE` and `READY`/live nodes (`resolveReadyNodeIdsFromRows`).
 *    Learners (`raft_role === 'learner'`) and non-`ACTIVE` or unready-node rows
 *    never count toward voter quorum.
 * 5. Every partition carries explicit, non-contradictory leader and local
 *    consensus evidence: `partitions.leader_node_id` names an `ACTIVE`,
 *    `READY`/live voter host in load-routable Raft role (`'leader'` or
 *    `'follower'`, never `'candidate'` or `'learner'`), local node identity is
 *    established, and every locally hosted replica in `partitionServices` or
 *    `replicaHandler.localServices` is backed by a single live `PartitionService`
 *    (`initialized === true`, `isShutdown !== true`) whose canonical
 *    `getStatus()` record carries own `partitionId === partitionId`,
 *    `initialized === true`, integer `term > 0`, and canonical `role`
 *    (`'leader'` or `'follower'` when counted as a healthy voter; `'leader'`
 *    with `isLeader === true` and matching `leaderId` if present when
 *    `leader_node_id === localNodeId`), with zero dual-source fallbacks or
 *    phantom status fields.
 */

import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../constants/index.js';
import {
  resolveLocalPartitionServicesForPartition,
} from '../../cdc/cdc-integration-service-local-system-table-routing.js';
import {
  isValidLeaderReadAuthorityWitness,
} from '../../control-plane/control-plane-authoritative-read-witness.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {
  isCatchupLearnerRaftRole,
  isLoadRoutableRaftRole,
  isVoterRaftRole,
} from '../../raft/replica-voter-readiness.js';
import {
  STATE_ABSENT,
  readLowerStateField,
} from '../../utils/state-field-read.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../replication-target-authority.js';
import {INITIAL_PARTITION_IDS} from '../system-table-schemas-constants.js';

const objectAssign = Object.assign;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;

const DESCRIPTOR_VALUE_FIELD = 'value';
const UNAVAILABLE_MANAGEMENT_SNAPSHOT = null;
const LOCAL_STATUS_UNAVAILABLE = objectFreeze({unavailable: true});
const AUTHORITATIVE_READ_REJECTED = objectFreeze({
  success: false,
  rowSetComplete: false,
});
const AUTHORITATIVE_QUORUM_READ_SOURCES = objectFreeze([
  'local_partition_replica',
  'owner_rpc_lane',
]);
const READ_RESULT_FIELD = objectFreeze({
  PARTIAL: 'partial',
  ROWS: 'rows',
  ROW_SET_COMPLETE: 'rowSetComplete',
  SOURCE: 'source',
  SUCCESS: 'success',
  WITNESS: 'readAuthorityWitness',
});
const SERVICE_FIELD = objectFreeze({
  GET_STATUS: 'getStatus',
  INITIALIZED: 'initialized',
  IS_SHUTDOWN: 'isShutdown',
  LOCAL_SERVICES: 'localServices',
  REPLICA_ID: 'replicaId',
});
const STATUS_FIELD = objectFreeze({
  INITIALIZED: 'initialized',
  IS_LEADER: 'isLeader',
  LEADER_ID: 'leaderId',
  NODE_ID: 'nodeId',
  PARTITION_ID: 'partitionId',
  REPLICA_ID: 'replicaId',
  ROLE: 'role',
  TERM: 'term',
});
const ROW_CLASSIFICATION = objectFreeze({
  CORRUPT: 'corrupt',
  IGNORE: 'ignore',
  PARTITION: 'partition',
});
const SYSTEM_TABLE_COMPLETE_SELECT = objectFreeze(
  objectAssign(objectCreate(null), {
    [TABLES.NODES]: `SELECT * FROM ${TABLES.NODES}`,
    [TABLES.PARTITIONS]: `SELECT * FROM ${TABLES.PARTITIONS}`,
    [TABLES.SERVICES]: `SELECT * FROM ${TABLES.SERVICES}`,
  }),
);
const OWNER_PARTITION_BY_TABLE = objectFreeze(
  objectAssign(objectCreate(null), {
    [TABLES.NODES]: INITIAL_PARTITION_IDS[TABLES.NODES],
    [TABLES.PARTITIONS]: INITIAL_PARTITION_IDS[TABLES.PARTITIONS],
    [TABLES.SERVICES]: INITIAL_PARTITION_IDS[TABLES.SERVICES],
  }),
);

function createNullDictionary() {
  return objectCreate(null);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isCallable(value) {
  return typeof value === 'function';
}

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainStatusRecord(value) {
  if (!isObjectRecord(value)) {
    return false;
  }
  const proto = objectGetPrototypeOf(value);
  return proto === objectPrototype || proto === null;
}

function readOwnDataField(record, key) {
  if (!isObjectRecord(record) || !objectHasOwn(record, key)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  return descriptor && objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD) ?
    descriptor.value :
    undefined;
}

function getOrCreateNullBucket(dictionary, key) {
  if (!objectHasOwn(dictionary, key)) dictionary[key] = createNullDictionary();
  return dictionary[key];
}

function getNullBucketOrNull(dictionary, key) {
  return dictionary && objectHasOwn(dictionary, key) ? dictionary[key] : null;
}

function countDictionaryKeys(dictionary) {
  return dictionary ? objectKeys(dictionary).length : 0;
}

function hasDictionaryKey(dictionary, key) {
  return Boolean(dictionary) && isNonEmptyString(key) && objectHasOwn(dictionary, key);
}

function isCompleteAuthoritativeTableRead(readResult, tableName) {
  if (!isObjectRecord(readResult) || !objectHasOwn(OWNER_PARTITION_BY_TABLE, tableName)) {
    return false;
  }
  const success = readOwnDataField(readResult, READ_RESULT_FIELD.SUCCESS);
  const complete = readOwnDataField(readResult, READ_RESULT_FIELD.ROW_SET_COMPLETE);
  const partial = readOwnDataField(readResult, READ_RESULT_FIELD.PARTIAL);
  const rows = readOwnDataField(readResult, READ_RESULT_FIELD.ROWS);
  const source = readOwnDataField(readResult, READ_RESULT_FIELD.SOURCE);
  const witness = readOwnDataField(readResult, READ_RESULT_FIELD.WITNESS);
  if (
    success !== true ||
    complete !== true ||
    partial === true ||
    !Array.isArray(rows) ||
    !AUTHORITATIVE_QUORUM_READ_SOURCES.includes(source)
  ) {
    return false;
  }
  const ownerPartitionId = OWNER_PARTITION_BY_TABLE[tableName];
  return isNonEmptyString(ownerPartitionId) &&
    isValidLeaderReadAuthorityWitness(witness, ownerPartitionId);
}

async function readCompleteSystemTable(authoritativeView, tableName) {
  if (!objectHasOwn(SYSTEM_TABLE_COMPLETE_SELECT, tableName)) {
    return AUTHORITATIVE_READ_REJECTED;
  }
  try {
    return await authoritativeView.readReadinessOwnerRows(
      tableName,
      SYSTEM_TABLE_COMPLETE_SELECT[tableName],
      [],
    );
  } catch {
    return AUTHORITATIVE_READ_REJECTED;
  }
}

async function readAuthoritativeInventory(authoritativeView) {
  if (
    !isObjectRecord(authoritativeView) ||
    authoritativeView.canRead?.() === false ||
    !isCallable(authoritativeView.readReadinessOwnerRows)
  ) {
    return null;
  }
  const [nodesRead, partitionsRead, servicesRead] = await Promise.all([
    readCompleteSystemTable(authoritativeView, TABLES.NODES),
    readCompleteSystemTable(authoritativeView, TABLES.PARTITIONS),
    readCompleteSystemTable(authoritativeView, TABLES.SERVICES),
  ]);
  if (
    !isCompleteAuthoritativeTableRead(nodesRead, TABLES.NODES) ||
    !isCompleteAuthoritativeTableRead(partitionsRead, TABLES.PARTITIONS) ||
    !isCompleteAuthoritativeTableRead(servicesRead, TABLES.SERVICES)
  ) {
    return null;
  }
  return {
    nodeRows: readOwnDataField(nodesRead, READ_RESULT_FIELD.ROWS),
    partitionRows: readOwnDataField(partitionsRead, READ_RESULT_FIELD.ROWS),
    serviceRows: readOwnDataField(servicesRead, READ_RESULT_FIELD.ROWS),
  };
}

function collectNodeMembership(nodeRows) {
  const nodeIds = [];
  const seenNodeMap = createNullDictionary();
  const activeNodeMap = createNullDictionary();
  let corrupt = false;

  for (const row of nodeRows) {
    const nodeId = readOwnDataField(row, COLUMN.NODE_ID);
    if (!isNonEmptyString(nodeId) || objectHasOwn(seenNodeMap, nodeId)) {
      corrupt = true;
      continue;
    }
    seenNodeMap[nodeId] = true;
    nodeIds.push(nodeId);
    const status = readLowerStateField(readOwnDataField(row, COLUMN.STATUS));
    if (status === STATE_ABSENT) {
      corrupt = true;
      continue;
    }
    if (status === SERVICE_STATUS.ACTIVE) {
      activeNodeMap[nodeId] = true;
    }
  }

  return {nodeIds, activeNodeMap, corrupt};
}

function resolveAuthoritativeReadyNodes(owner, membership, inventory) {
  const resolved = owner?.resolveReadyNodeIdsFromRows?.({
    nodeRows: inventory.nodeRows,
    serviceRows: inventory.serviceRows,
    nodeEndpointRows: [],
    publicationRows: [],
    requirePublishedMembership: false,
    extraCandidateNodeIds: membership.nodeIds,
  });
  const readyNodeMap = createNullDictionary();
  if (Array.isArray(resolved)) {
    for (const nodeId of resolved) {
      if (isNonEmptyString(nodeId)) {
        readyNodeMap[nodeId] = true;
      }
    }
  }
  const servingNodeMap = createNullDictionary();
  let readyNodeCount = 0;
  for (const nodeId of membership.nodeIds) {
    if (objectHasOwn(readyNodeMap, nodeId)) {
      readyNodeCount += 1;
      if (objectHasOwn(membership.activeNodeMap, nodeId)) {
        servingNodeMap[nodeId] = true;
      }
    }
  }
  return {readyNodeCount, servingNodeMap};
}

function markInventoryCorruption(state, partitionId) {
  state.hasGlobalServiceCorruption = true;
  if (isNonEmptyString(partitionId)) {
    state.corruptPartitions[partitionId] = true;
  }
}

function classifyServiceRowKind(state, row) {
  const serviceId = readOwnDataField(row, COLUMN.SERVICE_ID);
  if (!isNonEmptyString(serviceId) || objectHasOwn(state.seenServiceIds, serviceId)) {
    return ROW_CLASSIFICATION.CORRUPT;
  }
  state.seenServiceIds[serviceId] = true;

  const serviceType = readLowerStateField(readOwnDataField(row, COLUMN.SERVICE_TYPE));
  if (serviceType === STATE_ABSENT) {
    return ROW_CLASSIFICATION.CORRUPT;
  }
  return serviceType === SERVICE_TYPE.PARTITION ?
    ROW_CLASSIFICATION.PARTITION :
    ROW_CLASSIFICATION.IGNORE;
}

function registerUniqueReplicaId(state, partitionId, replicaId) {
  if (!isNonEmptyString(replicaId)) {
    return false;
  }
  const seenReplicas = getOrCreateNullBucket(
    state.seenReplicasByPartition,
    partitionId,
  );
  if (objectHasOwn(seenReplicas, replicaId)) {
    return false;
  }
  seenReplicas[replicaId] = true;
  return true;
}

function recordActivePartitionVoterRow(state, row, partitionId, nodeId) {
  getOrCreateNullBucket(state.activeHostNodesByPartition, partitionId)[nodeId] = true;

  const raftRole = readLowerStateField(readOwnDataField(row, COLUMN.RAFT_ROLE));
  if (raftRole === STATE_ABSENT) {
    markInventoryCorruption(state, partitionId);
    return;
  }
  if (!isVoterRaftRole(raftRole) || !hasDictionaryKey(state.servingNodeMap, nodeId)) {
    return;
  }

  const voterRolesByNode = getOrCreateNullBucket(
    state.voterRolesByPartition,
    partitionId,
  );
  if (objectHasOwn(voterRolesByNode, nodeId)) {
    markInventoryCorruption(state, partitionId);
    return;
  }
  voterRolesByNode[nodeId] = raftRole;

  if (raftRole === RAFT_ROLE.LEADER) {
    getOrCreateNullBucket(state.explicitLeaderNodesByPartition, partitionId)[nodeId] = true;
  }
}

function ingestServiceRowIntoInventory(state, row) {
  if (!isObjectRecord(row)) {
    state.hasGlobalServiceCorruption = true;
    return;
  }
  const partitionId = readOwnDataField(row, COLUMN.PARTITION_ID);
  const kind = classifyServiceRowKind(state, row);
  if (kind === ROW_CLASSIFICATION.IGNORE) {
    return;
  }
  const nodeId = readOwnDataField(row, COLUMN.NODE_ID);
  const replicaId = readOwnDataField(row, COLUMN.REPLICA_ID);
  const rowStatus = readLowerStateField(readOwnDataField(row, COLUMN.STATUS));
  if (
    kind === ROW_CLASSIFICATION.CORRUPT ||
    rowStatus === STATE_ABSENT ||
    !isNonEmptyString(partitionId) ||
    !isNonEmptyString(nodeId) ||
    !registerUniqueReplicaId(state, partitionId, replicaId)
  ) {
    markInventoryCorruption(state, partitionId);
    return;
  }
  if (rowStatus === SERVICE_STATUS.ACTIVE) {
    recordActivePartitionVoterRow(state, row, partitionId, nodeId);
  }
}

function collectPartitionReplicaInventory(serviceRows, servingNodeMap) {
  const state = {
    servingNodeMap,
    seenServiceIds: createNullDictionary(),
    seenReplicasByPartition: createNullDictionary(),
    voterRolesByPartition: createNullDictionary(),
    activeHostNodesByPartition: createNullDictionary(),
    explicitLeaderNodesByPartition: createNullDictionary(),
    corruptPartitions: createNullDictionary(),
    hasGlobalServiceCorruption: false,
  };
  for (const row of serviceRows) {
    ingestServiceRowIntoInventory(state, row);
  }
  return {
    voterRolesByPartition: state.voterRolesByPartition,
    activeHostNodesByPartition: state.activeHostNodesByPartition,
    explicitLeaderNodesByPartition: state.explicitLeaderNodesByPartition,
    corruptPartitions: state.corruptPartitions,
    hasGlobalServiceCorruption: state.hasGlobalServiceCorruption,
  };
}

function collectLocalPartitionServices(owner, partitionId) {
  const matches = [];
  const seen = new Set();
  const addService = (candidate) => {
    if (isObjectRecord(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      matches.push(candidate);
    }
  };

  for (const svc of resolveLocalPartitionServicesForPartition(
    owner?.getPartitionServices?.(),
    partitionId,
  )) {
    addService(svc);
  }

  const handler = owner?.getReplicaHandler?.();
  if (isObjectRecord(handler)) {
    for (const svc of resolveLocalPartitionServicesForPartition(
      readOwnDataField(handler, SERVICE_FIELD.LOCAL_SERVICES),
      partitionId,
    )) {
      addService(svc);
    }
  }

  return matches;
}

function hasCanonicalGetStatusPort(localService) {
  const proto = objectGetPrototypeOf(localService);
  if (proto === objectPrototype || proto === null) {
    return objectHasOwn(localService, SERVICE_FIELD.GET_STATUS) &&
      isCallable(localService[SERVICE_FIELD.GET_STATUS]);
  }
  return isCallable(localService[SERVICE_FIELD.GET_STATUS]);
}

function readCanonicalLocalServiceStatus(localService) {
  if (
    !isObjectRecord(localService) ||
    readOwnDataField(localService, SERVICE_FIELD.INITIALIZED) !== true ||
    readOwnDataField(localService, SERVICE_FIELD.IS_SHUTDOWN) === true ||
    !hasCanonicalGetStatusPort(localService)
  ) {
    return LOCAL_STATUS_UNAVAILABLE;
  }
  try {
    const status = localService.getStatus();
    return isPlainStatusRecord(status) ? status : LOCAL_STATUS_UNAVAILABLE;
  } catch {
    return LOCAL_STATUS_UNAVAILABLE;
  }
}

function resolveExpectedLocalReplicaId(localService, status) {
  const statusReplicaId = readOwnDataField(status, STATUS_FIELD.REPLICA_ID);
  if (isNonEmptyString(statusReplicaId)) {
    return statusReplicaId;
  }
  const serviceReplicaId = readOwnDataField(localService, SERVICE_FIELD.REPLICA_ID);
  return isNonEmptyString(serviceReplicaId) ? serviceReplicaId : null;
}

function isLeaderStatusConsistent(status, expectedReplicaId) {
  if (
    objectHasOwn(status, STATUS_FIELD.IS_LEADER) &&
    readOwnDataField(status, STATUS_FIELD.IS_LEADER) !== true
  ) {
    return false;
  }
  if (!objectHasOwn(status, STATUS_FIELD.LEADER_ID)) {
    return true;
  }
  const statusLeaderId = readOwnDataField(status, STATUS_FIELD.LEADER_ID);
  if (!isNonEmptyString(statusLeaderId)) {
    return false;
  }
  return expectedReplicaId === null || statusLeaderId === expectedReplicaId;
}

function isNonLeaderStatusConsistent(status, expectedReplicaId) {
  if (
    objectHasOwn(status, STATUS_FIELD.IS_LEADER) &&
    readOwnDataField(status, STATUS_FIELD.IS_LEADER) === true
  ) {
    return false;
  }
  if (!objectHasOwn(status, STATUS_FIELD.LEADER_ID)) {
    return true;
  }
  const statusLeaderId = readOwnDataField(status, STATUS_FIELD.LEADER_ID);
  if (statusLeaderId === null) {
    return true;
  }
  if (!isNonEmptyString(statusLeaderId)) {
    return false;
  }
  return expectedReplicaId === null || statusLeaderId !== expectedReplicaId;
}

function isStatusLeaderIdentityConsistent(localService, status, statusRole) {
  const expectedReplicaId = resolveExpectedLocalReplicaId(localService, status);
  return statusRole === RAFT_ROLE.LEADER ?
    isLeaderStatusConsistent(status, expectedReplicaId) :
    isNonLeaderStatusConsistent(status, expectedReplicaId);
}

function evaluateCanonicalLocalServiceRole(localService, partitionId, localNodeId) {
  const status = readCanonicalLocalServiceStatus(localService);
  if (status === LOCAL_STATUS_UNAVAILABLE) {
    return STATE_ABSENT;
  }
  const statusPartitionId = readOwnDataField(status, STATUS_FIELD.PARTITION_ID);
  const statusInitialized = readOwnDataField(status, STATUS_FIELD.INITIALIZED);
  const statusTerm = readOwnDataField(status, STATUS_FIELD.TERM);
  const statusNodeId = readOwnDataField(status, STATUS_FIELD.NODE_ID);
  if (
    statusPartitionId !== partitionId ||
    statusInitialized !== true ||
    !Number.isInteger(statusTerm) ||
    statusTerm <= 0 ||
    (statusNodeId !== undefined && statusNodeId !== localNodeId)
  ) {
    return STATE_ABSENT;
  }
  const statusRole = readLowerStateField(readOwnDataField(status, STATUS_FIELD.ROLE));
  if (!isLoadRoutableRaftRole(statusRole) && !isCatchupLearnerRaftRole(statusRole)) {
    return STATE_ABSENT;
  }
  if (!isStatusLeaderIdentityConsistent(localService, status, statusRole)) {
    return STATE_ABSENT;
  }
  return statusRole;
}

function resolveLocalHostExpectations(
  localNodeId,
  leaderNodeId,
  voterRolesByNode,
  activeHostNodes,
) {
  const expectedVoter = hasDictionaryKey(voterRolesByNode, localNodeId);
  const expectedLeader = leaderNodeId === localNodeId;
  const expectedHost =
    expectedVoter || expectedLeader || hasDictionaryKey(activeHostNodes, localNodeId);
  return {expectedVoter, expectedLeader, expectedHost};
}

function verifyLocalPartitionRuntimeAuthority({
  owner,
  partitionId,
  leaderNodeId,
  voterRolesByNode,
  activeHostNodes,
}) {
  const localNodeId = owner?.getSeedNodeId?.();
  if (!isNonEmptyString(localNodeId)) {
    return false;
  }
  const expectations = resolveLocalHostExpectations(
    localNodeId,
    leaderNodeId,
    voterRolesByNode,
    activeHostNodes,
  );
  const localServices = collectLocalPartitionServices(owner, partitionId);
  if (localServices.length === 0) {
    return !expectations.expectedHost;
  }
  if (localServices.length > 1) {
    return false;
  }
  const statusRole = evaluateCanonicalLocalServiceRole(
    localServices[0],
    partitionId,
    localNodeId,
  );
  if (statusRole === STATE_ABSENT) {
    return false;
  }
  const isHealthyVoter = isLoadRoutableRaftRole(statusRole);
  const isHealthyLeader = statusRole === RAFT_ROLE.LEADER;
  if (isHealthyLeader && !expectations.expectedLeader) {
    return false;
  }
  return (!expectations.expectedVoter || isHealthyVoter) &&
    (!expectations.expectedLeader || isHealthyLeader);
}

function hasValidPartitionLeaderEvidence({
  partition, partitionId, servingNodeMap, voterRolesByNode, replicaInventory,
}) {
  const leaderNodeId = readOwnDataField(partition, COLUMN.LEADER_NODE_ID);
  if (!isNonEmptyString(leaderNodeId) || !hasDictionaryKey(servingNodeMap, leaderNodeId) ||
      !hasDictionaryKey(voterRolesByNode, leaderNodeId)) {
    return null;
  }
  if (!isLoadRoutableRaftRole(voterRolesByNode[leaderNodeId])) return null;
  const explicitLeaders = getNullBucketOrNull(
    replicaInventory.explicitLeaderNodesByPartition, partitionId);
  if (explicitLeaders && (countDictionaryKeys(explicitLeaders) > 1 ||
      !hasDictionaryKey(explicitLeaders, leaderNodeId))) {
    return null;
  }
  return leaderNodeId;
}

function validatePartitionRowDeclaration(partition, seenPartitionIds) {
  if (!isObjectRecord(partition)) return null;
  const partitionId = readOwnDataField(partition, COLUMN.PARTITION_ID);
  const desiredRf = resolveDesiredReplicationFactor(partition);
  if (!isNonEmptyString(partitionId) || objectHasOwn(seenPartitionIds, partitionId) ||
      desiredRf.source !== REPLICATION_TARGET_SOURCE.PARTITION_ROW ||
      desiredRf.replicationFactor < 1) {
    return null;
  }
  seenPartitionIds[partitionId] = true;
  return {partitionId, targetCount: desiredRf.replicationFactor};
}

function doesPartitionHoldQuorum(owner, partition, declaration, servingNodeMap, replicaInventory) {
  const {partitionId, targetCount} = declaration;
  if (hasDictionaryKey(replicaInventory.corruptPartitions, partitionId)) return false;
  const voterRolesByNode = getNullBucketOrNull(
    replicaInventory.voterRolesByPartition, partitionId);
  const activeHostNodes = getNullBucketOrNull(
    replicaInventory.activeHostNodesByPartition, partitionId);
  if (countDictionaryKeys(voterRolesByNode) < Math.floor(targetCount / 2) + 1) return false;
  const leaderNodeId = hasValidPartitionLeaderEvidence({
    partition, partitionId, servingNodeMap, voterRolesByNode, replicaInventory,
  });
  if (leaderNodeId === null) return false;
  return verifyLocalPartitionRuntimeAuthority({
    owner, partitionId, leaderNodeId, voterRolesByNode, activeHostNodes,
  });
}

function evaluatePartitionsQuorum(owner, partitionRows, servingNodeMap, replicaInventory) {
  if (!Array.isArray(partitionRows) || partitionRows.length === 0) {
    return {underReplicatedPartitionCount: 0, hasPartitionQuorum: false};
  }
  const seenPartitionIds = createNullDictionary();
  let underReplicatedPartitionCount = 0;
  let hasPartitionQuorum = !replicaInventory.hasGlobalServiceCorruption;

  for (const partition of partitionRows) {
    const declaration = validatePartitionRowDeclaration(partition, seenPartitionIds);
    if (!declaration) {
      hasPartitionQuorum = false;
      underReplicatedPartitionCount += 1;
      continue;
    }
    const voterRolesByNode = getNullBucketOrNull(
      replicaInventory.voterRolesByPartition, declaration.partitionId);
    if (countDictionaryKeys(voterRolesByNode) < declaration.targetCount) {
      underReplicatedPartitionCount += 1;
    }
    if (!doesPartitionHoldQuorum(
      owner, partition, declaration, servingNodeMap, replicaInventory,
    )) {
      hasPartitionQuorum = false;
    }
  }

  return {underReplicatedPartitionCount, hasPartitionQuorum};
}

/**
 * Evaluate canonical partition quorum and management cluster topology from
 * authoritative control-plane inventories and local `PartitionService` status.
 *
 * @param {Object} owner `BootstrapClusterViewOwner` instance
 * @param {Object} inventory `{nodeRows, partitionRows, serviceRows}`
 * @return {Object|null}
 */
function evaluatePartitionQuorumAuthority(owner, inventory) {
  if (
    !isObjectRecord(inventory) ||
    !Array.isArray(inventory.nodeRows) ||
    !Array.isArray(inventory.partitionRows) ||
    !Array.isArray(inventory.serviceRows)
  ) {
    return UNAVAILABLE_MANAGEMENT_SNAPSHOT;
  }
  const membership = collectNodeMembership(inventory.nodeRows);
  if (membership.nodeIds.length === 0) {
    return UNAVAILABLE_MANAGEMENT_SNAPSHOT;
  }
  const {readyNodeCount, servingNodeMap} = resolveAuthoritativeReadyNodes(
    owner,
    membership,
    inventory,
  );
  const replicaInventory = collectPartitionReplicaInventory(
    inventory.serviceRows,
    servingNodeMap,
  );
  const quorum = evaluatePartitionsQuorum(
    owner,
    inventory.partitionRows,
    servingNodeMap,
    replicaInventory,
  );
  const hasPartitionQuorum =
    !membership.corrupt && quorum.hasPartitionQuorum === true;

  return {
    nodeCount: membership.nodeIds.length,
    readyNodeCount,
    underReplicatedPartitionCount: quorum.underReplicatedPartitionCount,
    nodeIds: membership.nodeIds,
    ready: readyNodeCount === membership.nodeIds.length,
    hasPartitionQuorum,
  };
}

/**
 * Obtain the runtime management cluster snapshot from canonical control-plane
 * and local Raft consensus authorities. Never reads `SystemTableCache`.
 *
 * @param {Object} owner `BootstrapClusterViewOwner` instance
 * @return {Promise<Object|null>}
 */
async function readAuthoritativeManagementClusterSnapshot(owner) {
  const authoritativeView = owner?.getAuthoritativeControlPlaneView?.();
  const inventory = await readAuthoritativeInventory(authoritativeView);
  if (!inventory) {
    return UNAVAILABLE_MANAGEMENT_SNAPSHOT;
  }
  return evaluatePartitionQuorumAuthority(owner, inventory);
}

export {
  evaluatePartitionQuorumAuthority,
  readAuthoritativeManagementClusterSnapshot,
};
