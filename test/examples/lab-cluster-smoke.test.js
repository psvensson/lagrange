/**
 * Deterministic unit tests for Lagrange lab cluster smoke fixtures.
 *
 * Verifies C1b port schema compliance, member execution environment, joiner contact
 * liveness, observer readiness predicates and stability window, pg-smoke activation
 * and descriptor validation, and profile separation.
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  PROFILE,
  RELEASE_0_2_6_SUT,
  SCENARIO_A_GATE_FACTS,
  assertNoPortConflicts,
  assertValidPort,
  generateClusterSpec,
  validateClusterConfigOptions,
} from '../../examples/lab-cluster-smoke/cluster-config.js';

import {
  parseCliArgs as parseWaitSeedCliArgs,
  waitForSeedLivez,
} from '../../examples/lab-cluster-smoke/wait-seed.js';

import {
  AGGREGATE_DIAGNOSTIC_MAX_BYTES,
  DIAGNOSTIC_MAX_BYTES,
  evaluateReadinessSample,
  normalizeControlSnapshot,
  normalizePartitionDiagnostics,
  normalizePreflightSnapshot,
  observeCluster,
  sanitizeDiagnostic,
} from '../../examples/lab-cluster-smoke/observe-cluster.js';

import {
  escapeSqlStringLiteral,
  runPgSmoke,
} from '../../examples/lab-cluster-smoke/pg-smoke.js';

import {buildLabJob} from '../../examples/lab-cluster-smoke/build-lab-job.js';

describe('cluster-config: C1b specification and options validation', () => {
  it('enforces C1b 5-key port schema with wildcard rest bind and loopback admin/transport', () => {
    const {spec, fixtureMetadata} = generateClusterSpec({
      profile: PROFILE.RELEASE_0_2_6_SMOKE,
      memberCount: 3,
      basePort: 19000,
      allowWildcardRestBind: true,
      enablePg: false,
    });

    assert.equal(spec.protocol, 'lab3-process-cluster/v1');
    assert.equal(spec.nodeCount, 3);
    assert.equal(spec.members.length, 3);
    assert.deepEqual(spec.auxiliaryPorts, []);

    for (let i = 0; i < spec.members.length; i += 1) {
      const member = spec.members[i];
      assert.equal(member.cwd, 'member-data');
      assert.equal(member.ports.length, 3);

      const [restPort, adminPort, transportPort] = member.ports;

      // Assert exact 5 keys in port objects
      const expectedKeys = ['address', 'connectAddress', 'name', 'port', 'protocol'];
      assert.deepEqual(Object.keys(restPort).sort(), expectedKeys);
      assert.deepEqual(Object.keys(adminPort).sort(), expectedKeys);
      assert.deepEqual(Object.keys(transportPort).sort(), expectedKeys);

      // Verify bind and connect addresses
      assert.equal(restPort.name, 'rest');
      assert.equal(restPort.address, '0.0.0.0');
      assert.equal(restPort.connectAddress, '127.0.0.1');
      assert.equal(restPort.protocol, 'tcp');
      assert.equal(restPort.port, 19000 + (i * 4));

      assert.equal(adminPort.name, 'admin');
      assert.equal(adminPort.address, '127.0.0.1');
      assert.equal(adminPort.connectAddress, '127.0.0.1');
      assert.equal(adminPort.protocol, 'tcp');
      assert.equal(adminPort.port, 19000 + (i * 4) + 1);

      assert.equal(transportPort.name, 'transport');
      assert.equal(transportPort.address, '127.0.0.1');
      assert.equal(transportPort.connectAddress, '127.0.0.1');
      assert.equal(transportPort.protocol, 'tcp');
      assert.equal(transportPort.port, 19000 + (i * 4) + 2);
    }

    assert.equal(fixtureMetadata.allowWildcardRestBind, true);
    assert.equal(fixtureMetadata.logicalNodes, 3);
    assert.equal(fixtureMetadata.physicalHosts, 1);
    assert.equal(fixtureMetadata.failureDomains, 1);
  });

  it('requires allowWildcardRestBind: true before emitting 0.0.0.0 REST bind for release-0.2.6-smoke', () => {
    assert.throws(
      () => generateClusterSpec({
        profile: PROFILE.RELEASE_0_2_6_SMOKE,
        memberCount: 3,
        allowWildcardRestBind: false,
      }),
      /allowWildcardRestBind: true is required before emitting 0\.0\.0\.0 REST bind/,
    );

    assert.throws(
      () => generateClusterSpec({
        profile: PROFILE.RELEASE_0_2_6_SMOKE,
        memberCount: 3,
      }),
      /allowWildcardRestBind: true is required before emitting 0\.0\.0\.0 REST bind/,
    );
  });

  it('enforces exact per-member env variables and strictly omits NODE_ID', () => {
    const {spec} = generateClusterSpec({
      profile: PROFILE.RELEASE_0_2_6_SMOKE,
      memberCount: 3,
      basePort: 20000,
      allowWildcardRestBind: true,
    });

    for (let i = 0; i < spec.members.length; i += 1) {
      const env = spec.members[i].env;
      assert.equal(env.NODE_ID, undefined, 'NODE_ID must NOT be set in member env');
      assert.equal(env.NODE_ADDRESS, `127.0.0.1:${20000 + (i * 4)}`);
      assert.equal(env.REST_API_PORT, String(20000 + (i * 4)));
      assert.equal(env.ADMIN_WS_PORT, String(20000 + (i * 4) + 1));
      assert.equal(env.TRANSPORT_WS_PORT, String(20000 + (i * 4) + 2));
      assert.equal(env.ADMIN_WS_HOST, '127.0.0.1');
      assert.equal(env.TRANSPORT_WS_HOST, '127.0.0.1');
      assert.equal(env.DATA_DIR, 'member-data');
      assert.equal(env.MESSAGE_GROUP_REPLICA_COUNT, '3');
      assert.equal(env.PARTITION_DEFAULT_REPLICA_COUNT, '3');
      assert.equal(env.LOG_LEVEL, 'info');
    }
  });

  it('emits C1b auxiliaryPorts reservation and handoff metadata when enablePg is true', () => {
    const {spec, fixtureMetadata} = generateClusterSpec({
      profile: PROFILE.RELEASE_0_2_6_SMOKE,
      memberCount: 3,
      basePort: 21000,
      pgPort: 21099,
      allowWildcardRestBind: true,
      enablePg: true,
    });

    assert.equal(spec.auxiliaryPorts.length, 1);
    const aux = spec.auxiliaryPorts[0];
    assert.equal(aux.name, 'pg-smoke');
    assert.equal(aux.address, '127.0.0.1');
    assert.equal(aux.connectAddress, '127.0.0.1');
    assert.equal(aux.protocol, 'tcp');
    assert.equal(aux.port, 21099);
    assert.equal(aux.owner, 'any-member');
    assert.equal(aux.handoffAt, 'observer-start');
    assert.equal(aux.requiredAt, 'observer-exit');

    assert.equal(fixtureMetadata.enablePg, true);
    assert.equal(fixtureMetadata.pgPort, 21099);
    assert.deepEqual(fixtureMetadata.pgConfig, {
      host: '127.0.0.1',
      port: 21099,
      authMode: 'trust',
      tlsMode: 'disable',
      replicaCount: 1,
    });
  });

  it('detects port collisions including 0.0.0.0 wildcard conflicts', () => {
    assert.throws(
      () => assertNoPortConflicts([
        {name: 'node-1:rest', address: '0.0.0.0', port: 18080},
        {name: 'node-2:admin', address: '127.0.0.1', port: 18080},
      ]),
      /Port conflict detected between node-1:rest \(0\.0\.0\.0:18080\) and node-2:admin \(127\.0\.0\.1:18080\)/,
    );

    assert.throws(
      () => assertNoPortConflicts([
        {name: 'node-1:admin', address: '127.0.0.1', port: 18081},
        {name: 'auxiliary:pg-smoke', address: '127.0.0.1', port: 18081},
      ]),
      /Port conflict detected between node-1:admin \(127\.0\.0\.1:18081\) and auxiliary:pg-smoke \(127\.0\.0\.1:18081\)/,
    );

    assert.doesNotThrow(() => {
      assertNoPortConflicts([
        {name: 'node-1:rest', address: '0.0.0.0', port: 18080},
        {name: 'node-1:admin', address: '127.0.0.1', port: 18081},
      ]);
    });
  });

  it('rejects out of range port values', () => {
    assert.throws(() => assertValidPort(80, 'privileged port'), /between 1024 and 65535/);
    assert.throws(() => assertValidPort(70000, 'overflow port'), /between 1024 and 65535/);
    assert.throws(() => assertValidPort('18080', 'string port'), /between 1024 and 65535/);
  });
});

describe('fixture profiles: release-0.2.6-smoke vs scenario-a-dev-formation separation', () => {
  it('binds release-0.2.6-smoke to exact 0.2.6 tarball hashes and head', () => {
    const validated = validateClusterConfigOptions({
      profile: PROFILE.RELEASE_0_2_6_SMOKE,
      memberCount: 3,
      allowWildcardRestBind: true,
    });
    assert.equal(validated.profile, PROFILE.RELEASE_0_2_6_SMOKE);

    const {fixtureMetadata} = generateClusterSpec({
      profile: PROFILE.RELEASE_0_2_6_SMOKE,
      memberCount: 3,
      allowWildcardRestBind: true,
    });

    assert.equal(fixtureMetadata.profile, PROFILE.RELEASE_0_2_6_SMOKE);
    assert.deepEqual(fixtureMetadata.sut, RELEASE_0_2_6_SUT);
    assert.equal(fixtureMetadata.sut.version, '0.2.6');
    assert.equal(fixtureMetadata.sut.gitHead, 'a1e26f6de84433a3913c2ef855d1b787e926d7eb');
    assert.equal(
      fixtureMetadata.sut.tarballSha256,
      '742393020d9229215b1381a0f426ca7c45a19da04df7cd6202a63c73dbddfa74',
    );
    assert.equal(fixtureMetadata.sut.tarballBytes, 4650101);
    assert.equal(fixtureMetadata.scenarioAGateFacts, null);
  });

  it('binds scenario-a-dev-formation to exact commit 7f80bcb6 and records gate facts without fabrication', () => {
    const {fixtureMetadata} = generateClusterSpec({
      profile: PROFILE.SCENARIO_A_DEV_FORMATION,
      memberCount: 5,
      allowWildcardRestBind: true,
    });

    assert.equal(fixtureMetadata.profile, PROFILE.SCENARIO_A_DEV_FORMATION);
    assert.equal(fixtureMetadata.sut.coreHeadSha, '7f80bcb656e8b3cb5297cb3170b93b8dfeca3b03');
    assert.deepEqual(fixtureMetadata.scenarioAGateFacts, SCENARIO_A_GATE_FACTS);
    assert.equal(fixtureMetadata.scenarioAGateFacts.requiredConsecutiveColdFormations, 3);
    assert.equal(fixtureMetadata.scenarioAGateFacts.semanticProofIdsImplemented, 3);
    assert.equal(fixtureMetadata.scenarioAGateFacts.semanticProofIdsRequired, 33);
    assert.equal(fixtureMetadata.scenarioAGateFacts.scenarioAGatesBypassed, false);
    assert.equal(fixtureMetadata.scenarioAGateFacts.comparable, false);
    assert.equal(fixtureMetadata.logicalNodes, 5);
  });

  it('buildLabJob integrates spec with driver: process-cluster envelope', () => {
    const job = buildLabJob({
      profile: PROFILE.RELEASE_0_2_6_SMOKE,
      memberCount: 3,
      allowWildcardRestBind: true,
    });

    assert.equal(job.driver, 'process-cluster');
    assert.equal(job.source, null);
    assert.equal(typeof job.timeoutSeconds, 'number');
    assert.equal(job.spec.protocol, 'lab3-process-cluster/v1');
    assert.equal(job.spec.nodeCount, 3);
    assert.equal(job.fixtureMetadata.profile, PROFILE.RELEASE_0_2_6_SMOKE);
  });
});

describe('wait-seed.js: joiner contact liveness wrapper', () => {
  it('parses CLI arguments accurately', () => {
    const parsed = parseWaitSeedCliArgs([
      '--seed-livez-url',
      'http://127.0.0.1:18080/livez',
      '--deadline-ms',
      '10000',
      '--interval-ms',
      '100',
      '--',
      'node',
      'src/sea-entry.js',
      '--data-dir',
      'member-data',
    ]);

    assert.equal(parsed.seedLivezUrl, 'http://127.0.0.1:18080/livez');
    assert.equal(parsed.deadlineMs, 10000);
    assert.equal(parsed.intervalMs, 100);
    assert.deepEqual(parsed.targetArgv, ['node', 'src/sea-entry.js', '--data-dir', 'member-data']);
  });

  it('polls /livez until contact liveness returns HTTP 200 {alive: true}', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount += 1;
      if (callCount < 3) {
        return {status: 503, json: async () => ({alive: false})};
      }
      return {status: 200, json: async () => ({alive: true, nodeId: 'node-seed-1', state: 'running'})};
    };

    let simulatedTime = 1000;
    const nowFn = () => simulatedTime;
    const sleepFn = async (ms) => {
      simulatedTime += ms;
    };

    const result = await waitForSeedLivez({
      seedLivezUrl: 'http://127.0.0.1:18080/livez',
      deadlineMs: 5000,
      intervalMs: 100,
      fetchFn: mockFetch,
      nowFn,
      sleepFn,
    });

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 3);
    assert.equal(result.nodeId, 'node-seed-1');
    assert.equal(result.wrapperStartedAtMs, 1000);
    assert.equal(result.execStartedAtMs, 1200);
  });

  it('proves /readyz 503 does NOT gate or block joiner exec (livez contact liveness only)', async () => {
    // Proves that when /livez returns 200 {alive: true}, wait-seed succeeds immediately
    // without inspecting or depending on /readyz (which might still be 503 during formation).
    const mockFetch = async (url) => {
      if (url.endsWith('/livez')) {
        return {status: 200, json: async () => ({alive: true, nodeId: 'node-seed-1'})};
      }
      if (url.endsWith('/readyz')) {
        return {status: 503, json: async () => ({ready: false, reasons: ['FORMING']})};
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await waitForSeedLivez({
      seedLivezUrl: 'http://127.0.0.1:18080/livez',
      deadlineMs: 3000,
      intervalMs: 50,
      fetchFn: mockFetch,
    });

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
  });

  it('fails closed when contact liveness cannot be established within the deadline', async () => {
    const mockFetch = async () => {
      return {status: 503, json: async () => ({alive: false})};
    };

    let simulatedTime = 1000;
    const nowFn = () => simulatedTime;
    const sleepFn = async (ms) => {
      simulatedTime += ms;
    };

    const result = await waitForSeedLivez({
      seedLivezUrl: 'http://127.0.0.1:18080/livez',
      deadlineMs: 500,
      intervalMs: 100,
      fetchFn: mockFetch,
      nowFn,
      sleepFn,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /Timed out after \d+ms waiting for seed contact liveness/);
  });
});

describe('observe-cluster.js: readiness predicates, stability window, and byte budgets', () => {
  it('evaluates passing readiness samples against actual 0.2.6 schemas', () => {
    const knownNodeIdentities = new Map();
    const sample = [
      {
        member: {name: 'node-1'},
        livez: {ok: true, status: 200, body: {alive: true, nodeId: 'node-id-1'}},
        startupz: {ok: true, status: 200, body: {started: true, phase: 'TRAFFIC_READY', state: 'join_ready'}},
        readyz: {ok: true, status: 200, body: {ready: true, phase: 'TRAFFIC_READY', state: 'join_ready'}},
      },
      {
        member: {name: 'node-2'},
        livez: {ok: true, status: 200, body: {alive: true, nodeId: 'node-id-2'}},
        startupz: {ok: true, status: 200, body: {started: true, phase: 'TRAFFIC_READY', state: 'join_ready'}},
        readyz: {ok: true, status: 200, body: {ready: true, phase: 'TRAFFIC_READY', state: 'join_ready'}},
      },
      {
        member: {name: 'node-3'},
        livez: {ok: true, status: 200, body: {alive: true, nodeId: 'node-id-3'}},
        startupz: {ok: true, status: 200, body: {started: true, phase: 'TRAFFIC_READY', state: 'join_ready'}},
        readyz: {ok: true, status: 200, body: {ready: true, phase: 'TRAFFIC_READY', state: 'join_ready'}},
      },
    ];

    const evalResult = evaluateReadinessSample(sample, knownNodeIdentities);
    assert.equal(evalResult.passing, true);
    assert.equal(evalResult.refusals.length, 0);
    assert.deepEqual(evalResult.nodeIds, ['node-id-1', 'node-id-2', 'node-id-3']);
  });

  it('rejects duplicate nodeIds across members as malformed formation', () => {
    const knownNodeIdentities = new Map();
    const sampleWithDuplicate = [
      {
        member: {name: 'node-1'},
        livez: {ok: true, status: 200, body: {alive: true, nodeId: 'node-id-CLONE'}},
        startupz: {ok: true, status: 200, body: {started: true}},
        readyz: {ok: true, status: 200, body: {ready: true, phase: 'TRAFFIC_READY', state: 'join_ready'}},
      },
      {
        member: {name: 'node-2'},
        livez: {ok: true, status: 200, body: {alive: true, nodeId: 'node-id-CLONE'}},
        startupz: {ok: true, status: 200, body: {started: true}},
        readyz: {ok: true, status: 200, body: {ready: true, phase: 'TRAFFIC_READY', state: 'join_ready'}},
      },
    ];

    const evalResult = evaluateReadinessSample(sampleWithDuplicate, knownNodeIdentities);
    assert.equal(evalResult.passing, false);
    assert.match(evalResult.refusals.join('; '), /Duplicate nodeIds observed across members/);
  });

  it('rejects readiness when readyz phase is not TRAFFIC_READY or state is not join_ready', () => {
    const knownNodeIdentities = new Map();
    const sampleNotReady = [
      {
        member: {name: 'node-1'},
        livez: {ok: true, status: 200, body: {alive: true, nodeId: 'node-id-1'}},
        startupz: {ok: true, status: 200, body: {started: true}},
        readyz: {ok: true, status: 200, body: {ready: true, phase: 'JOIN_READY', state: 'warming'}},
      },
    ];

    const evalResult = evaluateReadinessSample(sampleNotReady, knownNodeIdentities);
    assert.equal(evalResult.passing, false);
    assert.match(evalResult.refusals.join('; '), /readyz phase 'JOIN_READY' !== 'TRAFFIC_READY'/);
    assert.match(evalResult.refusals.join('; '), /readyz state 'warming' !== 'join_ready'/);
  });

  it('resets stability window on sample failure and requires full sustained window', async () => {
    let sampleCounter = 0;
    let simulatedTime = 10000;

    const mockFetch = async (url) => {
      if (url.includes('/livez')) {
        return {status: 200, json: async () => ({alive: true, nodeId: 'n1'})};
      }
      if (url.includes('/startupz')) {
        return {status: 200, json: async () => ({started: true})};
      }
      if (url.includes('/readyz')) {
        sampleCounter += 1;
        // Sample 3 fails temporarily
        if (sampleCounter === 3) {
          return {status: 503, json: async () => ({ready: false, phase: 'JOIN_READY', state: 'warming'})};
        }
        return {status: 200, json: async () => ({ready: true, phase: 'TRAFFIC_READY', state: 'join_ready'})};
      }
      if (url.includes('/control-snapshot')) {
        return {status: 200, json: async () => ({nodes: ['n1'], partitions: ['p1']})};
      }
      return {status: 200, json: async () => ({})};
    };

    const nowFn = () => simulatedTime;
    const sleepFn = async (ms) => {
      simulatedTime += ms;
    };

    const outcome = await observeCluster({
      members: [{name: 'node-1', restPort: 18080, adminWsPort: 18081, transportWsPort: 18082}],
      windowMs: 4000,
      minSamples: 3,
      cadenceMs: 1000,
      maxInterSampleGapMs: 2000,
      overallTimeoutMs: 20000,
      fetchFn: mockFetch,
      nowFn,
      sleepFn,
    });

    assert.equal(outcome.ok, true);
    assert.equal(outcome.status, 'READY');
    // Must have satisfied >= 3 consecutive samples AFTER the reset at sample 3
    assert.ok(outcome.consecutivePassingSamples >= 3);
    assert.ok(outcome.windowDurationMs >= 4000);
  });

  it('normalizes admin diagnostics according to 0.2.6 schemas and flags unknown fields', () => {
    const rawControlSnapshot = {
      nodes: ['node-1', 'node-2'],
      partitions: ['p-1'],
      // publishedNodes, projectedNodes, leaders omitted
    };

    const normalized = normalizeControlSnapshot(rawControlSnapshot);
    assert.deepEqual(normalized.nodes, ['node-1', 'node-2']);
    assert.deepEqual(normalized.partitions, ['p-1']);
    assert.equal(normalized.publishedNodes, 'unknown');
    assert.equal(normalized.projectedNodes, 'unknown');
    assert.equal(normalized.leaders, 'unknown');

    const rawPreflight = {
      schemaVersion: 1,
      nodeId: 'node-1',
      // routerConnectivity, cdcHealth omitted
    };
    const normPreflight = normalizePreflightSnapshot(rawPreflight);
    assert.equal(normPreflight.schemaVersion, 1);
    assert.equal(normPreflight.nodeId, 'node-1');
    assert.equal(normPreflight.routerConnectivity, 'unknown');
    assert.equal(normPreflight.cdcHealth, 'unknown');

    const rawPartitions = {
      schemaVersion: 1,
      nodeId: 'node-1',
      // leaders, voterCounts omitted
    };
    const normPartitions = normalizePartitionDiagnostics(rawPartitions);
    assert.equal(normPartitions.schemaVersion, 1);
    assert.equal(normPartitions.leaders, 'unknown');
    assert.equal(normPartitions.voterCounts, 'unknown');
  });

  it('enforces diagnostic byte budgets with explicit omission records and never forges invalid JSON', () => {
    const budgetState = {
      spentBytes: 0,
      maxAggregateBytes: AGGREGATE_DIAGNOSTIC_MAX_BYTES,
    };

    const smallPayload = {healthy: true, items: [1, 2, 3]};
    const sanitizedSmall = sanitizeDiagnostic(smallPayload, budgetState, 1000);
    assert.deepEqual(sanitizedSmall, smallPayload);
    assert.ok(budgetState.spentBytes > 0);

    // Payload exceeding per-response limit
    const largePayload = {data: 'x'.repeat(DIAGNOSTIC_MAX_BYTES + 10)};
    const sanitizedLarge = sanitizeDiagnostic(largePayload, budgetState, DIAGNOSTIC_MAX_BYTES);
    assert.equal(sanitizedLarge.omitted, true);
    assert.equal(sanitizedLarge.reason, 'BYTE_BUDGET_EXCEEDED');
    assert.ok(sanitizedLarge.byteLength > DIAGNOSTIC_MAX_BYTES);

    // Cumulative aggregate budget exhaustion
    const tinyBudgetState = {
      spentBytes: 150,
      maxAggregateBytes: 200,
    };
    const nextPayload = {data: 'y'.repeat(100)};
    const sanitizedAggregate = sanitizeDiagnostic(nextPayload, tinyBudgetState, 1000);
    assert.equal(sanitizedAggregate.omitted, true);
    assert.equal(sanitizedAggregate.reason, 'AGGREGATE_BYTE_BUDGET_EXCEEDED');
  });
});

describe('pg-smoke.js: PostgreSQL wire smoke activation and validation', () => {
  it('returns NOT_REQUESTED and executes zero queries when enablePg is not true', async () => {
    let wsConnectCalled = false;
    class MockAdminWsClient {
      async connect() {
        wsConnectCalled = true;
      }
    }

    const outcome = await runPgSmoke({
      enablePg: false,
      AdminWsClientClass: MockAdminWsClient,
    });

    assert.equal(outcome.status, 'NOT_REQUESTED');
    assert.equal(outcome.ok, true);
    assert.equal(wsConnectCalled, false);
  });

  it('escapes SQL string literals safely against single quote injection', () => {
    assert.equal(escapeSqlStringLiteral('safe'), '\'safe\'');
    assert.equal(escapeSqlStringLiteral('it\'s dangerous\''), '\'it\'\'s dangerous\'\'\'');
  });

  it('validates pgwire descriptor rules and rejects invalid runtime_config', async () => {
    class MockAdminWsClient {
      async connect() {}
      async close() {}
    }

    // Invalid port (out of range)
    await assert.rejects(
      async () => runPgSmoke({
        enablePg: true,
        pgPort: 999999,
        seedAdminWsPort: 18081,
        seedRestPort: 18080,
        AdminWsClientClass: MockAdminWsClient,
      }),
      /Valid pgPort \(1024\.\.65535\) is required/,
    );
  });

  it('executes full pg-smoke sequence: retains original definition, updates config, verifies discovery and SELECT 1', async () => {
    const queries = [];
    let wsClosed = false;
    let pgClientClosed = false;

    class MockAdminWsClient {
      async connect() {}
      async query(sql) {
        queries.push(sql);
        if (sql.includes('SELECT service_id')) {
          return {
            rows: [
              {
                service_id: 'sys-postgres-wire',
                name: 'sys-postgres-wire',
                version: '1.0',
                replica_count: 0,
                status: 'NOT_STARTED',
                config_json: JSON.stringify({host: '127.0.0.1', authMode: 'trust', tlsMode: 'disable'}),
                updated_at: '2026-10-28T12:00:00Z',
              },
            ],
          };
        }
        return {affectedRows: 1};
      }
      async close() {
        wsClosed = true;
      }
    }

    const mockFetch = async (url) => {
      if (url.includes('/api/admin/discovery/services')) {
        return {
          status: 200,
          json: async () => ({
            services: [
              {
                serviceIds: ['sys-postgres-wire'],
                replicas: [
                  {
                    serviceId: 'sys-postgres-wire',
                    nodeId: 'node-prod-1',
                    address: '127.0.0.1',
                    port: 15432,
                    healthStatus: 'healthy',
                    readiness: {
                      serviceReady: true,
                      workloadReady: true,
                      status: 'ready',
                    },
                    benchmarkAdmission: {
                      admitted: true,
                      status: 'admitted',
                    },
                  },
                ],
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    class MockPgClient {
      constructor(config) {
        this.config = config;
      }
      async connect() {}
      async query(sql) {
        if (sql === 'SELECT 1 AS ok') {
          return {rows: [{ok: 1}]};
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }
      async end() {
        pgClientClosed = true;
      }
    }

    const outcome = await runPgSmoke({
      enablePg: true,
      pgPort: 15432,
      seedAdminWsPort: 18081,
      seedRestPort: 18080,
      activeNodeIds: new Set(['node-prod-1', 'node-prod-2']),
      AdminWsClientClass: MockAdminWsClient,
      PgClientClass: MockPgClient,
      fetchFn: mockFetch,
    });

    assert.equal(outcome.ok, true);
    assert.equal(outcome.status, 'PASSED');
    assert.equal(outcome.originalServiceDefinition.service_id, 'sys-postgres-wire');
    assert.equal(outcome.originalServiceDefinition.replica_count, 0);

    // Verify SQL mutations executed
    assert.equal(queries.length, 3);
    assert.match(queries[0], /SELECT service_id.*FROM service_definitions/);
    assert.match(queries[1], /UPDATE service_definitions SET runtime_config = '.*' WHERE service_id = 'sys-postgres-wire'/);
    assert.match(queries[2], /UPDATE service_definitions SET replica_count = 1 WHERE service_id = 'sys-postgres-wire'/);

    // Verify discovery attribution and readiness
    assert.equal(outcome.discoveredReplica.nodeId, 'node-prod-1');
    assert.equal(outcome.discoveredReplica.port, 15432);
    assert.equal(outcome.discoveredReplica.healthStatus, 'healthy');
    assert.equal(outcome.discoveredReplica.workloadReadinessStatus, 'READY');
    assert.equal(outcome.queryResult.ok, 1);

    assert.equal(wsClosed, true);
    assert.equal(pgClientClosed, true);
  });

  it('rejects replica endpoint placed on unowned or unexpected nodeId', async () => {
    class MockAdminWsClient {
      async connect() {}
      async query() {
        return {rows: [{service_id: 'sys-postgres-wire'}]};
      }
      async close() {}
    }

    const mockFetch = async () => ({
      status: 200,
      json: async () => ({
        services: [
          {
            serviceIds: ['sys-postgres-wire'],
            replicas: [
              {
                serviceId: 'sys-postgres-wire',
                nodeId: 'foreign-rogue-node',
                address: '127.0.0.1',
                port: 15432,
                healthStatus: 'healthy',
              },
            ],
          },
        ],
      }),
    });

    await assert.rejects(
      async () => runPgSmoke({
        enablePg: true,
        pgPort: 15432,
        seedAdminWsPort: 18081,
        seedRestPort: 18080,
        activeNodeIds: new Set(['node-1', 'node-2', 'node-3']),
        AdminWsClientClass: MockAdminWsClient,
        fetchFn: mockFetch,
        discoveryTimeoutMs: 500,
        discoveryIntervalMs: 50,
      }),
      /PostgreSQL wire endpoint placed on unexpected\/unowned nodeId: foreign-rogue-node/,
    );
  });

  it('records workloadReadinessStatus: NOT_READY if workloadReady is false, without claiming load readiness', async () => {
    class MockAdminWsClient {
      async connect() {}
      async query() {
        return {rows: [{service_id: 'sys-postgres-wire'}]};
      }
      async close() {}
    }

    const mockFetch = async () => ({
      status: 200,
      json: async () => ({
        services: [
          {
            serviceIds: ['sys-postgres-wire'],
            replicas: [
              {
                serviceId: 'sys-postgres-wire',
                nodeId: 'node-1',
                address: '127.0.0.1',
                port: 15432,
                healthStatus: 'healthy',
                readiness: {
                  serviceReady: true,
                  workloadReady: false,
                },
              },
            ],
          },
        ],
      }),
    });

    class MockPgClient {
      async connect() {}
      async query() {
        return {rows: [{ok: 1}]};
      }
      async end() {}
    }

    const outcome = await runPgSmoke({
      enablePg: true,
      pgPort: 15432,
      seedAdminWsPort: 18081,
      seedRestPort: 18080,
      activeNodeIds: ['node-1'],
      AdminWsClientClass: MockAdminWsClient,
      PgClientClass: MockPgClient,
      fetchFn: mockFetch,
    });

    assert.equal(outcome.ok, true);
    assert.equal(outcome.discoveredReplica.workloadReadinessStatus, 'NOT_READY');
  });
});
