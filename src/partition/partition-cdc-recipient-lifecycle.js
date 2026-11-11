// The two ways a recipient leaves a source lane's acknowledgement frontier
// (dead-recipient measures 2 and 3, owner ruling 2026-11-11). Both are
// recipient states of the lane (partition-cdc-obligation-constants.js); both
// are safe because of CDC Stage 3: a recipient that missed what was
// acknowledged without it answers its next range's predecessor with a gap and
// lists the table again from one leader image.
//
// - DETACHED{reason: lifecycle}: the recipient-domain lifecycle owner's
//   authoritative state says the group is retired (cdc-recipient-lifecycle.js).
//   Asked only for a target group that is held (or MUST_RELIST) while the
//   sender's cache no longer names it, or that is MUST_RELIST - the cache
//   omission is a trigger, never evidence. A detached group is shipped
//   nothing; if the lifecycle owner later says it is active and the sender's
//   cache names it, it is attached again as a new recipient (no cursor: its
//   first contact is the position probe or a range it gaps on).
// - MUST_RELIST: a recipient more than RELIST_LAG_ROWS owed rows behind its
//   cursor. A capacity decision in rows, never a clock. It stays required and
//   keeps being shipped to; the frontier passes it, so the ledger reclaims
//   past it, and it re-enters the frontier when it confirms a range again.
import {CDC_RECIPIENT_LIFECYCLE, readRecipientGroupLifecycle} from
  '../cdc/cdc-recipient-lifecycle.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_RECIPIENT_DETACH_REASON as DETACH_REASON,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE} from
  './partition-cdc-obligation-constants.js';
import {countOwedCdcObligationsAfter} from './partition-cdc-obligation-ledger.js';
import {laneIsCurrent} from './partition-cdc-obligation-lane.js';
import {laneRecipients, recipientAttached, recipientKeyOf} from
  './partition-cdc-obligation-progress.js';
import {custodyOf, holdsFrontier, recipientDriveOf} from './partition-cdc-recipient-drive.js';

const RECIPIENT_LIFECYCLE_LOG_MSG = Object.freeze({
  DETACHED: 'CDC recipient detached on lifecycle evidence: its group is retired',
  REATTACHED: 'CDC recipient attached again: its group is active; it starts with no position',
  MUST_RELIST: 'CDC recipient left the frontier as MUST_RELIST: it is too far behind; ' +
    'its next range answers a gap and it re-lists once',
});

// Only a target group of a bound propagation speaks source ranges and has a
// lifecycle: a branch's primary recipient (the source group, or a plain
// subscriber) never leaves the frontier.
function isTargetRecipient({branch, recipient}) {
  return branch.topology !== null && recipient !== branch.primary;
}

function omittedByPlan({branch, recipient}) {
  return !branch.topology.plannedGroupIds.has(recipient.groupId);
}

function detach(delivery, lane, target, lifecycle, ops) {
  const drive = recipientDriveOf(target.recipient);
  drive.state = RECIPIENT_STATE.DETACHED;
  drive.detachReason = DETACH_REASON.LIFECYCLE;
  drive.dueAtMs = null;
  custodyOf(delivery, recipientKeyOf(target.branch, target.recipient))
    .activeCdcInvocation?.retire();
  delivery.owner.logger.warn(RECIPIENT_LIFECYCLE_LOG_MSG.DETACHED, {
    partitionId: delivery.owner.partitionId, recipient: recipientKeyOf(target.branch,
      target.recipient), groupId: target.recipient.groupId, cursor: target.recipient.cursor,
    evidence: lifecycle});
  ops.frontierMoved(delivery, lane);
}

// A detached group the lifecycle owner says is active again is a new
// recipient: no cursor, no drive state.
function reattach(delivery, lane, target, lifecycle, ops) {
  target.recipient.cursor = null;
  target.recipient.drive = null;
  delivery.owner.logger.info(RECIPIENT_LIFECYCLE_LOG_MSG.REATTACHED, {
    partitionId: delivery.owner.partitionId, groupId: target.recipient.groupId,
    evidence: lifecycle});
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
  if (!isTargetRecipient(target)) return;
  const drive = recipientDriveOf(target.recipient);
  if (drive.lifecycleRead !== null) return;
  const read = readRecipientGroupLifecycle(delivery.owner.cdcIntegrationService ?? null,
    target.recipient.groupId);
  drive.lifecycleRead = read;
  ops.track(delivery, read.then((lifecycle) => {
    drive.lifecycleRead = null;
    if (!laneIsCurrent(delivery, lane) ||
        !recipientAttached(delivery, lane, target.branch, target.recipient)) return;
    if (lifecycle.state === CDC_RECIPIENT_LIFECYCLE.RETIRED &&
        drive.state !== RECIPIENT_STATE.DETACHED) {
      detach(delivery, lane, target, lifecycle, ops);
    } else if (lifecycle.state === CDC_RECIPIENT_LIFECYCLE.ACTIVE &&
        drive.state === RECIPIENT_STATE.DETACHED && !omittedByPlan(target)) {
      reattach(delivery, lane, target, lifecycle, ops);
    }
  }, () => {
    drive.lifecycleRead = null;
  }));
}

/**
 * Whether a held target recipient's state warrants asking its lifecycle: it
 * is MUST_RELIST, or the sender's cache no longer names its group.
 * @param {Object} target - {branch, recipient}.
 * @return {boolean} Whether to ask.
 */
function lifecycleQuestionDue(target) {
  if (!isTargetRecipient(target)) return false;
  const {state} = recipientDriveOf(target.recipient);
  if (state === RECIPIENT_STATE.DETACHED) return !omittedByPlan(target);
  return state === RECIPIENT_STATE.MUST_RELIST || omittedByPlan(target);
}

/**
 * Mark every target recipient more than RELIST_LAG_ROWS owed rows behind as
 * MUST_RELIST (it leaves the frontier and stays required). Read only while
 * the ledger owes more than that bound.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {Object} ops - The lane's operations.
 * @return {number} How many recipients were marked.
 */
function markRelistRecipients(delivery, lane, ops) {
  const {owner} = delivery;
  const limit = BOUND.RELIST_LAG_ROWS + 1;
  const owed = countOwedCdcObligationsAfter(owner.db, null, limit);
  if (owed <= BOUND.RELIST_LAG_ROWS) return 0;
  let marked = 0;
  for (const target of laneRecipients(lane)) {
    if (!isTargetRecipient(target) || !holdsFrontier(target.recipient)) continue;
    const lag = countOwedCdcObligationsAfter(owner.db, target.recipient.cursor, limit);
    if (lag <= BOUND.RELIST_LAG_ROWS) continue;
    recipientDriveOf(target.recipient).state = RECIPIENT_STATE.MUST_RELIST;
    marked += 1;
    owner.logger.warn(RECIPIENT_LIFECYCLE_LOG_MSG.MUST_RELIST, {
      partitionId: owner.partitionId, recipient: recipientKeyOf(target.branch, target.recipient),
      groupId: target.recipient.groupId, cursor: target.recipient.cursor,
      lagAtLeast: lag, owedAtLeast: owed, bound: BOUND.RELIST_LAG_ROWS});
    requestRecipientLifecycle(delivery, lane, target, ops);
  }
  return marked;
}

export {lifecycleQuestionDue, markRelistRecipients, requestRecipientLifecycle};
