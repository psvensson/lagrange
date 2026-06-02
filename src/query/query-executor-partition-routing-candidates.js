import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  COLUMN,
  LEADER_GAP_REASON_OWNER_MISSING,
  LEADER_GAP_REASON_SERVICE_MISSING,
  NUM,
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
      serviceInfo.replicaId.length > NUM.ZERO ?
        serviceInfo.replicaId :
        null;
    const nodeId =
      typeof serviceInfo?.nodeId === 'string' &&
      serviceInfo.nodeId.length > NUM.ZERO ?
        serviceInfo.nodeId :
        null;
    const normalizedAddress =
      typeof address === 'string' && address.length > NUM.ZERO ? address : null;
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
    if (services.length === NUM.ZERO) {
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
    if (!forRead) {
      if (!canonicalLeaderNodeId) {
        if (bootstrapLeaderServices.length > NUM.ZERO) {
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
          if (candidates.length > NUM.ZERO) {
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
      if (canonicalLeaderServices.length === NUM.ZERO) {
        if (recoveryRoutingContract.recoveryCandidateWidening === true) {
          this.orderRecoveryCandidateServices(
            orderedServices,
            resolvedRoutingOptions,
          ).forEach(addService);
          if (candidates.length > NUM.ZERO) {
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
      if (candidates.length === NUM.ZERO) {
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
   * Sort services to prefer same-group replicas for read queries.
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
    return [...services].sort((left, right) => {
      const leftGroupId = this.resolveNodeLatencyGroupId(left?.node_id);
      const rightGroupId = this.resolveNodeLatencyGroupId(right?.node_id);
      const leftPreferred = leftGroupId === localGroupId;
      const rightPreferred = rightGroupId === localGroupId;
      if (leftPreferred && !rightPreferred) {
        return NUM.NEGATIVE_ONE;
      }
      if (!leftPreferred && rightPreferred) {
        return NUM.ONE;
      }
      return NUM.ZERO;
    });
  },

  resolveRecoveryCandidateSelectionOffset(services = [], selectionKey = null) {
    const serviceCount = Array.isArray(services) ? services.length : NUM.ZERO;
    if (
      serviceCount <= NUM.ONE ||
      typeof selectionKey !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      selectionKey.length === NUM.ZERO
    ) {
      return NUM.ZERO;
    }
    let hash = NUM.ZERO;
    for (
      let index = Math.min(NUM.ONE, selectionKey.length);
      index < selectionKey.length;
      index += NUM.ONE
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
    if (offset === NUM.ZERO) {
      return services;
    }
    return [
      ...services.slice(offset),
      ...services.slice(NUM.ZERO, offset),
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
