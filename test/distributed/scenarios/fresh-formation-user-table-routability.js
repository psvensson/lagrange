/**
 * Scenario: fresh-formation-user-table-routability
 *
 * Red witness for the product blocker recorded by quest
 * `comparative-benchmark-evidence-repair`
 * (evidence/product-blocker-first-divergence-2026-11-01.md, sections 1, 2,
 * 4, 5). HYPOTHESIS until it fails through the named mechanism: a fresh
 * three-node formation never opens its serve lane, so a user table created
 * on it is never routable.
 *
 * Claim (in order; the first unmet predicate names the run, see
 * ../harness/fresh-formation-routability-predicate.js):
 *   a. every node's serve lane opens within FORMATION_BOUND_MS;
 *   b. the six priority control-plane partitions are spread to replica_count
 *      distinct nodes, by authority AND by every node's projection;
 *   c. replica_operations has no in-flight row for QUIET_WINDOW_MS
 *      (a, b and c must hold together for the whole window);
 *   d. a CREATE TABLE issued after a-c becomes routable within
 *      ROUTABILITY_BOUND_MS;
 *   e. one INSERT through the public PostgreSQL wire and a readback succeed
 *      with rowCount 1, the row visible on every node;
 *   f. no learner_address_unresolvable refusal for a learner whose services
 *      row was committed before the refusal;
 *   g. no projection/authority disagreement persists past the owner-stated
 *      cache-visibility bound (the class, owner rule 2026-11-01).
 * Recorded: time-to-(a), time-to-(d), every denial reason code seen per
 * poll, and the named log observations (learner_address_unresolvable,
 * CACHE_WAIT_TIMEOUT_MS, cdc_committed_acceptance_unknown, ...) with counts
 * and first timestamps per node.
 *
 * Bounds (derived, not invented):
 * - FORMATION_BOUND_MS 420000 = QUIESCENCE_TIMEOUT_MS / LEADER_SPREAD_TIMEOUT_MS
 *   of user-table-leader-placement-spread.js, the measured cold three-node
 *   formation tail on this same config (priority-spread deferral release,
 *   witnessed run 20260810T185440Z).
 * - FORMATION_POLL_MS 1000 = that scenario's QUIESCENCE_POLL_MS.
 * - QUIET_WINDOW_MS = TIMEOUTS.QUIET_WINDOW (harness constants.js).
 * - ROUTABILITY_BOUND_MS = TIMEOUTS.SCENARIO_DEFAULT (harness constants.js).
 * - per-read timeout = config benchmark.controlQueryTimeoutMs (required).
 * - persistence bound of (g) = CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS.
 *
 * No fallback: a failed snapshot / table read is a named unmet reason and
 * fails the run (observation-integrity) even when later polls pass; counts
 * are never defaulted; no fixed sleeps (only the poll cadence); no retries
 * besides following the CREATE TABLE contract's own `nextAction: retry`.
 * The full public-PG Scenario A context is not used because it gates on
 * cluster.waitForConvergence and a formation-certification admission, which
 * would mask predicates a-c; its public endpoint owner
 * (openLagrangePublicPgEndpoint) is used for (e).
 */

import assert from 'node:assert/strict';
import {createPgWireClient} from '../reference-client/pg-wire-client.js';

import {TIMEOUTS} from '../harness/constants.js';
import {
  evaluateFormationObservation,
  evaluateLearnerRefusals,
  evaluateObservationIntegrity,
  evaluateProjectionAgreement,
  evaluateUserTableRoutability,
  evaluateWriteReadback,
  firstUnmetPredicate,
  scanFormationLogLines,
} from '../harness/fresh-formation-routability-predicate.js';
import {extractContainerLogLines} from '../harness/log-collector.js';
import {
  openLagrangePublicPgEndpoint,
} from '../harness/oltp-scenario-a-lagrange-public-pg-context.js';
import {
  LAGRANGE_SCENARIO_A_PUBLIC_EXECUTION_CONTRACT,
} from '../harness/oltp-scenario-a-lagrange-proof-plan.js';
import {SPREAD_UNIT} from '../harness/scenario-host-topology.js';
import {createScenarioStepRunner} from '../harness/scenario-step-log.js';

