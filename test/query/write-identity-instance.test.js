// One entry identity never stands for two logical writes (verifier finding
// B1 on the raft-rs cutover line: a NAME standing in for an INSTANCE), and
// every statement kind carries the typed unknown outcome to its caller (B2).
//
// A named control-plane write is delivered under an identity derived from its
// name, the instance of the logical write it is, and a digest of the exact
// content it carries (src/control-plane/control-plane-write-identity.js):
// - changed content is never answered with another content's outcome;
// - the instance lives for one logical write: once its owner classified it
//   (or deleted its row), the next write of the name is a new instance and
//   executes, even with identical content;
// - a write of a name whose earlier instance is still unknown first resolves
//   that instance under its own entry, then executes; unresolved, it is the
//   typed unknown naming the pending instance - never applied for content
//   that was not written.
//
// Production classes throughout: the real SQLQueryEngine, QueryExecutor,
// distributed write coordinator, control-plane gateway, owners and
// PartitionService on the real rs-raft WASM core; the runtime replacement is
// the runtime owner's setCoreFaultInjector trap.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TABLES} from '../../src/constants/index.js';
import {CONTROL_PLANE_NAMED_WRITE_SCOPE_REQUIRED_CODE} from
  '../../src/control-plane/control-plane-write-identity.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {
  NODE_REGISTRATION_OUTCOME,
  createNodeRegistrationIssueRecord,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {MembershipPublicationRuntimeOwner} from
  '../../src/control-plane/owners/membership-publication-runtime-owner.js';
import {
  ENDPOINT_INCARNATION_OUTCOME,
  writeEndpointAtIncarnation,
} from '../../src/control-plane/owners/endpoint-incarnation-authority.js';
import {deriveEndpointId} from '../../src/runtime/runtime-endpoint-writer.js';
import {wireRuntimeEndpointPublication} from
  '../../src/runtime/runtime-endpoint-publication-wiring.js';
import {runRetryableControlPlaneWrite} from
  '../../src/bootstrap/shared/retryable-control-plane-write.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  OperationType,
  createOperation,
} from '../../src/rebalancer/replica-status.js';
import {
  CASE_SENSITIVE_USER_TABLE,
  COUNTER_TABLE,
  JOINER_ID,
  JOIN_WRITE_OPTIONS,
  NODE_ID,
  SETTLE_BUDGET_MS,
  SURFACE_INSERT,
  USER_TABLE,
  appliedRow,
  authoritativeLeaderReads,
  limitSurfaceWriteAttempt,
  nodeRow,
  rowsOf,
  releaseTrapOnAuthoritativeRead,
  reservationCoordinator,
  selectRows,
  spendFirstAttempt,
  spendOneBudget,
  waitFor,
  withMutedConsoleError,
  withSurface,
} from './unknown-outcome-surface-fixture.js';

const OUTCOME_UNKNOWN =
  PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
const NOT_LEADER = PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER;
const TEST_TIMEOUT_MS = 60000;
const BOOT_INCARNATION = 7;
const RESERVATION_INSERT = `INSERT INTO ${TABLES.STORAGE_RESERVATIONS} ` +
  '(reservation_id, operation_id, entity_type, entity_id, partition_id, ' +
  'target_node_id, estimated_bytes, amplification_factor, status, ' +
  'created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ' +
  '?, ?, ?)';
const RUNTIME_SERVICE_ID = 'svc-uo';
const RUNTIME_REPLICA_ID = `${RUNTIME_SERVICE_ID}-r1`;
const RUNTIME_ENDPOINT_ID = deriveEndpointId(RUNTIME_SERVICE_ID, NODE_ID);
// The counter increment as a read-modify-write CAS: `SET n = n + 1` cannot
// be the witness while the SQL parser turns a SET expression into NULL (a
// separate, recorded parser defect); this form is non-idempotent in effect
// the same way - a second application answers zero rows.
const COUNTER_INCREMENT = `UPDATE ${COUNTER_TABLE} SET n = ? ` +
  'WHERE id = ? AND n = ?';

// A clock whose `stamp()` makes the NEXT Date.now() - the one a write's
// owner stamps its content with - answer one fixed instant, so two writes
// built after it carry identical content; every other reading (budgets,
// waits) stays real.
function pinnedStamps() {
  const pinned = Date.now();
  return {stamp() {
    const now = Date.now;
    Date.now = () => {
      Date.now = now;
      return pinned;
    };
  }};
}

// ---------------------------------------------------------------------------
// B1, the verifier's V3: birth (unknown past the budget, then commits) ->
// the row is deleted -> a second birth of the same name with new content.

