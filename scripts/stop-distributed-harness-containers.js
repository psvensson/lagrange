#!/usr/bin/env node

import process from 'node:process';
import {execFile} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {DockerProvider} from '../test/distributed/harness/docker-provider.js';
import {
  DOCKER_DEFAULTS,
  EXIT_CODES,
  LABELS,
} from '../test/distributed/harness/constants.js';

const ARG_HELP = '--help';
const ARG_DRY_RUN = '--dry-run';
const ARG_REMOVE = '--remove';
const ARG_SOCKET_PATH = '--socket-path';
const ARG_JSON = '--json';
const ARG_CONTAINERS_ONLY = '--containers-only';
const ARG_PROCESSES_ONLY = '--processes-only';
const REUSE_CONTAINER_NAME_PREFIX = 'ddb-test-reuse-';
const NON_REUSE_CONTAINER_NAME_PATTERN = /^ddb-test-[0-9a-f]{8}-/u;
const CONTAINER_STATE_RUNNING = 'running';
const STATUS_UP_PREFIX = 'up ';
const LEADING_SLASH_PATTERN = /^\/+/u;
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const JSON_INDENT = 2;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const PROCESS_ARG_SCRIPT_INDEX = 1;

const USAGE_LINES = Object.freeze([
  'Usage:',
  '  npm run distributed:stop-containers',
  '  npm run distributed:stop-containers -- --dry-run',
  '  npm run distributed:stop-containers -- --remove',
  '',
  'Options:',
  '  --dry-run              List matching containers and processes without stopping them.',
  '  --remove               Remove matching containers after stopping them.',
  `  --socket-path <path>    Docker socket path (default: ${DOCKER_DEFAULTS.socketPath}).`,
  '  --containers-only      Skip stopping local harness processes.',
  '  --processes-only       Skip stopping Docker containers; only stop local harness processes.',
  '  --json                 Print the machine-readable result.',
  '  --help                 Show this help.',
]);

const HARNESS_PROCESS_PATTERNS = Object.freeze([
  'test/distributed/run.js',
  'test/distributed/validate-node-join-under-load.js',
  'scripts/run-all-distributed-scenarios.sh',
  'scripts/rerun-failed-distributed-scenarios.sh',
]);
const PS_COMMAND = 'ps';
const PS_ARGS = Object.freeze(['-eo', 'pid=,ppid=,args=']);
const SIGTERM = 'SIGTERM';
const SIGKILL = 'SIGKILL';
const PS_LINE_PATTERN = /^\s*(\d+)\s+(\d+)\s+(.*)$/u;
const KILL_GRACE_MS = 2000;

