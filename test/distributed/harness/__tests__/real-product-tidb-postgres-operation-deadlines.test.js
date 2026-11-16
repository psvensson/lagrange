import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {
  arrayFilter,
  arrayFindIndex,
  arrayJoin,
  arrayMap,
  arraySome,
  objectHasOwn,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';
import {typedReadiness} from '../real-product-readiness.js';
import {waitForTiDbReferenceSqlReady} from '../tidb-reference-lifecycle.js';
import {waitForPhysicalTablePlacement} from '../tidb-reference-physical-placement-proof.js';
import {startTiDbReferencePhysicalCluster} from '../tidb-reference-physical-topology.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  createContainerLedger,
  postgresHealthyRules,
  tidbHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';

const HOSTS = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
const CLIENT = '10.0.0.9';
const CAMPAIGN = 'camp-op-deadlines';
const NO_SLEEP = async () => {};

function tidbPlacementRules(ledger, {ready = true} = {}) {
  const storesOut = arrayJoin(
    arrayMap(HOSTS, (host, index) => `${index + 1}\t${host}:20160\tUp`),
    '\n',
  );
  const peersOut = ready ?
    arrayJoin(
      arrayMap(HOSTS, (host, index) =>
        `101\t${200 + index}\t${index + 1}\t${host}:20160\t0\t${index === 0 ? 1 : 0}\tNORMAL`),
      '\n',
    ) :
    `101\t200\t1\t${HOSTS[0]}:20160\t0\t1\tNORMAL`;
  return [
    [(command) => stringIncludes(command, 'SELECT STORE_ID, ADDRESS, STORE_STATE_NAME FROM ' +
      'INFORMATION_SCHEMA.TIKV_STORE_STATUS'), () => `${storesOut}\n__exit_code=0`],
    [(command) => stringIncludes(command, 'FROM INFORMATION_SCHEMA.TIKV_REGION_STATUS'),
      () => `${peersOut}\n__exit_code=0`],
    ...tidbHealthyRules(ledger),
  ];
}

function wrapSignalHonoringSsh(baseSshRun, recordedCalls = null) {
  return async (host, callOpts, command, timeoutMs) => {
    if (recordedCalls) {
      recordedCalls.push({
        host,
        command,
        timeoutMs,
        hasSignalProp: Boolean(callOpts && objectHasOwn(callOpts, 'signal')),
        signal: callOpts?.signal,
        deadlineAtMs: callOpts?.deadlineAtMs,
      });
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

function createFakeTiDbProvider({
  inspectImpl,
  execImpl,
  logsImpl = async () => '',
} = {}) {
  return {
    async inspectContainer(containerId, callOptions) {
      if (inspectImpl) return inspectImpl(containerId, callOptions);
      return {State: {Running: true, Status: 'running', ExitCode: 0}};
    },
    async execInContainer(containerId, argv, callOptions) {
      if (execImpl) return execImpl(containerId, argv, callOptions);
      return {exitCode: 1, stdout: '', stderr: ''};
    },
    async getContainerLogs(containerId, logOptions) {
      return logsImpl(containerId, logOptions);
    },
  };
}

test('TiDB retained operations use fresh windows independent of expired formation deadline and ' +
  'aborted deploy signal', async () => {
  const ledger = createContainerLedger();
  const t0 = 1_000_000;
  let clockMs = t0;
  const deployController = new AbortController();
  const recorded = [];
  const {sshRun: baseSsh} = createScriptedSsh(tidbPlacementRules(ledger));
  const sshRun = wrapSignalHonoringSsh(baseSsh, recorded);

  const deployment = await deployers.deployTiDbCluster({
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun,
    campaignId: CAMPAIGN,
    sleep: NO_SLEEP,
    nowFn: () => clockMs,
    signal: deployController.signal,
    opts: {
      signal: deployController.signal,
      deadlineAtMs: t0 + 420_000,
      readiness: {stablePolls: 1, attempts: 3, intervalMs: 0, timeoutMs: 30_000, pollIntervalMs: 1},
    },
  });

  // Deploy-only controller aborts after formation; retained operations must never see it.
  deployController.abort();

  for (const atMs of [t0 + 419_000, t0 + 421_000, t0 + 1_000_000]) {
    clockMs = atMs;
    recorded.length = 0;
    const placement = await deployment.operations.observePlacement();
    assert.equal(placement.ready, true, `observePlacement ready at ${atMs}`);
    assert.equal(placement.observedAt, new Date(atMs).toISOString());

    const roles = await deployment.operations.observeRoles();
    assert.ok(stringIncludes(roles.stores, HOSTS[0]), `observeRoles at ${atMs}`);

    const ready = await deployment.operations.awaitReady();
    assert.equal(ready.pd.state, 'ready', `awaitReady pd at ${atMs}`);
    assert.equal(ready.sql.attempts, 1, `awaitReady sql at ${atMs}`);

    assert.equal(
      arraySome(recorded, (c) => c.signal === deployController.signal),
      false,
      `retained operation at ${atMs} must never inherit deploy AbortSignal`,
    );
  }
});

test('Postgres retained operations use fresh windows independent of expired formation deadline ' +
  'and aborted deploy signal', async () => {
  const ledger = createContainerLedger();
  const t0 = 2_000_000;
  let clockMs = t0;
  const deployController = new AbortController();
  const recorded = [];
  const {sshRun: baseSsh} = createScriptedSsh(postgresHealthyRules(ledger));
  const sshRun = wrapSignalHonoringSsh(baseSsh, recorded);

  const deployment = await deployers.deployPostgresCluster({
    targetId: 'pg-patroni-sync-ha-rf3',
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun,
    campaignId: CAMPAIGN,
    sleep: NO_SLEEP,
    nowFn: () => clockMs,
    signal: deployController.signal,
    opts: {
      signal: deployController.signal,
      deadlineAtMs: t0 + 420_000,
      readiness: {stablePolls: 1, attempts: 3, intervalMs: 0, timeoutMs: 30_000, pollIntervalMs: 1},
    },
  });

  deployController.abort();

  for (const atMs of [t0 + 419_000, t0 + 421_000, t0 + 1_000_000]) {
    clockMs = atMs;
    recorded.length = 0;
    const placement = await deployment.operations.observePlacement();
    assert.equal(placement.servers.length, 3, `observePlacement servers at ${atMs}`);

    const roles = await deployment.operations.observeRoles();
    assert.equal(roles.replication.length, 2, `observeRoles replication at ${atMs}`);

    const ready = await deployment.operations.awaitReady();
    assert.equal(ready.servers.length, 3, `awaitReady servers at ${atMs}`);
    assert.equal(ready.streaming.state, 'ready', `awaitReady streaming at ${atMs}`);

    assert.equal(
      arraySome(recorded, (c) => c.signal === deployController.signal),
      false,
      `retained operation at ${atMs} must never inherit deploy AbortSignal`,
    );
  }
});

test('TiDB waitForPhysicalTablePlacement rejects late ready: true past deadlineAtMs, ' +
  'timeoutMs, or after signal.abort()', async () => {
  const endpoint = {host: HOSTS[0], port: 4000};
  const expectedAddresses = arrayMap(HOSTS, (host) => `${host}:20160`);
  const storesStdout = arrayJoin(
    arrayMap(HOSTS, (host, index) => `${index + 1}\t${host}:20160\tUp`),
    '\n',
  );
  const peersStdout = arrayJoin(
    arrayMap(HOSTS, (host, index) =>
      `101\t${200 + index}\t${index + 1}\t${host}:20160\t0\t${index === 0 ? 1 : 0}\tNORMAL`),
    '\n',
  );

  // 1. Late ready: true resolving after deadlineAtMs
  let clockMs = 10_000;
  const deadlineRecorded = [];
  const deadlineProvider = createFakeTiDbProvider({
    execImpl: async (_id, argv, callOpts) => {
      deadlineRecorded.push(callOpts);
      const sqlText = argv[argv.length - 1];
      if (stringIncludes(sqlText, 'TIKV_REGION_STATUS')) {
        clockMs = 15_500;
        return {exitCode: 0, stdout: peersStdout, stderr: ''};
      }
      clockMs = 14_000;
      return {exitCode: 0, stdout: storesStdout, stderr: ''};
    },
  });
  await assert.rejects(
    waitForPhysicalTablePlacement({
      provider: deadlineProvider,
      clientContainerId: 'cid-1',
      endpoint,
      expectedAddresses,
      databaseName: 'lagrange_tidb_oltp',
      tableName: 'stock',
      timeoutMs: 90_000,
      pollIntervalMs: 100,
      deadlineAtMs: 15_000,
      signal: null,
      now: () => clockMs,
    }),
    (error) => {
      assert.equal(error.deadlineExpired, true);
      assert.equal(error.aborted, false);
      return true;
    },
  );
  assert.equal(deadlineRecorded.length, 2);
  assert.equal(deadlineRecorded[0].timeoutMs, 5_000);
  assert.equal(deadlineRecorded[1].timeoutMs, 1_000);
  assert.equal(objectHasOwn(deadlineRecorded[0], 'signal'), true);
  assert.equal(deadlineRecorded[0].signal, null);

  // 2. Late ready: true resolving after timeoutMs with deadlineAtMs: null
  let timeoutClock = 20_000;
  const timeoutProvider = createFakeTiDbProvider({
    execImpl: async (_id, argv) => {
      const sqlText = argv[argv.length - 1];
      if (stringIncludes(sqlText, 'TIKV_REGION_STATUS')) {
        timeoutClock = 20_500;
        return {exitCode: 0, stdout: peersStdout, stderr: ''};
      }
      return {exitCode: 0, stdout: storesStdout, stderr: ''};
    },
  });
  await assert.rejects(
    waitForPhysicalTablePlacement({
      provider: timeoutProvider,
      clientContainerId: 'cid-1',
      endpoint,
      expectedAddresses,
      databaseName: 'lagrange_tidb_oltp',
      tableName: 'stock',
      timeoutMs: 100,
      pollIntervalMs: 10,
      deadlineAtMs: null,
      now: () => timeoutClock,
    }),
    (error) => {
      assert.equal(error.timedOut, true);
      assert.equal(error.deadlineExpired, false);
      return true;
    },
  );

  // 3. Late ready: true resolving after signal.abort()
  const controller = new AbortController();
  const abortProvider = createFakeTiDbProvider({
    execImpl: async (_id, argv) => {
      const sqlText = argv[argv.length - 1];
      if (stringIncludes(sqlText, 'TIKV_REGION_STATUS')) {
        controller.abort();
        return {exitCode: 0, stdout: peersStdout, stderr: ''};
      }
      return {exitCode: 0, stdout: storesStdout, stderr: ''};
    },
  });
  await assert.rejects(
    waitForPhysicalTablePlacement({
      provider: abortProvider,
      clientContainerId: 'cid-1',
      endpoint,
      expectedAddresses,
      databaseName: 'lagrange_tidb_oltp',
      tableName: 'stock',
      timeoutMs: 10_000,
      pollIntervalMs: 10,
      signal: controller.signal,
    }),
    (error) => {
      assert.equal(error.aborted, true);
      return true;
    },
  );
});

test('TiDB placement & SQL readiness distinguish pure observer infrastructure from SQL denial ' +
  'followed by SSH/Docker errors', async () => {
  const endpoint = {host: HOSTS[0], port: 4000};
  const expectedAddresses = arrayMap(HOSTS, (host) => `${host}:20160`);

  // 1. Placement pure SSH timeouts / exit 255 / Docker 125 -> observerInfrastructure: true
  let infraClock = 50_000;
  let infraAttempt = 0;
  const infraProvider = createFakeTiDbProvider({
    execImpl: async () => {
      infraAttempt += 1;
      infraClock += 15;
      if (infraAttempt === 1) {
        const err = new Error('ssh timed out');
        err.timedOut = true;
        throw err;
      }
      if (infraAttempt === 2) {
        return {exitCode: 255, stdout: '', stderr: 'ssh: connect failed'};
      }
      return {exitCode: 125, stdout: '', stderr: 'docker: Error response from daemon'};
    },
  });
  await assert.rejects(
    typedReadiness('tidb-physical-placement', () =>
      waitForPhysicalTablePlacement({
        provider: infraProvider,
        clientContainerId: 'cid-1',
        endpoint,
        expectedAddresses,
        databaseName: 'lagrange_tidb_oltp',
        tableName: 'stock',
        timeoutMs: 40,
        pollIntervalMs: 0,
        now: () => infraClock,
      })),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.observerInfrastructure, true);
      return true;
    },
  );

  // 2. Placement SQL non-ready followed by SSH timeout -> observerInfrastructure: false
  let mixedClock = 60_000;
  let mixedAttempt = 0;
  const mixedProvider = createFakeTiDbProvider({
    execImpl: async (_id, argv) => {
      const sqlText = argv[argv.length - 1];
      if (stringIncludes(sqlText, 'WHERE STORE_STATE_NAME')) {
        mixedAttempt += 1;
      }
      if (mixedAttempt === 1) {
        if (stringIncludes(sqlText, 'TIKV_REGION_STATUS')) {
          mixedClock += 15;
          return {exitCode: 0, stdout: '', stderr: ''};
        }
        return {exitCode: 0, stdout: `1\t${HOSTS[0]}:20160\tUp`, stderr: ''};
      }
      mixedClock += 30;
      const err = new Error('ssh timed out');
      err.timedOut = true;
      throw err;
    },
  });
  await assert.rejects(
    typedReadiness('tidb-physical-placement', () =>
      waitForPhysicalTablePlacement({
        provider: mixedProvider,
        clientContainerId: 'cid-1',
        endpoint,
        expectedAddresses,
        databaseName: 'lagrange_tidb_oltp',
        tableName: 'stock',
        timeoutMs: 40,
        pollIntervalMs: 0,
        now: () => mixedClock,
      })),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.observerInfrastructure, false);
      assert.equal(error.lastCompletedObservation?.ready, false);
      assert.equal(error.lastCompletedObservation?.storesReady, false);
      return true;
    },
  );

  // 3. SQL readiness Docker 125 vs SQL '0' followed by SSH timeout + inspect failure properties
  let sqlClock = 70_000;
  const docker125Provider = createFakeTiDbProvider({
    execImpl: async () => {
      sqlClock += 20;
      return {exitCode: 125, stdout: '', stderr: 'Cannot connect to the Docker daemon'};
    },
  });
  await assert.rejects(
    typedReadiness('tidb-sql-3-up-stores', () =>
      waitForTiDbReferenceSqlReady(docker125Provider, 'cid-1', endpoint, {
        timeoutMs: 30,
        pollIntervalMs: 0,
        now: () => sqlClock,
        watchedContainers: [{role: 'pd', containerId: 'pd-1'}],
      })),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.observerInfrastructure, true);
      return true;
    },
  );

  let sqlMixedClock = 80_000;
  let sqlMixedAttempt = 0;
  const sqlMixedProvider = createFakeTiDbProvider({
    execImpl: async () => {
      sqlMixedAttempt += 1;
      if (sqlMixedAttempt === 1) {
        sqlMixedClock += 15;
        return {exitCode: 0, stdout: '0', stderr: ''};
      }
      sqlMixedClock += 20;
      const err = new Error('ssh timed out');
      err.timedOut = true;
      throw err;
    },
  });
  await assert.rejects(
    waitForTiDbReferenceSqlReady(sqlMixedProvider, 'cid-1', endpoint, {
      timeoutMs: 30,
      pollIntervalMs: 0,
      now: () => sqlMixedClock,
      watchedContainers: [{role: 'pd', containerId: 'pd-1'}],
    }),
    (error) => {
      assert.equal(error.hadProductDenial, true);
      assert.equal(error.observerInfrastructure, false);
      return true;
    },
  );

  const inspectErrProvider = createFakeTiDbProvider({
    inspectImpl: async () => {
      const err = new Error('ssh timed out');
      err.timedOut = true;
      err.exitCode = 255;
      throw err;
    },
  });
  await assert.rejects(
    waitForTiDbReferenceSqlReady(inspectErrProvider, 'cid-1', endpoint, {
      timeoutMs: 30,
      pollIntervalMs: 0,
      watchedContainers: [{role: 'pd', containerId: 'pd-1'}],
    }),
    (error) => {
      assert.equal(error.timedOut, true);
      assert.equal(error.transportError, true);
      assert.equal(error.observerInfrastructure, true);
      return true;
    },
  );
});

