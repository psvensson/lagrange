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
  stringLastIndexOf,
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
// The load generator's checkout at the harness commit: a detached worktree of
// the host's checkout, under its ignored test-output, with the host's
// installed dependencies linked in.
const LOAD_GENERATOR_WORKTREE_PARENT = 'test-output/bench-worktrees';
const LOAD_GENERATOR_LINKED_DIR = 'node_modules';
const CHECKOUT_PREPARATION_TIMEOUT_MS = 10 * 60 * 1000;
const LOAD_GENERATOR_STDERR_TAIL_LINES = 80;
// The reference-client package (mysql2, the TiDB arm's driver) is installed in
// the worktree from its own lockfile with the host's npm.
const REFERENCE_CLIENT_PREFIX = 'test/distributed/reference-client';
const DRIVER_INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const DRIVER_INSTALL_OUTPUT_CHARS = 4000;
const DRIVER_INSTALL = Object.freeze({INSTALLED: 'installed', FAILED: 'failed'});
const TIDB_SYSTEM = 'tidb-tikv';
const WORKTREE_CLOSURE = Object.freeze({COMPLETE: 'complete', INCOMPLETE: 'incomplete'});
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
  COMMIT_ABSENT: 'load_generator_commit_absent',
  DRIVER_MISSING: 'load_generator_driver_missing',
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
 * The B1 request for one manifest run against one deployment. A run whose
 * deployment never became ready carries the deployer's setup failure and no
 * connection: B1 records it unopened.
 */
function workloadRequestOf({run, manifest, deployment, evidenceDir, setupFailure = null}) {
  return {targetId: run.targetId, system: run.system, scenario: run.scenario,
    subkind: run.workloadSubkind,
    ...(setupFailure ? {setupFailure} : {connection: connectionOf(run, deployment)}),
    plan: {offeredRatePerSec: run.offeredRatePerSec, repetition: run.repetition,
      orderIndex: run.orderIndex,
      sweepPlanSha256: manifest.plan.sweepPlanDigest ?
        bareDigest(manifest.plan.sweepPlanDigest) : null,
      // The smoke family owns its workload; the capacity family takes the
      // manifest's.
      ...(manifest.plan.profileClass === 'capacity' ? {workload: manifest.plan.workload} : {})},
    evidenceDir};
}

/**
 * Run B1's load-generator CLI on the load-generator host, from its checkout,
 * after proving that checkout is at the harness commit.
 */
function createRemoteWorkloadRunner({sshRun, opts, host, harnessCommit, campaignId}) {
  const cd = `cd ${shellQuote(host.repoPath)}`;
  return async (request, run) => {
    if (request.system === TIDB_SYSTEM) refuseWithoutDrivers(host);
    const commit = stringTrim(String(await sshRun(host.ip, opts, `${cd} && git rev-parse HEAD`)));
    if (commit !== harnessCommit) {
      throw deploymentFailure(FAILURE.COMMIT_MISMATCH, `load generator ${host.ip} checkout ` +
        `is at ${commit}, the campaign records ${harnessCommit}`, {commit, harnessCommit});
    }
    const dir = `test-output/bench/${campaignId}/${run.runId}`;
    const encoded = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
    await sshRun(host.ip, opts, `${cd} && mkdir -p ${shellQuote(dir)} && printf %s ` +
      `${shellQuote(encoded)} | base64 -d > ${shellQuote(`${dir}/request.json`)}`);
    // The CLI reports a harness error on stderr, which the ssh seam does not
    // return: it is kept in the run directory and read back on failure.
    const stderrLog = `${dir}/stderr.log`;
    const result = await execWithStatus(sshRun, host.ip, opts, `${cd} && ` +
      `${shellQuote(host.nodePath)} ${LOAD_GENERATOR_CLI} --manifest ` +
      `${shellQuote(`${dir}/request.json`)} --out ${shellQuote(`${dir}/records.ndjson`)}` +
      ` 2> ${shellQuote(stderrLog)}`,
    WORKLOAD_TIMEOUT_MS);
    if (!arrayIncludes(Object.values(LOAD_GENERATOR_EXIT), result.exitCode)) {
      const stderr = String(await sshRun(host.ip, opts,
        `${cd} && tail -n ${LOAD_GENERATOR_STDERR_TAIL_LINES} ${shellQuote(stderrLog)}`));
      throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
        `load generator exited ${result.exitCode}`, {stdout: result.stdout, stderr});
    }
    return JSON.parse(String(await sshRun(host.ip, opts,
      `${cd} && tail -n 1 ${shellQuote(`${dir}/records.ndjson`)}`)));
  };
}

