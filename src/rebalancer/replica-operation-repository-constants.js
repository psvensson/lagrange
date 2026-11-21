const REPLICA_OPERATION_REPOSITORY_ERROR_CODE = Object.freeze({
  MUTATION_PORT_REQUIRED: 'replica_operation_mutation_port_required',
  ENTITY_OPERATION_OBSERVATION_INCOMPLETE: 'entity_operation_observation_incomplete',
  ENTITY_OPERATION_OBSERVATION_MALFORMED: 'entity_operation_observation_malformed',
});

const REPLICA_OPERATION_REPOSITORY_ERROR_MSG = Object.freeze({
  MUTATION_PORT_REQUIRED: 'ReplicaOperationRepository requires a structured mutation port',
  ENTITY_OPERATION_OBSERVATION_MALFORMED: 'Required entity operation observation is malformed',
  ENTITY_OPERATION_OBSERVATION_INCOMPLETE: 'Required entity operation observation is incomplete',
  TERMINAL_FAILED_CREATE_CLEANUP_RECOVERY_READ_UNAVAILABLE:
    'Terminal failed-create cleanup recovery read unavailable',
});

function unavailableReplicaOperationMutation() {
  const error = new Error(REPLICA_OPERATION_REPOSITORY_ERROR_MSG.MUTATION_PORT_REQUIRED);
  error.code = REPLICA_OPERATION_REPOSITORY_ERROR_CODE.MUTATION_PORT_REQUIRED;
  throw error;
}

function bindReplicaOperationMutationPort(gateway, required) {
  const submit = gateway?.submitMutation;
  if (typeof submit === 'function') {
    return (mutation, options) => gateway.submitMutation(mutation, options);
  }
  if (required) unavailableReplicaOperationMutation();
  return unavailableReplicaOperationMutation;
}

export {
  REPLICA_OPERATION_REPOSITORY_ERROR_CODE,
  REPLICA_OPERATION_REPOSITORY_ERROR_MSG,
  bindReplicaOperationMutationPort,
};
