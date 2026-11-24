// Contract tests for comparative benchmark artifact auto-regeneration and
// push/commit hook guards:
// 1. `.githooks/pre-commit` regenerates and stages derived benchmark JSONs and
//    `docs/benchmarks/` when `data/tidb-comparison/` changes are staged,
//    enforces the clean-index guard, and runs append-only + recompute checks.
// 2. `.githooks/pre-push` (including non-main branch preservation pushes)
//    refuses any commit whose `docs/benchmarks/` or derived JSONs are stale or
//    whose benchmark history is rewritten, proves the EXACT pushed commit SHA
//    rather than the working tree, admits freshly regenerated commits, and
//    skips unrelated branch commits.
// 3. `scripts/checks/push-gate-corpus-worktree.js` runs both benchmark checks
//    inside `runCorpusGates` when `data/tidb-comparison/raw-observations.ndjson`
//    is present, and preserves synthetic repos without it.
// 4. `docs/benchmarks/cloud/run-comparative-benchmarks.mjs` wires canonical
//    auto-regeneration without perturbing CLI `--help` / `--dry-run`.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {recomputeComparativeBenchmarks} from '../../scripts/checks/comparative-benchmark-recompute.js';
import {benchmarkHistoryOffences} from '../../scripts/checks/check-benchmark-history-append-only.js';
import {
  regenerateAllBenchmarkArtifactsFromAdmitted,
} from '../distributed/harness/raw-observation-campaign-specs.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UTF8 = 'utf8';
const ZERO_SHA = '0'.repeat(40);
const SEEDED_LINE_COUNT = 2;
const HISTORY_PATH = 'data/tidb-comparison/history.ndjson';
const INVALIDATIONS_PATH = 'data/tidb-comparison/invalidations.ndjson';
const RAW_OBSERVATIONS_PATH = 'data/tidb-comparison/raw-observations.ndjson';
const PROGRESS_SUMMARY_PATH = 'data/tidb-comparison/progress-summary.json';
const TIDB_PROGRESS_MD_PATH = 'docs/benchmarks/tidb-comparison-progress.md';
const BENCHMARK_README_PATH = 'docs/benchmarks/README.md';
const PRE_COMMIT_HOOK = '.githooks/pre-commit';
const PRE_PUSH_HOOK = '.githooks/pre-push';
const CORPUS_WORKTREE_SCRIPT = 'scripts/checks/push-gate-corpus-worktree.js';
const RUNNER_PATH = 'docs/benchmarks/cloud/run-comparative-benchmarks.mjs';
const CLEAN_ENV_DROP_KEYS = Object.freeze([
  'LAGRANGE_SKIP_PRECOMMIT',
  'LAGRANGE_SKIP_INVENTORY_REGEN',
  'LAGRANGE_SOLVER_LANDING',
  'LAGRANGE_WORKSPACE_INJECTIONS',
  'LAGRANGE_GATE_PUSHED_SHA',
  'LAGRANGE_GATE_RED_MAIN_CHECKED',
  'LAGRANGE_PUSH_SKIP_TESTS',
  'LAGRANGE_PUSH_PROVE_BRANCH',
  'LAGRANGE_CHECK_BASE',
]);

function readRecordedLines(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), UTF8)
    .split('\n')
    .filter(Boolean)
    .map((line) => `${line}\n`);
}

const REAL_HISTORY_LINES = Object.freeze(readRecordedLines(HISTORY_PATH));
const REAL_INVALIDATION_LINES = Object.freeze(readRecordedLines(INVALIDATIONS_PATH));

function cleanHookEnv(extra = {}) {
  const env = gitProcessEnvironment();
  for (const key of CLEAN_ENV_DROP_KEYS) delete env[key];
  return {...env, ...extra};
}

function git(repo, args) {
  return String(execGit(args, {
    cwd: repo,
    encoding: UTF8,
    env: cleanHookEnv(),
  })).trim();
}

function writeFile(repo, relPath, content, mode = 0o644) {
  const fullPath = path.join(repo, relPath);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, content, {encoding: UTF8, mode});
}

function copyTree(srcDir, destDir, predicate) {
  fs.cpSync(srcDir, destDir, {
    recursive: true,
    filter: (candidate) => predicate(candidate),
  });
}

