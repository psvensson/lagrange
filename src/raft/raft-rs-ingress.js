// The safety boundary around `step`: envelope and routing only.
//
// §6 of the binding direction, as corrected. The host validates what it can
// know authoritatively - that the envelope names a group and a partition,
// that this peer and this group are the intended recipient, that the payload
// decodes into the shape the binding parses - and raft-rs owns everything
// else. Raft's own checks are not reproduced here.
//
// `admitRaftRsMessage` is given the envelope, the local group and the local
// peer. It is given NO core and NO handle, so it cannot read the receiver's
// applied configuration even if someone later wanted it to: the rule that
// drops legitimate membership-transition traffic is unreachable from here by
// construction, not by discipline.

import {
  RAFT_RS_ENTRY_TYPE,
} from './raft-rs-ready-loop-constants.js';
import {
  RAFT_RS_ENTRY_POSITION_FIELDS,
  RAFT_RS_INGRESS_OUTCOME,
  RAFT_RS_INGRESS_REFUSAL,
  RAFT_RS_MESSAGE_TYPE_RANGE,
  RAFT_RS_PEER_ID_FIELDS,
  RAFT_RS_POSITION_FIELDS,
} from './raft-rs-ingress-constants.js';

const DECIMAL_DIGITS = /^\d+$/u;
const ENTRY_TYPES = Object.freeze(Object.values(RAFT_RS_ENTRY_TYPE));

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
  const fields = [
    [RAFT_RS_PEER_ID_FIELDS, RAFT_RS_INGRESS_REFUSAL.MALFORMED_PEER_ID],
    [RAFT_RS_POSITION_FIELDS, RAFT_RS_INGRESS_REFUSAL.MALFORMED_POSITION],
  ];
  for (const [names, outcome] of fields) {
    for (const field of names) {
      if (message[field] !== undefined && !isDecimalString(message[field])) {
        return refused(outcome, `${field}=${message[field]}`);
      }
    }
  }
  return null;
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
  return entriesRefusal(message.entries);
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
      if (entry[field] !== undefined && !isDecimalString(entry[field])) {
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
