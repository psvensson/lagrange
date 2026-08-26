import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import {
  RELEASE_OUTCOME,
  buildNpmPackage,
  classifyPublishedCandidateState,
  classifyRegistryState,
  inspectTarball,
  normalizeRepositoryUrl,
  registryStateAllowsPublish,
  validateWorkspaceManifest,
} from '../../scripts/release-npm-package.js';
import {readNpmRegistryMetadata} from '../../scripts/release-npm-registry.js';

const VERSION = '0.1.0';
const INTEGRITY = 'sha512-candidate';
const GIT_HEAD = '0123456789012345678901234567890123456789';
const REPOSITORY_URL = 'https://github.com/psvensson/lagrange';
const README = '# Lagrange\n\nTagged package documentation.\n';

function runGit(root, args) {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

async function createPackageFixture() {
  const root = await mkdtemp(join(tmpdir(), 'lagrange-npm-readme-fixture-'));
  await Promise.all([
    mkdir(join(root, 'src/cli/bin'), {recursive: true}),
    writeFile(join(root, 'README.md'), README),
    writeFile(join(root, 'package.json'), `${JSON.stringify({
      name: 'lagrange-server',
      version: VERSION,
      description: 'fixture',
      type: 'module',
      main: 'src/public-api.js',
      exports: {'.': './src/public-api.js'},
      bin: {
        'lagrange': './src/sea-entry.js',
        'lagrange-admin': './src/cli/bin/lagrange-admin.js',
      },
      files: ['src/'],
      author: 'Fixture',
      homepage: REPOSITORY_URL,
      bugs: {url: `${REPOSITORY_URL}/issues`},
      keywords: ['distributed-sql'],
      publishConfig: {
        access: 'public',
        provenance: true,
        registry: 'https://registry.npmjs.org/',
      },
    }, null, 2)}\n`),
    writeFile(join(root, 'package-lock.json'), `${JSON.stringify({
      name: 'lagrange-server',
      version: VERSION,
      lockfileVersion: 3,
      packages: {
        '': {name: 'lagrange-server', version: VERSION},
      },
    }, null, 2)}\n`),
  ]);
  await Promise.all([
    writeFile(join(root, 'src/public-api.js'), 'export const VERSION = \'0.1.0\';\n'),
    writeFile(join(root, 'src/sea-entry.js'), '#!/usr/bin/env node\n'),
    writeFile(join(root, 'src/cli/bin/lagrange-admin.js'), '#!/usr/bin/env node\n'),
  ]);
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.email', 'fixture@example.test']);
  runGit(root, ['config', 'user.name', 'Fixture']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'fixture']);
  return {gitHead: runGit(root, ['rev-parse', 'HEAD']), root};
}

