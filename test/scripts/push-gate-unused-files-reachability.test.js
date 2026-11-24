// The script-reachability probe (`push-gate-unused-files.js
// --unreachable-scripts`): a script is reachable when a surface that runs
// scripts - package.json, a workflow, a hook, a gate manifest, the image,
// the examples, the solver, an open quest or epic probe - reaches it through
// imports and literal mentions; everything else under scripts/ is counted.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {execGit} from '../../scripts/checks/git-invocation.js';

const PROBE = fileURLToPath(new URL(
  '../../scripts/checks/push-gate-unused-files.js', import.meta.url));
const UNREACHABLE_FLAG = '--unreachable-scripts';
const UNREACHABLE_SRC_FLAG = '--unreachable-src';
const ADDED_FLAG = '--added';
const BASE_FLAG = '--base';
const LIST_FLAG = '--list';

function write(root, relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), {recursive: true});
  fs.writeFileSync(path.join(root, relativePath), content);
}

// A tree shaped like the repository's runner surfaces, with one script per
// kind of root and a few nothing runs.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'script-reachability-'));
  execGit(['init', '--quiet'], {cwd: root});
  write(root, 'package.json',
    '{"scripts":{"check":"node scripts/from-package.js"}}\n');
  write(root, 'scripts/from-package.js',
    'import \'./imported-by-package.js\';\nnew URL(\'./baseline.json\', import.meta.url);\n');
  write(root, 'scripts/imported-by-package.js', 'export const x = 1;\n');
  write(root, 'scripts/baseline.json', '{}\n');
  write(root, '.github/workflows/ci.yml', 'run: node scripts/from-workflow.js\n');
  write(root, 'scripts/from-workflow.js',
    'spawn(\'node\', [\'scripts/spawned-by-workflow.js\']);\n');
  write(root, 'scripts/spawned-by-workflow.js', '');
  write(root, '.githooks/pre-push', 'node scripts/from-hook.sh\n');
  write(root, 'scripts/from-hook.sh', '');
  write(root, 'test/manifests/gate.json', '{"command":"node scripts/from-manifest.js"}\n');
  write(root, 'scripts/from-manifest.js', '');
  write(root, 'Dockerfile', 'COPY scripts/from-image.js /app/\n');
  write(root, 'scripts/from-image.js', '');
  write(root, 'examples/demo/README.md', 'run `node scripts/from-example.js`\n');
  write(root, 'scripts/from-example.js', '');
  write(root, 'scripts/solve.js', 'import \'./solve/step.js\';\n');
  write(root, 'scripts/solve/step.js', '');
  write(root, 'solve/quests/open/quest.json',
    '{"doneWhen":{"args":{"command":"node scripts/open-quest-probe.js"}}}\n');
  write(root, 'solve/quests/open/log.ndjson', '{"type":"attempt"}\n');
  write(root, 'scripts/open-quest-probe.js', '');
  write(root, 'solve/quests/closed/quest.json',
    '{"doneWhen":{"args":{"command":"node scripts/closed-quest-probe.js"}}}\n');
  write(root, 'solve/quests/closed/log.ndjson', '{"type":"terminal","status":"solved"}\n');
  write(root, 'scripts/closed-quest-probe.js', '');
  write(root, 'solve/epics/open.md', '---\nstatus: open\n---\nprobe: node scripts/open-epic-probe.js\n');
  write(root, 'scripts/open-epic-probe.js', '');
  write(root, 'solve/epics/done.md', '---\nstatus: done\n---\nprobe: node scripts/done-epic-probe.js\n');
  write(root, 'scripts/done-epic-probe.js', '');
  write(root, 'docs/guide.md', 'see scripts/only-in-docs.js\n');
  write(root, 'scripts/only-in-docs.js', '');
  write(root, 'scripts/untracked.js', '');
  execGit(['add', '-A'], {cwd: root});
  execGit(['rm', '--cached', '--quiet', 'scripts/untracked.js'], {cwd: root});
  return root;
}

// The probe exits 1 while anything is unreachable; the count is its last line.
function probe(root, ...flags) {
  const run = spawnSync('node', [PROBE, UNREACHABLE_FLAG, ...flags],
    {cwd: root, encoding: 'utf8'});
  assert.equal(run.stderr, '', 'the probe reports on stdout only');
  const lines = run.stdout.trim().split('\n');
  const count = Number(lines[lines.length - 1]);
  assert.equal(run.status, count === 0 ? 0 : 1, 'exit status follows the count');
  return {count, listed: lines.slice(0, -1)};
}

