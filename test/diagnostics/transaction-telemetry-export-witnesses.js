/**
 * Witnesses of the transaction-path telemetry export (quest
 * transaction-path-telemetry-export; design record O1 section 8 as ruled,
 * rulings 1-9 and the stage rulings). One owner of every witness: the
 * node:test file transaction-telemetry-export.test.js and the sealed guard
 * scripts/checks/transaction-path-telemetry-export-guard.js both run these
 * functions, so the probe and the tests can never disagree.
 *
 * Each witness drives the real path through the node of
 * transaction-telemetry-witness-node.js, asserts that the path did what the
 * scenario needs, and only then reads the export. The product's vocabulary
 * comes from the contract modules (one definition); what the witnesses pin
 * is the contract itself: the route, the sequences and the bounds.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';

import {ADMIN_ROUTE} from '../../src/admin/admin-constants.js';
import {HTTP_STATUS, TABLES} from '../../src/constants/index.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {TRANSACTION_STATUS} from
  '../../src/query/distributed/distributed-transaction-coordinator-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_OPERATION,
  QUERY_SESSION,
} from '../../src/query/query-constants.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {recoveryDecisionColumns, recoveryRowsOf} from
  '../test-helpers/transaction-recovery-rows-fixture.js';
import {
  BOOT_INCARNATION,
  NODE_ID,
  PARTITION_ID,
  TABLE,
  TRANSACTION_ROUTE,
  cursorAfter,
  loadCollectionContract,
  loadHistogramContract,
  mutationsOf,
  openPgWireSession,
  runTransactionBlock,
  withTelemetryNode,
} from './transaction-telemetry-witness-node.js';

// --- The contract's bounds -----------------------------------------------------

const HISTOGRAM_BUCKET_COUNT = 23;
const HISTOGRAM_UPPER_BOUNDS_US = Object.freeze(Array.from(
  {length: HISTOGRAM_BUCKET_COUNT - 1}, (_, index) => 2 ** (index + 4)));
const SAMPLE_RING_CAPACITY = 512;
const ACCOUNTING_TOLERANCE_MS = 0.5;
const HISTOGRAM_SUM_TOLERANCE_MS = 1e-6;
// Offsets of one transaction are differences of one monotonic clock; a
// request's start is read after its operation's start, and a fan-out's span
// is read around its requests, so only floating point rounding separates them.
const CLOCK_ARITHMETIC_EPSILON_MS = 1e-6;
const OBSERVATION_UNITS = Object.freeze(new Set(['Ms', 'Count']));

// --- Fixture constants ------------------------------------------------------

const RESTARTED_BOOT_INCARNATION = 8;
const FANOUT_HOLD_MS = 5;
const RECOVERY_HOLD_MS = 15;
// A host timer may fire up to one millisecond before its delay (libuv
// millisecond granularity); a hold is therefore observed as at least this
// much less than it was armed for.
const TIMER_GRANULARITY_MS = 1;
const RECOVERY_START_POLLS = 2000;
const COLLECTION_DEADLINE_MS = 100;
const COLLECTION_SLACK_MS = 2000;
const WINDOW_FIRST_BATCH = 2;
const WINDOW_SECOND_BATCH = 3;
const RING_OVERFLOW = 8;
const RECOVERED_ID = 'a'.repeat(32);
const ROW_VALUE_A = 'Alice-telemetry-row';
const ROW_VALUE_B = 'Bob-telemetry-row';
const INSERT_A = `INSERT INTO ${TABLE} (id, name) VALUES ('u1', '${ROW_VALUE_A}')`;
const INSERT_B = `INSERT INTO ${TABLE} (id, name) VALUES ('u2', '${ROW_VALUE_B}')`;
const SELECT_A = `SELECT id FROM ${TABLE} WHERE id = 'u1'`;
const SELECT_PATTERN = /^\s*SELECT\b/iu;
const SQL_TEXT_MARKERS = Object.freeze(['INSERT INTO', 'SELECT id', ROW_VALUE_A, ROW_VALUE_B]);
const TAG_BEGIN = 'BEGIN';
const TAG_INSERT = 'INSERT 0 1';
const TAG_SELECT = 'SELECT 1';
const TAG_COMMIT = 'COMMIT';
const TAG_ROLLBACK = 'ROLLBACK';
const TAG_ERROR_PREFIX = 'ERROR ';
const ENGINE_SESSION = 'telemetry-engine-session';
const BUILD_FAILURE = 'telemetry answer build failed in the witness';

function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

// --- Assertions on the answer shape ------------------------------------------

function coordinatorSectionOf(contract, answer) {
  const section = answer?.sections?.[contract.TRANSACTION_TELEMETRY_SECTION.COORDINATOR];
  assert.equal(section?.availability?.state,
    contract.TRANSACTION_TELEMETRY_AVAILABILITY.MEASURED, 'the coordinator section is measured');
  return section;
}

function sampleOf(contract, answer, transactionId) {
  const sample = coordinatorSectionOf(contract, answer).samples.entries.find((entry) =>
    entry.identity?.transactionId === transactionId);
  assert.ok(sample, `a sample of transaction ${transactionId} is retained`);
  return sample;
}

function operationsOfKind(sample, kind) {
  return sample.operations.filter((operation) => operation.kind === kind);
}

function phaseOf(operation, phase) {
  const found = operation.subPhases.find((entry) => entry.phase === phase);
  assert.ok(found, `${operation.kind} reports its ${phase} sub-phase`);
  return found;
}

// The operation that was running when a request started, on the
// transaction's own clock (offsets from the transaction's start): operations
// run one at a time, so it is the latest one whose run had begun, and the
// request must start before that run ended.
function operationContaining(sample, request) {
  let running = null;
  for (const candidate of sample.operations) {
    const runStart = candidate.startOffsetMs + candidate.fifoWaitMs;
    if (runStart <= request.startOffsetMs + CLOCK_ARITHMETIC_EPSILON_MS) running = candidate;
  }
  assert.ok(running, `the ${request.operation} request starts inside the transaction`);
  const runEnd = running.startOffsetMs + running.fifoWaitMs + running.runMs;
  assert.ok(request.startOffsetMs <= runEnd + ACCOUNTING_TOLERANCE_MS,
    `the ${request.operation} request starts while the ${running.kind} operation runs`);
  return running;
}

// Ruling 49 (D2): a sample's participant requests are the executor's records
// joined by transactionId at read time, in request order.
function requestsOf(contract, entry, requestOperation) {
  assert.equal(entry.participantRequests?.state, contract.PARTICIPANT_REQUESTS_STATE.MEASURED,
    'the participant requests are joined from the delivery section');
  return entry.participantRequests.entries.filter((request) =>
    request.operation === requestOperation);
}

function assertSampleAccounting(contract, sample, label) {
  const {COMMIT, ROLLBACK} = contract.TRANSACTION_OPERATION_KIND;
  const operations = sample.operations;
  const fifo = sum(operations.map((operation) => operation.fifoWaitMs));
  const run = sum(operations.map((operation) => operation.runMs));
  const {totalMs, attributedMs, betweenOperationsMs, unattributedMs} = sample.accounting;
  for (const value of [totalMs, attributedMs, betweenOperationsMs, unattributedMs]) {
    assert.equal(Number.isFinite(value), true, `${label}: accounting values are numbers`);
  }
  assert.ok(Math.abs(attributedMs - (fifo + run)) <= ACCOUNTING_TOLERANCE_MS,
    `${label}: attributedMs is the FIFO wait plus the run time of its operations`);
  assert.ok(Math.abs(totalMs - (fifo + run + betweenOperationsMs + unattributedMs)) <=
    ACCOUNTING_TOLERANCE_MS, `${label}: the phases sum to totalMs`);
  assert.ok(unattributedMs >= -ACCOUNTING_TOLERANCE_MS,
    `${label}: the unattributed remainder is reported and not negative`);
  let previousOffset = 0;
  for (const operation of operations) {
    assert.ok(operation.fifoWaitMs >= 0 && operation.runMs >= 0,
      `${label}: ${operation.kind} durations are not negative`);
    assert.ok(operation.startOffsetMs >= previousOffset,
      `${label}: operations are in FIFO order`);
    previousOffset = operation.startOffsetMs;
  }
  for (const [kind, field] of [[COMMIT, 'commitUnattributedMs'],
    [ROLLBACK, 'rollbackUnattributedMs']]) {
    for (const terminal of operationsOfKind(sample, kind)) {
      const phases = sum(terminal.subPhases.map((phase) => phase.ms));
      assert.ok(Math.abs(terminal.runMs - (phases + terminal[field])) <=
        ACCOUNTING_TOLERANCE_MS, `${label}: ${kind} run time is its sub-phases plus ${field}`);
    }
  }
  assert.ok(sample.observationCount > 0, `${label}: the sample exports its observation count`);
}

function assertNoStatementText(answer) {
  const serialized = JSON.stringify(answer);
  for (const marker of SQL_TEXT_MARKERS) {
    assert.equal(serialized.includes(marker), false,
      `the answer carries no SQL text or row values (found ${marker})`);
  }
}

function assertHistogramSnapshot(snapshot, id) {
  assert.equal(Number.isInteger(snapshot?.count) && snapshot.count >= 0, true,
    `${id}: count is a non-negative integer`);
  if (snapshot.bucketCounts === undefined) return;
  assert.equal(snapshot.bucketCounts.length, HISTOGRAM_BUCKET_COUNT,
    `${id}: ${HISTOGRAM_BUCKET_COUNT} fixed buckets`);
  assert.equal(sum(snapshot.bucketCounts), snapshot.count, `${id}: buckets sum to count`);
  assert.equal(snapshot.sumMs >= 0, true, `${id}: sumMs is not negative`);
}

function observationCountOf(answer, id) {
  for (const section of Object.values(answer?.sections ?? {})) {
    const observation = section?.observations?.[id];
    if (observation !== undefined) return observation.count;
  }
  assert.fail(`observation ${id} is in no section of the answer`);
}

function observationCountsWithPrefix(answer, prefix) {
  const observations = Object.values(answer.sections).flatMap((section) =>
    Object.entries(section.observations ?? {}));
  return sum(observations.filter(([id]) => id.startsWith(prefix))
    .map(([, value]) => value.count));
}

// --- W1: the route answers a typed node answer -------------------------------

async function assertRouteRefusals(contract, node) {
  for (const query of ['sinceSequence=-1', 'sinceSequence=3', 'sinceSequence=3&bootIncarnation=7']) {
    const refused = await node.inject(`${TRANSACTION_ROUTE}?${query}`);
    assert.equal(refused.status, HTTP_STATUS.BAD_REQUEST,
      `an invalid cursor (${query}) is refused, typed`);
  }
  await withTelemetryNode({composeEngine: false}, async (bare) => {
    const uncomposed = await bare.readAnswer(0);
    for (const name of Object.values(contract.TRANSACTION_TELEMETRY_SECTION)) {
      assert.deepEqual(uncomposed.sections[name], {availability: {
        state: contract.TRANSACTION_TELEMETRY_AVAILABILITY.UNAVAILABLE,
        reason: contract.TRANSACTION_TELEMETRY_UNAVAILABLE_REASON.NOT_COMPOSED}},
      `a node without an engine names its ${name} section unavailable`);
    }
  });
  await withTelemetryNode({answerBuilder: null}, async (unbound) => {
    const unboundAnswer = await unbound.inject(TRANSACTION_ROUTE);
    assert.equal(unboundAnswer.status, HTTP_STATUS.SERVICE_UNAVAILABLE,
      'an admin runtime without the bound answer builder refuses, typed');
  });
  const throwing = () => {
    throw new Error(BUILD_FAILURE);
  };
  await withTelemetryNode({answerBuilder: throwing}, async (failing) => {
    const failed = await failing.inject(TRANSACTION_ROUTE);
    assert.deepEqual([failed.status, failed.body], [HTTP_STATUS.SERVICE_UNAVAILABLE,
      {error: BUILD_FAILURE}], 'a failed build answers 503 like the sibling routes');
  });
}

async function witnessRouteAnswer() {
  return withTelemetryNode({}, async (node) => {
    const answer = await node.readAnswer(0);
    assert.equal(ADMIN_ROUTE.TRANSACTION_DIAGNOSTICS, TRANSACTION_ROUTE,
      'the route is a sibling in ADMIN_ROUTE');
    const contract = await loadCollectionContract();
    assert.equal(answer.schemaVersion, contract.TRANSACTION_TELEMETRY_SCHEMA_VERSION);
    assert.equal(answer.nodeId, NODE_ID);
    assert.equal(answer.bootIncarnation, BOOT_INCARNATION);
    assert.equal(answer.sinceSequence, 0);
    for (const field of ['capturedAtEpochMs', 'capturedAtMonotonicMs',
      'timeOriginEpochMs', 'answerBuildMs']) {
      assert.equal(Number.isFinite(answer[field]) && answer[field] >= 0, true,
        `${field} is a non-negative number`);
    }
    const sections = Object.values(contract.TRANSACTION_TELEMETRY_SECTION);
    assert.deepEqual(Object.keys(answer.sections).sort(), [...sections].sort(),
      'the answer has exactly the catalogued sections');
    for (const name of sections) {
      const measured = answer.sections[name];
      assert.equal(measured.availability.state,
        contract.TRANSACTION_TELEMETRY_AVAILABILITY.MEASURED, `${name} is measured`);
      assert.equal(Number.isSafeInteger(measured.telemetryEpoch) &&
        measured.telemetryEpoch > 0, true, `${name} names its telemetry epoch`);
      const catalogued = contract.TRANSACTION_TELEMETRY_CATALOGUE
        .filter((entry) => entry.section === name)
        .map((entry) => entry.id).sort();
      assert.ok(catalogued.length > 0, `${name} has catalogued observations`);
      assert.deepEqual(Object.keys(measured.observations).sort(), catalogued,
        `${name} contains exactly its catalogued observations`);
      for (const id of catalogued) assertHistogramSnapshot(measured.observations[id], id);
    }
    const section = coordinatorSectionOf(contract, answer);
    assert.equal(section.samples.capacity, SAMPLE_RING_CAPACITY);
    assert.deepEqual(section.samples.entries, []);
    assert.equal(section.samples.droppedCount, 0);
    assert.deepEqual([section.withoutSample.entries, section.withoutSample.droppedCount],
      [[], 0], 'no transaction has completed without a sample');
    assert.deepEqual(contract.validateTransactionTelemetryAnswer(answer),
      {valid: true, reason: null}, 'the answer satisfies its own validator');
    await assertRouteRefusals(contract, node);
    return {answers: [answer]};
  });
}

// --- W2: accounting, through PgWireProtocolHandler ---------------------------

// The participant fan-outs of W2's PG-wire blocks are held, so each fan-out
// is measurably longer than a timer's granularity.
async function holdFanouts(message) {
  if (message.type === QUERY_OPERATION.TRANSACTION &&
      [QUERY_OPERATION.PREPARE, QUERY_OPERATION.COMMIT, QUERY_OPERATION.ROLLBACK]
        .includes(message.operation)) {
    await sleepMs(FANOUT_HOLD_MS);
  }
  return undefined;
}

// A fan-out sub-phase spans its participant requests: it is at least as long
// as the held request it contains.
function assertFanoutSpansRequest(operation, phase, request) {
  assert.ok(request.ms >= FANOUT_HOLD_MS - TIMER_GRANULARITY_MS,
    `the ${request.operation} request time is retained`);
  assert.ok(phaseOf(operation, phase).ms >= request.ms - CLOCK_ARITHMETIC_EPSILON_MS,
    `${phase} is measured around its ${request.operation} request`);
}

function assertTerminalPhasesMeasured(operation) {
  for (const {phase, ms} of operation.subPhases) {
    assert.ok(ms > 0, `${operation.kind} sub-phase ${phase} is measured, not zero`);
  }
}

function assertCommittedSample(contract, sample, pg, node) {
  const KIND = contract.TRANSACTION_OPERATION_KIND;
  const REQUEST = contract.PARTICIPANT_REQUEST_OPERATION;
  const PHASE = contract.TRANSACTION_SUB_PHASE;
  assert.equal(sample.outcome, TRANSACTION_STATUS.COMMITTED);
  assert.equal(sample.identity.sessionId, pg.sessionId,
    'the sample joins its PG-wire session by the existing session identity');
  assert.deepEqual(sample.operations.map((operation) => operation.kind),
    [KIND.BEGIN, KIND.WRITE, KIND.COMMIT]);
  assert.equal(sample.operationsOmittedCount, 0);
  for (const [operation, kind] of [[REQUEST.BEGIN, KIND.WRITE],
    [REQUEST.QUERY_WRITE, KIND.WRITE], [REQUEST.PREPARE, KIND.COMMIT],
    [REQUEST.COMMIT, KIND.COMMIT]]) {
    const requests = requestsOf(contract, sample, operation);
    assert.equal(requests.length, 1, `one ${operation} request`);
    assert.equal(requests[0].partitionId, PARTITION_ID);
    assert.equal(requests[0].outcome, contract.PARTICIPANT_REQUEST_OUTCOME.ACCEPTED);
    assert.ok(requests[0].attempts >= 1 && requests[0].ms >= 0);
    assert.equal(operationContaining(sample, requests[0]).kind, kind,
      `the ${operation} request ran inside the ${kind} operation`);
  }
  // The PREPARING and COMMITTING status writes are atomic with the freeze
  // and the decision, so they are not phases of their own.
  const [commit] = operationsOfKind(sample, KIND.COMMIT);
  assert.deepEqual(commit.subPhases.map((phase) => phase.phase), [PHASE.FREEZE,
    PHASE.PREPARE_FANOUT, PHASE.PREPARED_STATUS, PHASE.DECISION, PHASE.COMMIT_FANOUT,
    PHASE.SETTLEMENT], 'COMMIT reports the sub-phases that ran, in order');
  assertTerminalPhasesMeasured(commit);
  assertFanoutSpansRequest(commit, PHASE.PREPARE_FANOUT,
    requestsOf(contract, sample, REQUEST.PREPARE)[0]);
  assertFanoutSpansRequest(commit, PHASE.COMMIT_FANOUT,
    requestsOf(contract, sample, REQUEST.COMMIT)[0]);
  assert.equal(sample.writeStatementCount, 1);
  assert.ok(sample.writeStatementsMs > 0, 'the write statement is timed');
  assert.equal(sample.readStatementCount, 0);
  assert.equal(sample.participantCount, 1);
  const submissions = sample.metadata.submissionCountByPurpose;
  assert.deepEqual(Object.keys(submissions).sort(),
    Object.values(contract.TRANSACTION_METADATA_PERSIST_PURPOSE).sort());
  assert.equal(sum(Object.values(submissions)),
    mutationsOf(node.gateway, sample.identity.transactionId).length,
    'metadata submissions by purpose account for every gateway mutation');
  assertSampleAccounting(contract, sample, 'committed transaction');
}

function assertRolledBackSample(contract, sample, pg) {
  const KIND = contract.TRANSACTION_OPERATION_KIND;
  const PHASE = contract.TRANSACTION_SUB_PHASE;
  assert.equal(sample.outcome, TRANSACTION_STATUS.ROLLED_BACK);
  assert.equal(sample.identity.sessionId, pg.sessionId);
  assert.deepEqual(sample.operations.map((operation) => operation.kind),
    [KIND.BEGIN, KIND.WRITE, KIND.ROLLBACK]);
  // Ruling 56 (D10): ROLLBACK sub-phases, enumerated like COMMIT.
  const [rollback] = operationsOfKind(sample, KIND.ROLLBACK);
  assert.deepEqual(rollback.subPhases.map((phase) => phase.phase), [PHASE.FREEZE,
    PHASE.DECISION, PHASE.ROLLBACK_FANOUT, PHASE.SETTLEMENT],
  'ROLLBACK reports its sub-phases in order');
  assertTerminalPhasesMeasured(rollback);
  const [request] = requestsOf(contract, sample, contract.PARTICIPANT_REQUEST_OPERATION.ROLLBACK);
  assert.ok(request, 'the ROLLBACK participant request is joined to the sample');
  assert.equal(operationContaining(sample, request).kind, KIND.ROLLBACK);
  assertFanoutSpansRequest(rollback, PHASE.ROLLBACK_FANOUT, request);
  assertSampleAccounting(contract, sample, 'rolled-back transaction');
}

async function witnessCommitAndRollbackAccounting(contract) {
  return withTelemetryNode({onDeliver: holdFanouts}, async (node) => {
    const pg = await openPgWireSession(node.engine);
    try {
      const committedId = await runTransactionBlock(pg, ['BEGIN', INSERT_A, 'COMMIT'],
        [TAG_BEGIN, TAG_INSERT, TAG_COMMIT]);
      const rolledBackId = await runTransactionBlock(pg, ['BEGIN', INSERT_B, 'ROLLBACK'],
        [TAG_BEGIN, TAG_INSERT, TAG_ROLLBACK]);
      assert.equal(node.deliveries.some((message) =>
        message.operation === QUERY_OPERATION.ROLLBACK), true,
      'precondition: the rolled-back transaction fanned out a participant ROLLBACK');
      const answer = await node.readAnswer(0);
      assert.equal(coordinatorSectionOf(contract, answer).samples.entries.length, 2);
      assertCommittedSample(contract, sampleOf(contract, answer, committedId), pg, node);
      assertRolledBackSample(contract, sampleOf(contract, answer, rolledBackId), pg);
      assertNoStatementText(answer);
      return answer;
    } finally {
      pg.close();
    }
  });
}

function typedParticipantFailure(message, partitionId, fields) {
  return {success: false, operation: message.operation, partitionId,
    transactionId: message.transactionId, participantId: message.participantId,
    failureCode: PARTICIPANT_TRANSACTION_FAILURE_CODE.NOT_ACTIVE, ...fields};
}

function createRetryMissScript() {
  const seen = {prepare: 0, commit: 0, outcome: 0};
  const onDeliver = (message, partitionId) => {
    if (message.type !== QUERY_OPERATION.TRANSACTION) return undefined;
    if (message.operation === QUERY_OPERATION.PREPARE && ++seen.prepare === 1) {
      return typedParticipantFailure(message, partitionId, {error: 'not yet active'});
    }
    if (message.operation === QUERY_OPERATION.COMMIT && ++seen.commit === 1) {
      return typedParticipantFailure(message, partitionId,
        {errorCode: QUERY_ERROR_CODE.NO_TRANSACTION, error: 'commit answer lost'});
    }
    if (message.operation === QUERY_OPERATION.TRANSACTION_OUTCOME) {
      seen.outcome += 1;
      return {...answerParticipantTransactionRequest(message, partitionId),
        durable: true, state: TRANSACTION_STATUS.COMMITTED, outcome: TRANSACTION_STATUS.COMMITTED};
    }
    return undefined;
  };
  return {seen, onDeliver};
}

// The gateway applies the first participant-set update but its answer does
// not certify the one changed row, so the engine reads the row back.
function loseFirstParticipantSetCertification(gateway) {
  const counters = {uncertified: 0, readbacks: 0};
  const submit = gateway.submitMutation.bind(gateway);
  gateway.submitMutation = async (mutation, options) => {
    const result = await submit(mutation, options);
    if (mutation.tableName !== TABLES.SQL_TRANSACTIONS ||
        mutation.data?.participant_set_text === undefined ||
        counters.uncertified > 0) {
      return result;
    }
    counters.uncertified += 1;
    const {affectedRows: _rows, changes: _changes, partitionResult: _partition,
      ...uncertified} = result;
    return uncertified;
  };
  const read = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (...args) => {
    counters.readbacks += 1;
    return read(...args);
  };
  return counters;
}

async function witnessRetryMissAndReadback(contract) {
  const REQUEST = contract.PARTICIPANT_REQUEST_OPERATION;
  const OUTCOME = contract.PARTICIPANT_REQUEST_OUTCOME;
  const NAME = contract.TRANSACTION_TELEMETRY_OBSERVATION;
  const script = createRetryMissScript();
  return withTelemetryNode({onDeliver: script.onDeliver}, async (node) => {
    const lost = loseFirstParticipantSetCertification(node.gateway);
    const pg = await openPgWireSession(node.engine);
    try {
      const transactionId = await runTransactionBlock(pg, ['BEGIN', INSERT_A, 'COMMIT'],
        [TAG_BEGIN, TAG_INSERT, TAG_COMMIT]);
      assert.deepEqual(script.seen, {prepare: 2, commit: 1, outcome: 1},
        'precondition: PREPARE was retried and the lost COMMIT answer was read back');
      assert.equal(lost.readbacks >= 1, true,
        'precondition: the uncertified participant-set update was read back');
      const answer = await node.readAnswer(0);
      const sample = sampleOf(contract, answer, transactionId);
      const outcomesOf = (operation) => requestsOf(contract, sample, operation).map((request) => {
        assert.equal(operationContaining(sample, request).kind,
          contract.TRANSACTION_OPERATION_KIND.COMMIT);
        return request.outcome;
      });
      assert.deepEqual(outcomesOf(REQUEST.PREPARE), [OUTCOME.FAILED, OUTCOME.ACCEPTED]);
      assert.deepEqual(outcomesOf(REQUEST.COMMIT), [OUTCOME.FAILED]);
      assert.deepEqual(outcomesOf(REQUEST.TRANSACTION_OUTCOME), [OUTCOME.ACCEPTED]);
      assert.equal(sample.metadata.readbackCount, lost.readbacks,
        'metadata readbacks have their real producer');
      assert.equal(observationCountOf(answer, NAME.RETRY_BACKOFF), 1,
        'the participant retry backoff is recorded separately');
      assert.equal(observationCountOf(answer,
        `${NAME.PARTICIPANT_REQUEST}.${REQUEST.TRANSACTION_OUTCOME}`), 1);
      assert.equal(observationCountOf(answer, NAME.METADATA_READBACK), lost.readbacks);
      assertSampleAccounting(contract, sample, 'retried transaction');
      return answer;
    } finally {
      pg.close();
    }
  });
}

function refusePrepare(message, partitionId) {
  if (message.type !== QUERY_OPERATION.TRANSACTION ||
      message.operation !== QUERY_OPERATION.PREPARE) {
    return undefined;
  }
  return typedParticipantFailure(message, partitionId, {
    failureCode: PARTICIPANT_TRANSACTION_FAILURE_CODE.PREPARE_REFUSED,
    refusalCause: PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT,
    error: 'prepare refused',
  });
}

function refusedPrepareFailure() {
  return {stage: TRANSACTION_STATUS.PREPARING,
    refusalCause: PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT,
    errorCode: QUERY_ERROR_CODE.TRANSACTION_CONFLICT};
}

function refusedPrepareStageAndCode() {
  const {stage, errorCode} = refusedPrepareFailure();
  return {stage, errorCode};
}

async function witnessRefusedPrepareFailure(contract) {
  const PHASE = contract.TRANSACTION_SUB_PHASE;
  const REQUEST = contract.PARTICIPANT_REQUEST_OPERATION;
  const OUTCOME = contract.PARTICIPANT_REQUEST_OUTCOME;
  return withTelemetryNode({onDeliver: refusePrepare}, async (node) => {
    const pg = await openPgWireSession(node.engine);
    try {
      const tags = [];
      let transactionId = null;
      for (const sql of ['BEGIN', INSERT_A, 'COMMIT']) {
        tags.push(await pg.run(sql));
        transactionId ??= pg.transactionId();
      }
      assert.deepEqual(tags.slice(0, 2), [TAG_BEGIN, TAG_INSERT],
        'precondition: the block reached COMMIT');
      assert.equal(tags[2].startsWith(TAG_ERROR_PREFIX), true,
        'precondition: the refused PREPARE fails the COMMIT');
      const answer = await node.readAnswer(0);
      const sample = sampleOf(contract, answer, transactionId);
      assert.equal(sample.outcome, TRANSACTION_STATUS.ROLLED_BACK);
      // Ruling 56 (D11): the sample names the failure the COMMIT ended in.
      assert.deepEqual(sample.failure, refusedPrepareFailure());
      const [commit] = operationsOfKind(sample, contract.TRANSACTION_OPERATION_KIND.COMMIT);
      assert.deepEqual(commit.subPhases.map((phase) => phase.phase), [PHASE.FREEZE,
        PHASE.PREPARE_FANOUT, PHASE.DECISION, PHASE.ROLLBACK_FANOUT, PHASE.SETTLEMENT]);
      assert.deepEqual(requestsOf(contract, sample, REQUEST.PREPARE).map((request) =>
        request.outcome), [OUTCOME.FAILED]);
      assert.deepEqual(requestsOf(contract, sample, REQUEST.ROLLBACK).map((request) =>
        request.outcome), [OUTCOME.ACCEPTED]);
      assertSampleAccounting(contract, sample, 'refused transaction');
      return answer;
    } finally {
      pg.close();
    }
  });
}

// --- W2: answers and failures of re-driven decisions ---------------------------

function engineStep(node, sql, transactionId = undefined) {
  return node.engine.executeQuery(sql, [],
    {sessionId: ENGINE_SESSION, expectedTransactionId: transactionId});
}

function answerFieldsOf(result) {
  return {success: result.success, stage: result.stage, errorCode: result.errorCode};
}

// The first participant ROLLBACK is refused; a later drive succeeds.
function refuseFirstRollback(also = () => undefined) {
  let rollbacks = 0;
  return (message, partitionId) => {
    if (message.type === QUERY_OPERATION.TRANSACTION &&
        message.operation === QUERY_OPERATION.ROLLBACK && ++rollbacks === 1) {
      return typedParticipantFailure(message, partitionId,
        {failureCode: 'ROLLBACK_REFUSED_FOR_WITNESS', error: 'rollback refused'});
    }
    return also(message, partitionId);
  };
}

async function runEngineTransaction(node, terminals) {
  const begun = await engineStep(node, 'BEGIN');
  const written = await engineStep(node, INSERT_A);
  assert.equal(begun.success && written.success, true, 'precondition: the write ran');
  const answers = [];
  for (const sql of terminals) answers.push(await engineStep(node, sql, begun.transactionId));
  return {transactionId: begun.transactionId, answers};
}

// S6: a refused PREPARE whose rollback fan-out fails, then COMMIT again. The
// second COMMIT re-drives the recorded ROLLBACK; its answer is computed after
// that rollback, and the first failure stays on the sample.
async function witnessRefusedPrepareRedriven(contract) {
  return withTelemetryNode({onDeliver: refuseFirstRollback(refusePrepare)}, async (node) => {
    const {transactionId, answers} = await runEngineTransaction(node, ['COMMIT', 'COMMIT']);
    assert.deepEqual(answers.map(answerFieldsOf), [
      {success: false, ...refusedPrepareStageAndCode()},
      {success: false, stage: TRANSACTION_STATUS.ROLLED_BACK,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE},
    ], 'the answers are those of the base: the re-driven COMMIT answers ROLLED_BACK');
    const answer = await node.readAnswer(0);
    const sample = sampleOf(contract, answer, transactionId);
    assert.equal(sample.outcome, TRANSACTION_STATUS.ROLLED_BACK);
    assert.deepEqual(sample.failure, refusedPrepareFailure(),
      'a later drive of the recorded decision does not replace the first failure');
    assertSampleAccounting(contract, sample, 're-driven refused transaction');
    return answer;
  });
}

// S7: a client ROLLBACK whose fan-out fails, then COMMIT: the COMMIT re-drives
// the recorded ROLLBACK and answers its stage after the rollback.
async function witnessClientRollbackRedriven(contract) {
  return withTelemetryNode({onDeliver: refuseFirstRollback()}, async (node) => {
    const {transactionId, answers} = await runEngineTransaction(node, ['ROLLBACK', 'COMMIT']);
    assert.deepEqual(answers.map(answerFieldsOf), [
      {success: false, stage: undefined,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE},
      {success: false, stage: TRANSACTION_STATUS.ROLLED_BACK,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE},
    ], 'the answers are those of the base: the COMMIT answers ROLLED_BACK');
    const answer = await node.readAnswer(0);
    const sample = sampleOf(contract, answer, transactionId);
    assert.equal(sample.outcome, TRANSACTION_STATUS.ROLLED_BACK);
    assert.deepEqual(sample.failure, {stage: TRANSACTION_STATUS.ROLLING_BACK,
      refusalCause: contract.TRANSACTION_FAILURE_REFUSAL.NOT_REFUSED,
      errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE},
    'the failure names the stage it was decided in');
    assertSampleAccounting(contract, sample, 're-driven client rollback');
    return answer;
  });
}

function answerWaitCycle(message, partitionId) {
  if (message.type === QUERY_OPERATION.TRANSACTION) return undefined;
  return {success: false, deadlockDetected: true, partitionId, error: 'wait cycle'};
}

// A write chosen as a wait-cycle victim rolls its transaction back inside the
// statement: the statement still counts.
async function witnessStatementThatEndsItsTransaction(contract) {
  const KIND = contract.TRANSACTION_OPERATION_KIND;
  return withTelemetryNode({onDeliver: answerWaitCycle}, async (node) => {
    const begun = await engineStep(node, 'BEGIN');
    const written = await engineStep(node, INSERT_A);
    assert.equal(written.success === false && written.deadlockDetected === true, true,
      'precondition: the write was a wait-cycle victim');
    assert.equal(node.engine.transactionCoordinator.transactionsBySession.has(ENGINE_SESSION),
      false, 'precondition: the write ended its transaction');
    const answer = await node.readAnswer(0);
    const sample = sampleOf(contract, answer, begun.transactionId);
    assert.equal(sample.outcome, TRANSACTION_STATUS.ROLLED_BACK);
    assert.deepEqual(sample.operations.map((operation) => operation.kind),
      [KIND.BEGIN, KIND.WRITE]);
    assert.equal(sample.writeStatementCount, 1, 'the write that ended it is counted');
    assert.ok(sample.writeStatementsMs > 0, 'and timed');
    assertSampleAccounting(contract, sample, 'wait-cycle victim');
    return answer;
  });
}

/**
 * W2: a committed and a rolled-back transaction through the PG-wire handler
 * have measured sub-phases that span their held fan-outs and phases that sum
 * to totalMs; a third drives the retry backoff, the TRANSACTION_OUTCOME
 * request and the metadata readback; a fourth, whose PREPARE is refused,
 * names its failure (D11). Re-driven decisions answer as the base did and
 * keep their first failure (S6, S7), and a statement that ends its
 * transaction counts.
 * @return {Promise<{answers: Object[]}>}
 */
