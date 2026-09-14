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

function usage() {
  process.stdout.write(`Lagrange home lab\n\n` +
    `  lab init\n` +
    `  lab list\n` +
    '  lab node add NAME --ssh USER@HOST [--ip IP] --os linux|macos|windows ' +
    '--arch x64|arm64 --roles runner,harness,k3s ' +
    '[--labels storage=nvme,gpu=nvidia]\n' +
    `  lab node probe NAME\n` +
    `  lab node remove NAME\n` +
    `  lab doctor\n` +
    `  lab runner labels NAME\n` +
    `  lab runner configure NAME --repo OWNER/PRIVATE-LAB-REPO [--service]\n` +
    `  lab harness doctor [--nodes a,b,c]\n` +
    '  lab harness run [SCENARIO] [--base CONFIG] [--nodes a,b,c] ' +
    '[--nodes-per-host N] [--dry-run] [-- ...harness args]\n' +
    `  lab k3s init-server NAME [--version VERSION]\n` +
    `  lab k3s join NAME --server SERVER\n` +
    `  lab k3s status --server SERVER\n` +
    `  lab k3s labels --server SERVER\n` +
    `  lab k3s cordon|uncordon NAME --server SERVER\n` +
    `  lab k3s drain NAME --server SERVER\n` +
    `  lab test changed|smoke|gate|postpush|all\n`);
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
    if (value === '--') {
      afterDoubleDash = true;
      continue;
    }
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return {positional, flags, passthrough};
}

function csv(value) {
  return value ? String(value).split(',').map((item) => item.trim()).filter(Boolean) : [];
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
      `${node.name}\t${node.os}/${node.arch}\t${node.ip || '-'}\t` +
      `${node.roles.join(',')}\t${node.ssh || '-'}\n`,
    );
  }
}

async function commandNode(action, args) {
  const name = args.positional[2];
  if (!name) throw new Error(`node ${action} requires NAME`);
  const state = await loadState();
  if (action === 'remove') {
    requireNode(state, name);
    delete state.nodes[name];
    await saveState(state);
    return;
  }
  if (action === 'probe') {
    const node = requireNode(state, name);
    const metadata = await probeRemoteNode(node.ssh);
    Object.assign(node, metadata);
    await saveState(state);
    process.stdout.write(`${JSON.stringify(nodeSummary(node), null, 2)}\n`);
    return;
  }
  if (action !== 'add') throw new Error(`Unknown node action: ${action}`);
  const existing = state.nodes[name] || {};
  const roles = args.flags.roles ? normalizeRoles(args.flags.roles) : existing.roles || [];
  const ssh = args.flags.ssh || existing.ssh || null;
  let os = args.flags.os || existing.os || 'unknown';
  let arch = args.flags.arch || existing.arch || 'unknown';
  if (ssh && (os === 'unknown' || arch === 'unknown')) {
    const metadata = await probeRemoteNode(ssh);
    if (os === 'unknown') os = metadata.os;
    if (arch === 'unknown') arch = metadata.arch;
  }
  const node = {
    ...existing,
    name,
    ssh,
    ip: args.flags.ip || existing.ip || null,
    os,
    arch,
    roles,
    labels: args.flags.labels ? normalizeLabels(args.flags.labels) : existing.labels || {},
    dockerSocket: args.flags['docker-socket'] || existing.dockerSocket || '/var/run/docker.sock',
    k3sNode: args.flags['k3s-node'] || existing.k3sNode || name,
  };
  if ((roles.includes('harness') || roles.includes('k3s')) && !node.ip) {
    throw new Error('Nodes with harness or k3s roles require --ip');
  }
  state.nodes[name] = node;
  await saveState(state);
  process.stdout.write(`${JSON.stringify(nodeSummary(node), null, 2)}\n`);
}

