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

const PREVIOUS_REPLICA_OPERATIONS_SCHEMA = Object.freeze({
  tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  columns: REPLICA_OPERATIONS_SCHEMA.columns.filter((column) =>
    ![
      'membership_publication_epoch',
      'target_claim_key',
    ].includes(column.name),
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

test('replica_operations restart migrates every current durable owner column',
  async (t) => {
    initializeEnvironment();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'replica-operation-schema-migration-'),
    );
    const dbPath = path.join(tempDir, 'replica-operations.db');
    const previousPartition = new PartitionService(
      buildPartitionOptions(dbPath, PREVIOUS_REPLICA_OPERATIONS_SCHEMA),
    );

    try {
      await previousPartition.initialize();
      await previousPartition.shutdown();

      const currentPartition = new PartitionService(
        buildPartitionOptions(dbPath, REPLICA_OPERATIONS_SCHEMA),
      );
      try {
        await currentPartition.initialize();
        const columns = currentPartition.db
          .prepare(
            `PRAGMA table_info(${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS})`,
          )
          .all()
          .map((column) => column.name);
        const targetClaimIndex = currentPartition.db
          .prepare(
            `PRAGMA index_list(${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS})`,
          )
          .all()
          .find((index) =>
            index.name === 'idx_replica_ops_target_claim_key');

        t.ok(
          columns.includes('target_claim_key'),
          'restart adds the durable target-claim owner column',
        );
        t.ok(
          columns.includes('membership_publication_epoch'),
          'restart adds the sole durable planning-epoch owner column',
        );
        t.equal(
          targetClaimIndex?.unique,
          1,
          'the target-claim column retains its single-winner constraint',
        );
      } finally {
        await currentPartition.shutdown();
      }
    } finally {
      fs.rmSync(tempDir, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
