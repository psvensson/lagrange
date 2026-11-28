// In-process witnesses of the quest scenario-a-research-substrate-ladder, read by
// scripts/checks/oltp-research-substrate-ladder-guard.js. Each witness answers null
// when its property holds and the failure text when it does not; it imports
// the harness owners and the controlled in-memory product, and starts no
// cluster, container or network exchange. The only child process is a local
// shell inside a scratch directory that stands in for the load-generator host
// of the evidence-custody witness.
//
// The names a witness reaches for (COMPARATIVE_RESEARCH_PROFILE,
// createCampaignRecordWriter, planLagrangeNodePlacement, measureRoundTripMatrix,
// buildSubstrateDescriptor, ...) are the seams the implementation answers to;
// the witnesses pin behaviour, and a rename moves the witness with it.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ADMISSION_REASON,
  admitClaim,
} from '../benchmark-claim-admission.js';
import {
  createBenchmarkConnectionRegistry,
  createBenchmarkOutcomeAdapter,
  createTrackedPgClientFactory,
} from '../benchmark-oltp-attempt-capture.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
} from '../comparative-benchmark-fixtures.js';
import * as manifestOwner from '../comparative-benchmark-campaign-manifest.js';
import * as runnerOwner from '../comparative-benchmark-campaign-runner.js';
import * as hostPreparation from '../comparative-benchmark-host-preparation.js';
import * as callSite from '../comparative-benchmark-workload-call-site.js';
import * as deployerLagrange from '../real-product-deployer-lagrange.js';
import * as networkImpairment from '../real-product-network-impairment.js';
import {
  arrayEvery,
  arrayFilter,
  arrayIncludes,
  arrayIsArray,
  arrayJoin,
  arrayMap,
  jsonParse,
  numberIsFinite,
  stringIncludes,
  stringSplit,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {executeBenchmarkWorkload} from '../real-product-workload-drivers.js';
import {createFakeOltpProduct} from './real-product-workload-driver-fake-product.js';

const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);

const UTF8 = 'utf8';
const LINE_SEPARATOR = '\n';
const FIELD_JOIN = '; ';
const SHA256 = 'sha256';
const HEX = 'hex';
const REASON_PREVIEW = 3;
const FIRST = 0;

const SYSTEM = Object.freeze({LAGRANGE: 'lagrange', POSTGRESQL: 'postgresql',
  TIDB: 'tidb-tikv'});
const TARGET = Object.freeze({LAGRANGE: 'lagrange', PG_APP: 'pg-app'});
const SCENARIO_A = 'scenarioA';
const SUBKIND_SMOKE = 'smoke';
const CLAIM_KIND_THROUGHPUT = 'throughput';

// The class, profile, reason and codes the implementation answers to.
const RESEARCH = Object.freeze({
  CLASS: 'research',
  PROFILE_ID: 'scenario-a-research-v1',
  ADMISSION_REASON: 'research-profile-not-admissible',
  STORE_REFUSAL: 'refused_research_store_is_published_store',
  EVIDENCE_MISSING: 'statement_evidence_missing',
  EVIDENCE_MISMATCH: 'statement_evidence_digest_mismatch',
});
// The substrate ladder (owner, 2026-11-28): a single lab host is a first look,
// separate lab hosts are the working evidence, same-zone cloud VMs the final
// verification.
const SUBSTRATE_KIND = Object.freeze({
  SINGLE_HOST: 'lab-single-host',
  MULTI_HOST: 'lab-multi-host',
  GCP: 'gcp-same-zone',
});
const EVIDENCE_USE = Object.freeze({FIRST_LOOK: 'first-look',
  WORKING: 'working-evidence', FINAL: 'final-verification'});
const INTER_NODE_PATH = Object.freeze({LAN: 'lan', BRIDGE: 'docker-bridge',
  LOOPBACK: 'loopback', VPC: 'vpc-same-zone'});
const RESET_METHOD = Object.freeze({
  CREATED: 'created-and-loaded',
  TRUNCATED: 'truncated-and-reloaded',
  DROPPED: 'dropped-created-and-loaded',
  NOT_PERFORMED: 'not-performed',
});
const PUBLISHED_STORE_DIR = 'data/tidb-comparison';
const PUBLISHED_STORE = `${PUBLISHED_STORE_DIR}/raw-observations.ndjson`;
const RTT_PACKETS = 20;
const RTT_FIELDS = Object.freeze(['transmitted', 'received', 'lossPercent', 'minMs', 'avgMs',
  'maxMs', 'mdevMs']);
