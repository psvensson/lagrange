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

export {SERVICE_TYPE, SERVICE_PROFILE};
