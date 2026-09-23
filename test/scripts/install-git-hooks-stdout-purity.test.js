import {test} from '../../src/test-helpers/tap.js';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

// The hooks installer runs as npm's `prepare` lifecycle, so `npm pack --json`
// captures whatever it writes to stdout. A single diagnostic line there makes
// the pack output unparseable and fails the release packaging receipt, which
// is how the 0.2 package-npm receipt failed on a clean checkout. Diagnostics
// belong on stderr; stdout stays machine-readable.
const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..',
);
const INSTALLER = path.join(REPO_ROOT, 'scripts', 'install-git-hooks.js');

test('install-git-hooks writes no diagnostics to stdout', async (t) => {
  // In a scratch repository: the installer writes git config, and a test run
  // must never write the real repository's shared config.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-'));
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  const env = gitProcessEnvironment();
  spawnSync('git', ['init', '-q'], {cwd: dir, env});
  const run = spawnSync(process.execPath, [INSTALLER], {
    cwd: dir,
    encoding: 'utf8',
    env,
  });
  t.equal(run.stdout, '',
    'stdout is empty so npm pack --json output stays parseable');
  t.ok(run.stderr.includes('[hooks]'),
    'the diagnostic is still emitted, on stderr');
});

// Generated metadata is a function of the whole tree, so two branches that
// each regenerated it conflict on every merge, and a driver - which runs
// before git has written the merged tree - cannot regenerate it. The
// repository marks those files merge=lagrange-generated, and the installer
// configures that driver where it sets core.hooksPath: it keeps ours, so the
// merge does not stop, and names the regeneration the merged tree owes.
const GENERATED_PATHS = [
  'test/shards/impact-graph-seal.json',
  'test/shards/primary-classes.json',
  'test/shards/resource-classes.json',
  'test/shards/subsystem-classes.json',
  'solve/changes/global-owner-debt-inventory/inventory.json',
];

test('a merge of two regenerated branches keeps ours instead of conflicting', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-driver-'));
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  const env = gitProcessEnvironment();
  const git = (args) => spawnSync('git', args, {cwd: dir, encoding: 'utf8', env});
  const write = (relative, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, relative)), {recursive: true});
    fs.writeFileSync(path.join(dir, relative), content);
  };
  const commitAll = (message) => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', message]);
  };
  git(['init', '-q', '-b', 'main']);
  for (const [key, value] of [['user.email', 'm@example.com'], ['user.name', 'M'],
    ['commit.gpgsign', 'false']]) {
    git(['config', key, value]);
  }
  const attributes = fs.readFileSync(path.join(REPO_ROOT, '.gitattributes'), 'utf8')
    .split('\n').filter((line) => /\smerge=lagrange-generated(\s|$)/u.test(line));
  t.same(attributes.map((line) => line.split(/\s+/u)[0]), GENERATED_PATHS,
    'the repository marks exactly the generated files');
  write('.gitattributes', `${attributes.join('\n')}\n`);
  for (const file of GENERATED_PATHS) write(file, 'base\n');
  commitAll('base');
  git(['checkout', '-q', '-b', 'side']);
  write('test/side.test.js', 'side\n');
  for (const file of GENERATED_PATHS) write(file, 'side\n');
  commitAll('side regenerated');
  git(['checkout', '-q', 'main']);
  write('test/main.test.js', 'main\n');
  for (const file of GENERATED_PATHS) write(file, 'main\n');
  commitAll('main regenerated');

  const unconfigured = git(['merge', '--no-edit', 'side']);
  t.not(unconfigured.status, 0, 'without the driver the merge stops');
  t.same(git(['diff', '--name-only', '--diff-filter=U']).stdout.trim().split('\n').sort(),
    [...GENERATED_PATHS].sort(), 'on a conflict in every generated file');
  git(['merge', '--abort']);

  const installed = spawnSync(process.execPath, [INSTALLER], {cwd: dir, encoding: 'utf8', env});
  t.equal(installed.status, 0);
  t.equal(installed.stdout, '', 'the installer still writes nothing to stdout');
  const merged = git(['merge', '--no-edit', 'side']);
  t.equal(merged.status, 0, `the merge completes: ${merged.stderr}`);
  t.equal(git(['diff', '--name-only', '--diff-filter=U']).stdout.trim(), '',
    'no generated file is left conflicted');
  t.equal(git(['rev-list', '--count', 'HEAD^2..side']).stdout.trim(), '0',
    'side is merged');
  for (const file of GENERATED_PATHS) {
    t.equal(fs.readFileSync(path.join(dir, file), 'utf8'), 'main\n', `${file} is ours`);
    t.ok(merged.stderr.includes(file), `the driver names ${file}`);
  }
  t.match(merged.stderr, /npm run -s test:metadata:refresh/u,
    'and the regeneration the merged tree owes');
  t.ok(fs.existsSync(path.join(dir, 'test', 'side.test.js')), 'the rest of side merged');
});