async function witnessAccounting() {
  const contract = await loadCollectionContract();
  const answers = [];
  for (const witness of [witnessCommitAndRollbackAccounting, witnessRetryMissAndReadback,
    witnessRefusedPrepareFailure, witnessRefusedPrepareRedriven, witnessClientRollbackRedriven,
    witnessStatementThatEndsItsTransaction]) {
    answers.push(await witness(contract));
  }
  return {answers};
}

// --- W3: in-transaction reads are timed and counted --------------------------

async function witnessReads() {
  const contract = await loadCollectionContract();
  const KIND = contract.TRANSACTION_OPERATION_KIND;
  const REQUEST = contract.PARTICIPANT_REQUEST_OPERATION;
  const NAME = contract.TRANSACTION_TELEMETRY_OBSERVATION;
  return withTelemetryNode({}, async (node) => {
    const pg = await openPgWireSession(node.engine);
    try {
      const transactionId = await runTransactionBlock(pg,
        ['BEGIN', SELECT_A, INSERT_A, SELECT_A, 'COMMIT'],
        [TAG_BEGIN, TAG_SELECT, TAG_INSERT, TAG_SELECT, TAG_COMMIT]);
      const transactionalReads = node.deliveries.filter((message) =>
        message.transactionId === transactionId && SELECT_PATTERN.test(message.sql || ''));
      assert.equal(transactionalReads.length, 2,
        'precondition: both reads reached the participant inside the transaction');
      const answer = await node.readAnswer(0);
      const sample = sampleOf(contract, answer, transactionId);
      assert.deepEqual(sample.operations.map((operation) => operation.kind),
        [KIND.BEGIN, KIND.READ, KIND.WRITE, KIND.READ, KIND.COMMIT]);
      assert.equal(sample.readStatementCount, 2, 'in-transaction reads are counted');
      assert.ok(sample.readStatementsMs > 0, 'in-transaction reads are timed');
      assert.equal(sample.writeStatementCount, 1);
      const reads = requestsOf(contract, sample, REQUEST.QUERY_READ);
      assert.equal(reads.length, 2, 'each read reports its participant request');
      for (const request of reads) {
        assert.equal(request.partitionId, PARTITION_ID);
        assert.equal(request.outcome, contract.PARTICIPANT_REQUEST_OUTCOME.ACCEPTED);
        assert.equal(operationContaining(sample, request).kind, KIND.READ);
      }
      assert.ok(observationCountOf(answer, `${NAME.RUN}.${KIND.READ}`) >= 2);
      assert.ok(observationCountOf(answer, `${NAME.PARTICIPANT_REQUEST}.${REQUEST.QUERY_READ}`) >=
        2);
      assertSampleAccounting(contract, sample, 'read transaction');
      return {answers: [answer]};
    } finally {
      pg.close();
    }
  });
}

