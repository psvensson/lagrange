import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  chmod, lstat, mkdir, mkdtemp, rm, stat, symlink, utimes, writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path, {join} from 'node:path';
import {
  TEST_OUTPUT_PRUNE_APPLY_TEST_NAME,
  TEST_OUTPUT_PRUNE_ARTIFACT_FILL,
  TEST_OUTPUT_PRUNE_ARTIFACT_SIZE,
  TEST_OUTPUT_PRUNE_DRY_RUN_TEST_NAME,
  TEST_OUTPUT_PRUNE_ENCODING,
  TEST_OUTPUT_PRUNE_EXPECTED_DELETED_LEGACY_PLAYBACK,
  TEST_OUTPUT_PRUNE_EXPECTED_DELETED_REPORT,
  TEST_OUTPUT_PRUNE_EXPECTED_DELETED_REPORT_PLAYBACK,
  TEST_OUTPUT_PRUNE_EXPECTED_DELETED_TOP_LEVEL,
  TEST_OUTPUT_PRUNE_FIXTURE_ARTIFACTS,
  TEST_OUTPUT_PRUNE_KEEP_DAYS,
  TEST_OUTPUT_PRUNE_KEEP_SINGLE,
  TEST_OUTPUT_PRUNE_KEEP_ZERO,
  TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
  TEST_OUTPUT_PRUNE_REPORTS_DIRNAME,
  TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
  TEST_OUTPUT_PRUNE_RUN_METADATA_DIRNAME,
  TEST_OUTPUT_PRUNE_STAT_REMOVED_PATHS,
  TEST_OUTPUT_PRUNE_STAT_RETAINED_PATHS,
  TEST_OUTPUT_PRUNE_TEST_DESCRIPTION,
  TEST_OUTPUT_PRUNE_TIMEZONE,
  TEST_OUTPUT_PRUNE_TMP_PREFIX,
} from './prune-test-output-test-constants.js';
import {
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_DAYS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_LEGACY_PLAYBACKS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORT_PLAYBACKS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORTS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_TOP_LEVEL,
  TEST_OUTPUT_PRUNE_FLAG,
} from '../../src/constants/test-output-prune-values.js';
import {main as pruneTestOutputMain} from '../../scripts/prune-test-output.js';

// Permission tests mean nothing to root, which reads and removes anything.
const RUNS_AS_ROOT = process.getuid?.() === 0;

const TEST_OUTPUT_PRUNE_DEFAULT_SCOPE_TEST_NAME =
  'default policy prunes sibling artifact roots to the latest four runs';
const TEST_OUTPUT_PRUNE_DEFAULT_SCOPE_COUNT = 6;
const TEST_OUTPUT_PRUNE_DEFAULT_KEEP_COUNT = 4;
const TEST_OUTPUT_PRUNE_TMP_DIRNAME = '.tmp';
const TEST_OUTPUT_PRUNE_TAP_DIRNAME = '.tap';
const TEST_OUTPUT_PRUNE_TEST_RESULTS_DIRNAME = 'test-results';
const TEST_OUTPUT_PRUNE_TAP_RESULTS_FILE_PREFIX = 'result';
const TEST_OUTPUT_PRUNE_TAP_RESULTS_SUFFIX = '.tap';
const TEST_OUTPUT_PRUNE_DEFAULT_LEGACY_PREFIX = 'legacy';
const TEST_OUTPUT_PRUNE_DEFAULT_SCENARIO_PREFIX = 'scenario';
const TEST_OUTPUT_PRUNE_DEFAULT_TMP_PREFIX = 'tmp-run';
const TEST_OUTPUT_PRUNE_DEFAULT_TMP_PLAYBACK_PREFIX = 'tmp-playback';
const TEST_OUTPUT_PRUNE_DEFAULT_PLAYBACK_REPORT_PREFIX = 'playback-run';
const TEST_OUTPUT_PRUNE_DEFAULT_PLAYBACK_ARCHIVE_PREFIX = 'archive';
const TEST_OUTPUT_PRUNE_DEFAULT_REPORT_PREFIX = 'report-run';
const TEST_OUTPUT_PRUNE_DEFAULT_REUSE_CONTROL_DIRNAME = 'reuse-control';
const TEST_OUTPUT_PRUNE_PARTITION_LOG_FILENAME_PREFIX = 'logs-p1-r';
const TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES = Object.freeze([
  '.db',
  '.db-wal',
]);
const TEST_OUTPUT_PRUNE_DATA_LOG_PATH = Object.freeze([
  'data',
  'partitions',
  'logs-p1',
]);
const TEST_OUTPUT_PRUNE_DATA3_LOG_PATH =
  Object.freeze(['data3', 'partitions', 'logs-p1']);
