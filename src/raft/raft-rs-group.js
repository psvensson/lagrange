// Creating a raft-rs group, and restoring one after a restart.
//
// A restart reads THIS REPLICA'S OWN DURABLE RAFT RECORD and nothing else.
// `restoreRaftRsGroup` takes a core, a durable store, a group id and a peer
// id: there is no cache parameter, no service parameter and no system-table
// parameter, and this module imports no module that holds one. That is the
// structural half of "no recovery state is inferred from a service or
// system-table cache"; the measured half is that poisoning such a cache
// changes nothing a restored core reports.
//
// Creating a fresh group writes the configuration it was created with into
// the durable record at applied index 0, so a restart of a group that has
// never applied a configuration change still restores its configuration from
// its own record rather than from the peer list a caller happened to pass.

import {
  RAFT_RS_GROUP_ERROR_MSG,
  RAFT_RS_GROUP_TUNING,
  RAFT_RS_INITIAL_APPLIED,
} from './raft-rs-group-constants.js';

/**
 * The tuning the core is created with, taking a caller's overrides.
 * @param {Object} [tuning] - Overrides for the defaults.
 * @return {Object} The create_node tuning fields.
 */
function tuningOf(tuning = {}) {
  return {
    electionTick: tuning.electionTick ?? RAFT_RS_GROUP_TUNING.ELECTION_TICK,
    heartbeatTick: tuning.heartbeatTick ?? RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK,
    preVote: tuning.preVote ?? RAFT_RS_GROUP_TUNING.PRE_VOTE,
    checkQuorum: tuning.checkQuorum ?? RAFT_RS_GROUP_TUNING.CHECK_QUORUM,
  };
}

/**
 * Create a fresh raft-rs group and record the configuration it starts from.
 * @param {Object} options - The group's inputs.
 * @param {Object} options.core - The raft-rs primitive facade.
 * @param {Object} options.store - The durable Raft record.
 * @param {string} options.groupId - The group.
 * @param {string} options.peerId - This peer's raft id, as a decimal string.
 * @param {Array<string>} options.voters - The initial voters.
 * @param {Array<string>} [options.learners] - The initial learners.
 * @param {Object} [options.tuning] - Core tuning.
 * @return {number} The core handle for this group.
 */
function createRaftRsGroup({core, store, groupId, peerId, voters,
  learners = [], tuning}) {
  const handle = core.create_node({
    id: peerId,
    peers: voters,
    learners,
    applied: RAFT_RS_INITIAL_APPLIED,
    ...tuningOf(tuning),
  });
  store.putAppliedState(
    groupId, RAFT_RS_INITIAL_APPLIED, core.conf_state(handle));
  return handle;
}

/**
 * Restore a raft-rs group from its own durable Raft record.
 * @param {Object} options - The restore inputs. There is no cache among them.
 * @param {Object} options.core - The raft-rs primitive facade.
 * @param {Object} options.store - The durable Raft record.
 * @param {string} options.groupId - The group.
 * @param {string} options.peerId - This peer's raft id, as a decimal string.
 * @param {Object} [options.tuning] - Core tuning.
 * @return {number} The core handle for this group.
 */
function restoreRaftRsGroup({core, store, groupId, peerId, tuning}) {
  const record = store.readDurableRecord(groupId);
  if (record.hardState === null && record.entries.length === 0 &&
    record.confState.voters.length === 0) {
    throw new Error(RAFT_RS_GROUP_ERROR_MSG.noDurableRecord(groupId));
  }
  return core.create_node({
    id: peerId,
    peers: [],
    learners: [],
    applied: record.appliedIndex,
    ...tuningOf(tuning),
    bootstrap: {
      confState: record.confState,
      entries: record.entries,
      ...(record.hardState === null ? {} : {hardState: record.hardState}),
      ...(record.snapshot === null ? {} : {snapshot: record.snapshot}),
    },
  });
}

export {createRaftRsGroup, restoreRaftRsGroup};