/**
 * The load generator's checkout at the harness commit. A lab host's shared
 * checkout stays at whatever commit it was provisioned with (and may carry
 * local edits); it is never moved. The CLI runs from a throwaway detached
 * worktree of it at the harness commit, which the checkout must already hold:
 * an absent commit refuses the campaign (load_generator_commit_absent) before
 * any worktree exists, and nothing is fetched from any remote. The host's
 * installed dependencies are linked in; `release` removes it and
 * answers the closure: {status: 'complete'} or {status: 'incomplete', error}
 * (a removal failure is recorded, never swallowed). A failed preparation
 * leaves with its cause and the closure of the removal it attempted
 * (error.loadGeneratorWorktree). A worktree not at the harness commit refuses
 * the campaign.
 * @return {Promise<{host: Object, release: Function}>} host with repoPath at
 *   the worktree
 */
async function prepareLoadGeneratorCheckout({sshRun, opts, host, harnessCommit, campaignId}) {
  const repo = host.repoPath;
  const worktree = `${repo}/${LOAD_GENERATOR_WORKTREE_PARENT}/${campaignId}`;
  const release = async () => {
    try {
      await sshRun(host.ip, opts, `cd ${shellQuote(repo)} && ` +
        `git worktree remove --force ${shellQuote(worktree)} && git worktree prune`);
      return {status: WORKTREE_CLOSURE.COMPLETE, error: null};
    } catch (error) {
      return {status: WORKTREE_CLOSURE.INCOMPLETE, error: errorText(error)};
    }
  };
  await requireHarnessCommit({sshRun, opts, host, harnessCommit});
  let head;
  try {
    head = stringTrim(String(await sshRun(host.ip, opts, [
      `cd ${shellQuote(repo)}`,
      `git worktree add --detach --quiet ${shellQuote(worktree)} ${shellQuote(harnessCommit)}`,
      `ln -s ${shellQuote(`${repo}/${LOAD_GENERATOR_LINKED_DIR}`)} ` +
        shellQuote(`${worktree}/${LOAD_GENERATOR_LINKED_DIR}`),
      `git -C ${shellQuote(worktree)} rev-parse HEAD`,
    ].join(' && '), CHECKOUT_PREPARATION_TIMEOUT_MS)));
  } catch (error) {
    throw Object.assign(error, {loadGeneratorWorktree: await release()});
  }
  if (head !== harnessCommit) {
    throw Object.assign(deploymentFailure(FAILURE.COMMIT_MISMATCH, `load generator ${host.ip} ` +
      `worktree is at ${head}, the campaign records ${harnessCommit}`,
    {commit: head, harnessCommit}), {loadGeneratorWorktree: await release()});
  }
  const driverInstall = await installReferenceClient({sshRun, opts, host, worktree});
  return {host: {...host, repoPath: worktree, driverInstall}, release};
}

// The harness commit must already be in the load generator's checkout; its
// absence is a typed refusal naming what is missing, never a fetch.
async function requireHarnessCommit({sshRun, opts, host, harnessCommit}) {
  const probe = await execWithStatus(sshRun, host.ip, opts, `cd ${shellQuote(host.repoPath)} && ` +
    `git cat-file -e ${shellQuote(`${harnessCommit}^{commit}`)} 2>&1`);
  if (probe.exitCode === 0) return;
  throw deploymentFailure(FAILURE.COMMIT_ABSENT, `load generator ${host.ip} checkout ` +
    `${host.repoPath} does not hold the harness commit ${harnessCommit}; place it there ` +
    'before the campaign (it is never fetched)', {repoPath: host.repoPath, harnessCommit,
    exitCode: probe.exitCode, output: probe.stdout});
}

