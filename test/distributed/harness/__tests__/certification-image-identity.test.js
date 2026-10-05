/**
 * Witnesses of the certification commit identity
 * (certification-image-identity.js) with the REAL image builder
 * (build-image.js), the real build-context parser and real git: under
 * --certify the image is built fresh on every host (never reused by label),
 * labelled with the full sha, a clean flag, the context digest and a
 * per-run build id, and read back; a checkout with an untracked or ignored
 * file inside the build context builds nothing. Only the DockerProvider's
 * daemon calls are replaced (no docker contact).
 */

import {after, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildImage} from '../../build-image.js';
import {
  CERTIFICATION_IMAGE_LABEL,
  baseImageContentDigests,
  dockerfileBaseImages,
  certifyArgumentProblem,
  completeCertificationBuild,
  observeCommitIdentity,
  observeNodeImages,
  prepareCertificationBuild,
} from '../certification-image-identity.js';
import {CLI} from '../constants.js';
import {DockerProvider} from '../docker-provider.js';
import {createDistributedRunArgHelpers} from '../../run-args-helpers.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayMap = Function.call.bind(Array.prototype.map);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringSplit = Function.call.bind(String.prototype.split);

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SHORT = 'abcdef012345';
const TWO_HOSTS = Object.freeze({buildOnHosts: true,
  hosts: ['tcp://127.0.0.1:1', 'tcp://127.0.0.1:2']});

// The daemon side of DockerProvider, per host: the image each tag names.
function stubDaemon(t, initialLabels) {
  const daemon = {builds: [], images: new Map()};
  const original = {
    buildImage: DockerProvider.prototype.buildImage,
    getImageLabel: DockerProvider.prototype.getImageLabel,
    imageExists: DockerProvider.prototype.imageExists,
    inspectImage: DockerProvider.prototype.inspectImage,
    storageDriver: DockerProvider.prototype.storageDriver,
  };
  const hostOf = (provider) => `${provider._docker?.modem?.host}:` +
    String(provider._docker?.modem?.port);
  DockerProvider.prototype.inspectImage = async function inspect(tag) {
    const labels = daemon.images.get(`${hostOf(this)}|${tag}`) ??
      initialLabels;
    return labels ? {Config: {Labels: labels}, Id: `sha256:${tag}`,
      RepoDigests: [`${stringSplit(tag, ':')[0]}@sha256:content`]} : null;
  };
  DockerProvider.prototype.storageDriver = async function driver() {
    return 'overlayfs';
  };
  DockerProvider.prototype.imageExists = async function exists(tag) {
    return Boolean(await this.inspectImage(tag));
  };
  DockerProvider.prototype.getImageLabel = async function label(tag, key) {
    return (await this.inspectImage(tag))?.Config?.Labels?.[key] ?? null;
  };
  DockerProvider.prototype.buildImage = async function build(_context, tag,
    _dockerfile, _progress, labels) {
    daemon.builds.push(labels);
    daemon.images.set(`${hostOf(this)}|${tag}`, labels);
  };
  t.after(() => Object.assign(DockerProvider.prototype, original));
  return daemon;
}

function git(cwd, ...args) {
  return stringTrim(execFileSync('git', args, {cwd, encoding: 'utf8'}));
}

// A real git checkout with a Dockerfile whose context is src/, vendor/x/
// and package.json; `src/ignored.js` is gitignored.
function scratchCheckout() {
  const dir = mkdtempSync(join(tmpdir(), 'certify-checkout-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'vendor', 'x'), {recursive: true});
  writeFileSync(join(dir, 'Dockerfile'), 'FROM scratch\nCOPY package.json ./\n' +
    'COPY src/ ./src/\nCOPY vendor/x/ ./vendor/x/\n');
  writeFileSync(join(dir, 'package.json'), '{"name":"x"}\n');
  writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'vendor', 'x', 'w.bin'), 'wasm');
  writeFileSync(join(dir, '.gitignore'), 'src/ignored.js\nnotes.txt\n');
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q',
    '-m', 'base');
  return {dir, sha: git(dir, 'rev-parse', 'HEAD')};
}

const checkouts = [];
after(() => {
  for (const dir of checkouts) {
    rmSync(dir, {force: true, recursive: true});
  }
});

function checkout() {
  const made = scratchCheckout();
  checkouts.push(made.dir);
  return made;
}

