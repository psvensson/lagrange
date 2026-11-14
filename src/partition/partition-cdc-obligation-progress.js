// The obligation lane's one metadata-only continuation. The source ledger
// remains the owner of debt; this cell retains neither event bodies nor calls:
// of the range it covers it keeps the vector digest, the first and last
// position, the row count and whether the shipping window cut it.
import {CDC_COMPLETION, CDC_COVERAGE_STATE, cdcCommitWaitIdentity, cdcCoverageState,
  emptyCdcCoverage, observeCdcCoverage} from
  '../cdc/cdc-delivery-outcome.js';
import {scopeCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {bindCdcPropagationProgress, cdcPropagationCoverage, cdcPropagationProgressCurrent,
  createCdcPropagationProgress, refreshCdcPropagationRoutes} from
  '../cdc/cdc-propagation-progress.js';

function progressError() {
  return Object.assign(new Error(CDC_COMPLETION.UNKNOWN), {code: CDC_COMPLETION.UNKNOWN,
    deferRetry: true});
}

function subscriberBinding(delivery, wrapper) {
  const original = delivery.getCDCSubscriberSource(wrapper);
  const subscription = delivery.owner.cdcSubscriberStates?.get(original);
  return {wrapper, original, subscription, epoch: subscription?.subscriptionEpoch,
    coverage: emptyCdcCoverage(), topology: null};
}

function subscriberBindingCurrent(delivery, branch) {
  return delivery.owner.cdcSubscribers.has(branch.wrapper) &&
    delivery.getCDCSubscriberSource(branch.wrapper) === branch.original &&
    delivery.owner.cdcSubscriberStates?.get(branch.original) === branch.subscription &&
    branch.subscription?.subscriptionEpoch === branch.epoch;
}

function topologyBindingCurrent(branch, binding) {
  const topology = branch.topology;
  if (topology === null) return true;
  if (!cdcPropagationProgressCurrent(topology)) return false;
  if (cdcPropagationCoverage(topology, binding) === CDC_COVERAGE_STATE.UNCOVERED) {
    branch.coverage = emptyCdcCoverage();
  }
  return typeof branch.original.getCDCPropagationService !== 'function' ||
    branch.original.getCDCPropagationService() === topology.source;
}

function cdcProgressCurrent(delivery, lane, cell) {
  return delivery.obligationLane === lane && lane.currentObligation === cell &&
    delivery.owner.isLeader && !delivery.owner.isShutdown &&
    delivery.owner.leadershipTenure === lane.tenure &&
    delivery.owner.cdcSubscribers.size === cell.branches.length &&
    cell.branches.every((branch) => subscriberBindingCurrent(delivery, branch) &&
      topologyBindingCurrent(branch, cell.binding));
}

function resolveObligationNumber(primary, fallback, defaultValue) {
  if (Number.isSafeInteger(primary)) return primary;
  return Number.isSafeInteger(fallback) ? fallback : defaultValue;
}

function eventPosition(event) {
  return {logIndex: resolveObligationNumber(event?.logIndex, event?.sourceLogIndex, null),
    ordinal: resolveObligationNumber(event?.ordinal, event?.sourceOrdinal, 0)};
}

// The cell of the range `events` is: the current one while it is bound to the
// same vector and every subscriber and topology binding is current (its leaf
// coverage is kept and covered leaves are not sent again), a new one otherwise.
function prepareCdcObligationProgress(delivery, lane, events, subscribers, windowCut) {
  const binding = cdcCommitWaitIdentity(events);
  const previous = lane.currentObligation;
  if (previous?.binding === binding && cdcProgressCurrent(delivery, lane, previous)) {
    return previous;
  }
  const cell = {binding, first: eventPosition(events[0]), last: eventPosition(events.at(-1)),
    rows: events.length, windowCut, branches: subscribers.map((subscriber) =>
      subscriberBinding(delivery, subscriber)), nextSubscriber: 0};
  lane.currentObligation = cell;
  return cell;
}

function coverageHeld(coverage) {
  return coverage.state !== CDC_COVERAGE_STATE.UNCOVERED;
}

// Whether any leaf of the cell is covered: a subscriber branch, or the source
// or a target leaf of a branch's topology progress. While one is, the lane
// presents the cell's range again unchanged instead of composing a longer one.
function cdcProgressHoldsCoverage(cell) {
  return cell.branches.some((branch) => coverageHeld(branch.coverage) ||
    (branch.topology !== null && (coverageHeld(branch.topology.sourceCoverage) ||
      branch.topology.targets.some((leaf) => coverageHeld(leaf.coverage)))));
}

function nextCdcSubscriber(cell) {
  const branch = cell.branches[cell.nextSubscriber];
  cell.nextSubscriber = (cell.nextSubscriber + 1) % cell.branches.length;
  return branch;
}

function topologyProgressOf(lane, branch, owner, source, targets) {
  if (branch.topology !== null && (branch.topology.owner !== owner ||
      branch.topology.source !== source)) {
    lane.currentObligation = null;
    throw progressError();
  }
  branch.topology ??= createCdcPropagationProgress(owner, source, targets);
  refreshCdcPropagationRoutes(branch.topology, targets);
  return branch.topology;
}

function registerLaneContentionOwner(
  delivery, lane, tableName, propagationOwner, onSliceTurnReady = null,
) {
  if (!propagationOwner || typeof tableName !== 'string' || tableName.length === 0) {
    return null;
  }
  if (!(lane.contendedPropagationOwners instanceof Map)) {
    lane.contendedPropagationOwners = new Map();
  }
  let owners = lane.contendedPropagationOwners.get(tableName);
  if (!(owners instanceof Set)) {
    owners = new Set();
    lane.contendedPropagationOwners.set(tableName, owners);
  }
  owners.add(propagationOwner);
  const isLive = () =>
    delivery.obligationLane === lane &&
    delivery.owner.isLeader &&
    !delivery.owner.isShutdown &&
    delivery.owner.leadershipTenure === lane.tenure &&
    lane.contendedPropagationOwners instanceof Map &&
    lane.contendedPropagationOwners.has(tableName);
  if (typeof onSliceTurnReady === 'function') {
    isLive.onSliceTurnReady = onSliceTurnReady;
  }
  return isLive;
}

function cdcSubscriberInvocation(
  delivery, lane, cell, branch, context, events, onSliceTurnReady = null,
) {
  const operations = (scoped) => ({
    bindTopology: (owner, source, targets) => {
      scoped.assertCurrent();
      const progress = topologyProgressOf(lane, branch, owner, source, targets);
      scoped.assertCurrent();
      return bindCdcPropagationProgress(scoped, progress, events);
    },
    registerContentionOwner: (propagationOwner, tableName = events[0].tableName) =>
      registerLaneContentionOwner(
        delivery, lane, tableName, propagationOwner, onSliceTurnReady,
      ),
  });
  return scopeCdcDeliveryInvocation(context,
    () => cdcProgressCurrent(delivery, lane, cell), operations);
}

function observeCdcSubscriber(branch, answer, events) {
  branch.coverage = observeCdcCoverage(answer, events, branch.topology?.sourceGroupId ?? null);
}

function cdcObligationCoverage(cell) {
  return cdcCoverageState(cell.branches.map((branch) => branch.coverage), cell.binding);
}

function recordUncoveredSubscriberHint(state, answer) {
  const hint = answer?.retryAfterMs;
  if (Number.isFinite(hint) && hint > 0) {
    state.retryAfterMs = state.retryAfterMs === null ? hint : Math.min(state.retryAfterMs, hint);
  }
  if (answer?.error === CDC_COMPLETION.BACKPRESSURE ||
      answer?.reason === CDC_COMPLETION.BACKPRESSURE) state.backpressured = true;
}

function throwUncoveredObligationError(lane, current, state) {
  if (!current) lane.currentObligation = null;
  const error = new Error(CDC_COMPLETION.UNKNOWN);
  error.deferRetry = true;
  if (state.retryAfterMs !== null) error.retryAfterMs = state.retryAfterMs;
  if (state.backpressured) error.reason = CDC_COMPLETION.BACKPRESSURE;
  throw error;
}

function releaseOwnersForTable(contendedTable, owners) {
  if (!(owners instanceof Set)) return;
  for (const propagationOwner of owners) {
    propagationOwner?.releaseDurableSliceContender?.(contendedTable);
  }
}

function releaseContendedPropagationOwners(lane, tableName = null) {
  const map = lane?.contendedPropagationOwners;
  if (!(map instanceof Map) || map.size === 0) return;
  if (typeof tableName === 'string' && tableName.length > 0) {
    releaseOwnersForTable(tableName, map.get(tableName));
    map.delete(tableName);
    return;
  }
  for (const [contendedTable, owners] of map.entries()) {
    releaseOwnersForTable(contendedTable, owners);
  }
  map.clear();
}

export {cdcObligationCoverage, cdcProgressCurrent, cdcProgressHoldsCoverage,
  cdcSubscriberInvocation, nextCdcSubscriber,
  observeCdcSubscriber, prepareCdcObligationProgress, recordUncoveredSubscriberHint,
  releaseContendedPropagationOwners, throwUncoveredObligationError};