function parseArgs(argv = []) {
  const parsed = {
    dryRun: false,
    remove: false,
    socketPath: DOCKER_DEFAULTS.socketPath,
    json: false,
    help: false,
    containersOnly: false,
    processesOnly: false,
  };

  for (let index = NUM_ZERO; index < argv.length; index += NUM_ONE) {
    const token = argv[index];
    if (token === ARG_HELP) {
      parsed.help = true;
    } else if (token === ARG_DRY_RUN) {
      parsed.dryRun = true;
    } else if (token === ARG_REMOVE) {
      parsed.remove = true;
    } else if (token === ARG_JSON) {
      parsed.json = true;
    } else if (token === ARG_CONTAINERS_ONLY) {
      parsed.containersOnly = true;
    } else if (token === ARG_PROCESSES_ONLY) {
      parsed.processesOnly = true;
    } else if (token === ARG_SOCKET_PATH && index + NUM_ONE < argv.length) {
      parsed.socketPath = argv[index + NUM_ONE];
      index += NUM_ONE;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (parsed.containersOnly && parsed.processesOnly) {
    throw new Error(
      'Cannot combine --containers-only with --processes-only.',
    );
  }

  return parsed;
}

function normalizeContainerName(name) {
  return String(name || EMPTY_TEXT)
    .replace(LEADING_SLASH_PATTERN, EMPTY_TEXT)
    .trim();
}

function getContainerNames(container = {}) {
  if (!Array.isArray(container.Names)) {
    return [];
  }
  return container.Names
    .map(normalizeContainerName)
    .filter((name) => name.length > NUM_ZERO);
}

function getContainerLabels(container = {}) {
  return container.Labels && typeof container.Labels === 'object' ?
    container.Labels :
    {};
}

function hasHarnessLabel(container = {}) {
  const labels = getContainerLabels(container);
  return Object.keys(labels).some((key) =>
    key === LABELS.CLUSTER ||
    key === LABELS.NODE_ID ||
    key === LABELS.ROLE ||
    key === LABELS.SCENARIO ||
    key.startsWith(`${LABELS.PREFIX}.`));
}

function hasHarnessName(container = {}) {
  return getContainerNames(container).some((name) =>
    name.startsWith(REUSE_CONTAINER_NAME_PREFIX) ||
    NON_REUSE_CONTAINER_NAME_PATTERN.test(name));
}

function isHarnessContainer(container = {}) {
  return hasHarnessLabel(container) || hasHarnessName(container);
}

function getContainerId(container = {}) {
  return String(container.Id || container.ID || container.id || EMPTY_TEXT);
}

function getContainerDisplayName(container = {}) {
  const [name] = getContainerNames(container);
  return name || getContainerId(container) || 'unknown-container';
}

function isContainerRunning(container = {}) {
  const state = String(container.State || EMPTY_TEXT).toLowerCase();
  if (state === CONTAINER_STATE_RUNNING) {
    return true;
  }
  const status = String(container.Status || EMPTY_TEXT).toLowerCase();
  return status.startsWith(STATUS_UP_PREFIX);
}

function summarizeResults(results = []) {
  const matched = results.length;
  const stopped = results.filter((result) => result.stopped).length;
  const removed = results.filter((result) => result.removed).length;
  const errors = results.filter((result) => result.error);
  return {
    matched,
    stopped,
    removed,
    errors: errors.length,
    results,
  };
}

function parsePsLine(line) {
  const match = PS_LINE_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const pid = Number(match[NUM_ONE]);
  const ppid = Number(match[NUM_ONE + NUM_ONE]);
  const command = match[NUM_ONE + NUM_ONE + NUM_ONE].trim();
  if (!Number.isInteger(pid) || pid <= NUM_ZERO) {
    return null;
  }
  return {pid, ppid, command};
}

function parsePsOutput(text = EMPTY_TEXT) {
  return String(text || EMPTY_TEXT)
    .split(NEWLINE)
    .map(parsePsLine)
    .filter((entry) => entry !== null);
}

function commandMatchesHarnessPattern(command = EMPTY_TEXT) {
  const normalized = String(command || EMPTY_TEXT);
  return HARNESS_PROCESS_PATTERNS.some((pattern) =>
    normalized.includes(pattern));
}

function isHarnessProcess(entry, excludedPids = new Set()) {
  if (!entry || !Number.isInteger(entry.pid)) {
    return false;
  }
  if (excludedPids.has(entry.pid)) {
    return false;
  }
  return commandMatchesHarnessPattern(entry.command);
}

function findHarnessProcesses(psOutput, excludedPids = new Set()) {
  return parsePsOutput(psOutput).filter((entry) =>
    isHarnessProcess(entry, excludedPids));
}

function defaultListProcesses() {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(PS_COMMAND, PS_ARGS, (error, stdout) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise(String(stdout || EMPTY_TEXT));
    });
  });
}