const TEST_OUTPUT_PRUNE_EXAMPLE_LOG_PATH = Object.freeze([
  'data',
  'examples',
  'movielens-lagrange-node',
  'partitions',
  'logs-p1',
]);

async function writeArtifact(filePath, size = TEST_OUTPUT_PRUNE_ARTIFACT_SIZE) {
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, TEST_OUTPUT_PRUNE_ARTIFACT_FILL.repeat(size),
    TEST_OUTPUT_PRUNE_ENCODING);
}

async function setArtifactTime(targetPath, isoString) {
  const when = new Date(isoString);
  await utimes(targetPath, when, when);
}

async function writeWorkspaceArtifact(workspaceRoot, relativePath, modifiedAt) {
  const artifactPath = join(workspaceRoot, ...relativePath);
  await writeArtifact(artifactPath);
  await setArtifactTime(artifactPath, modifiedAt);
  await setArtifactTime(path.dirname(artifactPath), modifiedAt);
}

function toWorkspaceRelativePaths(paths) {
  return paths.map((relativePath) =>
    path.posix.join(TEST_OUTPUT_PRUNE_ROOT_DIRNAME, relativePath),
  );
}

function assertDeletedPaths(actualPaths, expectedPaths) {
  assert.deepEqual([...actualPaths].sort(), [...expectedPaths].sort());
}

function buildDefaultIsoString(index) {
  return `2026-03-0${index}T00:00:00Z`;
}

async function runPruneScript(args) {
  let stdout = '';
  let stderr = '';
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, encoding, callback) => {
    stdout += String(chunk);
    if (typeof encoding === 'function') {
      encoding();
    } else if (typeof callback === 'function') {
      callback();
    }
    return true;
  };
  process.stderr.write = (chunk, encoding, callback) => {
    stderr += String(chunk);
    if (typeof encoding === 'function') {
      encoding();
    } else if (typeof callback === 'function') {
      callback();
    }
    return true;
  };

  try {
    await pruneTestOutputMain(args);
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  return {stdout, stderr};
}