test('V3: a second birth of a held name after the row was deleted executes - ' +
  'the row exists with the new content', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.STORAGE_RESERVATIONS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.STORAGE_RESERVATIONS);
    const now = Date.now();
    const birth = (bytes, options = {}) => gateway.executeQuery(RESERVATION_INSERT,
      ['res-op-v3', 'op-v3', 'partition', 'p-1', 'p-1', 'n-1', bytes, 1,
        'active', now, now, now + 1000],
      {...options, writeIdentity: `${TABLES.STORAGE_RESERVATIONS}:res-op-v3:birth`});
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: () => birth(111)});
    assert.equal(first.success, false, 'setup: the first birth is unknown');
    assert.ok(await appliedRow(surface, 'res-op-v3'), 'setup: it commits');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const removed = await gateway.executeQuery(
      `DELETE FROM ${TABLES.STORAGE_RESERVATIONS} WHERE reservation_id = ?`,
      ['res-op-v3'], {});
    assert.equal(removed.success, true, 'setup: the row is deleted');
    const firstEntry = deliveries[0].entryId;
    const rebirthMark = deliveries.length;
    const again = await birth(222, {
      controlPlaneTableName: TABLES.REPLICA_OPERATIONS,
      controlPlaneOperationKind: 'read',
    });
    assert.deepEqual(selectRows(surface.dbPath, 'SELECT reservation_id, ' +
      `estimated_bytes FROM ${TABLES.STORAGE_RESERVATIONS}`),
    [{reservation_id: 'res-op-v3', estimated_bytes: 222}],
    `the second birth executed (${JSON.stringify(again)})`);
    assert.equal(again.success, true, 'and is answered applied');
    assert.equal(again.affectedRows, 1, 'with its own count');
    assert.equal(deliveries[rebirthMark]?.entryId, firstEntry,
      'the statement still resolves its prior exact write despite conflicting hints');
    assert.ok(deliveries.at(-1).entryId !== firstEntry,
      'under its own entry, never the first birth\'s');
  });
});

test('a quoted named SQL write retains its entry until its own participant answers',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([TABLES.NODES, TABLES.STORAGE_RESERVATIONS],
      async ({engine, gateway, deliveries, of}) => {
        const nodes = of(TABLES.NODES);
        const other = of(TABLES.STORAGE_RESERVATIONS);
        const node = {...nodeRow(), boot_incarnation: BOOT_INCARNATION};
        const insert = (table, row) => gateway.insertSystemTableRow(
          table, row, JOIN_WRITE_OPTIONS);
        assert.equal((await insert(TABLES.NODES, node)).success, true);
        const sql = 'UPDATE "global.nodes" SET node_address = ? WHERE node_id = ?';
        const params = ['ws://quoted:2', JOINER_ID];
        const options = {writeIdentity: 'quoted-nodes-update'};
        const execute = engine.executeQuery.bind(engine);
        const keys = [];
        let foreign;
        engine.executeQuery = async (statement, args, executionOptions) => {
          keys.push(executionOptions.idempotencyKey);
          if (keys.length === 1) {
            foreign = await execute(
              'UPDATE storage_reservations SET updated_at = ? WHERE reservation_id = ?',
              [1, 'absent'], executionOptions);
            return foreign;
          }
          return execute(statement, args, executionOptions);
        };
        try {
          const refused = await gateway.querySystemTable(TABLES.NODES, sql, params, options);
          assert.equal(foreign.success, true, 'the other native participant really committed');
          assert.equal(foreign.partitions[0], other.partitionId);
          assert.equal(refused.success, false, 'a foreign committed receipt cannot settle NODES');
          assert.equal(refused.failureCode, OUTCOME_UNKNOWN);
          assert.deepEqual(selectRows(nodes.dbPath, 'SELECT node_address FROM nodes'),
            [{node_address: node.node_address}], 'no NODES effect from the foreign receipt');

          const invalid = await gateway.querySystemTable(
            TABLES.NODES, 'UPDATE "nodes"', [], options);
          assert.equal(invalid.success, false, 'an unavailable SQL subject is refused');
          assert.equal(keys.length, 1, 'invalid SQL never enters execution or spends the held key');

          const confirmed = await gateway.querySystemTable(TABLES.NODES, sql, params, options);
          assert.equal(confirmed.success, true);
          assert.equal(confirmed.affectedRows, 1);
          assert.equal(keys[1], keys[0], 'the proved target resolves the original named write');
          assert.equal(deliveries.at(-1).answer.durableCommitWitness.partitionId,
            nodes.partitionId);
          assert.deepEqual(selectRows(nodes.dbPath, 'SELECT node_address FROM nodes'),
            [{node_address: params[0]}], 'the real quoted target is updated');
        } finally {
          engine.executeQuery = execute;
        }
        const conflict = await gateway.querySystemTable(TABLES.NODES,
          'INSERT INTO "nodes" (node_id, node_address) VALUES ($1, $2) ' +
          'ON CONFLICT (node_id) DO NOTHING', [JOINER_ID, 'ws://unapplied:3'],
          {writeIdentity: 'quoted-nodes-pg-conflict', dialect: PARSER_DIALECT.POSTGRESQL});
        assert.equal(conflict.success, true, 'the supported PostgreSQL conflict form executes');
        assert.equal(conflict.affectedRows, 0);
        assert.deepEqual(selectRows(nodes.dbPath, 'SELECT node_address FROM nodes'),
          [{node_address: params[0]}], 'conflict DO NOTHING preserves the committed target');
      });
  });