// --- W4: a RECOVERY operation holds the lane ----------------------------------

function seedRecoveredTransaction(node) {
  const rows = recoveryRowsOf({transactionId: RECOVERED_ID, sessionId: QUERY_SESSION.DEFAULT,
    overrides: {status: TRANSACTION_STATUS.COMMITTING,
      ...recoveryDecisionColumns(RECOVERED_ID, [PARTITION_ID])}});
  node.engine.transactionCoordinator.recoverFromSystemTables(rows);
  rows.transactions.forEach((row) => node.gateway.seed(TABLES.SQL_TRANSACTIONS, row));
  rows.participants.forEach((row) =>
    node.gateway.seed(TABLES.SQL_TRANSACTION_PARTICIPANTS, row));
}

// Ruling for B4: a transaction restored from rows has no sample; it is
// counted by its typed reason, its metadata writes are recorded at node level
// and in its entry, and its participant request is attributed to that entry.
function assertRecoveredWithoutSample(contract, answer, node) {
  const reason = contract.TRANSACTION_WITHOUT_SAMPLE_REASON.RECOVERED_FROM_ROWS;
  const NAME = contract.TRANSACTION_TELEMETRY_OBSERVATION;
  const section = coordinatorSectionOf(contract, answer);
  assert.equal(section.samples.entries.some((sample) =>
    sample.identity.transactionId === RECOVERED_ID), false, 'the recovered transaction has no sample');
  assert.equal(observationCountOf(answer, `${NAME.COMPLETED_WITHOUT_SAMPLE}.${reason}`), 1,
    'it is counted as completed without a sample, by its typed reason');
  const entry = section.withoutSample.entries.find((candidate) =>
    candidate.identity.transactionId === RECOVERED_ID);
  assert.ok(entry, 'its entry is retained');
  assert.deepEqual([entry.reason, entry.outcome], [reason, TRANSACTION_STATUS.COMMITTED]);
  const recoveredMutations = mutationsOf(node.gateway, RECOVERED_ID).length;
  assert.equal(recoveredMutations, 3, 'precondition: recovery made three gateway mutations');
  assert.equal(sum(Object.values(entry.metadata.submissionCountByPurpose)), recoveredMutations,
    'its entry accounts for every gateway mutation it made');
  assert.equal(observationCountsWithPrefix(answer, `${NAME.METADATA_PERSIST}.`),
    node.gateway.mutations.length, 'every metadata write of the node is recorded at node level');
  assert.deepEqual(requestsOf(contract, entry, contract.PARTICIPANT_REQUEST_OPERATION.COMMIT)
    .map((request) => request.outcome), [contract.PARTICIPANT_REQUEST_OUTCOME.ACCEPTED],
  'its participant COMMIT is attributed to its entry');
}

