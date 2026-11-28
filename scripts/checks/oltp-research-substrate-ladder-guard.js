#!/usr/bin/env node
/**
 * Acceptance guard of the quest `scenario-a-research-substrate-ladder`.
 *
 *   node scripts/checks/oltp-research-substrate-ladder-guard.js [--metric]
 *
 * Prints the number of unmet properties on stdout (the quest's `doneWhen`
 * metric; exit code 0 only when it is 0) and one line per property on stderr.
 * It imports the harness modules in process (the witnesses live in
 * test/distributed/harness/__tests__/oltp-research-substrate-ladder-witnesses.js) and
 * reads the declared retained artifacts; it starts no cluster and no container.
 *
 * Twelve properties, one count each when unmet:
 *   1 a research campaign manifest can be built
 *   2 admission refuses a research record by one explicit reason
 *   3 the record writer refuses the published store path
 *   4 every attempt carries a per-statement timeline
 *   5 the dataset reset method is the one the adapter reports
 *   6 retained statement evidence is in the campaign evidence, digest-verified
 *   7 an unverified seed is never warmed up or measured
 *   8 three nodes on one host on a campaign bridge with synthetic host ids (declared
 *     host count 3), and host facts accept one machine
 *   9 a substrate descriptor and a round-trip matrix exist
 *  10 the substrate ladder: every descriptor carries the use of its rung
 *  11 the retained single-host run holds every property of the evaluator
 *  12 the retained three-host run holds every property of the evaluator
 *
 * The evaluator that reads the retained runs is itself witnessed by negative
 * controls: mutated records that must be rejected and ideal records that must
 * not be. A control that answers wrongly is one more unmet property.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  EVIDENCE_USE,
  IDENTITY,
  INTER_NODE_PATH,
  MATRIX_ENTRIES,
  NODE_COUNT,
  PING_STATS,
  PUBLISHED_STORE,
  PUBLISHED_STORE_DIR,
  RESEARCH,
  RESET_METHOD,
  RTT_FIELDS,
  RTT_PACKETS,
  SUBSTRATE_KIND,
  WITNESS,
  removeDir,
  scratchDir,
  sha256Of,
} from '../../test/distributed/harness/__tests__/oltp-research-substrate-ladder-witnesses.js';
import {
  arrayEvery,
  arrayFilter,
  arrayIncludes,
  arrayIsArray,
  arrayJoin,
  arrayMap,
  arraySome,
  jsonParse,
  numberIsFinite,
  stringIncludes,
  stringSplit,
} from '../../test/distributed/harness/real-product-captured-intrinsics.js';

const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UTF8 = 'utf8';
const LINE_SEPARATOR = '\n';
const METRIC_FLAG = '--metric';
const ARGV_OFFSET = 2;
const REASON_PREVIEW = 3;
const FIELD_JOIN = '; ';
const MATRIX_SIDES = Object.freeze(['atDeployment', 'before', 'after']);
const TABLE_OUTCOME_RESET = 'reset-and-routable';
const TABLE_OUTCOME_CREATED = 'created';
const HEADER_TYPE = 'campaign-header';
const RUN_TYPE = 'run';
const GATE_PASSED = 'passed';
const RUN_COMPLETED = 'completed';
const RUN_FAILED = 'failed';
const SEED_VERIFIED = 'verified';
const CLOSURE_COMPLETE = 'complete';
const RETAINED_FILE = 'retained-file';
const INLINE = 'inline';
const FRESH_FORMATION = 'fresh-formation';

const TEXT = Object.freeze({
  NO_CATALOG: 'the run has no statement catalog',
  NO_MATRICES: 'the run has no round-trip matrices',
  MATRIX_IN_WINDOW: 'a round-trip matrix was measured inside the measurement window',
  NO_DESCRIPTOR: 'the campaign header has no substrate descriptor',
  HOST_MAP: 'the node-to-host map or declared host count contradicts the kind',
  NOT_RESEARCH: 'the run is not of the research class',
  GATE: 'the gate did not pass',
  SEED: 'the seed is not verified',
  CLOSURE: 'the closure is incomplete',
  HEADER: 'exactly one non-comparable campaign header is required',
  NO_RUN: 'the file holds no run record',
  STORE_CONTROL: 'a research record in a scratch copy of the published store was not found',
  MET: 'met',
  PRODUCT: 'the run booted a source fingerprint other than the one its declared product commit expects',
  NO_FORMATION: 'the run states no measured time to ready and the deadline that applied',
  IDENTITY: 'the declared host identities do not match the rung: synthetic and marked for ' +
    'the first look, the observed machine name for every other rung',
  SHARED_ID: 'two nodes of the first look share one declared host id',
  NOT_COMPLETED: 'the run did not complete',
  CUSTODY_ABSENT: 'the custody file of the retained statements is absent',
  CUSTODY_DIFFERS: 'the custody file differs from the recorded size or digest',
  CUSTODY_SHAPE: 'the custody file holds no statements for the attempt',
  CONTROL_CUSTODY_REJECTED: 'control: a record whose statements are in custody was rejected',
  CONTROL_DIGEST_ACCEPTED: 'control: a custody file with a different digest was accepted',
  CONTROL_ABSENT_ACCEPTED: 'control: an absent custody file was accepted',
  OVERHEAD: 'the timeline capture overhead share is missing or above its bound:',
});
const OVERHEAD_BOUND = 0.001;
const IDEAL_OVERHEAD_SHARE = 0.0001;
const OVERHEAD_EXCESS = 10;
const COMMIT_LENGTH = 40;
const FINGERPRINT_LENGTH = 16;
const CONTROL_STORE_LABEL = 'control-store';
const CONTROL_CUSTODY_LABEL = 'control-custody';
const TABLE_WAREHOUSE = 'warehouse';
const TABLE_ITEM = 'item';
const SQL_BEGIN = 'BEGIN';
const SQL_COMMIT = 'COMMIT';
const STATUS_OK = 'ok';
const IDEAL_OP_ID = 'measurement:0:0';

const QUEST_EVIDENCE = 'solve/quests/scenario-a-research-substrate-ladder/evidence';
const RETAINED = Object.freeze({
  SINGLE_HOST: `${QUEST_EVIDENCE}/lab-single-host/raw-observations.ndjson`,
  THREE_HOST: `${QUEST_EVIDENCE}/lab-three-host/raw-observations.ndjson`,
});

// --- retained runs: the evaluator ---------------------------------------------

function parseNdjson(text) {
  return arrayMap(arrayFilter(stringSplit(text, LINE_SEPARATOR), (line) => line !== ''),
    (line) => jsonParse(line));
}

// The statements of an attempt: inline, or, where the request's evidence is in
// custody, the attempt's statements in the custody file, whose size and digest
// are verified against the record. A file that is absent or differs is a named
// reason, never a pass.
function statementsOfAttempt(request, attemptIndex, attempt, baseDir) {
  if (arrayIsArray(attempt.statements)) return {statements: attempt.statements};
  const evidence = request.responseEvidence;
  const file = evidence?.custody?.path ? path.join(baseDir, evidence.custody.path) : null;
  if (!file || !fs.existsSync(file)) {
    return {problem: `${request.opId}: ${TEXT.CUSTODY_ABSENT}`};
  }
  const payload = fs.readFileSync(file, UTF8);
  const size = Buffer.byteLength(payload);
  if (sha256Of(payload) !== evidence.sha256 || size !== evidence.custody.bytes) {
    return {problem: `${request.opId}: ${TEXT.CUSTODY_DIFFERS}`};
  }
  const statements = jsonParse(payload)[attemptIndex];
  return arrayIsArray(statements) ? {statements} : {problem: `${request.opId}: ${TEXT.CUSTODY_SHAPE}`};
}

function attemptTimelineIssue(request, attempt, statementCount, catalog) {
  const timeline = attempt.timeline;
  if (!arrayIsArray(timeline) || timeline.length !== statementCount) {
    return `${request.opId}: timeline lacks an entry`;
  }
  const inside = arrayEvery(timeline, ([index, started, ended]) =>
    index >= 0 && index < catalog.length && started >= attempt.startedMs &&
    ended >= started && ended <= attempt.endedMs);
  return inside ? null : `${request.opId}: a timeline entry is outside its attempt`;
}

function timelineIssues(run, baseDir) {
  const catalog = run.observations?.statementCatalog;
  if (!arrayIsArray(catalog)) return [TEXT.NO_CATALOG];
  const issues = [];
  for (const request of run.observations.requests ?? []) {
    (request.attempts ?? []).forEach((attempt, attemptIndex) => {
      const {statements, problem} = statementsOfAttempt(request, attemptIndex, attempt, baseDir);
      const issue = problem ?? attemptTimelineIssue(request, attempt, statements.length, catalog);
      if (issue) arrayPush(issues, issue);
    });
  }
  return issues;
}

// The timeline capture's own cost, measured per run, must stay within its bound.
function overheadIssues(run) {
  const share = run.observations?.timingCalibration?.overhead?.share;
  return typeof share === 'number' && share <= OVERHEAD_BOUND ? [] :
    [`${TEXT.OVERHEAD} ${JSON.stringify(share)}`];
}

// The measured time to ready and the deadline that applied.
function formationIssues(run) {
  const formation = run.formation;
  return typeof formation?.readyAfterMs === 'number' &&
    typeof formation.deadlineMs === 'number' ? [] : [TEXT.NO_FORMATION];
}

// A run that declares its product source booted exactly the fingerprint expected of it.
function productIssues(run) {
  const product = run.product;
  if (product === undefined) return [];
  return typeof product.sourceFingerprintExpected === 'string' &&
    product.sourceFingerprintBooted === product.sourceFingerprintExpected ? [] : [TEXT.PRODUCT];
}

function resetIssues(run) {
  const method = run.deployment?.dataset?.resetMethod;
  const tables = run.deployment?.dataset?.provisioning?.tables ?? [];
  const allReset = tables.length > 0 &&
    arrayEvery(tables, (table) => table.outcome === TABLE_OUTCOME_RESET);
  const anyReset = arraySome(tables, (table) => table.outcome === TABLE_OUTCOME_RESET);
  if (!arrayIncludes(Object.values(RESET_METHOD), method)) {
    return [`reset method ${JSON.stringify(method)} is not one the adapters report`];
  }
  if ((method === RESET_METHOD.TRUNCATED) !== allReset || (anyReset && !allReset)) {
    return [`reset method ${method} contradicts the per-table outcomes`];
  }
  return [];
}

function matrixIssue(side, matrix, wanted) {
  const entries = matrix.entries ?? [];
  const complete = entries.length >= wanted && arrayEvery(entries, (entry) =>
    entry.transmitted === RTT_PACKETS &&
    arrayEvery(RTT_FIELDS, (field) => numberIsFinite(entry[field])));
  return complete ? null : `the ${side} matrix is incomplete`;
}

function roundTripIssues(run) {
  const window = run.observations?.window;
  const roundTrip = run.observations?.network?.roundTrip;
  if (!roundTrip?.atDeployment || !roundTrip?.before || !roundTrip?.after) {
    return [TEXT.NO_MATRICES];
  }
  const wanted = MATRIX_ENTRIES;
  const issues = arrayFilter(arrayMap(MATRIX_SIDES,
    (side) => matrixIssue(side, roundTrip[side], wanted)), (issue) => issue !== null);
  if (!(roundTrip.atDeployment.endedAt <= roundTrip.before.startedAt &&
      roundTrip.before.endedAt <= window?.startedAt &&
      roundTrip.after.startedAt >= window?.endedAt)) {
    arrayPush(issues, TEXT.MATRIX_IN_WINDOW);
  }
  return issues;
}

// The declared host identities: the first look declares one distinct synthetic id per
// node, marked synthetic; every other rung declares each node's observed machine name.
function identityIssues(substrate, nodes, single) {
  const wanted = single ? IDENTITY.SYNTHETIC : IDENTITY.OBSERVED;
  const issues = [];
  const declared = new Set(arrayMap(nodes, (node) => node.declaredHostId));
  const sound = arrayEvery(nodes, (node) => node.declaredHostIdentity === wanted &&
    (node.declaredHostId === node.machineHostName) === !single);
  if (substrate.declaredHostIdentity !== wanted || !sound) arrayPush(issues, TEXT.IDENTITY);
  if (single && declared.size !== nodes.length) arrayPush(issues, TEXT.SHARED_ID);
  return issues;
}

function substrateIssues(header, expectedKind) {
  const substrate = header.substrate;
  if (!substrate) return [TEXT.NO_DESCRIPTOR];
  const issues = [];
  const single = expectedKind === SUBSTRATE_KIND.SINGLE_HOST;
  if (substrate.kind !== expectedKind) {
    arrayPush(issues, `substrate kind ${JSON.stringify(substrate.kind)}`);
  }
  const nodes = substrate.nodeHostMap ?? [];
  const hostIds = new Set(arrayMap(nodes, (node) => node.hostId));
  if (nodes.length !== NODE_COUNT || hostIds.size !== (single ? 1 : NODE_COUNT) ||
      substrate.declaredHostCount !== NODE_COUNT) {
    arrayPush(issues, TEXT.HOST_MAP);
  }
  arrayPush(issues, ...identityIssues(substrate, nodes, single));
  const wantedUse = single ? EVIDENCE_USE.FIRST_LOOK : EVIDENCE_USE.WORKING;
  if (substrate.evidenceUse !== wantedUse) {
    arrayPush(issues,
      `evidence use ${JSON.stringify(substrate.evidenceUse)}, ${wantedUse} expected`);
  }
  const wantedPath = single ? INTER_NODE_PATH.BRIDGE : INTER_NODE_PATH.LAN;
  if (substrate.interNodePath !== wantedPath) {
    arrayPush(issues, `inter-node path ${JSON.stringify(substrate.interNodePath)}, ` +
      `${wantedPath} expected`);
  }
  return issues;
}

function custodyIssues(run, baseDir) {
  const issues = [];
  for (const request of run.observations?.requests ?? []) {
    const evidence = request.responseEvidence;
    if (evidence?.encoding !== RETAINED_FILE) continue;
    const file = evidence.custody?.path ? path.join(baseDir, evidence.custody.path) : null;
    if (!file || !fs.existsSync(file) ||
        sha256Of(fs.readFileSync(file, UTF8)) !== evidence.sha256) {
      arrayPush(issues, `${request.opId}: retained statements are not in the campaign evidence`);
    }
  }
  return issues;
}

function runIssues(run, expectedKind, baseDir) {
  const issues = [];
  if (run.subkind !== RESEARCH.CLASS || run.plan?.profileClass !== RESEARCH.CLASS) {
    arrayPush(issues, TEXT.NOT_RESEARCH);
  }
  if (run.execution?.state !== RUN_COMPLETED || run.observations?.runStatus !== RUN_COMPLETED) {
    arrayPush(issues, TEXT.NOT_COMPLETED);
  }
  if (run.correctness?.semanticGate?.status !== GATE_PASSED) {
    arrayPush(issues, TEXT.GATE);
  }
  if (run.deployment?.dataset?.verification?.status !== SEED_VERIFIED) {
    arrayPush(issues, TEXT.SEED);
  }
  if (run.deployment?.closure?.status !== CLOSURE_COMPLETE) {
    arrayPush(issues, TEXT.CLOSURE);
  }
  arrayPush(issues, ...timelineIssues(run, baseDir), ...overheadIssues(run), ...resetIssues(run),
    ...formationIssues(run), ...productIssues(run),
    ...roundTripIssues(run), ...custodyIssues(run, baseDir));
  return issues;
}

/**
 * Every unmet property of a retained evidence file's records.
 * @param {Array<Object>} records the parsed header and run records
 * @param {{expectedKind: string, baseDir: string}} context
 * @return {Array<string>}
 */
