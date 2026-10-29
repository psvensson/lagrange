// The registration producer owns the original foundation row identities.
// Recovery consumes these constructors; it never executes SQL to infer rows.
import {COLUMN} from '../constants/index.js';
import {PARTITION_STATE} from '../partition/partition-constants.js';
import {BOOTSTRAP_MESSAGE_GROUP} from './bootstrap-constants.js';
import {DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
  DECLARED_REPLICA_COUNT_DEFAULT} from './replication-target-authority.js';
import {INITIAL_MESSAGE_GROUP_ID, INITIAL_PARTITION_IDS} from
  './system-table-schemas-constants.js';

// The original TABLES producer persists SQL NULL when no transition exists.
const NO_PARTITION_TRANSITION = null;

function seedMessageGroupRow(nodeId, now) {
  return {
    group_id: INITIAL_MESSAGE_GROUP_ID,
    group_name: BOOTSTRAP_MESSAGE_GROUP.NAME,
    replica_count: DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
    [COLUMN.LEADER_NODE_ID]: nodeId,
    policy: JSON.stringify(BOOTSTRAP_MESSAGE_GROUP.POLICY),
    created_at: now,
    updated_at: now,
  };
}

function seedTableRow(schema, now) {
  return {
    table_id: schema.tableName,
    table_name: schema.tableName,
    schema_definition: JSON.stringify(schema),
    partition_key: schema.columns[0].name,
    table_policies: JSON.stringify({}),
    partition_count: 1,
    active_partition_version: 1,
    pending_partition_version: null,
    partition_transition_state: NO_PARTITION_TRANSITION,
    partition_transition_metadata: null,
    created_at: now,
    updated_at: now,
  };
}

function seedPartitionRow(schema, nodeId, now) {
  return {
    partition_id: INITIAL_PARTITION_IDS[schema.tableName],
    table_id: schema.tableName,
    table_name: schema.tableName,
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: schema.columns[0].type,
    partition_version: 1,
    replica_count: DECLARED_REPLICA_COUNT_DEFAULT,
    size_bytes: 0,
    leader_node_id: nodeId,
    state: PARTITION_STATE.NORMAL,
    created_at: now,
    updated_at: now,
  };
}

export {seedMessageGroupRow, seedTableRow, seedPartitionRow};
