import {FORMATION_OWNER} from './formation-diagnostics-contract.js';
import {runFormationOwner} from './formation-turn-attribution.js';
import {
  trackRaftFollowerCommitApplySlice,
} from './raft-churn-sync-sections.js';

/**
 * Raft/formation-diagnostics interaction contract.
 *
 * LifeRaft owns protocol behavior and the commit scheduler owns apply behavior.
 * This module owns only their mapping into exclusive formation-attribution
 * buckets. With no active attribution window, runFormationOwner invokes the
 * callback directly and preserves the participant's behavior.
 */
function runRaftProtocolActivity(callback) {
  return runFormationOwner(FORMATION_OWNER.RAFT_PROTOCOL, callback);
}

function runRaftApplySlice(callback) {
  return runFormationOwner(FORMATION_OWNER.RAFT_APPLY, () =>
    trackRaftFollowerCommitApplySlice(callback));
}

export {
  runRaftApplySlice,
  runRaftProtocolActivity,
};
