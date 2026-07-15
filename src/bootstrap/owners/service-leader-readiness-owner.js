import {assertCritical} from '../../utils/assert.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  SERVICE_TYPE,
  TABLES,
} from '../../constants/index.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {
  getMissingSystemServiceLeaderCount,
  getMissingSystemServiceLeaders,
  getOwnerRecords,
  resolveCanonicalLeaderService,
} from '../../cache/leader-readiness-gate.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../../cdc/cdc-integration-service.js';
import {getRemainingBudgetMs} from
  '../../control-plane/timeout-budget.js';
import {
  BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
} from '../bootstrap-api-constants.js';
import {
  isMembershipOwnerRestartReentryOutcome,
} from '../../control-plane/membership-lifecycle-controller.js';

const LOCAL_STR_ALL_SERVICE_LEADERS_READY = 'All service leaders ready';
const AUTHORITATIVE_LEADER_REFRESH_QUERY_TIMEOUT_MS = 1500;

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

const DURABLE_REJOIN_REQUIRED_LEADER_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
]);

function isLiveServiceLeader(service) {
  if (!service) {
    return false;
  }

  const role = typeof service.getRole === 'function' ?
    service.getRole() :
    service.role;
  return service.isLeader === true ||
    role === RAFT_ROLE.LEADER ||
    (typeof service.isLeaderReplica === 'function' &&
      service.isLeaderReplica());
}

function collectMissingPartitionIds(missing = {}) {
  return [...new Set([
    ...(missing.missingPartitionLeaders || []),
    ...(missing.missingPartitionLeaderNodes || []),
    ...(missing.missingPartitionLeaderAddresses || []),
  ])];
}

function buildAggregatePartitionReadQuery(tableName, partitionIds) {
  const placeholders = partitionIds.map(() => '?').join(', ');
  return `SELECT * FROM ${tableName} ` +
    `WHERE ${COLUMN.PARTITION_ID} IN (${placeholders})`;
}

function createAuthoritativeLeaderMetadataCache(partitions, services) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.PARTITIONS) {
        return partitions;
      }
      if (tableName === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };
}