describe(TEST_OUTPUT_PRUNE_TEST_DESCRIPTION, () => {
  let workspace;
  let root;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), TEST_OUTPUT_PRUNE_TMP_PREFIX));
    root = join(workspace, TEST_OUTPUT_PRUNE_ROOT_DIRNAME);

    for (const artifact of TEST_OUTPUT_PRUNE_FIXTURE_ARTIFACTS) {
      const artifactPath = join(root, ...artifact.relativePath);
      await writeArtifact(artifactPath);
      await setArtifactTime(artifactPath, artifact.modifiedAt);
      await setArtifactTime(path.dirname(artifactPath), artifact.modifiedAt);
    }

    await mkdir(join(root, TEST_OUTPUT_PRUNE_RUN_METADATA_DIRNAME), {recursive: true});
  });

  afterEach(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  it(TEST_OUTPUT_PRUNE_DRY_RUN_TEST_NAME, async () => {
    process.env.TZ = TEST_OUTPUT_PRUNE_TIMEZONE;
    const result = await runPruneScript([
      TEST_OUTPUT_PRUNE_FLAG.ROOT,
      root,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS,
      TEST_OUTPUT_PRUNE_KEEP_DAYS,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORTS,
      TEST_OUTPUT_PRUNE_KEEP_SINGLE,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORT_PLAYBACKS,
      TEST_OUTPUT_PRUNE_KEEP_SINGLE,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_LEGACY_PLAYBACKS,
      TEST_OUTPUT_PRUNE_KEEP_ZERO,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL,
      TEST_OUTPUT_PRUNE_KEEP_SINGLE,
      TEST_OUTPUT_PRUNE_FLAG.JSON,
    ]);

    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);

    assertDeletedPaths(
      payload.deletedPaths.reports,
      toWorkspaceRelativePaths(TEST_OUTPUT_PRUNE_EXPECTED_DELETED_REPORT),
    );
    assertDeletedPaths(
      payload.deletedPaths.reportPlaybacks,
      toWorkspaceRelativePaths(TEST_OUTPUT_PRUNE_EXPECTED_DELETED_REPORT_PLAYBACK),
    );
    assertDeletedPaths(
      payload.deletedPaths.legacyPlaybacks,
      toWorkspaceRelativePaths(TEST_OUTPUT_PRUNE_EXPECTED_DELETED_LEGACY_PLAYBACK),
    );
    assertDeletedPaths(
      payload.deletedPaths.topLevel,
      toWorkspaceRelativePaths(TEST_OUTPUT_PRUNE_EXPECTED_DELETED_TOP_LEVEL),
    );
  });

  it(TEST_OUTPUT_PRUNE_APPLY_TEST_NAME, async () => {
    process.env.TZ = TEST_OUTPUT_PRUNE_TIMEZONE;
    const result = await runPruneScript([
      TEST_OUTPUT_PRUNE_FLAG.ROOT,
      root,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS,
      TEST_OUTPUT_PRUNE_KEEP_DAYS,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORTS,
      TEST_OUTPUT_PRUNE_KEEP_SINGLE,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORT_PLAYBACKS,
      TEST_OUTPUT_PRUNE_KEEP_SINGLE,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_LEGACY_PLAYBACKS,
      TEST_OUTPUT_PRUNE_KEEP_ZERO,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL,
      TEST_OUTPUT_PRUNE_KEEP_SINGLE,
      TEST_OUTPUT_PRUNE_FLAG.APPLY,
    ]);

    assert.equal(result.stderr, '');

    for (const removedPath of TEST_OUTPUT_PRUNE_STAT_REMOVED_PATHS) {
      await assert.rejects(stat(join(root, ...removedPath)));
    }

    for (const retainedPath of TEST_OUTPUT_PRUNE_STAT_RETAINED_PATHS) {
      await stat(join(root, ...retainedPath));
    }
  });

  it(TEST_OUTPUT_PRUNE_DEFAULT_SCOPE_TEST_NAME, async () => {
    await rm(root, {recursive: true, force: true});
    await mkdir(join(root, TEST_OUTPUT_PRUNE_RUN_METADATA_DIRNAME), {recursive: true});
    await mkdir(
      join(
        workspace,
        TEST_OUTPUT_PRUNE_TMP_DIRNAME,
        TEST_OUTPUT_PRUNE_DEFAULT_REUSE_CONTROL_DIRNAME,
      ),
      {recursive: true},
    );

    for (let index = 1; index <= TEST_OUTPUT_PRUNE_DEFAULT_SCOPE_COUNT; index += 1) {
      const timestamp = buildDefaultIsoString(index);
      const reportName = `${TEST_OUTPUT_PRUNE_DEFAULT_REPORT_PREFIX}-${index}`;
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
        TEST_OUTPUT_PRUNE_REPORTS_DIRNAME,
        `${reportName}.report.json`,
      ], timestamp);
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
        TEST_OUTPUT_PRUNE_REPORTS_DIRNAME,
        TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
        reportName,
        'events.ndjson',
      ], timestamp);
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
        TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
        `${TEST_OUTPUT_PRUNE_DEFAULT_LEGACY_PREFIX}-${index}`,
        'events.ndjson',
      ], timestamp);
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
        `${TEST_OUTPUT_PRUNE_DEFAULT_SCENARIO_PREFIX}-${index}`,
        '_timeline.log',
      ], timestamp);
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_TMP_DIRNAME,
        `${TEST_OUTPUT_PRUNE_DEFAULT_TMP_PREFIX}-${index}.log`,
      ], timestamp);
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_TMP_DIRNAME,
        TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
        `${TEST_OUTPUT_PRUNE_DEFAULT_TMP_PLAYBACK_PREFIX}-${index}`,
        'events.ndjson',
      ], timestamp);
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
        `${TEST_OUTPUT_PRUNE_DEFAULT_PLAYBACK_REPORT_PREFIX}-${index}.report.json`,
      ], timestamp);
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
        TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
        `${TEST_OUTPUT_PRUNE_DEFAULT_PLAYBACK_ARCHIVE_PREFIX}-${index}`,
        'events.ndjson',
      ], timestamp);
      await writeWorkspaceArtifact(workspace, [
        TEST_OUTPUT_PRUNE_TAP_DIRNAME,
        TEST_OUTPUT_PRUNE_TEST_RESULTS_DIRNAME,
        'test',
        `${TEST_OUTPUT_PRUNE_TAP_RESULTS_FILE_PREFIX}-${index}` +
          TEST_OUTPUT_PRUNE_TAP_RESULTS_SUFFIX,
      ], timestamp);
      for (const suffix of TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES) {
        const filename = `${TEST_OUTPUT_PRUNE_PARTITION_LOG_FILENAME_PREFIX}${index}` +
          suffix;
        await writeWorkspaceArtifact(
          workspace,
          [...TEST_OUTPUT_PRUNE_DATA_LOG_PATH, filename],
          timestamp,
        );
        await writeWorkspaceArtifact(
          workspace,
          [...TEST_OUTPUT_PRUNE_DATA3_LOG_PATH, filename],
          timestamp,
        );
        await writeWorkspaceArtifact(
          workspace,
          [...TEST_OUTPUT_PRUNE_EXAMPLE_LOG_PATH, filename],
          timestamp,
        );
      }
    }

    process.env.TZ = TEST_OUTPUT_PRUNE_TIMEZONE;
    const result = await runPruneScript([
      TEST_OUTPUT_PRUNE_FLAG.ROOT,
      root,
      TEST_OUTPUT_PRUNE_FLAG.JSON,
    ]);

    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.workspaceRoot, workspace);
    assert.equal(payload.policy.keepDays, TEST_OUTPUT_PRUNE_DEFAULT_KEEP_DAYS);
    assert.equal(payload.policy.keepReports, TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORTS);
    assert.equal(
      payload.policy.keepReportPlaybacks,
      TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORT_PLAYBACKS,
    );
    assert.equal(
      payload.policy.keepLegacyPlaybacks,
      TEST_OUTPUT_PRUNE_DEFAULT_KEEP_LEGACY_PLAYBACKS,
    );
    assert.equal(payload.policy.keepTopLevel, TEST_OUTPUT_PRUNE_DEFAULT_KEEP_TOP_LEVEL);

    const expectedOldIndices = [1, 2];
    const buildExpectedPaths = (builder) =>
      expectedOldIndices.map((index) => builder(index));

    assertDeletedPaths(
      payload.deletedPaths.reports,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
          TEST_OUTPUT_PRUNE_REPORTS_DIRNAME,
          `${TEST_OUTPUT_PRUNE_DEFAULT_REPORT_PREFIX}-${index}.report.json`,
        ),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.reportPlaybacks,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
          TEST_OUTPUT_PRUNE_REPORTS_DIRNAME,
          TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
          `${TEST_OUTPUT_PRUNE_DEFAULT_REPORT_PREFIX}-${index}`,
        ),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.legacyPlaybacks,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
          TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
          `${TEST_OUTPUT_PRUNE_DEFAULT_LEGACY_PREFIX}-${index}`,
        ),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.topLevel,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_ROOT_DIRNAME,
          `${TEST_OUTPUT_PRUNE_DEFAULT_SCENARIO_PREFIX}-${index}`,
        ),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.tmpTopLevel,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_TMP_DIRNAME,
          `${TEST_OUTPUT_PRUNE_DEFAULT_TMP_PREFIX}-${index}.log`,
        ),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.tmpPlaybacks,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_TMP_DIRNAME,
          TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
          `${TEST_OUTPUT_PRUNE_DEFAULT_TMP_PLAYBACK_PREFIX}-${index}`,
        ),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.playbackTopLevel,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
          `${TEST_OUTPUT_PRUNE_DEFAULT_PLAYBACK_REPORT_PREFIX}-${index}.report.json`,
        ),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.playbackArchives,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
          TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME,
          `${TEST_OUTPUT_PRUNE_DEFAULT_PLAYBACK_ARCHIVE_PREFIX}-${index}`,
        ),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.tapResults,
      buildExpectedPaths((index) =>
        path.posix.join(
          TEST_OUTPUT_PRUNE_TAP_DIRNAME,
          TEST_OUTPUT_PRUNE_TEST_RESULTS_DIRNAME,
          'test',
          `${TEST_OUTPUT_PRUNE_TAP_RESULTS_FILE_PREFIX}-${index}` +
            TEST_OUTPUT_PRUNE_TAP_RESULTS_SUFFIX,
        ),
      ),
    );

    const expectedPartitionPaths = expectedOldIndices.flatMap((index) =>
      TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES.map((suffix) =>
        `${TEST_OUTPUT_PRUNE_PARTITION_LOG_FILENAME_PREFIX}${index}${suffix}`,
      ),
    );

    assertDeletedPaths(
      payload.deletedPaths.dataLogs,
      expectedPartitionPaths.map((filename) =>
        path.posix.join(...TEST_OUTPUT_PRUNE_DATA_LOG_PATH, filename),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.data3Logs,
      expectedPartitionPaths.map((filename) =>
        path.posix.join(...TEST_OUTPUT_PRUNE_DATA3_LOG_PATH, filename),
      ),
    );
    assertDeletedPaths(
      payload.deletedPaths.examplePartitionLogs,
      expectedPartitionPaths.map((filename) =>
        path.posix.join(...TEST_OUTPUT_PRUNE_EXAMPLE_LOG_PATH, filename),
      ),
    );

    assert.equal(
      payload.categories.reports.count,
      TEST_OUTPUT_PRUNE_DEFAULT_SCOPE_COUNT - TEST_OUTPUT_PRUNE_DEFAULT_KEEP_COUNT,
    );
    assert.equal(
      payload.categories.tapResults.count,
      TEST_OUTPUT_PRUNE_DEFAULT_SCOPE_COUNT - TEST_OUTPUT_PRUNE_DEFAULT_KEEP_COUNT,
    );
    assert.equal(
      payload.categories.dataLogs.count,
      (TEST_OUTPUT_PRUNE_DEFAULT_SCOPE_COUNT - TEST_OUTPUT_PRUNE_DEFAULT_KEEP_COUNT) *
        TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES.length,
    );
  });
});