describe('certification build: fresh, labelled, read back (B1)', () => {
  it('the verifier\'s reuse scenario: an image labelled with the short HEAD ' +
    'by an earlier DIRTY build is reused by an ordinary run and NEVER by a ' +
    'certification build, which builds on every host', async (t) => {
    const daemon = stubDaemon(t, {'ddb.git-hash': SHORT});
    const ordinary = await buildImage({docker: TWO_HOSTS, image: 'x:test'},
      false, null, {gitDirty: false, gitHash: SHORT});
    assert.equal(ordinary.reused, true);
    assert.equal(daemon.builds.length, 0);
    const labels = {[CERTIFICATION_IMAGE_LABEL.BUILD_ID]: 'run-1',
      [CERTIFICATION_IMAGE_LABEL.CLEAN]: 'true'};
    const certified = await buildImage({docker: TWO_HOSTS, image: 'x:test'},
      false, null, {certification: {labels, refusal: null}, gitDirty: false,
        gitHash: SHORT});
    assert.equal(certified.reused, false);
    assert.equal(daemon.builds.length, 2);
    assert.deepEqual(arrayMap(certified.imageReadback, (entry) => entry.host),
      TWO_HOSTS.hosts);
    for (const entry of certified.imageReadback) {
      assert.equal(entry.labels[CERTIFICATION_IMAGE_LABEL.BUILD_ID], 'run-1');
      assert.equal(entry.labels['ddb.git-hash'], SHORT);
    }
  });

  it('R1: after the build each host\'s base images (the Dockerfile FROM ' +
    'refs) are read back with image id, RepoDigests and the host storage ' +
    'driver, and recorded', async (t) => {
    stubDaemon(t, {'ddb.git-hash': SHORT});
    const certified = await buildImage({docker: TWO_HOSTS, image: 'x:test'},
      false, null, {certification: {baseImageRefs: ['node:22-slim',
        'gcr.io/distroless/nodejs22-debian12'], labels: {}, refusal: null},
      gitDirty: false, gitHash: SHORT});
    for (const entry of certified.imageReadback) {
      assert.deepEqual(entry.baseImages, [
        {imageId: 'sha256:node:22-slim', ref: 'node:22-slim',
          repoDigests: ['node@sha256:content'], storageDriver: 'overlayfs'},
        {imageId: 'sha256:gcr.io/distroless/nodejs22-debian12',
          ref: 'gcr.io/distroless/nodejs22-debian12',
          repoDigests: ['gcr.io/distroless/nodejs22-debian12@sha256:content'],
          storageDriver: 'overlayfs'}]);
    }
    // The compared identity is the registry digest for the ref's own
    // repository, whatever spelling the image store records it in; an
    // image with no repository digest has none.
    assert.deepEqual(baseImageContentDigests('node:22-slim',
      ['docker.io/library/node@sha256:b', 'node@sha256:a', 'other@sha256:c']),
    ['sha256:a', 'sha256:b']);
    assert.deepEqual(baseImageContentDigests('localhost:5000/x:1',
      ['localhost:5000/x@sha256:d']), ['sha256:d']);
    assert.deepEqual(baseImageContentDigests('node:22-slim', []), []);
    assert.deepEqual(baseImageContentDigests('node:22-slim', null), []);
    assert.deepEqual(dockerfileBaseImages('FROM node:22-slim AS builder\n' +
      'RUN x\nfrom --platform=linux/amd64 gcr.io/d:1 as runtime\n' +
      'FROM builder\nFROM node:22-slim\n'), ['node:22-slim', 'gcr.io/d:1']);
  });

  it('a refused request (dirty checkout) builds nothing: a dirty-built ' +
    'image with the clean label cannot exist', async (t) => {
    const daemon = stubDaemon(t, null);
    await assert.rejects(buildImage({docker: TWO_HOSTS, image: 'x:test'},
      false, null, {certification: {labels: {}, refusal: 'checkout is dirty'},
        gitDirty: true, gitHash: SHORT}),
    /certification build refused \(nothing built\): checkout is dirty/u);
    assert.equal(daemon.builds.length, 0);
  });

  it('real git: an ignored file inside the build context makes the ' +
    'checkout dirty (plain `git status --porcelain` would not); one outside ' +
    'the context does not', () => {
    const {dir, sha} = checkout();
    assert.equal(observeCommitIdentity({cwd: dir, requestedSha: sha}).dirty,
      false);
    writeFileSync(join(dir, 'notes.txt'), 'outside the context');
    assert.equal(observeCommitIdentity({cwd: dir, requestedSha: sha}).dirty,
      false);
    writeFileSync(join(dir, 'src', 'ignored.js'), 'export const sneaky = 1;\n');
    assert.equal(git(dir, 'status', '--porcelain'), '');
    const identity = observeCommitIdentity({cwd: dir, requestedSha: sha});
    assert.equal(identity.dirty, true);
    assert.deepEqual(identity.contextDirtyPaths, ['!! src/ignored.js']);
    assert.deepEqual(identity.contextRoots,
      ['Dockerfile', 'package.json', 'src', 'vendor/x']);
  });

  it('real git: the prepared labels carry the full sha, the clean flag, a ' +
    'build id and the digest of every context file (vendor/ and ' +
    'package.json included); a dirty context refuses', async () => {
    const {dir, sha} = checkout();
    const first = await prepareCertificationBuild({buildId: 'b-1', cwd: dir,
      requestedSha: sha, srcFingerprint: 'feedfacecafebeef'});
    assert.equal(first.build.refusal, null);
    assert.equal(first.build.labels[CERTIFICATION_IMAGE_LABEL.SHA], sha);
    assert.equal(first.build.labels[CERTIFICATION_IMAGE_LABEL.CLEAN], 'true');
    assert.equal(first.build.labels[CERTIFICATION_IMAGE_LABEL.BUILD_ID], 'b-1');
    assert.match(first.build.context.digest, /^[0-9a-f]{64}$/u);
    assert.equal(first.build.context.fileCount, 4);
    for (const [path, content] of [['vendor/x/w.bin', 'wasm2'],
      ['package.json', '{"name":"y"}\n']]) {
      writeFileSync(join(dir, path), content);
      git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q',
        '-am', path);
      const next = await prepareCertificationBuild({cwd: dir,
        requestedSha: git(dir, 'rev-parse', 'HEAD'),
        srcFingerprint: 'feedfacecafebeef'});
      assert.notEqual(next.build.context.digest, first.build.context.digest,
        path);
    }
    writeFileSync(join(dir, 'src', 'ignored.js'), 'x');
    const dirty = await prepareCertificationBuild({cwd: dir,
      requestedSha: git(dir, 'rev-parse', 'HEAD'),
      srcFingerprint: 'feedfacecafebeef'});
    assert.match(dirty.build.refusal, /checkout is dirty/u);
  });

  it('after the build the checkout and context are observed again; the ' +
    'image each node runs is inspected through its provider', async () => {
    const {dir, sha} = checkout();
    const certification = await prepareCertificationBuild({cwd: dir,
      requestedSha: sha, srcFingerprint: 'f'});
    writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 2;\n');
    const image = await completeCertificationBuild(certification,
      {imageReadback: [{host: 'h', imageId: 'i', labels: {}}], reused: false},
      {cwd: dir});
    assert.notEqual(image.postBuildContext.digest,
      certification.build.context.digest);
    assert.equal(image.postBuildIdentity.dirty, true);
    const nodes = [{_dockerProvider: {inspectContainer: async () => ({
      Image: 'sha256:a'}), inspectImage: async (id) => ({Config: {Labels: {
      k: id}}, Id: id})}, containerId: 'c0', id: 'n0'},
    {_dockerProvider: {inspectContainer: async () => {
      throw new Error('no such container');
    }}, containerId: 'c1', id: 'n1'}];
    assert.deepEqual(await observeNodeImages(nodes), [
      {error: null, imageId: 'sha256:a', labels: {k: 'sha256:a'},
        nodeId: 'n0'},
      {error: 'no such container', imageId: null, labels: null,
        nodeId: 'n1'}]);
  });
});

describe('the --certify argument (S5)', () => {
  it('no value, an empty value or a non-40-hex value is an error, never ' +
    'an ordinary run', () => {
    const {parseArgs} = createDistributedRunArgHelpers({CLI});
    assert.equal(parseArgs(['--certify']).certify, '');
    assert.equal(parseArgs(['--scenario', 'x']).certify, null);
    assert.equal(certifyArgumentProblem(null), null);
    assert.equal(certifyArgumentProblem('a'.repeat(40)), null);
    for (const value of ['', 'abc', 'A'.repeat(40), '--scenario']) {
      assert.match(certifyArgumentProblem(value),
        /--certify needs the full 40-hex commit sha/u, value);
    }
  });

  it('the runner exits non-zero on a trailing --certify before reading ' +
    'any config', () => {
    const result = spawnSync(process.execPath, ['test/distributed/run.js',
      '--config', join(tmpdir(), 'no-such-certify-config.json'),
      '--certify'], {cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000});
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /--certify needs the full 40-hex commit sha/u);
    assert.doesNotMatch(result.stderr, /no-such-certify-config/u);
  });
});
