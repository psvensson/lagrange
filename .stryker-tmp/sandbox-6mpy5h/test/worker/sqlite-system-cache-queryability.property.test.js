/**
 * Property Test: Cache SQL Queryability
 * **Property 8: Cache SQL Queryability**
 * **Validates: Requirements 3.5**
 *
 * Feature: worker-process-replica-isolation, Property 8: Cache SQL Queryability
 *
 * *For any* valid SQL query against system tables, the SQLiteSystemCache SHALL
 * return results equivalent to querying the same data in a standard SQLite
 * database.
 *
 * This property test verifies:
 * 1. For any set of inserted records, a SELECT * query SHALL return all
 *    inserted records
 * 2. For any set of inserted records with a WHERE clause, the query SHALL
 *    return only matching records
 * 3. For any set of inserted records with ORDER BY, the query SHALL return
 *    records in correct order
 * 4. For any set of inserted records, COUNT(*) SHALL return the correct count
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SQLiteSystemCache} from '../../src/worker/sqlite-system-cache.js';
import {CDC_OPERATION} from '../../src/constants/index.js';

/**
 * Generator for valid node IDs (alphanumeric with hyphens).
 */
const nodeIdArb = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
  ),
  {minLength: 1, maxLength: 10},
).map((s) => `node-${s}`);

/**
 * Generator for valid node addresses.
 */
const nodeAddressArb = fc.tuple(
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    {minLength: 1, maxLength: 10},
  ),
  fc.integer({min: 1024, max: 65535}),
).map(([host, port]) => `ws://${host}:${port}`);

/**
 * Generator for node status values.
 */
const nodeStatusArb = fc.constantFrom('active', 'inactive', 'draining');

/**
 * Generator for CPU cores (positive integer).
 */
const cpuCoresArb = fc.integer({min: 1, max: 128});

/**
 * Generator for memory in MB (positive integer).
 */
const memoryMbArb = fc.integer({min: 512, max: 131072});

/**
 * Generator for disk in GB (positive integer).
 */
const diskGbArb = fc.integer({min: 10, max: 10000});

/**
 * Generator for a complete node record.
 */
const nodeRecordArb = fc.record({
  node_id: nodeIdArb,
  node_address: nodeAddressArb,
  cpu_cores: cpuCoresArb,
  memory_mb: memoryMbArb,
  disk_gb: diskGbArb,
  status: nodeStatusArb,
  connection_state: fc.constantFrom('connected', 'disconnected'),
  last_heartbeat: fc.integer({min: 1000000000000, max: 2000000000000}),
  created_at: fc.integer({min: 1000000000000, max: 2000000000000}),
});

/**
 * Generator for a unique set of node records (unique by node_id and
 * node_address).
 */
const uniqueNodeRecordsArb = fc.array(nodeRecordArb, {minLength: 1, maxLength: 10})
  .map((records) => {
    // Deduplicate by node_id and node_address
    const seenIds = new Set();
    const seenAddresses = new Set();
    return records.filter((record) => {
      if (seenIds.has(record.node_id) || seenAddresses.has(record.node_address)) {
        return false;
      }
      seenIds.add(record.node_id);
      seenAddresses.add(record.node_address);
      return true;
    });
  })
  .filter((records) => records.length > 0);

/**
 * Helper to create and initialize a cache with records.
 * @param {Array<Object>} records - Node records to insert
 * @return {SQLiteSystemCache} Initialized cache with records
 */
function createCacheWithRecords(records) {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  for (const record of records) {
    cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record);
  }

  return cache;
}

