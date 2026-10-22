/**
 * The one owner of "this run is CERTIFICATION evidence".
 *
 * Owner rulings (binding, 2026-10-05):
 * - Ruling 6, startup publication (option C): startup may enter its
 *   ordinary operational state while saying `publication convergence not
 *   claimed at startup`. That is acceptable for running the system and NOT
 *   acceptable as certification evidence: a certification verdict must
 *   independently observe REAL publication convergence before it certifies
 *   success. Startup can proceed without the claim; certification cannot.
 * - Ruling 5, formation acceptance: a host-spread failure is never
 *   classified away. Certification uses a topology that can satisfy the
 *   host requirement (one node per distinct machine for the five-node
 *   formation); node-level and host-level claims stay explicit.
 * - Earlier rulings: an insufficient topology is REFUSED/NOT-RUN, never
 *   PASS and never certification evidence; host identity is a declared or
 *   observed machine fact; absent evidence is never certification.
 *
 * A run REQUESTS certification (`--certify <sha>`); every other run is
 * ordinary, keeps today's behaviour, and its report says it is not
 * certification evidence (NOT_REQUESTED). A certification verdict is
 * `certified: true` only when EVERY condition below was observed in that
 * run, each listed with its evidence:
 *   scenario_passed        the scenario's own outcome is passed;
 *   topology               the scenario's declared certification topology
 *                          (one node per distinct machine) holds on the
 *                          config AND on every placed node's host identity;
 *   publication_convergence after the scenario, a WINDOW of consecutive
 *                          load-mode probes, each with every node active,
 *                          complete snapshot coverage and the publication
 *                          gate `ready === true` from real evidence with
 *                          claimState CLAIMED_LOAD, at least
 *                          CERTIFICATION_PUBLICATION_WAIT.CONSECUTIVE_READY
 *                          polls held for the harness's load-readiness
 *                          stable window; any other poll restarts the
 *                          window; the startup admission (`not claimed at
 *                          startup`) never counts; a bounded wait that
 *                          expires is a reported spent wait;
 *   voters_at_target       every convergence wait of the run (the
 *                          scenario's and the certification stage's own)
 *                          ended voters_at_target with no under-replication
 *                          tolerance declared, over a claimed set equal to
 *                          every partition the wait's authoritative
 *                          `partitions` read returned (none unclaimed);
 *   host_spread            the scenario's named spread gate passed with
 *                          spreadUnit 'host' on declared machine facts;
 *   no_refusal             the scenario was not refused;
 *   spent_waits            every `wait_bound_spent` line of every node's
 *                          full log, grouped by `wait`, classified against
 *                          the bounded-wait census: any wait outside the
 *                          census's known findings fails; known findings
 *                          are listed with their owner and decided by
 *                          CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY
 *                          (today FAIL: a spent wait hides a bug); a line
 *                          naming the token that is not the reporter's
 *                          record, an empty log or one without the node's
 *                          boot provenance line is incomplete evidence;
 *   commit_identity        observed, never inferred
 *                          (certification-image-identity.js): a clean
 *                          checkout at the sha, a fresh labelled build on
 *                          every host read back, every node's container
 *                          image and boot provenance line.
 */

