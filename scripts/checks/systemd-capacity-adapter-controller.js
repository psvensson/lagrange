import {spawn} from 'node:child_process';
import {execFile} from 'node:child_process';
import {createInterface} from 'node:readline';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const REQUEST_TIMEOUT_MS = 120_000;
const EXIT_TIMEOUT_MS = 30_000;
const TERMINATION_GRACE_MS = 30_000;
const FORCED_TERMINATION_GRACE_MS = 10_000;
const STDERR_LIMIT = 16_384;
const POLL_INTERVAL_MS = 25;
const DECIMAL_COUNTER = /^(?:0|[1-9][0-9]*)$/u;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const arrayPush = Function.call.bind(Array.prototype.push);
const numberConstructor = Number;
const numberIsSafeInteger = Number.isSafeInteger;
const promiseRace = Promise.race.bind(Promise);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const SYSTEMD_RUN_FLAGS = Object.freeze([
  '--user',
  '--quiet',
  '--pipe',
  '--wait',
  '--collect',
]);
const localText = Object.freeze({
  ABORT: 'abort',
  ABORT_ERROR: 'AbortError',
  CONTROL_GROUP_PROPERTY: '--property=ControlGroup',
  IP_ACCOUNTING_PROPERTY: '--property=IPAccounting=yes',
  IP_EGRESS_BYTES: 'IPEgressBytes',
  IP_INGRESS_BYTES: 'IPIngressBytes',
  IP_ACCOUNTING_UNAVAILABLE:
    'systemd IP accounting counters unavailable',
  IP_ACCOUNTING_NO_DATA: '[no data]',
  CPU_LIST: '--cpu-list',
  DATA: 'data',
  ERROR_NAME: 'Error',
  EVENT_CLOSE: 'close',
  EVENT_LINE: 'line',
  EXECUTE: 'execute',
  FILE_EXISTS: '-e',
  RESULT: 'result',
  ROOT: '/',
  SIGNAL_KILL: 'SIGKILL',
  SIGNAL_TERM: 'SIGTERM',
  START: 'start',
  START_AND_CLEANUP_FAILED:
    'systemd adapter startup and cleanup failed',
  SYSTEMCTL: 'systemctl',
  SYSTEMD_RUN: 'systemd-run',
  TASKSET: 'taskset',
  UTF8: 'utf8',
  USER: '--user',
  VALUE: '--value',
  SHOW: 'show',
  RESET: 'reset',
  CLOSE: 'close',
  KILL: 'kill',
  KILL_ALL: '--kill-whom=all',
  OBSERVE_NETWORK: 'observe_network',
  TERMINATION_RESULT: 'termination_result',
  TERMINATION_CLEANUP_FAILED: 'adapter termination cleanup failed',
  CLOSE_AND_CLEANUP_FAILED:
    'systemd adapter close and forced cleanup failed',
  TEST: 'test',
});

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function fail(reason) {
  throw new Error(`systemd capacity adapter failed: ${reason}`);
}

function boundedText(value, suffix) {
  const joined = value + suffix;
  return joined.length > STDERR_LIMIT ?
    stringSlice(joined, joined.length - STDERR_LIMIT) :
    joined;
}

function abortError() {
  const error = new Error('adapter request aborted');
  error.name = localText.ABORT_ERROR;
  return error;
}

export function parseCapacityAdapterMessage(value) {
  return jsonParse(value);
}

export function serializeCapacityAdapterMessage(value) {
  return jsonStringify(value);
}

export function createCapacityAdapterReplyGate({resolve, reject}) {
  let terminalError = null;
  let settled = false;
  return Object.freeze({
    abort() {
      if (terminalError === null) terminalError = abortError();
    },
    timeOut(error) {
      if (terminalError === null) terminalError = error;
    },
    terminate(error) {
      if (settled) return;
      settled = true;
      reject(terminalError || error);
    },
    settle(message) {
      if (settled) return;
      settled = true;
      if (terminalError !== null) {
        reject(terminalError);
        return;
      }
      if (message.kind === localText.RESULT) {
        resolve(message.value);
        return;
      }
      const error = new Error(
        message.error?.message || 'adapter child request failed',
      );
      error.name = message.error?.name || localText.ERROR_NAME;
      error.stack = message.error?.stack || error.stack;
      reject(error);
    },
  });
}