const NODE_COUNT = 3;
const MATRIX_ENTRIES = 7;
const REST_PORT = 8080;
const ADMIN_PORT = 8081;
const TRANSPORT_PORT = 8082;
const PLACEMENT_CAMPAIGN = 'bench-research-placement';
// The first look declares one synthetic host identity per node (owner, 2026-11-28): a
// truthfully declared one-host cluster never becomes ready.
const SINGLE_HOST_DECLARED_COUNT = 3;
const NODE_INDEXES = Object.freeze([0, 1, 2]);
const DATA_HOSTS = Object.freeze(['10.0.0.1', '10.0.0.2', '10.0.0.3']);
const IDENTITY = Object.freeze({SYNTHETIC: 'synthetic', OBSERVED: 'observed'});
const BRIDGE_NETWORK = 'bridge';

const TEXT = Object.freeze({
  NO_PROFILE: 'the manifest owner exports no COMPARATIVE_RESEARCH_PROFILE: a research ' +
    'campaign manifest cannot be built',
  NO_WRITER: 'the campaign runner exports no record writer: the only writer is the runner ' +
    'CLI\'s private appendRecords, which accepts any path, the published store included',
  NO_TIMELINE: 'an attempt record carries no timeline: traceStatement records statement ' +
    'text and status only, no monotonic start and end',
  NO_CATALOG_DISTINCT: 'the statement catalog is not distinct per SQL text across attempts',
  WRITER_SKIPPED: 'a research writer outside the published store did not append its record',
  NO_PLACEMENT: 'the Lagrange deployer exports no placement plan: one host per node, ' +
    'constant ports 8080-8082, the seed chosen by host equality and ' +
    'declaredHostCount = hosts.length; no bridge network for one host',
  NO_SUBSTRATE: 'measureRtt is private to its owner and answers the average only; no ' +
    'measureRoundTripMatrix and no buildSubstrateDescriptor exist, so a run record has ' +
    'no substrate descriptor and no round-trip matrix',
  UNREFUSED_PLAN: 'a plan with three nodes on one host and no substrate was not refused',
  UNREFUSED_FACTS: 'host facts accepted one machine without a substrate',
  FACTS_INCOMPLETE: 'host facts of one machine are incomplete',
  LADDER: 'a descriptor does not carry the evidence use of its rung (first look, working ' +
    'evidence, final verification), or accepts two nodes of a multi-host record on one host',
  DESCRIPTOR: 'the descriptor builder does not state kind and path, or accepts a lan or loopback ' +
    'path for one host',
  NO_RETAINED_FILE: 'the guard workload retained no statement file',
  RUN_NOT_RESEARCH: 'a run of the manifest is not of subkind research',
  COMPARABLE: 'the manifest is comparable',
  LIVE_SYSTEM_TABLE: 'the scratch store is not exercised',
});

// --- in-process product -------------------------------------------------------

const FIXTURE_WATCHDOG_MS = 3000;
const FIXTURE_RATE_PER_SEC = 2000;
const FIXTURE_ENDPOINT = Object.freeze({host: '10.0.0.7', port: 5432});
const FIXTURE_CREDENTIALS = Object.freeze({user: 'bench', password: 'bench',
  database: 'bench'});
const TIDB_DATABASE = 'bench_guard';
const FIXTURE_PLAN = Object.freeze({offeredRatePerSec: FIXTURE_RATE_PER_SEC, repetition: 1,
  orderIndex: 0, sweepPlanSha256: null});
const UNOPENED_FAILURE = Object.freeze({failureClass: 'product_error', sqlState: null,
  code: 'readiness_exhausted', message: 'guard'});

function show(value) {
  return JSON.stringify(value);
}

function fixtureTimer(callback) {
  const handle = setTimeout(callback, FIXTURE_WATCHDOG_MS);
  return () => clearTimeout(handle);
}

function connectionOf(system) {
  return system === SYSTEM.TIDB ?
    {endpoint: FIXTURE_ENDPOINT, databaseName: TIDB_DATABASE} :
    {endpoint: FIXTURE_ENDPOINT, credentials: FIXTURE_CREDENTIALS};
}

// One real driver entry run (dispatch, adapters, open-loop and retry owners,
// reconciliation) against the controlled in-memory product.
function runDriver({product, system, targetId, evidenceDir, setupFailure = null,
  createPgClient = product.createPgClient}) {
  return executeBenchmarkWorkload({
    targetId, system, scenario: SCENARIO_A, subkind: SUBKIND_SMOKE,
    ...(setupFailure ? {setupFailure} : {connection: connectionOf(system)}),
    plan: FIXTURE_PLAN,
    drivers: {createPgClient, createMysqlConnection: product.createMysqlConnection},
    runtime: {setWatchdogTimer: fixtureTimer},
    evidenceDir,
  });
}

function scratchDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `oltp-research-${label}-`));
}

function removeDir(dir) {
  fs.rmSync(dir, {recursive: true, force: true});
}

function sha256Of(text) {
  return createHash(SHA256).update(text).digest(HEX);
}

// --- witnesses 1-3: class, admission, store -----------------------------------

const MANIFEST_CAMPAIGN = 'bench-research-guard';

