#!/usr/bin/env node
/**
 * Comparative benchmark campaign runner: Lagrange, TiDB + TiKV and PostgreSQL
 * deployed as real product containers on real hosts, driven by the canonical
 * workload (stream B1) from a separate load-generator host.
 *
 * The default execution target is the home lab: hosts come from the
 * registered lab inventory (`node scripts/lab.js`, `harness` role, reachable,
 * Docker reachable, machine lock free), each is held with the machine-wide
 * lock under purpose `bench:<campaignId>` and released on exit, and the
 * thermal gate runs on every held host before deployment. GCP is explicit
 * (`--execution-target gcp --hosts ...`) and creates no infrastructure.
 *
 * The campaign runs a frozen manifest (written and digested before any run)
 * and APPENDS a v2 campaign header and one record per attempted run to the
 * raw observation store. Publication is not this runner's business: stream
 * A's regenerate path consumes admitted cells only.
 */

import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

import {EXIT_CODES} from '../../../test/distributed/harness/constants.js';
import {
  DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH,
} from '../../../test/distributed/harness/raw-observation-store.js';
import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
} from '../../../test/distributed/harness/comparative-benchmark-campaign-manifest.js';
import {runComparativeCampaign} from
  '../../../test/distributed/harness/comparative-benchmark-campaign-runner.js';
import {
  collectHostFacts,
  describeLoadGenerator,
  ensureProductImages,
  resolvePinnedImage,
} from '../../../test/distributed/harness/comparative-benchmark-host-preparation.js';
import {
  THERMAL_GATE,
  checkLabThermalHeadroom,
  holdLabBenchmarkHosts,
  plannedLabLocks,
  readLabHolderRecords,
  releaseLabBenchmarkHosts,
  selectLabBenchmarkHosts,
} from '../../../test/distributed/harness/comparative-benchmark-lab-hosts.js';
import {
  createRemoteWorkloadRunner,
  createWorkloadRunExecutor,
} from '../../../test/distributed/harness/comparative-benchmark-workload-call-site.js';
import {
  loadRawObservationRecordOwner,
} from '../../../test/distributed/harness/comparative-benchmark-record-owner.js';
import {
  composeCampaignHarnessIdentity,
} from '../../../test/distributed/harness/comparative-benchmark-harness-identity.js';
import {
  createSemanticGateStage,
} from '../../../test/distributed/harness/comparative-benchmark-semantic-gate.js';
import {
  runScenarioASemanticProofJourney,
} from '../../../test/distributed/scenarios/scenario-a-semantic-proof-journey.js';
import {SCENARIO_OUTCOME} from '../../../test/distributed/harness/scenario-outcome.js';
import {
  COMPARATIVE_TARGET,
  LAGRANGE_IMAGE_DEFAULT,
  PD_IMAGE_DEFAULT,
  POSTGRES_IMAGE_DEFAULT,
  TARGET_DATA_HOSTS,
  TIDB_IMAGE_DEFAULT,
  TIKV_IMAGE_DEFAULT,
  deployComparativeTarget,
  removeCampaignContainers,
} from '../../../test/distributed/harness/real-product-cluster-deployers.js';
import {
  TIDB_SQL_CLIENT_IMAGE,
} from '../../../test/distributed/harness/real-product-deployment-contract.js';
import {
  observeProductsAfterWindow,
} from '../../../test/distributed/harness/real-product-identity.js';
import {GIT_OUTPUT_BOUND, execGit} from '../../../scripts/checks/git-invocation.js';
import {discoverFleet, fleetRequirement} from '../../../scripts/lab/probe.js';
import {loadState, selectNodesByRole} from '../../../scripts/lab/state.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TARGET = Object.freeze({LAB: 'lab', GCP: 'gcp'});
const PROFILES = Object.freeze({smoke: COMPARATIVE_SMOKE_PROFILE});
// The smoke targets of stream A's coverage manifest.
const DEFAULT_TARGETS = Object.freeze([COMPARATIVE_TARGET.LAGRANGE,
  COMPARATIVE_TARGET.TIDB_TIKV, COMPARATIVE_TARGET.PG_SINGLE_PRIMARY]);
