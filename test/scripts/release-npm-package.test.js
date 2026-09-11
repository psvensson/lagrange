import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chmod, copyFile, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile}
  from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {replacePrototypeProperty, withHostileIntrinsics} from '../helpers/hostile-intrinsics.js';
import {
  authorizeHandoffPublication,
  createHandoff,
  publicAssetPaths,
  verifyHandoff,
  verifyHandoffImage,
} from '../../scripts/release-artifact-handoff.js';

import {
  RELEASE_OUTCOME,
  classifyRegistryState,
  normalizeRepositoryUrl,
} from '../../scripts/release-npm-package.js';

const VERSION = '0.1.0';
const INTEGRITY = 'sha512-candidate';
const GIT_HEAD = '0123456789012345678901234567890123456789';
const REPOSITORY_URL = 'https://github.com/psvensson/lagrange';
const IMAGE_REPOSITORY = 'docker.io/psvensson/lagrange';
const IMAGE_ID = `sha256:${'a'.repeat(64)}`;
const EXECUTABLE_MODE = 0o755;
const DATA_MODE = 0o644;
const MODE_MASK = 0o777;
const HANDOFF_NAMES = [
  'lagrange', 'lagrange-cli', `lagrange-node-${VERSION}.tgz`, `lagrange-server-${VERSION}.tgz`,
  'release-image.tar', 'release-notes.md', 'dockerhub-overview.md',
];

async function handoffFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'release-handoff-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const sourceDirectory = join(root, 'source');
  const directory = join(root, 'download');
  await mkdir(sourceDirectory);
  await mkdir(directory);
  for (const name of HANDOFF_NAMES) await writeFile(join(sourceDirectory, name), `bytes:${name}`);
  const identity = {
    repository: 'psvensson/lagrange',
    workflow: 'psvensson/lagrange/.github/workflows/release.yml@refs/tags/v0.1.0',
    runId: '123', producerAttempt: '1', tag: `v${VERSION}`, commit: GIT_HEAD,
    version: VERSION, buildDate: '2026-09-11T00:00:00Z',
  };
  const {manifest, manifestSha256} = await createHandoff({sourceDirectory, directory, identity,
    imageRepository: IMAGE_REPOSITORY, imageId: IMAGE_ID});
  const expected = {...identity, imageRepository: IMAGE_REPOSITORY};
  return {directory, sourceDirectory, identity, manifest, manifestSha256, expected};
}

async function replaceManifest(fixture, mutate) {
  const manifest = structuredClone(fixture.manifest);
  mutate(manifest);
  const bytes = `${JSON.stringify(manifest)}\n`;
  await writeFile(join(fixture.directory, 'release-handoff.json'), bytes);
  return {...fixture, manifestSha256: createHash('sha256').update(bytes).digest('hex')};
}

async function withReplacedIntrinsic(target, key, replacement, callback) {
  const restore = replacePrototypeProperty(target, key, replacement);
  try {
    return await callback();
  } finally {
    restore();
  }
}

async function hostedCliFixture(t) {
  const fixture = await handoffFixture(t);
  const cliDirectory = join(fixture.directory, '..', 'cli');
  await mkdir(join(cliDirectory, 'scripts'), {recursive: true});
  await mkdir(join(cliDirectory, 'src', 'utils'), {recursive: true});
  await writeFile(join(cliDirectory, 'package.json'), '{"type":"module"}');
  for (const name of ['scripts/release-artifact-handoff.js', 'scripts/action-authority.js',
    'src/utils/canonical-json-data.js', 'src/utils/strict-own-data.js']) {
    await copyFile(new URL(`../../${name}`, import.meta.url), join(cliDirectory, name));
  }
  const identity = fixture.manifest.identity;
  const env = {PATH: `${cliDirectory}:${process.env.PATH}`, GITHUB_REPOSITORY: identity.repository,
    GITHUB_WORKFLOW_REF: identity.workflow, GITHUB_RUN_ID: identity.runId,
    GITHUB_RUN_ATTEMPT: '2', GITHUB_REF_NAME: identity.tag, GITHUB_SHA: identity.commit,
    RELEASE_VERSION: identity.version, DOCKERHUB_IMAGE: IMAGE_REPOSITORY,
    RELEASE_HANDOFF_SHA256: fixture.manifestSha256};
  const run = (command, overrides = {}) => spawnSync(process.execPath,
    [join(cliDirectory, 'scripts', 'release-artifact-handoff.js'), command, fixture.directory],
    {cwd: cliDirectory, env: {...env, ...overrides}, encoding: 'utf8'});
  return {...fixture, cliDirectory, run};
}

