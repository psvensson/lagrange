import {EventEmitter} from 'node:events';

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {PgWireProtocolHandler} from
  '../../src/runtime/pgwire-protocol-handler.js';
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  DISTRIBUTED_BEGIN_CONSUMER_KIND,
  attachDistributedBeginConsumer,
  createDistributedBeginConsumer,
  distributedBeginAcceptanceOf,
} from '../../src/query/distributed/distributed-begin-consumer.js';

const silentLogger = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

function uncertainError() {
  return Object.assign(new Error('uncertain'), {
    code: 'TRANSACTION_CREATION_UNCERTAIN',
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

function attachedOptions(kind, sessionId) {
  const consumer = createDistributedBeginConsumer(kind, sessionId);
  const options = {};
  attachDistributedBeginConsumer(options, consumer);
  return {consumer, options};
}

class RecordingSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.written = [];
  }

  write(value) {
    this.written.push(Buffer.from(value));
    return true;
  }

  destroy() {
    this.destroyed = true;
  }
}

function adapterFor(engine) {
  return new PostgresWireAdapter({
    sqlCore: engine,
    authHandler: {
      authenticate: async ({database}) => ({
        authenticated: true,
        context: {tenantId: database, principal: 'adversary', roles: []},
      }),
      authorizeQuery: () => ({authorized: true}),
    },
  });
}

test('malformed and accessor-backed creation readbacks remain retained',
  async (t) => {
    let attempted;
    const invalidEngine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: {
        supportsMutationSubmission: () => true,
        async submitMutation(mutation) {
          attempted ||= {...mutation.row};
          return {success: false, error: 'lost answer'};
        },
        async readAuthoritativeRows() {
          return {success: true,
            rows: [{...attempted, status: 'NOT_A_STATUS'}]};
        },
      },
    });
    const invalid = await invalidEngine.executeQuery('BEGIN', [],
      {sessionId: 'invalid-row'});
    t.equal(invalid.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.same(invalidEngine.transactionCoordinator
      .getTransactionCreationDiagnostics().roles, {SERVER_RECOVERY_ONLY: 1});
    await invalidEngine.shutdown();

    attempted = null;
    let getterCalls = 0;
    const accessorEngine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: {
        supportsMutationSubmission: () => true,
        async submitMutation(mutation) {
          attempted ||= {...mutation.row};
          return {success: false, error: 'lost answer'};
        },
        async readAuthoritativeRows() {
          const rows = new Array(1);
          Object.defineProperty(rows, 0, {
            enumerable: true,
            get() {
              getterCalls += 1;
              return {...attempted};
            },
          });
          return {success: true, rows};
        },
      },
    });
    const accessor = await accessorEngine.executeQuery('BEGIN', [],
      {sessionId: 'accessor-row'});
    t.equal(accessor.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.equal(getterCalls, 0);
    t.equal(accessorEngine.transactionCoordinator
      .getTransactionCreationDiagnostics().recordCount, 1);
    await accessorEngine.shutdown();
  });

