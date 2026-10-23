// Canonical metadata for one captured propagation requirement. The source
// lane stores this between invocations; a direct caller's topology wave may
// store it only until that wave closes. There is no payload or timer here.
import {CDC_COMPLETION, CDC_COVERAGE_STATE, cdcCoverageState, completeCdcPropagation,
  emptyCdcCoverage, observeCdcCoverage} from './cdc-delivery-outcome.js';
import {captureDurablePropagationPlan} from '../topology/cdc-group-propagation-durable-plan.js';

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

function discardProvisionalCoverage(progress) {
  if (progress.sourceCoverage.state === CDC_COVERAGE_STATE.PROVISIONAL) {
    progress.sourceCoverage = emptyCdcCoverage();
  }
  for (const leaf of progress.targets) {
    if (leaf.coverage.state === CDC_COVERAGE_STATE.PROVISIONAL) {
      leaf.coverage = emptyCdcCoverage();
    }
  }
}

function refreshCdcPropagationRoutes(progress, targets, {fallback = false} = {}) {
  let requirementsChanged = false;
  for (const target of targets) {
    const leaf = progress.targets.find((entry) => entry.groupId === target.groupId);
    if (!leaf) {
      const route = observedRoute(target);
      progress.targets.push({groupId: target.groupId, route, preferredRoute: route,
        coverage: emptyCdcCoverage()});
      requirementsChanged = true;
      continue;
    }
    const comparison = fallback ? leaf.route : leaf.preferredRoute;
    if (sameObservedRoute(comparison, target)) continue;
    // Observed route replacement invalidates weak coverage. A native receipt
    // remains a fact of its captured group; omitted groups remain required.
    if (leaf.coverage.state === CDC_COVERAGE_STATE.PROVISIONAL) {
      leaf.coverage = emptyCdcCoverage();
    }
    leaf.route = observedRoute(target);
    if (!fallback) leaf.preferredRoute = leaf.route;
  }
  // The existing topology owner has exposed a larger obligation set. Native
  // receipts remain facts, while weak coverage must be observed for this set.
  if (requirementsChanged) discardProvisionalCoverage(progress);
}

function createCdcPropagationProgress(owner, source, targets) {
  const progress = {owner, source, lifetime: owner.durablePropagationLifetime,
    cache: owner.systemTableCache, tree: owner.latencyTreeService, router: owner.messageRouter,
    port: source.raft, sourceLifetime: source.cdcCommitLifetime,
    sourceGroupId: source.groupId, sourceCoverage: emptyCdcCoverage(), targets: [], nextLeaf: 0};
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

function cdcPropagationCoverage(progress, binding) {
  return cdcCoverageState([progress.sourceCoverage,
    ...progress.targets.map((leaf) => leaf.coverage)], binding);
}

function nextUncoveredLeaf(progress) {
  const count = progress.targets.length + 1;
  for (let visited = 0; visited < count; visited += 1) {
    const index = progress.nextLeaf;
    progress.nextLeaf = (index + 1) % count;
    const leaf = index === 0 ? progress : progress.targets[index - 1];
    const coverage = index === 0 ? progress.sourceCoverage : leaf.coverage;
    if (coverage.state === CDC_COVERAGE_STATE.UNCOVERED) {
      return Object.freeze({target: leaf, route: index === 0 ? null : leaf.route});
    }
  }
  return null;
}

function bindCdcPropagationProgress(context, progress, events) {
  const assertCurrent = () => {
    context.assertCurrent();
    if (!cdcPropagationProgressCurrent(progress)) {
      throw Object.assign(new Error(CDC_COMPLETION.UNKNOWN), {deferRetry: true});
    }
  };
  return Object.freeze({
    leafCount: () => progress.targets.length + 1,
    next: () => {
      assertCurrent();
      return nextUncoveredLeaf(progress);
    },
    isSource: (dispatch) => dispatch.target === progress,
    refreshRoutes: (targets, options) => {
      assertCurrent();
      refreshCdcPropagationRoutes(progress, targets, options);
    },
    observe: (dispatch, answer) => {
      assertCurrent();
      const leaf = dispatch.target;
      if (leaf === progress) {
        progress.sourceCoverage = observeCdcCoverage(answer, events, progress.sourceGroupId);
      } else if (progress.targets.includes(leaf)) {
        const coverage = observeCdcCoverage(answer, events, leaf.groupId, {transport: true});
        // A native receipt remains a fact of the captured group. Weak ingress
        // from a replaced route cannot cover the newly selected route.
        if (coverage.state === CDC_COVERAGE_STATE.COMMITTED || leaf.route === dispatch.route) {
          leaf.coverage = coverage;
        }
      } else {
        throw Object.assign(new Error(CDC_COMPLETION.INVALID), {deferRetry: true});
      }
    },
    result: () => {
      assertCurrent();
      return completeCdcPropagation(events, progress.sourceCoverage,
        progress.targets.map((leaf) => leaf.coverage), progress.sourceGroupId,
        progress.source.resolveStrictCdcForwardRetryAfterMs());
    },
  });
}

export {bindCdcPropagationProgress, cdcPropagationCoverage, cdcPropagationProgressCurrent,
  createCdcPropagationProgress, refreshCdcPropagationRoutes};