test('TiDB retained callbacks honor caller {signal, signal: null, deadlineAtMs} and settle ' +
  'in-flight SSH before returning', async () => {
  const ledger = createContainerLedger();
  const clockMs = 5_000_000;
  let hangStores = false;
  const timeline = [];
  const recorded = [];
  const opController = new AbortController();
  const deployController = new AbortController();
  const {sshRun: baseSsh} = createScriptedSsh([
    [(command) => stringIncludes(command, 'TIKV_STORE_STATUS ORDER BY STORE_ID'), () => {
      if (!hangStores) {
        return `${arrayJoin(
          arrayMap(HOSTS, (host, index) => `${index + 1}\t${host}:20160\tUp`),
          '\n',
        )}\n__exit_code=0`;
      }
      return new Promise((resolve) => {
        timeline.push('stores-started');
        setTimeout(() => {
          timeline.push('op-aborted');
          opController.abort();
        }, 5);
        setTimeout(() => {
          timeline.push('stores-settled');
          resolve('1\t10.0.0.1:20160\tUp\n__exit_code=0');
        }, 25);
      });
    }],
    [/^docker stop -t 0 [0-9a-f]+$/u, (command) => {
      timeline.push('readiness-client-stopped');
      return ledger.stop(command);
    }],
    ...tidbPlacementRules(ledger),
  ]);
  const sshRun = wrapSignalHonoringSsh(baseSsh, recorded);

  const deployment = await deployers.deployTiDbCluster({
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun,
    campaignId: CAMPAIGN,
    sleep: NO_SLEEP,
    nowFn: () => clockMs,
    signal: deployController.signal,
    opts: {
      signal: deployController.signal,
      readiness: {stablePolls: 1, attempts: 3, intervalMs: 0, timeoutMs: 30, pollIntervalMs: 1},
    },
  });
  deployController.abort();

  // Explicit {signal: null} preserves signal: null in callOpts
  recorded.length = 0;
  await deployment.operations.observeRoles({signal: null});
  const nullSignals = arrayFilter(recorded, (c) => c.hasSignalProp && c.signal === null);
  assert.ok(nullSignals.length > 0, 'explicit {signal: null} must be preserved in callOpts');

  // Explicit {deadlineAtMs} bounds call timeoutMs
  recorded.length = 0;
  await deployment.operations.observeRoles({deadlineAtMs: clockMs + 4_500});
  const boundedCall = arrayFilter(recorded, (c) => stringIncludes(c.command, 'TIKV_STORE_STATUS'));
  assert.equal(boundedCall[0].timeoutMs, 4_500);

  // Aborting caller signal settles in-flight SSH and stops readiness client before rejecting
  hangStores = true;
  timeline.length = 0;
  await assert.rejects(
    deployment.operations.observeRoles({signal: opController.signal}),
    () => true,
  );
  const settledIdx = arrayFindIndex(timeline, (item) => item === 'stores-settled');
  const stoppedIdx = arrayFindIndex(timeline, (item) => item === 'readiness-client-stopped');
  assert.ok(settledIdx >= 0 && stoppedIdx > settledIdx,
    `in-flight SSH must settle before readiness-client stop (${JSON.stringify(timeline)})`);
});