test('exact-case user SQL cannot spend the named system write path',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([TABLES.LOGS, CASE_SENSITIVE_USER_TABLE],
      async ({engine, gateway, deliveries, of}) => {
        const system = of(TABLES.LOGS);
        const user = of(CASE_SENSITIVE_USER_TABLE);
        const userSql = 'UPDATE "Logs" SET n = ? WHERE id = ?';
        const options = {writeIdentity: 'catalog-identity-control', tableName: TABLES.LOGS};
        const originalUserValue = 1;
        const entryId = 'case-collision';
        const seed = await engine.executeQuery('INSERT INTO "Logs" (id, n) VALUES (?, ?)',
          [entryId, originalUserValue]);
        assert.equal(seed.success, true, 'the exact-case user table exists and accepts writes');
        const mark = deliveries.length;

        const refusal = await gateway.executeQuery(userSql, [2, entryId], options);
        assert.equal(refusal.success, false, 'the system name cannot authorize a user effect');
        assert.equal(refusal.errorCode, CONTROL_PLANE_NAMED_WRITE_SCOPE_REQUIRED_CODE);
        const conflicting = await gateway.executeQuery(userSql, [2, entryId],
          {...options, idempotencyKey: 'provided-key-does-not-change-the-domain'});
        assert.equal(conflicting.errorCode, CONTROL_PLANE_NAMED_WRITE_SCOPE_REQUIRED_CODE);
        assert.equal(deliveries.length, mark, 'no participant saw the named user statement');
        assert.deepEqual(selectRows(user.dbPath, 'SELECT n FROM "Logs"'), [{n: originalUserValue}]);

        const systemInsert = await gateway.executeQuery(
          'INSERT INTO "global.logs" (log_id, timestamp, level, node_id, message, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?)', [entryId, 1, 'info', NODE_ID, 'new system log', 1], options);
        assert.equal(systemInsert.success, true, 'the same name can bind its real system owner');
        assert.equal(systemInsert.partitions[0], system.partitionId);
        assert.deepEqual(selectRows(system.dbPath, 'SELECT message FROM logs'),
          [{message: 'new system log'}]);

        const structuredMark = deliveries.length;
        await assert.rejects(gateway.updateSystemTableRow(CASE_SENSITIVE_USER_TABLE,
          {log_id: entryId}, {message: 'wrong subject'}, {...options, ...JOIN_WRITE_OPTIONS}),
        /requires a valid system table name/);
        assert.equal(deliveries.length, structuredMark, 'structured ingress cannot fold case');
        assert.deepEqual(selectRows(system.dbPath, 'SELECT message FROM logs'),
          [{message: 'new system log'}]);

        const userUpdate = await engine.executeQuery(userSql, [2, entryId],
          {idempotencyKey: 'user-logs-exact-key'});
        assert.equal(userUpdate.success, true, 'the direct user SQL owner accepts its own key');
        assert.equal(userUpdate.partitions[0], user.partitionId);
        assert.deepEqual(selectRows(user.dbPath, 'SELECT n FROM "Logs"'), [{n: 2}]);
      });
  });

// The reservation birth V3 writes, under its name.
function reservationBirth(gateway, bytes, now) {
  return gateway.executeQuery(RESERVATION_INSERT,
    ['res-op-v3', 'op-v3', 'partition', 'p-1', 'p-1', 'n-1', bytes, 1,
      'active', now, now, now + 1000],
    {writeIdentity: `${TABLES.STORAGE_RESERVATIONS}:res-op-v3:birth`});
}

