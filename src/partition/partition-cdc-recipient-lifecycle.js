// The two ways a recipient leaves a source lane's acknowledgement frontier
// (dead-recipient measures 2 and 3, owner ruling 2026-11-11). Both are
// recipient states of the lane (partition-cdc-obligation-constants.js); both
// are safe because of CDC Stage 3: a recipient that missed what was
// acknowledged without it answers its next range's predecessor with a gap and
// lists the table again from one leader image.
//
// - DETACHED{reason: lifecycle}: the recipient-domain lifecycle owner's
//   authoritative state says the group is retired (cdc-recipient-lifecycle.js).
//   Asked only for a group that is held (or MUST_RELIST) while the sender's
//   cache no longer names it, or that is MUST_RELIST - the cache omission is
//   a trigger, never evidence. A detached group is shipped nothing; if the
//   lifecycle owner later says it is active and the sender's cache names it,
//   it is attached again as a new recipient (no cursor: its first contact is
//   the position probe or a range it gaps on).
// - MUST_RELIST: a recipient released by its progress state
//   (partition-cdc-recipient-progress.js, design note S3.11). It stays
//   required; the frontier passes it, so the ledger reclaims past it; its next
//   contact is a re-list offer that holds the ledger from its newest position.
//
// Both rules hold for every recipient of the propagation subscriber, its
// primary recipient (the source message group) as much as its target groups
// (finding F3, 2026-11-11): every one of them is a message group that is
// shipped source ranges and answers a missing predecessor with a gap, so every
// one returns through the same re-list. Only a recipient of a subscriber
// without the propagation role (none may register on a partition that
// records obligations) has no position and never leaves the frontier.
import {CDC_RECIPIENT_LIFECYCLE, readRecipientGroupLifecycle} from
  '../cdc/cdc-recipient-lifecycle.js';
import {PARTITION_SERVICE_CDC} from './partition-service-constants.js';
import {PARTITION_CDC_RECIPIENT_DETACH_REASON as DETACH_REASON,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE} from
  './partition-cdc-obligation-constants.js';
import {laneIsCurrent} from './partition-cdc-obligation-lane.js';
import {laneRecipients, receiptGroupOf, recipientAttached, recipientKeyOf} from
  './partition-cdc-obligation-progress.js';
import {custodyOf} from './partition-cdc-recipient-drive.js';
import {holdsFrontier, recipientDriveOf, releaseDueOf, releaseRecipient} from
  './partition-cdc-recipient-progress.js';

const RECIPIENT_LIFECYCLE_LOG_MSG = Object.freeze({
  DETACHED: 'CDC recipient detached on lifecycle evidence: its group is retired',
  REATTACHED: 'CDC recipient attached again: its group is active; it starts with no position',
});

// Every recipient of the propagation subscriber speaks source ranges.
function speaksSourceRanges({branch}) {
  return branch.subscription?.role === PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION;
}

// The group a recipient's lifecycle is read for: a target's own group, the
// primary's bound source group (none while its propagation is unbound).
function lifecycleGroupOf({branch, recipient}) {
  return speaksSourceRanges({branch}) ? receiptGroupOf(branch, recipient) : null;
}

// The source group is the plan's source; a target group is named by it or not.
function omittedByPlan({branch, recipient}) {
  return recipient !== branch.primary && !branch.topology.plannedGroupIds.has(recipient.groupId);
}

function detach(delivery, lane, target, lifecycle, ops) {
  const drive = recipientDriveOf(target.recipient);
  drive.state = RECIPIENT_STATE.DETACHED;
  drive.hold = null;
  drive.detachReason = DETACH_REASON.LIFECYCLE;
  drive.dueAtMs = null;
  custodyOf(delivery, recipientKeyOf(target.branch, target.recipient))
    .activeCdcInvocation?.retire();
  delivery.owner.logger.warn(RECIPIENT_LIFECYCLE_LOG_MSG.DETACHED, {
    partitionId: delivery.owner.partitionId, recipient: recipientKeyOf(target.branch,
      target.recipient), groupId: lifecycle.groupId, cursor: target.recipient.cursor,
    evidence: lifecycle});
  ops.frontierMoved(delivery, lane);
}

