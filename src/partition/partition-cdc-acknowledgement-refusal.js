// What the CDC delivery owner does with an acknowledgement batch the
// partition refused terminally (CDC delivery finding F1, 2026-11-11). Before,
// every such refusal set `lane.held` and nothing cleared it inside the
// leadership tenure: the owed ledger filled to OWED_MAX_EVENTS plus the
// retirement reserve and stayed there until a leader change.
//
// A refusal is a decision: committed refusals were consumed without a write on
// every replica, a pre-proposal refusal never entered consensus. Either way
// the batch's members are still owed in the ledger, so the lane forgets the
// batch (its command, its pending identities and its acknowledgement scan) and
// the next drive rebuilds acknowledgements from the committed ledger. What the
// refusal says about the lane decides the named outcome:
//
// - RE_DERIVED: the lane's identity of a member disagreed with the ledger
//   (UNKNOWN_EVENT, POSITION_MISMATCH, an IDENTITY_COMPACTED its own progress
//   cannot explain: all name the position), or the batch's bytes were not in
//   the pinned form (BYTES_INVALID, before or after proposal). The lane's view
//   was stale or mis-built; the ledger is the authority. Clearing event: the
//   refusal itself (the lane drives again at once).
// - QUARANTINED{position}: the same position is refused again after the lane
//   re-derived it from the ledger in this tenure - the ledger contradicts its
//   own owed read there (storage corruption) - or a member's own one-member
//   acknowledgement is refused before proposal after a re-derivation. That
//   position is never named again in this tenure; every other row is still
//   acknowledged. It stays owed (nothing is marked delivered without its
//   identity), so decision D1's prefix reclamation stops below it: the rows
//   above it are delivered and retained up to RETAINED_DELIVERED_MAX, after
//   which acknowledgement backpressures. Raised once as an error and named in
//   the lane diagnostics. A new tenure re-derives it once more.
// - LANE_HELD: the lane's own identity is wrong - the command names another
//   partition (IDENTITY_MISMATCH), its origin is refused (ORIGIN_REFUSED), or
//   a re-derived batch is refused for its bytes while every member alone is
//   admissible (the batch builder itself is broken). Nothing this lane builds
//   can be valid, so the lane is the affected scope; a new tenure clears it.
import {admitCommittedCommand} from './partition-committed-command-admission.js';
import {groupsOfMembers} from './partition-cdc-obligation-lane.js';
import {PARTITION_CDC_OBLIGATION_FAILURE_CODE as CODE,
  PARTITION_CDC_OBLIGATION_ORIGIN as ORIGIN} from './partition-cdc-obligation-constants.js';
import {buildCdcAcknowledgementCommand, countCdcObligations} from
  './partition-cdc-obligation-ledger.js';

const ACKNOWLEDGEMENT_REFUSAL_OUTCOME = Object.freeze({
  RE_DERIVED: 're_derived',
  QUARANTINED: 'quarantined',
  LANE_HELD: 'lane_held',
});

const ACKNOWLEDGEMENT_REFUSAL_LOG_MSG = Object.freeze({
  [ACKNOWLEDGEMENT_REFUSAL_OUTCOME.RE_DERIVED]: 'CDC acknowledgement refused terminally: the ' +
    'lane re-derives it from the committed ledger',
  [ACKNOWLEDGEMENT_REFUSAL_OUTCOME.QUARANTINED]: 'CDC obligation quarantined: the ledger ' +
    'contradicts its own owed read at this position; it stays owed and is no longer ' +
    'acknowledged in this tenure',
  [ACKNOWLEDGEMENT_REFUSAL_OUTCOME.LANE_HELD]: 'CDC acknowledgement lane held: the lane\'s own ' +
    'identity or builder is refused; a new leadership tenure clears it',
});

// The refusals that name the position the ledger disagreed at.
const POSITION_REFUSALS = Object.freeze(new Set([CODE.UNKNOWN_EVENT, CODE.POSITION_MISMATCH,
  CODE.IDENTITY_COMPACTED]));
