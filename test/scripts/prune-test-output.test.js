import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile, utimes, stat} from 'node:fs/promises';
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
