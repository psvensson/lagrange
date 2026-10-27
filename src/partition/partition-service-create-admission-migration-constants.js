const PARTITION_SERVICE_CREATE_ADMISSION_COLUMN = Object.freeze({
  CREATE_ATTEMPT_TOKEN: 'create_attempt_token',
  CREATE_ADMISSION_STATE: 'create_admission_state',
  CREATE_ADMISSION_TOKEN: 'create_admission_token',
  CREATE_ADMISSION_REPLICA_CREATED_AT:
    'create_admission_replica_created_at',
  CREATE_ADMISSION_ATTEMPT_TOKEN: 'create_admission_attempt_token',
  CREATE_ADMISSION_PREVIOUS_ATTEMPT_TOKEN:
    'create_admission_previous_attempt_token',
  CREATE_ADMISSION_ATTEMPT_SEQ: 'create_admission_attempt_seq',
  CREATE_ADMISSION_WORKFLOW_UPDATED_AT:
    'create_admission_workflow_updated_at',
  CREATE_ADMISSION_OWNER_INCARNATION:
    'create_admission_owner_incarnation',
});

const PARTITION_SERVICE_CREATE_ADMISSION_COLUMN_SQL = Object.freeze({
  ADD_CREATE_ATTEMPT_TOKEN: 'ADD COLUMN create_attempt_token TEXT',
  ADD_CREATE_ADMISSION_STATE: 'ADD COLUMN create_admission_state TEXT',
  ADD_CREATE_ADMISSION_TOKEN: 'ADD COLUMN create_admission_token TEXT',
  ADD_CREATE_ADMISSION_REPLICA_CREATED_AT:
    'ADD COLUMN create_admission_replica_created_at INTEGER',
  ADD_CREATE_ADMISSION_ATTEMPT_TOKEN:
    'ADD COLUMN create_admission_attempt_token TEXT',
  ADD_CREATE_ADMISSION_PREVIOUS_ATTEMPT_TOKEN:
    'ADD COLUMN create_admission_previous_attempt_token TEXT',
  ADD_CREATE_ADMISSION_ATTEMPT_SEQ:
    'ADD COLUMN create_admission_attempt_seq INTEGER',
  ADD_CREATE_ADMISSION_WORKFLOW_UPDATED_AT:
    'ADD COLUMN create_admission_workflow_updated_at INTEGER',
  ADD_CREATE_ADMISSION_OWNER_INCARNATION:
    'ADD COLUMN create_admission_owner_incarnation INTEGER',
});

const PARTITION_SERVICE_CREATE_ADMISSION_LOG_MSG = Object.freeze({
  ADDED_SERVICES_CREATE_ATTEMPT_TOKEN:
    'Added create_attempt_token column to services table',
  ADDED_REPLICA_OPERATIONS_CREATE_ADMISSION_COLUMN:
    'Added CREATE admission column to replica_operations table',
});

export {
  PARTITION_SERVICE_CREATE_ADMISSION_COLUMN,
  PARTITION_SERVICE_CREATE_ADMISSION_COLUMN_SQL,
  PARTITION_SERVICE_CREATE_ADMISSION_LOG_MSG,
};