export function systemdCapacityAdapterArguments({
  unit,
  workingDirectory,
  scriptPath,
  memoryMax,
  cpuQuota,
  cpuSet,
  tasksMax,
}) {
  return [
    ...SYSTEMD_RUN_FLAGS,
    `--unit=${unit}`,
    `--property=MemoryMax=${memoryMax}`,
    `--property=CPUQuota=${cpuQuota}`,
    `--property=TasksMax=${tasksMax}`,
    localText.IP_ACCOUNTING_PROPERTY,
    `--working-directory=${workingDirectory}`,
    localText.TASKSET,
    localText.CPU_LIST,
    cpuSet,
    process.execPath,
    scriptPath,
  ];
}

export function parseSystemdIpAccounting(value) {
  const counters = {};
  const lines = stringSplit(value, '\n');
  for (let index = 0; index < lines.length; index += 1) {
    const separator = stringIndexOf(lines[index], '=');
    if (separator < 1) continue;
    counters[stringSlice(lines[index], 0, separator)] =
      stringSlice(lines[index], separator + 1);
  }
  const ingress = counters[localText.IP_INGRESS_BYTES];
  const egress = counters[localText.IP_EGRESS_BYTES];
  if (
    typeof ingress !== 'string' ||
    ingress === localText.IP_ACCOUNTING_NO_DATA ||
    !regExpTest(DECIMAL_COUNTER, ingress) ||
    typeof egress !== 'string' ||
    egress === localText.IP_ACCOUNTING_NO_DATA ||
    !regExpTest(DECIMAL_COUNTER, egress)
  ) {
    fail(localText.IP_ACCOUNTING_UNAVAILABLE);
  }
  const rxBytes = numberConstructor(ingress);
  const txBytes = numberConstructor(egress);
  if (!numberIsSafeInteger(rxBytes) || !numberIsSafeInteger(txBytes)) {
    fail(localText.IP_ACCOUNTING_UNAVAILABLE);
  }
  return {rxBytes, txBytes};
}

async function resolveControlGroup(unit) {
  const {stdout} = await execFileAsync(
    localText.SYSTEMCTL,
    [
      localText.USER,
      localText.SHOW,
      `${unit}.service`,
      localText.CONTROL_GROUP_PROPERTY,
      localText.VALUE,
    ],
    {encoding: localText.UTF8},
  );
  const relative = stringTrim(stdout);
  if (!stringStartsWith(relative, localText.ROOT)) {
    fail(`control group unavailable for ${unit}`);
  }
  return `/sys/fs/cgroup${relative}`;
}

export function capacityAdapterProcessClose(child) {
  return new Promise((resolve) => {
    child.once(
      localText.EVENT_CLOSE,
      (code, signal) => resolve({code, signal}),
    );
  });
}

async function waitForExit(exit, timeoutMs) {
  const timeout = Object.freeze({kind: 'timeout'});
  const result = await promiseRace([
    exit,
    delay(timeoutMs).then(() => timeout),
  ]);
  return result === timeout ? null : result;
}

async function signalSystemdUnit(unit, signal, command) {
  await command(
    localText.SYSTEMCTL,
    [
      localText.USER,
      localText.KILL,
      localText.KILL_ALL,
      `--signal=${signal}`,
      `${unit}.service`,
    ],
    {encoding: localText.UTF8},
  );
}