// Routine retention runs after every publish, so the pruner must judge age
// by what a directory CONTAINS: a directory's own mtime moves only when an
// entry is added or removed, and test-output/analysis - the generated import
// graph npm test reads - is rewritten in place. And the parents of registered
// git worktrees are never age-pruned: an rm -rf there leaves a registration
// pointing at nothing (artifact-retention-routine).
describe('routine retention safety', () => {
  let workspace;
  let root;
  const OLD = '2026-01-01T00:00:00Z';

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'prune-retention-'));
    root = join(workspace, 'test-output');
    await mkdir(join(root, TEST_OUTPUT_PRUNE_RUN_METADATA_DIRNAME), {recursive: true});
  });

  afterEach(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  const applyPolicy = () => runPruneScript([
    TEST_OUTPUT_PRUNE_FLAG.ROOT, root,
    TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS, '7',
    TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL, '0',
    TEST_OUTPUT_PRUNE_FLAG.APPLY,
  ]);

  it('keeps a directory whose own mtime is old when its contents are fresh', async () => {
    // Rewritten in place: the file is new, the directory inode is not.
    const fresh = join(root, 'analysis', 'global-owner-debt-import-graph.json');
    await writeArtifact(fresh);
    await setArtifactTime(path.dirname(fresh), OLD);
    // A genuinely stale sibling, old inside and out.
    const stale = join(root, 'comparative-old-artifacts', 'result.json');
    await writeArtifact(stale);
    await setArtifactTime(stale, OLD);
    await setArtifactTime(path.dirname(stale), OLD);

    await applyPolicy();

    await stat(fresh);
    await assert.rejects(stat(path.dirname(stale)),
      'a directory old inside and out is still pruned');
  });

  it('keeps a tree whose only recent activity is a directory deep inside it', async () => {
    const stale = join(root, 'deep-activity', 'old.json');
    await writeArtifact(stale);
    await setArtifactTime(stale, OLD);
    const fresh = join(root, 'deep-activity', 'a', 'b', 'fresh-empty-dir');
    await mkdir(fresh, {recursive: true});
    // Every directory above it is old, so only a walk that reaches depth
    // three sees the activity.
    await setArtifactTime(join(root, 'deep-activity', 'a', 'b'), OLD);
    await setArtifactTime(join(root, 'deep-activity', 'a'), OLD);
    await setArtifactTime(join(root, 'deep-activity'), OLD);

    await applyPolicy();

    await stat(fresh);
  });

  it('does not let a future-dated file pin a stale tree', async () => {
    const stale = join(root, 'mis-dated', 'old.json');
    await writeArtifact(stale);
    await setArtifactTime(stale, OLD);
    const future = join(root, 'mis-dated', 'future.json');
    await writeArtifact(future);
    await setArtifactTime(future, '2099-01-01T00:00:00Z');
    await setArtifactTime(join(root, 'mis-dated'), OLD);

    await applyPolicy();

    await assert.rejects(stat(join(root, 'mis-dated')),
      'a timestamp in the future says nothing about use: the tree still ages out');
  });

  it('keeps a tree written a moment ahead of the clock', async () => {
    // A file written while the walk runs is "after" any clock read taken when
    // it began; a writer a few seconds ahead is the same case. Either is use.
    const stale = join(root, 'live-soak', 'old.json');
    await writeArtifact(stale);
    await setArtifactTime(stale, OLD);
    const appended = join(root, 'live-soak', 'samples.ndjson');
    await writeArtifact(appended);
    const ahead = new Date(Date.now() + 5000);
    await utimes(appended, ahead, ahead);
    await setArtifactTime(join(root, 'live-soak'), OLD);

    await applyPolicy();

    await stat(appended);
  });

  it('a far-future date is no freshness for any entry', async () => {
    const far = '2099-01-01T00:00:00Z';
    const file = join(root, 'future-file.json');
    await writeArtifact(file);
    await setArtifactTime(file, far);
    const dir = join(root, 'future-dir', 'old.json');
    await writeArtifact(dir);
    await setArtifactTime(dir, OLD);
    await setArtifactTime(path.dirname(dir), far);
    const report = join(root, TEST_OUTPUT_PRUNE_REPORTS_DIRNAME, 'future.model.json');
    await writeArtifact(report);
    await setArtifactTime(report, far);

    await runPruneScript([
      TEST_OUTPUT_PRUNE_FLAG.ROOT, root,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS, '7',
      TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL, '0',
      TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORTS, '0',
      TEST_OUTPUT_PRUNE_FLAG.APPLY,
    ]);

    await assert.rejects(stat(file), 'a top-level file');
    await assert.rejects(stat(path.dirname(dir)), 'a top-level directory\'s own date');
    await assert.rejects(stat(report), 'a report file');
  });

  it('judges a playback folder by its newest content', async () => {
    const playbacks = join(root, TEST_OUTPUT_PRUNE_REPORTS_DIRNAME,
      TEST_OUTPUT_PRUNE_PLAYBACK_DIRNAME);
    const live = join(playbacks, 'live-run', 'frame-0002.json');
    await writeArtifact(live);
    await setArtifactTime(path.dirname(live), OLD);
    const stale = join(playbacks, 'stale-run', 'frame-0001.json');
    await writeArtifact(stale);
    await setArtifactTime(stale, OLD);
    await setArtifactTime(path.dirname(stale), OLD);

    await runPruneScript([
      TEST_OUTPUT_PRUNE_FLAG.ROOT, root,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS, '7',
      TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORT_PLAYBACKS, '0',
      TEST_OUTPUT_PRUNE_FLAG.APPLY,
    ]);

    await stat(live);
    await assert.rejects(stat(path.dirname(stale)), 'old inside and out');
  });

  it('keeps and names what it cannot read, and prunes the rest',
    {skip: RUNS_AS_ROOT}, async () => {
      const locked = join(root, 'locked-tree', 'private');
      await writeArtifact(join(locked, 'old.json'));
      await setArtifactTime(join(locked, 'old.json'), OLD);
      await setArtifactTime(locked, OLD);
      await setArtifactTime(path.dirname(locked), OLD);
      await chmod(locked, 0o000);
      const results = join(workspace, '.tap', 'test-results');
      const unreadable = join(results, 'sealed');
      await mkdir(unreadable, {recursive: true});
      await chmod(unreadable, 0o000);
      const gone = join(results, 'test', 'gone.test.js.tap');
      await writeArtifact(gone);
      await setArtifactTime(gone, OLD);
      const stale = join(root, 'stale-sibling', 'old.json');
      await writeArtifact(stale);
      await setArtifactTime(stale, OLD);
      await setArtifactTime(path.dirname(stale), OLD);

      let result;
      try {
        result = await applyPolicy();
      } finally {
        await chmod(locked, 0o700);
        await chmod(unreadable, 0o700);
      }

      await stat(path.dirname(locked));
      await assert.rejects(stat(path.dirname(stale)), 'the rest is still pruned');
      await assert.rejects(stat(gone), 'including beside an unreadable results folder');
      const [first] = result.stdout.split('\n');
      assert.match(first, / 2 kept because they could not be measured\.$/u,
        'the line the publisher prints says so');
      assert.match(result.stdout, /Kept, could not be measured: test-output\/locked-tree\n/u);
      assert.match(result.stdout, /Kept, could not be measured: \.tap\/test-results\/sealed\n/u);
    });

  it('a delete that fails is reported and the others still happen',
    {skip: RUNS_AS_ROOT}, async () => {
      const locked = join(root, 'undeletable', 'old.json');
      await writeArtifact(locked);
      await setArtifactTime(locked, OLD);
      await setArtifactTime(path.dirname(locked), OLD);
      await chmod(path.dirname(locked), 0o500);
      // A later category: every category after the failure still runs.
      const gone = join(workspace, '.tap', 'test-results', 'test', 'gone.test.js.tap');
      await writeArtifact(gone);
      await setArtifactTime(gone, OLD);

      let result;
      try {
        result = await applyPolicy();
      } finally {
        await chmod(path.dirname(locked), 0o700);
      }

      await stat(locked);
      await assert.rejects(stat(gone), 'the categories after it still prune');
      const [first] = result.stdout.split('\n');
      assert.match(first, /^Deleted 1 artifact entries .* 1 could not be deleted\.$/u);
      assert.match(result.stdout, /Could not delete: test-output\/undeletable \(EACCES\)/u);
    });

  it('one entry it cannot measure never stops the rest of the prune', async () => {
    await symlink(join(workspace, 'nowhere'), join(root, 'dangling-link'));
    const stale = join(root, 'stale-sibling', 'old.json');
    await writeArtifact(stale);
    await setArtifactTime(stale, OLD);
    await setArtifactTime(path.dirname(stale), OLD);

    const result = await applyPolicy();

    assert.equal(result.stderr, '', 'no failure is reported for the prune');
    await assert.rejects(stat(path.dirname(stale)),
      'the stale sibling is still deleted');
    await lstat(join(root, 'dangling-link'));
  });

  it('never age-prunes the parent of a registered git worktree', async () => {
    for (const parent of ['push-gate-worktrees', 'publish-worktrees']) {
      const child = join(root, parent, 'head-abc123', 'README.md');
      await writeArtifact(child);
      await setArtifactTime(child, OLD);
      await setArtifactTime(path.dirname(child), OLD);
      await setArtifactTime(join(root, parent), OLD);
    }

    await applyPolicy();

    for (const parent of ['push-gate-worktrees', 'publish-worktrees']) {
      await stat(join(root, parent, 'head-abc123', 'README.md'));
    }
  });
});

