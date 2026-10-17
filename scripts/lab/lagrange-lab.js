#!/usr/bin/env node
import {
  loadState,
  nodeSummary,
  normalizeLabels,
  normalizeRoles,
  requireNode,
  saveState,
  selectNodesByRole,
  statePath,
} from './state.js';
import {commandExists, run} from './process.js';
import {doctorHarnessNodes, runHarness} from './harness.js';
import {keepCertificationEvidence} from './certification-preflight.js';
import {initK3sServer, joinK3sNode, k3sKubectl, syncK3sLabels} from './k3s.js';
import {configureRunner, runnerLabels} from './runner.js';
import {
  WORKER_SETUP_FILE, copyWorkerSetup, discoverFleet, fleetRequirement, formatFleet,
  formatFleetRequirement,
  labTestCommit, labTestDeps, labTestSelectorArgs, prepareSelectorImportGraph, probeRemoteNode,
  recordFleet, runLabTest,
  workerCloneUrl, workerSetupScript,
} from './probe.js';
import {
  CLASSIFIED_LANES, estimateFileCosts, lastResultsRoots, planClassifiedTestFiles,
} from '../run-classified-test-files.js';
import {parseLaneArgs, planLane} from '../plan-test-lane.js';
import {capture} from './process.js';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {dirname, join as joinPath} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse as parseYaml} from 'yaml';

// A hand lab run: the profiles that are a plan of test files, the lanes it
// may name (the classified runner's own, and all of them), and its flags.
const LAB_TEST_PROFILE = Object.freeze({CHANGED: 'changed', ALL: 'all'});
const LAB_TEST_LANE_ALL = 'all';
const LAB_TEST_LANES = Object.freeze([...CLASSIFIED_LANES, LAB_TEST_LANE_ALL]);
const LAB_TEST_FLAG = Object.freeze({LANE: 'lane', ON: 'on', SHA: 'sha', BASE_SHA: 'base-sha',
  SPLIT: 'split'});
