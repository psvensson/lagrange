/**
 * Guard for the production call-cell invocation assembly
 * (src/bootstrap/shared/call-cell-invocation-setup.js): the attachment
 * composes a live CallCellInvoker from the engine + cache + router
 * providers and assigns it to the lifecycle command owner; every absent
 * dependency leaves the owner untouched (the typed DEPENDENCY_REQUIRED
 * refusal stays); an already-attached invoker is never overwritten; and
 * the reduce coordinator's SQL rides the engine's internal path against
 * the registered coordination system tables.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  attachCallCellInvoker,
  CALL_CELL_COORDINATION_SESSION,
} from '../../src/bootstrap/shared/call-cell-invocation-setup.js';
import {TABLES} from '../../src/constants/index.js';
import {SYSTEM_TABLE_SCHEMAS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {getSystemTableCdcPolicy} from
  '../../src/cache/cdc-table-policy.js';

function makeEngineStub(executed) {
  return {
    executeQuery: async (sql, params, options) => {
      executed.push({sql, options});
      return {success: true, rows: []};
    },
    getTablePartitions: () => [],
    parse: () => ({type: 'SELECT', from: {name: 'fixture'}}),
    partitionResolver: {resolvePartitions: () => []},
    queryExecutor: {
      buildSelectSQL: () => 'SELECT 1',
      executeOnPartitions: async () => [],
    },
  };
}

function makeAttachment(overrides = {}) {
  const executed = [];
  const owner = overrides.owner ?? {};
  const invoker = attachCallCellInvoker({
    serviceLifecycleCommandOwner: owner,
    sqlQueryEngine: makeEngineStub(executed),
    systemTableCacheProvider: () => ({get: () => null, getAll: () => []}),
    messageRouterProvider: () => ({deliver: async () => ({success: true})}),
    ...overrides.options,
  });
  return {executed, invoker, owner};
}

test('the attachment composes a live invoker onto the command owner',
  async (t) => {
    const {executed, invoker, owner} = makeAttachment();
    t.ok(invoker, 'an invoker is attached');
    t.equal(owner.callCellInvoker, invoker,
      'the owner dependency is satisfied in place');
    t.equal(typeof invoker.invoke, 'function');
    // Drive one coordinator write through the composed executeInternal to
    // prove the engine internal path and the registered system tables are
    // the backing store.
    await owner.callCellInvoker._reduceCoordinator.seedInvocation(
      'call-invocation-setup-guard', [1]);
    t.ok(executed.length >= 2,
      'seeding issued SQL through the engine internal path');
    t.ok(
      executed.every((entry) =>
        entry.options?.sessionId === CALL_CELL_COORDINATION_SESSION),
      'coordination SQL rides the dedicated session without ' +
        'issuingServiceId attribution',
    );
    t.ok(
      executed.some((entry) =>
        entry.sql.includes(TABLES.CALL_CELL_REDUCE_SLOTS)) &&
      executed.some((entry) =>
        entry.sql.includes(TABLES.CALL_CELL_REDUCE_RESULTS)),
      'the registered coordination system tables back the coordinator',
    );
    t.end();
  });

test('an already-attached invoker is never overwritten', (t) => {
  const existing = {invoke: async () => '"kept"'};
  const {invoker, owner} = makeAttachment({
    owner: {callCellInvoker: existing},
  });
  t.equal(invoker, existing);
  t.equal(owner.callCellInvoker, existing);
  t.end();
});

test('absent dependencies leave the owner fail-closed', (t) => {
  for (const missing of [
    'serviceLifecycleCommandOwner',
    'sqlQueryEngine',
    'systemTableCacheProvider',
    'messageRouterProvider',
  ]) {
    const owner = {};
    const executed = [];
    const invoker = attachCallCellInvoker({
      serviceLifecycleCommandOwner: owner,
      sqlQueryEngine: makeEngineStub(executed),
      systemTableCacheProvider: () => null,
      messageRouterProvider: () => null,
      [missing]: undefined,
    });
    if (missing === 'serviceLifecycleCommandOwner') {
      t.equal(invoker, null, `${missing} absent refuses attachment`);
      continue;
    }
    t.equal(invoker, null, `${missing} absent refuses attachment`);
    t.equal(owner.callCellInvoker, undefined,
      `${missing} absent leaves the owner untouched`);
  }
  t.end();
});

test('the coordination system tables are registered for bootstrap DDL ' +
  'and CDC-policied as control-no-propagation', (t) => {
  for (const tableName of [
    TABLES.CALL_CELL_REDUCE_SLOTS,
    TABLES.CALL_CELL_REDUCE_RESULTS,
  ]) {
    const schema = SYSTEM_TABLE_SCHEMAS.find(
      (entry) => entry.tableName === tableName);
    t.ok(schema, `${tableName} is in SYSTEM_TABLE_SCHEMAS`);
    const policy = getSystemTableCdcPolicy(tableName);
    t.equal(policy?.internalCachePropagation, false,
      `${tableName} does not propagate into the internal cache`);
    t.equal(policy?.externalCdcAllowed, false,
      `${tableName} never leaves through external CDC`);
  }
  t.end();
});

test('the SQL-runtime handoff boundary attaches the invoker on both the ' +
  'seed and join composition path', async (t) => {
  const {attachSqlRuntimeToStartupOwner} = await import(
    '../../src/bootstrap/shared/startup-sql-runtime-handoff.js');
  const executed = [];
  const commandOwner = {
    catalogOwner: {
      getGateway: () => ({setSqlQueryEngine() {}}),
    },
  };
  const owner = {
    serviceLifecycleCommandOwner: commandOwner,
  };
  const sqlQueryEngine = makeEngineStub(executed);
  attachSqlRuntimeToStartupOwner({
    messageRouter: {deliver: async () => ({success: true})},
    owner,
    sqlQueryEngine,
    systemTableCache: {get: () => null, getAll: () => []},
  });
  t.equal(typeof commandOwner.callCellInvoker?.invoke, 'function',
    'the handoff composed and attached the call-cell invoker, so a ' +
      'production CALL BINDING no longer fails closed DEPENDENCY_REQUIRED');
  t.equal(sqlQueryEngine.serviceLifecycleCommandOwner, commandOwner,
    'the same boundary still binds the owner to the engine');
  t.end();
});
