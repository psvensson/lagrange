const REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_FIELDS = Object.freeze([
  'messageGroupMembershipLaneKey',
  'messageGroupMembershipPhase',
  'messageGroupMembershipObligationState',
  'messageGroupMembershipIdentity',
  'messageGroupMembershipPermit',
  'messageGroupLearnerStamp',
  'messageGroupVoterStamp',
  'messageGroupRemovalStamp',
  'messageGroupSourceLifecycleClaim',
]);

function operationCarriesMessageGroupMembership(operation) {
  return REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_FIELDS.some((field) =>
    operation?.[field] !== null && operation?.[field] !== undefined,
  );
}

export {
  REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_FIELDS,
  operationCarriesMessageGroupMembership,
};
