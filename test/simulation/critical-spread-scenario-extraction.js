// Scenario extraction for the critical-spread overflow replay.
//
// A scenario is a committed fixture built from ONE live formation-health
// run's own artifacts: the priority-partition operations the seed's
// coordinator created and completed, the membership publication it
// published, the node readiness transitions, the learner promotion attempts
// with their live outcomes, and the planner retentions it logged. Nothing
// else is scenario input, and every entry cites the run id, the node and the
// log time it came from, so a replay that reads only this file cannot set
// state the live run does not show (quest constraint "cited-or-absent").
//
// The extractor reads the artifact tree; the validator reads only the
// committed fixture, so the witness can gate the fixture in a checkout that
// has no artifacts.

import fs from 'node:fs';
import path from 'node:path';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
} from '../../src/bootstrap/system-partition-classification.js';

const SCENARIO_SCHEMA = 'critical-spread-scenario/1';
const SCENARIO_DIRECTORY = path.join(
  'test', 'simulation', 'calibration', 'critical-spread-scenarios');
const SCENARIO_SUFFIX = '.scenario.json';
const GUARD_INPUTS_SUFFIX = '.guard-inputs.json';
const NODE_LOG_DIRECTORY = path.join(
  'data', 'examples', 'service-data-affinity-demo');
const REPORT_DIRECTORY = path.join('test-output', 'reports');
const REPORT_SUFFIX = '.report.json';
const NODE_LOG_PREFIX = 'node-';
const NODE_LOG_SUFFIX = '.log';
const NODE_COUNT = 5;
const SEED_NODE_INDEX = 0;
const MS_PER_SECOND = 1000;
const SECONDS_PRECISION = 1;
const PARTITION_SUFFIX_PATTERN = /-p\d+$/u;
const LINE_SEPARATOR = '\n';
const JSON_INDENT = 2;

const MSG = Object.freeze({
  OPERATION_CREATED: 'Creating operation',
  OPERATION_COMPLETED: 'Operation completed',
  OPERATION_FAILED: 'Operation failed',
  HANDLING_CREATE: 'Handling CREATE_REPLICA request',
  HANDLING_REMOVE: 'Handling REMOVE_REPLICA request',
  READINESS: 'Bootstrap readiness state transitioned',
  PROMOTION_DEFERRED: 'Learner promotion deferred',
  PROMOTION_GRANTED: 'Learner promotion proof granted by leader',
  CONVERGENCE: 'convergence decision trace',
  STORAGE_BUDGET_RESOLVED: 'Node storage budget resolved',
  NODE_REGISTERED: 'Node registered in cluster',
});
const REPLICA_CREATE_MARKER = '[replica-create]';
const RETENTION_DECISION = 'retain_spread_cure_adds';
// The partition's declared replication factor and its leader replica are
// facts the run states on its own lines; both are read from whichever line
// states them first, so neither is written by hand here.
const TARGET_REPLICA_COUNT_FIELD = 'targetReplicaCount';
const LEADER_REPLICA_ID_FIELD = 'leaderReplicaId';
// Cheap pre-filter: a 30 MB node log is parsed only where one of these
// substrings appears, so extraction stays linear in the interesting lines.
const LINE_MARKERS = Object.freeze([
  MSG.OPERATION_CREATED, MSG.OPERATION_COMPLETED, MSG.OPERATION_FAILED,
  MSG.HANDLING_CREATE, MSG.HANDLING_REMOVE, MSG.READINESS,
  MSG.PROMOTION_DEFERRED, MSG.PROMOTION_GRANTED, MSG.CONVERGENCE,
  MSG.STORAGE_BUDGET_RESOLVED, MSG.NODE_REGISTERED,
  REPLICA_CREATE_MARKER, RETENTION_DECISION,
  TARGET_REPLICA_COUNT_FIELD, LEADER_REPLICA_ID_FIELD,
]);
const REPLICA_STAGE_LIVE = Object.freeze(new Set(['ready', 'active']));
const PROMOTION_OUTCOME = Object.freeze({
  GRANTED: 'granted',
  REFUSED: 'refused',
});
const OPERATION_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed',
  OPEN: 'open',
});
const COUNT_REFUSAL_REASON = 'would_exceed_target_replica_count';
const GUARD_INPUT_FIELDS = Object.freeze([
  'activeVoterCount', 'learnerCount', 'targetReplicaCount',
  'maxAllowedVotersAfterPromotion',
]);
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_KIND = 'cluster_membership';
const MIN_PUBLISHED_EPOCH = 2;