function evaluateRetainedRecords(records, {expectedKind, baseDir}) {
  const headers = arrayFilter(records, (record) => record.recordType === HEADER_TYPE);
  const runs = arrayFilter(records, (record) => record.recordType === RUN_TYPE);
  const issues = [];
  if (headers.length !== 1 || headers[0].comparable !== false) {
    arrayPush(issues, TEXT.HEADER);
  } else {
    arrayPush(issues, ...substrateIssues(headers[0], expectedKind));
  }
  if (runs.length === 0) arrayPush(issues, TEXT.NO_RUN);
  for (const run of runs) arrayPush(issues, ...runIssues(run, expectedKind, baseDir));
  return issues;
}

function witnessRetained(artifact, expectedKind) {
  const file = path.join(REPO_ROOT, artifact);
  if (!fs.existsSync(file)) return `${artifact} is absent`;
  const issues = evaluateRetainedRecords(parseNdjson(fs.readFileSync(file, UTF8)),
    {expectedKind, baseDir: path.dirname(file)});
  return issues.length === 0 ? null :
    arrayJoin(arraySlice(issues, 0, REASON_PREVIEW), FIELD_JOIN);
}

const PROPERTY = Object.freeze([
  Object.freeze({id: 1, name: 'research manifest', witness: WITNESS.manifest}),
  Object.freeze({id: 2, name: 'admission refusal', witness: WITNESS.admission}),
  Object.freeze({id: 3, name: 'store-path refusal', witness: WITNESS.storeRefusal}),
  Object.freeze({id: 4, name: 'statement timeline', witness: WITNESS.timeline}),
  Object.freeze({id: 5, name: 'reported reset method', witness: WITNESS.resetMethod}),
  Object.freeze({id: 6, name: 'statement-evidence custody', witness: WITNESS.custody}),
  Object.freeze({id: 7, name: 'seed gate', witness: WITNESS.seedGate}),
  Object.freeze({id: 8, name: 'one-host placement and facts', witness: WITNESS.oneHost}),
  Object.freeze({id: 9, name: 'substrate descriptor and round trip',
    witness: WITNESS.substrate}),
  Object.freeze({id: 10, name: 'substrate ladder', witness: WITNESS.ladder}),
  Object.freeze({id: 11, name: 'retained single-host run',
    witness: async () => witnessRetained(RETAINED.SINGLE_HOST, SUBSTRATE_KIND.SINGLE_HOST)}),
  Object.freeze({id: 12, name: 'retained three-host run',
    witness: async () => witnessRetained(RETAINED.THREE_HOST, SUBSTRATE_KIND.MULTI_HOST)}),
]);

