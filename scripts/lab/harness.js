import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {LAB_HOLD, holdLabMachine, labHolderText} from './probe.js';
import {capture, reserveLocalPort, run, waitForDockerPing} from './process.js';
import {
  CLI,
  DISTRIBUTED_EXECUTION_ENV,
  DISTRIBUTED_EXECUTION_TARGET,
  EXIT_CODES,
} from '../../test/distributed/harness/constants.js';
import {
  SCENARIO_OUTCOME,
  outcomeOfRunnerExit,
} from '../../test/distributed/harness/scenario-outcome.js';
import {
  commitIdentityProblem,
  observeCommitIdentity,
} from '../../test/distributed/harness/certification-image-identity.js';
import {
  evaluateScenarioCertificationTopology,
} from '../../test/distributed/harness/scenario-host-topology.js';

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
const HOST_LIST_SEPARATOR = ',';
const CONFIG_DIR = Object.freeze({ROOT: '.tmp', LEAF: 'home-lab'});
const HARNESS_RUNNER = 'test/distributed/run.js';
const HARNESS_ARG = Object.freeze({
  CONFIG: '--config',
  SCENARIO: '--scenario',
  VERBOSE: '--verbose',
  NO_FAST_LOCAL: '--no-fast-local',
});
// A formation's budget on the lab: how long it waits, altogether, for every
// node's machine-wide lock, and how long its holder records tell other agents
// to expect it to hold them. The distributed runner has no overall deadline
// of its own, so this is the harness's stated one.
const HARNESS_BUDGET_MS = 30 * 60 * 1000;
const HARNESS_PURPOSE = 'formation:';
const HARNESS_REFUSAL = Object.freeze({
  PREFIX: 'harness: node ',
  BUSY: ' busy, ',
  FAILED: ' could not be held: ',
});
// The machine identity the lab fleet itself uses to say "same machine as"
// (probe.js CAPABILITY_SCRIPT boot_id): the kernel's per-boot id, which no
// two running machines share - unlike /etc/machine-id, which cloned lab
// installs share. Observed over the node's own ssh target before a
// formation, and declared in the config as hostInfo.machineId: the
// harness's host authority (test/distributed/harness/scenario-host-topology.js).
const MACHINE_ID_COMMAND = 'cat /proc/sys/kernel/random/boot_id';
const MACHINE_ID_DEADLINE_MS = 15000;
const MACHINE_ID_PATTERN = /^[0-9a-f-]{16,64}$/u;
const MACHINE_OBSERVATION = Object.freeze({
  OBSERVED: 'observed',
  UNREACHABLE: 'unreachable',
  UNREADABLE: 'unreadable',
});
const HARNESS_REFUSED_TEXT = 'harness: scenario REFUSED (not run) - the ' +
  'config\'s host topology cannot carry its claim; see the run report: ';
const HARNESS_NOT_CERTIFIED_TEXT = 'harness: NOT CERTIFIED - the run ' +
  'requested certification and its report\'s certification block is not ' +
  '`certified: true` (scenario outcomes unchanged): ';
// A certification run (`--certify SHA`): one node per distinct machine,
// each machine observed by its boot id, from a clean checkout at SHA, for
// a scenario that declares SCENARIO_CERTIFICATION_REQUIREMENT
// (test/distributed/harness/scenario-certification.js). Every check runs
// before any node is held; a failed check refuses the whole run.
const CERTIFICATION_NODES_PER_HOST = 1;
const UNKNOWN_COUNT = 'unknown';
const ARG_SEPARATOR = ' ';
const SCENARIO_DIR = 'test/distributed/scenarios';
const SCENARIO_SUFFIX = '.js';
const CERTIFICATION_REFUSED = 'harness: certification refused (nothing held, ' +
  'nothing run): ';
const CERTIFICATION_TEXT = Object.freeze({
  NO_SCENARIO: 'certification names exactly one scenario',
  NO_MODULE: 'no scenario module ',
  UNDECLARED: ' declares no SCENARIO_CERTIFICATION_REQUIREMENT',
  NODES_PER_HOST: 'certification places one node per machine; ' +
    '--nodes-per-host must be 1 or omitted, got ',
  SHARED_MACHINE: 'selected nodes share one machine (boot id ',
  PASSTHROUGH: 'request certification with --certify SHA, not as a runner ' +
    'passthrough argument',
  TOPOLOGY: 'the generated config cannot certify: ',
  UNPLACED: ': no node placed (not observed, held or tunneled)\n',
});

