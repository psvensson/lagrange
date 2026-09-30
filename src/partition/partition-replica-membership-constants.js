// What a replica's own committed configuration says about one voter (quest
// replace-source-removal-owner, amendment-1 step 3): VOTER while the voter's
// identity is in the incoming or outgoing voters; ABSENT when every
// voter-bearing member resolves and none is it; UNRESOLVED when a voter the
// configuration names has no identity here (nothing is concluded from it);
// UNAVAILABLE when the configuration could not be read.
const PARTITION_REPLICA_MEMBERSHIP_STATE = Object.freeze({
  VOTER: 'voter',
  ABSENT: 'absent',
  UNRESOLVED: 'unresolved',
  UNAVAILABLE: 'unavailable',
});

export {PARTITION_REPLICA_MEMBERSHIP_STATE};
