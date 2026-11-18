import {COLUMN, NODE_STATE, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {LATENCY_GROUP_STATE} from './latency-topology-constants.js';
import {
  CDC_GROUP_PROPAGATION_REASON,
  CDC_MESSAGE_GROUP_REPLICA_SUFFIX,
} from './cdc-group-propagation-constants.js';

const ROUTING_DOMAIN_GROUP = Object.freeze({
  DEGRADED: 'degraded',
  SYSTEM: 'system',
});


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
    groupValue === ROUTING_DOMAIN_GROUP.DEGRADED
  );
}

// message_groups rows carry no lifecycle column (MESSAGE_GROUPS_SCHEMA): a
// group's retirement is its replica rows' (services), never this row's.
function isEligibleMessageGroupRow(groupRow) {
  const groupId = groupRow?.[COLUMN.GROUP_ID];
  return typeof groupId === 'string' && groupId.length > 0 &&
    groupId !== ROUTING_DOMAIN_GROUP.SYSTEM;
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
  const groupIdsByLatencyGroupId = new Map();
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
  const recordLatencyGroup = (latencyGroupId, groupId) => {
    if (typeof latencyGroupId !== 'string' || latencyGroupId.length === 0 ||
        typeof groupId !== 'string' || groupId.length === 0) {
      return;
    }
    if (!groupIdsByLatencyGroupId.has(latencyGroupId)) {
      groupIdsByLatencyGroupId.set(latencyGroupId, new Set());
    }
    groupIdsByLatencyGroupId.get(latencyGroupId).add(groupId);
  };
  for (const row of collectActiveMessageGroups(options.systemTableCache)) {
    recordNodeGroup(row?.leader_node_id || null, row[COLUMN.GROUP_ID]);
  }
  for (const serviceRow of collectActiveServiceRows(options.systemTableCache)) {
    const groupId = resolveMessageGroupId(serviceRow, {
      messageGroupReplicaSuffix: options.messageGroupReplicaSuffix,
    });
    const nodeId = serviceRow?.[COLUMN.NODE_ID] || null;
    recordNodeGroup(nodeId, groupId);
    if (nodeId && options.systemTableCache) {
      const nodeRow = options.systemTableCache.get?.(TABLES.NODES, nodeId);
      const latencyGroupId = nodeRow?.[COLUMN.LATENCY_GROUP_ID];
      recordLatencyGroup(latencyGroupId, groupId);
    }
  }
  for (const row of collectActiveLatencyGroups(options.systemTableCache)) {
    const latencyGroupId = row[COLUMN.GROUP_ID];
    const coordNodeId =
      row[COLUMN.COORDINATOR_NODE_ID] ||
      row[COLUMN.REPRESENTATIVE_NODE_ID] ||
      null;
    if (coordNodeId && groupIdsByNodeId.has(coordNodeId)) {
      for (const gid of groupIdsByNodeId.get(coordNodeId)) {
        recordLatencyGroup(latencyGroupId, gid);
      }
    }
  }
  return {knownGroupIds, groupIdsByNodeId, groupIdsByLatencyGroupId};
}

function resolveLatencyGroupRow(rowOrId, systemTableCache) {
  if (rowOrId && typeof rowOrId === 'object') {
    return rowOrId;
  }
  if (typeof rowOrId === 'string' && rowOrId.length > 0) {
    const cached = systemTableCache?.get?.(TABLES.LATENCY_GROUPS, rowOrId);
    if (cached) {
      return cached;
    }
    return collectActiveLatencyGroups(systemTableCache).find(
      (entry) => entry?.[COLUMN.GROUP_ID] === rowOrId,
    ) || null;
  }
  return null;
}

function resolveLatencyGroupTargetCandidates(rowOrId, options, domain) {
  if (!rowOrId) {
    return [];
  }
  const row = resolveLatencyGroupRow(rowOrId, options?.systemTableCache);
  const latencyGroupId = typeof rowOrId === 'string' ? rowOrId : row?.[COLUMN.GROUP_ID] || null;
  if (!latencyGroupId) {
    return [];
  }
  if (domain.knownGroupIds.has(latencyGroupId)) {
    return [latencyGroupId];
  }
  const coordinatorNodeId =
    row?.[COLUMN.COORDINATOR_NODE_ID] ||
    row?.[COLUMN.REPRESENTATIVE_NODE_ID] ||
    null;
  if (coordinatorNodeId && coordinatorNodeId === options.nodeId) {
    return [];
  }
  const coordinatorHostedGroups =
    coordinatorNodeId ? domain.groupIdsByNodeId.get(coordinatorNodeId) : null;
  if (coordinatorHostedGroups && coordinatorHostedGroups.size > 0) {
    return [...coordinatorHostedGroups].sort((left, right) => left.localeCompare(right));
  }
  const latencyHostedGroups =
    domain.groupIdsByLatencyGroupId?.get?.(latencyGroupId);
  if (latencyHostedGroups && latencyHostedGroups.size > 0) {
    return [...latencyHostedGroups].sort((left, right) => left.localeCompare(right));
  }
  return [];
}

