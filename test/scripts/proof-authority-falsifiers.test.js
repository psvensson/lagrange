// Adversarial falsifiers for the push gate (proof-authority-integrity).
//
// Each test PLANTS a defect and proves the gate's verdict goes red: the
// selector names a test that observes the defective surface, and running
// that test fails. Selection alone is not detection, so every falsifier runs
// the selected witness through the real runner and asserts a non-zero exit.
// The last falsifier proves the inverse property of identity: a defect that
// exists only in the working tree is invisible to the gate, because the gate
// proves the pushed sha and nothing else.
//
// Proved against a DISPOSABLE repository: a copy of scripts/ and the sealed
// shards, plus a small product tree (one source module, one spawnable
// script, one fixture file, one fixture directory) and the tests that observe
// each of them, classified by the real generators inside the fixture.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {gitProcessEnvironment} from
  '../../scripts/checks/git-process-environment.js';
import {
  CHECK_BASE_ENV,
  WORKSPACE_INJECTION_ENV,
} from '../../scripts/checks/change-selection-constants.js';
import {
  explainSubsystemClassification,
  observationDigestOf,
  observationSurfacesOf,
  subsystemManifestDigest,
} from '../../scripts/checks/test-subsystem-classification.js';
import {
  SUBSYSTEM_MANIFEST_PATH,
} from '../../scripts/checks/test-subsystem-classification-constants.js';
import {execGit} from '../../scripts/checks/git-invocation.js';

const root = process.cwd();
const UTF8 = 'utf8';
const SELECTOR = 'scripts/select-change-tests.js';
const RUNNER = 'scripts/run-test-files.js';
const MATERIALIZER = 'scripts/checks/push-gate-corpus-worktree.js';
const GRAPH_PRODUCER = 'scripts/generate-global-owner-debt-inventory.js';
const GRAPH_PRODUCER_FLAG = '--refresh-import-graph-only';
const SOURCE_MODULE = 'src/partition/falsifier-source.js';
const SPAWNED_SCRIPT = 'scripts/falsifier-script.js';
const OBSERVED_FILE = 'test/partition/fixtures/falsifier-observed.json';
const OBSERVED_DIRECTORY = 'test/partition/fixtures/falsifier-listing';
const TEST_SOURCE = 'test/partition/falsifier-source.test.js';
const TEST_SPAWN = 'test/partition/falsifier-spawn.test.js';
const TEST_FILE = 'test/partition/falsifier-observed-file.test.js';
const TEST_DIRECTORY = 'test/partition/falsifier-observed-directory.test.js';
const TEST_WORKING_TREE = 'test/partition/falsifier-working-tree.test.js';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-authority-'));
const repo = path.join(workspace, 'repo');
process.on('exit', () => {
  fs.rmSync(workspace, {recursive: true, force: true});
});

// The nested runner must not inherit this file's node:test context, or it
// emits the binary reporter and fails for a reason that is not the defect.
const NODE_TEST_CONTEXT_ENV = 'NODE_TEST_CONTEXT';

function env() {
  const base = gitProcessEnvironment();
  delete base[CHECK_BASE_ENV];
  delete base[WORKSPACE_INJECTION_ENV];
  delete base[NODE_TEST_CONTEXT_ENV];
  return base;
}

function git(args, cwd = repo) {
  return execGit(args,
    {cwd, encoding: UTF8, stdio: 'pipe', env: gitProcessEnvironment()}).trim();
}

function write(relative, contents) {
  const absolute = path.join(repo, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, contents, UTF8);
}

function run(argv, options = {}) {
  return spawnSync(process.execPath, argv,
    {cwd: repo, encoding: UTF8, env: env(), ...options});
}

const TEST_PREAMBLE =
  'import assert from \'node:assert/strict\';\n' +
  'import {test} from \'node:test\';\n';

