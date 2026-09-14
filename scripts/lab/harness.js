import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {reserveLocalPort, run, waitForDockerPing} from './process.js';

const DEFAULT_BASE_CONFIG = 'test/distributed/config/local-three-node.json';
const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock';

function sanitizeName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/gu, '-');
}

function startTunnel(node, port) {
  const socket = node.dockerSocket || DEFAULT_DOCKER_SOCKET;
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-N',
    '-L', `127.0.0.1:${port}:${socket}`,
    node.ssh,
  ];
  const child = spawn('ssh', args, {stdio: ['ignore', 'inherit', 'inherit']});
  child.on('error', (error) => {
    process.stderr.write(`SSH tunnel for ${node.name} failed: ${error.message}\n`);
  });
  return {child, args};
}

async function stopTunnel(tunnel) {
  if (!tunnel?.child || tunnel.child.exitCode !== null) return;
  tunnel.child.kill('SIGTERM');
  await new Promise((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, 1500);
    tunnel.child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
  if (tunnel.child.exitCode === null) tunnel.child.kill('SIGKILL');
}

async function buildRemoteConfig(baseConfigPath, nodes, ports, outputPath, nodesPerHost) {
  const base = JSON.parse(await readFile(baseConfigPath, 'utf8'));
  const size = Number(base.size);
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new Error(`Base config ${baseConfigPath} has no valid size`);
  }
  const perHost = nodesPerHost || Math.ceil(size / nodes.length);
  const config = {
    ...base,
    nodesPerHost: perHost,
    docker: {
      ...(base.docker || {}),
      hosts: ports.map((port) => `tcp://127.0.0.1:${port}`),
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
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function validateHarnessNodes(nodes) {
  if (nodes.length === 0) throw new Error('No nodes with the harness role were selected');
  for (const node of nodes) {
    if (!node.ssh) throw new Error(`Harness node ${node.name} needs an ssh target`);
    if (!node.ip) throw new Error(`Harness node ${node.name} needs a LAN ip`);
    if (node.os && node.os !== 'linux') {
      throw new Error(`Harness node ${node.name} must be Linux; got ${node.os}`);
    }
  }
}

export async function doctorHarnessNodes(nodes) {
  validateHarnessNodes(nodes);
  let failures = 0;
  for (const node of nodes) {
    try {
      const args = [
        '-o', 'BatchMode=yes',
        node.ssh,
        'docker', 'info', '--format', '{{.ServerVersion}}',
      ];
      await run('ssh', args, {stdio: 'ignore'});
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
}) {
  validateHarnessNodes(nodes);
  if (nodes.length < 2) {
    throw new Error(
      'Physical harness runs require at least two Linux Docker hosts; ' +
      'use the existing local Docker config for single-host runs',
    );
  }
  const absoluteBase = resolve(baseConfig);
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const scenarioPart = sanitizeName(scenario || 'matrix');
  const configPath = resolve('.tmp', 'home-lab', `${scenarioPart}-${timestamp}.json`);
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
        `ssh -N -L 127.0.0.1:${ports[index]}:${socket} ${node.ssh}\n`,
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
      process.stdout.write(`tunnel ${nodes[index].name} -> 127.0.0.1:${ports[index]} ready\n`);
    }
    await buildRemoteConfig(absoluteBase, nodes, ports, configPath, nodesPerHost);
    const args = ['test/distributed/run.js', '--config', configPath];
    if (scenario) args.push('--scenario', scenario);
    if (verbose) args.push('--verbose');
    args.push('--no-fast-local', ...extraArgs);
    await run(process.execPath, args);
  } finally {
    await Promise.all(tunnels.map(stopTunnel));
  }
}