async function witnessFifoWait() {
  const contract = await loadCollectionContract();
  const KIND = contract.TRANSACTION_OPERATION_KIND;
  const NAME = contract.TRANSACTION_TELEMETRY_OBSERVATION;
  const hold = Promise.withResolvers();
  let recoveryHolding = false;
  const onDeliver = async (message) => {
    if (message.transactionId === RECOVERED_ID) {
      recoveryHolding = true;
      await hold.promise;
    }
    return undefined;
  };
  return withTelemetryNode({onDeliver}, async (node) => {
    seedRecoveredTransaction(node);
    const resumed = node.engine.transactionCoordinator.resumeRecoveredTransactions();
    for (let polls = 0; !recoveryHolding && polls < RECOVERY_START_POLLS; polls += 1) {
      await sleepMs(1);
    }
    assert.equal(recoveryHolding, true,
      'precondition: recovery is holding the DEFAULT session lane');
    const queuedAt = performance.now();
    const beginning = node.engine.executeQuery('BEGIN', [], {});
    await sleepMs(RECOVERY_HOLD_MS);
    hold.resolve();
    const replay = await resumed;
    const begun = await beginning;
    const beginWaitMs = performance.now() - queuedAt;
    assert.equal(replay.resumed, 1, 'precondition: recovery completed the recorded COMMIT');
    assert.equal(begun.success, true, 'precondition: BEGIN ran after recovery');
    assert.ok(beginWaitMs >= RECOVERY_HOLD_MS - TIMER_GRANULARITY_MS,
      'precondition: BEGIN waited behind recovery');
    const committed = await node.engine.executeQuery('COMMIT', [],
      {expectedTransactionId: begun.transactionId});
    assert.equal(committed.success, true, 'precondition: the user transaction committed');
    const answer = await node.readAnswer(0);
    const sample = sampleOf(contract, answer, begun.transactionId);
    assert.equal(sample.identity.sessionId, QUERY_SESSION.DEFAULT);
    const [begin] = sample.operations;
    assert.equal(begin.kind, KIND.BEGIN);
    assert.ok(begin.fifoWaitMs >= RECOVERY_HOLD_MS - TIMER_GRANULARITY_MS,
      'the user operation shows the recovery hold as its FIFO wait');
    assert.ok(begin.fifoWaitMs <= beginWaitMs + ACCOUNTING_TOLERANCE_MS,
      'the FIFO wait is bounded by the observed wait');
    assert.ok(observationCountOf(answer, `${NAME.FIFO_WAIT}.${KIND.RECOVERY}`) >= 1);
    assert.ok(observationCountOf(answer, `${NAME.RUN}.${KIND.RECOVERY}`) >= 1);
    assertSampleAccounting(contract, sample, 'transaction queued behind recovery');
    assertRecoveredWithoutSample(contract, answer, node);
    return {answers: [answer]};
  });
}