// The host's npm sits beside the node the lab recorded for it.
function npmPathPrefix(nodePath) {
  const at = stringLastIndexOf(String(nodePath), '/');
  return at > 0 ? `PATH=${shellQuote(String(nodePath).slice(0, at))}:"$PATH" ` : '';
}

async function installReferenceClient({sshRun, opts, host, worktree}) {
  const result = await execWithStatus(sshRun, host.ip, opts, `cd ${shellQuote(worktree)} && ` +
    `${npmPathPrefix(host.nodePath)}npm ci --prefix ${REFERENCE_CLIENT_PREFIX} ` +
    '--ignore-scripts 2>&1', DRIVER_INSTALL_TIMEOUT_MS);
  const output = String(result.stdout ?? '').slice(-DRIVER_INSTALL_OUTPUT_CHARS);
  return {status: result.exitCode === 0 ? DRIVER_INSTALL.INSTALLED : DRIVER_INSTALL.FAILED,
    exitCode: result.exitCode, output};
}

// The TiDB arm needs the reference-client drivers the worktree installed: a
// failed install or none recorded refuses it, fail-closed.
function refuseWithoutDrivers(host) {
  const install = host.driverInstall;
  if (install?.status === DRIVER_INSTALL.INSTALLED) return;
  if (!install) {
    throw deploymentFailure(FAILURE.DRIVER_MISSING, `load generator ${host.ip} has no ` +
      'record of installing the reference-client drivers', {reason: 'install_not_recorded'});
  }
  throw deploymentFailure(FAILURE.DRIVER_MISSING, `load generator ${host.ip} could not ` +
    `install the reference-client drivers (npm ci exit ${install.exitCode})`,
  {reason: 'install_failed', output: install.output});
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

// The endpoint B1 used must be the deployment's; an unopened run used none.
function endpointProblem(record, deployment, unopened) {
  const used = record.deployment.endpoint;
  if (unopened) return used === null ? null : {used};
  return used && used.host === deployment.endpoint.host &&
    Number(used.port) === Number(deployment.endpoint.port) ? null : {used};
}

// What B1's answer means for the run, checked in order: the endpoint, a
// product failure B1 observed, the plan, the dataset, the watchdog.
function outcomeOf(record, manifest, deployment, unopened) {
  const dataset = record.deployment.dataset;
  const endpoint = endpointProblem(record, deployment, unopened);
  if (endpoint) {
    return {dataset, failure: {code: DEPLOYMENT_FAILURE.ENDPOINT_UNBOUND,
      message: 'the workload did not use the deployment endpoint', diagnostic: endpoint}};
  }
  const runStatus = record.observations.runStatus;
  if (arrayIncludes(PRODUCT_FAILURE_STATUSES, runStatus)) {
    return {dataset, productFailure: {runStatus, setup: record.observations.setup}};
  }
  return {dataset, failure: measuredFailure(record, manifest, runStatus)};
}

function measuredFailure(record, manifest, runStatus) {
  const planProblem = planFailure(manifest, record.plan);
  if (planProblem) return {code: FAILURE.PLAN_MISMATCH, message: planProblem};
  const verification = record.deployment.dataset.verification;
  if (verification.status !== OLTP_DATASET_VERIFICATION_STATUS.VERIFIED) {
    return {code: DEPLOYMENT_FAILURE.DATASET_UNVERIFIED,
      message: `loaded dataset ${verification.status}`, diagnostic: verification};
  }
  if (runStatus === BENCHMARK_RUN_STATUS.WATCHDOG_STOPPED) {
    return {code: DEPLOYMENT_FAILURE.WATCHDOG_STOPPED,
      message: 'the workload watchdog stopped issuing'};
  }
  return null;
}

function productHostsOf(deployment) {
  return [...new Set(arrayMap(deployment.roles, (role) => role.host))];
}

async function workloadRecord(runWorkload, request, run) {
  try {
    return await runWorkload(request, run);
  } catch (error) {
    if (error?.code) throw error;
    throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
      `canonical workload failed: ${errorText(error)}`);
  }
}

