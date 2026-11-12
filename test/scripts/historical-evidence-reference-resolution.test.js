import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {RELOCATION} from '../../scripts/solve/evidence-store.js';
import {readVerifiedRelocationCatalog, requiredArtifacts} from '../../scripts/solve/relocation-records.js';
import {validateDocumentationCurrentState} from '../../scripts/check-documentation-current-state.js';
import {greenRepository, write, editJson, evidence, sha, SHARD, OLD_ROOT} from './historical-evidence-custody-fixture.js';

const baseline = JSON.parse(fs.readFileSync(
  path.join(import.meta.dirname, 'historical-evidence-catalog-baseline.json'), 'utf8'));

test('unchanged historical citation resolves verified retained bytes', (t) => {
  const root = greenRepository(t, {files: [['superseded.md', 'historical design']]});
  write(root, 'solve/epics/history.md',
    `[Original](/${OLD_ROOT}superseded.md)\n`);
  const result = validateDocumentationCurrentState(root);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.retained[0].target, `${OLD_ROOT}superseded.md`);
  assert.equal(result.retained[0].sourceCommit, 'a'.repeat(40));
});

function catalog(root) {
  return readVerifiedRelocationCatalog(root, requiredArtifacts(root));
}

function historicalReference(root, target = `${OLD_ROOT}superseded.md`) {
  write(root, 'models/example.md', `[Original](/${target})\n\n\`${target}\`\n`);
}

test('Markdown and repository paths share member provenance', (t) => {
  const root = greenRepository(t, {files: [['superseded.md', 'history']]});
  historicalReference(root);
  const result = validateDocumentationCurrentState(root);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.retained.length, 2);
  assert.deepEqual(result.retained[0].sha256, result.retained[1].sha256);
  assert.equal(result.retained[0].url, result.retained[1].url);
  assert.equal(result.retained[0].bytes, 7);
});

const corruptions = [
  ['duplicate verification', RELOCATION.VERIFICATION_FILE, (v) => v.bundles.push(v.bundles[0])],
  ['extra verification', RELOCATION.VERIFICATION_FILE,
    (v) => v.bundles.push({...v.bundles[0], bundle: 'other.tar.gz'})],
  ['source identity', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].sourceCommit = 'b'.repeat(40)],
  ['URL identity', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].url += 'other'],
  ['shard identity', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].shard += 'other'],
  ['bundle identity', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].bundleSha256 = sha('other')],
  ['download digest', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].downloadedSha256 = sha('bad')],
  ['member count', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].members += 1],
  ['result count', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].results += '1'],
  ['result mismatch', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].results = '0'],
  ['manifest approval', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].manifestMatches = false],
  ['extraction approval', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].extracted = false],
  ['unexpected member', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].unexpectedMembers = ['x']],
  ['mismatch member', RELOCATION.VERIFICATION_FILE, (v) => v.bundles[0].mismatches = ['x']],
  ['duplicate inventory', RELOCATION.INVENTORY_FILE, (v) => v.bundles.push(v.bundles[0])],
  ['escaping shard', RELOCATION.INVENTORY_FILE, (v) => v.bundles[0].shard = '../outside.json'],
  ['escaping root', RELOCATION.INVENTORY_FILE, (v) => v.bundles[0].root = '../solve/'],
  ['header source', SHARD, (v) => v.sourceCommit = 'b'.repeat(40)],
  ['header bundle', SHARD, (v) => v.bundle += 'other'],
  ['header URL', SHARD, (v) => v.url += 'other'],
  ['member digest', SHARD, (v) => v.files[0][1] = 'bad'],
  ['member size', SHARD, (v) => v.files[0][2] = -1],
  ['escaping member', SHARD, (v) => v.files[0][0] = '../../outside.md'],
];

for (const [name, file, corrupt] of corruptions) {
  test(`invalid custody is explicit: ${name}`, (t) => {
    const root = greenRepository(t, {files: [['superseded.md', 'history']]});
    historicalReference(root);
    editJson(root, evidence(file), corrupt);
    const result = validateDocumentationCurrentState(root);
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /invalid-custody/u);
    assert.equal(result.retained.length, 0);
  });
}

