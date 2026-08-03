/**
 * Deterministic end-to-end guard for the call-cell invocation owner: one
 * authenticated CALL flows resolve → fan-out batches → seeded coordination
 * rows → per-shard run → emitted partials published under the shard's
 * acquired lease slot → complete-set gate → reduce → exactly one atomic
 * final snapshot, with each collaborator stubbed at its real API seam.
 * Refusal vectors (not-invocable, empty batch set, incoherent emitted
 * partials, incomplete partial set) fail closed.
 */

import {test} from '../../src/test-helpers/tap.js';
import {CallCellInvoker} from
  '../../src/service/call-cell-invoker.js';
import {
  CALL_CELL_INVOCATION_ID_PREFIX,
  CALL_CELL_PARTIAL_KEY_PREFIX,
  CALL_CELL_ROUTE_ERROR_CODE,
  CallCellRoutingError,
  createCallInvocationIdentity,
  createCallReduceInvocationId,
  createCallRoutingFailure,
  createCallSlotInvocationId,
} from '../../src/service/call-cell-routing-contract.js';

const SECURITY_CONTEXT = Object.freeze({
  tenantId: 'tenant-1',
  principal: 'app-1',
  roles: Object.freeze(['application']),
});
const CALL_NAME = 'ratings-top';
const DECLARED_STATEMENT = 'SELECT user_id, score FROM ratings';
const ARGUMENTS = '{"topN":2}';
const RESULT_JSON = '[{"key":"u2","score":9}]';
const BATCH_ROW_BOUND = 100;
const PARTIAL_LIMIT = 64;
const EMIT_BUDGET = 8;
const NESTED_CALL_BUDGET = 1;

function typedRow(id, score) {
  return Object.freeze({
    columns: Object.freeze([
      Object.freeze({
        name: 'user_id',
        val: Object.freeze({tag: 'text', val: id}),
      }),
      Object.freeze({
        name: 'score',
        val: Object.freeze({tag: 'real', val: score}),
      }),
    ]),
  });
}

function makeRoute() {
  return Object.freeze({
    bindingVersionId: 'bv-1',
    name: CALL_NAME,
    statement: DECLARED_STATEMENT,
    replicaId: 'replica-1',
    serviceId: 'svc-1',
    tenantId: SECURITY_CONTEXT.tenantId,
  });
}

