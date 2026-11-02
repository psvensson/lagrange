// Builders for synthetic v2 campaigns used by the admission tests and the
// adversarial cases of the comparative benchmark guards. Fixtures are never
// written to the published data directory; they exist to prove that the chain
// rejects what it must reject and keeps a valid negative result visible.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {ADVERTISED_TARGETS} from './comparative-coverage-manifest.js';
import {
  OLTP_DATASET_VERIFICATION_STATUS,
  committedOltpTableDeltas,
  reconcileOltpTableRows,
} from './benchmark-oltp-state-reconciliation.js';
import {
  BENCHMARK_UNRESOLVED_REASON,
  OPERATION_OUTCOME,
  benchmarkOperationId,
  computeExecutedOperationsDigest,
  validateBenchmarkAccounting,
} from './benchmark-operation-outcome.js';
import {
  BENCHMARK_RUN_STATUS,
  describeBenchmarkWorkloadIdentity,
} from './benchmark-scenario-a-run.js';
import {
  isBenchmarkDispatchRefusal,
  resolveBenchmarkWorkloadProfile,
} from './benchmark-workload-dispatch.js';
import {
  OLTP_OPERATION_KIND,
  buildOltpBaselinePlan,
  resolveOltpBaselineConfig,
} from './oltp-baseline-workload.js';
import {OLTP_OPEN_LOOP_PROFILE, interleaveOltpWorkerPhase} from './oltp-open-loop-step-owner.js';
import {OLTP_PAIRED_RETRY_POLICY} from './oltp-paired-retry-owner.js';
import {OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS} from './oltp-scenario-a-semantic-gate.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from './oltp-scenario-a-semantic-profile.js';
import {
  BENCHMARK_SCENARIO,
  CLOSURE_STATUS,
  EXECUTION_TARGET,
  RAW_OBSERVATION_SCHEMA,
  RAW_RECORD_TYPE,
  READINESS_STATE,
  STORAGE_KIND,
  buildClaimKey,
  computeRunObservationsDigest,
} from './raw-observation-record.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const FIXTURE_TIME = '2026-11-01T12:00:00.000Z';
const FIXTURE_LATER = '2026-11-01T12:05:00.000Z';
const hexDigits = (ch) => ch.repeat(64);

function fixtureHosts(count) {
  return Array.from({length: count}, (_u, i) => ({
    hostId: `lab-host-${i + 1}`, ip: `10.0.0.${i + 1}`, hostname: `lab-host-${i + 1}.lan`,
    bootId: `boot-${i + 1}`, cpus: 8, memGb: 32,
  }));
}

