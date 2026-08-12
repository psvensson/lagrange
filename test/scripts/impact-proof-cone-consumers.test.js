import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  assertRunnableProofSelection,
  selectProofCone,
  testImpactDecision,
} from '../../scripts/checks/impact-proof-cone.js';
import {
  MODE_FATAL,
  PROOF_CONE_RECEIPT_DIR,
} from
  '../../scripts/checks/impact-proof-cone-constants.js';
import {buildManifest as buildPrimaryManifest} from
  '../../scripts/checks/test-primary-classification.js';

const root = process.cwd();
const SELECTOR_ENTRY = 'scripts/select-proof-cone.js';
const QUEST_PROOF_ENTRY = 'scripts/run-quest-proof.js';
const CHANGED_ARGS = ['--changed', 'src/runtime/call-cell-value-mapping.js'];
const FULL_SUITE_ARGS = ['--full-suite'];
const DRY_RUN_FLAG = '--dry-run';
const DIFF_BASE_FLAG = '--diff-base';
const HEAD_REVISION = 'HEAD';
const SHELL_TOUCH_COMMAND = 'touch';
const SHELL_FALSE_COMMAND = 'false';
const SENTINEL_FILE_NAME = 'runner-spawned';
const EMPTY_CENSUS = 'empty';
const UNAVAILABLE_CENSUS = 'unavailable';
const LIVE_CENSUS = 'live';
const EMPTY_OUTPUT = '';
const SELECTOR_FATAL_PREFIX = /^FAIL proof-cone decision is not runnable:/u;
const QUEST_PROOF_FATAL_PREFIX =
  /^FAIL quest-proof: proof-cone decision is not runnable:/u;
const EMPTY_CENSUS_PROBLEM = /empty live test census/iu;
const UNAVAILABLE_CENSUS_PROBLEM = /live census unavailable/iu;
const CONSUMER_TEST_PATH =
  'test/scripts/impact-proof-cone-consumers.test.js';
const FORGED_TEST_PATH = 'test/ghost.test.js';
const SOURCE_DIRECTORY = 'src';
const TEST_DIRECTORY = 'test';
const SCRIPTS_DIRECTORY = 'scripts';
const TEST_SHARDS_DIRECTORY = 'test/shards';
const PRIMARY_CLASSES_PATH = 'test/shards/primary-classes.json';
const UNAVAILABLE_TEST_ROOT_CONTENT = 'not-a-directory';
const INPUT_TYPE_MODULE_FLAG = '--input-type=module';
const EVAL_FLAG = '--eval';
const UTF8_ENCODING = 'utf8';
const TYPED_FATAL_TEST_NAME =
  'unavailable and empty live censuses are typed fatal decisions';
const CLI_FATAL_TEST_NAME =
  'selector and Quest-proof CLIs refuse fatal census decisions';
const DIFF_BASE_ATTACK_TEST_NAME =
  'CLI diff-base values cannot execute shell metacharacters';
const FULL_SUITE_CENSUS_TEST_NAME =
  'selector --full-suite derives the live census, never stored classes';

function createCensusRoot(kind) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-consumer-'));
  fs.mkdirSync(path.join(fixtureRoot, SOURCE_DIRECTORY), {recursive: true});
  if (kind === UNAVAILABLE_CENSUS) {
    fs.writeFileSync(
      path.join(fixtureRoot, TEST_DIRECTORY), UNAVAILABLE_TEST_ROOT_CONTENT);
  } else {
    fs.mkdirSync(
      path.join(fixtureRoot, SCRIPTS_DIRECTORY), {recursive: true});
    fs.mkdirSync(path.join(fixtureRoot, TEST_DIRECTORY), {recursive: true});
    fs.mkdirSync(
      path.join(fixtureRoot, TEST_SHARDS_DIRECTORY), {recursive: true});
    fs.writeFileSync(
      path.join(fixtureRoot, PRIMARY_CLASSES_PATH),
      JSON.stringify(buildPrimaryManifest(fixtureRoot)),
    );
  }
  return fixtureRoot;
}

function runWithCensusState(
  entryPath, args, censusState, runnerSentinel = null) {
  const entry = path.join(root, entryPath);
  const source = `
    import fs from 'node:fs';
    import childProcess from 'node:child_process';
    import path from 'node:path';
    import {syncBuiltinESMExports} from 'node:module';
    import {pathToFileURL} from 'node:url';
    const repoRoot = ${JSON.stringify(root)};
    const primaryPath = path.join(repoRoot, 'test/shards/primary-classes.json');
    const testRoot = path.join(repoRoot, 'test');
    const censusState = ${JSON.stringify(censusState)};
    const runnerSentinel = ${JSON.stringify(runnerSentinel)};
    const originalRead = fs.readFileSync;
    const originalReaddir = fs.readdirSync;
    fs.readFileSync = (file, ...readArgs) => {
      if (path.resolve(String(file)) === primaryPath) {
        const manifest = JSON.parse(originalRead(file, 'utf8'));
        manifest.classes = {'test/ghost.test.js': 'unit'};
        return JSON.stringify(manifest);
      }
      return originalRead(file, ...readArgs);
    };
    if (censusState !== 'live') {
      fs.readdirSync = (directory, ...readArgs) => {
        const absolute = path.resolve(String(directory));
        if (absolute === testRoot || absolute.startsWith(testRoot + path.sep)) {
          if (censusState === 'unavailable') {
            throw new Error('fixture live census unavailable');
          }
          return [];
        }
        return originalReaddir(directory, ...readArgs);
      };
    }
    if (runnerSentinel !== null) {
      childProcess.spawnSync = () => {
        fs.writeFileSync(runnerSentinel, 'spawned');
        return {status: 1};
      };
    }
    syncBuiltinESMExports();
    const entry = ${JSON.stringify(entry)};
    process.argv = [process.execPath, entry, ...${JSON.stringify(args)}];
    await import(pathToFileURL(entry).href + '?census=' + Date.now());
  `;
  return spawnSync(
    process.execPath, [INPUT_TYPE_MODULE_FLAG, EVAL_FLAG, source], {
      cwd: root,
      encoding: UTF8_ENCODING,
    });
}