function defaultKillProcess(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error && error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

function defaultSleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function summarizeProcessResults(results = []) {
  const matched = results.length;
  const stopped = results.filter((result) => result.stopped).length;
  const errors = results.filter((result) => result.error).length;
  return {
    matched,
    stopped,
    errors,
    results,
  };
}

async function stopHarnessProcesses(
  options = {},
  hooks = {},
) {
  const listProcesses = hooks.listProcesses || defaultListProcesses;
  const killProcess = hooks.killProcess || defaultKillProcess;
  const sleep = hooks.sleep || defaultSleep;
  const selfPid = Number.isInteger(hooks.selfPid) ?
    hooks.selfPid :
    process.pid;
  const excludedPids = new Set([selfPid, process.ppid].filter(
    (pid) => Number.isInteger(pid) && pid > NUM_ZERO));

  let psOutput = EMPTY_TEXT;
  try {
    psOutput = await listProcesses();
  } catch (error) {
    return {
      matched: NUM_ZERO,
      stopped: NUM_ZERO,
      errors: NUM_ONE,
      results: [],
      error: error?.message || String(error),
    };
  }

  const candidates = findHarnessProcesses(psOutput, excludedPids);
  const results = [];

  for (const candidate of candidates) {
    const result = {
      pid: candidate.pid,
      ppid: candidate.ppid,
      command: candidate.command,
      stopped: false,
      signal: null,
      dryRun: options.dryRun === true,
      error: null,
    };

    if (options.dryRun === true) {
      results.push(result);
      continue;
    }

    try {
      const termDelivered = killProcess(candidate.pid, SIGTERM);
      if (termDelivered) {
        await sleep(KILL_GRACE_MS);
        const stillAlive = killProcess(candidate.pid, NUM_ZERO);
        if (stillAlive) {
          killProcess(candidate.pid, SIGKILL);
          result.signal = SIGKILL;
        } else {
          result.signal = SIGTERM;
        }
        result.stopped = true;
      } else {
        result.stopped = true;
        result.signal = null;
      }
    } catch (error) {
      result.error = error?.message || String(error);
    }

    results.push(result);
  }

  return summarizeProcessResults(results);
}

async function stopHarnessContainers(provider, options = {}) {
  const containers = await provider.listContainers();
  const candidates = containers.filter(isHarnessContainer);
  const results = [];

  for (const container of candidates) {
    const id = getContainerId(container);
    const name = getContainerDisplayName(container);
    const running = isContainerRunning(container);
    const result = {
      id,
      name,
      running,
      stopped: false,
      removed: false,
      dryRun: options.dryRun === true,
      error: null,
    };

    if (!id) {
      result.error = 'missing container id';
      results.push(result);
      continue;
    }

    try {
      if (!options.dryRun && running) {
        await provider.stopContainer(id);
        result.stopped = true;
      }
      if (!options.dryRun && options.remove === true) {
        await provider.removeContainer(id);
        result.removed = true;
      }
    } catch (error) {
      result.error = error?.message || String(error);
    }

    results.push(result);
  }

  return summarizeResults(results);
}

function formatHumanSummary(summary) {
  const containerSummary = summary.containers;
  const processSummary = summary.processes;
  const lines = [];

  if (!containerSummary || containerSummary.skipped) {
    if (containerSummary && containerSummary.skipped) {
      lines.push('Skipped Docker container cleanup.');
    }
  } else if (containerSummary.matched === NUM_ZERO) {
    lines.push('No distributed harness containers found.');
  } else {
    lines.push(
      `Matched ${containerSummary.matched} distributed harness container(s).`,
      `Stopped ${containerSummary.stopped}; removed ${containerSummary.removed}; errors ${containerSummary.errors}.`,
    );
    for (const result of containerSummary.results) {
      const actions = [];
      if (result.dryRun) {
        actions.push('dry-run');
      }
      if (result.stopped) {
        actions.push('stopped');
      }
      if (result.removed) {
        actions.push('removed');
      }
      if (!result.running && !result.removed && !result.dryRun) {
        actions.push('already-stopped');
      }
      if (result.error) {
        actions.push(`error=${result.error}`);
      }
      lines.push(`- ${result.name} (${result.id}): ${actions.join(', ')}`);
    }
  }

  if (!processSummary || processSummary.skipped) {
    if (processSummary && processSummary.skipped) {
      lines.push('Skipped local harness process cleanup.');
    }
  } else if (processSummary.error) {
    lines.push(`Process discovery failed: ${processSummary.error}`);
  } else if (processSummary.matched === NUM_ZERO) {
    lines.push('No distributed harness processes found.');
  } else {
    lines.push(
      `Matched ${processSummary.matched} distributed harness process(es).`,
      `Stopped ${processSummary.stopped}; errors ${processSummary.errors}.`,
    );
    for (const result of processSummary.results) {
      const actions = [];
      if (result.dryRun) {
        actions.push('dry-run');
      }
      if (result.stopped) {
        actions.push(`stopped${result.signal ? ` (${result.signal})` : ''}`);
      }
      if (result.error) {
        actions.push(`error=${result.error}`);
      }
      lines.push(`- pid ${result.pid} (${result.command}): ${actions.join(', ')}`);
    }
  }

  return lines.join(NEWLINE);
}

function computeExitCode(summary) {
  const containerErrors = summary.containers?.errors || NUM_ZERO;
  const processErrors = summary.processes?.errors || NUM_ZERO;
  return containerErrors + processErrors > NUM_ZERO ?
    EXIT_CODES.FAILURE :
    EXIT_CODES.SUCCESS;
}

async function runCli(argv = process.argv.slice(2), stdout = process.stdout, hooks = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    stdout.write(`${USAGE_LINES.join(NEWLINE)}${NEWLINE}`);
    return EXIT_CODES.SUCCESS;
  }

  const summary = {containers: null, processes: null};

  if (args.processesOnly) {
    summary.containers = {skipped: true};
  } else {
    const provider = hooks.provider ||
      new DockerProvider({socketPath: args.socketPath});
    summary.containers = await stopHarnessContainers(provider, args);
  }

  if (args.containersOnly) {
    summary.processes = {skipped: true};
  } else {
    summary.processes = await stopHarnessProcesses(args, hooks.processHooks || {});
  }

  if (args.json) {
    stdout.write(`${JSON.stringify(summary, null, JSON_INDENT)}${NEWLINE}`);
  } else {
    stdout.write(`${formatHumanSummary(summary)}${NEWLINE}`);
  }
  return computeExitCode(summary);
}

if (
  process.argv[PROCESS_ARG_SCRIPT_INDEX] &&
  import.meta.url === pathToFileURL(process.argv[PROCESS_ARG_SCRIPT_INDEX]).href
) {
  runCli()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exit(EXIT_CODES.FAILURE);
    });
}

export {
  commandMatchesHarnessPattern,
  findHarnessProcesses,
  formatHumanSummary,
  getContainerDisplayName,
  getContainerId,
  getContainerNames,
  hasHarnessLabel,
  hasHarnessName,
  isContainerRunning,
  isHarnessContainer,
  isHarnessProcess,
  parseArgs,
  parsePsOutput,
  runCli,
  stopHarnessContainers,
  stopHarnessProcesses,
};