const LAB_TEST_CHOICE = '|';
const USAGE = [
  'Lagrange home lab\n\n',
  '  lab init\n',
  '  lab list\n',
  '  lab node add NAME --ssh USER@HOST [--ip IP] --os linux|macos|windows ',
  '--arch x64|arm64 --roles runner,harness,k3s ',
  '[--labels storage=nvme,gpu=nvidia]\n',
  '  lab node probe NAME\n',
  '  lab node remove NAME\n',
  '  lab doctor\n',
  '  lab runner labels NAME\n',
  '  lab runner configure NAME --repo OWNER/PRIVATE-LAB-REPO [--service]\n',
  '  lab harness doctor [--nodes a,b,c]\n',
  '  lab harness run [SCENARIO] [--base CONFIG] [--nodes a,b,c] ',
  '[--nodes-per-host N] [--certify SHA [--quest ID]] [--dry-run] [-- ...harness args]\n',
  '      (--certify SHA: a certification run - one node per distinct ',
  'machine, a clean checkout at SHA; with --dry-run its pre-flight; see ',
  'docs/development/home-lab.md)\n',
  '  lab harness keep-evidence RUN_DIR [--to DIR] [--quest ID]\n',
  '  lab k3s init-server NAME [--version VERSION]\n',
  '  lab k3s join NAME --server SERVER\n',
  '  lab k3s status --server SERVER\n',
  '  lab k3s labels --server SERVER\n',
  '  lab k3s cordon|uncordon NAME --server SERVER\n',
  '  lab k3s drain NAME --server SERVER\n',
  '  lab test changed|smoke|gate|postpush|all\n',
  `  lab test ${Object.values(LAB_TEST_PROFILE).join(LAB_TEST_CHOICE)} --lane `,
  `${LAB_TEST_LANES.join(LAB_TEST_CHOICE)} [--on NAME] [--sha COMMIT] [--split]\n`,
  `  lab test ${LAB_TEST_PROFILE.CHANGED} --lane LANE [--sha COMMIT] --base-sha COMMIT\n`,
  '      (--base-sha: the commit the change cone is measured from; ',
  'default the merge base with origin/main)\n',
  '  lab fleet [--json]\n',
  '  lab provision [--output FILE] [--copy NAME]\n',
].join('');
const COMMAND = Object.freeze({
  HELP: 'help',
  INIT: 'init',
  LIST: 'list',
  DOCTOR: 'doctor',
  NODE: 'node',
  RUNNER: 'runner',
  HARNESS: 'harness',
  K3S: 'k3s',
  TEST: 'test',
  FLEET: 'fleet',
  PROVISION: 'provision',
});
// The repository this command runs from. `lab fleet` names no commit, so its
// working tree's dependency graph and engines floor are what it measures
// against; a hand run (`lab test`) measures against the commit it places.
const FLEET_REPO_ROOT = joinPath(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FLEET_PACKAGE = 'package.json';
const FLEET_TEXT = 'utf8';
const FLEET_JSON_FLAG = 'json';
const FLEET_LINE_BREAK = '\n';
const ACTION = Object.freeze({
  ADD: 'add',
  PROBE: 'probe',
  REMOVE: 'remove',
  LABELS: 'labels',
  CONFIGURE: 'configure',
  DOCTOR: 'doctor',
  RUN: 'run',
  INIT_SERVER: 'init-server',
  JOIN: 'join',
  STATUS: 'status',
  CORDON: 'cordon',
  UNCORDON: 'uncordon',
  DRAIN: 'drain',
  KEEP_EVIDENCE: 'keep-evidence',
});
const FLAG = Object.freeze({
  PREFIX: '--',
  PASSTHROUGH: '--',
  DOCKER_SOCKET: 'docker-socket',
  K3S_NODE: 'k3s-node',
  NODES_PER_HOST: 'nodes-per-host',
  DRY_RUN: 'dry-run',
  CERTIFY: 'certify',
  QUEST: 'quest',
  TO: 'to',
});
const FLAG_PREFIX_LENGTH = 2;
const ARGV_COMMAND_OFFSET = 2;
const ROLE = Object.freeze({HARNESS: 'harness', K3S: 'k3s'});
const UNKNOWN = 'unknown';
const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock';
const LIST_SEPARATOR = ',';
const NONE = '-';
const JSON_INDENT = 2;
const DOCTOR_REQUIRED_COMMANDS = Object.freeze(['node', 'git', 'ssh']);
const DOCTOR_STATUS = Object.freeze({OK: 'ok ', ERROR: 'ERR'});
const KUBECTL_STATUS = Object.freeze(['get', 'nodes', '-o', 'wide']);
const KUBECTL_DRAIN = Object.freeze(['drain']);
const KUBECTL_DRAIN_OPTIONS = Object.freeze(['--ignore-daemonsets', '--delete-emptydir-data']);
const NPM = 'npm';
const TEST_PROFILE_COMMANDS = Object.freeze({
  changed: Object.freeze(['test']),
  smoke: Object.freeze(['run', 'test:smoke']),
  gate: Object.freeze(['run', 'test:gate']),
  postpush: Object.freeze(['run', 'test:gate:postpush']),
  all: Object.freeze(['run', 'test:all']),
});
const ERROR_TEXT = Object.freeze({
  IP_REQUIRED: 'Nodes with harness or k3s roles require --ip',
  NOT_A_FILE_PLAN: ' profile is an acceptance manifest, not a file plan: --lane takes ',
  NO_LANE: 'a lab test run names its lane with --lane',
  UNKNOWN_LANE: 'unknown lane ',
  SPLIT_NEEDS_ALL: '--split divides the whole corpus: it takes --lane all',
  SPLIT_TAKES_NO_VALUE: '--split takes no value',
  NO_MACHINE_NAME: '--on needs a machine name',
  NO_COMMIT_NAME: '--sha needs a commit',
  NO_BASE_NAME: '--base-sha needs a commit',
  BASE_NEEDS_CHANGED: '--base-sha measures the change cone: it takes the changed profile',
  NOT_THE_RUNNER: ' no longer runs the classified runner: ',
  NO_LANE_FILES: ' has no files in lane ',
  SPLIT_OR_ON: '--split spreads over every ready machine and --on names one: take one or the other',
  UNKNOWN_FLAG: 'unknown flag --',
  NO_CERTIFY_SHA: '--certify needs the full commit sha it certifies',
  FLAGS_TAKEN: ': lab test takes --',
});
// How the corpus profile's npm script reads: `node <runner> <lane filters>`.
const LAB_TEST_SCRIPT = Object.freeze({NODE: 'node',
  RUNNER: 'scripts/run-classified-test-files.js', WORDS: /\s+/u, FILTERS_AT: 2});
const LAB_TEST_SELECT_DEADLINE_MS = 5 * 60 * 1000;
const LAB_TEST_LINE = /\r?\n/u;
const LAB_TEST_SHA_DIGITS = 12;
const POSITIONAL = Object.freeze({COMMAND: 0, ACTION: 1, NAME: 2});
const EXIT_FAILURE = 1;
// A flag no command reads is a usage error: nothing runs on it.
const EXIT_USAGE = 2;

function usage() {
  process.stdout.write(USAGE);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  const passthrough = [];
  let afterDoubleDash = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (afterDoubleDash) {
      passthrough.push(value);
      continue;
    }
    if (value === FLAG.PASSTHROUGH) {
      afterDoubleDash = true;
      continue;
    }
    if (!value.startsWith(FLAG.PREFIX)) {
      positional.push(value);
      continue;
    }
    const key = value.slice(FLAG_PREFIX_LENGTH);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith(FLAG.PREFIX)) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return {positional, flags, passthrough};
}

