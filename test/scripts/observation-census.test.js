// The observation census: what a test observes beyond its imports, derived
// from its source text; which tests observe a changed path; and when the
// committed census has drifted from the live one. Proved on a disposable
// tree so every rule is exercised against real files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {
  observationDrift,
  observationSurfacesOf,
  observersOf,
} from '../../scripts/checks/test-subsystem-classification.js';
import {
  REFUSAL_UNKNOWN_SCOPE,
  SELECTION_REFUSED,
} from '../../scripts/checks/change-selection-constants.js';
import {
  selectChangedTests,
} from '../../scripts/checks/change-selection.js';
import {
  SUBSYSTEM_MANIFEST_PATH,
} from '../../scripts/checks/test-subsystem-classification-constants.js';

const UTF8 = 'utf8';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'observation-census-'));

function write(relative, contents) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, contents, UTF8);
}

write('src/query/owner.js', 'export const owner = 1;\n');
write('src/query/other.js', 'export const other = 2;\n');
write('test/shards/manifest.json', '{}\n');
write('test/query/fixtures/golden.json', '{}\n');
write('test/query/fixtures/listing/one.txt', 'one\n');
write('scripts/checks/audit.js', 'process.exit(0);\n');
write('package.json', '{}\n');
write('docs/development/note.md', '# note\n');
write('test/query/observer.test.js', [
  'import {test} from \'node:test\';',
  'import {owner} from \'../../src/query/owner.js\';',
  'import fs from \'node:fs\';',
  'import path from \'node:path\';',
  'const ROOT = process.cwd();',
  'const AUDIT = \'scripts/checks/audit.js\';',
  'const golden = fs.readFileSync(new URL(\'./fixtures/golden.json\', import.meta.url));',
  'const listing = fs.readdirSync(new URL(\'./fixtures/listing\', import.meta.url));',
  'const manifest = path.join(ROOT, \'test\', \'shards\', \'manifest.json\');',
  'const sources = path.join(ROOT, \'src\');',
  'const pkg = \'package.json\';',
  'const word = \'test\';',
  'const nowhere = \'src/query/missing.js\';',
  'const factor = process.env.LAGRANGE_TEST_MACHINE_FACTOR;',
  'test(\'x\', () => {});',
  '',
].join('\n'));
write('test/query/plain.test.js',
  'import {test} from \'node:test\';\ntest(\'y\', () => {});\n');
write('src/authoring/module.js', 'export const m = 1;\n');
write('scripts/check-walker.js', [
  'import fs from \'node:fs\';',
  'import path from \'node:path\';',
  'import {WORDS} from \'./checks/walker-constants.js\';',
  'export function walkSources() {',
  '  return fs.readdirSync(path.join(process.cwd(), \'src\'));',
  '}',
  '',
].join('\n'));
write('scripts/checks/walker-constants.js',
  'export const WORDS = [\'docs\', \'architecture\'];\n');
write('test/query/loaders/fixture-loader.js', [
  'import fs from \'node:fs\';',
  'export function loadGolden() {',
  '  return fs.readFileSync(new URL(\'../fixtures/golden.json\', import.meta.url));',
  '}',
  '',
].join('\n'));
write('test/query/through-helpers.test.js', [
  'import {test} from \'node:test\';',
  'import {walkSources} from \'../../scripts/check-walker.js\';',
  'import {loadGolden} from \'./loaders/fixture-loader.js\';',
  'import {tap} from \'../../src/test-helpers/tap.js\';',
  'test(\'h\', () => { walkSources(); loadGolden(); });',
  '',
].join('\n'));
write('src/test-helpers/tap.js',
  'export const tap = 1; const hub = [\'src\', \'test\'];\n');
write('solve/quests/q1/quest.json', '{}\n');
write('test/query/fixtures/world/guest.js', 'export {};\n');
write('test/query/walkers.test.js', [
  'import {test} from \'node:test\';',
  'import fs from \'node:fs\';',
  'import path from \'node:path\';',
  'const ROOT = path.resolve(process.cwd(), \'src\');',
  'const TESTS = path.join(process.cwd(), \'test\');',
  'const listing = collectSourceFiles(\'scripts\');',
  'const notASurface = new Error(\'test\');',
  'const roots = [\'src\', \'docs\'];',
  'const guest = new URL(\'fixtures/world/guest.js\', import.meta.url);',
  'const manifest = path.join(',
  '  process.cwd(),',
  '  \'test\', \'shards\',',
  '  \'manifest.json\',',
  ');',
  'const quest = `solve/quests/${id}/quest.json`;',
  'const authored = `../../src/authoring/${name}.js`;',
  'const bracket = process.env[\'LAGRANGE_LOG_FILE\'];',
  'const {LAGRANGE_PROBE, OTHER_THING} = process.env;',
  'test(\'w\', () => {});',
  '',
].join('\n'));

test('literals resolve to existing files and directories, imports and bare words do not', () => {
  const surfaces = observationSurfacesOf(root, 'test/query/observer.test.js');
  assert.deepEqual(surfaces.files, [
    'package.json',
    'scripts/checks/audit.js',
    'test/query/fixtures/golden.json',
    'test/shards/manifest.json',
  ], 'a spawned script literal, a relative fixture, a joined manifest path and ' +
     'a named repository file are files; an import specifier is not');
  assert.deepEqual(surfaces.directories, [
    'src',
    'test/query/fixtures/listing',
  ], 'a joined bare root and a relative listing are directories; the bare ' +
     'word test is not');
  assert.deepEqual(surfaces.env, ['LAGRANGE_TEST_MACHINE_FACTOR']);
});

