import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  RAFT_PROVIDER_CONTROL,
} from '../../../../src/raft/raft-provider-control-constants.js';
import {run} from '../../scenarios/public-seam-durability.js';
import {
  classifyPublicOutcome,
  describePublicError,
  deriveCertificationStatus,
  discoverPublicEndpoints,
  findTopologyLeakKeys,
} from '../../scenarios/public-seam-durability-client.js';
import {
  PUBLIC_SEAM_BINDING,
  PUBLIC_SEAM_CERTIFICATION,
  PUBLIC_SEAM_INTERIM_RETRY_POLICY,
  PUBLIC_SEAM_NOT_RUN_REASON,
  PUBLIC_SEAM_OUTCOME_CLASS,
  PUBLIC_SEAM_SQL,
  PUBLIC_SEAM_STEP,
  PUBLIC_SEAM_STEP_OUTCOME,
  PUBLIC_SEAM_VERDICT,
  PUBLIC_SEAM_WRITE_OUTCOME,
} from '../../scenarios/public-seam-durability-constants.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFindIndex = Function.call.bind(Array.prototype.findIndex);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

// Deterministic mocked cluster: three harness node handles over one
// in-memory "replicated" store. The fake public client understands exactly
// the scenario's SQL constants, so the scenario's own statements drive it.

const NODE_IDS = ['seed-1', 'joiner-1', 'joiner-2'];
const SEED_ROLE = 'seed';
const JOINER_ROLE = 'joiner';
const PUBLIC_PORT = 5432;
const CALL_BINDING_NAME = 'account-summary--call--summarize-account-activity';
const LEGACY_PROVIDER_PACKAGE = '@markwylde/liferaft';
const PACKAGE_JSON_URL = new URL('../../../../package.json', import.meta.url);
const HEX = 'hex';
const INTERNAL_ERROR_CODE = 'XX000';
const REFUSED_CODE = 'ECONNREFUSED';
const FAST_CONFIG = Object.freeze({
  convergenceTimeoutMs: 10,
  pollIntervalMs: 0,
  publicClient: {endpointTimeoutMs: 5},
  readTimeoutMs: 5,
});

function refused(nodeId) {
  const error = new Error(`connect ${REFUSED_CODE} ${nodeId}`);
  error.code = REFUSED_CODE;
  return error;
}

function createWorld() {
  return {
    accountRows: [],
    down: new Set(),
    history: new Map(),
    objects: new Map(),
    provisioned: null,
  };
}

function applyOperation(world, op) {
  if (op.sql === PUBLIC_SEAM_SQL.INSERT_OBJECT) {
    const [id, body, version] = op.params;
    world.objects.set(id, {body: Buffer.from(body), id, version});
  } else if (op.sql === PUBLIC_SEAM_SQL.UPDATE_OBJECT) {
    const [body, version, id, previous] = op.params;
    const row = world.objects.get(id);
    if (row && row.version === previous) {
      world.objects.set(id, {body: Buffer.from(body), id, version});
    }
  } else if (op.sql === PUBLIC_SEAM_SQL.INSERT_HISTORY) {
    const [id, objectId, version] = op.params;
    if (world.history.has(id)) {
      throw new Error('UNIQUE constraint failed: object_history.id');
    }
    world.history.set(id, {id, object_id: objectId, version});
  }
}

function historyRows(world, objectId) {
  return arraySort(
    arrayFilter([...world.history.values()],
      (row) => row.object_id === objectId),
    (left, right) => left.version - right.version);
}

function summarize(world, accountId) {
  const rows = arrayFilter(world.accountRows, (row) => row[1] === accountId);
  const total = rows.reduce((sum, row) => sum + row[2], 0);
  return {
    accountId,
    contributingShards: 1,
    flagged: arrayFilter(rows, (row) => row[3] === 1).length,
    largestCents: Math.max(...arrayMap(rows, (row) => row[2])),
    meanCents: Math.round(total / rows.length),
    totalCents: total,
    transactions: rows.length,
  };
}