const SCENARIO_NAME = 'fresh-formation-user-table-routability';
const NODE_COUNT = 3;
const FORMATION_BOUND_MS = 420_000;
const FORMATION_POLL_MS = 1000;
const QUIET_WINDOW_MS = TIMEOUTS.QUIET_WINDOW;
const ROUTABILITY_BOUND_MS = TIMEOUTS.SCENARIO_DEFAULT;
const SNAPSHOT_LANE = 'snapshot';
const CONTRACT_STATE_PENDING = 'pending';
const NEXT_ACTION_RETRY = 'retry';
const TABLE_NAME = 'ffr_probe';
const PROBE_ID = 'ffr-probe-1';
const PROBE_VALUE = 1;
const MAX_RECORDED_READ_FAILURES = 50;
const REPORT_SCHEMA_VERSION = 1;
const ZERO = 0;

const SQL = Object.freeze({
  CREATE_TABLE: `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} ` +
    '(probe_id TEXT PRIMARY KEY, probe_value INTEGER)',
  COUNT: `SELECT COUNT(*) AS cnt FROM ${TABLE_NAME}`,
  INSERT: `INSERT INTO ${TABLE_NAME} (probe_id, probe_value) ` +
    `VALUES ('${PROBE_ID}', ${PROBE_VALUE})`,
  READBACK: `SELECT probe_id, probe_value FROM ${TABLE_NAME} ` +
    `WHERE probe_id = '${PROBE_ID}'`,
  PARTITIONS: 'SELECT * FROM partitions',
  REPLICA_OPERATIONS: 'SELECT * FROM replica_operations',
  SERVICES: 'SELECT * FROM services',
  TABLES: 'SELECT * FROM tables',
});

/**
 * The topology this claim needs: exactly three nodes (a fresh THREE-node
 * formation); the spread it counts is distinct NODES, so no host minimum.
 * Another node count is REFUSED before anything starts.
 */
export const SCENARIO_TOPOLOGY_REQUIREMENT = Object.freeze({
  minDistinctHosts: ZERO,
  nodeCount: NODE_COUNT,
  spreadUnit: SPREAD_UNIT.NODE,
});

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireControlQueryTimeoutMs(cluster) {
  const timeoutMs = cluster?._config?.benchmark?.controlQueryTimeoutMs;
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > ZERO,
    `${SCENARIO_NAME}: config benchmark.controlQueryTimeoutMs is required`);
  return timeoutMs;
}

function resolveDependencies(cluster) {
  const overrides = cluster?._scenarioOverrides?.freshFormationRoutability ||
    {};
  return {
    formationBoundMs: overrides.formationBoundMs ?? FORMATION_BOUND_MS,
    now: overrides.now || Date.now,
    openPublicPg: overrides.openPublicPg || openLagrangePublicPgEndpoint,
    pgClient: overrides.pgClient || createPgWireClient,
    quietWindowMs: overrides.quietWindowMs ?? QUIET_WINDOW_MS,
    routabilityBoundMs: overrides.routabilityBoundMs ?? ROUTABILITY_BOUND_MS,
    sleep: overrides.sleep || defaultSleep,
  };
}

function formatParticipantDenialReasons(participant) {
  const codes = participant.routingDenialReasonCodes;
  if (!Array.isArray(codes) || codes.length === ZERO) return null;
  return `denialReasons=${codes.join(',')}`;
}

function collectParticipantDetailParts(participant) {
  return [
    participant.partitionId ? `partition=${participant.partitionId}` : null,
    participant.error ? `participantError=${participant.error}` : null,
    participant.routingReasonCode ?
      `routingReason=${participant.routingReasonCode}` :
      null,
    formatParticipantDenialReasons(participant),
  ].filter(Boolean);
}