function collectCacheTargetGroupIds(options = {}, sourceGroupId = null, domain = null) {
  const groupIds = new Set();
  const messageDomain = domain || collectKnownMessageGroupDomain(options);
  for (const groupId of messageDomain.knownGroupIds) {
    addTargetGroupId(groupIds, groupId, sourceGroupId);
  }
  for (const row of collectActiveLatencyGroups(options.systemTableCache)) {
    for (const candidateGroupId of resolveLatencyGroupTargetCandidates(
      row,
      options,
      messageDomain,
    )) {
      addTargetGroupId(groupIds, candidateGroupId, sourceGroupId);
    }
  }
  return groupIds;
}

function resolveSourceLatencyGroupId(options = {}, sourceGroupId = null) {
  const cache = options.systemTableCache;
  if (!cache) {
    return null;
  }
  if (typeof sourceGroupId === 'string' && sourceGroupId.length > 0) {
    const directLatencyRow = cache.get?.(TABLES.LATENCY_GROUPS, sourceGroupId);
    if (directLatencyRow) {
      return sourceGroupId;
    }
    const mgRow = cache.get?.(TABLES.MESSAGE_GROUPS, sourceGroupId);
    const leaderNodeId = mgRow?.leader_node_id;
    if (leaderNodeId) {
      const nodeRow = cache.get?.(TABLES.NODES, leaderNodeId);
      if (nodeRow?.[COLUMN.LATENCY_GROUP_ID]) {
        return nodeRow[COLUMN.LATENCY_GROUP_ID];
      }
    }
    const services = cache.filter?.(
      TABLES.SERVICES,
      (s) => s?.[COLUMN.GROUP_ID] === sourceGroupId ||
        s?.[COLUMN.SERVICE_ID]?.startsWith?.(sourceGroupId),
    ) || [];
    for (const service of services) {
      const serviceNodeId = service?.[COLUMN.NODE_ID];
      if (serviceNodeId) {
        const nodeRow = cache.get?.(TABLES.NODES, serviceNodeId);
        if (nodeRow?.[COLUMN.LATENCY_GROUP_ID]) {
          return nodeRow[COLUMN.LATENCY_GROUP_ID];
        }
      }
    }
    return sourceGroupId;
  }
  if (options.nodeId) {
    const localNode = cache.get?.(TABLES.NODES, options.nodeId);
    if (localNode?.[COLUMN.LATENCY_GROUP_ID]) {
      return localNode[COLUMN.LATENCY_GROUP_ID];
    }
  }
  return null;
}

function readRawRoutingOrder(options = {}, sourceGroupId = null) {
  const sourceLatencyGroupId = resolveSourceLatencyGroupId(options, sourceGroupId);
  const targetSourceId = sourceLatencyGroupId ||
    (typeof sourceGroupId === 'string' && sourceGroupId.length > 0 ? sourceGroupId : null);
  if (!targetSourceId) {
    return [];
  }
  const rawOrder = options.latencyTreeService?.getRoutingOrder?.(targetSourceId);
  return Array.isArray(rawOrder) ? rawOrder : [];
}

function collectRoutingOrderTargetGroupIds(options = {}, sourceGroupId = null, domain = null) {
  const rawOrder = readRawRoutingOrder(options, sourceGroupId);
  const drainingIds = collectDrainingLatencyGroupIds(options.systemTableCache);
  const messageDomain = domain || collectKnownMessageGroupDomain(options);
  const ordered = [];
  const seen = new Set();
  for (const rawGroupId of rawOrder) {
    if (drainingIds.has(rawGroupId)) {
      continue;
    }
    const candidates = resolveLatencyGroupTargetCandidates(
      rawGroupId,
      options,
      messageDomain,
    );
    for (const targetGroupId of candidates) {
      const canInclude =
        isValidTargetGroupId(targetGroupId, sourceGroupId) &&
        !seen.has(targetGroupId);
      if (canInclude) {
        seen.add(targetGroupId);
        ordered.push(targetGroupId);
      }
    }
  }
  return ordered;
}

