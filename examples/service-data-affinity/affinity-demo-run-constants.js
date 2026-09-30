const NODE_COUNT = 5;
const BASE_ADMIN_PORT = 8081;
const CLUSTER_DATA_ROOT = 'data/examples/service-data-affinity-demo';
const GCP_MODE_ENV = 'LAGRANGE_AFFINITY_DEMO_GCP';
const GCP_MODE_FLAG = '--gcp';
const FORMATION_ONLY_ENV = 'LAGRANGE_AFFINITY_DEMO_FORMATION_ONLY';
const FORMATION_ONLY_FLAG = '--formation-only';
const CLUSTER_FORM_TIMEOUT_MS = 180000;
const POLL_INTERVAL_MS = 2000;
const OBSERVE_INTERVAL_MS = 10000;
const CONVERGE_TIMEOUT_MS = 600000;
const STALL_TIMEOUT_MS = 300000;
const NODE_STATUS_ACTIVE = 'active';
const SCHEMA_ADMISSION_WAIT_MESSAGE =
  '      Waiting for production schema admission...';
const SCHEMA_ADMISSION_SUCCESS_PREFIX =
  '      Schema mutation admitted after stable control snapshots ';
const DEMO_CONSTANTS = Object.freeze({
  ADMIN_QUERY_TIMEOUT_MS: 15000,
  ADMIN_WAIT_LABEL: 'seed admin endpoint',
  ADMIN_HEALTH_QUERY: 'SELECT 1',
  SQL_ESCAPED_SINGLE_QUOTE: '\'\'',
  CONFIG_INSERT_PREFIX:
    'INSERT INTO config (config_key, config_value, value_type, ' +
    'requires_restart, description, default_value, updated_by, ' +
    'updated_at, created_at) VALUES (',
  CONFIG_VALUE_TYPE: 'json',
  SQL_FALSE: '0',
  ACCESS_POLICY_DESCRIPTION: 'Runtime service data access policy',
  EMPTY_JSON_OBJECT: '{}',
  ACCESS_POLICY_UPDATED_BY: 'affinity-demo',
  SQL_LIST_SEPARATOR: ', ',
  SQL_CLOSE_PAREN: ')',
  SERVICE_INSERT_PREFIX: 'INSERT INTO service_definitions (',
  PARTITION_SERVICE_TYPE: 'partition',
  REDUCE_SLOT_QUERY:
    'SELECT slot_id, replica_id, lease_expires_at, partial_json, ',
  NODES_QUERY: 'SELECT node_id, latency_group_id FROM nodes',
  PARTITIONS_QUERY: 'SELECT partition_id, leader_node_id FROM partitions',
  SERVICES_QUERY:
    'SELECT partition_id, node_id, service_type, status FROM services',
  MILLISECONDS_PER_SECOND: 1000,
  LOCALITY_DECIMAL_PLACES: 3,
  INITIAL_PLACEMENT_ERROR: 'service replicas were not initially placed',
  ARCHIVE_COMMAND: 'tar',
  ARCHIVE_CREATE_FLAG: '-czf',
  ARCHIVE_DIRECTORY_FLAG: '-C',
  PARENT_DIRECTORY: '..',
  PATH_SEPARATOR: '/',
  ENABLED_VALUE: '1',
  GCP_MODE: 'gcp',
  LOCAL_MODE: 'local',
  GCP_START_MESSAGE:
    '      Provisioning GCP Docker hosts and starting the cluster remotely ' +
    '(one node per VM)...',
  BOOTSTRAP_MESSAGE: '[1/5] Bootstrapping the MovieLens schema on the seed...',
  EXPANSION_SUFFIX: 'the existing data...',
  CLUSTER_FORMED_MESSAGE: '      Cluster formed.',
  FORMATION_ONLY_MESSAGE:
    '      Formation-only run: stopping after schema admission.',
  PRELOAD_WAIT_MESSAGE:
    '      Waiting for production ratings-load admission...',
  PRELOAD_SUCCESS_PREFIX: '      Ratings load admitted (snapshot=',
  LOAD_MESSAGE: '      Loading 100,000 ratings into the routable source...',
  SPLIT_WAIT_MESSAGE:
    '      Waiting for ratings partitions to split and spread...',
  DISTRIBUTED_SQL_MESSAGE:
    '[3/5] Running Lagrange distributed grouped SQL...',
  SERVICE_START_SUFFIX:
    'harness, intrinsic data affinity): disjoint movie-id shards compute a ' +
    'confidence-adjusted Bayesian ranking, publish 10 candidates each, and ' +
    'slot 1 merges them)...',
  COORDINATION_INSERT_COLUMNS:
    '(slot_id, replica_id, lease_expires_at, partial_json, computed_at) ',
  COORDINATION_INSERT_VALUES:
    'VALUES (1, \'\', 0, \'[]\', 0), (2, \'\', 0, \'[]\', 0)',
  AFFINITY_WAIT_MESSAGE:
    '[5/5] Waiting for access attribution to teach placement where the ' +
    'service data is (no affinity switch)...',
  CONVERGED_PREFIX:
    '\n      CONVERGED: intrinsic affinity reached the best production-',
  REPLICAS_MOVED: 'replicas moved',
  INITIAL_PLACEMENT_OPTIMAL: 'initial placement was already optimal',
  EXCHANGE_PREFIX: '      Cross-replica exchange was bounded to ',
  RANKING_SUFFIX: 'The confidence-adjusted top-10 is identical:\n',
  SCORE_DECIMAL_PLACES: 4,
  STOP_MESSAGE: 'Stopping cluster...',
  SCRIPT_NAME: 'run-affinity-demo.js',
  RESULT_MESSAGE: 'Affinity demo result:',
  EMPTY_STRING: '',
});
const PARTITION_EVAL_INTERVAL_MS = 60000;
const SERVICE_ID = 'svc-movielens-topn';
const SERVICE_REPLICA_COUNT = 2;
const SCAN_SQL = 'SELECT movie_id, rating FROM ratings';
const MOVIE_ID_SHARD_BOUNDARY = 1000;
const SHARD_SQL_BY_SLOT = Object.freeze({
  1: `${SCAN_SQL} WHERE movie_id <= ${MOVIE_ID_SHARD_BOUNDARY}`,
  2: `${SCAN_SQL} WHERE movie_id > ${MOVIE_ID_SHARD_BOUNDARY}`,
});
const RESULT_TABLE = 'movielens_top10';
const COORDINATION_TABLE = 'movielens_top10_reduce_slots';
const RESULT_ID = 'global-top10';
const RESULT_SNAPSHOT_COLUMN = 'source_snapshot_json';
const CREATE_RESULT_TABLE_SQL =
  `CREATE TABLE IF NOT EXISTS ${RESULT_TABLE} (` +
  'result_id TEXT PRIMARY KEY, result_json TEXT, computed_at INTEGER, ' +
  `${RESULT_SNAPSHOT_COLUMN} TEXT NOT NULL DEFAULT '{}')`;
