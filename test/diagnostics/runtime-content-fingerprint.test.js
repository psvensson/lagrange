import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {measureRuntimeContent} from '../../src/diagnostics/runtime-content-fingerprint.js';

const OWNER_URL = new URL('../../src/diagnostics/runtime-content-fingerprint.js', import.meta.url);
const CHILD_TIMEOUT_MS = 10000;
const MISSING = 'oe-provenance-missing-package';
// Captured from unmodified 5c30388e498cb1578dc7ba7199bf2de51266d77b, before repair.
const PREDECESSOR_LOCK_FACTS = Object.freeze({
  sourceDigest: '4a3da447ee305a347c8748563600506dc05ad6257ff34a2bcfe8b6328956ae6d',
  dependencyDigest: '20d71872ec4e188967656651c2f2b087169888ab340595c2534a3508eef47ed6',
  manifestDigest: '40739d838ec3850613734c89f1c9343c5ed5aef40c47a3fd0f58136c1e7bee7c',
  dependencyFileCount: 3,
});

function fixture(t, manifest = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-content-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  function put(relative, packageManifest = {}, body = 'export default 1;') {
    const target = path.join(directory, relative);
    fs.mkdirSync(target, {recursive: true});
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
      name: path.basename(target), version: '1.0.0', ...packageManifest,
    }));
    fs.writeFileSync(path.join(target, 'index.js'), body);
    return target;
  }
  const root = put('node_modules/app', manifest);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/index.js'), 'runtime();');
  return {directory, root, put};
}

function childMeasurement(root, {args = [], env = {}} = {}) {
  return spawnSync(process.execPath, [...args, '--input-type=module', '-e',
    `import {measureRuntimeContent} from ${JSON.stringify(OWNER_URL.href)};
     console.log(JSON.stringify(await measureRuntimeContent(process.argv[1])));`, root], {
    encoding: 'utf8', timeout: CHILD_TIMEOUT_MS,
    env: {...process.env, NODE_OPTIONS: '', NODE_PATH: '', ...env},
  });
}

test('measureRuntimeContent lock-present facts match the unmodified predecessor byte for byte',
  async (t) => {
    const {root, put} = fixture(t);
    put('node_modules/app/node_modules/dependency');
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({packages: {
      '': {}, 'node_modules/dependency': {version: '1.0.0'},
      'node_modules/dev-tool': {dev: true}, 'node_modules/optional': {optional: true},
    }}));
    assert.deepEqual(await measureRuntimeContent(root), PREDECESSOR_LOCK_FACTS);
    put('node_modules/app/node_modules/dev-tool', {}, 'unmeasured dev bytes');
    assert.deepEqual(await measureRuntimeContent(root), PREDECESSOR_LOCK_FACTS);
  });

test('measureRuntimeContent includes hoisted and nested transitive bodies, excludes consumer dev',
  async (t) => {
    const {root, put} = fixture(t, {dependencies: {a: '*'}});
    const a = put('node_modules/a', {dependencies: {'b': '*', '@scope/c': '*'},
      devDependencies: {unrelated: '*'}});
    const b = put('node_modules/b');
    const c = put('node_modules/a/node_modules/@scope/c', {exports: {import: './index.js'}});
    const unrelated = put('node_modules/unrelated');
    const initial = await measureRuntimeContent(root);
    assert(initial.dependencyFileCount > 0);
    fs.writeFileSync(path.join(b, 'index.js'), 'changed hoisted body');
    const hoisted = await measureRuntimeContent(root);
    assert.notEqual(hoisted.dependencyDigest, initial.dependencyDigest);
    fs.writeFileSync(path.join(c, 'index.js'), 'changed nested body');
    const nested = await measureRuntimeContent(root);
    assert.notEqual(nested.dependencyDigest, hoisted.dependencyDigest);
    fs.writeFileSync(path.join(unrelated, 'index.js'), 'changed development body');
    assert.deepEqual(await measureRuntimeContent(root), nested);
    assert.equal(nested.sourceDigest, initial.sourceDigest);
    assert.equal(nested.manifestDigest, initial.manifestDigest);
    assert(fs.existsSync(path.join(a, 'package.json')));
  });

