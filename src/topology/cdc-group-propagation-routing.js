import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {LATENCY_GROUP_STATE} from './latency-topology-constants.js';
import {CDC_GROUP_PROPAGATION_REASON} from './cdc-group-propagation-constants.js';

function buildGroupedContextResult(sourceGroupId, targets, fallbackReason) {
  return {
    sourceGroupId,
    targets,
    fallbackReason,
  };
}

function resolveActiveMessageGroupServices(options = {}) {
  const rowPredicate =
    typeof options.predicate === 'function' ? options.predicate : null;
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

function sortCoordinatorCandidates(services) {
  return [...services].sort((left, right) => {
    const leftLeader = left?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
    const rightLeader = right?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
    if (leftLeader && !rightLeader) {
      return -1;
    }
    if (!leftLeader && rightLeader) {
      return 1;
    }
    const leftServiceId = left?.[COLUMN.SERVICE_ID] || '';
    const rightServiceId = right?.[COLUMN.SERVICE_ID] || '';
    if (leftServiceId < rightServiceId) {
      return -1;
    }
    if (leftServiceId > rightServiceId) {
      return 1;
    }
    return 0;
  });
}

function resolveCoordinatorService(options = {}) {
  const services = resolveActiveMessageGroupServices({
    systemTableCache: options.systemTableCache,
    predicate: (serviceRow) => serviceRow?.[COLUMN.NODE_ID] === options.coordinatorNodeId,
  });
  if (services.length === 0) {
    return null;
  }
  const sorted = sortCoordinatorCandidates(services);
  return sorted[0] ?? null;
}

function observedServiceRoute(service, systemTableCache) {
  const node = systemTableCache.get(TABLES.NODES, service[COLUMN.NODE_ID]);
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

function resolveMessageGroupId(serviceRow, options = {}) {
  const explicitGroupId = serviceRow?.[COLUMN.GROUP_ID];
  if (typeof explicitGroupId === 'string' && explicitGroupId.length > 0) {
    return explicitGroupId;
  }
  const serviceId = serviceRow?.[COLUMN.SERVICE_ID];
  if (typeof serviceId !== 'string' || serviceId.length === 0) {
    return null;
  }
  const replicaSuffix = String(options.messageGroupReplicaSuffix || '').trim();
  if (replicaSuffix.length === 0) {
    return null;
  }
  const replicaSuffixIndex = serviceId.lastIndexOf(replicaSuffix);
  if (replicaSuffixIndex <= 0) {
    return null;
  }
  return serviceId.slice(0, replicaSuffixIndex);
}

function buildSafeTargets(options = {}) {
  const services = resolveActiveMessageGroupServices({
    systemTableCache: options.systemTableCache,
  });
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

  const orderedGroupIds = [...servicesByGroupId.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const targets = [];
  for (const groupId of orderedGroupIds) {
    if (options.sourceGroupId && groupId === options.sourceGroupId) {
      continue;
    }
    const selectedService = sortCoordinatorCandidates(servicesByGroupId.get(groupId))[0];
    if (!selectedService) {
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

function buildGroupedContext(options = {}) {
  const localNode = options.systemTableCache.get(TABLES.NODES, options.nodeId);
  const sourceGroupId = localNode?.[COLUMN.LATENCY_GROUP_ID] || null;
  if (!sourceGroupId) {
    return buildGroupedContextResult(
      sourceGroupId,
      [],
      CDC_GROUP_PROPAGATION_REASON.MISSING_LOCAL_GROUP,
    );
  }

  const activeGroups = options.systemTableCache
    .getAll(TABLES.LATENCY_GROUPS)
    .filter((groupRow) => {
      const groupId = groupRow?.[COLUMN.GROUP_ID];
      const state = groupRow?.[COLUMN.STATE];
      if (!groupId) {
        return false;
      }
      return !state || state === LATENCY_GROUP_STATE.ACTIVE;
    });
  if (activeGroups.length === 0) {
    return buildGroupedContextResult(
      sourceGroupId,
      [],
      CDC_GROUP_PROPAGATION_REASON.MISSING_ACTIVE_GROUPS,
    );
  }

  const targetOrder = options.latencyTreeService.getRoutingOrder(sourceGroupId);
  const groupById = new Map(activeGroups.map((groupRow) => [groupRow[COLUMN.GROUP_ID], groupRow]));
  const orderedTargetIds = targetOrder.filter((groupId) => groupId !== sourceGroupId);
  const targets = [];

  for (const groupId of orderedTargetIds) {
    const groupRow = groupById.get(groupId);
    if (!groupRow) {
      continue;
    }
    const coordinatorNodeId = groupRow?.[COLUMN.COORDINATOR_NODE_ID];
    if (!coordinatorNodeId) {
      return buildGroupedContextResult(
        sourceGroupId,
        [],
        CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_NODE,
      );
    }
    const service = resolveCoordinatorService({
      coordinatorNodeId,
      systemTableCache: options.systemTableCache,
    });
    if (!service) {
      return buildGroupedContextResult(
        sourceGroupId,
        [],
        CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
      );
    }
    targets.push({
      groupId,
      coordinatorNodeId,
      address: service[COLUMN.ADDRESS],
      ...observedServiceRoute(service, options.systemTableCache),
    });
  }

  if (
    targets.length > 0 &&
    (!options.messageRouter || typeof options.messageRouter.deliver !== 'function')
  ) {
    return buildGroupedContextResult(
      sourceGroupId,
      [],
      CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE,
    );
  }

  return buildGroupedContextResult(sourceGroupId, targets, null);
}

export {
  buildGroupedContext,
  buildSafeTargets,
};