function createFakeClient(world, nodeId, hooks) {
  let transaction = null;
  function commit() {
    const staged = transaction;
    transaction = null;
    const failure = hooks.commitFailure?.({nodeId, staged, world});
    if (failure?.applyFirst) {
      staged.forEach((op) => applyOperation(world, op));
    }
    if (failure) {
      throw failure.error;
    }
    staged.forEach((op) => applyOperation(world, op));
    hooks.afterCommit?.({nodeId, world});
    return [];
  }
  function select(sql, params) {
    const view = hooks.viewFor?.(nodeId) || world;
    if (sql === PUBLIC_SEAM_SQL.SELECT_OBJECT) {
      const row = view.objects.get(params[0]);
      if (!row) {
        return [];
      }
      const shaped = {...row, body: Buffer.from(row.body)};
      return [hooks.decorateObjectRow ?
        hooks.decorateObjectRow(shaped, nodeId) : shaped];
    }
    if (sql === PUBLIC_SEAM_SQL.SELECT_HISTORY) {
      return arrayMap(historyRows(view, params[0]), (row) => ({...row}));
    }
    if (sql === PUBLIC_SEAM_SQL.COUNT_HISTORY) {
      return [{history_count: historyRows(view, params[0]).length}];
    }
    return null;
  }
  function stage(sql, params) {
    if (transaction) {
      transaction.push({params, sql});
    } else {
      applyOperation(world, {params, sql});
    }
    return [];
  }
  function callBinding(params) {
    const payload = JSON.parse(params[0]);
    const summary = summarize(world, payload.arguments.accountId);
    return [{
      result: JSON.stringify(hooks.callResult ? hooks.callResult(summary) :
        summary),
    }];
  }
  const handlers = new Map([
    [PUBLIC_SEAM_SQL.BEGIN, () => {
      transaction = [];
      return [];
    }],
    [PUBLIC_SEAM_SQL.ROLLBACK, () => {
      transaction = null;
      return [];
    }],
    [PUBLIC_SEAM_SQL.COMMIT, commit],
    [PUBLIC_SEAM_SQL.INSERT_OBJECT, stage],
    [PUBLIC_SEAM_SQL.UPDATE_OBJECT, stage],
    [PUBLIC_SEAM_SQL.INSERT_HISTORY, stage],
    [PUBLIC_SEAM_SQL.SELECT_OBJECT, select],
    [PUBLIC_SEAM_SQL.SELECT_HISTORY, select],
    [PUBLIC_SEAM_SQL.COUNT_HISTORY, select],
    [PUBLIC_SEAM_SQL.CREATE_OBJECTS, () => []],
    [PUBLIC_SEAM_SQL.CREATE_HISTORY, () => []],
    [PUBLIC_SEAM_BINDING.CREATE_TABLE, () => []],
    [PUBLIC_SEAM_SQL.PROBE_OBJECTS,
      () => [{object_count: world.objects.size}]],
    [PUBLIC_SEAM_SQL.PROBE_HISTORY,
      () => [{history_count: world.history.size}]],
    [PUBLIC_SEAM_BINDING.INSERT_ROW, (_sql, params) => {
      world.accountRows.push([...params]);
      return [];
    }],
    [PUBLIC_SEAM_BINDING.CALL_BINDING_SQL,
      (_sql, params) => callBinding(params)],
  ]);
  async function query(sql, params = []) {
    if (world.down.has(nodeId)) {
      throw refused(nodeId);
    }
    const handler = handlers.get(sql);
    if (!handler) {
      throw new Error(`fake client: unexpected SQL ${sql}`);
    }
    return handler(sql, params);
  }
  return {close: async () => {}, query: (sql, params) => query(sql, params)};
}

