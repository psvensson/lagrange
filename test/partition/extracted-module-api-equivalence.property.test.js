/**
 * Property Test: Extracted Module API Equivalence
 * **Property 9: Extracted Module API Equivalence**
 * **Validates: Requirements 6.6**
 *
 * Feature: code-clarity-maintainability, Property 9: Extracted Module API Equivalence
 *
 * *For any* sequence of operations on PartitionService,
 * operations using extracted modules SHALL produce equivalent results.
 * CDC events SHALL be generated identically.
 *
 * This property test verifies:
 * 1. CDC event generation produces identical events
 * 2. Raft storage operations maintain consistency
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import {EventEmitter} from 'events';
import {PartitionCDCGenerator} from '../../src/partition/partition-cdc-generator.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {CDC_OPERATION} from '../../src/constants/index.js';

/**
 * Create a mock logger that captures log calls.
 * @return {Object} Mock logger instance.
 */
const createMockLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

/**
 * Generator for valid partition IDs.
 */
const partitionIdArb = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `partition-${s}`);

/**
 * Generator for valid replica IDs.
 */
const replicaIdArb = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `replica-${s}`);

/**
 * Generator for valid table names (avoiding SQL reserved words).
 */
const tableNameArb = fc.string({minLength: 1, maxLength: 15})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s))
  .filter((s) => !['select', 'from', 'where', 'insert', 'update', 'delete'].includes(
    s.toLowerCase(),
  ))
  .map((s) => `tbl_${s}`);

/**
 * Generator for CDC entry data.
 */
const cdcEntryArb = fc.record({
  type: fc.constantFrom(
    PARTITION_SERVICE_OPERATION.INSERT,
    PARTITION_SERVICE_OPERATION.UPDATE,
    PARTITION_SERVICE_OPERATION.DELETE,
  ),
  tableName: tableNameArb,
  data: fc.record({
    id: fc.string({minLength: 1, maxLength: 10}).filter((s) => /^[a-z0-9]+$/i.test(s)),
    name: fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('\'')),
    value: fc.integer({min: 0, max: 1000}),
  }),
  whereClause: fc.option(fc.record({
    id: fc.string({minLength: 1, maxLength: 10}).filter((s) => /^[a-z0-9]+$/i.test(s)),
  })),
  timestamp: fc.integer({min: 1000000000000, max: 2000000000000}),
});

/**
 * Generator for Raft log entry data.
 */
const raftEntryDataArb = fc.record({
  type: fc.constantFrom('WRITE', 'INSERT', 'UPDATE', 'DELETE'),
  sql: fc.string({minLength: 1, maxLength: 50}),
  params: fc.array(fc.oneof(fc.string(), fc.integer()), {maxLength: 5}),
});

