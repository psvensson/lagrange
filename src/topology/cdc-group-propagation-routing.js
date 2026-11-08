import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {LATENCY_GROUP_STATE} from './latency-topology-constants.js';
import {
  CDC_GROUP_PROPAGATION_REASON,
  CDC_MESSAGE_GROUP_REPLICA_SUFFIX,
} from './cdc-group-propagation-constants.js';

const ROUTING_DOMAIN_GROUP = Object.freeze({
  DEGRADED: 'degraded',
  SYSTEM: 'system',
  RETIRED: 'retired',
  INACTIVE: 'inactive',
});

const INACTIVE_MESSAGE_GROUP_VALUES = new Set([
  ROUTING_DOMAIN_GROUP.RETIRED,
  ROUTING_DOMAIN_GROUP.INACTIVE,
  SERVICE_STATUS.STOPPED,
]);

function buildGroupedContextResult(sourceGroupId, targets, fallbackReason) {
  return {
    sourceGroupId,
    targets,
    fallbackReason,
  };
}

function buildUnroutableTarget(groupId, coordinatorNodeId = null) {
  return {
    groupId,
    coordinatorNodeId: coordinatorNodeId || null,
    address: null,
    serviceId: null,
    replicaId: null,
    serviceCreatedAt: null,
    createAttemptToken: null,
    nodeBootIncarnation: null,
  };
}

function resolveActiveMessageGroupServices(options = {}) {
  const rowPredicate =
    typeof options.predicate === 'function' ? options.predicate : null;
  if (typeof options.systemTableCache?.filter !== 'function') {
    return [];
  }
  return options.systemTableCache.filter(TABLES.SERVICES, (serviceRow) => {
    const isMessageGroup = serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    const isActive = serviceRow?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
    const hasAddress =
      typeof serviceRow?.[COLUMN.ADDRESS] === 'string' &&
      serviceRow[COLUMN.ADDRESS].length > 0;
    if (!isMessageGroup || !isActive || !hasAddress) {
      return false;
    }
    if (!rowPredicate) {
      return true;
    }
    return rowPredicate(serviceRow) === true;
  });
}

function isLeaderServiceRow(serviceRow) {
  return serviceRow?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
}

function compareServiceIds(left, right) {
  const leftServiceId = left?.[COLUMN.SERVICE_ID] || '';
  const rightServiceId = right?.[COLUMN.SERVICE_ID] || '';
  return leftServiceId.localeCompare(rightServiceId);
}

function compareCoordinatorCandidates(left, right) {
  const leftLeader = isLeaderServiceRow(left);
  const rightLeader = isLeaderServiceRow(right);
  if (leftLeader !== rightLeader) {
    return leftLeader ? -1 : 1;
  }
  return compareServiceIds(left, right);
}

function sortCoordinatorCandidates(services) {
  return [...services].sort(compareCoordinatorCandidates);
}

function resolveMessageGroupId(serviceRow, options = {}) {
  const explicitGroupId = serviceRow?.[COLUMN.GROUP_ID];
  if (typeof explicitGroupId === 'string' && explicitGroupId.length > 0) {
    return explicitGroupId;
  }
  const serviceId = serviceRow?.[COLUMN.SERVICE_ID];
  if (typeof serviceId !== 'string' || serviceId.length === 0) {
    return null;
  }
  const configuredSuffix =
    options.messageGroupReplicaSuffix ?? CDC_MESSAGE_GROUP_REPLICA_SUFFIX;
  const replicaSuffix = String(configuredSuffix || '').trim();
  if (replicaSuffix.length === 0) {
    return null;
  }
  const replicaSuffixIndex = serviceId.lastIndexOf(replicaSuffix);
  if (replicaSuffixIndex <= 0) {
    return null;
  }
  return serviceId.slice(0, replicaSuffixIndex);
}

function matchesCoordinatorService(serviceRow, options = {}) {
  if (serviceRow?.[COLUMN.NODE_ID] !== options.coordinatorNodeId) {
    return false;
  }
  if (!options.groupId) {
    return true;
  }
  const serviceGroupId = resolveMessageGroupId(serviceRow, {
    messageGroupReplicaSuffix: options.messageGroupReplicaSuffix,
  });
  return serviceGroupId === null || serviceGroupId === options.groupId;
}

