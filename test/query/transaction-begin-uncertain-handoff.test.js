import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import pg from 'pg';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {PgWireProtocolHandler} from
  '../../src/runtime/pgwire-protocol-handler.js';
import {PostgresWireRuntimeModule} from
  '../../src/runtime/pgwire-runtime-module.js';
import {PG_TRANSACTION_STATE} from
  '../../src/runtime/pgwire-protocol-constants.js';
import {createBoundApplicationDatabaseRuntime} from
  '../../src/query/application-database.js';
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  DISTRIBUTED_BEGIN_CONSUMER_KIND,
  attachDistributedBeginConsumer,
  createDistributedBeginConsumer,
  distributedBeginAcceptanceOf,
  distributedBeginConsumerOf,
} from '../../src/query/distributed/distributed-begin-consumer.js';
import {
  buildInitialTransactionDeliveryKey,
  encodeInitialTransactionRow,
} from '../../src/query/distributed/distributed-transaction-creation-contract.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {META_SERVICE_RUNTIME_REF} from '../../src/constants/wasm-meta.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

const LOOPBACK_HOST = '127.0.0.1';
const COMPONENT_DATABASE = 'begin_component';
const COMPONENT_USER = 'begin_component';
const silentLogger = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

function uncertainError() {
  return Object.assign(new Error('lost insert answer'), {
    code: 'TRANSACTION_CREATION_UNCERTAIN',
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, reject, resolve};
}

class RecordingSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
  }
  write(bytes) {
    this.written.push(Buffer.from(bytes));
    return true;
  }
  end() {}
  destroy() {}
}

function componentSqlRequestExecutor(engine) {
  const executeRequest = (request) => engine.executeRequest(request);
  executeRequest.acceptDistributedBeginForConsumer = (...args) =>
    engine.acceptDistributedBeginForConsumer(...args);
  executeRequest.retireDistributedBeginConsumer = (...args) =>
    engine.retireDistributedBeginConsumer(...args);
  return executeRequest;
}

async function startComponentPgwire(engine) {
  const runtime = new PostgresWireRuntimeModule({logger: silentLogger});
  const definition = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      authMode: 'trust',
      host: LOOPBACK_HOST,
      tlsMode: 'disable',
    }),
  };
  const prepared = await runtime.prepare(definition);
  if (prepared.status !== 'ready') throw new Error(prepared.error);
  const context = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: LOOPBACK_HOST,
    port: 0,
    sqlRequestExecutor: componentSqlRequestExecutor(engine),
  };
  const started = await runtime.start(context);
  if (started.status !== 'running') throw new Error(started.error);
  return {
    close: () => runtime.stop(context),
    port: started.endpointIntent.port,
  };
}

function componentPgClient(port) {
  return new pg.Client({
    database: COMPONENT_DATABASE,
    host: LOOPBACK_HOST,
    port,
    ssl: false,
    user: COMPONENT_USER,
  });
}

function pgwireServiceDefinition() {
  return {
    runtimeConfig: JSON.stringify({
      authMode: 'trust',
      host: LOOPBACK_HOST,
      tlsMode: 'disable',
    }),
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
  };
}

function captureReadyStates(client) {
  const states = [];
  client.connection.on('message', (message) => {
    if (message.name === 'readyForQuery') states.push(message.status);
  });
  return states;
}

function nextReadyState(client) {
  return new Promise((resolve) => {
    client.connection.once('readyForQuery', (message) => {
      resolve(message.status);
    });
  });
}

