/**
 * Unit and integration tests for Global Secondary Index Routing & EXPLAIN DISTRIBUTED (Stage C5).
 *
 * Covers:
 * - 2-stage global index query routing (Index Scan -> Base Partition Fetch).
 * - Direct resolution without base fetch when index is covering.
 * - Automatic fallback to base scatter-gather when index is unreadable or non-matching.
 * - Compound index strict left-prefix matching and EXPLAIN DISTRIBUTED diagnostics.
 */

import {test} from '../../src/test-helpers/tap.js';
import {GLOBAL_INDEX_STATE} from '../../src/index-management/global-index-catalog-contract.js';
import {
  GLOBAL_INDEX_ACCESS_PATH,
  GlobalIndexReadRouter,
  INDEX_REJECTION_REASON,
  extractPredicateConditions,
  isIndexCovering,
  matchStrictLeftPrefix,
} from '../../src/index-management/global-index-read-router.js';

test('C5: 2-stage routed query execution narrows base partitions vs scatter-gather', async (t) => {
  const activeIndexes = [
    {
      index_name: 'idx_orders_customer_id',
      column_names: ['customer_id'],
      is_global: 1,
      state: GLOBAL_INDEX_STATE.READ_WRITE,
    },
  ];

  const indexPartitions = [
    {partition_id: 'p-idx-orders-0', partition_key_start: null, partition_key_end: null},
  ];

  const basePartitions = [
    {partition_id: 'p-base-0'},
    {partition_id: 'p-base-1'},
    {partition_id: 'p-base-2'},
  ];

  // Stage 1 index mock: customer_id = 42 exists only in base partition p-base-2
  const queriedIndexPartitions = [];
  const queriedBasePartitions = [];

  const router = new GlobalIndexReadRouter({
    getIndexCatalog: () => activeIndexes,
    getIndexPartitions: () => indexPartitions,
    getBaseTablePartitions: () => basePartitions,
    executeIndexScan: async ({indexPartitions: parts}) => {
      queriedIndexPartitions.push(...parts);
      return [
        {customer_id: 42, __base_pk_id: 101, __base_partition_id: 'p-base-2'},
        {customer_id: 42, __base_pk_id: 102, __base_partition_id: 'p-base-2'},
      ];
    },
    executeBaseFetch: async ({basePartitionId, pkList}) => {
      queriedBasePartitions.push(basePartitionId);
      return pkList.map((pk) => ({
        id: pk.id,
        customer_id: 42,
        total_amount: 99.99,
        status: 'shipped',
      }));
    },
  });

  // Query: SELECT * FROM orders WHERE customer_id = 42
  const results = await router.executeQuery({
    tableName: 'orders',
    whereClause: {customer_id: 42},
    projectedColumns: ['*'],
    basePartitionKey: 'order_id', // Base table partitioned by order_id, not customer_id
    basePrimaryKeyColumns: ['id'],
  });

  t.equal(results.length, 2, '2 rows returned');
  t.same(queriedIndexPartitions, ['p-idx-orders-0'], 'Stage 1 scanned index partition');
  t.same(
    queriedBasePartitions,
    ['p-base-2'],
    'Stage 2 fetched base rows ONLY from matching base partition p-base-2 (avoiding p-base-0 and p-base-1)',
  );
});

test('C5: Covering index returns directly from Stage 1 without base fetch', async (t) => {
  const activeIndexes = [
    {
      index_name: 'idx_orders_customer_id',
      column_names: ['customer_id'],
      is_global: 1,
      state: GLOBAL_INDEX_STATE.READ_WRITE,
    },
  ];

  let baseFetchCalled = false;

  const router = new GlobalIndexReadRouter({
    getIndexCatalog: () => activeIndexes,
    getIndexPartitions: () => [{partition_id: 'p-idx-orders-0'}],
    getBaseTablePartitions: () => [{partition_id: 'p-base-0'}, {partition_id: 'p-base-1'}],
    executeIndexScan: async () => [
      {customer_id: 42, __base_pk_id: 101, __base_partition_id: 'p-base-1'},
    ],
    executeBaseFetch: async () => {
      baseFetchCalled = true;
      return [];
    },
  });

  // Query projects ONLY customer_id and id (both covered by index dataset)
  const results = await router.executeQuery({
    tableName: 'orders',
    whereClause: {customer_id: 42},
    projectedColumns: ['customer_id', 'id'],
    basePartitionKey: 'order_id',
    basePrimaryKeyColumns: ['id'],
  });

  t.equal(results.length, 1);
  t.equal(results[0].customer_id, 42);
  t.equal(results[0].id, 101);
  t.notOk(baseFetchCalled, 'Covering index returned directly without Stage 2 base fetch');
});

