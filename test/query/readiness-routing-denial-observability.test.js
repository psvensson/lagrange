// Witness for the readiness-admission-freeze-observed quest, routing half.
// Raw node:test so the anchored receipt runner selects exactly one scenario.
//
// SCOPE. In the traced formation the routing layer denied every candidate on
// a readiness record that was 173 s old and carried an inherited verdict, and
// never said either fact; and what the victim's heartbeat write finally
// received was a DISTRIBUTED_PARTICIPANT_FAILURE whose participant failure
// said `Partition service not found` - the very error a partition with no
// service rows produces. These witnesses pin that the denial now states the
// record's age and whether it was deferred, that every pre-existing field of
// that payload is byte-identical to main's, and that every caller-facing
// surface can tell the two causes apart while the message, the code, the
// class and the result shape are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

import {
  ENGINE_SCENARIO,
  createFrozenReadinessEngine,
} from '../control-plane/readiness-admission-freeze-rig.js';
import {
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {CDC_INTEGRATION_SERVICE_SHARED} from
  '../../src/cdc/cdc-integration-service-shared.js';
import {HeartbeatService} from
  '../../src/control-plane/heartbeat-service.js';
import {HEARTBEAT_LOG_MSG, HEARTBEAT_STATE} from
  '../../src/control-plane/heartbeat-service-constants.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {
  PartitionQueryMetrics,
  QueryExecutionMetrics,
  formatQueryExecutionMetrics,
} from '../../src/query/distributed/parallel-query-execution-metrics.js';
import {buildParticipantFailureEntry} from
  '../../src/query/query-execution-budget.js';
import {QUERY_EXECUTOR_SHARED} from '../../src/query/query-executor-shared.js';
import {summarizeAuthoritativeRepairError} from
  '../../src/admin/admin-service-discovery-authoritative-repair-failures.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {resolveReadinessObservedAgeMs} from
  '../../src/control-plane/eligibility-snapshot.js';
import {
  CONTROL_PLANE_QUIESCENCE_STATE,
  buildControlPlaneQuiescenceSnapshot,
} from '../../src/diagnostics/control-plane-quiescence-snapshot.js';
import {
  STALE_HEARTBEAT_MAX_AGE_MS,
  USER_PARTITION_ID,
  USER_TABLE_NAME,
  captureDenialEntry,
  createAdmissionDrive,
  createLogSink,
  isDeferredSnapshot,
  runWithTickingClock,
} from '../control-plane/readiness-admission-freeze-rig.js';

// THE FROZEN ORACLE for the denial payload: the sha256 of the JSON of the one
// denied-candidate entry this scenario produces, measured on the tree at
// b869139a6 - main with the guard-inputs quest landed and not one source line
// of this quest applied. The assertion deletes exactly the two keys this
// quest adds and hashes the rest, so anything else that moved in that payload
// - a value, a key, an order - fails it. The same digest holds for the entry
// the routing snapshot lists and for the entry the denial LINE carries,
// because on main they are the same object.
const MAIN_DENIAL_ENTRY_DIGEST =
  '42fe86ce6fdbe70b03c7fa501c9f457e16af5c03e1da539426e438df6d891e44';
