// D18/D21/J8: product identity is read from the RUNNING containers and the
// product's own version report; storage is classified from the container's
// mounts. Real entry path: the deployers via the facade; substituted: ssh.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {pinProductIdentity} from '../comparative-benchmark-product-pins.js';
import {resolveLagrangeContainerImage} from '../real-product-deployer-lagrange.js';
import {
  classifyStorage,
  contentIdentityOf,
  observeProductsAfterWindow,
  runClassOf,
} from '../real-product-identity.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  LAGRANGE_IMAGE_ID,
  LAGRANGE_SRC_FINGERPRINT,
  createContainerLedger,
  dockerRules,
  lagrangeHealthyRules,
  postgresHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayMap,
  arraySome,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';

const HOSTS = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
const CLIENT = '10.0.0.9';
const OPTS = {lagrangeImage: LAGRANGE_IMAGE,
  readiness: {stablePolls: 1, attempts: 2, intervalMs: 0, timeoutMs: 30, pollIntervalMs: 1}};
const noSleep = async () => {};

function input(sshRun, extra = {}) {
  return {hosts: HOSTS, clientIp: CLIENT, sshRun, opts: OPTS, campaignId: 'camp-identity',
    sleep: noSleep, ...extra};
}

test('D18: identity comes from docker inspect of the running containers, never the tag',
  {timeout: 300000}, async () => {
    const ledger = createContainerLedger();
    const {sshRun, calls} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
    const deployment = await deployers.deployLagrangeCluster(input(sshRun));
    assert.equal(arraySome(calls, (call) => /docker (image )?inspect[^\n]*psvensson\/lagrange:0\.4\.0/u
      .test(call.command)), false, 'the image tag is never inspected for identity');
    const products = deployment.identity?.products || [];
    assert.equal(products.length, HOSTS.length);
    for (const product of products) {
      assert.equal(product.role, 'lagrange-node');
      assert.ok(ledger.containers.has(product.containerId), 'a container the deployer started');
      assert.match(product.imageId, /^sha256:[0-9a-f]{64}$/u);
      assert.match(product.repoDigest, /^psvensson\/lagrange@sha256:/u);
      assert.equal(product.imageRef, LAGRANGE_IMAGE);
      assert.deepEqual(product.entrypoint, ['/nodejs/bin/node']);
      assert.equal(product.reportedVersion, '0.4.0');
    }
  });

test('D21: data directories inside the container layer make the deployment a smoke run; ' +
  'an explicit storage root makes host volumes', {timeout: 300000}, async () => {
  const ledgerA = createContainerLedger();
  const layer = createScriptedSsh(lagrangeHealthyRules(ledgerA, {hosts: HOSTS}));
  const smoke = await deployers.deployLagrangeCluster(input(layer.sshRun));
  assert.equal(smoke.runClass, 'smoke');
  assert.ok(smoke.storage.length === HOSTS.length &&
    arrayEvery(smoke.storage, (entry) => entry.kind === 'container-layer'));

  const ledgerB = createContainerLedger();
  const volume = createScriptedSsh(lagrangeHealthyRules(ledgerB, {hosts: HOSTS}));
  const durable = await deployers.deployLagrangeCluster(input(volume.sshRun, {
    opts: {...OPTS, storageRoot: '/srv/lagrange-bench', lagrangeVersion: '0.4.0',
      lagrangeImage: `psvensson/lagrange@sha256:${'c'.repeat(64)}`,
      lagrangeImageContent: contentIdentityOf([`sha256:${LAGRANGE_IMAGE_ID.slice(-64)}`])},
  }));
  assert.equal(durable.runClass, 'publishable');
  assert.ok(arrayEvery(durable.storage, (entry) => entry.kind === 'host-volume' &&
    stringStartsWith(entry.source, '/srv/lagrange-bench/camp-identity/')));
});

test('J8: comparator absent at identity time fails identity', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    [/docker inspect --type container/u, (command) => {
      const id = stringSplit(stringTrim(command), /\s+/u).pop();
      ledger.containers.get(id).removed = true;
      return new Error(`Error: No such container: ${id}`);
    }],
    ...postgresHealthyRules(ledger, {standbys: []}),
  ]);
  await assert.rejects(
    deployers.deployPostgresCluster(input(sshRun, {targetId: 'pg-single-primary'})),
    (error) => error.code === 'identity_unverified');
});