test('missing records and changed shard bytes are refused', (t) => {
  for (const file of [SHARD, RELOCATION.VERIFICATION_FILE]) {
    const root = greenRepository(t);
    fs.rmSync(path.join(root, evidence(file)));
    assert.ok(catalog(root).problems.length > 0);
  }
  const root = greenRepository(t);
  fs.appendFileSync(path.join(root, evidence(SHARD)), ' ');
  assert.ok(catalog(root).problems.length > 0);
});

test('identical duplicate paths across homes are ambiguous', (t) => {
  const root = greenRepository(t, {files: [['superseded.md', 'history']]});
  historicalReference(root);
  const original = path.dirname(evidence(RELOCATION.INVENTORY_FILE));
  fs.cpSync(path.join(root, original), path.join(root, RELOCATION.RECORDS_DIR, 'other'),
    {recursive: true});
  const result = validateDocumentationCurrentState(root);
  assert.match(result.errors.join('\n'), /ambiguous-custody/u);
  assert.equal(result.retained.length, 0);
});

test('protected proof, Quest/log and relocation records cannot be retained targets', (t) => {
  for (const target of ['log.ndjson', 'quest.json', 'receipt.json']) {
    const root = greenRepository(t, {files: [[target, 'protected']]});
    assert.ok(catalog(root).problems.length > 0, target);
  }
  const root = greenRepository(t);
  editJson(root, evidence(RELOCATION.INVENTORY_FILE), (v) => {
    v.bundles[0].root = `${RELOCATION.RECORDS_DIR}/`;
  });
  editJson(root, evidence(SHARD), (v) => v.root = `${RELOCATION.RECORDS_DIR}/`);
  assert.ok(catalog(root).problems.length > 0);
});

test('current, steering and compatibility guidance requires live targets', (t) => {
  for (const documentClass of ['current', 'steering', 'compatibility']) {
    const root = greenRepository(t, {files: [['superseded.md', 'history']]});
    write(root, 'docs/guide.md', `---\ndocumentClass: ${documentClass}\n---\n` +
      `[Original](/${OLD_ROOT}superseded.md)\n\`${OLD_ROOT}superseded.md\`\n`);
    const result = validateDocumentationCurrentState(root);
    assert.equal(result.ok, false);
    assert.equal(result.retained.length, 0);
    write(root, `${OLD_ROOT}superseded.md`, 'history');
    assert.equal(validateDocumentationCurrentState(root).ok, true);
  }
});

test('escaping record-home and shard symlinks are refused before reads', (t) => {
  const root = greenRepository(t);
  const outside = fs.mkdtempSync(path.join(path.dirname(root), 'custody-outside-'));
  t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
  fs.symlinkSync(outside, path.join(root, RELOCATION.RECORDS_DIR, 'escape'));
  assert.ok(catalog(root).problems.length > 0);
});

function assertBaselineCoverage(result) {
  for (const home of baseline.homes) {
    assert.ok(result.homes.some((file) => file.endsWith(`/${home}`)), home);
  }
  const bundles = new Set(baseline.bundles);
  const members = [...result.members.values()].filter((file) => bundles.has(file.bundle));
  const identities = members.map((file) => [file.path, file.sha256, file.bytes,
    file.bundle, file.bundleSha256, file.sourceCommit]);
  identities.sort((left, right) => left[0].localeCompare(right[0]));
  assert.equal(members.length, baseline.members);
  assert.equal(sha(JSON.stringify(identities)), baseline.memberIdentitySha256);
}

test('named baseline catalogs retain their original member identities', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const result = catalog(root);
  assert.deepEqual(result.problems, []);
  assertBaselineCoverage(result);
  for (const file of result.members.values()) {
    assert.match(file.sourceCommit, /^[0-9a-f]{40}$/u);
    assert.match(file.sha256, /^[0-9a-f]{64}$/u);
  }
});

function sealShard(root) {
  const digest = sha(fs.readFileSync(path.join(root, evidence(SHARD))));
  editJson(root, evidence(RELOCATION.VERIFICATION_FILE), (v) => {
    v.bundles[0].shardSha256 = digest;
  });
}

