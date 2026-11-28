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
 * A campaign never obtains an image, the harness commit or a reference-client
 * package itself. On GCP, `--provision` is the separate, explicit step that
 * places them (comparative-benchmark-provisioning.js) and exits; the campaign
 * is the next invocation with the same options.
 *
 * The campaign runs a frozen manifest (written and digested before any run)
 * and APPENDS a v2 campaign header and one record per attempted run to the
 * raw observation store. When a live campaign records attempted runs to the
 * repository's canonical raw-observations store, it invokes stream A's single
 * regeneration owner so derived JSONs and `docs/benchmarks/` stay in sync.
 */

import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {EXIT_CODES} from '../../../test/distributed/harness/constants.js';
import {
  DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH,
  readRawObservationSources,
} from '../../../test/distributed/harness/raw-observation-store.js';
import {
  ADMISSION_REASON,
} from '../../../test/distributed/harness/benchmark-claim-admission.js';
import {
  DEFAULT_INVALIDATIONS_PATH,
  appendInvalidationEntries,
  readInvalidationLedger,
} from '../../../test/distributed/harness/benchmark-invalidation-ledger.js';
import {
  regenerateAllBenchmarkArtifactsFromAdmitted,
} from '../../../test/distributed/harness/raw-observation-campaign-specs.js';
import {
  COMPARATIVE_CAPACITY_PROFILE,
  COMPARATIVE_RESEARCH_PROFILE,
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
  researchProfileWithFormationWait,
  researchProfileWithProduct,
  researchReadinessBudget,
} from '../../../test/distributed/harness/comparative-benchmark-campaign-manifest.js';
import {
  beginDeploymentRoundTrip,
  campaignEvidenceDirOf,
  createCampaignRecordWriter,
  runComparativeCampaign,
} from '../../../test/distributed/harness/comparative-benchmark-campaign-runner.js';
import {
  buildSubstrateDescriptor,
  campaignImagesByRole,
  collectHostFacts,
  observeLinkTypes,
  describeLoadGenerator,
  ensureProductImages,
  resolvePinnedImage,
} from '../../../test/distributed/harness/comparative-benchmark-host-preparation.js';
import {
  THERMAL_GATE,
  checkLabThermalHeadroom,
  holdLabBenchmarkHosts,
  measureLoadGeneratorRequirement,
  plannedLabLocks,
  readLabHolderRecords,
  releaseLabBenchmarkHosts,
  selectLabBenchmarkHosts,
  selectSingleLabBenchmarkHost,
} from '../../../test/distributed/harness/comparative-benchmark-lab-hosts.js';
import {
  createRemoteWorkloadRunner,
  createWorkloadRunExecutor,
  prepareLoadGeneratorCheckout,
} from '../../../test/distributed/harness/comparative-benchmark-workload-call-site.js';
import {
  comparativeProvisioningPlan,
  harnessCommitPusher,
  provisionComparativeHosts,
  readReferenceClientLock,
} from '../../../test/distributed/harness/comparative-benchmark-provisioning.js';
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
  POSTGRES_IMAGE_DEFAULT,
  TARGET_DATA_HOSTS,
  deployComparativeTarget,
  teardownCampaignDeployment,
} from '../../../test/distributed/harness/real-product-cluster-deployers.js';
import {
  collectContainerLogs,
} from '../../../test/distributed/harness/real-product-campaign-cleanup.js';
import {
  DECLARED_HOST_IDENTITY,
  EVIDENCE_USE,
  EVIDENCE_USE_NOTE,
  INTER_NODE_PATH,
  NODE_COUNT,
  SUBSTRATE_KIND,
} from '../../../test/distributed/harness/raw-observation-research-fields.js';
import {
  measureRoundTripMatrix,
  nodeNamespaceShell,
} from '../../../test/distributed/harness/real-product-network-impairment.js';
import {
  DEFAULT_INSPECT_TIMEOUT_MS,
  DEPLOYMENT_FAILURE,
  deploymentFailure,
  isDeploymentFailure,
  stripTransientExecutionOptions,
} from '../../../test/distributed/harness/real-product-deployment-contract.js';
import {
  createSshCommandRunner,
  sshOptions,
} from '../../../test/distributed/harness/real-product-remote-shell.js';
import {
  planLagrangeNodePlacement,
  resolveLagrangeContainerImage,
} from '../../../test/distributed/harness/real-product-deployer-lagrange.js';
import {
  observeProductsAfterWindow,
} from '../../../test/distributed/harness/real-product-identity.js';
import {measureCheckoutSourceFingerprint} from '../../../src/diagnostics/runtime-content-fingerprint.js';
import {localRevisionSourceFingerprint, productCommitProvenance} from
  '../../../test/distributed/harness/comparative-benchmark-revision-source.js';
import {GIT_OUTPUT_BOUND, execGit} from '../../../scripts/checks/git-invocation.js';
import {discoverFleet, fleetRequirement} from '../../../scripts/lab/probe.js';
import {loadState, selectNodesByRole} from '../../../scripts/lab/state.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TARGET = Object.freeze({LAB: 'lab', GCP: 'gcp'});
const PROFILES = Object.freeze({smoke: COMPARATIVE_SMOKE_PROFILE,
  capacity: COMPARATIVE_CAPACITY_PROFILE, research: COMPARATIVE_RESEARCH_PROFILE});
const RESEARCH_PROFILE = 'research';
const RUNG_USE = Object.freeze({[SUBSTRATE_KIND.SINGLE_HOST]: EVIDENCE_USE.FIRST_LOOK,
  [SUBSTRATE_KIND.MULTI_HOST]: EVIDENCE_USE.WORKING, [SUBSTRATE_KIND.GCP]: EVIDENCE_USE.FINAL});
const RESEARCH_NOT_ADMISSIBLE = 'research: not admissible, published store refused';
const RESEARCH_PRODUCT_NOTE = '; a run whose product commit differs from the harness commit ' +
  'is research only';