function buildFixtureRepo() {
  fs.mkdirSync(path.join(repo, 'test'), {recursive: true});
  fs.cpSync(path.join(root, 'scripts'), path.join(repo, 'scripts'),
    {recursive: true});
  fs.cpSync(path.join(root, 'test/shards'), path.join(repo, 'test/shards'),
    {recursive: true});
  // The curated shards name this repository's tests; the disposable one has
  // only its own, so the shards are emptied before the generators run there.
  for (const entry of fs.readdirSync(path.join(repo, 'test/shards'))) {
    if (entry.endsWith('.txt')) {
      fs.writeFileSync(path.join(repo, 'test/shards', entry), '', UTF8);
    }
  }
  fs.cpSync(path.join(root, 'test/manifests'), path.join(repo, 'test/manifests'),
    {recursive: true});
  for (const file of ['package.json', 'package-lock.json', '.taprc']) {
    if (fs.existsSync(path.join(root, file))) {
      fs.copyFileSync(path.join(root, file), path.join(repo, file));
    }
  }
  fs.symlinkSync(path.join(root, 'node_modules'),
    path.join(repo, 'node_modules'));
  write('.gitignore', 'node_modules\ntest-output\n.tap\n');
  write(SOURCE_MODULE,
    'export function answer() {\n  return 42;\n}\n');
  write(SPAWNED_SCRIPT,
    'process.stdout.write(\'spawned:ok\\n\');\n');
  write(OBSERVED_FILE, '{"expected": "green"}\n');
  write(`${OBSERVED_DIRECTORY}/one.txt`, 'one\n');
  write(TEST_SOURCE, TEST_PREAMBLE +
    'import {answer} from \'../../src/partition/falsifier-source.js\';\n' +
    'test(\'the source answers\', () => {\n' +
    '  assert.equal(answer(), 42);\n});\n');
  write(TEST_SPAWN, TEST_PREAMBLE +
    'import {execFileSync} from \'node:child_process\';\n' +
    `const SCRIPT = '${SPAWNED_SCRIPT}';\n` +
    'test(\'the spawned script answers\', () => {\n' +
    '  const out = execFileSync(process.execPath, [SCRIPT], {encoding: \'utf8\'});\n' +
    '  assert.equal(out.trim(), \'spawned:ok\');\n});\n');
  write(TEST_FILE, TEST_PREAMBLE +
    'import fs from \'node:fs\';\n' +
    'test(\'the observed fixture is green\', () => {\n' +
    '  const fixture = JSON.parse(fs.readFileSync(\n' +
    '    new URL(\'./fixtures/falsifier-observed.json\', import.meta.url), \'utf8\'));\n' +
    '  assert.equal(fixture.expected, \'green\');\n});\n');
  write(TEST_DIRECTORY, TEST_PREAMBLE +
    'import fs from \'node:fs\';\n' +
    'test(\'the observed directory holds one entry\', () => {\n' +
    '  const entries = fs.readdirSync(\n' +
    '    new URL(\'./fixtures/falsifier-listing\', import.meta.url));\n' +
    '  assert.deepEqual(entries, [\'one.txt\']);\n});\n');
  write(TEST_WORKING_TREE, TEST_PREAMBLE +
    'test(\'the committed witness is green\', () => {\n' +
    '  assert.equal(1, 1);\n});\n');
  git(['init', '--quiet']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'user.name', 'fixture']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'base']);
  classifyFixtureTests();
  sealImportGraph();
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'classified']);
  return git(['rev-parse', 'HEAD']);
}

// The taxonomy's liveness audit refuses a repository where most rules match
// nothing, so the fixture's manifest is the real one plus each fixture test
// classified and censused through the classification owner's own functions:
// the same class and the same observation surfaces the generator would write.
function classifyFixtureTests() {
  const manifestPath = path.join(repo, SUBSYSTEM_MANIFEST_PATH);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, UTF8));
  for (const testPath of [TEST_SOURCE, TEST_SPAWN, TEST_FILE, TEST_DIRECTORY,
    TEST_WORKING_TREE]) {
    const verdict = explainSubsystemClassification(testPath);
    assert.ok(verdict.subsystem, `${testPath} must classify: ${verdict.rule}`);
    manifest.classes[testPath] = verdict.subsystem;
    const surfaces = observationSurfacesOf(repo, testPath);
    if (Object.keys(surfaces).length > 0) {
      manifest.observations[testPath] = surfaces;
    } else {
      delete manifest.observations[testPath];
    }
  }
  manifest.digest = subsystemManifestDigest(manifest.classes);
  manifest.observationDigest = observationDigestOf(manifest.observations);
  fs.writeFileSync(manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`, UTF8);
}

const baseSha = buildFixtureRepo();

function restore() {
  git(['reset', '--hard', '--quiet', baseSha]);
  git(['clean', '-fdq', '-e', 'node_modules']);
}

// Every fixture commit carries its own import-graph seal, as the pre-commit
// hook makes every real commit carry one: the gate refuses a commit whose
// generated metadata is stale (clean-worktree-generated-import-graph).
function sealImportGraph() {
  const sealed = run([GRAPH_PRODUCER, GRAPH_PRODUCER_FLAG]);
  assert.equal(sealed.status, 0, `the fixture's import graph: ${sealed.stderr}`);
}

function commitDefect(changes) {
  for (const [relative, contents] of Object.entries(changes)) write(relative, contents);
  sealImportGraph();
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'planted defect']);
  return git(['rev-parse', 'HEAD']);
}