const BYTE_REFUSALS = Object.freeze(new Set([CODE.BYTES_INVALID]));
const LANE_REFUSALS = Object.freeze(new Set([CODE.IDENTITY_MISMATCH, CODE.ORIGIN_REFUSED]));

/**
 * Whether a refusal code is one this owner resolves here (every other
 * refusal is transient and retried on the lane's backoff).
 * @param {string|null} failureCode - The refusal's code.
 * @return {boolean} Whether it is terminal for the batch.
 */
function isTerminalAcknowledgementRefusal(failureCode) {
  return POSITION_REFUSALS.has(failureCode) || BYTE_REFUSALS.has(failureCode) ||
    LANE_REFUSALS.has(failureCode);
}

const positionKeyOf = ({logIndex, ordinal}) => `${logIndex}:${ordinal}`;

function forgetBatch(lane, members, entryId) {
  if (entryId !== null) lane.commands.delete(entryId);
  for (const {eventKey} of members) lane.pending.delete(eventKey);
  lane.acknowledgedThrough = null;
}

function quarantine(lane, position, failureCode, eventKey) {
  lane.quarantined.set(positionKeyOf(position), Object.freeze({logIndex: position.logIndex,
    ordinal: position.ordinal, eventKey, failureCode}));
}

function positionOutcome(lane, refusal, members, failureCode) {
  const position = {logIndex: refusal.logIndex, ordinal: refusal.ordinal};
  const key = positionKeyOf(position);
  if (!lane.reDerived.byPosition.has(key)) {
    lane.reDerived.byPosition.add(key);
    return {outcome: ACKNOWLEDGEMENT_REFUSAL_OUTCOME.RE_DERIVED, positions: [position]};
  }
  const member = members.find((candidate) => candidate.logIndex === position.logIndex &&
    candidate.ordinal === position.ordinal) ?? null;
  quarantine(lane, position, failureCode, member?.eventKey ?? null);
  return {outcome: ACKNOWLEDGEMENT_REFUSAL_OUTCOME.QUARANTINED, positions: [position]};
}

// A member alone, in the pinned form, is admissible or not: a pure check of
// the admission owner (nothing is proposed).
function memberAdmissible(owner, member) {
  const command = buildCdcAcknowledgementCommand(owner.partitionId, groupsOfMembers([member]),
    {timestamp: '', proposedBy: owner.replicaId, proposedAt: 0});
  return admitCommittedCommand(command, {origin: ORIGIN.CDC_DELIVERY_OWNER}).admitted;
}

function byteOutcome(owner, lane, members, failureCode) {
  if (!members.some(({logIndex, ordinal}) =>
    lane.reDerived.byBytes.has(positionKeyOf({logIndex, ordinal})))) {
    for (const member of members) lane.reDerived.byBytes.add(positionKeyOf(member));
    return {outcome: ACKNOWLEDGEMENT_REFUSAL_OUTCOME.RE_DERIVED, positions: []};
  }
  const refused = members.filter((member) => !memberAdmissible(owner, member));
  if (refused.length === 0) {
    lane.held = failureCode;
    return {outcome: ACKNOWLEDGEMENT_REFUSAL_OUTCOME.LANE_HELD, positions: []};
  }
  for (const member of refused) quarantine(lane, member, failureCode, member.eventKey);
  return {outcome: ACKNOWLEDGEMENT_REFUSAL_OUTCOME.QUARANTINED,
    positions: refused.map(({logIndex, ordinal}) => ({logIndex, ordinal}))};
}

function decide(owner, lane, members, failureCode, refusal) {
  if (POSITION_REFUSALS.has(failureCode)) {
    return positionOutcome(lane, refusal, members, failureCode);
  }
  if (BYTE_REFUSALS.has(failureCode)) return byteOutcome(owner, lane, members, failureCode);
  lane.held = failureCode;
  return {outcome: ACKNOWLEDGEMENT_REFUSAL_OUTCOME.LANE_HELD, positions: []};
}

