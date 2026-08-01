/**
 * Live A/B vehicle for the transaction-recovery-poison-row-invariant Quest.
 *
 * Stages a terminal distributed-transaction row, stops a non-seed node, and
 * starts its durable-rejoin boot. Once that node reaches the final handoff
 * window, one exact mutation makes the row replay-invalid (multi-participant
 * ONE_PHASE_COMMIT) and the scenario captures its startup-runtime-handoff
 * readiness surface. The
 * claim under test: the FIXED tree publishes a typed
 * transaction_recovery_incomplete outcome (kind, errorCode, decisionDimension,
 * routeSource) and attributes the poison row to its writer/replay path, while
 * the REVERTED (base) tree publishes no typed outcome and the causal fatal is
 * masked behind generic restart failure / nodeAdmissionBlocked.
 *
 * This scenario asserts NOTHING about recovery success: a poisoned row must
 * fail replay in both arms. It returns the observed handoff evidence so the
 * A/B driver can compare arms byte-for-byte.
 */

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {TABLES} from '../../../src/constants/index.js';
import {
  resolveScenarioOptions,
} from '../harness/scenario-config.js';
import {
  probeStartupRuntimeHandoff,
} from '../harness/startup-runtime-handoff-probe.js';
import {QUERY_ERROR_CODE} from
  '../../../src/query/query-constants.js';

const ZERO = 0;
const ONE = 1;
const SEED_ROLE = 'seed';
const QUERY_LANE = 'default';
const QUERY_TIMEOUT_MS = 15000;
const RESTART_READINESS_TIMEOUT_MS = 90000;
const OUTCOME_CAPTURE_TIMEOUT_MS = 60000;
const OUTCOME_CAPTURE_POLL_INTERVAL_MS = 250;
const REJOIN_POISON_WINDOW_TIMEOUT_MS = 90000;
const REJOIN_POISON_WINDOW_POLL_INTERVAL_MS = 10;

const POISON_TRANSACTION_ID = 'tx-poison-live-ab-1pc';
const POISON_SESSION_ID = 'session-poison-live-ab-1pc';
const POISON_DIMENSION = 'commit_mode';
const RECOVERY_OUTCOME_INCOMPLETE = 'transaction_recovery_incomplete';
const HANDOFF_SAMPLE_OBSERVED = 'observed';
const HANDOFF_SAMPLE_UNOBSERVED = 'unobserved';
const POISON_OBSERVATION_MUTATION_RECEIPT = 'mutation_receipt';
const QUERY_RESULT_FIELD_OPERATION = 'operation';
const GENERIC_ADMISSION_CLASSIFICATION = 'nodeAdmissionBlocked';
const UNOBSERVED_HANDOFF_SAMPLE = Object.freeze({
  sampleState: HANDOFF_SAMPLE_UNOBSERVED,
});
const TX_STATUS_COMMITTING = 'COMMITTING';
const TX_STATUS_COMMITTED = 'COMMITTED';
const TX_MODE_EXPLICIT = 'EXPLICIT';
const SET_STATE_FROZEN = 'FROZEN';
const COMMIT_TWO_PHASE = 'TWO_PHASE_COMMIT';
const COMMIT_ONE_PHASE = 'ONE_PHASE_COMMIT';
const TRANSACTION_RECOVERY_FAILED = 'failed';
const STARTUP_WORKFLOW_KIND_JOIN = 'join';
const STARTUP_WORKFLOW_DIRECTORY = 'startup-workflows';
const STARTUP_WORKFLOW_FILE_PREFIX = 'join-';
const STARTUP_WORKFLOW_FILE_SUFFIX = '.json';
const REUSE_DATA_TEMP_DIRECTORY = '.tmp';
const REUSE_DATA_DIRECTORY = 'reuse-data';
const FILE_ENCODING_UTF8 = 'utf8';
const JOIN_CHECKPOINT_MEMBERSHIP_WRITTEN = 'MEMBERSHIP_WRITTEN';
const JOIN_CHECKPOINT_READY_LEASE_ASSIGNED = 'READY_LEASE_ASSIGNED';
const PARTICIPANT_ID_SEPARATOR = '-';
const DIAGNOSTIC_KEY_VALUE_SEPARATOR = ':';
const DIAGNOSTIC_ENTRY_SEPARATOR = '|';
const DIAGNOSTIC_SUFFIX = ')';
const CANDIDATE_LEADER_COUNTS_PREFIX = ' (candidateLeaderCounts=';
const LAST_CHECKPOINT_PREFIX = ' (lastCheckpoint=';
const POISON_PARTITION_IDS = Object.freeze(['p1', 'p2']);
const ASSERTION_MESSAGE = Object.freeze({
  POISON_MUTATION_RECEIPT_REQUIRED:
    'Poisoned transaction row was not observed through an exact one-row ' +
    'mutation receipt during the durable-rejoin handoff',
  REJOIN_POISON_WINDOW_REQUIRED:
    'Durable rejoin did not expose a final attachment poison window',
  FAILED_SAMPLE_REQUIRED:
    'Poison-row restart must capture a failed transaction recovery sample',
  FAILED_STATE_REQUIRED:
    'Poison-row restart must be owned by the failed startup recovery state',
  RECOVERY_READY_FORBIDDEN:
    'Poison-row restart must never publish transaction recovery ready',
  TYPED_OUTCOME_REQUIRED:
    'Poison-row restart must publish a typed transaction_recovery_incomplete outcome',
  INCOMPLETE_KIND_REQUIRED:
    'Poison-row restart must publish the canonical incomplete outcome kind',
  RECOVERY_ERROR_CODE_REQUIRED:
    'Poison-row restart must publish the canonical recovery error code',
  COMMIT_MODE_REQUIRED:
    'Poison-row restart must attribute the commit_mode decision dimension',
  ROUTE_SOURCE_REQUIRED:
    'Poison-row restart must publish its canonical route source',
  EXPECTED_ROUTE_SOURCE_REQUIRED:
    'Poison-row live validation requires an expected canonical route source',
  RECOVERY_OUTCOME_PRECEDENCE_REQUIRED:
    'Typed poison-row recovery attribution must precede generic admission classification',
  HANDOFF_READY_FORBIDDEN:
    'Typed poison-row evidence must never publish handoff ready',
  NODE_COUNT_EXPECTED_PREFIX: 'Scenario node count mismatch: expected ',
  NODE_COUNT_ACTUAL_INFIX: ' got ',
  SEED_REQUIRED: 'Seed node should be available',
  DURABLE_REJOIN_TARGET_REQUIRED:
    'A non-seed durable-rejoin target should be available',
  TARGET_LEADERSHIP_FORBIDDEN:
    'Durable-rejoin target must own zero partition leaders before stop',
  RESTART_READY_FORBIDDEN:
    'Poison-row restart must stop short of recovery readiness',
  ADMISSION_MASK_FORBIDDEN:
    'Generic admission load must not mask the poison-row recovery failure',
});