const MAIN_DENIAL_ENTRY_KEYS = Object.freeze([
  'decisionDimension',
  'observedAt',
  'lifecycleState',
  'reasonCodes',
  'failedDimensions',
  'runtimeAuthority',
  'projectionReadinessContract',
]);
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const ADDED_DENIAL_KEYS = Object.freeze(['observedAgeMs', 'deferred']);
const MISSING_PARTITION_ID = 'absent_table-p1';
const MISSING_TABLE_NAME = 'absent_table';
const DEFERRED_RECORD_AGE_MS = STALE_HEARTBEAT_MAX_AGE_MS + 1;
const WRITE_TIMEOUT_MS = 40;
const FUTURE_STAMP_MS = 60_000;
const CDC_SOURCE_DIRECTORY = 'src/cdc';
const QUERY_SOURCE_DIRECTORY = 'src/query';
const CAUSE_FIELD_NAME = 'routingDenialCause';
// THE CENSUS. A failure entry has no single constructor on this path: each
// layer rebuilds it from an explicit field list, which is why an additive
// field dies wherever a list was not extended. This walk enumerates those
// constructors by SHAPE rather than by one property name, which is what the
// round-2 census keyed on and why it could not see the engine's own projection.
//
// METHOD. For every .js file under src/query, take each top-level function or
// method (brace-matched from its declaration line, control-flow keywords
// excluded) and keep it when all three hold: it builds a failure IDENTITY (a
// `success: false` result, or a `partitionId` entry with at least five failure
// keys); at least four failure-shape keys appear as properties or as `.key =`
// assignments; and it READS a failure off an identifier, which is what makes
// it a re-projection rather than a fresh refusal. Every kept function must
// mention the cause.
const FAILURE_SHAPE_KEYS = Object.freeze([
  'error', 'errorCode', 'retryAfterMs', 'deferRetry', 'participantNodeId',
  'participantAddress', 'backpressured', 'failedTable', 'partitionId',
  'durationMs', 'firstFailedParticipant', 'participantFailures', 'rows',
  'status',
]);
const CONTROL_FLOW = Object.freeze(new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'try', 'do', 'else',
  'function',
]));
const DECLARATION_LINE =
  /^[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?(?:function[ \t]+)?([A-Za-z_$][\w$]*)[ \t]*\(/u;
const PROJECTION_READ =
  /\b(result|error|entry|failure|metric|snapshot|errorLike|details|dispatchResult)\s*\??\.\s*[A-Za-z_$]/u;
const SUCCESS_FALSE = /(^|[\s{,])success\s*:\s*false/u;
const MINIMUM_FAILURE_KEYS = 4;
const MINIMUM_ENTRY_KEYS = 5;
// The exact set this quest audited. A new constructor, or one that loses the
// field, fails this test rather than turning up in a later round.
const FAILURE_CONSTRUCTORS = Object.freeze([
  'src/query/distributed/distributed-write-coordinator.js buildParticipantFailureLogContext',
  'src/query/distributed/parallel-query-execution-metrics.js formatQueryExecutionMetrics',
  'src/query/distributed/parallel-query-partition-outcomes.js normalizePartitionExecutionFailureSnapshot',
  'src/query/distributed/parallel-query-partition-outcomes.js buildPartitionExecutionFailureOutcome',
  'src/query/query-execution-budget.js buildParticipantFailureEntry',
  'src/query/query-executor-partition-delivery.js resolvePartitionRetryDelayMs',
  'src/query/query-executor-shared.js buildParticipantFailureEntry',
  'src/query/sql-query-engine-lifecycle-and-callback-dispatch.js buildPartitionCallbackReadFailureResult',
  'src/query/sql-query-engine.js buildCaughtQueryExecutionFailure',
]);

function matchingBrace(source, open) {
  let depth = 0;
  for (let scan = open; scan < source.length; scan += 1) {
    if (source[scan] === '{') depth += 1;
    else if (source[scan] === '}') {
      depth -= 1;
      if (depth === 0) return scan;
    }
  }
  return -1;
}

function functionBodies(source) {
  const spans = [];
  const lines = source.split('\n');
  let offset = 0;
  for (const line of lines) {
    const match = DECLARATION_LINE.exec(line);
    const start = offset;
    offset += line.length + 1;
    if (!match || CONTROL_FLOW.has(match[1])) continue;
    const open = source.indexOf('{', start);
    const end = open < 0 ? -1 : matchingBrace(source, open);
    if (end < 0) continue;
    spans.push({name: match[1], text: source.slice(open, end + 1)});
  }
  return spans;
}

function isFailureConstructor(text) {
  const present = FAILURE_SHAPE_KEYS.filter((name) =>
    new RegExp(`(^|[\\s{,(])${name}\\s*[:,}\\n]`, 'u').test(text) ||
    new RegExp(`\\.${name}\\s*=[^=]`, 'u').test(text));
  if (present.length < MINIMUM_FAILURE_KEYS) return false;
  const identifiesFailure = SUCCESS_FALSE.test(text) ||
    (/(^|[\s{,(])partitionId\s*[:,}\n]/u.test(text) &&
      present.length >= MINIMUM_ENTRY_KEYS);
  return identifiesFailure && PROJECTION_READ.test(text);
}

const HEARTBEAT_STAGE_REGISTER = 'register';
const HEARTBEAT_INTERVAL_MS = 1_000;
const SYSTEM_TABLE_UPDATE_FALLBACK = 'system table update failed';
const PG_WIRE_ADAPTER = 'src/query/pg/postgres-wire-adapter.js';
const TRANSACTION_TIMEOUT_MS = 1_500;
const CRITICAL_WORK_CLASS = 'critical';
const RECOVERY_DIMENSION = 'controlPlaneRecoveryEligible';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

// A whole transaction on the REAL engine: BEGIN, a statement, ROLLBACK,
// through `executeQuery` and the engine's own transaction coordinator, with
// routing readiness-filtered or the partition's service rows absent.
async function runTransaction(scenario) {
  const {engine, tableName} = createFrozenReadinessEngine(scenario);
  const options = {
    timeoutMs: TRANSACTION_TIMEOUT_MS,
    workClass: CRITICAL_WORK_CLASS,
    routingReadinessDimension: RECOVERY_DIMENSION,
    sessionId: `session-${scenario}`,
  };
  const begin = await engine.executeQuery('BEGIN', [], options);
  const statement = await engine.executeQuery(
    `UPDATE ${tableName} SET status = 'active' WHERE node_id = 'node-1'`,
    [], options);
  const rollback = await engine.executeQuery('ROLLBACK', [], options);
  return {begin, statement, rollback};
}

// Drive the real planning owner to the traced state: a live user-table
// partition whose only candidate is denied on a deferred readiness record.
async function createFrozenReadinessDrive() {
  const drive = createAdmissionDrive();
  drive.read();
  await drive.drain();
  assert.equal(isDeferredSnapshot(drive.read()), false,
    'the drive starts from an admitted record');
  drive.advance(DEFERRED_RECORD_AGE_MS);
  assert.equal(isDeferredSnapshot(drive.read()), true,
    'the planning owner is now serving a deferred record');
  return drive;
}

function digestOf(value) {
  return createHash(DIGEST_ALGORITHM).update(JSON.stringify(value))
    .digest(DIGEST_ENCODING);
}

function preExistingFields(entry) {
  const copy = {...entry};
  for (const key of ADDED_DENIAL_KEYS) delete copy[key];
  return copy;
}

test('the routing denial states each denied candidate\'s record age and ' +
  'deferral', async () => {
  const captured = await captureDenialEntry();
  assert.equal(captured.snapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
    'every active addressed candidate was filtered by readiness');
  assert.equal(captured.lineMessage,
    QUERY_LOG_MSG.PARTITION_ROUTING_CANDIDATES_FILTERED,
    'the denial line was emitted under its unchanged message');
  assert.equal(captured.lineLevel, 'warn',
    'at its unchanged level');
  const lineEntry = captured.lineEntry;
  assert.ok(lineEntry, 'the denied candidate is listed on the line');
  assert.equal(lineEntry.observedAgeMs, captured.expectedAgeMs,
    'the line states how old the record the denial was made on is');
  assert.equal(lineEntry.deferred, true,
    'and that the record was a deferred one');
  assert.deepEqual(Object.keys(preExistingFields(lineEntry)),
    [...MAIN_DENIAL_ENTRY_KEYS],
    'no pre-existing key was added, removed or reordered on the line');
  assert.equal(digestOf(preExistingFields(lineEntry)), MAIN_DENIAL_ENTRY_DIGEST,
    'every pre-existing field of the line is byte-identical to main\'s');
  // The routing snapshot itself carries the deferral flag, which costs
  // nothing, and NOT the age, which costs a clock read: the age is added
  // where the throttled line is actually built.
  const snapshotEntry = captured.snapshotEntry;
  assert.equal(snapshotEntry.deferred, true,
    'the snapshot entry states the deferral');
  assert.equal(Object.hasOwn(snapshotEntry, 'observedAgeMs'), false,
    'and does not carry an age nobody is about to log');
  assert.equal(digestOf(preExistingFields(snapshotEntry)),
    MAIN_DENIAL_ENTRY_DIGEST,
    'every pre-existing field of the snapshot entry is main\'s too');
  // No clock read per denied node per routing snapshot; one per emitted line.
  const drive = await createFrozenReadinessDrive();
  try {
    let clockReads = 0;
    const nowFn = drive.executor.nowFn;
    drive.executor.nowFn = () => {
      clockReads += 1;
      return nowFn();
    };
    drive.routingSnapshot();
    assert.equal(clockReads, 0,
      'building a routing snapshot reads no clock for the denial ages');
    const sink = createLogSink();
    drive.executor.logger = sink.logger;
    drive.executor.logPartitionRoutingDenial(drive.routingSnapshot());
    assert.equal(clockReads, 1,
      'one emitted line reads the clock exactly once');
  } finally {
    drive.shutdown();
  }
});

// Every shape a caller reaches this failure through. SELECT, UPDATE and
// DELETE surface it on the participant failure entry the distributed summary
// builds; INSERT and a transaction operation surface it on the Error they
// throw, as an own property beside errorCode.
async function runCallerFacingSurfaces(drive, partitionId, tableName) {
  const parse = (sql) => new SQLParser(sql).parse();
  const options = {tableName, timeoutMs: WRITE_TIMEOUT_MS};
  const thrown = async (run) => {
    try {
      await runWithTickingClock(drive, run);
      return {threw: false};
    } catch (error) {
      return {
        threw: true,
        message: error.message,
        code: error.code ?? null,
        className: error.constructor.name,
        cause: error[CAUSE_FIELD_NAME] ?? null,
      };
    }
  };
  return {
    select: await runWithTickingClock(drive, () => drive.executor.executeSelect(
      parse(`SELECT * FROM ${tableName}`), [partitionId], [], options)),
    update: await runWithTickingClock(drive, () => drive.executor.executeUpdate(
      parse(`UPDATE ${tableName} SET id = 2`), [partitionId], [], options)),
    delete: await runWithTickingClock(drive, () => drive.executor.executeDelete(
      parse(`DELETE FROM ${tableName}`), [partitionId], [], options)),
    insert: await thrown(() => drive.executor.executeInsert(
      parse(`INSERT INTO ${tableName} (id) VALUES (1)`), partitionId, [],
      options)),
  };
}

function assertDistributedShape(result, label) {
  assert.equal(result.error, QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    `${label}: the distributed message is unchanged`);
  assert.equal(result.errorCode,
    QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    `${label}: the distributed code is unchanged`);
  const participant = result.participantFailures[0];
  assert.equal(participant.error, QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
    `${label}: the participant failure message is unchanged`);
  return participant[CAUSE_FIELD_NAME];
}

test('the all-filtered-by-readiness error names a distinguishable cause',
  async () => {
    const filteredDrive = await createFrozenReadinessDrive();
    const missingDrive = await createFrozenReadinessDrive();
    try {
      const filtered = await runCallerFacingSurfaces(
        filteredDrive, USER_PARTITION_ID, USER_TABLE_NAME);
      const missing = await runCallerFacingSurfaces(
        missingDrive, MISSING_PARTITION_ID, MISSING_TABLE_NAME);
      const readinessCause =
        QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS;
      const absentCause = QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS;
      for (const surface of ['select', 'update', 'delete']) {
        assert.equal(assertDistributedShape(filtered[surface], surface),
          readinessCause,
          `${surface}: the readiness freeze names itself`);
        assert.equal(assertDistributedShape(missing[surface], surface),
          absentCause,
          `${surface}: the missing partition service names itself`);
        assert.deepEqual(Object.keys(filtered[surface]),
          Object.keys(missing[surface]),
          `${surface}: both failures are the same result shape`);
      }
      for (const surface of ['insert']) {
        assert.equal(filtered[surface].threw, true,
          `${surface}: the caller still receives a thrown error`);
        assert.equal(filtered[surface].message,
          QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
          `${surface}: the message the caller sees is unchanged`);
        assert.equal(filtered[surface].message, missing[surface].message,
          `${surface}: and is the same for a missing partition service`);
        assert.equal(filtered[surface].code, missing[surface].code,
          `${surface}: the error code is unchanged and identical for both`);
        assert.equal(filtered[surface].className, 'Error',
          `${surface}: the error class is unchanged`);
        assert.equal(filtered[surface].className, missing[surface].className,
          `${surface}: and identical for both`);
        assert.equal(filtered[surface].cause, readinessCause,
          `${surface}: the readiness freeze names itself`);
        assert.equal(missing[surface].cause, absentCause,
          `${surface}: the missing partition service names itself`);
      }
      // The string-matching consumer of this error classifies it identically:
      // it reads the message, which did not move.
      const classify = (error) => buildControlPlaneQuiescenceSnapshot({
        snapshotProbe: {error}, nowMs: filteredDrive.state.clock,
      });
      const filteredState = classify(filtered.insert.message);
      const missingState = classify(missing.insert.message);
      assert.equal(filteredState.state,
        CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
        'the quiescence classifier still reads observation_unavailable');
      assert.equal(filteredState.state, missingState.state,
        'it classifies both causes exactly as it did before');
      assert.deepEqual(filteredState.reasonCodes, missingState.reasonCodes,
        'and reaches the same reason codes for both');
      // The distributed message contains the substring this classifier reads
      // as pressure, exactly as it did on main: the cause rides beside the
      // message, so the classification does not move.
      assert.equal(classify(filtered.select.error).state,
        CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
        'the distributed message still classifies as control-plane pressure');
      assert.equal(classify(filtered.select.error).state,
        classify(missing.select.error).state,
        'and identically for both causes');
      // A statement INSIDE A TRANSACTION, through the real engine: this is
      // the caller-facing result that carried no cause at all until the
      // engine's own caught-error projection carried it.
      const filteredTransaction = await runTransaction(ENGINE_SCENARIO.FILTERED);
      const missingTransaction = await runTransaction(ENGINE_SCENARIO.MISSING);
      for (const transaction of [filteredTransaction, missingTransaction]) {
        assert.equal(transaction.begin.success, true,
          'the transaction opens');
        assert.equal(transaction.statement.success, false,
          'the statement inside it fails');
        assert.equal(transaction.statement.error,
          QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
          'with main\'s message');
        assert.equal(transaction.rollback.success, true,
          'and the transaction rolls back');
      }
      assert.equal(filteredTransaction.statement.errorCode,
        missingTransaction.statement.errorCode,
        'the transactional error code is identical for both causes');
      assert.deepEqual(
        Object.keys(filteredTransaction.statement),
        Object.keys(missingTransaction.statement),
        'and so is the result shape');
      assert.equal(filteredTransaction.statement[CAUSE_FIELD_NAME],
        readinessCause,
        'the readiness freeze names itself inside a transaction');
      assert.equal(missingTransaction.statement[CAUSE_FIELD_NAME], absentCause,
        'and the missing partition service names itself there too');
      assert.equal(classify(filteredTransaction.statement.error).state,
        classify(missingTransaction.statement.error).state,
        'the quiescence classifier still reads both the same');
      // Both copies of the participant-failure entry builder carry it. They
      // are a true duplicate; this quest keeps them as one rather than
      // merging a shared contract's two implementations.
      const sample = Object.freeze({
        partitionId: USER_PARTITION_ID,
        error: QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
        [CAUSE_FIELD_NAME]: readinessCause,
      });
      assert.equal(buildParticipantFailureEntry(sample)[CAUSE_FIELD_NAME],
        readinessCause,
        'the query-execution-budget entry builder carries the cause');
      assert.deepEqual(buildParticipantFailureEntry(sample),
        QUERY_EXECUTOR_SHARED.buildParticipantFailureEntry(sample),
        'and the query-executor-shared copy produces the same entry');
    } finally {
      filteredDrive.shutdown();
      missingDrive.shutdown();
    }
  });

test('the routing denial cause never outlives the resolution that made it',
  async () => {
    const drive = await createFrozenReadinessDrive();
    try {
      const pending = drive.executor.executeOnPartition(
        USER_PARTITION_ID, 'SELECT 1', [], true, false, false,
        {tableName: USER_TABLE_NAME});
      await new Promise((resolve) => setImmediate(resolve));
      await drive.drain();
      assert.equal(isDeferredSnapshot(drive.read()), false,
        'the owner admits a new record while the executor waits to retry');
      const result = await pending;
      assert.notEqual(result.error,
        QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
        'the retry found candidates, so this is a delivery failure');
      assert.equal(result[CAUSE_FIELD_NAME], null,
        'a delivery failure carries no routing denial cause');
    } finally {
      drive.shutdown();
    }
  });

test('the readiness observed-age contract is total', () => {
  const nowMs = 1_700_000_000_000;
  const stamp = new Date(nowMs - DEFERRED_RECORD_AGE_MS).toISOString();
  assert.equal(resolveReadinessObservedAgeMs(stamp, nowMs),
    DEFERRED_RECORD_AGE_MS, 'a parseable stamp states its age');
  assert.equal(resolveReadinessObservedAgeMs(null, nowMs), null,
    'a missing stamp states no age');
  assert.equal(resolveReadinessObservedAgeMs('', nowMs), null,
    'an empty stamp states no age');
  assert.equal(resolveReadinessObservedAgeMs('not-a-date', nowMs), null,
    'an unparseable stamp states no age');
  assert.equal(resolveReadinessObservedAgeMs(nowMs, nowMs), null,
    'a non-string stamp states no age');
  assert.equal(resolveReadinessObservedAgeMs(stamp, null), null,
    'a caller with no clock states no age');
  assert.equal(resolveReadinessObservedAgeMs(stamp, Number.NaN), null,
    'and neither does one whose clock returned nothing');
  // A negative age is truthful, not an error: the record was stamped in the
  // future, which is exactly what a clock skew between two nodes looks like
  // and exactly what an operator needs to see.
  const future = new Date(nowMs + FUTURE_STAMP_MS).toISOString();
  assert.equal(resolveReadinessObservedAgeMs(future, nowMs), -FUTURE_STAMP_MS,
    'a future-dated stamp states a negative age rather than hiding it');
});

function walkJavaScriptFiles(directory, visit) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkJavaScriptFiles(entryPath, visit);
      continue;
    }
    if (entry.name.endsWith('.js')) visit(entryPath, fs.readFileSync(entryPath, 'utf8'));
  }
}

test('every failure-result constructor in the query tree carries the cause',
  () => {
    const found = new Map();
    walkJavaScriptFiles(QUERY_SOURCE_DIRECTORY, (filePath, source) => {
      for (const span of functionBodies(source)) {
        if (!isFailureConstructor(span.text)) continue;
        const site = `${filePath} ${span.name}`;
        const existing = found.get(site);
        if (!existing || existing.length > span.text.length) {
          found.set(site, span.text);
        }
      }
    });
    const dropping = [...found.entries()]
      .filter(([, text]) => !text.includes(CAUSE_FIELD_NAME))
      .map(([site]) => site);
    assert.deepEqual(dropping, [],
      'no constructor of a failure result or entry drops the cause');
    assert.deepEqual([...found.keys()].sort(), [...FAILURE_CONSTRUCTORS].sort(),
      'and the set of such constructors is the one this quest audited');
  });

test('the heartbeat write names the readiness freeze at its catch site',
  async () => {
    const {buildSystemTableMutationError} = CDC_INTEGRATION_SERVICE_SHARED;
    const run = async (drive, partitionId, tableName) => {
      const parse = (sql) => new SQLParser(sql).parse();
      // The traced victim's own write: an UPDATE of its nodes row, routed
      // through the executor whose every candidate readiness filtered.
      const result = await runWithTickingClock(drive, () =>
        drive.executor.executeUpdate(
          parse(`UPDATE ${tableName} SET id = 2`), [partitionId], [],
          {tableName, timeoutMs: WRITE_TIMEOUT_MS}));
      // The CDC mutation owner turns that result into the Error the gateway
      // hands back, and the heartbeat's own recorder is what catches it.
      const error = buildSystemTableMutationError(
        result, SYSTEM_TABLE_UPDATE_FALLBACK);
      // The heartbeat's OWN catch site, reached through the real `start`
      // loop: `sendHeartbeat` throws the error the write really produced and
      // the register-stage catch records it. Only the attempt bookkeeping is
      // stood in for, so no real timer is armed.
      const lines = [];
      const receiver = Object.create(HeartbeatService.prototype);
      receiver.nodeId = 'node-1';
      receiver.state = HEARTBEAT_STATE.INITIALIZED;
      receiver.heartbeatTimer = null;
      receiver.heartbeatInFlight = false;
      receiver.heartbeatConsecutiveFailures = 0;
      receiver.heartbeatCount = 0;
      receiver.heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS;
      receiver.now = () => drive.state.clock;
      receiver.heartbeatPublicationDiagnostics = {};
      receiver.logger = {
        info() {},
        error() {},
        warn: (message, payload) => lines.push({level: 'warn', message, payload}),
        debug: (message, payload) => lines.push({level: 'debug', message, payload}),
      };
      receiver.emit = () => {};
      receiver.setIntervalFn = () => ({unref() {}});
      receiver.beginHeartbeatAttempt = () => ({timedOut: false});
      receiver.completeHeartbeatAttempt = () => {};
      receiver.runScheduledMembershipPublicationReconcileTick = () => {};
      receiver.sendHeartbeat = async () => {
        throw error;
      };
      receiver.start({stats: {}});
      await new Promise((resolve) => setImmediate(resolve));
      return {result, error, lines, receiver};
    };
    const filteredDrive = await createFrozenReadinessDrive();
    const missingDrive = await createFrozenReadinessDrive();
    try {
      const filtered = await run(
        filteredDrive, USER_PARTITION_ID, USER_TABLE_NAME);
      const missing = await run(
        missingDrive, MISSING_PARTITION_ID, MISSING_TABLE_NAME);
      const readinessCause =
        QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS;
      const absentCause = QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS;
      assert.equal(filtered.error.message,
        QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        'the caught error carries main\'s message');
      assert.equal(filtered.error.message, missing.error.message,
        'the same message for both causes, exactly as on main');
      assert.equal(filtered.error.code,
        QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        'and main\'s code');
      assert.equal(filtered.error.code, missing.error.code,
        'identical for both causes');
      assert.equal(filtered.error.constructor.name, 'Error',
        'and main\'s class');
      assert.equal(
        filtered.error.participantFailures[0][CAUSE_FIELD_NAME],
        readinessCause,
        'the caught error\'s participant failure names the readiness freeze');
      assert.equal(
        missing.error.participantFailures[0][CAUSE_FIELD_NAME],
        absentCause,
        'and names a genuinely absent partition service differently');
      // And the line the heartbeat actually writes says it.
      const [line] = filtered.lines;
      assert.equal(line.message, HEARTBEAT_LOG_MSG.HEARTBEAT_FAILED,
        'the heartbeat failure line keeps its message');
      assert.equal(line.payload.stage, HEARTBEAT_STAGE_REGISTER,
        'recorded at the register stage, as the traced run did');
      assert.equal(line.payload.error,
        QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        'and its error field');
      assert.equal(line.payload[CAUSE_FIELD_NAME], readinessCause,
        'and now names the routing denial the write died on');
      assert.equal(missing.lines[0].payload[CAUSE_FIELD_NAME], absentCause,
        'the missing-service case names itself there too');
      assert.equal(
        filtered.receiver.heartbeatPublicationDiagnostics
          .lastFailureRoutingDenialCause,
        readinessCause,
        'and the failure record the heartbeat keeps names it as well');
    } finally {
      filteredDrive.shutdown();
      missingDrive.shutdown();
    }
  });

test('the distributed write coordinator and its metrics both name the cause',
  async () => {
    const drive = await createFrozenReadinessDrive();
    try {
      // The multi-partition WRITE lane has its own participant-failure
      // projection and its own log context; both must name the denial.
      const lines = [];
      const coordinator = new DistributedWriteCoordinator({
        queryExecutor: drive.executor,
        getTablePartitions: () => [USER_PARTITION_ID],
        getTableInfo: () => ({name: USER_TABLE_NAME}),
      });
      coordinator.logger = {
        info() {},
        debug() {},
        error() {},
        warn: (message, payload) => lines.push({message, payload}),
      };
      const plan = coordinator.createWritePlan(
        new SQLParser(`UPDATE ${USER_TABLE_NAME} SET id = 2`).parse(), [],
        {partitionIds: [USER_PARTITION_ID]});
      const result = await runWithTickingClock(drive, () =>
        coordinator.executePlan(plan, [],
          {tableName: USER_TABLE_NAME, timeoutMs: WRITE_TIMEOUT_MS}));
      const readinessCause =
        QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS;
      assert.equal(result.success, false, 'the write fails, as it did live');
      assert.equal(result.error,
        QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        'with main\'s message');
      assert.equal(result.participantFailures[0][CAUSE_FIELD_NAME],
        readinessCause,
        'and its participant failure names the readiness freeze');
      assert.equal(
        lines[0].payload.participantFailures[0][CAUSE_FIELD_NAME],
        readinessCause,
        'and so does the server log line the coordinator writes');
      // A participant whose statement THROWS rather than returning a failure
      // result takes the coordinator's other projection - the INSERT lane,
      // whose executor throws - and that one must name it too.
      const thrown = await runWithTickingClock(drive, () =>
        coordinator.executePartitionStatement(
          QUERY_AST_TYPE.INSERT,
          new SQLParser(`INSERT INTO ${USER_TABLE_NAME} (id) VALUES (1)`)
            .parse(),
          USER_PARTITION_ID,
          [],
          {tableName: USER_TABLE_NAME, timeoutMs: WRITE_TIMEOUT_MS},
        ));
      assert.equal(thrown.success, false,
        'the thrown participant statement is reported as a failure');
      assert.equal(thrown.error, QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
        'with main\'s message');
      assert.equal(thrown[CAUSE_FIELD_NAME], readinessCause,
        'and names the readiness freeze the throw came out of');
    } finally {
      drive.shutdown();
    }
    // The parallel-query metrics carry their own copy of each failed
    // participant, returned to the caller as `metrics`.
    const metrics = new QueryExecutionMetrics('query-1');
    const partitionMetrics = new PartitionQueryMetrics(USER_PARTITION_ID);
    partitionMetrics.start();
    partitionMetrics.fail(
      new Error(QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND),
      {[CAUSE_FIELD_NAME]:
        QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS},
    );
    metrics.addPartitionMetrics(partitionMetrics);
    metrics.finalize();
    assert.equal(
      formatQueryExecutionMetrics(metrics)
        .participantFailures[0][CAUSE_FIELD_NAME],
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
      'the formatted metrics name the denial too');
  });

test('the PostgreSQL wire adapter builds errors from messages only', () => {
  const source = fs.readFileSync(PG_WIRE_ADAPTER, 'utf8');
  assert.equal(source.includes(CAUSE_FIELD_NAME), false,
    'the wire adapter never mentions the routing denial cause');
  assert.equal(source.includes('participantFailures'), false,
    'and never reads a participant failure entry, so nothing this quest ' +
      'adds can reach a PostgreSQL client');
});

test('no CDC consumer branches on the routing denial cause', () => {
  // The CDC authoritative read result spreads the partition execution result
  // (`normalizeAuthoritativeQueryRowSet` in
  // cdc-integration-service-owner-rpc-read-execution.js), so the field is
  // observable there. That is deliberate and additive; nothing in the CDC
  // tree may read it, because nothing there decides on it.
  const readers = [];
  walkJavaScriptFiles(CDC_SOURCE_DIRECTORY, (filePath, source) => {
    if (source.includes(CAUSE_FIELD_NAME)) readers.push(filePath);
  });
  assert.deepEqual(readers, [],
    'no file under src/cdc mentions the routing denial cause, so no CDC ' +
      'consumer can branch on the field it carries through');
});

test('the admin repair summary carries the cause and decides nothing on it',
  () => {
    // The admin authoritative-repair summary re-projects a participant
    // failure through an explicit key list, so the cause has to be named
    // there or it is dropped on the operator-facing surface.
    const failed = {
      partitionId: USER_PARTITION_ID,
      participantNodeId: 'node-2',
      participantAddress: 'node-2:7010',
      error: QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
      errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      failedTable: USER_TABLE_NAME,
      durationMs: 12,
      routingDenialCause:
        QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
    };
    const entry = buildParticipantFailureEntry(failed);
    assert.equal(entry.routingDenialCause,
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
      'the participant entry the admin path is handed states the cause');
    const error = {
      message: QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
      code: 'DISTRIBUTED_PARTICIPANT_FAILURE',
      participantFailures: [entry],
    };
    const summary = summarizeAuthoritativeRepairError(USER_TABLE_NAME, error);
    assert.equal(summary.firstFailedParticipant.routingDenialCause,
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
      'and the admin repair summary carries it to the operator');

    // Nothing the admin path decides may move because the field is there:
    // the same failure without it must produce the same summary in every
    // other key, including the cause chain the retry policy reads.
    const blindSummary = summarizeAuthoritativeRepairError(
      USER_TABLE_NAME, {...error, participantFailures: [{...failed,
        routingDenialCause: undefined}]});
    const withoutCause = (built) => ({
      ...built,
      firstFailedParticipant: {
        ...built.firstFailedParticipant, routingDenialCause: null,
      },
    });
    assert.deepEqual(withoutCause(summary), withoutCause(blindSummary),
      'the cause changes no cause chain, no error code and no retry budget');
    assert.equal(blindSummary.firstFailedParticipant.routingDenialCause, null,
      'a failure that never stated a cause reports the absence, not a guess');
  });