function collectRequiredTargetGroupIds(options = {}, sourceGroupId = null, domain = null) {
  const messageDomain = domain || collectKnownMessageGroupDomain(options);
  const ordered = collectRoutingOrderTargetGroupIds(options, sourceGroupId, messageDomain);
  const seen = new Set(ordered);
  const cacheGroupIds = [...collectCacheTargetGroupIds(options, sourceGroupId, messageDomain)]
    .sort((left, right) => left.localeCompare(right));
  for (const groupId of cacheGroupIds) {
    if (!seen.has(groupId)) {
      seen.add(groupId);
      ordered.push(groupId);
    }
  }
  return ordered;
}

function collectOrderedGroupedTargetIds(options = {}, sourceGroupId = null, domain = null) {
  const messageDomain = domain || collectKnownMessageGroupDomain(options);
  const ordered = collectRoutingOrderTargetGroupIds(options, sourceGroupId, messageDomain);
  const seen = new Set(ordered);
  const cacheGroupIds = [...collectCacheTargetGroupIds(options, sourceGroupId, messageDomain)]
    .sort((left, right) => left.localeCompare(right));
  for (const groupId of cacheGroupIds) {
    if (!seen.has(groupId)) {
      seen.add(groupId);
      ordered.push(groupId);
    }
  }
  return ordered;
}