const PLAN_SCHEMA = 'lagrange-comparative-campaign-plan/v3';
const SUMMARY_SCHEMA = 'lagrange-comparative-campaign-summary/v1';
const SSH_TIMEOUT_MS = 120000;
const SSH_MAX_BUFFER = 64 * 1024 * 1024;
const MS_PER_MINUTE = 60000;
const DEFAULT_LOCK_WAIT_MINUTES = 30;
const HARNESS_ROLE = 'harness';

const USAGE = `Usage: node docs/benchmarks/cloud/run-comparative-benchmarks.mjs [options]

Options:
  --execution-target <lab|gcp>  Where the campaign runs (default: lab)
                                lab: hosts from the registered lab inventory
                                (node scripts/lab.js), locked per host
  --hosts <ip,...>              gcp only: 3 data hosts first, load generator last
  --ssh-hosts <ip,...>          gcp only: external SSH addresses matching --hosts
  --ssh-user <user>             gcp only: SSH user (default: $SSH_USER or $USER)
  --ssh-key <path>              gcp only: SSH private key
  --client-checkout <path>      gcp only: checkout on the load generator, at this commit
  --client-node <path>          gcp only: Node >= 22 on the load generator (default: node)
  --targets <a,b,...>           ${Object.values(COMPARATIVE_TARGET).join(', ')}
                                (default: ${DEFAULT_TARGETS.join(',')})
  --profile <smoke>             Campaign profile (default: smoke)
  --campaign-id <id>            Campaign id (default: generated)
  --storage-root <path>         Host directory for product data volumes; without it
                                data lives in the container layer (smoke only)
  --lagrange-image <ref>        Lagrange image (default: ${LAGRANGE_IMAGE_DEFAULT});
                                publishable runs need repo@sha256:<digest>
  --lagrange-image-id <sha256>  The Lagrange image content every data host must hold (by
                                image id; --lagrange-image is then its registry provenance)
  --lagrange-version <v>        Product version the image must report (needed for a digest)
  --lagrange-revision <sha>     org.opencontainers.image.revision the image must carry
  --raw-observations <path>     Append-only record store
                                (default: ${DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH})
  --output <path>               Campaign summary JSON
  --lock-wait-minutes <n>       Bounded wait for each lab host lock (default: 30)
  --dry-run                     Print the manifest and the hosts it would lock
  --help                        Show this help
`;

class UsageError extends Error {}

const VALUE_FLAGS = Object.freeze({
  '--execution-target': 'executionTarget', '--hosts': 'hostsRaw',
  '--ssh-hosts': 'sshHostsRaw', '--ssh-user': 'sshUser', '--ssh-key': 'sshKey',
  '--targets': 'targetsRaw', '--profile': 'profile', '--campaign-id': 'campaignId',
  '--storage-root': 'storageRoot', '--lagrange-image': 'lagrangeImage',
  '--raw-observations': 'rawObservationsPath', '--output': 'outputPath',
  '--lock-wait-minutes': 'lockWaitMinutes', '--client-checkout': 'clientCheckout',
  '--client-node': 'clientNode', '--lagrange-version': 'lagrangeVersion',
  '--lagrange-image-id': 'lagrangeImageId',
  '--lagrange-revision': 'lagrangeRevision',
});

function list(text) {
  return String(text || '').split(',').map((part) => part.trim()).filter(Boolean);
}

function generatedCampaignId() {
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\..*$/u, 'Z');
  return `bench-${stamp}-${randomBytes(3).toString('hex')}`;
}

function parseCliArgs(argv, env) {
  const opts = {executionTarget: env.EXECUTION_TARGET || TARGET.LAB, hostsRaw: '',
    sshHostsRaw: '', sshUser: env.SSH_USER || env.USER || '', sshKey: env.SSH_KEY || '',
    targetsRaw: DEFAULT_TARGETS.join(','), profile: 'smoke', campaignId: '',
    storageRoot: '', lagrangeImage: LAGRANGE_IMAGE_DEFAULT,
    rawObservationsPath: DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH, outputPath: '',
    lockWaitMinutes: String(DEFAULT_LOCK_WAIT_MINUTES), clientCheckout: '', clientNode: 'node',
    dryRun: false, help: false};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (VALUE_FLAGS[arg] && argv[index + 1] !== undefined) {
      opts[VALUE_FLAGS[arg]] = argv[index + 1];
      index += 1;
    } else throw new UsageError(`unknown or incomplete option ${arg}`);
  }
  if (!Object.values(TARGET).includes(opts.executionTarget)) {
    throw new UsageError(`--execution-target must be lab or gcp, got ${opts.executionTarget}`);
  }
  if (opts.executionTarget === TARGET.LAB && (opts.hostsRaw || opts.sshHostsRaw)) {
    throw new UsageError('lab hosts come from the registered lab inventory ' +
      '(node scripts/lab.js); --hosts/--ssh-hosts are for --execution-target gcp');
  }
  if (!PROFILES[opts.profile]) throw new UsageError(`unknown profile ${opts.profile}`);
  opts.campaignId = opts.campaignId || generatedCampaignId();
  opts.targets = list(opts.targetsRaw);
  opts.outputPath = opts.outputPath ||
    `test-output/cloud-benchmarks/comparative-campaign-${opts.campaignId}.json`;
  return opts;
}