async function waitForCreationState(coordinator, transactionId, state) {
  for (let turn = 0; turn < 100; turn += 1) {
    const tx = coordinator.workflowCoordinator.getWorkflowById(transactionId);
    if (tx?.transactionCreationState === state) return tx;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Creation ${transactionId} did not reach ${state}`);
}

async function within(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(label)), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('BEGIN creation encoding retains the approved fixed vector', (t) => {
  const row = {
    transaction_id: '00000000000000000000000000000000',
    session_id: 'session-1',
    status: 'ACTIVE',
    transaction_epoch: 0,
    timeout_deadline: 1700000030000,
    transaction_mode: 'EXPLICIT',
    participant_set_state: 'OPEN',
    participant_set_text: '[]',
    commit_mode: 'NOT_SELECTED',
    frozen_participant_count: 0,
    updated_at: 1700000000000,
    decision: null,
    decision_text: null,
    decision_digest: null,
    created_at: 1700000000000,
  };
  const bytes = encodeInitialTransactionRow(row);
  t.equal(bytes.length, 183);
  t.equal(createHash('sha256').update(bytes).digest('hex'),
    '3a203ee75b7404a614e9061d958d3c18eacdbf70ecb6d984f17aec50de67124c');
  t.equal(buildInitialTransactionDeliveryKey(row.transaction_id, bytes),
    'd9ff43857c5514ccf70b808cfa2468a018321beeb4c805d234d2ede5cc1ac9a7');
  t.end();
});

test('uncertain BEGIN retains one identity and reenters it', async (t) => {
  const persistedIds = [];
  let uncertain = true;
  const coordinator = new DistributedTransactionCoordinator({
    persistTransaction: async (record) => {
      persistedIds.push(record.transactionId);
      if (uncertain) throw uncertainError();
    },
  });
  const first = await coordinator.begin('same-session');
  t.equal(first.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
  t.equal(coordinator.getTransaction('same-session'), null);
  t.equal(coordinator.hasActiveTransaction('same-session'), true);
  t.equal((await coordinator.rollback('same-session')).errorCode,
    'TRANSACTION_CREATION_UNCERTAIN');
  uncertain = false;
  const retry = await coordinator.begin('same-session');
  t.equal(retry.success, true);
  t.equal(retry.transactionId, first.transactionId);
  t.same(persistedIds, [first.transactionId, first.transactionId]);
  t.same(coordinator.getTransactionCreationDiagnostics(), {
    attachmentCount: 0,
    operationCount: 0,
    recordBytes: 0,
    recordCount: 0,
    roles: {},
    totalBytes: 0,
  });
  t.end();
});

test('one role-neutral slot covers claim acceptance and stale consumers',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator({
      maxUncertainTransactionCreations: 1,
    });
    const consumer = createDistributedBeginConsumer(
      DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE,
      'wire',
    );
    const options = {};
    attachDistributedBeginConsumer(options, consumer);
    const begun = await coordinator.begin('wire', options);
    const acceptance = distributedBeginAcceptanceOf(begun);
    t.equal(begun.success, true);
    t.equal(coordinator.getTransaction('wire'), null);
    t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 1);
    const stale = createDistributedBeginConsumer(
      DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE,
      'wire',
    );
    t.equal(coordinator.acceptDistributedBegin(stale, acceptance), false);
    let enteredId = null;
    t.equal(coordinator.acceptDistributedBegin(
      consumer,
      acceptance,
      (transactionId) => {
        enteredId = transactionId;
      },
    ), true);
    t.equal(enteredId, begun.transactionId);
    t.equal(coordinator.acceptDistributedBegin(consumer, acceptance), false);
    t.equal(coordinator.getTransaction('wire').transactionId,
      begun.transactionId);
    t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 0);
    t.end();
  });

test('recovery before retry preserves the live consumer handoff', async (t) => {
  let writes = 0;
  const coordinator = new DistributedTransactionCoordinator({
    persistTransaction: async () => {
      writes += 1;
      if (writes === 1) throw uncertainError();
    },
  });
  const consumer = createDistributedBeginConsumer(
    DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE,
    'recovery-first',
  );
  const options = {};
  attachDistributedBeginConsumer(options, consumer);
  const first = await coordinator.begin('recovery-first', options);
  t.equal(first.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
  const sweep = await coordinator.runRecoverySweep();
  t.equal(sweep.resolved, 1);
  const retry = await coordinator.begin('recovery-first', options);
  t.equal(retry.transactionId, first.transactionId);
  t.equal(coordinator.acceptDistributedBegin(
    consumer,
    distributedBeginAcceptanceOf(retry),
  ), true);
  t.equal(coordinator.getTransaction('recovery-first').transactionId,
    first.transactionId);
  t.equal(writes, 2);
});

test('generic wrong-key readback remains uncertain and retry keeps the ID',
  async (t) => {
    let attemptedRow = null;
    let writes = 0;
    let reads = 0;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        writes += 1;
        attemptedRow ||= {...mutation.row};
        return {success: false, error: 'generic timeout'};
      },
      async readAuthoritativeRows() {
        reads += 1;
        return reads === 1 ?
          {success: true, rows: [{...attemptedRow,
            transaction_id: 'ffffffffffffffffffffffffffffffff'}]} :
          {success: true, rows: [{...attemptedRow}]};
      },
    };
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: gateway,
    });
    t.after(() => engine.shutdown());
    const first = await engine.executeQuery('BEGIN', [], {sessionId: 'lost'});
    const retry = await engine.executeQuery('BEGIN', [], {sessionId: 'lost'});
    t.equal(first.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.equal(retry.success, true);
    t.equal(retry.transactionId, first.transactionId);
    t.equal(writes, 2);
    t.equal(engine.transactionCoordinator.getTransaction('lost').transactionId,
      first.transactionId);
  });

test('producer-specific primary-key conflict alone permits bounded remint',
  async (t) => {
    let firstRow = null;
    let writes = 0;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        writes += 1;
        if (writes === 1) {
          firstRow = {...mutation.row};
          return {success: false,
            errorCode: 'SQLITE_CONSTRAINT_PRIMARYKEY'};
        }
        return {success: true, completionState: 'applied'};
      },
      async readAuthoritativeRows() {
        return {success: true, rows: [{...firstRow,
          session_id: 'foreign-session'}]};
      },
    };
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: gateway,
    });
    t.after(() => engine.shutdown());
    const begun = await engine.executeQuery('BEGIN', [], {sessionId: 'collision'});
    t.equal(begun.success, true);
    t.not(begun.transactionId, firstRow.transaction_id);
    t.equal(writes, 2);
  });

test('incomplete same-key readback retains identity without remint', async (t) => {
  let attemptedRow = null;
  let writes = 0;
  const gateway = {
    supportsMutationSubmission: () => true,
    async submitMutation(mutation) {
      writes += 1;
      attemptedRow = {...mutation.row};
      return {success: false, error: 'unknown completion'};
    },
    async readAuthoritativeRows() {
      return {success: true, rows: [{
        transaction_id: attemptedRow.transaction_id,
        session_id: attemptedRow.session_id,
      }]};
    },
  };
  const engine = new SQLQueryEngine({
    autoStartDistributedTransactionRecovery: false,
    controlPlaneSystemTableGateway: gateway,
  });
  t.after(() => engine.shutdown());
  const begun = await engine.executeQuery('BEGIN', [], {sessionId: 'incomplete'});
  t.equal(begun.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
  t.equal(begun.transactionId, attemptedRow.transaction_id);
  t.equal(writes, 1);
  t.equal(engine.transactionCoordinator.getTransactionCreationDiagnostics()
    .recordCount, 1);
});

test('pre-FIFO operation accounting refuses excess BEGIN before mint or persist',
  async (t) => {
    const entered = deferred();
    const release = deferred();
    let persistCalls = 0;
    const coordinator = new DistributedTransactionCoordinator({
      maxUncertainTransactionCreations: 1,
      persistTransaction: async () => {
        persistCalls += 1;
        entered.resolve();
        await release.promise;
        throw uncertainError();
      },
    });
    const pgConsumer = createDistributedBeginConsumer(
      DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE,
      'held',
    );
    const pgOptions = {};
    attachDistributedBeginConsumer(pgOptions, pgConsumer);
    const firstPromise = coordinator.begin('held', pgOptions);
    await entered.promise;
    const applicationConsumer = createDistributedBeginConsumer(
      DISTRIBUTED_BEGIN_CONSUMER_KIND.APPLICATION,
      'other',
    );
    const applicationOptions = {};
    attachDistributedBeginConsumer(applicationOptions, applicationConsumer);
    const refused = await coordinator.begin('other', applicationOptions);
    t.equal(refused.errorCode, 'TRANSACTION_CREATION_PRESSURE');
    t.equal(persistCalls, 1);
    release.resolve();
    const first = await firstPromise;
    t.equal(first.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.equal(coordinator.getTransactionCreationDiagnostics().operationCount, 0);
    t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 1);
  });

test('retained same-session FIFO work keeps one identity and bounded charges',
  async (t) => {
    const entered = deferred();
    const release = deferred();
    let writes = 0;
    const coordinator = new DistributedTransactionCoordinator({
      maxUncertainTransactionCreations: 2,
      persistTransaction: async () => {
        writes += 1;
        if (writes === 1) {
          entered.resolve();
          await release.promise;
          throw uncertainError();
        }
      },
    });
    const first = coordinator.begin('queued-session');
    await entered.promise;
    const queued = coordinator.begin('queued-session');
    t.equal(coordinator.getTransactionCreationDiagnostics().operationCount, 2);
    release.resolve();
    const firstResult = await first;
    const queuedResult = await queued;
    t.equal(firstResult.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.equal(queuedResult.success, true);
    t.equal(queuedResult.transactionId, firstResult.transactionId);
    t.equal(writes, 2);
    t.equal(coordinator.getTransactionCreationDiagnostics().totalBytes, 0);
  });

test('PostgresWireAdapter binds acceptance to its exact live session',
  async (t) => {
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: {
        supportsMutationSubmission: () => true,
        submitMutation: async () => ({success: true,
          completionState: 'applied'}),
      },
    });
    t.after(() => engine.shutdown());
    const adapter = new PostgresWireAdapter({
      sqlCore: engine,
      authHandler: {
        authenticate: async ({database}) => ({authenticated: true,
          context: {tenantId: database, principal: 'tester', roles: []}}),
        authorizeQuery: () => ({authorized: true}),
      },
    });
    await adapter.authenticate('wire-session', {tenantId: 'default'});
    const begun = await adapter.execute('wire-session', 'BEGIN');
    let entered = null;
    t.equal(adapter.acceptDistributedBegin('wire-session', begun,
      (transactionId) => {
        entered = transactionId;
      }), true);
    t.equal(entered, begun.transactionId);
    t.equal(engine.transactionCoordinator.getTransaction('wire-session')
      .transactionId, begun.transactionId);
    adapter.closeSession('wire-session', {transactionOpen: true});
  });

test('pgwire uncertain BEGIN stays idle and plain retry accepts the same ID',
  async (t) => {
    let attemptedRow = null;
    let reads = 0;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        attemptedRow ||= {...mutation.row};
        return {success: false, error: 'lost answer'};
      },
      async readAuthoritativeRows() {
        reads += 1;
        return reads === 1 ?
          {success: false, error: 'temporarily unavailable'} :
          {success: true, rows: [{...attemptedRow}]};
      },
    };
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: gateway,
    });
    t.after(() => engine.shutdown());
    const adapter = new PostgresWireAdapter({
      sqlCore: engine,
      authHandler: {
        authenticate: async ({database}) => ({authenticated: true,
          context: {tenantId: database, principal: 'tester', roles: []}}),
        authorizeQuery: () => ({authorized: true}),
      },
    });
    const socket = new RecordingSocket();
    const handler = new PgWireProtocolHandler({adapter, socket,
      logger: {debug() {}, error() {}, info() {}, warn() {}}});
    await handler._completeAuthentication({sessionId: 'wire-retry',
      tenantId: 'default', user: 'tester', database: 'default'});
    socket.written.length = 0;
    await handler._handleSimpleQuery(Buffer.from('BEGIN\0'));
    const firstId = attemptedRow.transaction_id;
    t.equal(handler.getSession().getTransactionState(),
      PG_TRANSACTION_STATE.IDLE);
    t.equal(engine.transactionCoordinator.getTransaction('wire-retry'), null);
    await handler._handleSimpleQuery(Buffer.from('BEGIN\0'));
    t.equal(handler.getSession().getTransactionState(),
      PG_TRANSACTION_STATE.IN_TRANSACTION);
    t.equal(handler.getSession().transactionId, firstId);
    t.equal(engine.transactionCoordinator.getTransaction('wire-retry')
      .transactionId, firstId);
    handler.destroy();
  });

test('ordinary pg client retries a lost BEGIN with the same identity',
  async (t) => {
    let attemptedRow = null;
    let reads = 0;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        if (!mutation.row) {
          Object.assign(attemptedRow, mutation.data || {});
          return {success: true, completionState: 'applied'};
        }
        attemptedRow ||= {...mutation.row};
        return {success: false, error: 'lost BEGIN answer'};
      },
      async readAuthoritativeRows() {
        reads += 1;
        return reads === 1 ?
          {success: false, error: 'temporarily unavailable'} :
          {success: true, rows: [{...attemptedRow}]};
      },
    };
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: gateway,
    });
    const listener = await startComponentPgwire(engine);
    const client = componentPgClient(listener.port);
    const readyStates = captureReadyStates(client);
    t.after(async () => {
      await client.end().catch(() => {});
      await listener.close();
      await engine.shutdown();
    });
    await client.connect();
    readyStates.length = 0;
    const firstReady = nextReadyState(client);
    await t.rejects(client.query('BEGIN'));
    t.equal(await firstReady, 'I');
    const firstId = attemptedRow.transaction_id;
    const rollbackReady = nextReadyState(client);
    let rollbackError = null;
    try {
      await client.query('ROLLBACK');
    } catch (error) {
      rollbackError = error;
    }
    t.equal(rollbackError?.code, 'XX000');
    t.equal(rollbackError?.message,
      'Distributed transaction creation outcome is uncertain; ' +
      'retry this BEGIN on the same session');
    t.equal(await rollbackReady, 'I');
    t.equal(engine.transactionCoordinator
      .getTransactionCreationDiagnostics().recordCount, 1);
    await client.query('BEGIN');
    t.equal(readyStates.at(-1), 'T');
    t.equal(engine.transactionCoordinator.getTransaction(
      attemptedRow.session_id,
    ).transactionId, firstId);
    await client.query('ROLLBACK');
    t.equal(readyStates.at(-1), 'I');
  });

test('ordinary pg client consumes recovery-first BEGIN handoff', async (t) => {
  let attemptedRow = null;
  let reads = 0;
  const gateway = {
    supportsMutationSubmission: () => true,
    async submitMutation(mutation) {
      if (!mutation.row) {
        Object.assign(attemptedRow, mutation.data || {});
        return {success: true, completionState: 'applied'};
      }
      attemptedRow ||= {...mutation.row};
      return {success: false, error: 'lost BEGIN answer'};
    },
    async readAuthoritativeRows() {
      reads += 1;
      return reads === 1 ?
        {success: false, error: 'temporarily unavailable'} :
        {success: true, rows: [{...attemptedRow}]};
    },
  };
  const engine = new SQLQueryEngine({
    autoStartDistributedTransactionRecovery: false,
    controlPlaneSystemTableGateway: gateway,
  });
  const listener = await startComponentPgwire(engine);
  const client = componentPgClient(listener.port);
  const readyStates = captureReadyStates(client);
  t.after(async () => {
    await client.end().catch(() => {});
    await listener.close();
    await engine.shutdown();
  });
  await client.connect();
  readyStates.length = 0;
  const firstReady = nextReadyState(client);
  await t.rejects(client.query('BEGIN'));
  t.equal(await firstReady, 'I');
  const firstId = attemptedRow.transaction_id;
  const sweep = await engine.transactionCoordinator.runRecoverySweep();
  t.equal(sweep.resolved, 1);
  await client.query('BEGIN');
  t.equal(readyStates.at(-1), 'T');
  t.equal(engine.transactionCoordinator.getTransaction(
    attemptedRow.session_id,
  ).transactionId, firstId);
  await client.query('ROLLBACK');
  t.equal(readyStates.at(-1), 'I');
});

test('ordinary pg client disconnect wins over a late BEGIN completion',
  async (t) => {
    const insertEntered = deferred();
    const insertRelease = deferred();
    let attemptedRow = null;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        if (!mutation.row) return {success: true, completionState: 'applied'};
        attemptedRow = {...mutation.row};
        insertEntered.resolve();
        await insertRelease.promise;
        return {success: true, completionState: 'applied'};
      },
      async readAuthoritativeRows() {
        return {success: true, rows: [{...attemptedRow}]};
      },
    };
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: gateway,
    });
    const listener = await startComponentPgwire(engine);
    const client = componentPgClient(listener.port);
    client.on('error', () => {});
    t.after(async () => {
      await client.end().catch(() => {});
      await listener.close();
      await engine.shutdown();
    });
    await client.connect();
    const beginPromise = client.query('BEGIN');
    await insertEntered.promise;
    client.connection.stream.destroy();
    await t.rejects(beginPromise);
    await waitForCreationState(
      engine.transactionCoordinator,
      attemptedRow.transaction_id,
      'SERVER_RECOVERY_ONLY',
    );
    insertRelease.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    const pending = engine.transactionCoordinator.workflowCoordinator
      .getWorkflowById(attemptedRow.transaction_id);
    t.equal(pending.transactionCreationState, 'SERVER_RECOVERY_ONLY');
    const sweep = await engine.transactionCoordinator.runRecoverySweep();
    t.equal(sweep.swept, 1);
    t.equal(engine.transactionCoordinator.getTransaction(
      attemptedRow.session_id,
    ).transactionId, attemptedRow.transaction_id);
  });

test('query executor replacement retires the issuing BEGIN owner',
  async (t) => {
    const insertEntered = deferred();
    const insertRelease = deferred();
    let attemptedRow = null;
    const firstEngine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: {
        supportsMutationSubmission: () => true,
        updateSystemTableRow: async () => ({success: true}),
        async submitMutation(mutation) {
          if (!mutation.row ||
              !Object.hasOwn(mutation.row, 'transaction_id')) {
            return {success: true, completionState: 'applied'};
          }
          attemptedRow = {...mutation.row};
          insertEntered.resolve();
          await insertRelease.promise;
          return {success: true, completionState: 'applied'};
        },
      },
    });
    const secondEngine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: {
        supportsMutationSubmission: () => true,
        updateSystemTableRow: async () => ({success: true}),
        submitMutation: async () => ({success: true,
          completionState: 'applied'}),
      },
    });
    const lifecycle = createRuntimeStartupWiring().serviceRuntimeLifecycle;
    firstEngine._wireQueryExecutorFactory(lifecycle);
    const definition = pgwireServiceDefinition();
    await within(lifecycle.prepare(definition, {nodeId: 'begin-owner-one'}),
      'replacement prepare timed out');
    const context = {...definition, host: LOOPBACK_HOST, port: 0};
    const started = await within(lifecycle.start(context),
      'replacement start timed out');
    const client = componentPgClient(started.endpointIntent.port);
    client.on('error', () => {});
    t.after(async () => {
      await client.end().catch(() => {});
      await lifecycle.stop(context).catch(() => {});
      await firstEngine.shutdown();
      await secondEngine.shutdown();
    });
    await within(client.connect(), 'replacement client connect timed out');
    const beginPromise = client.query('BEGIN');
    await within(insertEntered.promise, 'replacement BEGIN did not persist');
    secondEngine._wireQueryExecutorFactory(lifecycle);
    insertRelease.resolve();
    await t.rejects(beginPromise);
    const retained = await waitForCreationState(
      firstEngine.transactionCoordinator,
      attemptedRow.transaction_id,
      'SERVER_RECOVERY_ONLY',
    );
    t.equal(retained.transactionId, attemptedRow.transaction_id);
    t.equal(firstEngine.transactionCoordinator
      .getTransactionCreationDiagnostics().recordCount, 1);
    t.equal(secondEngine.transactionCoordinator.getTransaction(
      attemptedRow.session_id,
    ), null);
  });

test('ApplicationDatabase accepts BEGIN before invoking its callback',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator();
    let acceptedBeforeCallback = false;
    const core = {
      async executeQuery(sql, _params, options) {
        if (sql === 'BEGIN') return coordinator.begin(options.sessionId, options);
        if (sql === 'COMMIT') {
          return coordinator.commit(options.sessionId, {
            expectedTransactionId: options.expectedTransactionId,
          });
        }
        if (sql === 'ROLLBACK') {
          return coordinator.rollback(options.sessionId, {
            expectedTransactionId: options.expectedTransactionId,
          });
        }
        return {success: true, rows: []};
      },
      acceptDistributedBeginForConsumer(options, result) {
        return coordinator.acceptDistributedBegin(
          distributedBeginConsumerOf(options),
          distributedBeginAcceptanceOf(result),
        );
      },
      retireDistributedBeginConsumer(sessionId, consumer) {
        coordinator.retireDistributedBeginConsumer(sessionId, consumer);
      },
    };
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'begin-owner'});
    await db.transaction(async () => {
      acceptedBeforeCallback = coordinator.getTransactionCreationDiagnostics()
        .recordCount === 0;
    });
    t.equal(acceptedBeforeCallback, true);
    t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 0);
    t.end();
  });