import {createReadStream, existsSync, readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {createGunzip} from 'node:zlib';
import {WAIT_BOUND_SPENT_EVENT} from '../../../src/logging/wait-bound-spent.js';
import {
  commitIdentityProblems,
  observeNodeImages,
} from './certification-image-identity.js';
import {CLUSTER_BASE_LAYER} from './cluster-base-layer.js';
import {
  VOTER_TARGET_STATE,
  readPartitionVoterTargets,
} from './convergence-voter-targets.js';
import {CONVERGENCE_DEFAULTS} from './constants.js';
import {fullLogDestPath} from './full-node-log-capture.js';
import {PUBLICATION_CONVERGENCE_CLAIM_STATE} from './publication-convergence-claim.js';
import {SCENARIO_OUTCOME, scenarioOutcomeOf} from './scenario-outcome.js';
import {HOST_IDENTITY_SOURCE, SPREAD_UNIT} from './scenario-host-topology.js';

const {CLUSTER_READINESS_MODE_LOAD, LOAD_READINESS_STABLE_WINDOW_MS} =
  CLUSTER_BASE_LAYER;

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringIncludes = Function.call.bind(String.prototype.includes);
const objectHasOwn = Object.hasOwn;
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const weakMapGet = Function.call.bind(WeakMap.prototype.get);
const weakMapSet = Function.call.bind(WeakMap.prototype.set);

const ZERO = 0;
const ONE = 1;
const CERTIFICATION_SCHEMA = 'scenario-certification/1';
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SPENT_WAIT_SAMPLES_PER_WAIT = 3;
const UNPARSED_SPENT_WAIT_SAMPLES = 3;
const BOOT_PROVENANCE_FIELD = 'srcFingerprintMatches';
const LINE_SEPARATOR = '\n';
const WAIT_PART_SEPARATOR = '+';
const TABLE_CELL = '|';
const BACKTICK_TOKEN = /`([^`]+)`/gu;
const CENSUS_KNOWN_FINDINGS_HEADING = '### Known findings (owner)';
const CENSUS_EXPECTED_NONE_HEADING =
  '### Expected in a healthy five-node formation: none';
const MARKDOWN_HEADING_PREFIX = '#';
const TABLE_SEPARATOR_ROW = /^\|\s*-/u;
const LIST_ITEM_PREFIX = '- ';
const CARRIAGE_RETURN_TAIL = /\r$/u;

/**
 * The bounded-wait census whose tables classify a run's spent waits. Read
 * at certification time, never restated here (R03).
 */
const SPENT_WAIT_CENSUS_PATH = fileURLToPath(new URL(
  '../../../solve/epics/raft-rs-full-cutover/' +
  'census-bounded-waits-2026-10-04.md', import.meta.url));

const KNOWN_FINDING_SPENT_WAIT_POLICY_MODE = Object.freeze({
  FAIL: 'known_findings_fail_certification',
  LIST_WITH_OWNER: 'known_findings_listed_with_owner_not_failing',
});

/**
 * THE policy for a spent wait the census lists under "Known findings
 * (owner)". Under the owner's rule "a fully spent timeout always hides a
 * bug", a certification run with ANY spent wait is not certified: a known
 * finding fails (certification_known_finding_spent_wait) and is reported
 * with its owner in the failure detail. Today a run in which SWIM declared a
 * node DEAD (`swimSuspicionTimeoutMs`) or the 60 s voter-ready wait expired
 * (`REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS`) cannot certify. Only the owner
 * relaxes it, explicitly, to LIST_WITH_OWNER. A wait OUTSIDE the known
 * findings always fails (certification_unexpected_spent_wait).
 */
const CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY =
  KNOWN_FINDING_SPENT_WAIT_POLICY_MODE.FAIL;

// The certification stage's own bounded wait for real publication
// convergence (after the scenario, before certifying): a window of
// CONSECUTIVE_READY qualifying polls in a row, held for at least the
// harness's load-readiness stable window (the cluster's own
// _resolveLoadReadinessStableWindowMs, as waitForLoadReadinessStability).
// R4: the window is never shorter than MIN_STABLE_WINDOW_MS, whatever the
// config's `timeouts.loadReadinessStableWindowMs` says; the effective and
// the configured window are recorded.
const CERTIFICATION_PUBLICATION_WAIT = Object.freeze({
  BUDGET_MS: 120000,
  CONSECUTIVE_READY: 3,
  MIN_STABLE_WINDOW_MS: 5000,
  NAME: 'CERTIFICATION_PUBLICATION_WAIT.BUDGET_MS',
  POLL_MS: 2000,
});
// R6: the stage's strict convergence wait ends only on an observation with
// voters at target AND every partition of the partitions read claimed
// (a split parent's pending dissolution leaves it unclaimed), re-checked
// within ONE budget: the single wait's own settle bound
// (CONVERGENCE_DEFAULTS.settleTimeoutMs, 30 s), never lengthened.
const CERTIFICATION_CONVERGENCE_WAIT = Object.freeze({
  AWAITED: 'a convergence wait ending voters_at_target with every ' +
    'partition of the partitions read claimed (unclaimed = [])',
  BUDGET_MS: CONVERGENCE_DEFAULTS.settleTimeoutMs,
  MIN_ATTEMPT_MS: 1,
  NAME: 'CERTIFICATION_CONVERGENCE_WAIT.BUDGET_MS',
  POLL_MS: 2000,
});
// R3: the expected partition set is cross-checked against the partitions
// read of at least this many nodes (the tables catalog is not read).
const PARTITION_CROSS_CHECK_MIN_NODES = 2;
const PUBLICATION_AWAITED =
  'a window of consecutive load-mode probes with every node active, ' +
  'complete snapshot coverage and the publication convergence gate ' +
  'ready === true from real evidence (claimState ' +
  PUBLICATION_CONVERGENCE_CLAIM_STATE.CLAIMED_LOAD + ')';
const PUBLICATION_POLLS_RECORDED = 8;

const CERTIFICATION_CONDITION = Object.freeze({
  COMMIT_IDENTITY: 'commit_identity',
  HOST_SPREAD: 'host_spread',
  NO_REFUSAL: 'no_refusal',
  PUBLICATION_CONVERGENCE: 'publication_convergence',
  SCENARIO_PASSED: 'scenario_passed',
  SPENT_WAITS: 'spent_waits',
  TOPOLOGY: 'topology',
  VOTERS_AT_TARGET: 'voters_at_target',
});

const CERTIFICATION_FAILURE = Object.freeze({
  COMMIT_IDENTITY: 'certification_commit_identity_not_exact',
  EVIDENCE_ARCHIVE: 'certification_evidence_not_archived',
  EVIDENCE_COLLECTION: 'certification_evidence_collection_failed',
  HOST_SPREAD: 'certification_host_spread_not_observed',
  KNOWN_FINDING_SPENT_WAIT: 'certification_known_finding_spent_wait',
  PUBLICATION: 'certification_publication_convergence_not_observed',
  REFUSED: 'certification_refused_outcome',
  SCENARIO_NOT_PASSED: 'certification_scenario_not_passed',
  SPENT_WAIT_EVIDENCE: 'certification_spent_wait_evidence_incomplete',
  TOPOLOGY: 'certification_topology_not_one_node_per_machine',
  UNEXPECTED_SPENT_WAIT: 'certification_unexpected_spent_wait',
  VOTERS: 'certification_convergence_not_voters_at_target',
});

const SPENT_WAIT_CLASS = Object.freeze({
  KNOWN_FINDING: 'known_finding',
  UNEXPECTED: 'unexpected',
});

const CONVERGENCE_WAIT_FAILED = 'convergence_wait_failed';

// How the cluster captured node logs: streamed docker stdout/stderr (both
// reporter sinks), or a bind-mounted pino file (stdout not captured).
const CAPTURE_MODE = Object.freeze({
  FILE: 'file_logging',
  STREAMED: 'streamed_stdout',
});


// What a certified verdict still does NOT certify, stated on every verdict.
const STANDING_LIMITS = Object.freeze([
  'committed raft membership (raft-rs ConfState) is not observed: the ' +
    'gates measure replicated services/partitions rows',
  'known-finding spent waits are decided by ' +
    'CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY (today: any spent wait ' +
    'fails, reported with its owner)',
  'the node boot provenance line fingerprints /app/src only; vendor/, ' +
    'package*.json and the Dockerfile are attested by the image labels of ' +
    'each node\'s container',
]);

/**
 * The record every NON-certification run carries: it says what it is not.
 */
const CERTIFICATION_NOT_REQUESTED = Object.freeze({
  certified: false,
  requested: false,
  schema: CERTIFICATION_SCHEMA,
  statement: 'certification not requested: this run is NOT certification ' +
    'evidence; startup readiness admits nodes with publication convergence ' +
    'not claimed at startup (' +
    PUBLICATION_CONVERGENCE_CLAIM_STATE.NOT_CLAIMED_STARTUP +
    ') and no real publication convergence was required',
});

// --- run-scoped evidence ledger ------------------------------------------

const ledgers = new WeakMap();

function ledgerOf(cluster) {
  if (!cluster || typeof cluster !== 'object') {
    return null;
  }
  let ledger = weakMapGet(ledgers, cluster);
  if (!ledger) {
    ledger = {convergenceWaits: [], gates: []};
    weakMapSet(ledgers, cluster, ledger);
  }
  return ledger;
}

/**
 * Record one gate record (scenario-step-log.recordScenarioGate calls this).
 * @param {Object} cluster
 * @param {Object} record From scenario-ground-truth buildGateRecord.
 */
function recordCertificationGate(cluster, record) {
  ledgerOf(cluster)?.gates.push(record);
}

function sortedIds(ids) {
  return Array.isArray(ids) ? [...ids].sort() : null;
}

function describeConvergenceEnding(ending) {
  if (ending.error) {
    return {error: String(ending.error.message || ending.error),
      state: CONVERGENCE_WAIT_FAILED, verdict: null};
  }
  const verdict = ending.result?.voterTargets ?? null;
  return {error: null, state: verdict?.state ?? null, verdict};
}

// How one cluster.waitForConvergence call ended, with the partition sets
// its verdict covered: expected = every partition the wait's authoritative
// `partitions` read returned, claimed = the set the verdict judged.
function recordConvergenceWait(cluster, options, ending) {
  const tolerance = options?.tolerateUnderReplication;
  const {error, state, verdict} = describeConvergenceEnding(ending);
  ledgerOf(cluster)?.convergenceWaits.push({
    claimedPartitionIds: sortedIds(verdict?.claimedPartitionIds),
    error,
    expectedPartitionIds: sortedIds(verdict?.policyPartitionIds),
    state,
    toleranceDeclared: tolerance !== undefined,
    toleranceReason: tolerance?.reason ?? null,
    unclaimedPartitionIds: sortedIds(verdict?.unclaimedPartitionIds),
  });
}

/**
 * Run one convergence wait and record how it ended (its voter-target
 * state, or that it threw) on the run's ledger. The cluster's
 * waitForConvergence is the one caller; the wait's result or error is
 * passed through unchanged.
 * @param {Object} cluster
 * @param {Object|undefined} options The caller's options (its declared
 *   under-replication tolerance is recorded).
 * @param {Function} wait () => Promise<Object> the convergence wait.
 * @return {Promise<Object>}
 */
async function observeConvergenceWait(cluster, options, wait) {
  let result;
  try {
    result = await wait();
  } catch (error) {
    recordConvergenceWait(cluster, options, {error});
    throw error;
  }
  recordConvergenceWait(cluster, options, {result});
  return result;
}

function readLedger(cluster) {
  const ledger = cluster ? weakMapGet(ledgers, cluster) : null;
  return ledger || {convergenceWaits: [], gates: []};
}

// --- commit identity -----------------------------------------------------

function evaluateCommitIdentity(evidence) {
  const certification = evidence.certification || {};
  const problems = commitIdentityProblems(evidence);
  return condition(CERTIFICATION_CONDITION.COMMIT_IDENTITY,
    problems.length === ZERO, CERTIFICATION_FAILURE.COMMIT_IDENTITY, {
      build: certification.build || null,
      identity: certification.commitIdentity || null,
      image: certification.image || null,
      nodeImages: evidence.nodeImages || [],
      problems,
      staleSourceWarning: evidence.staleSourceWarning || null,
    });
}

// --- certification stage (after the scenario, before teardown) ----------

function describeGateObservation(gate) {
  return {
    claimState: gate?.claimState ?? null,
    missingPublishedNodeIds: gate?.missingPublishedNodeIds || [],
    pendingAckNodeIds: gate?.pendingAckNodeIds || [],
    publicationStatus: gate?.publicationStatus ?? null,
    ready: gate?.ready === true,
    reasons: gate?.reasons || [],
  };
}

// Real publication convergence: the LOAD claim, ready from real evidence.
// The startup admission (claimState not-claimed) never counts.
function isRealPublicationConvergence(gate) {
  return gate?.claimState === PUBLICATION_CONVERGENCE_CLAIM_STATE.CLAIMED_LOAD &&
    gate?.ready === true;
}

// One poll qualifies for the window only with every node active, complete
// snapshot coverage and real publication convergence.
function qualifiesForPublicationWindow(probe) {
  return probe.allActive === true && probe.completeCoverage === true &&
    isRealPublicationConvergence(probe.gate);
}

async function probePublicationGate(cluster, deadline) {
  try {
    const probe = await cluster._probeClusterActiveState(deadline,
      {mode: CLUSTER_READINESS_MODE_LOAD});
    return {allActive: probe?.allActive === true,
      completeCoverage: probe?.snapshotCoverage?.completeCoverage === true,
      error: null, gate: probe?.publicationConvergenceGate ?? null};
  } catch (error) {
    return {allActive: false, completeCoverage: false,
      error: String(error?.message || error), gate: null};
  }
}

function resolveConfiguredStableWindowMs(cluster, clock) {
  if (Number.isFinite(clock.stableWindowMs)) {
    return clock.stableWindowMs;
  }
  return typeof cluster?._resolveLoadReadinessStableWindowMs === 'function' ?
    cluster._resolveLoadReadinessStableWindowMs() :
    LOAD_READINESS_STABLE_WINDOW_MS;
}

// The effective window: the configured one, never below the floor.
function resolvePublicationStableWindow(cluster, clock) {
  const configuredStableWindowMs =
    resolveConfiguredStableWindowMs(cluster, clock);
  const stableWindowFloorMs = clock.stableWindowFloorMs ??
    CERTIFICATION_PUBLICATION_WAIT.MIN_STABLE_WINDOW_MS;
  return {configuredStableWindowMs, stableWindowFloorMs,
    stableWindowMs: Math.max(stableWindowFloorMs,
      Number.isFinite(configuredStableWindowMs) ? configuredStableWindowMs :
        stableWindowFloorMs)};
}

function describePoll(probe, atMs) {
  return {...describeGateObservation(probe.gate), allActive: probe.allActive,
    atMs, completeCoverage: probe.completeCoverage, error: probe.error};
}

function resolvePublicationClock(cluster, clock) {
  return {
    budgetMs: clock.budgetMs ?? CERTIFICATION_PUBLICATION_WAIT.BUDGET_MS,
    now: clock.now || Date.now,
    pollMs: clock.pollMs ?? CERTIFICATION_PUBLICATION_WAIT.POLL_MS,
    sleep: clock.sleep ||
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    window: {consecutiveReady: ZERO, consecutiveReadyRequired:
      clock.consecutiveReady ?? CERTIFICATION_PUBLICATION_WAIT.CONSECUTIVE_READY,
    firstReadyAtMs: null, heldMs: ZERO,
    ...resolvePublicationStableWindow(cluster, clock)},
  };
}

// One poll moves the window: a qualifying poll extends it, any other
// restarts it. Returns whether the window is now complete.
function advancePublicationWindow(window, probe, atMs) {
  if (qualifiesForPublicationWindow(probe)) {
    window.consecutiveReady += ONE;
    window.firstReadyAtMs = window.firstReadyAtMs ?? atMs;
    window.heldMs = atMs - window.firstReadyAtMs;
  } else {
    window.consecutiveReady = ZERO;
    window.firstReadyAtMs = null;
    window.heldMs = ZERO;
  }
  return window.consecutiveReady >= window.consecutiveReadyRequired &&
    window.heldMs >= window.stableWindowMs;
}

function rememberPoll(recent, poll) {
  recent.push(poll);
  if (recent.length > PUBLICATION_POLLS_RECORDED) {
    recent.shift();
  }
  return poll;
}

/**
 * Wait, bounded, for a WINDOW of real publication convergence. On expiry
 * the result carries the spent wait: what was awaited and the last
 * observed state.
 * @param {Object} cluster Exposes _probeClusterActiveState(deadline, opts).
 * @param {Object} [clock] {now, sleep, budgetMs, pollMs, stableWindowMs,
 *   consecutiveReady}
 * @return {Promise<Object>}
 */
async function observePublicationConvergence(cluster, clock = {}) {
  const {budgetMs, now, pollMs, sleep, window} =
    resolvePublicationClock(cluster, clock);
  const startedAtMs = now();
  const recent = [];
  let polls = ZERO;
  let last = null;
  while (polls === ZERO || now() - startedAtMs < budgetMs) {
    const probe = await probePublicationGate(cluster, startedAtMs + budgetMs);
    const atMs = now();
    polls += ONE;
    last = rememberPoll(recent, describePoll(probe, atMs));
    if (advancePublicationWindow(window, probe, atMs)) {
      return {awaited: PUBLICATION_AWAITED, budgetMs,
        elapsedMs: now() - startedAtMs, lastObserved: last, observed: true,
        polls, recentPolls: recent, spentWait: null, window};
    }
    await sleep(pollMs);
  }
  const elapsedMs = now() - startedAtMs;
  return {awaited: PUBLICATION_AWAITED, budgetMs, elapsedMs,
    lastObserved: last, observed: false, polls, recentPolls: recent,
    spentWait: {awaited: PUBLICATION_AWAITED, boundMs: budgetMs, elapsedMs,
      lastObserved: last, wait: CERTIFICATION_PUBLICATION_WAIT.NAME},
    window};
}

async function attemptConvergenceWait(cluster, settleTimeoutMs) {
  try {
    // Recorded by the cluster's own waitForConvergence (observed below).
    await cluster.waitForConvergence({settleTimeoutMs});
    return null;
  } catch (error) {
    return String(error?.message || error);
  }
}

function isClaimedAtTarget(record) {
  return record?.state === VOTER_TARGET_STATE.AT_TARGET &&
    partitionClaimProblems(record).length === ZERO;
}

function resolveConvergenceClock(clock) {
  return {
    budgetMs: clock.convergenceBudgetMs ??
      CERTIFICATION_CONVERGENCE_WAIT.BUDGET_MS,
    now: clock.now || Date.now,
    pollMs: clock.convergencePollMs ?? CERTIFICATION_CONVERGENCE_WAIT.POLL_MS,
    sleep: clock.sleep ||
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
}

// One attempt of the stage wait, bounded by what is left of the budget;
// returns the record it left on the ledger (or null) and its error.
async function attemptStageConvergence(cluster, timing, startedAtMs) {
  const ledger = ledgerOf(cluster);
  const before = ledger.convergenceWaits.length;
  const error = await attemptConvergenceWait(cluster, Math.max(
    CERTIFICATION_CONVERGENCE_WAIT.MIN_ATTEMPT_MS,
    timing.budgetMs - (timing.now() - startedAtMs)));
  const record = ledger.convergenceWaits.length > before ?
    ledger.convergenceWaits.at(-ONE) : null;
  return {error, observed: error === null && isClaimedAtTarget(record),
    record};
}

// Only the last stage record decides; the earlier ones are superseded.
function markStageRecords(records) {
  records.forEach((record, index) => {
    if (record) {
      record.stageAttempt = index + ONE;
      record.supersededByStage = index < records.length - ONE;
    }
  });
}

// The stage's strict convergence wait (R6): re-run, bounded, until one
// observation has voters at target and nothing unclaimed.
async function runStageConvergenceWait(cluster, clock = {}) {
  const timing = resolveConvergenceClock(clock);
  const startedAtMs = timing.now();
  const within = () => timing.now() - startedAtMs < timing.budgetMs;
  const records = [];
  let attempt = {error: null, observed: false};
  do {
    attempt = await attemptStageConvergence(cluster, timing, startedAtMs);
    records.push(attempt.record);
    if (!attempt.observed && within()) {
      await timing.sleep(timing.pollMs);
    }
  } while (!attempt.observed && within());
  markStageRecords(records);
  const elapsedMs = timing.now() - startedAtMs;
  const last = records.at(-ONE) ?? null;
  return {attempts: records.length, budgetMs: timing.budgetMs, elapsedMs,
    error: attempt.error, lastObserved: last, observed: attempt.observed,
    spentWait: attempt.observed ? null : {
      awaited: CERTIFICATION_CONVERGENCE_WAIT.AWAITED,
      boundMs: timing.budgetMs, elapsedMs, lastObserved: last,
      wait: CERTIFICATION_CONVERGENCE_WAIT.NAME}};
}

function describeSetDifference(expected, observed) {
  const expectedSet = new Set(expected);
  const observedSet = new Set(observed);
  return {extra: arrayFilter(observed, (id) => !expectedSet.has(id)),
    missing: arrayFilter(expected, (id) => !observedSet.has(id))};
}

// R3: every node's own partitions read must name the same set as the
// expected set the final convergence record judged; at least
// PARTITION_CROSS_CHECK_MIN_NODES nodes must answer.
async function crossCheckPartitionSet(nodes, expected) {
  const reads = [];
  for (const node of nodes) {
    const read = await readPartitionVoterTargets([node]);
    reads.push({error: read.error, nodeId: node?.id ?? null,
      partitionIds: read.partitionIds});
  }
  const problems = [];
  const answered = arrayFilter(reads, (read) => Array.isArray(read.partitionIds));
  if (answered.length < PARTITION_CROSS_CHECK_MIN_NODES) {
    problems.push(`partition set cross-check: ${answered.length} node(s) ` +
      `answered the partitions read, needs ${PARTITION_CROSS_CHECK_MIN_NODES}`);
  }
  if (!Array.isArray(expected)) {
    problems.push('partition set cross-check: no expected set recorded');
  }
  for (const read of Array.isArray(expected) ? answered : []) {
    const difference = describeSetDifference(expected, read.partitionIds);
    if (difference.extra.length > ZERO || difference.missing.length > ZERO) {
      problems.push(`partition set cross-check: node ${read.nodeId} ` +
        `disagrees with the expected set: ${JSON.stringify(difference)}`);
    }
  }
  return {expected: expected ?? null, minNodes: PARTITION_CROSS_CHECK_MIN_NODES,
    problems, reads};
}

/**
 * The run's placed nodes and their host identities, captured while the
 * cluster still holds them (teardown clears the node map).
 * @param {Object} cluster
 * @return {Array<{id, hostIdentity}>}
 */
function captureCertificationNodes(cluster) {
  try {
    return arrayMap(cluster.getNodes() || [], (node) => ({
      hostIdentity: node?.hostIdentity ? {...node.hostIdentity} : null,
      id: node?.id ?? null,
    }));
  } catch (_error) {
    return [];
  }
}

/**
 * The certification stage, run only when certification was requested and
 * the scenario's own run returned: a strict convergence wait (no
 * tolerance), the bounded window of real publication convergence, then the
 * image each node's container runs. It never throws and never changes the
 * scenario's outcome.
 * @param {Object} cluster
 * @param {Object} [clock]
 * @return {Promise<Object>}
 */
async function runCertificationStage(cluster, clock = {}) {
  const convergence = await runStageConvergenceWait(cluster, clock);
  const publication = await observePublicationConvergence(cluster, clock);
  let liveNodes = [];
  try {
    liveNodes = cluster.getNodes() || [];
  } catch (_error) {
    liveNodes = [];
  }
  return {convergence, convergenceError: convergence.error,
    nodeImages: await observeNodeImages(liveNodes),
    nodes: captureCertificationNodes(cluster),
    partitionCrossCheck: await crossCheckPartitionSet(liveNodes,
      convergence.lastObserved?.expectedPartitionIds ?? null),
    publication};
}

// --- spent waits ---------------------------------------------------------

function cellsOf(line) {
  const cells = arrayMap(stringSplit(line, TABLE_CELL), stringTrim);
  return cells.slice(ONE, cells.length - ONE);
}

function backtickedNames(text) {
  return arrayMap([...String(text).matchAll(BACKTICK_TOKEN)],
    (match) => match[ONE]);
}

function sectionLines(lines, heading) {
  const start = arrayIndexOf(lines, heading);
  if (start < ZERO) {
    return null;
  }
  const section = [];
  for (const line of lines.slice(start + ONE)) {
    if (stringStartsWith(line, MARKDOWN_HEADING_PREFIX)) {
      break;
    }
    section.push(line);
  }
  return section;
}

function knownFindingRows(section) {
  const rows = arrayFilter(section, (line) =>
    stringStartsWith(stringTrim(line), TABLE_CELL) &&
    !TABLE_SEPARATOR_ROW.test(stringTrim(line)));
  return arrayFilter(arrayMap(rows.slice(ONE), (line) => {
    const cells = cellsOf(stringTrim(line));
    return {names: backtickedNames(cells[ZERO] || ''),
      owner: cells[2] || null, site: cells[ONE] || null};
  }), (row) => row.names.length > ZERO);
}

/**
 * Parse the census's classification tables.
 * @param {string} markdown
 * @return {{knownFindings: Array, expectedNone: Array<string>, error}}
 */
function parseSpentWaitCensus(markdown) {
  const lines = arrayMap(stringSplit(String(markdown), LINE_SEPARATOR),
    (line) => stringReplace(line, CARRIAGE_RETURN_TAIL, ''));
  const known = sectionLines(lines, CENSUS_KNOWN_FINDINGS_HEADING);
  const expected = sectionLines(lines, CENSUS_EXPECTED_NONE_HEADING);
  if (known === null || expected === null) {
    return {error: 'census classification tables not found',
      expectedNone: [], knownFindings: []};
  }
  const expectedNone = [];
  for (const line of expected) {
    if (stringStartsWith(line, LIST_ITEM_PREFIX)) {
      expectedNone.push(...backtickedNames(line));
    }
  }
  return {error: null, expectedNone, knownFindings: knownFindingRows(known)};
}

function readSpentWaitCensus(path = SPENT_WAIT_CENSUS_PATH) {
  try {
    return {...parseSpentWaitCensus(readFileSync(path, 'utf8')), path};
  } catch (error) {
    return {error: String(error?.message || error), expectedNone: [],
      knownFindings: [], path};
  }
}

function waitParts(wait) {
  return arrayFilter(arrayMap(stringSplit(String(wait), WAIT_PART_SEPARATOR),
    stringTrim), (part) => part.length > ZERO);
}

function knownFindingOf(wait, census) {
  const parts = waitParts(wait);
  for (const row of census.knownFindings) {
    if (parts.length > ZERO &&
        arrayEvery(parts, (part) => arrayIncludes(row.names, part))) {
      return row;
    }
  }
  return null;
}

function parseJsonLine(line) {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

// The reporter's record: event and a named wait. Anything else naming the
// token (a pretty-printed, prefixed or inspect-style line) is unparsed.
function isSpentWaitRecord(parsed) {
  return parsed?.event === WAIT_BOUND_SPENT_EVENT &&
    typeof parsed.wait === 'string';
}

function bootProvenanceOf(parsed) {
  return parsed !== null && objectHasOwn(parsed, BOOT_PROVENANCE_FIELD) ?
    {bootedSrcFingerprint: parsed.bootedSrcFingerprint ?? null,
      expectedSrcFingerprint: parsed.expectedSrcFingerprint ?? null,
      srcFingerprintMatches: parsed[BOOT_PROVENANCE_FIELD]} :
    null;
}

function scanLogLine(line, nodeId, scan) {
  scan.lineCount += ONE;
  const parsed = parseJsonLine(line);
  const boot = bootProvenanceOf(parsed);
  if (boot !== null) {
    scan.bootProvenance.push(boot);
  }
  if (!stringIncludes(line, WAIT_BOUND_SPENT_EVENT)) {
    return;
  }
  if (isSpentWaitRecord(parsed)) {
    scan.spent.push({...parsed, nodeId});
    return;
  }
  scan.unparsedSpentWaitLines += ONE;
  if (scan.unparsedSamples.length < UNPARSED_SPENT_WAIT_SAMPLES) {
    scan.unparsedSamples.push(line.slice(ZERO, 200));
  }
}

/**
 * One node's full log: its spent-wait records, every line that names the
 * token without being one, and its boot provenance lines. Both reporter
 * sinks (the logger's error and logConsoleOnly) write through the node's
 * one pino destination, its stdout, which the streaming capture writes
 * here (full-node-log-capture.js).
 * @param {string} path
 * @param {string} nodeId
 * @return {Promise<Object>}
 */
async function readNodeLogEvidence(path, nodeId) {
  const scan = {bootProvenance: [], lineCount: ZERO, spent: [],
    unparsedSamples: [], unparsedSpentWaitLines: ZERO};
  const source = createReadStream(path);
  const gunzip = createGunzip();
  // A read or decompression error ends the iteration with that error.
  source.on('error', (error) => gunzip.destroy(error));
  const lines = createInterface({crlfDelay: Infinity,
    input: source.pipe(gunzip)});
  try {
    for await (const line of lines) {
      scanLogLine(line, nodeId, scan);
    }
    return {...scan, error: null, nodeId, path};
  } catch (error) {
    return {...scan, error: String(error?.message || error), nodeId, path};
  } finally {
    lines.close();
    source.destroy();
  }
}

function summarizeNodeLog(log) {
  return {bootProvenanceLines: log.bootProvenance.length, error: log.error,
    lineCount: log.lineCount, nodeId: log.nodeId, path: log.path,
    spentWaitLines: log.spent.length, unparsedSamples: log.unparsedSamples,
    unparsedSpentWaitLines: log.unparsedSpentWaitLines};
}

/**
 * Read every `wait_bound_spent` line and every boot provenance line from
 * each node's full log of the run. A node without a readable full log
 * leaves the evidence incomplete.
 * @param {{outputDir: string, scenarioName: string, nodeIds: string[]}} input
 * @return {Promise<Object>} {lines, logs, missingNodeIds, unreadable,
 *   bootProvenance: {nodeId: [...]}}
 */
async function collectSpentWaitsFromNodeLogs({outputDir, scenarioName,
  nodeIds}) {
  const logs = [];
  const missingNodeIds = [];
  for (const nodeId of nodeIds) {
    const path = outputDir ?
      fullLogDestPath(outputDir, scenarioName, nodeId) :
      null;
    if (path === null || !existsSync(path)) {
      missingNodeIds.push(nodeId);
      continue;
    }
    logs.push(await readNodeLogEvidence(path, nodeId));
  }
  const lines = [];
  const bootProvenance = {};
  for (const log of logs) {
    lines.push(...log.spent);
    bootProvenance[log.nodeId] = log.bootProvenance;
  }
  return {bootProvenance, lines, logs: arrayMap(logs, summarizeNodeLog),
    missingNodeIds,
    unreadable: arrayMap(arrayFilter(logs, (log) => log.error !== null),
      (log) => log.nodeId)};
}

function sampleOf(line) {
  return {awaited: line.awaited ?? null, boundMs: line.boundMs ?? null,
    elapsedMs: line.elapsedMs ?? null, lastObserved: line.lastObserved ?? null,
    nodeId: line.nodeId ?? null, scope: line.scope ?? null};
}

function groupSpentWaits(lines, census) {
  const byWait = new Map();
  for (const line of lines) {
    const wait = String(line.wait ?? '');
    if (!byWait.has(wait)) {
      const known = knownFindingOf(wait, census);
      byWait.set(wait, {class: known ? SPENT_WAIT_CLASS.KNOWN_FINDING :
        SPENT_WAIT_CLASS.UNEXPECTED, expectedNoneInHealth: arraySome(
        waitParts(wait), (part) => arrayIncludes(census.expectedNone, part)),
      lines: ZERO, nodeIds: [], owner: known?.owner ?? null, repeats: ZERO,
      samples: [], site: known?.site ?? null, wait});
    }
    const group = byWait.get(wait);
    group.lines += ONE;
    group.repeats += Number.isFinite(line.repeats) ? line.repeats : ZERO;
    if (!arrayIncludes(group.nodeIds, line.nodeId)) {
      group.nodeIds.push(line.nodeId);
    }
    if (group.samples.length < SPENT_WAIT_SAMPLES_PER_WAIT) {
      group.samples.push(sampleOf(line));
    }
  }
  return [...byWait.values()].sort((left, right) =>
    (left.wait < right.wait ? -ONE : ONE));
}

function nodeLogProblems(logs) {
  const problems = [];
  for (const log of logs || []) {
    if (log.lineCount === ZERO) {
      problems.push(`empty full log for node ${log.nodeId}`);
    } else if (log.bootProvenanceLines === ZERO) {
      problems.push(`full log for node ${log.nodeId} has no boot ` +
        'provenance line (implausible capture)');
    }
    if (log.unparsedSpentWaitLines > ZERO) {
      problems.push(`${log.unparsedSpentWaitLines} line(s) naming ` +
        `${WAIT_BOUND_SPENT_EVENT} in node ${log.nodeId}'s log are not the ` +
        'reporter\'s record');
    }
  }
  return problems;
}

