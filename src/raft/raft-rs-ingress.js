// The safety boundary around `step`: envelope and routing only.
//
// §6 of the binding direction, as corrected. The host validates what it can
// know authoritatively - that the envelope names a group and a partition,
// that this peer and this group are the intended recipient, that the payload
// decodes into the shape the binding parses - and raft-rs owns everything
// else. Raft's own checks are not reproduced here. What the schema does
// check beyond decoding is the shape raft-rs's own sender writes for each
// message type (a term present or absent, contiguous append entries, a
// forwarded proposal that is a port proposal, no type this binding never
// sends, positions the host carries exactly): raft-rs traps on, or commits
// for good, every shape it never writes, and a remote peer must never be
// able to crash the core (M5). None of it reads who the sender is.
//
// `admitRaftRsMessage` is given the envelope, the local group and the local
// peer. It is given NO core and NO handle, so it cannot read the receiver's
// applied configuration even if someone later wanted it to: the rule that
// drops legitimate membership-transition traffic is unreachable from here by
// construction, not by discipline.

import {
  RAFT_RS_ENTRY_TYPE,
} from './raft-rs-ready-loop-constants.js';
import {decodeCommittedProposal} from './raft-rs-proposal-codec.js';
import {
  RAFT_RS_ENTRY_POSITION_FIELDS,
  RAFT_RS_INGRESS_OUTCOME,
  RAFT_RS_INGRESS_REFUSAL,
  RAFT_RS_MESSAGE_TYPE_RANGE,
  RAFT_RS_MESSAGE_TYPE,
  RAFT_RS_PEER_ID_FIELDS,
  RAFT_RS_POSITION_FIELDS,
  RAFT_RS_POSITION_MAX,
} from './raft-rs-ingress-constants.js';

const DECIMAL_DIGITS = /^\d+$/u;
const ENTRY_TYPES = Object.freeze(Object.values(RAFT_RS_ENTRY_TYPE));
const NO_TERM = '0';
const ENTRY_DATA_ENCODING = 'base64';
// The type-specific shape checks, after the entries decode.
const TYPE_SHAPE_CHECKS = Object.freeze({
  [RAFT_RS_MESSAGE_TYPE.APPEND]: (message) =>
    appendContiguityRefusal(message),
  [RAFT_RS_MESSAGE_TYPE.PROPOSE]: (message) =>
    forwardedProposalRefusal(message),
});
// raft-rs send(): a forwarded proposal never carries a term; every message
// below always carries the sender's (non-zero) term.
const TERMLESS_TYPES = new Set([RAFT_RS_MESSAGE_TYPE.PROPOSE]);
const TERMED_TYPES = new Set([
  RAFT_RS_MESSAGE_TYPE.APPEND,
  RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE,
  RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE,
  RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE_RESPONSE,
  RAFT_RS_MESSAGE_TYPE.HEARTBEAT,
  RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE,
  RAFT_RS_MESSAGE_TYPE.TRANSFER_LEADER,
  RAFT_RS_MESSAGE_TYPE.TIMEOUT_NOW,
  RAFT_RS_MESSAGE_TYPE.REQUEST_PRE_VOTE,
  RAFT_RS_MESSAGE_TYPE.REQUEST_PRE_VOTE_RESPONSE,
]);
const TYPES_WITHOUT_PRODUCER = new Set([
  RAFT_RS_MESSAGE_TYPE.SNAPSHOT,
  RAFT_RS_MESSAGE_TYPE.READ_INDEX,
  RAFT_RS_MESSAGE_TYPE.READ_INDEX_RESPONSE,
]);

/**
 * @param {*} value - Anything.
 * @return {boolean} Whether it is a 64-bit value as the binding writes one.
 */
function isDecimalString(value) {
  return typeof value === 'string' && DECIMAL_DIGITS.test(value);
}

/**
 * @param {*} value - Anything.
 * @return {boolean} Whether it is a non-empty identity string.
 */
function isIdentity(value) {
  return typeof value === 'string' && value.length > 0;
}

function refused(outcome, detail) {
  return Object.freeze({admitted: false, outcome, detail});
}

/**
 * The routing half: does this envelope belong to this group and this peer.
 * @param {Object} envelope - The transport envelope.
 * @param {string} localGroupId - The group this host serves here.
 * @param {string} localPeerId - The peer this host serves here.
 * @return {Object|null} A refusal, or null when the routing is sound.
 */
