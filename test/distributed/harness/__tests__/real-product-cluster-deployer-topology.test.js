// D12 and the endpoint binding: names describe the deployment that ran (no
// Patroni, no forwarder "App Service"), roles are separate from host count
// and include the container that owns the client endpoint's listener; a
// listener no campaign container owns is endpoint_unbound.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayFindIndex,
  arrayMap,
  arraySome,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {contentIdentityOf} from '../real-product-identity.js';
import {
  LAGRANGE_IMAGE,
  LAGRANGE_IMAGE_ID,
  createContainerLedger,
  http,
  lagrangeHealthyRules,
  postgresHealthyRules,
  tidbHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';

const HOSTS = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
const OPTS = {lagrangeImage: LAGRANGE_IMAGE,
  readiness: {stablePolls: 1, attempts: 2, intervalMs: 0, timeoutMs: 50, pollIntervalMs: 1}};

function input(sshRun) {
  return {hosts: HOSTS, clientIp: '10.0.0.9', sshRun, opts: OPTS, campaignId: 'camp-topo',
    sleep: async () => {}};
}

function assertEndpointInRoles(deployment) {
  assert.ok(arraySome(deployment.roles,
    (role) => role.containerId === deployment.endpoint.containerId &&
      role.host === deployment.endpoint.host), 'endpoint container is a recorded role');
}

test('Lagrange: the PG-wire listener host is a named role bound to its container',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
    const deployment = await deployers.deployComparativeTarget('lagrange', input(sshRun));
    const listener = arrayFind(deployment.roles, (role) => role.role === 'sys-postgres-wire');
    assert.equal(listener.host, '10.0.0.1');
    assert.equal(deployment.endpoint.port, 5433);
    assertEndpointInRoles(deployment);
    assert.equal(arrayFilter(deployment.roles, (role) => role.role === 'lagrange-node').length,
      3);
    assert.ok(deployment.placement.replicasByPartition[0].leaderHost);
  });

test('a listener owned by no campaign container is endpoint_unbound', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([[/--pid container:/u, 'owner=no'],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS})]);
  await assert.rejects(deployers.deployComparativeTarget('lagrange', input(sshRun)),
    (error) => error.code === 'endpoint_unbound');
});

test('D12: the PostgreSQL HA arm is a primary with two synchronous streaming standbys, ' +
  'clients connect to the primary, access is scoped scram', async () => {
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh(postgresHealthyRules(ledger));
  const deployment = await deployers.deployComparativeTarget('pg-patroni-sync-ha-rf3',
    input(sshRun));
  assert.equal(deployment.topology.description,
    'primary + 2 synchronous streaming standbys');
  assert.equal(deployment.topology.clientPath, 'direct-to-primary');
  assert.equal(deployment.topology.haManager, null);
  assert.deepEqual(arrayMap(deployment.roles, (role) => [role.role, role.host]), [
    ['postgres-primary', '10.0.0.1'], ['postgres-standby', '10.0.0.2'],
    ['postgres-standby', '10.0.0.3']]);
  assertEndpointInRoles(deployment);
  assert.equal(deployment.readiness.evidence.synchronous.evidence.synchronousStandbyNames,
    'FIRST 1 (s1, s2)');
  assert.ok(arrayEvery(deployment.accessEvidence.hbaRules,
    (rule) => !/trust|0\.0\.0\.0\/0/u.test(rule)));
  assert.equal(arraySome(calls, (call) => /proxy|forward|net\.createServer/u.test(call.text)),
    false);
});

test('TiDB: PD, three TiKV stores on three hosts and TiDB, versions from the product',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh(tidbHealthyRules(ledger));
    const deployment = await deployers.deployComparativeTarget('tidb-tikv', input(sshRun));
    const tikv = arrayFilter(deployment.roles, (role) => role.role === 'tikv');
    assert.deepEqual(arrayMap(tikv, (role) => role.host), HOSTS);
    assertEndpointInRoles(deployment);
    for (const product of deployment.identity.products) {
      assert.match(product.reportedVersion, /8\.5\.8/u, product.role);
    }
  });