function spentWaitEvidenceProblems(collected, census, captureWarning) {
  return arrayFilter([
    ...nodeLogProblems(collected.logs),
    collected.captureMode && collected.captureMode !== CAPTURE_MODE.STREAMED ?
      `node logs captured in ${collected.captureMode} mode: the node's ` +
        'stdout (pre-initialization console lines) is not in the full log' :
      null,
    census.error ? 'census unreadable: ' + census.error : null,
    collected.missingNodeIds.length > ZERO ?
      'no full log for node(s) ' + collected.missingNodeIds.join(', ') :
      null,
    collected.unreadable.length > ZERO ?
      'unreadable full log for node(s) ' + collected.unreadable.join(', ') :
      null,
    collected.nodeCount === ZERO ? 'no node of the run was observed' : null,
    captureWarning || null,
  ], (problem) => problem !== null);
}

/**
 * Classify a run's spent waits. Pure.
 * @param {Object} collected From collectSpentWaitsFromNodeLogs (+nodeCount).
 * @param {Object} census From readSpentWaitCensus.
 * @param {string} [policy] One of KNOWN_FINDING_SPENT_WAIT_POLICY_MODE.
 * @param {string|null} [captureWarning] The cluster's incomplete-capture
 *   warning, if any.
 * @return {Object} The spent_waits condition.
 */
