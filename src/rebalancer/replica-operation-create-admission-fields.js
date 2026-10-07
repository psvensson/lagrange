const REPLICA_CREATE_ADMISSION_OPERATION_FIELDS = Object.freeze([
  'createAdmissionState',
  'createAdmissionToken',
  'createAdmissionReplicaCreatedAt',
  'createAdmissionAttemptToken',
  'createAdmissionPreviousAttemptToken',
  'createAdmissionAttemptSeq',
  'createAdmissionWorkflowUpdatedAt',
  'createAdmissionOwnerIncarnation',
]);

function operationCarriesReplicaCreateAdmission(operation) {
  return REPLICA_CREATE_ADMISSION_OPERATION_FIELDS.some((field) =>
    operation?.[field] !== null && operation?.[field] !== undefined,
  );
}

export {operationCarriesReplicaCreateAdmission};
