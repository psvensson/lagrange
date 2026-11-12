import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {describe, it} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {DEVELOPMENT_SOURCES, inspectPackageSourceSelection, validatePackedSourceSelection,
  PackageSourceSelectionError} from '../../scripts/npm-package-source-selection.js';

import {
  RELEASE_OUTCOME,
  classifyRegistryState,
  describePublishMismatch,
  normalizeRepositoryUrl,
  releaseChannel,
  validatePackageStructure,
  validateWorkspaceManifest,
} from '../../scripts/release-npm-package.js';

const VERSION = '0.1.0';
const INTEGRITY = 'sha512-candidate';
const GIT_HEAD = '0123456789012345678901234567890123456789';
const REPOSITORY_URL = 'https://github.com/psvensson/lagrange';

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

describe('release channel', () => {
  it('sends a prerelease to next and a release to latest, and refuses the rest', () => {
    assert.deepEqual(releaseChannel('0.2.4'),
      {channel: 'release', distTag: 'latest', prerelease: false});
    assert.deepEqual(releaseChannel('0.2.4-rc.0'),
      {channel: 'prerelease', distTag: 'next', prerelease: true});
    assert.deepEqual(releaseChannel('1.0.0-beta.12'),
      {channel: 'prerelease', distTag: 'next', prerelease: true});
    for (const bad of ['v0.2.4', '0.2', '0.2.4+build', '']) {
      assert.throws(() => releaseChannel(bad), /not a release or prerelease semver/u,
        `${JSON.stringify(bad)} must be refused, never defaulted to latest`);
    }
  });
});

describe('publish mismatch verdicts carry npm output', () => {
  it('types a clean exit that published nothing, and quotes npm', () => {
    const verdict = describePublishMismatch(RELEASE_OUTCOME.VERSION_ABSENT, {
      status: 0,
      stdout: '+ lagrange-server@0.2.4-rc.0\n',
      stderr: 'npm notice Publishing to https://registry.npmjs.org/ with tag next',
    });
    assert.equal(verdict.outcome, RELEASE_OUTCOME.PUBLISH_EXITED_WITHOUT_VERSION);
    assert.match(verdict.message, /VERSION_ABSENT/u);
    assert.match(verdict.message, /npm said: /u);
    assert.match(verdict.message, /with tag next/u,
      'npm\'s own words are the only explanation of a zero exit with no version');
  });

  it('types a publish npm says it is still processing as pending, not as absent', () => {
    // npm's own closing line for a provenance-signed publish; the registry
    // is working, and the release must not be called a non-publication.
    const pending = describePublishMismatch(RELEASE_OUTCOME.VERSION_ABSENT, {
      status: 0,
      stdout: '+ lagrange-server@0.2.4-rc.1\n',
      stderr: 'npm notice Your package is being processed and may take a few minutes to become available.',
    });
    assert.equal(pending.outcome, RELEASE_OUTCOME.PUBLISH_ACCEPTED_PENDING_AVAILABILITY);
    assert.match(pending.message, /being processed/u);
  });

  it('keeps the conflict outcome for any other mismatch and says when npm was silent', () => {
    const conflict = describePublishMismatch(
      RELEASE_OUTCOME.VERSION_CONTENT_CONFLICT, {status: 0, stdout: '', stderr: ''});
    assert.equal(conflict.outcome, RELEASE_OUTCOME.PARTIAL_RELEASE_CONFLICT);
    assert.match(conflict.message, /npm printed nothing/u);
    const absentAfterFailure = describePublishMismatch(
      RELEASE_OUTCOME.VERSION_ABSENT, {status: 1, stderr: 'npm ERR! 403'});
    assert.equal(absentAfterFailure.outcome, RELEASE_OUTCOME.PARTIAL_RELEASE_CONFLICT,
      'a non-zero exit is not the silent case');
  });
});

