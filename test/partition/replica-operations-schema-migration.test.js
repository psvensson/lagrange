import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  REPLICA_OPERATIONS_SCHEMA,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_COLUMNS,
  REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_LANE_INDEX,
} from '../../src/bootstrap/replica-operation-message-group-membership-schema-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from
  '../../src/partition/partition-service.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

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

test('replica_operations bootstrap creates every current durable owner column and index from canonical schema',
  async (t) => {
    initializeEnvironment();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'replica-operation-schema-bootstrap-'),
    );
    const dbPath = path.join(tempDir, 'replica-operations.db');
    const currentPartition = new PartitionService(
      withFoundingStamp(buildPartitionOptions(dbPath, REPLICA_OPERATIONS_SCHEMA)),
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
      const membershipLaneIndex = currentPartition.db
        .prepare(
          `PRAGMA index_list(${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS})`,
        )
        .all()
        .find((index) => index.name ===
          REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_LANE_INDEX.name);

      t.ok(
        columns.includes('target_claim_key'),
        'canonical schema creates the durable target-claim owner column',
      );
      t.ok(
        columns.includes('membership_publication_epoch'),
        'canonical schema creates the sole durable planning-epoch owner column',
      );
      const admissionColumns = [
        'create_admission_state',
        'create_admission_token',
        'create_admission_replica_created_at',
        'create_admission_attempt_token',
        'create_admission_previous_attempt_token',
        'create_admission_attempt_seq',
        'create_admission_workflow_updated_at',
        'create_admission_owner_incarnation',
      ];
      t.ok(
        admissionColumns.every((column) => columns.includes(column)),
        'canonical schema creates every handler-owned CREATE admission column',
      );
      const membershipColumns =
        REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_COLUMNS.map(
          (column) => column.name,
        );
      t.ok(
        membershipColumns.every((column) => columns.includes(column)),
        'canonical schema creates every message-group membership owner column',
      );
      t.equal(
        targetClaimIndex?.unique,
        1,
        'the target-claim column retains its single-winner constraint',
      );
      t.equal(
        membershipLaneIndex?.unique,
        1,
        'canonical schema creates the authoritative single-winner membership lane',
      );
    } finally {
      await currentPartition.shutdown();
      fs.rmSync(tempDir, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
