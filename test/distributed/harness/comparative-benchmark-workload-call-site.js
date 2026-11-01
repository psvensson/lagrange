/**
 * The ONE call site of stream B1's canonical workload in the deployment and
 * campaign layer. B1's load-generator CLI
 *   node test/distributed/harness/run-benchmark-workload.js --manifest <json> --out <ndjson>
 * runs on the campaign's load-generator host from that host's checkout, which
 * must be at the harness commit the campaign header records. B1 loads the
 * canonical dataset through the canonical adapter, verifies it through the
 * product's public interface (product snapshot vs the generator's expected
 * snapshot, benchmark-oltp-state-reconciliation.js) and measures. This module
 * hands B1 the deployment's endpoint and credentials, maps B1's answer into
 * stream A's record fields, and types every non-success: a dispatch refusal
 * or non-execution, an endpoint B1 did not use, a plan that differs from the
 * frozen manifest, an unverified dataset (never measured as valid), and a
 * product that failed setup (`product-failure`: the record stays complete).
 *
 * Semantic proofs: when B1's runScenarioASemanticProofJourney is supplied the
 * gate runs against the deployed arm BEFORE the workload, bound to this
 * deployment's endpoint container; until then the record carries
 * `semanticGate: null` and a typed `semantic-gate-unavailable` event.
 */
import {
  OLTP_DATASET_VERIFICATION_STATUS,
} from './benchmark-oltp-state-reconciliation.js';
import {BENCHMARK_RUN_STATUS} from './benchmark-scenario-a-run.js';
import {BENCHMARK_DISPATCH_STATUS} from './benchmark-workload-dispatch.js';
import {
  arrayFind,
  arrayIncludes,
  arrayMap,
  stringReplace,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {
  errorText,
  execWithStatus,
  shellQuote,
} from './real-product-remote-shell.js';

const LOAD_GENERATOR_CLI = 'test/distributed/harness/run-benchmark-workload.js';
const LOAD_GENERATOR_EXIT = Object.freeze({OK: 0, REFUSED: 2});
const REFUSED_RECORD_KIND = 'benchmark-dispatch-refused';
const WORKLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const SHA_PREFIX = /^sha256:/u;
const EVENT = Object.freeze({SEMANTIC_GATE_UNAVAILABLE: 'semantic-gate-unavailable'});
const PRODUCT_FAILURE_STATUSES = Object.freeze([BENCHMARK_RUN_STATUS.SETUP_FAILED,
  BENCHMARK_RUN_STATUS.WARMUP_FAILED]);
const FAILURE = Object.freeze({
  DISPATCH_REFUSED: 'benchmark_dispatch_refused',
  NOT_EXECUTED: 'workload_not_executed',
  PLAN_MISMATCH: 'plan_mismatch',
  COMMIT_MISMATCH: 'load_generator_commit_mismatch',
});

function bareDigest(value) {
  return stringReplace(String(value ?? ''), SHA_PREFIX, '');
}

function connectionOf(run, deployment) {
  const endpoint = {host: deployment.endpoint.host, port: deployment.endpoint.port};
  const access = deployment.access?.connection ?? {};
  return run.system === 'tidb-tikv' ? {endpoint, databaseName: access.database} :
    {endpoint, credentials: access};
}

/**
 * The B1 request for one manifest run against one deployment.
 */
function workloadRequestOf({run, manifest, deployment, evidenceDir}) {
  return {targetId: run.targetId, system: run.system, scenario: run.scenario,
    subkind: run.workloadSubkind, connection: connectionOf(run, deployment),
    plan: {offeredRatePerSec: run.offeredRatePerSec, repetition: run.repetition,
      orderIndex: run.orderIndex, sweepPlanSha256: bareDigest(manifest.plan.sweepPlanDigest)},
    evidenceDir};
}

/**
 * Run B1's load-generator CLI on the load-generator host, from its checkout,
 * after proving that checkout is at the harness commit.
 */
function createRemoteWorkloadRunner({sshRun, opts, host, harnessCommit, campaignId}) {
  const cd = `cd ${shellQuote(host.repoPath)}`;
  return async (request, run) => {
    const commit = stringTrim(String(await sshRun(host.ip, opts, `${cd} && git rev-parse HEAD`)));
    if (commit !== harnessCommit) {
      throw deploymentFailure(FAILURE.COMMIT_MISMATCH, `load generator ${host.ip} checkout ` +
        `is at ${commit}, the campaign records ${harnessCommit}`, {commit, harnessCommit});
    }
    const dir = `test-output/bench/${campaignId}/${run.runId}`;
    const encoded = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
    await sshRun(host.ip, opts, `${cd} && mkdir -p ${shellQuote(dir)} && printf %s ` +
      `${shellQuote(encoded)} | base64 -d > ${shellQuote(`${dir}/request.json`)}`);
    const result = await execWithStatus(sshRun, host.ip, opts, `${cd} && ` +
      `${shellQuote(host.nodePath)} ${LOAD_GENERATOR_CLI} --manifest ` +
      `${shellQuote(`${dir}/request.json`)} --out ${shellQuote(`${dir}/records.ndjson`)}`,
    WORKLOAD_TIMEOUT_MS);
    if (!arrayIncludes(Object.values(LOAD_GENERATOR_EXIT), result.exitCode)) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
        `load generator exited ${result.exitCode}`, {stdout: result.stdout});
    }
    return JSON.parse(String(await sshRun(host.ip, opts,
      `${cd} && tail -n 1 ${shellQuote(`${dir}/records.ndjson`)}`)));
  };
}

