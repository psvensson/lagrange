/**
 * Constants for Raft adaptive timing controller.
 */

const RAFT_ADAPTIVE_TIMING_PROFILE = Object.freeze({
  ACTIVE: 'active',
  IDLE: 'idle',
});

const RAFT_ADAPTIVE_TIMING_LOG_MSG = Object.freeze({
  STARTED: 'Started raft adaptive timing controller',
  STOPPED: 'Stopped raft adaptive timing controller',
  PROFILE_SWITCHED: 'Switched raft adaptive timing profile',
  PROFILE_SWITCH_FAILED: 'Failed to switch raft adaptive timing profile',
  EVALUATION_FAILED: 'Failed raft adaptive timing evaluation',
});

const RAFT_ADAPTIVE_TIMING_VALUE = Object.freeze({
  UPDATED_BY: 'raft-adaptive-timing-controller',
  DEFAULT_PROFILE: RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE,
});

const RAFT_ADAPTIVE_TIMING_REASON = Object.freeze({
  HIGH_LOAD: 'high-load',
  LOW_LOAD: 'low-load',
});

export {
  RAFT_ADAPTIVE_TIMING_LOG_MSG,
  RAFT_ADAPTIVE_TIMING_PROFILE,
  RAFT_ADAPTIVE_TIMING_REASON,
  RAFT_ADAPTIVE_TIMING_VALUE,
};