function assertFatalSelection(selection, detailPattern) {
  assert.equal(selection.runnable, false);
  assert.equal(testImpactDecision(selection).mode, MODE_FATAL);
  assert.throws(
    () => assertRunnableProofSelection(selection), detailPattern);
}

function receiptState() {
  const receiptRoot = path.join(root, PROOF_CONE_RECEIPT_DIR);
  if (!fs.existsSync(receiptRoot)) return {directoryExists: false, entryCount: 0};
  let entryCount = 0;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      entryCount += 1;
      if (entry.isDirectory()) visit(path.join(directory, entry.name));
    }
  };
  visit(receiptRoot);
  return {directoryExists: true, entryCount};
}

function assertCliRefusal(
  entry, args, censusState, prefix, runnerSentinel = null) {
  const receiptsBefore = receiptState();
  const result = runWithCensusState(
    entry, args, censusState, runnerSentinel);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, EMPTY_OUTPUT);
  assert.match(result.stderr, prefix);
  assert.match(result.stderr, censusState === EMPTY_CENSUS ?
    EMPTY_CENSUS_PROBLEM : UNAVAILABLE_CENSUS_PROBLEM);
  if (runnerSentinel !== null) {
    assert.equal(fs.existsSync(runnerSentinel), false);
  }
  assert.deepEqual(receiptState(), receiptsBefore);
}

test(TYPED_FATAL_TEST_NAME, () => {
  for (const [kind, detailPattern] of [
    [UNAVAILABLE_CENSUS,
      /not runnable.*fallback could not derive the live census/iu],
    [EMPTY_CENSUS, /not runnable.*empty live test census/iu],
  ]) {
    const fixtureRoot = createCensusRoot(kind);
    try {
      const selection = selectProofCone(
        fixtureRoot, ['src/owner.js']).selection;
      assertFatalSelection(selection, detailPattern);
    } finally {
      fs.rmSync(fixtureRoot, {recursive: true, force: true});
    }
  }
});

test(CLI_FATAL_TEST_NAME, () => {
  for (const censusState of [UNAVAILABLE_CENSUS, EMPTY_CENSUS]) {
    assertCliRefusal(
      SELECTOR_ENTRY,
      CHANGED_ARGS,
      censusState,
      SELECTOR_FATAL_PREFIX,
    );
    assertCliRefusal(
      SELECTOR_ENTRY,
      FULL_SUITE_ARGS,
      censusState,
      SELECTOR_FATAL_PREFIX,
    );
    assertCliRefusal(
      QUEST_PROOF_ENTRY,
      [DRY_RUN_FLAG, ...CHANGED_ARGS],
      censusState,
      QUEST_PROOF_FATAL_PREFIX,
    );
    const sentinelRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'quest-proof-runner-sentinel-'));
    try {
      assertCliRefusal(
        QUEST_PROOF_ENTRY,
        CHANGED_ARGS,
        censusState,
        QUEST_PROOF_FATAL_PREFIX,
        path.join(sentinelRoot, SENTINEL_FILE_NAME),
      );
    } finally {
      fs.rmSync(sentinelRoot, {recursive: true, force: true});
    }
  }
});

test(DIFF_BASE_ATTACK_TEST_NAME, () => {
  for (const entry of [SELECTOR_ENTRY, QUEST_PROOF_ENTRY]) {
    const sentinelRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'proof-diff-base-sentinel-'));
    const markerPath = path.join(sentinelRoot, SENTINEL_FILE_NAME);
    const maliciousRevision = `${HEAD_REVISION};${SHELL_TOUCH_COMMAND} ` +
      `${markerPath};${SHELL_FALSE_COMMAND}`;
    const receiptsBefore = receiptState();
    try {
      const result = runWithCensusState(
        entry,
        [DIFF_BASE_FLAG, maliciousRevision],
        LIVE_CENSUS,
      );
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, EMPTY_OUTPUT);
      assert.equal(fs.existsSync(markerPath), false);
      assert.deepEqual(receiptState(), receiptsBefore);
    } finally {
      fs.rmSync(sentinelRoot, {recursive: true, force: true});
    }
  }
});

test(FULL_SUITE_CENSUS_TEST_NAME, () => {
  const result = runWithCensusState(
    SELECTOR_ENTRY, FULL_SUITE_ARGS, LIVE_CENSUS);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, EMPTY_OUTPUT);
  const selected = result.stdout.trim().split('\n').filter(Boolean).sort();
  const expected = Object.keys(buildPrimaryManifest(root).classes).sort();
  assert.deepEqual(selected, expected);
  assert.ok(selected.includes(CONSUMER_TEST_PATH));
  assert.ok(!selected.includes(FORGED_TEST_PATH));
});