const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const arrayIsArray = Array.isArray;
const PROPERTY_FIELD_VALUE = 'value';
const HANDOFF_FIELD = Object.freeze({
  STARTUP_RUNTIME_HANDOFF: 'startupRuntimeHandoff',
  STARTUP_BRANCH: 'startupBranch',
  INFRASTRUCTURE_JOIN_COMPLETE: 'infrastructureJoinComplete',
  TRANSACTION_RECOVERY_OUTCOME: 'transactionRecoveryOutcome',
  READY: 'ready',
  TRANSACTION_RECOVERY_STATE: 'transactionRecoveryState',
  TRANSACTION_RECOVERY_READY: 'transactionRecoveryReady',
  KIND: 'kind',
  ERROR_CODE: 'errorCode',
  DECISION_DIMENSION: 'decisionDimension',
  ROUTE_SOURCE: 'routeSource',
  SAMPLE_STATE: 'sampleState',
  OUTCOME: 'outcome',
  FIRST_FAILED_SAMPLE: 'firstFailedSample',
  TYPED_OUTCOME_SAMPLE: 'typedOutcomeSample',
  TYPED_OUTCOME_OBSERVED_AT_MS: 'typedOutcomeObservedAtMs',
  EXPECTED_ROUTE_SOURCE: 'expectedRouteSource',
  RESTART_STARTED_AT_MS: 'restartStartedAtMs',
  RESTART_SETTLED_AT_MS: 'restartSettledAtMs',
  GENERIC_ADMISSION_BEFORE_TYPED:
    'genericAdmissionObservedBeforeTypedOutcome',
  LAST_ERROR: 'lastError',
  BOOTSTRAP_READINESS: 'bootstrapReadiness',
  REASONS: 'reasons',
  LENGTH: 'length',
  PHASE: 'phase',
  STATE: 'state',
  WORKFLOW_KIND: 'workflowKind',
  NODE_ID: 'nodeId',
  SESSION_ID: 'sessionId',
  CHECKPOINT: 'checkpoint',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  TERMINAL: 'terminal',
});

