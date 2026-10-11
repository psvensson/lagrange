// The vocabulary of a fresh message-group learner's join (FreshMG 6.B slice
// B2): the leader-produced join descriptor, the typed answers of the
// learner-join capability an admitted CREATE worker calls, and its log names.
// Values only: nothing here reads a row, a port or a file.

import {NUM, TIME_MS} from '../constants/index.js';

// What the group's leader replica produces for one recorded learner: its
// BOOTSTRAP-purpose committed membership naming the learner and an
// origin-bearing raft-rs replica image sealed at the same configuration.
const MESSAGE_GROUP_LEARNER_JOIN_DESCRIPTOR = Object.freeze({
  KIND: 'message_group_learner_join_descriptor',
  KEYS: Object.freeze(['kind', 'groupId', 'stamp', 'generationIndex',
    'checkpointIdentity']),
});

// What a join that opened its learner answers. RUNNING only after the group's
// current leader acknowledged the learner caught up to its commit index;
// NOT_CAUGHT_UP when that acknowledgement did not come within the bound (the
// learner stays open and hosted, a learner of the group, never a voter).
const MESSAGE_GROUP_LEARNER_JOIN_OUTCOME = Object.freeze({
  RUNNING: 'message_group_learner_running',
  NOT_CAUGHT_UP: 'message_group_learner_not_caught_up',
});

// Every typed refusal of the learner join, thrown with code = errorCode and
// deferRetry false so the CREATE worker reports it through the existing
// failed outcome. None of them leaves a learner open. (An install owner's
// REPLICA_CREATE_ADMISSION_DEFERRED passes through unchanged, deferRetry true.)
const MESSAGE_GROUP_LEARNER_JOIN_REFUSAL = Object.freeze({
  // The worker's options are not the admitted CREATE's exact frozen shape.
  INPUT_INVALID: 'message_group_learner_join_input_invalid',
  // A replica file, a pending install marker or staging already exists for
  // this target: a join never installs over a present generation.
  TARGET_PRESENT: 'message_group_learner_join_target_present',
  // No leader answered a descriptor (not the leader, joint or held
  // configuration, unresolved identity, no checkpoint, delivery failure).
  DESCRIPTOR_UNAVAILABLE: 'message_group_learner_join_descriptor_unavailable',
  // The leader's configuration does not name the exact learner (a later
  // REMOVE, or never added).
  LEARNER_NOT_IN_CONFIGURATION:
    'message_group_learner_join_learner_not_in_configuration',
  // The image the leader sealed is not at the configuration it answered.
  DESCRIPTOR_MOVED: 'message_group_learner_join_descriptor_moved',
  // The descriptor or its image names another group, target, peer or origin.
  DESCRIPTOR_MISMATCH: 'message_group_learner_join_descriptor_mismatch',
  // The descriptor is older (term or configuration generation) than the
  // recorded learner fact it would serve.
  DESCRIPTOR_STALE: 'message_group_learner_join_descriptor_stale',
  // The install owner did not install the image (detail: its reason).
  INSTALL_REFUSED: 'message_group_learner_join_install_refused',
  // The installed learner did not open (detail: the consensus refusal).
  OPEN_REFUSED: 'message_group_learner_join_open_refused',
  // The opened replica's own configuration does not hold it as a learner.
  OPEN_NOT_LEARNER: 'message_group_learner_join_open_not_learner',
});

// Why the leader's acknowledgement is not yet a running target.
const MESSAGE_GROUP_LEARNER_ACKNOWLEDGEMENT = Object.freeze({
  ACKNOWLEDGED: 'acknowledged',
  LEADER_UNAVAILABLE: 'leader_unavailable',
  BEHIND: 'behind',
  REMOVED: 'removed',
});

// Why the leader's own progress for the learner is no input to the shared
// promotion-progress predicate yet. The join checks the two indices exactly
// first, because that predicate reads an absent or non-integer index as 0.
const MESSAGE_GROUP_LEARNER_PROGRESS = Object.freeze({
  // The commit or the match index is absent or not an exact non-negative
  // integer, or the commit index is 0.
  UNOBSERVED: 'progress_unobserved',
});

// The bounded wait for the leader's acknowledgement (overridable per host).
// Spending it is NOT_CAUGHT_UP, never a failure or a running claim.
const MESSAGE_GROUP_LEARNER_JOIN_DEFAULT = Object.freeze({
  // ends-on: the group leader acknowledges the learner caught up
  CATCH_UP_TIMEOUT_MS: TIME_MS.SECOND * NUM.THIRTY,
  CATCH_UP_POLL_MS: 50,
});

export {
  MESSAGE_GROUP_LEARNER_ACKNOWLEDGEMENT,
  MESSAGE_GROUP_LEARNER_JOIN_DEFAULT,
  MESSAGE_GROUP_LEARNER_JOIN_DESCRIPTOR,
  MESSAGE_GROUP_LEARNER_JOIN_OUTCOME,
  MESSAGE_GROUP_LEARNER_JOIN_REFUSAL,
  MESSAGE_GROUP_LEARNER_PROGRESS,
};
