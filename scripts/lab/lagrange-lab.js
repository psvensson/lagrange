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
import {initK3sServer, joinK3sNode, k3sKubectl, syncK3sLabels} from './k3s.js';
import {configureRunner, runnerLabels} from './runner.js';
import {probeRemoteNode} from './probe.js';

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
  '[--nodes-per-host N] [--dry-run] [-- ...harness args]\n',
  '  lab k3s init-server NAME [--version VERSION]\n',
  '  lab k3s join NAME --server SERVER\n',
  '  lab k3s status --server SERVER\n',
  '  lab k3s labels --server SERVER\n',
  '  lab k3s cordon|uncordon NAME --server SERVER\n',
  '  lab k3s drain NAME --server SERVER\n',
  '  lab test changed|smoke|gate|postpush|all\n',
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
});
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
});
const FLAG = Object.freeze({
  PREFIX: '--',
  PASSTHROUGH: '--',
  DOCKER_SOCKET: 'docker-socket',
  K3S_NODE: 'k3s-node',
  NODES_PER_HOST: 'nodes-per-host',
  DRY_RUN: 'dry-run',
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
});
const POSITIONAL = Object.freeze({COMMAND: 0, ACTION: 1, NAME: 2});
const EXIT_FAILURE = 1;

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
  const state = await loadState();
  const nodes = selectNodesByRole(state, ROLE.HARNESS, csv(args.flags.nodes));
  if (action === ACTION.DOCTOR) return doctorHarnessNodes(nodes);
  if (action !== ACTION.RUN) throw new Error(`Unknown harness action: ${action}`);
  const scenario = args.positional[POSITIONAL.NAME] || null;
  await runHarness({
    nodes,
    scenario,
    baseConfig: args.flags.base,
    nodesPerHost: args.flags[FLAG.NODES_PER_HOST] ?
      Number(args.flags[FLAG.NODES_PER_HOST]) :
      undefined,
    dryRun: args.flags[FLAG.DRY_RUN] === true,
    extraArgs: args.passthrough,
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

async function commandTest(profile) {
  const selected = TEST_PROFILE_COMMANDS[profile];
  if (!selected) throw new Error(`Unknown test profile: ${profile}`);
  await run(NPM, [...selected]);
}

const COMMAND_HANDLERS = Object.freeze({
  [COMMAND.INIT]: () => commandInit(),
  [COMMAND.LIST]: () => commandList(),
  [COMMAND.DOCTOR]: () => commandDoctor(),
  [COMMAND.NODE]: (action, args) => commandNode(action, args),
  [COMMAND.RUNNER]: (action, args) => commandRunner(action, args),
  [COMMAND.HARNESS]: (action, args) => commandHarness(action, args),
  [COMMAND.K3S]: (action, args) => commandK3s(action, args),
  [COMMAND.TEST]: (action) => commandTest(action),
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
  process.exitCode = EXIT_FAILURE;
});
