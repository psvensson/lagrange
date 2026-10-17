const STORAGE_SUBSYSTEM = 'storage';

const STORAGE_CONFIG_KEY = Object.freeze({
  DATA_DIR: 'storage.dataDir',
});

const STORAGE_DEFAULT = Object.freeze({
  DATA_DIR: './data',
  PARTITIONS_DIRNAME: 'partitions',
  MESSAGE_GROUPS_DIRNAME: 'message-groups',
  WASM_SERVICES_DIRNAME: 'wasm-services',
  WRITE_TEST_FILENAME: '.write-test',
  WRITE_TEST_CONTENT: 'test',
  DB_EXT: '.db',
});

// The durability pragmas of a consensus replica's own database file: one
// choice for every group kind that keeps one (design R3 section 1.2, R06;
// owner decision O4 records what they survive).
const REPLICA_DB_PRAGMA = Object.freeze({
  JOURNAL_MODE: 'journal_mode = WAL',
  SYNCHRONOUS: 'synchronous = NORMAL',
});

const STORAGE_LOG_MSG = Object.freeze({
  DATA_DIR_CONFIGURED: 'Data directory configured',
  CREATED_DIRECTORY: 'Created directory',
});

const STORAGE_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'DataDirectoryManager not initialized',
  MISSING_PARTITION_REPLICA_ID: 'partitionId and replicaId are required',
  MISSING_MESSAGE_GROUP_REPLICA_ID: 'dataDir, groupId and replicaId are required',
  MISSING_WASM_SERVICE_REPLICA_ID: 'serviceId and replicaId are required',
  MISSING_DATA_DIR_PARTITION_REPLICA_ID:
    'dataDir, partitionId, and replicaId are required',
});

export {
  REPLICA_DB_PRAGMA,
  STORAGE_CONFIG_KEY,
  STORAGE_DEFAULT,
  STORAGE_ERROR_MSG,
  STORAGE_LOG_MSG,
  STORAGE_SUBSYSTEM,
};
