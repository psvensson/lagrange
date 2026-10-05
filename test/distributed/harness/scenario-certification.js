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
 *   publication_convergence after the scenario, the load-mode publication
 *                          convergence gate is `ready === true` from real
 *                          evidence with claimState CLAIMED_LOAD - the
 *                          startup admission (`not claimed at startup`)
 *                          never counts; a bounded wait that expires is a
 *                          reported spent wait;
 *   voters_at_target       every convergence wait of the run (the
 *                          scenario's and the certification stage's own)
 *                          ended voters_at_target with no under-replication
 *                          tolerance declared;
 *   host_spread            the scenario's named spread gate passed with
 *                          spreadUnit 'host' on declared machine facts;
 *   no_refusal             the scenario was not refused;
 *   spent_waits            every `wait_bound_spent` line of every node's
 *                          full log, grouped by `wait`, classified against
 *                          the bounded-wait census: any wait outside the
 *                          census's known findings fails; known findings
 *                          are listed with their owner and decided by
 *                          CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY;
 *   commit_identity        the controller checkout the images were built
 *                          from is clean and its HEAD is the requested sha,
 *                          the image carries that commit, and no node booted
 *                          stale source.
 */

import {execFileSync} from 'node:child_process';
import {createReadStream, existsSync, readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {createGunzip} from 'node:zlib';
import {WAIT_BOUND_SPENT_EVENT} from '../../../src/logging/wait-bound-spent.js';
import {CLUSTER_BASE_LAYER} from './cluster-base-layer.js';
import {VOTER_TARGET_STATE} from './convergence-voter-targets.js';
import {fullLogDestPath} from './full-node-log-capture.js';
import {PUBLICATION_CONVERGENCE_CLAIM_STATE} from './publication-convergence-claim.js';
import {SCENARIO_OUTCOME, scenarioOutcomeOf} from './scenario-outcome.js';
import {HOST_IDENTITY_SOURCE, SPREAD_UNIT} from './scenario-host-topology.js';

const {CLUSTER_READINESS_MODE_LOAD} = CLUSTER_BASE_LAYER;

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
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const weakMapGet = Function.call.bind(WeakMap.prototype.get);
const weakMapSet = Function.call.bind(WeakMap.prototype.set);

const ZERO = 0;
const ONE = 1;
const CERTIFICATION_SCHEMA = 'scenario-certification/1';
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const GIT = 'git';
const GIT_HEAD_ARGS = Object.freeze(['rev-parse', 'HEAD']);
const GIT_STATUS_ARGS = Object.freeze(['status', '--porcelain']);
const DIRTY_PATHS_REPORTED = 20;
const SPENT_WAIT_SAMPLES_PER_WAIT = 3;
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
 * (owner)". The owner has not ruled that known findings fail certification:
 * each occurrence is listed prominently with its owner and does not fail by
 * itself. Tighten to KNOWN_FINDING_SPENT_WAIT_POLICY_MODE.FAIL to make
 * every known finding fail certification. A wait OUTSIDE the known findings
 * always fails (certification_unexpected_spent_wait).
 */
const CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY =
  KNOWN_FINDING_SPENT_WAIT_POLICY_MODE.LIST_WITH_OWNER;

// The certification stage's own bounded wait for real publication
// convergence (after the scenario, before certifying).
const CERTIFICATION_PUBLICATION_WAIT = Object.freeze({
  BUDGET_MS: 120000,
  NAME: 'CERTIFICATION_PUBLICATION_WAIT.BUDGET_MS',
  POLL_MS: 2000,
});
const PUBLICATION_AWAITED =
  'load-mode publication convergence gate ready === true from real ' +
  'evidence (claimState ' +
  PUBLICATION_CONVERGENCE_CLAIM_STATE.CLAIMED_LOAD + ')';

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


// What a certified verdict still does NOT certify, stated on every verdict.
const STANDING_LIMITS = Object.freeze([
  'committed raft membership (raft-rs ConfState) is not observed: the ' +
    'gates measure replicated services/partitions rows',
  'known-finding spent waits are listed with their owner and decided by ' +
    'CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY, not hidden',
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

/**
 * The statement a consumer that is NOT certification prints (formation
 * health, the seed budget gate, ship readiness, the distributed matrix).
 */
const NOT_CERTIFICATION_EVIDENCE = Object.freeze({
  certificationEvidence: false,
  statement: 'NOT certification evidence: certification is a ' +
    '`certified: true` verdict from a `--certify <sha>` distributed harness ' +
    'run (test/distributed/harness/scenario-certification.js)',
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

// How one cluster.waitForConvergence call ended.
function recordConvergenceWait(cluster, options, ending) {
  const tolerance = options?.tolerateUnderReplication;
  ledgerOf(cluster)?.convergenceWaits.push({
    error: ending.error ? String(ending.error.message || ending.error) : null,
    state: ending.error ?
      CONVERGENCE_WAIT_FAILED :
      (ending.result?.voterTargets?.state ?? null),
    toleranceDeclared: tolerance !== undefined,
    toleranceReason: tolerance?.reason ?? null,
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

function defaultGit(args, cwd) {
  return execFileSync(GIT, args, {cwd, encoding: 'utf8'});
}

/**
 * Observe the controller checkout the harness builds images from.
 * @param {{requestedSha: string, cwd?: string, git?: Function}} input
 * @return {Object} {requestedSha, headSha, dirty, dirtyPaths,
 *   dirtyPathCount, error}
 */
function observeCommitIdentity({requestedSha, cwd = process.cwd(),
  git = defaultGit}) {
  try {
    const headSha = stringTrim(String(git([...GIT_HEAD_ARGS], cwd)));
    const dirtyPaths = arrayFilter(stringSplit(
      String(git([...GIT_STATUS_ARGS], cwd)), LINE_SEPARATOR),
    (line) => stringTrim(line).length > ZERO);
    return {dirty: dirtyPaths.length > ZERO,
      dirtyPathCount: dirtyPaths.length,
      dirtyPaths: dirtyPaths.slice(ZERO, DIRTY_PATHS_REPORTED), error: null,
      headSha, requestedSha: requestedSha ?? null};
  } catch (error) {
    return {dirty: null, dirtyPathCount: null, dirtyPaths: [],
      error: String(error?.message || error), headSha: null,
      requestedSha: requestedSha ?? null};
  }
}

/**
 * Why a commit identity cannot certify, or null.
 * @param {Object|null} identity From observeCommitIdentity.
 * @return {string|null}
 */
function commitIdentityProblem(identity) {
  if (!identity || identity.error) {
    return 'commit identity not observed' +
      (identity?.error ? ': ' + identity.error : '');
  }
  if (!SHA_PATTERN.test(String(identity.requestedSha || ''))) {
    return 'requested sha is not a full 40-hex commit: ' +
      JSON.stringify(identity.requestedSha);
  }
  if (identity.dirty !== false) {
    return `checkout is dirty (${identity.dirtyPathCount} path(s))`;
  }
  if (identity.headSha !== identity.requestedSha) {
    return `checkout HEAD ${identity.headSha} is not the requested ` +
      identity.requestedSha;
  }
  return null;
}

function imageIdentityProblem(image, headSha) {
  if (!image || typeof image.gitHash !== 'string' ||
      image.gitHash.length === ZERO) {
    return 'image commit not observed';
  }
  if (image.gitDirty !== false) {
    return 'image built from a dirty checkout';
  }
  return stringStartsWith(String(headSha || ''), image.gitHash) ?
    null :
    `image commit ${image.gitHash} is not ${headSha}`;
}

function evaluateCommitIdentity(evidence) {
  const certification = evidence.certification || {};
  const identity = certification.commitIdentity || null;
  const problems = arrayFilter([
    commitIdentityProblem(identity),
    imageIdentityProblem(certification.image, identity?.headSha),
    evidence.staleSourceWarning || null,
  ], (problem) => problem !== null);
  return condition(CERTIFICATION_CONDITION.COMMIT_IDENTITY,
    problems.length === ZERO, CERTIFICATION_FAILURE.COMMIT_IDENTITY, {
      image: certification.image || null,
      identity,
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

async function probePublicationGate(cluster, deadline) {
  try {
    const probe = await cluster._probeClusterActiveState(deadline,
      {mode: CLUSTER_READINESS_MODE_LOAD});
    return {error: null, gate: probe?.publicationConvergenceGate ?? null};
  } catch (error) {
    return {error: String(error?.message || error), gate: null};
  }
}

/**
 * Wait, bounded, for real publication convergence. On expiry the result
 * carries the spent wait: what was awaited and the last observed state.
 * @param {Object} cluster Exposes _probeClusterActiveState(deadline, opts).
 * @param {Object} [clock] {now, sleep, budgetMs, pollMs}
 * @return {Promise<Object>}
 */
async function observePublicationConvergence(cluster, clock = {}) {
  const now = clock.now || Date.now;
  const sleep = clock.sleep ||
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const budgetMs = clock.budgetMs ?? CERTIFICATION_PUBLICATION_WAIT.BUDGET_MS;
  const pollMs = clock.pollMs ?? CERTIFICATION_PUBLICATION_WAIT.POLL_MS;
  const startedAtMs = now();
  let polls = ZERO;
  let last = null;
  while (polls === ZERO || now() - startedAtMs < budgetMs) {
    const probe = await probePublicationGate(cluster, startedAtMs + budgetMs);
    polls += ONE;
    last = {...describeGateObservation(probe.gate), error: probe.error};
    if (isRealPublicationConvergence(probe.gate)) {
      return {awaited: PUBLICATION_AWAITED, budgetMs,
        elapsedMs: now() - startedAtMs, lastObserved: last, observed: true,
        polls, spentWait: null};
    }
    await sleep(pollMs);
  }
  const elapsedMs = now() - startedAtMs;
  return {awaited: PUBLICATION_AWAITED, budgetMs, elapsedMs,
    lastObserved: last, observed: false, polls,
    spentWait: {awaited: PUBLICATION_AWAITED, boundMs: budgetMs, elapsedMs,
      lastObserved: last, wait: CERTIFICATION_PUBLICATION_WAIT.NAME}};
}

async function runStageConvergenceWait(cluster) {
  try {
    // Recorded by the cluster's own waitForConvergence (observed below).
    await cluster.waitForConvergence();
    return null;
  } catch (error) {
    return String(error?.message || error);
  }
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
 * tolerance), then the bounded wait for real publication convergence. It
 * never throws and never changes the scenario's outcome.
 * @param {Object} cluster
 * @param {Object} [clock]
 * @return {Promise<Object>}
 */
async function runCertificationStage(cluster, clock = {}) {
  const convergenceError = await runStageConvergenceWait(cluster);
  const publication = await observePublicationConvergence(cluster, clock);
  return {convergenceError, nodes: captureCertificationNodes(cluster),
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

function parseSpentWaitLine(line) {
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch (_error) {
    return null;
  }
  return parsed && parsed.event === WAIT_BOUND_SPENT_EVENT ? parsed : null;
}

async function readNodeSpentWaits(path, nodeId) {
  const spent = [];
  const source = createReadStream(path);
  const gunzip = createGunzip();
  // A read or decompression error ends the iteration with that error.
  source.on('error', (error) => gunzip.destroy(error));
  const lines = createInterface({crlfDelay: Infinity,
    input: source.pipe(gunzip)});
  let lineCount = ZERO;
  try {
    for await (const line of lines) {
      lineCount += ONE;
      const parsed = parseSpentWaitLine(line);
      if (parsed !== null) {
        spent.push({...parsed, nodeId});
      }
    }
    return {error: null, lineCount, nodeId, path, spent};
  } catch (error) {
    return {error: String(error?.message || error), lineCount, nodeId, path,
      spent};
  } finally {
    lines.close();
    source.destroy();
  }
}

/**
 * Read every `wait_bound_spent` line from each node's full log of the run.
 * A node without a readable full log leaves the evidence incomplete.
 * @param {{outputDir: string, scenarioName: string, nodeIds: string[]}} input
 * @return {Promise<Object>} {lines, logs, missingNodeIds, unreadable}
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
    logs.push(await readNodeSpentWaits(path, nodeId));
  }
  const lines = [];
  for (const log of logs) {
    lines.push(...log.spent);
  }
  return {lines, logs: arrayMap(logs, (log) => ({error: log.error,
    lineCount: log.lineCount, nodeId: log.nodeId, path: log.path,
    spentWaitLines: log.spent.length})), missingNodeIds,
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

function spentWaitEvidenceProblems(collected, census, captureWarning) {
  return arrayFilter([
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

function evaluateVoters(evidence) {
  const waits = evidence.convergenceWaits || [];
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
  }
  return condition(CERTIFICATION_CONDITION.VOTERS_AT_TARGET,
    problems.length === ZERO, CERTIFICATION_FAILURE.VOTERS,
    {problems, required: VOTER_TARGET_STATE.AT_TARGET, waits});
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
        (entry) => `${entry.condition}: ${entry.failures.join(', ')}`),
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

async function observeRunSpentWaits(input, nodes) {
  const collected = await collectSpentWaitsFromNodeLogs({
    nodeIds: arrayMap(nodes, (node) => node.id),
    outputDir: input.config?.outputDir ?? null,
    scenarioName: input.scenarioName,
  });
  return classifySpentWaits({...collected, nodeCount: nodes.length},
    input.census || readSpentWaitCensus(), input.policy,
    input.cluster?._incompleteCaptureWarning ?? null);
}

async function decideScenarioCertification(input) {
  const nodes = input.stage?.nodes || input.nodes || [];
  const ledger = readLedger(input.cluster);
  return buildCertificationVerdict({
    certification: input.certification,
    convergenceWaits: ledger.convergenceWaits,
    gates: ledger.gates,
    nodes,
    scenarioResult: input.scenarioResult,
    spentWaits: await observeRunSpentWaits(input, nodes),
    stage: input.stage || null,
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
  NOT_CERTIFICATION_EVIDENCE,
  captureCertificationNodes,
  certifyScenarioRun,
  certifyUnstartedScenario,
  classifySpentWaits,
  commitIdentityProblem,
  evaluateCertificationStreak,
  observeCommitIdentity,
  observeConvergenceWait,
  parseSpentWaitCensus,
  readSpentWaitCensus,
  recordCertificationGate,
  runCertificationStage,
};
