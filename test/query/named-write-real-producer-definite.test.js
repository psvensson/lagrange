// Definite outcomes of named control-plane writes on the REAL producers
// (line-regression-causes stage 3, items 2 and 3): a lone rs-raft leader
// PartitionService, the real SQLQueryEngine, QueryExecutor, distributed write
// coordinator, CDC integration service and control-plane gateway.
//
// Item 2: a statement that matches no row is answered by its partition (one
// participant, with its receipt): a proven zero. Only an empty write plan
// answers with no participant at all - no partition evaluated the statement -
// and that answer proves nothing of the named entry: never APPLIED.
// Item 3: a constraint violation and a refusal before proposal are DEFINITE
// (FAILED / NOT_PROPOSED) on every production path - the SQL gateway, CDC
// routed through the engine and CDC on the local leader - never UNKNOWN, so
// an owner does not re-send a definite failure until its retry bound.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {NAMED_WRITE_ATTEMPT, judgeNamedWriteOutcome} from
  '../../src/control-plane/control-plane-named-write-outcome.js';
import {isControlPlaneWriteDefinitivelyUnappliedError} from
  '../../src/control-plane/control-plane-write-identity.js';
import {SystemMetadataOwnerBase} from
  '../../src/control-plane/owners/system-metadata-owner-base.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  NODE_ID,
  limitSurfaceWriteAttempt,
  selectRows,
  withMutedConsoleError,
  withSurface,
} from './unknown-outcome-surface-fixture.js';

const TABLE = TABLES.STORAGE_RESERVATIONS;
const PARTITION = INITIAL_PARTITION_IDS[TABLE];
const TIMEOUT_MS = 180000;
const OWNER_RETRY_BOUND_MS = 3000;
const {APPLIED, FAILED, NOT_PROPOSED, UNKNOWN} = NAMED_WRITE_ATTEMPT;
const COLUMNS = ['reservation_id', 'operation_id', 'entity_type', 'entity_id', 'partition_id',
  'target_node_id', 'estimated_bytes', 'amplification_factor', 'status', 'created_at',
  'updated_at', 'expires_at'];
const INSERT = `INSERT INTO ${TABLE} (${COLUMNS.join(', ')}) VALUES ` +
  `(${COLUMNS.map(() => '?').join(', ')})`;
const UPDATE_NO_MATCH = `UPDATE ${TABLE} SET status = ? WHERE reservation_id = ?`;
const DELETE_NO_MATCH = `DELETE FROM ${TABLE} WHERE reservation_id = ?`;
const ABSENT_ID = 'definite-absent-row';

function reservation(id, status = 'active') {
  const now = Date.now();
  return {reservation_id: id, operation_id: `op-${id}`, entity_type: 'partition',
    entity_id: 'p-1', partition_id: 'p-1', target_node_id: 'n-1', estimated_bytes: 1,
    amplification_factor: 1, status, created_at: now, updated_at: now, expires_at: now + 60000};
}

function rowCount(surface, id) {
  return selectRows(surface.dbPath, `SELECT COUNT(*) AS n FROM ${TABLE} WHERE reservation_id = ?`,
    [id])[0].n;
}

// Records every keyed call of `method` (the named write's attempt on its
// route; unkeyed internal reads are not attempts): the key it was delivered
// under and what it answered or threw.
function captureAttempts(target, method) {
  const original = target[method];
  const records = [];
  target[method] = async (...args) => {
    const options = args.at(-1) ?? {};
    const record = {key: options?.idempotencyKey ?? null, answer: null, thrown: null};
    if (record.key !== null) records.push(record);
    try {
      record.answer = await original.apply(target, args);
      return record.answer;
    } catch (error) {
      record.thrown = error;
      throw error;
    }
  };
  return {records, restore: () => {
    target[method] = original;
  }};
}

function verdictsOf(records) {
  return records.map((record) => {
    try {
      return judgeNamedWriteOutcome(record.answer ?? record.thrown,
        {key: record.key, partitionId: PARTITION});
    } catch (error) {
      return `THROWS ${error?.name}: ${error?.message}`;
    }
  });
}

async function settle(promise) {
  try {
    return {answer: await promise, thrown: null};
  } catch (thrown) {
    return {answer: null, thrown};
  }
}

function describe(answer) {
  return JSON.stringify({success: answer?.success, error: answer?.error ?? answer?.message,
    failureCode: answer?.failureCode, code: answer?.code, outcome: answer?.outcome,
    partitionId: answer?.partitionId,
    participants: answer?.participantFailures?.map((entry) => ({partitionId: entry?.partitionId,
      failureCode: entry?.failureCode, committed: entry?.committed, outcome: entry?.outcome}))});
}