function csv(value) {
  return value ?
    String(value).split(LIST_SEPARATOR).map((item) => item.trim()).filter(Boolean) :
    [];
}

async function commandInit() {
  const state = await loadState();
  const path = await saveState(state);
  process.stdout.write(`Lab inventory: ${path}\n`);
}

async function commandList() {
  const state = await loadState();
  const entries = Object.values(state.nodes || {}).map(nodeSummary);
  if (entries.length === 0) {
    process.stdout.write(`No nodes registered. Inventory: ${statePath()}\n`);
    return;
  }
  for (const node of entries) {
    process.stdout.write(
      `${node.name}\t${node.os}/${node.arch}\t${node.ip || NONE}\t` +
      `${node.roles.join(LIST_SEPARATOR)}\t${node.ssh || NONE}\n`,
    );
  }
}

async function commandNodeRemove(state, name) {
  requireNode(state, name);
  delete state.nodes[name];
  await saveState(state);
}

async function commandNodeProbe(state, name) {
  const node = requireNode(state, name);
  const metadata = await probeRemoteNode(node.ssh);
  Object.assign(node, metadata);
  await saveState(state);
  process.stdout.write(`${JSON.stringify(nodeSummary(node), null, JSON_INDENT)}\n`);
}

async function resolveNodePlatform(existing, flags, ssh) {
  let os = flags.os || existing.os || UNKNOWN;
  let arch = flags.arch || existing.arch || UNKNOWN;
  if (ssh && (os === UNKNOWN || arch === UNKNOWN)) {
    const metadata = await probeRemoteNode(ssh);
    if (os === UNKNOWN) os = metadata.os;
    if (arch === UNKNOWN) arch = metadata.arch;
  }
  return {os, arch};
}

async function commandNodeAdd(state, name, flags) {
  const existing = state.nodes[name] || {};
  const roles = flags.roles ? normalizeRoles(flags.roles) : existing.roles || [];
  const ssh = flags.ssh || existing.ssh || null;
  const {os, arch} = await resolveNodePlatform(existing, flags, ssh);
  const node = {
    ...existing,
    name,
    ssh,
    ip: flags.ip || existing.ip || null,
    os,
    arch,
    roles,
    labels: flags.labels ? normalizeLabels(flags.labels) : existing.labels || {},
    dockerSocket: flags[FLAG.DOCKER_SOCKET] || existing.dockerSocket || DEFAULT_DOCKER_SOCKET,
    k3sNode: flags[FLAG.K3S_NODE] || existing.k3sNode || name,
  };
  if ((roles.includes(ROLE.HARNESS) || roles.includes(ROLE.K3S)) && !node.ip) {
    throw new Error(ERROR_TEXT.IP_REQUIRED);
  }
  state.nodes[name] = node;
  await saveState(state);
  process.stdout.write(`${JSON.stringify(nodeSummary(node), null, JSON_INDENT)}\n`);
}

