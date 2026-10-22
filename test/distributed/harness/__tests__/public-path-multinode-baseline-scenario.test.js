import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {run} from '../../scenarios/public-path-multinode-baseline.js';
import {
  DATASET_GENERATOR,
  assertPartitionSpread,
  expectedAccountSummary,
  generateDatasetRows,
} from '../../scenarios/public-path-baseline-helpers.js';
import {
  createInvocationIdentity,
} from '../../../../src/service/request-cell-routing-contract.js';
import {REQUEST_CELL_AUTH} from '../constants.js';
import {describeProviderMachine} from '../scenario-host-topology.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const RUN_ID = 'public-path-baseline-unit';
const INVOCATION_COUNT = 4;
const PARTITION_COUNT = 2;
const BUILD_DIGEST = `sha256:${'a'.repeat(64)}`;
const CHILD_CALL_SUFFIX = '#call-1';
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 503;
const SHORT_SPLIT_TIMEOUT_MS = 50;
const SQLITE_METRIC_TAG = 'metrics.partition.sqlite';
const PGWIRE_PORT = 5432;
const PACKAGE_ID = 'pkg-1';
const INSTALL_SQL = 'INSTALL SERVICE $1';
const CREATE_BINDING_SQL = 'CREATE BINDING $1';
const LOCAL_SELECT_SAMPLES_PER_NODE = 4;

const SPLIT_SPREAD_GATE = 'split-leader-host-spread';
const REPLAY_FIXTURE_DIR = 'test/fixtures/scenario-ground-truth/';
const REPLAY_BUDGET_MS = 180_000;

function childRow(partitionId, leaderNodeId, keyStart, keyEnd) {
  return {
    leader_node_id: leaderNodeId,
    partition_id: partitionId,
    partition_key_end: keyEnd,
    partition_key_start: keyStart,
    partition_version: 2,
    replica_count: 3,
    state: 'NORMAL',
    table_id: 'tbl-1',
  };
}

function voterRow(partitionId, nodeId) {
  return {
    node_id: nodeId,
    partition_id: partitionId,
    raft_role: 'follower',
    replica_id: `${partitionId}-${nodeId}`,
    service_type: 'partition',
    status: 'active',
  };
}

// A completed split: the parent is gone, each child holds three active
// voters on three hosts, and the child leaders sit on distinct hosts.
const SPREAD_PARTITION_ROWS = Object.freeze([
  childRow('p-1', 'node-1', null, '80.0'),
  childRow('p-2', 'node-2', '80.0', null),
]);
const SPREAD_SERVICE_ROWS = Object.freeze([
  voterRow('p-1', 'node-1'), voterRow('p-1', 'node-2'),
  voterRow('p-1', 'node-3'), voterRow('p-2', 'node-1'),
  voterRow('p-2', 'node-2'), voterRow('p-2', 'node-3'),
]);
const SINGLE_HOST_PARTITION_ROWS = Object.freeze([
  childRow('p-1', 'node-1', null, '80.0'),
  childRow('p-2', 'node-1', '80.0', null),
]);
const DISTINCT_NODE_HOSTS = Object.freeze({
  'node-1': 0, 'node-2': 1, 'node-3': 2,
});

function readReplayFixture(runNumber) {
  return JSON.parse(readFileSync(
    `${REPLAY_FIXTURE_DIR}run-${runNumber}-split-readbacks.json`, 'utf8'));
}

// The recorded readback current at the replay clock (snapshots carry the
// first timestamp of each distinct shape).
function replayReadbackAt(replay) {
  const due = arrayFilter(replay.fixture.snapshots,
    (snapshot) => snapshot.timestamp <= replay.clockMs);
  return due.length > 0 ? due[due.length - 1] : {partitions: [], services: []};
}

function partitionRowsFor(state) {
  return state.replay ?
    replayReadbackAt(state.replay).partitions :
    state.partitionRows;
}

function serviceRowsFor(state) {
  return state.replay ?
    replayReadbackAt(state.replay).services :
    state.serviceRows;
}