function classifySpentWaits(collected, census,
  policy = CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY,
  captureWarning = null) {
  const groups = groupSpentWaits(collected.lines, census);
  const unexpected = arrayFilter(groups,
    (group) => group.class === SPENT_WAIT_CLASS.UNEXPECTED);
  const known = arrayFilter(groups,
    (group) => group.class === SPENT_WAIT_CLASS.KNOWN_FINDING);
  const problems = spentWaitEvidenceProblems(collected, census,
    captureWarning);
  const failures = arrayFilter([
    problems.length > ZERO ? CERTIFICATION_FAILURE.SPENT_WAIT_EVIDENCE : null,
    unexpected.length > ZERO ? CERTIFICATION_FAILURE.UNEXPECTED_SPENT_WAIT :
      null,
    known.length > ZERO &&
      policy !== KNOWN_FINDING_SPENT_WAIT_POLICY_MODE.LIST_WITH_OWNER ?
      CERTIFICATION_FAILURE.KNOWN_FINDING_SPENT_WAIT :
      null,
  ], (failure) => failure !== null);
  const failureDetail = arrayMap(known, (group) =>
    `${group.wait} (owner: ${group.owner}; ${group.lines} line(s))`);
  return {
    condition: CERTIFICATION_CONDITION.SPENT_WAITS,
    evidence: {byWait: groups, census: {expectedNone: census.expectedNone,
      knownFindingWaits: arrayMap(census.knownFindings, (row) => row.names),
      path: census.path ?? null},
    knownFindings: arrayMap(known, (group) => ({lines: group.lines,
      owner: group.owner, wait: group.wait})),
    logs: collected.logs, policy, problems,
    unexpected: arrayMap(unexpected, (group) => group.wait)},
    failure: failures[ZERO] ?? null,
    failureDetail: failures.length > ZERO ?
      [...problems, ...arrayMap(unexpected, (group) =>
        `${group.wait} (unexpected)`), ...failureDetail] :
      [],
    failures,
    met: failures.length === ZERO,
  };
}

