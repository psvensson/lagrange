import LifeRaft from './liferaft.js';

const EMPTY_LEADER_ID = '';
const FUNCTION_TYPE = 'function';

/**
 * The single owner of the safe leader-demotion sequence, shared by the
 * replica handler's tracked handoff (drain step-down) and the partition
 * durability-fitness detector (run-23 wedge). Order matters:
 * cancel leader-owned activation, defer candidacy BEFORE re-arming the
 * election timer (the demoted node otherwise re-wins the very leadership
 * being shed — 68% of drained-node leadership gains were undirected timer
 * wins, analyze-leadership-flap census), then step to follower and re-arm.
 * @param {Object} service - PartitionService-like instance exposing raft,
 *   raftProvider, and optionally cancelLeaderOwnedActivation.
 * @return {boolean} True when the demotion sequence ran.
 */
function performTrackedLeaderDemotion(service) {
  const raft = service?.raft || null;
  const raftProvider = service?.raftProvider || null;
  if (
    !raft ||
    typeof raft.change !== FUNCTION_TYPE ||
    !raftProvider ||
    typeof raftProvider.startElectionTimer !== FUNCTION_TYPE
  ) {
    return false;
  }
  if (typeof service.cancelLeaderOwnedActivation === FUNCTION_TYPE) {
    service.cancelLeaderOwnedActivation();
  }
  if (typeof raft.deferCandidacy === FUNCTION_TYPE) {
    raft.deferCandidacy();
  }
  raft.change({
    state: LifeRaft.FOLLOWER,
    leader: EMPTY_LEADER_ID,
  });
  raftProvider.startElectionTimer(raft);
  return true;
}

export {performTrackedLeaderDemotion};