test('a re-drive refused before it was proposed does not end an instance ' +
  'an earlier attempt left unknown: the next re-drive is that entry',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.STORAGE_RESERVATIONS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.STORAGE_RESERVATIONS);
    const now = Date.now();
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: () => reservationBirth(gateway, 111, now)});
    assert.equal(first.success, false, 'setup: the first birth is unknown');
    assert.ok(await appliedRow(surface, 'res-op-v3'), 'setup: it commits');
    // The re-drive meets only replicas that refuse before proposing.
    const handle = surface.partition.handleRemoteQuery;
    surface.partition.handleRemoteQuery = async () => ({success: false,
      partitionId: surface.partitionId, failureCode: NOT_LEADER,
      error: 'No leader available for write operation'});
    const refusalMark = deliveries.length;
    const restoreLimit = limitSurfaceWriteAttempt(engine);
    let refused;
    try {
      refused = await withMutedConsoleError(() =>
        reservationBirth(gateway, 111, now));
    } finally {
      restoreLimit();
      surface.partition.handleRemoteQuery = handle;
    }
    const refusals = deliveries.slice(refusalMark);
    assert.ok(refusals.length > 0, 'setup: the re-drive reached the participant');
    assert.ok(refusals.every(({answer}) => answer.failureCode === NOT_LEADER &&
      answer.committed !== true), 'the re-drive attempts were refused before proposal');
    assert.equal(refused.success, false, 'the owner did not receive an applied answer');
    assert.equal(refused.failureCode, OUTCOME_UNKNOWN,
      'a new refusal leaves the original possibility of effect unresolved');
    assert.equal(refused.pendingInstance?.entryId, deliveries[0].entryId,
      'the retained obligation is the original entry');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const again = await reservationBirth(gateway, 111, now);
    assert.equal(again.success, true, 'answered applied ' +
      `(${JSON.stringify(again.error ?? null)})`);
    assert.equal(again.affectedRows, 1, 'with the first entry\'s result');
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'every delivery is the first entry');
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.STORAGE_RESERVATIONS,
      'reservation_id'), ['res-op-v3'], 'one row');
  });
});

test('a write of a name whose pending instance stays unknown is the typed ' +
  'unknown naming that instance - nothing of the new content is delivered',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.STORAGE_RESERVATIONS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.STORAGE_RESERVATIONS);
    const now = Date.now();
    const {first: answers} = await spendFirstAttempt({engine, surface,
      attempt: async () => {
        const first = await reservationBirth(gateway, 111, now);
        const mark = deliveries.length;
        const second = await reservationBirth(gateway, 222, now);
        return {first, second, mark};
      }});
    const firstEntry = deliveries[0].entryId;
    assert.equal(answers.first.success, false, 'setup: the first is unknown');
    const {second} = answers;
    assert.equal(second.success, false, 'never applied');
    assert.equal(second.failureCode, OUTCOME_UNKNOWN, 'the typed unknown');
    assert.equal(second.pendingInstance?.outcome, 'unknown',
      `naming the pending instance (${JSON.stringify(second.pendingInstance)})`);
    assert.equal(second.pendingInstance.writeIdentity,
      `${TABLES.STORAGE_RESERVATIONS}:res-op-v3:birth`, 'by its name');
    assert.equal(second.entryId, firstEntry, 'and its entry');
    assert.ok(deliveries.slice(answers.mark).length > 0 &&
      deliveries.slice(answers.mark).every((d) => d.entryId === firstEntry),
    'only the pending entry was delivered');
    assert.ok(await appliedRow(surface, 'res-op-v3'),
      'the pending birth commits once the trap is gone');
    assert.deepEqual(selectRows(surface.dbPath, 'SELECT estimated_bytes ' +
      `FROM ${TABLES.STORAGE_RESERVATIONS}`), [{estimated_bytes: 111}],
    'with its own content');
  });
});

// ---------------------------------------------------------------------------
// B1, the production endpoint shape through the runtime endpoint owner: a
// birth unknown past its budget is resolved by the owner's readback; the
// replica stops and its endpoint row is deleted; the replica restarts on the
// same node in the same boot.

async function withRuntimeEndpointOwner({engine, gateway, surface,
  mutationContext}, body) {
  authoritativeLeaderReads(gateway, surface);
  const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: gateway,
    controlPlaneWriteRetryTimeoutMs: 0});
  const lifecycle = {};
  wireRuntimeEndpointPublication({
    bootIncarnation: BOOT_INCARNATION,
    nodeId: NODE_ID,
    serviceEndpointsOwner: owner.serviceEndpointsOwner,
    serviceRuntimeLifecycle: {
      setEndpointWriter: (writer) => {
        lifecycle.write = writer;
      },
      setEndpointRemover: (remover) => {
        lifecycle.remove = remover;
      },
    },
    systemTableCache: {getAll: (type) => (type ===
      TABLES.SERVICE_DEFINITIONS ? [{service_id: RUNTIME_SERVICE_ID}] : [])},
  });
  // The lifecycle reports ENDPOINT_REGISTERED exactly when its endpoint
  // writer settles without throwing and the write completed.
  const register = (port) => withMutedConsoleError(async () => {
    try {
      const result = await lifecycle.write(RUNTIME_REPLICA_ID, 'wasm',
        {port, protocol: 'websocket'}, mutationContext);
      return {registered: result?.success !== false, result};
    } catch (error) {
      return {registered: false, error};
    }
  });
  await body({engine, register, remove: () => withMutedConsoleError(() =>
    lifecycle.remove(RUNTIME_REPLICA_ID, NODE_ID, mutationContext))});
}