function localLeaderGateway({engine, messageRouter, of}) {
  const surface = of(TABLE);
  const cdc = new CDCIntegrationService({nodeId: NODE_ID, sqlQueryEngine: engine,
    partitionServicesProvider: new Map([[surface.partitionId, surface.partition]])});
  cdc.initialize();
  const gateway = createControlPlaneRuntimeBundle({nodeId: NODE_ID, sqlQueryEngine: engine,
    messageRouter, cdcIntegrationService: cdc}).controlPlaneSystemTableGateway;
  return {cdc, gateway};
}

class WitnessReservationOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = 'definite-witness-owner';
  static TABLE_NAME = TABLE;
}

// The three production routes of a named write: how its attempt is issued
// and where the named-write layer receives the attempt's answer.
const PATHS = Object.freeze({
  'SQL gateway': {cdc: false, route: (context) => ({gateway: context.gateway,
    attemptOwner: context.engine, attemptMethod: 'executeQuery',
    insert: (row, name) => context.gateway.executeQuery(INSERT, Object.values(row),
      {writeIdentity: name})})},
  'CDC through the engine': {cdc: true, route: (context) => ({gateway: context.gateway,
    cdc: context.cdcIntegrationService, attemptOwner: context.cdcIntegrationService,
    attemptMethod: 'insertSystemTableRow',
    insert: (row, name) => context.gateway.insertSystemTableRow(TABLE, row,
      {writeIdentity: name})})},
  'CDC on the local leader': {cdc: false, route: (context) => {
    const {cdc, gateway} = localLeaderGateway(context);
    return {gateway, cdc, attemptOwner: cdc, attemptMethod: 'insertSystemTableRow',
      insert: (row, name) => gateway.insertSystemTableRow(TABLE, row, {writeIdentity: name}),
      close: () => cdc.shutdown?.()};
  }},
});

test('item 2: a statement matching no row is a proven zero; only an empty plan has no ' +
  'participant, and it is not APPLIED', {timeout: TIMEOUT_MS}, async () => {
  await withSurface([TABLE], async ({engine, gateway, of}) => {
    const observed = [];
    for (const [label, sql, params] of [
      ['UPDATE matching no row', UPDATE_NO_MATCH, ['released', ABSENT_ID]],
      ['DELETE matching no row', DELETE_NO_MATCH, [ABSENT_ID]],
    ]) {
      const capture = captureAttempts(engine, 'executeQuery');
      const caller = await settle(gateway.executeQuery(sql, params,
        {writeIdentity: `definite:no-match:${label}`}));
      capture.restore();
      const answer = capture.records[0]?.answer;
      observed.push({label, participants: answer?.participantResults?.map((entry) =>
        ({partitionId: entry.partitionId, affectedRows: entry.affectedRows,
          witnessed: entry.durableCommitWitness?.partitionId === PARTITION})),
      verdicts: verdictsOf(capture.records), callerSuccess: caller.answer?.success ?? null,
      callerRows: caller.answer?.affectedRows ?? null});
    }
    // The coordinator's one producer of a participant-less answer: a plan
    // with no partition (the engine refuses such a plan before the
    // coordinator: resolveWriteExecutionPlanWithAuthorityRefresh).
    const key = 'cpw-definite-empty-plan';
    const plan = engine.distributedWriteCoordinator.createWritePlan(
      engine.parse(UPDATE_NO_MATCH), ['released', ABSENT_ID],
      {partitionIds: [], idempotencyKey: key});
    const empty = await engine.distributedWriteCoordinator.executePlan(plan,
      ['released', ABSENT_ID], {});
    observed.push({label: 'empty plan', participants: empty.participantResults,
      verdicts: verdictsOf([{key, answer: empty}]), callerSuccess: empty.success,
      callerRows: empty.affectedRows});
    assert.equal(rowCount(of(TABLE), ABSENT_ID), 0);
    assert.deepEqual(observed, [
      {label: 'UPDATE matching no row', participants: [{partitionId: PARTITION, affectedRows: 0,
        witnessed: true}], verdicts: [APPLIED], callerSuccess: true, callerRows: 0},
      {label: 'DELETE matching no row', participants: [{partitionId: PARTITION, affectedRows: 0,
        witnessed: true}], verdicts: [APPLIED], callerSuccess: true, callerRows: 0},
      {label: 'empty plan', participants: [], verdicts: [UNKNOWN], callerSuccess: true,
        callerRows: 0},
    ]);
  });
});