async function authorizingCliFixture(t) {
  const fixture = await hostedCliFixture(t);
  const {cliDirectory} = fixture;
  const dockerTrace = join(cliDirectory, 'docker-trace.json');
  const actionTrace = join(cliDirectory, 'action-trace.ndjson');
  const inspectionFile = join(cliDirectory, 'inspection.json');
  await writeFile(actionTrace, '');
  await copyFile(join(cliDirectory, 'scripts', 'action-authority.js'),
    join(cliDirectory, 'scripts', 'action-authority-real.js'));
  await writeFile(join(cliDirectory, 'scripts', 'action-authority.js'), `
import {appendFileSync} from 'node:fs';
import {authorizeAction as decide} from './action-authority-real.js';
export {ACTION, isAuthorized} from './action-authority-real.js';
export function authorizeAction(request) {
  appendFileSync(process.env.ACTION_TRACE, JSON.stringify(request) + '\\n');
  return decide(request);
}
`);
  await writeFile(join(cliDirectory, 'docker.mjs'), `
import {readFileSync, writeFileSync} from 'node:fs';
writeFileSync(process.env.DOCKER_TRACE, JSON.stringify(process.argv.slice(2)));
process.stdout.write(readFileSync(process.env.DOCKER_INSPECTION, 'utf8'));
`);
  // Keep the fake's module kind explicit under the canonical Node 22 TAP
  // loader too; an extensionless ESM script can enter require(esm) cycles.
  await writeFile(join(cliDirectory, 'docker'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(cliDirectory, 'docker.mjs')}" "$@"\n`,
    {mode: EXECUTABLE_MODE});
  const runAuthorize = async (inspections) => {
    await writeFile(inspectionFile, JSON.stringify(inspections));
    await writeFile(actionTrace, '');
    return fixture.run('authorize', {DOCKER_TRACE: dockerTrace,
      DOCKER_INSPECTION: inspectionFile, ACTION_TRACE: actionTrace});
  };
  return {...fixture, dockerTrace, actionTrace, runAuthorize};
}