// Both write paths: the CDC routed path (the runtime writer's), and the SQL
// path (the join scope's).
for (const [label, pinClock, cdc] of [
  ['CDC path, new timestamps', false, true],
  ['CDC path, identical content', true, true],
  ['SQL path, new timestamps', false, false],
  ['SQL path, identical content', true, false],
]) {
  test(`endpoint shape (${label}): an unknown birth resolved by readback, ` +
    'its row deleted, the replica born again on the same node in the same ' +
    'boot - the row exists and ENDPOINT_REGISTERED is true',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([TABLES.SERVICE_ENDPOINTS], async ({engine, gateway,
      of}) => {
      const surface = of(TABLES.SERVICE_ENDPOINTS);
      const clock = pinnedStamps();
      const stamp = () => (pinClock ? clock.stamp() : undefined);
      await withRuntimeEndpointOwner({engine, gateway, surface,
        mutationContext: cdc ? {} : {...JOIN_WRITE_OPTIONS}},
      async ({register, remove}) => {
        stamp();
        const {first} = await spendFirstAttempt({engine, surface,
          attempt: () => register(9001)});
        assert.equal(first.registered, true, 'setup: the unknown birth ' +
            `is resolved by the owner's readback (${first.error?.message})`);
        engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
        const removed = await remove();
        assert.notEqual(removed?.success, false,
          `setup: the stopped replica's row is deleted (${removed?.outcome})`);
        assert.deepEqual(rowsOf(surface.dbPath, TABLES.SERVICE_ENDPOINTS,
          'endpoint_id'), [], 'setup: no endpoint row');
        stamp();
        const reborn = await register(9001);
        assert.equal(reborn.registered, true, 'ENDPOINT_REGISTERED ' +
            `(${reborn.error?.message ?? reborn.result?.outcome})`);
        assert.deepEqual(rowsOf(surface.dbPath, TABLES.SERVICE_ENDPOINTS,
          'endpoint_id'), [RUNTIME_ENDPOINT_ID], 'and the row exists');
      });
    }, {cdc});
  });
}

test('endpoint shape (birth left unresolved): a birth its owner could not ' +
  'read back, its row then deleted by the stopped replica, born again with ' +
  'identical content - the row exists', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.SERVICE_ENDPOINTS], async ({engine, gateway,
    of}) => {
    const surface = of(TABLES.SERVICE_ENDPOINTS);
    const clock = pinnedStamps();
    await withRuntimeEndpointOwner({engine, gateway, surface,
      mutationContext: {...JOIN_WRITE_OPTIONS}},
    async ({register, remove}) => {
      const readable = gateway.readAuthoritativeRows;
      gateway.readAuthoritativeRows = async () => ({success: false,
        error: 'authority unavailable'});
      clock.stamp();
      const {first} = await spendFirstAttempt({engine, surface,
        attempt: () => register(9001)});
      assert.equal(first.registered, false, 'setup: the birth stays ' +
        `unresolved (${first.result?.outcome ?? first.error?.message})`);
      assert.ok(await appliedRow(surface, RUNTIME_ENDPOINT_ID),
        'setup: it commits');
      gateway.readAuthoritativeRows = readable;
      engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
      const removed = await remove();
      assert.notEqual(removed?.success, false, 'setup: the row is deleted');
      assert.deepEqual(rowsOf(surface.dbPath, TABLES.SERVICE_ENDPOINTS,
        'endpoint_id'), [], 'setup: no endpoint row');
      clock.stamp();
      const reborn = await register(9001);
      assert.equal(reborn.registered, true, 'ENDPOINT_REGISTERED ' +
        `(${reborn.error?.message ?? reborn.result?.outcome})`);
      assert.deepEqual(rowsOf(surface.dbPath, TABLES.SERVICE_ENDPOINTS,
        'endpoint_id'), [RUNTIME_ENDPOINT_ID], 'and the row exists');
    });
  });
});

// ---------------------------------------------------------------------------
// B1, changed content: a same-incarnation refresh with a new port while the
// previous refresh's outcome is unknown.

