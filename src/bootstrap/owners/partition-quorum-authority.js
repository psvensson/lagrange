/**
 * Canonical partition quorum and management cluster snapshot authority.
 *
 * Contract for `hasPartitionQuorum === true`:
 * 1. Explicit canonical authority port is wired (`AuthoritativeControlPlaneView`
 *    reading through `OWNER_RPC_REQUIRED` + `leaderMode: REQUIRED`). Missing
 *    ports or `SystemTableCache`-only projections remain unavailable (`null`
 *    snapshot) and never grant management permission.
 * 2. Complete, leader-witnessed system-table inventories are returned for
 *    `nodes`, `partitions`, and `services` (`success === true`,
 *    `rowSetComplete === true`, `partial !== true`, non-cache owner source, and
 *    a valid leader `readAuthorityWitness` for each table's owner partition).
 * 3. `nodes` and `partitions` inventories are non-empty, carry unique primary
 *    identities, and every partition declares a positive integer replication
 *    factor via `resolveDesiredReplicationFactor`.
 * 4. Every partition has a majority (`floor(RF / 2) + 1`) of distinct active
 *    voter-role replicas (`status === 'active'`, `isVoterRaftRole(raft_role)`)
 *    hosted on active serving nodes. Learners (`raft_role === 'learner'`) and
 *    duplicate `(service_id)`, `(partition_id, replica_id)`, or
 *    `(partition_id, node_id)` rows never inflate voter quorum.
 * 5. Every partition carries explicit, non-contradictory leader evidence:
 *    `partitions.leader_node_id` names an active serving voter replica host
 *    whose replica is not in `candidate` election state, and any partition
 *    hosted on the local node is backed by a live initialized local
 *    `PartitionService` confirming consensus health and leader/voter role.
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
import {isVoterRaftRole} from '../../raft/replica-voter-readiness.js';
import {
  STATE_ABSENT,
  readLowerStateField,
} from '../../utils/state-field-read.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../replication-target-authority.js';
import {INITIAL_PARTITION_IDS} from '../system-table-schemas-constants.js';

const UNAVAILABLE_MANAGEMENT_SNAPSHOT = null;
const AUTHORITATIVE_READ_REJECTED = Object.freeze({
  success: false,
  rowSetComplete: false,
});
const AUTHORITATIVE_QUORUM_READ_SOURCES = Object.freeze([
  'local_partition_replica',
  'owner_rpc_lane',
]);
const ROW_CLASSIFICATION = Object.freeze({
  CORRUPT: 'corrupt',
  IGNORE: 'ignore',
  PARTITION: 'partition',
});
const SYSTEM_TABLE_COMPLETE_SELECT = Object.freeze({
  [TABLES.NODES]: `SELECT * FROM ${TABLES.NODES}`,
  [TABLES.PARTITIONS]: `SELECT * FROM ${TABLES.PARTITIONS}`,
  [TABLES.SERVICES]: `SELECT * FROM ${TABLES.SERVICES}`,
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getOrCreateSet(map, key) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  return set;
}

function getSetOrEmpty(map, key) {
  return map.get(key) ?? new Set();
}

function isCompleteAuthoritativeTableRead(readResult, tableName) {
  if (!isPlainRecord(readResult)) {
    return false;
  }
  if (
    readResult.success !== true ||
    readResult.rowSetComplete !== true ||
    readResult.partial === true ||
    !Array.isArray(readResult.rows) ||
    !AUTHORITATIVE_QUORUM_READ_SOURCES.includes(readResult.source)
  ) {
    return false;
  }
  const ownerPartitionId = INITIAL_PARTITION_IDS[tableName];
  return isNonEmptyString(ownerPartitionId) &&
    isValidLeaderReadAuthorityWitness(
      readResult.readAuthorityWitness,
      ownerPartitionId,
    );
}

async function readCompleteSystemTable(authoritativeView, tableName) {
  try {
    return await authoritativeView.readReadinessOwnerRows(
      tableName,
      SYSTEM_TABLE_COMPLETE_SELECT[tableName],
      [],
    );
  } catch (_error) {
    return AUTHORITATIVE_READ_REJECTED;
  }
}

async function readAuthoritativeInventory(authoritativeView) {
  if (
    !isPlainRecord(authoritativeView) ||
    authoritativeView.canRead?.() === false ||
    !authoritativeView.readReadinessOwnerRows
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
    nodeRows: nodesRead.rows,
    partitionRows: partitionsRead.rows,
    serviceRows: servicesRead.rows,
  };
}

function collectNodeMembership(nodeRows) {
  const nodeIds = [];
  const seenNodeIds = new Set();
  const servingNodeIds = new Set();
  let corrupt = false;

  for (const row of nodeRows) {
    const nodeId = isPlainRecord(row) ? row[COLUMN.NODE_ID] : null;
    if (!isNonEmptyString(nodeId) || seenNodeIds.has(nodeId)) {
      corrupt = true;
      continue;
    }
    seenNodeIds.add(nodeId);
    nodeIds.push(nodeId);
    if (readLowerStateField(row[COLUMN.STATUS]) === SERVICE_STATUS.ACTIVE) {
      servingNodeIds.add(nodeId);
    }
  }

  return {nodeIds, servingNodeIds, corrupt};
}

function markInventoryCorruption(state, partitionId) {
  state.hasGlobalServiceCorruption = true;
  if (isNonEmptyString(partitionId)) {
    state.corruptPartitions.add(partitionId);
  }
}

function classifyServiceRowKind(state, row) {
  const serviceId = row[COLUMN.SERVICE_ID];
  if (!isNonEmptyString(serviceId) || state.seenServiceIds.has(serviceId)) {
    return ROW_CLASSIFICATION.CORRUPT;
  }
  state.seenServiceIds.add(serviceId);

  const serviceType = readLowerStateField(row[COLUMN.SERVICE_TYPE]);
  if (serviceType === STATE_ABSENT) {
    return ROW_CLASSIFICATION.CORRUPT;
  }
  return serviceType === SERVICE_TYPE.PARTITION ?
    ROW_CLASSIFICATION.PARTITION :
    ROW_CLASSIFICATION.IGNORE;
}

function registerUniqueReplicaId(state, partitionId, replicaId) {
  if (replicaId === undefined || replicaId === null) {
    return true;
  }
  if (!isNonEmptyString(replicaId)) {
    return false;
  }
  const seenReplicaIds = getOrCreateSet(
    state.seenReplicaIdsByPartition,
    partitionId,
  );
  if (seenReplicaIds.has(replicaId)) {
    return false;
  }
  seenReplicaIds.add(replicaId);
  return true;
}

function recordActivePartitionVoterRow(state, row, partitionId, nodeId) {
  getOrCreateSet(state.activeHostNodesByPartition, partitionId).add(nodeId);

  const raftRole = readLowerStateField(row[COLUMN.RAFT_ROLE]);
  if (raftRole === STATE_ABSENT) {
    markInventoryCorruption(state, partitionId);
    return;
  }
  if (!isVoterRaftRole(raftRole) || !state.servingNodeIds.has(nodeId)) {
    return;
  }

  const voterNodes = getOrCreateSet(state.voterNodesByPartition, partitionId);
  if (voterNodes.has(nodeId)) {
    markInventoryCorruption(state, partitionId);
    return;
  }
  voterNodes.add(nodeId);
  state.voterRoleByPartitionNode.set(`${partitionId}:${nodeId}`, raftRole);

  if (raftRole === RAFT_ROLE.LEADER) {
    getOrCreateSet(state.explicitLeaderNodesByPartition, partitionId).add(nodeId);
  }
}

function ingestServiceRowIntoInventory(state, row) {
  if (!isPlainRecord(row)) {
    state.hasGlobalServiceCorruption = true;
    return;
  }
  const partitionId = row[COLUMN.PARTITION_ID];
  const kind = classifyServiceRowKind(state, row);
  if (kind === ROW_CLASSIFICATION.IGNORE) {
    return;
  }
  const nodeId = row[COLUMN.NODE_ID];
  if (
    kind === ROW_CLASSIFICATION.CORRUPT ||
    !isNonEmptyString(partitionId) ||
    !isNonEmptyString(nodeId) ||
    !registerUniqueReplicaId(state, partitionId, row[COLUMN.REPLICA_ID])
  ) {
    markInventoryCorruption(state, partitionId);
    return;
  }
  if (readLowerStateField(row[COLUMN.STATUS]) === SERVICE_STATUS.ACTIVE) {
    recordActivePartitionVoterRow(state, row, partitionId, nodeId);
  }
}

function collectPartitionReplicaInventory(serviceRows, servingNodeIds) {
  const state = {
    servingNodeIds,
    seenServiceIds: new Set(),
    seenReplicaIdsByPartition: new Map(),
    voterNodesByPartition: new Map(),
    voterRoleByPartitionNode: new Map(),
    activeHostNodesByPartition: new Map(),
    explicitLeaderNodesByPartition: new Map(),
    corruptPartitions: new Set(),
    hasGlobalServiceCorruption: false,
  };
  for (const row of serviceRows) {
    ingestServiceRowIntoInventory(state, row);
  }
  return {
    voterNodesByPartition: state.voterNodesByPartition,
    voterRoleByPartitionNode: state.voterRoleByPartitionNode,
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
    if (isPlainRecord(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      matches.push(candidate);
    }
  };

  for (const svc of resolveLocalPartitionServicesForPartition(
    owner.getPartitionServices?.(),
    partitionId,
  )) {
    addService(svc);
  }

  const handler = owner.getReplicaHandler?.();
  if (isPlainRecord(handler)) {
    addService(handler.getPartitionService?.(partitionId));
    for (const svc of resolveLocalPartitionServicesForPartition(
      handler.partitionServices,
      partitionId,
    )) {
      addService(svc);
    }
  }

  return matches;
}

function readLocalServiceStatus(localService) {
  const fromAccessor = localService.getStatus?.();
  if (fromAccessor !== undefined) {
    return fromAccessor;
  }
  return localService.status;
}

function resolveLiveLocalRaftRole(localService, status) {
  const accessorRole = readLowerStateField(localService.getRole?.());
  if (accessorRole !== STATE_ABSENT) {
    return accessorRole;
  }
  const fieldRole = readLowerStateField(localService.role);
  if (fieldRole !== STATE_ABSENT) {
    return fieldRole;
  }
  if (isPlainRecord(status)) {
    const statusRole = readLowerStateField(status.role);
    if (statusRole !== STATE_ABSENT) {
      return statusRole;
    }
  }
  return STATE_ABSENT;
}

function isLocalServiceConsensusHealthy(localService, status, majorityCount) {
  if (localService.initialized === false) {
    return false;
  }
  if (!isPlainRecord(status)) {
    return true;
  }
  if (
    status.initialized === false ||
    status.hasQuorum === false ||
    status.quorum === false
  ) {
    return false;
  }
  if (
    Number.isFinite(status.activeReplicaCount) &&
    status.activeReplicaCount < majorityCount
  ) {
    return false;
  }
  return !(Number.isInteger(status.term) && status.term <= 0);
}

function isLiveLeaderLocalService(localService, liveRole) {
  if (liveRole !== STATE_ABSENT) {
    return liveRole === RAFT_ROLE.LEADER;
  }
  return localService.isLeader === true ||
    localService.isLeaderReplica?.() === true;
}

function isLiveVoterLocalService(localService, liveRole) {
  if (liveRole !== STATE_ABSENT) {
    return isVoterRaftRole(liveRole);
  }
  return localService.isLeader === true ||
    localService.isLeaderReplica?.() === true;
}

function resolveLocalHostExpectations(
  localNodeId,
  leaderNodeId,
  voterNodes,
  activeHostNodes,
) {
  if (!isNonEmptyString(localNodeId)) {
    return {
      expectedVoter: false,
      expectedLeader: false,
      expectedHost: false,
    };
  }
  const expectedVoter = voterNodes.has(localNodeId);
  const expectedLeader = leaderNodeId === localNodeId;
  const expectedHost =
    expectedVoter || expectedLeader || activeHostNodes.has(localNodeId);
  return {expectedVoter, expectedLeader, expectedHost};
}

function inspectLocalPartitionServices(
  localServices,
  majorityCount,
  expectedLeader,
) {
  let hasLiveVoter = false;
  let hasLiveLeader = false;

  for (const localService of localServices) {
    const status = readLocalServiceStatus(localService);
    if (!isLocalServiceConsensusHealthy(localService, status, majorityCount)) {
      return null;
    }
    const liveRole = resolveLiveLocalRaftRole(localService, status);
    if (isLiveVoterLocalService(localService, liveRole)) {
      hasLiveVoter = true;
    }
    if (isLiveLeaderLocalService(localService, liveRole)) {
      if (!expectedLeader) {
        return null;
      }
      hasLiveLeader = true;
    }
  }

  return {hasLiveVoter, hasLiveLeader};
}

function verifyLocalPartitionRuntimeAuthority({
  owner,
  partitionId,
  majorityCount,
  leaderNodeId,
  voterNodes,
  activeHostNodes,
}) {
  const expectations = resolveLocalHostExpectations(
    owner.getSeedNodeId?.(),
    leaderNodeId,
    voterNodes,
    activeHostNodes,
  );
  const localServices = collectLocalPartitionServices(owner, partitionId);
  if (localServices.length === 0) {
    return !expectations.expectedHost;
  }
  const observed = inspectLocalPartitionServices(
    localServices,
    majorityCount,
    expectations.expectedLeader,
  );
  if (!observed) {
    return false;
  }
  return (!expectations.expectedVoter || observed.hasLiveVoter) &&
    (!expectations.expectedLeader || observed.hasLiveLeader);
}

function hasValidPartitionLeaderEvidence({
  partition,
  partitionId,
  servingNodeIds,
  voterNodes,
  replicaInventory,
}) {
  const leaderNodeId = partition[COLUMN.LEADER_NODE_ID];
  if (!isNonEmptyString(leaderNodeId)) {
    return null;
  }
  if (!servingNodeIds.has(leaderNodeId) || !voterNodes.has(leaderNodeId)) {
    return null;
  }
  const leaderVoterRole = replicaInventory.voterRoleByPartitionNode.get(
    `${partitionId}:${leaderNodeId}`,
  );
  if (
    leaderVoterRole !== RAFT_ROLE.LEADER &&
    leaderVoterRole !== RAFT_ROLE.FOLLOWER
  ) {
    return null;
  }
  const explicitLeaders =
    replicaInventory.explicitLeaderNodesByPartition.get(partitionId);
  if (
    explicitLeaders &&
    (explicitLeaders.size > 1 || !explicitLeaders.has(leaderNodeId))
  ) {
    return null;
  }
  return leaderNodeId;
}

function resolveAuthoritativeReadyNodeCount(owner, nodeIds, inventory) {
  const readySet = new Set(owner.resolveReadyNodeIdsFromRows({
    nodeRows: inventory.nodeRows,
    serviceRows: inventory.serviceRows,
    nodeEndpointRows: [],
    publicationRows: [],
    requirePublishedMembership: false,
    extraCandidateNodeIds: nodeIds,
  }));
  return nodeIds.filter((nodeId) => readySet.has(nodeId)).length;
}

function validatePartitionRowDeclaration(partition, seenPartitionIds) {
  if (!isPlainRecord(partition)) {
    return null;
  }
  const partitionId = partition[COLUMN.PARTITION_ID];
  const desiredRf = resolveDesiredReplicationFactor(partition);
  if (
    !isNonEmptyString(partitionId) ||
    seenPartitionIds.has(partitionId) ||
    desiredRf.source !== REPLICATION_TARGET_SOURCE.PARTITION_ROW ||
    desiredRf.replicationFactor < 1
  ) {
    return null;
  }
  seenPartitionIds.add(partitionId);
  return {partitionId, targetCount: desiredRf.replicationFactor};
}

function doesPartitionHoldQuorum(
  owner,
  partition,
  declaration,
  servingNodeIds,
  replicaInventory,
) {
  const {partitionId, targetCount} = declaration;
  if (replicaInventory.corruptPartitions.has(partitionId)) {
    return false;
  }
  const voterNodes = getSetOrEmpty(
    replicaInventory.voterNodesByPartition,
    partitionId,
  );
  const activeHostNodes = getSetOrEmpty(
    replicaInventory.activeHostNodesByPartition,
    partitionId,
  );
  const majorityCount = Math.floor(targetCount / 2) + 1;
  if (voterNodes.size < majorityCount) {
    return false;
  }
  const leaderNodeId = hasValidPartitionLeaderEvidence({
    partition,
    partitionId,
    servingNodeIds,
    voterNodes,
    replicaInventory,
  });
  if (leaderNodeId === null) {
    return false;
  }
  return verifyLocalPartitionRuntimeAuthority({
    owner,
    partitionId,
    majorityCount,
    leaderNodeId,
    voterNodes,
    activeHostNodes,
  });
}

function evaluatePartitionsQuorum(
  owner,
  partitionRows,
  servingNodeIds,
  replicaInventory,
) {
  if (partitionRows.length === 0) {
    return {underReplicatedPartitionCount: 0, hasPartitionQuorum: false};
  }
  const seenPartitionIds = new Set();
  let underReplicatedPartitionCount = 0;
  let hasPartitionQuorum = !replicaInventory.hasGlobalServiceCorruption;

  for (const partition of partitionRows) {
    const declaration = validatePartitionRowDeclaration(
      partition,
      seenPartitionIds,
    );
    if (!declaration) {
      hasPartitionQuorum = false;
      underReplicatedPartitionCount += 1;
      continue;
    }
    const voterCount = getSetOrEmpty(
      replicaInventory.voterNodesByPartition,
      declaration.partitionId,
    ).size;
    if (voterCount < declaration.targetCount) {
      underReplicatedPartitionCount += 1;
    }
    if (!doesPartitionHoldQuorum(
      owner,
      partition,
      declaration,
      servingNodeIds,
      replicaInventory,
    )) {
      hasPartitionQuorum = false;
    }
  }

  return {underReplicatedPartitionCount, hasPartitionQuorum};
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

  const membership = collectNodeMembership(inventory.nodeRows);
  if (membership.nodeIds.length === 0) {
    return UNAVAILABLE_MANAGEMENT_SNAPSHOT;
  }

  const readyNodeCount = resolveAuthoritativeReadyNodeCount(
    owner,
    membership.nodeIds,
    inventory,
  );
  const replicaInventory = collectPartitionReplicaInventory(
    inventory.serviceRows,
    membership.servingNodeIds,
  );
  const quorum = evaluatePartitionsQuorum(
    owner,
    inventory.partitionRows,
    membership.servingNodeIds,
    replicaInventory,
  );
  const hasPartitionQuorum = !membership.corrupt && quorum.hasPartitionQuorum;

  return {
    nodeCount: membership.nodeIds.length,
    readyNodeCount,
    underReplicatedPartitionCount: quorum.underReplicatedPartitionCount,
    nodeIds: membership.nodeIds,
    ready: readyNodeCount === membership.nodeIds.length,
    hasPartitionQuorum,
  };
}

export {
  readAuthoritativeManagementClusterSnapshot,
};