async function witnessManifest() {
  const profile = manifestOwner.COMPARATIVE_RESEARCH_PROFILE;
  if (!profile) return TEXT.NO_PROFILE;
  const manifest = manifestOwner.buildComparativeCampaignManifest({
    campaignId: MANIFEST_CAMPAIGN, profile, targets: [TARGET.LAGRANGE]});
  const problems = [];
  if (manifest.comparable !== false) arrayPush(problems, TEXT.COMPARABLE);
  if (manifest.plan.profileClass !== RESEARCH.CLASS) {
    arrayPush(problems, `plan.profileClass ${show(manifest.plan.profileClass)}`);
  }
  if (manifest.plan.workloadProfileId !== RESEARCH.PROFILE_ID) {
    arrayPush(problems, `plan.workloadProfileId ${show(manifest.plan.workloadProfileId)}`);
  }
  if (manifest.runs.length === 0 ||
      !arrayEvery(manifest.runs, (run) => run.subkind === RESEARCH.CLASS)) {
    arrayPush(problems, TEXT.RUN_NOT_RESEARCH);
  }
  return problems.length === 0 ? null : arrayJoin(problems, FIELD_JOIN);
}

const ADMISSION_CAMPAIGN = 'bench-research-admission';
const ADMISSION_MIN_HOSTS = 3;

async function witnessAdmission() {
  const run = buildFixtureRun({campaignId: ADMISSION_CAMPAIGN, targetId: TARGET.LAGRANGE,
    subkind: RESEARCH.CLASS, profileClass: RESEARCH.CLASS,
    workloadProfileId: RESEARCH.PROFILE_ID});
  const claim = Object.freeze({claimKey: `${TARGET.LAGRANGE}/${SCENARIO_A}/${RESEARCH.CLASS}`,
    targetId: TARGET.LAGRANGE, scenario: SCENARIO_A, subkind: RESEARCH.CLASS,
    claimKind: CLAIM_KIND_THROUGHPUT, minDistinctHosts: ADMISSION_MIN_HOSTS,
    forensicReceiptIds: Object.freeze([]), declared: null});
  const header = buildFixtureHeader({campaignId: ADMISSION_CAMPAIGN,
    targetIds: [TARGET.LAGRANGE]});
  const cell = admitClaim({claim, runs: [{file: ADMISSION_CAMPAIGN, run}],
    campaignHeaders: new Map([[ADMISSION_CAMPAIGN, header]]), retainedReferences: [],
    invalidations: []});
  const reasons = cell.reasons ?? [];
  if (ADMISSION_REASON.RESEARCH_PROFILE_NOT_ADMISSIBLE !== RESEARCH.ADMISSION_REASON) {
    return 'ADMISSION_REASON.RESEARCH_PROFILE_NOT_ADMISSIBLE is ' +
      `${show(ADMISSION_REASON.RESEARCH_PROFILE_NOT_ADMISSIBLE)}, admission answered ` +
      `${cell.status} with reasons ${show(arraySlice(reasons, FIRST, REASON_PREVIEW))}`;
  }
  return arrayIncludes(reasons, RESEARCH.ADMISSION_REASON) && cell.metrics === null ?
    null : `admission answered ${cell.status} without ${RESEARCH.ADMISSION_REASON}, ` +
      'or with metrics';
}

const STORE_SESSION_FILE = 'test-output/research-sessions/guard/raw-observations.ndjson';
const STORE_REFUSED_FILES = Object.freeze([
  PUBLISHED_STORE,
  `${PUBLISHED_STORE_DIR}/forensic/x.ndjson`,
  `${PUBLISHED_STORE_DIR}/../tidb-comparison/raw-observations.ndjson`,
]);
const GUARD_RECORD = Object.freeze({recordType: 'guard'});

function refusalCodeOf(create, root, file) {
  try {
    create({rootDir: root, file, profileClass: RESEARCH.CLASS});
  } catch (error) {
    return error?.code ?? null;
  }
  return null;
}

async function witnessStoreRefusal() {
  const create = runnerOwner.createCampaignRecordWriter;
  if (typeof create !== 'function') return TEXT.NO_WRITER;
  const root = scratchDir('store');
  try {
    for (const file of STORE_REFUSED_FILES) {
      const code = refusalCodeOf(create, root, file);
      if (code !== RESEARCH.STORE_REFUSAL) {
        return `a research writer for ${file} answered ${show(code)}, not ` +
          RESEARCH.STORE_REFUSAL;
      }
    }
    const writer = create({rootDir: root, file: STORE_SESSION_FILE,
      profileClass: RESEARCH.CLASS});
    await writer.appendRecords([GUARD_RECORD]);
    const written = fs.readFileSync(path.join(root, STORE_SESSION_FILE), UTF8);
    return written === `${JSON.stringify(GUARD_RECORD)}${LINE_SEPARATOR}` ?
      null : TEXT.WRITER_SKIPPED;
  } finally {
    removeDir(root);
  }
}