test('Postgres retained callbacks honor caller {signal, signal: null, deadlineAtMs} and settle ' +
  'in-flight SSH before returning', async () => {
  const ledger = createContainerLedger();
  const clockMs = 6_000_000;
  let hangQuery = false;
  const timeline = [];
  const recorded = [];
  const opController = new AbortController();
  const deployController = new AbortController();
  const {sshRun: baseSsh} = createScriptedSsh([
    [/pg_is_in_recovery/u, (_command, host) => {
      if (!hangQuery) return host === HOSTS[0] ? 'f' : 't';
      return new Promise((resolve) => {
        timeline.push('pg-query-started');
        setTimeout(() => {
          timeline.push('pg-op-aborted');
          opController.abort();
        }, 5);
        setTimeout(() => {
          timeline.push('pg-query-settled');
          resolve('f');
        }, 25);
      });
    }],
    ...postgresHealthyRules(ledger, {standbys: []}),
  ]);
  const sshRun = wrapSignalHonoringSsh(baseSsh, recorded);

  const deployment = await deployers.deployPostgresCluster({
    targetId: 'pg-single-primary',
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun,
    campaignId: CAMPAIGN,
    sleep: NO_SLEEP,
    nowFn: () => clockMs,
    signal: deployController.signal,
    opts: {
      signal: deployController.signal,
      readiness: {stablePolls: 1, attempts: 3, intervalMs: 0, timeoutMs: 30, pollIntervalMs: 1},
    },
  });
  deployController.abort();

  // Explicit {signal: null} preserves signal: null on observePlacement / observeRoles / awaitReady
  recorded.length = 0;
  await deployment.operations.observePlacement({signal: null});
  assert.ok(
    arraySome(recorded, (c) => c.hasSignalProp && c.signal === null),
    'Postgres observePlacement must preserve explicit {signal: null}',
  );

  // Explicit {deadlineAtMs} bounds call timeoutMs & rejects when already expired
  recorded.length = 0;
  await deployment.operations.observeRoles({deadlineAtMs: clockMs + 3_200});
  assert.equal(recorded[0].timeoutMs, 3_200);
  await assert.rejects(
    deployment.operations.observeRoles({deadlineAtMs: clockMs - 1}),
    (error) => error.deadlineExpired === true,
  );

  // Aborting caller signal settles in-flight SSH BEFORE observeRoles rejects
  hangQuery = true;
  timeline.length = 0;
  await assert.rejects(
    deployment.operations.observeRoles({signal: opController.signal}),
    () => {
      timeline.push('observeRoles-rejected');
      return true;
    },
  );
  const settledIdx = arrayFindIndex(timeline, (item) => item === 'pg-query-settled');
  const rejectedIdx = arrayFindIndex(timeline, (item) => item === 'observeRoles-rejected');
  assert.ok(settledIdx >= 0 && rejectedIdx > settledIdx,
    `in-flight SSH must settle before observeRoles rejects (${JSON.stringify(timeline)})`);
});