test('J8: an emulator answering the version query fails identity', {timeout: 300000},
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([
      [/SELECT version\(\)/u, 'lagrange-benchmark-emulator 1.0'],
      ...postgresHealthyRules(ledger, {standbys: []}),
    ]);
    await assert.rejects(
      deployers.deployPostgresCluster(input(sshRun, {targetId: 'pg-single-primary'})),
      (error) => error.code === 'identity_unverified');
  });

test('J8: a running container of the wrong image fails identity', {timeout: 300000},
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([
      [/docker inspect --type container/u, (command) => JSON.stringify({
        ...JSON.parse(ledger.inspect(command)),
        Config: {Image: 'postgres:16-alpine', Entrypoint: ['docker-entrypoint.sh'], Cmd: []},
      })],
      ...postgresHealthyRules(ledger, {standbys: []}),
    ]);
    await assert.rejects(
      deployers.deployPostgresCluster(input(sshRun, {targetId: 'pg-single-primary'})),
      (error) => error.code === 'identity_unverified');
  });

test('D18: a publishable run refuses a tag-only Lagrange image; a digest reference ' +
  'verifies against the campaign\'s expected version and revision label', async () => {
  const ledger = createContainerLedger();
  const tagOnly = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
  await assert.rejects(deployers.deployLagrangeCluster(input(tagOnly.sshRun, {
    opts: {...OPTS, storageRoot: '/srv/b'}})), (error) => error.code === 'identity_unverified');
  const wrongRevision = createScriptedSsh(lagrangeHealthyRules(createContainerLedger(),
    {hosts: HOSTS}));
  await assert.rejects(deployers.deployLagrangeCluster(input(wrongRevision.sshRun, {
    opts: {...OPTS, lagrangeVersion: '0.4.0', lagrangeRevision: '07206ba1c8'}})),
  (error) => error.code === 'identity_unverified' && /revision/u.test(error.message));
});

