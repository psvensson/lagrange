// The membership a Lagrange row can carry, and the one direction the
// projection runs in.
//
// These names are the raft-rs ConfState's own four member lists under
// Lagrange names. They are a PROJECTION vocabulary: a row saying VOTER
// records what the committed configuration already determined, and never
// asks for it.

// Which ConfState list a member came from. The row store holds one of these
// per member and nothing else about consensus.
const LAGRANGE_MEMBERSHIP = Object.freeze({
  VOTER: 'voter',
  LEARNER: 'learner',
  VOTER_OUTGOING: 'voter-outgoing',
  LEARNER_NEXT: 'learner-next',
});

// The ConfState field each membership is projected from. The order is the
// order the projection writes rows in, so two peers that agree on the
// configuration project the same rows in the same order.
const LAGRANGE_MEMBERSHIP_SOURCE = Object.freeze([
  Object.freeze({
    membership: LAGRANGE_MEMBERSHIP.VOTER, confStateField: 'voters'}),
  Object.freeze({
    membership: LAGRANGE_MEMBERSHIP.LEARNER, confStateField: 'learners'}),
  Object.freeze({
    membership: LAGRANGE_MEMBERSHIP.VOTER_OUTGOING,
    confStateField: 'votersOutgoing'}),
  Object.freeze({
    membership: LAGRANGE_MEMBERSHIP.LEARNER_NEXT,
    confStateField: 'learnersNext'}),
]);

// A lifecycle a row carries when nothing has said otherwise. §17 of the
// binding direction: lifecycle is not membership, so an unknown lifecycle is
// its own named state rather than an absence to be read as something.
const LAGRANGE_LIFECYCLE_UNKNOWN = 'unknown';

const LAGRANGE_MEMBERSHIP_ERROR_MSG = Object.freeze({
  unknownMembership: (value) =>
    `${JSON.stringify(value)} is not a Lagrange membership; a row records ` +
    'which ConfState list the committed configuration put a member in',
});

export {
  LAGRANGE_LIFECYCLE_UNKNOWN,
  LAGRANGE_MEMBERSHIP,
  LAGRANGE_MEMBERSHIP_ERROR_MSG,
  LAGRANGE_MEMBERSHIP_SOURCE,
};
