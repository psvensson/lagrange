// D18/D21/J8: product identity is read from the RUNNING containers and the
// product's own version report; storage is classified from the container's
// mounts. Real entry path: the deployers via the facade; substituted: ssh.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  lagrangeHealthyRules,
  postgresHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayEvery,
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
    opts: {...OPTS, storageRoot: '/srv/lagrange-bench'},
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
