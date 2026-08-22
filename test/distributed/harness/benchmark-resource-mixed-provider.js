import {
  access,
  readFile,
  readdir,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import {calculateContainerMemoryWorkingSetBytes} from
  './container-memory-working-set.js';

const TEXT = 'utf8';
const NANOCPUS_PER_CPU = 1_000_000_000;
const NANOSECONDS_PER_MICROSECOND = 1_000;
const DECIMAL_INTEGER = /^(?:0|[1-9][0-9]*)$/u;
const MapConstructor = Map;
const mathRound = Math.round;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const numberConstructor = Number;
const numberIsSafeInteger = Number.isSafeInteger;
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const localText = Object.freeze({
  BLOCK_READ_BYTES: 'rbytes',
  BLOCK_READ_OPERATIONS: 'rios',
  BLOCK_WRITE_BYTES: 'wbytes',
  BLOCK_WRITE_OPERATIONS: 'wios',
  CGROUP_STORAGE_IDENTITY_MISMATCH:
    'cgroup storage identity mismatch',
  CONTAINER_PROVIDER_REQUIRED: 'container provider is required',
  CPU_USAGE_NANOSECONDS: 'cpu usage nanoseconds',
  CPU_USAGE_MICROSECONDS: 'usage_usec',
  EXACT_CGROUP_REGISTRATIONS_REQUIRED:
    'exact unique cgroup registrations required',
  FIELD_ASSIGNMENT: '=',
  FILE_NOT_FOUND: 'ENOENT',
  HOST_PROCESS_CGROUP_IMAGE: 'host-process-cgroup-v2',
  IO_STAT: 'io.stat',
  MAXIMUM: 'max',
  MEMORY_CURRENT: 'memory.current',
  MEMORY_INACTIVE_FILE: 'inactive_file',
  MEMORY_MAX: 'memory.max',
  MEMORY_STAT: 'memory.stat',
  PIDS_CURRENT: 'pids.current',
  PROCESS_READ_BYTES: 'read_bytes',
  PROCESS_READ_OPERATIONS: 'syscr',
  PROCESS_IO: 'process io',
  PROCESS_WRITE_BYTES: 'write_bytes',
  PROCESS_WRITE_OPERATIONS: 'syscw',
  RESOURCE_COUNTER_INVALID: 'resource counter is invalid',
  NETWORK_OBSERVATION_INVALID: 'network observation is invalid',
  STORAGE_OBSERVATION_UNAVAILABLE:
    'registered storage observation is unavailable',
});

function fail(reason) {
  throw new TypeError(`mixed resource provider failed: ${reason}`);
}

function requiredMemoryLimit(value) {
  if (value === localText.MAXIMUM) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: memory.max`);
  }
  return integer(value, localText.MEMORY_MAX);
}

async function pathExists(value) {
  try {
    await access(value);
    return true;
  } catch (error) {
    if (error?.code === localText.FILE_NOT_FOUND) return false;
    throw error;
  }
}

async function textFile(directory, name) {
  return stringTrim(await readFile(path.join(directory, name), TEXT));
}

function integer(value, name) {
  if (
    typeof value !== 'string' ||
    !regExpTest(DECIMAL_INTEGER, value)
  ) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: ${name}`);
  }
  const parsed = numberConstructor(value);
  if (!numberIsSafeInteger(parsed)) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: ${name}`);
  }
  return parsed;
}

function assertSafeTotals(totals, name) {
  if (
    !numberIsSafeInteger(totals.readBytes) ||
    !numberIsSafeInteger(totals.writeBytes) ||
    !numberIsSafeInteger(totals.readOperations) ||
    !numberIsSafeInteger(totals.writeOperations)
  ) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: ${name}`);
  }
  return totals;
}

function multiplyCounter(value, multiplier, name) {
  const product = value * multiplier;
  if (!numberIsSafeInteger(product)) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: ${name}`);
  }
  return product;
}

function cgroupCpuLimit(value) {
  const fields = stringSplit(stringTrim(value), /\s+/u);
  if (fields.length !== 2 || fields[0] === localText.MAXIMUM) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: cpu.max`);
  }
  const quotaValue = integer(fields[0], 'cpu.max quota');
  const periodValue = integer(fields[1], 'cpu.max period');
  if (periodValue === 0) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: cpu.max period`);
  }
  return mathRound(
    quotaValue / periodValue * NANOCPUS_PER_CPU,
  );
}

function cgroupStatValue(value, key) {
  const lines = stringSplit(value, '\n');
  for (let index = 0; index < lines.length; index += 1) {
    const fields = stringSplit(stringTrim(lines[index]), /\s+/u);
    if (fields[0] === key && fields.length === 2) {
      return integer(fields[1], key);
    }
  }
  fail(`${localText.RESOURCE_COUNTER_INVALID}: ${key}`);
}

function appendCgroupIoAssignment(totals, seen, value) {
  const assignment = stringSplit(value, localText.FIELD_ASSIGNMENT);
  if (assignment.length !== 2) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: io.stat`);
  }
  const key = assignment[0];
  const raw = assignment[1];
  if (key === localText.BLOCK_READ_BYTES) {
    totals.readBytes += integer(raw, key);
    seen.readBytes = true;
  } else if (key === localText.BLOCK_WRITE_BYTES) {
    totals.writeBytes += integer(raw, key);
    seen.writeBytes = true;
  } else if (key === localText.BLOCK_READ_OPERATIONS) {
    totals.readOperations += integer(raw, key);
    seen.readOperations = true;
  } else if (key === localText.BLOCK_WRITE_OPERATIONS) {
    totals.writeOperations += integer(raw, key);
    seen.writeOperations = true;
  }
}