describe('workspace manifest and Dockerfile hardening (Q06/Q07/Q15)', () => {
  it('validates the workspace manifest and rejects missing wit/ or componentize-js', async () => {
    const manifest = await validateWorkspaceManifest();
    assert.ok(manifest.files.includes('wit/'));
    assert.ok(manifest.dependencies['@bytecodealliance/componentize-js']);
    assert.equal(manifest.dependencies['blessed-contrib'], undefined);

    const mockLock = {
      name: 'lagrange-server',
      packages: {'': {name: 'lagrange-server', version: manifest.version}},
    };
    assert.throws(
      () => validatePackageStructure(
        {...manifest, files: ['src/']},
        mockLock,
      ),
      /package\.json files must explicitly include wit\//u,
    );
    assert.throws(
      () => validatePackageStructure(
        {
          ...manifest,
          dependencies: {
            ...manifest.dependencies,
            '@bytecodealliance/componentize-js': undefined,
          },
        },
        mockLock,
      ),
      /package\.json dependencies must include @bytecodealliance\/componentize-js/u,
    );
  });

  it('requires non-root execution (USER 10001:10001) and wit/ in Dockerfile', () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)), '..', '..',
    );
    const dockerfile = fs.readFileSync(
      path.join(repoRoot, 'Dockerfile'),
      'utf8',
    );
    assert.match(dockerfile, /^USER 10001:10001$/mu);
    assert.match(dockerfile, /^COPY wit\/ \.\/wit\/$/mu);
    assert.match(dockerfile, /COPY --from=builder --chown=10001:10001 \/data \/data/u);
  });
});

const SELECTION_REPO = path.resolve(import.meta.dirname, '../..');
const SELECTION_TIMEOUT = 120000;
const SELECTION_OVERLAY = Object.freeze(['package.json', 'scripts/release-npm-package.js',
  'scripts/npm-package-source-selection.js']);
const SELECTION_PROTECTED = Object.freeze(['src/debug-runtime/debug-metadata-service.js',
  'src/debug-runtime/dwarf-index-builder.js', 'src/debug-runtime/dwarf-index-cache.js',
  'src/debug-runtime/dwarf-index-constants.js', 'src/debug-runtime/wasm-runtime-adapter.js',
  'src/threading/service-worker.js', 'src/runtime/wasi-component-cell-worker.js',
  'src/runtime/wasi-component-derivation-worker.js', 'src/admin/static/playback-viewer.html',
  'src/admin/static/test-run-dashboard.html', 'wit/world.wit',
  'vendor/raft-rs-wasm/pkg/raft_wasm.js', 'vendor/raft-rs-wasm/pkg/raft_wasm_bg.wasm']);
const selectionHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function selectionSave(root, name, value) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
}
function selectionError(error) {
  return {name: error.name, code: error.code, message: error.message, stack: error.stack,
    cause: error.cause ? selectionError(error.cause) : null,
    stdout: error.stdout?.toString(), stderr: error.stderr?.toString()};
}
function selectionFixture() {
  refuseUnderProbe('production source-selection witnesses');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-npm-source-selection-witness-'));
  console.log(`production source-selection witness root: ${root}`);
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  const env = gitProcessEnvironment();
  const git = (args, cwd) => execGit(args, {cwd, env, timeout: SELECTION_TIMEOUT});
  const base = git(['rev-parse', 'HEAD'], SELECTION_REPO).toString().trim();
  const archive = git(['archive', '--format=tar', base, 'src', 'vendor', 'wit', 'scripts',
    '.gitignore', '.npmignore', 'package.json', 'package-lock.json',
    'README.md', 'CHANGELOG.md', 'LICENSE'], SELECTION_REPO);
  const archivePath = path.join(root, 'source.tar');
  fs.writeFileSync(archivePath, archive, {flag: 'wx'});
  execFileSync('tar', ['-xf', archivePath, '-C', source], {env, timeout: SELECTION_TIMEOUT});
  git(['init', '--quiet', source], root);
  const common = path.resolve(SELECTION_REPO,
    git(['rev-parse', '--git-common-dir'], SELECTION_REPO).toString().trim());
  fs.writeFileSync(path.join(source, '.git/objects/info/alternates'),
    path.join(common, 'objects') + '\n', {flag: 'wx'});
  git(['update-ref', 'HEAD', base], source);
  fs.symlinkSync(fs.realpathSync(path.join(SELECTION_REPO, 'node_modules')),
    path.join(source, 'node_modules'));
  const candidate = SELECTION_OVERLAY.map((name) => {
    const bytes = fs.readFileSync(path.join(SELECTION_REPO, name));
    fs.copyFileSync(path.join(SELECTION_REPO, name), path.join(source, name));
    return {path: name, sha256: selectionHash(bytes)};
  });
  const config = path.join(common, 'config');
  const before = fs.readFileSync(config);
  fs.writeFileSync(path.join(root, 'shared-config-before'), before, {flag: 'wx'});
  selectionSave(root, 'input-binding.json', {base, candidate, source,
    sourceArchiveSha256: selectionHash(archive),
    testSha256: selectionHash(fs.readFileSync(fileURLToPath(import.meta.url))),
    privateGitDirectory: path.join(source, '.git'), sharedConfig: config});
  return {root, source, base, config, before};
}
async function selectionPack(subject, owner, label) {
  const packed = await owner.buildNpmPackage({gitHead: subject.base,
    outputDirectory: path.join(subject.root, label, 'packed')});
  selectionSave(subject.root, `${label}/npm-pack.json`, packed);
  const extracted = path.join(subject.root, label, 'extracted');
  fs.mkdirSync(extracted);
  execFileSync('tar', ['-xzf', packed.tarballPath, '-C', extracted],
    {timeout: SELECTION_TIMEOUT});
  const tarBytes = fs.readFileSync(packed.tarballPath);
  const tarList = execFileSync('tar', ['-tzf', packed.tarballPath],
    {timeout: SELECTION_TIMEOUT}).toString();
  fs.writeFileSync(path.join(subject.root, label, 'tar-list.txt'), tarList, {flag: 'wx'});
  const selected = new Set(packed.files.map((row) => row.path));
  for (const name of DEVELOPMENT_SOURCES) assert.equal(selected.has(name), false, name);
  for (const name of SELECTION_PROTECTED) assert.equal(selected.has(name), true, name);
  selectionSave(subject.root, `${label}/tar-binding.json`, {tarSha256: selectionHash(tarBytes),
    packedBytes: tarBytes.length, entries: packed.entryCount, unpacked: packed.unpackedSize,
    sourceFingerprint: packed.sourceSelection.sourceFingerprint});
  return {packed, extracted: path.join(extracted, 'package')};
}
async function selectionRefuses(subject, owner, name, expected) {
  let observed;
  await assert.rejects(() => owner.buildNpmPackage({gitHead: subject.base,
    outputDirectory: path.join(subject.root, 'negative', name, 'packed')}), (error) => {
    observed = selectionError(error);
    return error instanceof owner.NpmReleaseError &&
      error.code === RELEASE_OUTCOME.PACKAGE_MANIFEST_INVALID && error.message.includes(expected);
  }, name);
  selectionSave(subject.root, `negative/${name}/refusal.json`, observed);
}
async function selectionSourceMatrix(subject, owner) {
  // Keep negative input early in the ordered scan; both positive packs scan all source.
  const file = 'src/acceptance-control.js';
  const target = './debug-runtime/dwarf-index-pipeline.js';
  const fileUrl = pathToFileURL(path.join(subject.source, DEVELOPMENT_SOURCES[0])).href;
  const cases = [
    ['static-import', `import '${target}';`, 'incoming-development-source'],
    ['named-reexport', `export {DwarfIndexPipeline} from '${target}';`, 'incoming-development-source'],
    ['star-reexport', `export * from '${target}';`, 'incoming-development-source'],
    ['literal-dynamic', `void import('${target}');`, 'incoming-development-source'],
    ['computed-constant', `const chosen = '${target}'; void import(chosen);`, 'incoming-development-source'],
    ['require', `require('${target}');`, 'incoming-development-source'],
    ['create-require-alias', 'import {createRequire as loadFrom} from \'node:module\';' +
      `const loader = loadFrom(import.meta.url); loader('${target}');`, 'incoming-development-source'],
    ['destructured-loader', 'const {createRequire: fromHere} = await import(\'node:module\');' +
      `const load = fromHere(import.meta.url); load('${target}');`, 'incoming-development-source'],
    ['computed-loader-name', 'import * as modules from \'node:module\';' +
      `const load = modules['create' + 'Require'](import.meta.url); load('${target}');`,
    'incoming-development-source'],
    ['escaped-loader', 'import {createRequire} from \'node:module\';' +
      'const factory = process.argv[2] ? createRequire : null;', 'unexamined-target-alias-use'],
    ['opaque-loader-namespace', 'import * as modules from \'node:module\';' +
      'const load = modules[process.argv[2]];', 'unexamined-loader-namespace'],
    ['object-loader-escape', 'const object = {load: require};', 'unexamined-target-alias-use'],
    ['file-url-query', `void import('${fileUrl}?version=1#same-source');`, 'incoming-development-source'],
    ['new-url', `new URL('${target}', import.meta.url);`, 'incoming-development-source'],
    ['aliased-url-base', `const base = import.meta.url; const Link = URL;
      new Link('${target}', base);`, 'incoming-development-source'],
    ['explicit-worker', 'import {Worker as RunWorker} from \'node:worker_threads\';' +
      `new RunWorker(new URL('${target}', import.meta.url));`, 'incoming-development-source'],
    ['malformed-source', 'import {', 'source-syntax-unexaminable'],
    ['unknown-dynamic', 'const target = process.argv[2]; void import(target);', 'unexamined-dynamic-import'],
    ['unknown-require', 'function load(target) { return require(target); }', 'unexamined-loader-target'],
    ['unknown-worker', 'new Worker(process.argv[2]);', 'unexamined-worker-target'],
  ];
  for (const [name, code, expected] of cases) {
    fs.writeFileSync(path.join(subject.source, file), code);
    selectionSave(subject.root, `negative/${name}/input.json`, {file, code,
      sha256: selectionHash(code)});
    await selectionRefuses(subject, owner, name, expected);
  }
  fs.unlinkSync(path.join(subject.source, file));
}
async function selectionManifestMatrix(subject, owner) {
  const file = path.join(subject.source, 'package.json');
  const bytes = fs.readFileSync(file);
  const original = JSON.parse(bytes);
  const target = `./${DEVELOPMENT_SOURCES[0]}`;
  const cases = [
    ['missing-negation', {...original, files: original.files.filter((item) =>
      item !== `!${DEVELOPMENT_SOURCES[0]}`)}, 'exact-development-exclusions'],
    ['missing-backend-negation', {...original, files: original.files.filter((item) =>
      item !== `!${DEVELOPMENT_SOURCES[1]}`)}, 'exact-development-exclusions'],
    ['duplicate-exclusion', {...original, files: [...original.files, `!${DEVELOPMENT_SOURCES[0]}`]},
      'exact-development-exclusions'],
    ['extra-exclusion', {...original, files: [...original.files, '!src/debug-runtime/**']},
      'exact-development-exclusions'],
    ['conflicting-selection', {...original, files: [...original.files, DEVELOPMENT_SOURCES[0]]},
      'exact-development-exclusions'],
    ['main-target', {...original, main: target}, 'package.json main'],
    ['root-export', {...original, exports: {...original.exports, '.': target}}, 'package.json root export'],
    ['additional-export', {...original, exports: {...original.exports, './dwarf': target}},
      'incoming-development-source'],
    ['additional-bin', {...original, bin: {...original.bin, dwarf: target}}, 'incoming-development-source'],
    ['local-alias', {...original, imports: {'#dwarf': target}}, 'incoming-development-source'],
    ['unknown-export-shape', {...original, exports: {...original.exports, './unknown': null}},
      'unexamined-entry-shape'],
  ];
  try {
    for (const [name, manifest, expected] of cases) {
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
      selectionSave(subject.root, `negative/${name}/input.json`, manifest);
      await selectionRefuses(subject, owner, name, expected);
    }
  } finally {
    fs.writeFileSync(file, bytes);
  }
}
async function selectionProducerMatrix(subject, owner) {
  const cases = [
    ['changed-computed-producer', 'src/cli/bulk-load-router.js',
      (code) => code.replace('./service-lifecycle-sql-client.js', '../debug-runtime/dwarf-index-pipeline.js')],
    ['changed-data-url-producer', 'src/runtime/wasi-component-cell-worker.js',
      (code) => code.replace('import(moduleUrl)', 'import(\'../debug-runtime/dwarf-index-pipeline.js\')')],
    ['changed-authored-caller', 'src/cli/service-pipeline-command.js', (code) => code + '\n// changed caller\n'],
    ['changed-admin-asset-target', 'src/admin/admin-constants.js',
      (code) => code.replace('static/test-run-dashboard.html',
        '../debug-runtime/dwarf-index-pipeline.js')],
    ['changed-worker-default', 'src/runtime/wasi-component-cell-runtime.js',
      (code) => code.replace('wasi-component-cell-worker.js', '../debug-runtime/dwarf-index-pipeline.js')],
  ];
  for (const [name, relative, alter] of cases) {
    const file = path.join(subject.source, relative);
    const original = fs.readFileSync(file);
    const changed = alter(original.toString());
    assert.notEqual(changed, original.toString(), name);
    try {
      fs.writeFileSync(file, changed);
      selectionSave(subject.root, `negative/${name}/input.json`, {file: relative, changed,
        sha256: selectionHash(changed)});
      await selectionRefuses(subject, owner, name, 'reviewed-target-producer-changed');
    } finally {
      fs.writeFileSync(file, original);
    }
  }
}
async function selectionMissingPair(subject, owner) {
  for (const relative of DEVELOPMENT_SOURCES) {
    const file = path.join(subject.source, relative);
    const bytes = fs.readFileSync(file);
    const label = path.basename(relative);
    try {
      fs.unlinkSync(file);
      await selectionRefuses(subject, owner, `missing-${label}`, 'missing-or-empty-development-source');
      fs.writeFileSync(file, '');
      await selectionRefuses(subject, owner, `empty-${label}`, 'missing-or-empty-development-source');
    } finally {
      fs.writeFileSync(file, bytes);
    }
  }
}
function selectionPackedControls(subject, first) {
  const manifest = JSON.parse(fs.readFileSync(path.join(subject.source, 'package.json'), 'utf8'));
  const selection = inspectPackageSourceSelection(subject.source, manifest);
  const packedManifest = JSON.parse(fs.readFileSync(path.join(first.extracted, 'package.json'), 'utf8'));
  const check = (root) =>
    validatePackedSourceSelection(root, selection, first.packed, packedManifest);
  check(first.extracted);
  for (const file of ['src/debug-runtime/dwarf-index-cache.js',
    'src/admin/static/playback-viewer.html', 'src/threading/service-worker.js']) {
    const root = path.join(subject.root, 'counterfeit', path.basename(file));
    fs.cpSync(first.extracted, root, {recursive: true});
    fs.unlinkSync(path.join(root, file));
    assert.throws(() => check(root), (error) => error instanceof PackageSourceSelectionError &&
      error.reason === 'npm-selected-inventory-mismatch');
    selectionSave(subject.root, `counterfeit/${path.basename(file)}.json`,
      {file, rejected: true, kind: 'real-tar-derived omission'});
  }
  const changed = path.join(subject.root, 'counterfeit', 'changed-byte');
  fs.cpSync(first.extracted, changed, {recursive: true});
  const file = path.join(changed, 'src/admin/static/playback-viewer.html');
  const bytes = fs.readFileSync(file);
  bytes[0] ^= 1;
  fs.writeFileSync(file, bytes);
  assert.throws(() => check(changed), (error) => error instanceof PackageSourceSelectionError &&
    error.reason === 'workspace-packed-byte-mismatch');
  selectionSave(subject.root, 'counterfeit/workspace-packed-byte-mismatch.json',
    {rejected: true, sha256: selectionHash(bytes), kind: 'same-length real-tar-derived mutation'});
}
function selectionEffectTrap(subject) {
  const file = path.join(subject.source, 'src/debug-runtime/package-selection-control.js');
  const trap = path.join(subject.root, 'PRODUCT-MODULE-EXECUTED');
  const code = 'import fs from \'node:fs\';\n' +
    `fs.writeFileSync(${JSON.stringify(trap)}, 'executed');\n`;
  try {
    fs.writeFileSync(file, code);
    const manifest = JSON.parse(fs.readFileSync(path.join(subject.source, 'package.json'), 'utf8'));
    inspectPackageSourceSelection(subject.source, manifest);
    assert.equal(fs.existsSync(trap), false, 'the owner parses source without importing it');
    selectionSave(subject.root, 'no-product-execution.json', {file, code, executed: false});
  } finally {
    fs.unlinkSync(file);
  }
}
describe('buildNpmPackage production development-source selection', () => {
  it('rejects current unsafe source and selection, then packs corrected current bytes', async () => {
    const subject = selectionFixture();
    const savedEnvironment = process.env;
    process.env = {...gitProcessEnvironment(), npm_config_offline: 'true',
      npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
      npm_config_cache: path.join(subject.root, 'npm-cache')};
    try {
      const owner = await import(pathToFileURL(path.join(subject.source, 'scripts/release-npm-package.js')));
      const first = await selectionPack(subject, owner, 'current-positive');
      await selectionSourceMatrix(subject, owner);
      await selectionManifestMatrix(subject, owner);
      await selectionProducerMatrix(subject, owner);
      await selectionMissingPair(subject, owner);
      selectionPackedControls(subject, first);
      selectionEffectTrap(subject);
      const corrected = await selectionPack(subject, owner, 'corrected-positive');
      assert.equal(corrected.packed.sourceSelection.sourceFingerprint,
        first.packed.sourceSelection.sourceFingerprint, 'corrected source is re-read in the same process');
      assert.deepEqual(fs.readFileSync(subject.config), subject.before, 'shared Git config preserved');
      assert.deepEqual(fs.readFileSync(path.join(subject.source, 'package-lock.json')),
        fs.readFileSync(path.join(SELECTION_REPO, 'package-lock.json')));
      for (const name of DEVELOPMENT_SOURCES) {
        assert.deepEqual(fs.readFileSync(path.join(subject.source, name)),
          fs.readFileSync(path.join(SELECTION_REPO, name)), 'development bodies stay in source');
      }
      selectionSave(subject.root, 'complete.json', {passed: true,
        ceiling: 'source selection and tar retention only', base: subject.base});
    } catch (error) {
      selectionSave(subject.root, 'first-unexpected.json', selectionError(error));
      throw error;
    } finally {
      process.env = savedEnvironment;
    }
  });
});