export async function terminateSystemdCapacityAdapter({
  unit,
  exit,
  command = execFileAsync,
  terminationGraceMs = TERMINATION_GRACE_MS,
  forcedTerminationGraceMs = FORCED_TERMINATION_GRACE_MS,
}) {
  const signalErrors = [];
  try {
    await signalSystemdUnit(unit, localText.SIGNAL_TERM, command);
  } catch (error) {
    arrayPush(signalErrors, error);
  }
  let result = await waitForExit(exit, terminationGraceMs);
  if (result !== null) return result;
  try {
    await signalSystemdUnit(unit, localText.SIGNAL_KILL, command);
  } catch (error) {
    arrayPush(signalErrors, error);
  }
  result = await waitForExit(exit, forcedTerminationGraceMs);
  if (result === null) {
    const exitError =
      new Error(`adapter did not exit after SIGKILL: ${unit}`);
    if (signalErrors.length > 0) {
      throw new AggregateError(
        [...signalErrors, exitError],
        localText.TERMINATION_CLEANUP_FAILED,
      );
    }
    throw exitError;
  }
  return result;
}

export async function completeSystemdCapacityAdapterStartup({
  start,
  resolveControlGroupPath,
  terminate,
  waitForRemoval,
}) {
  let cgroupPath = null;
  let controlGroupResolutionError = null;
  try {
    const metadata = await start();
    cgroupPath = await resolveControlGroupPath();
    return {cgroupPath, metadata};
  } catch (primaryError) {
    if (cgroupPath === null) {
      try {
        cgroupPath = await resolveControlGroupPath();
      } catch (error) {
        controlGroupResolutionError = error;
        // An awaited process exit below is the fallback absence proof when the
        // manager cannot resolve a cgroup during partial startup.
      }
    }
    const cleanupErrors = [];
    if (controlGroupResolutionError !== null) {
      cleanupErrors.push(controlGroupResolutionError);
    }
    try {
      await terminate();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cgroupPath !== null) {
      try {
        await waitForRemoval(cgroupPath);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        localText.START_AND_CLEANUP_FAILED,
      );
    }
    throw primaryError;
  }
}

async function waitForRemovedControlGroup(cgroupPath) {
  const deadline = Date.now() + EXIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const {stdout} = await execFileAsync(
        localText.TEST,
        [localText.FILE_EXISTS, cgroupPath],
        {encoding: localText.UTF8},
      );
      void stdout;
    } catch {
      return;
    }
    await delay(POLL_INTERVAL_MS);
  }
  fail(`control group remained after teardown: ${cgroupPath}`);
}