// The report floor exists to keep the harness's history window: the 20 newest
// *.report.json files that carry a `scenarios` array. A floor counted over
// every json was spent on model reports - fixed names, rewritten in place on
// every corpus run - so the first routine prune would have deleted every
// harness report (verifier round 1).
describe('the harness history window survives routine retention', () => {
  let workspace;
  let root;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'prune-history-'));
    root = join(workspace, 'test-output');
    await mkdir(join(root, TEST_OUTPUT_PRUNE_RUN_METADATA_DIRNAME), {recursive: true});
  });

  afterEach(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  it('keeps the newest harness reports even when newer model reports exist', async () => {
    const reports = join(root, TEST_OUTPUT_PRUNE_REPORTS_DIRNAME);
    await mkdir(reports, {recursive: true});
    // 30 harness runs from last month, then 30 model reports from today.
    for (let index = 0; index < 30; index += 1) {
      const file = join(reports, `scenario-run-${String(index).padStart(2, '0')}.report.json`);
      await writeFile(file, JSON.stringify({scenarios: [], timestamp: index}));
      const when = new Date(Date.UTC(2026, 0, 1, 0, index));
      await utimes(file, when, when);
    }
    for (let index = 0; index < 30; index += 1) {
      await writeFile(join(reports, `model-${index}.model.report.json`),
        JSON.stringify({model: 'tlc', result: 'ok'}));
    }

    await runPruneScript([
      TEST_OUTPUT_PRUNE_FLAG.ROOT, root,
      TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS, '7',
      TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORTS, '24',
      TEST_OUTPUT_PRUNE_FLAG.APPLY,
    ]);

    for (let index = 6; index < 30; index += 1) {
      await stat(join(reports, `scenario-run-${String(index).padStart(2, '0')}.report.json`));
    }
    await assert.rejects(stat(join(reports, 'scenario-run-05.report.json')),
      'beyond the floor the oldest harness runs still age out');
  });
});

