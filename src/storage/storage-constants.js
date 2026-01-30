const STORAGE_SUBSYSTEM = 'storage';

const STORAGE_CONFIG_KEY = Object.freeze({
  DATA_DIR: 'storage.dataDir',
});

const STORAGE_DEFAULT = Object.freeze({
  DATA_DIR: './data',
  PARTITIONS_DIRNAME: 'partitions',
  WRITE_TEST_FILENAME: '.write-test',
  WRITE_TEST_CONTENT: 'test',
  DB_EXT: '.db',
});

const STORAGE_LOG_MSG = Object.freeze({
  DATA_DIR_CONFIGURED: 'Data directory configured',
  CREATED_DIRECTORY: 'Created directory',
});

const STORAGE_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'DataDirectoryManager not initialized',
  MISSING_PARTITION_REPLICA_ID: 'partitionId and replicaId are required',
  MISSING_DATA_DIR_PARTITION_REPLICA_ID:
    'dataDir, partitionId, and replicaId are required',
});

export {
  STORAGE_CONFIG_KEY,
  STORAGE_DEFAULT,
  STORAGE_ERROR_MSG,
  STORAGE_LOG_MSG,
  STORAGE_SUBSYSTEM,
};