for (const [label, path] of Object.entries(PATHS)) {
  test(`item 3: a constraint violation is FAILED (definite) - ${label}`, {timeout: TIMEOUT_MS},
    async () => {
      await withSurface([TABLE], async (context) => {
        const route = path.route(context);
        try {
          const id = `definite-dup-${label.replaceAll(' ', '-')}`;
          assert.equal((await context.engine.executeQuery(INSERT,
            Object.values(reservation(id)))).success, true, 'setup: the row exists');
          const capture = captureAttempts(route.attemptOwner, route.attemptMethod);
          const caller = await withMutedConsoleError(() => settle(route.insert(
            reservation(id, 'released'), `definite:dup:${label}`)));
          capture.restore();
          const seen = caller.answer ?? caller.thrown;
          assert.deepEqual({verdicts: verdictsOf(capture.records),
            definite: isControlPlaneWriteDefinitivelyUnappliedError(seen)},
          {verdicts: [FAILED], definite: true}, `answer ${describe(seen)}; attempt ` +
            describe(capture.records[0]?.answer ?? capture.records[0]?.thrown));
          if (route.cdc) {
            // The retry owner every named owner write uses ends on the
            // definite failure: one attempt, not re-sends to its bound.
            const owner = new WitnessReservationOwner({
              controlPlaneSystemTableGateway: route.gateway,
              controlPlaneWriteRetryTimeoutMs: OWNER_RETRY_BOUND_MS});
            const ownerCapture = captureAttempts(route.cdc, 'insertSystemTableRow');
            const owned = await withMutedConsoleError(() => settle(owner.insertRow(
              reservation(id, 'expired'))));
            ownerCapture.restore();
            assert.deepEqual({attempts: ownerCapture.records.length,
              threw: owned.thrown !== null}, {attempts: 1, threw: true},
            'the owner does not re-send a definite constraint failure');
          }
          assert.equal(rowCount(context.of(TABLE), id), 1, 'still the one row');
        } finally {
          route.close?.();
        }
      }, {cdc: path.cdc});
    });
}

test('item 3: CDC shut down refuses before routing - NOT_PROPOSED (definite)',
  {timeout: TIMEOUT_MS}, async () => {
    await withSurface([TABLE], async (context) => {
      const route = PATHS['CDC through the engine'].route(context);
      route.cdc.markShuttingDown();
      const capture = captureAttempts(route.attemptOwner, route.attemptMethod);
      const caller = await settle(route.insert(reservation('definite-shutdown'),
        'definite:shutdown'));
      capture.restore();
      const seen = caller.answer ?? caller.thrown;
      assert.deepEqual({verdicts: verdictsOf(capture.records),
        definite: isControlPlaneWriteDefinitivelyUnappliedError(seen)},
      {verdicts: [NOT_PROPOSED], definite: true}, `answer ${describe(seen)}`);
    }, {cdc: true});
  });

// The real partition refuses a write it does not lead and has no leader to
// redirect to (noLeaderWriteRefusal: typed NOT_LEADER on its partition).
for (const label of ['SQL gateway', 'CDC through the engine']) {
  test(`item 3: the partition's NOT_LEADER refusal is NOT_PROPOSED (definite) - ${label}`,
    {timeout: TIMEOUT_MS}, async () => {
      await withSurface([TABLE], async (context) => {
        const route = PATHS[label].route(context);
        const {partition} = context.of(TABLE);
        const restoreLimit = limitSurfaceWriteAttempt(context.engine);
        partition.role = RAFT_ROLE.FOLLOWER;
        partition.resolveLeaderAddress = () => {
          throw Object.assign(new Error('no leader'), {code: 'no_leader'});
        };
        const capture = captureAttempts(route.attemptOwner, route.attemptMethod);
        let caller;
        try {
          caller = await withMutedConsoleError(() => settle(route.insert(
            reservation(`definite-not-leader-${label.replaceAll(' ', '-')}`),
            `definite:not-leader:${label}`)));
        } finally {
          capture.restore();
          delete partition.resolveLeaderAddress;
          partition.role = RAFT_ROLE.LEADER;
          restoreLimit();
        }
        const seen = caller.answer ?? caller.thrown;
        assert.deepEqual({verdicts: verdictsOf(capture.records),
          definite: isControlPlaneWriteDefinitivelyUnappliedError(seen)},
        {verdicts: [NOT_PROPOSED], definite: true}, `answer ${describe(seen)}; attempt ` +
          describe(capture.records[0]?.answer ?? capture.records[0]?.thrown));
      }, {cdc: PATHS[label].cdc});
    });
}