// A result whose test still exists is overwritten in place on every run, so
// it never accumulates, and it is the duration the lane planner dispatches
// longest-first by. Only results of tests that are gone may age out.
describe('test results that still inform dispatch are kept', () => {
  let workspace;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'prune-tap-'));
    await mkdir(join(workspace, 'test-output', TEST_OUTPUT_PRUNE_RUN_METADATA_DIRNAME),
      {recursive: true});
  });

  afterEach(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  it('keeps an old result for a test that exists and drops one for a test that does not', async () => {
    const results = join(workspace, '.tap', 'test-results', 'test');
    await mkdir(results, {recursive: true});
    await mkdir(join(workspace, 'test'), {recursive: true});
    await writeFile(join(workspace, 'test', 'live.test.js'), '');
    for (const name of ['live.test.js.tap', 'live.test.js.tap.stderr',
      'gone.test.js.tap', 'gone.test.js.tap.stderr']) {
      await writeFile(join(results, name), 'ok 1\n# time=5ms\n');
      await setArtifactTime(join(results, name), '2026-01-01T00:00:00Z');
    }

    await runPruneScript([
      TEST_OUTPUT_PRUNE_FLAG.ROOT, join(workspace, 'test-output'),
      TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS, '7',
      TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL, '0',
      TEST_OUTPUT_PRUNE_FLAG.APPLY,
    ]);

    await stat(join(results, 'live.test.js.tap'));
    await stat(join(results, 'live.test.js.tap.stderr'));
    await assert.rejects(stat(join(results, 'gone.test.js.tap')),
      'a result whose test is gone is the kind that accumulates');
    await assert.rejects(stat(join(results, 'gone.test.js.tap.stderr')));
  });
});