test('protected record and proof controls have otherwise valid custody', (t) => {
  for (const oldPath of [`${OLD_ROOT}receipt.json`, `${OLD_ROOT}log.ndjson`,
    `${OLD_ROOT}quest.json`, `${RELOCATION.RECORDS_DIR}/other/record.json`]) {
    const root = greenRepository(t, {files: [['superseded.md', 'history']]});
    editJson(root, evidence(RELOCATION.INVENTORY_FILE), (v) => v.bundles[0].root = '');
    editJson(root, evidence(SHARD), (v) => {
      v.root = '';
      v.files[0][0] = oldPath;
    });
    sealShard(root);
    const result = catalog(root);
    assert.deepEqual(result.problems, [`${oldPath}: inventoried path is protected`]);
    assert.equal(result.members.size, 0);
  }
});

test('unchanged missing citation has no unrecorded substitute', (t) => {
  const root = greenRepository(t);
  historicalReference(root);
  const result = validateDocumentationCurrentState(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing/u);
  assert.equal(result.retained.length, 0);
});

test('shard shape controls remain invalid after sealing their changed bytes', (t) => {
  for (const [name, change] of [
    ['digest', (v) => v.files[0][1] = 'bad'],
    ['size', (v) => v.files[0][2] = -1],
    ['member escape', (v) => v.files[0][0] = '../../outside.md'],
    ['non-solve', (v) => {
      v.root = '';
      v.files[0][0] = 'docs/history.md';
    }],
  ]) {
    const root = greenRepository(t, {files: [['superseded.md', 'history']]});
    editJson(root, evidence(SHARD), change);
    if (name === 'non-solve') {
      editJson(root, evidence(RELOCATION.INVENTORY_FILE), (v) => v.bundles[0].root = '');
    }
    sealShard(root);
    assert.ok(catalog(root).problems.length > 0, name);
    assert.equal(catalog(root).members.size, 0, name);
  }
});

test('shard and absent member ancestors cannot traverse external symlinks', (t) => {
  for (const kind of ['shard', 'member']) {
    const root = greenRepository(t, {files: [['superseded.md', 'history']]});
    const outside = fs.mkdtempSync(path.join(path.dirname(root), 'custody-external-'));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    if (kind === 'shard') {
      const file = path.join(root, evidence(SHARD));
      const external = path.join(outside, 'shard.json');
      fs.copyFileSync(file, external);
      fs.rmSync(file);
      fs.symlinkSync(external, file);
    } else {
      fs.symlinkSync(outside, path.join(root, OLD_ROOT, 'external'));
      editJson(root, evidence(SHARD), (v) => v.files[0][0] = 'external/missing.md');
      sealShard(root);
    }
    assert.ok(catalog(root).problems.some((problem) => /escapes/u.test(problem)), kind);
    assert.equal(catalog(root).members.size, 0);
  }
});

test('verification approval and missing inventory are explicit failures', (t) => {
  const root = greenRepository(t);
  editJson(root, evidence(RELOCATION.VERIFICATION_FILE), (v) => v.bundles[0].verified = false);
  assert.ok(catalog(root).problems.length > 0);
  const absent = greenRepository(t);
  fs.rmSync(path.join(absent, evidence(RELOCATION.INVENTORY_FILE)));
  assert.ok(catalog(absent).problems.length > 0);
});


test('dangling and cyclic member symlinks refuse custody explicitly', (t) => {
  for (const target of ['missing-outside', 'loop']) {
    const root = greenRepository(t, {files: [['superseded.md', 'history']]});
    const link = path.join(root, OLD_ROOT, 'unsafe');
    fs.symlinkSync(target === 'loop' ? 'unsafe' : path.join(root, '..', target), link);
    editJson(root, evidence(SHARD), (v) => v.files[0][0] = 'unsafe/missing.md');
    sealShard(root);
    const result = catalog(root);
    assert.ok(result.problems.length > 0, target);
    assert.equal(result.members.size, 0, target);
  }
});