test('every runner surface reaches its script; closed records and prose reach nothing', () => {
  const root = fixture();
  const {count, listed} = probe(root, LIST_FLAG);
  assert.deepEqual(listed, [
    'scripts/closed-quest-probe.js',
    'scripts/done-epic-probe.js',
    'scripts/only-in-docs.js',
  ], 'a closed quest, a done epic and a docs mention keep nothing alive');
  assert.equal(count, listed.length, 'the last line is the count the quest probe reads');
  assert.equal(probe(root).listed.length, 0, 'without --list only the count prints');
});

test('deleting the unreachable scripts brings the count to zero', () => {
  const root = fixture();
  for (const file of probe(root, LIST_FLAG).listed) {
    execGit(['rm', '--force', '--quiet', file], {cwd: root});
  }
  assert.equal(probe(root).count, 0);
});

function probeSrc(root, ...flags) {
  const run = spawnSync('node', [PROBE, UNREACHABLE_SRC_FLAG, ...flags],
    {cwd: root, encoding: 'utf8'});
  assert.equal(run.stderr, '', 'the src reachability probe reports on stdout only');
  const lines = run.stdout.trim().split('\n');
  const count = Number(lines[lines.length - 1]);
  assert.equal(run.status, count === 0 ? 0 : 1, 'exit status follows the count');
  return {count, listed: lines.slice(0, -1)};
}

test('--unreachable-src flags src modules imported only by tests while excluding test-helpers',
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'src-reachability-'));
    execGit(['init', '--quiet'], {cwd: root});
    write(root, 'package.json', JSON.stringify({
      main: 'src/public-api.js',
      exports: {'.': './src/public-api.js', './extra': './src/exported.js'},
      bin: {cli: './src/bin-entry.js'},
      scripts: {start: 'node src/index.js'},
    }));
    write(root, 'Dockerfile', 'CMD ["node", "src/docker-worker.js"]\n');
    write(root, 'src/public-api.js', 'import \'./live-dep.js\';\n');
    write(root, 'src/live-dep.js', 'export const live = 1;\n');
    write(root, 'src/exported.js', 'export const extra = 1;\n');
    write(root, 'src/bin-entry.js', 'export const bin = 1;\n');
    write(root, 'src/index.js', 'export const idx = 1;\n');
    write(root, 'src/docker-worker.js', 'export const worker = 1;\n');
    write(root, 'scripts/tool.js', 'import \'../src/script-dep.js\';\n');
    write(root, 'src/script-dep.js', 'export const tool = 1;\n');
    write(root, 'src/test-helpers/helper.js', 'export const helper = 1;\n');
    write(root, 'src/test-only-orphan.js', 'export const orphan = 1;\n');
    write(root, 'src/completely-unused.js', 'export const unused = 1;\n');
    write(root, 'test/orphan.test.js', 'import \'../src/test-only-orphan.js\';\n');
    execGit(['add', '-A'], {cwd: root});

    const {count, listed} = probeSrc(root, LIST_FLAG);
    assert.deepEqual(listed, [
      'src/completely-unused.js',
      'src/test-only-orphan.js',
    ], 'modules only imported by test/** or unimported must be flagged; prod roots and ' +
      'src/test-helpers/** must not');
    assert.equal(count, 2);
    assert.equal(probeSrc(root).listed.length, 0, 'without --list only the count prints');

    execGit(['rm', '--force', '--quiet', 'src/completely-unused.js', 'src/test-only-orphan.js'],
      {cwd: root});
    assert.equal(probeSrc(root).count, 0);
  });

test('--unreachable-src ignores JSON baselines, data arrays, and non-entrypoint mentions',
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'src-reachability-negative-'));
    execGit(['init', '--quiet'], {cwd: root});
    write(root, 'package.json', JSON.stringify({
      name: 'fixture',
      description: 'mentions src/orphan.js in metadata only',
      main: 'src/index.js',
      scripts: {start: 'node src/index.js'},
    }));
    write(root, 'Dockerfile', [
      '# comment mentioning src/orphan.js',
      'COPY src/orphan.js /app/src/orphan.js',
      'CMD ["node", "src/index.js"]',
    ].join('\n') + '\n');
    write(root, 'src/index.js', [
      '// import \'./orphan.js\';',
      '/** @typedef {import(\'./orphan.js\').Orphan} Orphan */',
      'export const live = 1;',
    ].join('\n') + '\n');
    write(root, 'src/orphan.js', 'export const orphan = 1;\n');
    write(root, 'test/orphan.test.js', 'import \'../src/orphan.js\';\n');
    write(root, 'scripts/baseline.json', JSON.stringify({
      entries: [{filePath: 'src/orphan.js'}],
    }) + '\n');
    write(root, 'scripts/audit.js', [
      'const BASELINE_URL = new URL(\'./baseline.json\', import.meta.url);',
      'const ALLOWLIST = [\'src/orphan.js\'];',
      'const UNUSED_PATH = \'src/orphan.js\';',
      'console.log(BASELINE_URL, ALLOWLIST, UNUSED_PATH);',
    ].join('\n') + '\n');
    execGit(['add', '-A'], {cwd: root});

    const run = spawnSync('node', [PROBE, UNREACHABLE_SRC_FLAG, LIST_FLAG],
      {cwd: root, encoding: 'utf8'});
    assert.equal(run.stderr, '', 'the src reachability probe reports on stdout only');
    assert.equal(run.status, 1, 'orphan must fail the reachability probe');
    const lines = run.stdout.trim().split('\n');
    assert.deepEqual(lines.slice(0, -1), ['src/orphan.js'],
      'JSON baseline and checker allowlist string mentions must not mark src/orphan.js reachable');
    assert.equal(Number(lines[lines.length - 1]), 1, 'exactly 1 unused source file reported');
  });

