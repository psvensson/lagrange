// D12 and the endpoint binding: names describe the deployment that ran (no
// Patroni, no forwarder "App Service"), roles are separate from host count
// and include the container that owns the client endpoint's listener; a
// listener no campaign container owns is endpoint_unbound.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayMap,
  arraySome,
} from '../real-product-captured-intrinsics.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  lagrangeHealthyRules,
  postgresHealthyRules,
  tidbHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';

const HOSTS = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
const OPTS = {lagrangeImage: LAGRANGE_IMAGE,
  readiness: {attempts: 2, intervalMs: 0, timeoutMs: 50, pollIntervalMs: 1}};

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
  const deployment = await deployers.deployComparativeTarget('pg-sync-standby-ha',
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