test('measureRuntimeContent distinguishes duplicate installed versions and dependency edges',
  async (t) => {
    const {root, put} = fixture(t, {dependencies: {a: '*', b: '*'}});
    put('node_modules/a', {dependencies: {b: '*'}});
    put('node_modules/b');
    const nested = put('node_modules/a/node_modules/b', {version: '2.0.0'});
    const before = await measureRuntimeContent(root);
    fs.writeFileSync(path.join(nested, 'index.js'), 'different nested version body');
    assert.notEqual((await measureRuntimeContent(root)).dependencyDigest, before.dependencyDigest);
    fs.rmSync(nested, {recursive: true});
    const shared = await measureRuntimeContent(root);
    assert.notEqual(shared.dependencyDigest, before.dependencyDigest);
  });

test('measureRuntimeContent includes farther CJS candidates when nearest lacks entry or subpath',
  async (t) => {
    const {root, put} = fixture(t, {dependencies: {a: '*'}});
    const a = put('node_modules/a', {dependencies: {b: '*'}});
    const near = put('node_modules/a/node_modules/b');
    const far = put('node_modules/b');
    const fixtureRequire = createRequire(path.join(a, 'package.json'));
    fs.unlinkSync(path.join(near, 'index.js'));
    assert.equal(fixtureRequire.resolve('b'), path.join(far, 'index.js'));
    const before = await measureRuntimeContent(root);
    fs.writeFileSync(path.join(far, 'index.js'), 'changed executable far body');
    assert.notEqual((await measureRuntimeContent(root)).dependencyDigest, before.dependencyDigest);
    fs.writeFileSync(path.join(near, 'index.js'), 'nearest root entry');
    fs.writeFileSync(path.join(far, 'subpath.cjs'), 'module.exports = 1;');
    assert.equal(fixtureRequire.resolve('b/subpath.cjs'), path.join(far, 'subpath.cjs'));
    const subpathBefore = await measureRuntimeContent(root);
    fs.writeFileSync(path.join(far, 'subpath.cjs'), 'module.exports = 2;');
    assert.notEqual((await measureRuntimeContent(root)).dependencyDigest,
      subpathBefore.dependencyDigest);
  });

test('measureRuntimeContent binds resolved edges even when all measured package bytes stay equal',
  async (t) => {
    const {root, directory, put} = fixture(t, {dependencies: {a: '*', b: '*', c: '*'}});
    const a = put('node_modules/a', {dependencies: {b: '*'}});
    const b = put('node_modules/b');
    const c = put('node_modules/c', {name: 'b'}, 'different implementation');
    fs.mkdirSync(path.join(a, 'node_modules'));
    const edge = path.join(a, 'node_modules/b');
    fs.symlinkSync(b, edge);
    const before = await measureRuntimeContent(root);
    fs.unlinkSync(edge);
    fs.symlinkSync(c, edge);
    const after = await measureRuntimeContent(root);
    assert.equal(after.dependencyFileCount, before.dependencyFileCount);
    assert.notEqual(after.dependencyDigest, before.dependencyDigest);
    assert(fs.existsSync(path.join(directory, 'node_modules/b/index.js')));
  });

test('measureRuntimeContent is relocation-stable and terminates cycles and package self edges',
  async (t) => {
    const manifest = {dependencies: {a: '*', app: '*'}, exports: './index.js'};
    const first = fixture(t, manifest);
    const second = fixture(t, manifest);
    for (const f of [first, second]) {
      f.put('node_modules/a', {dependencies: {b: '*', a: '*'}, exports: './index.js'});
      f.put('node_modules/b', {dependencies: {a: '*'}});
    }
    assert.deepEqual(await measureRuntimeContent(first.root),
      await measureRuntimeContent(second.root));
  });

test('measureRuntimeContent records optional absence, then installed optional and peer bytes',
  async (t) => {
    const {root, put} = fixture(t, {
      dependencies: {[MISSING]: '*'}, optionalDependencies: {[MISSING]: '*'},
      peerDependencies: {peer: '*', optionalPeer: '*'},
      peerDependenciesMeta: {optionalPeer: {optional: true}},
    });
    const peer = put('node_modules/peer');
    const absent = await measureRuntimeContent(root);
    put(`node_modules/${MISSING}`);
    const present = await measureRuntimeContent(root);
    assert.notEqual(present.dependencyDigest, absent.dependencyDigest);
    fs.writeFileSync(path.join(peer, 'index.js'), 'changed peer bytes');
    assert.notEqual((await measureRuntimeContent(root)).dependencyDigest, present.dependencyDigest);
  });