function runBashHook(repo, hookPath, {input = '', env = {}} = {}) {
  const result = spawnSync('bash', [hookPath], {
    cwd: repo,
    encoding: UTF8,
    input,
    env: cleanHookEnv(env),
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

async function createBenchmarkFixtureRepo(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-hooks-fixture-'));
  t.after(() => fs.rmSync(workspace, {recursive: true, force: true}));
  const repo = path.join(workspace, 'repo');
  const remote = path.join(workspace, 'remote.git');
  fs.mkdirSync(repo, {recursive: true});

  copyTree(path.join(REPO_ROOT, '.githooks'), path.join(repo, '.githooks'), () => true);
  copyTree(
    path.join(REPO_ROOT, 'scripts'),
    path.join(repo, 'scripts'),
    (src) => !src.endsWith('.json'),
  );
  copyTree(
    path.join(REPO_ROOT, 'test/distributed/harness'),
    path.join(repo, 'test/distributed/harness'),
    (src) => !src.includes(`${path.sep}__tests__`),
  );
  fs.symlinkSync(fs.realpathSync(path.join(REPO_ROOT, 'src')), path.join(repo, 'src'), 'dir');
  fs.symlinkSync(
    fs.realpathSync(path.join(REPO_ROOT, 'test/distributed/reference-client')),
    path.join(repo, 'test/distributed/reference-client'),
    'dir',
  );
  fs.symlinkSync(
    fs.realpathSync(path.join(REPO_ROOT, 'test/distributed/scenarios')),
    path.join(repo, 'test/distributed/scenarios'),
    'dir',
  );
  writeFile(repo, 'scripts/check-file-size-thresholds.js', 'process.exit(0);\n');
  writeFile(repo, 'package.json', `${JSON.stringify({
    name: 'benchmark-hooks-fixture',
    type: 'module',
    scripts: {
      'audit:guideline:hot-path-diagnostics': 'node -e ""',
      'test:duplication': 'node -e ""',
    },
  }, null, 2)}\n`);
  writeFile(repo, 'README.md', 'fixture\n');

  const nodeModulesReal = fs.realpathSync(path.join(REPO_ROOT, 'node_modules'));
  fs.symlinkSync(nodeModulesReal, path.join(repo, 'node_modules'), 'dir');

  writeFile(repo, RAW_OBSERVATIONS_PATH, '');
  writeFile(repo, HISTORY_PATH, REAL_HISTORY_LINES.slice(0, SEEDED_LINE_COUNT).join(''));
  writeFile(repo, INVALIDATIONS_PATH, REAL_INVALIDATION_LINES.slice(0, SEEDED_LINE_COUNT).join(''));

  await regenerateAllBenchmarkArtifactsFromAdmitted(repo);

  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.name', 'lagrange-test']);
  git(repo, ['config', 'user.email', 'lagrange-test@example.invalid']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '--no-verify', '-m', 'seed benchmark fixture']);
  const baseSha = git(repo, ['rev-parse', 'HEAD']);

  git(repo, ['init', '--bare', '--quiet', remote]);
  git(repo, ['remote', 'add', 'origin', remote]);
  git(repo, ['push', '--quiet', '--no-verify', 'origin', `${baseSha}:refs/heads/main`]);
  git(repo, ['fetch', '--quiet', 'origin']);

  return {workspace, repo, remote, baseSha};
}

test('pre-commit regenerates and stages derived benchmark artifacts from RED to GREEN',
  async (t) => {
    const {repo} = await createBenchmarkFixtureRepo(t);

    // Append a new valid recorded line to history without regenerating derived outputs.
    fs.appendFileSync(path.join(repo, HISTORY_PATH), REAL_HISTORY_LINES[SEEDED_LINE_COUNT], UTF8);

    // RED before pre-commit: published artifacts are stale relative to history.ndjson.
    const beforeRecompute = await recomputeComparativeBenchmarks(repo);
    assert.equal(beforeRecompute.ok, false,
      'stale derived artifacts must fail recompute before pre-commit');

    // Stage only the history append and invoke the real pre-commit hook.
    git(repo, ['add', HISTORY_PATH]);
    const hookRun = runBashHook(repo, PRE_COMMIT_HOOK);
    assert.equal(hookRun.status, 0, hookRun.output);
    assert.match(hookRun.output, /regenerating comparative benchmark artifacts/u);
    assert.match(hookRun.output, /benchmark history append-only: clean/u);
    assert.match(hookRun.output, /comparative-benchmark-recompute: PASS/u);

    // GREEN after pre-commit: derived JSONs and docs/benchmarks are refreshed and staged.
    const staged = git(repo, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
    assert.ok(staged.includes(HISTORY_PATH), 'original data change remains staged');
    assert.ok(staged.includes(PROGRESS_SUMMARY_PATH),
      `derived progress summary must be auto-staged: ${staged.join(', ')}`);
    assert.ok(staged.includes(TIDB_PROGRESS_MD_PATH),
      `derived docs/benchmarks page must be auto-staged: ${staged.join(', ')}`);

    const afterRecompute = await recomputeComparativeBenchmarks(repo);
    assert.equal(afterRecompute.ok, true, afterRecompute.difference || '');
    assert.deepEqual(benchmarkHistoryOffences({root: repo}), []);
  });

test('pre-commit enforces clean-index guard and refuses rewritten benchmark history', async (t) => {
  const {repo} = await createBenchmarkFixtureRepo(t);

  // Clean-index guard: staged history change + unstaged edit in docs/benchmarks is refused.
  fs.appendFileSync(path.join(repo, HISTORY_PATH), REAL_HISTORY_LINES[SEEDED_LINE_COUNT], UTF8);
  git(repo, ['add', HISTORY_PATH]);
  fs.appendFileSync(path.join(repo, BENCHMARK_README_PATH), '\n<!-- unstaged dirt -->\n', UTF8);

  const dirtyRun = runBashHook(repo, PRE_COMMIT_HOOK);
  assert.equal(dirtyRun.status, 1, dirtyRun.output);
  assert.match(dirtyRun.output,
    /needs data\/tidb-comparison and docs\/benchmarks to match the staged index/u);
  assert.match(dirtyRun.output, /LAGRANGE_SKIP_INVENTORY_REGEN=1/u);

  // Reset and stage a non-append-only rewrite (reordered lines) in history.ndjson.
  git(repo, ['reset', '--hard', '--quiet', 'HEAD']);
  writeFile(repo, HISTORY_PATH, REAL_HISTORY_LINES[1] + REAL_HISTORY_LINES[0]);
  git(repo, ['add', HISTORY_PATH]);

  const rewriteRun = runBashHook(repo, PRE_COMMIT_HOOK);
  assert.equal(rewriteRun.status, 1, rewriteRun.output);
  assert.match(rewriteRun.output, /pre-commit: FAIL - benchmark history append-only/u);
});

test('pre-push refuses stale or rewritten benchmark commits on non-main branches ' +
  'and admits regenerated commits using the exact pushed SHA', async (t) => {
  const {repo, baseSha} = await createBenchmarkFixtureRepo(t);

  // 1. Unrelated branch commit skips benchmark freshness verification and exits 0.
  git(repo, ['checkout', '--quiet', '-b', 'feature/unrelated', baseSha]);
  writeFile(repo, 'README.md', 'unrelated branch edit\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '--quiet', '--no-verify', '-m', 'unrelated change']);
  const unrelatedSha = git(repo, ['rev-parse', 'HEAD']);
  const unrelatedPush = runBashHook(repo, PRE_PUSH_HOOK, {
    input: `refs/heads/feature/unrelated ${unrelatedSha} refs/heads/feature/unrelated ${ZERO_SHA}\n`,
  });
  assert.equal(unrelatedPush.status, 0, unrelatedPush.output);
  assert.doesNotMatch(unrelatedPush.output, /verifying benchmark freshness/u);

  // 2. Stale non-main branch commit is REFUSED even if the working tree was regenerated.
  git(repo, ['checkout', '--quiet', '-b', 'feature/bench-stale', baseSha]);
  fs.appendFileSync(path.join(repo, HISTORY_PATH), REAL_HISTORY_LINES[SEEDED_LINE_COUNT], UTF8);
  git(repo, ['add', HISTORY_PATH]);
  git(repo, ['commit', '--quiet', '--no-verify', '-m', 'stale benchmark data']);
  const staleSha = git(repo, ['rev-parse', 'HEAD']);

  // Regenerate ONLY in the working tree (uncommitted) to prove pre-push inspects
  // the exact pushed commit SHA rather than the working tree.
  await regenerateAllBenchmarkArtifactsFromAdmitted(repo);
  const stalePush = runBashHook(repo, PRE_PUSH_HOOK, {
    input: `refs/heads/feature/bench-stale ${staleSha} refs/heads/feature/bench-stale ${ZERO_SHA}\n`,
  });
  assert.equal(stalePush.status, 1, stalePush.output);
  assert.match(stalePush.output, /verifying benchmark freshness on pushed commit/u);
  assert.match(stalePush.output, /comparative-benchmark-recompute: FAIL/u);

  // 3. Commit the regenerated artifacts -> non-main branch push is ADMITTED even
  //    when the working tree has unrelated dirty benchmark edits.
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '--no-verify', '-m', 'regenerate benchmark artifacts']);
  const freshSha = git(repo, ['rev-parse', 'HEAD']);
  fs.appendFileSync(path.join(repo, BENCHMARK_README_PATH), '\n<!-- dirty tree -->\n', UTF8);

  const freshPush = runBashHook(repo, PRE_PUSH_HOOK, {
    input: `refs/heads/feature/bench-stale ${freshSha} refs/heads/feature/bench-stale ${ZERO_SHA}\n`,
  });
  assert.equal(freshPush.status, 0, freshPush.output);
  assert.match(freshPush.output, /comparative-benchmark-recompute: PASS/u);
  assert.match(freshPush.output, /non-main branch preservation push/u);

  // 4. Rewritten benchmark history is REFUSED on non-main branch push even when
  //    derived artifacts were regenerated for the rewritten history.
  git(repo, ['reset', '--hard', '--quiet', baseSha]);
  git(repo, ['checkout', '--quiet', '-b', 'feature/bench-rewrite', baseSha]);
  writeFile(repo, HISTORY_PATH, REAL_HISTORY_LINES[1] + REAL_HISTORY_LINES[0]);
  await regenerateAllBenchmarkArtifactsFromAdmitted(repo);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '--no-verify', '-m', 'rewrite benchmark history']);
  const rewriteSha = git(repo, ['rev-parse', 'HEAD']);

  const rewritePush = runBashHook(repo, PRE_PUSH_HOOK, {
    input: `refs/heads/feature/bench-rewrite ${rewriteSha} ` +
      `refs/heads/feature/bench-rewrite ${ZERO_SHA}\n`,
  });
  assert.equal(rewritePush.status, 1, rewritePush.output);
  assert.match(rewritePush.output, /benchmark history append-only: refusing/u);
});