function createCluster({hooks = {}, scenarioConfig = {}, overrides = {}} = {}) {
  const world = createWorld();
  const calls = {
    convergence: 0, deployBinding: 0, discover: 0, start: [], stop: [],
  };
  const nodes = arrayMap(NODE_IDS, (id, index) => ({
    id,
    ip: `10.0.0.${index + 1}`,
    isReachable: async () => !world.down.has(id),
    role: index === 0 ? SEED_ROLE : JOINER_ROLE,
  }));
  for (const id of hooks.stillReachable || []) {
    nodes[arrayFindIndex(nodes, (node) => node.id === id)].isReachable =
      async () => true;
  }
  const cluster = {
    _config: {
      scenarios: {publicSeamDurability: {...FAST_CONFIG, ...scenarioConfig}},
    },
    _scenarioOverrides: {
      publicSeamDurability: {
        deployBinding: async () => {
          calls.deployBinding += 1;
          return {callBindingName: CALL_BINDING_NAME};
        },
        discoverEndpoints: async () => {
          calls.discover += 1;
          return new Map(arrayMap(
            arrayFilter(nodes, (node) => !world.down.has(node.id) &&
              !arrayIncludes(hooks.endpointless || [], node.id)),
            (node) => [node.id, hooks.portsFor ?
              hooks.portsFor(node.id, calls.discover) : [PUBLIC_PORT]]));
        },
        listTopologyIdentifiers: async (ctx) => ({
          sources: {partitionIds: 'read'},
          values: [...arrayMap(ctx.nodes, (node) => node.id),
            ...(hooks.partitionIds || [])],
        }),
        openPublicClient: async (node, port) => {
          if (port !== PUBLIC_PORT) {
            throw refused(`${node.id}:${port}`);
          }
          return createFakeClient(world, node.id, hooks);
        },
        provisionListener: async (_adminNode, replicaCount) => {
          world.provisioned = replicaCount;
        },
        runId: 'unit',
        sleep: async () => {},
        ...overrides,
      },
    },
    getNodes: () => nodes,
    startNode: async (id) => {
      calls.start.push(id);
      world.down.delete(id);
    },
    stopNode: async (id) => {
      calls.stop.push(id);
      world.down.add(id);
    },
    waitForConvergence: async () => {
      calls.convergence += 1;
      return {settledAfterMs: 1};
    },
  };
  return {calls, cluster, world};
}

function stepsByName(report) {
  return Object.fromEntries(
    arrayMap(report.steps, (step) => [step.name, step]));
}

async function runExpectingFailure(cluster) {
  let caught = null;
  try {
    await run(cluster);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'scenario must throw on a FAIL verdict');
  const report = caught.diagnostics?.partialResult;
  assert.ok(report, 'the FAIL report rides on diagnostics.partialResult');
  assert.equal(report.verdict, PUBLIC_SEAM_VERDICT.FAIL);
  return report;
}

function deferredError() {
  const error = new Error('commit outcome deferred');
  error.deferred = true;
  return error;
}

test('public-seam-durability passes through stop and restart of a joiner ' +
  'with binding disabled by default', async (t) => {
  const {calls, cluster, world} = createCluster();
  const report = await run(cluster);
  const steps = stepsByName(report);

  assert.equal(report.verdict, PUBLIC_SEAM_VERDICT.PASS);
  assert.equal(world.provisioned, NODE_IDS.length);
  assert.deepEqual(calls.stop, ['joiner-2']);
  assert.deepEqual(calls.start, ['joiner-2']);
  assert.equal(calls.convergence, 2);
  assert.equal(report.clusterShape.stoppedNodeId, 'joiner-2');
  assert.equal(report.clusterShape.outageWriterNodeId, 'joiner-1');
  for (const name of [PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE,
    PUBLIC_SEAM_STEP.BINDING_AFTER_RESTART]) {
    assert.equal(steps[name].outcome, PUBLIC_SEAM_STEP_OUTCOME.NOT_RUN);
    assert.equal(steps[name].reason,
      PUBLIC_SEAM_NOT_RUN_REASON.BINDING_DISABLED);
  }
  const others = arrayFilter(report.steps, (step) =>
    !stringStartsWith(step.name, 'binding_'));
  assert.ok(arrayEvery(others, (step) =>
    step.outcome === PUBLIC_SEAM_STEP_OUTCOME.PASS), JSON.stringify(others));
  assert.equal(steps[PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE].actual.outcome,
    PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED);
  assert.deepEqual(arrayMap(
    steps[PUBLIC_SEAM_STEP.FINAL_STATE_AGREEMENT].actual['seed-1'].history,
    (row) => row.version), [1, 2, 3]);
  assert.equal(report.certificationLine,
    `certification: ${PUBLIC_SEAM_CERTIFICATION.PREPARED_BLOCKED}`);
  t.end();
});

