// The participation gate of one rs-raft replica group (owner decision O1,
// committed-read amendment 1, section 3.3), as data and pure decisions over
// it. The runtime owner holds the state on its group and asks these
// functions; nothing here enters the core, a store or a row.
//
// State: `bootstrapIndex` (j, the committed index the replica's bootstrap
// configuration was read at; 0 for a genesis founder) and `admissionIndex`
// (a_self, the index of the applied entry that made this replica a voter;
// known at creation for a genesis founder, observed on application for a
// joiner, unknown - null, counted as infinity - until then). The gate is
// open when the replica's applied index reaches max(bootstrapIndex,
// admissionIndex); it holds on the applied index alone, whatever the commit
// index says, and never delegates to the core's own campaign guard.

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  PARTICIPATION_GATE,
  PARTICIPATION_GATE_PHASE,
} from './raft-committed-membership-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from './raft-rs-ready-loop-constants.js';
import {
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

const ZERO = 0n;
// The admission index of a replica no applied entry has admitted yet: the
// gate cannot open (counted as infinity).
const NOT_ADMITTED = null;
// The gate of a group whose opening could not read its record: closed.
const UNREAD_GATE = Object.freeze({
  bootstrapIndex: ZERO, admissionIndex: NOT_ADMITTED});

function exactIndex(value) {
  return value === null || value === undefined ? null : BigInt(value);
}

/**
 * The gate of a group opened from a bootstrap (no durable record). A genesis
 * founder is admitted at index 0; a joiner is admitted by the applied entry
 * that adds it, observed later.
 * @param {Object} bootstrap - The port's bootstrap: {source, bootstrapIndex,
 *   voters} with this replica's peer id among the voters when it founds.
 * @param {string} peerId - This replica's raft peer id.
 * @return {Object} {bootstrapIndex, admissionIndex} as BigInt (admission
 *   null when unknown).
 */
function createdParticipationGate(bootstrap, peerId) {
  const bootstrapIndex = exactIndex(bootstrap.bootstrapIndex) ?? ZERO;
  const founds = bootstrap.source === BOOTSTRAP_MEMBERSHIP_SOURCE.GENESIS &&
    bootstrap.voters.map(String).includes(String(peerId));
  return {bootstrapIndex,
    admissionIndex: founds ? bootstrapIndex : NOT_ADMITTED};
}

/**
 * The gate a durable record restores. A record without a bootstrap index or
 * without an admission index restores closed: nothing in it proves the
 * replica's role.
 * @param {Object} record - The durable record (bootstrapIndex and
 *   admissionIndex as decimal strings or null).
 * @return {Object} {bootstrapIndex, admissionIndex}.
 */
function restoredParticipationGate(record) {
  const bootstrapIndex = exactIndex(record.bootstrapIndex);
  return {
    bootstrapIndex: bootstrapIndex ?? ZERO,
    admissionIndex: bootstrapIndex === null ? NOT_ADMITTED :
      exactIndex(record.admissionIndex),
  };
}

/**
 * The index the applied index must reach, or null while the replica is not
 * admitted (the gate cannot open).
 * @param {Object} gate - {bootstrapIndex, admissionIndex}.
 * @return {bigint|null}
 */
function participationGateIndex(gate) {
  if (gate.admissionIndex === NOT_ADMITTED) {
    return null;
  }
  return gate.admissionIndex > gate.bootstrapIndex ?
    gate.admissionIndex : gate.bootstrapIndex;
}

/**
 * @param {Object} gate - {bootstrapIndex, admissionIndex}.
 * @param {bigint} appliedIndex - The replica's applied index.
 * @return {boolean} Whether the replica may participate.
 */
function participationGateOpen(gate, appliedIndex) {
  if (gate === null) {
    return false;
  }
  const gateIndex = participationGateIndex(gate);
  return gateIndex !== null && appliedIndex >= gateIndex;
}

/**
 * Whether a committed configuration entry, applied at `index`, admits this
 * replica: it adds this replica as a voter after its bootstrap index and no
 * admission is known yet. An AddNode of this replica at or below the
 * bootstrap index is history the bootstrap configuration already reflects
 * (a stamp that named this replica a voter never opens a group without a
 * record).
 * @param {Object} gate - {bootstrapIndex, admissionIndex}.
 * @param {Object} decoded - The decoded ConfChangeV2 ({changes}).
 * @param {string} peerId - This replica's raft peer id.
 * @param {bigint} index - The entry's index.
 * @return {boolean}
 */
function admitsReplica(gate, decoded, peerId, index) {
  return gate.admissionIndex === null && index > gate.bootstrapIndex &&
    (decoded?.changes || []).some((change) =>
      change.changeType === RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE &&
      String(change.nodeId) === String(peerId));
}

/**
 * The gate as the status observation carries it.
 * @param {Object} gate - {bootstrapIndex, admissionIndex}.
 * @param {bigint} appliedIndex - The applied index observed with it.
 * @return {Object} {appliedIndex, gateOpen, bootstrapIndex, admissionIndex}
 *   as numbers (admissionIndex null while unknown).
 */
function participationObservation(gate, appliedIndex) {
  if (gate === null) {
    // A group whose opening could not read its record has no gate yet.
    return participationObservation(UNREAD_GATE, ZERO);
  }
  return {
    appliedIndex: Number(appliedIndex),
    gateOpen: participationGateOpen(gate, appliedIndex),
    bootstrapIndex: Number(gate.bootstrapIndex),
    admissionIndex: gate.admissionIndex === null ? null :
      Number(gate.admissionIndex),
  };
}

/**
 * Re-evaluate a group's gate after its applied index or gate moved: the
 * first time it opens, GATE_OPENED is emitted through the group's own
 * announcement channel, in the drain that crossed it.
 * @param {Object} group - The runtime group ({gate, appliedIndex, gateOpen,
 *   emit}).
 */
function settleParticipationGate(group) {
  const open = participationGateOpen(group.gate, group.appliedIndex);
  const opened = open && group.gateOpen !== true;
  group.gateOpen = open;
  if (opened) {
    group.emit(PARTICIPATION_GATE.GATE_OPENED,
      participationObservation(group.gate, group.appliedIndex));
  }
}

/**
 * One committed entry was applied (and its application transaction
 * committed): the group's applied index moves to it, an admitting entry
 * becomes the admission index, and the gate is re-evaluated.
 * @param {Object} group - The runtime group.
 * @param {bigint} entryIndex - The entry's index.
 * @param {boolean} admitted - Whether the entry admitted this replica.
 */
function recordAppliedEntry(group, entryIndex, admitted) {
  group.appliedIndex = entryIndex;
  if (admitted) {
    group.gate = {...group.gate, admissionIndex: entryIndex};
  }
  settleParticipationGate(group);
}

/**
 * The durable columns of a gate, as decimal strings.
 * @param {Object} gate - {bootstrapIndex, admissionIndex}.
 * @return {Object} {bootstrapIndex, admissionIndex}.
 */
function participationGateColumns(gate) {
  return {
    bootstrapIndex: String(gate.bootstrapIndex),
    admissionIndex: gate.admissionIndex === null ? null :
      String(gate.admissionIndex),
  };
}

/**
 * The typed refusal of a request the closed gate does not admit (a
 * campaign, a tick, a proposal, a scheduling start): retryable, the group
 * stays usable.
 * @return {Object} Frozen CORE_REFUSED outcome.
 */
function participationGateClosed() {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: PARTICIPATION_GATE.GATE_CLOSED,
    phase: PARTICIPATION_GATE_PHASE,
    retryable: true,
    recoveryRequired: false,
  });
}