function isPreActivationLatencyGroup(rowOrId, systemTableCache, domain = null) {
  if (!systemTableCache) {
    return false;
  }
  const messageDomain = domain || collectKnownMessageGroupDomain({systemTableCache});
  const row = resolveLatencyGroupRow(rowOrId, systemTableCache);
  const groupId = typeof rowOrId === 'string' ? rowOrId : row?.[COLUMN.GROUP_ID] || null;
  if (groupId && messageDomain.knownGroupIds.has(groupId)) {
    return false;
  }
  const coordinatorNodeId =
    row?.[COLUMN.COORDINATOR_NODE_ID] ||
    row?.[COLUMN.REPRESENTATIVE_NODE_ID] ||
    null;
  if (coordinatorNodeId && messageDomain.groupIdsByNodeId.has(coordinatorNodeId)) {
    return false;
  }
  if (coordinatorNodeId) {
    const coordinatorNode = systemTableCache.get?.(TABLES.NODES, coordinatorNodeId);
    if (coordinatorNode?.[COLUMN.STATUS] === NODE_STATE.JOINING) {
      return true;
    }
  }
  const serviceRows = systemTableCache.filter?.(
    TABLES.SERVICES,
    (serviceRow) =>
      serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      ((groupId && serviceRow?.[COLUMN.GROUP_ID] === groupId) ||
        (coordinatorNodeId && serviceRow?.[COLUMN.NODE_ID] === coordinatorNodeId)),
  ) || [];
  if (serviceRows.length === 0) {
    return false;
  }
  return serviceRows.every(
    (serviceRow) => serviceRow?.[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE,
  );
}

function collectUnmappedLatencyGroupIds(options = {}, sourceGroupId = null, domain = null) {
  const unmapped = new Set();
  const messageDomain = domain || collectKnownMessageGroupDomain(options);
  const localLatencyGroupId =
    options.systemTableCache?.get?.(TABLES.NODES, options.nodeId)?.[
      COLUMN.LATENCY_GROUP_ID
    ] || null;
  const sourceLatencyGroupId = resolveSourceLatencyGroupId(options, sourceGroupId);
  const activeLatencyGroups = collectActiveLatencyGroups(options.systemTableCache);
  const drainingIds = collectDrainingLatencyGroupIds(options.systemTableCache);
  for (const row of activeLatencyGroups) {
    const groupId = row?.[COLUMN.GROUP_ID];
    if (!groupId || drainingIds.has(groupId)) {
      continue;
    }
    if (
      groupId === sourceGroupId ||
      groupId === localLatencyGroupId ||
      groupId === sourceLatencyGroupId
    ) {
      continue;
    }
    const coordinatorNodeId =
      row[COLUMN.COORDINATOR_NODE_ID] ||
      row[COLUMN.REPRESENTATIVE_NODE_ID] ||
      null;
    if (coordinatorNodeId && coordinatorNodeId === options.nodeId) {
      continue;
    }
    if (isPreActivationLatencyGroup(row, options.systemTableCache, messageDomain)) {
      continue;
    }
    const candidates = resolveLatencyGroupTargetCandidates(
      row,
      options,
      messageDomain,
    );
    if (candidates.length === 0) {
      unmapped.add(groupId);
    }
  }
  return unmapped;
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
  const domain = collectKnownMessageGroupDomain(options);
  const services = resolveActiveMessageGroupServices({
    systemTableCache: options.systemTableCache,
  });
  const servicesByGroupId = indexServicesByGroupId(services, options);
  const orderedGroupIds = collectRequiredTargetGroupIds(options, sourceGroupId, domain);
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
  const unmappedLatencyGroupIds = collectUnmappedLatencyGroupIds(
    options,
    sourceGroupId,
    domain,
  );
  for (const unmappedId of unmappedLatencyGroupIds) {
    targets.push(buildUnroutableTarget(unmappedId));
  }
  return targets;
}

function resolveGroupedTargetEntry(groupId, groupById, routerDeliverable, options, domain = null) {
  let groupRow = groupById.get(groupId) || null;
  if (!groupRow && domain && options.systemTableCache) {
    for (const [latencyGroupId, mgSet] of domain.groupIdsByLatencyGroupId?.entries?.() || []) {
      if (mgSet.has(groupId)) {
        groupRow = groupById.get(latencyGroupId) || null;
        if (groupRow) {
          break;
        }
      }
    }
    if (!groupRow) {
      const mgRow = options.systemTableCache.get?.(TABLES.MESSAGE_GROUPS, groupId);
      const leaderNodeId = mgRow?.leader_node_id;
      if (leaderNodeId) {
        const nodeRow = options.systemTableCache.get?.(TABLES.NODES, leaderNodeId);
        const latencyGroupId = nodeRow?.[COLUMN.LATENCY_GROUP_ID];
        groupRow = latencyGroupId ? groupById.get(latencyGroupId) : null;
      }
    }
  }
  let coordinatorNodeId =
    groupRow?.[COLUMN.COORDINATOR_NODE_ID] ||
    groupRow?.[COLUMN.REPRESENTATIVE_NODE_ID] ||
    null;
  if (!coordinatorNodeId && options.systemTableCache) {
    const mgRow = options.systemTableCache.get?.(TABLES.MESSAGE_GROUPS, groupId);
    coordinatorNodeId = mgRow?.leader_node_id || null;
  }
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

function resolveGroupedTargets(orderedTargetIds, activeGroups, options, domain = null) {
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
      domain,
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
  const localLatencyGroupId = localNode?.[COLUMN.LATENCY_GROUP_ID] || null;
  const domain = collectKnownMessageGroupDomain(options);
  const orderedTargetIds = collectOrderedGroupedTargetIds(
    options,
    sourceGroupIdOverride || localLatencyGroupId,
    domain,
  );
  if (!localLatencyGroupId) {
    return buildGroupedContextResult(
      null,
      buildUnroutableTargetsForOrder(orderedTargetIds),
      CDC_GROUP_PROPAGATION_REASON.MISSING_LOCAL_GROUP,
    );
  }

  const activeGroups = collectActiveLatencyGroups(options.systemTableCache);
  if (activeGroups.length === 0) {
    return buildGroupedContextResult(
      sourceGroupIdOverride || localLatencyGroupId,
      buildUnroutableTargetsForOrder(orderedTargetIds),
      CDC_GROUP_PROPAGATION_REASON.MISSING_ACTIVE_GROUPS,
    );
  }

  const sourceLatencyGroupId = resolveSourceLatencyGroupId(
    options,
    sourceGroupIdOverride || localLatencyGroupId,
  );
  if (sourceLatencyGroupId && sourceLatencyGroupId !== localLatencyGroupId) {
    return buildGroupedContextResult(
      localLatencyGroupId,
      buildUnroutableTargetsForOrder(orderedTargetIds),
      CDC_GROUP_PROPAGATION_REASON.SOURCE_GROUP_MISMATCH,
    );
  }

  const unmappedLatencyGroupIds = collectUnmappedLatencyGroupIds(
    options,
    sourceGroupIdOverride || localLatencyGroupId,
    domain,
  );
  const allTargetIds = [...orderedTargetIds];
  for (const unmappedId of unmappedLatencyGroupIds) {
    if (!allTargetIds.includes(unmappedId)) {
      allTargetIds.push(unmappedId);
    }
  }

  const {targets, firstFallbackCode} = resolveGroupedTargets(
    allTargetIds,
    activeGroups,
    options,
    domain,
  );
  return buildGroupedContextResult(
    sourceGroupIdOverride || localLatencyGroupId,
    targets,
    firstFallbackCode,
  );
}

export {
  ROUTING_DOMAIN_GROUP,
  buildGroupedContext,
  buildSafeTargets,
  collectKnownMessageGroupDomain,
  isPreActivationLatencyGroup,
  resolveLatencyGroupTargetCandidates,
  resolveMessageGroupId,
};