test('public-seam-durability records a stopped-quorum deferred write as a ' +
  'typed retry-safe outcome and converges after restart', async (t) => {
  const {cluster} = createCluster({hooks: {
    commitFailure: ({nodeId, world}) =>
      (world.down.size > 0 && nodeId === 'joiner-1') ?
        {error: deferredError()} : null,
  }});
  const report = await run(cluster);
  const steps = stepsByName(report);
  const outage = steps[PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE];

  assert.equal(report.verdict, PUBLIC_SEAM_VERDICT.PASS);
  assert.equal(outage.outcome, PUBLIC_SEAM_STEP_OUTCOME.PASS);
  assert.equal(outage.actual.outcome,
    PUBLIC_SEAM_WRITE_OUTCOME.UNAVAILABLE_TYPED);
  assert.equal(outage.actual.attempts,
    PUBLIC_SEAM_INTERIM_RETRY_POLICY.maxAttempts);
  assert.equal(report.typedOutcomes.length,
    PUBLIC_SEAM_INTERIM_RETRY_POLICY.maxAttempts);
  assert.ok(arrayEvery(report.typedOutcomes, (outcome) =>
    outcome.classification === PUBLIC_SEAM_OUTCOME_CLASS.RETRYABLE &&
    outcome.deferred === true));
  assert.deepEqual(arrayMap(
    steps[PUBLIC_SEAM_STEP.FINAL_STATE_AGREEMENT].actual['joiner-2'].history,
    (row) => row.version), [1, 2]);
  t.end();
});

test('public-seam-durability never re-applies a deferred commit that did ' +
  'commit (read back before retry)', async (t) => {
  let deferredOnce = false;
  const {cluster} = createCluster({hooks: {
    commitFailure: ({nodeId, world}) => {
      if (world.down.size > 0 && nodeId === 'joiner-1' && !deferredOnce) {
        deferredOnce = true;
        return {applyFirst: true, error: deferredError()};
      }
      return null;
    },
  }});
  const report = await run(cluster);
  const outage = stepsByName(report)[PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE];

  assert.equal(report.verdict, PUBLIC_SEAM_VERDICT.PASS);
  assert.equal(outage.actual.outcome,
    PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED_BY_PRIOR_ATTEMPT);
  assert.equal(stepsByName(report)[PUBLIC_SEAM_STEP.NO_DUPLICATE_EFFECTS]
    .outcome, PUBLIC_SEAM_STEP_OUTCOME.PASS);
  t.end();
});

