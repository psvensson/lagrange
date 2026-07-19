import {test} from '../../src/test-helpers/tap.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  SYSTEM_PARTITION_CLASS,
  SYSTEM_PARTITION_CLASS_ROWS,
  classifySystemPartition,
  isBootstrapCriticalSystemPartitionId,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
  resolvePartitionTableId,
} from '../../src/bootstrap/system-partition-classification.js';

const PRIORITY_TABLE_ID = [...PRIORITY_CONTROL_PLANE_TABLE_IDS][0];
const NON_PRIORITY_SYSTEM_TABLE_ID = Object.values(SYSTEM_TABLE_NAME)
  .find((tableId) => !PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId));
const SYSTEM_TABLE_IDS = new Set(Object.values(SYSTEM_TABLE_NAME));

function partitionId(tableId, partitionNumber) {
  return `${tableId}-p${partitionNumber}`;
}

test('partition-class vocabulary and ordered rows are frozen', (t) => {
  t.same(SYSTEM_PARTITION_CLASS, {
    BOOTSTRAP_CRITICAL: 'bootstrap_critical',
    PRIORITY_CONTROL_PLANE: 'priority_control_plane',
    DEFAULT: 'default',
  });
  t.ok(Object.isFrozen(SYSTEM_PARTITION_CLASS));
  t.ok(Object.isFrozen(SYSTEM_PARTITION_CLASS_ROWS));
  t.same(
    SYSTEM_PARTITION_CLASS_ROWS.map((row) => row.partitionClass),
    [
      SYSTEM_PARTITION_CLASS.BOOTSTRAP_CRITICAL,
      SYSTEM_PARTITION_CLASS.PRIORITY_CONTROL_PLANE,
      SYSTEM_PARTITION_CLASS.DEFAULT,
    ],
  );
  for (const row of SYSTEM_PARTITION_CLASS_ROWS) {
    t.ok(Object.isFrozen(row), `${row.partitionClass} row is frozen`);
  }
  t.end();
});

test('ordered class preserves all overlapping membership facts', (t) => {
  const cases = [
    {
      name: 'priority table first partition is bootstrap-critical',
      options: {partitionId: partitionId(PRIORITY_TABLE_ID, 1)},
      expected: {
        partitionClass: SYSTEM_PARTITION_CLASS.BOOTSTRAP_CRITICAL,
        bootstrapCritical: true,
        formationLivenessDependency: false,
        priorityControlPlane: true,
        systemTable: true,
      },
    },
    {
      name: 'later priority table partition is priority-control-plane',
      options: {partitionId: partitionId(PRIORITY_TABLE_ID, 2)},
      expected: {
        partitionClass: SYSTEM_PARTITION_CLASS.PRIORITY_CONTROL_PLANE,
        bootstrapCritical: false,
        formationLivenessDependency: false,
        priorityControlPlane: true,
        systemTable: true,
      },
    },
    {
      name: 'non-priority system first partition is bootstrap-critical',
      options: {partitionId: partitionId(NON_PRIORITY_SYSTEM_TABLE_ID, 1)},
      expected: {
        partitionClass: SYSTEM_PARTITION_CLASS.BOOTSTRAP_CRITICAL,
        bootstrapCritical: true,
        formationLivenessDependency:
          NON_PRIORITY_SYSTEM_TABLE_ID === SYSTEM_TABLE_NAME.NODES,
        priorityControlPlane: false,
        systemTable: true,
      },
    },
    {
      name: 'later non-priority system partition takes default class',
      options: {partitionId: partitionId(NON_PRIORITY_SYSTEM_TABLE_ID, 2)},
      expected: {
        partitionClass: SYSTEM_PARTITION_CLASS.DEFAULT,
        bootstrapCritical: false,
        formationLivenessDependency: false,
        priorityControlPlane: false,
        systemTable: true,
      },
    },
    {
      name: 'user partition takes default with no system facts',
      options: {partitionId: 'customer_orders-p1'},
      expected: {
        partitionClass: SYSTEM_PARTITION_CLASS.DEFAULT,
        bootstrapCritical: false,
        formationLivenessDependency: false,
        priorityControlPlane: false,
        systemTable: false,
      },
    },
  ];

  for (const entry of cases) {
    const outcome = classifySystemPartition(entry.options);
    t.same(outcome, entry.expected, entry.name);
    t.ok(Object.isFrozen(outcome), `${entry.name} outcome is frozen`);
  }
  t.end();
});