test('C5: Automatic scatter-gather fallback when index is unreadable or non-matching', async (t) => {
  const router = new GlobalIndexReadRouter({
    getIndexCatalog: () => [
      // Index exists but is BACKFILLING (not READ_WRITE)
      {
        index_name: 'idx_orders_status',
        column_names: ['status'],
        is_global: 1,
        state: GLOBAL_INDEX_STATE.BACKFILLING,
      },
    ],
    getIndexPartitions: () => [],
    getBaseTablePartitions: () => [
      {partition_id: 'p-base-0'},
      {partition_id: 'p-base-1'},
    ],
  });

  const plan = router.planAccessPath({
    tableName: 'orders',
    whereClause: {status: 'completed'},
    projectedColumns: ['*'],
    basePartitionKey: 'order_id',
  });

  t.equal(
    plan.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.SCATTER_GATHER,
    'Falls back to base SCATTER_GATHER',
  );
  t.same(plan.basePartitions, ['p-base-0', 'p-base-1'], 'Includes all base partitions');
  t.equal(plan.rejectedIndexes.length, 1);
  t.equal(
    plan.rejectedIndexes[0].reason,
    INDEX_REJECTION_REASON.INDEX_NOT_READ_WRITE,
    'Records INDEX_NOT_READ_WRITE rejection',
  );
});

test('C5: Compound index strict left-prefix matching and EXPLAIN DISTRIBUTED diagnostics', async (t) => {
  const activeIndexes = [
    {
      index_name: 'idx_compound',
      column_names: ['region', 'department', 'role'],
      is_global: 1,
      state: GLOBAL_INDEX_STATE.READ_WRITE,
    },
  ];

  const router = new GlobalIndexReadRouter({
    getIndexCatalog: () => activeIndexes,
    getIndexPartitions: () => [{partition_id: 'p-idx-0'}],
    getBaseTablePartitions: () => [{partition_id: 'p-base-0'}],
  });

  // Direct prefix & covering helper tests
  const conds = extractPredicateConditions({
    region: 'US',
    department: {operator: '>', value: 'eng'},
  });
  t.ok(conds.has('region'));
  t.ok(conds.has('department'));

  const prefixTest = matchStrictLeftPrefix(['region', 'department', 'role'], conds);
  t.equal(prefixTest.matched, true);
  t.same(prefixTest.equalityPrefixColumns, ['region']);
  t.equal(prefixTest.rangeColumn, 'department');

  t.ok(isIndexCovering(['region', 'department'], ['region', 'department'], ['id']));
  t.notOk(isIndexCovering(['salary'], ['region', 'department'], ['id']));

  // 1. Non-leading column predicate: department = 'sales' -> Rejected!
  const explainNonLeading = router.explainDistributed({
    tableName: 'employees',
    whereClause: {department: 'sales'},
    projectedColumns: ['*'],
    basePartitionKey: 'id',
  });
  t.equal(explainNonLeading.accessPath, GLOBAL_INDEX_ACCESS_PATH.SCATTER_GATHER);
  t.equal(explainNonLeading.rejectedIndexes[0].reason, INDEX_REJECTION_REASON.PREFIX_NOT_MATCHED);

  // 2. Strict left-prefix: region = 'US' AND department = 'sales' -> Selected!
  const explainPrefix = router.explainDistributed({
    tableName: 'employees',
    whereClause: {region: 'US', department: 'sales'},
    projectedColumns: ['*'],
    basePartitionKey: 'id',
  });
  t.equal(explainPrefix.accessPath, GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX);
  t.same(explainPrefix.selectedIndex.equalityPrefixColumns, ['region', 'department']);
  t.equal(explainPrefix.selectedIndex.rangeColumn, null);

  // 3. Prefix with range on next column: region = 'US' AND department > 'eng'
  const explainRange = router.explainDistributed({
    tableName: 'employees',
    whereClause: {
      region: 'US',
      department: {operator: '>', value: 'eng'},
    },
    projectedColumns: ['*'],
    basePartitionKey: 'id',
  });
  t.equal(explainRange.accessPath, GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX);
  t.same(explainRange.selectedIndex.equalityPrefixColumns, ['region']);
  t.equal(explainRange.selectedIndex.rangeColumn, 'department');
});