test('D18: the Lagrange image is pinned by content; a host where it was docker-loaded ' +
  '(no RepoDigest) runs it by image id with typed provenance', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const registryRef = `psvensson/lagrange@sha256:${'1'.repeat(64)}`;
  const {sshRun, calls} = createScriptedSsh([
    [/docker image inspect/u, (_command, host) => JSON.stringify({Id: LAGRANGE_IMAGE_ID,
      RepoDigests: host === '10.0.0.2' ? [] : [registryRef], Created: '2026-10-30T10:00:00Z',
      Config: {Labels: {}}, RootFS: {Layers: ['sha256:' + '7'.repeat(64)]}})],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const deployment = await deployers.deployLagrangeCluster(input(sshRun, {opts: {...OPTS,
    lagrangeImage: registryRef, lagrangeVersion: '0.4.0',
    lagrangeImageContent: contentIdentityOf(['sha256:' + '7'.repeat(64)]),
    lagrangeImageByHost: {'10.0.0.1': registryRef, '10.0.0.2': LAGRANGE_IMAGE_ID,
      '10.0.0.3': registryRef}}}));
  const runs = arrayFilter(calls, (call) => /^docker run -d /u.test(call.command));
  assert.match(runs[1].command, new RegExp(` ${LAGRANGE_IMAGE_ID}$`, 'u'));
  const loaded = arrayFind(deployment.identity.products, (p) => p.host === '10.0.0.2');
  assert.equal(loaded.repoDigest, null);
  assert.equal(loaded.provenance, `loaded:${LAGRANGE_IMAGE_ID}`);
  const pulled = arrayFind(deployment.identity.products, (p) => p.host === '10.0.0.1');
  assert.equal(pulled.provenance, `registry:${registryRef}`);
});

test('F6: repoDigests records the full list; repoDigest is only the digest of the pinned ' +
  'repository, and none matching is the typed loaded provenance', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const registryRef = `psvensson/lagrange@sha256:${'1'.repeat(64)}`;
  const mirror = `mirror.example/other@sha256:${'2'.repeat(64)}`;
  const foreign = `someone/else@sha256:${'3'.repeat(64)}`;
  const digestsOf = {'10.0.0.1': [mirror, registryRef], '10.0.0.2': [mirror, foreign],
    '10.0.0.3': [registryRef]};
  const {sshRun} = createScriptedSsh([
    [/docker image inspect/u, (_command, host) => JSON.stringify({Id: LAGRANGE_IMAGE_ID,
      RepoDigests: digestsOf[host], Created: '2026-10-30T10:00:00Z',
      Config: {Labels: {}}, RootFS: {Layers: ['sha256:' + '7'.repeat(64)]}})],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const deployment = await deployers.deployLagrangeCluster(input(sshRun, {opts: {...OPTS,
    lagrangeImage: registryRef, lagrangeVersion: '0.4.0',
    lagrangeImageContent: contentIdentityOf(['sha256:' + '7'.repeat(64)])}}));
  const byHost = (host) => arrayFind(deployment.identity.products, (p) => p.host === host);
  const unmatched = byHost('10.0.0.2');
  assert.deepEqual(unmatched.repoDigests, [mirror, foreign]);
  assert.equal(unmatched.repoDigest, null, 'a digest of another repository is never the pin');
  assert.equal(unmatched.provenance, `loaded:${LAGRANGE_IMAGE_ID}`);
  const matchedSecond = byHost('10.0.0.1');
  assert.deepEqual(matchedSecond.repoDigests, [mirror, registryRef]);
  assert.equal(matchedSecond.repoDigest, registryRef);
  assert.equal(matchedSecond.provenance, `registry:${registryRef}`);
  assert.equal(byHost('10.0.0.3').repoDigest, registryRef);
});

test('D18: image content identity is the digest of the ordered RootFS diff_ids, the same ' +
  'on a containerd store (.Id = manifest digest) and an overlay2 store (.Id = config ' +
  'digest); .Id is never compared across stores', {timeout: 300000}, async () => {
  const layers = ['sha256:' + '1'.repeat(64), 'sha256:' + '2'.repeat(64)];
  const content = contentIdentityOf(layers);
  const facts = (host, otherLayers = null) => JSON.stringify({
    Id: host === '10.0.0.2' ? `sha256:${'9'.repeat(64)}` : LAGRANGE_IMAGE_ID,
    RepoDigests: host === '10.0.0.2' ? [] : [`psvensson/lagrange@sha256:${'1'.repeat(64)}`],
    RootFS: {Type: 'layers', Layers: otherLayers || layers}, Config: {Labels: {}},
    Created: '2026-10-30T10:00:00Z'});
  const run = async (layersOf) => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([
      [/docker image inspect/u, (_command, host) => facts(host, layersOf(host))],
      [/docker info --format/u, (_command, host) => (host === '10.0.0.2' ?
        'overlay2|[["Backing Filesystem","extfs"]]' :
        'overlayfs|[["driver-type","io.containerd.snapshotter.v1"]]')],
      ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
    ]);
    return deployers.deployLagrangeCluster(input(sshRun, {opts: {...OPTS,
      lagrangeImageContent: content, lagrangeVersion: '0.4.0'}}));
  };
  const deployment = await run(() => null);
  const stores = arrayMap(deployment.identity.products, (p) => p.imageStore);
  assert.deepEqual(stores, ['containerd', 'overlay2', 'containerd']);
  assert.ok(arrayEvery(deployment.identity.products, (p) => p.contentIdentity === content));
  await assert.rejects(run((host) => (host === '10.0.0.3' ? [layers[0]] : null)),
    (error) => error.code === 'identity_unverified');
});

// Live campaign bench-live-20261101-b-r4: postgres:17-alpine declares no
// labels, and on a containerd image store `docker image inspect` then omits
// Config.Labels; identity refused the arm (`answered without Config.Labels`).
// Labels are optional image metadata: an image without them is recorded as
// declaring none (null), never refused and never given substitute labels.
test('D18: an image that declares no labels is recorded as such, not refused',
  {timeout: 300000}, async () => {
    const ledger = createContainerLedger();
    const unlabelled = (command) => {
      const image = JSON.parse(ledger.repoDigests(command));
      delete image.Config.Labels;
      return JSON.stringify(image);
    };
    const {sshRun} = createScriptedSsh([[/docker image inspect/u, unlabelled],
      ...postgresHealthyRules(ledger, {standbys: []})]);
    const deployment = await deployers.deployComparativeTarget('pg-single-primary',
      input(sshRun));
    for (const product of deployment.identity.products) {
      assert.equal(product.imageLabels, null);
      assert.match(product.imageId, /^sha256:[0-9a-f]{64}$/u);
    }
  });

// After the window: only docker's explicit "No such container" answer is an
// absent container (compareProductIdentity reads it as container-absent); a
// failed ssh or inspection is the harness's identity_unverified, never absence.
test('after the window an unanswered inspection is identity_unverified, not an absent ' +
  'container', async () => {
  const products = [{role: 'node', host: '10.0.0.1', containerId: 'c1', reportedVersion: '1'},
    {role: 'node', host: '10.0.0.2', containerId: 'c2', reportedVersion: '1'}];
  const gone = createScriptedSsh([[/docker inspect --type container/u, (_command, host) =>
    (host === '10.0.0.1' ? new Error('Error: No such container: c1') :
      new Error('ssh: connect to host 10.0.0.2 port 22: Connection timed out'))]]);
  await assert.rejects(observeProductsAfterWindow({sshRun: gone.sshRun, opts: {}, products}),
    (error) => error.code === 'identity_unverified' && /timed out/u.test(error.message));
  const absentOnly = createScriptedSsh([[/docker inspect --type container/u,
    new Error('Error: No such container: c1')]]);
  assert.deepEqual(await observeProductsAfterWindow({sshRun: absentOnly.sshRun, opts: {},
    products: [products[0]]}), []);
});

// The guide's content-identity recipe, executed as written over a stub docker
// that answers a fixture layer list as `docker image inspect --format
// '{{json .RootFS.Layers}}'` does (Go JSON plus a trailing newline), must equal
// contentIdentityOf of the same list: the documentation and the owner cannot drift.
const RECIPE_LINE =
  /^printf %s "\$\(docker image inspect --format '\{\{json \.RootFS\.Layers\}\}' /u;

test('the reproduction guide\'s content-identity recipe equals contentIdentityOf', () => {
  const guide = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../../../../docs/benchmarks/cloud-reproduction-guide.md'), 'utf8');
  const recipe = arrayFind(stringSplit(guide, '\n'), (line) => RECIPE_LINE.test(line));
  assert.equal(typeof recipe, 'string', 'the guide documents the recipe');
  const layers = ['sha256:' + '1'.repeat(64), 'sha256:' + '2'.repeat(64),
    'sha256:' + '3'.repeat(64)];
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'content-identity-recipe-'));
  try {
    fs.writeFileSync(path.join(bin, 'docker'),
      `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(layers)}'\n`, {mode: 0o755});
    const digest = execFileSync('/bin/bash', ['-c', recipe],
      {env: {...process.env, PATH: `${bin}:${process.env.PATH}`}, encoding: 'utf8'});
    assert.equal(`sha256:${stringSplit(digest, ' ')[0]}`, contentIdentityOf(layers));
  } finally {
    fs.rmSync(bin, {recursive: true, force: true});
  }
});