function errorText(error) {
  const code = error?.code ? `${error.code}: ` : '';
  const base = code + String(error?.message || error);
  const participant = error?.firstFailedParticipant;
  if (!participant || typeof participant !== 'object') {
    return base;
  }
  const detailParts = collectParticipantDetailParts(participant);
  return detailParts.length > ZERO ?
    `${base} (${detailParts.join('; ')})` :
    base;
}

async function readRows(node, sql, timeoutMs) {
  try {
    const result = await node.queryWithTimeout(sql, [], {timeoutMs});
    const rows = Array.isArray(result?.rows) ? result.rows : null;
    if (rows === null) return {error: 'rows_absent'};
    return {
      complete: Number.isSafeInteger(result.count) &&
        result.count === rows.length,
      partitions: result.partitions ?? null,
      readAuthorityWitnesses: result.readAuthorityWitnesses ?? null,
      rows,
    };
  } catch (error) {
    return {error: errorText(error)};
  }
}

async function readSnapshot(node, timeoutMs) {
  try {
    const result = await node.getControlSnapshot({lane: SNAPSHOT_LANE,
      timeoutMs});
    const payload = Array.isArray(result?.rows) &&
      result.rows[ZERO] && typeof result.rows[ZERO] === 'object' ?
      result.rows[ZERO] :
      null;
    return payload === null ?
      {error: 'control_snapshot_rows_absent', payload: null} :
      {error: null, payload};
  } catch (error) {
    return {error: errorText(error), payload: null};
  }
}

async function observeFormation(nodes, seedNode, timeoutMs, now) {
  const [snapshotEntries, [partitions, services, replicaOperations]] =
    await Promise.all([
      Promise.all(nodes.map(async (node) =>
        [node.id, await readSnapshot(node, timeoutMs)])),
      Promise.all([
        readRows(seedNode, SQL.PARTITIONS, timeoutMs),
        readRows(seedNode, SQL.SERVICES, timeoutMs),
        readRows(seedNode, SQL.REPLICA_OPERATIONS, timeoutMs),
      ]),
    ]);
  return {
    authority: {partitions, replicaOperations, services},
    capturedAtMs: now(),
    clusterNodeIds: nodes.map((node) => node.id),
    snapshots: Object.fromEntries(snapshotEntries),
  };
}

function collectReadFailures(observation, sink) {
  for (const [nodeId, snapshot] of Object.entries(observation.snapshots)) {
    if (snapshot.error) {
      sink.push(`control_snapshot_read_failed:${nodeId}:${snapshot.error}`);
    }
  }
  for (const [label, read] of Object.entries(observation.authority)) {
    if (read.error) sink.push(`read_failed:${label}:${read.error}`);
  }
}

function tallyReasonCodes(tally, evaluation) {
  for (const predicate of evaluation.predicates) {
    const codes = new Set([...predicate.reasonCodes,
      ...(predicate.detail?.observedReasonCodes || [])]);
    for (const code of codes) tally[code] = (tally[code] || ZERO) + 1;
  }
}

function compactPoll(evaluation, startedAtMs) {
  return {
    disagreementKeys: evaluation.disagreements.map((entry) => entry.key),
    sinceStartMs: evaluation.capturedAtMs - startedAtMs,
    unmet: evaluation.predicates.filter((entry) => !entry.met)
      .map((entry) => ({id: entry.id, reasonCodes: entry.reasonCodes})),
  };
}