function authoritativeLeaderReadsSucceeded(results) {
  return results.every((result) => result?.success === true);
}

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

  getAuthoritativeControlPlaneView() {
    return this.delegates.getAuthoritativeControlPlaneView?.() || null;
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
      this.countMissingLeaderInfo(blockingMissing) === 0,
      blockingMissing,
      missing,
    );
  }

  async waitForPartitionLeaders() {
    const bootstrapService = this.getBootstrapService();
    if (typeof bootstrapService?.waitForPartitionLeadership === 'function') {
      await bootstrapService.waitForPartitionLeadership();
      return;
    }

    const services = this.getPartitionServices();
    if (!services || services.size === 0) {
      return;
    }

    const partitionIds = new Set();
    for (const service of services.values()) {
      if (service?.partitionId) {
        partitionIds.add(service.partitionId);
      }
    }
    if (partitionIds.size === 0) {
      return;
    }

    const configuredTimeoutMs = bootstrapService?.config?.leadershipWaitTimeoutMs;
    const timeoutMs = Number.isFinite(configuredTimeoutMs) &&
      configuredTimeoutMs > 0 ?
      Math.floor(configuredTimeoutMs) :
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS;
    let delay = bootstrapService?.config?.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS;
    const maxDelay = bootstrapService?.config?.leadershipWaitMaxDelayMs ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS;
    const backoff = bootstrapService?.config?.leadershipWaitBackoffMultiplier ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const leaders = this.getSystemPartitionLeaders();
      if (Object.keys(leaders).length > 0) {
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
    if (!Array.isArray(partitionIds) || partitionIds.length === 0) {
      return [];
    }

    const {
      knownPartitionIds,
      requiredPartitionIds,
    } = this.getLeaderReadinessPartitionSetsForTables(requiredTablesList);

    if (knownPartitionIds.size === 0 || requiredPartitionIds.size === 0) {
      return partitionIds;
    }

    return partitionIds.filter((partitionId) =>
      !knownPartitionIds.has(partitionId) || requiredPartitionIds.has(partitionId),
    );
  }

  getCachedLeaderMetadataByServiceType(
    serviceType,
    idColumn,
    systemTableCache = this.getSystemTableCache(),
  ) {
    const resolvedSystemTableCache = assertCritical(
      systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const ownerRecords = getOwnerRecords(
      resolvedSystemTableCache,
      serviceType,
    );
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
        resolvedSystemTableCache,
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
    return isLiveServiceLeader(service);
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

  resolveAuthoritativeLeaderRefreshQueryTimeoutMs(options = {}) {
    const configuredTimeoutMs =
      Number.isFinite(options.queryTimeoutMs) && options.queryTimeoutMs > 0 ?
        Math.floor(options.queryTimeoutMs) :
        AUTHORITATIVE_LEADER_REFRESH_QUERY_TIMEOUT_MS;
    if (!options.timeoutBudget || typeof options.timeoutBudget !== 'object') {
      return configuredTimeoutMs;
    }
    const remainingBudgetMs = getRemainingBudgetMs(options.timeoutBudget);
    if (remainingBudgetMs <= 0) {
      return 0;
    }
    return Math.max(
      1,
      Math.min(configuredTimeoutMs, Math.floor(remainingBudgetMs)),
    );
  }

  applyAuthoritativePartitionLeaderMetadata(missing, metadata) {
    return {
      ...missing,
      missingPartitionLeaders:
        (missing.missingPartitionLeaders || []).filter((partitionId) => {
          return metadata.get(partitionId)?.hasLeaderRecord !== true;
        }),
      missingPartitionLeaderNodes:
        (missing.missingPartitionLeaderNodes || []).filter((partitionId) => {
          const leader = metadata.get(partitionId);
          return leader?.hasLeaderRecord !== true || leader.hasNodeId !== true;
        }),
      missingPartitionLeaderAddresses:
        (missing.missingPartitionLeaderAddresses || [])
          .filter((partitionId) => {
            const leader = metadata.get(partitionId);
            return leader?.hasLeaderRecord !== true ||
              leader.hasAddress !== true;
          }),
    };
  }

  async refreshAuthoritativePartitionLeaderStatus(missing, options = {}) {
    const partitionIds = collectMissingPartitionIds(missing);
    const authoritativeControlPlaneView =
      this.getAuthoritativeControlPlaneView();
    const queryTimeoutMs =
      this.resolveAuthoritativeLeaderRefreshQueryTimeoutMs(options);
    if (
      partitionIds.length === 0 ||
      typeof authoritativeControlPlaneView?.readRows !== 'function' ||
      queryTimeoutMs <= 0
    ) {
      return null;
    }

    const readOptions = {
      allowSqlFallback: false,
      replicaFallbackConsistency:
        LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
      queryTimeoutMs,
    };
    try {
      const results = await Promise.all([
        authoritativeControlPlaneView.readRows(
          TABLES.PARTITIONS,
          buildAggregatePartitionReadQuery(TABLES.PARTITIONS, partitionIds),
          [...partitionIds],
          readOptions,
        ),
        authoritativeControlPlaneView.readRows(
          TABLES.SERVICES,
          buildAggregatePartitionReadQuery(TABLES.SERVICES, partitionIds),
          [...partitionIds],
          readOptions,
        ),
      ]);
      if (!authoritativeLeaderReadsSucceeded(results)) {
        return null;
      }
      const [partitionResult, serviceResult] = results;

      const partitionIdSet = new Set(partitionIds);
      const partitions = (partitionResult.rows || []).filter((partition) =>
        partitionIdSet.has(partition?.[COLUMN.PARTITION_ID]),
      );
      const services = (serviceResult.rows || []).filter((service) =>
        service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
        partitionIdSet.has(service?.[COLUMN.PARTITION_ID]),
      );
      const metadataCache = createAuthoritativeLeaderMetadataCache(
        partitions,
        services,
      );
      const metadata = this.getCachedLeaderMetadataByServiceType(
        SERVICE_TYPE.PARTITION,
        COLUMN.PARTITION_ID,
        metadataCache,
      );
      return this.applyAuthoritativePartitionLeaderMetadata(missing, metadata);
    } catch (_error) {
      return null;
    }
  }

  resolveRequiredLeaderTables(options = {}) {
    return isMembershipOwnerRestartReentryOutcome({
      membershipOwnerOutcome: options.membershipOwnerOutcome,
      startupMode: options.startupMode,
    }) ?
      DURABLE_REJOIN_REQUIRED_LEADER_TABLES :
      BOOTSTRAP_REQUIRED_LEADER_TABLES;
  }

  async waitForServiceLeaders(options = {}) {
    const requiredTables = this.resolveRequiredLeaderTables(options);
    const cachedMissing = this.normalizeLeaderStatusForRequiredTables(
      this.getMissingServiceLeaders(),
      requiredTables,
    );
    const cachedBlockingMissing =
      this.getBlockingLeaderStatusForReadiness(cachedMissing);
    const authoritativeMissing =
      this.countMissingLeaderInfo(cachedBlockingMissing) === 0 ?
        null :
        await this.refreshAuthoritativePartitionLeaderStatus(
          cachedMissing,
          options,
        );
    const missing = authoritativeMissing || cachedMissing;
    const blockingMissing = this.getBlockingLeaderStatusForReadiness(missing);
    const missingCount = this.countMissingLeaderInfo(blockingMissing);
    const ready = missingCount === 0;

    if (ready) {
      this.getLogger().info(
        BOOTSTRAP_API_LOG_MSG.LEADERS_READY || LOCAL_STR_ALL_SERVICE_LEADERS_READY,
        {
          seedNodeId: this.getSeedNodeId(),
          elapsedMs: 0,
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

    if (partitionServices && partitionServices.size > 0) {
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

      if (Object.keys(leaders).length > 0) {
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
  DURABLE_REJOIN_REQUIRED_LEADER_TABLES,
  ServiceLeaderReadinessOwner,
  TRAFFIC_REQUIRED_LEADER_TABLES,
  isLiveServiceLeader,
};