// --- negative controls --------------------------------------------------------

const ISO_AT_DEPLOYMENT = '2026-11-28T09:59:00.000Z';
const IDEAL_WAIT_SECONDS = 900;
const MS_PER_SECOND = 1000;
const IDEAL_READY_MS = 5000;
const ISO_BEFORE = '2026-11-28T10:00:00.000Z';
const ISO_WINDOW_START = '2026-11-28T10:00:10.000Z';
const ISO_WINDOW_END = '2026-11-28T10:01:10.000Z';
const ISO_AFTER = '2026-11-28T10:01:20.000Z';
const IDEAL_ATTEMPT = Object.freeze({startedMs: 100, endedMs: 160,
  statements: Object.freeze([Object.freeze({sql: SQL_BEGIN, status: STATUS_OK}),
    Object.freeze({sql: SQL_COMMIT, status: STATUS_OK})]),
  timeline: Object.freeze([Object.freeze([0, 101, 110, STATUS_OK]),
    Object.freeze([1, 120, 150, STATUS_OK])])});
const SYNTHETIC_ID_PREFIX = 'bench-control-synthetic-host-';
const SINGLE_HOSTS = Object.freeze(['lab-a', 'lab-a', 'lab-a']);
const MULTI_HOSTS = Object.freeze(['lab-a', 'lab-b', 'lab-c']);