test('startTiDbReferencePhysicalCluster forwards signal, deadlineAtMs, now, and callOptions',
  async () => {
    const inspectCalls = [];
    const execCalls = [];
    const controller = new AbortController();
    const clockMs = 90_000;
    const makeHostProvider = (hostLabel) => ({
      async createContainer(containerOptions) {
        return {containerId: `${hostLabel}-${containerOptions.name}`};
      },
      async inspectContainer(containerId, callOptions) {
        inspectCalls.push({hostLabel, containerId, callOptions});
        return {State: {Running: true, Status: 'running', ExitCode: 0}};
      },
      async execInContainer(containerId, command, callOptions) {
        execCalls.push({hostLabel, containerId, command, callOptions});
        return {exitCode: 0, stdout: '1\n', stderr: ''};
      },
      async stopContainer() {},
      async removeContainer() {},
    });

    const cluster = await startTiDbReferencePhysicalCluster({
      control: {host: '10.1.0.1', provider: makeHostProvider('ctrl')},
      storage: [
        {host: '10.1.0.2', provider: makeHostProvider('s1')},
        {host: '10.1.0.3', provider: makeHostProvider('s2')},
        {host: '10.1.0.4', provider: makeHostProvider('s3')},
      ],
      readinessTimeoutMs: 5_000,
      readinessPollIntervalMs: 1,
      signal: controller.signal,
      deadlineAtMs: clockMs + 4_000,
      now: () => clockMs,
    });

    assert.equal(cluster.readiness.attempts, 1);
    assert.ok(inspectCalls.length > 0);
    assert.ok(execCalls.length > 0);
    assert.equal(inspectCalls[0].callOptions.signal, controller.signal);
    assert.equal(inspectCalls[0].callOptions.timeoutMs, 4_000);
    assert.equal(execCalls[0].callOptions.signal, controller.signal);
    assert.equal(execCalls[0].callOptions.timeoutMs, 4_000);

    // Ensure inspectContainerIfExists / inspectContainerState forward callOptions
    await cluster.provider.inspectContainerState('ctrl-tidb-physical-pd', {
      signal: null,
      timeoutMs: 1_234,
    });
    const lastInspect = inspectCalls[inspectCalls.length - 1];
    assert.equal(lastInspect.callOptions.signal, null);
    assert.equal(lastInspect.callOptions.timeoutMs, 1_234);
    await cluster.stop();
  });