test('endpoint refresh: a new port while the previous refresh is unknown ' +
  'ends with the NEW port, or a typed unknown - never applied with the old ' +
  'port', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.SERVICE_ENDPOINTS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.SERVICE_ENDPOINTS);
    authoritativeLeaderReads(gateway, surface);
    const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneWriteRetryTimeoutMs: 0});
    const endpoints = owner.serviceEndpointsOwner;
    const now = Date.now();
    const rowAt = (port) => ({endpoint_id: RUNTIME_ENDPOINT_ID,
      service_id: RUNTIME_SERVICE_ID, node_id: NODE_ID,
      protocol: 'websocket', address: NODE_ID, port,
      health_status: 'healthy', metadata: '{}', created_at: now,
      updated_at: now});
    // The heartbeat-shaped writer: it observes the row it last wrote.
    let lastWritten = null;
    const refresh = (port) => withMutedConsoleError(() =>
      writeEndpointAtIncarnation({row: rowAt(port),
        bootIncarnation: BOOT_INCARNATION,
        observe: async () => ({available: true, row: lastWritten}),
        readback: async () => ({available: false, row: null}),
        insert: (row, identity) => endpoints.insertEndpoint(row,
          {...JOIN_WRITE_OPTIONS, ...identity}),
        update: (where, data, identity) => endpoints.updateWhere(where,
          data, {...JOIN_WRITE_OPTIONS, ...identity}),
      }));
    const born = await refresh(1);
    assert.equal(born.outcome, ENDPOINT_INCARNATION_OUTCOME.APPLIED,
      'setup: born with port 1');
    lastWritten = {...rowAt(1), boot_incarnation: BOOT_INCARNATION};
    const {first: second} = await spendFirstAttempt({engine, surface,
      attempt: () => refresh(2)});
    assert.notEqual(second.outcome, ENDPOINT_INCARNATION_OUTCOME.APPLIED,
      `setup: the port-2 refresh is not confirmed (${second.outcome})`);
    assert.equal(await waitFor(() => {
      surface.partition.raft.readStatus();
      return selectRows(surface.dbPath, 'SELECT port FROM ' +
        `${TABLES.SERVICE_ENDPOINTS}`)[0]?.port === 2;
    }), true, 'setup: the port-2 refresh commits later');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const mark = deliveries.length;
    const third = await refresh(3);
    const port = selectRows(surface.dbPath,
      `SELECT port FROM ${TABLES.SERVICE_ENDPOINTS}`)[0]?.port;
    if (third.outcome === ENDPOINT_INCARNATION_OUTCOME.APPLIED) {
      assert.equal(port, 3, 'answered applied: the row has the NEW port ' +
        `(port ${port}; ${JSON.stringify(deliveries.slice(mark).map((d) =>
          ({entryId: d.entryId, settledReplay: d.answer?.settledReplay})))})`);
    } else {
      assert.equal(third.error?.failureCode ??
        third.result?.failureCode, OUTCOME_UNKNOWN,
      `otherwise the typed unknown (${third.outcome})`);
    }
  });
});

// ---------------------------------------------------------------------------
// B1, the reservation owner: a re-ensure after the reservation was released.

