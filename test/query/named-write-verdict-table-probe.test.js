// PROBE (line-regression-causes, diagnostic only, never for landing): the
// verdict the named-write judge gives the answers the REAL producers emit on
// each production named-write path (a lone rs-raft leader PartitionService,
// the real SQLQueryEngine, QueryExecutor, distributed write coordinator, CDC
// integration service and control-plane gateway), next to the hand-built
// fixture shapes the red tests feed it. One '# PROBE VERDICT' line per row.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {judgeNamedWriteOutcome} from
  '../../src/control-plane/control-plane-named-write-outcome.js';
import {NODE_ID, withSurface} from './unknown-outcome-surface-fixture.js';

const TABLE = TABLES.STORAGE_RESERVATIONS;
const PROBE_TIMEOUT_MS = 120000;
const INSERT = `INSERT INTO ${TABLE} (reservation_id, operation_id, entity_type, ` +
  'entity_id, partition_id, target_node_id, estimated_bytes, amplification_factor, ' +
  'status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const UPDATE = `UPDATE ${TABLE} SET status = ? WHERE reservation_id = ?`;
const STACK_LINES = 6;

function reservation(id) {
  const now = Date.now();
  return {reservation_id: id, operation_id: `op-${id}`, entity_type: 'partition',
    entity_id: 'p-1', partition_id: 'p-1', target_node_id: 'n-1', estimated_bytes: 1,
    amplification_factor: 1, status: 'active', created_at: now, updated_at: now,
    expires_at: now + 60000};
}

function emit(row) {
  console.log(`# PROBE VERDICT ${JSON.stringify(row)}`);
}

function describeError(error) {
  if (!error) return null;
  return {name: error.name ?? null, message: String(error.message ?? error),
    code: error.code ?? null, failureCode: error.failureCode ?? null,
    cause: error.cause ? String(error.cause.message ?? error.cause) : null,
    stack: String(error.cause?.stack ?? error.stack).split('\n').slice(0, STACK_LINES)
      .map((line) => line.trim())};
}

function attemptOf(key) {
  return {key, partitionId: INITIAL_PARTITION_IDS[TABLE], unresolved: false};
}

function verdictOf(answer, key) {
  try {
    return judgeNamedWriteOutcome(answer, attemptOf(key));
  } catch (error) {
    return `THROWS ${error?.name}: ${error?.message}`;
  }
}

function participantsOf(answer) {
  if (!Array.isArray(answer?.participantResults)) return null;
  return answer.participantResults.map((entry) => ({
    partitionId: entry?.partitionId ?? null, entryId: entry?.entryId ?? null,
    success: entry?.success ?? null, affectedRows: entry?.affectedRows ?? null,
    witnessPartitionId: entry?.durableCommitWitness?.partitionId ?? null,
    witnessEntryId: entry?.durableCommitWitness?.entryId ?? null,
    keys: Object.keys(entry ?? {}).sort()}));
}

function shapeOf(answer) {
  if (!answer || typeof answer !== 'object') return {type: typeof answer};
  return {keys: Object.keys(answer).sort(), success: answer.success ?? null,
    committed: answer.committed ?? null, affectedRows: answer.affectedRows ?? null,
    changes: answer.changes ?? null, partitionId: answer.partitionId ?? null,
    entryId: answer.entryId ?? null, hasWitness: answer.durableCommitWitness !== undefined,
    witnessPartitionId: answer.durableCommitWitness?.partitionId ?? null,
    witnessEntryId: answer.durableCommitWitness?.entryId ?? null,
    failureCode: answer.failureCode ?? null, idempotencyKey: answer.idempotencyKey ?? null,
    participants: participantsOf(answer),
    partitionResult: answer.partitionResult ? shapeOf(answer.partitionResult) : null};
}

