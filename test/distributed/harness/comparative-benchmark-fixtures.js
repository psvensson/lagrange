// Builders for synthetic v2 campaigns used by the admission tests and the
// adversarial cases of the comparative benchmark guards. Fixtures are never
// written to the published data directory; they exist to prove that the chain
// rejects what it must reject and keeps a valid negative result visible.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {OLTP_DATASET_VERIFICATION_STATUS} from './benchmark-oltp-state-reconciliation.js';
import {
  BENCHMARK_UNRESOLVED_REASON,
  OPERATION_OUTCOME,
  computeExecutedOperationsDigest,
  validateBenchmarkAccounting,
} from './benchmark-operation-outcome.js';
import {BENCHMARK_RUN_STATUS} from './benchmark-scenario-a-run.js';
import {BENCHMARK_PROFILE_CLASS} from './benchmark-workload-dispatch.js';
import {OLTP_OPERATION_KIND} from './oltp-baseline-workload.js';
import {OLTP_OPEN_LOOP_PROFILE} from './oltp-open-loop-step-owner.js';
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
const arrayFilter = Function.call.bind(Array.prototype.filter);

const FIXTURE_TIME = '2026-11-01T12:00:00.000Z';
const FIXTURE_LATER = '2026-11-01T12:05:00.000Z';
const hexDigits = (ch) => ch.repeat(64);
const KIND_CYCLE = Object.freeze([
  OLTP_OPERATION_KIND.NEW_ORDER, OLTP_OPERATION_KIND.PAYMENT, OLTP_OPERATION_KIND.ORDER_STATUS,
  OLTP_OPERATION_KIND.DELIVERY, OLTP_OPERATION_KIND.STOCK_LEVEL,
]);

function fixtureHosts(count) {
  return Array.from({length: count}, (_u, i) => ({
    hostId: `lab-host-${i + 1}`, ip: `10.0.0.${i + 1}`, hostname: `lab-host-${i + 1}.lan`,
    bootId: `boot-${i + 1}`, cpus: 8, memGb: 32,
  }));
}

function fixtureHarness() {
  return {gitCommit: 'a'.repeat(40), driverSourceSha256: hexDigits('b'), adapterIds: ['pg-wire-v1']};
}

function buildFixtureHeader({campaignId, executionTarget = EXECUTION_TARGET.LAB}) {
  return {
    recordType: RAW_RECORD_TYPE.CAMPAIGN_HEADER, schemaVersion: RAW_OBSERVATION_SCHEMA.V2,
    campaignId, startedAt: FIXTURE_TIME, manifestDigest: `sha256:${hexDigits('c')}`,
    harness: fixtureHarness(), executionTarget, physicalHosts: fixtureHosts(4),
  };
}

const FIXTURE_ENDPOINT = 'lab-host-1:5432';