describe('a test file that cannot be checked is kept, and never stops retention', () => {
  let workspace;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'prune-tap-check-'));
    await mkdir(join(workspace, 'test-output', TEST_OUTPUT_PRUNE_RUN_METADATA_DIRNAME),
      {recursive: true});
  });

  afterEach(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  it('drops a result whose path runs through a file and keeps one it may not check',
    {skip: RUNS_AS_ROOT}, async () => {
      const results = join(workspace, '.tap', 'test-results');
      // test/helpers.js is a FILE, so test/helpers.js/x.test.js cannot exist.
      await mkdir(join(workspace, 'test'), {recursive: true});
      await writeFile(join(workspace, 'test', 'helpers.js'), '');
      const throughFile = join(results, 'test', 'helpers.js', 'x.test.js.tap');
      // private/ may not be read, so whether its test exists is unknown.
      await mkdir(join(workspace, 'private'), {recursive: true});
      const unknown = join(results, 'private', 'y.test.js.tap');
      for (const file of [throughFile, unknown]) {
        await writeArtifact(file);
        await setArtifactTime(file, '2026-01-01T00:00:00Z');
      }
      await chmod(join(workspace, 'private'), 0o000);
      try {
        await runPruneScript([
          TEST_OUTPUT_PRUNE_FLAG.ROOT, join(workspace, 'test-output'),
          TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS, '7',
          TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL, '0',
          TEST_OUTPUT_PRUNE_FLAG.APPLY,
        ]);
      } finally {
        await chmod(join(workspace, 'private'), 0o700);
      }

      await assert.rejects(stat(throughFile), 'a path through a file is a definite absence');
      await stat(unknown);
    });
});