// --- witness 4: statement timeline --------------------------------------------

const TRACED_STATEMENTS = Object.freeze(['BEGIN', 'SELECT 1', 'UPDATE t SET a = 1', 'COMMIT']);
const TRACED_ENDPOINT = Object.freeze({host: 'guard', port: 1});
const SQL_WORD_SEPARATOR = ' ';

function immediateClient() {
  return {
    async connect() {},
    async query(sql) {
      return {rows: [], rowCount: 0, command: stringSplit(stringTrim(sql),
        SQL_WORD_SEPARATOR)[FIRST]};
    },
    async end() {},
  };
}

async function tracedAttempt(registry) {
  const createClient = createTrackedPgClientFactory(immediateClient, registry);
  const adapter = {
    async executeTransaction() {
      const client = createClient(TRACED_ENDPOINT);
      await client.connect();
      for (const sql of TRACED_STATEMENTS) await client.query(sql);
      await client.end();
      return {};
    },
  };
  return (await createBenchmarkOutcomeAdapter(adapter, registry).executeTransaction({}))
    .attemptEvidence;
}

function timelineProblem(evidence, catalog) {
  const timeline = evidence.timeline;
  if (!arrayIsArray(timeline) || timeline.length !== evidence.statements.length) {
    return 'the attempt evidence has no timeline entry per statement';
  }
  let previousEnd = 0;
  for (let index = 0; index < timeline.length; index += 1) {
    const [catalogIndex, startedMs, endedMs, status] = timeline[index];
    const statement = evidence.statements[index];
    const clean = catalog?.[catalogIndex] === statement.sql &&
      numberIsFinite(startedMs) && numberIsFinite(endedMs) &&
      startedMs >= previousEnd && endedMs >= startedMs && status === statement.status;
    if (!clean) return `timeline entry ${index} is ${show(timeline[index])}`;
    previousEnd = endedMs;
  }
  return null;
}

async function witnessTimeline() {
  const registry = createBenchmarkConnectionRegistry();
  const first = await tracedAttempt(registry);
  if (!arrayIsArray(first.timeline)) return TEXT.NO_TIMELINE;
  const problem = timelineProblem(first, registry.statementCatalog);
  if (problem) return problem;
  await tracedAttempt(registry);
  return registry.statementCatalog.length === TRACED_STATEMENTS.length ?
    null : TEXT.NO_CATALOG_DISTINCT;
}

// --- witness 5: reported reset method -----------------------------------------

const EXPECTED_RESET_METHODS = Object.freeze({created: RESET_METHOD.CREATED,
  truncated: RESET_METHOD.TRUNCATED, dropped: RESET_METHOD.DROPPED,
  unopened: RESET_METHOD.NOT_PERFORMED});

function resetMethodOf(output) {
  return output.deployment.dataset.resetMethod;
}

async function witnessResetMethod() {
  const evidenceDir = scratchDir('reset');
  try {
    const lagrange = createFakeOltpProduct();
    const lagrangeRun = () => runDriver({product: lagrange, system: SYSTEM.LAGRANGE,
      targetId: TARGET.LAGRANGE, evidenceDir});
    const created = resetMethodOf(await lagrangeRun());
    const truncated = resetMethodOf(await lagrangeRun());
    const dropped = resetMethodOf(await runDriver({product: createFakeOltpProduct(),
      system: SYSTEM.POSTGRESQL, targetId: TARGET.PG_APP, evidenceDir}));
    const unopened = resetMethodOf(await runDriver({product: createFakeOltpProduct(),
      system: SYSTEM.LAGRANGE, targetId: TARGET.LAGRANGE, evidenceDir,
      setupFailure: UNOPENED_FAILURE}));
    const observed = {created, truncated, dropped, unopened};
    return show(observed) === show(EXPECTED_RESET_METHODS) ? null :
      `recorded reset methods ${show(observed)}, the adapters did ` +
      show(EXPECTED_RESET_METHODS);
  } finally {
    removeDir(evidenceDir);
  }
}

// --- witness 6: statement-evidence custody ------------------------------------

const HARNESS_COMMIT = 'c'.repeat(40);
const LOAD_GENERATOR_CLI = 'run-benchmark-workload.js';
const GIT_HEAD_COMMAND = 'git rev-parse HEAD';
const EXIT_MARKER = '__exit_code=';
const CLI_EXIT_OK = 0;
const QUOTED_ARGUMENT = /--(manifest|out) '([^']+)'/gu;
const SHELL = 'bash';
const SHELL_COMMAND_FLAG = '-c';
const CUSTODY_CAMPAIGN = 'bench-research-custody';
const CUSTODY_RUN = Object.freeze({runId: `${CUSTODY_CAMPAIGN}-r001`,
  targetId: TARGET.LAGRANGE});
const LOAD_GENERATOR_IP = '10.0.0.9';
const GUARD_HOST = 'guard';
const EVIDENCE_SUBDIR = 'test-output/evidence';

