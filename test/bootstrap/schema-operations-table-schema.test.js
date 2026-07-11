import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  PRIORITY_CONTROL_PLANE_PARTITION_IDS,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  isCriticalTransportControlPlanePartition,
  isPriorityControlPlanePartition,
} from '../../src/bootstrap/system-partition-classification.js';
import {getSystemTableCdcPolicy} from '../../src/cache/cdc-table-policy.js';

test('schema_operations is a bootstrapped priority workflow aggregate', (t) => {
  const schema = getSchemaByTableName(TABLES.SCHEMA_OPERATIONS);
  t.ok(schema);
  const columns = new Map(schema.columns.map((column) => [column.name, column]));
  t.equal(columns.get('job_id').primaryKey, true);
  t.equal(columns.get('table_identity_key').unique, true);
  t.equal(columns.get('workflow_record').notNull, true);
  t.equal(columns.get('row_version').notNull, true);
  t.equal(columns.get('workflow_fence_token').notNull, true);

  const partitionId = INITIAL_PARTITION_IDS[TABLES.SCHEMA_OPERATIONS];
  t.equal(partitionId, 'schema_operations-p1');
  t.equal(INITIAL_REPLICA_IDS[TABLES.SCHEMA_OPERATIONS].length, 3);
  t.ok(PRIORITY_CONTROL_PLANE_PARTITION_IDS.has(partitionId));
  t.equal(isPriorityControlPlanePartition({partitionId}), true);
  t.equal(isCriticalTransportControlPlanePartition({partitionId}), true);

  const cdcPolicy = getSystemTableCdcPolicy(TABLES.SCHEMA_OPERATIONS);
  t.equal(cdcPolicy.internalCachePropagation, false);
  t.equal(cdcPolicy.readinessRelevant, false);
  t.equal(cdcPolicy.externalCdcAllowed, false);
  t.end();
});
