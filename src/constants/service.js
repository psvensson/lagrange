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

export {SERVICE_TYPE, SERVICE_PROFILE, SERVICE_READ_LOCALITY};