test('Property 8: Cache SQL Queryability', async (t) => {
  /**
   * Property: For any set of inserted records, a SELECT * query SHALL return
   * all inserted records.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('SELECT * returns all inserted records', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        (records) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query all records
            const results = cache.query('SELECT * FROM nodes');

            // Verify count matches
            const countMatches = results.length === records.length;

            // Verify all inserted node_ids are present in results
            const resultIds = new Set(results.map((r) => r.node_id));
            const allIdsPresent = records.every((r) => resultIds.has(r.node_id));

            return countMatches && allIdsPresent;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('SELECT * returns all inserted records');
  });

  /**
   * Property: For any set of inserted records with a WHERE clause, the query
   * SHALL return only matching records.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('WHERE clause filters records correctly', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        (records) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query only active nodes
            const activeResults = cache.query(
              'SELECT * FROM nodes WHERE status = ?',
              ['active'],
            );

            // Manually filter expected active records
            const expectedActive = records.filter((r) => r.status === 'active');

            // Verify count matches
            const countMatches = activeResults.length === expectedActive.length;

            // Verify all returned records have status 'active'
            const allActive = activeResults.every((r) => r.status === 'active');

            // Verify all expected node_ids are present
            const resultIds = new Set(activeResults.map((r) => r.node_id));
            const allExpectedPresent = expectedActive.every(
              (r) => resultIds.has(r.node_id),
            );

            return countMatches && allActive && allExpectedPresent;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('WHERE clause filters records correctly');
  });

  /**
   * Property: For any set of inserted records with a WHERE clause using
   * numeric comparison, the query SHALL return only matching records.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('WHERE clause with numeric comparison filters correctly', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        fc.integer({min: 1, max: 64}),
        (records, minCores) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query nodes with cpu_cores >= minCores
            const results = cache.query(
              'SELECT * FROM nodes WHERE cpu_cores >= ?',
              [minCores],
            );

            // Manually filter expected records
            const expected = records.filter((r) => r.cpu_cores >= minCores);

            // Verify count matches
            const countMatches = results.length === expected.length;

            // Verify all returned records meet the condition
            const allMeetCondition = results.every((r) => r.cpu_cores >= minCores);

            // Verify all expected node_ids are present
            const resultIds = new Set(results.map((r) => r.node_id));
            const allExpectedPresent = expected.every(
              (r) => resultIds.has(r.node_id),
            );

            return countMatches && allMeetCondition && allExpectedPresent;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('WHERE clause with numeric comparison filters correctly');
  });

  /**
   * Property: For any set of inserted records with ORDER BY, the query SHALL
   * return records in correct order.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('ORDER BY returns records in correct order', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        (records) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query with ORDER BY cpu_cores DESC
            const results = cache.query(
              'SELECT * FROM nodes ORDER BY cpu_cores DESC',
            );

            // Verify count matches
            const countMatches = results.length === records.length;

            // Verify ordering is correct (descending by cpu_cores)
            let isOrdered = true;
            for (let i = 1; i < results.length; i++) {
              if (results[i].cpu_cores > results[i - 1].cpu_cores) {
                isOrdered = false;
                break;
              }
            }

            return countMatches && isOrdered;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('ORDER BY returns records in correct order');
  });

  /**
   * Property: For any set of inserted records with ORDER BY ASC, the query
   * SHALL return records in ascending order.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('ORDER BY ASC returns records in ascending order', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        (records) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query with ORDER BY memory_mb ASC
            const results = cache.query(
              'SELECT * FROM nodes ORDER BY memory_mb ASC',
            );

            // Verify count matches
            const countMatches = results.length === records.length;

            // Verify ordering is correct (ascending by memory_mb)
            let isOrdered = true;
            for (let i = 1; i < results.length; i++) {
              if (results[i].memory_mb < results[i - 1].memory_mb) {
                isOrdered = false;
                break;
              }
            }

            return countMatches && isOrdered;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('ORDER BY ASC returns records in ascending order');
  });

  /**
   * Property: For any set of inserted records, COUNT(*) SHALL return the
   * correct count.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('COUNT(*) returns correct count', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        (records) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query count
            const results = cache.query('SELECT COUNT(*) as count FROM nodes');

            // Verify count matches
            const countMatches = results[0].count === records.length;

            return countMatches;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('COUNT(*) returns correct count');
  });

  /**
   * Property: For any set of inserted records with a WHERE clause, COUNT(*)
   * SHALL return the correct filtered count.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('COUNT(*) with WHERE returns correct filtered count', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        (records) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query count of active nodes
            const results = cache.query(
              'SELECT COUNT(*) as count FROM nodes WHERE status = ?',
              ['active'],
            );

            // Manually count expected active records
            const expectedCount = records.filter(
              (r) => r.status === 'active',
            ).length;

            // Verify count matches
            const countMatches = results[0].count === expectedCount;

            return countMatches;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('COUNT(*) with WHERE returns correct filtered count');
  });

  /**
   * Property: For any set of inserted records, querying specific columns SHALL
   * return only those columns.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('SELECT specific columns returns only those columns', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        (records) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query only node_id and status columns
            const results = cache.query(
              'SELECT node_id, status FROM nodes',
            );

            // Verify count matches
            const countMatches = results.length === records.length;

            // Verify only requested columns are present
            const hasOnlyRequestedColumns = results.every((r) => {
              const keys = Object.keys(r);
              return keys.length === 2 &&
                     keys.includes('node_id') &&
                     keys.includes('status');
            });

            // Verify values match original records
            const valuesMatch = results.every((r) => {
              const original = records.find((rec) => rec.node_id === r.node_id);
              return original && r.status === original.status;
            });

            return countMatches && hasOnlyRequestedColumns && valuesMatch;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('SELECT specific columns returns only those columns');
  });

  /**
   * Property: For any set of inserted records with multiple WHERE conditions,
   * the query SHALL return only records matching all conditions.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('Multiple WHERE conditions filter correctly', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        fc.integer({min: 1, max: 32}),
        (records, minCores) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query with multiple conditions
            const results = cache.query(
              'SELECT * FROM nodes WHERE status = ? AND cpu_cores >= ?',
              ['active', minCores],
            );

            // Manually filter expected records
            const expected = records.filter(
              (r) => r.status === 'active' && r.cpu_cores >= minCores,
            );

            // Verify count matches
            const countMatches = results.length === expected.length;

            // Verify all returned records meet both conditions
            const allMeetConditions = results.every(
              (r) => r.status === 'active' && r.cpu_cores >= minCores,
            );

            return countMatches && allMeetConditions;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Multiple WHERE conditions filter correctly');
  });

  /**
   * Property: For any set of inserted records with LIMIT, the query SHALL
   * return at most the specified number of records.
   *
   * This validates Requirement 3.5: THE SystemTableCache in each Worker_Process
   * SHALL be queryable via SQL for cache lookups.
   */
  t.test('LIMIT restricts result count', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeRecordsArb,
        fc.integer({min: 1, max: 5}),
        (records, limit) => {
          const cache = createCacheWithRecords(records);

          try {
            // Query with LIMIT
            const results = cache.query(
              'SELECT * FROM nodes LIMIT ?',
              [limit],
            );

            // Verify count is at most the limit
            const countWithinLimit = results.length <= limit;

            // Verify count is correct (min of limit and total records)
            const expectedCount = Math.min(limit, records.length);
            const countCorrect = results.length === expectedCount;

            return countWithinLimit && countCorrect;
          } finally {
            cache.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('LIMIT restricts result count');
  });
});