// --- W7: the window -----------------------------------------------------------

async function commitEmptyTransactions(engine, sessionId, count) {
  for (let index = 0; index < count; index += 1) {
    const begun = await engine.executeQuery('BEGIN', [], {sessionId});
    const committed = await engine.executeQuery('COMMIT', [],
      {sessionId, expectedTransactionId: begun.transactionId});
    assert.equal(begun.success && committed.success, true,
      'precondition: the empty transaction commits');
  }
}

async function witnessHistogramLayout() {
  const histogram = await loadHistogramContract();
  assert.equal(histogram.TELEMETRY_HISTOGRAM_BUCKET_COUNT, HISTOGRAM_BUCKET_COUNT);
  assert.deepEqual([...histogram.TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US],
    HISTOGRAM_UPPER_BOUNDS_US, 'upper bounds 2^k microseconds, k = 4..25');
  const recorded = histogram.createTelemetryHistogram();
  const before = histogram.snapshotTelemetryHistogram(recorded);
  for (const ms of [0, 0.008, 0.024, 1, 40000]) {
    histogram.recordTelemetryHistogram(recorded, ms);
  }
  const delta = histogram.subtractTelemetryHistogramSnapshots(
    histogram.snapshotTelemetryHistogram(recorded), before);
  const expectedBuckets = Array(HISTOGRAM_BUCKET_COUNT).fill(0);
  expectedBuckets[0] = 2;
  expectedBuckets[1] = 1;
  expectedBuckets[6] = 1;
  expectedBuckets[HISTOGRAM_BUCKET_COUNT - 1] = 1;
  assert.deepEqual(delta.bucketCounts, expectedBuckets,
    'a delta is a bucket-wise subtraction over the fixed layout');
  assert.equal(delta.count, 5);
  assert.ok(Math.abs(delta.sumMs - 40001.032) < HISTOGRAM_SUM_TOLERANCE_MS);
}