/**
 * The typed refusal of a replica that must restore and holds no durable
 * record (owner decision O4; amendment 1 A3 for a COMMITTED stamp that
 * already names it a voter): non-retryable, surfaced by the partition as its
 * consensus init refusal, distinct from an unreadable record (a retryable
 * host failure at the same phase).
 * @return {Object} Frozen CORE_REFUSED outcome.
 */
function durableRecordMissing() {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: RUNTIME_REASON.DURABLE_RECORD_MISSING,
    phase: RUNTIME_PHASE.DURABLE_RECORD_READ,
    retryable: false,
    recoveryRequired: false,
  });
}

/**
 * The typed refusal of a durable record written before the participation
 * gate existed (owner decision O3, hard cutover): non-retryable, the replica
 * is reseeded; distinct from an unreadable record (retryable) and from a
 * missing one.
 * @return {Object} Frozen CORE_REFUSED outcome.
 */
function durableRecordIncompatible() {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: RUNTIME_REASON.DURABLE_RECORD_INCOMPATIBLE,
    phase: RUNTIME_PHASE.DURABLE_RECORD_READ,
    retryable: false,
    recoveryRequired: true,
  });
}

/**
 * Whether opening a group with no durable record must be refused: a rejoin
 * (the record is the only source), a COMMITTED stamp whose configuration
 * already names this replica a voter (its earlier incarnation voted; its
 * record is gone), or a GENESIS stamp on a replica that joins a group which
 * already exists (its identity's history is held elsewhere: opened as a
 * founder of an empty log it would vote and lead without it).
 * @param {Object} bootstrap - The port's bootstrap.
 * @return {boolean}
 */
function requiresDurableRecord(bootstrap) {
  return bootstrap.source === BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD ||
    (bootstrap.source === BOOTSTRAP_MEMBERSHIP_SOURCE.COMMITTED &&
      bootstrap.selfCommittedVoter === true) ||
    (bootstrap.source === BOOTSTRAP_MEMBERSHIP_SOURCE.GENESIS &&
      bootstrap.joiningExistingGroup === true);
}

export {
  admitsReplica,
  createdParticipationGate,
  durableRecordIncompatible,
  durableRecordMissing,
  participationGateClosed,
  participationGateColumns,
  participationObservation,
  recordAppliedEntry,
  requiresDurableRecord,
  restoredParticipationGate,
  settleParticipationGate,
};