test('nodes table remains bootstrap-critical without entering priority ' +
  'recovery', (t) => {
  const outcome = classifySystemPartition({
    partitionId: `${SYSTEM_TABLE_NAME.NODES}-p1`,
  });

  t.equal(
    outcome.priorityControlPlane,
    false,
    'nodes-p1 must not reactivate the rejected broad priority identity',
  );
  t.equal(
    outcome.formationLivenessDependency,
    true,
    'nodes-p1 owns only the narrow serial formation dependency fact',
  );
  t.equal(
    outcome.bootstrapCritical,
    true,
    'priority recovery classification must preserve bootstrap-critical ownership',
  );
  t.end();
});

test('bootstrap-critical ID predicate preserves exact membership', (t) => {
  const criticalPartitionId = partitionId(PRIORITY_TABLE_ID, 1);
  t.equal(isBootstrapCriticalSystemPartitionId(criticalPartitionId), true);
  t.equal(
    isBootstrapCriticalSystemPartitionId(` ${criticalPartitionId} `),
    false,
  );
  t.equal(isBootstrapCriticalSystemPartitionId(null), false);
  t.end();
});

test('partition row and snake-case fields have canonical precedence', (t) => {
  const outcome = classifySystemPartition({
    partitionId: partitionId(PRIORITY_TABLE_ID, 2),
    partitionRow: {
      partition_id: partitionId(NON_PRIORITY_SYSTEM_TABLE_ID, 1),
      partitionId: partitionId(PRIORITY_TABLE_ID, 1),
      table_id: NON_PRIORITY_SYSTEM_TABLE_ID,
      tableId: PRIORITY_TABLE_ID,
    },
  });
  t.same(outcome, {
    partitionClass: SYSTEM_PARTITION_CLASS.BOOTSTRAP_CRITICAL,
    bootstrapCritical: true,
    formationLivenessDependency:
      NON_PRIORITY_SYSTEM_TABLE_ID === SYSTEM_TABLE_NAME.NODES,
    priorityControlPlane: false,
    systemTable: true,
  });

  const camelCaseOutcome = classifySystemPartition({
    partitionId: partitionId(NON_PRIORITY_SYSTEM_TABLE_ID, 2),
    partitionRow: {
      partitionId: partitionId(PRIORITY_TABLE_ID, 2),
      tableId: PRIORITY_TABLE_ID,
    },
  });
  t.equal(
    camelCaseOutcome.partitionClass,
    SYSTEM_PARTITION_CLASS.PRIORITY_CONTROL_PLANE,
  );
  t.end();
});

test('legacy predicates delegate without changing their booleans', (t) => {
  const cases = [
    {partitionId: partitionId(PRIORITY_TABLE_ID, 1)},
    {partitionId: partitionId(PRIORITY_TABLE_ID, 2)},
    {partitionId: partitionId(NON_PRIORITY_SYSTEM_TABLE_ID, 2)},
    {partitionId: 'customer_orders-p1'},
    {partitionId: null},
    {
      partitionId: 'ignored-p9',
      partitionRow: {
        partition_id: partitionId(PRIORITY_TABLE_ID, 2),
        table_id: PRIORITY_TABLE_ID,
      },
    },
    {
      partitionId: partitionId(PRIORITY_TABLE_ID, 2),
      partitionRow: {partition_id: 'opaque'},
    },
  ];
  for (const options of cases) {
    const legacyTableId = resolvePartitionTableId(options);
    const legacyPriority = legacyTableId !== null &&
      PRIORITY_CONTROL_PLANE_TABLE_IDS.has(legacyTableId);
    const legacySystem = legacyTableId !== null &&
      SYSTEM_TABLE_IDS.has(legacyTableId);
    const outcome = classifySystemPartition(options);
    t.equal(
      isPriorityControlPlanePartition(options),
      legacyPriority,
    );
    t.equal(outcome.priorityControlPlane, legacyPriority);
    t.equal(isSystemTablePartition(options), legacySystem);
    t.equal(outcome.systemTable, legacySystem);
  }
  t.end();
});