function selectedTests(head) {
  const result = run([SELECTOR, '--base', baseSha, '--head', head, '--list']);
  assert.equal(result.status, 0,
    `the selector must not refuse the planted change: ${result.stderr}`);
  return result.stdout.split('\n').filter(Boolean);
}

function witnessIsGreen(testPath) {
  const result = run([RUNNER, testPath]);
  assert.equal(result.status, 0,
    `${testPath} must pass before the defect is planted: ` +
    `${result.stdout}${result.stderr}`);
}

function witnessGoesRed(testPath) {
  const result = run([RUNNER, testPath]);
  assert.notEqual(result.status, 0,
    `${testPath} must fail on the planted defect`);
}

// Green before, selected and red after: only that pair is detection.
function provesDetection(changes, witness) {
  witnessIsGreen(witness);
  const head = commitDefect(changes);
  try {
    const selected = selectedTests(head);
    assert.ok(selected.includes(witness),
      `${witness} must be selected for ${Object.keys(changes)}; got ` +
      selected.join(', '));
    witnessGoesRed(witness);
  } finally {
    restore();
  }
}

test('observed-file: a defect in a fixture a test reads through fs is detected', () => {
  provesDetection({[OBSERVED_FILE]: '{"expected": "red"}\n'}, TEST_FILE);
});

test('observed-directory: a defect in a directory a test lists is detected', () => {
  provesDetection({[`${OBSERVED_DIRECTORY}/two.txt`]: 'two\n'}, TEST_DIRECTORY);
});

test('spawned-script: a defect in a script a test spawns by name is detected', () => {
  provesDetection({[SPAWNED_SCRIPT]:
    'process.stdout.write(\'spawned:broken\\n\');\n'}, TEST_SPAWN);
});

test('behavioural-source: a defect in product source is detected', () => {
  provesDetection({[SOURCE_MODULE]:
    'export function answer() {\n  return 41;\n}\n'}, TEST_SOURCE);
});

test('working-tree-not-proof: a defect that exists only in the working tree is invisible to the gate, and a committed one is not', () => {
  // Working tree red, committed green: the gate proves HEAD and passes.
  write(TEST_WORKING_TREE, TEST_PREAMBLE +
    'test(\'the committed witness is green\', () => {\n' +
    '  assert.equal(1, 2);\n});\n');
  try {
    const invisible = run([MATERIALIZER, '--gate', baseSha, '--run',
      process.execPath, RUNNER, TEST_WORKING_TREE]);
    assert.equal(invisible.status, 0,
      'the gate must prove the pushed sha, not the working tree: ' +
      `${invisible.stdout}${invisible.stderr}`);
  } finally {
    restore();
  }
  // Committed red: the same gate fails.
  const head = commitDefect({[TEST_WORKING_TREE]: TEST_PREAMBLE +
    'test(\'the committed witness is green\', () => {\n' +
    '  assert.equal(1, 2);\n});\n'});
  try {
    const visible = run([MATERIALIZER, '--gate', head, '--run',
      process.execPath, RUNNER, TEST_WORKING_TREE]);
    assert.notEqual(visible.status, 0,
      'a committed defect must fail the gate of its sha');
  } finally {
    restore();
  }
});

test('the gate reads its own checkout under a push hook\'s GIT_DIR', () => {
  // git exports GIT_DIR into pre-push when the push comes from a linked
  // worktree. The gate's command must still read the checkout of the sha it
  // proves, not the pusher's.
  const other = path.join(workspace, 'linked');
  git(['worktree', 'add', '--detach', '--quiet', other, baseSha]);
  try {
    git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty',
      '--quiet', '-m', 'the pusher moved on'], other);
    const pusherGitDir = git(['rev-parse', '--absolute-git-dir'], other);
    const gated = run([MATERIALIZER, '--gate', baseSha, '--run', 'sh', '-c',
      'echo "pointer=${GIT_DIR-none}"; git rev-parse HEAD'],
    {env: {...env(), GIT_DIR: pusherGitDir}});
    assert.equal(gated.status, 0, `${gated.stdout}${gated.stderr}`);
    assert.match(gated.stdout, /^pointer=none$/mu, 'no repository pointer reaches the command');
    assert.match(gated.stdout, new RegExp(`^${baseSha}$`, 'mu'),
      'and git there answers for the gated sha');
  } finally {
    git(['worktree', 'remove', '--force', other]);
  }
});