// Records every engine write the path issues: its key and its real answer.
function captureEngine(engine) {
  const calls = [];
  const original = engine.executeQuery;
  engine.executeQuery = async (sql, params, options = {}) => {
    const call = {sql: String(sql).slice(0, 48), key: options?.idempotencyKey ?? null};
    calls.push(call);
    try {
      call.answer = await original.call(engine, sql, params, options);
      return call.answer;
    } catch (error) {
      call.thrown = error;
      throw error;
    }
  };
  return calls;
}

// Records every CDC mutation answer (the object the gateway hands the judge
// after its normalization) with the key it was delivered under.
function captureCdc(cdc) {
  const answers = [];
  for (const method of ['insertSystemTableRow', 'updateSystemTableRow']) {
    const original = cdc[method];
    cdc[method] = async (...args) => {
      const options = args.at(-1) ?? {};
      const record = {method, key: options?.idempotencyKey ?? null};
      answers.push(record);
      try {
        record.answer = await original.apply(cdc, args);
        return record.answer;
      } catch (error) {
        record.thrown = error;
        throw error;
      }
    };
  }
  return answers;
}

async function outcomeOf(write) {
  try {
    const value = await write();
    return {returned: true, success: value?.success ?? null, error: value?.error ?? null,
      failureCode: value?.failureCode ?? null,
      pendingInstance: value?.pendingInstance?.outcome ?? null};
  } catch (error) {
    return {returned: false, thrown: describeError(error)};
  }
}

function report(path, {engineCalls = [], cdcAnswers = [], deliveries = [], outcome}) {
  const lastKey = engineCalls.at(-1)?.key ?? cdcAnswers.at(-1)?.key ?? null;
  for (const call of engineCalls) {
    emit({path, level: 'engine', sql: call.sql, key: call.key, shape: shapeOf(call.answer),
      thrown: describeError(call.thrown),
      verdict: call.answer ? verdictOf(call.answer, call.key) : null});
  }
  for (const record of cdcAnswers) {
    emit({path, level: 'cdc', method: record.method, key: record.key,
      shape: shapeOf(record.answer), thrown: describeError(record.thrown),
      verdict: record.answer ? verdictOf(record.answer, record.key) : null});
  }
  for (const delivery of deliveries) {
    emit({path, level: 'partition-delivery', entryId: delivery.entryId ?? null,
      shape: shapeOf(delivery.answer), verdictUnderLastKey: verdictOf(delivery.answer, lastKey)});
  }
  emit({path, level: 'caller-outcome', outcome});
}

async function namedPath(path, {engine, deliveries, cdc = null}, write) {
  const engineCalls = captureEngine(engine);
  const cdcAnswers = cdc ? captureCdc(cdc) : [];
  const mark = deliveries?.length ?? 0;
  const outcome = await outcomeOf(write);
  report(path, {engineCalls, cdcAnswers, deliveries: deliveries?.slice(mark) ?? [], outcome});
}

test('PROBE hand-built fixture shapes', () => {
  const key = 'cpw-probe-fixture';
  const shapes = {
    'bare-success': {success: true},
    'success-affectedRows': {success: true, affectedRows: 1},
    'cdc-wrapped-engine-fake': {success: true, committed: true,
      partitionResult: {success: true, affectedRows: 1}},
    'cdc-wrapped-count-only': {success: true, committed: true,
      partitionResult: {affectedRows: 1}},
    'engine-fake-with-partitionResult': {success: true, affectedRows: 1,
      partitionResult: {affectedRows: 1}},
  };
  emit({path: 'route', level: 'declared', table: TABLE,
    routePartitionId: INITIAL_PARTITION_IDS[TABLE] ?? null});
  for (const [name, answer] of Object.entries(shapes)) {
    emit({path: `fixture:${name}`, level: 'hand-built', verdict: verdictOf(answer, key)});
  }
});