async function commandNode(action, args) {
  const name = args.positional[POSITIONAL.NAME];
  if (!name) throw new Error(`node ${action} requires NAME`);
  const state = await loadState();
  if (action === ACTION.REMOVE) return commandNodeRemove(state, name);
  if (action === ACTION.PROBE) return commandNodeProbe(state, name);
  if (action === ACTION.ADD) return commandNodeAdd(state, name, args.flags);
  throw new Error(`Unknown node action: ${action}`);
}

// One accounting of what the doctor found: every check contributes a problem
// or nothing, and the verdict is the count of problems.
async function doctorProblems() {
  const problems = [];
  for (const command of DOCTOR_REQUIRED_COMMANDS) {
    const present = await commandExists(command);
    process.stdout.write(`${present ? DOCTOR_STATUS.OK : DOCTOR_STATUS.ERROR} ${command}\n`);
    if (!present) problems.push(command);
  }
  const state = await loadState();
  const harnessNodes = selectNodesByRole(state, ROLE.HARNESS);
  if (harnessNodes.length > 0) {
    try {
      await doctorHarnessNodes(harnessNodes);
    } catch (error) {
      problems.push(error.message);
    }
  }
  return problems;
}

// Discover and measure the fleet, record each machine's facts in the
// out-of-repo inventory, and report what each can run for THIS checkout. No
// host is named in code: the machines come from the inventory, and placement
// decides from these records at run time.
async function commandFleet(args) {
  const state = await loadState();
  // No commit is named here, so the requirement is the working tree's, and
  // the report says so; a placed run measures against its own commit.
  const requirement = fleetRequirement(FLEET_REPO_ROOT);
  const fleet = await discoverFleet({
    nodes: Object.values(state.nodes || {}),
    controllerRepoPath: FLEET_REPO_ROOT,
    ...requirement,
  });
  await saveState(recordFleet(state, fleet));
  const lines = args.flags[FLEET_JSON_FLAG] ?
    [JSON.stringify(fleet, null, JSON_INDENT)] :
    [formatFleetRequirement(requirement), ...formatFleet(fleet)];
  process.stdout.write(`${lines.join(FLEET_LINE_BREAK)}${FLEET_LINE_BREAK}`);
}

// The worker setup script, generated from this checkout: the canary's own
// install steps, the engines floor, origin as an https clone URL and the
// public halves of the identities ssh offers from here. Written to a file,
// printed, or copied to a registered worker - never run from here.
const PROVISION_WORKFLOW = '.github/workflows/full-corpus-canary.yml';
const PROVISION_FILE_MODE = 0o755;
const PROVISION_KEY_TARGET = 'localhost';
const PROVISION_SSH_CONFIG = Object.freeze(['ssh', '-G']);
const PROVISION_IDENTITY_LINE = /^identityfile (.+)$/gmu;
const PROVISION_HOME_PREFIX = '~/';
const PROVISION_PUBLIC_SUFFIX = '.pub';
const PROVISION_ONE_TARGET = 'provision takes --copy NAME or --output FILE, not both';

async function controllerPublicKeys(sshTarget) {
  let config;
  try {
    config = await capture(PROVISION_SSH_CONFIG[0],
      [...PROVISION_SSH_CONFIG.slice(1), sshTarget || PROVISION_KEY_TARGET]);
  } catch {
    // No ssh client here: the setup simply leaves the worker's keys alone.
    return [];
  }
  const keys = [];
  for (const [, identity] of config.matchAll(PROVISION_IDENTITY_LINE)) {
    const file = (identity.startsWith(PROVISION_HOME_PREFIX) ?
      joinPath(homedir(), identity.slice(PROVISION_HOME_PREFIX.length)) : identity) +
      PROVISION_PUBLIC_SUFFIX;
    if (existsSync(file)) keys.push(readFileSync(file, FLEET_TEXT).trim());
  }
  return keys;
}

