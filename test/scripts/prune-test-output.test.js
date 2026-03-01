import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile, utimes, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path, {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NUM} from '../../src/constants/index.js';
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
  TEST_OUTPUT_PRUNE_FLAG,
} from '../../src/constants/test-output-prune-values.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '../../scripts/prune-test-output.js');

async function writeArtifact(filePath, size = TEST_OUTPUT_PRUNE_ARTIFACT_SIZE) {
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, TEST_OUTPUT_PRUNE_ARTIFACT_FILL.repeat(size),
    TEST_OUTPUT_PRUNE_ENCODING);
}

async function setArtifactTime(targetPath, isoString) {
  const when = new Date(isoString);
  await utimes(targetPath, when, when);
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
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
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
      ],
      {
        encoding: TEST_OUTPUT_PRUNE_ENCODING,
        env: {
          ...process.env,
          TZ: TEST_OUTPUT_PRUNE_TIMEZONE,
        },
      },
    );

    assert.equal(result.status, NUM.ZERO, result.stderr);
    const payload = JSON.parse(result.stdout);

    assert.deepEqual(
      payload.deletedPaths.reports,
      TEST_OUTPUT_PRUNE_EXPECTED_DELETED_REPORT,
    );
    assert.deepEqual(
      payload.deletedPaths.reportPlaybacks,
      TEST_OUTPUT_PRUNE_EXPECTED_DELETED_REPORT_PLAYBACK,
    );
    assert.deepEqual(
      payload.deletedPaths.legacyPlaybacks,
      TEST_OUTPUT_PRUNE_EXPECTED_DELETED_LEGACY_PLAYBACK,
    );
    assert.deepEqual(
      payload.deletedPaths.topLevel,
      TEST_OUTPUT_PRUNE_EXPECTED_DELETED_TOP_LEVEL,
    );
  });

  it(TEST_OUTPUT_PRUNE_APPLY_TEST_NAME, async () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
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
      ],
      {
        encoding: TEST_OUTPUT_PRUNE_ENCODING,
        env: {
          ...process.env,
          TZ: TEST_OUTPUT_PRUNE_TIMEZONE,
        },
      },
    );

    assert.equal(result.status, NUM.ZERO, result.stderr);

    for (const removedPath of TEST_OUTPUT_PRUNE_STAT_REMOVED_PATHS) {
      await assert.rejects(stat(join(root, ...removedPath)));
    }

    for (const retainedPath of TEST_OUTPUT_PRUNE_STAT_RETAINED_PATHS) {
      await stat(join(root, ...retainedPath));
    }
  });
});