// A load-generator host in a scratch directory: the CLI is answered by the real
// driver entry, every other command runs in a local shell inside the directory.
function fakeLoadGeneratorHost({repoDir, product, afterRun}) {
  const runCli = async (command) => {
    const argument = {};
    for (const match of command.matchAll(QUOTED_ARGUMENT)) argument[match[1]] = match[2];
    const request = jsonParse(fs.readFileSync(path.resolve(repoDir, argument.manifest), UTF8));
    const output = await executeBenchmarkWorkload({...request,
      drivers: {createPgClient: product.createPgClient,
        createMysqlConnection: product.createMysqlConnection},
      runtime: {setWatchdogTimer: fixtureTimer}});
    const record = {...output, loadGenerator: {hostname: GUARD_HOST,
      nodeVersion: process.version, checkout: null, nativeClients: {}}};
    fs.appendFileSync(path.resolve(repoDir, argument.out),
      `${JSON.stringify(record)}${LINE_SEPARATOR}`);
    if (afterRun) afterRun(request);
    return `${LINE_SEPARATOR}${EXIT_MARKER}${CLI_EXIT_OK}`;
  };
  return async (_host, _opts, command) => {
    if (stringIncludes(command, GIT_HEAD_COMMAND)) return `${HARNESS_COMMIT}${LINE_SEPARATOR}`;
    if (stringIncludes(command, LOAD_GENERATOR_CLI)) return runCli(command);
    const result = spawnSync(SHELL, [SHELL_COMMAND_FLAG, command], {cwd: repoDir,
      encoding: UTF8});
    return `${result.stdout}${result.status === CLI_EXIT_OK ? '' : result.stderr}`;
  };
}

function retainedRequests(record) {
  return arrayFilter(record.observations.requests,
    (request) => request.responseEvidence?.encoding === 'retained-file');
}

function custodyProblem(record, campaignEvidenceDir) {
  const requests = retainedRequests(record);
  if (requests.length === 0) return TEXT.NO_RETAINED_FILE;
  const missing = arrayFilter(requests, (request) => {
    const custody = request.responseEvidence.custody;
    if (!custody || typeof custody.path !== 'string') return true;
    const file = path.join(campaignEvidenceDir, custody.path);
    return !fs.existsSync(file) ||
      sha256Of(fs.readFileSync(file, UTF8)) !== request.responseEvidence.sha256;
  });
  return missing.length === 0 ? null : `${missing.length} of ${requests.length} requests ` +
    'above the inline bound have no digest-verified copy in the campaign evidence ' +
    '(their attempts carry statements: null)';
}

function custodyRun({repoDir, evidenceDir, campaignEvidenceDir, afterRun}) {
  const sshRun = fakeLoadGeneratorHost({repoDir, product: createFakeOltpProduct(), afterRun});
  const runWorkload = callSite.createRemoteWorkloadRunner({sshRun, opts: {},
    host: {ip: LOAD_GENERATOR_IP, repoPath: repoDir, nodePath: 'node'},
    harnessCommit: HARNESS_COMMIT, campaignId: CUSTODY_CAMPAIGN, campaignEvidenceDir});
  const request = {targetId: TARGET.LAGRANGE, system: SYSTEM.LAGRANGE, scenario: SCENARIO_A,
    subkind: SUBKIND_SMOKE, connection: connectionOf(SYSTEM.LAGRANGE), plan: FIXTURE_PLAN,
    evidenceDir};
  return runWorkload(request, CUSTODY_RUN);
}

function failureCodeOf(promise) {
  return promise.then(() => null, (error) => error?.code ?? 'untyped');
}

function alterEvidenceFiles(evidenceDir) {
  return () => {
    for (const name of fs.readdirSync(evidenceDir)) {
      fs.appendFileSync(path.join(evidenceDir, name), SQL_WORD_SEPARATOR);
    }
  };
}

async function witnessCustody() {
  const repoDir = scratchDir('custody-repo');
  const evidenceDir = path.join(repoDir, EVIDENCE_SUBDIR);
  const campaignEvidenceDir = scratchDir('custody-evidence');
  const missingDir = scratchDir('custody-missing');
  const alteredDir = scratchDir('custody-altered');
  try {
    const record = await custodyRun({repoDir, evidenceDir, campaignEvidenceDir});
    const problem = custodyProblem(record, campaignEvidenceDir);
    if (problem) return problem;
    const removed = await failureCodeOf(custodyRun({repoDir, evidenceDir,
      campaignEvidenceDir: missingDir, afterRun: () => removeDir(evidenceDir)}));
    const altered = await failureCodeOf(custodyRun({repoDir, evidenceDir,
      campaignEvidenceDir: alteredDir, afterRun: alterEvidenceFiles(evidenceDir)}));
    return removed === RESEARCH.EVIDENCE_MISSING && altered === RESEARCH.EVIDENCE_MISMATCH ?
      null : `a missing file answered ${show(removed)}, a changed file ${show(altered)}`;
  } finally {
    for (const dir of [repoDir, campaignEvidenceDir, missingDir, alteredDir]) removeDir(dir);
  }
}