function keyedRows(rows) {
  return Object.values(rows || {}).reduce((sum, count) => sum + Number(count || 0), 0);
}

/**
 * B1's dataset verification as stream A's deployment.dataset. Full key
 * coverage is claimed only when the observed logical checksum equals the
 * expected one (equality over every canonical row implies every key); any
 * other status leaves `present` null and fails the run.
 */
function datasetRecordOf(dataset) {
  const verification = dataset?.verification ?? {};
  const verified = verification.status === OLTP_DATASET_VERIFICATION_STATUS.VERIFIED;
  const expected = keyedRows(verification.expectedTableRows);
  return {
    resetMethod: dataset?.resetMethod ?? null,
    method: verification.method ?? null,
    status: verification.status ?? null,
    tables: arrayMap(Object.entries(verification.observedTableRows || {}),
      ([table, rows]) => ({table, rows, expectedRows:
        verification.expectedTableRows?.[table] ?? null})),
    keyCoverage: {expected, present: verified ? expected : null,
      derivation: 'logical-checksum-equality'},
    logicalChecksum: verification.observedLogicalChecksum ?? null,
    expectedChecksum: verification.expectedLogicalChecksum ?? null,
    error: verification.error ?? null,
  };
}

function planFailure(manifest, b1Plan) {
  if (!b1Plan) return 'the workload returned no plan identity';
  if (bareDigest(b1Plan.datasetDigest) !== bareDigest(manifest.plan.datasetDigest)) {
    return `dataset digest ${b1Plan.datasetDigest} != manifest ${manifest.plan.datasetDigest}`;
  }
  if (b1Plan.profileClass !== manifest.plan.profileClass) {
    return `profile class ${b1Plan.profileClass} != manifest ${manifest.plan.profileClass}`;
  }
  return null;
}

function semanticGateBindingOf(manifest, deployment) {
  const endpoint = deployment.endpoint;
  const product = arrayFind(deployment.identity?.products || [],
    (one) => one.containerId === endpoint.containerId);
  return {campaignId: manifest.campaignId, containerId: endpoint.containerId,
    imageId: product?.imageId ?? null, endpoint: `${endpoint.host}:${endpoint.port}`};
}

function outcomeOf(record, manifest, deployment) {
  const used = record.deployment?.endpoint;
  if (!used || used.host !== deployment.endpoint.host ||
      Number(used.port) !== Number(deployment.endpoint.port)) {
    return {failure: {code: DEPLOYMENT_FAILURE.ENDPOINT_UNBOUND,
      message: 'the workload did not use the deployment endpoint', diagnostic: {used}}};
  }
  const dataset = datasetRecordOf(record.deployment.dataset);
  const runStatus = record.observations?.runStatus ?? null;
  if (arrayIncludes(PRODUCT_FAILURE_STATUSES, runStatus)) {
    return {dataset, productFailure: {runStatus, setup: record.observations.setup ?? null}};
  }
  const planProblem = planFailure(manifest, record.plan);
  if (planProblem) {
    return {dataset, failure: {code: FAILURE.PLAN_MISMATCH, message: planProblem}};
  }
  if (dataset.keyCoverage.present === null) {
    return {dataset, failure: {code: DEPLOYMENT_FAILURE.DATASET_UNVERIFIED,
      message: `loaded dataset ${dataset.status}`, diagnostic: dataset}};
  }
  if (runStatus === BENCHMARK_RUN_STATUS.WATCHDOG_STOPPED) {
    return {dataset, failure: {code: DEPLOYMENT_FAILURE.WATCHDOG_STOPPED,
      message: 'the workload watchdog stopped issuing'}};
  }
  return {dataset};
}