// Polls a-c until they hold together for the quiet window or the bound is
// spent. Every poll is recorded; nothing is retried into a pass.
async function observeFormationUntilSettled(context) {
  const {deps, nodes, seedNode, startedAtMs, timeoutMs, state} = context;
  const deadline = startedAtMs + deps.formationBoundMs;
  let jointSinceMs = null;
  while (deps.now() < deadline) {
    const observation = await observeFormation(nodes, seedNode, timeoutMs,
      deps.now);
    collectReadFailures(observation, state.readFailures);
    const evaluation = evaluateFormationObservation(observation);
    state.evaluations.push({capturedAtMs: evaluation.capturedAtMs,
      disagreements: evaluation.disagreements});
    state.polls.push(compactPoll(evaluation, startedAtMs));
    tallyReasonCodes(state.reasonCodeTally, evaluation);
    state.lastFormation = evaluation;
    for (const predicate of evaluation.predicates) {
      if (predicate.met && state.firstMetAtMs[predicate.id] === undefined) {
        state.firstMetAtMs[predicate.id] = evaluation.capturedAtMs;
      }
    }
    jointSinceMs = evaluation.satisfied ?
      (jointSinceMs ?? evaluation.capturedAtMs) :
      null;
    if (jointSinceMs !== null &&
        evaluation.capturedAtMs - jointSinceMs >= deps.quietWindowMs) {
      return {satisfied: true, satisfiedAtMs: evaluation.capturedAtMs};
    }
    await deps.sleep(FORMATION_POLL_MS);
  }
  return {satisfied: false, satisfiedAtMs: null};
}

// CREATE TABLE follows its own contract: while it answers pending with
// nextAction retry, it is re-issued on the poll cadence (each answer
// recorded); any other error ends the attempt, named. A DDL answer is
// bounded by the remaining routability bound, not the control-read timeout
// (run 1, 2026-11-01: a 15 s control-read bound cut a slower CREATE answer).
async function createProbeTable(seedNode, deps, deadline) {
  const attempts = [];
  while (deps.now() < deadline) {
    let outcome;
    try {
      const result = await seedNode.queryWithTimeout(SQL.CREATE_TABLE, [],
        {timeoutMs: deadline - deps.now()});
      outcome = {contractState: result.contractState ?? null,
        nextAction: result.nextAction ?? null,
        reasonCodes: result.reasonCodes ?? []};
    } catch (error) {
      outcome = {contractState: error.contractState ?? null,
        error: errorText(error), nextAction: error.nextAction ?? null,
        reasonCodes: error.reasonCodes ?? []};
    }
    attempts.push({...outcome, atMs: deps.now()});
    const pending = outcome.contractState === CONTRACT_STATE_PENDING &&
      outcome.nextAction === NEXT_ACTION_RETRY;
    if (!pending) return {attempts, final: outcome};
    await deps.sleep(FORMATION_POLL_MS);
  }
  return {attempts, final: attempts[attempts.length - 1] || null};
}

async function observeRoutability(seedNode, create, timeoutMs) {
  const [tables, partitions, services] = await Promise.all([
    readRows(seedNode, SQL.TABLES, timeoutMs),
    readRows(seedNode, SQL.PARTITIONS, timeoutMs),
    readRows(seedNode, SQL.SERVICES, timeoutMs),
  ]);
  const countProbe = await readRows(seedNode, SQL.COUNT, timeoutMs);
  return evaluateUserTableRoutability({countProbe, create, partitions,
    services, tableName: TABLE_NAME, tables});
}

async function observeUserTable(context) {
  const {deps, seedNode, timeoutMs, state} = context;
  const issuedAtMs = deps.now();
  const deadline = issuedAtMs + deps.routabilityBoundMs;
  const create = await createProbeTable(seedNode, deps, deadline);
  state.createAttempts = create.attempts;
  let result = null;
  while (deps.now() < deadline) {
    result = await observeRoutability(seedNode, create.final, timeoutMs);
    state.routabilityPolls += 1;
    if (result.met) {
      state.routableAtMs = deps.now();
      break;
    }
    if (create.final?.error && create.final.contractState !==
        CONTRACT_STATE_PENDING) {
      break;
    }
    await deps.sleep(FORMATION_POLL_MS);
  }
  return {issuedAtMs, result: result ??
    await observeRoutability(seedNode, create.final, timeoutMs)};
}