function childInvocationIds() {
  const ids = [];
  for (let index = 0; index < INVOCATION_COUNT; index += 1) {
    ids.push(createInvocationIdentity(
      REQUEST_CELL_AUTH.DATABASE, `${RUN_ID}-inv-${index}`,
    ) + CHILD_CALL_SUFFIX);
  }
  return ids;
}

function buildQueryHandler(state) {
  return async (sql, params) => {
    state.adminStatements.push(sql);
    if (stringStartsWith(sql, 'UPDATE service_definitions')) {
      state.provisioned = params;
      return {rows: []};
    }
    if (stringStartsWith(sql, 'SELECT node_id, port, health_status')) {
      return {rows: state.endpointRows};
    }
    if (stringStartsWith(sql, 'CREATE TABLE') ||
        stringStartsWith(sql, 'INSERT') ||
        stringStartsWith(sql, 'UPDATE tables')) {
      return {rows: []};
    }
    if (stringStartsWith(sql, 'SELECT table_id FROM tables')) {
      return {rows: [{table_id: 'tbl-1'}]};
    }
    if (stringStartsWith(sql, 'SELECT table_policies FROM tables')) {
      return {rows: [{
        table_policies: JSON.stringify({splitStorageThreshold: 16384}),
      }]};
    }
    if (stringStartsWith(sql, 'SELECT partition_id, leader_node_id')) {
      return {rows: [...partitionRowsFor(state)]};
    }
    if (stringStartsWith(sql, 'SELECT partition_id, node_id')) {
      return {rows: [...serviceRowsFor(state)]};
    }
    if (stringStartsWith(sql, 'SELECT binding_version_id')) {
      return {rows: [{
        binding_name: 'account-summary--call--summarize-account-activity',
        binding_version_id: 'bv-1',
      }]};
    }
    if (stringStartsWith(sql, 'SELECT service_id, runtime_kind')) {
      return {rows: [{
        binding_version_id: 'bv-1',
        runtime_kind: state.runtimeKind,
        service_id: 'svc-1',
      }]};
    }
    if (stringStartsWith(sql, 'SELECT invocation_id, slot_id')) {
      const rows = [];
      for (const childId of childInvocationIds()) {
        for (let slot = 0; slot < PARTITION_COUNT; slot += 1) {
          rows.push({
            invocation_id: childId,
            partial_json: '{"count:1":2,"total:1":100}',
            replica_id: `p-${slot + 1}-r1`,
            slot_id: slot,
          });
        }
      }
      return {rows};
    }
    if (stringStartsWith(sql, 'SELECT result_id')) {
      return {
        rows: arrayMap(childInvocationIds(), (childId) =>
          ({result_id: childId})),
      };
    }
    throw new Error(`unexpected stub query: ${sql}`);
  };
}

function buildFetchHandler(state) {
  const rows = generateDatasetRows();
  return async (url, options = {}) => {
    if (!options.headers?.authorization) {
      return {status: HTTP_UNAUTHORIZED, text: async () => 'denied'};
    }
    if (stringEndsWith(url, '/accounts/health')) {
      return {status: HTTP_OK, text: async () => '{"status":"ok"}'};
    }
    const {accountId} = JSON.parse(options.body);
    const summary =
      expectedAccountSummary(rows, accountId, PARTITION_COUNT);
    if (state.parityDrift) {
      summary.totalCents += 1;
    }
    return {status: HTTP_OK, text: async () => JSON.stringify(summary)};
  };
}

function buildLogEntries(nodeIds) {
  const entries = [];
  for (const nodeId of nodeIds) {
    for (let sample = 0; sample < LOCAL_SELECT_SAMPLES_PER_NODE;
      sample += 1) {
      entries.push({
        message: SQLITE_METRIC_TAG,
        metadata: {
          durationMs: 1,
          operation: 'SELECT',
          partitionId: `p-${(sample % PARTITION_COUNT) + 1}`,
          rowCount: DATASET_GENERATOR.rowCount / PARTITION_COUNT,
        },
        node_id: nodeId,
      });
    }
  }
  return entries;
}