/**
 * Resolve one terminally refused acknowledgement batch: forget it, decide
 * the named outcome, raise it, and (unless the lane is held) let the lane
 * acknowledge again from the ledger.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {Object} refused - {members, entryId (null before proposal),
 *   failureCode, refusal: the answer's fields (logIndex, ordinal), proposed}.
 * @param {Function} resume - Drives the lane again.
 * @return {Object} Frozen {outcome: an ACKNOWLEDGEMENT_REFUSAL_OUTCOME, positions}.
 */
function resolveAcknowledgementRefusal(delivery, lane, refused, resume) {
  const {owner} = delivery;
  const {members, entryId, failureCode, refusal, proposed} = refused;
  forgetBatch(lane, members, entryId);
  const decision = decide(owner, lane, members, failureCode, refusal);
  owner.logger.error(ACKNOWLEDGEMENT_REFUSAL_LOG_MSG[decision.outcome], {
    partitionId: owner.partitionId, failureCode, proposed, entryId, events: members.length,
    positions: decision.positions, owed: countCdcObligations(owner.db).owed,
    quarantined: lane.quarantined.size});
  if (decision.outcome !== ACKNOWLEDGEMENT_REFUSAL_OUTCOME.LANE_HELD) resume();
  return Object.freeze(decision);
}

/**
 * The lane records what it re-derived per refusal path (lane.reDerived): a
 * position a position refusal named (byPosition), and the members of a batch
 * refused for its bytes (byBytes). The two never read each other: a position
 * refusal says nothing about a batch's bytes. An entry lives from the
 * re-derivation until the ledger commits that position delivered (here), at
 * the latest until the lane's tenure ends: a delivered position is never
 * named again, and a quarantined one stays owed and keeps its entry.
 * @param {Object} lane - The delivery lane.
 * @param {Object|undefined} position - {logIndex, ordinal}, when known.
 * @return {void}
 */
function forgetReDerived(lane, position) {
  if (position === undefined) return;
  const key = positionKeyOf(position);
  lane.reDerived.byPosition.delete(key);
  lane.reDerived.byBytes.delete(key);
}

// What an operator must see before a quarantined ledger head stops writes
// (design note S3.11, finding 4): the lane's acknowledgement alarm, part of
// the partition's CDC subscription diagnostics (the admin CDC diagnostics
// collection reports it per partition on every node).
const ACKNOWLEDGEMENT_ALARM_STATE = Object.freeze({
  NONE: 'none',
  QUARANTINED: ACKNOWLEDGEMENT_REFUSAL_OUTCOME.QUARANTINED,
  LANE_HELD: ACKNOWLEDGEMENT_REFUSAL_OUTCOME.LANE_HELD,
});

/**
 * The lane's acknowledgement alarm: LANE_HELD (nothing is acknowledged in this
 * tenure), QUARANTINED (the named positions stay owed; decision D1 reclaims
 * nothing above the lowest of them, so acknowledgement stops after
 * RETAINED_DELIVERED_MAX delivered rows and writes stop at the owed capacity),
 * or NONE.
 * @param {Object} lane - The delivery lane.
 * @return {Object} Frozen {state, held, quarantined}.
 */
function acknowledgementAlarmOf(lane) {
  const quarantined = Object.freeze([...lane.quarantined.values()]);
  const state = lane.held !== null ? ACKNOWLEDGEMENT_ALARM_STATE.LANE_HELD :
    quarantined.length > 0 ? ACKNOWLEDGEMENT_ALARM_STATE.QUARANTINED :
      ACKNOWLEDGEMENT_ALARM_STATE.NONE;
  return Object.freeze({state, held: lane.held, quarantined});
}

/**
 * Whether the lane may not acknowledge this owed row (it is quarantined).
 * @param {Object} lane - The delivery lane.
 * @param {Object} row - {logIndex, ordinal}.
 * @return {boolean} Whether it is quarantined.
 */
function isQuarantinedObligation(lane, row) {
  return lane.quarantined.has(positionKeyOf(row));
}

export {ACKNOWLEDGEMENT_REFUSAL_LOG_MSG, ACKNOWLEDGEMENT_REFUSAL_OUTCOME,
  acknowledgementAlarmOf, forgetReDerived, isQuarantinedObligation,
  isTerminalAcknowledgementRefusal, resolveAcknowledgementRefusal};
