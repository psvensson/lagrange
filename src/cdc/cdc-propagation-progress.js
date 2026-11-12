// Canonical metadata of the recipient set of one propagation source: the
// target groups the topology owner observed, each a leaf with its observed
// route and its volatile cursor (the ledger position through which that
// recipient holds a committed receipt; null until its first). The source lane
// stores this for its leadership tenure and attaches each leaf's drive state;
// a cursor is never durable: a new tenure starts every leaf again from the
// ledger. There is no payload or timer here.
import {TABLES} from '../constants/index.js';
import {captureDurablePropagationPlan} from '../topology/cdc-group-propagation-durable-plan.js';
import {
  collectKnownMessageGroupDomain,
  isPreActivationLatencyGroup,
  resolveLatencyGroupTargetCandidates,
} from '../topology/cdc-group-propagation-routing.js';

const OBSERVED_ROUTE_LIFETIME_FIELDS = Object.freeze([
  'serviceId', 'replicaId', 'serviceCreatedAt', 'createAttemptToken', 'nodeBootIncarnation',
]);

function observedRoute(target) {
  return Object.freeze({groupId: target.groupId, address: target.address,
    coordinatorNodeId: target.coordinatorNodeId,
    ...Object.fromEntries(OBSERVED_ROUTE_LIFETIME_FIELDS.map((field) =>
      [field, target[field] ?? null]))});
}

function sameObservedRoute(previous, target) {
  return previous.address === target.address &&
    previous.coordinatorNodeId === target.coordinatorNodeId &&
    OBSERVED_ROUTE_LIFETIME_FIELDS.every((field) =>
      target[field] === null || target[field] === undefined || previous[field] === target[field]);
}

function recipientLeaf(target) {
  return {groupId: target.groupId, route: observedRoute(target), cursor: null, drive: null};
}

function hasRouteAddress(routeOrTarget) {
  return typeof routeOrTarget?.address === 'string' && routeOrTarget.address.length > 0;
}

function transferInvalidLatencyBindings(progress, targets) {
  const systemTableCache = progress.cache;
  if (
    !systemTableCache ||
    progress.targets.length === 0 ||
    progress.targets.every((leaf) => hasRouteAddress(leaf.route))
  ) {
    return false;
  }
  const owner = progress.owner;
  const options = {
    systemTableCache,
    nodeId: owner?.nodeId ?? null,
    messageGroupReplicaSuffix: owner?.messageGroupReplicaSuffix ?? null,
  };
  const domain = collectKnownMessageGroupDomain(options);
  if (progress.targets.every((leaf) => domain.knownGroupIds.has(leaf.groupId))) {
    return false;
  }
  let changed = false;
  const retainedTargets = [];
  for (const leaf of progress.targets) {
    if (domain.knownGroupIds.has(leaf.groupId)) {
      retainedTargets.push(leaf);
      continue;
    }
    if (
      !hasRouteAddress(leaf.route) &&
      leaf.cursor === null &&
      !targets.some((t) => t.groupId === leaf.groupId) &&
      isPreActivationLatencyGroup(leaf.groupId, systemTableCache, domain)
    ) {
      changed = true;
      continue;
    }
    const candidates = resolveLatencyGroupTargetCandidates(leaf.groupId, options, domain);
    if (candidates.length === 0 || (candidates.length === 1 && candidates[0] === leaf.groupId)) {
      retainedTargets.push(leaf);
      continue;
    }
    changed = true;
    for (const candidateGroupId of candidates) {
      // A source is never its own target: the branch's primary recipient is
      // the source group, and no two recipients of a lane name one group.
      if (candidateGroupId === progress.sourceGroupId) continue;
      const existing =
        retainedTargets.find((entry) => entry.groupId === candidateGroupId) ||
        progress.targets.find((entry) => entry.groupId === candidateGroupId);
      if (!existing) {
        const matchingTarget = targets.find((t) => t.groupId === candidateGroupId);
        retainedTargets.push(recipientLeaf(
          matchingTarget ?? {groupId: candidateGroupId, address: null}));
      }
    }
  }
  if (changed) {
    progress.targets = retainedTargets;
  }
  return changed;
}

// Re-observation may add a required group (a new leaf, cursor unknown) or
// replace a leaf's route; an omitted group remains required. A route
// replacement keeps the cursor: a committed receipt is a fact of the group.
// It clears the leaf's backoff: the route it was refused on is gone, so the
// lane's next observation starts it at once.
function refreshCdcPropagationRoutes(progress, targets) {
  transferInvalidLatencyBindings(progress, targets);
  // The groups the topology owner names now: an omitted leaf stays required;
  // its omission is only a hint to ask the lifecycle owner (never evidence).
  progress.plannedGroupIds = new Set(targets.map((target) => target.groupId));
  for (const target of targets) {
    const leaf = progress.targets.find((entry) => entry.groupId === target.groupId);
    if (!leaf) {
      progress.targets.push(recipientLeaf(target));
      continue;
    }
    if (!hasRouteAddress(target) && hasRouteAddress(leaf.route)) continue;
    if (sameObservedRoute(leaf.route, target)) continue;
    leaf.route = observedRoute(target);
    if (leaf.drive) leaf.drive.dueAtMs = null;
  }
}

// The recipient-domain tables of the sender's cache: a change to any of them
// can add, retire or re-route a recipient group, so it wakes the source lane
// to re-observe its recipient set (CDC Stage 3: a group that becomes a
// recipient is contacted without waiting for the next owed row).
const RECIPIENT_DOMAIN_TABLES = Object.freeze(new Set([TABLES.SERVICES, TABLES.MESSAGE_GROUPS,
  TABLES.LATENCY_GROUPS, TABLES.NODES]));

function watchRecipientDomain(cache, onChanged) {
  const listener = (tableName) => {
    if (RECIPIENT_DOMAIN_TABLES.has(tableName)) onChanged();
  };
  cache.onCacheChange(listener);
  return () => cache.offCacheChange(listener);
}

function createCdcPropagationProgress(owner, source, targets, onRecipientDomainChanged) {
  const progress = {owner, source, lifetime: owner.durablePropagationLifetime,
    cache: owner.systemTableCache, tree: owner.latencyTreeService, router: owner.messageRouter,
    port: source.raft, sourceLifetime: source.cdcCommitLifetime,
    sourceGroupId: source.groupId, targets: [], plannedGroupIds: new Set(),
    unwatch: watchRecipientDomain(owner.systemTableCache, onRecipientDomainChanged)};
  refreshCdcPropagationRoutes(progress, targets);
  return progress;
}

function cdcPropagationProgressCurrent(progress) {
  const {owner, lifetime, source, port, sourceLifetime, sourceGroupId} = progress;
  const current = owner.durablePropagationLifetime === lifetime && !owner.isPropagationStopped() &&
    owner.systemTableCache === progress.cache && owner.latencyTreeService === progress.tree &&
    owner.messageRouter === progress.router &&
    !source.isShutdown && source.initialized !== false && source.raft === port &&
    source.cdcCommitLifetime === sourceLifetime &&
    source.groupId === sourceGroupId;
  if (!current) return false;
  const plan = captureDurablePropagationPlan(owner, source);
  if (plan.sourceMismatch) return false;
  refreshCdcPropagationRoutes(progress, plan.targets);
  return true;
}

export {cdcPropagationProgressCurrent, createCdcPropagationProgress,
  refreshCdcPropagationRoutes};