const SQL_INSERT_TRANSACTION =
  'INSERT INTO ' + TABLES.SQL_TRANSACTIONS +
  ' (transaction_id, session_id, status, transaction_mode, ' +
  'participant_set_state, commit_mode, frozen_participant_count, ' +
  'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
const SQL_INSERT_PARTICIPANT =
  'INSERT INTO ' + TABLES.SQL_TRANSACTION_PARTICIPANTS +
  ' (participant_id, transaction_id, partition_id, status, created_at, ' +
  'updated_at) VALUES (?, ?, ?, ?, ?, ?)';
const SQL_POISON_UPDATE =
  'UPDATE ' + TABLES.SQL_TRANSACTIONS +
  ' SET status = ?, commit_mode = ?, frozen_participant_count = ? ' +
  'WHERE transaction_id = ?';
const SQL_SELECT_TARGET_LEADERS =
  'SELECT partition_id, leader_node_id FROM ' + TABLES.PARTITIONS +
  ' WHERE leader_node_id = ?';

function normalizePositiveInteger(value, fallback = ZERO) {
  return Number.isFinite(value) && value > ZERO ?
    Math.floor(value) :
    fallback;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value : null;
}

function readOwnDataProperty(record, key) {
  if (
    !record ||
    typeof record !== 'object' ||
    !objectHasOwn(record, key)
  ) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  return descriptor && objectHasOwn(descriptor, PROPERTY_FIELD_VALUE) ?
    descriptor.value :
    undefined;
}