// A PG-wire session double: records what reached it; `failures` holds a
// queue of errors to throw per statement before answering.
function buildPgClientDouble(state) {
  return async (node, port) => {
    state.pgSessions.push({nodeId: node.id, port});
    return {
      close: async () => {
        state.pgClosed += 1;
      },
      query: async (sql, params) => {
        state.pgStatements.push({params, sql});
        const queued = state.pgFailures[sql];
        if (queued && queued.length > 0) {
          throw queued.shift();
        }
        return {rows: sql === INSTALL_SQL ? [{package_id: PACKAGE_ID}] : []};
      },
    };
  };
}

// Replays what the pipeline owner's runDeploy sends through the injected
// lifecycle client: INSTALL, then one CREATE BINDING.
async function replayDeploy({createSqlClient}) {
  const client = createSqlClient();
  const installed = await client.execute(INSTALL_SQL, ['{"install":1}']);
  await client.execute(CREATE_BINDING_SQL, ['{"binding":1}']);
  return {packageId: installed.rows[0].package_id};
}

function buildStubCluster(state) {
  const queryHandler = buildQueryHandler(state);
  const nodes = arrayMap(state.nodeIds, (id, index) => ({
    containerId: `container-${id}`,
    // A replay carries its run's declared machine topology; a synthetic
    // state names one machine per provider index.
    hostIdentity: state.nodeMachines?.[id] ?? {
      hostId: `host:machine-${state.nodeHosts[id]}`,
      label: `10.0.0.${state.nodeHosts[id] + 1}`,
      providerIndex: state.nodeHosts[id],
    },
    id,
    ip: `10.0.0.${index + 1}`,
    query: queryHandler,
    role: index === 0 ? 'seed' : 'member',
  }));
  const clock = {
    now: () => (state.replay ? state.replay.clockMs : state.clockMs),
    sleep: async (ms) => {
      if (state.replay) {
        state.replay.clockMs += ms;
      } else {
        state.clockMs += ms;
      }
    },
  };
  let snapshotCall = 0;
  return {
    _scenarioOverrides: {
      publicPathBaseline: {
        fetchImpl: buildFetchHandler(state),
        invocationCount: INVOCATION_COUNT,
        listenerTimeoutMs: SHORT_SPLIT_TIMEOUT_MS,
        logBuffer: () => buildLogEntries(state.localReadNodeIds),
        openPublicClient: buildPgClientDouble(state),
        pipeline: {
          runBuild: async () => ({
            descriptor: {digest: BUILD_DIGEST},
            layoutPath:
              '/tmp/artifacts/public-path-baseline/.lagrange/layout',
          }),
          runDeploy: replayDeploy,
          runGenerate: async () => ({}),
        },
        prepareProject: async () => ({
          artifactsRoot: '/tmp/artifacts',
          projectDirectory: '/tmp/artifacts/public-path-baseline',
        }),
        readManifest: async () => ({
          artifact: {
            digest: BUILD_DIGEST,
            media_type: 'application/wasm',
          },
          runtime: {kind: 'wasm_component'},
        }),
        resourceSnapshot: async () => {
          snapshotCall += 1;
          return {
            cpuPercent: 10 + snapshotCall,
            memoryUsageBytes: 1_000_000 + snapshotCall,
            rxBytes: 100 * snapshotCall,
            txBytes: 200 * snapshotCall,
          };
        },
        now: clock.now,
        runId: RUN_ID,
        sleep: clock.sleep,
        splitWaitTimeoutMs: state.splitWaitTimeoutMs,
      },
    },
    getNodes: () => nodes,
    recordScenarioEvent: (type, entityId, details) => {
      state.events.push({details, entityId, type});
      return true;
    },
  };
}

