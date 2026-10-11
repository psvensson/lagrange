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
import {buildDecisionRecord} from
  '../../src/partition/partition-participant-transaction-bytes.js';

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

function retainedCanonicalFieldBytes(value) {
  return Object.values(value)
    .reduce((total, entry) => total + (typeof entry === 'string' ?
      Buffer.byteLength(entry) : (typeof entry === 'number' ||
        typeof entry === 'boolean' || (entry && typeof entry === 'object')) ?
        8 : 0), 0);
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
  let now = 0;
  const writes = new Map();
  const coordinator = new DistributedTransactionCoordinator({
    now: () => now,
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
  now = 2000;
  await coordinator.runRecoverySweep();
  t.equal(writes.get(ids[0]), 3);
  t.equal(writes.get(ids[15]), 2);
  t.equal(writes.get(ids[16]), 2);
  const diagnostic = coordinator.getTransactionCreationDiagnostics().sweep;
  t.equal(diagnostic.selectedCount, 16);
  t.equal(diagnostic.retainedCount, 17);
  t.equal(diagnostic.stopReason, 'deferred');
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
    t.equal(result.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    const settled = coordinator.getTransactionCreationDiagnostics();
    t.equal(settled.operationCount, 0);
    t.same(settled.roles, {UNCERTAIN_ANSWERED: 1});
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

test('advanced creation recovery keeps the exact live disposition through replay',
  async (t) => {
    let attempted;
    let durable;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        if (mutation.operation === 'insert') {
          attempted = {...mutation.row};
          const decision = buildDecisionRecord(attempted.transaction_id,
            'ROLLBACK', []);
          durable = {...attempted, status: 'ROLLING_BACK',
            participant_set_state: 'FROZEN', commit_mode: 'TWO_PHASE_COMMIT',
            decision: decision.decision, decision_text: decision.decisionText,
            decision_digest: decision.decisionDigest};
          return {success: false, error: 'lost answer'};
        }
        if (mutation.tableName === 'sql_transactions') {
          durable = {...durable, ...mutation.data};
        }
        return {success: true, completionState: 'applied'};
      },
      async readAuthoritativeRows(tableName) {
        return {success: true, rows: tableName === 'sql_transactions' ?
          [{...durable}] : []};
      },
    };
    const engine = new SQLQueryEngine({autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: gateway});
    const {consumer, options} = attachedOptions(
      DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE, 'advanced-live-disposition');
    options.sessionId = 'advanced-live-disposition';
    const first = await engine.executeQuery('BEGIN', [], options);
    const coordinator = engine.transactionCoordinator;
    const original = coordinator.transactionsBySession.get(
      'advanced-live-disposition');
    t.equal(first.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    t.equal(original.transactionId, attempted.transaction_id);
    t.equal(original.transactionCreationConsumer, consumer);
    t.equal(original.transactionCreationState, 'RECOVERY_PENDING');
    const replay = await coordinator.resumeRecoveredTransactions();
    t.equal(replay.resumed, 1);
    t.equal(coordinator.transactionsBySession.get(
      'advanced-live-disposition'), original);
    const retry = await engine.executeQuery('BEGIN', [], options);
    t.equal(retry.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    t.equal(retry.transactionId, original.transactionId);
    t.equal(coordinator.transactionsBySession.has(
      'advanced-live-disposition'), false);
    t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 0);
    await engine.shutdown();
  });

test('advanced creation rereads after transient recovery pages return',
  async (t) => {
    let now = 0;
    let attempted;
    let available = false;
    let reads = 0;
    let writes = 0;
    const readBudgets = [];
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        writes += 1;
        attempted ||= {...mutation.row, status: 'ROLLING_BACK'};
        return {success: false, error: 'lost answer'};
      },
      async readAuthoritativeRows(tableName, _sql, _params, readOptions) {
        reads += 1;
        readBudgets.push({...readOptions?.timeoutBudget});
        if (readOptions?.timeoutBudget?.deadlineMs <= now) {
          return {success: false, error: 'expired control turn'};
        }
        if (reads === 1) return {success: true, rows: [{...attempted}]};
        if (!available) {
          return {success: false,
            error: 'authoritative_row_source_unavailable'};
        }
        return {success: true, rows: tableName === 'sql_transactions' ?
          [{...attempted}] : []};
      },
    };
    const engine = new SQLQueryEngine({autoStartDistributedTransactionRecovery: false,
      nowFn: () => now,
      controlPlaneSystemTableGateway: gateway});
    const {options} = attachedOptions(DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE,
      'advanced-reread');
    options.sessionId = 'advanced-reread';
    options.timeoutDeadline = 1000000;
    const first = await engine.executeQuery('BEGIN', [], options);
    const pending = engine.transactionCoordinator.transactionsBySession.get(
      'advanced-reread');
    now = pending.transactionCreationTurnBudget.deadlineMs + 1;
    const before = reads;
    available = true;
    const retry = await engine.executeQuery('BEGIN', [], options);
    const retryBudgets = readBudgets.slice(before);
    const retained = engine.transactionCoordinator.transactionsBySession.get(
      'advanced-reread');
    const writesBeforeSweep = writes;
    const sweep = await engine.transactionCoordinator.runRecoverySweep();
    t.equal(first.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    t.equal(retry.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    t.equal(writesBeforeSweep, 1,
      'known advanced authority never replays initial INSERT');
    t.ok(reads > before);
    t.ok(retryBudgets.every((budget) => budget.deadlineMs > now));
    t.equal(retained.transactionCreationAdvancedHandoff, true);
    t.equal(sweep.swept, 1);
    t.equal(engine.transactionCoordinator.transactionsBySession.get(
      'advanced-reread').recoveryDiscovered, true);
    await engine.shutdown();
  });

test('retired consumer keeps observed advanced creation out of initial replay',
  async (t) => {
    let durable;
    let reads = 0;
    let writes = 0;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        writes += 1;
        const decision = buildDecisionRecord(mutation.row.transaction_id,
          'ROLLBACK', []);
        durable = {...mutation.row, status: 'ROLLING_BACK',
          participant_set_state: 'FROZEN', commit_mode: 'TWO_PHASE_COMMIT',
          decision: decision.decision, decision_text: decision.decisionText,
          decision_digest: decision.decisionDigest};
        return {success: false, error: 'lost answer'};
      },
      async readAuthoritativeRows(tableName) {
        reads += 1;
        if (reads === 2) {
          return {success: false, error: 'authoritative_row_source_unavailable'};
        }
        return {success: true, rows: tableName === 'sql_transactions' ?
          [{...durable}] : []};
      },
    };
    const engine = new SQLQueryEngine({autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: gateway});
    const coordinator = engine.transactionCoordinator;
    const {consumer, options} = attachedOptions(
      DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE, 'advanced-retired');
    options.sessionId = 'advanced-retired';
    const first = await engine.executeQuery('BEGIN', [], options);
    const tx = coordinator.transactionsBySession.get('advanced-retired');
    coordinator.retireDistributedBeginConsumer('advanced-retired', consumer);
    const sweep = await coordinator.runRecoverySweep();
    t.equal(first.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    t.equal(writes, 1, 'known advanced authority never replays initial INSERT');
    t.equal(tx.transactionCreationAdvancedObserved, true);
    t.equal(tx.transactionCreationAdvancedHandoff, true);
    t.equal(tx.transactionCreationConsumer, null);
    t.equal(tx.decision.decision, 'ROLLBACK');
    t.equal(sweep.swept, 1);
    t.equal(coordinator.getTransactionCreationDiagnostics().recordCount, 1);
    await engine.shutdown();
  });

test('terminal server-only advanced recovery releases its exact record charge',
  async (t) => {
    let attempted;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        if (!attempted) {
          const decision = buildDecisionRecord(mutation.row.transaction_id,
            'ROLLBACK', []);
          attempted = {...mutation.row, status: 'ROLLING_BACK',
            participant_set_state: 'FROZEN', commit_mode: 'TWO_PHASE_COMMIT',
            decision: decision.decision, decision_text: decision.decisionText,
            decision_digest: decision.decisionDigest};
          return {success: false, error: 'lost answer'};
        }
        if (mutation.tableName === 'sql_transactions') {
          attempted = {...attempted, ...mutation.data};
        }
        return {success: true, completionState: 'applied'};
      },
      async readAuthoritativeRows(tableName) {
        return {success: true, rows: tableName === 'sql_transactions' ?
          [{...attempted}] : []};
      },
      async updateSystemTableRow(tableName, key, data) {
        if (tableName === 'sql_transactions') attempted = {...attempted, ...data};
        return {success: true};
      },
    };
    const engine = new SQLQueryEngine({autoStartDistributedTransactionRecovery: false,
      controlPlaneSystemTableGateway: gateway});
    const coordinator = engine.transactionCoordinator;
    const first = await coordinator.begin('advanced-server-only');
    const before = coordinator.getTransactionCreationDiagnostics();
    const sweep = await coordinator.runRecoverySweep();
    const after = coordinator.getTransactionCreationDiagnostics();
    t.equal(first.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    t.equal(before.recordCount, 1);
    t.equal(sweep.resolved, 1);
    t.equal(after.recordCount, 0);
    t.equal(after.recordBytes, 0);
    t.equal(coordinator.transactionsBySession.has('advanced-server-only'), false);
    await engine.shutdown();
  });

test('creation accounting refuses undercharged long identities before delivery',
  async (t) => {
    const sessionId = 's'.repeat(20000);
    let writes = 0;
    const coordinator = new DistributedTransactionCoordinator({
      maxUncertainTransactionCreationCanonicalBytes: 65000,
      async persistTransaction() {
        writes += 1;
      },
    });
    const result = await coordinator.begin(sessionId);
    t.equal(result.errorCode, 'TRANSACTION_CREATION_PRESSURE');
    t.equal(writes, 0);
    t.same(coordinator.getTransactionCreationDiagnostics(), {
      attachmentCount: 0, operationCount: 0, recordBytes: 0, recordCount: 0,
      roles: {}, totalBytes: 0});
  });

test('creation envelope covers retained aliases and UTF-8 row storage',
  async (t) => {
    const sessionId = '💾'.repeat(5000);
    let retainedDuringPersistence = null;
    const coordinator = new DistributedTransactionCoordinator({
      maxUncertainTransactionCreationCanonicalBytes: 250000,
      async persistTransaction(persistenceProjection) {
        const [attachment] = coordinator.transactionCreationAttachmentsBySession
          .get(sessionId);
        const rawCandidate = attachment.boundRecord;
        const authoritativeRecord = rawCandidate.transactionCreationReservation.tx;
        retainedDuringPersistence = {
          authoritativeRecord,
          rawCandidate,
          observedBytes:
            rawCandidate.transactionCreationInitialRowBytes.length +
            retainedCanonicalFieldBytes(rawCandidate.transactionCreationInitialRow) +
            retainedCanonicalFieldBytes(rawCandidate) +
            retainedCanonicalFieldBytes(authoritativeRecord) +
            retainedCanonicalFieldBytes(attachment.consumer) +
            retainedCanonicalFieldBytes(rawCandidate.transactionCreationTurnBudget) +
            retainedCanonicalFieldBytes(rawCandidate.transactionCreationReservation) +
            retainedCanonicalFieldBytes(rawCandidate.timeoutBudget) +
            retainedCanonicalFieldBytes(persistenceProjection) +
            2 * retainedCanonicalFieldBytes(rawCandidate.transactionCreationInitialRow) +
            3 * Buffer.byteLength(rawCandidate.transactionCreationDeliveryKey),
        };
        throw uncertainError();
      },
    });
    const result = await coordinator.begin(sessionId);
    const tx = coordinator.transactionsBySession.get(sessionId);
    const diagnostics = coordinator.getTransactionCreationDiagnostics();
    t.equal(result.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.not(retainedDuringPersistence.rawCandidate,
      retainedDuringPersistence.authoritativeRecord);
    t.ok(diagnostics.recordBytes >= retainedDuringPersistence.observedBytes,
      'record charge covers the raw candidate, normalized authoritative copy, ' +
      'frozen/encoded row, budgets, projection, gateway/readback copies, ' +
      'delivery-key aliases, consumer aliases, and prepaid claim fields');
    t.ok(diagnostics.recordBytes > tx.transactionCreationInitialRowBytes.length);
    coordinator.retireUncertainCreationsForProcessShutdown();
  });

test('an admitted creation reserves enough operation envelope to reenter',
  async (t) => {
    const entered = deferred();
    const release = deferred();
    const measure = new DistributedTransactionCoordinator({
      async persistTransaction() {
        entered.resolve();
        await release.promise;
        throw uncertainError();
      },
    });
    const measuring = measure.begin('exact-reentry');
    await entered.promise;
    const cap = measure.getTransactionCreationDiagnostics().totalBytes;
    release.resolve();
    await measuring;
    measure.retireUncertainCreationsForProcessShutdown();

    let available = false;
    const coordinator = new DistributedTransactionCoordinator({
      maxUncertainTransactionCreationCanonicalBytes: cap,
      async persistTransaction() {
        if (!available) throw uncertainError();
      },
    });
    const first = await coordinator.begin('exact-reentry');
    available = true;
    const retry = await coordinator.begin('exact-reentry');
    t.equal(first.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.equal(retry.success, true);
    t.equal(retry.transactionId, first.transactionId);
  });

test('BEGIN publication and acceptance synchronously enforce its control turn',
  async (t) => {
    for (const sweepFirst of [false, true]) {
      let now = 0;
      const sessionId = sweepFirst ? 'spent-sweep-first' : 'spent-retry-first';
      const coordinator = new DistributedTransactionCoordinator({
        now: () => now, transactionBudgetMs: 1000,
        transactionCreationTurnBudgetMs: 10,
        async persistTransaction() {
          now = 20;
        },
      });
      const {consumer, options} = attachedOptions(
        DISTRIBUTED_BEGIN_CONSUMER_KIND.PGWIRE, sessionId);
      const result = await coordinator.begin(sessionId, options);
      if (sweepFirst) {
        const sweep = await coordinator.runRecoverySweep();
        t.equal(sweep.resolved, 1);
      }
      const retry = await coordinator.begin(sessionId, options);
      t.equal(result.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
      t.equal(coordinator.canAcceptDistributedBegin(consumer,
        distributedBeginAcceptanceOf(result)), false);
      t.equal(retry.transactionId, result.transactionId);
      t.equal(coordinator.acceptDistributedBegin(consumer,
        distributedBeginAcceptanceOf(retry)), true);
    }
  });

test('SQL engine rejects creation limit accessors at the producer boundary',
  async (t) => {
    let getterCalls = 0;
    const options = {autoStartDistributedTransactionRecovery: false};
    Object.defineProperty(options, 'maxUncertainTransactionCreations', {
      get() {
        getterCalls += 1;
        return 1;
      },
    });
    t.throws(() => new SQLQueryEngine(options));
    t.equal(getterCalls, 0);
  });

test('shutdown fences an in-flight census and its older INSERT completion',
  async (t) => {
    const insertEntered = deferred();
    const insertRelease = deferred();
    const censusEntered = deferred();
    const censusRelease = deferred();
    let attempted;
    const coordinator = new DistributedTransactionCoordinator({
      async persistTransaction(record) {
        attempted = {...record.transactionCreationInitialRow};
        insertEntered.resolve();
        await insertRelease.promise;
      },
      async loadRecoveryStateForSweep() {
        censusEntered.resolve();
        return censusRelease.promise;
      },
    });
    const pending = coordinator.begin('shutdown-census');
    await insertEntered.promise;
    const sweep = coordinator.runRecoverySweep();
    await censusEntered.promise;
    coordinator.retireUncertainCreationsForProcessShutdown();
    censusRelease.resolve({transactions: [attempted], participants: [],
      writeOperations: []});
    const sweepResult = await sweep;
    insertRelease.resolve();
    const result = await pending;
    t.equal(sweepResult.skipped, true);
    t.equal(result.errorCode, 'TRANSACTION_CREATION_UNCERTAIN');
    t.equal(coordinator.transactionsBySession.has('shutdown-census'), false);
    t.equal(coordinator.workflowCoordinator.workflowsById.size, 0);
    t.same(coordinator.getTransactionCreationDiagnostics(), {
      attachmentCount: 0, operationCount: 0, recordBytes: 0, recordCount: 0,
      roles: {}, totalBytes: 0});
  });
