// Unit tests for Lagrange retained operation contexts, deadlines, tri-state
// signals, settleConcurrentBatch fan-outs, and cleanupOnFailure clientIp sweep.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {
  arrayEvery,
  arrayFilter,
  arrayMap,
  arraySome,
  stringIncludes,
  stringReplace,
  stringSplit,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {
  DEFAULT_INSPECT_TIMEOUT_MS,
  DEFAULT_LAGRANGE_OBSERVE_ROLES_DEADLINE_MS,
  DEFAULT_LAGRANGE_ROUTABLE_DEADLINE_MS,
  DEPLOYMENT_FAILURE,
} from '../real-product-deployment-contract.js';
import {describeExhaustedDeployment} from '../real-product-exhausted-deployment.js';
import {inspectProducts} from '../real-product-identity.js';
import {
  clusterReady,
  observedLeaders,
  placementOf,
  readPartitions,
  readSystemTables,
  reportedVersions,
} from '../real-product-lagrange-observations.js';
import {createTrackedSshRun} from '../real-product-remote-shell.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  http,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';

const HOSTS = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
const CLIENT = '10.0.0.9';
const CAMPAIGN = 'camp-op-deadlines';
const NO_SLEEP = async () => {};

function cleanupRules(ledger) {
  return [
    [/^docker ps -aq --filter label=lagrange\.bench\.campaign=/u, (_command, host) => {
      const ids = [];
      for (const entry of ledger.containers.values()) {
        if (entry.host === host && !entry.removed) ids.push(entry.id);
      }
      return `${ids.join('\n')}\n`;
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
      return `${ids.join('\n')}\n`;
    }],
  ];
}

function signalHonoringSsh(baseSshRun, recordedCalls = null) {
  return async (host, callOpts, command, timeoutMs) => {
    if (recordedCalls) {
      recordedCalls.push({host, callOpts, command, timeoutMs});
    }
    if (callOpts?.signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      err.aborted = true;
      throw err;
    }
    return baseSshRun(host, callOpts, command, timeoutMs);
  };
}

function delayMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test('review witness: post-formation operations ignore aborted deploy signal and expired ' +
  'formation deadline at +419s, +421s, and +1500s', {timeout: 300000}, async () => {
  const t0 = 1_000_000;
  let clockMs = t0;
  const ledger = createContainerLedger();
  const deployController = new AbortController();
  const postCalls = [];
  let recordPostCalls = false;
  const {sshRun: baseSshRun} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
  const sshRun = async (host, callOpts, command, timeoutMs) => {
    if (recordPostCalls) {
      postCalls.push({host, callOpts, command, timeoutMs});
    }
    if (callOpts?.signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      err.aborted = true;
      throw err;
    }
    return baseSshRun(host, callOpts, command, timeoutMs);
  };

  const deployment = await deployers.deployLagrangeCluster({
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun,
    campaignId: CAMPAIGN,
    signal: deployController.signal,
    deadlineAtMs: t0 + 420_000,
    nowFn: () => clockMs,
    sleep: NO_SLEEP,
    opts: {
      lagrangeImage: LAGRANGE_IMAGE,
      signal: deployController.signal,
      deadlineAtMs: t0 + 420_000,
      deadlineMs: 420_000,
      timeoutMs: 5000,
      readiness: {stablePolls: 1, attempts: 3, intervalMs: 0},
    },
  });

  // Abort the deploy-only signal right after formation finishes.
  deployController.abort();
  recordPostCalls = true;

  for (const offsetMs of [419_000, 421_000, 1_500_000]) {
    clockMs = t0 + offsetMs;
    const placement = await deployment.operations.observePlacement();
    assert.ok(Array.isArray(placement.replicasByPartition));
    assert.ok(placement.replicasByPartition.length > 0);
    assert.equal(placement.routable.state, 'ready');

    const roles = await deployment.operations.observeRoles();
    assert.ok(roles.leaders && typeof roles.leaders === 'object');

    const ready = await deployment.operations.awaitReady();
    assert.equal(ready.cluster.state, 'ready');
    assert.equal(ready.probe.evidence.insertRowCount, 1);
  }

  // Every post-formation SSH call received explicit signal: null (not aborted deploy signal).
  assert.ok(postCalls.length > 0);
  for (const call of postCalls) {
    assert.equal(call.callOpts?.signal, null,
      `post-formation call must pass signal: null for ${call.command}`);
  }
});