test('expired uncertain BEGIN settles debt without granting ACTIVE', async (t) => {
  let now = 0;
  let writes = 0;
  const coordinator = new DistributedTransactionCoordinator({
    now: () => now,
    transactionBudgetMs: 10,
    async persistTransaction() {
      writes += 1;
      if (writes === 1) throw uncertainError();
    },
  });
  const first = await coordinator.begin('expired');
  now = 100;
  const retry = await coordinator.begin('expired');
  t.equal(first.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
  t.equal(retry.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
  t.equal(retry.transactionId, first.transactionId);
  t.equal(coordinator.getTransaction('expired'), null);
  t.equal(writes, 2);
  t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 1);
  t.same(coordinator.getTransactionCreationDiagnostics().roles,
    {RECOVERY_PENDING: 1});
});

test('bounded recovery selection rotates beyond the first batch', async (t) => {
  const writes = new Map();
  const coordinator = new DistributedTransactionCoordinator({
    maxUncertainTransactionCreations: 32,
    maxUncertainCreationSweepPerTurn: 16,
    async persistTransaction(record) {
      writes.set(record.transactionId,
        (writes.get(record.transactionId) || 0) + 1);
      throw uncertainError();
    },
  });
  for (let index = 0; index < 17; index += 1) {
    await coordinator.begin(`rotate-${index}`);
  }
  const ids = [...coordinator.workflowCoordinator.workflowsById.keys()].sort();
  await coordinator.runRecoverySweep();
  await coordinator.runRecoverySweep();
  t.equal(writes.get(ids[0]), 3);
  t.equal(writes.get(ids[15]), 2);
  t.equal(writes.get(ids[16]), 2);
  const diagnostic = coordinator.getTransactionCreationDiagnostics().sweep;
  t.equal(diagnostic.selectedCount, 16);
  t.equal(diagnostic.retainedCount, 17);
  t.equal(diagnostic.stopReason, 'failed');
});

test('post-CommandComplete acceptance failure destroys the session',
  async (t) => {
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: {
        supportsMutationSubmission: () => true,
        submitMutation: async () => ({success: true,
          completionState: 'applied'}),
      },
    });
    const socket = new RecordingSocket();
    const handler = new PgWireProtocolHandler({
      adapter: adapterFor(engine),
      logger: silentLogger,
      socket,
    });
    await handler._completeAuthentication({
      database: 'default',
      sessionId: 'post-tag',
      tenantId: 'default',
      user: 'adversary',
    });
    socket.written.length = 0;
    handler.getSession().enterTransaction = () => {
      throw new Error('local-entry-failed');
    };
    await handler._handleSimpleQuery(Buffer.from('BEGIN\0'));
    const tx = engine.transactionCoordinator.workflowCoordinator
      .workflowsByOwnerKey.get('post-tag');
    t.same(socket.written.map((entry) => String.fromCharCode(entry[0])), ['C']);
    t.equal(socket.destroyed, true);
    t.equal(handler.getSession().isClosed(), true);
    t.equal(tx.transactionCreationState, 'SERVER_RECOVERY_ONLY');
    handler.destroy();
    await engine.shutdown();
  });

test('production pgwire adapter cannot bypass distributed BEGIN acceptance',
  async (t) => {
    const adapter = new PostgresWireAdapter({
      sqlCore: {
        async executeRequest() {
          return {
            success: true,
            statementType: 'BEGIN_TRANSACTION',
            transactionId: '0123456789abcdef0123456789abcdef',
          };
        },
      },
      authHandler: {
        authenticate: async ({database}) => ({authenticated: true,
          context: {tenantId: database, principal: 'tester', roles: []}}),
        authorizeQuery: () => ({authorized: true}),
      },
    });
    const socket = new RecordingSocket();
    const handler = new PgWireProtocolHandler({
      adapter,
      logger: silentLogger,
      socket,
    });
    await handler._completeAuthentication({
      database: 'default',
      sessionId: 'missing-acceptance-owner',
      tenantId: 'default',
      user: 'tester',
    });
    socket.written.length = 0;
    await handler._handleSimpleQuery(Buffer.from('BEGIN\0'));
    t.same(socket.written.map((entry) => String.fromCharCode(entry[0])),
      ['E', 'Z']);
    t.equal(socket.written.some((entry) => entry[0] === 'C'.charCodeAt(0)),
      false);
    t.equal(String.fromCharCode(handler.getSession().getTransactionState()),
      'I');
    t.equal(socket.destroyed, false);
    handler.destroy();
  });

test('shutdown after awaited insert cannot publish ownerless success',
  async (t) => {
    const entered = deferred();
    const release = deferred();
    const coordinator = new DistributedTransactionCoordinator({
      async persistTransaction() {
        entered.resolve();
        await release.promise;
      },
    });
    const pending = coordinator.begin('shutdown-direct');
    await entered.promise;
    coordinator.retireUncertainCreationsForProcessShutdown();
    release.resolve();
    const result = await pending;
    t.equal(result.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.equal(coordinator.getTransaction('shutdown-direct'), null);
    t.same(coordinator.getTransactionCreationDiagnostics(), {
      attachmentCount: 0,
      operationCount: 0,
      recordBytes: 0,
      recordCount: 0,
      roles: {},
      totalBytes: 0,
    });
  });

test('strict resource configuration rejects accessors and unsafe domains',
  (t) => {
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'maxUncertainTransactionCreations', {
      get() {
        getterCalls += 1;
        return 1;
      },
    });
    t.throws(() => new DistributedTransactionCoordinator(accessor));
    t.equal(getterCalls, 0);
    for (const value of [-0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1,
      Number.NaN, Number.POSITIVE_INFINITY]) {
      t.throws(() => new DistributedTransactionCoordinator({
        maxUncertainTransactionCreations: value,
      }));
    }
    t.end();
  });