// D34 (live campaign bench-live-20261101-b-r7): postgres:17-alpine declares
// VOLUME /var/lib/postgresql/data, so docker gave the smoke arm an anonymous
// volume the harness never asked for; it was classified host-volume and the
// run recorded as publishable, and the durability proof ran on it. Only an
// explicit host directory the deployer mounted (a bind mount under
// --storage-root) is persistent storage; an anonymous volume lives and dies
// with its container.
test('D34: only an explicit host bind mount is persistent storage', async () => {
  const product = (mounts) => ({role: 'postgres-primary', host: '10.0.0.1',
    containerId: 'c1', mounts});
  const anonymous = classifyStorage(product([{type: 'volume',
    source: '/var/lib/docker/volumes/c9ed/_data', destination: '/var/lib/postgresql/data'}]),
  '/var/lib/postgresql/data');
  assert.equal(anonymous.kind, 'container-layer');
  assert.equal(runClassOf([anonymous]), 'smoke');
  const bound = classifyStorage(product([{type: 'bind', source: '/srv/bench/c/pg',
    destination: '/var/lib/postgresql/data'}]), '/var/lib/postgresql/data');
  assert.equal(bound.kind, 'host-volume');
  assert.equal(runClassOf([bound]), 'publishable');
});

// D33 (live campaign bench-live-20261101-b-r7): the products inspected after
// the window carried the version from before it but dropped the reason it was
// unanswered, so the readiness-exhausted Lagrange record failed validation
// (identity.productsAfterWindow[0].reportedVersionError). The window does not
// change what the product answered: version and reason travel together.
test('after the window a product keeps its version and the reason it was unanswered',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([...dockerRules(ledger)]);
    const id = stringTrim(ledger.run('docker run -d --name bench-c-lagrange-node-1 ' +
      '--network host psvensson/lagrange:0.4.0', '10.0.0.1'));
    const [after] = await observeProductsAfterWindow({sshRun, opts: {}, products: [{
      role: 'lagrange-node', host: '10.0.0.1', containerId: id, reportedVersion: null,
      reportedVersionError: 'facts answered {"status":200,"error":null,"version":"absent"}'}]});
    assert.equal(after.reportedVersion, null);
    assert.equal(after.reportedVersionError,
      'facts answered {"status":200,"error":null,"version":"absent"}');
  });