// A cursor read in another window is refused with its typed reason, never
// answered as an empty page.
async function assertForeignCursorsRefused(contract, node, cursor) {
  const REFUSAL = contract.TRANSACTION_TELEMETRY_CURSOR_REFUSAL;
  for (const [foreign, reason] of [
    [{...cursor, bootIncarnation: cursor.bootIncarnation + 1}, REFUSAL.OTHER_BOOT_INCARNATION],
    [{...cursor, telemetryEpoch: cursor.telemetryEpoch + 1}, REFUSAL.OTHER_TELEMETRY_EPOCH],
  ]) {
    const refused = await node.readCursor(foreign);
    assert.deepEqual([refused.status, refused.body.reason], [HTTP_STATUS.CONFLICT, reason],
      `a cursor of another window is refused: ${reason}`);
    assert.equal(refused.body.bootIncarnation, BOOT_INCARNATION, 'the refusal names this window');
  }
}

/**
 * W7: two reads give a delta, the cursor returns exactly the new samples,
 * overflowing the ring reports droppedCount, a changed incarnation or store
 * is INCOMPARABLE_RESTARTED, and a cursor of another window is refused.
 * @return {Promise<{answers: Object[]}>}
 */
async function witnessWindow() {
  const contract = await loadCollectionContract();
  const WINDOW = contract.TRANSACTION_TELEMETRY_WINDOW_STATE;
  const COORDINATOR = contract.TRANSACTION_TELEMETRY_SECTION.COORDINATOR;
  const beginRun = `${contract.TRANSACTION_TELEMETRY_OBSERVATION.RUN}.` +
    contract.TRANSACTION_OPERATION_KIND.BEGIN;
  await witnessHistogramLayout();
  const sessionId = 'telemetry-window-session';
  return withTelemetryNode({}, async (node) => {
    await commitEmptyTransactions(node.engine, sessionId, WINDOW_FIRST_BATCH);
    const first = await node.readAnswer(0);
    const firstSamples = coordinatorSectionOf(contract, first).samples;
    assert.deepEqual(firstSamples.entries.map((entry) => entry.completionSequence), [1, 2]);
    await commitEmptyTransactions(node.engine, sessionId, WINDOW_SECOND_BATCH);
    const second = await node.readAnswer(cursorAfter(first));
    const secondSamples = coordinatorSectionOf(contract, second).samples;
    assert.deepEqual(secondSamples.entries.map((entry) => entry.completionSequence),
      [3, 4, 5], 'the cursor returns exactly the new samples');
    assert.equal(secondSamples.droppedCount, 0);
    const window = contract.deriveTransactionTelemetryWindow(first, second);
    assert.equal(window.state, WINDOW.COMPARABLE);
    assert.equal(window.sections[COORDINATOR].observations[beginRun].count,
      WINDOW_SECOND_BATCH, 'two reads give a delta');
    await commitEmptyTransactions(node.engine, sessionId, SAMPLE_RING_CAPACITY + RING_OVERFLOW);
    const third = await node.readAnswer(cursorAfter(second));
    const thirdSamples = coordinatorSectionOf(contract, third).samples;
    assert.equal(thirdSamples.entries.length, SAMPLE_RING_CAPACITY);
    assert.equal(thirdSamples.droppedCount, RING_OVERFLOW,
      'overflowing the ring reports droppedCount');
    assert.equal(thirdSamples.firstRetainedSequence,
      secondSamples.lastCompletionSequence + RING_OVERFLOW + 1);
    await assertForeignCursorsRefused(contract, node, cursorAfter(third));
    const restarted = await withTelemetryNode({bootIncarnation: RESTARTED_BOOT_INCARNATION},
      async (restartedNode) => {
        const stale = await restartedNode.readCursor(cursorAfter(third));
        assert.deepEqual([stale.status, stale.body.reason], [HTTP_STATUS.CONFLICT,
          contract.TRANSACTION_TELEMETRY_CURSOR_REFUSAL.OTHER_BOOT_INCARNATION],
        'a cursor read before a restart is refused after it');
        return restartedNode.readAnswer(0);
      });
    const incomparable = contract.deriveTransactionTelemetryWindow(third, restarted);
    assert.equal(incomparable.state, WINDOW.INCOMPARABLE_RESTARTED);
    assert.equal(incomparable.sections, undefined, 'no delta across a restart');
    // Ruling 56 (D13): a store created again under the same boot incarnation
    // has a new telemetry epoch and is incomparable exactly like a restart.
    const replaced = await withTelemetryNode({}, (replacedNode) => replacedNode.readAnswer(0));
    assert.equal(replaced.bootIncarnation, third.bootIncarnation);
    assert.notEqual(replaced.sections[COORDINATOR].telemetryEpoch,
      third.sections[COORDINATOR].telemetryEpoch);
    const replacedWindow = contract.deriveTransactionTelemetryWindow(third, replaced);
    assert.equal(replacedWindow.state, WINDOW.INCOMPARABLE_RESTARTED);
    assert.equal(replacedWindow.sections, undefined, 'no delta across a replaced store');
    return {answers: [first, second, third]};
  });
}

