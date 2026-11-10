import {ConfigurationManager} from '../../config/configuration-manager.js';
import {assertCritical} from '../../utils/assert.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../constants/index.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {CONFIG_CATEGORY} from '../../config/config-constants.js';
import {
  resolveCanonicalActiveNodeIds,
} from '../../control-plane/active-node-projection.js';
import {
  BOOTSTRAP_API_CLUSTER_STATE,
  BOOTSTRAP_API_ERROR,
} from '../bootstrap-api-constants.js';
import {readCurrentEndpointRows} from
  '../../control-plane/owners/endpoint-incarnation-currentness.js';

function canTreatSeedAsBootstrapReady(readiness) {
  return !!readiness &&
    typeof readiness === 'object' &&
    readiness.ready === true;
}

function extractCandidateNodeId(row) {
  return row?.node_id || row?.nodeId || null;
}

function addCandidateNodeIds(candidateNodeIds, rows) {
  for (const row of rows) {
    const nodeId = extractCandidateNodeId(row);
    if (nodeId) {
      candidateNodeIds.add(nodeId);
    }
  }
}

function filterReadyNodeIds(candidateNodeIds, nodeIds) {
  return nodeIds.filter((nodeId) =>
    candidateNodeIds.size === 0 || candidateNodeIds.has(nodeId),
  );
}

function isServingNodeRow(node) {
  const rawStatus = node?.status ?? node?.node_state ?? null;
  return rawStatus === null ||
    String(rawStatus).toLowerCase() === SERVICE_STATUS.ACTIVE;
}

function resolveLocalPartitionService(owner, partitionId) {
  const partitionServices =
    owner.delegates.getPartitionServices?.() ||
    owner.api?.partitionServices ||
    null;
  if (partitionServices instanceof Map && partitionServices.has(partitionId)) {
    return partitionServices.get(partitionId);
  }
  const handler =
    owner.api?.partitionHandler ||
    owner.api?.replicaHandler ||
    owner.delegates.getPartitionHandler?.() ||
    owner.delegates.getReplicaHandler?.() ||
    null;
  if (!handler) {
    return null;
  }
  if (typeof handler.getPartitionService === 'function') {
    return handler.getPartitionService(partitionId);
  }
  if (handler.partitionServices instanceof Map) {
    return handler.partitionServices.get(partitionId) || null;
  }
  return null;
}

function evaluateLocalPartitionStatus(owner, partitionId, majorityCount) {
  const localService = resolveLocalPartitionService(owner, partitionId);
  if (!localService) {
    return {hosted: false, quorumOk: true, isLeader: false};
  }
  const role = typeof localService.getRole === 'function' ?
    localService.getRole() :
    localService.role;
  const isLeader = localService.isLeader === true ||
    String(role || '').toLowerCase() === RAFT_ROLE.LEADER ||
    (typeof localService.isLeaderReplica === 'function' &&
      localService.isLeaderReplica());
  const status = typeof localService.getStatus === 'function' ?
    localService.getStatus() :
    localService.status;
  if (status && typeof status === 'object') {
    if (status.hasQuorum === false || status.quorum === false) {
      return {hosted: true, quorumOk: false, isLeader};
    }
    if (
      Number.isFinite(status.activeReplicaCount) &&
      status.activeReplicaCount < majorityCount
    ) {
      return {hosted: true, quorumOk: false, isLeader};
    }
  }
  return {hosted: true, quorumOk: true, isLeader};
}