function dataHostCountOf(targets) {
  return Math.max(...targets.map((target) => TARGET_DATA_HOSTS[target]));
}

// The first data-host-count addresses are data hosts and the LAST is the load
// generator (provision-gcp.sh lists its dedicated client VM last); any
// addresses between them are not used by the campaign.
function gcpHosts(opts, dataHostCount) {
  const ips = list(opts.hostsRaw);
  if (ips.length < dataHostCount + 1) {
    throw new UsageError('--execution-target gcp needs --hosts with at least ' +
      `${dataHostCount + 1} internal IPs (${dataHostCount} data hosts + 1 load generator, ` +
      `last), got ${ips.length}`);
  }
  const ssh = list(opts.sshHostsRaw);
  const host = (index, role) => ({name: ips[index], ip: ips[index], role,
    sshTarget: `${opts.sshUser ? `${opts.sshUser}@` : ''}${ssh[index] || ips[index]}`,
    repoPath: role === 'client' ? opts.clientCheckout || null : null,
    nodePath: role === 'client' ? opts.clientNode : null});
  return [...Array.from({length: dataHostCount}, (_unused, index) => host(index, 'data')),
    host(ips.length - 1, 'client')];
}

function createSshRun(hosts, opts) {
  const targetOf = new Map(hosts.map((host) => [host.ip, host.sshTarget]));
  return async (ip, _opts, command, timeoutMs = SSH_TIMEOUT_MS) => {
    const target = targetOf.get(ip);
    if (!target) throw new Error(`host ${ip} is not part of this campaign`);
    const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];
    if (opts.sshKey) args.push('-i', opts.sshKey);
    const {stdout} = await execFileAsync('ssh', [...args, target, command],
      {timeout: timeoutMs, maxBuffer: SSH_MAX_BUFFER});
    return String(stdout || '').trim();
  };
}

function imagesFor(targets, opts) {
  const images = new Set([POSTGRES_IMAGE_DEFAULT]);
  if (targets.includes(COMPARATIVE_TARGET.LAGRANGE)) images.add(opts.lagrangeImage);
  if (targets.includes(COMPARATIVE_TARGET.TIDB_TIKV)) {
    for (const image of [PD_IMAGE_DEFAULT, TIKV_IMAGE_DEFAULT, TIDB_IMAGE_DEFAULT,
      TIDB_SQL_CLIENT_IMAGE]) images.add(image);
  }
  return [...images];
}

// The harness identity the campaign header carries (stream A's same-harness
// shape), the commit and checkout state read through the repository's one git
// invocation owner. A git read that fails throws: a campaign never records a
// substitute commit.
function harnessIdentity(manifest) {
  const git = (args) => String(execGit(args, {cwd: REPO_ROOT, encoding: 'utf8',
    bound: GIT_OUTPUT_BOUND.COMMAND})).trim();
  return composeCampaignHarnessIdentity({gitCommit: git(['rev-parse', 'HEAD']),
    checkoutDirty: git(['status', '--porcelain']) !== '', systems: manifest.plan.systems});
}