test('push-gate-corpus-worktree runs benchmark checks when raw-observations.ndjson exists ' +
  'and skips them in synthetic repos without benchmark data', async (t) => {
  const {repo, baseSha} = await createBenchmarkFixtureRepo(t);

  // Stale commit fails corpus gate via comparative-benchmark-recompute.js.
  fs.appendFileSync(path.join(repo, HISTORY_PATH), REAL_HISTORY_LINES[SEEDED_LINE_COUNT], UTF8);
  git(repo, ['add', HISTORY_PATH]);
  git(repo, ['commit', '--quiet', '--no-verify', '-m', 'stale commit for corpus gate']);
  const staleSha = git(repo, ['rev-parse', 'HEAD']);

  const staleGate = spawnSync(process.execPath, [CORPUS_WORKTREE_SCRIPT, '--ref', staleSha], {
    cwd: repo,
    encoding: UTF8,
    env: cleanHookEnv(),
  });
  assert.equal(staleGate.status, 1, `${staleGate.stdout}${staleGate.stderr}`);
  assert.match(`${staleGate.stdout}${staleGate.stderr}`, /comparative-benchmark-recompute: FAIL/u);

  // Base commit (freshly regenerated) passes corpus gate.
  const freshGate = spawnSync(process.execPath, [CORPUS_WORKTREE_SCRIPT, '--ref', baseSha], {
    cwd: repo,
    encoding: UTF8,
    env: cleanHookEnv(),
  });
  assert.equal(freshGate.status, 0, `${freshGate.stdout}${freshGate.stderr}`);
  assert.match(freshGate.stdout, /comparative-benchmark-recompute: PASS/u);
  assert.match(freshGate.stdout, /corpus gates passed on the pushed tree/u);

  // Removing raw-observations.ndjson preserves synthetic temp-repo runs without benchmark files.
  git(repo, ['reset', '--hard', '--quiet', baseSha]);
  fs.rmSync(path.join(repo, RAW_OBSERVATIONS_PATH));
  const syntheticGate = spawnSync(process.execPath, [CORPUS_WORKTREE_SCRIPT, '--in-place'], {
    cwd: repo,
    encoding: UTF8,
    env: cleanHookEnv(),
  });
  assert.equal(syntheticGate.status, 0, `${syntheticGate.stdout}${syntheticGate.stderr}`);
  assert.doesNotMatch(syntheticGate.stdout, /comparative-benchmark-recompute/u);
});

test('run-comparative-benchmarks.mjs wires canonical auto-regeneration and keeps CLI help clean',
  () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, RUNNER_PATH), UTF8);
    assert.match(source, /regenerateAllBenchmarkArtifactsFromAdmitted/u);
    assert.match(source, /DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH/u);
    const helpRun = spawnSync(process.execPath, [path.join(REPO_ROOT, RUNNER_PATH), '--help'], {
      cwd: REPO_ROOT,
      encoding: UTF8,
      env: cleanHookEnv(),
    });
    assert.equal(helpRun.status, 0, helpRun.stderr);
    assert.match(helpRun.stdout, /Usage: node docs\/benchmarks\/cloud\/run-comparative-benchmarks\.mjs/u);
  });
