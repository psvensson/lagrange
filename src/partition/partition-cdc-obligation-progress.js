// The obligation lane's recipients. The source ledger remains the owner of
// debt; this module keeps, for the lane's leadership tenure only, who must
// confirm it: one branch per current subscriber, and per branch its
// recipients - the subscriber itself (the primary recipient: for a
// propagation subscriber, the source message group) and each target group the
// topology owner observed for it. Every recipient has a volatile cursor: the
// ledger position through which it holds a committed receipt (null until its
// first). Nothing here is durable and nothing here retains an event body or a
// call: a new tenure rebuilds every recipient from the ledger, and the one
// durable progress fact stays the delivered flag a committed CDC_DELIVERED
// sets.
import {CDC_COMPLETION} from '../cdc/cdc-delivery-outcome.js';
import {scopeCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {cdcPropagationProgressCurrent, createCdcPropagationProgress,
  refreshCdcPropagationRoutes} from '../cdc/cdc-propagation-progress.js';
import {restartRecipient} from './partition-cdc-recipient-progress.js';

const RECIPIENT_KEY_SEPARATOR = '>';

// The primary recipient of a branch: the subscriber's own answer. Its group
// is the source group of the branch's propagation once one is bound.
function primaryRecipient() {
  return {groupId: null, route: null, cursor: null, drive: null};
}

function subscriberBranch(delivery, wrapper) {
  const original = delivery.getCDCSubscriberSource(wrapper);
  const subscription = delivery.owner.cdcSubscriberStates?.get(original);
  return {wrapper, original, subscription, epoch: subscription?.subscriptionEpoch,
    topology: null, releases: 0, primary: primaryRecipient()};
}

function subscriberBindingCurrent(delivery, branch) {
  return delivery.owner.cdcSubscribers.has(branch.wrapper) &&
    delivery.getCDCSubscriberSource(branch.wrapper) === branch.original &&
    delivery.owner.cdcSubscriberStates?.get(branch.original) === branch.subscription &&
    branch.subscription?.subscriptionEpoch === branch.epoch;
}

/**
 * Keep one branch per current subscriber: a subscriber that left, or whose
 * subscription changed, takes its recipients (and their cursors) with it; a
 * new one starts with an unknown cursor.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @return {Array<Object>} The current branches, in subscription order.
 */
function syncSubscriberBranches(delivery, lane) {
  for (const [wrapper, branch] of lane.branches) {
    if (subscriberBindingCurrent(delivery, branch)) continue;
    branch.topology?.unwatch();
    lane.branches.delete(wrapper);
  }
  for (const wrapper of delivery.owner.cdcSubscribers) {
    if (lane.branches.has(wrapper)) continue;
    lane.branches.set(wrapper, subscriberBranch(delivery, wrapper));
  }
  return [...lane.branches.values()];
}

// A bound propagation is current while its topology owner, its source group
// and their lifetimes are the ones observed, and while the subscriber still
// propagates through that source group; the check re-observes the plan, so a
// newly required group appears here as a new target recipient.
function topologyBindingCurrent(branch) {
  const {topology} = branch;
  if (topology === null) return true;
  return cdcPropagationProgressCurrent(topology) &&
    branch.original.getCDCPropagationService() === topology.source;
}

// A propagation that is no longer the one observed takes its recipient set
// with it: the next delivery observes it again, and every cursor starts
// unknown (re-delivery is idempotent). The released primary recipient is
// behind the owed tail; whoever re-observes starts it (startRecipientDrives).
function releaseStaleTopology(branch) {
  if (topologyBindingCurrent(branch)) return;
  releaseBranchTopology(branch);
}

// The released propagation stops watching its recipient domain. Its primary
// recipient is the next propagation's and starts again: nothing was shipped
// to it under that one yet (a detached primary returns as a new recipient).
function releaseBranchTopology(branch) {
  branch.topology.unwatch();
  branch.topology = null;
  restartRecipient(branch.primary);
  branch.releases += 1;
}

/**
 * Stop every branch's recipient-domain watch (the lane's tenure ended).
 * @param {Object} lane - The delivery lane.
 * @return {void}
 */
function releaseLaneTopologies(lane) {
  for (const branch of lane.branches.values()) branch.topology?.unwatch();
}

function recipientsOfBranch(branch) {
  return branch.topology === null ? [branch.primary] :
    [branch.primary, ...branch.topology.targets];
}

function recipientAttached(delivery, lane, branch, recipient) {
  return lane.branches.get(branch.wrapper) === branch &&
    subscriberBindingCurrent(delivery, branch) &&
    (recipient === branch.primary ||
      (branch.topology !== null && branch.topology.targets.includes(recipient)));
}

/**
 * Re-observe every branch's propagation: a newly required group becomes a
 * target recipient with an unknown cursor (so the frontier cannot pass a row
 * it has not confirmed), and a propagation that is no longer the one
 * observed is released. The caller starts the recipients this leaves behind
 * the owed tail (partition-cdc-recipient-drive.js, startRecipientDrives).
 * @param {Object} lane - The delivery lane.
 * @return {void}
 */
function reobserveLaneRecipients(lane) {
  for (const branch of lane.branches.values()) releaseStaleTopology(branch);
}

/**
 * Every recipient of the lane with its branch, in subscription order.
 * @param {Object} lane - The delivery lane.
 * @return {Array<Object>} {branch, recipient} pairs.
 */
function laneRecipients(lane) {
  const recipients = [];
  for (const branch of lane.branches.values()) {
    for (const recipient of recipientsOfBranch(branch)) recipients.push({branch, recipient});
  }
  return recipients;
}

// The stable name of a recipient: its subscriber, and for a target its group.
function recipientKeyOf(branch, recipient) {
  const subscriberId = branch.subscription?.subscriberId ?? null;
  return recipient === branch.primary ? `${subscriberId}` :
    `${subscriberId}${RECIPIENT_KEY_SEPARATOR}${recipient.groupId}`;
}

// A subscriber that binds a propagation answers which source group it
// propagates through now (getCDCPropagationService): that answer is what keeps
// the binding current, so binding without it is refused.
const CDC_TOPOLOGY_BINDING_ERROR = Object.freeze({
  CODE: 'cdc_topology_binding_without_propagation_port',
  MESSAGE: 'A CDC subscriber that binds a propagation must answer ' +
    'getCDCPropagationService (its current source message group)',
});

function requirePropagationPort(subscriber) {
  if (subscriber.getCDCPropagationService instanceof Function) return;
  throw Object.assign(new Error(CDC_TOPOLOGY_BINDING_ERROR.MESSAGE),
    {code: CDC_TOPOLOGY_BINDING_ERROR.CODE});
}

// The topology owner reports the recipient set it observed for a source
// group. Another owner or source group is another propagation: its recipients
// have confirmed nothing.
function bindBranchTopology(branch, owner, source, targets, onRecipientDomainChanged) {
  requirePropagationPort(branch.original);
  if (branch.topology !== null && (branch.topology.owner !== owner ||
      branch.topology.source !== source)) {
    releaseBranchTopology(branch);
  }
  if (branch.topology === null) {
    branch.topology = createCdcPropagationProgress(owner, source, targets,
      onRecipientDomainChanged);
  } else {
    refreshCdcPropagationRoutes(branch.topology, targets);
  }
}

/**
 * The invocation one recipient's delivery runs under: it names the recipient
 * group the topology owner must address (null: the source group) and the
 * source range the vector is shipped as (CDC Stage 3), receives the
 * recipient set that owner observed and answers the recipient's route.
 * @param {Object} context - The recipient's delivery invocation.
 * @param {Function} isCurrent - Whether the recipient is still the lane's.
 * @param {Object} branch - The recipient's branch.
 * @param {Object} recipient - The recipient.
 * @param {Object} hooks - {recipientsObserved: called after the set was
 *   bound, recipientDomainChanged: called when the sender's cache changes a
 *   recipient-domain table while the propagation is bound}.
 * @param {Object} sourceRange - The vector's source range.
 * @return {Object} The scoped invocation.
 */
function cdcRecipientInvocation(context, isCurrent, branch, recipient, hooks, sourceRange) {
  return scopeCdcDeliveryInvocation(context, isCurrent, (scoped) => ({
    recipientGroupId: recipient.groupId,
    sourceRange,
    // Answers the one route this recipient is delivered through: the lane's
    // observation after the reported set is bound (the primary has none).
    bindTopology: (owner, source, targets) => {
      scoped.assertCurrent();
      bindBranchTopology(branch, owner, source, targets, hooks.recipientDomainChanged);
      hooks.recipientsObserved();
      return recipient.route;
    },
  }));
}

// The group a recipient's committed receipt must name: the target group, or
// for the primary recipient the source group of the bound propagation (any
// group for a subscriber that binds none).
function receiptGroupOf(branch, recipient) {
  if (recipient.groupId !== null) return recipient.groupId;
  return branch.topology === null ? null : branch.topology.sourceGroupId;
}

function recordUncoveredSubscriberHint(state, answer) {
  const hint = answer?.retryAfterMs;
  if (Number.isFinite(hint) && hint > 0) {
    state.retryAfterMs = state.retryAfterMs === null ? hint : Math.min(state.retryAfterMs, hint);
  }
  if (answer?.error === CDC_COMPLETION.BACKPRESSURE) state.backpressured = true;
  if (answer?.error === CDC_COMPLETION.POSITION_GAP) state.positionGap = true;
}

// A recipient's answer that is neither committed nor provisional over the
// vector: the typed unknown, with the recipient's own backpressure hint.
function unconfirmedRecipientError(answer) {
  const state = {retryAfterMs: null, backpressured: false, positionGap: false};
  recordUncoveredSubscriberHint(state, answer);
  const error = new Error(state.positionGap ? CDC_COMPLETION.POSITION_GAP : CDC_COMPLETION.UNKNOWN);
  error.deferRetry = true;
  if (state.retryAfterMs !== null) error.retryAfterMs = state.retryAfterMs;
  if (state.backpressured) error.reason = CDC_COMPLETION.BACKPRESSURE;
  // A recipient that lacks the range's predecessor re-lists; its gap is
  // retried on the recipient's hint, as hinted backpressure.
  if (state.positionGap) error.reason = CDC_COMPLETION.POSITION_GAP;
  return error;
}

export {
  CDC_TOPOLOGY_BINDING_ERROR,
  cdcRecipientInvocation,
  laneRecipients,
  receiptGroupOf,
  recipientAttached,
  recipientKeyOf,
  releaseLaneTopologies,
  reobserveLaneRecipients,
  syncSubscriberBranches,
  unconfirmedRecipientError,
};