for (const [label, pinClock] of [['new timestamps', false],
  ['identical content', true]]) {
  test(`reservation (${label}): a birth ensured again after the reservation ` +
    'was released is answered truthfully - never "created" over a released ' +
    'row', {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([TABLES.REPLICA_OPERATIONS,
      TABLES.STORAGE_RESERVATIONS], async ({engine, gateway, messageRouter,
      cdcIntegrationService, deliveries, of}) => {
      const surface = of(TABLES.STORAGE_RESERVATIONS);
      const coordinator = reservationCoordinator({engine, gateway,
        messageRouter, cdcIntegrationService});
      const operation = Object.assign(createOperation({operationId: 'op-rel',
        type: OperationType.ADD, partitionId: 'p-rel', sourceNodeId: NODE_ID,
        targetNodeId: 'n-rel'}),
      {entityType: 'partition', entityId: 'p-rel'});
      await coordinator.persistNewOperation(operation);
      const authorityReads = releaseTrapOnAuthoritativeRead(gateway);
      if (pinClock) {
        const pinnedNow = Date.now();
        coordinator.nowFn = () => pinnedNow;
      }
      {
        const birthMark = deliveries.length;
        const {first} = await spendFirstAttempt({engine, surface,
          attempt: () => coordinator.createReservationForOperation(
            operation)});
        assert.notEqual(first.outcome, 'created',
          'setup: the first birth is not confirmed');
        assert.ok(await appliedRow(surface, 'res-op-rel'),
          'setup: it commits');
        engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
        const releaseMark = deliveries.length;
        const released = await coordinator.transitionActiveReservationById(
          'res-op-rel', 'released', Date.now());
        const releaseReceipts = deliveries.slice(releaseMark).filter(({table}) =>
          table === TABLES.STORAGE_RESERVATIONS).map(({entryId, answer}) => ({
          entryId,
          failureCode: answer?.failureCode,
          witness: answer?.durableCommitWitness,
          settledReplay: answer?.settledReplay,
        }));
        const [terminal] = selectRows(surface.dbPath, 'SELECT status FROM ' +
          TABLES.STORAGE_RESERVATIONS);
        assert.equal(terminal?.status, 'released', 'setup: the release committed');
        assert.ok(releaseReceipts.some(({entryId, witness}) =>
          witness?.entryId === entryId && witness.partitionId === surface.partitionId),
        `setup: native owner issued the bound release receipt (${JSON.stringify(releaseReceipts)})`);
        assert.equal(released.changed, true,
          `setup: owner acknowledges the release (${JSON.stringify(released)})`);
        authorityReads.length = 0;
        const reensureMark = deliveries.length;
        const again = await coordinator.createReservationForOperation(
          operation);
        const firstBirth = deliveries[birthMark];
        const nextBirth = deliveries.slice(reensureMark).find(({table, sql}) =>
          table === TABLES.STORAGE_RESERVATIONS && /^\s*INSERT\b/iu.test(sql));
        assert.ok(nextBirth, `the release permits its next attempt (${JSON.stringify(again)})`);
        assert.notEqual(nextBirth.entryId, firstBirth.entryId, 'the released birth ends its key');
        assert.equal(nextBirth.answer.changes, 0,
          `the native insert saw the terminal row (${JSON.stringify(nextBirth.answer)})`);
        const [row] = selectRows(surface.dbPath, 'SELECT status FROM ' +
          TABLES.STORAGE_RESERVATIONS);
        assert.equal(row.status, 'released', 'setup: the row stays released');
        assert.notEqual(again.outcome, 'created', 'never "created" while ' +
          `the reservation is released (${JSON.stringify(again)})`);
        assert.equal(authorityReads.some((read) =>
          read.tableName === TABLES.REPLICA_OPERATIONS &&
          read.options?.authoritativeReadMode ===
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED &&
          read.result?.success === true), true,
        'the released-row answer consumes the strict durable operation owner ' +
          `(${JSON.stringify({again, reads: authorityReads.map(({tableName, result}) =>
            [tableName, result?.success, result?.error])})})`);
      }
      await coordinator.shutdown();
    }, {cdc: true});
  });
}

// ---------------------------------------------------------------------------
// The R6-B joiner registration (the verifier's V1): the real registration
// owner, its unknown outlasting the budget, re-driven by the join with a row
// built again (new timestamps), and no authoritative read.

test('V1: the joiner registration re-driven after an unknown that outlasts ' +
  'the budget is ACCEPTED with one row', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.NODES], async ({engine, gateway, deliveries,
    of}) => {
    const surface = of(TABLES.NODES);
    const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneWriteRetryTimeoutMs: 0});
    // The first attempt and its re-drive are one boot lifecycle.
    const issueRecord = createNodeRegistrationIssueRecord();
    const register = () => withMutedConsoleError(() =>
      owner.registerJoinNodeAtIncarnation(nodeRow(), BOOT_INCARNATION,
        issueRecord, {...JOIN_WRITE_OPTIONS, nowMs: Date.now()}));
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: register});
    assert.equal(first.outcome, NODE_REGISTRATION_OUTCOME.UNRESOLVED,
      'setup: unresolved (unknown, no authoritative read)');
    assert.ok(await appliedRow(surface, JOINER_ID), 'setup: it commits');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const redrive = await register();
    assert.equal(redrive.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
      `the re-drive is ACCEPTED (${redrive.error?.message ?? ''}; ` +
      `${JSON.stringify(deliveries.slice(-3).map((d) => d.answer?.error))})`);
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.NODES, 'node_id'),
      [JOINER_ID], 'one row');
  });
});

// ---------------------------------------------------------------------------
// B2: UPDATE and DELETE carry the typed unknown outcome to the engine result
// exactly as INSERT does (the verifier's V6).