function greenState() {
  return {
    adminStatements: [],
    clockMs: 1_000_000,
    events: [],
    nodeHosts: {...DISTINCT_NODE_HOSTS},
    nodeIds: ['node-1', 'node-2', 'node-3'],
    endpointRows: [
      {health_status: 'healthy', node_id: 'node-2', port: PGWIRE_PORT},
      {health_status: 'healthy', node_id: 'node-1', port: PGWIRE_PORT},
    ],
    localReadNodeIds: ['node-1', 'node-2'],
    pgClosed: 0,
    pgFailures: {},
    pgSessions: [],
    pgStatements: [],
    parityDrift: false,
    partitionRows: SPREAD_PARTITION_ROWS,
    runtimeKind: 'wasm_component',
    serviceRows: SPREAD_SERVICE_ROWS,
  };
}

// The run's declared machine topology as the config the host authority
// reads: one Docker provider per declared machine, in provider order.
function replayMachineConfig(fixture) {
  const hostInfo = fixture.machineTopology.hostInfo;
  return {docker: {
    hostInfo: arrayMap(hostInfo, (machine) => ({
      internalIp: machine.internalIp, machineId: machine.machineId})),
    hosts: arrayMap(hostInfo, (machine) => `tcp://${machine.internalIp}:2375`),
  }};
}

// Replays a real run's recorded readbacks through the scenario gate on a
// virtual clock, with the run's own node -> provider placement and its
// declared provider -> machine topology, resolved by the production host
// authority (describeProviderMachine), never keyed by provider index.
function replayState(runNumber) {
  const fixture = readReplayFixture(runNumber);
  const config = replayMachineConfig(fixture);
  const state = greenState();
  state.nodeIds = arrayMap(fixture.nodeHosts, (entry) => entry.nodeId);
  state.nodeHosts = {};
  state.nodeMachines = {};
  for (const entry of fixture.nodeHosts) {
    state.nodeHosts[entry.nodeId] = entry.providerIndex;
    const machine = describeProviderMachine(config, entry.providerIndex);
    // The per-node label and the provider table must agree.
    assert.equal(machine.hostId, `host:${entry.machineId}`, entry.nodeId);
    assert.equal(machine.source, 'declared_machine_id');
    state.nodeMachines[entry.nodeId] = machine;
  }
  state.replay = {clockMs: fixture.snapshots[0].timestamp, fixture};
  state.splitWaitTimeoutMs = REPLAY_BUDGET_MS;
  return state;
}

function gateRecords(state) {
  return arrayFilter(state.events, (event) =>
    event.type === 'scenario.gate' && event.entityId === SPLIT_SPREAD_GATE);
}

