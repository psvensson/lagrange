/**
 * Property-based tests for persistent storage path generation.
 * Property 76: Persistent Storage Path Generation
 * *For any* partition ID and replica ID, the generated database path follows
 * the pattern `{data-dir}/partitions/{partition-id}/{replica-id}.db`
 * **Validates: Requirements 35.5**
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import path from 'path';
import {getPartitionDbPath} from '../../src/storage/data-directory-manager.js';

beforeEach(() => {
  // No setup needed for standalone function tests
});

afterEach(() => {
  // No cleanup needed
});

/**
 * Generate valid partition IDs (non-empty strings without path separators).
 */
const partitionIdArb = fc.string({minLength: 1, maxLength: 50})
  .filter((s) => !s.includes('/') && !s.includes('\\') && s.trim().length > 0);

/**
 * Generate valid replica IDs (non-empty strings without path separators).
 */
const replicaIdArb = fc.string({minLength: 1, maxLength: 50})
  .filter((s) => !s.includes('/') && !s.includes('\\') && s.trim().length > 0);

/**
 * Generate valid data directory paths.
 */
const dataDirArb = fc.oneof(
  fc.constant('/data'),
  fc.constant('/var/lib/ddb'),
  fc.constant('./data'),
  fc.constant('/tmp/test-data'),
);

test('Property 76: Persistent Storage Path Generation', async (t) => {
  /**
   * Feature: distributed-database-system
   * Property 76: Persistent Storage Path Generation
   * *For any* partition ID and replica ID, the generated database path follows
   * the pattern `{data-dir}/partitions/{partition-id}/{replica-id}.db`
   * **Validates: Requirements 35.5**
   */
  fc.assert(
    fc.property(
      dataDirArb,
      partitionIdArb,
      replicaIdArb,
      (dataDir, partitionId, replicaId) => {
        const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);

        // Verify path follows the expected pattern
        const expectedPath = path.join(
          dataDir,
          'partitions',
          partitionId,
          `${replicaId}.db`,
        );

        return dbPath === expectedPath;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Property 76: All generated paths follow the expected pattern');
});

test('Property 76: Path contains partitions directory', async (t) => {
  fc.assert(
    fc.property(
      dataDirArb,
      partitionIdArb,
      replicaIdArb,
      (dataDir, partitionId, replicaId) => {
        const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
        return dbPath.includes('partitions');
      },
    ),
    {numRuns: 10},
  );

  t.pass('All paths contain partitions directory');
});

test('Property 76: Path ends with .db extension', async (t) => {
  fc.assert(
    fc.property(
      dataDirArb,
      partitionIdArb,
      replicaIdArb,
      (dataDir, partitionId, replicaId) => {
        const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
        return dbPath.endsWith('.db');
      },
    ),
    {numRuns: 10},
  );

  t.pass('All paths end with .db extension');
});

test('Property 76: Path contains partition ID', async (t) => {
  fc.assert(
    fc.property(
      dataDirArb,
      partitionIdArb,
      replicaIdArb,
      (dataDir, partitionId, replicaId) => {
        const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
        return dbPath.includes(partitionId);
      },
    ),
    {numRuns: 10},
  );

  t.pass('All paths contain partition ID');
});

test('Property 76: Path contains replica ID', async (t) => {
  fc.assert(
    fc.property(
      dataDirArb,
      partitionIdArb,
      replicaIdArb,
      (dataDir, partitionId, replicaId) => {
        const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
        return dbPath.includes(replicaId);
      },
    ),
    {numRuns: 10},
  );

  t.pass('All paths contain replica ID');
});
