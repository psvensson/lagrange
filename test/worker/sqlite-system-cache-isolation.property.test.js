/**
 * Property Test: Cache Instance Isolation
 * **Property 6: Cache Instance Isolation**
 * **Validates: Requirements 3.2**
 *
 * Feature: worker-process-replica-isolation, Property 6: Cache Instance Isolation
 *
 * *For any* two worker processes on the same node, their SystemTableCache
 * instances SHALL be distinct objects with no shared references.
 *
 * This property test verifies:
 * 1. For any two cache instances, inserting data into one SHALL NOT affect
 *    the other
 * 2. For any two cache instances, updating data in one SHALL NOT affect
 *    the other
 * 3. For any two cache instances, deleting data from one SHALL NOT affect
 *    the other
 * 4. For any two cache instances, applying replication state to one SHALL NOT
 *    affect the other
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SQLiteSystemCache} from '../../src/worker/sqlite-system-cache.js';
import {CDC_OPERATION} from '../../src/constants/index.js';

/**
 * Generator for valid node IDs (alphanumeric with prefix).
 */
const nodeIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/)
  .map((s) => `node-${s}`);

/**
 * Generator for valid node addresses.
 */
const nodeAddressArb = fc.tuple(
  fc.stringMatching(/^[a-z]{1,10}$/),
  fc.integer({min: 1024, max: 65535}),
).map(([host, port]) => `ws://${host}:${port}`);

/**
 * Generator for node status values.
 */
const nodeStatusArb = fc.constantFrom('active', 'inactive', 'draining');

/**
 * Generator for a complete node record.
 */
const nodeRecordArb = fc.record({
  node_id: nodeIdArb,
  node_address: nodeAddressArb,
  cpu_cores: fc.integer({min: 1, max: 128}),
  memory_mb: fc.integer({min: 512, max: 131072}),
  disk_gb: fc.integer({min: 10, max: 10000}),
  status: nodeStatusArb,
  ws_connection_state: fc.constantFrom('connected', 'disconnected'),
  last_heartbeat: fc.integer({min: 1000000000000, max: 2000000000000}),
  created_at: fc.integer({min: 1000000000000, max: 2000000000000}),
});

/**
 * Generator for a unique set of node records (unique by node_id and
 * node_address).
 */