test('parsed custody does not inherit absent approval from object pollution', (t) => {
  const root = greenRepository(t);
  editJson(root, evidence(RELOCATION.VERIFICATION_FILE), (v) => delete v.bundles[0].verified);
  // eslint-disable-next-line no-extend-native -- adversarial fixture restored in finally
  Object.defineProperty(Object.prototype, 'verified', {value: true, configurable: true});
  try {
    assert.ok(catalog(root).problems.length > 0);
  } finally {
    delete Object.prototype.verified;
  }
});

test('record guards retain captured array and regexp intrinsics', (t) => {
  const root = greenRepository(t);
  editJson(root, evidence(RELOCATION.VERIFICATION_FILE), (v) => v.bundles[0].verified = false);
  const every = Array.prototype.every;
  const testPattern = RegExp.prototype.test;
  let result;
  try {
    // eslint-disable-next-line no-extend-native -- adversarial fixture restored in finally
    Array.prototype.every = () => true;
    // eslint-disable-next-line no-extend-native -- adversarial fixture restored in finally
    RegExp.prototype.test = () => true;
    result = readVerifiedRelocationCatalog(root);
  } finally {
    // eslint-disable-next-line no-extend-native -- adversarial fixture restored in finally
    Array.prototype.every = every;
    // eslint-disable-next-line no-extend-native -- adversarial fixture restored in finally
    RegExp.prototype.test = testPattern;
  }
  assert.ok(result.problems.length > 0);
  assert.equal(result.members.size, 0);
});


test('failed shard cannot verify omitted digest or allocate an asserted member count', (t) => {
  const root = greenRepository(t);
  editJson(root, evidence(RELOCATION.INVENTORY_FILE), (v) => {
    v.bundles[0].files = Number.MAX_SAFE_INTEGER;
  });
  editJson(root, evidence(RELOCATION.VERIFICATION_FILE), (v) => {
    delete v.bundles[0].shardSha256;
    v.bundles[0].members = Number.MAX_SAFE_INTEGER;
    v.bundles[0].results = '';
  });
  fs.rmSync(path.join(root, evidence(SHARD)));
  const result = catalog(root);
  assert.ok(result.problems.length > 0);
  assert.equal(result.members.size, 0);
});

test('non-directory record home refuses custody explicitly', (t) => {
  const root = greenRepository(t);
  const home = path.join(root, RELOCATION.RECORDS_DIR);
  fs.rmSync(home, {recursive: true});
  fs.writeFileSync(home, 'not a directory');
  const result = catalog(root);
  assert.ok(result.problems.length > 0);
  assert.equal(result.members.size, 0);
});

test('unreadable record home refuses then recovers on the next invocation', (t) => {
  const root = greenRepository(t);
  const home = path.join(root, RELOCATION.RECORDS_DIR);
  fs.chmodSync(home, 0o000);
  try {
    const result = catalog(root);
    assert.ok(result.problems.length > 0);
    assert.equal(result.members.size, 0);
  } finally {
    fs.chmodSync(home, 0o755);
  }
  assert.deepEqual(catalog(root).problems, []);
  assert.equal(catalog(root).members.size, 2);
});


test('a valid new home adds three members without replacing named baseline coverage', (t) => {
  const root = greenRepository(t, {files: [['one.md', '1'], ['two.md', '2'], ['three.md', '3']]});
  const home = path.join(root, RELOCATION.RECORDS_DIR);
  const initial = path.dirname(path.join(root, evidence(RELOCATION.INVENTORY_FILE)));
  fs.renameSync(initial, path.join(home, 'new-valid-home'));
  const realRoot = path.resolve(import.meta.dirname, '../..');
  fs.cpSync(path.join(realRoot, RELOCATION.RECORDS_DIR), home, {recursive: true});
  const result = catalog(root);
  assert.deepEqual(result.problems, []);
  assertBaselineCoverage(result);
  for (const name of ['one.md', 'two.md', 'three.md']) {
    assert.equal(result.members.get(`${OLD_ROOT}${name}`).bytes, 1);
  }
  const newHome = path.join(home, 'new-valid-home');
  fs.cpSync(newHome, path.join(home, 'colliding-home'), {recursive: true});
  const collision = catalog(root);
  assert.equal(collision.ambiguous, true);
  assert.equal(collision.members.size, 0);
});