// --- the other conditions ------------------------------------------------

function condition(name, met, failure, evidence, extra = {}) {
  return {condition: name, evidence, failure: met ? null : failure,
    failures: met ? [] : [failure], met, ...extra};
}

function evaluateScenarioPassed(evidence) {
  const outcome = scenarioOutcomeOf(evidence.scenarioResult);
  return condition(CERTIFICATION_CONDITION.SCENARIO_PASSED,
    outcome === SCENARIO_OUTCOME.PASSED,
    CERTIFICATION_FAILURE.SCENARIO_NOT_PASSED,
    {error: evidence.scenarioResult?.error ?? null, outcome});
}

function evaluateNoRefusal(evidence) {
  const outcome = scenarioOutcomeOf(evidence.scenarioResult);
  return condition(CERTIFICATION_CONDITION.NO_REFUSAL,
    outcome !== SCENARIO_OUTCOME.REFUSED, CERTIFICATION_FAILURE.REFUSED,
    {outcome, refusal: evidence.scenarioResult?.refusal ?? null});
}

const DECLARED_HOST_SOURCES = Object.freeze([
  HOST_IDENTITY_SOURCE.DECLARED_MACHINE_ID,
  HOST_IDENTITY_SOURCE.PROVIDER_INTERNAL_ADDRESS,
]);