// --- witness 7: seed gate ------------------------------------------------------

const ITEM_SNAPSHOT = /^\s*SELECT [a-z_, ]+ FROM item ORDER BY/u;
const VERIFIED = 'verified';

// The product answers the item snapshot one row short: the loaded seed no
// longer equals the generator's dataset.
function corruptedSeedClient(product) {
  return () => {
    const client = product.createPgClient();
    const query = client.query.bind(client);
    client.query = async (sql, parameters) => {
      const result = await query(sql, parameters);
      return ITEM_SNAPSHOT.test(sql) && result.rows.length > 0 ?
        {...result, rows: arraySlice(result.rows, 1), rowCount: result.rows.length - 1} :
        result;
    };
    return client;
  };
}

async function witnessSeedGate() {
  const evidenceDir = scratchDir('seed');
  try {
    const product = createFakeOltpProduct();
    const output = await runDriver({product, system: SYSTEM.LAGRANGE,
      targetId: TARGET.LAGRANGE, evidenceDir, createPgClient: corruptedSeedClient(product)});
    const {accounting} = output.observations;
    const verification = output.deployment.dataset.verification.status;
    const untouched = accounting.issued === 0 && accounting.unissued === accounting.offered &&
      output.observations.warmup === null;
    return verification !== VERIFIED && untouched ? null :
      `an unverified seed (${verification}) was warmed up or measured: ` +
      `${accounting.issued} of ${accounting.offered} requests issued, run status ` +
      output.observations.runStatus;
  } finally {
    removeDir(evidenceDir);
  }
}

// --- witness 8: one-host placement and host facts ----------------------------

const LAB_HOST_IP = '10.0.0.5';
const LAB_HOST_NAME = 'lab-a';
const LAB_BOOT_ID = 'boot-1';

function placementProblem(plan) {
  if (!plan || plan.declaredHostCount !== SINGLE_HOST_DECLARED_COUNT ||
      plan.nodes?.length !== NODE_COUNT) {
    return `a one-host plan declares ${show(plan?.declaredHostCount)} hosts and ` +
      `${plan?.nodes?.length} nodes`;
  }
  const networkName = plan.network?.name;
  if (plan.network?.kind !== BRIDGE_NETWORK || typeof networkName !== 'string' ||
      !stringIncludes(networkName, PLACEMENT_CAMPAIGN)) {
    return `the one-host plan names network ${show(plan.network)}, not a bridge of the campaign`;
  }
  const expectedIds = arrayMap(NODE_INDEXES, (index) =>
    `${PLACEMENT_CAMPAIGN}-synthetic-host-${index + 1}`);
  if (plan.declaredHostIdentity !== IDENTITY.SYNTHETIC ||
      show(arrayMap(plan.nodes, (node) => node.declaredHostId)) !== show(expectedIds)) {
    return `the one-host plan declares ${show(arrayMap(plan.nodes,
      (node) => node.declaredHostId))} as ${show(plan.declaredHostIdentity)} identities, ` +
      `${show(expectedIds)} synthetic expected`;
  }
  const standard = arrayEvery(plan.nodes, (node) => node.ports.rest === REST_PORT &&
    node.ports.admin === ADMIN_PORT && node.ports.transport === TRANSPORT_PORT);
  const seeds = arrayFilter(plan.nodes, (node) => node.isSeed === true);
  return standard && seeds.length === 1 && plan.nodes[FIRST].isSeed === true ? null :
    'node ports or seed choice are not the standard ports with exactly one seed';
}

// Every plan but the first look keeps the observed machine name of each node.
function observedIdentityProblem(plan) {
  return plan.declaredHostIdentity === IDENTITY.OBSERVED &&
    arrayEvery(plan.nodes, (node) => node.declaredHostId === null) ? null :
    'a multi-host plan declares synthetic host identities';
}

async function refusedBy(action) {
  try {
    await action();
  } catch {
    return true;
  }
  return false;
}

async function hostFactsProblem() {
  const hosts = [{ip: LAB_HOST_IP, name: LAB_HOST_NAME}, {ip: LAB_HOST_IP, name: LAB_HOST_NAME}];
  const sshRun = async () => `${LAB_HOST_NAME}|${LAB_BOOT_ID}|12|15.0|eth0`;
  const collect = (substrate) => hostPreparation.collectHostFacts({hosts, sshRun, opts: {},
    ...(substrate ? {substrate} : {})});
  if (!await refusedBy(() => collect(null))) return TEXT.UNREFUSED_FACTS;
  const facts = await collect(SUBSTRATE_KIND.SINGLE_HOST);
  return facts.length === hosts.length ? null : TEXT.FACTS_INCOMPLETE;
}