// B1's record from the load generator; refusals and non-executions are typed.
async function executedRecord(runWorkload, request, run) {
  const record = await workloadRecord(runWorkload, request, run);
  if (record.recordKind === REFUSED_RECORD_KIND) {
    throw deploymentFailure(FAILURE.DISPATCH_REFUSED, record.reason, record.dispatch);
  }
  if (record.dispatch.status !== BENCHMARK_DISPATCH_STATUS.EXECUTED) {
    throw deploymentFailure(FAILURE.NOT_EXECUTED, 'workload dispatch ' +
      `${record.dispatch.status}: ${record.dispatch.reason}`, record.dispatch);
  }
  return record;
}

// Placement after the window, from the deployer's own observation; an unopened
// run (no window, no ready deployment) observes none.
async function placementAfterWindow(deployment, unopened, outcome) {
  if (unopened || !deployment.operations?.observePlacement) return null;
  try {
    return await deployment.operations.observePlacement();
  } catch (error) {
    outcome.failure = outcome.failure ?? {code: error?.code || DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
      message: `placement after the window: ${errorText(error)}`,
      diagnostic: error?.diagnostic ?? null};
    return null;
  }
}

// The load generator as recorded: the host's facts and what B1 reported of
// the process that ran the workload.
async function recordedLoadGenerator({describeLoadGenerator, clientHost, productHosts,
  generator}) {
  return {...await describeLoadGenerator(), host: clientHost, productHosts,
    notProductHost: true, nodeVersion: generator.nodeVersion,
    driverVersions: generator.nativeClients, checkout: generator.checkout,
    reportedHostname: generator.hostname};
}

/**
 * @param {{runWorkload: Function, describeLoadGenerator: Function,
 *   clientHost: string, evidenceDirOf?: Function}} input
 * @return {Function} executeWorkloadRun({run, manifest, deployment,
 *   semanticGate, setupFailure?}): setupFailure runs the deployment unopened
 */
function createWorkloadRunExecutor({runWorkload, describeLoadGenerator, clientHost,
  evidenceDirOf = (run) => `test-output/bench/${run.runId}`}) {
  return async ({run, manifest, deployment, semanticGate = null, setupFailure = null}) => {
    const productHosts = productHostsOf(deployment);
    if (arrayIncludes(productHosts, clientHost)) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.LOAD_GENERATOR_COLOCATED,
        `load generator ${clientHost} is a product host of ${run.targetId}`, {productHosts});
    }
    const unopened = setupFailure !== null;
    const record = await executedRecord(runWorkload, workloadRequestOf({run, manifest,
      deployment, evidenceDir: evidenceDirOf(run), setupFailure}), run);
    const outcome = outcomeOf(record, manifest, deployment, unopened);
    const placement = await placementAfterWindow(deployment, unopened, outcome);
    return {
      observations: record.observations,
      correctness: {...record.correctness, semanticGate},
      // B1's answer as stream A composes it: the plan identity B1 executed,
      // the endpoint B1 used, the dataset B1 verified, the harness identity
      // B1 reported (composeFixtureRunFromDriverOutput).
      plan: record.plan,
      endpoint: record.deployment.endpoint,
      harness: record.identity.harness,
      dataset: outcome.dataset,
      placement,
      loadGenerator: await recordedLoadGenerator({describeLoadGenerator, clientHost,
        productHosts, generator: record.loadGenerator}),
      cleanup: record.cleanup,
      events: [],
      failure: outcome.failure ?? null,
      productFailure: outcome.productFailure ?? null,
    };
  };
}

export {
  createRemoteWorkloadRunner,
  createWorkloadRunExecutor,
  prepareLoadGeneratorCheckout,
};