test('Property 9: Extracted Module API Equivalence', async (t) => {
  /**
   * Property: CDC generator SHALL produce events with correct operation type,
   * table name, and source information for any valid entry.
   *
   * Validates: Requirement 6.6 - Extracted modules maintain API compatibility.
   */
  t.test('CDC generator produces consistent events', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        partitionIdArb,
        replicaIdArb,
        cdcEntryArb,
        async (partitionId, replicaId, entry) => {
          const db = new Database(':memory:');
          const eventEmitter = new EventEmitter();
          const receivedEvents = [];

          try {
            // Create table for CDC lookups
            db.exec(`
              CREATE TABLE ${entry.tableName} (
                id TEXT PRIMARY KEY,
                name TEXT,
                value INTEGER
              )
            `);

            // Insert data for UPDATE/DELETE operations
            if (entry.type === PARTITION_SERVICE_OPERATION.UPDATE ||
                entry.type === PARTITION_SERVICE_OPERATION.DELETE) {
              db.exec(
                `INSERT INTO ${entry.tableName} (id, name, value) ` +
                `VALUES ('${entry.data.id}', '${entry.data.name}', ${entry.data.value})`,
              );
            }

            const generator = new PartitionCDCGenerator({
              partitionId,
              replicaId,
              tableName: entry.tableName,
              db,
              logger: createMockLogger(),
              eventEmitter,
            });

            // Subscribe to events
            generator.subscribe((event) => receivedEvents.push(event));

            // Generate event
            await generator.generateEvent(entry);

            // Verify event was generated
            if (receivedEvents.length !== 1) return false;

            const event = receivedEvents[0];

            // Verify event structure
            if (event.tableName !== entry.tableName) return false;
            if (event.sourcePartition !== partitionId) return false;
            if (event.sourceReplica !== replicaId) return false;
            if (event.timestamp !== entry.timestamp) return false;

            // Verify operation type mapping
            const expectedOp = entry.type === PARTITION_SERVICE_OPERATION.INSERT ?
              CDC_OPERATION.INSERT :
              entry.type === PARTITION_SERVICE_OPERATION.UPDATE ?
                CDC_OPERATION.UPDATE :
                CDC_OPERATION.DELETE;

            if (event.operation !== expectedOp) return false;

            return true;
          } finally {
            db.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC generator produces consistent events');
  });

  /**
   * Property: Raft storage SHALL maintain consistent log state
   * after append operations, with correct indices and terms.
   *
   * Validates: Requirement 6.6 - Extracted modules maintain API compatibility.
   */
  t.test('Raft storage maintains consistent log state', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        partitionIdArb,
        fc.array(raftEntryDataArb, {minLength: 1, maxLength: 5}),
        async (partitionId, entries) => {
          const db = new Database(':memory:');

          try {
            const storage = new PartitionRaftStorage(db, partitionId);

            // Append entries
            for (let i = 0; i < entries.length; i++) {
              const entry = storage.appendEntry(entries[i]);

              // Verify entry has correct index (1-based)
              if (entry.index !== i + 1) return false;

              // Verify entry has correct term
              if (entry.term !== storage.currentTerm) return false;

              // Verify entry has timestamp
              if (typeof entry.timestamp !== 'number') return false;
            }

            // Verify log length
            if (storage.getLogLength() !== entries.length) return false;

            // Verify last index
            if (storage.getLastIndex() !== entries.length) return false;

            // Verify getEntry returns correct entries
            for (let i = 0; i < entries.length; i++) {
              const retrieved = storage.getEntry(i + 1);
              if (!retrieved) return false;
              if (retrieved.index !== i + 1) return false;
              if (JSON.stringify(retrieved.data) !== JSON.stringify(entries[i])) {
                return false;
              }
            }

            // Verify getEntriesFrom returns correct subset
            const fromIndex = Math.min(2, entries.length);
            const subset = storage.getEntriesFrom(fromIndex);
            if (subset.length !== entries.length - fromIndex + 1) return false;

            return true;
          } finally {
            db.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Raft storage maintains consistent log state');
  });

  /**
   * Property: Raft storage truncateFrom SHALL remove entries from
   * the specified index onwards while preserving earlier entries.
   *
   * Validates: Requirement 6.6 - Extracted modules maintain API compatibility.
   */
  t.test('Raft storage truncation maintains consistency', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        partitionIdArb,
        fc.array(raftEntryDataArb, {minLength: 3, maxLength: 5}),
        fc.integer({min: 1, max: 3}),
        async (partitionId, entries, truncateAt) => {
          const db = new Database(':memory:');

          try {
            const storage = new PartitionRaftStorage(db, partitionId);

            // Append all entries
            for (const entryData of entries) {
              storage.appendEntry(entryData);
            }

            // Truncate from specified index
            const truncateIndex = Math.min(truncateAt, entries.length);
            storage.truncateFrom(truncateIndex);

            // Verify log length after truncation
            const expectedLength = truncateIndex - 1;
            if (storage.getLogLength() !== expectedLength) return false;

            // Verify last index
            if (storage.getLastIndex() !== expectedLength) return false;

            // Verify entries before truncation point are preserved
            for (let i = 1; i < truncateIndex; i++) {
              const entry = storage.getEntry(i);
              if (!entry) return false;
              if (entry.index !== i) return false;
            }

            // Verify entries at and after truncation point are removed
            for (let i = truncateIndex; i <= entries.length; i++) {
              const entry = storage.getEntry(i);
              if (entry !== null) return false;
            }

            return true;
          } finally {
            db.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Raft storage truncation maintains consistency');
  });

  /**
   * Property: CDC generator SHALL deliver events to all subscribers
   * with identical event data.
   *
   * Validates: Requirement 6.6 - Extracted modules maintain API compatibility.
   */
  t.test('CDC events delivered identically to all subscribers', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        partitionIdArb,
        replicaIdArb,
        tableNameArb,
        fc.integer({min: 1, max: 5}),
        async (partitionId, replicaId, tableName, subscriberCount) => {
          const db = new Database(':memory:');
          const eventEmitter = new EventEmitter();
          const subscriberEvents = [];

          try {
            // Create table
            db.exec(`
              CREATE TABLE ${tableName} (
                id TEXT PRIMARY KEY,
                name TEXT,
                value INTEGER
              )
            `);

            const generator = new PartitionCDCGenerator({
              partitionId,
              replicaId,
              tableName,
              db,
              logger: createMockLogger(),
              eventEmitter,
            });

            // Subscribe multiple subscribers
            for (let i = 0; i < subscriberCount; i++) {
              subscriberEvents.push([]);
              const idx = i;
              generator.subscribe((event) => {
                subscriberEvents[idx].push(event);
              });
            }

            // Verify subscriber count
            if (generator.getSubscriberCount() !== subscriberCount) return false;

            // Generate event
            const entry = {
              type: PARTITION_SERVICE_OPERATION.INSERT,
              tableName,
              data: {id: 'test-1', name: 'test', value: 42},
              timestamp: Date.now(),
            };

            await generator.generateEvent(entry);

            // Verify all subscribers received the event
            for (let i = 0; i < subscriberCount; i++) {
              if (subscriberEvents[i].length !== 1) return false;
            }

            // Verify all events are identical
            const firstEvent = subscriberEvents[0][0];
            for (let i = 1; i < subscriberCount; i++) {
              const event = subscriberEvents[i][0];
              if (event.operation !== firstEvent.operation) return false;
              if (event.tableName !== firstEvent.tableName) return false;
              if (event.sourcePartition !== firstEvent.sourcePartition) return false;
              if (event.sourceReplica !== firstEvent.sourceReplica) return false;
            }

            return true;
          } finally {
            db.close();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC events delivered identically to all subscribers');
  });
});