test('public-seam-durability fails a terminal outage write, still restarts ' +
  'the joiner, and names the blocking step', async (t) => {
  const {calls, cluster} = createCluster({hooks: {
    commitFailure: ({nodeId, world}) => {
      if (world.down.size === 0 || nodeId !== 'joiner-1') {
        return null;
      }
      const error = new Error('statement failed');
      error.code = INTERNAL_ERROR_CODE;
      return {error};
    },
  }});
  const report = await runExpectingFailure(cluster);
  const steps = stepsByName(report);

  assert.equal(steps[PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.FAIL);
  assert.equal(steps[PUBLIC_SEAM_STEP.SURVIVOR_READ_DURING_OUTAGE].reason,
    `${PUBLIC_SEAM_NOT_RUN_REASON.BLOCKED_BY}` +
    PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE);
  assert.equal(steps[PUBLIC_SEAM_STEP.PARTICIPANT_RESTARTED].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.PASS);
  assert.deepEqual(calls.start, ['joiner-2']);
  assert.equal(steps[PUBLIC_SEAM_STEP.WRITE_AFTER_RESTART].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.NOT_RUN);
  assert.equal(report.typedOutcomes[0].classification,
    PUBLIC_SEAM_OUTCOME_CLASS.TERMINAL);
  t.end();
});

test('public-seam-durability fails when the restarted node cannot see an ' +
  'acknowledged outage write', async (t) => {
  let frozen = null;
  const {cluster, world} = createCluster({hooks: {
    viewFor: (nodeId) => (nodeId === 'joiner-2' ? frozen : null),
  }});
  const stopNode = cluster.stopNode;
  cluster.stopNode = async (id) => {
    frozen = {history: new Map(world.history), objects: new Map(world.objects)};
    await stopNode(id);
  };
  const report = await runExpectingFailure(cluster);
  const steps = stepsByName(report);

  assert.equal(steps[PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE].actual.outcome,
    PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED);
  assert.equal(steps[PUBLIC_SEAM_STEP.WRITE_AFTER_RESTART].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.FAIL);
  assert.equal(steps[PUBLIC_SEAM_STEP.WRITE_AFTER_RESTART].actual.version, 1);
  t.end();
});

test('public-seam-durability fails the no-duplicate check on a phantom ' +
  'history row visible on every node', async (t) => {
  const {cluster} = createCluster({hooks: {
    afterCommit: ({nodeId, world}) => {
      if (nodeId === 'joiner-2') {
        const objectId = [...world.objects.keys()][0];
        world.history.set('phantom-retry', {
          id: 'phantom-retry', object_id: objectId,
          version: world.objects.get(objectId).version,
        });
      }
    },
  }});
  const report = await runExpectingFailure(cluster);
  const steps = stepsByName(report);

  assert.equal(steps[PUBLIC_SEAM_STEP.FINAL_STATE_AGREEMENT].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.PASS);
  assert.equal(steps[PUBLIC_SEAM_STEP.NO_DUPLICATE_EFFECTS].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.FAIL);
  assert.deepEqual(report.failedSteps,
    [PUBLIC_SEAM_STEP.NO_DUPLICATE_EFFECTS]);
  assert.ok(arraySome(
    steps[PUBLIC_SEAM_STEP.NO_DUPLICATE_EFFECTS].actual.violations['seed-1'],
    (line) => stringStartsWith(line, 'COUNT(*)')));
  t.end();
});

test('public-seam-durability fails the leak check on a topology key in a ' +
  'public row', async (t) => {
  const {cluster} = createCluster({hooks: {
    decorateObjectRow: (row) => ({...row, servingNodeId: 'seed-1'}),
  }});
  const report = await runExpectingFailure(cluster);
  const leak = stepsByName(report)[PUBLIC_SEAM_STEP.TOPOLOGY_LEAK_CHECK];

  assert.deepEqual(report.failedSteps,
    [PUBLIC_SEAM_STEP.TOPOLOGY_LEAK_CHECK]);
  assert.ok(leak.actual.leakCount > 0);
  assert.ok(stringEndsWith(leak.actual.sample[0], '[0].servingNodeId'),
    leak.actual.sample[0]);
  t.end();
});

test('public-seam-durability reports a BLOB that does not round-trip with ' +
  'its observed shape, without failing durability steps', async (t) => {
  const {cluster} = createCluster({hooks: {
    decorateObjectRow: (row) => ({...row, body: row.body.toString(HEX)}),
  }});
  const report = await runExpectingFailure(cluster);
  const blob = stepsByName(report)[PUBLIC_SEAM_STEP.BLOB_ROUND_TRIP];

  assert.deepEqual(report.failedSteps, [PUBLIC_SEAM_STEP.BLOB_ROUND_TRIP]);
  assert.equal(blob.actual['joiner-1'].shape, 'string');
  t.end();
});

test('public-seam-durability fails public_client_ready when a node has no ' +
  'public endpoint', async (t) => {
  const {cluster} = createCluster({hooks: {endpointless: ['joiner-1']}});
  const report = await runExpectingFailure(cluster);
  const steps = stepsByName(report);

  assert.equal(steps[PUBLIC_SEAM_STEP.PUBLIC_CLIENT_READY].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.FAIL);
  assert.deepEqual(
    steps[PUBLIC_SEAM_STEP.PUBLIC_CLIENT_READY].actual.missing, ['joiner-1']);
  assert.equal(steps[PUBLIC_SEAM_STEP.OBJECT_WRITE_COMMITTED].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.NOT_RUN);
  t.end();
});

function withoutShardCount(summary) {
  const {contributingShards: _shards, ...rest} = summary;
  return rest;
}

test('public-seam-durability fails both binding steps on the ' +
  'contributingShards key the call result carries (call owner finding)',
async (t) => {
  const {cluster} = createCluster({
    scenarioConfig: {binding: {enabled: true, readyTimeoutMs: 5}},
  });
  const report = await runExpectingFailure(cluster);
  const steps = stepsByName(report);

  assert.deepEqual(report.failedSteps, [
    PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE,
    PUBLIC_SEAM_STEP.BINDING_AFTER_RESTART,
    PUBLIC_SEAM_STEP.TOPOLOGY_LEAK_CHECK,
  ]);
  assert.ok(arraySome(
    steps[PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE].actual.leakedKeys,
    (path) => stringEndsWith(path, '.contributingShards')));
  t.end();
});

test('public-seam-durability invokes the binding before the outage and ' +
  'after the restart when enabled', async (t) => {
  const {calls, cluster} = createCluster({
    hooks: {callResult: withoutShardCount},
    scenarioConfig: {binding: {enabled: true, readyTimeoutMs: 5}},
  });
  const report = await run(cluster);
  const steps = stepsByName(report);

  assert.equal(calls.deployBinding, 1);
  assert.equal(steps[PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.PASS);
  assert.equal(steps[PUBLIC_SEAM_STEP.BINDING_AFTER_RESTART].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.PASS);
  assert.equal(steps[PUBLIC_SEAM_STEP.BINDING_AFTER_RESTART].actual.nodeId,
    'joiner-2');
  const [firstAccount] = PUBLIC_SEAM_BINDING.ACCOUNT_IDS;
  assert.deepEqual(
    steps[PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE].actual.summaries[firstAccount],
    steps[PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE].expected
      .summaries[firstAccount]);
  t.end();
});

test('public-seam-durability fails the binding step when the result ' +
  'differs from the oracle', async (t) => {
  const {cluster} = createCluster({
    hooks: {
      callResult: (summary) => ({...withoutShardCount(summary), totalCents: 0}),
    },
    scenarioConfig: {binding: {enabled: true, readyTimeoutMs: 5}},
  });
  const report = await runExpectingFailure(cluster);

  assert.deepEqual(report.failedSteps, [
    PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE,
    PUBLIC_SEAM_STEP.BINDING_AFTER_RESTART,
  ]);
  t.end();
});

test('public-seam-durability connects inside the endpoint poll: a stale ' +
  'port then a fresh one passes within the budget', async (t) => {
  const stalePort = PUBLIC_PORT + 1;
  const {calls, cluster} = createCluster({
    hooks: {
      portsFor: (nodeId, discoverCall) =>
        (nodeId === 'joiner-1' && discoverCall === 1 ?
          [stalePort] : [PUBLIC_PORT]),
    },
    scenarioConfig: {publicClient: {endpointTimeoutMs: 1000}},
  });
  const report = await run(cluster);
  const ready = stepsByName(report)[PUBLIC_SEAM_STEP.PUBLIC_CLIENT_READY];

  assert.equal(report.verdict, PUBLIC_SEAM_VERDICT.PASS);
  assert.equal(ready.actual.connected['joiner-1'], PUBLIC_PORT);
  assert.ok(calls.discover >= 2);
  t.end();
});

test('public-seam-durability endpoint discovery keeps only healthy ' +
  'sys-postgres-wire rows and every healthy port', async (t) => {
  let seenParams = null;
  const adminNode = {query: async (_sql, params) => {
    seenParams = params;
    return {rows: [
      {health_status: 'unhealthy', node_id: 'n1', port: 5500},
      {health_status: 'healthy', node_id: 'n1', port: 5432},
      {health_status: 'healthy', node_id: 'n2', port: 5433},
      {health_status: 'healthy', node_id: 'n2', port: 5434},
      {health_status: 'unhealthy', node_id: 'n3', port: 5435},
    ]};
  }};
  const ports = await discoverPublicEndpoints(adminNode);

  assert.deepEqual([...ports.entries()],
    [['n1', [5432]], ['n2', [5433, 5434]]]);
  assert.deepEqual(seenParams, ['postgresql', 'sys-postgres-wire']);
  t.end();
});

test('public-seam-durability fails remote_read_agreement when a node never ' +
  'sees the committed object', async (t) => {
  const empty = {history: new Map(), objects: new Map()};
  const {cluster} = createCluster({hooks: {
    viewFor: (nodeId) => (nodeId === 'joiner-1' ? empty : null),
  }});
  const report = await runExpectingFailure(cluster);
  const steps = stepsByName(report);

  assert.equal(steps[PUBLIC_SEAM_STEP.REMOTE_READ_AGREEMENT].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.FAIL);
  assert.equal(steps[PUBLIC_SEAM_STEP.PARTICIPANT_STOPPED].reason,
    `${PUBLIC_SEAM_NOT_RUN_REASON.BLOCKED_BY}` +
    PUBLIC_SEAM_STEP.REMOTE_READ_AGREEMENT);
  t.end();
});

test('public-seam-durability fails survivor_read_during_outage when the ' +
  'surviving reader misses the acknowledged outage write', async (t) => {
  let frozen = null;
  const {cluster, world} = createCluster({hooks: {
    viewFor: (nodeId) =>
      (nodeId === 'seed-1' && world.down.size > 0 ? frozen : null),
  }});
  const stopNode = cluster.stopNode;
  cluster.stopNode = async (id) => {
    frozen = {history: new Map(world.history), objects: new Map(world.objects)};
    await stopNode(id);
  };
  const report = await runExpectingFailure(cluster);

  assert.deepEqual(report.failedSteps,
    [PUBLIC_SEAM_STEP.SURVIVOR_READ_DURING_OUTAGE]);
  t.end();
});

test('public-seam-durability fails final_state_agreement when one node ' +
  'stays behind after the restart', async (t) => {
  let frozen = null;
  const {cluster, world} = createCluster({hooks: {
    viewFor: (nodeId) => (nodeId === 'joiner-1' ? frozen : null),
  }});
  const startNode = cluster.startNode;
  cluster.startNode = async (id) => {
    frozen = {history: new Map(world.history), objects: new Map(world.objects)};
    await startNode(id);
  };
  const report = await runExpectingFailure(cluster);
  const steps = stepsByName(report);

  assert.deepEqual(report.failedSteps, [
    PUBLIC_SEAM_STEP.FINAL_STATE_AGREEMENT,
    PUBLIC_SEAM_STEP.NO_DUPLICATE_EFFECTS,
  ]);
  assert.equal(steps[PUBLIC_SEAM_STEP.FINAL_STATE_AGREEMENT].actual['joiner-1']
    .version, 2);
  t.end();
});

test('public-seam-durability fails the leak check when only the last ' +
  'node leaks a key', async (t) => {
  const {cluster} = createCluster({hooks: {
    decorateObjectRow: (row, nodeId) =>
      (nodeId === 'joiner-2' ? {...row, raft_role: 'follower'} : row),
  }});
  const report = await runExpectingFailure(cluster);
  const leak = stepsByName(report)[PUBLIC_SEAM_STEP.TOPOLOGY_LEAK_CHECK];

  assert.deepEqual(report.failedSteps,
    [PUBLIC_SEAM_STEP.TOPOLOGY_LEAK_CHECK]);
  assert.ok(arrayEvery(leak.actual.sample,
    (entry) => stringStartsWith(entry, 'joiner-2:')), leak.actual.sample);
  t.end();
});

test('public-seam-durability fails the leak check on a partition id in an ' +
  'error message value', async (t) => {
  const {cluster} = createCluster({hooks: {
    commitFailure: ({nodeId, world}) =>
      (world.down.size > 0 && nodeId === 'joiner-1') ?
        {error: Object.assign(
          new Error('partition p-objects-7 has no quorum'),
          {deferred: true})} : null,
    partitionIds: ['p-objects-7'],
  }});
  const report = await runExpectingFailure(cluster);
  const leak = stepsByName(report)[PUBLIC_SEAM_STEP.TOPOLOGY_LEAK_CHECK];

  assert.deepEqual(report.failedSteps,
    [PUBLIC_SEAM_STEP.TOPOLOGY_LEAK_CHECK]);
  assert.ok(arraySome(leak.actual.sample, (entry) =>
    stringEndsWith(entry, '.message=p-objects-7')), leak.actual.sample);
  t.end();
});

test('public-seam-durability fails participant_stopped when the stopped ' +
  'node still answers the reachability probe', async (t) => {
  const {cluster} = createCluster({hooks: {stillReachable: ['joiner-2']}});
  const report = await runExpectingFailure(cluster);
  const steps = stepsByName(report);

  assert.equal(steps[PUBLIC_SEAM_STEP.PARTICIPANT_STOPPED].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.FAIL);
  assert.equal(steps[PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE].outcome,
    PUBLIC_SEAM_STEP_OUTCOME.NOT_RUN);
  t.end();
});

test('public-seam-durability fails participant_stopped when the node ' +
  'handle cannot report reachability', async (t) => {
  const {cluster} = createCluster();
  delete cluster.getNodes()[2].isReachable;
  const report = await runExpectingFailure(cluster);

  assert.equal(stepsByName(report)[PUBLIC_SEAM_STEP.PARTICIPANT_STOPPED]
    .outcome, PUBLIC_SEAM_STEP_OUTCOME.FAIL);
  t.end();
});

test('public-seam-durability certification derives from the runtime ' +
  'provider owner', (t) => {
  assert.equal(
    deriveCertificationStatus(() => RAFT_PROVIDER_CONTROL.LIFERAFT).status,
    PUBLIC_SEAM_CERTIFICATION.PREPARED_BLOCKED);
  assert.equal(
    deriveCertificationStatus(() => RAFT_PROVIDER_CONTROL.RAFT_LOGIC).status,
    PUBLIC_SEAM_CERTIFICATION.CANDIDATE);
  // Differential oracle: this tree still declares the legacy provider
  // package, so the owner-derived default must say PREPARED.
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON_URL, 'utf8'));
  const legacyDeclared = Object.hasOwn(manifest.dependencies || {},
    LEGACY_PROVIDER_PACKAGE);
  assert.equal(deriveCertificationStatus().status, legacyDeclared ?
    PUBLIC_SEAM_CERTIFICATION.PREPARED_BLOCKED :
    PUBLIC_SEAM_CERTIFICATION.CANDIDATE);
  t.end();
});

