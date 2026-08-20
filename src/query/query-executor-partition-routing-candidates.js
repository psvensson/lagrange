import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  COLUMN,
  LEADER_GAP_REASON_OWNER_MISSING,
  LEADER_GAP_REASON_SERVICE_MISSING,
  QUERY_EXECUTOR_LITERAL,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
  TABLES,
} = QUERY_EXECUTOR_SHARED;

const queryExecutorPartitionRoutingCandidateMethods = {
  /**
   * Resolve the routed service row that produced the current delivery target.
   * @param {Object|null} routingSnapshot
   * @param {Object|null} serviceInfo
   * @param {string|null} address
   * @return {Object|null}
   * @private
   */
  findRoutingSnapshotService(routingSnapshot, serviceInfo, address) {
    const serviceRows = Array.isArray(routingSnapshot?.serviceRows) ?
      routingSnapshot.serviceRows :
      [];
    const replicaId =
      typeof serviceInfo?.replicaId === 'string' &&
      serviceInfo.replicaId.length > 0 ?
        serviceInfo.replicaId :
        null;
    const nodeId =
      typeof serviceInfo?.nodeId === 'string' &&
      serviceInfo.nodeId.length > 0 ?
        serviceInfo.nodeId :
        null;
    const normalizedAddress =
      typeof address === 'string' && address.length > 0 ? address : null;
    for (const service of serviceRows) {
      if (
        replicaId &&
        (service?.service_id === replicaId || service?.replica_id === replicaId)
      ) {
        return service;
      }
      if (normalizedAddress && service?.address === normalizedAddress) {
        return service;
      }
    }
    if (nodeId) {
      return serviceRows.find((service) => service?.node_id === nodeId) || null;
    }
    return null;
  },

  /**
   * Get partition service candidates in preferred order.
   * @param {string} partitionId - Partition ID.
   * @param {boolean} forRead - True when executing read-only queries.
   * @return {Array<Object>} Ordered list of service info objects.
   * @private
   */
  getPartitionServiceCandidates(
    partitionId,
    forRead = false,
    preferLeader = false,
    preferSameLatencyGroup = false,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return this.resolvePartitionServiceCandidates(
      partitionId,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      routingReadinessDimension,
    ).candidates;
  },

  /**
   * Resolve ordered candidates together with the routing snapshot used to build
   * them so request paths can reuse the same owner evidence for retries.
   * @param {string} partitionId
   * @param {boolean} forRead
   * @param {boolean} preferLeader
   * @param {boolean} preferSameLatencyGroup
   * @param {string} routingReadinessDimension
   * @return {{candidates: Array<Object>, routingSnapshot: Object}}
   * @private
   */
  resolvePartitionServiceCandidates(
    partitionId,
    forRead = false,
    preferLeader = false,
    preferSameLatencyGroup = false,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
    routingOptions = {},
  ) {
    const allowPriorityRecoveryBootstrap =
      Object.prototype.hasOwnProperty.call(
        routingOptions,
        QUERY_EXECUTOR_ROUTING_OPTION_FIELD
          .ALLOW_PRIORITY_RECOVERY_BOOTSTRAP,
      ) ?
        routingOptions[
          QUERY_EXECUTOR_ROUTING_OPTION_FIELD
            .ALLOW_PRIORITY_RECOVERY_BOOTSTRAP
        ] === true :
        forRead === false;
    const resolvedRoutingOptions = {
      ...routingOptions,
      [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.ALLOW_PRIORITY_RECOVERY_BOOTSTRAP]:
        allowPriorityRecoveryBootstrap,
      [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.FOR_READ]: forRead,
    };
    const prioritizeLeader = preferLeader || !forRead;
    const routingSnapshot = this.getPartitionRoutingSnapshot(
      partitionId,
      routingReadinessDimension,
      resolvedRoutingOptions,
    );
    const services = routingSnapshot.routableServices;
    if (services.length === 0) {
      this.logPartitionRoutingDenial(routingSnapshot);
      return {
        candidates: [],
        routingSnapshot,
      };
    }
    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const orderedServices = this.orderServicesByLatencyGroup(
      services,
      localGroupId,
      forRead && preferSameLatencyGroup,
    );
    const canonicalLeaderNodeId = routingSnapshot.canonicalLeaderNodeId;
    const recoveryRoutingContract =
      this.resolveCanonicalLeaderGapRecoveryRoutingContract(
        partitionId,
        routingSnapshot,
        routingReadinessDimension,
        resolvedRoutingOptions?.allowReadinessAuthoritativeRefresh !== false,
      );
    const bootstrapLeaderServices =
      !forRead && !canonicalLeaderNodeId ?
        this.getFreshBootstrapLeaderServices(partitionId, orderedServices) :
        [];
    const candidates = [];
    const seen = new Set();
    const addService = (service) => {
      if (!service) {
        return;
      }
      if (
        this.isTemporarilyUnroutableAddress(
          partitionId,
          service.address,
          service,
        )
      ) {
        return;
      }
      const key = service.service_id || service.replica_id || service.address;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({
        address: service.address,
        nodeId: service.node_id,
        replicaId: service.service_id || service.replica_id,
      });
    };
    const canonicalLeaderServices = canonicalLeaderNodeId ?
      orderedServices.filter(
        (service) => service.node_id === canonicalLeaderNodeId,
      ) :
      [];
    const requireCanonicalLeader =
      forRead &&
      resolvedRoutingOptions?.[
        QUERY_EXECUTOR_ROUTING_OPTION_FIELD.REQUIRE_CANONICAL_LEADER
      ] === true;
    if (requireCanonicalLeader) {
      if (!canonicalLeaderNodeId) {
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_OWNER_MISSING,
          services: orderedServices,
          routingSnapshot,
        });
        return {candidates, routingSnapshot};
      }
      canonicalLeaderServices.forEach(addService);
      if (candidates.length === 0) {
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_SERVICE_MISSING,
          canonicalLeaderNodeId,
          services: orderedServices,
          routingSnapshot,
        });
      }
      return {candidates, routingSnapshot};
    }
    if (!forRead) {
      if (!canonicalLeaderNodeId) {
        if (bootstrapLeaderServices.length > 0) {
          bootstrapLeaderServices.forEach(addService);
          return {
            candidates,
            routingSnapshot,
          };
        }
        if (recoveryRoutingContract.recoveryCandidateWidening === true) {
          this.orderRecoveryCandidateServices(
            orderedServices,
            resolvedRoutingOptions,
          ).forEach(addService);
          if (candidates.length > 0) {
            return {
              candidates,
              routingSnapshot,
            };
          }
        }
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_OWNER_MISSING,
          services: orderedServices,
          routingSnapshot,
        });
        return {
          candidates: [],
          routingSnapshot,
        };
      }
      if (canonicalLeaderServices.length === 0) {
        if (recoveryRoutingContract.recoveryCandidateWidening === true) {
          this.orderRecoveryCandidateServices(
            orderedServices,
            resolvedRoutingOptions,
          ).forEach(addService);
          if (candidates.length > 0) {
            return {
              candidates,
              routingSnapshot,
            };
          }
        }
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_SERVICE_MISSING,
          canonicalLeaderNodeId,
          services: orderedServices,
          routingSnapshot,
        });
        return {
          candidates: [],
          routingSnapshot,
        };
      }
      canonicalLeaderServices.forEach(addService);
      if (candidates.length === 0) {
        // Canonical leader rows are present but were quarantined after runtime
        // no-handler witnesses. Try other live replicas to follow redirects.
        orderedServices.forEach(addService);
      }
      return {
        candidates,
        routingSnapshot,
      };
    }
    if (prioritizeLeader) {
      if (canonicalLeaderNodeId) {
        canonicalLeaderServices.forEach(addService);
      }
      orderedServices
        .filter((service) => service.node_id === this.nodeId)
        .forEach(addService);
    }
    orderedServices.forEach(addService);
    return {
      candidates,
      routingSnapshot,
    };
  },

  /**
   * Resolve node latency-group assignment from system cache.
   * @param {string} nodeId - Node ID.
   * @return {string|null}
   * @private
   */
  resolveNodeLatencyGroupId(nodeId) {
    if (
      !nodeId ||
      typeof this.systemCache?.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return null;
    }
    const nodeRow = this.systemCache.get(TABLES.NODES, nodeId);
    return nodeRow?.[COLUMN.LATENCY_GROUP_ID] || null;
  },

  /**
   * Sort services to prefer near replicas for read queries: the local
   * node first, then same-latency-group replicas, then the rest.
   * @param {Object[]} services - Routable services.
   * @param {string|null} localGroupId - Local node's latency group.
   * @param {boolean} enabled - Preference enabled flag.
   * @return {Object[]}
   * @private
   */
  orderServicesByLatencyGroup(services, localGroupId, enabled) {
    if (
      !enabled ||
      !localGroupId ||
      typeof this.systemCache?.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return services;
    }
    const localityRank = (service) => {
      if (service?.node_id === this.nodeId) {
        return 0;
      }
      const groupId = this.resolveNodeLatencyGroupId(service?.node_id);
      return groupId === localGroupId ? 1 : 2;
    };
    return [...services].sort(
      (left, right) => localityRank(left) - localityRank(right),
    );
  },

  resolveRecoveryCandidateSelectionOffset(services = [], selectionKey = null) {
    const serviceCount = Array.isArray(services) ? services.length : 0;
    if (
      serviceCount <= 1 ||
      typeof selectionKey !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      selectionKey.length === 0
    ) {
      return 0;
    }
    let hash = 0;
    for (
      let index = Math.min(1, selectionKey.length);
      index < selectionKey.length;
      index += 1
    ) {
      hash += selectionKey.charCodeAt(index);
    }
    return hash % serviceCount;
  },

  orderRecoveryCandidateServices(services = [], routingOptions = {}) {
    const offset = this.resolveRecoveryCandidateSelectionOffset(
      services,
      routingOptions?.recoveryCandidateSelectionKey || null,
    );
    if (offset === 0) {
      return services;
    }
    return [
      ...services.slice(offset),
      ...services.slice(0, offset),
    ];
  },
};

function installQueryExecutorPartitionRoutingCandidateMethods(target) {
  for (const [name, value] of Object.entries(
    queryExecutorPartitionRoutingCandidateMethods,
  )) {
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {installQueryExecutorPartitionRoutingCandidateMethods};