const CREATE_COORDINATION_TABLE_SQL =
  `CREATE TABLE IF NOT EXISTS ${COORDINATION_TABLE} (` +
  'slot_id INTEGER PRIMARY KEY, replica_id TEXT, ' +
  'lease_expires_at INTEGER, partial_json TEXT, computed_at INTEGER)';
const QUERY_INTERVAL_MS = 5000;
const TOP_N = 10;
const REDUCE_SLOT_LEASE_MS = 30000;
const PARALLEL_REDUCE_CONFIG = Object.freeze({
  shardSqlBySlot: SHARD_SQL_BY_SLOT,
  coordinationTable: COORDINATION_TABLE,
  leaseMs: REDUCE_SLOT_LEASE_MS,
  coordinatorSlot: 1,
  resultId: RESULT_ID,
  resultSnapshotColumn: RESULT_SNAPSHOT_COLUMN,
});

export {
  BASE_ADMIN_PORT,
  CLUSTER_DATA_ROOT,
  CLUSTER_FORM_TIMEOUT_MS,
  CONVERGE_TIMEOUT_MS,
  COORDINATION_TABLE,
  CREATE_COORDINATION_TABLE_SQL,
  CREATE_RESULT_TABLE_SQL,
  DEMO_CONSTANTS,
  FORMATION_ONLY_ENV,
  FORMATION_ONLY_FLAG,
  GCP_MODE_ENV,
  GCP_MODE_FLAG,
  NODE_COUNT,
  NODE_STATUS_ACTIVE,
  OBSERVE_INTERVAL_MS,
  PARALLEL_REDUCE_CONFIG,
  PARTITION_EVAL_INTERVAL_MS,
  POLL_INTERVAL_MS,
  QUERY_INTERVAL_MS,
  RESULT_ID,
  RESULT_SNAPSHOT_COLUMN,
  RESULT_TABLE,
  SCAN_SQL,
  SCHEMA_ADMISSION_SUCCESS_PREFIX,
  SCHEMA_ADMISSION_WAIT_MESSAGE,
  SERVICE_ID,
  SERVICE_REPLICA_COUNT,
  STALL_TIMEOUT_MS,
  TOP_N,
};
