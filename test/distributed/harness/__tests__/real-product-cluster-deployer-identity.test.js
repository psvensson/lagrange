// D18/D21/J8: product identity is read from the RUNNING containers and the
// product's own version report; storage is classified from the container's
// mounts. Real entry path: the deployers via the facade; substituted: ssh.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {contentIdentityOf} from '../real-product-identity.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  LAGRANGE_IMAGE_ID,
  createContainerLedger,
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