test('measureRuntimeContent optional peer metadata never downgrades a required dependency',
  async (t) => {
    const {root} = fixture(t, {dependencies: {[MISSING]: '*'},
      peerDependencies: {[MISSING]: '*'}, peerDependenciesMeta: {[MISSING]: {optional: true}}});
    await assert.rejects(measureRuntimeContent(root), /required runtime dependency/);
  });

test('measureRuntimeContent fails for malformed or missing required package content', async (t) => {
  const {root, put} = fixture(t, {dependencies: {a: '*'}});
  const a = put('node_modules/a');
  fs.writeFileSync(path.join(a, 'package.json'), '{');
  await assert.rejects(measureRuntimeContent(root), SyntaxError);
  fs.unlinkSync(path.join(a, 'package.json'));
  await assert.rejects(measureRuntimeContent(root), {code: 'ENOENT'});
});

test('measureRuntimeContent follows dependency links and refuses broken links', async (t) => {
  const {root, directory, put} = fixture(t, {optionalDependencies: {a: '*'}});
  const actual = put('linked/a', {dependencies: {b: '*'}});
  const b = put('linked/node_modules/b');
  fs.symlinkSync(actual, path.join(directory, 'node_modules/a'));
  const before = await measureRuntimeContent(root);
  fs.writeFileSync(path.join(b, 'index.js'), 'changed target dependency');
  assert.notEqual((await measureRuntimeContent(root)).dependencyDigest, before.dependencyDigest);
  fs.rmSync(actual, {recursive: true});
  await assert.rejects(measureRuntimeContent(root), {code: 'ENOENT'});
});

test('measureRuntimeContent refuses broken node_modules and scope links, even for optional deps',
  async (t) => {
    const {root} = fixture(t, {optionalDependencies: {'@scope/a': '*'}});
    const modules = path.join(root, 'node_modules');
    fs.symlinkSync(path.join(root, 'absent'), modules);
    await assert.rejects(measureRuntimeContent(root), {code: 'ENOENT'});
    fs.unlinkSync(modules);
    fs.mkdirSync(modules);
    fs.symlinkSync(path.join(root, 'absent'), path.join(modules, '@scope'));
    await assert.rejects(measureRuntimeContent(root), {code: 'ENOENT'});
  });

test('measureRuntimeContent refuses directory cycles within a package body', async (t) => {
  const {root, put} = fixture(t, {dependencies: {a: '*'}});
  const a = put('node_modules/a');
  fs.symlinkSync(a, path.join(a, 'loop'));
  await assert.rejects(measureRuntimeContent(root), /unsupported runtime dependency layout/);
});

for (const context of ['package', 'source']) {
  test(`measureRuntimeContent traverses importer-local package manifests in ${context}`, async (t) => {
    const {root, put} = fixture(t, {dependencies: {a: '*', b: '*'}});
    const a = put('node_modules/a', {dependencies: {b: '*'}});
    put('node_modules/b');
    const relative = context === 'package' ? 'node_modules/a/lib' : 'node_modules/app/src';
    const inner = put(`${relative}/node_modules/b`,
      {main: 'index.cjs', dependencies: {c: '*'}});
    const c = put('node_modules/c');
    fs.writeFileSync(path.join(inner, 'index.cjs'), 'module.exports = require.resolve(\'c\');');
    const importer = context === 'package' ? path.join(a, 'lib') : path.join(root, 'src');
    const fixtureRequire = createRequire(path.join(importer, 'start.cjs'));
    assert.equal(fixtureRequire.resolve('b'), path.join(inner, 'index.cjs'));
    assert.equal(fixtureRequire('b'), path.join(c, 'index.js'));
    const before = await measureRuntimeContent(root);
    fs.writeFileSync(path.join(c, 'index.js'), 'changed inner-only dependency bytes');
    assert.notEqual((await measureRuntimeContent(root)).dependencyDigest, before.dependencyDigest);
  });
}

