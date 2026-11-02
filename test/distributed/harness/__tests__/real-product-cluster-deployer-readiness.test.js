// D04/D05/J7: readiness consumes the documented product contracts and fails
// closed. Real entry path: the per-product deployers through the facade the
// runner imports; substituted: the ssh transport (scripted answers).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {evaluateLagrangeClusterReadiness} from '../real-product-lagrange-readiness-evaluation.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  dockerRules,
  http,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFindIndex,
  arrayIncludes,
  arrayMap,
  arraySome,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';

const HOSTS = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
const CLIENT = '10.0.0.9';
const CAMPAIGN = 'camp-readiness';
const FAST = {lagrangeImage: LAGRANGE_IMAGE,
  readiness: {stablePolls: 1, attempts: 3, intervalMs: 0, timeoutMs: 30, pollIntervalMs: 1}};
const noSleep = async () => {};

function baseInput(sshRun) {
  return {hosts: HOSTS, clientIp: CLIENT, sshRun, opts: FAST, campaignId: CAMPAIGN,
    sleep: noSleep};
}

test('D05/J7: Lagrange readiness never reached throws readiness_exhausted with the ' +
  'last diagnostic and measurement never starts', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const notReady = http(503, {ready: false, phase: 'init', reasons: ['seed-contact']});
  const {sshRun, calls} = createScriptedSsh([
    ...dockerRules(ledger),
    [/curl/u, notReady],
  ]);
  await assert.rejects(deployers.deployLagrangeCluster(baseInput(sshRun)), (error) => {
    assert.equal(error.code, 'readiness_exhausted');
    assert.match(JSON.stringify(error.diagnostic), /seed-contact/u);
    // Exhausted before the product named its client endpoint.
    assert.equal(error.deployment.endpoint, null);
    assert.equal(error.deployment.readiness.state, 'exhausted');
    return true;
  });
  assert.equal(arraySome(calls, (call) => /sys-postgres-wire\/scale/u.test(call.command)), false,
    'no public data path is opened on an unready cluster');
  assert.equal(arraySome(calls, (call) => /^docker run --rm/u.test(call.command)), false,
    'no workload or proof process starts on an unready cluster');
});

test('D05: PostgreSQL pg_isready exhaustion throws readiness_exhausted', {timeout: 300000},
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([
      ...dockerRules(ledger),
      [/pg_isready/u, new Error('127.0.0.1:5432 - no response (exit 2)')],
    ]);
    await assert.rejects(
      deployers.deployPostgresCluster({...baseInput(sshRun), targetId: 'pg-single-primary'}),
      (error) => {
        assert.equal(error.code, 'readiness_exhausted');
        assert.match(JSON.stringify(error.diagnostic), /no response/u);
        // The started primary is described, its endpoint named.
        assert.equal(error.deployment.readiness.state, 'exhausted');
        assert.equal(error.deployment.endpoint.containerId,
          error.deployment.roles[0].containerId);
        assert.equal(error.deployment.identity.products.length, 1);
        // The scripted product answers no version: null with why, never ''.
        assert.equal(error.deployment.identity.products[0].reportedVersion, null);
        assert.equal(typeof error.deployment.identity.products[0].reportedVersionError,
          'string');
        return true;
      });
  });

test('D05: TiDB that never reports 3 Up stores throws readiness_exhausted',
  {timeout: 300000}, async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([
      ...dockerRules(ledger),
      [/^docker exec \S+ 'mysql'/u, '0\n__exit_code=0'],
      [/curl/u, http(200, {health: true})],
    ]);
    await assert.rejects(deployers.deployTiDbCluster(baseInput(sshRun)), (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.deployment.readiness.state, 'exhausted');
      // PD never became ready: only PD was started, no client endpoint named.
      assert.deepEqual(arrayMap(error.deployment.roles, (role) => role.role), ['pd']);
      assert.equal(error.deployment.endpoint, null);
      return true;
    });
  });