test('PROBE SQL gateway path (joiner startup SQL route)', {timeout: PROBE_TIMEOUT_MS},
  async () => {
    await withSurface([TABLE], async ({engine, gateway, deliveries}) => {
      const row = reservation('probe-sql-1');
      await namedPath('sql-gateway-insert', {engine, deliveries}, () =>
        gateway.executeQuery(INSERT, Object.values(row), {writeIdentity: 'probe:sql:insert'}));
      await namedPath('sql-gateway-update', {engine, deliveries}, () =>
        gateway.executeQuery(UPDATE, ['released', row.reservation_id],
          {writeIdentity: 'probe:sql:update'}));
      const replay = reservation('probe-sql-replay');
      for (const label of ['first', 'replay']) {
        await namedPath(`sql-explicit-key-${label}`, {engine, deliveries}, () =>
          gateway.executeQuery(INSERT, Object.values(replay),
            {idempotencyKey: 'cpw-probe-explicit-replay'}));
      }
    });
  });

test('PROBE CDC path routed through the engine (a node that does not lead the partition)',
  {timeout: PROBE_TIMEOUT_MS}, async () => {
    await withSurface([TABLE], async ({engine, gateway, deliveries, cdcIntegrationService}) => {
      const row = reservation('probe-cdc-1');
      await namedPath('cdc-engine-insert', {engine, deliveries, cdc: cdcIntegrationService},
        () => gateway.insertSystemTableRow(TABLE, row, {writeIdentity: 'probe:cdc:insert'}));
      await namedPath('cdc-engine-update', {engine, deliveries, cdc: cdcIntegrationService},
        () => gateway.updateSystemTableRow(TABLE, {reservation_id: row.reservation_id},
          {status: 'released'}, {writeIdentity: 'probe:cdc:update'}));
    }, {cdc: true});
  });

test('PROBE CDC local-leader path (the node leads the system partition)',
  {timeout: PROBE_TIMEOUT_MS}, async () => {
    await withSurface([TABLE], async ({engine, deliveries, messageRouter, of}) => {
      const surface = of(TABLE);
      const cdc = new CDCIntegrationService({nodeId: NODE_ID, sqlQueryEngine: engine,
        partitionServicesProvider: new Map([[surface.partitionId, surface.partition]])});
      cdc.initialize();
      try {
        const gateway = createControlPlaneRuntimeBundle({nodeId: NODE_ID,
          sqlQueryEngine: engine, messageRouter, cdcIntegrationService: cdc,
        }).controlPlaneSystemTableGateway;
        const row = reservation('probe-local-1');
        await namedPath('cdc-local-insert', {engine, deliveries, cdc},
          () => gateway.insertSystemTableRow(TABLE, row, {writeIdentity: 'probe:local:insert'}));
        await namedPath('cdc-local-update', {engine, deliveries, cdc},
          () => gateway.updateSystemTableRow(TABLE, {reservation_id: row.reservation_id},
            {status: 'released'}, {writeIdentity: 'probe:local:update'}));
      } finally {
        cdc.shutdown?.();
      }
    });
  });

test('PROBE CDC bootstrap direct path (the seed registration window)',
  {timeout: PROBE_TIMEOUT_MS}, async () => {
    await withSurface([TABLE], async ({engine, gateway, deliveries, cdcIntegrationService,
      of}) => {
      const surface = of(TABLE);
      try {
        cdcIntegrationService.setBootstrapMode(true,
          new Map([[surface.partitionId, surface.partition]]));
      } catch (error) {
        emit({path: 'cdc-bootstrap-insert', level: 'setup', thrown: describeError(error)});
        return;
      }
      try {
        const row = reservation('probe-boot-1');
        await namedPath('cdc-bootstrap-insert',
          {engine, deliveries, cdc: cdcIntegrationService},
          () => gateway.insertSystemTableRow(TABLE, row, {writeIdentity: 'probe:boot:insert'}));
      } finally {
        cdcIntegrationService.setBootstrapMode(false, null);
      }
    }, {cdc: true});
  });

// The runner prints only a failing file's output: this last case fails on
// purpose so the verdict lines above are retained.
test('PROBE end: fail on purpose so the runner retains the verdict lines', () => {
  assert.fail('PROBE: the verdict table above is the deliverable');
});