function fixtureHarness() {
  return {gitCommit: 'a'.repeat(40), checkoutDirty: false, driverSourceSha256: hexDigits('b'),
    adapterIds: ['pg-wire-v1']};
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

// The product family a fixture target runs: two targets of one family may share
// an image, two families never do.
function fixtureProductFamily(targetId) {
  if (stringStartsWith(targetId, 'lagrange')) return 'lagrange';
  if (stringStartsWith(targetId, 'pg-')) return 'postgresql';
  return targetId;
}

// The fixture identity of a target's product image, distinct per target.
function fixtureProductIdentity(targetId) {
  const repoDigest = `example/${targetId}@sha256:${sha256Hex(`repo:${targetId}`)}`;
  return {
    imageRef: `example/${targetId}:fixture`,
    imageId: `sha256:${sha256Hex(`image:${targetId}`)}`,
    repoDigest,
    contentIdentity: `sha256:${sha256Hex(`content:${targetId}`)}`,
    imageStore: 'containerd',
    provenance: `registry:${repoDigest}`,
    reportedVersion: `0.0.0-fixture-${targetId}`,
  };
}

function fixtureProductRole(targetId) {
  return `${targetId}-node`;
}

/**
 * The campaign header of a fixture campaign: the harness identity and, per
 * target, the product identity pinned before any run.
 * @param {{campaignId: string, targetIds: Array<string>, harness?: Object,
 *   executionTarget?: string}} options
 * @return {Object}
 */
function buildFixtureHeader({campaignId, targetIds, harness = fixtureHarness(),
  executionTarget = EXECUTION_TARGET.LAB}) {
  if (!Array.isArray(targetIds) || targetIds.length === 0) {
    throw new Error('a fixture campaign header names the targets it pins');
  }
  return {
    recordType: RAW_RECORD_TYPE.CAMPAIGN_HEADER, schemaVersion: RAW_OBSERVATION_SCHEMA.V2,
    campaignId, startedAt: FIXTURE_TIME, manifestDigest: `sha256:${hexDigits('c')}`,
    harness, executionTarget, physicalHosts: fixtureHosts(4),
    products: arrayMap(targetIds, (targetId) => {
      const {imageId, repoDigest, contentIdentity, imageStore, provenance, reportedVersion} =
        fixtureProductIdentity(targetId);
      return {targetId, product: fixtureProductFamily(targetId),
        role: fixtureProductRole(targetId), contentIdentity, reportedVersion,
        images: [{host: '10.0.0.1', imageId, repoDigest, imageStore, provenance}]};
    }),
  };
}

const FIXTURE_ENDPOINT = '10.0.0.1:5432';

// The canonical workload a fixture run executes: two workers, no warm-up, the
// smallest dataset the workload owner accepts.
function fixtureWorkload(requestCount) {
  if (!Number.isSafeInteger(requestCount) || requestCount < 2 || requestCount % 2 !== 0) {
    throw new Error('a fixture run executes an even number of requests (two workers)');
  }
  return {seed: 1, workers: 2, warmupOperationsPerWorker: 0,
    measurementOperationsPerWorker: requestCount / 2, warehouseCount: 1,
    districtsPerWarehouse: 1, customersPerDistrict: 1, itemCount: 15};
}

// The measured operations of the workload, in the order the open-loop owner issues
// them, as committed requests.
// The effect a committed fixture operation reports, in the executor's shape.
function fixtureEffectSummary(operation) {
  if (operation.kind === OLTP_OPERATION_KIND.DELIVERY) return {deliveredOrders: 1};
  if (operation.kind === OLTP_OPERATION_KIND.NEW_ORDER) return {lineCount: operation.lines.length};
  return {};
}

function buildRequests(workload, latencyMs) {
  const operations = interleaveOltpWorkerPhase(buildOltpBaselinePlan(workload).workers,
    'measurement');
  return arrayMap(operations, (operation, i) => {
    const kind = operation.kind;
    const intended = i * 10;
    return {
      index: i, opId: benchmarkOperationId(operation), operationKind: kind,
      intendedStartMs: intended, issuedAtMs: intended, executionStartedAtMs: intended,
      completedAtMs: intended + latencyMs, issueLagMs: 0, queueDelayMs: 0, latencyMs,
      outcome: OPERATION_OUTCOME.COMMITTED, failureClass: null, retries: 0, retryDelayMs: 0,
      effectSummary: fixtureEffectSummary(operation),
      endpoint: FIXTURE_ENDPOINT, serverConnectionId: 1,
      attempts: [{attemptNo: 1, startedMs: intended, endedMs: intended + latencyMs,
        outcome: OPERATION_OUTCOME.COMMITTED, failureClass: null, sqlstate: null,
        errorCode: null, message: null, endpoint: FIXTURE_ENDPOINT, serverConnectionId: 1,
        commitSent: true, statements: null, responseDigest: `sha256:${hexDigits('d')}`}],
      responseEvidence: {encoding: 'inline', sha256: hexDigits('d'), bytes: 1},
    };
  });
}

/**
 * Give a fixture request a failure outcome consistent with the outcome owner:
 * a terminal failure with a class, or an unresolved request whose commit answer
 * was lost.
 * @param {Object} request
 * @param {string} outcome
 * @param {string} failureClass
 */
function setFixtureRequestOutcome(request, outcome, failureClass) {
  request.outcome = outcome;
  request.failureClass = failureClass;
  request.attempts[0].outcome = outcome;
  request.attempts[0].failureClass = failureClass;
  if (outcome === OPERATION_OUTCOME.UNRESOLVED) {
    request.unresolvedReason = BENCHMARK_UNRESOLVED_REASON.COMMIT_ANSWER_LOST;
  }
}

// The fixture state moves by exactly what the committed requests explain, and
// the verdict is the reconciliation owner's.
function finalStateFor(requests, scale) {
  const before = {orders: 1000, history: 500, new_order: 300, order_line: 3000};
  const expected = committedOltpTableDeltas(requests);
  const after = Object.fromEntries(arrayMap(Object.keys(before),
    (table) => [table, before[table] + expected[table]]));
  return {
    status: reconcileOltpTableRows(requests, before, after, scale).status,
    before: {tableRows: before},
    after: {tableRows: after},
  };
}

/**
 * Recompute every derived observation of a fixture run after its observations
 * changed: accounting, executed-operations digest, final state and the raw digest.
 * The plan is preregistered and never follows the observations.
 * @param {Object} run
 * @param {{keepFinalState?: boolean}} options
 * @return {Object} The same run, sealed.
 */
function sealFixtureRun(run, options = {}) {
  const requests = run.observations.requests;
  // A plain copy: tests edit the recorded accounting to prove the recount catches it.
  run.observations.accounting = JSON.parse(JSON.stringify(validateBenchmarkAccounting(requests)));
  run.observations.executedOperationsDigest = computeExecutedOperationsDigest(requests);
  if (!options.keepFinalState && run.correctness.finalState) {
    run.correctness.finalState = finalStateFor(requests,
      resolveOltpBaselineConfig(run.plan.workload).scale);
  }
  run.rawObservationsDigest = computeRunObservationsDigest(run);
  return run;
}

// Real records name a role's host, the endpoint and the load generator by
// address (the deployers and the runner work by ip); hostId is the lab
// inventory name.
function buildProducts(hosts, targetId) {
  return arrayMap(hosts, (h, i) => ({
    role: fixtureProductRole(targetId), host: h.ip, containerId: `ctr-${i + 1}`,
    ...fixtureProductIdentity(targetId), entrypoint: 'serve', cmd: '', startedAt: FIXTURE_TIME,
  }));
}

/**
 * A valid Scenario A run on the lab for one claim.
 * @param {Object} options
 * @return {Object} A sealed v2 run record.
 */
function fixtureProfile(subkind, options) {
  try {
    return resolveBenchmarkWorkloadProfile({scenario: BENCHMARK_SCENARIO.A, subkind});
  } catch (err) {
    if (!isBenchmarkDispatchRefusal(err) || !options.workloadProfileId) throw err;
    return {id: options.workloadProfileId, profileClass: options.profileClass, workload: null};
  }
}

function buildFixtureRun(options = {}) {
  const {campaignId = 'fixture-campaign', targetId = 'lagrange', subkind = 'main',
    latencyMs = 4, offeredRatePerSec = 100, repetition = 1} = options;
  // The named profile of the subkind (dispatch owner); a profile that owns its
  // workload fixes the request count. A family without a profile (a claim no run
  // can satisfy) names the profile its record claims explicitly.
  const profile = fixtureProfile(subkind, options);
  const workload = profile.workload || fixtureWorkload(options.requestCount ?? 120);
  const identity = describeBenchmarkWorkloadIdentity(workload);
  const profileClass = options.profileClass ?? profile.profileClass;
  // The distinct product machines the target's claims require (coverage manifest).
  const hostCount = options.hostCount ?? arrayFind(ADVERTISED_TARGETS,
    (t) => t.targetId === targetId).minDistinctHosts;
  const hosts = fixtureHosts(hostCount + 1);
  const productHosts = hosts.slice(0, hostCount);
  const products = buildProducts(productHosts, targetId);
  const requests = buildRequests(workload, latencyMs);
  const requestCount = requests.length;
  const endpoint = {host: productHosts[0].ip, port: 5432, containerId: 'ctr-1',
    protocol: 'pg-wire'};
  const run = {
    recordType: RAW_RECORD_TYPE.RUN, schemaVersion: RAW_OBSERVATION_SCHEMA.V2, campaignId,
    runId: `${campaignId}-${targetId}-${subkind}-${offeredRatePerSec}-${repetition}`,
    claimKey: buildClaimKey({targetId, scenario: BENCHMARK_SCENARIO.A, subkind,
      offeredRatePerSec, repetition}),
    targetId, scenario: BENCHMARK_SCENARIO.A, subkind, executionTarget: EXECUTION_TARGET.LAB,
    identity: {harness: fixtureHarness(), products,
      productsAfterWindow: arrayMap(products, (p) => ({...p})), publication: null},
    plan: {
      manifestDigest: `sha256:${hexDigits('c')}`, datasetDigest: identity.datasetDigest,
      workloadPlanDigest: identity.workloadPlanDigest,
      measurementPlanDigest: identity.measurementPlanDigest,
      workloadProfileId: profile.id, workload,
      semanticProfileId: OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
      semanticProfileDigest: hashScenarioASemanticProfile(),
      retryPolicyId: OLTP_PAIRED_RETRY_POLICY.id, openLoopProfileId: OLTP_OPEN_LOOP_PROFILE.id,
      sweepPlanDigest: `sha256:${hexDigits('4')}`, offeredRatePerSec, profileClass,
      operationSliceDigest: identity.operationSliceDigest,
      plannedOperationCounts: {...identity.plannedOperationCounts}, repetition,
      orderIndex: repetition - 1, warmup: {operations: 0, digest: null},
    },
    deployment: {
      hosts, roles: arrayMap(products, (p) => ({role: p.role, host: p.host,
        containerId: p.containerId})),
      storage: arrayMap(products, (p) => ({containerId: p.containerId, mount: '/data',
        kind: STORAGE_KIND.HOST_VOLUME})),
      readiness: {state: READINESS_STATE.READY, observedAt: FIXTURE_TIME, evidence: {}},
      dataset: {resetMethod: 'fresh-formation', verification: {
        status: OLTP_DATASET_VERIFICATION_STATUS.VERIFIED,
        method: 'oltp-state-snapshot-integer-normalized-v1',
        expectedLogicalChecksum: `sha256:${hexDigits('5')}`,
        observedLogicalChecksum: `sha256:${hexDigits('5')}`,
        expectedTableRows: {warehouse: 1, orders: 0}, observedTableRows: {warehouse: 1, orders: 0},
      }},
      placement: null, endpoint,
      loadGenerator: {host: hosts[hostCount].ip, nodeVersion: 'v22.0.0',
        driverVersions: {pg: '8.0.0'}},
      events: [], closure: {status: CLOSURE_STATUS.COMPLETE, unclosed: []},
    },
    observations: {
      runStatus: BENCHMARK_RUN_STATUS.COMPLETED, setup: null, warmup: null,
      requests, accounting: null, executedOperationsDigest: '',
      window: {scheduledMs: requestCount * 10, drainMs: requestCount * 10 + latencyMs,
        drainOverrunMs: latencyMs, startedAt: FIXTURE_TIME, endedAt: FIXTURE_LATER},
      resources: null, network: null,
    },
    correctness: {
      semanticGate: {status: OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED,
        passed: ['visibility'], failed: [], missing: [],
        binding: {campaignId, containerId: endpoint.containerId,
          imageId: products[0].imageId, endpoint: `${endpoint.host}:${endpoint.port}`}},
      finalState: {},
    },
    rawObservationsDigest: '',
  };
  return sealFixtureRun(run);
}

/**
 * Compose a v2 run record from a workload-driver output (executeBenchmarkWorkload)
 * and a fixture run that stands in for the deployer and campaign fields the
 * runner adds (products, roles, hosts, loadGenerator, events, closure, gate).
 * @param {Object} base A fixture run for the same claim.
 * @param {Object} output The driver output.
 * @return {Object} A sealed v2 run record.
 */
function composeFixtureRunFromDriverOutput(base, output) {
  const run = {
    ...base,
    identity: {...base.identity, harness: {...base.identity.harness, ...output.identity.harness}},
    plan: {...base.plan, ...output.plan},
    deployment: {...base.deployment,
      endpoint: {...base.deployment.endpoint, ...output.deployment.endpoint},
      dataset: output.deployment.dataset},
    observations: output.observations,
    // The driver never produces the gate; the proof journey does. The fixture's
    // gate stands in for the proof journey's record.
    correctness: {...output.correctness, semanticGate: base.correctness.semanticGate},
  };
  run.rawObservationsDigest = computeRunObservationsDigest(run);
  return run;
}

function toNdjson(records) {
  return arrayMap(records, (r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}

/**
 * Lay out a fixture repository root: raw observations, invalidations and history.
 * @param {string} rootDir
 * @param {{rawRecords: Array<Object>, invalidations?: Array<Object>,
 *   history?: string, forensicFiles?: Object<string, string>}} files
 */
function writeFixtureRoot(rootDir, files) {
  const dataDir = path.join(rootDir, 'data/tidb-comparison');
  fs.mkdirSync(path.join(dataDir, 'forensic'), {recursive: true});
  fs.writeFileSync(path.join(dataDir, 'raw-observations.ndjson'), toNdjson(files.rawRecords));
  fs.writeFileSync(path.join(dataDir, 'invalidations.ndjson'),
    toNdjson(files.invalidations || []));
  fs.writeFileSync(path.join(dataDir, 'history.ndjson'), files.history || '');
  for (const [name, text] of Object.entries(files.forensicFiles || {})) {
    fs.writeFileSync(path.join(dataDir, 'forensic', name), text);
  }
}


/**
 * Publish a fixture campaign through the real chain into a scratch root: raw store
 * -> admission -> matrix -> renderers. The caller removes the root.
 * @param {{rawRecords: Array<Object>, invalidations?: Array<Object>}} files
 * @return {Promise<{root: string, matrix: Object, readme: string}>}
 */
async function publishFixtureCampaign(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comparative-fixture-'));
  writeFixtureRoot(root, files);
  const {regenerateAllBenchmarkArtifactsFromAdmitted} = await import(
    './raw-observation-campaign-specs.js'
  );
  const {matrix} = await regenerateAllBenchmarkArtifactsFromAdmitted(root);
  const readme = fs.readFileSync(path.join(root, 'docs/benchmarks/README.md'), 'utf8');
  return {root, matrix, readme};
}

function fixtureTargetCell(matrix, targetId, column = 'scenarioA') {
  return arrayFind(matrix.targets, (t) => t.targetId === targetId).claims[column];
}

export {
  buildFixtureHeader,
  buildFixtureRun,
  composeFixtureRunFromDriverOutput,
  fixtureProductIdentity,
  fixtureTargetCell,
  publishFixtureCampaign,
  sealFixtureRun,
  setFixtureRequestOutcome,
  toNdjson,
  writeFixtureRoot,
};