function resolveCoordinatorService(options = {}) {
  const services = resolveActiveMessageGroupServices({
    systemTableCache: options.systemTableCache,
    predicate: (serviceRow) => matchesCoordinatorService(serviceRow, options),
  });
  if (services.length === 0) {
    return null;
  }
  const exactMatches = options.groupId ?
    services.filter(
      (serviceRow) =>
        resolveMessageGroupId(serviceRow, {
          messageGroupReplicaSuffix: options.messageGroupReplicaSuffix,
        }) === options.groupId,
    ) :
    [];
  const sorted = sortCoordinatorCandidates(
    exactMatches.length > 0 ? exactMatches : services,
  );
  return sorted[0] ?? null;
}

function observedServiceRoute(service, systemTableCache) {
  const node = systemTableCache?.get?.(TABLES.NODES, service[COLUMN.NODE_ID]);
  // These are existing owner-published lifetime facts, not a cache revision
  // or a guessed lease. Missing remote facts cannot establish a replacement.
  return {
    serviceId: service[COLUMN.SERVICE_ID] ?? null,
    replicaId: service[COLUMN.REPLICA_ID] ?? null,
    serviceCreatedAt: service[COLUMN.CREATED_AT] ?? null,
    createAttemptToken: service.create_attempt_token ?? null,
    nodeBootIncarnation: node?.[COLUMN.BOOT_INCARNATION] ?? null,
  };
}

function isValidTargetGroupId(groupId, sourceGroupId) {
  return (
    typeof groupId === 'string' &&
    groupId.length > 0 &&
    groupId !== ROUTING_DOMAIN_GROUP.SYSTEM &&
    groupId !== sourceGroupId
  );
}

function isEligibleLatencyGroupRow(groupRow) {
  const groupId = groupRow?.[COLUMN.GROUP_ID];
  if (typeof groupId !== 'string' || groupId.length === 0) {
    return false;
  }
  const groupValue = groupRow?.[COLUMN.STATE];
  return (
    !groupValue ||
    groupValue === LATENCY_GROUP_STATE.ACTIVE ||
    groupValue === LATENCY_GROUP_STATE.DEGRADED ||
    groupValue === ROUTING_DOMAIN_GROUP.DEGRADED
  );
}

function isEligibleMessageGroupRow(groupRow) {
  const groupId = groupRow?.[COLUMN.GROUP_ID];
  if (
    typeof groupId !== 'string' ||
    groupId.length === 0 ||
    groupId === ROUTING_DOMAIN_GROUP.SYSTEM
  ) {
    return false;
  }
  return (
    !INACTIVE_MESSAGE_GROUP_VALUES.has(groupRow?.[COLUMN.STATUS]) &&
    !INACTIVE_MESSAGE_GROUP_VALUES.has(groupRow?.[COLUMN.STATE])
  );
}

function collectActiveLatencyGroups(systemTableCache) {
  const rows = systemTableCache?.getAll?.(TABLES.LATENCY_GROUPS) || [];
  return rows.filter(isEligibleLatencyGroupRow);
}

function collectDrainingLatencyGroupIds(systemTableCache) {
  const rows = systemTableCache?.getAll?.(TABLES.LATENCY_GROUPS) || [];
  const drainingIds = new Set();
  for (const row of rows) {
    const groupId = row?.[COLUMN.GROUP_ID];
    if (
      typeof groupId === 'string' &&
      groupId.length > 0 &&
      row?.[COLUMN.STATE] === LATENCY_GROUP_STATE.DRAINING
    ) {
      drainingIds.add(groupId);
    }
  }
  return drainingIds;
}

function addTargetGroupId(groupIds, groupId, sourceGroupId) {
  if (isValidTargetGroupId(groupId, sourceGroupId)) {
    groupIds.add(groupId);
  }
}

function collectActiveMessageGroups(systemTableCache) {
  const rows = systemTableCache?.getAll?.(TABLES.MESSAGE_GROUPS) || [];
  return rows.filter(isEligibleMessageGroupRow);
}

function isActiveMessageGroupServiceRow(serviceRow) {
  return (
    serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
    serviceRow?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE
  );
}

function collectActiveServiceRows(systemTableCache) {
  if (typeof systemTableCache?.filter !== 'function') {
    return [];
  }
  return systemTableCache.filter(TABLES.SERVICES, isActiveMessageGroupServiceRow) || [];
}

