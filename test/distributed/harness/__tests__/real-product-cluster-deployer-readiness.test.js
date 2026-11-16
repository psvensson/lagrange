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
  tidbHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayFindIndex,
  arrayFlatMap,
  arrayIncludes,
  arrayJoin,
  arrayMap,
  arraySome,
  stringIncludes,
  stringReplace,
  stringSplit,
  stringTrim,
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
    assert.ok(arrayIncludes(denials, 'partition_not_routable:control_plane_publications-p1'));
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
    services: [{partition_id: 'p1', node_id: 'a', status: 'active', raft_role: 'follower'}],
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
    services: arrayMap(activeNodeIds, (nodeId) => ({partition_id: 'p1',
      node_id: nodeId, status: 'active', raft_role: 'follower'})),
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
        readinessByNodeId: {[nodeId]: {dimensions: {serveEligible: false},
          reasons: [{code: 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'}]}}}});
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

test('CL-007: Lagrange cross-host deployment sets 30s transport message timeout and join timeouts',
  {timeout: 300000}, async () => {
    const ledger = createContainerLedger();
    const {sshRun, calls} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
    await deployers.deployLagrangeCluster(baseInput(sshRun));
    const runs = arrayFilter(calls, (call) => /^docker run -d /u.test(call.command));
    assert.equal(runs.length, HOSTS.length);
    for (const run of runs) {
      assert.match(run.command, /LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS=30000/u);
      assert.match(run.command, /NODE_JOINING_HTTP_TIMEOUT_MS=60000/u);
      assert.match(run.command, /NODE_JOINING_LEADERSHIP_WAIT_TIMEOUT_MS=240000/u);
    }
    assert.equal(/SEED_NODE_ADDRESS=/u.test(runs[0].command), false);
    for (const joinerRun of runs.slice(1)) {
      assert.match(joinerRun.command, /SEED_NODE_ADDRESS=/u);
    }
  });

function cleanupDockerRules(ledger) {
  return [
    [/^docker ps -aq --filter label=lagrange\.bench\.campaign=/u, (_command, host) => {
      const ids = [];
      for (const entry of ledger.containers.values()) {
        if (entry.host === host && !entry.removed) ids.push(entry.id);
      }
      return `${arrayJoin(ids, '\n')}\n`;
    }],
    [/^docker rm -f /u, (command) => {
      const ids = arrayFilter(
        arrayMap(stringSplit(stringReplace(command, /^docker rm -f\s+/u, ''), /\s+/u),
          (part) => stringReplace(stringTrim(part), /^'|'$/gu, '')),
        Boolean,
      );
      for (const id of ids) {
        const entry = ledger.containers.get(id);
        if (entry) entry.removed = true;
        ledger.containers.delete(id);
      }
      return `${arrayJoin(ids, '\n')}\n`;
    }],
  ];
}

test('shared formation wall-clock deadline: slow probes across sequential readiness stages share ' +
  'one 420,000 ms deadline and fail closed before attempt 420 with lastObservation and cohort cleanup',
{timeout: 300000}, async () => {
  assert.equal(deployers.DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS, 420_000);
  const ledger = createContainerLedger();
  let clockMs = 1_000_000;
  let joiner2Polls = 0;
  const sleeps = [];
  const {sshRun} = createScriptedSsh([
    ...cleanupDockerRules(ledger),
    [(command) => stringIncludes(command, 'http://10.0.0.1:8080/readyz'), () => {
      // Seed readiness probe consumes 180s of the shared 420s formation deadline.
      clockMs += 180_000;
      return http(200, {ready: true});
    }],
    [(command) => stringIncludes(command, 'http://10.0.0.2:8080/readyz'), () => {
      joiner2Polls += 1;
      // Each joiner-2 probe consumes 130s; two probes (180s + 130s + 1s + 130s = 441s)
      // cross the shared 420,000 ms deadline on attempt 2 of 420.
      clockMs += 130_000;
      return http(503, {ready: false, phase: 'joining',
        reasons: [`priority-partition-spread-poll-${joiner2Polls}`]});
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  await assert.rejects(
    deployers.deployLagrangeCluster({
      hosts: HOSTS,
      clientIp: CLIENT,
      sshRun,
      campaignId: CAMPAIGN,
      nowFn: () => clockMs,
      sleep: async (ms) => {
        sleeps.push(ms);
        clockMs += ms;
      },
      opts: {
        lagrangeImage: LAGRANGE_IMAGE,
        cleanupOnFailure: true,
        readiness: {stablePolls: 1, attempts: 420, intervalMs: 1000},
      },
    }),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.diagnostic.component, 'lagrange-node@10.0.0.2');
      assert.equal(error.diagnostic.deadlineExpired, true);
      assert.equal(error.diagnostic.deadlineMs, 420_000);
      assert.equal(error.diagnostic.attempt, 2,
        'must fail closed on attempt 2 when shared 420s wall-clock deadline expires, not run 420 attempts');
      assert.equal(joiner2Polls, 2);
      assert.deepEqual(sleeps, [1000]);
      assert.match(JSON.stringify(error.diagnostic.lastObservation),
        /priority-partition-spread-poll-2/u);
      assert.equal(error.deployment.readiness.state, 'exhausted');
      assert.equal(error.deployment.roles.length, HOSTS.length);
      assert.equal(error.cleanup.complete, true);
      return true;
    },
  );
  assert.equal(ledger.containers.size, 0,
    'cohort cleanup must remove all 3 containers after formation deadline expiration');
});

test('readiness cancellation signal: aborting signal during readiness polling immediately aborts ' +
  'deployLagrangeCluster with lastObservation and runs full cohort cleanup',
{timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const controller = new AbortController();
  let seedPolls = 0;
  let sleepStarted = false;
  const {sshRun} = createScriptedSsh([
    ...cleanupDockerRules(ledger),
    [(command) => stringIncludes(command, 'http://10.0.0.1:8080/readyz'), () => {
      seedPolls += 1;
      return http(503, {ready: false, phase: 'init', reasons: ['awaiting-quorum']});
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  await assert.rejects(
    deployers.deployLagrangeCluster({
      hosts: HOSTS,
      clientIp: CLIENT,
      sshRun,
      campaignId: CAMPAIGN,
      signal: controller.signal,
      sleep: () => new Promise((resolve) => {
        sleepStarted = true;
        // Abort while pollReadiness is sleeping between attempt 1 and attempt 2;
        // sleepUntilOrAbort must wake immediately without waiting for the timer.
        const sleepTimer = setTimeout(resolve, 60_000);
        sleepTimer.unref?.();
        setTimeout(() => controller.abort(), 5);
      }),
      opts: {
        lagrangeImage: LAGRANGE_IMAGE,
        cleanupOnFailure: true,
        readiness: {stablePolls: 1, attempts: 420, intervalMs: 60_000},
      },
    }),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.diagnostic.component, 'lagrange-node@10.0.0.1');
      assert.equal(error.diagnostic.aborted, true);
      assert.equal(error.diagnostic.attempt, 1);
      assert.equal(seedPolls, 1, 'no second probe may run after signal aborts during sleep');
      assert.equal(sleepStarted, true);
      assert.match(JSON.stringify(error.diagnostic.lastObservation), /awaiting-quorum/u);
      assert.equal(error.deployment.readiness.state, 'exhausted');
      assert.equal(error.deployment.roles.length, HOSTS.length);
      assert.equal(error.cleanup.complete, true);
      return true;
    },
  );
  assert.equal(ledger.containers.size, 0,
    'cohort cleanup must remove all 3 containers when readiness polling is aborted');
});

test('late successful probe past deadlineAtMs: a probeWriteReadback that starts before ' +
  'deadlineAtMs and resolves {ready: true} after deadlineAtMs is rejected as readiness_exhausted',
{timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const controller = new AbortController();
  let clockMs = 1_000_000;
  let selectCalls = 0;
  const {sshRun} = createScriptedSsh([
    ...cleanupDockerRules(ledger),
    [/CREATE TABLE IF NOT EXISTS bench_readiness_probe/u, (_command, _host, _calls, opts, timeoutMs) => {
      // Advance to 15s before the 420,000 ms formation deadline (1,420,000).
      clockMs = 1_405_000;
      assert.ok(opts?.signal, 'SQL probe statement must receive AbortSignal');
      assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0);
      return 'CREATE TABLE';
    }],
    [/INSERT INTO bench_readiness_probe/u, (_command, _host, _calls, _opts, timeoutMs) => {
      assert.equal(timeoutMs, 15_000,
        'INSERT step must bound its timeoutMs by the remaining 15,000 ms before deadlineAtMs');
      clockMs = 1_415_000;
      return 'INSERT 0 1';
    }],
    [/SELECT token FROM bench_readiness_probe/u, (command, _host, _calls, _opts, timeoutMs) => {
      selectCalls += 1;
      assert.equal(timeoutMs, 5_000,
        'SELECT step must bound its timeoutMs by the remaining 5,000 ms before deadlineAtMs');
      // Complete 1,000 ms AFTER deadlineAtMs (1,420,000) while returning a valid 1-row readback.
      clockMs = 1_421_000;
      const campaign = (/lagrange\.bench\.campaign=(\S+)/u.exec(command) || [])[1];
      const id = (/WHERE id = (\d+)/u.exec(command) || [])[1];
      return `token\n${campaign}-${id}`;
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  await assert.rejects(
    deployers.deployLagrangeCluster({
      hosts: HOSTS,
      clientIp: CLIENT,
      sshRun,
      campaignId: CAMPAIGN,
      signal: controller.signal,
      nowFn: () => clockMs,
      sleep: async (ms) => {
        clockMs += ms;
      },
      opts: {
        lagrangeImage: LAGRANGE_IMAGE,
        cleanupOnFailure: true,
        readiness: {stablePolls: 1, attempts: 420, intervalMs: 1000},
      },
    }),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.diagnostic.component, 'lagrange-probe-write-readback');
      assert.equal(error.diagnostic.deadlineExpired, true);
      assert.equal(error.diagnostic.attempt, 1);
      assert.equal(selectCalls, 1);
      assert.equal(error.diagnostic.lastObservation.insertRowCount, 1);
      assert.equal(error.diagnostic.lastObservation.readBack.length, 1);
      assert.equal(error.deployment.readiness.state, 'exhausted');
      assert.equal(error.cleanup.complete, true);
      return true;
    },
  );
  assert.equal(ledger.containers.size, 0);
});

test('active probe cancellation: aborting signal while an sshRun probe is in flight aborts the ' +
  'probe and settles in-flight sshRun operations before cohort cleanup runs',
{timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const controller = new AbortController();
  const timeline = [];
  let capturedSignal = null;
  const {sshRun} = createScriptedSsh([
    [/^docker ps -aq --filter label=lagrange\.bench\.campaign=/u, (_command, host) => {
      const ids = [];
      for (const entry of ledger.containers.values()) {
        if (entry.host === host && !entry.removed) ids.push(entry.id);
      }
      return `${arrayJoin(ids, '\n')}\n`;
    }],
    [/^docker rm -f /u, (command) => {
      timeline.push('cohort-cleanup-rm');
      const ids = arrayFilter(
        arrayMap(stringSplit(stringReplace(command, /^docker rm -f\s+/u, ''), /\s+/u),
          (part) => stringReplace(stringTrim(part), /^'|'$/gu, '')),
        Boolean,
      );
      for (const id of ids) {
        const entry = ledger.containers.get(id);
        if (entry) entry.removed = true;
        ledger.containers.delete(id);
      }
      return `${arrayJoin(ids, '\n')}\n`;
    }],
    [(command) => stringIncludes(command, 'http://10.0.0.1:8080/readyz'),
      (_command, _host, _calls, opts) => new Promise((resolve) => {
        capturedSignal = opts?.signal ?? null;
        timeline.push('probe-started');
        setTimeout(() => {
          timeline.push('signal-aborted');
          controller.abort();
        }, 5);
        setTimeout(() => {
          timeline.push('in-flight-probe-settled');
          resolve(http(503, {ready: false, phase: 'init', reasons: ['in-flight-cancelled']}));
        }, 25);
      })],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  await assert.rejects(
    deployers.deployLagrangeCluster({
      hosts: HOSTS,
      clientIp: CLIENT,
      sshRun,
      campaignId: CAMPAIGN,
      signal: controller.signal,
      sleep: async () => {},
      opts: {
        lagrangeImage: LAGRANGE_IMAGE,
        cleanupOnFailure: true,
        readiness: {stablePolls: 1, attempts: 420, intervalMs: 1000},
      },
    }),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.aborted, true);
      assert.equal(error.diagnostic.aborted, true);
      assert.equal(Boolean(capturedSignal && capturedSignal.aborted), true,
        'active sshRun probe must receive the aborted AbortSignal');
      const settledIdx = arrayFindIndex(timeline, (item) => item === 'in-flight-probe-settled');
      const cleanupIdx = arrayFindIndex(timeline, (item) => item === 'cohort-cleanup-rm');
      assert.ok(settledIdx >= 0 && cleanupIdx > settledIdx,
        `in-flight sshRun must settle before cohort cleanup runs (${JSON.stringify(timeline)})`);
      assert.equal(error.cleanup.complete, true);
      return true;
    },
  );
  assert.equal(ledger.containers.size, 0);
});

test('post-abort inspection & cleanup: opts.signal is stripped via signal: null so ' +
  'describeExhaustedDeployment, reportedVersions, and removeCampaignContainers succeed after abort',
{timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const controller = new AbortController();
  const {sshRun: baseSshRun} = createScriptedSsh([
    [/^docker ps -aq --filter label=lagrange\.bench\.campaign=/u, (_command, host) => {
      const ids = [];
      for (const entry of ledger.containers.values()) {
        if (entry.host === host && !entry.removed) ids.push(entry.id);
      }
      return `${arrayJoin(ids, '\n')}\n`;
    }],
    [/^docker rm -f /u, (command) => {
      const ids = arrayFilter(
        arrayMap(stringSplit(stringReplace(command, /^docker rm -f\s+/u, ''), /\s+/u),
          (part) => stringReplace(stringTrim(part), /^'|'$/gu, '')),
        Boolean,
      );
      for (const id of ids) {
        const entry = ledger.containers.get(id);
        if (entry) entry.removed = true;
        ledger.containers.delete(id);
      }
      return `${arrayJoin(ids, '\n')}\n`;
    }],
    [(command) => stringIncludes(command, 'http://10.0.0.1:8080/readyz'), () => {
      controller.abort();
      return http(503, {ready: false, phase: 'init', reasons: ['aborting-with-opts-signal']});
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const signalHonoringSshRun = async (host, callOpts, command, timeoutMs) => {
    if (callOpts?.signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    return baseSshRun(host, callOpts, command, timeoutMs);
  };
  await assert.rejects(
    deployers.deployLagrangeCluster({
      hosts: HOSTS,
      clientIp: CLIENT,
      sshRun: signalHonoringSshRun,
      campaignId: CAMPAIGN,
      signal: controller.signal,
      sleep: async () => {},
      opts: {
        lagrangeImage: LAGRANGE_IMAGE,
        cleanupOnFailure: true,
        signal: controller.signal,
        readiness: {stablePolls: 1, attempts: 420, intervalMs: 1000},
      },
    }),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.aborted, true);
      assert.equal(error.deploymentUnobservable, undefined,
        'post-abort docker inspect must not inherit aborted opts.signal');
      assert.equal(error.deployment.identity.products.length, HOSTS.length);
      for (const product of error.deployment.identity.products) {
        assert.equal(product.reportedVersion, '0.4.0',
          'post-abort reportedVersions must not inherit aborted opts.signal');
      }
      assert.equal(error.cleanup.complete, true,
        'post-abort removeCampaignContainers must not inherit aborted opts.signal');
      return true;
    },
  );
  assert.equal(ledger.containers.size, 0);
});

test('Review #6: Postgres and TiDB deployers forward signal, settle in-flight sshRun before ' +
  'describing exhaustion, and TiDB always stops readiness-client container on abort',
{timeout: 300000}, async () => {
  // 1. Postgres deployer signal forwarding + in-flight settlement
  const pgLedger = createContainerLedger();
  const pgController = new AbortController();
  const pgTimeline = [];
  const {sshRun: pgSshRun} = createScriptedSsh([
    [/pg_isready/u, () => new Promise((_resolve, reject) => {
      pgTimeline.push('pg-probe-started');
      setTimeout(() => {
        pgTimeline.push('pg-signal-aborted');
        pgController.abort();
      }, 5);
      setTimeout(() => {
        pgTimeline.push('pg-probe-settled');
        reject(new Error('pg_isready aborted after delay'));
      }, 25);
    })],
    [/^docker inspect /u, (command, host, calls, opts) => {
      pgTimeline.push('pg-describe-inspect');
      return dockerRules(pgLedger)[1][1](command, host, calls, opts);
    }],
    ...dockerRules(pgLedger),
  ]);
  await assert.rejects(
    deployers.deployPostgresCluster({
      ...baseInput(pgSshRun),
      targetId: 'pg-single-primary',
      signal: pgController.signal,
    }),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.aborted, true);
      assert.equal(error.diagnostic.aborted, true);
      const settledIdx = arrayFindIndex(pgTimeline, (item) => item === 'pg-probe-settled');
      const inspectIdx = arrayFindIndex(pgTimeline, (item) => item === 'pg-describe-inspect');
      assert.ok(settledIdx >= 0 && inspectIdx > settledIdx,
        `pg probe must settle before describeExhaustedDeployment (${JSON.stringify(pgTimeline)})`);
      return true;
    },
  );

  // 2. TiDB deployer signal forwarding + awaitReady stops readiness-client container on abort
  const tidbLedger = createContainerLedger();
  let abortOnNextMysql = false;
  const awaitReadyController = new AbortController();
  const tidbTimeline = [];
  const {sshRun: tidbBaseSshRun} = createScriptedSsh([
    [/^docker stop -t 0 [0-9a-f]+$/u, (command) => {
      tidbTimeline.push(`stop:${command}`);
      return tidbLedger.stop(command);
    }],
    [
      (command) => /^docker exec \S+ 'mysql'/u.test(command) &&
        !stringIncludes(command, 'tidb_version()') &&
        !stringIncludes(command, 'CLUSTER_INFO'),
      () => {
        if (!abortOnNextMysql) return '1\n__exit_code=0';
        return new Promise((resolve) => {
          tidbTimeline.push('sql-probe-started');
          setTimeout(() => {
            tidbTimeline.push('tidb-signal-aborted');
            awaitReadyController.abort();
          }, 5);
          setTimeout(() => {
            tidbTimeline.push('sql-probe-settled');
            resolve('0\n__exit_code=0');
          }, 25);
        });
      },
    ],
    ...tidbHealthyRules(tidbLedger),
  ]);
  const tidbSshRun = async (host, callOpts, command, timeoutMs) => {
    if (callOpts?.signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    return tidbBaseSshRun(host, callOpts, command, timeoutMs);
  };
  const deployedTiDb = await deployers.deployTiDbCluster(baseInput(tidbSshRun));
  tidbTimeline.length = 0;
  abortOnNextMysql = true;
  await assert.rejects(
    deployedTiDb.operations.awaitReady({signal: awaitReadyController.signal}),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.aborted, true);
      assert.equal(error.diagnostic.aborted, true);
      const settledIdx = arrayFindIndex(tidbTimeline, (item) => item === 'sql-probe-settled');
      const stopIdx = arrayFindIndex(tidbTimeline, (item) =>
        stringIncludes(item, 'stop:docker stop -t 0'));
      assert.ok(settledIdx >= 0 && stopIdx >= 0,
        `TiDB readiness client must be stopped even after abort (${JSON.stringify(tidbTimeline)})`);
      return true;
    },
  );
});

test('system-table readiness checks all system partitions, not only the 6 priority ' +
  'partitions', () => {
  const now = Date.now();
  const expectedNodeIds = ['n1', 'n2', 'n3'];
  const priorityIds = [
    'control_plane_publications-p1',
    'replica_operations-p1',
    'schema_operations-p1',
    'sql_transaction_participants-p1',
    'sql_transactions-p1',
    'sql_write_operations-p1',
  ];
  const allIds = [...priorityIds, 'tables-p1'];
  const nodes = arrayMap(expectedNodeIds, (nodeId) => ({
    node_id: nodeId,
    status: 'active',
    connection_state: 'ready',
    ready_lease_expires_at: String(now + 1000),
    last_heartbeat: String(now - 10),
  }));
  const partitions = arrayMap(allIds, (partitionId) => ({
    partition_id: partitionId,
    table_name: 'system',
    replica_count: '3',
    leader_node_id: 'n1',
  }));
  const partialServices = [
    ...arrayFlatMap(priorityIds, (partitionId) => arrayMap(expectedNodeIds, (nodeId) => ({
      partition_id: partitionId,
      node_id: nodeId,
      status: 'active',
      raft_role: 'follower',
    }))),
    {partition_id: 'tables-p1', node_id: 'n1', status: 'active', raft_role: 'follower'},
  ];

  const partial = evaluateLagrangeClusterReadiness({
    nodes,
    endpoints: [{service_id: 'sys-postgres-wire', health_status: 'healthy'}],
    partitions,
    services: partialServices,
    expectedNodeIds,
    requiredServiceIds: ['sys-postgres-wire'],
    requiredTables: null,
    now,
  });
  assert.equal(partial.ready, false);
  assert.deepEqual(partial.denials, ['partition_under_replicated:tables-p1']);

  const fullServices = arrayFlatMap(allIds, (partitionId) => arrayMap(expectedNodeIds,
    (nodeId) => ({
      partition_id: partitionId,
      node_id: nodeId,
      status: 'active',
      raft_role: 'follower',
    })));
  const complete = evaluateLagrangeClusterReadiness({
    nodes,
    endpoints: [{service_id: 'sys-postgres-wire', health_status: 'healthy'}],
    partitions,
    services: fullServices,
    expectedNodeIds,
    requiredServiceIds: ['sys-postgres-wire'],
    requiredTables: null,
    now,
  });
  assert.equal(complete.ready, true);
  assert.deepEqual(complete.denials, []);
});

test('pollReadiness immediately aborts without retrying when probe throws error.terminal = true',
  async () => {
    const {pollReadiness} = await import('../real-product-readiness.js');
    let probeCalls = 0;
    let sleepCalls = 0;
    const fatal = new Error('container exited permanently');
    fatal.terminal = true;

    await assert.rejects(
      pollReadiness({
        component: 'lagrange-system-tables',
        attempts: 420,
        intervalMs: 1000,
        sleep: async () => {
          sleepCalls += 1;
        },
        probe: async () => {
          probeCalls += 1;
          throw fatal;
        },
      }),
      (error) => error === fatal,
    );
    assert.equal(probeCalls, 1);
    assert.equal(sleepCalls, 0);

    let retryProbeCalls = 0;
    await assert.rejects(
      pollReadiness({
        component: 'lagrange-system-tables',
        attempts: 3,
        intervalMs: 0,
        sleep: async () => {},
        probe: async () => {
          retryProbeCalls += 1;
          throw new Error('transient error');
        },
      }),
      (error) => error.code === 'readiness_exhausted',
    );
    assert.equal(retryProbeCalls, 3);
  });

test('watched container exit aborts deployLagrangeCluster and awaitReady immediately without ' +
  'polling 420 attempts', {timeout: 300000}, async () => {
  const formationLedger = createContainerLedger();
  const formationSleeps = [];
  const formationSsh = createScriptedSsh([
    ...cleanupDockerRules(formationLedger),
    [/docker inspect --type container/u, (command) => {
      const id = stringSplit(stringTrim(command), /\s+/u).pop();
      const entry = formationLedger.containers.get(id);
      if (entry && entry.host === '10.0.0.2') {
        entry.running = false;
        return JSON.stringify({
          Id: entry.id,
          Name: `/${entry.name}`,
          Image: 'sha256:' + 'a'.repeat(64),
          State: {Running: false, Status: 'exited', ExitCode: 1, OOMKilled: false},
          Config: {Image: entry.image, Entrypoint: ['/nodejs/bin/node'], Cmd: ['serve']},
          Mounts: entry.mounts,
        });
      }
      return formationLedger.inspect(command);
    }],
    ...lagrangeHealthyRules(formationLedger, {hosts: HOSTS}),
  ]);
  await assert.rejects(
    deployers.deployLagrangeCluster({
      hosts: HOSTS,
      clientIp: CLIENT,
      sshRun: formationSsh.sshRun,
      campaignId: CAMPAIGN,
      sleep: async (ms) => {
        formationSleeps.push(ms);
      },
      opts: {
        lagrangeImage: LAGRANGE_IMAGE,
        cleanupOnFailure: true,
        readiness: {stablePolls: 1, attempts: 420, intervalMs: 1000},
      },
    }),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.terminal, true);
      assert.equal(error.containerExited, true);
      assert.equal(error.attempt, 1);
      assert.equal(error.diagnostic.exitedRole.host, '10.0.0.2');
      assert.equal(error.diagnostic.exitedRole.status, 'exited');
      assert.equal(error.diagnostic.exitedRole.exitCode, 1);
      assert.equal(error.cleanup.complete, true);
      return true;
    },
  );
  assert.deepEqual(formationSleeps, []);
  assert.equal(formationLedger.containers.size, 0);

  const ledger = createContainerLedger();
  let nodeQueryCallsAfterExit = 0;
  let crashedNode1 = false;
  const awaitSleeps = [];
  const {sshRun} = createScriptedSsh([
    [/FROM nodes'/u, () => {
      if (crashedNode1) nodeQueryCallsAfterExit += 1;
      return arrayJoin([
        'node_id|status|connection_state|ready_lease_expires_at|last_heartbeat',
        ...arrayMap(
          ['00000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000002',
            '00000000-0000-4000-8000-000000000003'],
          (nodeId) => `${nodeId}|active|ready|${Date.now() + 3600000}|${Date.now() - 1000}`,
        ),
      ], '\n');
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const deployment = await deployers.deployLagrangeCluster({
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun,
    campaignId: CAMPAIGN,
    sleep: async (ms) => {
      awaitSleeps.push(ms);
    },
    opts: {
      lagrangeImage: LAGRANGE_IMAGE,
      readiness: {stablePolls: 1, attempts: 420, intervalMs: 1000},
    },
  });
  crashedNode1 = true;
  awaitSleeps.length = 0;
  const node1Role = arrayFind(deployment.roles, (role) => role.host === '10.0.0.1');
  ledger.containers.get(node1Role.containerId).running = false;
  await assert.rejects(
    deployment.operations.awaitReady({deadlineAtMs: null}),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.terminal, true);
      assert.equal(error.containerExited, true);
      assert.equal(error.attempt, 1);
      assert.equal(error.diagnostic.component, 'lagrange-system-tables');
      assert.equal(error.diagnostic.exitedRole.host, '10.0.0.1');
      assert.equal(error.diagnostic.exitedRole.status, 'exited');
      return true;
    },
  );
  assert.deepEqual(awaitSleeps, []);
  assert.equal(nodeQueryCallsAfterExit, 0);
});

test('awaitReady preserves bounded formation deadline when deadlineAtMs is omitted or null ' +
  'and honors tighter caller deadlines', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  let clockMs = 2_000_000;
  let stallAwaitReady = false;
  let stalledPolls = 0;
  const {sshRun} = createScriptedSsh([
    [/FROM nodes'/u, () => {
      if (stallAwaitReady) {
        stalledPolls += 1;
        clockMs += 150_000;
        return new Error('connection refused');
      }
      return arrayJoin([
        'node_id|status|connection_state|ready_lease_expires_at|last_heartbeat',
        ...arrayMap(
          ['00000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000002',
            '00000000-0000-4000-8000-000000000003'],
          (nodeId) => `${nodeId}|active|ready|${clockMs + 3600000}|${clockMs - 1000}`,
        ),
      ], '\n');
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const deployment = await deployers.deployLagrangeCluster({
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun,
    campaignId: CAMPAIGN,
    nowFn: () => clockMs,
    sleep: async (ms) => {
      clockMs += ms;
    },
    opts: {
      lagrangeImage: LAGRANGE_IMAGE,
      formationDeadlineMs: 420_000,
      readiness: {stablePolls: 1, attempts: 420, intervalMs: 1000},
    },
  });

  stallAwaitReady = true;
  await assert.rejects(
    deployment.operations.awaitReady({deadlineAtMs: null}),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.diagnostic.deadlineExpired, true);
      assert.equal(error.diagnostic.deadlineMs, 420_000);
      assert.equal(error.diagnostic.attempt, 3);
      return true;
    },
  );
  assert.equal(stalledPolls, 3);

  stalledPolls = 0;
  await assert.rejects(
    deployment.operations.awaitReady({deadlineAtMs: clockMs + 50_000}),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.diagnostic.deadlineExpired, true);
      assert.equal(error.diagnostic.deadlineMs, 50_000);
      assert.equal(error.diagnostic.attempt, 1);
      return true;
    },
  );
  assert.equal(stalledPolls, 1);
});