async function commandDoctor() {
  const required = ['node', 'git', 'ssh'];
  let failures = 0;
  for (const command of required) {
    const present = await commandExists(command);
    process.stdout.write(`${present ? 'ok ' : 'ERR'} ${command}\n`);
    if (!present) failures += 1;
  }
  const state = await loadState();
  const harnessNodes = selectNodesByRole(state, 'harness');
  if (harnessNodes.length > 0) {
    try {
      await doctorHarnessNodes(harnessNodes);
    } catch {
      failures += 1;
    }
  }
  if (failures > 0) throw new Error(`Lab doctor found ${failures} problem(s)`);
}

async function commandRunner(action, args) {
  const name = args.positional[2];
  const state = await loadState();
  const node = requireNode(state, name);
  if (action === 'labels') {
    process.stdout.write(`${runnerLabels(node).join(',')}\n`);
    return;
  }
  if (action === 'configure') {
    await configureRunner(node, args.flags.repo, {service: args.flags.service === true});
    return;
  }
  throw new Error(`Unknown runner action: ${action}`);
}

async function commandHarness(action, args) {
  const state = await loadState();
  const nodes = selectNodesByRole(state, 'harness', csv(args.flags.nodes));
  if (action === 'doctor') return doctorHarnessNodes(nodes);
  if (action !== 'run') throw new Error(`Unknown harness action: ${action}`);
  const scenario = args.positional[2] || null;
  await runHarness({
    nodes,
    scenario,
    baseConfig: args.flags.base,
    nodesPerHost: args.flags['nodes-per-host'] ? Number(args.flags['nodes-per-host']) : undefined,
    dryRun: args.flags['dry-run'] === true,
    extraArgs: args.passthrough,
  });
}

async function commandK3s(action, args) {
  const state = await loadState();
  const name = args.positional[2];
  const serverName = args.flags.server || (action === 'init-server' ? name : null);
  const server = serverName ? requireNode(state, serverName) : null;
  if (action === 'init-server') {
    return initK3sServer(requireNode(state, name), {version: args.flags.version});
  }
  if (!server) throw new Error(`k3s ${action} requires --server SERVER`);
  if (action === 'join') return joinK3sNode(requireNode(state, name), server);
  if (action === 'status') return k3sKubectl(server, ['get', 'nodes', '-o', 'wide']);
  if (action === 'labels') return syncK3sLabels(server, selectNodesByRole(state, 'k3s'));
  if (action === 'cordon' || action === 'uncordon') {
    const node = requireNode(state, name);
    return k3sKubectl(server, [action, node.k3sNode || node.name]);
  }
  if (action === 'drain') {
    const node = requireNode(state, name);
    return k3sKubectl(server, [
      'drain', node.k3sNode || node.name,
      '--ignore-daemonsets', '--delete-emptydir-data',
    ]);
  }
  throw new Error(`Unknown k3s action: ${action}`);
}

async function commandTest(profile) {
  const commands = {
    changed: ['npm', ['test']],
    smoke: ['npm', ['run', 'test:smoke']],
    gate: ['npm', ['run', 'test:gate']],
    postpush: ['npm', ['run', 'test:gate:postpush']],
    all: ['npm', ['run', 'test:all']],
  };
  const selected = commands[profile];
  if (!selected) throw new Error(`Unknown test profile: ${profile}`);
  await run(selected[0], selected[1]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];
  const action = args.positional[1];
  if (!command || command === 'help' || args.flags.help) return usage();
  if (command === 'init') return commandInit();
  if (command === 'list') return commandList();
  if (command === 'doctor') return commandDoctor();
  if (command === 'node') return commandNode(action, args);
  if (command === 'runner') return commandRunner(action, args);
  if (command === 'harness') return commandHarness(action, args);
  if (command === 'k3s') return commandK3s(action, args);
  if (command === 'test') return commandTest(action);
  throw new Error(`Unknown lab command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`lab: ${error.message}\n`);
  process.exitCode = 1;
});