for (const [label, sql, params] of [
  ['UPDATE', `UPDATE ${USER_TABLE} SET value = ? WHERE node_id = ?`,
    ['u', 'row-0']],
  ['DELETE', `DELETE FROM ${USER_TABLE} WHERE node_id = ?`, ['row-0']],
  ['INSERT', SURFACE_INSERT, ['row-ins', 'v']],
]) {
  test(`V6 ${label}: the engine result carries the typed unknown, its ` +
    'entryId and the spent wait', {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([USER_TABLE], async ({engine, deliveries, of}) => {
      const surface = of(USER_TABLE);
      await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']);
      deliveries.length = 0;
      const {first} = await spendFirstAttempt({engine, surface,
        attempt: () => engine.executeQuery(sql, params,
          {idempotencyKey: `v6-${label}`})});
      const entryId = deliveries[0]?.entryId;
      assert.equal(typeof entryId, 'string', 'setup: delivered');
      assert.equal(first.success, false, 'setup: not answered applied');
      for (const [hop, answer] of [
        ['participantFailures[0]', first.participantFailures?.[0]],
        ['firstFailedParticipant', first.firstFailedParticipant],
      ]) {
        assert.equal(answer?.failureCode, OUTCOME_UNKNOWN,
          `${hop}: typed code (${JSON.stringify(answer)})`);
        assert.equal(answer?.entryId, entryId, `${hop}: its entryId`);
        assert.equal(answer?.spentWait?.entryId, entryId,
          `${hop}: the spent wait`);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// B2: a non-idempotent user UPDATE with the caller's explicit key, across a
// forced runtime replacement, applies exactly once and is answered with its
// original count; a cas-from UPDATE keeps one entry across the retry loop.

test('a user counter UPDATE under its explicit write key across a runtime ' +
  'replacement applies exactly once, answered with its original count',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([COUNTER_TABLE], async ({engine, deliveries,
    of}) => {
    const surface = of(COUNTER_TABLE);
    await engine.executeQuery(`INSERT INTO ${COUNTER_TABLE} (id, n) ` +
      'VALUES (?, ?)', ['c', 0]);
    deliveries.length = 0;
    const {result, trap} = await spendOneBudget({engine, surface,
      attempt: () => runRetryableControlPlaneWrite((identity) =>
        engine.executeQuery(COUNTER_INCREMENT, [1, 'c', 0],
          {...identity}),
      {idempotencyKey: 'user-counter-exact-key', timeoutMs: SETTLE_BUDGET_MS, baseDelayMs: 20})});
    assert.ok(trap.count >= 1, 'setup: the core trapped the UPDATE');
    assert.equal(result?.success, true,
      `the helper ends applied (${JSON.stringify(result?.error ?? null)})`);
    assert.equal(result.affectedRows, 1, 'with its original count');
    assert.equal(await waitFor(() => {
      surface.partition.raft.readStatus();
      return selectRows(surface.dbPath,
        `SELECT n FROM ${COUNTER_TABLE}`)[0].n >= 1;
    }), true, 'setup: applied');
    assert.deepEqual(selectRows(surface.dbPath,
      `SELECT n FROM ${COUNTER_TABLE}`), [{n: 1}], 'applied exactly once');
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'every attempt of the loop one entry');
  });
});

test('a cas-from endpoint UPDATE keeps one entryId across its owner\'s ' +
  'retry loop while its first attempt is unknown', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.NODE_ENDPOINTS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.NODE_ENDPOINTS);
    const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneWriteRetryTimeoutMs: SETTLE_BUDGET_MS});
    const now = Date.now();
    const row = {endpoint_id: 'ep-cas', node_id: JOINER_ID,
      transport_type: 'websocket', address: 'ws://h:1', priority: 0,
      metadata: '{}', status: 'active', boot_incarnation: BOOT_INCARNATION,
      created_at: now, updated_at: now};
    await owner.nodeEndpointsOwner.insertEndpoint(row, {...JOIN_WRITE_OPTIONS});
    deliveries.length = 0;
    const {result: outcome, trap} = await spendOneBudget({engine, surface,
      attempt: () => writeEndpointAtIncarnation({
        row: {...row, address: 'ws://h:2'}, bootIncarnation: BOOT_INCARNATION,
        observe: async () => ({available: true, row}),
        readback: async () => ({available: false, row: null}),
        insert: (r, identity) => owner.nodeEndpointsOwner.insertEndpoint(r,
          {...JOIN_WRITE_OPTIONS, ...identity}),
        update: (where, data, identity) => owner.nodeEndpointsOwner
          .updateWhere(where, data, {...JOIN_WRITE_OPTIONS, ...identity}),
      })});
    assert.ok(trap.count >= 1, 'setup: the core trapped the CAS');
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      `one entryId across the loop (${deliveries.length} deliveries)`);
    assert.equal(outcome.outcome, ENDPOINT_INCARNATION_OUTCOME.APPLIED,
      'answered applied by its own entry');
    assert.deepEqual(selectRows(surface.dbPath,
      `SELECT address FROM ${TABLES.NODE_ENDPOINTS}`),
    [{address: 'ws://h:2'}], 'the CAS applied once');
  });
});