// The TiDB readiness client (mysql:8.4.11) is a lifecycle tool, never part of
// the measured topology: it runs on the TiDB SQL host, never the load
// generator (which holds no product or client image), is recorded as the
// role `tidb-readiness-client` with its container identity, and is exited
// before measurement; a later observation starts it, reads and stops it again.
test('TiDB: the readiness client runs on the TiDB host and is exited before measurement',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun, calls} = createScriptedSsh(tidbHealthyRules(ledger));
    const deployment = await deployers.deployComparativeTarget('tidb-tikv', input(sshRun));
    const tidb = arrayFind(deployment.roles, (role) => role.role === 'tidb');
    const client = arrayFind(deployment.roles, (role) => role.role === 'tidb-readiness-client');
    assert.equal(client.host, tidb.host);
    assert.match(client.containerId, /^[0-9a-f]{64}$/u);
    assert.equal(client.imageRef, 'mysql:8.4.11');
    assert.match(client.imageId, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(client.measured, false);
    assert.equal(client.stateBeforeMeasurement, 'exited');
    assert.equal(ledger.containers.get(client.containerId).running, false);
    assert.equal(arraySome(deployment.roles, (role) => role.host === '10.0.0.9'), false);
    assert.equal(arraySome(calls, (call) => call.host === '10.0.0.9' &&
      /docker (run|exec|start)/u.test(call.command)), false);
    const before = calls.length;
    await deployment.operations.observeRoles();
    const later = arrayMap(calls.slice(before), (call) => call.command);
    assert.ok(arraySome(later, (command) => command === `docker start ${client.containerId}`));
    assert.ok(arraySome(later, (command) =>
      command === `docker stop -t 0 ${client.containerId}`));
    assert.equal(ledger.containers.get(client.containerId).running, false);
    const rechecked = await deployment.operations.awaitReady();
    assert.equal(rechecked.pd.state, 'ready');
    assert.equal(rechecked.sql.clientContainerId, client.containerId);
    assert.equal(ledger.containers.get(client.containerId).running, false);
  });

// Live campaign bench-live-20261101-b-r2: the Lagrange seed exited in seconds
// with `EACCES: mkdir '/var/lib/lagrange-data'`; the image runs as a non-root
// USER and only the directory its Dockerfile hands to that user is writable.
// The deployer's DATA_DIR is that directory (a volume, when given, mounts
// there too).
test('Lagrange: DATA_DIR is the data directory the image gives its runtime user', async () => {
  const dockerfile = fs.readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8');
  const user = /^USER (\S+)$/mu.exec(dockerfile)[1];
  const owned = new RegExp(`chown ${user} (\\S+)`, 'u').exec(dockerfile)[1];
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
  await deployers.deployComparativeTarget('lagrange', input(sshRun));
  const runs = arrayFilter(calls, (call) => /^docker run -d .*lagrange-node/u.test(call.command));
  assert.equal(runs.length, 3);
  for (const call of runs) {
    assert.match(call.command, new RegExp(` -e DATA_DIR=${owned} `, 'u'), call.command);
  }
  // With --storage-root the data directory is that explicit host volume. A
  // publishable run pins the image by content (the fixture image's diff_ids).
  const volume = createScriptedSsh(lagrangeHealthyRules(createContainerLedger(),
    {hosts: HOSTS}));
  const content = contentIdentityOf([`sha256:${LAGRANGE_IMAGE_ID.slice(-64)}`]);
  await deployers.deployComparativeTarget('lagrange', {...input(volume.sshRun),
    opts: {...OPTS, storageRoot: '/srv/bench', lagrangeImageContent: content}});
  const mounted = arrayFilter(volume.calls, (one) => /^docker run -d .*lagrange-node/u
    .test(one.command));
  assert.equal(mounted.length, 3);
  for (const call of mounted) {
    assert.match(call.command, new RegExp(` -v /srv/bench/camp-topo/lagrange-\\d:${owned} `,
      'u'), call.command);
  }
});