function placedHostProblems(nodes, requirement) {
  const hostIds = arrayMap(nodes, (node) => node.hostIdentity?.hostId ?? null);
  const problems = [];
  if (nodes.length < (requirement?.minNodes ?? Infinity)) {
    problems.push(`placed ${nodes.length} node(s), requires ` +
      String(requirement?.minNodes ?? 'a declared minimum'));
  }
  if (arraySome(nodes, (node) => !arrayIncludes(DECLARED_HOST_SOURCES,
    node.hostIdentity?.source))) {
    problems.push('a placed node has no declared machine identity');
  }
  const counts = new Map();
  for (const hostId of hostIds) {
    counts.set(hostId, (counts.get(hostId) || ZERO) + ONE);
  }
  const maxOnOne = Math.max(ZERO, ...counts.values());
  if (maxOnOne > (requirement?.maxNodesPerHost ?? ZERO)) {
    problems.push(`${maxOnOne} placed node(s) share one host`);
  }
  return problems;
}

function evaluateTopology(evidence) {
  const topology = evidence.topology || null;
  const nodes = evidence.nodes || [];
  const problems = topology?.met === true ?
    placedHostProblems(nodes, topology.requirement) :
    [`config topology: ${topology?.reason || 'not evaluated'}`];
  return condition(CERTIFICATION_CONDITION.TOPOLOGY, problems.length === ZERO,
    CERTIFICATION_FAILURE.TOPOLOGY, {
      config: topology,
      placedNodes: arrayMap(nodes, (node) => ({
        hostId: node.hostIdentity?.hostId ?? null, nodeId: node.id,
        source: node.hostIdentity?.source ?? null})),
      problems,
    }, {unit: SPREAD_UNIT.HOST});
}