// A detached group the lifecycle owner says is active again is a new
// recipient: no cursor, no drive state.
function reattach(delivery, lane, target, lifecycle, ops) {
  target.recipient.cursor = null;
  target.recipient.drive = null;
  delivery.owner.logger.info(RECIPIENT_LIFECYCLE_LOG_MSG.REATTACHED, {
    partitionId: delivery.owner.partitionId, groupId: lifecycle.groupId, evidence: lifecycle});
  ops.recipientsObserved(delivery, lane);
}

/**
 * Ask the lifecycle owner about one target recipient, at most one read in
 * flight per recipient, and act on authoritative evidence only.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {Object} target - {branch, recipient}.
 * @param {Object} ops - The lane's operations.
 * @return {void}
 */
function requestRecipientLifecycle(delivery, lane, target, ops) {
  const groupId = lifecycleGroupOf(target);
  if (groupId === null) return;
  const drive = recipientDriveOf(target.recipient);
  if (drive.lifecycleRead !== null) return;
  const read = readRecipientGroupLifecycle(delivery.owner.cdcIntegrationService ?? null,
    groupId);
  drive.lifecycleRead = read;
  ops.track(delivery, read.then((lifecycle) => {
    drive.lifecycleRead = null;
    if (!laneIsCurrent(delivery, lane) ||
        !recipientAttached(delivery, lane, target.branch, target.recipient)) return;
    if (lifecycle.state === CDC_RECIPIENT_LIFECYCLE.STOPPED &&
        drive.state !== RECIPIENT_STATE.DETACHED) {
      detach(delivery, lane, target, lifecycle, ops);
    } else if (lifecycle.state === CDC_RECIPIENT_LIFECYCLE.ACTIVE &&
        drive.state === RECIPIENT_STATE.DETACHED && target.branch.topology !== null &&
        !omittedByPlan(target)) {
      reattach(delivery, lane, target, lifecycle, ops);
    }
  }, () => {
    drive.lifecycleRead = null;
  }));
}

/**
 * Whether a held recipient's state warrants asking its lifecycle: it is
 * MUST_RELIST, or the sender's cache no longer names its group.
 * @param {Object} target - {branch, recipient}.
 * @return {boolean} Whether to ask.
 */
function lifecycleQuestionDue(target) {
  if (lifecycleGroupOf(target) === null) return false;
  const {state} = recipientDriveOf(target.recipient);
  if (state === RECIPIENT_STATE.DETACHED) return !omittedByPlan(target);
  return state === RECIPIENT_STATE.MUST_RELIST || omittedByPlan(target);
}

/**
 * Release every recipient that speaks source ranges (the primary included)
 * whose progress state says so (partition-cdc-recipient-progress.js: a
 * recipient too far behind one of whose deliveries ended without a receipt,
 * a re-list hold past its row bound or deadline). Read whenever the frontier
 * is computed. A recipient nothing was shipped to yet is never released:
 * nobody received the rows it pins.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {Object} ops - The lane's operations.
 * @return {number} How many recipients were released.
 */
function releaseStalledRecipients(delivery, lane, ops) {
  const {owner} = delivery;
  const nowMs = owner.timeSource.now();
  let released = 0;
  for (const target of laneRecipients(lane)) {
    const drive = recipientDriveOf(target.recipient);
    if (!speaksSourceRanges(target) || !holdsFrontier(target.recipient) ||
        drive.state === RECIPIENT_STATE.NEVER_SHIPPED) continue;
    const due = releaseDueOf(owner, target.recipient, nowMs);
    if (due === null) continue;
    const {reason, ...detail} = due;
    releaseRecipient(delivery, target.recipient, reason, {...detail,
      recipient: recipientKeyOf(target.branch, target.recipient),
      groupId: receiptGroupOf(target.branch, target.recipient)});
    released += 1;
    requestRecipientLifecycle(delivery, lane, target, ops);
  }
  return released;
}

export {lifecycleQuestionDue, releaseStalledRecipients, requestRecipientLifecycle};
