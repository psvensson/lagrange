import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  REPLICA_OPERATIONS_SCHEMA,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from
  '../../src/partition/partition-service.js';

const LEGACY_REPLICA_OPERATIONS_SCHEMA = Object.freeze({
  tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  columns: REPLICA_OPERATIONS_SCHEMA.columns.filter(
    (column) => column.name !== 'target_claim_key',
  ),
});

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'schema-migration-node'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function buildPartitionOptions(dbPath, schema) {
  return {
    partitionId: 'replica_operations-p1',
    tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    schema,
    replicaId: 'replica_operations-p1-r1',
    nodeId: 'schema-migration-node',
    dbPath,
  };
}

test('replica_operations restart migration adds the durable target claim ' +
  'column and unique index', async (t) => {
  initializeEnvironment();
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'replica-operation-target-claim-'),
  );
  const dbPath = path.join(tempDir, 'replica-operations.db');
  const legacyPartition = new PartitionService(
    buildPartitionOptions(dbPath, LEGACY_REPLICA_OPERATIONS_SCHEMA),
  );

  try {
    await legacyPartition.initialize();
    await legacyPartition.shutdown();

    const repairedPartition = new PartitionService(
      buildPartitionOptions(dbPath, REPLICA_OPERATIONS_SCHEMA),
    );
    try {
      await repairedPartition.initialize();
      const columns = repairedPartition.db
        .prepare(
          `PRAGMA table_info(${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS})`,
        )
        .all()
        .map((column) => column.name);
      const targetClaimIndex = repairedPartition.db
        .prepare(
          `PRAGMA index_list(${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS})`,
        )
        .all()
        .find((index) =>
          index.name === 'idx_replica_ops_target_claim_key');

      t.ok(
        columns.includes('target_claim_key'),
        'restart repairs the existing table before operation writes resume',
      );
      t.equal(
        targetClaimIndex?.unique,
        1,
        'the repaired column has the same durable single-winner constraint',
      );
    } finally {
      await repairedPartition.shutdown();
    }
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
