// Every exact checkout the push-gate materializer proves a command in is
// brought to the generated state a CI or lab-placed proof checkout has before
// the command starts (clean-worktree-generated-import-graph). The post-merge
// corpus for b3b366573 ran push-gate-change-proof.test.js in a materialized
// checkout that never generated the sealed import graph, and it was red there
// only. Proved against a disposable repository whose producer is a stand-in
// at the real producer's path, through the real materializer.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH}
  from '../../scripts/checks/impact-proof-cone-constants.js';
import {PROOF_CHECKOUT_GENERATORS} from '../../scripts/checks/proof-checkout-preparation.js';

const MATERIALIZER = path.resolve('scripts/checks/push-gate-corpus-worktree.js');
const PRODUCER = 'scripts/generate-global-owner-debt-inventory.js';
const SEAL_COMMITTED = '{"sealed": "committed"}\n';

function git(cwd, ...args) {
  return execGit(args, {cwd, encoding: 'utf8', env: gitProcessEnvironment()}).trim();
}

// A repository whose producer writes the graph, and - when asked to - also
// rewrites the tracked seal or fails.
function fixture(t, producerBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-checkout-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), {recursive: true});
    fs.writeFileSync(path.join(root, relative), text);
  };
  write('.gitignore', 'test-output\n');
  write(IMPORT_GRAPH_SEAL_PATH, SEAL_COMMITTED);
  if (producerBody !== null) write(PRODUCER, producerBody);
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Preparation Fixture');
  git(root, 'config', 'user.email', 'preparation@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'fixture');
  return root;
}

const WRITES_GRAPH =
  'import fs from \'node:fs\';\n' +
  `if (!process.argv.includes(${JSON.stringify(PROOF_CHECKOUT_GENERATORS[0].args[0])})) ` +
  'process.exit(9);\n' +
  `fs.mkdirSync(${JSON.stringify(path.dirname(IMPORT_GRAPH_PATH))}, {recursive: true});\n` +
  `fs.writeFileSync(${JSON.stringify(IMPORT_GRAPH_PATH)}, '{"graph": true}\\n');\n`;

// The command the gate proves: it records what it found before it started.
function gate(root, sha = 'HEAD') {
  const seen = path.join(root, '..', `${path.basename(root)}-seen.json`);
  const probe = 'const fs = require("node:fs");' +
    `fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({` +
    `graph: fs.existsSync(${JSON.stringify(IMPORT_GRAPH_PATH)}),` +
    `seal: fs.readFileSync(${JSON.stringify(IMPORT_GRAPH_SEAL_PATH)}, "utf8")}));`;
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath,
    [MATERIALIZER, '--gate', sha, '--run', process.execPath, '-e', probe],
    {cwd: root, encoding: 'utf8', env});
  const saw = fs.existsSync(seen) ? JSON.parse(fs.readFileSync(seen, 'utf8')) : null;
  fs.rmSync(seen, {force: true});
  return {status: result.status, output: `${result.stdout}${result.stderr}`, saw};
}

test('the gated command starts in a checkout that already has the import graph', (t) => {
  const root = fixture(t, WRITES_GRAPH);
  const {status, output, saw} = gate(root);
  assert.equal(status, 0, output);
  assert.deepEqual(saw, {graph: true, seal: SEAL_COMMITTED},
    'generated for this commit before the command, its tracked bytes untouched');
  assert.match(output, /prepared import-graph/u);
});

test('a producer that fails refuses the gate before the command runs', (t) => {
  const root = fixture(t, 'process.exit(4);\n');
  const {status, output, saw} = gate(root);
  assert.notEqual(status, 0);
  assert.equal(saw, null, 'the command never ran without its generated material');
  assert.match(output, /import-graph could not be generated/u);
});