test('--unreachable-src traverses executable import, export, require, URL, Worker, and fork edges',
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'src-reachability-edges-'));
    execGit(['init', '--quiet'], {cwd: root});
    write(root, 'package.json', JSON.stringify({
      main: 'src/index.js',
      scripts: {runWorker: 'node src/script-cmd-entry.js'},
    }));
    write(root, 'Dockerfile', 'ENTRYPOINT ["node", "src/docker-entry.js"]\n');
    write(root, 'src/index.js', [
      'import {a} from \'./static-import.js\';',
      'export {b} from \'./reexport.js\';',
      'const DYN = \'./dynamic-const.js\';',
      'await import(\'./dynamic-literal.js\');',
      'await import(DYN);',
      'require(\'./cjs-required.cjs\');',
      'const url = new URL(\'./url-worker.js\', import.meta.url);',
      'new Worker(\'./rel-worker.js\');',
      'new Worker(\'src/repo-worker.js\');',
      'fork(\'src/fork-worker.js\');',
      'console.log(a, url);',
    ].join('\n') + '\n');
    write(root, 'src/static-import.js', 'export const a = 1;\n');
    write(root, 'src/reexport.js', 'export const b = 2;\n');
    write(root, 'src/dynamic-literal.js', 'export const c = 3;\n');
    write(root, 'src/dynamic-const.js', 'export const d = 4;\n');
    write(root, 'src/cjs-required.cjs', 'module.exports = 5;\n');
    write(root, 'src/url-worker.js', 'export const e = 6;\n');
    write(root, 'src/rel-worker.js', 'export const f = 7;\n');
    write(root, 'src/repo-worker.js', 'export const g = 8;\n');
    write(root, 'src/fork-worker.js', 'export const h = 9;\n');
    write(root, 'src/script-cmd-entry.js', 'export const i = 10;\n');
    write(root, 'src/docker-entry.js', 'export const j = 11;\n');
    execGit(['add', '-A'], {cwd: root});

    const {count, listed} = probeSrc(root, LIST_FLAG);
    assert.deepEqual(listed, []);
    assert.equal(count, 0);
  });

test('--unreachable-src --added flags only newly added unreachable src modules in range',
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'src-reachability-added-'));
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    };
    const commitAll = (message) => {
      execGit(['add', '-A'], {cwd: root, env: gitEnv});
      execGit(['commit', '--quiet', '-m', message], {cwd: root, env: gitEnv});
    };
    execGit(['init', '--quiet'], {cwd: root, env: gitEnv});
    write(root, 'package.json', JSON.stringify({main: 'src/index.js'}));
    write(root, 'src/index.js', 'export const live = 1;\n');
    write(root, 'src/preexisting-orphan.js', 'export const oldOrphan = 1;\n');
    commitAll('base');
    const baseSha = execGit(['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8', env: gitEnv})
      .trim();

    write(root, 'src/new-live.js', 'export const live2 = 2;\n');
    write(root, 'src/index.js', 'import \'./new-live.js\';\nexport const live = 1;\n');
    commitAll('add reachable module');
    assert.equal(probeSrc(root, ADDED_FLAG, BASE_FLAG, baseSha, LIST_FLAG).count, 0,
      'pre-existing untouched orphan must not fail --added range check');
    assert.deepEqual(probeSrc(root, LIST_FLAG).listed, ['src/preexisting-orphan.js']);

    write(root, 'src/new-orphan.js', 'export const bad = 3;\n');
    write(root, 'test/new-orphan.test.js', 'import \'../src/new-orphan.js\';\n');
    write(root, 'scripts/baseline.json', '{"filePath":"src/new-orphan.js"}\n');
    commitAll('add unreachable module');
    const addedResult = probeSrc(root, ADDED_FLAG, BASE_FLAG, baseSha, LIST_FLAG);
    assert.deepEqual(addedResult.listed, ['src/new-orphan.js'],
      'newly added unreachable src module must be flagged even when referenced by tests/JSON');
    assert.equal(addedResult.count, 1);
  });