test('BEGIN captures only canonical transaction identity and mode inputs',
  async (t) => {
    let writes = 0;
    const invalid = new DistributedTransactionCoordinator({
      async persistTransaction() {
        writes += 1;
      },
    });
    for (const transactionMode of ['READ_ONLY', Object('EXPLICIT'), 1]) {
      const result = await invalid.begin(`bad-mode-${writes}`, {transactionMode});
      t.equal(result.errorCode, 'TRANSACTION_CREATION_PRESSURE');
    }
    for (const expectedTransactionId of [
      'a'.repeat(31),
      'A'.repeat(32),
      Object('a'.repeat(32)),
    ]) {
      const result = await invalid.begin(`bad-id-${writes}`,
        {expectedTransactionId});
      t.equal(result.errorCode, 'TRANSACTION_CREATION_PRESSURE');
    }
    t.equal(writes, 0);
    t.same(invalid.getTransactionCreationDiagnostics(), {
      attachmentCount: 0,
      operationCount: 0,
      recordBytes: 0,
      recordCount: 0,
      roles: {},
      totalBytes: 0,
    });

    const exactId = '0123456789abcdef0123456789abcdef';
    let attempted;
    const valid = new DistributedTransactionCoordinator({
      async persistTransaction(row) {
        attempted = {...row};
      },
    });
    valid.createTransactionId = () => exactId;
    const accepted = await valid.begin('valid-mode', {
      transactionMode: 'AUTOCOMMIT',
    });
    t.equal(accepted.success, true);
    t.equal(accepted.transactionId, exactId);
    t.equal(attempted.transactionId, exactId);
    t.equal(attempted.transactionMode, 'AUTOCOMMIT');

    const invalidMint = new DistributedTransactionCoordinator({
      async persistTransaction() {
        writes += 1;
      },
    });
    invalidMint.createTransactionId = () => 'not-canonical';
    const refusedMint = await invalidMint.begin('invalid-mint');
    t.equal(refusedMint.success, false);
    t.equal(writes, 0);
  });

test('detached waiter drops caller references but retains operation debt',
  async (t) => {
    const entered = deferred();
    const release = deferred();
    const {options} = attachedOptions(
      DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE,
      'detached-waiter',
    );
    const coordinator = new DistributedTransactionCoordinator({
      transactionCreationTurnBudgetMs: 10,
      async persistTransaction() {
        entered.resolve();
        await release.promise;
      },
    });
    const pending = coordinator.begin('detached-waiter', options);
    await entered.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const held = coordinator.getTransactionCreationDiagnostics();
    t.equal(held.attachmentCount, 0);
    t.equal(held.operationCount, 1);
    t.equal(held.recordCount, 1);
    release.resolve();
    const result = await pending;
    t.equal(result.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    const settled = coordinator.getTransactionCreationDiagnostics();
    t.equal(settled.operationCount, 0);
    t.same(settled.roles, {SERVER_RECOVERY_ONLY: 1});
  });

test('one role-neutral pool remains bounded across mixed live roles',
  async (t) => {
    let writes = 0;
    const coordinator = new DistributedTransactionCoordinator({
      maxUncertainTransactionCreations: 2,
      async persistTransaction() {
        writes += 1;
      },
    });
    const first = attachedOptions(DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE,
      'mixed-one');
    const second = attachedOptions(DISTRIBUTED_BEGIN_CONSUMER_KIND.APPLICATION,
      'mixed-two');
    const firstResult = await coordinator.begin('mixed-one', first.options);
    const secondResult = await coordinator.begin('mixed-two', second.options);
    const full = coordinator.getTransactionCreationDiagnostics();
    t.equal(full.recordCount, 2);
    t.same(full.roles, {SUCCESS_CLAIMED: 2});
    const refused = await coordinator.begin('mixed-three');
    t.equal(refused.errorCode, 'TRANSACTION_CREATION_PRESSURE');
    t.equal(writes, 2);

    coordinator.retireDistributedBeginConsumer('mixed-one', first.consumer);
    const retired = coordinator.getTransactionCreationDiagnostics();
    t.equal(retired.recordCount, 2);
    t.same(retired.roles, {SERVER_RECOVERY_ONLY: 1, SUCCESS_CLAIMED: 1});
    t.equal(coordinator.acceptDistributedBegin(second.consumer,
      distributedBeginAcceptanceOf(secondResult)), true);
    t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 1);
    const third = await coordinator.begin('mixed-three');
    t.equal(third.success, true);
    t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 1);
    t.equal(firstResult.success, true);
  });