function ioTotals(value) {
  const totals = {
    readBytes: 0,
    writeBytes: 0,
    readOperations: 0,
    writeOperations: 0,
  };
  const seen = {
    readBytes: false,
    writeBytes: false,
    readOperations: false,
    writeOperations: false,
  };
  const lines = stringSplit(value, '\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = stringTrim(lines[lineIndex]);
    if (line.length === 0) continue;
    const fields = stringSplit(line, /\s+/u);
    for (let index = 1; index < fields.length; index += 1) {
      appendCgroupIoAssignment(totals, seen, fields[index]);
    }
  }
  if (
    !seen.readBytes ||
    !seen.writeBytes ||
    !seen.readOperations ||
    !seen.writeOperations
  ) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: io.stat`);
  }
  return assertSafeTotals(totals, localText.IO_STAT);
}

function appendProcessIoLine(totals, seen, line) {
  const fields = stringSplit(stringTrim(line), /:\s*/u);
  if (fields.length !== 2) return;
  const key = fields[0];
  const raw = fields[1];
  if (key === localText.PROCESS_READ_BYTES) {
    totals.readBytes += integer(raw, key);
    seen.readBytes = true;
  }
  if (key === localText.PROCESS_WRITE_BYTES) {
    totals.writeBytes += integer(raw, key);
    seen.writeBytes = true;
  }
  if (key === localText.PROCESS_READ_OPERATIONS) {
    totals.readOperations += integer(raw, key);
    seen.readOperations = true;
  }
  if (key === localText.PROCESS_WRITE_OPERATIONS) {
    totals.writeOperations += integer(raw, key);
    seen.writeOperations = true;
  }
}

async function processIoTotals(processes) {
  const totals = {
    readBytes: 0,
    writeBytes: 0,
    readOperations: 0,
    writeOperations: 0,
  };
  const seen = {
    readBytes: false,
    writeBytes: false,
    readOperations: false,
    writeOperations: false,
  };
  const processIds = stringSplit(processes, /\s+/u);
  for (let processIndex = 0;
    processIndex < processIds.length;
    processIndex += 1) {
    const processId = processIds[processIndex];
    if (processId.length === 0) continue;
    const value = await readFile(`/proc/${processId}/io`, TEXT);
    const lines = stringSplit(value, '\n');
    for (let index = 0; index < lines.length; index += 1) {
      appendProcessIoLine(totals, seen, lines[index]);
    }
  }
  if (
    !seen.readBytes ||
    !seen.writeBytes ||
    !seen.readOperations ||
    !seen.writeOperations
  ) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: process io`);
  }
  return assertSafeTotals(totals, localText.PROCESS_IO);
}

async function directoryBytes(directory) {
  if (!await pathExists(directory)) {
    fail(localText.STORAGE_OBSERVATION_UNAVAILABLE);
  }
  const descriptor = await stat(directory);
  if (
    !numberIsSafeInteger(descriptor.size) ||
    descriptor.size < 0
  ) {
    fail(`${localText.RESOURCE_COUNTER_INVALID}: storage usage`);
  }
  if (!descriptor.isDirectory()) return descriptor.size;
  let bytes = descriptor.size;
  const entries = await readdir(directory, {withFileTypes: true});
  for (let index = 0; index < entries.length; index += 1) {
    bytes += await directoryBytes(path.join(directory, entries[index].name));
    if (!numberIsSafeInteger(bytes)) {
      fail(`${localText.RESOURCE_COUNTER_INVALID}: storage usage`);
    }
  }
  return bytes;
}

function registrationHasIdentity(registration) {
  return typeof registration?.resourceId === 'string' &&
    registration.resourceId.length > 0 &&
    typeof registration.cgroupPath === 'string' &&
    registration.cgroupPath.length > 0 &&
    typeof registration.storagePath === 'string' &&
    registration.storagePath.length > 0;
}

function registrationHasResourceLimits(registration) {
  return numberIsSafeInteger(registration.storageLimitBytes) &&
    registration.storageLimitBytes > 0 &&
    numberIsSafeInteger(registration.cpuLimitNanoCpus) &&
    registration.cpuLimitNanoCpus > 0;
}

function registrationHasNetworkObservation(registration) {
  return typeof registration.networkObservation?.authority === 'string' &&
    registration.networkObservation.authority.length > 0 &&
    typeof registration.networkObservation.read === 'function';
}