test('public-seam-durability interim retry policy retries only ' +
  'retry-safe outcomes', (t) => {
  const policy = PUBLIC_SEAM_INTERIM_RETRY_POLICY;
  const classify = (error) =>
    classifyPublicOutcome(describePublicError(error, policy), policy);
  const hinted = new Error('provisioning');
  hinted.detail = JSON.stringify({retry_after_ms: 25});
  const plain = new Error('duplicate');
  plain.code = INTERNAL_ERROR_CODE;

  assert.equal(classify(deferredError()), PUBLIC_SEAM_OUTCOME_CLASS.RETRYABLE);
  assert.equal(classify(refused('n')), PUBLIC_SEAM_OUTCOME_CLASS.RETRYABLE);
  assert.equal(classify(hinted), PUBLIC_SEAM_OUTCOME_CLASS.RETRYABLE);
  assert.equal(classify(plain), PUBLIC_SEAM_OUTCOME_CLASS.TERMINAL);
  assert.deepEqual(findTopologyLeakKeys({rows: [{id: 1, body: Buffer.alloc(2)}]}),
    []);
  assert.deepEqual(findTopologyLeakKeys({detail: {leaderTerm: 3}}),
    ['$.detail.leaderTerm']);
  assert.deepEqual(findTopologyLeakKeys({
    participantResults: [], read_authority_witnesses: [], retryAfterMs: 1,
  }), ['$.participantResults', '$.read_authority_witnesses']);
  t.end();
});