const uniqueNodeRecordsArb = fc.array(nodeRecordArb, {minLength: 1, maxLength: 5})
  .map((records) => {
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
 * Generator for two distinct node records (for isolation testing).
 */
const twoDistinctNodeRecordsArb = fc.tuple(nodeRecordArb, nodeRecordArb)
  .filter(([r1, r2]) =>
    r1.node_id !== r2.node_id && r1.node_address !== r2.node_address);

/**
 * Helper to create and initialize a cache.
 * @return {SQLiteSystemCache} Initialized cache
 */
function createCache() {
  const cache = new SQLiteSystemCache();
  cache.initialize();
  return cache;
}

/**
 * Helper to create and initialize a cache with records.
 * @param {Array<Object>} records - Node records to insert
 * @return {SQLiteSystemCache} Initialized cache with records
 */
function createCacheWithRecords(records) {
  const cache = createCache();
  for (const record of records) {
    cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record);
  }
  return cache;
}

test('Property 6: Cache Instance Isolation', async (t) => {
  /**
   * Property: For any two cache instances, inserting data into one SHALL NOT
   * affect the other.
   *
   * This validates Requirement 3.2: THE Worker_Process SHALL NOT share
   * SystemTableCache instances with other Worker_Processes.
   */
  t.test('INSERT isolation: inserting into one cache does not affect another',
    async (t) => {
      fc.assert(
        fc.property(
          nodeRecordArb,
          (record) => {
            const cache1 = createCache();
            const cache2 = createCache();

            try {
              // Verify both caches start empty
              const initialCount1 = cache1.getAll('nodes').length;
              const initialCount2 = cache2.getAll('nodes').length;
              if (initialCount1 !== 0 || initialCount2 !== 0) {
                return false;
              }

              // Insert into cache1 only
              cache1.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record);

              // Verify cache1 has the record
              const cache1Record = cache1.get('nodes', record.node_id);
              if (!cache1Record || cache1Record.node_id !== record.node_id) {
                return false;
              }

              // Verify cache2 does NOT have the record (isolation)
              const cache2Record = cache2.get('nodes', record.node_id);
              if (cache2Record !== undefined) {
                return false;
              }

              // Verify cache2 count is still 0
              const finalCount2 = cache2.getAll('nodes').length;
              return finalCount2 === 0;
            } finally {
              cache1.close();
              cache2.close();
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('INSERT isolation verified');
    });

  /**
   * Property: For any two cache instances with the same initial data, updating
   * data in one SHALL NOT affect the other.
   *
   * This validates Requirement 3.2: THE Worker_Process SHALL NOT share
   * SystemTableCache instances with other Worker_Processes.
   */
  t.test('UPDATE isolation: updating in one cache does not affect another',
    async (t) => {
      fc.assert(
        fc.property(
          nodeRecordArb,
          nodeStatusArb,
          (record, newStatus) => {
            const cache1 = createCache();
            const cache2 = createCache();

            try {
              // Insert the same record into both caches
              cache1.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record);
              cache2.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record);

              // Verify both have the record with original status
              const original1 = cache1.get('nodes', record.node_id);
              const original2 = cache2.get('nodes', record.node_id);
              if (!original1 || !original2) {
                return false;
              }
              if (original1.status !== record.status ||
                  original2.status !== record.status) {
                return false;
              }

              // Update only cache1
              cache1.applyCDCEvent('nodes', CDC_OPERATION.UPDATE, {
                node_id: record.node_id,
                status: newStatus,
              });

              // Verify cache1 has the updated status
              const updated1 = cache1.get('nodes', record.node_id);
              if (!updated1 || updated1.status !== newStatus) {
                return false;
              }

              // Verify cache2 still has the ORIGINAL status (isolation)
              const unchanged2 = cache2.get('nodes', record.node_id);
              if (!unchanged2 || unchanged2.status !== record.status) {
                return false;
              }

              return true;
            } finally {
              cache1.close();
              cache2.close();
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('UPDATE isolation verified');
    });

  /**
   * Property: For any two cache instances with the same initial data, deleting
   * data from one SHALL NOT affect the other.
   *
   * This validates Requirement 3.2: THE Worker_Process SHALL NOT share
   * SystemTableCache instances with other Worker_Processes.
   */
  t.test('DELETE isolation: deleting from one cache does not affect another',
    async (t) => {
      fc.assert(
        fc.property(
          nodeRecordArb,
          (record) => {
            const cache1 = createCache();
            const cache2 = createCache();

            try {
              // Insert the same record into both caches
              cache1.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record);
              cache2.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record);

              // Verify both have the record
              if (!cache1.get('nodes', record.node_id) ||
                  !cache2.get('nodes', record.node_id)) {
                return false;
              }

              // Delete from cache1 only
              cache1.applyCDCEvent('nodes', CDC_OPERATION.DELETE, {
                node_id: record.node_id,
              });

              // Verify cache1 no longer has the record
              const deleted1 = cache1.get('nodes', record.node_id);
              if (deleted1 !== undefined) {
                return false;
              }

              // Verify cache2 STILL has the record (isolation)
              const stillExists2 = cache2.get('nodes', record.node_id);
              if (!stillExists2 || stillExists2.node_id !== record.node_id) {
                return false;
              }

              return true;
            } finally {
              cache1.close();
              cache2.close();
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('DELETE isolation verified');
    });

  /**
   * Property: For any two cache instances, applying replication state to one
   * SHALL NOT affect the other.
   *
   * This validates Requirement 3.2: THE Worker_Process SHALL NOT share
   * SystemTableCache instances with other Worker_Processes.
   */
  t.test('Replication state isolation: applying state does not affect another',
    async (t) => {
      fc.assert(
        fc.property(
          twoDistinctNodeRecordsArb,
          ([record1, record2]) => {
            const cache1 = createCache();
            const cache2 = createCache();

            try {
              // Insert record1 into cache1
              cache1.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record1);

              // Insert record2 into cache2
              cache2.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record2);

              // Verify initial state
              if (!cache1.get('nodes', record1.node_id) ||
                  !cache2.get('nodes', record2.node_id)) {
                return false;
              }

              // Get replication state from cache1
              const state1 = cache1.getReplicationState();

              // Apply cache1's state to cache1 (simulating Raft replication)
              // This should replace cache1's data but NOT affect cache2
              cache1.applyReplicationState(state1);

              // Verify cache1 still has record1 (from applied state)
              const afterApply1 = cache1.get('nodes', record1.node_id);
              if (!afterApply1 || afterApply1.node_id !== record1.node_id) {
                return false;
              }

              // Verify cache2 STILL has record2 and NOT record1 (isolation)
              const unchanged2 = cache2.get('nodes', record2.node_id);
              if (!unchanged2 || unchanged2.node_id !== record2.node_id) {
                return false;
              }

              // Verify cache2 does NOT have record1
              const notInCache2 = cache2.get('nodes', record1.node_id);
              if (notInCache2 !== undefined) {
                return false;
              }

              return true;
            } finally {
              cache1.close();
              cache2.close();
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('Replication state isolation verified');
    });

  /**
   * Property: For any set of records inserted into multiple caches, each cache
   * SHALL maintain independent record counts.
   *
   * This validates Requirement 3.2: THE Worker_Process SHALL NOT share
   * SystemTableCache instances with other Worker_Processes.
   */
  t.test('Record count isolation: caches maintain independent counts',
    async (t) => {
      fc.assert(
        fc.property(
          uniqueNodeRecordsArb,
          uniqueNodeRecordsArb,
          (records1, records2) => {
            const cache1 = createCacheWithRecords(records1);
            const cache2 = createCacheWithRecords(records2);

            try {
              // Verify each cache has the correct count
              const count1 = cache1.getAll('nodes').length;
              const count2 = cache2.getAll('nodes').length;

              const countCorrect1 = count1 === records1.length;
              const countCorrect2 = count2 === records2.length;

              return countCorrect1 && countCorrect2;
            } finally {
              cache1.close();
              cache2.close();
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('Record count isolation verified');
    });

  /**
   * Property: For any two cache instances, their database objects SHALL be
   * distinct (no shared references).
   *
   * This validates Requirement 3.2: THE Worker_Process SHALL NOT share
   * SystemTableCache instances with other Worker_Processes.
   */
  t.test('Object identity isolation: cache instances are distinct objects',
    async (t) => {
      fc.assert(
        fc.property(
          fc.integer({min: 2, max: 5}),
          (numCaches) => {
            const caches = [];

            try {
              // Create multiple cache instances
              for (let i = 0; i < numCaches; i++) {
                caches.push(createCache());
              }

              // Verify all caches are distinct objects
              for (let i = 0; i < caches.length; i++) {
                for (let j = i + 1; j < caches.length; j++) {
                  // Caches should be different objects
                  if (caches[i] === caches[j]) {
                    return false;
                  }
                  // Database instances should be different
                  if (caches[i].db === caches[j].db) {
                    return false;
                  }
                }
              }

              return true;
            } finally {
              for (const cache of caches) {
                cache.close();
              }
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('Object identity isolation verified');
    });

  /**
   * Property: For any sequence of operations on one cache, the other cache
   * SHALL remain unaffected.
   *
   * This validates Requirement 3.2: THE Worker_Process SHALL NOT share
   * SystemTableCache instances with other Worker_Processes.
   */
  t.test('Operation sequence isolation: mixed ops do not affect another cache',
    async (t) => {
      fc.assert(
        fc.property(
          twoDistinctNodeRecordsArb,
          nodeStatusArb,
          ([record1, record2], newStatus) => {
            const cache1 = createCache();
            const cache2 = createCache();

            try {
              // Insert record2 into cache2 first (this should remain unchanged)
              cache2.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record2);
              const initialCache2Record = cache2.get('nodes', record2.node_id);
              if (!initialCache2Record) {
                return false;
              }

              // Perform a sequence of operations on cache1
              // 1. Insert
              cache1.applyCDCEvent('nodes', CDC_OPERATION.INSERT, record1);

              // 2. Update
              cache1.applyCDCEvent('nodes', CDC_OPERATION.UPDATE, {
                node_id: record1.node_id,
                status: newStatus,
              });

              // 3. Delete
              cache1.applyCDCEvent('nodes', CDC_OPERATION.DELETE, {
                node_id: record1.node_id,
              });

              // Verify cache1 is now empty
              const cache1Count = cache1.getAll('nodes').length;
              if (cache1Count !== 0) {
                return false;
              }

              // Verify cache2 is COMPLETELY UNCHANGED
              const finalCache2Record = cache2.get('nodes', record2.node_id);
              if (!finalCache2Record) {
                return false;
              }

              // Verify all fields match the original
              const fieldsMatch =
                finalCache2Record.node_id === record2.node_id &&
                finalCache2Record.node_address === record2.node_address &&
                finalCache2Record.status === record2.status &&
                finalCache2Record.cpu_cores === record2.cpu_cores;

              return fieldsMatch;
            } finally {
              cache1.close();
              cache2.close();
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('Operation sequence isolation verified');
    });
});
