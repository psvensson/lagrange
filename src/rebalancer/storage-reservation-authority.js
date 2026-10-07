import {
  MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE,
  assertMembershipPublicationEpochBinding,
} from './replica-operation-membership-epoch-binding.js';

const MEMBERSHIP_PUBLICATION_EPOCH_FIELD = 'membershipPublicationEpoch';

const STORAGE_RESERVATION_AUTHORITY_ERROR = Object.freeze({
  OPERATION_AUTHORITY_UNAVAILABLE:
    'Authoritative replica operation is unavailable for reservation adoption',
  OPERATION_ABSENT:
    'Authoritative replica operation is absent for reservation adoption',
  OPERATION_TERMINAL:
    'Authoritative replica operation is terminal for reservation adoption',
  OPERATION_MISMATCH:
    'Authoritative replica operation identity mismatches reservation request',
  RESERVATION_AUTHORITY_UNAVAILABLE:
    'Authoritative storage reservation is unavailable for adoption',
  RESERVATION_ABSENT:
    'Authoritative ACTIVE storage reservation is absent for adoption',
  RESERVATION_MISMATCH:
    'Authoritative ACTIVE storage reservation mismatches operation identity',
});

const OPERATION_IDENTITY_FIELDS = Object.freeze([
  'operationId',
  'type',
  'partitionId',
  'replicaId',
  'targetClaimKey',
  'sourceNodeId',
  'targetNodeId',
  'entityType',
  'entityId',
  MEMBERSHIP_PUBLICATION_EPOCH_FIELD,
]);

function normalizeNullableIdentity(value) {
  return value === undefined ? null : value;
}

function membershipPublicationEpochMatches(expected, actual) {
  const expectedBinding = assertMembershipPublicationEpochBinding(
    expected.membershipPublicationEpoch,
    {
      source: 'storage-reservation-expected-operation',
      operationId: expected.operationId,
    },
  );
  const actualBinding = assertMembershipPublicationEpochBinding(
    actual.membershipPublicationEpoch,
    {
      source: 'storage-reservation-authoritative-operation',
      operationId: actual.operationId,
    },
  );
  if (expectedBinding.state !== actualBinding.state) {
    return false;
  }
  return expectedBinding.state ===
      MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE.UNBOUND ||
    expectedBinding.epoch === actualBinding.epoch;
}

function storageReservationOperationIdentityMatches(expected, actual) {
  if (!expected || !actual) {
    return false;
  }
  return OPERATION_IDENTITY_FIELDS.every((field) => {
    if (field === MEMBERSHIP_PUBLICATION_EPOCH_FIELD) {
      return membershipPublicationEpochMatches(expected, actual);
    }
    return normalizeNullableIdentity(expected[field]) ===
      normalizeNullableIdentity(actual[field]);
  });
}

function isFinitePositiveNumber(value) {
  return value !== null && value !== '' &&
    Number.isFinite(Number(value)) && Number(value) > 0;
}

function storageReservationTimestampsAreValid(row) {
  const createdAt = Number(row.created_at);
  const updatedAt = Number(row.updated_at);
  const expiresAt = Number(row.expires_at);
  return (
    isFinitePositiveNumber(row.created_at) &&
    isFinitePositiveNumber(row.updated_at) &&
    isFinitePositiveNumber(row.expires_at) &&
    updatedAt >= createdAt && expiresAt > createdAt
  );
}

function storageReservationIdentityMatches(row, operation, options) {
  return (
    row.reservation_id === options.reservationId &&
    row.operation_id === operation.operationId &&
    row.entity_type === operation.entityType &&
    row.entity_id === operation.entityId &&
    row.partition_id === operation.partitionId &&
    row.target_node_id === operation.targetNodeId &&
    row.reason_code === options.reasonCode &&
    Number(row.amplification_factor) === options.amplificationFactor
  );
}

function activeStorageReservationMatchesOperation(row, operation, options) {
  if (!row || !operation) {
    return false;
  }
  return (
    storageReservationIdentityMatches(row, operation, options) &&
    row.status === options.activeStatus &&
    row.released_at == null &&
    isFinitePositiveNumber(row.estimated_bytes) &&
    storageReservationTimestampsAreValid(row)
  );
}

export {
  STORAGE_RESERVATION_AUTHORITY_ERROR,
  activeStorageReservationMatchesOperation,
  storageReservationOperationIdentityMatches,
};