test('D04: a throwing semantic-proof path never yields a passed count; the deployer ' +
  'runs no ad-hoc proof statements', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh([
    [/^docker run --rm[^\n]*eval\(Buffer/u, new Error('proof client failed')],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const result = await deployers.deployLagrangeCluster(baseInput(sshRun));
  const claimed = arrayFilter(arrayMap([].concat(result), (node) => node?.semanticProofsPassed),
    (value) => value !== undefined);
  assert.deepEqual(claimed, [], 'semantic evidence comes only from the semantic gate');
  assert.equal(arraySome(calls, (call) => stringIncludes(call.text, 'bench_proof')), false);
});

test('live diagnosis: /health and /readyz healthy but a node lease lapsed and a partition ' +
  'without a leader - readiness_exhausted names the denials, nothing is measured',
{timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const nodeIds = ['00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
  const {sshRun, calls} = createScriptedSsh([
    [/FROM nodes'/u, 'node_id|status|connection_state|ready_lease_expires_at|last_heartbeat\n' +
      `${nodeIds[0]}|active|ready|${Date.now() + 60000}|${Date.now() - 600000}\n` +
      `${nodeIds[1]}|active|ready|${Date.now() - 60000}|${Date.now() - 1000}\n` +
      `${nodeIds[2]}|active|connecting|${Date.now() + 60000}|${Date.now() - 1000}`],
    [/FROM services WHERE/u, 'partition_id|node_id|status|raft_role\n' +
      `p-stock|${nodeIds[0]}|active|follower`],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  await assert.rejects(deployers.deployLagrangeCluster(baseInput(sshRun)), (error) => {
    assert.equal(error.code, 'readiness_exhausted');
    assert.equal(error.diagnostic.component, 'lagrange-system-tables');
    const denials = error.diagnostic.last.denials;
    assert.ok(arrayIncludes(denials, `node_ready_lease_or_status:${nodeIds[1]}`));
    assert.ok(arrayIncludes(denials, `node_connection_not_ready:${nodeIds[2]}`));
    assert.ok(arrayIncludes(denials, `node_heartbeat_stale:${nodeIds[0]}`),
      'a live lease on a heartbeat older than the product lease is stale (live diagnosis)');
    assert.ok(arrayIncludes(denials, 'partition_not_routable:p-warehouse'));
    // The exhausted formation is described from its running containers: the
    // campaign records the complete product failure, not a run without a product.
    const described = error.deployment;
    assert.equal(described.readiness.state, 'exhausted');
    assert.equal(described.roles.length, HOSTS.length);
    assert.equal(described.identity.products.length, HOSTS.length);
    assert.ok(arrayEvery(described.identity.products, (product) =>
      /^sha256:[0-9a-f]{64}$/u.test(product.imageId) &&
      typeof product.reportedVersion === 'string'));
    assert.ok(arraySome(described.roles, (role) =>
      role.containerId === described.endpoint.containerId &&
      role.host === described.endpoint.host), 'the named listener is a node container');
    return true;
  });
  assert.equal(arraySome(calls, (call) => /bench_readiness_probe/u.test(call.command)), false);
});

test('after the canonical load every partition of every created table must be routable ' +
  'and replicated', async () => {
  const {evaluateLagrangeClusterReadiness} =
    await import('../real-product-lagrange-readiness-evaluation.js');
  const now = Date.now();
  const nodes = [{node_id: 'a', status: 'active', connection_state: 'ready',
    ready_lease_expires_at: String(now + 1000), last_heartbeat: String(now - 10)},
  {node_id: 'b', status: 'active', connection_state: 'ready',
    ready_lease_expires_at: String(now + 1000), last_heartbeat: String(now - 10)}];
  const verdict = evaluateLagrangeClusterReadiness({nodes, now,
    endpoints: [{service_id: 'sys-postgres-wire', health_status: 'healthy'}],
    partitions: [{partition_id: 'p1', table_name: 'stock', replica_count: '2',
      leader_node_id: 'a'}],
    services: [{partition_id: 'p1', node_id: 'a', status: 'active', raft_role: 'leader'}],
    expectedNodeIds: ['a', 'b'], requiredServiceIds: ['sys-postgres-wire'],
    requiredTables: ['stock', 'item']});
  assert.equal(verdict.ready, false);
  assert.deepEqual(verdict.denials, ['table_without_partitions:item',
    'partition_under_replicated:p1']);
});

// F1: the replication target is the partition's own replica_count; an absent or
// unreadable count is a typed denial, never a lowered target, and the cluster
// size never lowers it either.
function replicationVerdict({replicaCount, activeNodeIds, expectedNodeIds}) {
  const now = Date.now();
  const nodes = arrayMap(expectedNodeIds, (nodeId) => ({node_id: nodeId, status: 'active',
    connection_state: 'ready', ready_lease_expires_at: String(now + 1000),
    last_heartbeat: String(now - 10)}));
  const partition = {partition_id: 'p1', table_name: 'stock', leader_node_id: 'a'};
  if (replicaCount !== undefined) partition.replica_count = replicaCount;
  return evaluateLagrangeClusterReadiness({nodes, now,
    endpoints: [{service_id: 'sys-postgres-wire', health_status: 'healthy'}],
    partitions: [partition],
    services: arrayMap(activeNodeIds, (nodeId, index) => ({partition_id: 'p1',
      node_id: nodeId, status: 'active', raft_role: index === 0 ? 'leader' : 'follower'})),
    expectedNodeIds, requiredServiceIds: ['sys-postgres-wire'], requiredTables: ['stock']});
}

test('F1: a missing replica_count is a typed readiness denial, never a lowered target', () => {
  const verdict = replicationVerdict({replicaCount: undefined, activeNodeIds: ['a'],
    expectedNodeIds: ['a', 'b', 'c']});
  assert.equal(verdict.ready, false);
  assert.deepEqual(verdict.denials, ['partition_replica_count_unreadable:p1']);
});

test('F1: a non-numeric replica_count is a typed readiness denial', () => {
  for (const replicaCount of ['abc', '', '0', '-1', '2.5', null]) {
    const verdict = replicationVerdict({replicaCount, activeNodeIds: ['a'],
      expectedNodeIds: ['a', 'b', 'c']});
    assert.equal(verdict.ready, false, `replica_count ${JSON.stringify(replicaCount)}`);
    assert.deepEqual(verdict.denials, ['partition_replica_count_unreadable:p1'],
      `replica_count ${JSON.stringify(replicaCount)}`);
  }
});

test('F1: RF=3 with two active services is under-replicated, whatever the cluster size', () => {
  for (const expectedNodeIds of [['a', 'b', 'c'], ['a', 'b']]) {
    const verdict = replicationVerdict({replicaCount: '3', activeNodeIds: ['a', 'b'],
      expectedNodeIds});
    assert.equal(verdict.ready, false, `expected nodes ${expectedNodeIds.length}`);
    assert.deepEqual(verdict.denials, ['partition_under_replicated:p1'],
      `expected nodes ${expectedNodeIds.length}`);
  }
  assert.deepEqual(replicationVerdict({replicaCount: '3', activeNodeIds: ['a', 'b', 'c'],
    expectedNodeIds: ['a', 'b', 'c']}).denials, []);
});

test('live diagnosis 2026-11-01: serve lane closed (priority control-plane recovery ' +
  'pending) never becomes ready; the exhaustion carries the reason codes and elapsed time',
{timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    [/\/api\/admin\/control-snapshot/u, (command) => {
      const nodeId = `00000000-0000-4000-8000-00000000000${1 + arrayFindIndex(HOSTS, (host) =>
        stringIncludes(command, `//${host}:`))}`;
      return http(200, {replicaOperations: {inFlightCount: 2}, controlPlaneDiagnostics: {
        readinessByNodeId: {[nodeId]: {serveEligible: false,
          reasonCodes: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING']}}}});
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  await assert.rejects(deployers.deployLagrangeCluster(baseInput(sshRun)), (error) => {
    assert.equal(error.code, 'readiness_exhausted');
    const denials = error.diagnostic.last.denials;
    assert.ok(arrayIncludes(denials, 'serve_not_eligible:00000000-0000-4000-8000-000000000001'));
    assert.ok(arrayIncludes(denials, 'serve_denied:00000000-0000-4000-8000-000000000002:' +
      'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'));
    assert.ok(arrayIncludes(denials, 'replica_operations_in_flight:' +
      '00000000-0000-4000-8000-000000000003:2'));
    assert.ok(Number.isFinite(error.diagnostic.elapsedMs));
    return true;
  });
});

test('readiness must hold for the stable window: a flapping verdict resets the count',
  async () => {
    const {pollReadiness} = await import('../real-product-readiness.js');
    const verdicts = [true, false, true, true];
    const ready = await pollReadiness({component: 'x', attempts: 4, intervalMs: 0,
      sleep: async () => {}, stablePolls: 2,
      probe: async () => ({ready: verdicts.shift(), diagnostic: null})});
    assert.equal(ready.attempts, 4);
    assert.ok(Number.isFinite(ready.timeToReadyMs));
    const flapping = [true, false, true, false];
    await assert.rejects(pollReadiness({component: 'x', attempts: 4, intervalMs: 0,
      sleep: async () => {}, stablePolls: 2,
      probe: async () => ({ready: flapping.shift(), diagnostic: null})}),
    (error) => error.code === 'readiness_exhausted');
  });

test('predicate step 6: the probe INSERT must report one row, and a single PG-wire ' +
  'listener is recorded as a typed visibility limitation, never as pass', {timeout: 300000},
async () => {
  const ledger = createContainerLedger();
  const healthy = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
  const deployment = await deployers.deployLagrangeCluster(baseInput(healthy.sshRun));
  const probe = deployment.readiness.evidence.probe.evidence;
  assert.equal(probe.insertRowCount, 1);
  assert.deepEqual(probe.visibility, {status: 'single-listener',
    readFrom: ['00000000-0000-4000-8000-000000000001'],
    notReadFrom: ['00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003']});
  const zeroRows = createScriptedSsh([[/INSERT INTO bench_readiness_probe/u, 'INSERT 0 0'],
    ...lagrangeHealthyRules(createContainerLedger(), {hosts: HOSTS})]);
  await assert.rejects(deployers.deployLagrangeCluster(baseInput(zeroRows.sshRun)),
    (error) => error.code === 'readiness_exhausted' &&
      error.diagnostic.component === 'lagrange-probe-write-readback');
});

test('predicate step 5: time-to-routable is recorded per canonical table', {timeout: 300000},
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
    const deployment = await deployers.deployLagrangeCluster(baseInput(sshRun));
    const placement = await deployment.operations.observePlacement();
    const perTable = placement.routable.tableTimeToRoutableMs;
    assert.deepEqual(Object.keys(perTable).sort(), ['customer', 'district', 'history', 'item',
      'new_order', 'order_line', 'orders', 'stock', 'warehouse']);
    assert.ok(arrayEvery(Object.values(perTable), (ms) => Number.isFinite(ms) && ms >= 0));
  });
