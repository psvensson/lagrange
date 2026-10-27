import {COLUMN_TYPE} from './system-table-schema-shared-constants.js';

const REPLICA_OPERATION_CREATE_ADMISSION_COLUMNS = Object.freeze([
  {name: 'create_admission_state', type: COLUMN_TYPE.TEXT},
  {name: 'create_admission_token', type: COLUMN_TYPE.TEXT},
  {name: 'create_admission_replica_created_at', type: COLUMN_TYPE.INTEGER},
  {name: 'create_admission_attempt_token', type: COLUMN_TYPE.TEXT},
  {name: 'create_admission_previous_attempt_token', type: COLUMN_TYPE.TEXT},
  {name: 'create_admission_attempt_seq', type: COLUMN_TYPE.INTEGER},
  {name: 'create_admission_workflow_updated_at', type: COLUMN_TYPE.INTEGER},
  {name: 'create_admission_owner_incarnation', type: COLUMN_TYPE.INTEGER},
]);

export {REPLICA_OPERATION_CREATE_ADMISSION_COLUMNS};