// failed-gate-keeps-evidence: a failed gate retains its acceptance receipt
// and first failing command's artifact outside the checkout. Ordinary
// failures then remove the checkout; a real Git removal refusal preserves
// the original checkout and reports that cleanup failure too.
const GATE_REPORT = 'test-output/acceptance/gate.report.json';
const GATE_ARTIFACT = 'test-output/acceptance/postpush/change-proof.json';
const GATE_FAILURE_DETAIL = 'not ok test/kept.test.js (1 assertions, 1ms)';
const WRITE_GATE_REPORT = [
  'mkdir -p test-output/acceptance/postpush',
  'printf \'%s\' \'{"commands":[{"id":"change-proof","status":"FAIL",' +
    `"artifactIdentity":{"path":"${GATE_ARTIFACT}"}}]}' > ${GATE_REPORT}`,
  `printf '%s' '${GATE_FAILURE_DETAIL}' > ${GATE_ARTIFACT}`,
].join('; ');

function assertCheckoutRemoved(checkout) {
  assert.equal(fs.existsSync(checkout), false, 'the gate checkout is removed');
}

function assertInvalidCheckoutRetained(checkout, gated) {
  assert.equal(fs.existsSync(checkout), true,
    'a Git removal refusal preserves the original checkout');
  assert.ok(git(['worktree', 'list', '--porcelain']).includes(`worktree ${checkout}\n`),
    'the refused checkout remains registered in its actual repository');
  assert.equal(fs.readFileSync(path.join(checkout, '.git'), UTF8), 'gitdir: /nonexistent',
    'the actual invalid pointer survives for diagnosis');
  assert.equal(fs.readFileSync(path.join(checkout, GATE_ARTIFACT), UTF8), GATE_FAILURE_DETAIL,
    'the original artifact remains in the refused checkout');
  assert.match(gated.stderr, /not a git repository: \/nonexistent/u,
    'the original status-read failure remains visible');
  assert.ok(gated.stderr.includes(`checkout cleanup unavailable at ${checkout}`),
    `the owner names its actual cleanup refusal: ${gated.stderr}`);
  assert.match(gated.stderr, /validation failed, cannot remove working tree/u,
    'the real Git removal error is retained');
}

function gateKeepsDiagnostics(script, assertCheckout) {
  const kept = path.join(repo, 'test-output', 'push-gate', baseSha);
  fs.rmSync(kept, {recursive: true, force: true});
  try {
    const gated = run([MATERIALIZER, '--gate', baseSha, '--run', 'sh', '-c',
      `${WRITE_GATE_REPORT}; ${script}`]);
    assert.equal(gated.status, 1, `${gated.stdout}${gated.stderr}`);
    const checkout = /proving \S+ in (\S+):/u.exec(gated.stdout)?.[1];
    assert.ok(checkout, `the gate names its checkout: ${gated.stdout}`);
    assertCheckout(checkout, gated);
    assert.equal(fs.existsSync(path.join(kept, 'gate.report.json')), true,
      `the receipt is kept outside the removed checkout: ${gated.stderr}`);
    assert.equal(fs.readFileSync(path.join(kept, 'change-proof.json'), UTF8),
      GATE_FAILURE_DETAIL, 'the failing command artifact is kept with its detail');
    // Git reports its canonical repository root even when the fixture's
    // temporary directory is reached through a symlink. Compare the one
    // actual retained directory; its existence and bytes are checked above.
    const canonicalKept = fs.realpathSync(kept);
    assert.ok(gated.stderr.includes(`gate diagnostics retained in ${canonicalKept}`),
      `the gate says where it kept them:\n${JSON.stringify({
        expectedKept: canonicalKept,
        fixtureKept: kept,
        declaredTmpdir: process.env.TMPDIR ?? null,
        fixtureTemporaryRoot: os.tmpdir(),
        canonicalTemporaryRoot: fs.realpathSync(os.tmpdir()),
        fixtureRepository: repo,
        gitRepositoryRoot: git(['rev-parse', '--show-toplevel']),
      }, null, 2)}\n${gated.stderr}`);
  } finally {
    fs.rmSync(kept, {recursive: true, force: true});
    restore();
  }
}

test('a failed gate run keeps its diagnostics after the checkout is removed', () => {
  gateKeepsDiagnostics('exit 1', assertCheckoutRemoved);
});

test('a gate whose injection link was replaced keeps its diagnostics', () => {
  gateKeepsDiagnostics('rm node_modules && mkdir node_modules', assertCheckoutRemoved);
});

test('a gate that dirtied its checkout keeps its diagnostics', () => {
  gateKeepsDiagnostics('echo dirtied >> package.json', assertCheckoutRemoved);
});

test('a gate that throws after its command retains its diagnostics and refused checkout', () => {
  // The checkout's git link points nowhere: the gate's own status read throws.
  gateKeepsDiagnostics('printf "gitdir: /nonexistent" > .git', assertInvalidCheckoutRetained);
});