function routingRefusal(envelope, localGroupId, localPeerId) {
  if (envelope === null || typeof envelope !== 'object') {
    return refused(RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENVELOPE, typeof envelope);
  }
  if (!isIdentity(envelope.groupId)) {
    return refused(RAFT_RS_INGRESS_REFUSAL.MISSING_GROUP_ID, envelope.groupId);
  }
  if (envelope.groupId !== localGroupId) {
    return refused(RAFT_RS_INGRESS_REFUSAL.GROUP_MISMATCH, envelope.groupId);
  }
  if (!isDecimalString(envelope.to)) {
    return refused(RAFT_RS_INGRESS_REFUSAL.MISSING_RECIPIENT, envelope.to);
  }
  if (envelope.to !== localPeerId) {
    return refused(RAFT_RS_INGRESS_REFUSAL.RECIPIENT_MISMATCH, envelope.to);
  }
  return null;
}

/**
 * Every 64-bit field the binding parses on a message decodes as one.
 * @param {Object} message - The raft message on the envelope.
 * @return {Object|null} A refusal, or null.
 */
function scalarFieldRefusal(message) {
  for (const field of RAFT_RS_PEER_ID_FIELDS) {
    if (message[field] !== undefined && !isDecimalString(message[field])) {
      return refused(RAFT_RS_INGRESS_REFUSAL.MALFORMED_PEER_ID,
        `${field}=${message[field]}`);
    }
  }
  for (const field of RAFT_RS_POSITION_FIELDS) {
    if (message[field] !== undefined && !isPosition(message[field])) {
      return refused(RAFT_RS_INGRESS_REFUSAL.MALFORMED_POSITION,
        `${field}=${message[field]}`);
    }
  }
  return null;
}

/**
 * @param {*} value - Anything.
 * @return {boolean} Whether it is a position the host carries exactly.
 */
function isPosition(value) {
  return isDecimalString(value) && BigInt(value) <= RAFT_RS_POSITION_MAX;
}

function positionOf(value) {
  return value === undefined ? 0n : BigInt(value);
}

/**
 * The message's shape against what raft-rs's own sender writes for its type
 * (raft-rs-ingress-constants.js names each refusal's trap).
 * @param {Object} message - A message whose scalars decode.
 * @return {Object|null} A refusal, or null.
 */
function producerShapeRefusal(message) {
  const type = message.msgType;
  if (TYPES_WITHOUT_PRODUCER.has(type)) {
    return refused(
      RAFT_RS_INGRESS_REFUSAL.MESSAGE_TYPE_WITHOUT_PRODUCER, type);
  }
  const termed = (message.term ?? NO_TERM) !== NO_TERM;
  if ((TERMED_TYPES.has(type) && !termed) ||
      (TERMLESS_TYPES.has(type) && termed)) {
    return refused(RAFT_RS_INGRESS_REFUSAL.TERM_PRESENCE_MISMATCH,
      `msgType=${type} term=${message.term}`);
  }
  return null;
}