async function witnessOneHost() {
  const plan = deployerLagrange.planLagrangeNodePlacement;
  if (typeof plan !== 'function') return TEXT.NO_PLACEMENT;
  const hosts = Array.from({length: NODE_COUNT}, () => LAB_HOST_IP);
  const problem = placementProblem(plan({hosts, substrate: SUBSTRATE_KIND.SINGLE_HOST,
    campaignId: PLACEMENT_CAMPAIGN}));
  if (problem) return problem;
  if (!await refusedBy(() => plan({hosts, campaignId: PLACEMENT_CAMPAIGN}))) {
    return TEXT.UNREFUSED_PLAN;
  }
  const observed = observedIdentityProblem(plan({hosts: DATA_HOSTS,
    substrate: SUBSTRATE_KIND.MULTI_HOST, campaignId: PLACEMENT_CAMPAIGN}));
  if (observed) return observed;
  return hostFactsProblem();
}

// --- witness 9: substrate descriptor and round-trip matrix ------------------

const PING_OUTPUT = [
  'PING 10.0.0.2 (10.0.0.2) 56(84) bytes of data.', '',
  '--- 10.0.0.2 ping statistics ---',
  '20 packets transmitted, 19 received, 5% packet loss, time 19030ms',
  'rtt min/avg/max/mdev = 0.210/0.350/0.980/0.120 ms', ''].join(LINE_SEPARATOR);
const PING_STATS = Object.freeze({transmitted: 20, received: 19, lossPercent: 5, minMs: 0.21,
  avgMs: 0.35, maxMs: 0.98, mdevMs: 0.12});
const ENDPOINT_HOST = '10.0.0.1';
const STORAGE_ROOT = '/srv/campaign';

async function measureProblem() {
  const commands = [];
  const sshRun = async (_host, _opts, command) => {
    arrayPush(commands, command);
    return PING_OUTPUT;
  };
  const result = await networkImpairment.measureRtt({from: DATA_HOSTS[0], to: DATA_HOSTS[1],
    sshRun, opts: {}});
  const same = arrayEvery(RTT_FIELDS, (field) => result[field] === PING_STATS[field]);
  const asked = arrayIncludes(stringSplit(commands[FIRST], SQL_WORD_SEPARATOR),
    String(RTT_PACKETS));
  return same && asked ? null : `measureRtt answered ${show(result)} for ${show(commands)}`;
}

async function matrixProblem() {
  const matrix = await networkImpairment.measureRoundTripMatrix({
    dataHosts: DATA_HOSTS, loadGenerator: LOAD_GENERATOR_IP, endpointHost: ENDPOINT_HOST,
    sshRun: async () => PING_OUTPUT, opts: {}});
  const entries = matrix?.entries ?? [];
  const pairs = new Set(arrayMap(entries, (entry) => `${entry.from}>${entry.to}`));
  const complete = arrayEvery(entries, (entry) =>
    arrayEvery(RTT_FIELDS, (field) => numberIsFinite(entry[field])));
  return entries.length === MATRIX_ENTRIES && pairs.size === entries.length &&
    complete ? null :
    `the round-trip matrix has ${entries.length} entries, ${pairs.size} distinct`;
}

const OWN_HOST = (nodeIndex) => nodeIndex;
const TWO_ON_ONE_HOST = (nodeIndex) => Math.min(nodeIndex, 1);

function singleHostInput() {
  return {kind: SUBSTRATE_KIND.SINGLE_HOST, interNodePath: INTER_NODE_PATH.BRIDGE,
    hosts: [{hostId: LAB_HOST_NAME, ip: LAB_HOST_IP, bootId: LAB_BOOT_ID, cpus: 12,
      memGb: 15, primaryIface: 'eth0', linkType: 'wired'}],
    loadGeneratorHostId: LAB_HOST_NAME,
    nodeHostMap: arrayMap(NODE_INDEXES, (nodeIndex) => ({nodeIndex, hostId: LAB_HOST_NAME,
      declaredHostId: `camp-synthetic-host-${nodeIndex + 1}`, machineHostName: LAB_HOST_NAME,
      declaredHostIdentity: IDENTITY.SYNTHETIC})),
    declaredHostCount: SINGLE_HOST_DECLARED_COUNT,
    storage: {root: STORAGE_ROOT, kind: 'bind'}};
}