function evaluatePublication(evidence) {
  const publication = evidence.stage?.publication || null;
  return condition(CERTIFICATION_CONDITION.PUBLICATION_CONVERGENCE,
    publication?.observed === true, CERTIFICATION_FAILURE.PUBLICATION,
    publication || {observed: false, statement: 'not observed: the ' +
      'certification stage did not run (the scenario did not return)'});
}

// The claim must be every partition that exists: the wait's authoritative
// partitions read (system, priority and user-table partitions, split
// children included). A partition outside the claim was never judged.
function partitionClaimProblems(wait) {
  const expected = wait.expectedPartitionIds;
  const unclaimed = wait.unclaimedPartitionIds;
  if (!Array.isArray(expected) || expected.length === ZERO) {
    return ['a convergence wait recorded no partition from the partitions ' +
      'read (expected set empty)'];
  }
  if (!Array.isArray(unclaimed) || unclaimed.length > ZERO) {
    return ['a convergence wait left partitions unclaimed: ' +
      JSON.stringify(unclaimed ?? null)];
  }
  const missing = arrayFilter(expected, (partitionId) =>
    !arrayIncludes(wait.claimedPartitionIds || [], partitionId));
  return missing.length > ZERO ?
    ['a convergence wait did not claim ' + JSON.stringify(missing)] :
    [];
}

// The stage's own convergence observation and partition cross-check.
function stageVoterProblems(stage) {
  if (!stage) {
    return ['the certification stage did not run: no strict convergence ' +
      'observation and no partition set cross-check'];
  }
  const problems = [...(stage.partitionCrossCheck?.problems ??
    ['partition set cross-check: not run'])];
  if (stage.convergence?.observed !== true) {
    problems.push('the stage convergence wait ended without voters at ' +
      'target and every partition claimed (' +
      `${CERTIFICATION_CONVERGENCE_WAIT.NAME} spent)`);
  }
  return problems;
}

function evaluateVoters(evidence) {
  const waits = arrayFilter(evidence.convergenceWaits || [],
    (wait) => wait.supersededByStage !== true);
  const problems = [];
  if (waits.length === ZERO) {
    problems.push('no convergence wait observed');
  }
  for (const wait of waits) {
    if (wait.state !== VOTER_TARGET_STATE.AT_TARGET) {
      problems.push(`a convergence wait ended ${wait.state}`);
    }
    if (wait.toleranceDeclared) {
      problems.push('an under-replication tolerance was declared: ' +
        String(wait.toleranceReason));
    }
    if (wait.state !== CONVERGENCE_WAIT_FAILED) {
      problems.push(...partitionClaimProblems(wait));
    }
  }
  problems.push(...stageVoterProblems(evidence.stage));
  return condition(CERTIFICATION_CONDITION.VOTERS_AT_TARGET,
    problems.length === ZERO, CERTIFICATION_FAILURE.VOTERS,
    {problems, required: VOTER_TARGET_STATE.AT_TARGET,
      stageConvergence: evidence.stage?.convergence ?? null,
      partitionCrossCheck: evidence.stage?.partitionCrossCheck ?? null,
      waits: evidence.convergenceWaits || []});
}

function gateRecordProblems(records, gateName) {
  if (records.length === ZERO) {
    return [`no ${gateName} gate record`];
  }
  const problems = [];
  for (const record of records) {
    if (record.passed !== true) {
      problems.push(`${gateName} failed`);
    }
    if (record.spreadUnit !== SPREAD_UNIT.HOST ||
        record.leaderSpread?.unit !== SPREAD_UNIT.HOST) {
      problems.push(`${gateName} spread unit is ` +
        JSON.stringify(record.spreadUnit ?? null) + ', not host');
    }
    if (arraySome(record.nodeHosts || [], (node) =>
      !arrayIncludes(DECLARED_HOST_SOURCES, node.hostSource))) {
      problems.push(`${gateName} counted a node without a declared machine`);
    }
  }
  return problems;
}

// What the last record of the spread gate stated.
function describeSpreadGate(records) {
  const last = records.at(-ONE) || {};
  return {
    hostAuthority: last.hostAuthority ?? null,
    leaderSpread: last.leaderSpread ?? null,
    passed: last.passed ?? null,
    records: records.length,
    spreadUnit: last.spreadUnit ?? null,
  };
}

function evaluateHostSpread(evidence) {
  const gateName = evidence.topology?.requirement?.spreadGate ?? null;
  const records = arrayFilter(evidence.gates || [],
    (record) => gateName !== null && record?.gate === gateName);
  const problems = gateName === null ?
    ['the scenario names no host-spread gate'] :
    gateRecordProblems(records, gateName);
  return condition(CERTIFICATION_CONDITION.HOST_SPREAD,
    problems.length === ZERO, CERTIFICATION_FAILURE.HOST_SPREAD,
    {gate: gateName, problems, ...describeSpreadGate(records)},
    {unit: SPREAD_UNIT.HOST});
}

function describeFailureDetail(entry) {
  const detail = entry.failureDetail ?? entry.evidence?.problems ?? [];
  return detail.length > ZERO ? ` (${detail.join('; ')})` : '';
}

const CONDITION_EVALUATORS = Object.freeze([
  evaluateScenarioPassed,
  evaluateNoRefusal,
  evaluateTopology,
  evaluatePublication,
  evaluateVoters,
  evaluateHostSpread,
  (evidence) => evidence.spentWaits,
  evaluateCommitIdentity,
]);

/**
 * The certification verdict of one scenario run. Pure: every input is an
 * observation recorded in the run; absent evidence is a named failure.
 * @param {Object} evidence {certification, scenarioResult, topology, nodes,
 *   stage, convergenceWaits, gates, spentWaits, staleSourceWarning}
 * @return {Object}
 */
