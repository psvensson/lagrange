/**
 * A node's own CONFIG partition replica on disk: the replica DB at the
 * production path ({dataDir}/partitions/config-p1/{replicaId}.db), the
 * production CONFIG schema, and the `cluster_id` row shaped as the founding
 * seed writes it. The startup comparison (local-cluster-identity.js) reads
 * exactly this file.
 */
import Database from 'better-sqlite3';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {
  CONFIG_SCHEMA,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  SYSTEM_TABLE_NAME,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CLUSTER_ID_CONFIG_KEY} from
  '../../src/bootstrap/cluster-identity-constants.js';
import {CONFIG_VALUE_TYPE} from '../../src/config/config-definitions.js';
import {COLUMN} from '../../src/constants/index.js';
import {getPartitionDbPath} from '../../src/storage/data-directory-manager.js';

const FOUNDED_AT = 1700000000000;

/**
 * Write one CONFIG replica DB, holding the cluster_id row when given.
 * @param {string} dataDir Data directory.
 * @param {Object} [options]
 * @param {string|null} [options.clusterId] The row's value; null leaves the
 *   replica without the row (not yet applied).
 * @param {number} [options.replicaIndex] Which founding replica id to use.
 * @return {Promise<string>} The replica DB path.
 */
async function writeDurableConfigReplica(dataDir, {clusterId = null,
  replicaIndex = 0} = {}) {
  const dbPath = getPartitionDbPath(dataDir,
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONFIG],
    INITIAL_REPLICA_IDS[SYSTEM_TABLE_NAME.CONFIG][replicaIndex]);
  await mkdir(dirname(dbPath), {recursive: true});
  const database = new Database(dbPath);
  try {
    database.exec(generateCreateTableSQL(CONFIG_SCHEMA));
    if (clusterId !== null) {
      database.prepare(
        `INSERT INTO ${CONFIG_SCHEMA.tableName} (${COLUMN.CONFIG_KEY}, ` +
        `${COLUMN.CONFIG_VALUE}, ${COLUMN.VALUE_TYPE}, ` +
        `${COLUMN.REQUIRES_RESTART}, ${COLUMN.DEFAULT_VALUE}, ` +
        `${COLUMN.CREATED_AT}) VALUES (?, ?, ?, 0, ?, ?)`,
      ).run(CLUSTER_ID_CONFIG_KEY, clusterId, CONFIG_VALUE_TYPE.STRING,
        clusterId, FOUNDED_AT);
    }
  } finally {
    database.close();
  }
  return dbPath;
}

export {writeDurableConfigReplica};