export async function startSystemdCapacityAdapter({
  unit,
  workingDirectory,
  scriptPath,
  memoryMax,
  cpuQuota,
  cpuSet,
  tasksMax,
  startOptions,
}) {
  const child = spawn(
    localText.SYSTEMD_RUN,
    systemdCapacityAdapterArguments({
      unit,
      workingDirectory,
      scriptPath,
      memoryMax,
      cpuQuota,
      cpuSet,
      tasksMax,
    }),
    {
      cwd: workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const exit = capacityAdapterProcessClose(child);
  const pending = new Map();
  let requestSequence = 0;
  let stderr = '';
  let closed = false;
  let terminationPromise = null;
  let terminationReceipt = null;
  let terminationReceiptError = null;
  child.stderr.setEncoding(localText.UTF8);
  child.stderr.on(localText.DATA, (chunk) => {
    stderr = boundedText(stderr, chunk);
  });
  const lines = createInterface({input: child.stdout});
  lines.on(localText.EVENT_LINE, (line) => {
    let message;
    try {
      message = parseCapacityAdapterMessage(line);
    } catch {
      return;
    }
    if (message.kind === localText.TERMINATION_RESULT) {
      if (message.error) {
        terminationReceiptError = new Error(
          message.error.message || localText.TERMINATION_CLEANUP_FAILED,
        );
        terminationReceiptError.name =
          message.error.name || localText.ERROR_NAME;
        terminationReceiptError.stack =
          message.error.stack || terminationReceiptError.stack;
      } else {
        terminationReceipt = message.value;
      }
      return;
    }
    const waiter = pending.get(message.requestId);
    if (waiter === undefined) return;
    pending.delete(message.requestId);
    clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener(localText.ABORT, waiter.abort);
    waiter.gate.settle(message);
  });
  function beginTermination() {
    if (terminationPromise === null) {
      terminationPromise = terminateSystemdCapacityAdapter({
        unit,
        exit,
      });
      terminationPromise.catch((error) => {
        for (const waiter of pending.values()) {
          clearTimeout(waiter.timer);
          waiter.signal?.removeEventListener(localText.ABORT, waiter.abort);
          waiter.gate.terminate(error);
        }
        pending.clear();
      });
    }
    return terminationPromise;
  }
  function request(kind, value = {}, signal = null) {
    if (closed) fail(`request after close: ${kind}`);
    if (terminationPromise !== null) {
      fail(`request after termination started: ${kind}`);
    }
    requestSequence += 1;
    const requestId = `${unit}-${requestSequence}`;
    return new Promise((resolve, reject) => {
      const gate = createCapacityAdapterReplyGate({resolve, reject});
      const abort = () => {
        gate.abort();
        void beginTermination();
      };
      const timer = setTimeout(() => {
        gate.timeOut(new Error(
          `adapter request timed out: ${kind}; stderr=${stderr}`,
        ));
        void beginTermination();
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, {
        timer,
        abort,
        signal,
        gate,
      });
      if (signal?.aborted) {
        abort();
      } else {
        signal?.addEventListener(localText.ABORT, abort, {once: true});
      }
      child.stdin.write(`${serializeCapacityAdapterMessage({
        requestId,
        kind,
        ...value,
      })}\n`);
    });
  }
  child.once(localText.EVENT_CLOSE, (code, signal) => {
    const failure = new Error(
      `adapter exited before reply: code=${code}; signal=${signal}; ` +
      `stderr=${stderr}`,
    );
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.signal?.removeEventListener(localText.ABORT, waiter.abort);
      waiter.gate.terminate(failure);
    }
    pending.clear();
  });
  const startup = await completeSystemdCapacityAdapterStartup({
    start: () => request(localText.START, {options: startOptions}),
    resolveControlGroupPath: () => resolveControlGroup(unit),
    terminate: () => beginTermination(),
    waitForRemoval: waitForRemovedControlGroup,
  });
  const {metadata, cgroupPath} = startup;
  async function finishTermination() {
    closed = true;
    child.stdin.end();
    const result = await beginTermination();
    await waitForRemovedControlGroup(cgroupPath);
    if (terminationReceiptError !== null) {
      throw terminationReceiptError;
    }
    if (terminationReceipt === null) {
      fail(
        `${unit} terminated without a confirmed cleanup receipt; ` +
        `code=${result.code}; signal=${result.signal}; stderr=${stderr}`,
      );
    }
    return terminationReceipt;
  }
  return {
    unit,
    cgroupPath,
    metadata,
    execute(operation, signal) {
      return request(localText.EXECUTE, {operation}, signal);
    },
    reset() {
      return request(localText.RESET);
    },
    observeNetworkCounters() {
      return request(localText.OBSERVE_NETWORK);
    },
    async close() {
      if (terminationPromise !== null) {
        return finishTermination();
      }
      let receipt;
      try {
        receipt = await request(localText.CLOSE);
      } catch (primaryError) {
        try {
          await finishTermination();
        } catch (cleanupError) {
          throw new AggregateError(
            [primaryError, cleanupError],
            localText.CLOSE_AND_CLEANUP_FAILED,
          );
        }
        throw primaryError;
      }
      closed = true;
      child.stdin.end();
      const result = await exit;
      if (result.code !== 0) {
        fail(
          `${unit} exit code ${result.code}; signal=${result.signal}; ` +
          `stderr=${stderr}`,
        );
      }
      await waitForRemovedControlGroup(cgroupPath);
      return receipt;
    },
  };
}