test('TiDB placement & SQL readiness preserve observerInfrastructure: true when deadlineAtMs ' +
  'expires after SSH 255 / Docker 125 failures', async () => {
  const endpoint = {host: HOSTS[0], port: 4000};
  const expectedAddresses = arrayMap(HOSTS, (host) => `${host}:20160`);

  let placementClock = 100_000;
  const placementProvider = createFakeTiDbProvider({
    execImpl: async () => {
      placementClock += 2_000;
      return {exitCode: 255, stdout: '', stderr: 'ssh: connect failed'};
    },
  });
  await assert.rejects(
    typedReadiness('tidb-physical-placement', () =>
      waitForPhysicalTablePlacement({
        provider: placementProvider,
        clientContainerId: 'cid-1',
        endpoint,
        expectedAddresses,
        databaseName: 'lagrange_tidb_oltp',
        tableName: 'stock',
        timeoutMs: 120_000,
        pollIntervalMs: 0,
        deadlineAtMs: 103_000,
        now: () => placementClock,
      })),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.deadlineExpired, true);
      assert.equal(error.observerInfrastructure, true);
      return true;
    },
  );

  let sqlClock = 200_000;
  const sqlProvider = createFakeTiDbProvider({
    execImpl: async () => {
      sqlClock += 2_000;
      return {exitCode: 125, stdout: '', stderr: 'Cannot connect to the Docker daemon'};
    },
  });
  await assert.rejects(
    typedReadiness('tidb-sql-3-up-stores', () =>
      waitForTiDbReferenceSqlReady(sqlProvider, 'cid-1', endpoint, {
        timeoutMs: 120_000,
        pollIntervalMs: 0,
        deadlineAtMs: 203_000,
        now: () => sqlClock,
        watchedContainers: [{role: 'pd', containerId: 'pd-1'}],
      })),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.deadlineExpired, true);
      assert.equal(error.observerInfrastructure, true);
      return true;
    },
  );
});