describe('public-path-multinode-baseline scenario', () => {
  it('composes the schemaVersion-2 detail on a green run, every spread ' +
    'count with its unit', async () => {
    const detail = await run(buildStubCluster(greenState()));

    assert.equal(detail.schemaVersion, 2);
    assert.match(detail.datasetDigest, /^[0-9a-f]{64}$/u);
    assert.match(detail.generatorDigest, /^[0-9a-f]{64}$/u);
    assert.equal(detail.topology.nodeCount, 3);
    assert.equal(detail.topology.distinctPartitionHosts, 2);
    assert.equal(detail.topology.spreadUnit, 'host');
    assert.deepEqual(
      arrayMap(detail.topology.partitions, (entry) => entry.partitionId),
      ['p-1', 'p-2'],
    );
    assert.equal(detail.fidelity.runtimeKind, 'wasm_component');
    assert.equal(detail.fidelity.buildDigest, BUILD_DIGEST);
    assert.equal(detail.parity.invocations, INVOCATION_COUNT);
    assert.equal(detail.parity.mismatches, 0);
    assert.equal(detail.parity.oracle, 'independent-recompute');
    assert.equal(detail.localReadProof.distinctNodes, 2);
    assert.equal(detail.localReadProof.spreadUnit, 'node');
    assert.equal(detail.latencyMs.count, INVOCATION_COUNT);
    assert.ok(detail.bytes.finalBytes > 0);
    assert.ok(detail.bytes.partialBytes > 0);
    assert.equal(detail.retries.activationLeasesPublished, null);
    assert.equal(detail.retries.readyCellHits, null);
    assert.ok(detail.unavailableReasons.retries.length > 0);
    assert.equal(detail.resources.perNode.length, 3);
  });

  it('deploys service-lifecycle SQL over an authenticated PG-wire ' +
    'session to the seed, never the admin lane', async () => {
    const state = greenState();
    await run(buildStubCluster(state));

    // The listener is requested before any data-phase statement.
    assert.ok(stringStartsWith(state.adminStatements[0],
      'UPDATE service_definitions'));
    const runtimeConfig = JSON.parse(state.provisioned[1]);
    assert.equal(state.provisioned[0], 3);
    assert.equal(runtimeConfig.authMode, 'password');
    assert.equal(runtimeConfig.host, '0.0.0.0');
    assert.deepEqual(state.pgSessions, [{nodeId: 'node-1', port: PGWIRE_PORT}]);
    assert.deepEqual(arrayMap(state.pgStatements, (entry) => entry.sql),
      [INSTALL_SQL, CREATE_BINDING_SQL]);
    assert.equal(state.pgClosed, 1);
    for (const sql of state.adminStatements) {
      assert.ok(!stringStartsWith(sql, 'INSTALL') &&
        !stringStartsWith(sql, 'CREATE BINDING'), sql);
    }
  });

  it('fails when no PG-wire listener becomes reachable', async () => {
    const state = greenState();
    state.endpointRows = [
      {health_status: 'starting', node_id: 'node-1', port: PGWIRE_PORT},
    ];

    await assert.rejects(
      run(buildStubCluster(state)),
      /no reachable authenticated PostgreSQL-wire listener/u,
    );
    assert.equal(state.pgStatements.length, 0);
  });

  it('retries only the idempotent INSTALL on a retry-safe outcome',
    async () => {
      const state = greenState();
      const deferred = new Error('install deferred');
      deferred.deferred = true;
      state.pgFailures[INSTALL_SQL] = [deferred];
      await run(buildStubCluster(state));
      assert.deepEqual(arrayMap(state.pgStatements, (entry) => entry.sql),
        [INSTALL_SQL, INSTALL_SQL, CREATE_BINDING_SQL]);

      const refused = greenState();
      const bindingDeferred = new Error('binding deferred');
      bindingDeferred.deferred = true;
      refused.pgFailures[CREATE_BINDING_SQL] = [bindingDeferred];
      await assert.rejects(run(buildStubCluster(refused)),
        /binding deferred/u);
      assert.equal(refused.pgClosed, 1);
    });

  it('replays INSTALL on the catalog owner\'s transient idempotency-lookup ' +
    'failure, never on a terminal one', async () => {
    const state = greenState();
    state.pgFailures[INSTALL_SQL] = [
      new Error('authoritative operation lookup failed'),
      new Error('authoritative operation lookup failed'),
    ];
    await run(buildStubCluster(state));
    assert.deepEqual(arrayMap(state.pgStatements, (entry) => entry.sql),
      [INSTALL_SQL, INSTALL_SQL, INSTALL_SQL, CREATE_BINDING_SQL]);

    const terminal = greenState();
    terminal.pgFailures[INSTALL_SQL] = [
      new Error('installation intent cannot be changed by replay'),
    ];
    await assert.rejects(run(buildStubCluster(terminal)),
      /cannot be changed by replay/u);
    assert.equal(terminal.pgStatements.length, 1);
  });

  it('fails when the runtime kind is native_js', async () => {
    const state = greenState();
    state.runtimeKind = 'native_js';

    await assert.rejects(
      run(buildStubCluster(state)),
      /native_js/u,
    );
  });

  it('fails when all partition leaders share one host', async () => {
    const state = greenState();
    state.partitionRows = SINGLE_HOST_PARTITION_ROWS;
    state.splitWaitTimeoutMs = SHORT_SPLIT_TIMEOUT_MS;

    await assert.rejects(
      run(buildStubCluster(state)),
      /leader_hosts_insufficient\(unit="host" observed=1 required=2/u,
    );
  });

  it('fails when a response diverges from the oracle', async () => {
    const state = greenState();
    state.parityDrift = true;

    await assert.rejects(
      run(buildStubCluster(state)),
      /parity violated/u,
    );
  });

  it('fails when local-read log evidence is missing', async () => {
    const state = greenState();
    state.localReadNodeIds = ['node-1'];

    await assert.rejects(
      run(buildStubCluster(state)),
      /local-read proof violated/u,
    );
  });

  it('W1 run 1 replay: fails naming children at 2/3 active voters and ' +
    'the undissolved parent', async () => {
    const state = replayState(1);
    await assert.rejects(run(buildStubCluster(state)), (error) => {
      assert.match(error.message, /split-leader-host-spread not met/u);
      assert.match(error.message, /child_active_voter_count_mismatch\(partitionId="tbl-[0-9a-f]+_p_[0-9a-f]+_left" observed=2 required=3\)/u);
      assert.match(error.message, /child_active_voter_count_mismatch\(partitionId="tbl-[0-9a-f]+_p_[0-9a-f]+_right" observed=2 required=3\)/u);
      assert.match(error.message, /parent_not_dissolved\(partitionId="tbl-[0-9a-f]+-p1"/u);
      assert.match(error.message, /not committed raft membership/u);
      return true;
    });
    const records = gateRecords(state);
    assert.equal(records.length, 1);
    assert.equal(records[0].details.passed, false);
  });

  it('W1 run 2 replay: fails naming both children led from one host',
    async () => {
      const state = replayState(2);
      await assert.rejects(run(buildStubCluster(state)), (error) => {
        assert.match(error.message,
          /leader_hosts_insufficient\(unit="host" observed=1 required=2 leaderHosts=\["host:lab-tv-dator"\]\)/u);
        assert.match(error.message, /parent_not_dissolved/u);
        return true;
      });
      const record = gateRecords(state)[0].details;
      const children = arrayFilter(record.partitions,
        (entry) => entry.role === 'child');
      assert.equal(children.length, 2);
      assert.equal(children[0].leader.nodeId, children[1].leader.nodeId);
      assert.ok(stringStartsWith(children[0].leader.nodeId, 'a381d398'));
      for (const child of children) {
        assert.equal(child.activeVoterCount, 3);
        // Node index 0 and node index 4 share tv-dator.
        assert.equal(child.leader.host, 'host:lab-tv-dator');
      }
    });

  it('W1 run 3 replay: no pass in the window before the parent was ' +
    'removed; fails on children 2/3 and one leader host', async () => {
    const state = replayState(3);
    await assert.rejects(run(buildStubCluster(state)), (error) => {
      assert.match(error.message, /last readback unmet: .*child_active_voter_count_mismatch\([^)]*observed=2 required=3\)/u);
      assert.match(error.message, /leader_hosts_insufficient\(unit="host" observed=1 required=2/u);
      // The window the old gate passed in: the parent still counted.
      assert.match(error.message, /unmet across readbacks: .*parent_not_dissolved x\d+/u);
      return true;
    });
    const record = gateRecords(state)[0].details;
    assert.equal(record.passed, false);
    assert.deepEqual(
      arrayFilter(record.partitions, (entry) => entry.role === 'parent'),
      []);
    assert.equal(record.parentIdsObserved.length, 1);
  });

  it('W2/W6 a truthful pass emits the gate record and the step log',
    async () => {
      const state = greenState();
      await run(buildStubCluster(state));
      const record = gateRecords(state)[0].details;
      assert.equal(record.passed, true);
      assert.equal(record.stableReadbacks, record.stableReadbacksRequired);
      assert.equal(record.hostAuthority, 'declared_provider_machine_topology');
      assert.equal(record.spreadUnit, 'host');
      assert.equal(record.membershipEvidence.source, 'services_rows');
      assert.equal(record.membershipEvidence.committedMembershipObserved,
        false);
      assert.deepEqual(record.leaderHosts, ['host:machine-0', 'host:machine-1']);
      assert.deepEqual(record.claim, {
        minChildren: 2,
        minDistinctLeaders: 2,
        minReplicaSpreadPerChild: 2,
        requireChildLeader: true,
        requireParentDissolved: true,
        requirePolicyReplicaCount: true,
        spreadUnit: 'host',
      });
      assert.equal(record.budgetMs, REPLAY_BUDGET_MS);
      assert.ok(Number.isFinite(record.elapsedMs));
      for (const partition of record.partitions) {
        assert.equal(partition.role, 'child');
        assert.equal(partition.activeVoterCount, 3);
        assert.equal(partition.replicas.length, 3);
        for (const replica of partition.replicas) {
          assert.ok(replica.host);
          assert.equal(replica.status, 'active');
          assert.equal(replica.raftRole, 'follower');
        }
      }
      const steps = arrayMap(arrayFilter(state.events,
        (event) => event.type === 'scenario.step'),
      (event) => `${event.details.step}:${event.details.status}`);
      assert.ok(arrayIncludes(steps, `${SPLIT_SPREAD_GATE}:started`));
      assert.ok(arrayIncludes(steps, `${SPLIT_SPREAD_GATE}:completed`));
      assert.equal(steps[0], 'provision-lifecycle-listener:started');
    });

  it('W3 two nodes on one host are one host for the leader spread',
    async () => {
      const state = greenState();
      state.nodeHosts = {'node-1': 0, 'node-2': 0, 'node-3': 1};
      await assert.rejects(run(buildStubCluster(state)),
        /leader_hosts_insufficient\(unit="host" observed=1 required=2 leaderHosts=\["host:machine-0"\]\)/u);
    });

  it('W6 a failing gate records the failed step for triage', async () => {
    const state = greenState();
    state.partitionRows = SINGLE_HOST_PARTITION_ROWS;
    state.splitWaitTimeoutMs = SHORT_SPLIT_TIMEOUT_MS;
    await assert.rejects(run(buildStubCluster(state)), (error) => {
      assert.deepEqual(error.scenarioStep, {
        scenarioName: 'public-path-multinode-baseline',
        step: SPLIT_SPREAD_GATE,
      });
      return true;
    });
    const failed = arrayFilter(state.events, (event) =>
      event.type === 'scenario.step' && event.details.status === 'failed');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].details.step, SPLIT_SPREAD_GATE);
    assert.equal(gateRecords(state)[0].details.passed, false);
  });

  it('W8 the report spread re-assertion counts leader HOSTS, never node ids',
    () => {
      const hostOf = (nodeId) => ({'node-1': 'host:machine-0',
        'node-2': 'host:machine-0', 'node-3': 'host:machine-1'})[nodeId] || null;
      const twoNodesOneHost = [
        {leader_node_id: 'node-1', partition_id: 'p-1'},
        {leader_node_id: 'node-2', partition_id: 'p-2'},
      ];
      assert.throws(() => assertPartitionSpread(twoNodesOneHost, hostOf),
        /all partition leaders on 1 host\(s\)/u);
      assert.throws(() => assertPartitionSpread(twoNodesOneHost),
        /no node -> host authority/u);
      assert.throws(() => assertPartitionSpread([
        {leader_node_id: 'node-1', partition_id: 'p-1'},
        {leader_node_id: 'node-9', partition_id: 'p-2'},
      ], hostOf), /no host identity for leader node\(s\) node-9/u);
      assert.equal(assertPartitionSpread([
        {leader_node_id: 'node-1', partition_id: 'p-1'},
        {leader_node_id: 'node-3', partition_id: 'p-2'},
      ], hostOf).distinctPartitionHosts, 2);
    });
});