// --- W8: collection from a list of nodes --------------------------------------

function refusedConnectionError() {
  const error = new Error('connect ECONNREFUSED 127.0.0.1:9');
  error.code = 'ECONNREFUSED';
  return error;
}

/**
 * W8: one typed entry per node: one answers, one refuses the connection,
 * one times out, one refuses over HTTP, one answers malformed and one
 * answers for another node.
 * @return {Promise<{answers: Object[]}>}
 */
async function witnessCollection() {
  const contract = await loadCollectionContract();
  const STATE = contract.TRANSACTION_TELEMETRY_NODE_STATE;
  return withTelemetryNode({}, async (node) => {
    const requested = [];
    let timedOutSignal = null;
    const injectRoute = (url) => {
      const {pathname, search} = new URL(url);
      return node.inject(`${pathname}${search}`);
    };
    // The answering node is the real node; node-f is asked but the answer
    // that comes back is the real node's (another node answered).
    const answerers = new Map([
      [NODE_ID, injectRoute],
      ['node-b', async () => {
        throw refusedConnectionError();
      }],
      ['node-c', (_url, signal) => {
        timedOutSignal = signal;
        return new Promise(() => {});
      }],
      ['node-d', async () => ({status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        body: {error: 'unavailable'}})],
      ['node-e', async () => ({status: HTTP_STATUS.OK, body: {schemaVersion: 1, nodeId: 'node-e'}})],
      ['node-f', injectRoute],
    ]);
    const nodes = [...answerers.keys()].map((nodeId) => ({nodeId,
      adminUrl: `http://${nodeId}.invalid:8080`, sinceSequence: 0}));
    const startedAt = performance.now();
    const entries = await contract.collectTransactionTelemetry({
      nodes,
      deadlineMs: COLLECTION_DEADLINE_MS,
      fetchAnswer: ({nodeId, url, signal}) => {
        requested.push({nodeId, url});
        return answerers.get(nodeId)(url, signal);
      },
    });
    const elapsedMs = performance.now() - startedAt;
    assert.ok(elapsedMs < COLLECTION_DEADLINE_MS + COLLECTION_SLACK_MS,
      'collection is bounded by its deadline');
    assert.equal(requested.find((entry) => entry.nodeId === NODE_ID)?.url,
      `http://${NODE_ID}.invalid:8080${TRANSACTION_ROUTE}?sinceSequence=0`,
      'the collection function owns the route and the cursor parameter');
    assert.deepEqual(entries.map((entry) => [entry.nodeId, entry.state]), [
      [NODE_ID, STATE.ANSWERED],
      ['node-b', STATE.UNREACHABLE],
      ['node-c', STATE.TIMED_OUT],
      ['node-d', STATE.HTTP_REFUSED],
      ['node-e', STATE.MALFORMED],
      ['node-f', STATE.MALFORMED],
    ], 'one typed entry per node, in the order asked');
    const [answered, unreachable, timedOut, refused, malformed, misrouted] = entries;
    assert.equal(answered.answer.nodeId, NODE_ID);
    assert.equal(unreachable.errorCode, 'ECONNREFUSED');
    assert.equal(timedOut.deadlineMs, COLLECTION_DEADLINE_MS);
    assert.equal(timedOutSignal?.aborted, true, 'the timed-out request is cancelled');
    assert.equal(refused.httpStatus, HTTP_STATUS.SERVICE_UNAVAILABLE);
    for (const entry of [malformed, misrouted]) {
      assert.equal(typeof entry.reason, 'string', 'a malformed answer names its reason');
    }
    await assert.rejects(contract.collectTransactionTelemetry({deadlineMs: COLLECTION_DEADLINE_MS,
      nodes: [{nodeId: NODE_ID, adminUrl: 'http://x.invalid:8080', sinceSequence: 3}],
      fetchAnswer: injectRoute}), TypeError, 'a cursor above 0 must name its window');
    return {answers: [answered.answer]};
  });
}