test('measureRuntimeContent hashes shipped interior loose files without treating them as absent',
  async (t) => {
    const {root, put} = fixture(t, {dependencies: {a: '*'}});
    const a = put('node_modules/a');
    const modules = path.join(a, 'test/fixtures/eval/node_modules');
    fs.mkdirSync(modules, {recursive: true});
    const file = path.join(modules, 'file1.js');
    fs.writeFileSync(file, 'module.exports = 1;');
    assert.equal(createRequire(path.join(a, 'package.json'))(file), 1);
    const before = await measureRuntimeContent(root);
    fs.writeFileSync(file, 'module.exports = 2;');
    assert.notEqual((await measureRuntimeContent(root)).dependencyDigest, before.dependencyDigest);
  });

test('measureRuntimeContent refuses interior module links that change importer lookup', async (t) => {
  const {root, put} = fixture(t, {dependencies: {a: '*'}});
  const a = put('node_modules/a', {dependencies: {b: '*'}});
  put('node_modules/a/node_modules/b');
  const external = put('external/shared');
  const b = put('external/shared/node_modules/b');
  fs.writeFileSync(path.join(external, 'start.cjs'), 'module.exports = require.resolve(\'b\');');
  fs.symlinkSync(path.join(external, 'start.cjs'), path.join(a, 'start.cjs'));
  const fixtureRequire = createRequire(path.join(a, 'package.json'));
  assert.equal(fixtureRequire('./start.cjs'), path.join(b, 'index.js'));
  await assert.rejects(measureRuntimeContent(root), /unsupported runtime dependency layout/);
});

test('measureRuntimeContent refuses interior source links in absent-lock installations', async (t) => {
  const {root, put} = fixture(t);
  const external = put('external');
  fs.symlinkSync(path.join(external, 'index.js'), path.join(root, 'src/linked.js'));
  await assert.rejects(measureRuntimeContent(root), /unsupported runtime dependency layout/);
});

test('measureRuntimeContent does not select absent-lock mode for invalid or dangling locks',
  async (t) => {
    const {root} = fixture(t);
    const lock = path.join(root, 'package-lock.json');
    fs.writeFileSync(lock, '{');
    await assert.rejects(measureRuntimeContent(root), SyntaxError);
    fs.unlinkSync(lock);
    fs.symlinkSync(path.join(root, 'absent'), lock);
    await assert.rejects(measureRuntimeContent(root), {code: 'ENOENT'});
  });

test('measureRuntimeContent measures optional CommonJS NODE_PATH packages', (t) => {
  const {root, directory, put} = fixture(t, {optionalDependencies: {a: '*'}});
  const a = put('global/a');
  const env = {NODE_PATH: path.join(directory, 'global')};
  const before = childMeasurement(root, {env});
  assert.equal(before.status, 0, before.stderr);
  fs.writeFileSync(path.join(a, 'index.js'), 'changed global body');
  const after = childMeasurement(root, {env});
  assert.equal(after.status, 0, after.stderr);
  assert.notEqual(JSON.parse(after.stdout).dependencyDigest,
    JSON.parse(before.stdout).dependencyDigest);
});

test('measureRuntimeContent refuses loose CommonJS fallback files instead of optional absence',
  (t) => {
    const {root, directory} = fixture(t, {optionalDependencies: {a: '*'}});
    const global = path.join(directory, 'global');
    fs.mkdirSync(global);
    fs.writeFileSync(path.join(global, 'a.js'), 'module.exports = 1;');
    const result = childMeasurement(root, {env: {NODE_PATH: global}});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /file-backed runtime dependency/);
  });

test('measureRuntimeContent refuses symlink-preserving modes with conflicting lexical dependencies',
  (t) => {
    const {root, directory, put} = fixture(t, {dependencies: {a: '*'}});
    const actual = put('linked/a', {dependencies: {b: '*'}});
    put('linked/node_modules/b', {}, 'realpath bytes');
    put('node_modules/b', {}, 'lexical bytes');
    fs.symlinkSync(actual, path.join(directory, 'node_modules/a'));
    for (const flag of ['--preserve-symlinks', '--preserve-symlinks-main',
      '--preserve_symlinks', '--preserve_symlinks_main', '--preserve-symlinks_main']) {
      for (const options of [{args: [flag]}, {env: {NODE_OPTIONS: flag}}]) {
        const result = childMeasurement(root, options);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /symlink-preserving runtime/);
      }
    }
  });