function isRecord(value) {
  return value !== null &&
    typeof value === 'object' &&
    !arrayIsArray(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSeedNode(nodes) {
  return nodes.find((node) => node.role === SEED_ROLE) || nodes[ZERO];
}

function getDurableRejoinCandidates(nodes) {
  return nodes.filter((node) => node.role !== SEED_ROLE).reverse();
}

function resolveExpectedRouteSource(nodes, targetNode, expectedRouteSources) {
  if (!arrayIsArray(expectedRouteSources)) {
    return null;
  }
  const targetIndex = nodes.indexOf(targetNode);
  if (
    targetIndex < ZERO ||
    readOwnDataProperty(expectedRouteSources, HANDOFF_FIELD.LENGTH) !==
      nodes.length
  ) {
    return null;
  }
  return normalizeOptionalString(
    readOwnDataProperty(expectedRouteSources, String(targetIndex)),
  );
}

function buildDurableRejoinWorkflowPath(expectedRouteSource, nodeId) {
  const portSeparatorIndex = expectedRouteSource.lastIndexOf(':');
  const containerName = portSeparatorIndex > ZERO ?
    expectedRouteSource.slice(ZERO, portSeparatorIndex) :
    expectedRouteSource;
  return path.join(
    process.cwd(),
    REUSE_DATA_TEMP_DIRECTORY,
    REUSE_DATA_DIRECTORY,
    containerName,
    STARTUP_WORKFLOW_DIRECTORY,
    STARTUP_WORKFLOW_FILE_PREFIX + nodeId + STARTUP_WORKFLOW_FILE_SUFFIX,
  );
}

function isDurableRejoinPoisonCheckpoint(workflow, options = {}) {
  if (!isRecord(workflow)) {
    return false;
  }
  const checkpoint = readOwnDataProperty(
    workflow,
    HANDOFF_FIELD.CHECKPOINT,
  );
  const createdAt = readOwnDataProperty(workflow, HANDOFF_FIELD.CREATED_AT);
  const sessionId = readOwnDataProperty(workflow, HANDOFF_FIELD.SESSION_ID);
  const expectedNodeId = normalizeOptionalString(
    readOwnDataProperty(options, HANDOFF_FIELD.NODE_ID),
  );
  const restartStartedAtMs = readOwnDataProperty(
    options,
    HANDOFF_FIELD.RESTART_STARTED_AT_MS,
  );
  const checkpointBeforeFinalHandoff =
    checkpoint === JOIN_CHECKPOINT_MEMBERSHIP_WRITTEN ||
    checkpoint === JOIN_CHECKPOINT_READY_LEASE_ASSIGNED;
  return checkpointBeforeFinalHandoff &&
    readOwnDataProperty(workflow, HANDOFF_FIELD.WORKFLOW_KIND) ===
      STARTUP_WORKFLOW_KIND_JOIN &&
    readOwnDataProperty(workflow, HANDOFF_FIELD.NODE_ID) === expectedNodeId &&
    typeof sessionId === 'string' && sessionId.length > ZERO &&
    Number.isFinite(createdAt) &&
    Number.isFinite(restartStartedAtMs) &&
    createdAt >= restartStartedAtMs &&
    readOwnDataProperty(workflow, HANDOFF_FIELD.TERMINAL) !== true;
}

async function readDurableRejoinWorkflow(workflowPath) {
  try {
    return JSON.parse(await readFile(workflowPath, FILE_ENCODING_UTF8));
  } catch (_error) {
    return null;
  }
}

async function executeScenarioQuery(node, sql, params = []) {
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(
      sql,
      params,
      {
        timeoutMs: QUERY_TIMEOUT_MS,
        lane: QUERY_LANE,
      },
    );
  }
  return node.query(sql, params);
}

function buildPoisonMutationWitness(result) {
  const affectedRows = Number(
    readOwnDataProperty(result, 'affectedRows'),
  );
  assert.equal(
    affectedRows,
    ONE,
    ASSERTION_MESSAGE.POISON_MUTATION_RECEIPT_REQUIRED,
  );
  return {
    transactionId: POISON_TRANSACTION_ID,
    commitMode: COMMIT_ONE_PHASE,
    frozenParticipantCount: 2,
    affectedRows,
    operation: normalizeOptionalString(
      readOwnDataProperty(result, QUERY_RESULT_FIELD_OPERATION),
    ),
    observation: POISON_OBSERVATION_MUTATION_RECEIPT,
  };
}

async function seedDormantTransactionRow(seedNode, nowMs) {
  await executeScenarioQuery(seedNode, SQL_INSERT_TRANSACTION, [
    POISON_TRANSACTION_ID,
    POISON_SESSION_ID,
    TX_STATUS_COMMITTED,
    TX_MODE_EXPLICIT,
    SET_STATE_FROZEN,
    COMMIT_TWO_PHASE,
    2,
    nowMs,
    nowMs,
  ]);
  for (const partitionId of POISON_PARTITION_IDS) {
    await executeScenarioQuery(seedNode, SQL_INSERT_PARTICIPANT, [
      POISON_TRANSACTION_ID + PARTICIPANT_ID_SEPARATOR + partitionId,
      POISON_TRANSACTION_ID,
      partitionId,
      TX_STATUS_COMMITTED,
      nowMs,
      nowMs,
    ]);
  }
}

async function poisonDormantTransactionRow(seedNode) {
  const poisonResult = await executeScenarioQuery(seedNode, SQL_POISON_UPDATE, [
    TX_STATUS_COMMITTING,
    COMMIT_ONE_PHASE,
    2,
    POISON_TRANSACTION_ID,
  ]);
  return buildPoisonMutationWitness(poisonResult);
}

async function selectNonLeadingDurableRejoinTarget(seedNode, candidates) {
  const observations = [];
  for (const candidate of candidates) {
    const result = await executeScenarioQuery(
      seedNode,
      SQL_SELECT_TARGET_LEADERS,
      [candidate.id],
    );
    const rows = readOwnDataProperty(result, 'rows');
    const leaderCount = arrayIsArray(rows) ? rows.length : null;
    const leadership = {
      observedAtMs: Date.now(),
      nodeId: candidate.id,
      leaderCount,
    };
    observations.push(leadership);
    if (leaderCount === ZERO) {
      return {
        restartNode: candidate,
        targetLeadership: {
          ...leadership,
          checkedCandidateCount: observations.length,
        },
      };
    }
  }
  assert.fail(
    ASSERTION_MESSAGE.TARGET_LEADERSHIP_FORBIDDEN +
      CANDIDATE_LEADER_COUNTS_PREFIX +
      observations.map((entry) => entry.nodeId +
        DIAGNOSTIC_KEY_VALUE_SEPARATOR + entry.leaderCount)
        .join(DIAGNOSTIC_ENTRY_SEPARATOR) + DIAGNOSTIC_SUFFIX,
  );
}

async function poisonAtDurableRejoinHandoff(seedNode, restartNode, options) {
  const expectedRouteSource = normalizeOptionalString(
    readOwnDataProperty(options, HANDOFF_FIELD.EXPECTED_ROUTE_SOURCE),
  );
  const restartStartedAtMs = readOwnDataProperty(
    options,
    HANDOFF_FIELD.RESTART_STARTED_AT_MS,
  );
  const workflowPath = buildDurableRejoinWorkflowPath(
    expectedRouteSource,
    restartNode.id,
  );
  const deadline = Date.now() + REJOIN_POISON_WINDOW_TIMEOUT_MS;
  let lastWorkflow = null;
  while (Date.now() < deadline) {
    lastWorkflow = await readDurableRejoinWorkflow(workflowPath);
    if (isDurableRejoinPoisonCheckpoint(lastWorkflow, {
      nodeId: restartNode.id,
      restartStartedAtMs,
    })) {
      return {
        observedAtMs: Date.now(),
        workflow: {
          path: workflowPath,
          workflowKind: readOwnDataProperty(
            lastWorkflow,
            HANDOFF_FIELD.WORKFLOW_KIND,
          ),
          nodeId: readOwnDataProperty(lastWorkflow, HANDOFF_FIELD.NODE_ID),
          sessionId: readOwnDataProperty(
            lastWorkflow,
            HANDOFF_FIELD.SESSION_ID,
          ),
          checkpoint: readOwnDataProperty(
            lastWorkflow,
            HANDOFF_FIELD.CHECKPOINT,
          ),
          createdAt: readOwnDataProperty(
            lastWorkflow,
            HANDOFF_FIELD.CREATED_AT,
          ),
          updatedAt: readOwnDataProperty(
            lastWorkflow,
            HANDOFF_FIELD.UPDATED_AT,
          ),
        },
        witness: await poisonDormantTransactionRow(seedNode),
      };
    }
    await sleep(REJOIN_POISON_WINDOW_POLL_INTERVAL_MS);
  }
  const lastCheckpoint = readOwnDataProperty(
    lastWorkflow,
    HANDOFF_FIELD.CHECKPOINT,
  );
  assert.fail(
    ASSERTION_MESSAGE.REJOIN_POISON_WINDOW_REQUIRED +
      LAST_CHECKPOINT_PREFIX +
      String(lastCheckpoint || HANDOFF_SAMPLE_UNOBSERVED) + DIAGNOSTIC_SUFFIX,
  );
}

function extractHandoffEvidence(diagnostics) {
  const handoff = readOwnDataProperty(
    diagnostics,
    HANDOFF_FIELD.STARTUP_RUNTIME_HANDOFF,
  );
  if (!isRecord(handoff)) {
    return null;
  }
  const outcome = readOwnDataProperty(
    handoff,
    HANDOFF_FIELD.TRANSACTION_RECOVERY_OUTCOME,
  );
  return {
    sampleState: HANDOFF_SAMPLE_OBSERVED,
    ready: readOwnDataProperty(handoff, HANDOFF_FIELD.READY) === true,
    transactionRecoveryState:
      normalizeOptionalString(
        readOwnDataProperty(handoff, HANDOFF_FIELD.TRANSACTION_RECOVERY_STATE),
      ),
    transactionRecoveryReady:
      readOwnDataProperty(
        handoff,
        HANDOFF_FIELD.TRANSACTION_RECOVERY_READY,
      ) === true,
    outcome: !isRecord(outcome) ?
      null :
      {
        kind: normalizeOptionalString(
          readOwnDataProperty(outcome, HANDOFF_FIELD.KIND),
        ),
        errorCode: normalizeOptionalString(
          readOwnDataProperty(outcome, HANDOFF_FIELD.ERROR_CODE),
        ),
        decisionDimension: normalizeOptionalString(
          readOwnDataProperty(outcome, HANDOFF_FIELD.DECISION_DIMENSION),
        ),
        routeSource: normalizeOptionalString(
          readOwnDataProperty(outcome, HANDOFF_FIELD.ROUTE_SOURCE),
        ),
      },
  };
}

function normalizeCapturedHandoffEvidence(value) {
  if (!isRecord(value)) {
    return null;
  }
  const outcome = readOwnDataProperty(value, HANDOFF_FIELD.OUTCOME);
  return {
    sampleState: normalizeOptionalString(
      readOwnDataProperty(value, HANDOFF_FIELD.SAMPLE_STATE),
    ),
    ready: readOwnDataProperty(value, HANDOFF_FIELD.READY) === true,
    transactionRecoveryState: normalizeOptionalString(
      readOwnDataProperty(value, HANDOFF_FIELD.TRANSACTION_RECOVERY_STATE),
    ),
    transactionRecoveryReady:
      readOwnDataProperty(
        value,
        HANDOFF_FIELD.TRANSACTION_RECOVERY_READY,
      ) === true,
    outcome: !isRecord(outcome) ?
      null :
      {
        kind: normalizeOptionalString(
          readOwnDataProperty(outcome, HANDOFF_FIELD.KIND),
        ),
        errorCode: normalizeOptionalString(
          readOwnDataProperty(outcome, HANDOFF_FIELD.ERROR_CODE),
        ),
        decisionDimension: normalizeOptionalString(
          readOwnDataProperty(outcome, HANDOFF_FIELD.DECISION_DIMENSION),
        ),
        routeSource: normalizeOptionalString(
          readOwnDataProperty(outcome, HANDOFF_FIELD.ROUTE_SOURCE),
        ),
      },
  };
}

function assertPoisonRowHandoffEvidence(handoffCapture, options = {}) {
  const expectedRouteSource = normalizeOptionalString(
    readOwnDataProperty(options, HANDOFF_FIELD.EXPECTED_ROUTE_SOURCE),
  );
  assert.ok(
    expectedRouteSource && expectedRouteSource.length > ZERO,
    ASSERTION_MESSAGE.EXPECTED_ROUTE_SOURCE_REQUIRED,
  );
  const failedSample = normalizeCapturedHandoffEvidence(
    readOwnDataProperty(handoffCapture, HANDOFF_FIELD.FIRST_FAILED_SAMPLE),
  );
  assert.equal(
    failedSample && failedSample.sampleState,
    HANDOFF_SAMPLE_OBSERVED,
    ASSERTION_MESSAGE.FAILED_SAMPLE_REQUIRED,
  );
  assert.equal(
    failedSample.transactionRecoveryState,
    TRANSACTION_RECOVERY_FAILED,
    ASSERTION_MESSAGE.FAILED_STATE_REQUIRED,
  );
  assert.equal(
    failedSample.transactionRecoveryReady,
    false,
    ASSERTION_MESSAGE.RECOVERY_READY_FORBIDDEN,
  );

  const typedSample = normalizeCapturedHandoffEvidence(
    readOwnDataProperty(handoffCapture, HANDOFF_FIELD.TYPED_OUTCOME_SAMPLE),
  );
  assert.equal(
    typedSample && typedSample.sampleState,
    HANDOFF_SAMPLE_OBSERVED,
    ASSERTION_MESSAGE.TYPED_OUTCOME_REQUIRED,
  );
  assert.equal(
    typedSample.outcome?.kind,
    RECOVERY_OUTCOME_INCOMPLETE,
    ASSERTION_MESSAGE.INCOMPLETE_KIND_REQUIRED,
  );
  assert.equal(
    typedSample.outcome?.errorCode,
    QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
    ASSERTION_MESSAGE.RECOVERY_ERROR_CODE_REQUIRED,
  );
  assert.equal(
    typedSample.outcome?.decisionDimension,
    POISON_DIMENSION,
    ASSERTION_MESSAGE.COMMIT_MODE_REQUIRED,
  );
  assert.equal(
    typedSample.outcome?.routeSource,
    expectedRouteSource,
    ASSERTION_MESSAGE.ROUTE_SOURCE_REQUIRED,
  );
  assert.equal(
    typedSample.ready,
    false,
    ASSERTION_MESSAGE.HANDOFF_READY_FORBIDDEN,
  );
  const typedOutcomeObservedAtMs = readOwnDataProperty(
    handoffCapture,
    HANDOFF_FIELD.TYPED_OUTCOME_OBSERVED_AT_MS,
  );
  const restartSettledAtMs = readOwnDataProperty(
    options,
    HANDOFF_FIELD.RESTART_SETTLED_AT_MS,
  );
  const restartStartedAtMs = readOwnDataProperty(
    options,
    HANDOFF_FIELD.RESTART_STARTED_AT_MS,
  );
  const genericAdmissionObservedBeforeTypedOutcome = readOwnDataProperty(
    handoffCapture,
    HANDOFF_FIELD.GENERIC_ADMISSION_BEFORE_TYPED,
  );
  assert.ok(
    Number.isFinite(typedOutcomeObservedAtMs) &&
      Number.isFinite(restartStartedAtMs) &&
      Number.isFinite(restartSettledAtMs) &&
      typedOutcomeObservedAtMs >= restartStartedAtMs &&
      typedOutcomeObservedAtMs <= restartSettledAtMs &&
      genericAdmissionObservedBeforeTypedOutcome === false,
    ASSERTION_MESSAGE.RECOVERY_OUTCOME_PRECEDENCE_REQUIRED,
  );
}

function recordHandoffEvidenceSample(captureState, evidence) {
  if (!evidence) {
    return;
  }
  const observedAtMs = Date.now();
  captureState.samples.push({at: observedAtMs, evidence});
  if (evidence.transactionRecoveryState === TRANSACTION_RECOVERY_FAILED &&
      captureState.firstFailedSample.sampleState ===
        HANDOFF_SAMPLE_UNOBSERVED) {
    captureState.firstFailedSample = evidence;
    captureState.firstFailedSampleAtMs = observedAtMs;
  }
  if (evidence.outcome?.kind === RECOVERY_OUTCOME_INCOMPLETE &&
      captureState.typedOutcomeSample.sampleState ===
        HANDOFF_SAMPLE_UNOBSERVED) {
    captureState.typedOutcomeSample = evidence;
    captureState.typedOutcomeObservedAtMs = observedAtMs;
  }
}

function hasGenericAdmissionClassification(diagnostics) {
  const lastError = readOwnDataProperty(diagnostics, HANDOFF_FIELD.LAST_ERROR);
  if (
    typeof lastError === 'string' &&
    lastError.indexOf(GENERIC_ADMISSION_CLASSIFICATION) >= ZERO
  ) {
    return true;
  }
  const readiness = readOwnDataProperty(
    diagnostics,
    HANDOFF_FIELD.BOOTSTRAP_READINESS,
  );
  const reasons = readOwnDataProperty(readiness, HANDOFF_FIELD.REASONS);
  if (!arrayIsArray(reasons)) {
    return false;
  }
  const length = readOwnDataProperty(reasons, HANDOFF_FIELD.LENGTH);
  for (let index = ZERO; Number.isInteger(length) && index < length; index++) {
    const reason = readOwnDataProperty(reasons, String(index));
    if (
      typeof reason === 'string' &&
      reason.indexOf(GENERIC_ADMISSION_CLASSIFICATION) >= ZERO
    ) {
      return true;
    }
  }
  return false;
}

async function captureRestartHandoffEvidence(node, options = {}) {
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs,
    OUTCOME_CAPTURE_TIMEOUT_MS,
  );
  const deadline = Date.now() + timeoutMs;
  const captureState = {
    startedAtMs: Date.now(),
    samples: [],
    typedOutcomeSample: UNOBSERVED_HANDOFF_SAMPLE,
    firstFailedSample: UNOBSERVED_HANDOFF_SAMPLE,
    firstFailedSampleAtMs: null,
    typedOutcomeObservedAtMs: null,
    firstGenericAdmissionAtMs: null,
  };
  while (Date.now() < deadline) {
    let diagnostics = null;
    try {
      diagnostics = await probeStartupRuntimeHandoff(node, {
        timeoutMs: QUERY_TIMEOUT_MS,
      });
    } catch (error) {
      captureState.samples.push({
        at: Date.now(),
        probeError: String(error?.message || error),
      });
      await sleep(OUTCOME_CAPTURE_POLL_INTERVAL_MS);
      continue;
    }
    if (
      captureState.firstGenericAdmissionAtMs === null &&
      hasGenericAdmissionClassification(diagnostics)
    ) {
      captureState.firstGenericAdmissionAtMs = Date.now();
    }
    const evidence = extractHandoffEvidence(diagnostics);
    recordHandoffEvidenceSample(captureState, evidence);
    if (
      captureState.firstFailedSampleAtMs !== null &&
      captureState.typedOutcomeObservedAtMs !== null
    ) {
      break;
    }
    await sleep(OUTCOME_CAPTURE_POLL_INTERVAL_MS);
  }
  const genericAdmissionObservedBeforeTypedOutcome =
    captureState.firstGenericAdmissionAtMs !== null &&
    (
      captureState.typedOutcomeObservedAtMs === null ||
      captureState.firstGenericAdmissionAtMs <=
        captureState.typedOutcomeObservedAtMs
    );
  return {
    startedAtMs: captureState.startedAtMs,
    sampleCount: captureState.samples.length,
    firstFailedSample: captureState.firstFailedSample,
    firstFailedSampleAtMs: captureState.firstFailedSampleAtMs,
    typedOutcomeSample: captureState.typedOutcomeSample,
    typedOutcomeObservedAtMs: captureState.typedOutcomeObservedAtMs,
    firstGenericAdmissionAtMs: captureState.firstGenericAdmissionAtMs,
    genericAdmissionObservedBeforeTypedOutcome,
    lastSample: captureState.samples.length > ZERO ?
      captureState.samples[captureState.samples.length - ONE] :
      null,
  };
}

