/**
 * Gate A1 evidence: a probe-only SQLite build exports individual pages from
 * the same pinned reader that owns applied-index identity. This is not proof
 * that the shipped runtime exposes DBPAGE, not a writable overlay, and not a
 * Raft-liveness claim.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  IMMUTABLE_BASE_PROBE,
  runImmutableBaseProbe,
} from '../../scripts/quest-evidence/bounded-transaction-workspace/immutable-base-probe.js';

const TEST_TIMEOUT_MS = 30000;
const EXPECTED_PAGE_BYTES = 4096;
const EXPECTED_REQUESTED_PAGES = 2;
const EXPECTED_MATERIALIZED_BYTES =
  EXPECTED_PAGE_BYTES * EXPECTED_REQUESTED_PAGES;
const MINIMUM_DATABASE_GROWTH_FACTOR = 16;
const MINIMUM_READER_CONCURRENCY_WITNESS = 32;

test('bounded-workspace Gate A1 exports lazy pages from one pinned SQLite view',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const report = await runImmutableBaseProbe();
    t.comment(`BTWS_IMMUTABLE_BASE_REPORT ${JSON.stringify(report)}`);

    t.equal(report.schema, IMMUTABLE_BASE_PROBE.REPORT_SCHEMA,
      'the Gate A1 evidence schema is explicit');
    t.equal(report.capabilityBoundary.classification,
      'probe-only-sqlite-feasibility',
      'the alternate build is never represented as production capability');
    t.equal(report.capabilityBoundary.shippedRuntime.hasDbpageCompileOption,
      false, 'the shipped runtime does not enable DBPAGE');
    t.equal(report.capabilityBoundary.shippedRuntime.hasSnapshotCompileOption,
      false, 'the shipped runtime does not enable snapshot handles');
    t.equal(report.capabilityBoundary.shippedRuntime.dbpageQuery.available,
      false, 'sqlite_dbpage cannot be queried through shipped better-sqlite3');
    t.same(report.capabilityBoundary.shippedRuntime.modules, ['dbstat'],
      'DBSTAT is shipped but sqlite_dbpage is not');
    t.equal(report.capabilityBoundary.probeBuild.productionBuildChanged, false,
      'the feasibility binary did not alter production SQLite build flags');

    t.equal(report.complexity.samples.length,
      IMMUTABLE_BASE_PROBE.TARGET_MIB.length,
      'small, medium and substantially larger unrelated bases were sampled');
    t.ok(report.complexity.summary.databasePageGrowthFactor >=
      MINIMUM_DATABASE_GROWTH_FACTOR,
    'the unrelated database page count grew substantially');
    t.equal(report.complexity.summary.requestedPageGrowthFactor, 1,
      'requested pages stay fixed as unrelated state grows');
    t.equal(report.complexity.summary.materializedByteGrowthFactor, 1,
      'materialized page bytes stay fixed as unrelated state grows');
    for (const sample of report.complexity.samples) {
      t.equal(sample.setup.appliedIndex,
        String(IMMUTABLE_BASE_PROBE.INITIAL_APPLIED_INDEX),
        `${sample.targetMiB} MiB pins identity before resolving a page`);
      t.equal(sample.counters.requestedPages, EXPECTED_REQUESTED_PAGES,
        `${sample.targetMiB} MiB resolves only the two requested pages`);
      t.equal(sample.counters.pageSqlStatements, EXPECTED_REQUESTED_PAGES,
        `${sample.targetMiB} MiB uses one page query per request`);
      t.equal(sample.counters.materializedBytes, EXPECTED_MATERIALIZED_BYTES,
        `${sample.targetMiB} MiB materializes only two SQLite pages`);
      t.equal(sample.firstRequestedPage.request, 1,
        `${sample.targetMiB} MiB first page is fetched only on request`);
      t.equal(sample.secondRequestedPage.request, 2,
        `${sample.targetMiB} MiB second page is fetched only on request`);
    }

    const stability = report.stability;
    t.equal(stability.initialState.appliedIndex,
      String(IMMUTABLE_BASE_PROBE.INITIAL_APPLIED_INDEX),
      'the executor pins the applied index inside its read transaction');
    t.same(stability.pinnedStateAfterWrites, {
      type: 'state',
      appliedIndex: String(IMMUTABLE_BASE_PROBE.INITIAL_APPLIED_INDEX),
      anchor: 'anchor-000001',
      elapsedMicros: stability.pinnedStateAfterWrites.elapsedMicros,
    }, 'applied identity and anchor SQL remain at I while live writes advance');
    t.equal(stability.pages.anchorAfterWrites.hash,
      stability.pages.initialAnchor.hash,
      'a requested table page remains byte-identical after live rewrites');
    t.equal(stability.pages.indexAfterWrites.hash,
      stability.pages.initialIndex.hash,
      'a requested index page remains byte-identical after live rewrites');
    t.equal(stability.pages.lateFirstAccessAfterWrites.request, 5,
      'the untouched table page is first requested only after live writes');
    t.equal(stability.pages.lateFirstAccessAfterWrites.hash,
      stability.pages.baseline.late_rows.hash,
      'late first access resolves the old page bytes from snapshot I');
    t.same(stability.lateStateAfterPageAccess, {
      type: 'late',
      value: 'late-000001',
      elapsedMicros: stability.lateStateAfterPageAccess.elapsedMicros,
    }, 'late-row SQL is checked only after its first DBPAGE request');
    t.not(stability.pages.fresh.anchor_rows.hash,
      stability.pages.initialAnchor.hash,
      'a fresh reader observes changed table-page bytes');
    t.not(stability.pages.fresh.anchor_value_idx.hash,
      stability.pages.initialIndex.hash,
      'a fresh reader observes changed index-page bytes');
    t.not(stability.pages.fresh.late_rows.hash,
      stability.pages.baseline.late_rows.hash,
      'a fresh reader observes changed bytes for the late-access table');

    t.equal(stability.checkpoints.passiveWhilePinned.busy, 0,
      'PASSIVE checkpoint remains non-blocking while the reader is pinned');
    t.equal(stability.checkpoints.passiveWhilePinned.checkpointedFrames, 0,
      'the pinned snapshot prevents recycling its historical WAL frames');
    t.equal(stability.checkpoints.truncateWhilePinned.busy, 1,
      'TRUNCATE reports the pinned-reader conflict without succeeding');
    t.equal(stability.checkpoints.truncateAfterRelease.busy, 0,
      'TRUNCATE succeeds after the executor releases its reader');
    t.ok(stability.wal.whilePinnedBytes > 0,
      'retained WAL bytes are measured while the snapshot is pinned');
    t.equal(stability.wal.afterReleaseBytes, 0,
      'reader disposal restores WAL truncation');
    t.equal(stability.liveWrites.count, IMMUTABLE_BASE_PROBE.LIVE_WRITE_COUNT,
      'normal writer commits continued through snapshot lifetime');
    t.equal(stability.livenessProxy.executorProcessIsSeparate, true,
      'the page executor never shares the writer JavaScript event loop');
    t.equal(stability.livenessProxy.classification,
      'local-owner-turn-proxy-not-raft-proof',
      'local event-loop timing is not promoted to a Raft-liveness claim');

    t.ok(report.readerMarks.usableDistinctSnapshots >=
      MINIMUM_READER_CONCURRENCY_WITNESS,
    'distinct pinned states remain exact through the tested concurrency');
    t.ok(report.readerMarks.retained.every((reader) => reader.exact),
      'every older connection retains its own acquisition-time applied index');
    t.equal(report.readerMarks.capacityCondition,
      'not-observed-through-tested-bound',
      'this build exposes no SQLite reader-slot failure through the tested bound');
    t.equal(report.readerMarks.failure.kind, 'not-observed',
      'reader exhaustion remains unresolved rather than inferred');
    t.equal(report.readerMarks.truncateAfterRelease.busy, 0,
      'releasing all readers restores checkpoint capacity');
    t.equal(report.readerMarks.walAfterReleaseBytes, 0,
      'reader-mark exercise leaves no retained WAL after disposal');
    t.equal(report.gateAStatus,
      'open-authoritative-raft-liveness-not-yet-proven',
      'the probe does not approve Gate A or authorize a writable overlay');
  });