function productHostsOf(deployment) {
  return [...new Set(arrayMap(deployment.roles || [], (role) => role.host))];
}

/**
 * @param {{runWorkload: Function, describeLoadGenerator: Function,
 *   clientHost: string, semanticJourney?: Function|null,
 *   evidenceDirOf?: Function, now?: Function}} input
 * @return {Function} executeWorkloadRun({run, manifest, deployment, signal})
 */
function createWorkloadRunExecutor({runWorkload, describeLoadGenerator, clientHost,
  semanticJourney = null, evidenceDirOf = (run) => `test-output/bench/${run.runId}`,
  now = Date.now}) {
  return async ({run, manifest, deployment}) => {
    const productHosts = productHostsOf(deployment);
    if (arrayIncludes(productHosts, clientHost)) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.LOAD_GENERATOR_COLOCATED,
        `load generator ${clientHost} is a product host of ${run.targetId}`, {productHosts});
    }
    const request = workloadRequestOf({run, manifest, deployment,
      evidenceDir: evidenceDirOf(run)});
    const events = [];
    const binding = semanticGateBindingOf(manifest, deployment);
    let semanticGate = null;
    if (semanticJourney) {
      semanticGate = await semanticJourney({system: run.system,
        connection: request.connection, binding, evidenceDir: request.evidenceDir});
    } else {
      events.push({kind: EVENT.SEMANTIC_GATE_UNAVAILABLE, at: new Date(now()).toISOString(),
        reason: 'runScenarioASemanticProofJourney is not exposed by the workload owner'});
    }
    let record;
    try {
      record = await runWorkload(request, run);
    } catch (error) {
      if (error?.code) throw error;
      throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
        `canonical workload failed: ${errorText(error)}`);
    }
    if (record?.recordKind === REFUSED_RECORD_KIND) {
      throw deploymentFailure(FAILURE.DISPATCH_REFUSED, record.reason, record.dispatch);
    }
    if (record?.dispatch?.status !== BENCHMARK_DISPATCH_STATUS.EXECUTED) {
      throw deploymentFailure(FAILURE.NOT_EXECUTED, 'workload dispatch ' +
        `${record?.dispatch?.status}: ${record?.dispatch?.reason}`, record?.dispatch ?? null);
    }
    const outcome = outcomeOf(record, manifest, deployment);
    const generator = record.loadGenerator || {};
    let placement = null;
    try {
      placement = await deployment.operations?.observePlacement?.() ?? null;
    } catch (error) {
      outcome.failure = outcome.failure ?? {code: error?.code || DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
        message: `placement after the window: ${errorText(error)}`,
        diagnostic: error?.diagnostic ?? null};
    }
    return {
      observations: record.observations,
      correctness: {...record.correctness, semanticGate},
      plan: {operationSliceDigest: record.plan?.operationSliceDigest ?? null,
        plannedOperationCounts: record.plan?.plannedOperationCounts ?? null,
        workloadProfileId: record.plan?.workloadProfileId ?? null},
      harness: {driverSourceSha256: record.identity?.harness?.driverSourceSha256 ?? null,
        adapterIds: record.identity?.harness?.adapterIds ?? []},
      dataset: outcome.dataset ?? null,
      placement,
      loadGenerator: {...await describeLoadGenerator(), host: clientHost, productHosts,
        notProductHost: true, nodeVersion: generator.nodeVersion ?? null,
        driverVersions: generator.nativeClients ?? {}, checkout: generator.checkout ?? null,
        reportedHostname: generator.hostname ?? null},
      cleanup: record.cleanup ?? null,
      events,
      failure: outcome.failure ?? null,
      productFailure: outcome.productFailure ?? null,
    };
  };
}

export {
  LOAD_GENERATOR_CLI,
  createRemoteWorkloadRunner,
  createWorkloadRunExecutor,
  datasetRecordOf,
  workloadRequestOf,
};
