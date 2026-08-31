// Independent CONTROL for the critical-system-placement-distinct-node-invariant-v2
// quest. It deliberately does NOT import the new evaluator, so it stays green
// when the evaluator is absent and reds only if the existing classification
// vocabulary it guards actually changed.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_SYSTEM_PARTITION_IDS,
  classifySystemPartition,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

test('classification-vocabulary-unchanged', () => {
  const declared = [...CRITICAL_SYSTEM_PARTITION_IDS].sort();
  const expected = Object.values(SYSTEM_TABLE_NAME)
    .map((tableName) => `${tableName}-p1`).sort();
  assert.deepEqual(declared, expected,
    'the critical set is still first-partition-of-every-system-table');

  const classification = classifySystemPartition({
    partitionId: `${SYSTEM_TABLE_NAME.SERVICES}-p1`,
  });
  assert.equal(classification.systemTable, true);
  assert.equal(classification.bootstrapCritical, true);
  assert.deepEqual(Object.keys(classification).sort(), [
    'bootstrapCritical', 'formationLivenessDependency', 'operationLedger',
    'partitionClass', 'priorityControlPlane', 'systemTable',
  ]);
});