function collectPartitionServiceInventory(services, nodeRowById, nonServingNodeIds) {
  const activeServicesByPartition = new Map();
  const activeLeaderByPartition = new Map();
  const partitionHasRoleMetadata = new Set();
  for (const service of services) {
    const partitionId = service?.partition_id || service?.partitionId || null;
    if (!partitionId) {
      continue;
    }
    const serviceType = service?.service_type || service?.serviceType || null;
    if (
      serviceType !== null &&
      String(serviceType).toLowerCase() !== SERVICE_TYPE.PARTITION
    ) {
      continue;
    }
    const rawRole = service?.raft_role ?? service?.raftRole ?? service?.role;
    if (
      rawRole !== undefined ||
      service?.is_leader !== undefined ||
      service?.isLeader !== undefined
    ) {
      partitionHasRoleMetadata.add(partitionId);
    }
    const isActiveStatus =
      String(service?.status || '').toLowerCase() === SERVICE_STATUS.ACTIVE;
    const serviceNodeId = extractCandidateNodeId(service);
    const isNodeServing = !serviceNodeId ?
      nodeRowById.size === 0 :
      (nodeRowById.size === 0 ||
        (nodeRowById.has(serviceNodeId) &&
          !nonServingNodeIds.has(serviceNodeId)));
    if (!isActiveStatus || !isNodeServing) {
      continue;
    }
    activeServicesByPartition.set(
      partitionId,
      (activeServicesByPartition.get(partitionId) || 0) + 1,
    );
    if (
      String(rawRole || '').toLowerCase() === RAFT_ROLE.LEADER ||
      service?.is_leader === true ||
      service?.isLeader === true
    ) {
      activeLeaderByPartition.set(partitionId, serviceNodeId || true);
    }
  }
  return {
    activeServicesByPartition,
    activeLeaderByPartition,
    partitionHasRoleMetadata,
  };
}

function hasPartitionLeaderAuthority(
  partition,
  partitionId,
  nodeRowById,
  nonServingNodeIds,
  inventory,
  localStatus,
) {
  const hasLeaderField =
    Object.hasOwn(partition, 'leader_node_id') ||
    Object.hasOwn(partition, 'leaderNodeId');
  const rawLeaderNodeId =
    partition.leader_node_id ?? partition.leaderNodeId ?? null;
  const hasValidPartitionLeader =
    typeof rawLeaderNodeId === 'string' &&
    rawLeaderNodeId.length > 0 &&
    (nodeRowById.size === 0 ||
      (nodeRowById.has(rawLeaderNodeId) &&
        !nonServingNodeIds.has(rawLeaderNodeId)));
  const hasActiveServiceLeader = Boolean(
    inventory.activeLeaderByPartition.get(partitionId) ||
    localStatus.isLeader,
  );
  const requiresExplicitLeader =
    hasLeaderField ||
    inventory.partitionHasRoleMetadata.has(partitionId) ||
    localStatus.hosted;
  return requiresExplicitLeader ?
    (hasValidPartitionLeader || hasActiveServiceLeader) :
    true;
}

class BootstrapClusterViewOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.api = options.api || null;
  }

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getSeedNodeAddress() {
    return this.delegates.getSeedNodeAddress?.() || null;
  }

  getMessageGroups() {
    return this.delegates.getMessageGroups?.() || [];
  }

  getControlPlaneReadinessService() {
    return this.delegates.getControlPlaneReadinessService?.() || null;
  }

  getPublicationRows() {
    const systemTableCache = this.getSystemTableCache();
    return systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS) || [];
  }

  getEpochManager() {
    return this.delegates.getEpochManager?.() || null;
  }

  getStartupAuthorityReadyNodeIds(seedNodeId, observedAt = Date.now()) {
    const readinessService = this.getControlPlaneReadinessService();
    if (!readinessService ||
        typeof readinessService.getStartupAuthoritySnapshotSync !==
          'function') {
      return [];
    }
    try {
      const startupAuthority =
        readinessService.getStartupAuthoritySnapshotSync(
          seedNodeId,
          observedAt,
        );
      return Array.isArray(startupAuthority?.canonicalStartupNodeIds) ?
        [...new Set(startupAuthority.canonicalStartupNodeIds.filter((nodeId) =>
          typeof nodeId === 'string' && nodeId.length > 0,
        ))] :
        [];
    } catch (_error) {
      return [];
    }
  }

  getReadyNodes(options = {}) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const nodeRows = systemTableCache.getAll(TABLES.NODES) || [];
    const serviceRows = systemTableCache.getAll(TABLES.SERVICES) || [];
    const nodeEndpointRows =
      readCurrentEndpointRows(systemTableCache, TABLES.NODE_ENDPOINTS);
    const readinessService = this.getControlPlaneReadinessService();
    const candidateNodeIds = new Set();
    addCandidateNodeIds(candidateNodeIds, nodeRows);
    addCandidateNodeIds(candidateNodeIds, serviceRows);
    addCandidateNodeIds(candidateNodeIds, nodeEndpointRows);
    const readinessByNodeId = this.buildReadinessByNodeId(
      readinessService,
      candidateNodeIds,
    );
    const readyNodes = resolveCanonicalActiveNodeIds({
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      publicationRows: this.getPublicationRows(),
      requirePublishedMembership: options.requirePublishedMembership === true,
      readinessByNodeId,
      nowMs: Date.now(),
    });

    const seedNodeId = this.getSeedNodeId();
    const startupAuthorityReadyNodeIds =
      options.requirePublishedMembership === true ?
        [] :
        this.getStartupAuthorityReadyNodeIds(seedNodeId);
    if (startupAuthorityReadyNodeIds.length > 0) {
      const filteredReadyNodeIds = filterReadyNodeIds(
        candidateNodeIds,
        startupAuthorityReadyNodeIds,
      );
      if (filteredReadyNodeIds.length > 0) {
        return filteredReadyNodeIds;
      }
    }
    if (options.requirePublishedMembership !== true &&
        seedNodeId &&
        !readyNodes.includes(seedNodeId) &&
        canTreatSeedAsBootstrapReady(readinessByNodeId[seedNodeId])) {
      readyNodes.push(seedNodeId);
    }

    return readyNodes;
  }

  buildReadinessByNodeId(readinessService, candidateNodeIds) {
    if (!readinessService ||
        typeof readinessService.getNodeReadinessSync !== 'function') {
      return {};
    }
    const readinessByNodeId = {};
    for (const nodeId of candidateNodeIds) {
      const readiness = readinessService.getNodeReadinessSync(nodeId);
      if (readiness && typeof readiness === 'object') {
        readinessByNodeId[nodeId] = readiness;
      }
    }
    return readinessByNodeId;
  }

  getTablePolicies() {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const tables = systemTableCache.getAll(TABLES.TABLES) || [];
    const policies = {};

    for (const table of tables) {
      const tableName = table.table_id || table.table_name;
      if (!tableName) {
        continue;
      }

      let policy = table.table_policies;
      if (typeof policy === 'string' && policy.length > 0) {
        try {
          policy = JSON.parse(policy);
        } catch (error) {
          throw new Error(
            `Invalid table policy for ${tableName}: ${error.message}`,
          );
        }
      }

      policies[tableName] = policy || {};
    }

    return policies;
  }

  getCurrentEpoch() {
    const epochManager = this.getEpochManager();
    if (!epochManager) {
      return null;
    }

    const epoch = epochManager.getCurrentEpoch();
    return typeof epoch?.toObject === 'function' ? epoch.toObject() : epoch;
  }

  getClusterConfiguration() {
    const config = ConfigurationManager.getInstance();

    return {
      raft: config.getCategory(CONFIG_CATEGORY.RAFT),
      messageGroup: config.getCategory(CONFIG_CATEGORY.MESSAGE_GROUP),
      partition: config.getCategory(CONFIG_CATEGORY.PARTITION),
      logging: config.getCategory(CONFIG_CATEGORY.LOGGING),
    };
  }

  getClusterState() {
    const nodes = [];
    const messageGroups = [];
    const activeNodeIds = new Set(this.getReadyNodes({
      requirePublishedMembership: true,
    }));

    nodes.push({
      nodeId: this.getSeedNodeId(),
      nodeAddress: this.getSeedNodeAddress(),
      status: activeNodeIds.has(this.getSeedNodeId()) ?
        SERVICE_STATUS.ACTIVE :
        BOOTSTRAP_API_CLUSTER_STATE.UNKNOWN,
      isSeed: true,
    });

    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const allNodes = systemTableCache.getAll(TABLES.NODES) || [];
    for (const node of allNodes) {
      if (node.node_id === this.getSeedNodeId()) {
        continue;
      }
      nodes.push({
        nodeId: node.node_id,
        nodeAddress: node.node_address,
        status: activeNodeIds.has(node.node_id) ?
          SERVICE_STATUS.ACTIVE :
          (node.status || BOOTSTRAP_API_CLUSTER_STATE.UNKNOWN),
        isSeed: false,
      });
    }

    const groups = this.getMessageGroups();
    for (const group of groups) {
      messageGroups.push({
        groupId: group.group_id,
        replicaCount: group.replicas?.length || 0,
        replicas: group.replicas || [],
      });
    }

    return {
      seedNodeId: this.getSeedNodeId(),
      nodeCount: nodes.length,
      nodes,
      messageGroupCount: messageGroups.length,
      messageGroups,
      timestamp: Date.now(),
    };
  }

  getManagementClusterSnapshot() {
    const systemTableCache = this.getSystemTableCache();
    if (!systemTableCache || typeof systemTableCache.getAll !== 'function') {
      return null;
    }
    const allNodes = systemTableCache.getAll(TABLES.NODES) || [];
    const nodeIds = [];
    const nodeRowById = new Map();
    const nonServingNodeIds = new Set();
    for (const node of allNodes) {
      const nodeId = extractCandidateNodeId(node);
      if (typeof nodeId !== 'string' || nodeId.length === 0) {
        continue;
      }
      if (!nodeRowById.has(nodeId)) {
        nodeIds.push(nodeId);
      }
      nodeRowById.set(nodeId, node);
      if (!isServingNodeRow(node)) {
        nonServingNodeIds.add(nodeId);
      }
    }
    if (nodeIds.length === 0) {
      return null;
    }
    const readyNodeIdSet = new Set(this.getReadyNodes());
    const readyNodeCount = nodeIds.filter(
      (nodeId) => readyNodeIdSet.has(nodeId),
    ).length;
    const partitions = systemTableCache.getAll(TABLES.PARTITIONS) || [];
    const services = systemTableCache.getAll(TABLES.SERVICES) || [];
    const inventory = collectPartitionServiceInventory(
      services,
      nodeRowById,
      nonServingNodeIds,
    );
    let underReplicatedPartitionCount = 0;
    let hasPartitionQuorum = Array.isArray(partitions) && partitions.length > 0;
    let validPartitionCount = 0;
    for (const partition of partitions) {
      const partitionId =
        partition?.partition_id || partition?.partitionId || null;
      const targetCount = Number(
        partition?.replica_count ?? partition?.replicaCount ?? 0,
      );
      if (!partitionId || !Number.isFinite(targetCount) || targetCount <= 0) {
        hasPartitionQuorum = false;
        underReplicatedPartitionCount += 1;
        continue;
      }
      validPartitionCount += 1;
      const activeCount =
        inventory.activeServicesByPartition.get(partitionId) || 0;
      if (activeCount < targetCount) {
        underReplicatedPartitionCount += 1;
      }
      const majorityCount = Math.floor(targetCount / 2) + 1;
      const localStatus = evaluateLocalPartitionStatus(
        this,
        partitionId,
        majorityCount,
      );
      const hasLeader = hasPartitionLeaderAuthority(
        partition,
        partitionId,
        nodeRowById,
        nonServingNodeIds,
        inventory,
        localStatus,
      );
      if (
        activeCount < majorityCount ||
        !localStatus.quorumOk ||
        !hasLeader
      ) {
        hasPartitionQuorum = false;
      }
    }
    if (validPartitionCount === 0) {
      hasPartitionQuorum = false;
    }
    return {
      nodeCount: nodeIds.length,
      readyNodeCount,
      underReplicatedPartitionCount,
      nodeIds,
      ready:
        readyNodeCount === nodeIds.length &&
        underReplicatedPartitionCount === 0 &&
        hasPartitionQuorum,
      hasPartitionQuorum,
    };
  }
}

export {BootstrapClusterViewOwner};