test('resolveLagrangeContainerImage pins by @sha256 digest and refuses unpinned remote GCP tags',
  () => {
    const digest = `sha256:${'d'.repeat(64)}`;
    assert.equal(resolveLagrangeContainerImage({lagrangeImage: 'psvensson/lagrange:0.4.0',
      lagrangeImageDigest: digest}), `psvensson/lagrange@${digest}`);
    assert.equal(resolveLagrangeContainerImage({
      lagrangeImage: `psvensson/lagrange:0.4.0@${digest}`}), `psvensson/lagrange@${digest}`);
    assert.throws(() => resolveLagrangeContainerImage({
      lagrangeImage: 'psvensson/lagrange:0.4.0', executionTarget: 'gcp'}),
    (error) => error.code === 'identity_unverified');
    assert.throws(() => resolveLagrangeContainerImage({
      lagrangeImage: 'psvensson/lagrange:0.4.0', lagrangeImageDigest: 'sha256:bad'}),
    (error) => error.code === 'identity_unverified');
  });

test('bootProvenance is preserved after the window and verified against expectedSrcFingerprint',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
    const deployment = await deployers.deployLagrangeCluster(input(sshRun, {
      opts: {...OPTS, expectedSrcFingerprint: LAGRANGE_SRC_FINGERPRINT}}));
    const after = await observeProductsAfterWindow({sshRun, opts: {},
      products: deployment.identity.products});
    for (const product of after) {
      assert.equal(product.bootProvenance?.bootedSrcFingerprint, LAGRANGE_SRC_FINGERPRINT);
    }
    const pins = pinProductIdentity({targetId: 'lagrange', product: 'lagrange',
      products: deployment.identity.products});
    assert.equal(pins[0].bootProvenance?.bootedSrcFingerprint, LAGRANGE_SRC_FINGERPRINT);
    assert.throws(() => pinProductIdentity({targetId: 'lagrange', product: 'lagrange',
      products: [deployment.identity.products[0], {...deployment.identity.products[1],
        bootProvenance: {...deployment.identity.products[1].bootProvenance,
          bootedSrcFingerprint: `sha256:${'0'.repeat(64)}`}}]}),
    (error) => error.code === 'identity_unverified');
    const wrongLedger = createContainerLedger();
    const wrongSsh = createScriptedSsh(lagrangeHealthyRules(wrongLedger, {hosts: HOSTS}));
    await assert.rejects(deployers.deployLagrangeCluster(input(wrongSsh.sshRun, {
      opts: {...OPTS, expectedSrcFingerprint: `sha256:${'0'.repeat(64)}`}})),
    (error) => error.code === 'identity_unverified');
  });