async function writeAndReadBack(context) {
  const {deps, cluster, nodes, seedNode, timeoutMs} = context;
  const readbacks = [];
  let insert = null;
  let client = null;
  try {
    const opened = await deps.openPublicPg(cluster, seedNode,
      LAGRANGE_SCENARIO_A_PUBLIC_EXECUTION_CONTRACT);
    client = deps.pgClient({...opened.connection,
      host: opened.endpoint.host, port: opened.endpoint.port});
    await client.connect();
    try {
      insert = {rowCount: (await client.query(SQL.INSERT)).rowCount};
    } catch (error) {
      insert = {error: errorText(error)};
    }
    try {
      readbacks.push({nodeId: null, rowCount:
        (await client.query(SQL.READBACK)).rowCount, via: 'public-pg-wire'});
    } catch (error) {
      readbacks.push({error: errorText(error), nodeId: null,
        via: 'public-pg-wire'});
    }
  } catch (error) {
    insert = insert ?? {error: `public_pg_unavailable: ${errorText(error)}`};
  } finally {
    if (client) await client.end().catch(() => {});
  }
  for (const node of nodes) {
    const read = await readRows(node, SQL.READBACK, timeoutMs);
    readbacks.push(read.error ?
      {error: read.error, nodeId: node.id, via: `admin:${node.id}`} :
      {nodeId: node.id, rowCount: read.rows.length, via: `admin:${node.id}`});
  }
  return evaluateWriteReadback({clusterNodeIds: nodes.map((node) => node.id),
    insert, readbacks});
}

async function scanNodeLogs(nodes, state, collector = null) {
  const perNode = {};
  const refusals = [];
  for (const node of nodes) {
    try {
      const raw = await node.getLogs({rawBuffer: true});
      const lines = extractContainerLogLines(raw);
      if (typeof collector?.retainContainerLogLines === 'function') {
        collector.retainContainerLogLines(node.id, lines);
      }
      const scan = scanFormationLogLines(lines);
      perNode[node.id] = {lineCount: scan.lineCount,
        observations: scan.observations, role: node.role};
      refusals.push(...scan.learnerRefusals);
    } catch (error) {
      state.readFailures.push(`node_logs_read_failed:${node.id}:` +
        errorText(error));
    }
  }
  return {perNode, refusals};
}

function relativeMs(atMs, originMs) {
  return Number.isFinite(atMs) && Number.isFinite(originMs) ?
    atMs - originMs :
    null;
}

function buildTimings(state, startedAtMs, logScan, seedNode) {
  const seedStart = logScan.perNode[seedNode.id]?.observations
    ?.process_start?.firstAt;
  const seedStartMs = seedStart ? Date.parse(seedStart) : null;
  const serveLaneAtMs = state.firstMetAtMs['a-serve-lane-open'];
  return {
    formationSatisfiedSinceScenarioStartMs:
      relativeMs(state.formation?.satisfiedAtMs, startedAtMs),
    seedProcessStartAt: seedStart ?? null,
    timeToServeLaneSinceScenarioStartMs: relativeMs(serveLaneAtMs,
      startedAtMs),
    timeToServeLaneSinceSeedStartMs: relativeMs(serveLaneAtMs, seedStartMs),
    timeToUserTableRoutableSinceScenarioStartMs:
      relativeMs(state.routableAtMs, startedAtMs),
    timeToUserTableRoutableSinceSeedStartMs:
      relativeMs(state.routableAtMs, seedStartMs),
  };
}

function newState() {
  return {createAttempts: [], evaluations: [], firstMetAtMs: {},
    formation: null, lastFormation: null, polls: [], readFailures: [],
    reasonCodeTally: {}, routabilityPolls: ZERO, routableAtMs: null};
}