// Lab experiment 16dce80a (tv-dator, 2026-11-14): dockerd creates a missing
// bind-mount source as 0:0 755, so the image's runtime user (10001) could not
// write <storage-root>/<campaign>/lagrange-N (EACCES); the same directory
// created beforehand and chowned to that user through a throwaway container
// was writable. With --storage-root each node's directory is created with the
// runtime user's ownership on its host before its container starts; without
// it no directory is made.
test('Lagrange: with --storage-root each node directory is owned by the runtime user ' +
  'before its container starts', async () => {
  const dockerfile = fs.readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8');
  const user = /^USER (\S+)$/mu.exec(dockerfile)[1];
  const content = contentIdentityOf([`sha256:${LAGRANGE_IMAGE_ID.slice(-64)}`]);
  const volume = createScriptedSsh(lagrangeHealthyRules(createContainerLedger(),
    {hosts: HOSTS}));
  await deployers.deployComparativeTarget('lagrange', {...input(volume.sshRun),
    opts: {...OPTS, storageRoot: '/srv/bench', lagrangeImageContent: content}});
  for (let index = 0; index < HOSTS.length; index += 1) {
    const label = `lagrange-${index + 1}`;
    const step = `mkdir -p /campaign/${label} && chown ${user} /campaign/${label}`;
    const throwaway = /^docker run --rm .* --pull=never .*-v '?\/srv\/bench\/camp-topo:\/campaign'? /u;
    const prepare = arrayFindIndex(volume.calls, (call) => call.host === HOSTS[index] &&
      throwaway.test(call.command) && stringIncludes(call.command, step));
    const start = arrayFindIndex(volume.calls, (call) => call.host === HOSTS[index] &&
      /^docker run -d .*lagrange-node/u.test(call.command));
    assert.ok(prepare >= 0, `${label}: its directory is prepared on ${HOSTS[index]}`);
    assert.ok(prepare < start, `${label}: before its container starts`);
  }
  const plain = createScriptedSsh(lagrangeHealthyRules(createContainerLedger(), {hosts: HOSTS}));
  await deployers.deployComparativeTarget('lagrange', input(plain.sshRun));
  assert.equal(arraySome(plain.calls, (call) => stringIncludes(call.command, 'chown')), false);
});

// Coordinator decision 2 (2026-11-02): an exhausted Lagrange arm's version is
// null only with the reason the product did not answer it (live campaign
// bench-live-20261101-b-r6: node 2 never ready, its facts endpoint silent).
test('Lagrange: an unanswered version is null with the product\'s non-answer as reason',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([
      [(command) => stringIncludes(command, '//10.0.0.2:8080/readyz'), http(503, {ready: false,
        phase: 'DEGRADED', reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING']})],
      [(command) => stringIncludes(command, '//10.0.0.2:8080/management/v1/facts'),
        http(503, {error: 'not ready'})],
      ...lagrangeHealthyRules(ledger, {hosts: HOSTS})]);
    const error = await deployers.deployComparativeTarget('lagrange', input(sshRun))
      .then(() => null, (failure) => failure);
    assert.equal(error?.code, 'readiness_exhausted');
    const products = error.deployment.identity.products;
    const answered = arrayFind(products, (one) => one.host === '10.0.0.1');
    assert.equal(answered.reportedVersion, '0.4.0');
    assert.equal(answered.reportedVersionError, null);
    const silent = arrayFind(products, (one) => one.host === '10.0.0.2');
    assert.equal(silent.reportedVersion, null);
    assert.match(silent.reportedVersionError, /"status":503/u);
  });

test('Lagrange: starts all joining nodes before polling joiner /readyz so 3-node priority spread can converge',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun, calls} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
    await deployers.deployComparativeTarget('lagrange', input(sshRun));
    const thirdNodeStartIndex = arrayFindIndex(calls, (call) =>
      call.host === '10.0.0.3' && /^docker run -d .*lagrange-node-3/u.test(call.command));
    const firstJoinerReadyPollIndex = arrayFindIndex(calls, (call) =>
      stringIncludes(call.command, '//10.0.0.2:8080/readyz'));
    assert.ok(thirdNodeStartIndex > 0, 'third lagrange-node container must be started');
    assert.ok(firstJoinerReadyPollIndex > thirdNodeStartIndex,
      'joiner /readyz must not be polled before all joining node containers are started');
    const factsCalls = arrayFilter(calls, (call) =>
      stringIncludes(call.command, ':8080/management/v1/facts'));
    assert.ok(factsCalls.length > 0, 'must poll /management/v1/facts');
    for (const call of factsCalls) {
      assert.match(call.command, /-u 'lagrange-harness-user:lagrange-harness-password'/u,
        'facts endpoint requires HTTP Basic auth');
    }
  });
