import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {reserveLocalPort, run, waitForDockerPing} from './process.js';
import {
  DISTRIBUTED_EXECUTION_ENV,
  DISTRIBUTED_EXECUTION_TARGET,
} from '../../test/distributed/harness/constants.js';

const DEFAULT_BASE_CONFIG = 'test/distributed/config/local-three-node.json';
const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock';
const TEXT_ENCODING = 'utf8';
const JSON_INDENT = 2;
const SSH = 'ssh';
const SSH_OPTION = '-o';
const SSH_OPTIONS = Object.freeze({
  BATCH_MODE: 'BatchMode=yes',
  EXIT_ON_FORWARD_FAILURE: 'ExitOnForwardFailure=yes',
  SERVER_ALIVE_INTERVAL: 'ServerAliveInterval=15',
  SERVER_ALIVE_COUNT_MAX: 'ServerAliveCountMax=3',
});
const SSH_NO_COMMAND = '-N';
const SSH_LOCAL_FORWARD = '-L';
const LOOPBACK_HOST = '127.0.0.1';
const STDIO_IGNORE = 'ignore';
const STDIO_INHERIT = 'inherit';
const TUNNEL_STDIO = Object.freeze([STDIO_IGNORE, STDIO_INHERIT, STDIO_INHERIT]);
const CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit'});
const SIGNAL = Object.freeze({TERM: 'SIGTERM', KILL: 'SIGKILL'});
const TUNNEL_STOP_GRACE_MS = 1500;
const OS_LINUX = 'linux';
const DOCKER_INFO = Object.freeze(['docker', 'info', '--format', '{{.ServerVersion}}']);
const MIN_PHYSICAL_HOSTS = 2;
const MIN_CONFIG_SIZE = 1;
const DEFAULT_SCENARIO_PART = 'matrix';
const NAME_SEPARATOR = '-';
const CONFIG_DIR = Object.freeze({ROOT: '.tmp', LEAF: 'home-lab'});
const HARNESS_RUNNER = 'test/distributed/run.js';
const HARNESS_ARG = Object.freeze({
  CONFIG: '--config',
  SCENARIO: '--scenario',
  VERBOSE: '--verbose',
  NO_FAST_LOCAL: '--no-fast-local',
});
const ERROR_TEXT = Object.freeze({
  NO_HARNESS_NODES: 'No nodes with the harness role were selected',
  TOO_FEW_HOSTS: 'Physical harness runs require at least two Linux Docker hosts; ' +
    'use the existing local Docker config for single-host runs',
});

function sanitizeName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/gu, NAME_SEPARATOR);
}

function startTunnel(node, port) {
  const socket = node.dockerSocket || DEFAULT_DOCKER_SOCKET;
  const args = [
    SSH_OPTION, SSH_OPTIONS.BATCH_MODE,
    SSH_OPTION, SSH_OPTIONS.EXIT_ON_FORWARD_FAILURE,
    SSH_OPTION, SSH_OPTIONS.SERVER_ALIVE_INTERVAL,
    SSH_OPTION, SSH_OPTIONS.SERVER_ALIVE_COUNT_MAX,
    SSH_NO_COMMAND,
    SSH_LOCAL_FORWARD, `${LOOPBACK_HOST}:${port}:${socket}`,
    node.ssh,
  ];
  const child = spawn(SSH, args, {stdio: [...TUNNEL_STDIO]});
  child.on(CHILD_EVENT.ERROR, (error) => {
    process.stderr.write(`SSH tunnel for ${node.name} failed: ${error.message}\n`);
  });
  return {child, args};
}