function buildCertificationVerdict(evidence) {
  const conditions = arrayMap(CONDITION_EVALUATORS,
    (evaluate) => evaluate(evidence));
  const failures = [];
  for (const entry of conditions) {
    failures.push(...entry.failures);
  }
  const certified = failures.length === ZERO;
  const identity = evidence.certification?.commitIdentity || null;
  return {
    certified,
    conditions,
    failures,
    notCertified: [
      ...arrayMap(arrayFilter(conditions, (entry) => !entry.met),
        (entry) => `${entry.condition}: ${entry.failures.join(', ')}` +
          describeFailureDetail(entry)),
      ...STANDING_LIMITS,
    ],
    requested: true,
    requestedSha: evidence.certification?.requestedSha ?? null,
    schema: CERTIFICATION_SCHEMA,
    sha: certified ? identity?.headSha ?? null : null,
    spreadUnit: SPREAD_UNIT.HOST,
  };
}

/**
 * Gather the run's observations and decide its certification. Called by
 * the runner after teardown (full node logs are final); never throws.
 * @param {Object} input {certification, cluster, config, scenarioName,
 *   scenarioResult, topology, stage, nodes, census?, policy?}
 * @return {Promise<Object>} The certification block of the report entry.
 */
async function certifyScenarioRun(input) {
  if (input.certification?.requested !== true) {
    return CERTIFICATION_NOT_REQUESTED;
  }
  try {
    return await decideScenarioCertification(input);
  } catch (error) {
    return {certified: false,
      error: String(error?.message || error),
      failures: [CERTIFICATION_FAILURE.EVIDENCE_COLLECTION],
      notCertified: ['the certification evidence could not be collected'],
      requested: true, requestedSha: input.certification.requestedSha ?? null,
      schema: CERTIFICATION_SCHEMA, sha: null, spreadUnit: SPREAD_UNIT.HOST};
  }
}

function captureModeOf(cluster) {
  return typeof cluster?._isFileLoggingEnabled === 'function' &&
    cluster._isFileLoggingEnabled() === true ?
    CAPTURE_MODE.FILE :
    CAPTURE_MODE.STREAMED;
}

function classifyRunSpentWaits(input, collected, nodes) {
  return classifySpentWaits({...collected,
    captureMode: captureModeOf(input.cluster), nodeCount: nodes.length},
  input.census || readSpentWaitCensus(), input.policy,
  input.cluster?._incompleteCaptureWarning ?? null);
}

async function decideScenarioCertification(input) {
  const stage = input.stage || null;
  const nodes = stage?.nodes || input.nodes || [];
  const ledger = readLedger(input.cluster);
  const collected = await collectSpentWaitsFromNodeLogs({
    nodeIds: arrayMap(nodes, (node) => node.id),
    outputDir: input.config?.outputDir ?? null,
    scenarioName: input.scenarioName,
  });
  return buildCertificationVerdict({
    bootProvenance: collected.bootProvenance,
    certification: input.certification,
    convergenceWaits: ledger.convergenceWaits,
    gates: ledger.gates,
    nodeImages: stage?.nodeImages ?? [],
    nodes,
    scenarioResult: input.scenarioResult,
    spentWaits: classifyRunSpentWaits(input, collected, nodes),
    stage,
    staleSourceWarning: input.cluster?._staleSourceWarning ?? null,
    topology: input.topology || null,
  });
}

/**
 * The certification block of a scenario that never started: refused before
 * it ran, or its module failed to load.
 * @param {Object} certification The run's certification request.
 * @param {Object} scenarioResult The refused result.
 * @param {Object|null} topology
 * @return {Object}
 */
function certifyUnstartedScenario(certification, scenarioResult, topology) {
  if (certification?.requested !== true) {
    return CERTIFICATION_NOT_REQUESTED;
  }
  const census = {error: 'not read: the scenario was refused',
    expectedNone: [], knownFindings: [], path: null};
  return buildCertificationVerdict({
    certification, convergenceWaits: [], gates: [], nodes: [],
    scenarioResult,
    spentWaits: classifySpentWaits({lines: [], logs: [], missingNodeIds: [],
      nodeCount: ZERO, unreadable: []}, census),
    stage: null, staleSourceWarning: null, topology,
  });
}

// --- the streak rule -----------------------------------------------------

const STREAK_SAMPLE = Object.freeze({
  CERTIFIED: 'certified',
  FAILED: 'failed',
  NOT_A_SAMPLE: 'not_a_sample',
});

/**
 * How one report entry counts toward a certification streak:
 * - refused (not run): not a sample;
 * - a pass whose run did not request certification: not a certification
 *   sample;
 * - a FAIL, or a certification run whose verdict is not certified: resets;
 * - certified: true at its observed sha: counts at that sha.
 * @param {Object} entry A report scenario entry.
 * @return {{kind: string, sha: string|null}}
 */
function classifyStreakSample(entry) {
  const outcome = scenarioOutcomeOf(entry);
  const certification = entry?.certification || null;
  if (outcome === SCENARIO_OUTCOME.REFUSED) {
    return {kind: STREAK_SAMPLE.NOT_A_SAMPLE, sha: null};
  }
  if (certification?.requested === true) {
    return certification.certified === true &&
      SHA_PATTERN.test(String(certification.sha || '')) &&
      outcome === SCENARIO_OUTCOME.PASSED ?
      {kind: STREAK_SAMPLE.CERTIFIED, sha: certification.sha} :
      {kind: STREAK_SAMPLE.FAILED, sha: null};
  }
  return outcome === SCENARIO_OUTCOME.PASSED ?
    {kind: STREAK_SAMPLE.NOT_A_SAMPLE, sha: null} :
    {kind: STREAK_SAMPLE.FAILED, sha: null};
}

/**
 * The newest contiguous run of certified samples at ONE sha. A FAIL or a
 * certified sample at another sha ends it; refused and uncertified passes
 * are skipped, never counted.
 * @param {Array<Object>} entries Report scenario entries, newest first.
 * @param {number} consecutive
 * @return {Object} {count, sha, done, consecutive, endedBy}
 */
function evaluateCertificationStreak(entries, consecutive) {
  let sha = null;
  let count = ZERO;
  let endedBy = null;
  for (const entry of entries) {
    const sample = classifyStreakSample(entry);
    if (sample.kind === STREAK_SAMPLE.NOT_A_SAMPLE) {
      continue;
    }
    if (sample.kind === STREAK_SAMPLE.FAILED) {
      endedBy = STREAK_SAMPLE.FAILED;
      break;
    }
    if (sha !== null && sample.sha !== sha) {
      endedBy = 'other_sha';
      break;
    }
    sha = sample.sha;
    count += ONE;
    if (count >= consecutive) {
      break;
    }
  }
  return {consecutive, count, done: count >= consecutive, endedBy, sha};
}

export {
  CERTIFICATION_CONDITION,
  CERTIFICATION_FAILURE,
  CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY,
  CERTIFICATION_NOT_REQUESTED,
  KNOWN_FINDING_SPENT_WAIT_POLICY_MODE,
  captureCertificationNodes,
  certifyScenarioRun,
  certifyUnstartedScenario,
  classifySpentWaits,
  evaluateCertificationStreak,
  observeConvergenceWait,
  readLedger as readCertificationLedger,
  parseSpentWaitCensus,
  readSpentWaitCensus,
  recordCertificationGate,
  runCertificationStage,
};
