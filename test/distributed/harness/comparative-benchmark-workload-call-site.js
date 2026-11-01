/**
 * The ONE call site of stream B1's canonical workload in the deployment and
 * campaign layer. B1's load-generator CLI
 *   node test/distributed/harness/run-benchmark-workload.js --manifest <json> --out <ndjson>
 * runs on the campaign's load-generator host from that host's checkout, which
 * must be at the harness commit the campaign header records. B1 loads the
 * canonical dataset through the canonical adapter, verifies it through the
 * product's public interface (product snapshot vs the generator's expected
 * snapshot, benchmark-oltp-state-reconciliation.js) and measures. This module
 * hands B1 the deployment's endpoint and credentials, returns B1's plan,
 * endpoint, dataset and harness identity as stream A composes them, and types
 * every non-success: a dispatch refusal
 * or non-execution, an endpoint B1 did not use, a plan that differs from the
 * frozen manifest, an unverified dataset (never measured as valid), and a
 * product that failed setup (`product-failure`: the record stays complete).
 *
 * The semantic gate ran before this call (comparative-benchmark-semantic-gate.js);
 * its record is placed in correctness.semanticGate.
 */
import {
  OLTP_DATASET_VERIFICATION_STATUS,
} from './benchmark-oltp-state-reconciliation.js';
import {BENCHMARK_RUN_STATUS} from './benchmark-scenario-a-run.js';
import {BENCHMARK_DISPATCH_STATUS} from './benchmark-workload-dispatch.js';
import {
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
  const access = deployment.access?.connection;
  if (!access) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
      `deployment of ${run.targetId} carries no client credentials`);
  }
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

function outcomeOf(record, manifest, deployment) {
  const used = record.deployment?.endpoint;
  if (!used || used.host !== deployment.endpoint.host ||
      Number(used.port) !== Number(deployment.endpoint.port)) {
    return {failure: {code: DEPLOYMENT_FAILURE.ENDPOINT_UNBOUND,
      message: 'the workload did not use the deployment endpoint', diagnostic: {used}}};
  }
  const dataset = record.deployment.dataset;
  const runStatus = record.observations?.runStatus ?? null;
  if (arrayIncludes(PRODUCT_FAILURE_STATUSES, runStatus)) {
    return {dataset, productFailure: {runStatus, setup: record.observations.setup ?? null}};
  }
  const planProblem = planFailure(manifest, record.plan);
  if (planProblem) {
    return {dataset, failure: {code: FAILURE.PLAN_MISMATCH, message: planProblem}};
  }
  if (dataset?.verification?.status !== OLTP_DATASET_VERIFICATION_STATUS.VERIFIED) {
    return {dataset, failure: {code: DEPLOYMENT_FAILURE.DATASET_UNVERIFIED,
      message: `loaded dataset ${dataset?.verification?.status}`,
      diagnostic: dataset?.verification ?? null}};
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
 *   clientHost: string, evidenceDirOf?: Function}} input
 * @return {Function} executeWorkloadRun({run, manifest, deployment,
 *   semanticGate})
 */
function createWorkloadRunExecutor({runWorkload, describeLoadGenerator, clientHost,
  evidenceDirOf = (run) => `test-output/bench/${run.runId}`}) {
  return async ({run, manifest, deployment, semanticGate = null}) => {
    const productHosts = productHostsOf(deployment);
    if (arrayIncludes(productHosts, clientHost)) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.LOAD_GENERATOR_COLOCATED,
        `load generator ${clientHost} is a product host of ${run.targetId}`, {productHosts});
    }
    const request = workloadRequestOf({run, manifest, deployment,
      evidenceDir: evidenceDirOf(run)});
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
      // B1's answer as stream A composes it: the plan identity B1 executed,
      // the endpoint B1 used, the dataset B1 verified, the harness identity
      // B1 reported (composeFixtureRunFromDriverOutput).
      plan: record.plan ?? null,
      endpoint: record.deployment.endpoint,
      harness: record.identity?.harness ?? null,
      dataset: outcome.dataset ?? record.deployment.dataset ?? null,
      placement,
      loadGenerator: {...await describeLoadGenerator(), host: clientHost, productHosts,
        notProductHost: true, nodeVersion: generator.nodeVersion ?? null,
        driverVersions: generator.nativeClients ?? {}, checkout: generator.checkout ?? null,
        reportedHostname: generator.hostname ?? null},
      cleanup: record.cleanup ?? null,
      events: [],
      failure: outcome.failure ?? null,
      productFailure: outcome.productFailure ?? null,
    };
  };
}

export {
  LOAD_GENERATOR_CLI,
  createRemoteWorkloadRunner,
  createWorkloadRunExecutor,
  workloadRequestOf,
};
