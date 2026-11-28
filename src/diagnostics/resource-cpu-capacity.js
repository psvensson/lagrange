import fs from 'node:fs';
import path from 'node:path';
import {ERRNO, FILE_TEXT, NUM} from '../constants/index.js';

// Linux procfs and cgroup v2 vocabulary. The only reader is this module.
const CGROUP_PLATFORM = 'linux';
const CGROUP_FS_ROOT = '/sys/fs/cgroup';
const CGROUP_PATH_SEPARATOR = '/';
const CGROUP_RELATIVE_PREFIX = '.';
const PROC_SELF_CGROUP_PATH = '/proc/self/cgroup';
const PROC_SELF_STATUS_PATH = '/proc/self/status';
const CGROUP_V2_MEMBERSHIP_PREFIX = '0::/';
const CGROUP_CPU_MAX_FILE = 'cpu.max';
const CGROUP_CONTROLLERS_FILE = 'cgroup.controllers';
const CGROUP_CPU_MAX_UNLIMITED = 'max';
const CPUS_ALLOWED_LIST_PATTERN = /^Cpus_allowed_list:\s*([0-9,-]+)$/mu;
const CPU_LIST_SEPARATOR = ',';
const CPU_RANGE_SEPARATOR = '-';
// Operating-system errors carry an errno code such as ENOENT or EACCES. Node's
// own argument errors (ERR_*) and plain errors are not filesystem answers.
const ERRNO_CODE_PATTERN = /^E[A-Z0-9]+$/u;

// Why capacity could not be proven. A caller decides what an unproven
// capacity means; nothing here substitutes a value for it.
const CAPACITY_REFUSAL = Object.freeze({
  NOT_LINUX: 'not_linux',
  NO_CGROUP_V2_MEMBERSHIP: 'cgroup_v2_membership_absent',
  OUTSIDE_CGROUP_HIERARCHY: 'cgroup_outside_hierarchy',
  AFFINITY_LIST_ABSENT: 'affinity_list_absent',
  AFFINITY_LIST_MALFORMED: 'affinity_list_malformed',
  QUOTA_MALFORMED: 'quota_malformed',
  FILE_UNREADABLE: 'file_unreadable',
  UNEXPECTED_ERROR: 'unexpected_error',
});

function refuse(reason) {
  return {refusal: reason};
}

function refusalFromError(error) {
  return typeof error?.code === 'string' && ERRNO_CODE_PATTERN.test(error.code) ?
    {refusal: CAPACITY_REFUSAL.FILE_UNREADABLE, code: error.code} :
    {refusal: CAPACITY_REFUSAL.UNEXPECTED_ERROR, error};
}

function visibleCgroupDirectory(read) {
  const membership = read(PROC_SELF_CGROUP_PATH, FILE_TEXT.ENCODING_UTF8)
    .split(FILE_TEXT.NEWLINE).find((line) => line.startsWith(CGROUP_V2_MEMBERSHIP_PREFIX));
  if (!membership) return refuse(CAPACITY_REFUSAL.NO_CGROUP_V2_MEMBERSHIP);
  const dir = path.resolve(
    CGROUP_FS_ROOT,
    CGROUP_RELATIVE_PREFIX + membership.slice(CGROUP_V2_MEMBERSHIP_PREFIX.length - NUM.ONE),
  );
  return dir === CGROUP_FS_ROOT || dir.startsWith(CGROUP_FS_ROOT + CGROUP_PATH_SEPARATOR) ?
    {dir} : refuse(CAPACITY_REFUSAL.OUTSIDE_CGROUP_HIERARCHY);
}

function allowedAffinityCores(read) {
  const allowed = CPUS_ALLOWED_LIST_PATTERN.exec(
    read(PROC_SELF_STATUS_PATH, FILE_TEXT.ENCODING_UTF8));
  if (!allowed) return refuse(CAPACITY_REFUSAL.AFFINITY_LIST_ABSENT);
  let cores = 0;
  for (const range of allowed[1].split(CPU_LIST_SEPARATOR)) {
    const [first, last = first] = range.split(CPU_RANGE_SEPARATOR).map(Number);
    if (last < first) return refuse(CAPACITY_REFUSAL.AFFINITY_LIST_MALFORMED);
    cores += last - first + 1;
  }
  return {cores};
}

// The cpu.max text of a directory, or the named absence of the file. An absent
// file is accepted only when the directory is a visible v2 cgroup (its
// controllers file reads); any other failure is not an answer about quota.
const NO_CPU_MAX_FILE = Object.freeze({text: null});

function readCpuMax(read, dir) {
  try {
    return {text: read(path.join(dir, CGROUP_CPU_MAX_FILE), FILE_TEXT.ENCODING_UTF8)};
  } catch (error) {
    if (error?.code !== ERRNO.ENOENT) throw error;
    read(path.join(dir, CGROUP_CONTROLLERS_FILE), FILE_TEXT.ENCODING_UTF8);
    return NO_CPU_MAX_FILE;
  }
}

// The cores left after this directory's quota.
function coresWithinDirectoryQuota(read, dir, cores) {
  const cpuMax = readCpuMax(read, dir);
  if (cpuMax === NO_CPU_MAX_FILE) return {cores};
  const [quota, period] = cpuMax.text.trim().split(/\s+/u);
  if (quota === CGROUP_CPU_MAX_UNLIMITED) return {cores};
  const ratio = Number(quota) / Number(period);
  return ratio > 0 && Number.isFinite(ratio) ?
    {cores: Math.min(cores, ratio)} : refuse(CAPACITY_REFUSAL.QUOTA_MALFORMED);
}

// In a cgroup v2 namespace / is relative to the mounted hierarchy. Walk
// visible ancestors because a parent quota also limits its descendants.
// Answers {cores} or {refusal}; an unexpected error is named in the refusal.
export function effectiveCpuCores(read = fs.readFileSync) {
  if (process.platform !== CGROUP_PLATFORM) return refuse(CAPACITY_REFUSAL.NOT_LINUX);
  try {
    const membership = visibleCgroupDirectory(read);
    if (membership.refusal !== undefined) return membership;
    let dir = membership.dir;
    const affinity = allowedAffinityCores(read);
    if (affinity.refusal !== undefined) return affinity;
    let cores = affinity.cores;
    while (true) {
      const step = coresWithinDirectoryQuota(read, dir, cores);
      if (step.refusal !== undefined) return step;
      cores = step.cores;
      if (dir === CGROUP_FS_ROOT) return {cores};
      dir = path.dirname(dir);
    }
  } catch (error) {
    return refusalFromError(error);
  }
}

export function hostTicks(cpus) {
  let total = 0;
  let idle = 0;
  for (const cpu of cpus) {
    if (!cpu.times) return null;
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    idle += cpu.times.idle;
  }
  return {total, idle, count: cpus.length};
}

export function hostBusyPercent(previous, current) {
  if (!previous || !current || previous.count !== current.count) return null;
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  return total > 0 && idle >= 0 && idle <= total ? NUM.HUNDRED * (total - idle) / total : null;
}
