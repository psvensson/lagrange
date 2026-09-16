// The simulation host's semantic transcript.
//
// The VirtualNetwork already keeps the authoritative record of PHYSICAL
// scheduling: which event was selected, when, in what order. This answers a
// different question - WHICH PRODUCTION COMPOSITION BOUNDARIES HAPPENED, AND
// IN WHAT CAUSAL ORDER - and it is the simulation host's artifact, not
// production's. No production object emits into it and no production
// behaviour depends on whether capture is enabled.
//
// Two rules give the artifact its value.
//
// It is CAPTURE ONLY. Recording never flushes a microtask, advances the
// network, awaits an owner, polls state or sleeps. The causal-closure owners
// decide when the host is settled; a transcript that could influence that
// would be a second scheduler, and the thing it measured would be itself.
//
// It carries NO INCIDENTAL ENTROPY. Router ids, connection ids, object
// identity, host timestamps, paths, stacks and pids are not fields here - not
// normalised after capture, simply never admitted. The contract is what keeps
// them out. If a value that genuinely decides behaviour turns out to be
// nondeterministic, that is a deterministic-owner defect to repair, not a
// field to drop.
import {TRANSCRIPT_EVENT} from './formation-sim-host-transcript-events.js';

// The only fields an entry may carry. Anything else is refused at record
// time, which is what makes "never admitted" a property of the artifact
// rather than a habit of its callers.
const TRANSCRIPT_FIELD = Object.freeze([
  'seq', 'virtualTimeMs', 'event', 'nodeId', 'peerNodeId', 'owner', 'phase',
  'frameKind', 'groupId', 'replicaId', 'actionType',
]);
const REQUIRED_FIELD = Object.freeze(['seq', 'virtualTimeMs', 'event']);
const SEALED_ENTRY_REFUSAL = 'host_transcript_entry_after_seal';
const UNKNOWN_EVENT_REFUSAL = 'host_transcript_unknown_event';
const UNKNOWN_FIELD_REFUSAL = 'host_transcript_unknown_field';

class HostTranscriptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HostTranscriptError';
    this.code = code;
  }
}

/**
 * Create the host transcript for one scenario.
 *
 * @param {Object} options - {network} - read for virtual time only.
 * @return {Object} the transcript.
 */
function createHostTranscript({network} = {}) {
  const entries = [];
  let sealed = false;

  function record(event, fields = {}) {
    if (!Object.prototype.hasOwnProperty.call(TRANSCRIPT_EVENT, event)) {
      throw new HostTranscriptError(UNKNOWN_EVENT_REFUSAL,
        `${event} is not a host transcript event`);
    }
    // A semantic entry after the seal is a failure, not something to filter:
    // it means production work ran after the scenario said it was over.
    if (sealed) {
      throw new HostTranscriptError(SEALED_ENTRY_REFUSAL,
        `${event} was recorded after the transcript was sealed`);
    }
    const entry = {
      seq: entries.length,
      virtualTimeMs: network ? network.now() : 0,
      event: TRANSCRIPT_EVENT[event],
    };
    for (const [key, value] of Object.entries(fields)) {
      if (!TRANSCRIPT_FIELD.includes(key)) {
        throw new HostTranscriptError(UNKNOWN_FIELD_REFUSAL,
          `${key} is not a host transcript field`);
      }
      if (REQUIRED_FIELD.includes(key)) {
        throw new HostTranscriptError(UNKNOWN_FIELD_REFUSAL,
          `${key} is decided by the transcript, not by its caller`);
      }
      if (value !== undefined && value !== null) entry[key] = value;
    }
    entries.push(Object.freeze(entry));
    return entry;
  }

  return {
    record,
    seal() {
      sealed = true;
    },
    isSealed: () => sealed,
    entries: () => Object.freeze([...entries]),
    length: () => entries.length,
    // The comparison artifact: field order is the contract's order, so two
    // transcripts are equal exactly when the same boundaries happened in the
    // same causal order at the same virtual instants.
    serialize: () => entries
      .map((entry) => TRANSCRIPT_FIELD
        .filter((field) => entry[field] !== undefined)
        .map((field) => `${field}=${entry[field]}`)
        .join(' '))
      .join('\n'),
  };
}

export {
  SEALED_ENTRY_REFUSAL, UNKNOWN_EVENT_REFUSAL, UNKNOWN_FIELD_REFUSAL,
  createHostTranscript,
};