test('deployTiDbCluster and deployPostgresCluster forward top-level deadlineAtMs/deadlineMs and ' +
  'tail signal/timeout to inspectProducts and bindEndpointToContainer', async () => {
  const fastOpts = {
    readiness: {stablePolls: 1, attempts: 3, intervalMs: 0, timeoutMs: 30, pollIntervalMs: 1},
  };
  const tidbLedger = createContainerLedger();
  const tidbRecorded = [];
  const tidbController = new AbortController();
  const tidbClock = 300_000;
  const {sshRun: tidbBase} = createScriptedSsh(tidbPlacementRules(tidbLedger));
  await deployers.deployTiDbCluster({
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun: wrapSignalHonoringSsh(tidbBase, tidbRecorded),
    campaignId: CAMPAIGN,
    sleep: NO_SLEEP,
    nowFn: () => tidbClock,
    signal: tidbController.signal,
    deadlineAtMs: tidbClock + 25_000,
    opts: fastOpts,
  });
  const tidbBindCalls = arrayFilter(tidbRecorded, (c) =>
    stringIncludes(c.command, '--pid container:'));
  assert.ok(tidbBindCalls.length > 0);
  assert.equal(tidbBindCalls[0].signal, tidbController.signal);
  const tidbInspectCalls = arrayFilter(tidbRecorded, (c) =>
    stringIncludes(c.command, 'docker info --format'));
  assert.ok(tidbInspectCalls.length > 0);
  assert.equal(tidbInspectCalls[0].signal, tidbController.signal);

  const pgLedger = createContainerLedger();
  const pgRecorded = [];
  const pgController = new AbortController();
  const pgClock = 400_000;
  const {sshRun: pgBase} = createScriptedSsh(postgresHealthyRules(pgLedger, {standbys: []}));
  await deployers.deployPostgresCluster({
    targetId: 'pg-single-primary',
    hosts: HOSTS,
    clientIp: CLIENT,
    sshRun: wrapSignalHonoringSsh(pgBase, pgRecorded),
    campaignId: CAMPAIGN,
    sleep: NO_SLEEP,
    nowFn: () => pgClock,
    signal: pgController.signal,
    deadlineMs: 15_000,
    opts: fastOpts,
  });
  const pgBindCalls = arrayFilter(pgRecorded, (c) =>
    stringIncludes(c.command, '--pid container:'));
  assert.ok(pgBindCalls.length > 0);
  assert.equal(pgBindCalls[0].signal, pgController.signal);
  const pgInspectCalls = arrayFilter(pgRecorded, (c) =>
    stringIncludes(c.command, 'docker info --format'));
  assert.ok(pgInspectCalls.length > 0);
  assert.equal(pgInspectCalls[0].signal, pgController.signal);
});
