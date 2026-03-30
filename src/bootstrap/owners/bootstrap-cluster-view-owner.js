import {ConfigurationManager} from '../../config/configuration-manager.js';
import {assertCritical} from '../../utils/assert.js';
import {
  NUM,
  SERVICE_STATUS,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';
import {CONFIG_CATEGORY} from '../../config/config-constants.js';
import {
  resolveCanonicalActiveNodeIds,
} from '../../control-plane/active-node-projection.js';
import {
  BOOTSTRAP_API_CLUSTER_STATE,
  BOOTSTRAP_API_ERROR,
} from '../bootstrap-api-constants.js';

class BootstrapClusterViewOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
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

  getReadyNodes(options = {}) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const nodeRows = systemTableCache.getAll(TABLES.NODES) || [];
    const serviceRows = systemTableCache.getAll(TABLES.SERVICES) || [];
    const nodeEndpointRows =
      systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [];
    const readinessService = this.getControlPlaneReadinessService();
    const readinessByNodeId = {};
    if (readinessService &&
        typeof readinessService.getNodeReadinessSync === TYPEOF.FUNCTION) {
      const candidateNodeIds = new Set();
      for (const nodeRow of nodeRows) {
        const nodeId = nodeRow?.node_id || nodeRow?.nodeId || null;
        if (nodeId) {
          candidateNodeIds.add(nodeId);
        }
      }
      for (const serviceRow of serviceRows) {
        const nodeId = serviceRow?.node_id || serviceRow?.nodeId || null;
        if (nodeId) {
          candidateNodeIds.add(nodeId);
        }
      }
      for (const endpointRow of nodeEndpointRows) {
        const nodeId = endpointRow?.node_id || endpointRow?.nodeId || null;
        if (nodeId) {
          candidateNodeIds.add(nodeId);
        }
      }
      for (const nodeId of candidateNodeIds) {
        const readiness = readinessService.getNodeReadinessSync(nodeId);
        if (readiness && typeof readiness === TYPEOF.OBJECT) {
          readinessByNodeId[nodeId] = readiness;
        }
      }
    }
    const readyNodes = resolveCanonicalActiveNodeIds({
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      publicationRows: this.getPublicationRows(),
      requirePublishedMembership: options.requirePublishedMembership === true,
      readinessByNodeId,
    });

    if (options.requirePublishedMembership !== true &&
        this.getSeedNodeId() &&
        !readyNodes.includes(this.getSeedNodeId())) {
      readyNodes.push(this.getSeedNodeId());
    }

    return readyNodes;
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
      if (typeof policy === TYPEOF.STRING && policy.length > NUM.ZERO) {
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
    return typeof epoch?.toObject === TYPEOF.FUNCTION ? epoch.toObject() : epoch;
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
        replicaCount: group.replicas?.length || NUM.ZERO,
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
}

export {BootstrapClusterViewOwner};