const CITED_SECTION_NAMES = Object.freeze([
  'nodes', 'nodeCapacities', 'initialPlacement', 'partitions', 'operations',
  'readinessTransitions', 'promotionAttempts', 'plannerRetentions',
  'seedSpreadObservations',
]);

function isPriorityPartitionId(partitionId) {
  const id = String(partitionId || '');
  const tableId = id.replace(PARTITION_SUFFIX_PATTERN, '');
  return tableId !== id && PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId);
}

function relativeSeconds(timeText, windowStartMs) {
  const atMs = Date.parse(timeText);
  if (!Number.isFinite(atMs)) return null;
  return Number(((atMs - windowStartMs) / MS_PER_SECOND)
    .toFixed(SECONDS_PRECISION));
}

function citation(runId, entry, windowStartMs) {
  return {
    runId,
    node: `${NODE_LOG_PREFIX}${entry.nodeIndex}`,
    nodeId: entry.record.nodeId ?? null,
    logTime: entry.record.time ?? null,
    atSeconds: relativeSeconds(entry.record.time, windowStartMs),
  };
}

function readReport(runDirectory) {
  const directory = path.join(runDirectory, REPORT_DIRECTORY);
  const names = fs.readdirSync(directory)
    .filter((name) => name.endsWith(REPORT_SUFFIX));
  if (names.length !== 1) {
    throw new Error(
      `expected exactly one ${REPORT_SUFFIX} under ${directory}, ` +
      `found ${names.length}`);
  }
  return JSON.parse(fs.readFileSync(path.join(directory, names[0]), 'utf8'));
}

function readNodeEntries(runDirectory) {
  const directory = path.join(runDirectory, NODE_LOG_DIRECTORY);
  const entries = [];
  for (let nodeIndex = 0; nodeIndex < NODE_COUNT; nodeIndex += 1) {
    const file = path.join(
      directory, `${NODE_LOG_PREFIX}${nodeIndex}${NODE_LOG_SUFFIX}`);
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(LINE_SEPARATOR)) {
      if (!LINE_MARKERS.some((marker) => line.includes(marker))) continue;
      const record = parseLogLine(line);
      if (record) entries.push({nodeIndex, record});
    }
  }
  return entries;
}