const researchAdmissionNote = (manifest) => manifest.plan.product ?
  `${RESEARCH_NOT_ADMISSIBLE}${RESEARCH_PRODUCT_NOTE}` : RESEARCH_NOT_ADMISSIBLE;
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
  --load-generator <name>       lab only: the registered harness host that runs the
                                workload; refused, never substituted, if ineligible
                                (default: chosen after the data hosts)
  --hosts <ip,...>              gcp only: 3 data hosts first, load generator last
  --ssh-hosts <ip,...>          gcp only: external SSH addresses matching --hosts
  --ssh-user <user>             gcp only: SSH user (default: $SSH_USER)
  --ssh-key <path>              gcp only: SSH private key
  --client-checkout <path>      gcp only: checkout on the load generator, at this commit
  --client-node <path>          gcp only: Node >= 22 on the load generator (default: node)
  --vm-image-family <f>, --vm-image-project <p>, --vm-boot-disk-size <s>,
  --vm-boot-disk-type <t>, --vm-firewall-allow <rules>
                                with --provision, all required: how the hosts were
                                created (provision-gcp.sh prints each); recorded per host
  --provision                   gcp only: place every image each role runs, the harness
                                commit in --client-checkout (absolute) and the reference
                                client's npm cache, verify them, and exit (no campaign)
  --targets <a,b,...>           ${Object.values(COMPARATIVE_TARGET).join(', ')}
                                (default: ${DEFAULT_TARGETS.join(',')})
  --profile <smoke|capacity|research>
                                smoke (default): one run per arm, not a comparison;
                                capacity: the counter-balanced paired sweep;
                                research: one run per target on a fresh deployment,
                                never admissible, never in the published store;
                                needs --storage-root and a passed semantic gate
  --substrate <kind>            research only, lab: lab-multi-host (default; three
                                separate lab hosts, one node each, the load generator
                                on a fourth machine) or lab-single-host (a first look:
                                three nodes on one lab host on a campaign Docker
                                bridge, the load generator on that host; needs
                                --single-host). --execution-target gcp is gcp-same-zone.
  --single-host <name>          with --substrate lab-single-host: the registered lab host
  --formation-wait-seconds <n>  research only: the formation readiness deadline of the plan, in
                                whole seconds, 1 to 1800 (default: the shared comparative
                                deadline); recorded in the manifest and each run
  --product-commit <sha>        research only: the full 40-hex commit of the product source
                                the image under test was built from (default: the harness
                                checkout); its source fingerprint and version become the
                                expectation, the booted fingerprint must still match it
                                exactly; refused with --lagrange-version, --lagrange-revision
                                and --lagrange-src-fingerprint
  --campaign-id <id>            Campaign id (default: generated)
  --storage-root <path>         Host directory for product data volumes; without it
                                data lives in the container layer (smoke only)
  --lagrange-image <ref>        Lagrange image (default: ${LAGRANGE_IMAGE_DEFAULT});
                                publishable runs need repo@sha256:<digest>
  --lagrange-image-content <sha256>
                                SHA256 of the ordered RootFS diff_ids. At least one data
                                host must resolve --lagrange-image. Every host must hold
                                that exact image config and match the layer digest.
  --lagrange-version <v>        Product version the image must report (needed for a digest)
  --lagrange-revision <sha>     org.opencontainers.image.revision the image must carry
  --raw-observations <path>     Append-only record store
                                (default: ${DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH};
                                research: test-output/research-sessions/<campaign-id>/
                                raw-observations.ndjson)
  --output <path>               Campaign summary JSON
  --lock-wait-minutes <n>       Bounded wait for each lab host lock (default: 30)
  --dry-run                     Print the manifest and the hosts it would lock (lab: the
                                fleet is discovered as for a live run)
  --from-recorded-facts         With --dry-run: plan from the inventory's recorded facts,
                                without probing the fleet
  --help                        Show this help