test('a producer that rewrites tracked metadata refuses the gate before the command runs',
  (t) => {
    const root = fixture(t, WRITES_GRAPH +
      `fs.writeFileSync(${JSON.stringify(IMPORT_GRAPH_SEAL_PATH)}, '{"sealed": "rewritten"}\\n');\n`);
    const {status, output, saw} = gate(root);
    assert.notEqual(status, 0, 'a commit whose generated metadata is stale is refused');
    assert.equal(saw, null, 'the command never ran on bytes that are not the commit\'s');
    assert.match(output, new RegExp('import-graph: the commit\'s generated metadata is stale; ' +
      `regenerate and commit ${IMPORT_GRAPH_SEAL_PATH}`, 'u'));
  });

test('a producer killed by a signal is named as killed', (t) => {
  const root = fixture(t, 'process.kill(process.pid, \'SIGTERM\');\n');
  const {status, output, saw} = gate(root);
  assert.notEqual(status, 0);
  assert.equal(saw, null);
  assert.match(output, /import-graph could not be generated: killed by SIGTERM/u);
});

test('a commit without the producer has nothing to generate, and says so', (t) => {
  const root = fixture(t, null);
  const {status, output, saw} = gate(root);
  assert.equal(status, 0, output);
  assert.deepEqual(saw, {graph: false, seal: SEAL_COMMITTED});
  assert.match(output, new RegExp(`import-graph not generated: this commit has no ${PRODUCER}`,
    'u'));
});

for (const signalled of [false, true]) {
  test(`the real corpus command boundary retains signalled=${signalled} execution`, (t) => {
    const root = fixture(t, null);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      scripts: {'test:duplication': 'node -e "process.exit(0)"'},
    }));
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.writeFileSync(path.join(root, 'scripts', 'check-file-size-thresholds.js'),
      'process.stdout.write("finite corpus command started\\n");\n' +
      (signalled ? 'process.kill(process.pid, "SIGTERM");\n' : 'process.exit(0);\n'));
    const env = gitProcessEnvironment();
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [MATERIALIZER, '--in-place'],
      {cwd: root, encoding: 'utf8', env});
    const output = result.stdout + result.stderr;
    assert.equal(result.status, signalled ? 1 : 0, output);
    assert.match(output, /finite corpus command started/u,
      'the real child ran before the materializer normalized its terminal status');
    if (signalled) {
      assert.doesNotMatch(output, /corpus gates passed/u);
      assert.match(output, /stopped by SIGTERM/u, 'the original signal remains explicit');
    } else {
      assert.match(output, /corpus gates passed/u);
    }
  });
}

test('a materialized gate keeps its original failure and checkout when retention fails', (t) => {
  const root = fixture(t, WRITES_GRAPH);
  const report = JSON.stringify({commands: [{status: 'FAIL',
    artifactIdentity: {path: 'test-output/acceptance/missing.json'}}]});
  const command = [
    'const fs = require("node:fs");',
    'fs.mkdirSync("test-output/acceptance", {recursive: true});',
    `fs.writeFileSync("test-output/acceptance/gate.report.json", ${JSON.stringify(report)});`,
    'fs.writeFileSync("test-output/acceptance/original.txt", "first failure transcript\\n");',
    'process.exit(42);',
  ].join('\n');
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath,
    [MATERIALIZER, '--gate', 'HEAD', '--run', process.execPath, '-e', command],
    {cwd: root, encoding: 'utf8', env});
  assert.equal(result.status, 42, 'the gate exit remains primary over the later copy failure');
  assert.match(result.stderr, /diagnostic retention unavailable; original checkout kept at/u);
  assert.doesNotMatch(result.stderr, /gate diagnostics retained in/u);
  const parent = path.join(root, 'test-output', 'push-gate-worktrees');
  const entries = fs.readdirSync(parent);
  assert.equal(entries.length, 1, 'the failed exact checkout remains available');
  const checkout = path.join(parent, entries[0], 'tree');
  assert.equal(fs.readFileSync(path.join(checkout, 'test-output/acceptance/gate.report.json'),
    'utf8'), report);
  assert.equal(fs.readFileSync(path.join(checkout, 'test-output/acceptance/original.txt'), 'utf8'),
    'first failure transcript\n');
  assert.ok(git(root, 'worktree', 'list', '--porcelain')
    .includes(`worktree ${fs.realpathSync(checkout)}\n`),
  'the retained original remains registered as a worktree');
});