async function stopTunnel(tunnel) {
  if (!tunnel?.child || tunnel.child.exitCode !== null) return;
  tunnel.child.kill(SIGNAL.TERM);
  await new Promise((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, TUNNEL_STOP_GRACE_MS);
    tunnel.child.once(CHILD_EVENT.EXIT, () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
  if (tunnel.child.exitCode === null) tunnel.child.kill(SIGNAL.KILL);
}

async function buildRemoteConfig(baseConfigPath, nodes, ports, outputPath, nodesPerHost) {
  const base = JSON.parse(await readFile(baseConfigPath, TEXT_ENCODING));
  const size = Number(base.size);
  if (!Number.isSafeInteger(size) || size < MIN_CONFIG_SIZE) {
    throw new Error(`Base config ${baseConfigPath} has no valid size`);
  }
  const perHost = nodesPerHost || Math.ceil(size / nodes.length);
  const config = {
    ...base,
    nodesPerHost: perHost,
    docker: {
      ...(base.docker || {}),
      hosts: ports.map((port) => `tcp://${LOOPBACK_HOST}:${port}`),
      hostInfo: nodes.map((node) => ({
        internalIp: node.ip,
        externalIp: node.ip,
      })),
      buildOnHosts: true,
    },
  };
  delete config.gcp;
  delete config.docker.socketPath;
  delete config.docker.tls;
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(config, null, JSON_INDENT)}\n`);
  return config;
}

function validateHarnessNodes(nodes) {
  if (nodes.length === 0) throw new Error(ERROR_TEXT.NO_HARNESS_NODES);
  for (const node of nodes) {
    if (!node.ssh) throw new Error(`Harness node ${node.name} needs an ssh target`);
    if (!node.ip) throw new Error(`Harness node ${node.name} needs a LAN ip`);
    if (node.os && node.os !== OS_LINUX) {
      throw new Error(`Harness node ${node.name} must be Linux; got ${node.os}`);
    }
  }
}

export function buildHarnessRunnerArgs({
  configPath,
  scenario,
  verbose = true,
  extraArgs = [],
}) {
  const args = [HARNESS_RUNNER, HARNESS_ARG.CONFIG, configPath];
  if (scenario) args.push(HARNESS_ARG.SCENARIO, scenario);
  if (verbose) args.push(HARNESS_ARG.VERBOSE);
  // Physical-host runs must never be converted back into the single-host
  // bind-mount path by a passthrough flag. Put the hard invariant last so
  // the distributed runner's last-option-wins parser cannot override it.
  args.push(...extraArgs, HARNESS_ARG.NO_FAST_LOCAL);
  return args;
}

export async function doctorHarnessNodes(nodes) {
  validateHarnessNodes(nodes);
  let failures = 0;
  for (const node of nodes) {
    try {
      const args = [SSH_OPTION, SSH_OPTIONS.BATCH_MODE, node.ssh, ...DOCKER_INFO];
      await run(SSH, args, {stdio: STDIO_IGNORE});
      process.stdout.write(`ok  ${node.name} (${node.ip}) docker reachable\n`);
    } catch (error) {
      failures += 1;
      process.stdout.write(`ERR ${node.name}: ${error.message}\n`);
    }
  }
  if (failures > 0) throw new Error(`${failures} harness node(s) failed doctor`);
}

export async function runHarness({
  nodes,
  scenario,
  baseConfig = DEFAULT_BASE_CONFIG,
  nodesPerHost,
  verbose = true,
  extraArgs = [],
  dryRun = false,
  environment = process.env,
}) {
  validateHarnessNodes(nodes);
  if (nodes.length < MIN_PHYSICAL_HOSTS) {
    throw new Error(ERROR_TEXT.TOO_FEW_HOSTS);
  }
  const absoluteBase = resolve(baseConfig);
  const timestamp = new Date().toISOString().replace(/[:.]/gu, NAME_SEPARATOR);
  const scenarioPart = sanitizeName(scenario || DEFAULT_SCENARIO_PART);
  const configPath = resolve(CONFIG_DIR.ROOT, CONFIG_DIR.LEAF, `${scenarioPart}-${timestamp}.json`);
  const ports = [];
  for (let index = 0; index < nodes.length; index += 1) {
    ports.push(await reserveLocalPort());
  }
  if (dryRun) {
    await buildRemoteConfig(absoluteBase, nodes, ports, configPath, nodesPerHost);
    process.stdout.write(`Would write config: ${configPath}\n`);
    nodes.forEach((node, index) => {
      const socket = node.dockerSocket || DEFAULT_DOCKER_SOCKET;
      process.stdout.write(
        `ssh -N -L ${LOOPBACK_HOST}:${ports[index]}:${socket} ${node.ssh}\n`,
      );
    });
    return;
  }

  const tunnels = [];
  try {
    for (let index = 0; index < nodes.length; index += 1) {
      const tunnel = startTunnel(nodes[index], ports[index]);
      tunnels.push(tunnel);
      await waitForDockerPing(ports[index]);
      process.stdout.write(
        `tunnel ${nodes[index].name} -> ${LOOPBACK_HOST}:${ports[index]} ready\n`,
      );
    }
    await buildRemoteConfig(absoluteBase, nodes, ports, configPath, nodesPerHost);
    const args = buildHarnessRunnerArgs({
      configPath,
      scenario,
      verbose,
      extraArgs,
    });
    const childEnvironment = {
      ...environment,
      [DISTRIBUTED_EXECUTION_ENV.TARGET]: DISTRIBUTED_EXECUTION_TARGET.LAB,
      [DISTRIBUTED_EXECUTION_ENV.HOSTS]: nodes
        .map((node) => node.name)
        .join(','),
    };
    await run(process.execPath, args, {env: childEnvironment});
  } finally {
    await Promise.all(tunnels.map(stopTunnel));
  }
}
