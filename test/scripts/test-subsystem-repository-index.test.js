// Real Git indexes witness the repository/physical-filesystem boundary.
// No process adapter replacement or test-only production path is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {observationSurfacesOf} from '../../scripts/checks/test-subsystem-classification.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {spawnGit} from '../../scripts/checks/git-invocation.js';

const observer = 'test/scripts/observer.test.js';
const trackedPath = 'src/tracked.js';
const newPath = 'src/new.js';
const ignoredPath = 'data/external/local-only.txt';
const expectedRepositoryFiles = [newPath, trackedPath];

function write(root, name, content) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function git(root, args, input) {
  const result = spawnGit(args, {cwd: root, input, encoding: 'utf8',
    env: {...gitProcessEnvironment(), LC_ALL: 'C'}});
  assert.equal(result.error, undefined, 'fixture Git invocation must start and settle');
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function fixture(t, {repository = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-census-index-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  write(root, '.gitignore', 'data/external/\n');
  write(root, observer, [trackedPath, newPath, ignoredPath].map((name) =>
    `readFileSync('${name}');`).join('\n'));
  write(root, trackedPath, 'export {};\n');
  write(root, ignoredPath, 'not repository content\n');
  if (repository) {
    git(root, ['init', '--quiet']);
    git(root, ['add', '--', '.gitignore', observer, trackedPath]);
  }
  write(root, newPath, 'export const pending = true;\n');
  return root;
}

test('repository census includes tracked and pending files but excludes ignored files', (t) => {
  const root = fixture(t);
  assert.deepEqual(observationSurfacesOf(root, observer), {files: expectedRepositoryFiles});
});

test('a genuinely non-Git scratch tree retains filesystem observation semantics', (t) => {
  const root = fixture(t, {repository: false});
  assert.deepEqual(observationSurfacesOf(root, observer),
    {files: [ignoredPath, newPath, trackedPath]});
});

test('a repository index larger than one MiB never broadens to ignored physical files', (t) => {
  const root = fixture(t);
  const blob = git(root, ['hash-object', '-w', '--stdin'], '').trim();
  const entries = Array.from({length: 5500}, (_, index) =>
    `100644 ${blob}\tcatalog/${String(index).padStart(5, '0')}-${'x'.repeat(210)}\n`);
  // Index entries suffice: this does not create thousands of physical files.
  git(root, ['update-index', '--index-info'], entries.join(''));
  const listed = git(root, ['ls-files', '-z']);
  assert.ok(Buffer.byteLength(listed) > 1024 * 1024, 'engage the original output bound');
  assert.deepEqual(observationSurfacesOf(root, observer), {files: expectedRepositoryFiles});
});

test('an unreadable Git index refuses instead of adopting the physical filesystem', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.git/index'), 'invalid index');
  assert.throws(() => observationSurfacesOf(root, observer),
    (error) => error.status !== 0, 'Git read failure must remain a failure');
});

test('inherited Git repository pointers cannot redirect the observation census', (t) => {
  const root = fixture(t);
  const foreign = fixture(t);
  fs.unlinkSync(path.join(foreign, newPath));
  const keys = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.GIT_DIR = path.join(foreign, '.git');
    process.env.GIT_WORK_TREE = foreign;
    process.env.GIT_INDEX_FILE = path.join(foreign, '.git/index');
    process.env.GIT_COMMON_DIR = path.join(foreign, '.git');
    assert.deepEqual(observationSurfacesOf(root, observer), {files: expectedRepositoryFiles});
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