async function commandProvision(args) {
  if (args.flags.copy && args.flags.output) throw new Error(PROVISION_ONE_TARGET);
  const state = await loadState();
  const node = args.flags.copy ? requireNode(state, args.flags.copy) : null;
  const manifest = JSON.parse(readFileSync(joinPath(FLEET_REPO_ROOT, FLEET_PACKAGE), FLEET_TEXT));
  // Git asks this checkout, never a repository a hook exported GIT_DIR for.
  const gitEnv = {env: gitProcessEnvironment()};
  const head = await capture('git', ['-C', FLEET_REPO_ROOT, 'rev-parse', '--short', 'HEAD'],
    gitEnv);
  const script = workerSetupScript({
    workflow: parseYaml(readFileSync(joinPath(FLEET_REPO_ROOT, PROVISION_WORKFLOW), FLEET_TEXT)),
    // The engines floor has one reader: the fleet requirement's.
    nodeMinimum: fleetRequirement(FLEET_REPO_ROOT).nodeMinimum,
    repoUrl: workerCloneUrl(
      await capture('git', ['-C', FLEET_REPO_ROOT, 'remote', 'get-url', 'origin'], gitEnv)),
    authorizedKeys: await controllerPublicKeys(node?.ssh),
    generatedFrom: `${manifest.name} ${head}`,
  });
  if (node) {
    const scratch = mkdtempSync(joinPath(tmpdir(), 'lab-provision-'));
    try {
      const file = joinPath(scratch, WORKER_SETUP_FILE);
      writeFileSync(file, script, {mode: PROVISION_FILE_MODE});
      const command = await copyWorkerSetup({sshTarget: node.ssh, file});
      process.stdout.write(`copied ${WORKER_SETUP_FILE} to ${node.name}; run it there:\n` +
        `  ${command}\n`);
    } finally {
      rmSync(scratch, {recursive: true, force: true});
    }
    return;
  }
  if (args.flags.output) {
    writeFileSync(args.flags.output, script, {mode: PROVISION_FILE_MODE});
    process.stdout.write(`wrote ${args.flags.output}; copy it to the worker and run: ` +
      `bash ${WORKER_SETUP_FILE}\n`);
    return;
  }
  process.stdout.write(script);
}

async function commandDoctor() {
  const problems = await doctorProblems();
  if (problems.length > 0) throw new Error(`Lab doctor found ${problems.length} problem(s)`);
}

async function commandRunner(action, args) {
  const name = args.positional[POSITIONAL.NAME];
  const state = await loadState();
  const node = requireNode(state, name);
  if (action === ACTION.LABELS) {
    process.stdout.write(`${runnerLabels(node).join(LIST_SEPARATOR)}\n`);
    return;
  }
  if (action === ACTION.CONFIGURE) {
    await configureRunner(node, args.flags.repo, {service: args.flags.service === true});
    return;
  }
  throw new Error(`Unknown runner action: ${action}`);
}

async function commandHarness(action, args) {
  if (action === ACTION.KEEP_EVIDENCE) {
    await keepCertificationEvidence({runDir: args.positional[POSITIONAL.NAME],
      to: typeof args.flags[FLAG.TO] === 'string' ? args.flags[FLAG.TO] : undefined,
      quest: typeof args.flags[FLAG.QUEST] === 'string' ? args.flags[FLAG.QUEST] : null});
    return;
  }
  const state = await loadState();
  const nodes = selectNodesByRole(state, ROLE.HARNESS, csv(args.flags.nodes));
  if (action === ACTION.DOCTOR) return doctorHarnessNodes(nodes);
  if (action !== ACTION.RUN) throw new Error(`Unknown harness action: ${action}`);
  const scenario = args.positional[POSITIONAL.NAME] || null;
  const certify = args.flags[FLAG.CERTIFY];
  if (certify === true) throw new Error(ERROR_TEXT.NO_CERTIFY_SHA);
  await runHarness({
    nodes,
    scenario,
    baseConfig: args.flags.base,
    nodesPerHost: args.flags[FLAG.NODES_PER_HOST] ?
      Number(args.flags[FLAG.NODES_PER_HOST]) :
      undefined,
    dryRun: args.flags[FLAG.DRY_RUN] === true,
    extraArgs: args.passthrough,
    certify: typeof certify === 'string' ? certify : null,
    quest: typeof args.flags[FLAG.QUEST] === 'string' ? args.flags[FLAG.QUEST] : null,
  });
}