function buildReport(context, results) {
  const {state, startedAtMs, seedNode, logScan, userTable} = context;
  const firstUnmet = firstUnmetPredicate(results);
  return {
    bounds: {formationBoundMs: context.deps.formationBoundMs,
      formationPollMs: FORMATION_POLL_MS,
      quietWindowMs: context.deps.quietWindowMs,
      routabilityBoundMs: context.deps.routabilityBoundMs},
    createAttempts: state.createAttempts,
    firstUnmet: firstUnmet === null ? null :
      {id: firstUnmet.id, reasonCodes: firstUnmet.reasonCodes},
    formationSatisfied: state.formation?.satisfied === true,
    lastFormationPredicates: state.lastFormation?.predicates ?? null,
    logObservations: logScan.perNode,
    pollCount: state.polls.length,
    polls: state.polls,
    predicates: results,
    readFailureCount: state.readFailures.length,
    readFailures: state.readFailures.slice(ZERO, MAX_RECORDED_READ_FAILURES),
    reasonCodeTally: state.reasonCodeTally,
    routabilityPolls: state.routabilityPolls,
    schemaVersion: REPORT_SCHEMA_VERSION,
    spreadUnit: SPREAD_UNIT.NODE,
    timings: buildTimings(state, startedAtMs, logScan, seedNode),
    userTableIssuedAfterFormationSatisfied:
      userTable === null ? null : state.formation?.satisfied === true,
  };
}

function throwOnUnmetClaim(state, results, report) {
  const unmetIds = results.filter((entry) => !entry.met).map((entry) =>
    entry.id);
  if (state.formation.satisfied && unmetIds.length === ZERO) return;
  const first = report.firstUnmet;
  const timings = report.timings;
  const error = new Error(
    `${SCENARIO_NAME}: first unmet predicate ` +
    `${first ? first.id : 'formation-bound-spent'} ` +
    `(${first ? first.reasonCodes.join(', ') : 'none'}); unmet: ` +
    `${unmetIds.join(', ')}; time-to-serve-lane ` +
    `${timings.timeToServeLaneSinceScenarioStartMs ?? 'never'}ms, ` +
    'time-to-user-table-routable ' +
    `${timings.timeToUserTableRoutableSinceScenarioStartMs ?? 'never'}ms`);
  error.diagnostics = {freshFormationRoutability: report};
  throw error;
}

export async function run(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(Array.isArray(nodes) && nodes.length === NODE_COUNT,
    `${SCENARIO_NAME} requires exactly ${NODE_COUNT} nodes`);
  const deps = resolveDependencies(cluster);
  const timeoutMs = requireControlQueryTimeoutMs(cluster);
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];
  const step = createScenarioStepRunner(cluster, SCENARIO_NAME, deps.now);
  const state = newState();
  const startedAtMs = deps.now();
  const context = {cluster, deps, nodes, seedNode, startedAtMs, state,
    timeoutMs};

  state.formation = await step('formation-serve-lane-spread-ledger', () =>
    observeFormationUntilSettled(context));
  // The user-table phase runs either way: after a satisfied formation it is
  // the claim's (d)/(e); after a spent bound it is a labelled post-bound
  // diagnostic (userTableIssuedAfterFormationSatisfied: false) that records
  // how the unsettled formation answers a user table.
  const userTable = await step('user-table-routability', () =>
    observeUserTable(context));
  const writeReadback = userTable.result.met ?
    await step('write-readback', () => writeAndReadBack(context)) :
    null;
  const collector = typeof cluster.getLogCollector === 'function' ?
    cluster.getLogCollector() :
    null;
  const logScan = await step('node-log-observations', () =>
    scanNodeLogs(nodes, state, collector));
  const finalServices = await readRows(seedNode, SQL.SERVICES, timeoutMs);
  if (finalServices.error) {
    state.readFailures.push(`read_failed:services:${finalServices.error}`);
  }

  const results = [
    ...(state.lastFormation?.predicates ?? []),
    userTable.result,
    ...(writeReadback === null ? [] : [writeReadback]),
    evaluateLearnerRefusals({refusals: logScan.refusals,
      services: finalServices}),
    evaluateProjectionAgreement(state.evaluations),
    evaluateObservationIntegrity(state.readFailures),
  ];
  const report = buildReport({deps, logScan, seedNode, startedAtMs, state,
    userTable}, results);
  throwOnUnmetClaim(state, results, report);
  return report;
}