function idealMatrix(at) {
  return {startedAt: at, endedAt: at, entries: Array.from({length: MATRIX_ENTRIES},
    (_value, index) => ({from: `10.0.0.${index}`, to: `10.0.0.${index + 1}`, ...PING_STATS,
      transmitted: RTT_PACKETS}))};
}

function idealRun(kind, resetMethod, tableOutcome) {
  return {recordType: RUN_TYPE, subkind: RESEARCH.CLASS,
    execution: {state: RUN_COMPLETED},
    formation: {declaredWaitSeconds: IDEAL_WAIT_SECONDS,
      deadlineMs: IDEAL_WAIT_SECONDS * MS_PER_SECOND, readyAfterMs: IDEAL_READY_MS},
    plan: {profileClass: RESEARCH.CLASS},
    correctness: {semanticGate: {status: GATE_PASSED}},
    deployment: {closure: {status: CLOSURE_COMPLETE}, dataset: {resetMethod,
      verification: {status: SEED_VERIFIED},
      provisioning: {tables: [{table: TABLE_WAREHOUSE, outcome: tableOutcome},
        {table: TABLE_ITEM, outcome: tableOutcome}]}}},
    observations: {runStatus: RUN_COMPLETED, statementCatalog: [SQL_BEGIN, SQL_COMMIT],
      requests: [{opId: IDEAL_OP_ID, attempts: [IDEAL_ATTEMPT],
        responseEvidence: {encoding: INLINE}}],
      window: {startedAt: ISO_WINDOW_START, endedAt: ISO_WINDOW_END},
      timingCalibration: {overhead: {share: IDEAL_OVERHEAD_SHARE}},
      network: {roundTrip: {atDeployment: idealMatrix(ISO_AT_DEPLOYMENT),
        before: idealMatrix(ISO_BEFORE),
        after: idealMatrix(ISO_AFTER)}}}};
}