function collectKnownMessageGroupDomain(options = {}) {
  const knownGroupIds = new Set();
  const groupIdsByNodeId = new Map();
  const recordNodeGroup = (nodeId, groupId) => {
    if (typeof groupId !== 'string' || groupId.length === 0) {
      return;
    }
    knownGroupIds.add(groupId);
    if (typeof nodeId === 'string' && nodeId.length > 0) {
      if (!groupIdsByNodeId.has(nodeId)) {
        groupIdsByNodeId.set(nodeId, new Set());
      }
      groupIdsByNodeId.get(nodeId).add(groupId);
    }
  };
  for (const row of collectActiveMessageGroups(options.systemTableCache)) {
    recordNodeGroup(row?.leader_node_id || null, row[COLUMN.GROUP_ID]);
  }
  for (const serviceRow of collectActiveServiceRows(options.systemTableCache)) {
    const groupId = resolveMessageGroupId(serviceRow, {
      messageGroupReplicaSuffix: options.messageGroupReplicaSuffix,
    });
    recordNodeGroup(serviceRow?.[COLUMN.NODE_ID] || null, groupId);
  }
  return {knownGroupIds, groupIdsByNodeId};
}

function resolveLatencyGroupTargetCandidates(row, options, domain) {
  const latencyGroupId = row[COLUMN.GROUP_ID];
  if (domain.knownGroupIds.has(latencyGroupId)) {
    return [latencyGroupId];
  }
  const coordinatorNodeId =
    row[COLUMN.COORDINATOR_NODE_ID] ||
    row[COLUMN.REPRESENTATIVE_NODE_ID] ||
    null;
  if (coordinatorNodeId && coordinatorNodeId === options.nodeId) {
    return [];
  }
  const coordinatorHostedGroups =
    coordinatorNodeId ? domain.groupIdsByNodeId.get(coordinatorNodeId) : null;
  if (coordinatorHostedGroups && coordinatorHostedGroups.size > 0) {
    return [...coordinatorHostedGroups];
  }
  return [latencyGroupId];
}

function collectCacheTargetGroupIds(options = {}, sourceGroupId = null) {
  const groupIds = new Set();
  const domain = collectKnownMessageGroupDomain(options);
  for (const groupId of domain.knownGroupIds) {
    addTargetGroupId(groupIds, groupId, sourceGroupId);
  }
  for (const row of collectActiveLatencyGroups(options.systemTableCache)) {
    for (const candidateGroupId of resolveLatencyGroupTargetCandidates(
      row,
      options,
      domain,
    )) {
      addTargetGroupId(groupIds, candidateGroupId, sourceGroupId);
    }
  }
  return groupIds;
}

function readRawRoutingOrder(options = {}, sourceGroupId = null) {
  if (typeof sourceGroupId !== 'string' || sourceGroupId.length === 0) {
    return [];
  }
  const rawOrder = options.latencyTreeService?.getRoutingOrder?.(sourceGroupId);
  return Array.isArray(rawOrder) ? rawOrder : [];
}

function collectRoutingOrderTargetGroupIds(options = {}, sourceGroupId = null) {
  const rawOrder = readRawRoutingOrder(options, sourceGroupId);
  const drainingIds = collectDrainingLatencyGroupIds(options.systemTableCache);
  const ordered = [];
  const seen = new Set();
  for (const groupId of rawOrder) {
    const canInclude =
      isValidTargetGroupId(groupId, sourceGroupId) &&
      !drainingIds.has(groupId) &&
      !seen.has(groupId);
    if (canInclude) {
      seen.add(groupId);
      ordered.push(groupId);
    }
  }
  return ordered;
}

function collectRequiredTargetGroupIds(options = {}, sourceGroupId = null) {
  const groupIds = collectCacheTargetGroupIds(options, sourceGroupId);
  for (const groupId of collectRoutingOrderTargetGroupIds(
    options,
    sourceGroupId,
  )) {
    groupIds.add(groupId);
  }
  return [...groupIds].sort((left, right) => left.localeCompare(right));
}

function collectOrderedGroupedTargetIds(options = {}, sourceGroupId = null) {
  const ordered = collectRoutingOrderTargetGroupIds(options, sourceGroupId);
  const seen = new Set(ordered);
  const cacheGroupIds = [...collectCacheTargetGroupIds(options, sourceGroupId)]
    .sort((left, right) => left.localeCompare(right));
  for (const groupId of cacheGroupIds) {
    if (!seen.has(groupId)) {
      seen.add(groupId);
      ordered.push(groupId);
    }
  }
  return ordered;
}

function indexServicesByGroupId(services, options = {}) {
  const servicesByGroupId = new Map();
  for (const serviceRow of services) {
    const groupId = resolveMessageGroupId(serviceRow, {
      messageGroupReplicaSuffix: options.messageGroupReplicaSuffix,
    });
    if (!groupId) {
      continue;
    }
    if (!servicesByGroupId.has(groupId)) {
      servicesByGroupId.set(groupId, []);
    }
    servicesByGroupId.get(groupId).push(serviceRow);
  }
  return servicesByGroupId;
}