test('observePlacement, observeRoles, and awaitReady enforce own budgets and fail closed ' +
  'on readPartitions HTTP 503 or deadline expiry', {timeout: 300000}, async () => {
  const t0 = 2_000_000;
  let clockMs = t0;
  let failPartitions503 = false;
  let advanceOnPartitionsMs = 0;
  let advanceOnLeadersMs = 0;
  let advanceOnSystemTablesMs = 0;
  const ledger = createContainerLedger();
  const {sshRun: baseSshRun} = createScriptedSsh([
    [/\/api\/admin\/diagnostics\/partitions\?view=leaders/u, () => {
      clockMs += advanceOnLeadersMs;
      return http(200, {partitionCount: 1, leaders: {p1: '00000000-0000-4000-8000-000000000001'}});
    }],
    [/\/api\/admin\/diagnostics\/partitions/u, () => {
      clockMs += advanceOnPartitionsMs;
      if (failPartitions503) return http(503, {error: 'admin unavailable'});
      return http(200, {
        partitionCount: 1,
        leaders: {p1: '00000000-0000-4000-8000-000000000001'},
        partitionsById: {p1: {
          partitionId: 'p1', tableName: 'stock',
          leaderNodeId: '00000000-0000-4000-8000-000000000001',
          replicas: arrayMap(HOSTS, (_h, idx) => ({
            nodeId: `00000000-0000-4000-8000-00000000000${idx + 1}`,
            status: 'active',
          })),
        }},
      });
    }],
    [(command) => stringIncludes(command, 'FROM partitions') && advanceOnSystemTablesMs > 0, () => {
      clockMs += advanceOnSystemTablesMs;
      return 'partition_id|table_name|replica_count|leader_node_id\n' +
        'control_plane_publications-p1|system|3|00000000-0000-4000-8000-000000000001';
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const sshRun = signalHonoringSsh(baseSshRun);

  const deployment = await deployers.deployLagrangeCluster({
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun,
    campaignId: CAMPAIGN,
    nowFn: () => clockMs,
    sleep: NO_SLEEP,
    opts: {
      lagrangeImage: LAGRANGE_IMAGE,
      readiness: {stablePolls: 1, attempts: 3, intervalMs: 0},
    },
  });

  // 1. readPartitions returning 503 throws typed identity_unverified (never {routable} alone).
  failPartitions503 = true;
  await assert.rejects(deployment.operations.observePlacement(), (error) => {
    assert.equal(error.code, DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED);
    return true;
  });
  failPartitions503 = false;

  // 2. observePlacement own-budget expiry at t_call + 900_001ms throws readiness_exhausted.
  advanceOnPartitionsMs = DEFAULT_LAGRANGE_ROUTABLE_DEADLINE_MS + 1;
  await assert.rejects(deployment.operations.observePlacement(), (error) => {
    assert.equal(error.code, DEPLOYMENT_FAILURE.READINESS_EXHAUSTED);
    assert.equal(error.deadlineExpired, true);
    return true;
  });
  advanceOnPartitionsMs = 0;

  // 3. observeRoles own-budget expiry at t_call + 15_001ms throws readiness_exhausted.
  advanceOnLeadersMs = DEFAULT_LAGRANGE_OBSERVE_ROLES_DEADLINE_MS + 1;
  await assert.rejects(deployment.operations.observeRoles(), (error) => {
    assert.equal(error.code, DEPLOYMENT_FAILURE.READINESS_EXHAUSTED);
    assert.equal(error.deadlineExpired, true);
    return true;
  });
  advanceOnLeadersMs = 0;

  // 4. awaitReady wrapping readSystemTables expiry throws typed readiness_exhausted.
  advanceOnSystemTablesMs = 420_001;
  await assert.rejects(
    deployment.operations.awaitReady(),
    (error) => {
      assert.equal(error.code, DEPLOYMENT_FAILURE.READINESS_EXHAUSTED);
      assert.equal(error.deadlineExpired, true);
      return true;
    },
  );
  advanceOnSystemTablesMs = 0;
});

test('placementOf, readPartitions, and observedLeaders throw typed failures with ' +
  'propagation flags', async () => {
  assert.throws(
    () => placementOf({status: 503, error: 'unavailable', aborted: false,
      deadlineExpired: false, transportError: false, observerInfrastructure: false,
      parseError: null}, [], '2026-11-16T00:00:00.000Z'),
    (error) => error.code === DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
  );
  const {sshRun: abortSsh} = createScriptedSsh([]);
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    readPartitions({sshRun: abortSsh, opts: {}, clientIp: CLIENT, signal: ac.signal}, HOSTS[0]),
    (error) => error.code === DEPLOYMENT_FAILURE.READINESS_EXHAUSTED && error.aborted === true,
  );
  const {sshRun: infraSsh} = createScriptedSsh([
    [/curl/u, new Error('ssh: connect to host 10.0.0.9 port 22: Connection timed out')],
  ]);
  await assert.rejects(
    observedLeaders({sshRun: infraSsh, opts: {}, clientIp: CLIENT, signal: null}, HOSTS[0]),
    (error) => error.code === DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED &&
      error.transportError === true && error.observerInfrastructure === true,
  );
});

test('settleConcurrentBatch prevents overlapping probes across attempts, preserves terminal ' +
  'containerExited over fast SSH errors, and settles siblings', {timeout: 300000}, async () => {
  // Part A: inspectWatchedRole 3x3 hosts -> maxConcurrent === 3, 0 in-flight at boundaries.
  let inspectInFlight = 0;
  let inspectMaxConcurrent = 0;
  const boundaryInFlight = [];
  const {sshRun: rawInspectSsh} = createScriptedSsh([
    [/docker inspect --type container/u, async () => {
      inspectInFlight += 1;
      if (inspectInFlight > inspectMaxConcurrent) inspectMaxConcurrent = inspectInFlight;
      await delayMs(10);
      inspectInFlight -= 1;
      return JSON.stringify({Running: true, Status: 'running'});
    }],
  ]);
  const inspectTracker = createTrackedSshRun(rawInspectSsh, null);
  const queryNotReady = async () => {
    boundaryInFlight.push(inspectInFlight);
    return [];
  };
  await assert.rejects(
    clusterReady({
      sshRun: inspectTracker.trackedSshRun,
      settleInFlight: inspectTracker.settleInFlight,
      opts: {},
      clientIp: CLIENT,
      sleep: NO_SLEEP,
      now: Date.now,
      signal: null,
      deadlineAtMs: null,
      budget: {attempts: 3, stablePolls: 1, intervalMs: 0},
      watchedRoles: arrayMap(HOSTS, (host, idx) => ({
        role: 'lagrange-node',
        host,
        containerId: `c${idx + 1}`,
        nodeId: `n${idx + 1}`,
      })),
    }, 'lagrange-system-tables', queryNotReady, []),
    (error) => error.code === DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
  );
  assert.equal(inspectMaxConcurrent, 3);
  assert.equal(boundaryInFlight.length, 12);
  assert.ok(arrayEvery(boundaryInFlight, (count) => count === 0));
  assert.equal(inspectInFlight, 0);
  assert.equal(inspectTracker.inFlightOps.size, 0);

  // Part B: fast transient SSH error on host 1 must NOT mask sibling Running: false on host 2.
  let siblingSettled = false;
  const {sshRun: rawMaskedSsh} = createScriptedSsh([
    [/docker inspect --type container .* c1$/u, async () => {
      await delayMs(1);
      throw new Error('ssh: connect to host 10.0.0.1 port 22: Connection timed out');
    }],
    [/docker inspect --type container .* c2$/u, async () => {
      await delayMs(20);
      siblingSettled = true;
      return JSON.stringify({Running: false, Status: 'exited', ExitCode: 137});
    }],
    [/docker inspect --type container .* c3$/u, async () => {
      await delayMs(20);
      return JSON.stringify({Running: true, Status: 'running'});
    }],
  ]);
  const maskedTracker = createTrackedSshRun(rawMaskedSsh, null);
  await assert.rejects(
    clusterReady({
      sshRun: maskedTracker.trackedSshRun,
      settleInFlight: maskedTracker.settleInFlight,
      opts: {},
      clientIp: CLIENT,
      sleep: NO_SLEEP,
      now: Date.now,
      signal: null,
      deadlineAtMs: null,
      budget: {attempts: 3, stablePolls: 1, intervalMs: 0},
      watchedRoles: arrayMap(HOSTS, (host, idx) => ({
        role: 'lagrange-node',
        host,
        containerId: `c${idx + 1}`,
        nodeId: `n${idx + 1}`,
      })),
    }, 'lagrange-system-tables', async () => [], []),
    (error) => {
      assert.equal(error.code, DEPLOYMENT_FAILURE.READINESS_EXHAUSTED);
      assert.equal(error.containerExited, true);
      assert.equal(error.diagnostic.exitedRole.host, HOSTS[1]);
      return true;
    },
  );
  assert.equal(siblingSettled, true);
  assert.equal(maskedTracker.inFlightOps.size, 0);

  // Part C: readSystemTables 3x4 queries -> maxConcurrent === 4, 0 in-flight at exhaustion.
  let sqlInFlight = 0;
  let sqlMaxConcurrent = 0;
  const sqlBoundaryInFlight = [];
  const {trackInFlight, settleInFlight, inFlightOps} = createTrackedSshRun(async () => '', null);
  const trackedQuery = (sql) => trackInFlight(async () => {
    sqlInFlight += 1;
    if (sqlInFlight > sqlMaxConcurrent) sqlMaxConcurrent = sqlInFlight;
    await delayMs(stringIncludes(sql, 'FROM nodes') ? 2 : 12);
    sqlInFlight -= 1;
    if (stringIncludes(sql, 'FROM nodes')) {
      throw new Error('transient sql error');
    }
    return [];
  });
  for (let i = 0; i < 3; i += 1) {
    sqlBoundaryInFlight.push(sqlInFlight);
    await assert.rejects(readSystemTables(trackedQuery, {
      settleInFlight,
      signal: null,
      deadlineAtMs: null,
      now: Date.now,
    }));
    assert.equal(sqlInFlight, 0);
    assert.equal(inFlightOps.size, 0);
  }
  assert.equal(sqlMaxConcurrent, 4);
  assert.deepEqual(sqlBoundaryInFlight, [0, 0, 0]);

  // Part D: reportedVersions settles siblings on fast failure.
  let versionSiblingSettled = false;
  const {sshRun: rawVersionsSsh} = createScriptedSsh([
    [/grep -m 1 bootedSrcFingerprint/u, async (command) => {
      if (stringIncludes(command, 'c1')) {
        await delayMs(1);
        throw Object.assign(new Error('boot provenance deadline expired'),
          {deadlineExpired: true});
      }
      await delayMs(20);
      versionSiblingSettled = true;
      return '{"subsystem":"main","version":"0.4.0","bootedSrcFingerprint":"sha256:feed"}';
    }],
    [/management\/v1\/facts/u, async () => {
      await delayMs(5);
      return http(200, {facts: {release: {version: '0.4.0'}}});
    }],
  ]);
  const versionsTracker = createTrackedSshRun(rawVersionsSsh, null);
  await assert.rejects(reportedVersions({
    sshRun: versionsTracker.trackedSshRun,
    settleInFlight: versionsTracker.settleInFlight,
    opts: {},
    clientIp: CLIENT,
    signal: null,
    deadlineAtMs: null,
    now: Date.now,
  }, arrayMap(HOSTS, (host, idx) => ({host, containerId: `c${idx + 1}`}))),
  (error) => error.deadlineExpired === true);
  assert.equal(versionSiblingSettled, true);
  assert.equal(versionsTracker.inFlightOps.size, 0);
});

test('cleanupOnFailure: true sweeps clientIp as well as data hosts', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  ledger.containers.set('client-helper-1', {
    id: 'client-helper-1',
    host: CLIENT,
    image: 'postgres:17-alpine',
    name: 'bench-client-helper-1',
    running: true,
    removed: false,
    mounts: [],
  });
  const visitedCleanupHosts = [];
  const {sshRun} = createScriptedSsh([
    [/^docker ps -aq --filter label=lagrange\.bench\.campaign=/u, (_command, host) => {
      visitedCleanupHosts.push(host);
      const ids = [];
      for (const entry of ledger.containers.values()) {
        if (entry.host === host && !entry.removed) ids.push(entry.id);
      }
      return `${ids.join('\n')}\n`;
    }],
    ...cleanupRules(ledger),
    [/curl/u, http(503, {ready: false, phase: 'init', reasons: ['not-ready']})],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  await assert.rejects(
    deployers.deployLagrangeCluster({
      hosts: HOSTS,
      clientIp: CLIENT,
      sshRun,
      campaignId: CAMPAIGN,
      sleep: NO_SLEEP,
      opts: {
        lagrangeImage: LAGRANGE_IMAGE,
        cleanupOnFailure: true,
        readiness: {stablePolls: 1, attempts: 2, intervalMs: 0},
      },
    }),
    (error) => {
      assert.equal(error.code, DEPLOYMENT_FAILURE.READINESS_EXHAUSTED);
      assert.equal(error.cleanup.complete, true);
      return true;
    },
  );
  assert.ok(arraySome(visitedCleanupHosts, (host) => host === CLIENT),
    'cleanupOnFailure must sweep clientIp');
  assert.equal(ledger.containers.size, 0);
});

test('inspectProducts and describeExhaustedDeployment bound timeouts and preserve explicit ' +
  'signal: null', async () => {
  const ledger = createContainerLedger();
  const id = stringTrim(ledger.run(
    'docker run -d --name bench-c-lagrange-node-1 --network host psvensson/lagrange:0.4.0',
    HOSTS[0],
  ));
  const seen = [];
  const {sshRun: baseSsh} = createScriptedSsh([
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const sshRun = async (host, callOpts, command, timeoutMs) => {
    seen.push({callOpts, timeoutMs, command});
    return baseSsh(host, callOpts, command, timeoutMs);
  };
  const clockMs = 5_000_000;
  await inspectProducts({
    sshRun,
    opts: {signal: new AbortController().signal, timeoutMs: 25_000},
    roles: [{role: 'lagrange-node', host: HOSTS[0], containerId: id}],
    signal: null,
    deadlineAtMs: clockMs + 4000,
    now: () => clockMs,
  });
  for (const call of seen) {
    assert.equal(call.callOpts.signal, null);
    assert.equal(call.timeoutMs, 4000);
  }
  seen.length = 0;
  const expiredCtrl = new AbortController();
  expiredCtrl.abort();
  await describeExhaustedDeployment({
    targetId: 'lagrange',
    topology: {description: 'test', clientPath: 'public-pg-wire'},
    sshRun,
    opts: {signal: expiredCtrl.signal, deadlineAtMs: clockMs - 10},
    roles: [{role: 'lagrange-node', host: HOSTS[0], containerId: id}],
    endpoint: null,
    dataDir: '/data',
    readVersions: async () => {},
    failure: new Error('exhausted'),
    now: () => clockMs,
  });
  for (const call of seen) {
    assert.equal(call.callOpts.signal, null);
    assert.equal(call.timeoutMs, DEFAULT_INSPECT_TIMEOUT_MS);
  }
});