test('nested calls, multi-line joins, bare relative URLs, template prefixes, filesystem-flavoured bare roots and root arrays are surfaces', () => {
  const surfaces = observationSurfacesOf(root, 'test/query/walkers.test.js');
  assert.deepEqual(surfaces.files, [
    'test/query/fixtures/world/guest.js',
    'test/shards/manifest.json',
  ], 'a URL relative to the test without ./ and a multi-line join with a ' +
     'nested process.cwd() resolve to files');
  assert.deepEqual(surfaces.directories, [
    'docs',
    'scripts',
    'solve/quests',
    'src',
    'src/authoring',
    'test',
  ], 'resolve(process.cwd(), root), a filesystem-flavoured call on a bare ' +
     'root, an array of roots and a template\'s static prefix are ' +
     'directories; new Error(\'test\') is not');
  assert.deepEqual(surfaces.env, [
    'LAGRANGE_LOG_FILE', 'LAGRANGE_PROBE', 'OTHER_THING',
  ], 'bracket access and destructuring name env surfaces');
});

test('a test observes what its imported helpers observe, but not the test-helper hub or a vocabulary table', () => {
  const surfaces = observationSurfacesOf(root, 'test/query/through-helpers.test.js');
  assert.deepEqual(surfaces.files, ['test/query/fixtures/golden.json'],
    'a fixture loader under test/ reads the fixture on the test\'s behalf');
  assert.deepEqual(surfaces.directories, ['src'],
    'a checker under scripts/ that walks src/ makes the test a whole-src ' +
    'observer; the constants table it imports and the tap hub do not add ' +
    'docs, architecture or test');
});

test('a test that observes nothing has no entry', () => {
  assert.deepEqual(observationSurfacesOf(root, 'test/query/plain.test.js'), {});
});

test('observers are found by file and by directory prefix, classified tests only', () => {
  const observations = {
    'test/query/observer.test.js':
      observationSurfacesOf(root, 'test/query/observer.test.js'),
    'test/query/unclassified.test.js': {files: ['package.json']},
  };
  const classes = {'test/query/observer.test.js': 'query-sql'};
  assert.deepEqual(observersOf(observations, 'package.json', classes),
    [{test: 'test/query/observer.test.js', kind: 'files'}]);
  assert.deepEqual(observersOf(observations, 'src/query/other.js', classes),
    [{test: 'test/query/observer.test.js', kind: 'directories'}],
    'any path under an observed directory selects the observer');
  assert.deepEqual(observersOf(observations, 'srcfile.js', classes), [],
    'a directory prefix needs the separator');
  assert.deepEqual(observersOf(observations, 'docs/development/note.md', classes),
    []);
});

test('drift names the tests whose live surfaces differ from the manifest', () => {
  const live = observationSurfacesOf(root, 'test/query/observer.test.js');
  const manifest = {
    classes: {
      'test/query/observer.test.js': 'query-sql',
      'test/query/plain.test.js': 'query-sql',
      'test/query/gone.test.js': 'query-sql',
    },
    observations: {'test/query/observer.test.js': live},
  };
  assert.deepEqual(observationDrift(root, manifest), [],
    'a matching census is not drift, and a deleted test is nobody\'s');
  write('test/query/plain.test.js',
    'import {test} from \'node:test\';\n' +
    'const g = \'test/query/fixtures/golden.json\';\ntest(\'y\', () => {});\n');
  assert.deepEqual(observationDrift(root, manifest), ['test/query/plain.test.js'],
    'a test that started observing a file has drifted');
});

test('the selector refuses a change while the committed census has drifted', () => {
  const manifestPath = path.join(root, SUBSYSTEM_MANIFEST_PATH);
  const live = observationSurfacesOf(root, 'test/query/observer.test.js');
  const classes = {'test/query/observer.test.js': 'query-sql'};
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  fs.writeFileSync(manifestPath, JSON.stringify({
    classes, observations: {'test/query/observer.test.js': live},
  }), UTF8);
  const current = selectChangedTests({
    root, changedPaths: ['package.json'], changedPackageFields: [],
    lockfileGraphChanged: false,
  });
  assert.notEqual(current.kind, SELECTION_REFUSED,
    'a current census selects');
  assert.ok(current.tests.some((entry) =>
    entry.path === 'test/query/observer.test.js'),
  'the observer of package.json is selected');
  fs.writeFileSync(manifestPath, JSON.stringify({
    classes, observations: {'test/query/observer.test.js': {files: ['package.json']}},
  }), UTF8);
  const drifted = selectChangedTests({
    root, changedPaths: ['package.json'], changedPackageFields: [],
    lockfileGraphChanged: false,
  });
  assert.equal(drifted.kind, SELECTION_REFUSED,
    'a stale census refuses rather than guesses');
  assert.equal(drifted.refusalCode, REFUSAL_UNKNOWN_SCOPE);
  assert.match(drifted.refusals[0], /drifted/u);
  assert.match(drifted.refusals[0], /observer\.test\.js/u);
});