function buildSafeTargets(options = {}) {
  const sourceGroupId =
    options.sourceGroupId ||
    options.systemTableCache?.get?.(TABLES.NODES, options.nodeId)?.[
      COLUMN.LATENCY_GROUP_ID
    ] ||
    null;
  const services = resolveActiveMessageGroupServices({
    systemTableCache: options.systemTableCache,
  });
  const servicesByGroupId = indexServicesByGroupId(services, options);
  const orderedGroupIds = collectRequiredTargetGroupIds(options, sourceGroupId);
  const targets = [];
  for (const groupId of orderedGroupIds) {
    const groupServices = servicesByGroupId.get(groupId) || [];
    const selectedService = sortCoordinatorCandidates(groupServices)[0] ?? null;
    if (!selectedService) {
      targets.push(buildUnroutableTarget(groupId));
      continue;
    }
    targets.push({
      groupId,
      coordinatorNodeId: selectedService[COLUMN.NODE_ID] || null,
      address: selectedService[COLUMN.ADDRESS],
      ...observedServiceRoute(selectedService, options.systemTableCache),
    });
  }
  return targets;
}

function resolveGroupedTargetEntry(groupId, groupById, routerDeliverable, options) {
  const groupRow = groupById.get(groupId) || null;
  const coordinatorNodeId = groupRow?.[COLUMN.COORDINATOR_NODE_ID] || null;
  if (!coordinatorNodeId) {
    return {
      fallbackCode: CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_NODE,
      target: buildUnroutableTarget(groupId, null),
    };
  }
  const service = resolveCoordinatorService({
    coordinatorNodeId,
    groupId,
    messageGroupReplicaSuffix: options.messageGroupReplicaSuffix,
    systemTableCache: options.systemTableCache,
  });
  if (!service) {
    return {
      fallbackCode: CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
      target: buildUnroutableTarget(groupId, coordinatorNodeId),
    };
  }
  if (!routerDeliverable) {
    return {
      fallbackCode: CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE,
      target: buildUnroutableTarget(groupId, coordinatorNodeId),
    };
  }
  return {
    fallbackCode: null,
    target: {
      groupId,
      coordinatorNodeId,
      address: service[COLUMN.ADDRESS],
      ...observedServiceRoute(service, options.systemTableCache),
    },
  };
}

function buildUnroutableTargetsForOrder(orderedTargetIds) {
  return orderedTargetIds.map((groupId) => buildUnroutableTarget(groupId));
}

function isMessageRouterDeliverable(messageRouter) {
  return Boolean(messageRouter && typeof messageRouter.deliver === 'function');
}

function resolveGroupedTargets(orderedTargetIds, activeGroups, options) {
  const routerDeliverable = isMessageRouterDeliverable(options.messageRouter);
  const groupById = new Map(
    activeGroups.map((groupRow) => [groupRow[COLUMN.GROUP_ID], groupRow]),
  );
  const targets = [];
  let firstFallbackCode = null;

  for (const groupId of orderedTargetIds) {
    const resolved = resolveGroupedTargetEntry(
      groupId,
      groupById,
      routerDeliverable,
      options,
    );
    if (firstFallbackCode === null && resolved.fallbackCode !== null) {
      firstFallbackCode = resolved.fallbackCode;
    }
    targets.push(resolved.target);
  }
  return {targets, firstFallbackCode};
}

function buildGroupedContext(options = {}, sourceGroupIdOverride = null) {
  const localNode = options.systemTableCache?.get?.(TABLES.NODES, options.nodeId);
  const sourceGroupId = localNode?.[COLUMN.LATENCY_GROUP_ID] || null;
  const orderedTargetIds = collectOrderedGroupedTargetIds(
    options,
    sourceGroupIdOverride || sourceGroupId,
  );
  if (!sourceGroupId) {
    return buildGroupedContextResult(
      sourceGroupId,
      buildUnroutableTargetsForOrder(orderedTargetIds),
      CDC_GROUP_PROPAGATION_REASON.MISSING_LOCAL_GROUP,
    );
  }

  const activeGroups = collectActiveLatencyGroups(options.systemTableCache);
  if (activeGroups.length === 0) {
    return buildGroupedContextResult(
      sourceGroupId,
      buildUnroutableTargetsForOrder(orderedTargetIds),
      CDC_GROUP_PROPAGATION_REASON.MISSING_ACTIVE_GROUPS,
    );
  }

  const {targets, firstFallbackCode} = resolveGroupedTargets(
    orderedTargetIds,
    activeGroups,
    options,
  );
  return buildGroupedContextResult(sourceGroupId, targets, firstFallbackCode);
}

export {
  buildGroupedContext,
  buildSafeTargets,
};
