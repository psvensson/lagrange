import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {
  DEFAULT_MAX_INBOUND_QUEUE_BYTES,
  DEFAULT_MAX_INBOUND_QUEUE_LENGTH,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

// A delivery the full queue dropped: answered as a drop, not as a refusal of
// its sender (as a delivery dropped before the identity is durable), and
// recorded with the group's inbound step refusals - per sender, counted, in
// its status.
const INBOUND_QUEUE_FULL = deepFreeze({
  outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
  reason: RUNTIME_REASON.INBOUND_DROPPED_QUEUE_FULL,
  phase: RUNTIME_PHASE.ADMISSION,
});

// What one envelope's fixed fields (identities, positions, type) and one
// entry's fixed fields weigh, on top of the base64 strings they carry.
const ENVELOPE_FIXED_BYTES = 64;
const ENTRY_FIXED_BYTES = 32;

/**
 * The bytes a delivered envelope holds in the queue: its fixed fields and the
 * base64 strings it carries (each entry's data, the message's context), so a
 * catch-up append counts as what it is.
 * @param {Object} envelope - A raft-rs transport envelope.
 * @return {number}
 */
function inboundEnvelopeBytes(envelope) {
  const message = envelope?.message;
  let bytes = ENVELOPE_FIXED_BYTES + (message?.context?.length ?? 0);
  for (const entry of message?.entries ?? []) {
    bytes += ENTRY_FIXED_BYTES + (entry?.data?.length ?? 0);
  }
  return bytes;
}

// The envelope as delivered, frozen: a later change of the caller's object
// cannot reach the queued copy.
function snapshotEnvelope(envelope) {
  return deepFreeze({
    ...envelope,
    message: envelope.message && typeof envelope.message === 'object' ?
      {...envelope.message} : envelope.message,
  });
}

/**
 * Queue a delivered envelope unless the group's queue is full, in envelopes
 * or in bytes. One that does not fit is not queued and the caller drops it:
 * raft re-sends or re-times every message type on this path, while a held
 * group would stop for a retry window and be rebuilt from disk (load slows
 * consensus, never stops it).
 * @param {Object} group - The runtime owner's group record.
 * @param {Object} envelope - The admitted envelope.
 * @return {boolean} Whether it was queued.
 */
function queueInboundEnvelope(group, envelope) {
  const bytes = inboundEnvelopeBytes(envelope);
  if (group.inbound.length >= DEFAULT_MAX_INBOUND_QUEUE_LENGTH ||
      group.inboundBytes + bytes > DEFAULT_MAX_INBOUND_QUEUE_BYTES) {
    return false;
  }
  group.inbound.push(snapshotEnvelope(envelope));
  group.inboundBytes += bytes;
  return true;
}

function dequeueInboundEnvelope(group) {
  const envelope = group.inbound.shift();
  group.inboundBytes = Math.max(0, group.inboundBytes - inboundEnvelopeBytes(envelope));
  return envelope;
}

export {INBOUND_QUEUE_FULL, dequeueInboundEnvelope, queueInboundEnvelope};