`;

class UsageError extends Error {}

const LOAD_GENERATOR_FLAG = '--load-generator';
// How the GCP hosts were created; --provision records them for every host.
const VM_FLAGS = Object.freeze([['--vm-image-family', 'vmImageFamily'],
  ['--vm-image-project', 'vmImageProject'], ['--vm-boot-disk-size', 'vmBootDiskSize'],
  ['--vm-boot-disk-type', 'vmBootDiskType'], ['--vm-firewall-allow', 'vmFirewallAllow']]);

const VALUE_FLAGS = Object.freeze({
  '--execution-target': 'executionTarget', '--hosts': 'hostsRaw',
  '--ssh-hosts': 'sshHostsRaw', '--ssh-user': 'sshUser', '--ssh-key': 'sshKey',
  '--targets': 'targetsRaw', '--profile': 'profile', '--substrate': 'substrate',
  '--single-host': 'singleHostName', '--product-commit': 'productCommit',
  '--formation-wait-seconds': 'formationWaitRaw', '--campaign-id': 'campaignId',
  '--storage-root': 'storageRoot', '--lagrange-image': 'lagrangeImage',
  '--raw-observations': 'rawObservationsPath', '--output': 'outputPath',
  '--lock-wait-minutes': 'lockWaitMinutes', '--client-checkout': 'clientCheckout',
  [LOAD_GENERATOR_FLAG]: 'loadGeneratorName', '--client-node': 'clientNode',
  '--lagrange-version': 'lagrangeVersion',
  '--lagrange-image-digest': 'lagrangeImageDigest',
  '--lagrange-image-content': 'lagrangeImageContent',
  '--lagrange-revision': 'lagrangeRevision',
  '--vm-image-family': 'vmImageFamily', '--vm-image-project': 'vmImageProject',
  '--vm-boot-disk-size': 'vmBootDiskSize', '--vm-boot-disk-type': 'vmBootDiskType',
  '--vm-firewall-allow': 'vmFirewallAllow',
  '--lagrange-src-fingerprint': 'lagrangeSrcFingerprint',
});

function list(text) {
  return String(text || '').split(',').map((part) => part.trim()).filter(Boolean);
}

function generatedCampaignId() {
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\..*$/u, 'Z');
  return `bench-${stamp}-${randomBytes(3).toString('hex')}`;
}

const BOOLEAN_FLAGS = Object.freeze({
  '--help': 'help', '-h': 'help', '--dry-run': 'dryRun',
  '--from-recorded-facts': 'fromRecordedFacts', '--provision': 'provision',
});

function validateCliOptions(opts) {
  if (!Object.values(TARGET).includes(opts.executionTarget)) {
    throw new UsageError(`--execution-target must be lab or gcp, got ${opts.executionTarget}`);
  }
  if (opts.executionTarget === TARGET.LAB && (opts.hostsRaw || opts.sshHostsRaw)) {
    throw new UsageError('lab hosts come from the registered lab inventory ' +
      '(node scripts/lab.js); --hosts/--ssh-hosts are for --execution-target gcp');
  }
  if (opts.executionTarget !== TARGET.LAB && opts.loadGeneratorName !== null) {
    throw new UsageError('--load-generator is only for --execution-target lab');
  }
  if (opts.loadGeneratorName !== null && !/^[^\s-]\S*$/u.test(opts.loadGeneratorName)) {
    throw new UsageError('--load-generator needs a registered lab host name, got ' +
      JSON.stringify(opts.loadGeneratorName));
  }
  if (!PROFILES[opts.profile]) throw new UsageError(`unknown profile ${opts.profile}`);
  validateSubstrateOptions(opts);
  if (opts.profile === RESEARCH_PROFILE && opts.targetsRaw !== COMPARATIVE_TARGET.LAGRANGE) {
    throw new UsageError('--profile research measures one product: --targets lagrange');
  }
  if (opts.profile === RESEARCH_PROFILE && !opts.storageRoot) {
    throw new UsageError('--profile research needs --storage-root: the durability proof of the ' +
      'semantic gate needs storage that survives its container');
  }
  if (opts.provision) validateProvisionOptions(opts);
}

// The substrate of a research campaign names its rung of the ladder; no other
// profile has one. The GCP target is the final-verification rung.
function validateSubstrateOptions(opts) {
  if (opts.profile !== RESEARCH_PROFILE) {
    if (opts.substrate || opts.singleHostName || opts.formationWaitRaw || opts.productCommit) {
      throw new UsageError('--substrate, --single-host, --formation-wait-seconds and ' +
        '--product-commit are only for --profile research');
    }
    return;
  }
  if (opts.productCommit && (opts.lagrangeVersion || opts.lagrangeRevision ||
      opts.lagrangeSrcFingerprint)) {
    throw new UsageError('--product-commit is the one source of the expected version, revision ' +
      'and source fingerprint: not with --lagrange-version, --lagrange-revision or ' +
      '--lagrange-src-fingerprint');
  }
  const gcp = opts.executionTarget === TARGET.GCP;
  const rung = opts.substrate || (gcp ? SUBSTRATE_KIND.GCP : SUBSTRATE_KIND.MULTI_HOST);
  const allowed = gcp ? [SUBSTRATE_KIND.GCP] : [SUBSTRATE_KIND.MULTI_HOST,
    SUBSTRATE_KIND.SINGLE_HOST];
  if (!allowed.includes(rung)) {
    throw new UsageError(`--substrate ${rung} is not a substrate of --execution-target ` +
      `${opts.executionTarget} (${allowed.join(', ')})`);
  }
  if ((rung === SUBSTRATE_KIND.SINGLE_HOST) !== Boolean(opts.singleHostName)) {
    throw new UsageError('--single-host <name> goes with --substrate lab-single-host, and only ' +
      'with it');
  }
  opts.substrate = rung;
  if (opts.formationWaitRaw !== '') {
    try {
      opts.profileOverride = researchProfileWithFormationWait(Number(opts.formationWaitRaw));
    } catch (error) {
      throw new UsageError(`--formation-wait-seconds: ${error.message}`);
    }
  }
}

function validateProvisionOptions(opts) {
  if (opts.executionTarget !== TARGET.GCP) {
    throw new UsageError('--provision is only for --execution-target gcp (lab hosts are ' +
      'provisioned through the lab controller)');
  }
  if (opts.dryRun) throw new UsageError('--provision and --dry-run are separate invocations');
  const missing = VM_FLAGS.filter(([, key]) => !opts[key]).map(([flag]) => flag);
  if (missing.length > 0) {
    throw new UsageError(`--provision needs ${missing.join(', ')} (how the hosts were created, ` +
      'as the create step printed), recorded for every host');
  }
  if (!path.isAbsolute(opts.clientCheckout)) {
    throw new UsageError('--provision needs --client-checkout <absolute path> on the load ' +
      'generator');
  }
}

// Two explicit load generators are ambiguous operator intent, never "the last one".
function rejectRepeatedLoadGenerator(argv) {
  if (argv.filter((arg) => arg === LOAD_GENERATOR_FLAG).length > 1) {
    throw new UsageError(`${LOAD_GENERATOR_FLAG} may be given once`);
  }
}

function parseCliArgs(argv, env) {
  rejectRepeatedLoadGenerator(argv);
  const opts = {executionTarget: env.EXECUTION_TARGET || TARGET.LAB, hostsRaw: '',
    sshHostsRaw: '', sshUser: env.SSH_USER || '', sshKey: env.SSH_KEY || '',
    targetsRaw: '', profile: 'smoke', campaignId: '',
    storageRoot: '', lagrangeImage: LAGRANGE_IMAGE_DEFAULT,
    rawObservationsPath: '', outputPath: '',
    lockWaitMinutes: String(DEFAULT_LOCK_WAIT_MINUTES), clientCheckout: '', clientNode: 'node',
    loadGeneratorName: null, substrate: '', singleHostName: '', formationWaitRaw: '', productCommit: '', dryRun: false, provision: false, help: false};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (BOOLEAN_FLAGS[arg]) opts[BOOLEAN_FLAGS[arg]] = true;
    else if (VALUE_FLAGS[arg] && argv[index + 1] !== undefined) {
      opts[VALUE_FLAGS[arg]] = argv[index + 1];
      index += 1;
    } else throw new UsageError(`unknown or incomplete option ${arg}`);
  }
  opts.targetsRaw = opts.targetsRaw || (opts.profile === RESEARCH_PROFILE ?
    COMPARATIVE_TARGET.LAGRANGE : DEFAULT_TARGETS.join(','));
  validateCliOptions(opts);
  opts.campaignId = opts.campaignId || generatedCampaignId();
  opts.rawObservationsPath = opts.rawObservationsPath || (opts.profile === RESEARCH_PROFILE ?
    `test-output/research-sessions/${opts.campaignId}/raw-observations.ndjson` :
    DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH);
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
  return createSshCommandRunner({hosts, opts, defaultTimeoutMs: SSH_TIMEOUT_MS,
    maxBuffer: SSH_MAX_BUFFER});
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

async function runCampaign({opts, manifest, hosts, physicalExtras}) {
  if (manifest.targets.includes(COMPARATIVE_TARGET.LAGRANGE)) {
    opts.lagrangeImage = resolveLagrangeContainerImage(opts);
  }
  const sshRun = createSshRun(hosts, opts);
  const facts = await collectHostFacts({hosts, sshRun, opts, substrate: opts.substrate});
  const physicalHosts = facts.map((fact, index) => ({...fact, name: hosts[index].name,
    role: hosts[index].role, ...(physicalExtras[hosts[index].name] || {})}));
  const pinned = opts.lagrangeImageContent ? await resolvePinnedImage({
    hosts: hosts.filter((host) => host.role === 'data'),
    contentIdentity: opts.lagrangeImageContent, registryRef: opts.lagrangeImage, sshRun,
    opts}) : null;
  const images = campaignImagesByRole({targets: manifest.targets,
    lagrangeImage: opts.lagrangeImage});
  await ensureProductImages({hosts: hosts.filter((host) => host.role === 'data'), role: 'data',
    sshRun, opts,
    images: images.data.filter((image) => !(pinned && image === opts.lagrangeImage))});
  await ensureProductImages({hosts: hosts.filter((host) => host.role === 'client'),
    role: 'client', sshRun, opts, images: images.client});
  const recordOwner = await loadRawObservationRecordOwner();
  const client = hosts.find((host) => host.role === 'client');
  if (!client.repoPath || !client.nodePath) {
    throw new UsageError('the load generator needs a checkout at the harness commit: ' +
      'lab hosts record one; for gcp pass --client-checkout <path>');
  }
  const harness = await harnessIdentity(manifest);
  // The CLI runs from a worktree of the load generator's checkout at the
  // harness commit; the checkout itself is never moved.
  const loadGenerator = await prepareLoadGeneratorCheckout({sshRun, opts, host: client,
    harnessCommit: harness.gitCommit, campaignId: manifest.campaignId});
  // The worktree's removal is part of the campaign's closure: a failure is
  // recorded in the summary (or on the campaign's own error), never swallowed.
  let summary;
  try {
    summary = await runPreparedCampaign({opts, manifest, hosts, sshRun, facts, physicalHosts,
      pinned, recordOwner, client, harness, loadGeneratorHost: loadGenerator.host});
  } catch (error) {
    throw Object.assign(error, {loadGeneratorWorktree: await loadGenerator.release()});
  }
  return {...summary, closure: {loadGeneratorWorktree: await loadGenerator.release()}};
}

function recordPendingStorageSubdir(pendingStorageByHost, hosts, subDir) {
  if (!subDir) return;
  for (const hostIp of hosts) {
    let set = pendingStorageByHost.get(hostIp);
    if (!set) {
      set = new Set();
      pendingStorageByHost.set(hostIp, set);
    }
    set.add(subDir);
  }
}

const SEMVER_IMAGE_TAG_PATTERN = /:(\d+\.\d+\.\d+)$/u;
const SOURCE_FINGERPRINT_PATTERN = /^(?:sha256:[0-9a-f]{4,64}|[0-9a-f]{16,64})$/u;

async function resolveCheckoutLagrangeProvenance(opts, manifest, product) {
  // A research plan that declares its product source expects that commit's tree.
  if (product) {
    return {lagrangeVersion: product.version,
      lagrangeSrcFingerprint: product.sourceFingerprintExpected,
      productCommit: product.declaredCommit};
  }
  if (!manifest.targets.includes(COMPARATIVE_TARGET.LAGRANGE)) {
    return {lagrangeVersion: opts.lagrangeVersion || null,
      lagrangeSrcFingerprint: opts.lagrangeSrcFingerprint || null};
  }
  const tagMatch = SEMVER_IMAGE_TAG_PATTERN.exec(String(opts.lagrangeImage || ''));
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const lagrangeVersion = opts.lagrangeVersion || (tagMatch ? tagMatch[1] : pkg.version) || null;
  const lagrangeSrcFingerprint = opts.lagrangeSrcFingerprint ||
    await measureCheckoutSourceFingerprint(REPO_ROOT);
  if (!lagrangeVersion || !SOURCE_FINGERPRINT_PATTERN.test(String(lagrangeSrcFingerprint || ''))) {
    throw deploymentFailure(
      DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      'Lagrange campaign requires verified checkout version and source fingerprint provenance',
      {lagrangeVersion, lagrangeSrcFingerprint},
    );
  }
  if (opts.lagrangeRevision) {
    const revisionFingerprint = localRevisionSourceFingerprint(REPO_ROOT, opts.lagrangeRevision);
    if (revisionFingerprint ? revisionFingerprint !== lagrangeSrcFingerprint :
      !opts.lagrangeSrcFingerprint) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
        revisionFingerprint ? 'requested image revision contradicts expected source fingerprint' :
          'external image revision requires an explicit source fingerprint',
        {revision: opts.lagrangeRevision, revisionFingerprint, lagrangeSrcFingerprint});
    }
  }
  return {lagrangeVersion, lagrangeSrcFingerprint};
}

// The research campaign's substrate descriptor from the observed host facts.
async function describeSubstrate({opts, hosts, facts, sshRun}) {
  const single = opts.substrate === SUBSTRATE_KIND.SINGLE_HOST;
  const dataFacts = facts.filter((fact, index) => hosts[index].role === 'data');
  const clientFact = facts[hosts.findIndex((host) => host.role === 'client')];
  const linkTypes = await observeLinkTypes({facts: dataFacts, sshRun, opts});
  const placed = single ? Array.from({length: NODE_COUNT}, () => dataFacts[0]) : dataFacts;
  // The declared identity of each node, from the one placement owner.
  const plan = planLagrangeNodePlacement({hosts: placed.map((fact) => fact.ip),
    substrate: opts.substrate, campaignId: opts.campaignId});
  return buildSubstrateDescriptor({kind: opts.substrate,
    interNodePath: single ? INTER_NODE_PATH.BRIDGE : (opts.substrate === SUBSTRATE_KIND.GCP ?
      INTER_NODE_PATH.VPC : INTER_NODE_PATH.LAN),
    hosts: dataFacts.map((fact, index) => ({hostId: fact.hostId, ip: fact.ip,
      bootId: fact.bootId, cpus: fact.cpus, memGb: fact.memGb, primaryIface: fact.primaryIface,
      linkType: linkTypes[index]})),
    loadGeneratorHostId: clientFact.hostId,
    nodeHostMap: placed.map((fact, nodeIndex) => ({nodeIndex, hostId: fact.hostId,
      declaredHostId: plan.nodes[nodeIndex].declaredHostId ?? fact.hostname,
      machineHostName: fact.hostname, declaredHostIdentity: plan.declaredHostIdentity})),
    declaredHostCount: plan.declaredHostCount,
    storage: {root: opts.storageRoot, kind: 'bind'}});
}

// The round-trip matrix of a deployed research cluster: its nodes' addresses and the
// load generator to the endpoint; on the bridge the pairs are measured from inside
// the node's own network namespace (a campaign-labelled helper container).
function roundTripMeasurer({opts, manifest, sshRun, client, parallel = false}) {
  const single = opts.substrate === SUBSTRATE_KIND.SINGLE_HOST;
  return async ({deployment}) => {
    const nodes = deployment.roles.filter((role) => role.role === 'lagrange-node');
    const roleOf = new Map(nodes.map((role) => [role.address, role]));
    return measureRoundTripMatrix({dataHosts: nodes.map((role) => role.address),
      loadGenerator: client.ip, endpointHost: deployment.endpoint.host, sshRun, opts, parallel,
      shellOf: single ? (address) => nodeNamespaceShell({campaignId: manifest.campaignId,
        image: POSTGRES_IMAGE_DEFAULT, host: roleOf.get(address).host,
        containerId: roleOf.get(address).containerId}) : () => null});
  };
}

async function runPreparedCampaign({opts, manifest, hosts, sshRun, facts, physicalHosts,
  pinned, recordOwner, client, harness, loadGeneratorHost}) {
  const dataIps = hosts.filter((host) => host.role === 'data').map((host) => host.ip);
  const single = opts.substrate === SUBSTRATE_KIND.SINGLE_HOST;
  // The first look places all three nodes on its one host.
  const nodeIps = single ? Array.from({length: NODE_COUNT}, () => dataIps[0]) : dataIps;
  const substrate = manifest.plan.profileClass === RESEARCH_PROFILE ?
    await describeSubstrate({opts, hosts, facts, sshRun}) : null;
  // The semantic proof journey runs here, on the controller; PostgreSQL admits
  // the controller's address (as the data host sees it) next to the load generator.
  const controllerIp = (await sshRun(dataIps[0], opts, 'echo "${SSH_CLIENT%% *}"')).trim();
  const deployOpts = {executionTarget: opts.executionTarget,
    lagrangeImage: opts.lagrangeImage, lagrangeImageDigest: opts.lagrangeImageDigest || null,
    storageRoot: opts.storageRoot || null,
    lagrangeVersion: opts.lagrangeVersion,
    lagrangeRevision: opts.lagrangeRevision || null,
    productCommit: opts.productCommit || null,
    lagrangeImageContent: opts.lagrangeImageContent || null,
    lagrangeSrcFingerprint: opts.lagrangeSrcFingerprint,
    lagrangeImageByHost: pinned ? Object.fromEntries(Object.entries(pinned).map(
      ([ip, entry]) => [ip, entry.runRef])) : null,
    substrate: opts.substrate || null,
    // A research plan declares its formation wait; the one readiness owner takes it.
    ...(manifest.plan.formationWaitSeconds === undefined ? {} :
      {readiness: researchReadinessBudget(manifest.plan.formationWaitSeconds)}),
    proofClientIps: controllerIp ? [controllerIp] : []};
  const evidenceDir = campaignEvidenceDirOf({rootDir: REPO_ROOT,
    profileClass: manifest.plan.profileClass, rawObservationsPath: opts.rawObservationsPath,
    campaignId: manifest.campaignId});
  // What the network looked like right after the containers started, kept per run even if
  // the formation then fails (the seed node stands for the endpoint, which is not yet bound).
  const atDeployment = new Map();
  const roundTrip = substrate ? roundTripMeasurer({opts, manifest, sshRun, client}) : null;
  const roundTripBesideFormation = substrate ?
    roundTripMeasurer({opts, manifest, sshRun, client, parallel: true}) : null;
  const measureAtDeployment = (run, roles) => beginDeploymentRoundTrip(atDeployment, run.runId,
    () => roundTripBesideFormation({deployment: {roles, endpoint: {host: roles[0].address}}}));
  const recordWriter = createCampaignRecordWriter({rootDir: REPO_ROOT,
    file: opts.rawObservationsPath, profileClass: manifest.plan.profileClass});
  let deploymentSeq = 0;
  const pendingStorageByHost = new Map();
  const deployArm = (run, {signal = null, deadlineAtMs = null} = {}) => {
    deploymentSeq += 1;
    const subDir = opts.storageRoot ? `${run.runId}-d${deploymentSeq}` : null;
    const targetHostCount = TARGET_DATA_HOSTS[run.targetId] ?? dataIps.length;
    recordPendingStorageSubdir(pendingStorageByHost, dataIps.slice(0, targetHostCount), subDir);
    const cleanOpts = stripTransientExecutionOptions({
      ...deployOpts,
      ...(subDir ? {storageRoot: `${opts.storageRoot}/${subDir}`} : {}),
    });
    return deployComparativeTarget(run.targetId, {
      hosts: nodeIps,
      clientIp: client.ip,
      sshRun,
      opts: cleanOpts,
      signal,
      deadlineAtMs,
      campaignId: manifest.campaignId,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ...(substrate ? {onNodesStarted: ({roles}) => measureAtDeployment(run, roles)} : {}),
    });
  };
  const teardown = async () => teardownCampaignDeployment({
    hosts: hosts.map((host) => host.ip),
    campaignId: manifest.campaignId,
    campaignNetwork: single,
    storageRoot: opts.storageRoot,
    pendingStorageByHost,
    sshRun,
    opts,
  });
  const semanticGate = createSemanticGateStage({journey: runScenarioASemanticProofJourney,
    sshRun, opts, loadGeneratorHost, now: Date.now,
    redeploy: async (run, {signal = null, deadlineAtMs = null} = {}) => {
      const closed = await teardown();
      if (!closed.complete) {
        const message = closed.containersClosed === false ?
          'cannot redeploy while prior campaign containers remain unclosed' :
          'cannot redeploy while prior campaign storage cleanup is incomplete';
        throw deploymentFailure(
          DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED,
          message,
          {closure: closed},
        );
      }
      return deployArm(run, {signal, deadlineAtMs});
    },
    evidenceDirOf: (run) => path.resolve(REPO_ROOT,
      `test-output/bench/${manifest.campaignId}/${run.runId}/semantic-gate`)});
  const deps = {
    runSemanticGate: ({run, manifest, deployment, signal, deadlineAtMs, deadlineAt}) =>
      semanticGate({
        run,
        manifest,
        deployment,
        signal,
        deadlineAtMs: deadlineAtMs ?? deadlineAt ?? deps.deadlineAt,
      }),
    recordOwner,
    now: Date.now,
    deadlineAt: Date.now() + manifest.campaignBudgetMinutes * MS_PER_MINUTE,
    deployRun: deployArm,
    executeWorkloadRun: (() => {
      const remoteRunner = createRemoteWorkloadRunner({
        sshRun,
        opts,
        host: loadGeneratorHost,
        harnessCommit: harness.gitCommit,
        campaignId: manifest.campaignId,
        // The retained statement files of every run come into the campaign evidence.
        campaignEvidenceDir: evidenceDir,
      });
      return createWorkloadRunExecutor({
        clientHost: client.ip,
        colocationAllowed: single,
        runWorkload: (request, run, callOpts = {}) => remoteRunner(request, run, callOpts),
        evidenceDirOf: (run) =>
          `test-output/bench/${manifest.campaignId}/${run.runId}/evidence`,
        describeLoadGenerator: () => describeLoadGenerator({
          host: client,
          hostFacts: facts[hosts.indexOf(client)],
        }),
      });
    })(),
    inspectProducts: (deployment) => observeProductsAfterWindow({
      sshRun,
      opts,
      products: deployment.identity.products,
      timeoutMs: DEFAULT_INSPECT_TIMEOUT_MS,
    }),
    teardownRun: teardown,
    appendRecords: (records) => recordWriter.appendRecords(records),
    ...(substrate ? {measureRoundTrip: roundTrip,
      deploymentRoundTrip: (run) => atDeployment.get(run.runId) ?? null,
      // A failed formation keeps what its nodes logged, collected before teardown.
      collectNodeLogs: async ({run, deployment}) => ({nodeLogs: await collectContainerLogs({
        containers: (deployment?.roles ?? []).filter((role) => role.role === 'lagrange-node'),
        runId: run.runId, evidenceDir, sshRun, opts})})} : {}),
  };
  // A signal stops issuing new runs; the run in flight finishes its teardown.
  const stop = () => {
    deps.deadlineAt = 0;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const summary = await runComparativeCampaign({manifest,
      header: {executionTarget: opts.executionTarget, physicalHosts, harness,
        ...(substrate ? {substrate} : {}),
        ...(manifest.plan.product ? {product: {...manifest.plan.product,
          harnessCommit: harness.gitCommit}} : {})}, deps});
    const {header: _header, records: _records, ...rest} = summary;
    if (manifest.plan.profileClass === RESEARCH_PROFILE) {
      // The exit code of a research campaign comes from its runs: admission has
      // no claim to read (the explicit reason, the store refusal).
      return {...rest, admission: {status: 'not-admissible', note: researchAdmissionNote(manifest)},
        substrate: {kind: substrate.kind, evidenceUse: substrate.evidenceUse,
          declaredHostIdentity: substrate.declaredHostIdentity, note: substrate.note},
        exitCode: summary.exitCode};
    }
    const admitted = recordOwner.campaignOutcome({header: summary.header,
      runs: summary.records, file: opts.rawObservationsPath, rootDir: REPO_ROOT, manifest});
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

// The explicit GCP provisioning step: what the campaign with these options will
// check for, placed and verified on its hosts. The harness commit is the
// controller's HEAD (the commit the campaign records), pushed over the same ssh.
async function provisionGcpHosts({opts, manifest, dataHostCount}) {
  const hosts = gcpHosts(opts, dataHostCount);
  if (manifest.targets.includes(COMPARATIVE_TARGET.LAGRANGE)) {
    opts.lagrangeImage = resolveLagrangeContainerImage(opts);
  }
  // The same harness identity the campaign records (awaited, as runCampaign does).
  const {gitCommit} = await harnessIdentity(manifest);
  const plan = comparativeProvisioningPlan({targets: manifest.targets,
    lagrangeImage: opts.lagrangeImage, harnessCommit: gitCommit,
    referenceClientLock: readReferenceClientLock(REPO_ROOT, gitCommit),
    vm: {imageFamily: opts.vmImageFamily, imageProject: opts.vmImageProject,
      bootDiskSize: opts.vmBootDiskSize, bootDiskType: opts.vmBootDiskType,
      firewallAllow: opts.vmFirewallAllow},
    nodeMinimum: fleetRequirement(REPO_ROOT, gitCommit).nodeMinimum});
  return provisionComparativeHosts({hosts, plan, sshRun: createSshRun(hosts, opts), opts,
    pushHarnessCommit: harnessCommitPusher({controllerRoot: REPO_ROOT,
      sshCommand: ['ssh', ...sshOptions(opts)]})});
}

// The lab hosts a campaign runs on: the named single host (as data host and as
// load generator) for the first look, the usual selection otherwise.
function selectCampaignLabHosts({opts, state, fleet, dataHostCount, requirement,
  loadGeneratorRequirement}) {
  return opts.substrate === SUBSTRATE_KIND.SINGLE_HOST ?
    selectSingleLabBenchmarkHost({state, fleet, hostName: opts.singleHostName,
      nodeMinimum: requirement.nodeMinimum, loadGeneratorRequirement}) :
    selectLabBenchmarkHosts({state, fleet, dataHostCount, nodeMinimum: requirement.nodeMinimum,
      loadGeneratorRequirement, loadGeneratorName: opts.loadGeneratorName});
}

// One entry per machine: the first look names its host twice (data and load generator).
function distinctHosts(hosts) {
  return hosts.filter((host, index) => hosts.findIndex((one) => one.name === host.name) === index);
}

async function runLabCampaign({opts, manifest, dataHostCount}) {
  const state = await loadState({allowMissing: false});
  const {requirement, fleet} = await discoverLabFleet(state);
  // Measured now, from the tree the load generator will check out; recorded
  // with the load generator in the campaign header.
  const loadGeneratorRequirement = measureLoadGeneratorRequirement(REPO_ROOT);
  const hosts = selectCampaignLabHosts({opts, state, fleet, dataHostCount, requirement,
    loadGeneratorRequirement});
  const budgetMs = manifest.campaignBudgetMinutes * MS_PER_MINUTE;
  const sessions = await holdLabBenchmarkHosts({hosts: distinctHosts(hosts),
    campaignId: manifest.campaignId,
    waitMs: Number(opts.lockWaitMinutes) * MS_PER_MINUTE, expectedMs: budgetMs});
  try {
    const sshRun = createSshRun(hosts, opts);
    const held = distinctHosts(hosts);
    const thermal = await checkLabThermalHeadroom({hosts: held, sshRun, opts});
    const holders = await readLabHolderRecords({hosts: held, sshRun, opts});
    const extras = Object.fromEntries(held.map((host) => [host.name,
      {lab: {holder: holders[host.name], thermal: thermal[host.name],
        ...(host.role === 'client' ? {loadGeneratorDiskRequirement: loadGeneratorRequirement} :
          {})}}]));
    return await runCampaign({opts, manifest, hosts, physicalExtras: extras});
  } finally {
    await releaseLabBenchmarkHosts(sessions);
  }
}

// The fleet's current facts through the lab owner's discovery (read-only).
async function discoverLabFleet(state) {
  const requirement = fleetRequirement(REPO_ROOT);
  return {requirement, fleet: await discoverFleet({nodes: selectNodesByRole(state, HARNESS_ROLE),
    controllerRepoPath: REPO_ROOT, lockGraphSha256: requirement.lockGraphSha256,
    nodeMinimum: requirement.nodeMinimum})};
}

// What the dry run says of a research campaign's rung: the kind, what its evidence
// may be used for and which host plays which role.
function dryRunSubstrate(opts, hosts) {
  const use = RUNG_USE[opts.substrate];
  return {kind: opts.substrate, evidenceUse: use, note: EVIDENCE_USE_NOTE[use],
    declaredHostIdentity: opts.substrate === SUBSTRATE_KIND.SINGLE_HOST ?
      DECLARED_HOST_IDENTITY.SYNTHETIC : DECLARED_HOST_IDENTITY.OBSERVED,
    hostRoles: hosts.map(({name, ip, role}) => ({name, ip, role}))};
}

async function dryRunPlan({opts, manifest, dataHostCount}) {
  const lab = opts.executionTarget === TARGET.LAB;
  let hosts;
  let loadGeneratorRequirement = null;
  if (lab) {
    const state = await loadState({allowMissing: false});
    const {requirement, fleet} = opts.fromRecordedFacts ?
      {requirement: fleetRequirement(REPO_ROOT), fleet: null} : await discoverLabFleet(state);
    loadGeneratorRequirement = measureLoadGeneratorRequirement(REPO_ROOT);
    hosts = selectCampaignLabHosts({opts, state, fleet, dataHostCount, requirement,
      loadGeneratorRequirement});
  } else {
    hosts = gcpHosts(opts, dataHostCount);
  }
  const research = manifest.plan.profileClass === RESEARCH_PROFILE;
  return {schema: PLAN_SCHEMA, executionTarget: opts.executionTarget,
    campaignId: manifest.campaignId, manifestDigest: manifest.manifestDigest,
    rawObservationsPath: opts.rawObservationsPath,
    ...(research ? {admission: {status: 'not-admissible', note: researchAdmissionNote(manifest)},
      storageRoot: opts.storageRoot, substrate: dryRunSubstrate(opts, hosts),
      formationWaitSeconds: manifest.plan.formationWaitSeconds,
      ...(manifest.plan.product ? {product: manifest.plan.product} : {})} : {}),
    hostSource: lab ? `registered lab inventory (${opts.fromRecordedFacts ?
      'recorded facts' : 'facts discovered now'})` :
      '--hosts (no infrastructure is created)',
    ...(lab ? {labHosts: hosts.map(({name, ip, role, lock}) => ({name, ip, role, lock}))} :
      {hosts: hosts.map(({ip, sshTarget, role}) => ({ip, sshTarget, role}))}),
    wouldLock: lab ? plannedLabLocks(hosts, manifest.campaignId) : [],
    thermalGate: lab ? THERMAL_GATE : null,
    loadGeneratorRequirement,
    manifest};
}

function shouldRegenerateCanonicalBenchmarkArtifacts(opts, summary) {
  return Array.isArray(summary?.attempted) && summary.attempted.length > 0 &&
    path.resolve(REPO_ROOT, opts.rawObservationsPath) ===
      path.resolve(REPO_ROOT, DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH);
}

const INV_ID_PAD = 4;

function supersedePriorCampaignRuns(rootDir, currentCampaignId) {
  const raw = readRawObservationSources(rootDir);
  const ledger = readInvalidationLedger(rootDir);
  const newRuns = raw.runs.filter((e) => e.run?.campaignId === currentCampaignId);
  if (newRuns.length === 0) return;
  const newClaimPairs = new Set(newRuns.map((e) => `${e.run.targetId}/${e.run.subkind}`));
  const coveredRunIds = new Set();
  for (const entry of raw.runs) {
    const header = raw.campaignHeaders.get(entry.run?.campaignId);
    const gitCommit = header?.harness?.gitCommit ?? null;
    const isCovered = ledger.some((inv) =>
      inv.scope.file === entry.file &&
      (inv.scope.campaignGitCommit === null || inv.scope.campaignGitCommit === gitCommit) &&
      (inv.scope.receiptIds === 'all' || inv.scope.receiptIds.includes(entry.run?.runId)));
    if (isCovered) coveredRunIds.add(entry.run.runId);
  }
  const toSupersedeByCommit = new Map();
  for (const entry of raw.runs) {
    const run = entry.run;
    if (!run || run.campaignId === currentCampaignId || coveredRunIds.has(run.runId)) continue;
    if (!newClaimPairs.has(`${run.targetId}/${run.subkind}`)) continue;
    const header = raw.campaignHeaders.get(run.campaignId);
    const gitCommit = header?.harness?.gitCommit ?? null;
    const list = toSupersedeByCommit.get(gitCommit) || [];
    list.push(run.runId);
    toSupersedeByCommit.set(gitCommit, list);
  }
  if (toSupersedeByCommit.size === 0) return;
  let nextNum = ledger.length + 1;
  const existingIds = new Set(ledger.map((e) => e.id));
  const entries = [];
  for (const [gitCommit, runIds] of toSupersedeByCommit.entries()) {
    while (existingIds.has(`inv-${String(nextNum).padStart(INV_ID_PAD, '0')}`)) nextNum += 1;
    const id = `inv-${String(nextNum).padStart(INV_ID_PAD, '0')}`;
    existingIds.add(id);
    entries.push({
      id,
      recordedAt: new Date().toISOString(),
      scope: {
        file: DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH,
        campaignGitCommit: gitCommit,
        receiptIds: runIds,
      },
      reasons: [ADMISSION_REASON.DUPLICATE_CLAIM],
      defectIds: [],
      note: `Superseded by newer campaign ${currentCampaignId} measuring the same target claim(s).`,
      recordedBy: 'run-comparative-benchmarks',
    });
  }
  appendInvalidationEntries(path.resolve(rootDir, DEFAULT_INVALIDATIONS_PATH), entries);
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2), process.env);
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  // The declared product commit is read from the repository before any host is touched.
  const product = opts.productCommit ?
    productCommitProvenance(REPO_ROOT, opts.productCommit) : null;
  const manifest = buildComparativeCampaignManifest({campaignId: opts.campaignId,
    profile: product ? researchProfileWithProduct(opts.profileOverride ?? PROFILES[opts.profile],
      product) : opts.profileOverride ?? PROFILES[opts.profile], targets: opts.targets});
  // The store refusal of a research campaign is met before any host is touched.
  createCampaignRecordWriter({rootDir: REPO_ROOT, file: opts.rawObservationsPath,
    profileClass: manifest.plan.profileClass});
  Object.assign(opts, await resolveCheckoutLagrangeProvenance(opts, manifest, product));
  const dataHostCount = dataHostCountOf(manifest.targets);
  if (opts.dryRun) {
    const plan = await dryRunPlan({opts, manifest, dataHostCount});
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  if (opts.provision) {
    const placed = await provisionGcpHosts({opts, manifest, dataHostCount});
    process.stdout.write(`${JSON.stringify({provisioned: placed}, null, 2)}\n`);
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
  if (shouldRegenerateCanonicalBenchmarkArtifacts(opts, summary)) {
    supersedePriorCampaignRuns(REPO_ROOT, summary.campaignId);
    await regenerateAllBenchmarkArtifactsFromAdmitted(REPO_ROOT);
    process.stdout.write('[bench] regenerated comparative benchmark artifacts in ' +
      'data/tidb-comparison and docs/benchmarks\n');
  }
  if (summary.substrate) {
    process.stdout.write(`[bench] ${summary.substrate.kind} (host identities ` +
      `${summary.substrate.declaredHostIdentity}): ${summary.substrate.note}\n`);
  }
  process.stdout.write(`[bench] campaign ${summary.campaignId}: ${summary.attempted.length} ` +
    `runs attempted, summary ${opts.outputPath}\n`);
  process.exitCode = summary.exitCode;
}

main().catch((error) => {
  const codeLabel = isDeploymentFailure(error) ? error.code : 'error';
  process.stderr.write(`${error instanceof UsageError ? '' : `${codeLabel}: `}` +
    `${error.message}\n`);
  if (error.loadGeneratorWorktree) {
    process.stderr.write('load generator worktree closure: ' +
      `${JSON.stringify(error.loadGeneratorWorktree)}\n`);
  }
  if (error instanceof UsageError) process.stderr.write(USAGE);
  // A typed failure's diagnostic (which hosts were excluded, each target's
  // failure) is the operator's only evidence of a campaign that wrote nothing.
  if (error?.diagnostic != null) {
    process.stderr.write(`diagnostic: ${JSON.stringify(error.diagnostic)}\n`);
  }
  process.exitCode = isDeploymentFailure(error) && error.code.startsWith('refused_') ?
    EXIT_CODES.REFUSED : EXIT_CODES.FAILURE;
});
