import {ConfigurationManager} from '../../config/configuration-manager.js';
import {assertCritical} from '../../utils/assert.js';
import {
  SERVICE_STATUS,
  TABLES,
} from '../../constants/index.js';
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
import {
  readAuthoritativeManagementClusterSnapshot,
} from './partition-quorum-authority.js';

const EMPTY_READY_NODE_IDS = Object.freeze([]);

function canTreatSeedAsBootstrapReady(readiness) {
  return !!readiness &&
    typeof readiness === 'object' &&
    readiness.ready === true;
}

function extractCandidateNodeId(row) {
  return row?.node_id || row?.nodeId || null;
}

function addCandidateNodeIds(candidateNodeIds, rows) {
  if (!Array.isArray(rows)) {
    return;
  }
  for (const row of rows) {
    const nodeId = extractCandidateNodeId(row);
    if (nodeId) {
      candidateNodeIds.add(nodeId);
    }
  }
}

function addCandidateNodeIdValues(candidateNodeIds, nodeIds) {
  if (!Array.isArray(nodeIds)) {
    return;
  }
  for (const nodeId of nodeIds) {
    if (typeof nodeId === 'string' && nodeId.length > 0) {
      candidateNodeIds.add(nodeId);
    }
  }
}

function buildCandidateNodeIdSet(options) {
  const candidateNodeIds = new Set();
  addCandidateNodeIdValues(candidateNodeIds, options.extraCandidateNodeIds);
  addCandidateNodeIds(candidateNodeIds, options.nodeRows);
  addCandidateNodeIds(candidateNodeIds, options.serviceRows);
  addCandidateNodeIds(candidateNodeIds, options.nodeEndpointRows);
  return candidateNodeIds;
}

function shouldAppendBootstrapSeedNode(
  requirePublishedMembership,
  seedNodeId,
  readyNodes,
  readinessByNodeId,
) {
  if (requirePublishedMembership || !seedNodeId) {
    return false;
  }
  return !readyNodes.includes(seedNodeId) &&
    canTreatSeedAsBootstrapReady(readinessByNodeId[seedNodeId]);
}

function filterReadyNodeIds(candidateNodeIds, nodeIds) {
  return nodeIds.filter((nodeId) =>
    candidateNodeIds.size === 0 || candidateNodeIds.has(nodeId),
  );
}

class BootstrapClusterViewOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getAuthoritativeControlPlaneView() {
    return this.delegates.getAuthoritativeControlPlaneView?.() ?? null;
  }

  getPartitionServices() {
    return this.delegates.getPartitionServices?.() ?? null;
  }

  getReplicaHandler() {
    return this.delegates.getReplicaHandler?.() ?? null;
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

  resolveStartupReadyNodeIds(
    seedNodeId,
    candidateNodeIds,
    requirePublishedMembership,
  ) {
    const startupAuthorityReadyNodeIds = requirePublishedMembership ?
      EMPTY_READY_NODE_IDS :
      this.getStartupAuthorityReadyNodeIds(seedNodeId);
    return filterReadyNodeIds(candidateNodeIds, startupAuthorityReadyNodeIds);
  }

  resolveReadyNodeIdsFromRows(options = {}) {
    const requirePublishedMembership =
      options.requirePublishedMembership === true;
    const candidateNodeIds = buildCandidateNodeIdSet(options);
    const readinessByNodeId = this.buildReadinessByNodeId(
      this.getControlPlaneReadinessService(),
      candidateNodeIds,
    );
    const readyNodes = resolveCanonicalActiveNodeIds({
      nodeRows: options.nodeRows,
      serviceRows: options.serviceRows,
      nodeEndpointRows: options.nodeEndpointRows,
      publicationRows: options.publicationRows,
      requirePublishedMembership,
      readinessByNodeId,
    });
    const seedNodeId = this.getSeedNodeId();
    const startupReadyNodeIds = this.resolveStartupReadyNodeIds(
      seedNodeId,
      candidateNodeIds,
      requirePublishedMembership,
    );
    if (startupReadyNodeIds.length > 0) {
      return startupReadyNodeIds;
    }
    if (shouldAppendBootstrapSeedNode(
      requirePublishedMembership,
      seedNodeId,
      readyNodes,
      readinessByNodeId,
    )) {
      readyNodes.push(seedNodeId);
    }
    return readyNodes;
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
    return this.resolveReadyNodeIdsFromRows({
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      publicationRows: this.getPublicationRows(),
      requirePublishedMembership: options.requirePublishedMembership === true,
    });
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
          node.status, // nodes.status is NOT NULL DEFAULT 'active'
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

  async getManagementClusterSnapshot() {
    return readAuthoritativeManagementClusterSnapshot(this);
  }
}

export {BootstrapClusterViewOwner};
