import {assertCritical} from '../../utils/assert.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  NUM,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {
  getMissingSystemServiceLeaderCount,
  getMissingSystemServiceLeaders,
  getOwnerRecords,
  resolveCanonicalLeaderService,
} from '../../cache/leader-readiness-gate.js';
import {
  BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
} from '../bootstrap-api-constants.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
  resolveMembershipJoinIntentType,
} from '../../control-plane/membership-lifecycle-controller.js';

const BOOTSTRAP_REQUIRED_LEADER_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.TABLES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.MESSAGE_GROUPS,
  TABLES.REPLICA_OPERATIONS,
  TABLES.NODE_ENDPOINTS,
  TABLES.CONFIG,
]);

const TRAFFIC_REQUIRED_LEADER_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.TABLES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.NODE_ENDPOINTS,
]);

class ServiceLeaderReadinessOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getPartitionServices() {
    return this.delegates.getPartitionServices?.() || null;
  }

  getBootstrapService() {
    return this.delegates.getBootstrapService?.() || null;
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getLeaderReadinessStatusForProbe() {
    const systemTableCache = this.getSystemTableCache();
    if (!systemTableCache) {
      return {ready: false};
    }

    const missing = this.normalizeLeaderStatusForRequiredTables(
      this.getMissingServiceLeaders(),
      TRAFFIC_REQUIRED_LEADER_TABLES,
    );
    const blockingMissing = this.getBlockingLeaderStatusForReadiness(missing);

    return this.buildLeaderStatusResult(
      this.countMissingLeaderInfo(blockingMissing) === NUM.ZERO,
      blockingMissing,
      missing,
    );
  }

  async waitForPartitionLeaders() {
    const bootstrapService = this.getBootstrapService();
    if (typeof bootstrapService?.waitForPartitionLeadership === TYPEOF.FUNCTION) {
      await bootstrapService.waitForPartitionLeadership();
      return;
    }

    const services = this.getPartitionServices();
    if (!services || services.size === NUM.ZERO) {
      return;
    }

    const partitionIds = new Set();
    for (const service of services.values()) {
      if (service?.partitionId) {
        partitionIds.add(service.partitionId);
      }
    }
    if (partitionIds.size === NUM.ZERO) {
      return;
    }

    const configuredTimeoutMs = bootstrapService?.config?.leadershipWaitTimeoutMs;
    const timeoutMs = Math.min(
      configuredTimeoutMs || BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS,
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS,
    );
    let delay = bootstrapService?.config?.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS;
    const maxDelay = bootstrapService?.config?.leadershipWaitMaxDelayMs ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS;
    const backoff = bootstrapService?.config?.leadershipWaitBackoffMultiplier ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const leaders = this.getSystemPartitionLeaders();
      if (Object.keys(leaders).length > NUM.ZERO) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoff, maxDelay);
    }
  }

  getMissingServiceLeaders() {
    const override = this.delegates.getMissingServiceLeaders?.();
    if (override) {
      return override;
    }

    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    return getMissingSystemServiceLeaders(systemTableCache, {
      requireLeaderNodeId: true,
    });
  }

  getLeaderReadinessPartitionSets() {
    return this.getLeaderReadinessPartitionSetsForTables(
      BOOTSTRAP_REQUIRED_LEADER_TABLES,
    );
  }

  getLeaderReadinessPartitionSetsForTables(requiredTablesList = []) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const partitions = systemTableCache.getAll(TABLES.PARTITIONS) || [];

    const knownPartitionIds = new Set();
    const requiredPartitionIds = new Set();
    const requiredTables = new Set(requiredTablesList);

    for (const partition of partitions) {
      const partitionId = partition[COLUMN.PARTITION_ID];
      if (!partitionId) {
        continue;
      }
      knownPartitionIds.add(partitionId);

      const tableName = partition[COLUMN.TABLE_ID] || partition.table_name;
      if (requiredTables.has(tableName)) {
        requiredPartitionIds.add(partitionId);
      }
    }

    return {knownPartitionIds, requiredPartitionIds};
  }

  filterMissingRequiredPartitionIds(
      partitionIds = [],
      requiredTablesList = BOOTSTRAP_REQUIRED_LEADER_TABLES,
  ) {
    if (!Array.isArray(partitionIds) || partitionIds.length === NUM.ZERO) {
      return [];
    }

    const {
      knownPartitionIds,
      requiredPartitionIds,
    } = this.getLeaderReadinessPartitionSetsForTables(requiredTablesList);

    if (knownPartitionIds.size === NUM.ZERO || requiredPartitionIds.size === NUM.ZERO) {
      return partitionIds;
    }

    return partitionIds.filter((partitionId) =>
      !knownPartitionIds.has(partitionId) || requiredPartitionIds.has(partitionId),
    );
  }

  getCachedLeaderMetadataByServiceType(serviceType, idColumn) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const ownerRecords = getOwnerRecords(systemTableCache, serviceType);
    const metadata = new Map();

    for (const ownerRecord of ownerRecords) {
      const entityId = ownerRecord?.[idColumn];
      if (!entityId) {
        continue;
      }
      const {
        leaderNodeId,
        leaderService,
      } = resolveCanonicalLeaderService(
        systemTableCache,
        serviceType,
        entityId,
      );
      metadata.set(entityId, {
        hasLeaderRecord: Boolean(leaderNodeId && leaderService),
        hasNodeId: Boolean(leaderNodeId),
        hasAddress: Boolean(leaderService?.[COLUMN.ADDRESS]),
      });
    }

    return metadata;
  }

  isLiveServiceLeader(service) {
    if (!service) {
      return false;
    }

    const role = typeof service.getRole === TYPEOF.FUNCTION ?
      service.getRole() :
      service.role;
    return service.isLeader === true ||
      role === RAFT_ROLE.LEADER ||
      (typeof service.isLeaderReplica === TYPEOF.FUNCTION &&
        service.isLeaderReplica());
  }

  normalizeLeaderStatusForRequiredTables(
      missing = {},
      requiredTablesList = BOOTSTRAP_REQUIRED_LEADER_TABLES,
  ) {
    const cachedPartitionLeaders = this.getCachedLeaderMetadataByServiceType(
      SERVICE_TYPE.PARTITION,
      COLUMN.PARTITION_ID,
    );
    const cachedMessageGroupLeaders = this.getCachedLeaderMetadataByServiceType(
      SERVICE_TYPE.MESSAGE_GROUP,
      COLUMN.GROUP_ID,
    );

    return {
      ...missing,
      missingPartitionLeaders: this.filterMissingRequiredPartitionIds(
        missing.missingPartitionLeaders || [],
        requiredTablesList,
      ).filter((partitionId) => {
        const cached = cachedPartitionLeaders.get(partitionId);
        return !cached || !cached.hasLeaderRecord;
      }),
      missingPartitionLeaderNodes: this.filterMissingRequiredPartitionIds(
        missing.missingPartitionLeaderNodes || [],
        requiredTablesList,
      ).filter((partitionId) => {
        const cached = cachedPartitionLeaders.get(partitionId);
        return !cached || !cached.hasLeaderRecord || !cached.hasNodeId;
      }),
      missingPartitionLeaderAddresses: this.filterMissingRequiredPartitionIds(
        missing.missingPartitionLeaderAddresses || [],
        requiredTablesList,
      ).filter((partitionId) => {
        const cached = cachedPartitionLeaders.get(partitionId);
        return !cached || !cached.hasLeaderRecord || !cached.hasAddress;
      }),
      missingMessageGroupLeaders:
        (missing.missingMessageGroupLeaders || []).filter((groupId) => {
          const cached = cachedMessageGroupLeaders.get(groupId);
          return !cached || !cached.hasLeaderRecord;
        }),
      missingMessageGroupLeaderNodes:
        (missing.missingMessageGroupLeaderNodes || []).filter((groupId) => {
          const cached = cachedMessageGroupLeaders.get(groupId);
          return !cached || !cached.hasLeaderRecord || !cached.hasNodeId;
        }),
      missingMessageGroupLeaderAddresses:
        (missing.missingMessageGroupLeaderAddresses || []).filter((groupId) => {
          const cached = cachedMessageGroupLeaders.get(groupId);
          return !cached || !cached.hasLeaderRecord || !cached.hasAddress;
        }),
    };
  }

  getBlockingLeaderStatusForReadiness(missing = {}) {
    return {
      ...missing,
      missingMessageGroupLeaders: [],
      missingMessageGroupLeaderNodes: [],
      missingMessageGroupLeaderAddresses: [],
    };
  }

  resolveRequiredLeaderTables(options = {}) {
    return resolveMembershipJoinIntentType(options.startupMode) ===
      MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY ?
      TRAFFIC_REQUIRED_LEADER_TABLES :
      BOOTSTRAP_REQUIRED_LEADER_TABLES;
  }

  async waitForServiceLeaders(options = {}) {
    const requiredTables = this.resolveRequiredLeaderTables(options);
    const missing = this.normalizeLeaderStatusForRequiredTables(
      this.getMissingServiceLeaders(),
      requiredTables,
    );
    const blockingMissing = this.getBlockingLeaderStatusForReadiness(missing);
    const missingCount = this.countMissingLeaderInfo(blockingMissing);
    const ready = missingCount === NUM.ZERO;

    if (ready) {
      this.getLogger().info(
        BOOTSTRAP_API_LOG_MSG.LEADERS_READY || 'All service leaders ready',
        {
          seedNodeId: this.getSeedNodeId(),
          elapsedMs: NUM.ZERO,
        },
      );
    } else {
      this.getLogger().debug(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, {
        seedNodeId: this.getSeedNodeId(),
        missingCount,
        ...blockingMissing,
        nonBlockingMissingMessageGroupLeaders:
          missing.missingMessageGroupLeaders || [],
        nonBlockingMissingMessageGroupLeaderNodes:
          missing.missingMessageGroupLeaderNodes || [],
        nonBlockingMissingMessageGroupLeaderAddresses:
          missing.missingMessageGroupLeaderAddresses || [],
      });
    }

    return this.buildLeaderStatusResult(ready, missing, missing);
  }

  countMissingLeaderInfo(missing) {
    return getMissingSystemServiceLeaderCount(missing);
  }

  getSystemPartitionLeaders() {
    const leaders = {};
    const partitionServices = this.getPartitionServices();

    if (partitionServices && partitionServices.size > NUM.ZERO) {
      for (const service of partitionServices.values()) {
        const tableName = service.tableId || service.tableName;
        if (!tableName || leaders[tableName] || !this.isLiveServiceLeader(service)) {
          continue;
        }

        const nodeId = service.nodeId || this.getSeedNodeId();
        const replicaId = service.replicaId || service.service_id;
        const address = service.unifiedAddress ||
          `${nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` +
          `${ADDRESS.SEPARATOR}${replicaId}`;

        leaders[tableName] = {
          partitionId: service.partitionId,
          replicaId,
          nodeId,
          address,
        };
      }

      if (Object.keys(leaders).length > NUM.ZERO) {
        return leaders;
      }
    }

    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const partitions = systemTableCache.getAll(TABLES.PARTITIONS) || [];

    for (const partition of partitions) {
      const tableName = partition.table_id || partition.table_name;
      if (!tableName || leaders[tableName]) {
        continue;
      }

      const {
        leaderNodeId,
        leaderService,
      } = resolveCanonicalLeaderService(
        systemTableCache,
        SERVICE_TYPE.PARTITION,
        partition[COLUMN.PARTITION_ID],
      );

      if (!leaderService) {
        continue;
      }

      leaders[tableName] = {
        partitionId: partition[COLUMN.PARTITION_ID],
        replicaId: leaderService[COLUMN.REPLICA_ID] ||
          leaderService[COLUMN.SERVICE_ID],
        nodeId: leaderNodeId,
        address: leaderService[COLUMN.ADDRESS],
      };
    }

    return leaders;
  }

  buildLeaderStatusResult(ready, resultMissing = {}, fullMissing = resultMissing) {
    return {
      ready,
      ...resultMissing,
      nonBlockingMissingMessageGroupLeaders:
        fullMissing.missingMessageGroupLeaders || [],
      nonBlockingMissingMessageGroupLeaderNodes:
        fullMissing.missingMessageGroupLeaderNodes || [],
      nonBlockingMissingMessageGroupLeaderAddresses:
        fullMissing.missingMessageGroupLeaderAddresses || [],
    };
  }
}

export {
  BOOTSTRAP_REQUIRED_LEADER_TABLES,
  ServiceLeaderReadinessOwner,
  TRAFFIC_REQUIRED_LEADER_TABLES,
};