describe('release artifact producer/publisher handoff', () => {
  it('restores canonical modes and emits checksums usable beside public assets', async (t) => {
    const fixture = await handoffFixture(t);
    for (const name of HANDOFF_NAMES) await chmod(join(fixture.directory, name), DATA_MODE);
    const result = await verifyHandoff(fixture);
    assert.equal(result.identity.commit, GIT_HEAD);
    for (const file of result.files) {
      const expectedMode = ['lagrange', 'lagrange-cli'].includes(file.name) ?
        EXECUTABLE_MODE : DATA_MODE;
      const stat = await lstat(join(fixture.directory, file.name));
      assert.equal(stat.mode & MODE_MASK, expectedMode);
    }
    const checksum = spawnSync('sha256sum', ['--strict', '--check', 'SHA256SUMS'], {
      cwd: fixture.directory, encoding: 'utf8',
    });
    assert.equal(checksum.status, 0, checksum.stderr);
    const text = await readFile(join(fixture.directory, 'SHA256SUMS'), 'utf8');
    assert.doesNotMatch(text, /dist\/|npm\/|release-image|release-notes/u);
    assert.equal(text.trim().split('\n').length, 4);
    assert.deepEqual(publicAssetPaths(fixture.directory, result),
      [...HANDOFF_NAMES.slice(0, 4), 'SHA256SUMS'].map((name) => join(fixture.directory, name)));
  });

  it('accepts a publisher-only retry but rejects another run, repository, workflow, tag or commit',
    async (t) => {
      const fixture = await handoffFixture(t);
      await verifyHandoff({...fixture, expected: {...fixture.expected, producerAttempt: '2'}});
      for (const key of ['repository', 'workflow', 'runId', 'tag', 'commit', 'version', 'imageRepository']) {
        await assert.rejects(verifyHandoff({...fixture,
          expected: {...fixture.expected, [key]: 'different'}}), /RELEASE_HANDOFF_INVALID/u);
      }
    });

  it('runs the real hosted CLI with only its local owner and builtins installed', async (t) => {
    const fixture = await hostedCliFixture(t);
    const {run} = fixture;
    const verified = run('verify');
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(verified.stdout, 'RELEASE_HANDOFF_VERIFIED\n');
    const assets = run('public-assets');
    assert.equal(assets.status, 0, assets.stderr);
    assert.deepEqual(assets.stdout.trim().split('\n'), publicAssetPaths(fixture.directory,
      fixture.manifest));
    const refused = run('verify', {GITHUB_SHA: 'f'.repeat(40)});
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /identity mismatch: commit/u);
  });

  it('rejects a substituted manifest digest before trusting its contents', async (t) => {
    const fixture = await handoffFixture(t);
    await assert.rejects(verifyHandoff({...fixture, manifestSha256: 'f'.repeat(64)}),
      /manifest digest mismatch/u);
    await assert.rejects(verifyHandoff({...fixture, manifestSha256: ''}), /manifest digest/u);
  });

  it('binds real authorize CLI inspection and every registered action-owner ask', async (t) => {
    const fixture = await authorizingCliFixture(t);
    const image = {Id: IMAGE_ID, Config: {Labels: fixture.manifest.image.labels}};
    const result = await fixture.runAuthorize([image, image]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(fixture.dockerTrace, 'utf8')),
      ['image', 'inspect', `${IMAGE_REPOSITORY}:${VERSION}`, `${IMAGE_REPOSITORY}:latest`]);
    const decisions = (await readFile(fixture.actionTrace, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(decisions.map(({action}) => action),
      ['publish-container-image', 'publish-container-image', 'create-public-release']);
    assert.deepEqual(decisions.map(({signal, context}) => [signal.tag, context.tag]), [
      [`${IMAGE_REPOSITORY}:${VERSION}`, `${IMAGE_REPOSITORY}:${VERSION}`],
      [`${IMAGE_REPOSITORY}:latest`, `${IMAGE_REPOSITORY}:latest`], [`v${VERSION}`, `v${VERSION}`],
    ]);
  });

  it('real authorize CLI refuses a wrong second image or label before asking action owners', async (t) => {
    const fixture = await authorizingCliFixture(t);
    const image = {Id: IMAGE_ID, Config: {Labels: fixture.manifest.image.labels}};
    const wrong = [[], [image, {...image, Id: 'wrong'}]];
    for (const key of Object.keys(image.Config.Labels)) {
      const other = structuredClone(image);
      other.Config.Labels[key] = 'wrong';
      wrong.push([image, other]);
    }
    for (const inspections of wrong) {
      const result = await fixture.runAuthorize(inspections);
      assert.notEqual(result.status, 0, 'invalid inspected image must refuse');
      assert.match(result.stderr, /RELEASE_HANDOFF_INVALID/u);
      assert.equal(await readFile(fixture.actionTrace, 'utf8'), '');
    }
  });

  it('rejects every corrupted payload, checksum, and unlisted file', async (t) => {
    const fixture = await handoffFixture(t);
    for (const name of [...HANDOFF_NAMES, 'SHA256SUMS']) {
      const path = join(fixture.directory, name);
      const original = await readFile(path);
      await writeFile(path, 'substituted');
      await assert.rejects(verifyHandoff(fixture), /file mismatch/u);
      await writeFile(path, original);
    }
    await writeFile(join(fixture.directory, 'extra'), 'unlisted');
    await assert.rejects(verifyHandoff(fixture), /unexpected or missing/u);
  });

  it('rejects missing files, symlinks, directories and hardlinks', async (t) => {
    const fixture = await handoffFixture(t);
    const file = join(fixture.directory, 'lagrange');
    const target = join(fixture.directory, 'lagrange-cli');
    await rm(file);
    await assert.rejects(verifyHandoff(fixture), /unexpected or missing/u);
    await symlink(target, file);
    await assert.rejects(verifyHandoff(fixture), /regular file/u);
    await rm(file);
    await mkdir(file);
    await assert.rejects(verifyHandoff(fixture), /regular file/u);
    await rm(file, {recursive: true});
    await link(target, file);
    await assert.rejects(verifyHandoff(fixture), /regular file/u);
  });

  it('rejects malformed manifests even when their raw-byte digest matches', async (t) => {
    const fixture = await handoffFixture(t);
    for (const mutate of [
      (manifest) => manifest.files.pop(),
      (manifest) => manifest.files.push(manifest.files[0]),
      (manifest) => manifest.files[0].name = '../escape',
      (manifest) => manifest.files[0].size = -1,
      (manifest) => manifest.files[0].mode = 0o777,
      (manifest) => manifest.extra = true,
      (manifest) => manifest.identity.producerAttempt = '',
    ]) {
      await assert.rejects(verifyHandoff(await replaceManifest(fixture, mutate)),
        /RELEASE_HANDOFF_INVALID/u);
    }
  });

  it('binds loaded version/latest references to the producer image ID and every OCI label', async (t) => {
    const {manifest} = await handoffFixture(t);
    const image = {Id: IMAGE_ID, Config: {Labels: manifest.image.labels}};
    verifyHandoffImage(manifest, [image, structuredClone(image)]);
    assert.throws(() => verifyHandoffImage(manifest, []), /inspection count/u);
    assert.throws(() => verifyHandoffImage(manifest, [image, {...image, Id: 'wrong'}]), /image id/u);
    for (const key of Object.keys(manifest.image.labels)) {
      const other = structuredClone(image);
      other.Config.Labels[key] = 'wrong';
      assert.throws(() => verifyHandoffImage(manifest, [image, other]), /image label/u);
    }
  });

  it('refuses inherited and accessor image authority without invoking getters', async (t) => {
    const {manifest} = await handoffFixture(t);
    const image = {Id: IMAGE_ID, Config: {Labels: manifest.image.labels}};
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'Id', {get() {
      getterCalls += 1;
      return IMAGE_ID;
    }});
    const candidates = [
      Object.create(image), accessor, null,
      {Id: IMAGE_ID, Config: Object.create(image.Config)},
      {Id: IMAGE_ID, Config: {Labels: Object.create(manifest.image.labels)}},
    ];
    for (const candidate of candidates) {
      assert.throws(() => verifyHandoffImage(manifest, [image, candidate]),
        /RELEASE_HANDOFF_INVALID/u);
    }
    assert.equal(getterCalls, 0);
  });

  it('asks registered outward-action owners with event intent and independent artifact context',
    async (t) => {
      const {manifest} = await handoffFixture(t);
      const signal = {tag: `v${VERSION}`, imageRepository: IMAGE_REPOSITORY};
      const decisions = authorizeHandoffPublication(manifest, signal);
      assert.deepEqual(decisions.map(({action}) => action), [
        'publish-container-image', 'publish-container-image', 'create-public-release',
      ]);
      assert.ok(decisions.every(({outcome}) => outcome === 'authorized'));
      assert.throws(() => authorizeHandoffPublication(manifest, {...signal, tag: 'v9.9.9'}),
        /authorization refused/u);
      assert.throws(() => authorizeHandoffPublication(manifest, {...signal, imageRepository: 'foreign'}),
        /authorization refused/u);
    });

  it('cannot skip outward authorization through a replaced array mapper', async (t) => {
    const {manifest} = await handoffFixture(t);
    const originalMap = Array.prototype.map;
    withHostileIntrinsics([
      replacePrototypeProperty(Array.prototype, 'map', function map(callback, thisArg) {
        if (this[0]?.action === 'publish-container-image') return [];
        return Reflect.apply(originalMap, this, [callback, thisArg]);
      }),
    ], () => {
      assert.throws(() => authorizeHandoffPublication(manifest,
        {tag: 'v9.9.9', imageRepository: IMAGE_REPOSITORY}), /authorization refused/u);
    });
  });

  it('cannot skip OCI labels through replaced key enumeration', async (t) => {
    const {manifest} = await handoffFixture(t);
    const image = {Id: IMAGE_ID, Config: {Labels: {}}};
    const originalEntries = Object.entries;
    withHostileIntrinsics([
      replacePrototypeProperty(Object, 'entries', (value) =>
        value === manifest.image.labels ? [] : originalEntries(value)),
    ], () => {
      assert.throws(() => verifyHandoffImage(manifest, [image, image]),
        /RELEASE_HANDOFF_INVALID/u);
    });
  });

  it('cannot skip the second image through a replaced array iterator', async (t) => {
    const {manifest} = await handoffFixture(t);
    const image = {Id: IMAGE_ID, Config: {Labels: manifest.image.labels}};
    const inspections = [image, {...image, Id: 'wrong'}];
    const originalIterator = Array.prototype[Symbol.iterator];
    withHostileIntrinsics([
      replacePrototypeProperty(Array.prototype, Symbol.iterator, function iterator() {
        return Reflect.apply(originalIterator, this === inspections ? [image] : this, []);
      }),
    ], () => {
      assert.throws(() => verifyHandoffImage(manifest, inspections), /RELEASE_HANDOFF_INVALID/u);
    });
  });

  it('binds raw manifest bytes despite a replaced JSON parser', async (t) => {
    const fixture = await handoffFixture(t);
    const bytes = '{}\n';
    await writeFile(join(fixture.directory, 'release-handoff.json'), bytes);
    const manifestSha256 = createHash('sha256').update(bytes).digest('hex');
    const originalParse = JSON.parse;
    await withReplacedIntrinsic(JSON, 'parse', (text) =>
      text === bytes ? fixture.manifest : originalParse(text), async () => {
      await assert.rejects(verifyHandoff({...fixture, manifestSha256}),
        {code: 'RELEASE_HANDOFF_INVALID'});
    });
  });

  it('rejects extra shape fields despite replaced object enumeration', async (t) => {
    const fixture = await handoffFixture(t);
    const extra = await replaceManifest(fixture, (manifest) => manifest.extra = true);
    const originalKeys = Object.keys;
    await withReplacedIntrinsic(Object, 'keys', (value) =>
      originalKeys(value).filter((key) => key !== 'extra'), async () => {
      await assert.rejects(verifyHandoff(extra), {code: 'RELEASE_HANDOFF_INVALID'});
    });
  });

  it('refuses accessors despite replaced descriptor inspection', async (t) => {
    const {manifest} = await handoffFixture(t);
    let getterCalls = 0;
    const image = {get Id() {
      getterCalls += 1;
      return IMAGE_ID;
    }, Config: {Labels: manifest.image.labels}};
    const originalDescriptor = Object.getOwnPropertyDescriptor;
    withHostileIntrinsics([
      replacePrototypeProperty(Object, 'getOwnPropertyDescriptor', (value, key) => {
        const descriptor = originalDescriptor(value, key);
        return descriptor?.get ? {value: value[key], enumerable: true} : descriptor;
      }),
    ], () => {
      assert.throws(() => verifyHandoffImage(manifest, [image, image]),
        {code: 'RELEASE_HANDOFF_INVALID'});
    });
    assert.equal(getterCalls, 0);
  });

  it('rejects invalid scalar identities despite a replaced regexp validator', async (t) => {
    const fixture = await handoffFixture(t);
    for (const field of ['runId', 'producerAttempt', 'commit', 'version', 'buildDate']) {
      const directory = join(fixture.directory, '..', `invalid-${field}`);
      await mkdir(directory);
      const identity = {...fixture.identity, [field]: 'invalid'};
      if (field === 'version') identity.tag = 'vinvalid';
      await withReplacedIntrinsic(RegExp.prototype, 'test', () => true, async () => {
        await assert.rejects(createHandoff({...fixture, directory, identity,
          imageRepository: IMAGE_REPOSITORY, imageId: IMAGE_ID}),
        {code: 'RELEASE_HANDOFF_INVALID'});
      });
    }
  });

  it('serializes owned manifest data without inherited toJSON hooks', async (t) => {
    const fixture = await handoffFixture(t);
    const directory = join(fixture.directory, '..', 'polluted-serialization');
    await mkdir(directory);
    let result;
    await withReplacedIntrinsic(Object.prototype, 'toJSON', () => ({}), async () => {
      result = await createHandoff({...fixture, directory,
        imageRepository: IMAGE_REPOSITORY, imageId: IMAGE_ID});
    });
    const verified = await verifyHandoff({...fixture, directory,
      manifestSha256: result.manifestSha256});
    assert.equal(verified.identity.commit, GIT_HEAD);
  });

  it('snapshots producer identity and consumer intent before the first file await', async (t) => {
    const fixture = await handoffFixture(t);
    const directory = join(fixture.directory, '..', 'snapshot');
    await mkdir(directory);
    const identity = {...fixture.identity};
    const creating = createHandoff({...fixture, directory, identity,
      imageRepository: IMAGE_REPOSITORY, imageId: IMAGE_ID});
    identity.commit = 'f'.repeat(40);
    const created = await creating;
    assert.equal(created.manifest.identity.commit, GIT_HEAD);
    const expected = {...fixture.expected};
    const verifying = verifyHandoff({...fixture, expected});
    expected.commit = 'f'.repeat(40);
    assert.equal((await verifying).identity.commit, GIT_HEAD);
  });

  it('rejects image identity scalars despite replaced regexp test and exec', async (t) => {
    const fixture = await handoffFixture(t);
    for (const field of ['imageRepository', 'imageId']) {
      const directory = join(fixture.directory, '..', `invalid-${field}`);
      await mkdir(directory);
      const args = {...fixture, directory, imageRepository: IMAGE_REPOSITORY, imageId: IMAGE_ID,
        [field]: 'invalid:!'};
      await withReplacedIntrinsic(RegExp.prototype, 'test', () => true, async () => {
        await withReplacedIntrinsic(RegExp.prototype, 'exec', () => [], async () => {
          await assert.rejects(createHandoff(args), {code: 'RELEASE_HANDOFF_INVALID'});
        });
      });
    }
  });

  it('keeps all public checksums and assets under replaced array slicing and joining', async (t) => {
    const fixture = await handoffFixture(t);
    const directory = join(fixture.directory, '..', 'polluted-assets');
    await mkdir(directory);
    const originalSlice = Array.prototype.slice;
    const originalJoin = Array.prototype.join;
    let paths;
    await withReplacedIntrinsic(Array.prototype, 'slice', function slice(start, end) {
      return Reflect.apply(originalSlice, this, [start, end === 4 ? 1 : end]);
    }, async () => {
      await withReplacedIntrinsic(Array.prototype, 'join', function join(separator) {
        return typeof this[0] === 'string' && this[0].endsWith('/lagrange') ? this[0] :
          Reflect.apply(originalJoin, this, [separator]);
      }, async () => {
        const result = await createHandoff({...fixture, directory,
          imageRepository: IMAGE_REPOSITORY, imageId: IMAGE_ID});
        const verified = await verifyHandoff({...fixture, directory,
          manifestSha256: result.manifestSha256});
        paths = publicAssetPaths(directory, verified);
      });
    });
    assert.equal(paths.length, 5);
    assert.equal((await readFile(join(directory, 'SHA256SUMS'), 'utf8')).trim().split('\n').length, 4);
  });
});