function idealRecords(kind) {
  const single = kind === SUBSTRATE_KIND.SINGLE_HOST;
  const hosts = single ? SINGLE_HOSTS : MULTI_HOSTS;
  return [{recordType: HEADER_TYPE, comparable: false,
    substrate: {kind, evidenceUse: single ? EVIDENCE_USE.FIRST_LOOK : EVIDENCE_USE.WORKING,
      interNodePath: single ? INTER_NODE_PATH.BRIDGE : INTER_NODE_PATH.LAN,
      declaredHostIdentity: single ? IDENTITY.SYNTHETIC : IDENTITY.OBSERVED,
      declaredHostCount: NODE_COUNT,
      nodeHostMap: arrayMap(hosts, (hostId, nodeIndex) => ({nodeIndex, hostId,
        declaredHostId: single ? `${SYNTHETIC_ID_PREFIX}${nodeIndex + 1}` : hostId,
        machineHostName: hostId,
        declaredHostIdentity: single ? IDENTITY.SYNTHETIC : IDENTITY.OBSERVED}))}},
  idealRun(kind, RESET_METHOD.CREATED, TABLE_OUTCOME_CREATED)];
}

function mutated(records, change) {
  const copy = jsonParse(JSON.stringify(records));
  change(copy);
  return copy;
}