function registrationIndex(registrations) {
  const byId = new MapConstructor();
  for (let index = 0; index < registrations.length; index += 1) {
    const registration = registrations[index];
    if (
      !registrationHasIdentity(registration) ||
      !registrationHasResourceLimits(registration) ||
      !registrationHasNetworkObservation(registration) ||
      mapHas(byId, registration.resourceId)
    ) {
      fail(localText.EXACT_CGROUP_REGISTRATIONS_REQUIRED);
    }
    mapSet(byId, registration.resourceId, registration);
  }
  return byId;
}

async function cgroupRunning(registration) {
  if (!await pathExists(registration.cgroupPath)) return false;
  const processes = await textFile(registration.cgroupPath, 'cgroup.procs');
  return processes.length > 0;
}

async function cgroupSnapshot(registration, storagePath) {
  if (storagePath !== registration.storagePath) {
    fail(localText.CGROUP_STORAGE_IDENTITY_MISMATCH);
  }
  const cpu = await textFile(registration.cgroupPath, 'cpu.stat');
  const memoryMax =
    await textFile(registration.cgroupPath, 'memory.max');
  const memoryCurrent = integer(
    await textFile(registration.cgroupPath, localText.MEMORY_CURRENT),
    localText.MEMORY_CURRENT,
  );
  const memoryStat = await textFile(
    registration.cgroupPath,
    localText.MEMORY_STAT,
  );
  const processes =
    await textFile(registration.cgroupPath, 'cgroup.procs');
  const ioPath = path.join(registration.cgroupPath, 'io.stat');
  const io = await pathExists(ioPath) ?
    ioTotals(await readFile(ioPath, TEXT)) :
    await processIoTotals(processes);
  const cpuMaxPath = path.join(registration.cgroupPath, 'cpu.max');
  const network = await registration.networkObservation.read();
  if (
    network?.authority !== registration.networkObservation.authority ||
    !numberIsSafeInteger(network?.rxBytes) ||
    network.rxBytes < 0 ||
    !numberIsSafeInteger(network?.txBytes) ||
    network.txBytes < 0
  ) {
    fail(localText.NETWORK_OBSERVATION_INVALID);
  }
  return {
    timestamp: Date.now(),
    cpuPercent: 0,
    cpuUsageNanoseconds: multiplyCounter(
      cgroupStatValue(cpu, localText.CPU_USAGE_MICROSECONDS),
      NANOSECONDS_PER_MICROSECOND,
      localText.CPU_USAGE_NANOSECONDS,
    ),
    memoryUsageBytes: calculateContainerMemoryWorkingSetBytes(
      memoryCurrent,
      cgroupStatValue(memoryStat, localText.MEMORY_INACTIVE_FILE),
    ),
    memoryLimitBytes:
      requiredMemoryLimit(memoryMax),
    cpuLimitNanoCpus:
      await pathExists(cpuMaxPath) ?
        cgroupCpuLimit(await readFile(cpuMaxPath, TEXT)) :
        registration.cpuLimitNanoCpus,
    storageLimitBytes: registration.storageLimitBytes,
    pids: integer(
      await textFile(registration.cgroupPath, localText.PIDS_CURRENT),
      localText.PIDS_CURRENT,
    ),
    rxBytes: network.rxBytes,
    txBytes: network.txBytes,
    blockReadBytes: io.readBytes,
    blockWriteBytes: io.writeBytes,
    blockReadOperations: io.readOperations,
    blockWriteOperations: io.writeOperations,
    storageUsageBytes: await directoryBytes(storagePath),
  };
}

export class BenchmarkResourceMixedProvider {
  constructor({containerProvider, cgroups = []}) {
    if (!containerProvider) fail(localText.CONTAINER_PROVIDER_REQUIRED);
    this.containerProvider = containerProvider;
    this.cgroups = registrationIndex(cgroups);
  }

  async inspectContainer(resourceId) {
    const registration = mapGet(this.cgroups, resourceId);
    if (registration === undefined) {
      return this.containerProvider.inspectContainer(resourceId);
    }
    if (!await cgroupRunning(registration)) {
      throw new Error(`cgroup resource is not running: ${resourceId}`);
    }
    return {
      Id: resourceId,
      Image: localText.HOST_PROCESS_CGROUP_IMAGE,
      State: {Running: true},
    };
  }

  async inspectContainerIfExists(resourceId) {
    const registration = mapGet(this.cgroups, resourceId);
    if (registration === undefined) {
      return this.containerProvider.inspectContainerIfExists(resourceId);
    }
    if (!await pathExists(registration.cgroupPath)) return null;
    return {
      Id: resourceId,
      Image: localText.HOST_PROCESS_CGROUP_IMAGE,
      State: {Running: await cgroupRunning(registration)},
    };
  }

  getNetworkByName(networkName) {
    return this.containerProvider.getNetworkByName(networkName);
  }

  getContainerResourceSnapshot(resourceId, storagePath) {
    const registration = mapGet(this.cgroups, resourceId);
    if (registration === undefined) {
      return this.containerProvider.getContainerResourceSnapshot(
        resourceId,
        storagePath,
      );
    }
    return cgroupSnapshot(registration, storagePath);
  }
}