// --- W9 and the negative controls ---------------------------------------------

// The witnesses a catalogue entry may name, each with the scenario that
// drives its entries.
const CATALOGUE_DRIVERS = Object.freeze([
  ['W2', witnessAccounting],
  ['W3', witnessReads],
  ['W4', witnessFifoWait],
  ['W7', witnessWindow],
  ['W8', witnessCollection],
]);

/**
 * Report every catalogue entry its named witness did not drive above zero.
 * @param {Object[]} catalogue - The product catalogue.
 * @param {Map<string, Object[]>} answersByWitness - Answers each witness read.
 * @return {Object[]} {id, witness, reason} per unmet entry.
 */
function findUndrivenCatalogueEntries(catalogue, answersByWitness) {
  const knownWitnesses = new Set(CATALOGUE_DRIVERS.map(([witness]) => witness));
  const unmet = [];
  for (const entry of catalogue) {
    const name = entry.id.split('.')[0];
    if (!knownWitnesses.has(entry.witness)) {
      unmet.push({id: entry.id, witness: entry.witness, reason: 'WITNESS_UNKNOWN'});
      continue;
    }
    if (!OBSERVATION_UNITS.has(entry.unit) || !name.endsWith(entry.unit) ||
        !fs.existsSync(new URL(`../../${entry.owner}`, import.meta.url))) {
      unmet.push({id: entry.id, witness: entry.witness, reason: 'ENTRY_MALFORMED'});
      continue;
    }
    const answers = answersByWitness.get(entry.witness) ?? [];
    const driven = answers.some((answer) =>
      (answer?.sections?.[entry.section]?.observations?.[entry.id]?.count ?? 0) > 0);
    if (!driven) unmet.push({id: entry.id, witness: entry.witness, reason: 'NOT_DRIVEN'});
  }
  return unmet;
}

/**
 * W9: every catalogue entry is driven above zero by its named witness.
 * @param {Map<string, Object[]>} [answersByWitness] - Answers already read
 *   by the drivers in this process; the drivers run when absent.
 */
async function witnessCatalogueCoverage(answersByWitness = null) {
  const contract = await loadCollectionContract();
  let answers = answersByWitness;
  if (answers === null) {
    answers = new Map();
    for (const [witness, drive] of CATALOGUE_DRIVERS) {
      answers.set(witness, (await drive()).answers);
    }
  }
  const unmet = findUndrivenCatalogueEntries(contract.TRANSACTION_TELEMETRY_CATALOGUE, answers);
  assert.deepEqual(unmet, [], 'every catalogue entry is driven by its named witness');
}

async function readOneCommittedAnswer() {
  return withTelemetryNode({}, async (node) => {
    await commitEmptyTransactions(node.engine, 'telemetry-control-session', 1);
    return node.readAnswer(0);
  });
}

/**
 * N1: the validator, and the collection function through it, reject an
 * answer whose phases sum to more than totalMs.
 */
async function negativeControlAccountingOverrun() {
  const contract = await loadCollectionContract();
  const answer = await readOneCommittedAnswer();
  assert.deepEqual(contract.validateTransactionTelemetryAnswer(answer),
    {valid: true, reason: null}, 'the unmodified answer is valid');
  const overrun = structuredClone(answer);
  const [sample] = overrun.sections[contract.TRANSACTION_TELEMETRY_SECTION.COORDINATOR]
    .samples.entries;
  sample.operations[0].fifoWaitMs += sample.accounting.totalMs + 1;
  assert.equal(contract.validateTransactionTelemetryAnswer(overrun).valid, false,
    'phases that sum to more than totalMs are rejected');
  const [entry] = await contract.collectTransactionTelemetry({
    nodes: [{nodeId: NODE_ID, adminUrl: 'http://overrun.invalid:8080', sinceSequence: 0}],
    deadlineMs: COLLECTION_DEADLINE_MS,
    fetchAnswer: async () => ({status: HTTP_STATUS.OK, body: overrun}),
  });
  assert.equal(entry.state, contract.TRANSACTION_TELEMETRY_NODE_STATE.MALFORMED);
}

/**
 * N2: the coverage checker rejects a catalogue entry left at count 0 by the
 * witness that should have driven it (the logAppendMs class), and accepts
 * the same answers with every entry driven.
 */
async function negativeControlUndrivenEntry() {
  const contract = await loadCollectionContract();
  const catalogue = contract.TRANSACTION_TELEMETRY_CATALOGUE;
  assert.ok(catalogue.length > 0, 'the catalogue lists its observation points');
  const driven = new Map();
  for (const entry of catalogue) {
    const answers = driven.get(entry.witness) ?? [{sections: {}}];
    const sections = answers[0].sections;
    sections[entry.section] ??= {observations: {}};
    sections[entry.section].observations[entry.id] = {count: 1};
    driven.set(entry.witness, answers);
  }
  assert.deepEqual(findUndrivenCatalogueEntries(catalogue, driven), [],
    'every entry driven: nothing is reported');
  const [victim] = catalogue;
  driven.get(victim.witness)[0].sections[victim.section].observations[victim.id] = {count: 0};
  assert.deepEqual(findUndrivenCatalogueEntries(catalogue, driven),
    [{id: victim.id, witness: victim.witness, reason: 'NOT_DRIVEN'}],
    'an entry at count 0 is reported');
}

export {
  negativeControlAccountingOverrun,
  negativeControlUndrivenEntry,
  witnessAccounting,
  witnessCatalogueCoverage,
  witnessCollection,
  witnessFifoWait,
  witnessReads,
  witnessRouteAnswer,
  witnessWindow,
};