// A published-store reader of the guard's own: research records in it.
function researchRecordsIn(rootDir) {
  const store = path.join(rootDir, PUBLISHED_STORE);
  if (!fs.existsSync(store)) return 0;
  const lines = arrayFilter(stringSplit(fs.readFileSync(store, UTF8), LINE_SEPARATOR),
    (line) => stringIncludes(line, `"${RESEARCH.CLASS}"`));
  const records = arrayMap(lines, (line) => jsonParse(line));
  return arrayFilter(records, (record) => record.subkind === RESEARCH.CLASS ||
    record.plan?.profileClass === RESEARCH.CLASS).length;
}

function storeControl() {
  const root = scratchDir(CONTROL_STORE_LABEL);
  try {
    fs.mkdirSync(path.join(root, PUBLISHED_STORE_DIR), {recursive: true});
    fs.copyFileSync(path.join(REPO_ROOT, PUBLISHED_STORE), path.join(root, PUBLISHED_STORE));
    const research = idealRun(SUBSTRATE_KIND.MULTI_HOST, RESET_METHOD.CREATED,
      TABLE_OUTCOME_CREATED);
    fs.appendFileSync(path.join(root, PUBLISHED_STORE),
      `${JSON.stringify(research)}${LINE_SEPARATOR}`);
    return researchRecordsIn(root) === 1 ? null :
      TEXT.STORE_CONTROL;
  } finally {
    removeDir(root);
  }
}