function appendRecords(file, records) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.appendFileSync(file, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

async function runCampaign({opts, manifest, hosts, physicalExtras}) {
  const sshRun = createSshRun(hosts, opts);
  const facts = await collectHostFacts({hosts, sshRun, opts});
  const physicalHosts = facts.map((fact, index) => ({...fact, name: hosts[index].name,
    role: hosts[index].role, ...(physicalExtras[hosts[index].name] || {})}));
  const pinned = opts.lagrangeImageId ? await resolvePinnedImage({
    hosts: hosts.filter((host) => host.role === 'data'), imageId: opts.lagrangeImageId,
    registryRef: opts.lagrangeImage, sshRun, opts}) : null;
  await ensureProductImages({hosts, sshRun, opts,
    images: imagesFor(manifest.targets, opts).filter((image) =>
      !(pinned && image === opts.lagrangeImage))});
  const recordOwner = await loadRawObservationRecordOwner();
  const client = hosts.find((host) => host.role === 'client');
  if (!client.repoPath || !client.nodePath) {
    throw new UsageError('the load generator needs a checkout at the harness commit: ' +
      'lab hosts record one; for gcp pass --client-checkout <path>');
  }
  const harness = await harnessIdentity(manifest);
  const dataIps = hosts.filter((host) => host.role === 'data').map((host) => host.ip);
  // The semantic proof journey runs here, on the controller; PostgreSQL admits
  // the controller's address (as the data host sees it) next to the load generator.
  const controllerIp = (await sshRun(dataIps[0], opts, 'echo "${SSH_CLIENT%% *}"')).trim();
  const deployOpts = {lagrangeImage: opts.lagrangeImage, storageRoot: opts.storageRoot || null,
    lagrangeVersion: opts.lagrangeVersion || null, lagrangeRevision: opts.lagrangeRevision || null,
    lagrangeImageId: opts.lagrangeImageId || null,
    lagrangeImageByHost: pinned ? Object.fromEntries(Object.entries(pinned).map(
      ([ip, entry]) => [ip, entry.runRef])) : null,
    proofClientIps: controllerIp ? [controllerIp] : []};
  const deployArm = (run) => deployComparativeTarget(run.targetId, {hosts: dataIps,
    clientIp: client.ip, sshRun, opts: deployOpts, campaignId: manifest.campaignId,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))});
  const teardown = () => removeCampaignContainers({hosts: hosts.map((host) => host.ip),
    campaignId: manifest.campaignId, sshRun, opts});
  const deps = {
    runSemanticGate: createSemanticGateStage({journey: runScenarioASemanticProofJourney,
      sshRun, opts,
      redeploy: async (run) => {
        await teardown();
        return deployArm(run);
      },
      evidenceDirOf: (run) => path.resolve(REPO_ROOT,
        `test-output/bench/${manifest.campaignId}/${run.runId}/semantic-gate`)}),
    recordOwner,
    now: Date.now,
    deadlineAt: Date.now() + manifest.campaignBudgetMinutes * MS_PER_MINUTE,
    deployRun: deployArm,
    executeWorkloadRun: createWorkloadRunExecutor({clientHost: client.ip,
      runWorkload: createRemoteWorkloadRunner({sshRun, opts, host: client,
        harnessCommit: harness.gitCommit, campaignId: manifest.campaignId}),
      evidenceDirOf: (run) => `test-output/bench/${manifest.campaignId}/${run.runId}/evidence`,
      describeLoadGenerator: () => describeLoadGenerator({host: client,
        hostFacts: facts[hosts.indexOf(client)]})}),
    inspectProducts: (deployment) => observeProductsAfterWindow({sshRun, opts,
      products: deployment.identity.products}),
    teardownRun: teardown,
    appendRecords: (records) => appendRecords(
      path.resolve(REPO_ROOT, opts.rawObservationsPath), records),
  };
  // A signal stops issuing new runs; the run in flight finishes its teardown.
  const stop = () => {
    deps.deadlineAt = 0;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const summary = await runComparativeCampaign({manifest,
      header: {executionTarget: opts.executionTarget, physicalHosts, harness}, deps});
    const admitted = recordOwner.campaignOutcome({header: summary.header,
      runs: summary.records, file: opts.rawObservationsPath, rootDir: REPO_ROOT, manifest});
    const {header: _header, records: _records, ...rest} = summary;
    return {...rest, admission: admitted, exitCode: campaignExitCode(summary.exitCode,
      admitted.outcome)};
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

// A run failure keeps its exit code; otherwise the admitted cells decide: an
// all-non-valid campaign never exits as passed.
function campaignExitCode(runExitCode, outcome) {
  if (runExitCode !== EXIT_CODES.SUCCESS) return runExitCode;
  if (outcome === SCENARIO_OUTCOME.PASSED) return EXIT_CODES.SUCCESS;
  return outcome === SCENARIO_OUTCOME.REFUSED ? EXIT_CODES.REFUSED : EXIT_CODES.FAILURE;
}

async function runLabCampaign({opts, manifest, dataHostCount}) {
  const state = await loadState({allowMissing: false});
  const requirement = fleetRequirement(REPO_ROOT);
  const fleet = await discoverFleet({nodes: selectNodesByRole(state, HARNESS_ROLE),
    controllerRepoPath: REPO_ROOT, lockGraphSha256: requirement.lockGraphSha256,
    nodeMinimum: requirement.nodeMinimum});
  const hosts = selectLabBenchmarkHosts({state, fleet, dataHostCount,
    nodeMinimum: requirement.nodeMinimum});
  const budgetMs = manifest.campaignBudgetMinutes * MS_PER_MINUTE;
  const sessions = await holdLabBenchmarkHosts({hosts, campaignId: manifest.campaignId,
    waitMs: Number(opts.lockWaitMinutes) * MS_PER_MINUTE, expectedMs: budgetMs});
  try {
    const sshRun = createSshRun(hosts, opts);
    const thermal = await checkLabThermalHeadroom({hosts, sshRun, opts});
    const holders = await readLabHolderRecords({hosts, sshRun, opts});
    const extras = Object.fromEntries(hosts.map((host) => [host.name,
      {lab: {holder: holders[host.name], thermal: thermal[host.name]}}]));
    return await runCampaign({opts, manifest, hosts, physicalExtras: extras});
  } finally {
    await releaseLabBenchmarkHosts(sessions);
  }
}

async function dryRunPlan({opts, manifest, dataHostCount}) {
  const lab = opts.executionTarget === TARGET.LAB;
  const hosts = lab ?
    selectLabBenchmarkHosts({state: await loadState({allowMissing: false}), dataHostCount,
      nodeMinimum: fleetRequirement(REPO_ROOT).nodeMinimum}) :
    gcpHosts(opts, dataHostCount);
  return {schema: PLAN_SCHEMA, executionTarget: opts.executionTarget,
    campaignId: manifest.campaignId, manifestDigest: manifest.manifestDigest,
    rawObservationsPath: opts.rawObservationsPath,
    hostSource: lab ?
      'registered lab inventory (recorded facts; a live run re-discovers the fleet)' :
      '--hosts (no infrastructure is created)',
    ...(lab ? {labHosts: hosts.map(({name, ip, role, lock}) => ({name, ip, role, lock}))} :
      {hosts: hosts.map(({ip, sshTarget, role}) => ({ip, sshTarget, role}))}),
    wouldLock: lab ? plannedLabLocks(hosts, manifest.campaignId) : [],
    thermalGate: lab ? THERMAL_GATE : null,
    manifest};
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2), process.env);
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  const manifest = buildComparativeCampaignManifest({campaignId: opts.campaignId,
    profile: PROFILES[opts.profile], targets: opts.targets});
  const dataHostCount = dataHostCountOf(manifest.targets);
  if (opts.dryRun) {
    const plan = await dryRunPlan({opts, manifest, dataHostCount});
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  const summary = opts.executionTarget === TARGET.LAB ?
    await runLabCampaign({opts, manifest, dataHostCount}) :
    await runCampaign({opts, manifest, hosts: gcpHosts(opts, dataHostCount),
      physicalExtras: {}});
  const output = path.resolve(REPO_ROOT, opts.outputPath);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify({schema: SUMMARY_SCHEMA,
    executionTarget: opts.executionTarget, rawObservationsPath: opts.rawObservationsPath,
    ...summary}, null, 2)}\n`);
  process.stdout.write(`[bench] campaign ${summary.campaignId}: ${summary.attempted.length} ` +
    `runs attempted, summary ${opts.outputPath}\n`);
  process.exitCode = summary.exitCode;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof UsageError ? '' : `${error.code || 'error'}: `}` +
    `${error.message}\n`);
  if (error instanceof UsageError) process.stderr.write(USAGE);
  process.exitCode = String(error.code || '').startsWith('refused_') ?
    EXIT_CODES.REFUSED : EXIT_CODES.FAILURE;
});