// Whether a forwarded entry is what a port proposes (the leader appends it
// as it is, and every replica applies it).
function isPortProposal(entry) {
  if (entry.entryType !== RAFT_RS_ENTRY_TYPE.NORMAL ||
      typeof entry.data !== 'string') {
    return false;
  }
  const bytes = Buffer.from(entry.data, ENTRY_DATA_ENCODING);
  if (bytes.toString(ENTRY_DATA_ENCODING) !== entry.data) {
    return false;
  }
  try {
    decodeCommittedProposal(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * A forwarded proposal's entries are each what a port proposes.
 * @param {Object} message - A forwarded proposal whose entries decode.
 * @return {Object|null} A refusal, or null.
 */
function forwardedProposalRefusal(message) {
  const entry = (message.entries || []).find((each) => !isPortProposal(each));
  return entry === undefined ? null : refused(
    RAFT_RS_INGRESS_REFUSAL.FORWARDED_ENTRY_NOT_A_PROPOSAL,
    `entryType=${entry.entryType}`);
}

/**
 * An append names the entry before it consistently (a non-zero index with a
 * non-zero logTerm), its entries run contiguous from its index + 1, their
 * terms do not
 * decrease, the first is not below the message's logTerm and the last is
 * not above its term. One pass of integer compares over the batch.
 * @param {Object} message - An append whose entries decode.
 * @return {Object|null} A refusal, or null.
 */
function appendContiguityRefusal(message) {
  const entries = message.entries || [];
  // The entry before the append exists at a non-zero index only with a
  // non-zero term (every entry is written at a term >= 1); raft-rs answers
  // the term of an index beyond its log as 0, so logTerm 0 there would
  // "match" a position the receiver does not hold.
  if ((positionOf(message.index) > 0n) !==
      (positionOf(message.logTerm) > 0n)) {
    return refused(RAFT_RS_INGRESS_REFUSAL.NON_CONTIGUOUS_ENTRIES,
      `index=${message.index} logTerm=${message.logTerm}`);
  }
  let expectedIndex = positionOf(message.index) + 1n;
  let previousTerm = positionOf(message.logTerm);
  for (const entry of entries) {
    const term = positionOf(entry.term);
    if (positionOf(entry.index) !== expectedIndex || term < previousTerm) {
      return refused(RAFT_RS_INGRESS_REFUSAL.NON_CONTIGUOUS_ENTRIES,
        `index=${entry.index} term=${entry.term}`);
    }
    expectedIndex += 1n;
    previousTerm = term;
  }
  return entries.length > 0 && previousTerm > positionOf(message.term) ?
    refused(RAFT_RS_INGRESS_REFUSAL.NON_CONTIGUOUS_ENTRIES,
      `last term=${previousTerm} message term=${message.term}`) : null;
}

// The shape half of the schema, once the scalars decode and the recipient
// matches: what raft-rs's own sender writes for the type, then the entries.
function shapeRefusal(message) {
  const check = TYPE_SHAPE_CHECKS[message.msgType];
  return producerShapeRefusal(message) ?? entriesRefusal(message.entries) ??
    (check === undefined ? null : check(message));
}

/**
 * The schema half: does the payload decode into the shape the binding parses.
 * @param {Object} message - The raft message on the envelope.
 * @param {string} localPeerId - The peer this host serves here.
 * @return {Object|null} A refusal, or null when the message is well formed.
 */
function messageRefusal(message, localPeerId) {
  if (message === null || typeof message !== 'object') {
    return refused(RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENVELOPE, typeof message);
  }
  const type = message.msgType;
  const typeIsKnown = Number.isInteger(type) &&
    type >= RAFT_RS_MESSAGE_TYPE_RANGE.MIN &&
    type <= RAFT_RS_MESSAGE_TYPE_RANGE.MAX;
  if (!typeIsKnown) {
    return refused(RAFT_RS_INGRESS_REFUSAL.MALFORMED_MESSAGE_TYPE, type);
  }
  const scalars = scalarFieldRefusal(message);
  if (scalars !== null) {
    return scalars;
  }
  // The envelope and its payload must name the same recipient, or the
  // routing decision was taken on something the core will not read.
  if (message.to !== undefined && message.to !== localPeerId) {
    return refused(RAFT_RS_INGRESS_REFUSAL.RECIPIENT_MISMATCH, message.to);
  }
  return shapeRefusal(message);
}

/**
 * The entries a message carries decode the same way its own fields do.
 * @param {*} entries - The message's entries, if it has any.
 * @return {Object|null} A refusal, or null.
 */
function entriesRefusal(entries) {
  if (entries === undefined) {
    return null;
  }
  if (!Array.isArray(entries)) {
    return refused(RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENTRY, typeof entries);
  }
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') {
      return refused(RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENTRY, typeof entry);
    }
    if (!ENTRY_TYPES.includes(entry.entryType)) {
      return refused(
        RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENTRY, entry.entryType);
    }
    for (const field of RAFT_RS_ENTRY_POSITION_FIELDS) {
      if (entry[field] !== undefined && !isPosition(entry[field])) {
        return refused(
          RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENTRY, `${field}=${entry[field]}`);
      }
    }
    if (entry.data !== undefined && typeof entry.data !== 'string') {
      return refused(
        RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENTRY, typeof entry.data);
    }
  }
  return null;
}

/**
 * Decide whether one envelope may reach this peer's core.
 *
 * It is never a decision about who the sender is. There is no core and no
 * handle among the inputs, so the receiver's applied configuration cannot
 * take part in it.
 * @param {Object} options - The admission.
 * @param {Object} options.envelope - {groupId, to, message} from the transport.
 * @param {string} options.localGroupId - The group this host serves here.
 * @param {string} options.localPeerId - The peer this host serves here.
 * @return {Object} A frozen named admission or refusal.
 */
function admitRaftRsMessage({envelope, localGroupId, localPeerId}) {
  const routing = routingRefusal(envelope, localGroupId, localPeerId);
  if (routing !== null) {
    return routing;
  }
  const schema = messageRefusal(envelope.message, localPeerId);
  if (schema !== null) {
    return schema;
  }
  return Object.freeze({
    admitted: true, outcome: RAFT_RS_INGRESS_OUTCOME.ADMITTED, detail: null,
  });
}

export {
  admitRaftRsMessage,
};