const MUTANT = Object.freeze({
  'a timeline missing an entry': (records) => {
    records[1].observations.requests[0].attempts[0].timeline.pop();
  },
  'a reset method contradicting its table outcomes': (records) => {
    records[1].deployment.dataset.resetMethod = FRESH_FORMATION;
  },
  'a truncate method over created tables': (records) => {
    records[1].deployment.dataset.resetMethod = RESET_METHOD.TRUNCATED;
  },
  'a single-host record claiming a lan path': (records) => {
    records[0].substrate.interNodePath = INTER_NODE_PATH.LAN;
  },
  'a single-host record claiming a loopback path': (records) => {
    records[0].substrate.interNodePath = INTER_NODE_PATH.LOOPBACK;
  },
  'a single-host round trip with one entry': (records) => {
    records[1].observations.network.roundTrip.before.entries.length = 1;
  },
  'a round trip measured inside the window': (records) => {
    records[1].observations.network.roundTrip.after.startedAt = ISO_WINDOW_START;
  },
  'a single-host record declaring the real machine name': (records) => {
    for (const node of records[0].substrate.nodeHostMap) {
      node.declaredHostId = node.machineHostName;
      node.declaredHostIdentity = IDENTITY.OBSERVED;
    }
    records[0].substrate.declaredHostIdentity = IDENTITY.OBSERVED;
  },
  'a single-host record with synthetic ids not marked synthetic': (records) => {
    for (const node of records[0].substrate.nodeHostMap) {
      node.declaredHostIdentity = IDENTITY.OBSERVED;
    }
    records[0].substrate.declaredHostIdentity = IDENTITY.OBSERVED;
  },
  'two nodes of a single-host record sharing one declared id': (records) => {
    records[0].substrate.nodeHostMap[2].declaredHostId =
      records[0].substrate.nodeHostMap[1].declaredHostId;
  },
  'a run without its round trip at deployment': (records) => {
    delete records[1].observations.network.roundTrip.atDeployment;
  },
  'a run without its measured formation time': (records) => {
    delete records[1].formation;
  },
  'a run whose booted source fingerprint is not the expected one': (records) => {
    records[1].product = {declaredCommit: 'c'.repeat(COMMIT_LENGTH),
      sourceFingerprintExpected: 'a'.repeat(FINGERPRINT_LENGTH),
      sourceFingerprintBooted: 'b'.repeat(FINGERPRINT_LENGTH)};
  },
  'a run that did not complete': (records) => {
    records[1].execution.state = RUN_FAILED;
  },
  'a run whose timeline overhead share is above its bound': (records) => {
    records[1].observations.timingCalibration.overhead.share = OVERHEAD_BOUND * OVERHEAD_EXCESS;
  },
  'a single-host record without its first-look marking': (records) => {
    records[0].substrate.evidenceUse = EVIDENCE_USE.WORKING;
  },
});

const MULTI_MUTANT = Object.freeze({
  'a multi-host record with a synthetic id': (records) => {
    records[0].substrate.nodeHostMap[0].declaredHostId = `${SYNTHETIC_ID_PREFIX}1`;
    records[0].substrate.nodeHostMap[0].declaredHostIdentity = IDENTITY.SYNTHETIC;
  },
  'a multi-host record with two nodes on one host': (records) => {
    records[0].substrate.nodeHostMap[2].hostId = MULTI_HOSTS[1];
  },
  'a multi-host round trip with six entries': (records) => {
    records[1].observations.network.roundTrip.after.entries.length = MATRIX_ENTRIES - 1;
  },
  'a multi-host record marked as a first look': (records) => {
    records[0].substrate.evidenceUse = EVIDENCE_USE.FIRST_LOOK;
  },
});

const CUSTODY_RUN_ID = 'bench-control-r001';
const CUSTODY_TAMPER = ' ';
const CUSTODY_STATEMENTS = Object.freeze([Object.freeze([
  Object.freeze({sql: SQL_BEGIN, status: STATUS_OK}),
  Object.freeze({sql: SQL_COMMIT, status: STATUS_OK})])]);

// A record whose request keeps its statements in custody, in a scratch directory.
function custodyRecords(directory) {
  const payload = JSON.stringify(CUSTODY_STATEMENTS);
  const sha256 = sha256Of(payload);
  const relative = path.join(CUSTODY_RUN_ID, `${sha256}.json`);
  fs.mkdirSync(path.join(directory, CUSTODY_RUN_ID), {recursive: true});
  fs.writeFileSync(path.join(directory, relative), payload);
  const records = idealRecords(SUBSTRATE_KIND.SINGLE_HOST);
  const request = records[1].observations.requests[0];
  request.attempts = [{...request.attempts[0], statements: null}];
  request.responseEvidence = {encoding: RETAINED_FILE, sha256, bytes: payload.length,
    custody: {path: relative, sha256, bytes: payload.length}};
  return {records, file: path.join(directory, relative)};
}

