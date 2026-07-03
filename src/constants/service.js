const SERVICE_TYPE = Object.freeze({
  PARTITION: 'partition',
  MESSAGE_GROUP: 'message_group',
  MESSAGE_GROUP_REPLICA: 'message_group_replica',
  WASM_SERVICE: 'wasm_service',
});

const SERVICE_PROFILE = Object.freeze({
  DEFAULT: 'default',
  SQL_ENGINE: 'sql_engine',
});

// Per-service read routing locality policy (service_definitions.read_locality).
// ANY keeps uniform routing over routable replicas (implicit load spreading);
// SAME_GROUP prefers replicas in the reader's latency group, local node first.
const SERVICE_READ_LOCALITY = Object.freeze({
  ANY: 'any',
  SAME_GROUP: 'same_group',
});

// Column names for the service_partition_access system table: per-(node,
// service) attribution rows carrying JSON-packed per-partition read/write
// counts for the affinity placement feed.
const SERVICE_PARTITION_ACCESS_COL = Object.freeze({
  ACCESS_ID: 'access_id',
  NODE_ID: 'node_id',
  SERVICE_ID: 'service_id',
  ACCESS_JSON: 'access_json',
  WINDOW_STARTED_AT: 'window_started_at',
  PUBLISHED_AT: 'published_at',
});

// Access kinds recorded in the attribution matrix (compact keys — they are
// serialized into every access_json row).
const SERVICE_PARTITION_ACCESS_KIND = Object.freeze({
  READ: 'r',
  WRITE: 'w',
});

export {
  SERVICE_TYPE,
  SERVICE_PROFILE,
  SERVICE_READ_LOCALITY,
  SERVICE_PARTITION_ACCESS_COL,
  SERVICE_PARTITION_ACCESS_KIND,
};