function parseLogLine(line) {
  try {
    const record = JSON.parse(line);
    return record && typeof record === 'object' && record.time ? record : null;
  } catch (error) {
    // A truncated final line is an artifact fact, not a scenario input: the
    // line is skipped and the reason is named rather than swallowed.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function collectNodes(entries, report) {
  const seedNodeId = report.formationVerdict?.seedNodeId ?? null;
  const nodes = [];
  for (let nodeIndex = 0; nodeIndex < NODE_COUNT; nodeIndex += 1) {
    const first = entries.find((entry) => entry.nodeIndex === nodeIndex &&
      typeof entry.record.nodeId === 'string');
    if (!first) throw new Error(`no nodeId found in node-${nodeIndex} log`);
    nodes.push({
      index: nodeIndex,
      nodeId: first.record.nodeId,
      isSeed: first.record.nodeId === seedNodeId,
    });
  }
  return nodes;
}

function operationKeyFields(record) {
  return {
    operationId: record.operationId,
    type: record.type ?? null,
    partitionId: record.partitionId ?? null,
    targetNodeId: record.targetNodeId ?? null,
  };
}

function applyOperationCreated(operations, entry, context) {
  const {record} = entry;
  if (record.msg !== MSG.OPERATION_CREATED) return;
  if (!record.operationId || !isPriorityPartitionId(record.partitionId)) return;
  if (operations.has(record.operationId)) return;
  operations.set(record.operationId, {
    ...operationKeyFields(record),
    replicaId: null,
    handledByNodeId: null,
    createdAtSeconds: relativeSeconds(record.time, context.windowStartMs),
    endedAtSeconds: null,
    outcome: OPERATION_OUTCOME.OPEN,
    errorMessage: null,
    citations: {
      created: citation(context.runId, entry, context.windowStartMs),
      handled: null,
      ended: null,
    },
  });
}

function applyOperationEnded(operations, entry, context) {
  const {record} = entry;
  const completed = record.msg === MSG.OPERATION_COMPLETED;
  const failed = record.msg === MSG.OPERATION_FAILED;
  if (!completed && !failed) return;
  const operation = operations.get(record.operationId);
  if (!operation || operation.endedAtSeconds !== null) return;
  operation.endedAtSeconds = relativeSeconds(record.time, context.windowStartMs);
  operation.outcome = completed ?
    OPERATION_OUTCOME.COMPLETED : OPERATION_OUTCOME.FAILED;
  operation.errorMessage = record.errorMessage ?? null;
  operation.citations.ended = citation(context.runId, entry, context.windowStartMs);
}

function applyOperationHandled(operations, entry, context) {
  const {record} = entry;
  const handling = record.msg === MSG.HANDLING_CREATE ||
    record.msg === MSG.HANDLING_REMOVE;
  if (!handling || !record.replicaId) return;
  const operation = operations.get(record.operationId);
  if (!operation || operation.replicaId) return;
  operation.replicaId = record.replicaId;
  operation.handledByNodeId = record.nodeId ?? null;
  operation.citations.handled = citation(context.runId, entry, context.windowStartMs);
}

function collectOperations(entries, context) {
  const operations = new Map();
  for (const entry of entries) applyOperationCreated(operations, entry, context);
  for (const entry of entries) {
    applyOperationHandled(operations, entry, context);
    applyOperationEnded(operations, entry, context);
  }
  return [...operations.values()]
    .sort((left, right) => left.createdAtSeconds - right.createdAtSeconds);
}

function collectInitialPlacement(entries, context, firstOperationAtSeconds) {
  const placement = [];
  for (const entry of entries) {
    const {record} = entry;
    if (!String(record.msg || '').startsWith(REPLICA_CREATE_MARKER)) continue;
    if (!REPLICA_STAGE_LIVE.has(String(record.stage))) continue;
    if (!isPriorityPartitionId(record.partitionId)) continue;
    const atSeconds = relativeSeconds(record.time, context.windowStartMs);
    if (atSeconds === null || atSeconds >= firstOperationAtSeconds) continue;
    placement.push({
      replicaId: record.replicaId,
      partitionId: record.partitionId,
      nodeId: record.nodeId,
      stage: record.stage,
      citation: citation(context.runId, entry, context.windowStartMs),
    });
  }
  return placement.sort((left, right) =>
    left.citation.atSeconds - right.citation.atSeconds);
}

function partitionLeaderCitations(entries, context) {
  const leaders = new Map();
  for (const entry of entries) {
    const {record} = entry;
    if (!record.leaderReplicaId || !isPriorityPartitionId(record.partitionId)) {
      continue;
    }
    if (leaders.has(record.partitionId)) continue;
    leaders.set(record.partitionId, {
      leaderReplicaId: record.leaderReplicaId,
      citation: citation(context.runId, entry, context.windowStartMs),
    });
  }
  return leaders;
}

function partitionTargetCitations(entries, context) {
  const targets = new Map();
  for (const entry of entries) {
    const {record} = entry;
    const partitionId = record.entityId ?? record.partitionId;
    if (!Number.isFinite(record.targetReplicaCount)) continue;
    if (!isPriorityPartitionId(partitionId) || targets.has(partitionId)) continue;
    targets.set(partitionId, {
      targetReplicaCount: record.targetReplicaCount,
      citation: citation(context.runId, entry, context.windowStartMs),
    });
  }
  return targets;
}

function collectPartitions(entries, context, placement) {
  const leaders = partitionLeaderCitations(entries, context);
  const targets = partitionTargetCitations(entries, context);
  const partitionIds = [...new Set(placement.map((row) => row.partitionId))];
  return partitionIds.sort().map((partitionId) => {
    const leader = leaders.get(partitionId);
    const target = targets.get(partitionId);
    if (!leader || !target) {
      throw new Error(
        `${partitionId} has no cited leader replica or target replica count`);
    }
    return {
      partitionId,
      targetReplicaCount: target.targetReplicaCount,
      leaderReplicaId: leader.leaderReplicaId,
      citations: {
        targetReplicaCount: target.citation,
        leaderReplicaId: leader.citation,
      },
    };
  });
}

// Each node states its own storage budget on its own line at startup
// ("Node storage budget resolved"), and the joiners restate it with their
// registration. The capacity filter and the provisioning admission both read
// it, so it is scenario data rather than a harness choice.
function collectNodeCapacities(entries, context, nodes) {
  const byNodeId = new Map();
  for (const entry of entries) {
    const {record} = entry;
    const resolved = record.msg === MSG.STORAGE_BUDGET_RESOLVED;
    const registered = record.msg === MSG.NODE_REGISTERED;
    if (!resolved && !registered) continue;
    if (!Number.isFinite(record.budgetBytes)) continue;
    if (byNodeId.has(record.nodeId)) continue;
    byNodeId.set(record.nodeId, {
      nodeId: record.nodeId,
      storageBudgetBytes: record.budgetBytes,
      storageBudgetSource: record.budgetSource ?? null,
      diskGb: Number.isFinite(record.diskGb) ? record.diskGb : null,
      nodeAddress: record.nodeAddress ?? null,
      citation: citation(context.runId, entry, context.windowStartMs),
    });
  }
  return nodes.map((node) => {
    const capacity = byNodeId.get(node.nodeId);
    if (!capacity) {
      throw new Error(`${node.nodeId} states no storage budget in its log`);
    }
    return capacity;
  });
}

function collectReadinessTransitions(entries, context) {
  const transitions = [];
  for (const entry of entries) {
    const {record} = entry;
    if (record.msg !== MSG.READINESS) continue;
    transitions.push({
      nodeId: record.nodeId,
      previousState: record.previousState ?? null,
      state: record.state ?? null,
      ready: record.ready === true,
      reasons: Array.isArray(record.reasons) ? [...record.reasons] : [],
      citation: citation(context.runId, entry, context.windowStartMs),
    });
  }
  return transitions.sort((left, right) =>
    left.citation.atSeconds - right.citation.atSeconds);
}

function promotionGuardInputs(record) {
  if (record.reason !== COUNT_REFUSAL_REASON) return null;
  const inputs = {};
  for (const field of GUARD_INPUT_FIELDS) {
    inputs[field] = Number.isFinite(record[field]) ? record[field] : null;
  }
  return inputs;
}

function collectPromotionAttempts(entries, context) {
  const attempts = [];
  for (const entry of entries) {
    const {record} = entry;
    const granted = record.msg === MSG.PROMOTION_GRANTED;
    const deferred = record.msg === MSG.PROMOTION_DEFERRED;
    if (!granted && !deferred) continue;
    if (!isPriorityPartitionId(record.partitionId)) continue;
    attempts.push({
      replicaId: record.replicaId ?? null,
      partitionId: record.partitionId,
      nodeId: record.nodeId,
      outcome: granted ?
        PROMOTION_OUTCOME.GRANTED : PROMOTION_OUTCOME.REFUSED,
      reason: granted ? null : (record.reason ?? null),
      countRefusal: record.reason === COUNT_REFUSAL_REASON,
      guardInputs: granted ? null : promotionGuardInputs(record),
      leaderReplicaId: record.leaderReplicaId ?? null,
      membershipEpoch: Number.isFinite(record.membershipEpoch) ?
        record.membershipEpoch : null,
      citation: citation(context.runId, entry, context.windowStartMs),
    });
  }
  return attempts.sort((left, right) =>
    left.citation.atSeconds - right.citation.atSeconds);
}

function collectPlannerRetentions(entries, context) {
  const retentions = [];
  for (const entry of entries) {
    const {record} = entry;
    if (record.overTargetCapAddDecision !== RETENTION_DECISION) continue;
    if (!isPriorityPartitionId(record.entityId)) continue;
    retentions.push({
      partitionId: record.entityId,
      targetReplicaCount: record.targetReplicaCount ?? null,
      activeVoterCount: record.activeVoterCount ?? null,
      activeDistinctNodeCount: record.activeDistinctNodeCount ?? null,
      targetDistinctNodeCount: record.targetDistinctNodeCount ?? null,
      prioritySpreadGapOpen: record.prioritySpreadGapOpen === true,
      retainedSpreadCureAddCount: record.retainedSpreadCureAddCount ?? null,
      decision: record.overTargetCapAddDecision,
      citation: citation(context.runId, entry, context.windowStartMs),
    });
  }
  return retentions.sort((left, right) =>
    left.citation.atSeconds - right.citation.atSeconds);
}

// The seed's own convergence trace is the publication observation. Only the
// transitions of its spread verdict are kept: the trace repeats every five
// seconds and an unchanged repeat carries no scenario fact.
function collectSeedSpreadObservations(entries, context) {
  const observations = [];
  let previous = null;
  for (const entry of entries) {
    const {record} = entry;
    if (record.msg !== MSG.CONVERGENCE) continue;
    if (!Number.isFinite(record.publicationEpoch)) continue;
    if (entry.nodeIndex !== SEED_NODE_INDEX) continue;
    const key = `${record.publicationEpoch}|${record.prioritySpreadPending}|` +
      `${record.publishedActiveNodeCount}|${record.recoveryProtocolState}`;
    if (key === previous) continue;
    previous = key;
    observations.push({
      publicationEpoch: record.publicationEpoch,
      expectedNodeCount: record.expectedNodeCount ?? null,
      publishedActiveNodeCount: record.publishedActiveNodeCount ?? null,
      missingPublishedCount: record.missingPublishedCount ?? null,
      prioritySpreadPending: record.prioritySpreadPending === true,
      recoveryProtocolState: record.recoveryProtocolState ?? null,
      priorityRecoveryReasonCodes:
        Array.isArray(record.priorityRecoveryReasonCodes) ?
          [...record.priorityRecoveryReasonCodes] : [],
      citation: citation(context.runId, entry, context.windowStartMs),
    });
  }
  return observations;
}

function buildPublication(observations, nodes) {
  const published = observations.find((observation) =>
    observation.publicationEpoch >= MIN_PUBLISHED_EPOCH &&
    observation.missingPublishedCount === 0 &&
    observation.publishedActiveNodeCount === nodes.length);
  if (!published) {
    throw new Error(
      'no seed convergence trace published every node at an epoch >= ' +
      `${MIN_PUBLISHED_EPOCH}`);
  }
  const seed = nodes.find((node) => node.isSeed) ?? nodes[SEED_NODE_INDEX];
  return {
    publicationKind: PUBLICATION_KIND,
    publicationEpoch: published.publicationEpoch,
    publisherNodeId: seed.nodeId,
    status: PUBLICATION_STATUS_PUBLISHED,
    publishedActiveNodeIds: nodes.map((node) => node.nodeId),
    expectedNodeCount: published.expectedNodeCount,
    citation: published.citation,
  };
}

/**
 * Turn one live run's artifact directory into a scenario fixture.
 * @param {object} options
 * @param {string} options.runDirectory the extracted formation-health-<run>
 *   directory (holding data/ and test-output/)
 * @param {string} options.runId the workflow run id the artifacts came from
 * @return {object} the scenario fixture
 */
function extractCriticalSpreadScenario({runDirectory, runId}) {
  const report = readReport(runDirectory);
  const window = report.formationVerdict?.window;
  if (!Number.isFinite(window?.startMs)) {
    throw new Error(`report has no formationVerdict.window.startMs: ${runId}`);
  }
  const entries = readNodeEntries(runDirectory);
  const context = {runId, windowStartMs: window.startMs};
  const nodes = collectNodes(entries, report);
  const operations = collectOperations(entries, context);
  if (operations.length === 0) {
    throw new Error(`no priority-partition operations in run ${runId}`);
  }
  const placement =
    collectInitialPlacement(entries, context, operations[0].createdAtSeconds);
  const seedSpreadObservations = collectSeedSpreadObservations(entries, context);
  return {
    schema: SCENARIO_SCHEMA,
    runId,
    verdict: report.formationVerdict?.verdict ?? null,
    reason: report.formationVerdict?.reason ?? null,
    window: {startMs: window.startMs, windowMs: window.windowMs ?? null},
    nodes,
    nodeCapacities: collectNodeCapacities(entries, context, nodes),
    partitions: collectPartitions(entries, context, placement),
    initialPlacement: placement,
    publication: buildPublication(seedSpreadObservations, nodes),
    operations,
    readinessTransitions: collectReadinessTransitions(entries, context),
    promotionAttempts: collectPromotionAttempts(entries, context),
    plannerRetentions: collectPlannerRetentions(entries, context),
    seedSpreadObservations,
  };
}

function scenarioFilePath(runId) {
  return path.join(SCENARIO_DIRECTORY, `${runId}${SCENARIO_SUFFIX}`);
}

function guardInputsFilePath(runId) {
  return path.join(SCENARIO_DIRECTORY, `${runId}${GUARD_INPUTS_SUFFIX}`);
}

/**
 * Write a scenario fixture to its committed path.
 * @param {object} scenario the extracted scenario
 * @param {string} [repositoryRoot] the tree the fixture belongs to
 * @return {string} the file written
 */
function writeCriticalSpreadScenario(scenario, repositoryRoot = process.cwd()) {
  const file = path.join(repositoryRoot, scenarioFilePath(scenario.runId));
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(scenario, null, JSON_INDENT)}\n`);
  return file;
}

/**
 * Read a committed scenario fixture.
 * @param {string} runId the run the fixture came from
 * @param {string} [repositoryRoot] the tree holding the fixture
 * @return {object} the scenario
 */
function readCriticalSpreadScenario(runId, repositoryRoot = process.cwd()) {
  const file = path.join(repositoryRoot, scenarioFilePath(runId));
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function citationProblem(where, cited) {
  if (!cited || typeof cited !== 'object') return `${where}: no citation`;
  if (!cited.runId) return `${where}: citation has no runId`;
  if (!cited.node) return `${where}: citation has no node`;
  if (!cited.logTime) return `${where}: citation has no logTime`;
  return null;
}

// Every citation a row carries: a single `citation`, or the named citations
// of a row whose fields come from different log lines.
function citationsOf(row) {
  if (row.citation) return [['citation', row.citation]];
  const named = Object.entries(row.citations || {})
    .filter(([, cited]) => cited !== null && cited !== undefined);
  return named.length > 0 ? named : [['citation', null]];
}

function collectSectionCitationProblems(scenario, section) {
  const problems = [];
  const rows = scenario[section];
  if (!Array.isArray(rows) || rows.length === 0) {
    problems.push(`${section}: empty`);
    return problems;
  }
  rows.forEach((row, index) => {
    const where = `${section}[${index}]`;
    if (section === 'nodes') return;
    for (const [label, cited] of citationsOf(row)) {
      const problem = citationProblem(`${where}.${label}`, cited);
      if (problem) problems.push(problem);
    }
  });
  return problems;
}

/**
 * Check a committed fixture against the "cited-or-absent" constraint.
 * @param {object} scenario the scenario fixture
 * @return {{ok: boolean, problems: string[]}} the verdict and every problem
 */
function collectScenarioHeaderProblems(scenario) {
  const problems = [];
  if (scenario?.schema !== SCENARIO_SCHEMA) {
    problems.push(`schema is not ${SCENARIO_SCHEMA}`);
  }
  if (!scenario?.runId) problems.push('runId is absent');
  const publicationProblem =
    citationProblem('publication', scenario?.publication?.citation);
  if (publicationProblem) problems.push(publicationProblem);
  for (const row of scenario?.nodes ?? []) {
    if (!row.nodeId) problems.push('nodes: a node has no nodeId');
  }
  return problems;
}

function validateCriticalSpreadScenario(scenario) {
  const problems = collectScenarioHeaderProblems(scenario);
  for (const section of CITED_SECTION_NAMES) {
    problems.push(...collectSectionCitationProblems(scenario, section));
  }
  return {ok: problems.length === 0, problems};
}

export {
  GUARD_INPUTS_SUFFIX,
  PROMOTION_OUTCOME,
  OPERATION_OUTCOME,
  SCENARIO_DIRECTORY,
  SCENARIO_SCHEMA,
  extractCriticalSpreadScenario,
  guardInputsFilePath,
  isPriorityPartitionId,
  readCriticalSpreadScenario,
  scenarioFilePath,
  validateCriticalSpreadScenario,
  writeCriticalSpreadScenario,
};