const ERROR_TEXT = Object.freeze({
  MACHINE_ID: 'harness: no machine identity for node ',
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

// A refused scenario is not a failed one, and an uncertified certification
// run is neither: say so, keep the exit code.
function nameRefusedRun(error) {
  if (outcomeOfRunnerExit(error?.exitCode) === SCENARIO_OUTCOME.REFUSED) {
    error.message = `${HARNESS_REFUSED_TEXT}${error.message}`;
  } else if (error?.exitCode === EXIT_CODES.NOT_CERTIFIED) {
    error.message = `${HARNESS_NOT_CERTIFIED_TEXT}${error.message}`;
  }
  throw error;
}

function refuseCertification(detail) {
  throw new Error(`${CERTIFICATION_REFUSED}${detail}`);
}

async function loadCertificationRequirement(scenario) {
  if (!scenario) refuseCertification(CERTIFICATION_TEXT.NO_SCENARIO);
  const modulePath = resolve(SCENARIO_DIR, `${sanitizeName(scenario)}${SCENARIO_SUFFIX}`);
  if (!existsSync(modulePath)) {
    refuseCertification(`${CERTIFICATION_TEXT.NO_MODULE}${modulePath}`);
  }
  const requirement =
    (await import(pathToFileURL(modulePath).href)).SCENARIO_CERTIFICATION_REQUIREMENT;
  if (!requirement) refuseCertification(`${scenario}${CERTIFICATION_TEXT.UNDECLARED}`);
  return requirement;
}

// Two selected nodes on one kernel (one boot id) are one machine.
function refuseSharedMachines(nodes, machineIds) {
  const byMachine = new Map();
  machineIds.forEach((machineId, index) => {
    byMachine.set(machineId, [...(byMachine.get(machineId) || []), nodes[index].name]);
  });
  for (const [machineId, names] of byMachine) {
    if (names.length > 1) {
      refuseCertification(`${CERTIFICATION_TEXT.SHARED_MACHINE}${machineId}): ` +
        names.join(HOST_LIST_SEPARATOR));
    }
  }
}

/**
 * Everything a certification run checks before any node is held: the
 * checkout is clean at the requested sha, the scenario declares its
 * certification topology, one node per machine, and every selected node's
 * machine is observed (boot id) and distinct.
 * @param {Object} input
 * @return {Promise<{identity, requirement, machineIds}>}
 */
export async function prepareCertificationRun({nodes, scenario, certify,
  nodesPerHost, extraArgs = [], observeMachine, readCommitIdentity = observeCommitIdentity}) {
  if (extraArgs.includes(CLI.ARG_CERTIFY)) refuseCertification(CERTIFICATION_TEXT.PASSTHROUGH);
  const identity = readCommitIdentity({requestedSha: certify});
  const problem = commitIdentityProblem(identity);
  if (problem !== null) refuseCertification(problem);
  if (nodesPerHost !== undefined && nodesPerHost !== CERTIFICATION_NODES_PER_HOST) {
    refuseCertification(`${CERTIFICATION_TEXT.NODES_PER_HOST}${nodesPerHost}`);
  }
  const requirement = await loadCertificationRequirement(scenario);
  const machineIds = await observeMachineIdentities(nodes, observeMachine)
    .catch((error) => refuseCertification(error.message));
  refuseSharedMachines(nodes, machineIds);
  return {identity, machineIds, requirement};
}

function refuseUncertifiableConfig(requirement, config) {
  const topology = evaluateScenarioCertificationTopology(requirement, config);
  if (!topology.met) {
    refuseCertification(`${CERTIFICATION_TEXT.TOPOLOGY}${topology.reason} ` +
      `(${topology.nodes?.length ?? 0} node(s), at most ` +
      `${topology.maxNodesOnOneHost ?? UNKNOWN_COUNT} on one host, ` +
      `${topology.distinctHosts ?? UNKNOWN_COUNT} distinct host(s))`);
  }
  return topology;
}

function printCertificationDryRun(write, nodes, prepared, topology, args) {
  write(`Certification: sha ${prepared.identity.headSha} ` +
    `(clean), scenario requirement ${JSON.stringify(prepared.requirement)}\n`);
  nodes.forEach((node, index) => {
    write(`  node ${index} -> ${node.name} (${node.ip}) ` +
      `machine ${prepared.machineIds[index]}\n`);
  });
  write(`Certification topology: ${topology.nodes.length} ` +
    `node(s) on ${topology.distinctHosts} distinct machine(s), at most ` +
    `${topology.maxNodesOnOneHost} per machine: met\n`);
  write(`Would run: node ${args.join(ARG_SEPARATOR)}\n`);
}

function observeBootId(node) {
  return capture(SSH, [SSH_OPTION, SSH_OPTIONS.BATCH_MODE, node.ssh,
    MACHINE_ID_COMMAND], {timeoutMs: MACHINE_ID_DEADLINE_MS});
}

/**
 * Each harness node's observed machine identity, in node order. A node whose
 * identity cannot be observed refuses the formation: two providers on one
 * machine must count once, and missing topology is never a host.
 * @param {Array<Object>} nodes
 * @param {Function} [observe] (node) => Promise<string> boot id
 * @return {Promise<Array<string>>}
 */
export async function observeMachineIdentities(nodes, observe = observeBootId) {
  const identities = [];
  for (const node of nodes) {
    const observation = await observeOneMachine(node, observe);
    if (observation.state !== MACHINE_OBSERVATION.OBSERVED) {
      throw new Error(`${ERROR_TEXT.MACHINE_ID}${node.name}: ` +
        observation.detail);
    }
    identities.push(`boot:${observation.bootId}`);
  }
  return identities;
}

// One node's observed boot id, or the named reason there is none.
async function observeOneMachine(node, observe) {
  let text;
  try {
    text = String(await observe(node)).trim();
  } catch (error) {
    return {state: MACHINE_OBSERVATION.UNREACHABLE, detail: error.message};
  }
  if (!MACHINE_ID_PATTERN.test(text)) {
    return {state: MACHINE_OBSERVATION.UNREADABLE,
      detail: `unreadable boot id ${JSON.stringify(text)}`};
  }
  return {state: MACHINE_OBSERVATION.OBSERVED, bootId: text};
}

export async function buildRemoteConfig(baseConfigPath, nodes, ports, outputPath, nodesPerHost,
  machineIds = null) {
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
      hostInfo: nodes.map((node, index) => ({
        internalIp: node.ip,
        externalIp: node.ip,
        ...(machineIds ? {machineId: machineIds[index]} : {}),
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

// Every node a formation uses, held under the lab convention before any node
// starts: one at a time in name order, so two formations cannot each hold
// half of the other's nodes, within one budget. A node another run holds
// refuses the whole formation, typed and naming the holder, after releasing
// every hold already taken - never half a formation.
async function holdHarnessNodes(nodes, scenarioPart, hold) {
  const sessions = [];
  const deadline = Date.now() + HARNESS_BUDGET_MS;
  const ordered = [...nodes].sort((left, right) => (left.name < right.name ? -1 : 1));
  for (const node of ordered) {
    const session = hold({name: node.name, sshTarget: node.ssh}, {
      waitMs: deadline - Date.now(), purpose: `${HARNESS_PURPOSE}${scenarioPart}`,
      expectedMs: HARNESS_BUDGET_MS,
    });
    sessions.push(session);
    const outcome = await session.outcome;
    if (outcome.state !== LAB_HOLD.HELD) {
      await releaseHolds(sessions);
      throw new Error(`${HARNESS_REFUSAL.PREFIX}${node.name}` +
        (outcome.state === LAB_HOLD.BUSY ?
          `${HARNESS_REFUSAL.BUSY}${labHolderText(outcome.holder)}` :
          `${HARNESS_REFUSAL.FAILED}${outcome.reason}`));
    }
  }
  return sessions;
}

function releaseHolds(sessions) {
  return Promise.all(sessions.map((session) => session.release()));
}

export async function runHarness({
  nodes,
  scenario,
  baseConfig = DEFAULT_BASE_CONFIG,
  nodesPerHost,
  verbose = true,
  extraArgs = [],
  dryRun = false,
  hold = holdLabMachine,
  environment = process.env,
  // Injectable boot-id observer; observeMachineIdentities defaults it.
  observeMachine,
  // `--certify SHA`: a certification run (see prepareCertificationRun).
  certify = null,
  readCommitIdentity,
  write = (text) => process.stdout.write(text),
}) {
  validateHarnessNodes(nodes);
  if (nodes.length < MIN_PHYSICAL_HOSTS) {
    throw new Error(ERROR_TEXT.TOO_FEW_HOSTS);
  }
  if (certify === null && extraArgs.includes(CLI.ARG_CERTIFY)) {
    refuseCertification(CERTIFICATION_TEXT.PASSTHROUGH);
  }
  if (certify !== null) {
    return runCertificationHarness({nodes, scenario, baseConfig, nodesPerHost,
      verbose, extraArgs, dryRun, hold, environment, observeMachine, certify,
      readCommitIdentity, write});
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

  const holds = await holdHarnessNodes(nodes, scenarioPart, hold);
  const tunnels = [];
  try {
    const machineIds = await observeMachineIdentities(nodes, observeMachine);
    await openTunnels(nodes, ports, tunnels);
    await buildRemoteConfig(absoluteBase, nodes, ports, configPath, nodesPerHost,
      machineIds);
    const args = buildHarnessRunnerArgs({
      configPath,
      scenario,
      verbose,
      extraArgs,
    });
    await runFormation(args, nodes, environment);
  } finally {
    await Promise.all(tunnels.map(stopTunnel));
    await releaseHolds(holds);
  }
}

async function openTunnels(nodes, ports, tunnels) {
  for (let index = 0; index < nodes.length; index += 1) {
    tunnels.push(startTunnel(nodes[index], ports[index]));
    await waitForDockerPing(ports[index]);
    process.stdout.write(
      `tunnel ${nodes[index].name} -> ${LOOPBACK_HOST}:${ports[index]} ready\n`,
    );
  }
}

function runFormation(args, nodes, environment) {
  const childEnvironment = {
    ...environment,
    [DISTRIBUTED_EXECUTION_ENV.TARGET]: DISTRIBUTED_EXECUTION_TARGET.LAB,
    [DISTRIBUTED_EXECUTION_ENV.HOSTS]: nodes
      .map((node) => node.name)
      .join(HOST_LIST_SEPARATOR),
  };
  return run(process.execPath, args, {env: childEnvironment})
    .catch(nameRefusedRun);
}

// One node per machine: the base config's size names how many machines get
// a node. A listed machine beyond them gets none, so it is neither
// observed, held nor tunneled.
async function placedCertificationNodes(baseConfig, nodes) {
  const size = Number(JSON.parse(await readFile(resolve(baseConfig),
    TEXT_ENCODING)).size);
  return Number.isSafeInteger(size) && size >= MIN_CONFIG_SIZE ?
    nodes.slice(0, size) :
    nodes;
}

// A certification run: every check before any hold, the config generated
// with one node per observed machine, the runner asked for the verdict.
async function runCertificationHarness(options) {
  const {scenario, baseConfig, verbose, extraArgs, dryRun, hold,
    environment, certify, write} = options;
  const nodes = await placedCertificationNodes(baseConfig, options.nodes);
  const prepared = await prepareCertificationRun({...options, nodes});
  const timestamp = new Date().toISOString().replace(/[:.]/gu, NAME_SEPARATOR);
  const configPath = resolve(CONFIG_DIR.ROOT, CONFIG_DIR.LEAF,
    `${sanitizeName(scenario)}-certify-${timestamp}.json`);
  const ports = [];
  for (let index = 0; index < nodes.length; index += 1) {
    ports.push(await reserveLocalPort());
  }
  const config = await buildRemoteConfig(resolve(baseConfig), nodes, ports, configPath,
    CERTIFICATION_NODES_PER_HOST, prepared.machineIds);
  const topology = refuseUncertifiableConfig(prepared.requirement, config);
  const args = buildHarnessRunnerArgs({configPath, scenario, verbose,
    extraArgs: [...extraArgs, CLI.ARG_CERTIFY, certify]});
  if (dryRun) {
    write(`Would write config: ${configPath}\n`);
    printCertificationDryRun(write, nodes, prepared, topology, args);
    for (const unplaced of options.nodes.slice(nodes.length)) {
      write(`  ${unplaced.name}${CERTIFICATION_TEXT.UNPLACED}`);
    }
    return;
  }
  const holds = await holdHarnessNodes(nodes, sanitizeName(scenario), hold);
  const tunnels = [];
  try {
    await openTunnels(nodes, ports, tunnels);
    await runFormation(args, nodes, environment);
  } finally {
    await Promise.all(tunnels.map(stopTunnel));
    await releaseHolds(holds);
  }
}