function buildRequests(count, latencyMs) {
  return Array.from({length: count}, (_u, i) => {
    const kind = KIND_CYCLE[i % KIND_CYCLE.length];
    const intended = i * 10;
    return {
      index: i, opId: `measurement:1:${i + 1}`, operationKind: kind,
      intendedStartMs: intended, issuedAtMs: intended, executionStartedAtMs: intended,
      completedAtMs: intended + latencyMs, issueLagMs: 0, queueDelayMs: 0, latencyMs,
      outcome: OPERATION_OUTCOME.COMMITTED, failureClass: null, retries: 0, retryDelayMs: 0,
      effectSummary: kind === OLTP_OPERATION_KIND.DELIVERY ? {deliveredOrders: 1} : {},
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

function plannedCounts(requests) {
  const counts = {};
  for (const r of requests) counts[r.operationKind] = (counts[r.operationKind] || 0) + 1;
  return counts;
}

function finalStateFor(requests) {
  const committed = (kind) => arrayFilter(requests, (r) =>
    r.outcome === OPERATION_OUTCOME.COMMITTED && r.operationKind === kind).length;
  const newOrders = committed(OLTP_OPERATION_KIND.NEW_ORDER);
  const delivered = committed(OLTP_OPERATION_KIND.DELIVERY);
  return {
    before: {tableRows: {orders: 1000, history: 500, new_order: 300}},
    after: {tableRows: {orders: 1000 + newOrders,
      history: 500 + committed(OLTP_OPERATION_KIND.PAYMENT),
      new_order: 300 + newOrders - delivered}},
  };
}

/**
 * Recompute every derived field of a fixture run after its observations changed:
 * accounting, executed-operations digest, plan slice, final state and the raw digest.
 * @param {Object} run
 * @param {{keepPlan?: boolean, keepFinalState?: boolean}} options
 * @return {Object} The same run, sealed.
 */
function sealFixtureRun(run, options = {}) {
  const requests = run.observations.requests;
  // A plain copy: tests edit the recorded accounting to prove the recount catches it.
  run.observations.accounting = JSON.parse(JSON.stringify(validateBenchmarkAccounting(requests)));
  run.observations.executedOperationsDigest = computeExecutedOperationsDigest(requests);
  if (!options.keepPlan) {
    run.plan.operationSliceDigest = run.observations.executedOperationsDigest;
    run.plan.plannedOperationCounts = plannedCounts(requests);
  }
  if (!options.keepFinalState && run.correctness.finalState) {
    run.correctness.finalState = finalStateFor(requests);
  }
  run.rawObservationsDigest = computeRunObservationsDigest(run);
  return run;
}

function buildProducts(hosts, targetId) {
  return arrayMap(hosts, (h, i) => ({
    role: `${targetId}-node`, host: h.hostId, containerId: `ctr-${i + 1}`,
    imageRef: `example/${targetId}:fixture`, imageId: `sha256:${hexDigits('e')}`,
    repoDigest: `example/${targetId}@sha256:${hexDigits('f')}`, entrypoint: 'serve', cmd: '',
    reportedVersion: '0.0.0-fixture', startedAt: FIXTURE_TIME,
  }));
}

/**
 * A valid Scenario A run on the lab for one claim.
 * @param {Object} options
 * @return {Object} A sealed v2 run record.
 */
function buildFixtureRun(options = {}) {
  const {campaignId = 'fixture-campaign', targetId = 'lagrange', subkind = 'main',
    profileClass = BENCHMARK_PROFILE_CLASS.CAPACITY, requestCount = 120, latencyMs = 4,
    offeredRatePerSec = 100, repetition = 1, hostCount = 3} = options;
  const hosts = fixtureHosts(hostCount + 1);
  const productHosts = hosts.slice(0, hostCount);
  const products = buildProducts(productHosts, targetId);
  const requests = buildRequests(requestCount, latencyMs);
  const endpoint = {host: productHosts[0].hostId, port: 5432, containerId: 'ctr-1',
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
      manifestDigest: `sha256:${hexDigits('c')}`, datasetDigest: `sha256:${hexDigits('1')}`,
      workloadPlanDigest: `sha256:${hexDigits('2')}`, measurementPlanDigest: `sha256:${hexDigits('3')}`,
      semanticProfileId: OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
      semanticProfileDigest: hashScenarioASemanticProfile(),
      retryPolicyId: OLTP_PAIRED_RETRY_POLICY.id, openLoopProfileId: OLTP_OPEN_LOOP_PROFILE.id,
      sweepPlanDigest: `sha256:${hexDigits('4')}`, offeredRatePerSec, profileClass,
      operationSliceDigest: '', plannedOperationCounts: {}, repetition,
      orderIndex: repetition - 1, warmup: {operations: 0},
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
      loadGenerator: {host: hosts[hostCount].hostId, nodeVersion: 'v22.0.0',
        driverVersions: {pg: '8.0.0'}},
      events: [], closure: {status: CLOSURE_STATUS.COMPLETE, unclosed: []},
    },
    observations: {
      runStatus: BENCHMARK_RUN_STATUS.COMPLETED, setup: null,
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
  fixtureTargetCell,
  publishFixtureCampaign,
  sealFixtureRun,
  setFixtureRequestOutcome,
  toNdjson,
  writeFixtureRoot,
};
