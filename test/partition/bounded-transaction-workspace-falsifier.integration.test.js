/**
 * Complexity witness calibration for bounded-transaction-workspace.
 *
 * The rejected full-serialization architecture is the negative control. The
 * assertions use byte/page counters rather than wall-clock thresholds, so a
 * fast machine cannot make O(total partition bytes) look bounded. Phase times
 * are still emitted for the reference and slower lab-host records.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER,
  runFullSerializeNegativeControl,
} from '../../scripts/quest-evidence/bounded-transaction-workspace/falsifier.js';

const TEST_TIMEOUT_MS = 30000;
const MINIMUM_SIZE_GROWTH_FACTOR = 16;

test('bounded-workspace falsifier rejects full serialization by byte count',
  {timeout: TEST_TIMEOUT_MS}, (t) => {
    const report = runFullSerializeNegativeControl();
    t.comment(`BTWS_FALSIFIER_REPORT ${JSON.stringify(report)}`);

    t.equal(report.schema,
      BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.REPORT_SCHEMA,
      'the evidence schema is explicit');
    t.equal(report.mechanism,
      BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.NEGATIVE_CONTROL,
      'the calibration identifies the rejected mechanism');
    t.equal(report.fixedTransaction.length,
      BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.TARGET_MIB.length,
      'small, medium and substantially larger bases were measured');
    t.ok(report.complexity.databaseGrowthFactor >=
      MINIMUM_SIZE_GROWTH_FACTOR,
    'unrelated database state grew substantially');
    t.equal(report.complexity.totalStateScalingDetected, true,
      'instrumented creation bytes grow with total partition bytes');
    t.equal(report.classification, 'O(total-partition-bytes)',
      'the falsifier rejects the negative control independently of timing');

    for (const sample of report.fixedTransaction) {
      t.equal(sample.transactionFootprint.rows,
        BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.FIXED_TRANSACTION_ROWS,
        `${sample.targetMiB} MiB keeps the transaction footprint fixed`);
      t.equal(sample.counters.baseBytesReadAtCreate,
        sample.source.logicalBytes,
        `${sample.targetMiB} MiB creation materializes the complete database`);
      t.same(sample.detail.headerBefore, {
        readVersion:
          BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.SQLITE_HEADER.WAL_JOURNAL_VERSION,
        writeVersion:
          BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.SQLITE_HEADER.WAL_JOURNAL_VERSION,
      }, `${sample.targetMiB} MiB preserves the serialized WAL-header finding`);
      t.equal(sample.authoritativeUnchanged, true,
        `${sample.targetMiB} MiB private effects do not mutate the source`);
      t.same(sample.firstRead, {id: 1, value: 7},
        `${sample.targetMiB} MiB indexed first read sees the base snapshot`);
      t.equal(sample.semantics.blobBytes,
        BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.TRANSACTION_BLOB_BYTES,
        `${sample.targetMiB} MiB BLOB semantics execute`);
      t.equal(sample.semantics.insertedAuditRows,
        BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.FIXED_TRANSACTION_ROWS,
        `${sample.targetMiB} MiB trigger semantics execute`);
      t.equal(sample.semantics.uniquenessHeld, true,
        `${sample.targetMiB} MiB uniqueness semantics execute`);
      t.equal(sample.semantics.foreignKeyHeld, true,
        `${sample.targetMiB} MiB foreign-key semantics execute`);
    }

    t.equal(report.smallBaseLargeTransaction.transactionFootprint.rows,
      BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.LARGE_TRANSACTION_ROWS,
      'small-base/large-transaction cost is measured separately');
    t.equal(report.smallBaseLargeTransaction.authoritativeUnchanged, true,
      'the large private transaction also leaves the source unchanged');
    t.equal(report.smallBaseLargeTransaction.semantics.insertedAuditRows,
      BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER.LARGE_TRANSACTION_ROWS,
      'large-transaction trigger effects scale with transaction work');
    t.end();
  });