function createCandidate() {
  return {
    gitHead: GIT_HEAD,
    integrity: INTEGRITY,
    manifest: {
      name: 'lagrange-server',
      version: VERSION,
      repository: {url: `${REPOSITORY_URL}.git`},
    },
  };
}

function createRegistryMetadata(overrides = {}) {
  const version = {
    gitHead: GIT_HEAD,
    dist: {integrity: INTEGRITY},
    ...overrides.version,
  };
  return {
    repository: {url: `git+${REPOSITORY_URL}.git`},
    versions: {[VERSION]: version},
    ...overrides.metadata,
  };
}

describe('npm release registry decisions', () => {
  it('normalizes npm repository URL variants', () => {
    assert.equal(
      normalizeRepositoryUrl(`git+${REPOSITORY_URL}.git`),
      REPOSITORY_URL,
    );
  });

  it('allows an unclaimed name or an absent version', () => {
    const candidate = createCandidate();
    assert.equal(
      classifyRegistryState(candidate, null),
      RELEASE_OUTCOME.NAME_AVAILABLE,
    );
    assert.equal(
      classifyRegistryState(candidate, createRegistryMetadata({
        metadata: {versions: {}},
      })),
      RELEASE_OUTCOME.VERSION_ABSENT,
    );
  });

  it('rejects a package owned by another repository', () => {
    const metadata = createRegistryMetadata({
      metadata: {repository: {url: 'https://example.com/foreign/repo.git'}},
    });
    assert.equal(
      classifyRegistryState(createCandidate(), metadata),
      RELEASE_OUTCOME.OCCUPIED_FOREIGN,
    );
  });

  it('rejects immutable-version content and commit conflicts', () => {
    const candidate = createCandidate();
    assert.equal(
      classifyRegistryState(candidate, createRegistryMetadata({
        version: {dist: {integrity: 'sha512-other'}},
      })),
      RELEASE_OUTCOME.VERSION_CONTENT_CONFLICT,
    );
    assert.equal(
      classifyRegistryState(candidate, createRegistryMetadata({
        version: {gitHead: 'ffffffffffffffffffffffffffffffffffffffff'},
      })),
      RELEASE_OUTCOME.VERSION_COMMIT_CONFLICT,
    );
  });

  it('recognizes a safe rerun of the exact artifact and commit', () => {
    assert.equal(
      classifyRegistryState(createCandidate(), createRegistryMetadata()),
      RELEASE_OUTCOME.ALREADY_PUBLISHED_MATCH,
    );
  });
});