// The configurations the first look must refuse: the machine's real name on every
// node (never ready), synthetic ids not marked synthetic, a shared declared id, and a
// synthetic id on a multi-host or GCP rung.
async function identityRefusals(build, input) {
  const withNodes = (change) => ({...input,
    nodeHostMap: arrayMap(input.nodeHostMap,
      (node, index) => ({...node, ...change(node, index)}))});
  const real = withNodes((node) => ({declaredHostId: node.machineHostName,
    declaredHostIdentity: IDENTITY.OBSERVED}));
  const unmarked = withNodes(() => ({declaredHostIdentity: IDENTITY.OBSERVED}));
  const shared = withNodes(() => ({declaredHostId: 'camp-synthetic-host-1'}));
  const syntheticMulti = {...multiInput(SUBSTRATE_KIND.MULTI_HOST, INTER_NODE_PATH.LAN, OWN_HOST)};
  syntheticMulti.nodeHostMap = arrayMap(syntheticMulti.nodeHostMap, (node) => ({...node,
    declaredHostId: `${node.hostId}-synthetic`, declaredHostIdentity: IDENTITY.SYNTHETIC}));
  const results = [];
  for (const config of [real, unmarked, shared, syntheticMulti]) {
    results.push(await refusedBy(() => build(config)));
  }
  return arrayEvery(results, Boolean);
}

async function descriptorProblem() {
  const build = hostPreparation.buildSubstrateDescriptor;
  const input = singleHostInput();
  const single = build(input);
  const multi = build(multiInput(SUBSTRATE_KIND.MULTI_HOST, INTER_NODE_PATH.LAN, OWN_HOST));
  const identityRefused = await identityRefusals(build, input);
  const lanRefused = await refusedBy(() => build({...input,
    interNodePath: INTER_NODE_PATH.LAN})) && await refusedBy(() => build({...input,
    interNodePath: INTER_NODE_PATH.LOOPBACK}));
  return hostPreparation.COMPARATIVE_SUBSTRATE_KIND?.SINGLE_HOST === SUBSTRATE_KIND.SINGLE_HOST &&
    single.kind === SUBSTRATE_KIND.SINGLE_HOST &&
    single.interNodePath === INTER_NODE_PATH.BRIDGE && lanRefused &&
    multi.kind === SUBSTRATE_KIND.MULTI_HOST && identityRefused ? null : TEXT.DESCRIPTOR;
}

function multiInput(kind, interNodePath, hostOfNode) {
  const hosts = arrayMap(DATA_HOSTS, (ip, index) => ({hostId: `lab-${index}`, ip,
    bootId: `boot-${index}`, cpus: 12, memGb: 15, primaryIface: 'eth0', linkType: 'wifi'}));
  return {kind, interNodePath, hosts, loadGeneratorHostId: 'lab-load',
    nodeHostMap: arrayMap(NODE_INDEXES, (nodeIndex) => ({nodeIndex,
      hostId: `lab-${hostOfNode(nodeIndex)}`, declaredHostId: `lab-${hostOfNode(nodeIndex)}`,
      machineHostName: `lab-${hostOfNode(nodeIndex)}`, declaredHostIdentity: IDENTITY.OBSERVED})),
    declaredHostCount: NODE_COUNT, storage: {root: STORAGE_ROOT, kind: 'bind'}};
}

async function witnessLadder() {
  const build = hostPreparation.buildSubstrateDescriptor;
  if (typeof build !== 'function') return TEXT.NO_SUBSTRATE;
  const lab = build(multiInput(SUBSTRATE_KIND.MULTI_HOST, INTER_NODE_PATH.LAN, OWN_HOST));
  const gcp = build(multiInput(SUBSTRATE_KIND.GCP, INTER_NODE_PATH.VPC, OWN_HOST));
  const single = build(singleHostInput());
  const twoOnOne = await refusedBy(() => build(multiInput(SUBSTRATE_KIND.MULTI_HOST,
    INTER_NODE_PATH.LAN, TWO_ON_ONE_HOST)));
  const unknown = await refusedBy(() => build(multiInput('lab-whatever',
    INTER_NODE_PATH.LAN, OWN_HOST)));
  return single.evidenceUse === EVIDENCE_USE.FIRST_LOOK &&
    single.declaredHostIdentity === IDENTITY.SYNTHETIC &&
    lab.declaredHostIdentity === IDENTITY.OBSERVED && lab.evidenceUse === EVIDENCE_USE.WORKING &&
    gcp.evidenceUse === EVIDENCE_USE.FINAL && twoOnOne && unknown ? null : TEXT.LADDER;
}

async function witnessSubstrate() {
  if (typeof networkImpairment.measureRtt !== 'function' ||
      typeof networkImpairment.measureRoundTripMatrix !== 'function' ||
      typeof hostPreparation.buildSubstrateDescriptor !== 'function') {
    return TEXT.NO_SUBSTRATE;
  }
  return (await measureProblem()) ?? (await matrixProblem()) ?? descriptorProblem();
}

const WITNESS = Object.freeze({
  manifest: witnessManifest,
  admission: witnessAdmission,
  storeRefusal: witnessStoreRefusal,
  timeline: witnessTimeline,
  resetMethod: witnessResetMethod,
  custody: witnessCustody,
  seedGate: witnessSeedGate,
  oneHost: witnessOneHost,
  substrate: witnessSubstrate,
  ladder: witnessLadder,
});

export {
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
};