function custodyProblems() {
  const directory = scratchDir(CONTROL_CUSTODY_LABEL);
  const context = {expectedKind: SUBSTRATE_KIND.SINGLE_HOST, baseDir: directory};
  try {
    const {records, file} = custodyRecords(directory);
    const problems = evaluateRetainedRecords(records, context).length === 0 ? [] :
      [TEXT.CONTROL_CUSTODY_REJECTED];
    fs.appendFileSync(file, CUSTODY_TAMPER);
    if (evaluateRetainedRecords(records, context).length === 0) {
      arrayPush(problems, TEXT.CONTROL_DIGEST_ACCEPTED);
    }
    fs.rmSync(file);
    if (evaluateRetainedRecords(records, context).length === 0) {
      arrayPush(problems, TEXT.CONTROL_ABSENT_ACCEPTED);
    }
    return problems;
  } finally {
    removeDir(directory);
  }
}

function controlProblems() {
  const problems = [];
  for (const kind of [SUBSTRATE_KIND.SINGLE_HOST, SUBSTRATE_KIND.MULTI_HOST]) {
    const context = {expectedKind: kind, baseDir: os.tmpdir()};
    if (evaluateRetainedRecords(idealRecords(kind), context).length !== 0) {
      arrayPush(problems, `control: the ideal ${kind} record was rejected`);
    }
  }
  const single = idealRecords(SUBSTRATE_KIND.SINGLE_HOST);
  const context = {expectedKind: SUBSTRATE_KIND.SINGLE_HOST, baseDir: os.tmpdir()};
  for (const [name, change] of Object.entries(MUTANT)) {
    if (evaluateRetainedRecords(mutated(single, change), context).length === 0) {
      arrayPush(problems, `control: ${name} was accepted`);
    }
  }
  const multi = idealRecords(SUBSTRATE_KIND.MULTI_HOST);
  const multiContext = {expectedKind: SUBSTRATE_KIND.MULTI_HOST, baseDir: os.tmpdir()};
  for (const [name, change] of Object.entries(MULTI_MUTANT)) {
    if (evaluateRetainedRecords(mutated(multi, change), multiContext).length === 0) {
      arrayPush(problems, `control: ${name} was accepted`);
    }
  }
  arrayPush(problems, ...custodyProblems());
  const storeProblem = storeControl();
  if (storeProblem) arrayPush(problems, `control: ${storeProblem}`);
  return problems;
}

// --- main ---------------------------------------------------------------------

// A witness that throws is unmet with the failure text, never skipped.
async function measure(property) {
  try {
    return {...property, reason: await property.witness()};
  } catch (error) {
    return {...property, reason: `witness failed: ${error?.message ?? error}`};
  }
}

async function main(argv) {
  const results = [];
  for (const property of PROPERTY) arrayPush(results, await measure(property));
  const unmet = arrayFilter(results, (result) => result.reason !== null);
  const controls = controlProblems();
  for (const result of results) {
    const state = result.reason === null ? TEXT.MET : `UNMET: ${result.reason}`;
    process.stderr.write(`property ${result.id} ${result.name}: ${state}${LINE_SEPARATOR}`);
  }
  for (const problem of controls) process.stderr.write(`${problem}${LINE_SEPARATOR}`);
  const metric = unmet.length + controls.length;
  if (!arrayIncludes(argv, METRIC_FLAG)) {
    process.stderr.write(`oltp-research-substrate-ladder-guard: ${metric} unmet${LINE_SEPARATOR}`);
  }
  process.stdout.write(`${metric}${LINE_SEPARATOR}`);
  return metric === 0 ? 0 : 1;
}

const isDirectCli = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  process.exitCode = await main(arraySlice(process.argv, ARGV_OFFSET));
}

export {
  PROPERTY,
  evaluateRetainedRecords,
};