function createCandidate() {
  return {
    gitHead: GIT_HEAD,
    integrity: INTEGRITY,
    readme: README,
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
    'dist-tags': {latest: VERSION},
    'readme': README,
    'repository': {url: `git+${REPOSITORY_URL}.git`},
    'versions': {[VERSION]: version},
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

  it('rejects a latest-version registry README that differs from the tarball', () => {
    assert.equal(
      classifyRegistryState(createCandidate(), createRegistryMetadata({
        metadata: {readme: '# Stale documentation\n'},
      })),
      RELEASE_OUTCOME.VERSION_README_CONFLICT,
    );
  });

  it('does not compare top-level README metadata for a non-latest version', () => {
    assert.equal(
      classifyRegistryState(createCandidate(), createRegistryMetadata({
        metadata: {
          'dist-tags': {latest: '9.9.9'},
          'readme': '# Documentation for the actual latest version\n',
        },
      })),
      RELEASE_OUTCOME.ALREADY_PUBLISHED_MATCH,
    );
  });

  it('requires the published candidate to become latest before observation passes', () => {
    const metadata = createRegistryMetadata({
      metadata: {'dist-tags': {latest: '9.9.9'}},
    });
    assert.equal(
      classifyPublishedCandidateState(createCandidate(), metadata),
      RELEASE_OUTCOME.VERSION_NOT_LATEST,
    );
  });

  it('rejects inherited or accessor registry README authority without invoking it', () => {
    let getterCalls = 0;
    const inherited = createRegistryMetadata();
    delete inherited.readme;
    // eslint-disable-next-line no-extend-native -- adversarial inherited authority guard
    Object.defineProperty(Object.prototype, 'readme', {
      configurable: true,
      get() {
        getterCalls += 1;
        return README;
      },
    });
    const accessor = createRegistryMetadata();
    Object.defineProperty(accessor, 'readme', {
      configurable: true,
      get() {
        getterCalls += 1;
        return README;
      },
    });
    try {
      assert.equal(
        classifyRegistryState(createCandidate(), inherited),
        RELEASE_OUTCOME.VERSION_README_CONFLICT,
      );
      assert.equal(
        classifyRegistryState(createCandidate(), accessor),
        RELEASE_OUTCOME.VERSION_README_CONFLICT,
      );
      assert.equal(getterCalls, 0);
    } finally {
      delete Object.prototype.readme;
    }
  });

  it('reads every registry authority field as own data without invoking accessors', () => {
    const replaceWithAccessor = (target, key, onRead) => {
      Object.defineProperty(target, key, {
        configurable: true,
        get() {
          onRead();
          return undefined;
        },
      });
    };
    const mutations = [
      (metadata, onRead) => replaceWithAccessor(metadata, 'repository', onRead),
      (metadata, onRead) => replaceWithAccessor(metadata, 'versions', onRead),
      (metadata, onRead) => replaceWithAccessor(
        metadata.versions,
        VERSION,
        onRead,
      ),
      (metadata, onRead) => replaceWithAccessor(
        metadata.versions[VERSION],
        'dist',
        onRead,
      ),
      (metadata, onRead) => replaceWithAccessor(
        metadata.versions[VERSION].dist,
        'integrity',
        onRead,
      ),
      (metadata, onRead) => replaceWithAccessor(
        metadata.versions[VERSION],
        'gitHead',
        onRead,
      ),
      (metadata, onRead) => replaceWithAccessor(metadata, 'dist-tags', onRead),
      (metadata, onRead) => replaceWithAccessor(
        metadata['dist-tags'],
        'latest',
        onRead,
      ),
      (metadata, onRead) => replaceWithAccessor(metadata, 'readme', onRead),
    ];
    for (const mutate of mutations) {
      let getterCalls = 0;
      const metadata = createRegistryMetadata();
      mutate(metadata, () => {
        getterCalls += 1;
      });
      assert.notEqual(
        classifyPublishedCandidateState(createCandidate(), metadata),
        RELEASE_OUTCOME.ALREADY_PUBLISHED_MATCH,
      );
      assert.equal(getterCalls, 0);
    }
  });

  it('recognizes a safe rerun of the exact artifact and commit', () => {
    assert.equal(
      classifyRegistryState(createCandidate(), createRegistryMetadata()),
      RELEASE_OUTCOME.ALREADY_PUBLISHED_MATCH,
    );
  });

  it('binds both packing stages to README.md from the exact gitHead', async () => {
    const fixture = await createPackageFixture();
    try {
      const outputDirectory = join(fixture.root, 'packed');
      const packed = await buildNpmPackage({
        gitHead: fixture.gitHead,
        outputDirectory,
        repositoryRoot: fixture.root,
      });
      assert.equal(
        packed.readmeSha256,
        createHash('sha256').update(README).digest('hex'),
      );

      const originalJsonParse = JSON.parse;
      const originalArrayIsArray = Array.isArray;
      const originalArrayIncludes = Array.prototype.includes;
      const originalRegExpTest = RegExp.prototype.test;
      JSON.parse = () => ({forged: true});
      Array.isArray = () => false;
      // eslint-disable-next-line no-extend-native -- adversarial manifest authority guard
      Array.prototype.includes = () => false;
      // eslint-disable-next-line no-extend-native -- adversarial pack authority guard
      RegExp.prototype.test = () => false;
      try {
        await validateWorkspaceManifest(fixture.root);
        const inspected = await inspectTarball(packed.tarballPath);
        assert.equal(inspected.gitHead, fixture.gitHead);
        assert.equal(inspected.readmeSha256, packed.readmeSha256);
        // eslint-disable-next-line no-extend-native -- adversarial publish admission guard
        Array.prototype.includes = () => true;
        assert.equal(
          registryStateAllowsPublish(RELEASE_OUTCOME.NAME_AVAILABLE),
          true,
        );
        assert.equal(
          registryStateAllowsPublish(RELEASE_OUTCOME.VERSION_ABSENT),
          true,
        );
        assert.equal(
          registryStateAllowsPublish(RELEASE_OUTCOME.OCCUPIED_FOREIGN),
          false,
        );
        assert.equal(
          registryStateAllowsPublish(RELEASE_OUTCOME.VERSION_CONTENT_CONFLICT),
          false,
        );
        assert.equal(
          registryStateAllowsPublish(RELEASE_OUTCOME.VERSION_COMMIT_CONFLICT),
          false,
        );
        assert.equal(
          registryStateAllowsPublish(RELEASE_OUTCOME.VERSION_README_CONFLICT),
          false,
        );
      } finally {
        JSON.parse = originalJsonParse;
        Array.isArray = originalArrayIsArray;
        // eslint-disable-next-line no-extend-native -- restore adversarial mutation
        Array.prototype.includes = originalArrayIncludes;
        // eslint-disable-next-line no-extend-native -- restore adversarial mutation
        RegExp.prototype.test = originalRegExpTest;
      }

      await writeFile(
        join(fixture.root, 'README.md'),
        '# Mutated after the release commit\n',
      );
      await assert.rejects(
        buildNpmPackage({
          gitHead: fixture.gitHead,
          outputDirectory,
          repositoryRoot: fixture.root,
        }),
        /must exactly match the tagged workspace README/u,
      );
    } finally {
      await rm(fixture.root, {recursive: true, force: true});
    }
  });

  it('bounds and retries transient npm registry reads, but fails fast on 4xx', async () => {
    let calls = 0;
    const delays = [];
    const metadata = createRegistryMetadata();
    const observed = await readNpmRegistryMetadata(
      'lagrange-server',
      'https://registry.npmjs.org/',
      {
        fetchImpl: async (_url, options) => {
          calls += 1;
          assert.ok(options.signal instanceof globalThis.AbortSignal);
          if (calls === 1) throw new Error('temporary network failure');
          if (calls === 2) return new globalThis.Response(null, {status: 503});
          return new globalThis.Response(JSON.stringify(metadata), {status: 200});
        },
        sleep: async (milliseconds) => delays.push(milliseconds),
      },
    );
    assert.deepEqual(observed, metadata);
    assert.equal(calls, 3);
    assert.deepEqual(delays, [2000, 2000]);

    calls = 0;
    await assert.rejects(
      readNpmRegistryMetadata(
        'lagrange-server',
        'https://registry.npmjs.org/',
        {
          fetchImpl: async () => {
            calls += 1;
            return new globalThis.Response(null, {status: 403});
          },
          sleep: async () => {},
        },
      ),
      /registry returned HTTP 403/u,
    );
    assert.equal(calls, 1);
  });

  it('uses the captured native registry response decoder after import', async () => {
    const responsePrototype = globalThis.Response.prototype;
    const originalText = responsePrototype.text;
    responsePrototype.text = async () => JSON.stringify({forged: true});
    try {
      const metadata = createRegistryMetadata();
      const observed = await readNpmRegistryMetadata(
        'lagrange-server',
        'https://registry.npmjs.org/',
        {
          fetchImpl: async () => new globalThis.Response(
            JSON.stringify(metadata),
            {status: 200},
          ),
          sleep: async () => {},
        },
      );
      assert.deepEqual(observed, metadata);
    } finally {
      responsePrototype.text = originalText;
    }
  });
});
