// The obligation lane's one metadata-only continuation. The source ledger
// remains the owner of debt; this cell retains neither event bodies nor calls.
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

function prepareCdcObligationProgress(delivery, lane, event, subscribers) {
  const binding = cdcCommitWaitIdentity([event]);
  const previous = lane.currentObligation;
  if (previous?.binding === binding && cdcProgressCurrent(delivery, lane, previous)) {
    return previous;
  }
  const cell = {binding, branches: subscribers.map((subscriber) =>
    subscriberBinding(delivery, subscriber)), nextSubscriber: 0};
  lane.currentObligation = cell;
  return cell;
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

function cdcSubscriberInvocation(delivery, lane, cell, branch, context, event) {
  const operations = (scoped) => ({
    bindTopology: (owner, source, targets) => {
      scoped.assertCurrent();
      const progress = topologyProgressOf(lane, branch, owner, source, targets);
      scoped.assertCurrent();
      return bindCdcPropagationProgress(scoped, progress, [event]);
    },
  });
  return scopeCdcDeliveryInvocation(context,
    () => cdcProgressCurrent(delivery, lane, cell), operations);
}

function observeCdcSubscriber(branch, answer, event) {
  branch.coverage = observeCdcCoverage(answer, [event], branch.topology?.sourceGroupId ?? null);
}

function cdcObligationCoverage(cell) {
  return cdcCoverageState(cell.branches.map((branch) => branch.coverage), cell.binding);
}

export {cdcObligationCoverage, cdcProgressCurrent, cdcSubscriberInvocation, nextCdcSubscriber,
  observeCdcSubscriber, prepareCdcObligationProgress};