async function commandK3s(action, args) {
  const state = await loadState();
  const name = args.positional[POSITIONAL.NAME];
  const serverName = args.flags.server || (action === ACTION.INIT_SERVER ? name : null);
  const server = serverName ? requireNode(state, serverName) : null;
  if (action === ACTION.INIT_SERVER) {
    return initK3sServer(requireNode(state, name), {version: args.flags.version});
  }
  if (!server) throw new Error(`k3s ${action} requires --server SERVER`);
  if (action === ACTION.JOIN) return joinK3sNode(requireNode(state, name), server);
  if (action === ACTION.STATUS) return k3sKubectl(server, [...KUBECTL_STATUS]);
  if (action === ACTION.LABELS) {
    return syncK3sLabels(server, selectNodesByRole(state, ROLE.K3S));
  }
  if (action === ACTION.CORDON || action === ACTION.UNCORDON) {
    const node = requireNode(state, name);
    return k3sKubectl(server, [action, node.k3sNode || node.name]);
  }
  if (action === ACTION.DRAIN) {
    const node = requireNode(state, name);
    return k3sKubectl(server, [
      ...KUBECTL_DRAIN, node.k3sNode || node.name,
      ...KUBECTL_DRAIN_OPTIONS,
    ]);
  }
  throw new Error(`Unknown k3s action: ${action}`);
}

async function commandTest(profile, args) {
  const selected = TEST_PROFILE_COMMANDS[profile];
  if (!selected) throw new Error(`Unknown test profile: ${profile}`);
  const flags = Object.values(LAB_TEST_FLAG);
  const unknown = Object.keys(args.flags).find((flag) => !flags.includes(flag));
  if (unknown !== undefined) {
    throw Object.assign(new Error(`${ERROR_TEXT.UNKNOWN_FLAG}${unknown}${ERROR_TEXT.FLAGS_TAKEN}` +
      `${flags.join(`${LIST_SEPARATOR} ${FLAG.PREFIX}`)}`), {exitCode: EXIT_USAGE});
  }
  if (!Object.values(LAB_TEST_FLAG).some((flag) => Object.hasOwn(args.flags, flag))) {
    await run(NPM, [...selected]);
    return;
  }
  const request = labTestRequest(profile, args.flags);
  const commit = labTestCommit({root: FLEET_REPO_ROOT, sha: request.sha});
  try {
    const plan = await labTestPlan(profile, request, commit);
    process.exitCode = await runLabTest({
      plan,
      costs: estimateFileCosts(plan, lastResultsRoots(FLEET_REPO_ROOT)),
      commit,
      on: request.on,
      split: request.split,
      root: FLEET_REPO_ROOT,
    }, labTestDeps({root: FLEET_REPO_ROOT}));
  } finally {
    commit.release();
  }
}

// Everything a hand lab run can refuse, refused before the inventory, the
// tree or any machine is looked at.
function labTestRequest(profile, flags) {
  if (!Object.values(LAB_TEST_PROFILE).includes(profile)) {
    throw new Error(`the ${profile}${ERROR_TEXT.NOT_A_FILE_PLAN}` +
      `${Object.values(LAB_TEST_PROFILE).join(LAB_TEST_CHOICE)}`);
  }
  const lane = flags[LAB_TEST_FLAG.LANE];
  if (typeof lane !== 'string') throw new Error(ERROR_TEXT.NO_LANE);
  if (!LAB_TEST_LANES.includes(lane)) {
    throw new Error(`${ERROR_TEXT.UNKNOWN_LANE}${lane}: ${LAB_TEST_LANES.join(LAB_TEST_CHOICE)}`);
  }
  const split = flags[LAB_TEST_FLAG.SPLIT];
  if (split !== undefined && split !== true) throw new Error(ERROR_TEXT.SPLIT_TAKES_NO_VALUE);
  if (split && lane !== LAB_TEST_LANE_ALL) throw new Error(ERROR_TEXT.SPLIT_NEEDS_ALL);
  if (flags[LAB_TEST_FLAG.ON] === true) throw new Error(ERROR_TEXT.NO_MACHINE_NAME);
  if (flags[LAB_TEST_FLAG.SHA] === true) throw new Error(ERROR_TEXT.NO_COMMIT_NAME);
  if (split && flags[LAB_TEST_FLAG.ON] !== undefined) throw new Error(ERROR_TEXT.SPLIT_OR_ON);
  return {lane, split: split === true, on: flags[LAB_TEST_FLAG.ON] ?? null,
    sha: flags[LAB_TEST_FLAG.SHA] ?? null, baseSha: labTestBaseSha(profile, flags)};
}