async function run(cluster, options = {}) {
  const resolved = resolveScenarioOptions(
    options,
    cluster,
    'transaction-recovery-poison-row-live',
  );
  const expectedNodeCount = normalizePositiveInteger(
    resolved.expectedNodeCount,
    ZERO,
  );
  const expectedRouteSources = resolved.expectedRouteSources;
  const nodes = cluster.getNodes();
  assert.ok(
    expectedNodeCount === ZERO || nodes.length === expectedNodeCount,
    ASSERTION_MESSAGE.NODE_COUNT_EXPECTED_PREFIX + expectedNodeCount +
      ASSERTION_MESSAGE.NODE_COUNT_ACTUAL_INFIX + nodes.length,
  );
  const seedNode = getSeedNode(nodes);
  const durableRejoinCandidates = getDurableRejoinCandidates(nodes);
  assert.ok(seedNode, ASSERTION_MESSAGE.SEED_REQUIRED);
  assert.ok(
    durableRejoinCandidates.length > ZERO,
    ASSERTION_MESSAGE.DURABLE_REJOIN_TARGET_REQUIRED,
  );
  const {restartNode, targetLeadership} =
    await selectNonLeadingDurableRejoinTarget(
      seedNode,
      durableRejoinCandidates,
    );
  const expectedRouteSource = resolveExpectedRouteSource(
    nodes,
    restartNode,
    expectedRouteSources,
  );
  assert.ok(
    expectedRouteSource && expectedRouteSource.length > ZERO,
    ASSERTION_MESSAGE.EXPECTED_ROUTE_SOURCE_REQUIRED,
  );
  const nowMs = Date.now();
  // Terminal state keeps the staged row outside recovery while the joiner
  // establishes infrastructure. The one-row poison mutation is deferred to
  // the final attachment window below.
  await seedDormantTransactionRow(seedNode, nowMs);
  await cluster.stopNode(restartNode.id);

  // Bounded restart: a poisoned row must fail replay (both arms), so the
  // restarted node never reaches recovery-ready. The harness readiness wait
  // throwing a timeout is the expected terminal; the typed outcome evidence
  // is captured from the tight poll below.
  const restartStartedAtMs = Date.now();
  const handoffCapturePromise = captureRestartHandoffEvidence(restartNode, {
    timeoutMs: RESTART_READINESS_TIMEOUT_MS + OUTCOME_CAPTURE_TIMEOUT_MS,
  });
  const poisonWindowPromise =
    poisonAtDurableRejoinHandoff(seedNode, restartNode, {
      expectedRouteSource,
      restartStartedAtMs,
    });
  const restartOutcomePromise = (async () => {
    try {
      await cluster.startNode(restartNode.id, {
        readinessTimeoutMs: RESTART_READINESS_TIMEOUT_MS,
      });
      return {error: null, settledAtMs: Date.now()};
    } catch (error) {
      return {
        error: String(error?.message || error),
        settledAtMs: Date.now(),
      };
    }
  })();
  const [handoffCapture, restartOutcome, poisonWindow] = await Promise.all([
    handoffCapturePromise,
    restartOutcomePromise,
    poisonWindowPromise,
  ]);
  const restartReadinessError = restartOutcome.error;
  assert.ok(
    typeof restartReadinessError === 'string' &&
      restartReadinessError.length > ZERO,
    ASSERTION_MESSAGE.RESTART_READY_FORBIDDEN,
  );
  assert.doesNotMatch(
    restartReadinessError,
    /nodeAdmissionBlocked/,
    ASSERTION_MESSAGE.ADMISSION_MASK_FORBIDDEN,
  );
  assertPoisonRowHandoffEvidence(handoffCapture, {
    expectedRouteSource,
    restartStartedAtMs,
    restartSettledAtMs: restartOutcome.settledAtMs,
  });

  return {
    seedNodeId: seedNode.id,
    restartNodeId: restartNode.id,
    restartNodeRole: restartNode.role,
    targetLeadership,
    poison: {
      transactionId: POISON_TRANSACTION_ID,
      sessionId: POISON_SESSION_ID,
      expectedDecisionDimension: POISON_DIMENSION,
      window: poisonWindow,
      witness: poisonWindow.witness,
    },
    restartReadinessError,
    restartTiming: {
      startedAtMs: restartStartedAtMs,
      settledAtMs: restartOutcome.settledAtMs,
    },
    handoff: handoffCapture,
  };
}

export {
  assertPoisonRowHandoffEvidence,
  buildPoisonMutationWitness,
  extractHandoffEvidence,
  getDurableRejoinCandidates,
  isDurableRejoinPoisonCheckpoint,
  resolveExpectedRouteSource,
  run,
};