function emittedPartial(id, score) {
  return {
    key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${id}`,
    partial: JSON.stringify(score),
  };
}

function makeCollaborators(overrides = {}) {
  const calls = {
    run: 0,
    reduce: 0,
    reduceRequests: [],
    runRequests: [],
    seeded: [],
    leases: [],
    published: [],
    snapshot: null,
  };
  const routeResolver = {
    resolve: overrides.resolve ?? (() => makeRoute()),
  };
  const batchExecutor = {
    executeBatches: overrides.executeBatches ?? (async () => [
      {partitionId: 'p1', batch: [typedRow('u1', 7)]},
      {partitionId: 'p2', batch: [typedRow('u2', 9)]},
    ]),
    planShards: overrides.planShards ?? (() => ({
      shards: [{partitionId: 'p1'}, {partitionId: 'p2'}],
      tableName: 'ratings',
    })),
  };
  const partitionTopology = overrides.partitionTopology ?? {
    resolveShardHost: (tableName, partitionId) => Object.freeze({
      activePartitionVersion: 1,
      hostNodeId: `node-${partitionId}`,
      partitionId,
      partitionReplicaId: `${partitionId}-r1`,
      partitionState: 'NORMAL',
      partitionVersion: 1,
    }),
  };
  const statementAdapter = {
    invoke: overrides.adapterInvoke ?? (async (req) => {
      if (req.exportName === 'reduce') {
        calls.reduce += 1;
        calls.reduceRequests.push(req);
        return {componentResult: RESULT_JSON, replicaId: 'replica-1'};
      }
      calls.run += 1;
      calls.runRequests.push(req);
      const id = req.partitionId === 'p1' ? 'u1' : 'u2';
      const score = req.partitionId === 'p1' ? 7 : 9;
      return {
        componentResult: JSON.stringify({kept: [id]}),
        replicaId: 'replica-1',
        partials: [emittedPartial(id, score)],
      };
    }),
  };
  const reduceCoordinator = {
    seedInvocation: async (invocationId, slotIds) => {
      calls.seeded.push({invocationId, slotIds});
      return {slotIds};
    },
    acquireReduceLease: async (invocationId, replicaId, slotId) => {
      calls.leases.push({invocationId, replicaId, slotId});
      return {slot_id: slotId};
    },
    publishPartial: async (invocationId, slotId, replicaId, partial) => {
      calls.published.push({invocationId, slotId, replicaId, partial});
    },
    resolveCompletePartialSet:
      overrides.resolveCompletePartialSet ??
      (async () => ({
        partials: [
          ['u2', 9],
          ['u1', 7],
        ],
        witness: {schemaVersion: 1, slots: []},
      })),
    publishFinalSnapshot: async (invocationId, resultJson, witness) => {
      calls.snapshot = {invocationId, resultJson, witness};
    },
  };
  return {calls, routeResolver, batchExecutor, partitionTopology,
    statementAdapter, reduceCoordinator};
}

function makeInvoker(collaborators) {
  return new CallCellInvoker({
    routeResolver: collaborators.routeResolver,
    batchExecutor: collaborators.batchExecutor,
    partitionTopology: collaborators.partitionTopology,
    statementAdapter: collaborators.statementAdapter,
    reduceCoordinator: collaborators.reduceCoordinator,
    batchRowBound: BATCH_ROW_BOUND,
    emitBudget: EMIT_BUDGET,
    nestedCallBudget: NESTED_CALL_BUDGET,
    partialLimit: PARTIAL_LIMIT,
  });
}

test('one CALL flows end to end to exactly one visible snapshot',
  async (t) => {
    const collaborators = makeCollaborators();
    const result = await makeInvoker(collaborators).invoke({
      name: CALL_NAME,
      argumentsJson: ARGUMENTS,
      securityContext: SECURITY_CONTEXT,
    });
    t.equal(result, RESULT_JSON);
    t.equal(collaborators.calls.run, 2,
      'run export invoked once per shard');
    t.equal(collaborators.calls.reduce, 1,
      'reduce export invoked exactly once over the complete set');
    t.equal(collaborators.calls.seeded.length, 1,
      'the invocation coordination rows are seeded exactly once');
    t.same(collaborators.calls.seeded[0].slotIds, [1, 2, 3],
      'one seeded slot per shard batch plus the dedicated reduce lease slot');
    t.same(
      collaborators.calls.leases.map((entry) => entry.slotId),
      [1, 2, 3],
      'each shard slot lease is acquired before its publish, then the ' +
        'reduce lease before the reduce dispatch',
    );
    t.equal(collaborators.calls.published.length, 2,
      'each shard partial published under the lease');
    t.same(
      collaborators.calls.published.map((entry) => entry.slotId),
      [1, 2],
      'partials published under per-shard slots',
    );
    t.same(
      collaborators.calls.published.map((entry) =>
        JSON.parse(entry.partial)),
      [
        [{aggValue: 7, groupKey: 'u1'}],
        [{aggValue: 9, groupKey: 'u2'}],
      ],
      'the published slot partial is the shard EMITTED partial set in the ' +
        'coordination gate shape, not the run return value',
    );
    t.equal(collaborators.calls.snapshot.resultJson, RESULT_JSON,
      'the final reduced result is published as the single visible snapshot');
    t.ok(collaborators.calls.snapshot.witness,
      'the snapshot carries its partial-set witness');
  });

test('the invocation identity is a fresh routing-contract UUID identity',
  async (t) => {
    const first = makeCollaborators();
    await makeInvoker(first).invoke({
      name: CALL_NAME,
      argumentsJson: ARGUMENTS,
      securityContext: SECURITY_CONTEXT,
    });
    const second = makeCollaborators();
    await makeInvoker(second).invoke({
      name: CALL_NAME,
      argumentsJson: ARGUMENTS,
      securityContext: SECURITY_CONTEXT,
    });
    const firstId = first.calls.seeded[0].invocationId;
    const secondId = second.calls.seeded[0].invocationId;
    t.ok(firstId.startsWith(CALL_CELL_INVOCATION_ID_PREFIX),
      'the invocation id carries the routing-contract identity prefix');
    t.ok(firstId !== secondId,
      'two invocations never share coordination rows');
    t.same(
      new Set([
        ...first.calls.published.map((entry) => entry.invocationId),
        first.calls.snapshot.invocationId,
      ]),
      new Set([firstId]),
      'every coordination write shares the one invocation identity',
    );
    t.same(
      first.calls.runRequests.map((request) => request.invocationId),
      [
        createCallSlotInvocationId(firstId, 1),
        createCallSlotInvocationId(firstId, 2),
      ],
      'each shard run dispatches under its slot-scoped wire identity so ' +
        'the durable fence never replays one shard into another',
    );
    t.same(
      first.calls.reduceRequests.map((request) => request.invocationId),
      [createCallReduceInvocationId(firstId)],
      'the reduce dispatch carries its own wire identity',
    );
  });

test('a supplied system-owned invocation id is the verbatim base for ' +
  'every wire identity', async (t) => {
  const collaborators = makeCollaborators();
  await makeInvoker(collaborators).invoke({
    name: CALL_NAME,
    argumentsJson: ARGUMENTS,
    securityContext: SECURITY_CONTEXT,
    invocationId: 'outer-request-1#call-1',
  });
  t.equal(collaborators.calls.seeded[0].invocationId,
    'outer-request-1#call-1',
    'the supplied base keys the coordination rows verbatim');
  t.same(
    collaborators.calls.runRequests.map((request) => request.invocationId),
    ['outer-request-1#call-1#slot-1', 'outer-request-1#call-1#slot-2'],
    'shard wire identities extend the supplied base');
  t.same(
    collaborators.calls.reduceRequests.map(
      (request) => request.invocationId),
    ['outer-request-1#call-1#reduce'],
    'the reduce wire identity extends the supplied base');
});

test('a supplied invocation id carrying the wire grammar is refused ' +
  'typed before anything runs', async (t) => {
  const collaborators = makeCollaborators();
  await makeInvoker(collaborators).invoke({
    name: CALL_NAME,
    argumentsJson: ARGUMENTS,
    securityContext: SECURITY_CONTEXT,
    invocationId: 'x#slot-3',
  }).then(
    () => t.fail('expected the reserved-grammar refusal'),
    (error) => t.equal(
      error.code, CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS),
  );
  t.equal(collaborators.calls.seeded.length, 0,
    'no coordination rows seeded under a mis-splitting identity');
  t.equal(collaborators.calls.run, 0, 'no shard invoked');
});

test('reduce is refused when the executing replica does not hold the ' +
  'reduce lease', async (t) => {
  const collaborators = makeCollaborators({
    adapterInvoke: async (req) => {
      if (req.exportName === 'reduce') {
        return {componentResult: RESULT_JSON, replicaId: 'replica-rogue'};
      }
      const id = req.partitionId === 'p1' ? 'u1' : 'u2';
      const score = req.partitionId === 'p1' ? 7 : 9;
      return {
        componentResult: JSON.stringify({kept: [id]}),
        replicaId: 'replica-1',
        partials: [emittedPartial(id, score)],
      };
    },
  });
  await makeInvoker(collaborators).invoke({
    name: CALL_NAME,
    argumentsJson: ARGUMENTS,
    securityContext: SECURITY_CONTEXT,
  }).then(
    () => t.fail('expected the lease-holder mismatch rejection'),
    (error) => {
      t.equal(error.code, CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE);
      t.match(String(error.message), /reduce lease/u);
    },
  );
  t.equal(collaborators.calls.snapshot, null,
    'no snapshot becomes visible when the lease holder moved');
});

test('the wire carries the configured call-context budgets to run and reduce',
  async (t) => {
    const collaborators = makeCollaborators();
    await makeInvoker(collaborators).invoke({
      name: CALL_NAME,
      argumentsJson: ARGUMENTS,
      securityContext: SECURITY_CONTEXT,
    });
    for (const request of [
      ...collaborators.calls.runRequests,
      ...collaborators.calls.reduceRequests,
    ]) {
      t.same(
        request.callCell,
        {
          batchRowBound: BATCH_ROW_BOUND,
          emitBudget: EMIT_BUDGET,
          nestedCallBudget: NESTED_CALL_BUDGET,
        },
        `${request.exportName} request threads the bounded budgets`,
      );
    }
    t.same(
      collaborators.calls.reduceRequests[0].partials,
      [['u2', '9'], ['u1', '7']],
      'reduce receives the gate-merged tuples as (groupKey, aggValueJson) ' +
        'string pairs',
    );
  });

test('a statement-less binding fails closed not-invocable', async (t) => {
  const collaborators = makeCollaborators({
    resolve: () => {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.NOT_INVOCABLE,
        'binding carries no declared statement',
      );
    },
  });
  await makeInvoker(collaborators).invoke({
    name: CALL_NAME,
    securityContext: SECURITY_CONTEXT,
  }).then(
    () => t.fail('expected a not-invocable rejection'),
    (error) => {
      t.ok(error instanceof CallCellRoutingError);
      t.equal(error.code, CALL_CELL_ROUTE_ERROR_CODE.NOT_INVOCABLE);
    },
  );
  t.equal(collaborators.calls.run, 0, 'no shard invoked');
  t.equal(collaborators.calls.seeded.length, 0,
    'no coordination rows seeded');
});

test('an empty batch set fails closed without invoking', async (t) => {
  const collaborators = makeCollaborators({
    planShards: () => ({shards: [], tableName: 'ratings'}),
  });
  await makeInvoker(collaborators).invoke({
    name: CALL_NAME,
    securityContext: SECURITY_CONTEXT,
  }).then(
    () => t.fail('expected a route-unavailable rejection'),
    (error) => t.equal(
      error.code, CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE),
  );
  t.equal(collaborators.calls.run, 0, 'no shard invoked');
  t.equal(collaborators.calls.seeded.length, 0,
    'no coordination rows seeded');
});

test('an incoherent emitted partial fails closed before any publish',
  async (t) => {
    const collaborators = makeCollaborators({
      adapterInvoke: async () => ({
        componentResult: '{"kept":[]}',
        replicaId: 'replica-1',
        partials: [{
          key: `${CALL_CELL_PARTIAL_KEY_PREFIX}u1`,
          partial: '{"id":"u1","score":7}',
        }],
      }),
    });
    await makeInvoker(collaborators).invoke({
      name: CALL_NAME,
      securityContext: SECURITY_CONTEXT,
    }).then(
      () => t.fail('expected an invalid-component-result rejection'),
      (error) => t.equal(
        error.code,
        CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
        'a non-numeric emitted partial value is refused typed',
      ),
    );
    t.equal(collaborators.calls.published.length, 0,
      'nothing is published for an incoherent shard');
    t.equal(collaborators.calls.snapshot, null, 'no snapshot published');
  });

test('an incomplete partial set fails closed before reduce', async (t) => {
  const collaborators = makeCollaborators({
    resolveCompletePartialSet: async () => {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE,
        'slot set incomplete',
        {classification: 'retryable'},
      );
    },
  });
  await makeInvoker(collaborators).invoke({
    name: CALL_NAME,
    securityContext: SECURITY_CONTEXT,
  }).then(
    () => t.fail('expected a reduce-incomplete rejection'),
    (error) => t.equal(
      error.code, CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE),
  );
  t.equal(collaborators.calls.reduce, 0,
    'reduce is not invoked over an incomplete set');
  t.equal(collaborators.calls.snapshot, null,
    'no snapshot published for an incomplete set');
});

test('a coordinator without the seeding/lease surface is refused at ' +
  'construction', async (t) => {
  const collaborators = makeCollaborators();
  const {seedInvocation, ...withoutSeed} = collaborators.reduceCoordinator;
  t.ok(seedInvocation, 'fixture exposes the full coordinator surface');
  t.throws(
    () => new CallCellInvoker({
      routeResolver: collaborators.routeResolver,
      batchExecutor: collaborators.batchExecutor,
      statementAdapter: collaborators.statementAdapter,
      reduceCoordinator: withoutSeed,
    }),
    /seedInvocation/u,
  );
});

test('a caller-supplied idempotency key never carries the reserved ' +
  'wire-identity grammar', (t) => {
  t.equal(
    createCallInvocationIdentity('caller-key-1').invocationId,
    'caller-key-1',
    'a plain idempotency key passes through',
  );
  for (const reserved of ['key#slot-2', 'key#reduce', 'a#slot-1#reduce']) {
    let refusal = null;
    try {
      createCallInvocationIdentity(reserved);
    } catch (error) {
      refusal = error;
    }
    t.equal(
      refusal?.code,
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      `${reserved} is refused typed`,
    );
  }
  t.end();
});

test('the activation wait never outlives the caller deadline', async (t) => {
  const collaborators = makeCollaborators({
    adapterInvoke: async (req) => {
      if (req.exportName === 'reduce') {
        return {componentResult: RESULT_JSON, replicaId: 'replica-1'};
      }
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE,
        'no cell on host',
        {classification: 'retryable'},
      );
    },
  });
  const invoker = new CallCellInvoker({
    activationLeases: {publishActivationLease: async () => ({})},
    activationRetryIntervalMs: 25,
    activationWaitMs: 60000,
    routeResolver: collaborators.routeResolver,
    batchExecutor: collaborators.batchExecutor,
    partitionTopology: collaborators.partitionTopology,
    statementAdapter: collaborators.statementAdapter,
    reduceCoordinator: collaborators.reduceCoordinator,
    batchRowBound: BATCH_ROW_BOUND,
    partialLimit: PARTIAL_LIMIT,
  });
  const startedAt = Date.now();
  await invoker.invoke({
    name: CALL_NAME,
    argumentsJson: ARGUMENTS,
    securityContext: SECURITY_CONTEXT,
    deadlineMs: Date.now() + 300,
  }).then(
    () => t.fail('expected the host refusal to propagate'),
    (error) => t.equal(
      error.code, CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE),
  );
  t.ok(Date.now() - startedAt < 5000,
    'the wait gave up near the caller deadline, not the full window');
  t.end();
});