// The commit the change cone is measured from, or null for the selector's own
// default. Only the changed profile has a cone to measure.
function labTestBaseSha(profile, flags) {
  const baseSha = flags[LAB_TEST_FLAG.BASE_SHA];
  if (baseSha === undefined) return null;
  if (baseSha === true) throw new Error(ERROR_TEXT.NO_BASE_NAME);
  if (profile !== LAB_TEST_PROFILE.CHANGED) throw new Error(ERROR_TEXT.BASE_NEEDS_CHANGED);
  return baseSha;
}

// The profile's files at the commit: the corpus through its own npm script's
// lane filters, the change cone through the selector (from --base-sha when
// named), and the chosen lane of the classified plan of those files - planned
// from the commit's own tree.
async function labTestPlan(profile, {lane, baseSha}, commit) {
  const node = (args) => capture(process.execPath, args,
    {cwd: FLEET_REPO_ROOT, timeoutMs: LAB_TEST_SELECT_DEADLINE_MS});
  if (profile !== LAB_TEST_PROFILE.ALL) {
    await prepareSelectorImportGraph(FLEET_REPO_ROOT,
      {produce: node, write: (line) => process.stdout.write(`${line}\n`)});
  }
  const files = profile === LAB_TEST_PROFILE.ALL ?
    corpusFiles(commit.gitRoot, TEST_PROFILE_COMMANDS[profile].at(-1)) :
    (await node(labTestSelectorArgs({sha: commit.sha, baseSha})))
      .split(LAB_TEST_LINE).filter(Boolean);
  const plan = planClassifiedTestFiles(commit.gitRoot, files, lastResultsRoots(FLEET_REPO_ROOT));
  const chosen = lane === LAB_TEST_LANE_ALL ? plan :
    plan.filter((entry) => entry.resourceClass === lane);
  if (chosen.length === 0) {
    throw new Error(`${profile} at ${commit.sha.slice(0, LAB_TEST_SHA_DIGITS)}` +
      `${ERROR_TEXT.NO_LANE_FILES}${lane}`);
  }
  return chosen;
}

function corpusFiles(gitRoot, scriptName) {
  const manifest = JSON.parse(readFileSync(joinPath(gitRoot, FLEET_PACKAGE), FLEET_TEXT));
  const script = String(manifest.scripts?.[scriptName] || '');
  const words = script.trim().split(LAB_TEST_SCRIPT.WORDS);
  if (words[0] !== LAB_TEST_SCRIPT.NODE || words[1] !== LAB_TEST_SCRIPT.RUNNER) {
    throw new Error(`${scriptName}${ERROR_TEXT.NOT_THE_RUNNER}${script}`);
  }
  return planLane(gitRoot, parseLaneArgs(words.slice(LAB_TEST_SCRIPT.FILTERS_AT)));
}

const COMMAND_HANDLERS = Object.freeze({
  [COMMAND.INIT]: () => commandInit(),
  [COMMAND.LIST]: () => commandList(),
  [COMMAND.DOCTOR]: () => commandDoctor(),
  [COMMAND.NODE]: (action, args) => commandNode(action, args),
  [COMMAND.RUNNER]: (action, args) => commandRunner(action, args),
  [COMMAND.HARNESS]: (action, args) => commandHarness(action, args),
  [COMMAND.K3S]: (action, args) => commandK3s(action, args),
  [COMMAND.TEST]: (action, args) => commandTest(action, args),
  [COMMAND.FLEET]: (action, args) => commandFleet(args),
  [COMMAND.PROVISION]: (action, args) => commandProvision(args),
});

async function main() {
  const args = parseArgs(process.argv.slice(ARGV_COMMAND_OFFSET));
  const command = args.positional[POSITIONAL.COMMAND];
  const action = args.positional[POSITIONAL.ACTION];
  if (!command || command === COMMAND.HELP || args.flags.help) return usage();
  // Own keys only: a plain object would answer `constructor` or `toString`
  // from its prototype and run something for a command that does not exist.
  const handler = Object.hasOwn(COMMAND_HANDLERS, command) ?
    COMMAND_HANDLERS[command] :
    null;
  if (!handler) throw new Error(`Unknown lab command: ${command}`);
  return handler(action, args);
}

main().catch((error) => {
  process.stderr.write(`lab: ${error.message}\n`);
  process.exitCode = error.exitCode ?? EXIT_FAILURE;
});
