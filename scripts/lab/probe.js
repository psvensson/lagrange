import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';

import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {
  CONVERGENCE_PROBES_SHARD_PATH,
} from '../checks/test-primary-classification-constants.js';
import {LANE_JOBS_CAP_ENV, RESOURCE_CLASS_EXCLUSIVE}
  from '../checks/test-resource-classification-constants.js';
import {THERMAL_REFUSAL_LINE} from '../checks/wait-for-thermal-headroom.js';
import {formatTestFilesSummary} from '../run-test-files.js';
import {capture, killGroup, run} from './process.js';
import {loadState, saveState} from './state.js';

const OS = Object.freeze({LINUX: 'linux', MACOS: 'macos', WINDOWS: 'windows', UNKNOWN: 'unknown'});
const OS_REPORT = Object.freeze({LINUX: 'linux', DARWIN: 'darwin', WINDOWS: 'windows'});
const ARCH = Object.freeze({X64: 'x64', ARM64: 'arm64', ARM: 'arm', UNKNOWN: 'unknown'});
const ARCH_ALIASES = Object.freeze({
  [ARCH.X64]: Object.freeze(['x86_64', 'amd64', 'x64']),
  [ARCH.ARM64]: Object.freeze(['aarch64', 'arm64']),
  [ARCH.ARM]: Object.freeze(['armv7l', 'arm']),
});
const SSH = 'ssh';
const SSH_OPTION = '-o';
const SSH_BATCH_MODE = 'BatchMode=yes';
const UNAME = 'uname';
const UNAME_OS = '-s';
const UNAME_ARCH = '-m';
const POWERSHELL = Object.freeze({
  COMMAND: 'powershell',
  NO_PROFILE: '-NoProfile',
  NON_INTERACTIVE: '-NonInteractive',
  RUN: '-Command',
  SCRIPT: Object.freeze([
    '$os = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription',
    '$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()',
    'Write-Output $os',
    'Write-Output $arch',
  ]),
  STATEMENT_SEPARATOR: '; ',
});
const WINDOWS_PROBE_LINE_COUNT = 2;
const ERROR_TEXT = Object.freeze({
  INCOMPLETE_WINDOWS_METADATA: 'Windows probe returned incomplete metadata',
  SSH_TARGET_REQUIRED: 'Remote probe requires an ssh target',
});
const EMPTY = '';

function normalizeOs(value) {
  const normalized = String(value || EMPTY).trim().toLowerCase();
  if (normalized === OS_REPORT.LINUX) return OS.LINUX;
  if (normalized === OS_REPORT.DARWIN) return OS.MACOS;
  if (normalized.includes(OS_REPORT.WINDOWS)) return OS.WINDOWS;
  return OS.UNKNOWN;
}

function normalizeArch(value) {
  const normalized = String(value || EMPTY).trim().toLowerCase();
  for (const [arch, aliases] of Object.entries(ARCH_ALIASES)) {
    if (aliases.includes(normalized)) return arch;
  }
  return normalized || ARCH.UNKNOWN;
}

async function probePosix(sshTarget) {
  const os = await capture(SSH, [
    SSH_OPTION, SSH_BATCH_MODE, sshTarget, UNAME, UNAME_OS,
  ]);
  const arch = await capture(SSH, [
    SSH_OPTION, SSH_BATCH_MODE, sshTarget, UNAME, UNAME_ARCH,
  ]);
  return {os: normalizeOs(os), arch: normalizeArch(arch)};
}

async function probeWindows(sshTarget) {
  const script = POWERSHELL.SCRIPT.join(POWERSHELL.STATEMENT_SEPARATOR);
  const output = await capture(SSH, [
    SSH_OPTION, SSH_BATCH_MODE,
    sshTarget,
    POWERSHELL.COMMAND, POWERSHELL.NO_PROFILE, POWERSHELL.NON_INTERACTIVE,
    POWERSHELL.RUN, script,
  ]);
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length < WINDOWS_PROBE_LINE_COUNT) {
    throw new Error(ERROR_TEXT.INCOMPLETE_WINDOWS_METADATA);
  }
  return {os: normalizeOs(lines[0]), arch: normalizeArch(lines[1])};
}

export async function probeRemoteNode(sshTarget) {
  if (!sshTarget) throw new Error(ERROR_TEXT.SSH_TARGET_REQUIRED);
  try {
    const result = await probePosix(sshTarget);
    if (result.os !== OS.UNKNOWN) return result;
  } catch {
    // Windows OpenSSH normally has no uname. Fall through to PowerShell.
  }
  return probeWindows(sshTarget);
}

// ---------------------------------------------------------------------------
// Sharing the lab between agents and projects (owner directive 2026-09-23:
// runs that could not see each other overwhelmed a lab machine). Every lab
// host has ONE machine-wide lock, `${LAB_LOCK_DIR:-$HOME/.lab}/machine.lock`,
// which whoever runs anything heavy there - a test corpus, a formation, a
// benchmark - takes with flock and a bounded wait, and one holder record
// beside it, `machine.holder.json`, written by the holder under the lock and
// removed by it on exit. flock is the lock; the record is for people and for
// `lab fleet`, and a record whose lock is free is stale evidence, never a
// lock. The convention is plain shell (docs/development/home-lab.md,
// "Sharing the lab between agents and projects"), so another project follows
// it with nothing from here. In this repository the lines below are its one
// owner: discovery reads a machine's lock with them, and the placement
// wrapper and a formation's hold on each node take it with them.

// The convention's exit statuses: 98 is the busy refusal its recipe's
// `flock -w N 9 || exit 98` gives, 97 a host that cannot take part, 143 a
// holder stopped by a signal.
const LAB_LOCK_EXIT = Object.freeze({SETUP: 97, BUSY: 98, TERMINATED: 143});
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
// No wait is longer, whatever the caller's budget: a host held for longer is
// another run's, and the caller goes elsewhere or refuses.
const LAB_LOCK_WAIT_MAX_MS = 30 * MS_PER_MINUTE;
const LAB_LOCK_WAIT_MIN_SECONDS = 1;
// A released hold's session gets this long to remove its record and end.
const LAB_HOLD_RELEASE_GRACE_MS = 5 * MS_PER_SECOND;
// How a holder names itself: this repository, and who placed the work
// (LAGRANGE_LAB_AGENT, such as claude:SESSION, or this controller's process).
const LAB_PROJECT = 'lagrange';
const LAB_AGENT_ENV = 'LAGRANGE_LAB_AGENT';
const LAB_AGENT_SEPARATOR = ':';
const LAB_TEST_PURPOSE = 'test:';
const LAB_PURPOSE_SEPARATOR = ',';
// What a lab-side shell prints about the lock: busy, with the holder's record
// when there is one, and held.
const LAB_LOCK_LINE = Object.freeze({BUSY: 'machine-lock-busy=', HELD: 'machine-lock-held'});
// What discovery found of a machine's lock, from the probe's answer.
const LAB_LOCK_STATE = Object.freeze({
  FREE: 'free', BUSY: 'busy', STALE: 'stale-record', UNKNOWN: 'unknown',
});
const LAB_LOCK_PROBED = Object.freeze({HELD: 'held', FREE: 'free'});
// What a formation's hold on one node came to.
const LAB_HOLD = Object.freeze({HELD: 'held', BUSY: 'busy', FAILED: 'failed'});
const LAB_HOLDER_UNKNOWN = '?';
const LAB_HOLD_REASON_SEPARATOR = ': ';
const LAB_LOCK_TEXT = Object.freeze({
  FREE: 'free',
  BUSY: 'busy: ',
  STALE_DEAD: 'stale record (pid dead)',
  STALE_LOCK_FREE: 'stale record (lock free)',
  UNKNOWN: 'lock unknown',
  NO_RECORD: 'held (no holder record)',
  UNREADABLE: 'held (unreadable holder record)',
  EXPECTED: ', expected ',
  MINUTES: ' min',
});
const LAB_LOCK_PATHS = Object.freeze([
  'lab_dir="${LAB_LOCK_DIR:-$HOME/.lab}"',
  'lab_lock="$lab_dir/machine.lock"; lab_holder="$lab_dir/machine.holder.json"',
]);
// A record read bounded and onto one line: another project may write it over
// several.
const LAB_HOLDER_READ = 'head -c 4096 "$lab_holder" 2>/dev/null | tr -d \'\\r\\n\'';
// Discovery's view of the lock: whether it is held - asked with `flock -n`,
// which releases at once, and never of a lock file it would have to create -
// and the holder record as written, with whether its pid still runs. The
// probe reads; it never takes the lock. A host that cannot say reports
// nothing, which reads as unknown.
const LAB_LOCK_PROBE = Object.freeze([
  ...LAB_LOCK_PATHS,
  'if [ -f "$lab_holder" ]; then',
  `  say machine_holder "$(${LAB_HOLDER_READ})"`,
  '  holder_pid="$(sed -n \'s/.*"pid"[ ]*:[ ]*\\([0-9][0-9]*\\).*/\\1/p\' "$lab_holder" | ' +
    'head -n 1)"',
  '  if [ -n "$holder_pid" ]; then if ps -p "$holder_pid" >/dev/null 2>&1; then ' +
    'say machine_holder_pid_alive yes; else say machine_holder_pid_alive no; fi; fi',
  'fi',
  'if [ ! -e "$lab_lock" ]; then say machine_lock free',
  'elif command -v flock >/dev/null 2>&1 && [ -r "$lab_lock" ]; then',
  '  flock -n "$lab_lock" true 2>/dev/null',
  '  case $? in 0) say machine_lock free;; 1) say machine_lock held;; esac',
  'fi',
]);
// Take the lock on fd 9, waiting at most $lock_wait seconds - as a job, so a
// stop signal ends the wait at once - and, busy, name the holder's record and
// exit busy without touching it.
const LAB_LOCK_TAKE = Object.freeze([
  `mkdir -p "$lab_dir" || exit ${LAB_LOCK_EXIT.SETUP}`,
  `exec 9>"$lab_lock" || exit ${LAB_LOCK_EXIT.SETUP}`,
  'flock -w "$lock_wait" 9 & pid=$!',
  'wait "$pid"; locked=$?; pid=""',
  `if [ "$locked" != 0 ]; then echo "${LAB_LOCK_LINE.BUSY}$(${LAB_HOLDER_READ})"; ` +
    `exit ${LAB_LOCK_EXIT.BUSY}; fi`,
]);
// Under the lock, the holder record: the caller's fields ($holder_head,
// $expected_minutes) around what only the holder knows - when it started and
// its pid. Whoever sets `holding` removes it on exit.
const LAB_LOCK_RECORD = Object.freeze([
  'printf \'{%s,"startedAt":"%s","expectedMinutes":%s,"pid":%s}\\n\' "$holder_head" ' +
    '"$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$expected_minutes" "$$" > "$lab_holder" || ' +
    `exit ${LAB_LOCK_EXIT.SETUP}`,
  'holding=1',
]);
// A formation's hold on one node: the lock taken and recorded as above, then
// kept for as long as the controller keeps this session's input open. Its
// end - a release, or the session's own - lets the shell exit, which removes
// the record and frees the machine.
const LAB_HOLD_SCRIPT = [
  'set -u',
  'lock_wait="$1"; holder_head="$2"; expected_minutes="$3"',
  'set --',
  'pid=""; holding=""',
  ...LAB_LOCK_PATHS,
  'trap \'if [ -n "$holding" ]; then rm -f "$lab_holder"; fi\' EXIT',
  'trap \'if [ -n "$pid" ]; then kill "$pid" 2>/dev/null; fi; ' +
    `exit ${LAB_LOCK_EXIT.TERMINATED}' HUP INT TERM`,
  'if ! command -v flock >/dev/null 2>&1; then echo "a lab hold needs flock here" >&2; ' +
    `exit ${LAB_LOCK_EXIT.SETUP}; fi`,
  ...LAB_LOCK_TAKE,
  ...LAB_LOCK_RECORD,
  `echo ${LAB_LOCK_LINE.HELD}`,
  'cat >/dev/null 9>&-',
].join('\n');

// Seconds for `flock -w`: the caller's budget, at least a second, never more
// than the lab's cap.
function labLockWaitSeconds(waitMs) {
  return Math.max(LAB_LOCK_WAIT_MIN_SECONDS,
    Math.ceil(Math.min(waitMs, LAB_LOCK_WAIT_MAX_MS) / MS_PER_SECOND));
}

// The arguments a lab shell takes the lock with: its wait, the head of its
// holder record - this project, the agent, the controller, the purpose and
// the commit, as JSON members - and the minutes it expects to hold the
// machine.
function labLockArgs({waitMs, purpose, expectedMs, sha, env}) {
  const controller = os.hostname();
  const agent = env[LAB_AGENT_ENV] ||
    [LAB_PROJECT, controller, process.pid].join(LAB_AGENT_SEPARATOR);
  const head = JSON.stringify({project: LAB_PROJECT, agent, controller, purpose, sha});
  return [String(labLockWaitSeconds(waitMs)), head.slice(1, -1),
    String(Math.ceil(expectedMs / MS_PER_MINUTE))];
}

// What a test run tells other agents it is doing: its lanes.
function labTestPurpose(lanes) {
  return `${LAB_TEST_PURPOSE}${[...new Set(lanes)].join(LAB_PURPOSE_SEPARATOR)}`;
}

// A holder record as its holder wrote it, when it is a JSON object.
function parseLabHolder(text) {
  if (!text) return null;
  try {
    const record = JSON.parse(text);
    return record !== null && typeof record === 'object' && !Array.isArray(record) ?
      record : null;
  } catch {
    return null;
  }
}

// The holder a lab shell named when it refused busy, from its lines.
function busyHolder(lines) {
  const line = lines.find((one) => one.startsWith(LAB_LOCK_LINE.BUSY));
  return parseLabHolder(line?.slice(LAB_LOCK_LINE.BUSY.length));
}

/**
 * Who holds a machine, as a person reads it: `held by AGENT (PROJECT,
 * PURPOSE) since STARTED`, a field the holder left out shown as unknown.
 * @param {Object|null} holder a holder record
 * @return {string}
 */
export function labHolderText(holder) {
  if (!holder) return LAB_LOCK_TEXT.NO_RECORD;
  return `held by ${holder.agent ?? LAB_HOLDER_UNKNOWN} (${holder.project ?? LAB_HOLDER_UNKNOWN}` +
    `, ${holder.purpose ?? LAB_HOLDER_UNKNOWN}) since ${holder.startedAt ?? LAB_HOLDER_UNKNOWN}`;
}

// A machine's lock for the fleet: who holds it and for how long they expect
// to, or that it is free, a stale record, or not known.
function labLockText(lock) {
  if (lock.state === LAB_LOCK_STATE.BUSY) return `${LAB_LOCK_TEXT.BUSY}${heldText(lock)}`;
  if (lock.state === LAB_LOCK_STATE.STALE) {
    return lock.holderPidAlive === false ? LAB_LOCK_TEXT.STALE_DEAD :
      LAB_LOCK_TEXT.STALE_LOCK_FREE;
  }
  return lock.state === LAB_LOCK_STATE.FREE ? LAB_LOCK_TEXT.FREE : LAB_LOCK_TEXT.UNKNOWN;
}

function heldText(lock) {
  if (!lock.holder) return lock.record ? LAB_LOCK_TEXT.UNREADABLE : LAB_LOCK_TEXT.NO_RECORD;
  return `${labHolderText(lock.holder)}${LAB_LOCK_TEXT.EXPECTED}` +
    `${lock.holder.expectedMinutes ?? LAB_HOLDER_UNKNOWN}${LAB_LOCK_TEXT.MINUTES}`;
}

// The probe's lock lines as discovery records them: the lock decides busy or
// free, and a record whose lock is free is stale.
function parseMachineLock(values) {
  const record = capabilityText(values.machine_holder);
  return {
    state: machineLockState(values.machine_lock, record),
    record,
    holder: parseLabHolder(record),
    holderPidAlive: capabilityFlag(values.machine_holder_pid_alive),
  };
}

function machineLockState(probed, record) {
  if (probed === LAB_LOCK_PROBED.HELD) return LAB_LOCK_STATE.BUSY;
  if (probed !== LAB_LOCK_PROBED.FREE) return LAB_LOCK_STATE.UNKNOWN;
  return record ? LAB_LOCK_STATE.STALE : LAB_LOCK_STATE.FREE;
}

export {LAB_HOLD};

// ---------------------------------------------------------------------------
// Test capability: what a machine can actually run, measured rather than
// assumed. The owner's rule (2026-09-18) is that no host belongs in any setup
// - the fleet changes - so discovery records FACTS per machine in the
// out-of-repo inventory, and placement chooses from them at run time. One
// POSIX script serves every machine, piped to `sh -s` locally for the
// controller and over ssh for a lab node, so the controller is never a special
// case. Everything it reports is a prerequisite a real run has tripped over: a
// lab node without helm, psql or the pinned MovieLens dataset reds five files
// for setup reasons (measured 2026-09-17), and one without a C++ compiler
// cannot build better-sqlite3 at npm ci.

// Bounded: an address that answers nothing must not hold discovery for two
// minutes (verifier round 1 measured 130 s against a blackholed address).
const SSH_BOUNDED_OPTIONS = Object.freeze([
  SSH_OPTION, 'ConnectTimeout=5',
  SSH_OPTION, 'ServerAliveInterval=5',
  SSH_OPTION, 'ServerAliveCountMax=2',
]);
const SSH_OPTION_PREFIX = '-';
const ERROR_TEXT_CAPABILITY = Object.freeze({
  BAD_TARGET: 'refusing an ssh target that begins with "-": ',
});
const STRICT_VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/u;
// The whole probe is bounded too: ServerAlive only notices a dead connection,
// not a live machine hung in git or node on a stuck mount (verifier round 2).
const PROBE_DEADLINE_MS = 60000;
const HEX_SHA256 = /^[0-9a-f]{64}$/u;

const CAPABILITY_TOOLS = Object.freeze([
  'git', 'docker', 'helm', 'wasm-tools', 'psql', 'g++', 'java', 'rg', 'jq',
]);
const CAPABILITY_YES = 'yes';
const CAPABILITY_NO = 'no';
const CAPABILITY_SEPARATOR = '=';
const CAPABILITY_TOOL_PREFIX = 'tool_';
// Tools only some files need: their absence is a gap for placement to route
// around, not a disqualification of the machine.
const PARTIAL_TOOLS = Object.freeze(['helm', 'wasm-tools', 'psql', 'java', 'rg', 'jq']);
const PARTIAL_TOOL_GAP_PREFIX = 'no-';
const SHELL_SINGLE_QUOTE = '\'';
const SHELL_ESCAPED_SINGLE_QUOTE = '\'\\\'\'';
// The pinned MovieLens file and digest the canary checks before its corpus
// (.github/workflows/full-corpus-canary.yml); a witness keeps them in step.
const MOVIELENS_FILE = 'data/examples/movielens-100k/u.data';
const MOVIELENS_SHA256 =
  '06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490';
// Whether node_modules holds exactly what package-lock.json names: `yes` when
// every non-optional package is installed at its locked version, `no`
// otherwise, and nothing at all when either file cannot be read (unknown).
const DEPENDENCIES_MATCH_SCRIPT =
  'const fs=require("fs");const r=process.argv[1];' +
  'const l=JSON.parse(fs.readFileSync(r+"/package-lock.json","utf8")).packages||{};' +
  'const h=JSON.parse(fs.readFileSync(r+"/node_modules/.package-lock.json","utf8"))' +
  '.packages||{};let bad=0;for(const k of Object.keys(l)){if(!k)continue;' +
  'const want=l[k];const have=h[k];if(!have){if(!want.optional)bad+=1;continue;}' +
  'if(have.version!==want.version)bad+=1;}console.log(bad===0?"yes":"no")';
// A fixed single-thread workload, so a sample is comparable across machines:
// the corpus is dominated by single-threaded test processes.
const CPU_SAMPLE_SCRIPT =
  'const c=require("crypto");const t=process.hrtime.bigint();' +
  'let h=Buffer.alloc(32);for(let i=0;i<200000;i+=1)' +
  'h=c.createHash("sha256").update(h).digest();' +
  'console.log(Number((process.hrtime.bigint()-t)/1000000n))';
// Leading space on purpose: `$((` is arithmetic expansion to a POSIX shell,
// so a subshell opened right after `$(` must be separated from it. The file
// goes in on stdin: GNU sha256sum escapes a name holding a backslash and then
// prefixes its digest line with one.
const sha256Of = (file) =>
  ` ( sha256sum < "${file}" || shasum -a 256 < "${file}" ) 2>/dev/null ` +
  '| awk \'{print $1}\'';

const CAPABILITY_SCRIPT = [
  'set +e',
  'repo="$1"',
  'node_major="$2"',
  // Clear the positional parameters BEFORE sourcing nvm: nvm.sh processes
  // its arguments, so a repo path of `--install` would otherwise make the
  // probe run `nvm install` on the machine it is only meant to observe
  // (verifier round 1). The probe reads; it never acts.
  'set --',
  'case "$repo" in "~/"*) repo="$HOME/${repo#??}";; "~") repo="$HOME";; esac',
  // printf, not echo: dash's echo rewrites backslash sequences, which
  // mangled any value containing a backslash (verifier round 1).
  'say() { printf "%s=%s\\n" "$1" "$2"; }',
  'say repo_path "$repo"',
  // The kernel's per-boot id, not /etc/machine-id: an installation cloned
  // from another's image keeps its machine-id - two lab machines here share
  // one (found 2026-09-18) - while no two running machines share a boot id.
  'say boot_id "$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || ' +
    '{ hostname; sysctl -n kern.boottime; } 2>/dev/null | tr -d \'\\n\')"',
  'say cores "$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null)"',
  'say mem_kib "$(awk \'/^MemTotal:/{print $2}\' /proc/meminfo 2>/dev/null)"',
  'NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
  '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && ' +
    '[ -n "$node_major" ] && nvm use "$node_major" >/dev/null 2>&1',
  // The absolute node a run must use: over non-interactive ssh a bare `node`
  // is often missing or years old, so a run repeats nothing - it uses this.
  'say node_path "$(command -v node 2>/dev/null)"',
  'say node_version "$(node -v 2>/dev/null)"',
  `for tool in ${CAPABILITY_TOOLS.join(' ')}; do ` +
    'if command -v "$tool" >/dev/null 2>&1; then say "tool_$tool" yes; ' +
    'else say "tool_$tool" no; fi; done',
  // Bounded: a wedged docker daemon must not hang discovery.
  'if command -v timeout >/dev/null 2>&1; then dockercheck="timeout 10 docker"; ' +
    'else dockercheck="docker"; fi',
  'if $dockercheck info >/dev/null 2>&1; then say docker_reachable yes; ' +
    'else say docker_reachable no; fi',
  'if [ -e "$repo/.git" ]; then',
  '  say repo_present yes',
  '  say repo_head "$(git -C "$repo" rev-parse HEAD 2>/dev/null)"',
  `  say lock_sha256 "$(${sha256Of('$repo/package-lock.json')})"`,
  '  if [ -d "$repo/node_modules" ]; then say node_modules yes; ' +
    'else say node_modules no; fi',
  // Installed MATCHES the lockfile, by content: every package the lockfile
  // requires (optional, platform-specific ones may be absent) is installed at
  // the version it names. A timestamp proxy is wrong both ways - a fresh
  // worktree's checkout makes its lockfile look newer than any install, and a
  // lockfile edit that changes no package makes a current install look stale.
  // `--` first: node reads an option-shaped argument after -e as an option,
  // so a path such as `--eval=...` would otherwise run (verifier round 2).
  `  say dependencies_current "$(node -e '${DEPENDENCIES_MATCH_SCRIPT}' -- "$repo" ` +
    '2>/dev/null)"',
  `  say movielens_sha256 "$(${sha256Of(`$repo/${MOVIELENS_FILE}`)})"`,
  'else',
  '  say repo_present no',
  'fi',
  `say cpu_sample_ms "$(node -e '${CPU_SAMPLE_SCRIPT}' 2>/dev/null)"`,
  ...LAB_LOCK_PROBE,
].join('\n');

function capabilityNumber(value) {
  const number = Number.parseInt(String(value || EMPTY), 10);
  return Number.isFinite(number) ? number : null;
}

// Three-valued: `yes` and `no` are facts, anything else - absent, empty or
// garbled - is unknown.
function capabilityFlag(value) {
  if (value === CAPABILITY_YES) return true;
  return value === CAPABILITY_NO ? false : null;
}

function capabilityText(value) {
  const text = String(value || EMPTY).trim();
  return text.length > 0 ? text : null;
}

/**
 * Parse the probe script's `key=value` lines into a capability record.
 * Unknown keys are ignored and a missing key reads as unknown (null), never as
 * a capability the machine was not shown to have.
 * @param {string} text
 * @param {number} [probedAt]
 * @return {Object}
 */
export function parseCapability(text, probedAt = Date.now()) {
  const values = Object.create(null);
  for (const line of String(text || EMPTY).split(/\r?\n/u)) {
    const at = line.indexOf(CAPABILITY_SEPARATOR);
    if (at <= 0) continue;
    values[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  const tools = Object.create(null);
  for (const tool of CAPABILITY_TOOLS) {
    tools[tool] = capabilityFlag(values[`${CAPABILITY_TOOL_PREFIX}${tool}`]);
  }
  const repoPresent = capabilityFlag(values.repo_present);
  return {
    probedAt,
    // Per boot, so named for what it is: it changes on every reboot.
    bootId: capabilityText(values.boot_id),
    repoPath: capabilityText(values.repo_path),
    nodePath: capabilityText(values.node_path),
    cores: capabilityNumber(values.cores),
    memKiB: capabilityNumber(values.mem_kib),
    nodeVersion: capabilityText(values.node_version),
    tools: {...tools},
    dockerReachable: capabilityFlag(values.docker_reachable),
    repo: {
      present: repoPresent,
      head: repoPresent ? capabilityText(values.repo_head) : null,
      lockSha256: repoPresent ? capabilityText(values.lock_sha256) : null,
      nodeModules: repoPresent ? capabilityFlag(values.node_modules) : null,
      dependenciesCurrent: repoPresent ? capabilityFlag(values.dependencies_current) : null,
    },
    movielensSha256: repoPresent ? capabilityText(values.movielens_sha256) : null,
    cpuSampleMs: capabilityNumber(values.cpu_sample_ms),
    machineLock: parseMachineLock(values),
  };
}

function shellQuote(value) {
  return `${SHELL_SINGLE_QUOTE}${String(value).split(SHELL_SINGLE_QUOTE)
    .join(SHELL_ESCAPED_SINGLE_QUOTE)}${SHELL_SINGLE_QUOTE}`;
}

/**
 * Probe one machine's test capability. With an ssh target the script runs
 * there; without one it runs here, for the controller.
 * @param {{sshTarget?: string, repoPath: string, nodeMajor?: string,
 *   captureCommand?: Function}} input
 * @return {Promise<Object>}
 */
export async function probeTestCapability({sshTarget = null, repoPath,
  nodeMajor = EMPTY, captureCommand = capture}) {
  // A target beginning with `-` would be read by ssh as an option.
  if (sshTarget && String(sshTarget).startsWith(SSH_OPTION_PREFIX)) {
    throw new Error(`${ERROR_TEXT_CAPABILITY.BAD_TARGET}${sshTarget}`);
  }
  const args = sshTarget ?
    [SSH_OPTION, SSH_BATCH_MODE, ...SSH_BOUNDED_OPTIONS, sshTarget,
      `sh -s -- ${shellQuote(repoPath)} ${shellQuote(nodeMajor)}`] :
    ['-s', '--', repoPath, nodeMajor];
  const text = await captureCommand(sshTarget ? SSH : 'sh', args,
    {stdin: `${CAPABILITY_SCRIPT}\n`, timeoutMs: PROBE_DEADLINE_MS});
  return parseCapability(text);
}


const READINESS = Object.freeze({
  NOT_PROBED: 'not-probed',
  NODE_TOO_OLD: 'node-too-old',
  NO_REPOSITORY: 'no-repository',
  LOCKFILE_DIFFERS: 'lockfile-differs',
  NO_DEPENDENCIES: 'no-dependencies',
  DEPENDENCIES_DIFFER: 'dependencies-differ-from-lockfile',
  DEPENDENCIES_UNKNOWN: 'dependencies-unknown',
  NO_REQUIREMENT: 'no-lockfile-requirement',
  NO_NODE_FLOOR: 'no-node-floor',
  NO_DATASET: 'movielens-dataset-missing',
  NO_DOCKER: 'docker-unreachable',
});

// Strict: `v23-garbage`, `v22.12x` and `v 22.12.0` are not versions.
function parseVersion(text) {
  const match = STRICT_VERSION.exec(String(text || EMPTY).trim());
  return match ? match.slice(1).map(Number) : null;
}

function nodeAtLeast(version, minimum) {
  const have = parseVersion(version);
  const need = parseVersion(minimum);
  if (!have || !need) return false;
  for (let index = 0; index < need.length; index += 1) {
    const a = have[index] ?? 0;
    const b = need[index] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/**
 * Whether a probed machine can run the whole corpus for a given lockfile, and
 * if not, every reason. A tool that only some files need (helm, wasm-tools,
 * psql, java, rg, jq) is reported as a gap rather than a disqualification, because
 * placement may still give the machine the files that do not need it.
 * @param {Object|null} capability
 * @param {{lockSha256: string, nodeMinimum: string}} requirement
 * @return {{ready: boolean, missing: string[], gaps: string[]}}
 */
export function corpusReadiness(capability, {lockSha256, nodeMinimum}) {
  if (!capability || typeof capability !== 'object') {
    return {ready: false, missing: [READINESS.NOT_PROBED], gaps: []};
  }
  const missing = [
    ...requirementProblems(capability, {lockSha256, nodeMinimum}),
    ...repositoryProblems(capability.repo, lockSha256),
  ];
  const gaps = [];
  if (capability.movielensSha256 !== MOVIELENS_SHA256) gaps.push(READINESS.NO_DATASET);
  if (capability.dockerReachable !== true) gaps.push(READINESS.NO_DOCKER);
  for (const tool of PARTIAL_TOOLS) {
    if (capability.tools?.[tool] !== true) gaps.push(`${PARTIAL_TOOL_GAP_PREFIX}${tool}`);
  }
  return {ready: missing.length === 0, missing, gaps};
}

// What the requirement itself lacks, then whether the machine's node meets it.
// No requirement is no match: without a lockfile digest to compare, a machine
// with no lockfile would otherwise read as matching; and an engines floor
// that is not a version is named as such, not blamed on every machine's node.
function requirementProblems(capability, {lockSha256, nodeMinimum}) {
  const problems = [];
  if (!HEX_SHA256.test(String(lockSha256 || EMPTY))) problems.push(READINESS.NO_REQUIREMENT);
  if (!parseVersion(nodeMinimum)) {
    problems.push(READINESS.NO_NODE_FLOOR);
  } else if (!nodeAtLeast(capability.nodeVersion, nodeMinimum)) {
    problems.push(READINESS.NODE_TOO_OLD);
  }
  return problems;
}

function repositoryProblems(repo, lockSha256) {
  if (repo?.present !== true) return [READINESS.NO_REPOSITORY];
  const problems = [];
  if (repo.lockSha256 !== lockSha256) problems.push(READINESS.LOCKFILE_DIFFERS);
  if (repo.nodeModules !== true) {
    problems.push(READINESS.NO_DEPENDENCIES);
  } else if (repo.dependenciesCurrent === null) {
    problems.push(READINESS.DEPENDENCIES_UNKNOWN);
  } else if (repo.dependenciesCurrent !== true) {
    problems.push(READINESS.DEPENDENCIES_DIFFER);
  }
  return problems;
}

export {CAPABILITY_SCRIPT, MOVIELENS_FILE, MOVIELENS_SHA256, READINESS};

// ---------------------------------------------------------------------------
// Worker provisioning: the one script a newly registered lab worker runs, by
// hand and as the user the controller connects as, to install everything
// discovery checks for (owner request, 2026-09-18). Its toolchain is not
// written down here: the full-corpus canary's own install steps are read from
// the workflow when the script is generated and embedded line for line, so a
// worker and CI cannot drift apart. Around them is what a worker needs beyond
// a hosted runner: the system packages such a runner already has, node through
// nvm (as discovery activates it), the checkout and its dependencies, and the
// controller's public key.

const WORKER_CANARY_STEPS = Object.freeze({
  TOOLCHAIN: 'Install gate CLI tools',
  DATASET: 'Fetch MovieLens dataset (digest-pinned)',
});
// What a hosted runner has and a fresh worker may not: git, curl and
// certificates, a C++ toolchain and python for native modules at npm ci, unzip.
const WORKER_SYSTEM_PACKAGES = Object.freeze(
  ['git', 'ca-certificates', 'curl', 'build-essential', 'python3', 'unzip']);
// Only when docker is absent: a machine with Docker's own packages keeps them.
const WORKER_DOCKER_PACKAGE = 'docker.io';
const WORKER_SOURCE = Object.freeze({SYSTEM: 'system', CANARY: 'canary'});
// Where each tool the fleet probe checks comes from on a worker, and the text
// that installs it there.
const WORKER_TOOL_SOURCES = Object.freeze({
  'git': Object.freeze({from: WORKER_SOURCE.SYSTEM, token: 'git', version: 'git --version'}),
  'docker': Object.freeze({from: WORKER_SOURCE.SYSTEM, token: WORKER_DOCKER_PACKAGE,
    version: 'docker --version'}),
  'g++': Object.freeze({from: WORKER_SOURCE.SYSTEM, token: 'build-essential',
    version: 'g++ --version'}),
  'helm': Object.freeze({from: WORKER_SOURCE.CANARY, token: '/usr/local/bin/helm',
    version: 'helm version --short'}),
  'wasm-tools': Object.freeze({from: WORKER_SOURCE.CANARY, token: '/usr/local/bin/wasm-tools',
    version: 'wasm-tools --version'}),
  'psql': Object.freeze({from: WORKER_SOURCE.CANARY, token: 'postgresql-client',
    version: 'psql --version'}),
  'java': Object.freeze({from: WORKER_SOURCE.CANARY, token: 'default-jre-headless',
    version: 'java -version'}),
  'rg': Object.freeze({from: WORKER_SOURCE.CANARY, token: 'ripgrep', version: 'rg --version'}),
  'jq': Object.freeze({from: WORKER_SOURCE.CANARY, token: ' jq ', version: 'jq --version'}),
});
// What a canary step may not use, because a worker has no runner to provide
// it: GitHub expressions and runner variables beyond the temporary directory
// the setup defines, a step environment, another shell or working directory.
// Generation refuses rather than writing a script that fails on the worker
// after sudo (verifier round 1).
const WORKER_UNREPRODUCIBLE_TEXT = /\$\{\{|\bGITHUB_[A-Z_]+|\bRUNNER_(?!TEMP\b)[A-Z_]+/u;
const WORKER_UNREPRODUCIBLE_KEYS = Object.freeze(['env', 'shell', 'working-directory']);
const WORKER_NVM_VERSION = 'v0.40.3';
const WORKER_NVM_INSTALL_SHA256 =
  '2d8359a64a3cb07c02389ad88ceecd43f2fa469c06104f92f98df5b6f315275f';
const WORKER_SETUP_FILE = 'lagrange-lab-worker-setup.sh';
const WORKER_GITHUB_SSH_ORIGIN = /^git@github\.com:(.+)$/u;
const WORKER_PUBLIC_KEY = /^(?:ssh-|ecdsa-|sk-)\S+ [A-Za-z0-9+/=]+(?: [^\n]*)?$/u;
const WORKER_TEXT = Object.freeze({
  NO_STEP: 'the full-corpus canary has no step named ',
  NO_FLOOR: 'worker setup needs a MAJOR.MINOR.PATCH engines floor, not ',
  NO_REPO: 'worker setup needs a clone URL',
  BAD_KEY: 'not an ssh public key: ',
  UNREPRODUCIBLE: 'a worker cannot reproduce the canary step ',
});

const WORKER_NEWLINE = '\n';
const WORKER_VERSION_SEPARATOR = '.';
const WORKER_SUBSHELL = Object.freeze({OPEN: '(', CLOSE: ')'});
const WORKER_SCRIPT_HEADER = Object.freeze([
  '#!/usr/bin/env bash',
  '# Lagrange lab worker setup, generated by `node scripts/lab.js provision`.',
  '# Run it on the new worker as the user the controller connects as; it asks',
  '# for sudo once, for system packages:',
  `#     bash ${WORKER_SETUP_FILE}`,
  '# Safe to run again: it installs what is missing, re-applies the canary\'s',
  '# pinned toolchain, moves the checkout to main only when nothing is lost, and',
  '# ends by printing what the worker has. Then, on the controller:',
  '#     node scripts/lab.js fleet',
  'set -euo pipefail',
]);
const WORKER_SCRIPT_GUARDS = Object.freeze([
  'REPO_PATH="${LAGRANGE_REPO_PATH:-$HOME/projects/lagrange}"',
  `NVM_VERSION=${shellQuote(WORKER_NVM_VERSION)}`,
  `NVM_INSTALL_SHA256=${shellQuote(WORKER_NVM_INSTALL_SHA256)}`,
  `MOVIELENS_FILE=${shellQuote(MOVIELENS_FILE)}`,
  `MOVIELENS_SHA256=${shellQuote(MOVIELENS_SHA256)}`,
  'relogin=""',
  'USER="${USER:-$(id -un)}"',
  'step() { printf \'\\n== %s\\n\' "$*"; }',
  'fail() { printf \'lagrange lab worker setup: %s\\n\' "$*" >&2; exit 1; }',
  // Everything it cannot provision is refused before anything is asked.
  '[ "$(uname -s)" = Linux ] || fail "this setup is for Linux, not $(uname -s)"',
  '[ "$(uname -m)" = x86_64 ] || fail "the canary pins x86_64 helm and wasm-tools ' +
    'archives, not $(uname -m)"',
  'command -v apt-get >/dev/null 2>&1 || fail "this setup needs apt-get ' +
    '(Debian or Ubuntu family)"',
  '[ "$(id -u)" != 0 ] || fail "run it as the lab user the controller connects as, ' +
    'not as root"',
  'step "sudo, asked once for system packages"',
  'sudo -v',
  'workdir="$(mktemp -d)"',
  'trap \'rm -rf "$workdir"\' EXIT',
  // The canary's step installs into the runner's temporary directory.
  'RUNNER_TEMP="$workdir"',
]);
const WORKER_SCRIPT_SYSTEM = Object.freeze([
  'step "System packages a hosted runner already has"',
  'missing=""',
  `for package in ${WORKER_SYSTEM_PACKAGES.join(' ')}; do`,
  '  dpkg -s "$package" >/dev/null 2>&1 || missing="$missing $package"',
  'done',
  `command -v docker >/dev/null 2>&1 || missing="$missing ${WORKER_DOCKER_PACKAGE}"`,
  'if [ -n "$missing" ]; then',
  '  sudo apt-get update',
  '  # One word per package.',
  '  sudo apt-get install -y --no-install-recommends $missing',
  'fi',
  'if ! id -nG | tr " " "\\n" | grep -qx docker; then',
  '  sudo usermod -aG docker "$USER"',
  '  relogin=yes',
  'fi',
  'step "The full-corpus canary\'s toolchain, as the canary installs it"',
]);
const WORKER_SCRIPT_NODE = Object.freeze([
  'step "Node $NODE_MAJOR through nvm, as discovery activates it"',
  'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
  'if [ ! -s "$NVM_DIR/nvm.sh" ]; then',
  '  curl -fsSL --connect-timeout 20 --max-time 120 -o "$workdir/nvm-install.sh" ' +
    '"https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh"',
  '  echo "$NVM_INSTALL_SHA256  $workdir/nvm-install.sh" | sha256sum --check --quiet',
  '  bash "$workdir/nvm-install.sh"',
  'fi',
  // nvm reads unset variables.
  'set +u',
  '. "$NVM_DIR/nvm.sh"',
  'nvm install "$NODE_MAJOR"',
  'set -u',
  'node -e \'const v=(t)=>t.split(".").map(Number);const [a,b,c]=v(process.versions.node);' +
    'const [x,y,z]=v(process.argv[1]);process.exit(a!==x?(a>x?0:1):b!==y?(b>y?0:1):' +
    '(c>=z?0:1))\' "$NODE_MINIMUM" || fail "node $(node -v) is below $NODE_MINIMUM"',
  'step "The checkout at $REPO_PATH"',
  'if [ ! -e "$REPO_PATH/.git" ]; then',
  '  mkdir -p "$(dirname "$REPO_PATH")"',
  '  git clone -- "$REPO_URL" "$REPO_PATH"',
  'elif [ -z "$(git -C "$REPO_PATH" status --porcelain)" ]; then',
  '  git -C "$REPO_PATH" fetch --quiet -- "$REPO_URL" main',
  // Moved only when nothing is lost: main fast-forwards, a detached HEAD
  // that main already contains follows it, anything else stays as it is.
  '  branch="$(git -C "$REPO_PATH" symbolic-ref --quiet --short HEAD || true)"',
  '  if [ "$branch" = main ]; then',
  '    git -C "$REPO_PATH" merge --quiet --ff-only FETCH_HEAD || ' +
    'echo "left main as it is: it has commits lagrange main does not"',
  '  elif [ -z "$branch" ] && git -C "$REPO_PATH" merge-base --is-ancestor HEAD FETCH_HEAD; then',
  '    git -C "$REPO_PATH" checkout --quiet --detach FETCH_HEAD',
  '  else',
  '    echo "left as it is: $REPO_PATH is ${branch:+on }${branch:-detached with commits ' +
    'lagrange main does not have}"',
  '  fi',
  'else',
  '  echo "left as it is: $REPO_PATH has local changes"',
  'fi',
  'step "Dependencies that match the lockfile"',
  `if [ "$(node -e '${DEPENDENCIES_MATCH_SCRIPT}' -- "$REPO_PATH" 2>/dev/null)" != yes ]; then`,
  '  (cd "$REPO_PATH" && npm ci)',
  'fi',
  'step "The pinned MovieLens dataset, as the canary fetches it"',
  'if [ "$({ sha256sum < "$REPO_PATH/$MOVIELENS_FILE"; } 2>/dev/null | cut -d" " -f1)" != ' +
    '"$MOVIELENS_SHA256" ]; then',
  '  (',
  '    cd "$REPO_PATH"',
]);
const WORKER_SCRIPT_DATASET_CLOSE = Object.freeze(['  )', 'fi']);
const WORKER_SCRIPT_KEYS = Object.freeze([
  'step "The controller\'s ssh key"',
  'mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"',
  'touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"',
]);
const WORKER_SCRIPT_REPORT = Object.freeze([
  'step "What this worker now has"',
  'report() {',
  '  if command -v "$1" >/dev/null 2>&1; then',
  '    printf "  %-11s %s\\n" "$1" "$("$@" 2>&1 | head -n 1)"',
  '  else',
  '    printf "  %-11s MISSING\\n" "$1"',
  '  fi',
  '}',
  'report node -v',
  // Every tool discovery checks, from the one list that says where it comes from.
  ...Object.values(WORKER_TOOL_SOURCES).map((source) => `report ${source.version}`),
  'if docker info >/dev/null 2>&1; then echo "  docker daemon reachable"; ' +
    'else echo "  docker daemon NOT reachable yet for $USER"; fi',
  'if [ "$({ sha256sum < "$REPO_PATH/$MOVIELENS_FILE"; } 2>/dev/null | cut -d" " -f1)" = ' +
    '"$MOVIELENS_SHA256" ]; then echo "  MovieLens dataset pinned digest ok"; ' +
    'else echo "  MovieLens dataset digest MISMATCH"; fi',
  'if [ -n "$relogin" ]; then',
  '  echo',
  '  echo "$USER was added to the docker group: log out and in again (or reboot)."',
  'fi',
  'echo',
  'echo "Done. On the controller: node scripts/lab.js fleet"',
]);
const WORKER_SCP = 'scp';
const WORKER_SCP_BOUND = Object.freeze([SSH_OPTION, SSH_BATCH_MODE, ...SSH_BOUNDED_OPTIONS]);

// A variable the job or workflow defines, which a worker's shell would not.
function inheritedVariable(workflow, job, run) {
  const names = [...Object.keys(workflow?.env || {}), ...Object.keys(job?.env || {})];
  // A prefix match only refuses more, never less.
  return names.find((variable) => run.includes(`$${variable}`) || run.includes(`\${${variable}`));
}

function canaryStepRun(workflow, name) {
  for (const job of Object.values(workflow?.jobs || {})) {
    for (const step of job?.steps || []) {
      if (step?.name !== name || typeof step.run !== 'string') continue;
      const unreproducible = WORKER_UNREPRODUCIBLE_KEYS.find((key) => Object.hasOwn(step, key)) ||
        WORKER_UNREPRODUCIBLE_TEXT.exec(step.run)?.[0] ||
        inheritedVariable(workflow, job, step.run);
      if (unreproducible) {
        throw new Error(`${WORKER_TEXT.UNREPRODUCIBLE}"${name}" uses ${unreproducible}`);
      }
      return step.run.trimEnd();
    }
  }
  throw new Error(`${WORKER_TEXT.NO_STEP}"${name}": worker setup follows its install steps`);
}

/**
 * The URL a worker clones from: an ssh GitHub origin becomes its https form,
 * because a lab worker has no GitHub key; anything else is used as it is.
 * @param {string} origin the controller's origin URL
 * @return {string}
 */
export function workerCloneUrl(origin) {
  const text = String(origin || EMPTY).trim();
  const ssh = WORKER_GITHUB_SSH_ORIGIN.exec(text);
  return ssh ? `https://github.com/${ssh[1]}` : text;
}

/**
 * The worker setup script: bash, run once on a new lab worker, safe to run
 * again. Built only from what it is given - the canary workflow, the engines
 * floor, the clone URL and the controller's public keys - so no host is
 * written anywhere.
 * @param {{workflow: Object, nodeMinimum: string, repoUrl: string,
 *   authorizedKeys?: string[], generatedFrom?: string}} input
 * @return {string}
 */
export function workerSetupScript({workflow, nodeMinimum, repoUrl, authorizedKeys = [],
  generatedFrom = EMPTY}) {
  if (!parseVersion(nodeMinimum)) throw new Error(`${WORKER_TEXT.NO_FLOOR}${nodeMinimum}`);
  if (!repoUrl) throw new Error(WORKER_TEXT.NO_REPO);
  for (const key of authorizedKeys) {
    if (!WORKER_PUBLIC_KEY.test(key)) throw new Error(`${WORKER_TEXT.BAD_KEY}${key}`);
  }
  return [
    ...WORKER_SCRIPT_HEADER,
    ...(generatedFrom ? [`# Generated from ${generatedFrom}.`] : []),
    `REPO_URL=${shellQuote(repoUrl)}`,
    `NODE_MINIMUM=${shellQuote(nodeMinimum)}`,
    `NODE_MAJOR=${shellQuote(nodeMinimum.split(WORKER_VERSION_SEPARATOR)[0])}`,
    ...WORKER_SCRIPT_GUARDS,
    ...WORKER_SCRIPT_SYSTEM,
    WORKER_SUBSHELL.OPEN,
    canaryStepRun(workflow, WORKER_CANARY_STEPS.TOOLCHAIN),
    WORKER_SUBSHELL.CLOSE,
    ...WORKER_SCRIPT_NODE,
    canaryStepRun(workflow, WORKER_CANARY_STEPS.DATASET),
    ...WORKER_SCRIPT_DATASET_CLOSE,
    ...(authorizedKeys.length > 0 ? WORKER_SCRIPT_KEYS : []),
    ...authorizedKeys.map((key) => `grep -qxF ${shellQuote(key)} ` +
      `"$HOME/.ssh/authorized_keys" || echo ${shellQuote(key)} >> "$HOME/.ssh/authorized_keys"`),
    ...WORKER_SCRIPT_REPORT,
  ].join(WORKER_NEWLINE) + WORKER_NEWLINE;
}

/**
 * Copy the setup to a registered worker's home directory with bounded scp,
 * and return the one command the owner runs there. It is never run from here.
 * @param {{sshTarget: string, file: string, runCommand?: Function}} input
 * @return {Promise<string>}
 */
export async function copyWorkerSetup({sshTarget, file, runCommand = run}) {
  if (!sshTarget || String(sshTarget).startsWith(SSH_OPTION_PREFIX)) {
    throw new Error(`${ERROR_TEXT_CAPABILITY.BAD_TARGET}${sshTarget}`);
  }
  await runCommand(WORKER_SCP, [...WORKER_SCP_BOUND, file, `${sshTarget}:${WORKER_SETUP_FILE}`]);
  return `ssh -t ${sshTarget} bash ${WORKER_SETUP_FILE}`;
}

export {WORKER_CANARY_STEPS, WORKER_SETUP_FILE, WORKER_SYSTEM_PACKAGES, WORKER_TOOL_SOURCES};

const FLEET_CONTROLLER_NAME = '(controller)';
const FLEET_DEFAULT_REPO_PATH = '~/projects/lagrange';

async function settleProbe(probe, input) {
  try {
    return {capability: await probe(input), error: null};
  } catch (error) {
    return {capability: null, error: error.message};
  }
}

/**
 * Discover the fleet: the controller and every inventory machine with an ssh
 * target, probed in parallel. A machine reached twice - listed in the
 * inventory AND being the controller - is recognised by its boot identity
 * and marked, so it is never counted as two machines. Nothing here chooses
 * where anything runs; it records what each machine can do.
 * @param {Object} input
 * @param {Array<Object>} input.nodes inventory nodes
 * @param {string} input.controllerRepoPath this checkout
 * @param {string} input.lockSha256 the lockfile a run would need
 * @param {string} input.nodeMinimum package.json engines floor
 * @param {Function} [input.probe]
 * @return {Promise<Array<Object>>}
 */
export async function discoverFleet({nodes, controllerRepoPath, lockSha256,
  nodeMinimum, probe = probeTestCapability}) {
  // The node major a run activates, taken from the engines floor rather than
  // written down a second time.
  const nodeMajor = String(nodeMinimum || EMPTY).split('.')[0];
  const targets = [{name: FLEET_CONTROLLER_NAME, controller: true,
    input: {sshTarget: null, repoPath: controllerRepoPath, nodeMajor}}];
  for (const node of nodes) {
    if (!node || !node.ssh) continue;
    targets.push({name: node.name, controller: false,
      input: {sshTarget: node.ssh, repoPath: node.repoPath || FLEET_DEFAULT_REPO_PATH,
        nodeMajor}});
  }
  const outcomes = await Promise.all(
    targets.map((target) => settleProbe(probe, target.input)));
  const firstByMachine = new Map();
  return targets.map((target, index) => {
    const {capability, error} = outcomes[index];
    const bootId = capability?.bootId ?? null;
    const sameMachineAs = bootId && firstByMachine.has(bootId) ?
      firstByMachine.get(bootId) : null;
    if (bootId && !sameMachineAs) firstByMachine.set(bootId, target.name);
    return {
      name: target.name,
      controller: target.controller,
      capability,
      error,
      sameMachineAs,
      readiness: corpusReadiness(capability, {lockSha256, nodeMinimum}),
    };
  });
}

export {FLEET_CONTROLLER_NAME, FLEET_DEFAULT_REPO_PATH};

const FLEET_NAME_COLUMN = 16;
const FLEET_FACTOR_DIGITS = 2;
const FLEET_UNKNOWN = '?';
const FLEET_TEXT = Object.freeze({
  UNREACHABLE: 'unreachable: ',
  SAME_MACHINE: 'same machine as ',
  READY: 'ready',
  NOT_READY: 'not ready: ',
  GAPS_OPEN: ' (gaps: ',
  GAPS_CLOSE: ')',
  LIST: ', ',
  LOCK: ' | ',
});

/**
 * Record one discovery pass in the inventory state. A machine that answered
 * gets its fresh facts; one that did not KEEPS its last known facts but also
 * records the failed attempt, so placement can never mistake stale facts for
 * live ones (verifier round 1).
 * @param {Object} state the lab inventory state
 * @param {Array<Object>} fleet discoverFleet's result
 * @param {number} [now]
 * @return {Object} the same state
 */
export function recordFleet(state, fleet, now = Date.now()) {
  for (const entry of fleet) {
    const target = entry.controller ?
      (state.controller = {...(state.controller || {})}) :
      state.nodes?.[entry.name];
    if (!target) continue;
    if (entry.capability) {
      target.testCapability = entry.capability;
      delete target.lastProbeFailure;
    } else {
      target.lastProbeFailure = {at: now, error: entry.error};
    }
  }
  return state;
}

/**
 * One line per machine: identity-merged, unreachable, ready or not, and the
 * gaps placement would route around, with speed relative to the controller;
 * then who holds the machine under the lab convention, when it answered.
 * @param {Array<Object>} fleet
 * @return {string[]}
 */
export function formatFleet(fleet) {
  const reference = fleet.find((entry) => entry.controller)?.capability?.cpuSampleMs;
  return fleet.map((entry) => {
    const cap = entry.capability;
    const factor = cap?.cpuSampleMs && reference ?
      (cap.cpuSampleMs / reference).toFixed(FLEET_FACTOR_DIGITS) : FLEET_UNKNOWN;
    return `${entry.name.padEnd(FLEET_NAME_COLUMN)} cores=${cap?.cores ?? FLEET_UNKNOWN} ` +
      `speed x${factor} ${fleetVerdict(entry)}${fleetGaps(entry)}${fleetLock(cap)}`;
  });
}

function fleetLock(capability) {
  return capability?.machineLock ?
    `${FLEET_TEXT.LOCK}${labLockText(capability.machineLock)}` : EMPTY;
}

function fleetVerdict(entry) {
  if (entry.error) return `${FLEET_TEXT.UNREACHABLE}${entry.error}`;
  if (entry.sameMachineAs) return `${FLEET_TEXT.SAME_MACHINE}${entry.sameMachineAs}`;
  return entry.readiness.ready ? FLEET_TEXT.READY :
    `${FLEET_TEXT.NOT_READY}${entry.readiness.missing.join(FLEET_TEXT.LIST)}`;
}

function fleetGaps(entry) {
  return entry.readiness.gaps.length > 0 ?
    `${FLEET_TEXT.GAPS_OPEN}${entry.readiness.gaps.join(FLEET_TEXT.LIST)}` +
    `${FLEET_TEXT.GAPS_CLOSE}` : EMPTY;
}

// ---------------------------------------------------------------------------
// Placement: run one classified plan across the machines discovery finds
// ready, choosing at test time. The owner's rule (2026-09-18): an ordinary
// push proves itself locally and in parallel, and no host is written into any
// setup, so every choice below comes from facts measured on this run - the
// fleet is probed again (about a second) and each file's last duration
// decides the split. A machine receives a FILE SET and runs its own serial
// lanes: overlapping the exclusive and ordinary lanes on one host reds five
// contention-sensitive SLOs (measured 2026-09-17), sharding across hosts adds
// no contention. A lab machine can only make a green faster: a file red there
// is decided again on the controller, and one that then passes is recorded
// against that machine and routed elsewhere next time.

const PLACEMENT_ENV = 'LAGRANGE_PLACEMENT';
const PLACEMENT_LOCAL = 'local';
// Below this the whole plan costs less on the controller than waiting for a
// lab machine's setup is worth: the common small cone never probes at all.
const PLACEMENT_MIN_PLAN_MS = 5 * MS_PER_MINUTE;
// Bundle, fetch, worktree and nvm on a lab machine, charged before its files.
const PLACEMENT_REMOTE_SETUP_MS = 30 * MS_PER_SECOND;
// A file goes to a lab machine only if its duration there - measured here,
// scaled by the machine's speed - is at most half the runner's default
// per-file timeout. The first placed run gave an 8-thread machine at speed
// x2.13 a 4-minute simulation file, which timed out at 600 s there and then
// ran again here (measured 2026-09-18).
const PLACEMENT_FILE_FIT_MS = 5 * MS_PER_MINUTE;
// More remote reds than this is breakage, not a routing miss: they are
// reported red rather than run a second time on the controller.
const PLACEMENT_RERUN_CAP = 20;
// A shard gets three times its estimate, never under half an hour.
const PLACEMENT_DEADLINE_FACTOR = 3;
const PLACEMENT_DEADLINE_FLOOR_MS = 30 * MS_PER_MINUTE;
const PLACEMENT_EXIT = Object.freeze({
  SETUP: LAB_LOCK_EXIT.SETUP, BUSY: LAB_LOCK_EXIT.BUSY, INTERRUPTED: 130,
  TERMINATED: LAB_LOCK_EXIT.TERMINATED, SSH: 255,
});
const PLACEMENT_SHELL_LINE = /^placement-shell=(\d+)$/mu;
// A stopped shard's shell gets this long to clean up before its connection
// is cut.
const PLACEMENT_STOP_GRACE_MS = 10 * MS_PER_SECOND;
// The runner's per-file verdict line: `ok|not ok FILE (N assertions, Tms)`.
const PLACEMENT_VERDICT_LINE = /^(ok|not ok) (\S+) \((\d+) assertions, \d+ms\)$/u;
const PLACEMENT_VERDICT_GREEN = 'ok';
const PLACEMENT_VERDICT_PART = Object.freeze({VERDICT: 1, FILE: 2, ASSERTIONS: 3});
const PLACEMENT_RETRIED_PASS_LINE = /^# retried-once pass (\S+)$/u;
// A bundle upload that has not finished by this is a stalled machine.
const PLACEMENT_UPLOAD_DEADLINE_SECONDS = 300;
// What the controller's own run policy hands a lab machine's runner.
const PLACEMENT_FORWARDED_ENV = Object.freeze({
  RETRY: 'LAGRANGE_RETRY_FAILED_ONCE',
  TAP_TIMEOUT: 'TAP_TIMEOUT',
});
// A closed terminal (SIGHUP) stops a placed run like an interrupt: the
// controller child and the lab wrappers are detached, so nothing else would.
const PLACEMENT_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
// How long an aborted shard's lab shell is given to clean up before it is cut.
const PLACEMENT_ABORT_GRACE_MS = 5000;
const PLACEMENT_ABORT_POLL_MS = 100;
// Waits, in a shell, for every pid after $1 to end - a zombie has ended - for
// at most $1 polls: the caller is a signal handler with no event loop left to
// wait in.
const PLACEMENT_WAIT_SCRIPT =
  'n=$1; shift; i=0; while [ "$i" -lt "$n" ]; do alive=; for p in "$@"; do ' +
  's=$(ps -o stat= -p "$p" 2>/dev/null); case "$s" in ""|Z*) ;; *) alive=1;; esac; ' +
  'done; [ -z "$alive" ] && exit 0; sleep 0.1; i=$((i+1)); done';
const PLACEMENT_WORD_SEPARATOR = ' ';
const PLACEMENT_RUNNER = 'scripts/run-classified-test-files.js';
const PLACEMENT_RUNNER_STDIN = '--stdin';
const PLACEMENT_STDIO_PIPE = 'pipe';
const PLACEMENT_STDIO_INHERIT = 'inherit';
const PLACEMENT_WRAPPER_HEAD = Object.freeze([
  'set -u',
  'status=0',
  'if command -v timeout >/dev/null 2>&1; then ' +
    // --foreground keeps timeout, and so the upload, in the wrapper's group.
    `bound="timeout --foreground ${PLACEMENT_UPLOAD_DEADLINE_SECONDS}"; else bound=; fi`,
]);
const PLACEMENT_WRAPPER_UPLOAD_FAILED = 'echo "placement: the bundle upload failed" >&2;';
const PLACEMENT_WRAPPER_EXIT = 'exit "$status";';
const PLACEMENT_PARENT = 'test-output/placement-worktrees';
const PLACEMENT_LOG_PARENT = 'test-output/placement';
const PLACEMENT_FILES_MARK = 'LAGRANGE_PLACEMENT_FILES';
const PLACEMENT_MACHINE_FACTOR_ENV = 'LAGRANGE_TEST_MACHINE_FACTOR';
const PLACEMENT_FACTOR_STEPS = 10;
const PLACEMENT_MINUTE_DIGITS = 1;
const PLACEMENT_LINE = /\r?\n/u;
// How often a streamed shard's relay files are read for new lines.
const PLACEMENT_TAIL_POLL_MS = 250;
const PLACEMENT_READ_FLAG = 'r';
const PLACEMENT_STREAM = Object.freeze({OUT: 'out', ERR: 'err'});
// The controller child's file list, named for this process and a count.
const PLACEMENT_CHILD_LIST_PREFIX = 'controller-';
const PLACEMENT_CHILD_LIST_SUFFIX = '.files';
let childListCount = 0;
// Keepalive for a long run: a dead connection is noticed within a minute.
const SSH_RUN_OPTIONS = Object.freeze([
  SSH_OPTION, 'ConnectTimeout=5',
  SSH_OPTION, 'ServerAliveInterval=15',
  SSH_OPTION, 'ServerAliveCountMax=4',
]);
const TEXT_UTF8 = 'utf8';
const PLACEMENT_SHELL = 'sh';
const PLACEMENT_SHELL_STDIN = Object.freeze(['-s', '--']);
const PLACEMENT_SHELL_COMMAND = '-c';
const PLACEMENT_GIT = 'git';
const PLACEMENT_GIT_HAS_COMMIT = Object.freeze(['cat-file', '-e']);
const PLACEMENT_GIT_IS_ANCESTOR = Object.freeze(['merge-base', '--is-ancestor']);
const PLACEMENT_GIT_HEAD = Object.freeze(['rev-parse', 'HEAD']);
const PLACEMENT_CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit', CLOSE: 'close',
  DATA: 'data', END: 'end'});
const PLACEMENT_STDIO_IGNORE = 'ignore';
const PLACEMENT_NEWLINE = '\n';
const PLACEMENT_VERSION_SEPARATOR = '.';
const PLACEMENT_SAFE_CHARACTER = '_';
const PLACEMENT_RUN_SHA_CHARACTERS = 12;
const PLACEMENT_RUN_RADIX = 36;
const REQUIREMENT_FILE = Object.freeze({PACKAGE: 'package.json', LOCK: 'package-lock.json'});
const REQUIREMENT_DIGEST = Object.freeze({ALGORITHM: 'sha256', ENCODING: 'hex'});
const PLACEMENT_UPLOAD_SCRIPT = 'mkdir -p "${1%/*}" && cat > "$1"';
const PLACEMENT_KILL_SCRIPT = 'kill -TERM "$1" 2>/dev/null';
const PLACEMENT_TEXT = Object.freeze({
  PREFIX: 'placement: ',
  LOCAL: 'placement: local - ',
  NOT_A_COMMIT: 'the tree is not exactly a commit, and only a commit is sent',
  NO_MACHINE: 'no lab machine is ready',
  NO_GAIN: 'no lab machine would shorten this run',
  NO_HISTORY: 'shares no history with this commit',
  UNREPORTED: ' file(s) with no result from there run on the controller: ',
  NO_INVENTORY: 'the lab inventory could not be read: ',
  RED_THERE: ' file(s) red there are decided on the controller',
  OVER_CAP: 'remote reds exceed the rerun cap: breakage, reported red without a rerun',
  MISS: ' passed on the controller: routed away from ',
  FAIL_FAST: 'fail-fast asks for the first red, which a placed run cannot give',
  THERMAL_UNFIT: 'host-thermal-unfit ',
  HOST_BUSY: 'host-busy ',
  HELD_BY: ' held-by ',
  SINCE: ' since ',
  NO_HOLDER: ' held-by (no holder record)',
  MOVED_FROM: ' (from ',
  MOVED_CLOSE: ')',
  REFUSED_BUSY: 'held by another agent',
  REFUSED_HOT: 'too hot to run',
  NO_NEXT_HOST: ', and no ready lab host is left',
  DEADLINE: 'deadline',
  INTERRUPTED: 'interrupted',
});

/**
 * Split files over machines by measured cost. Longest first, each file goes to
 * the machine that would finish it soonest: its duration over its lane's
 * workers, scaled by the machine's measured speed, after the machine's setup.
 * A lab machine left with less work than its setup is dropped and the split
 * redone, so a machine is used only when it shortens the run. The controller
 * is always a machine and never avoids a file.
 * @param {Array<{file: string, ms: number, jobs: number}>} costs
 * @param {Array<{name: string, controller: boolean, speed: number,
 *   avoid?: string[]}>} machines
 * @param {{setupMs?: number}} [options]
 * @return {Array<{machine: Object, files: string[], loadMs: number}>}
 */
export function placeTestFiles(costs, machines, {setupMs = PLACEMENT_REMOTE_SETUP_MS} = {}) {
  let candidates = machines;
  for (;;) {
    const shards = assignByCost(costs, candidates, setupMs);
    const idle = shards
      .filter((shard) => !shard.machine.controller && shard.loadMs < 2 * setupMs)
      .sort((left, right) => left.loadMs - right.loadMs)[0];
    if (!idle) return shards.filter((shard) => shard.files.length > 0);
    candidates = candidates.filter((machine) => machine !== idle.machine);
  }
}

function assignByCost(costs, machines, setupMs) {
  const shards = machines.map((machine) => ({
    machine, files: [], loadMs: machine.controller ? 0 : setupMs,
  }));
  const ordered = [...costs].sort((left, right) =>
    (right.ms / right.jobs) - (left.ms / left.jobs) ||
    (left.file < right.file ? -1 : 1));
  for (const cost of ordered) {
    let best = null;
    let bestFinish = Infinity;
    for (const shard of shards) {
      if (!fits(shard.machine, cost)) continue;
      const finish = shard.loadMs + (cost.ms / cost.jobs) * shard.machine.speed;
      if (finish < bestFinish) {
        best = shard;
        bestFinish = finish;
      }
    }
    best.files.push(cost.file);
    best.loadMs = bestFinish;
  }
  return shards;
}

// Whether a file may go to a machine: the controller takes anything; a lab
// machine not a file it is known to fail, nor one it could not finish well
// inside the per-file timeout.
function fits(machine, cost) {
  if (machine.controller) return true;
  return !machine.avoid?.includes(cost.file) &&
    cost.ms * machine.speed <= PLACEMENT_FILE_FIT_MS;
}

// What a routing miss is remembered against: the machine's gaps and node.
// Install a tool or change node and its misses are forgotten, since they may
// have been exactly that.
function placementGapsKey(entry) {
  return [...(entry.readiness?.gaps || []), entry.capability?.nodeVersion || EMPTY]
    .join(FLEET_TEXT.LIST);
}

/**
 * The lab machines a placed run may use, from one discovery pass: ready, not
 * the controller reached a second time, answering, with the checkout path,
 * the commit it holds and a speed sample recorded. Speed is relative to the
 * controller; the machine factor the tests scale their wall-clock budgets by
 * is that speed times the controller's own factor, never below 1.
 * @param {Array<Object>} fleet discoverFleet's result
 * @param {Object} state the lab inventory
 * @param {{controllerFactor?: number}} [options]
 * @return {Array<Object>}
 */
export function placementMachines(fleet, state, {controllerFactor = 1} = {}) {
  const reference = fleet.find((entry) => entry.controller)?.capability?.cpuSampleMs;
  const machines = [];
  for (const entry of fleet) {
    const cap = entry.capability;
    const node = state.nodes?.[entry.name];
    if (!(reference > 0) || !isPlaceable(entry, node)) continue;
    const speed = cap.cpuSampleMs / reference;
    const gapsKey = placementGapsKey(entry);
    machines.push({
      name: entry.name,
      controller: false,
      speed,
      // The measured capacity a hand run's decision is printed with.
      cores: cap.cores,
      memKiB: cap.memKiB,
      factor: Math.max(1, Math.ceil(speed * controllerFactor * PLACEMENT_FACTOR_STEPS) /
        PLACEMENT_FACTOR_STEPS),
      sshTarget: node.ssh,
      repoPath: cap.repoPath,
      repoHead: cap.repo.head,
      nodeMajor: String(cap.nodeVersion || EMPTY).replace(/^v/u, EMPTY)
        .split(PLACEMENT_VERSION_SEPARATOR)[0],
      gapsKey,
      avoid: node.placement?.gapsKey === gapsKey ? [...node.placement.avoid] : [],
    });
  }
  return machines;
}

// A lab machine a shard can go to: discovered ready this run, answering, not
// the controller reached a second time, not held by another agent under the
// lab convention, with an ssh target, the checkout path, the commit that
// checkout is at and a speed sample. A stale holder record is no lock.
function isPlaceable(entry, node) {
  const cap = entry.capability;
  const distinct = !entry.controller && !entry.error && !entry.sameMachineAs;
  const reachable = Boolean(node?.ssh) && entry.readiness?.ready === true &&
    cap?.machineLock?.state !== LAB_LOCK_STATE.BUSY;
  return distinct && reachable && Boolean(cap?.repoPath) && Boolean(cap.repo?.head) &&
    cap.cpuSampleMs > 0;
}

/**
 * Remember files that were red on a machine and green on the controller, so
 * the next placed run sends them elsewhere.
 * @param {Object} state
 * @param {string} name
 * @param {string} gapsKey
 * @param {string[]} files
 * @return {Object} the same state
 */
export function recordPlacementMisses(state, name, gapsKey, files) {
  const node = state.nodes?.[name];
  if (!node || files.length === 0) return state;
  const kept = node.placement?.gapsKey === gapsKey ? node.placement.avoid : [];
  node.placement = {gapsKey, avoid: [...new Set([...kept, ...files])].sort()};
  return state;
}

const CONTROLLER_MACHINE = Object.freeze({
  name: FLEET_CONTROLLER_NAME, controller: true, speed: 1,
});

function minutes(ms) {
  return (ms / MS_PER_MINUTE).toFixed(PLACEMENT_MINUTE_DIGITS);
}

function deadlineFor(shard) {
  return Math.max(PLACEMENT_DEADLINE_FLOOR_MS, PLACEMENT_DEADLINE_FACTOR * shard.loadMs);
}

// The files a finished shard reports red, among the files it was given.
// What a lab machine proved, file by file, from its runner's own verdict
// lines on stdout - never from its exit status. A file with an `ok` line (or
// a retried-once pass, the controller's own policy) and no unretried `not ok`
// line is proved there; one with a `not ok` line is decided again on the
// controller; one with neither never reported, and the controller runs it. A
// runner killed mid-batch, a truncated script or a lost connection can leave
// any number of files unreported whatever the exit status (verifier round 1).
function logVerdicts(files, log) {
  const given = new Set(files);
  const green = new Set();
  const red = new Set();
  const assertions = new Map();
  const lines = String(log || EMPTY).split(PLACEMENT_LINE);
  for (const line of lines) {
    const verdict = PLACEMENT_VERDICT_LINE.exec(line);
    const file = verdict?.[PLACEMENT_VERDICT_PART.FILE];
    if (verdict && given.has(file)) {
      (verdict[PLACEMENT_VERDICT_PART.VERDICT] === PLACEMENT_VERDICT_GREEN ? green : red)
        .add(file);
      assertions.set(file, Number(verdict[PLACEMENT_VERDICT_PART.ASSERTIONS]));
    }
    const retried = PLACEMENT_RETRIED_PASS_LINE.exec(line);
    if (retried && given.has(retried[1])) green.add(retried[1]);
  }
  for (const line of lines) {
    const retried = PLACEMENT_RETRIED_PASS_LINE.exec(line);
    if (retried) red.delete(retried[1]);
  }
  return {
    green, red, assertions,
    unreported: files.filter((file) => !green.has(file) && !red.has(file)),
  };
}

function shardVerdicts(shard, outcome) {
  const {red, unreported} = logVerdicts(shard.files, outcome.log);
  return {red: [...red], fallback: unreported};
}

// A host whose runner refused as too hot is a typed placement outcome: its
// runner's own refusal line, relayed in its stream.
function reportThermalUnfit(name, lines, write) {
  if (!lines.some((line) => THERMAL_REFUSAL_LINE.test(line))) return;
  write(`${PLACEMENT_TEXT.PREFIX}${PLACEMENT_TEXT.THERMAL_UNFIT}${name}`);
}

// A host another agent held for the whole of the shard's wait is a typed
// placement outcome, naming the holder its lab shell relayed.
function reportHostBusy(name, lines, write) {
  const holder = busyHolder(lines);
  write(`${PLACEMENT_TEXT.PREFIX}${PLACEMENT_TEXT.HOST_BUSY}${name}` + (holder ?
    `${PLACEMENT_TEXT.HELD_BY}${holder.agent ?? LAB_HOLDER_UNKNOWN}${PLACEMENT_TEXT.SINCE}` +
      `${holder.startedAt ?? LAB_HOLDER_UNKNOWN}` : PLACEMENT_TEXT.NO_HOLDER));
}

// Start one lab shard, telling other agents what it is and how long it
// expects to hold the machine: its lanes and its own estimate, which is also
// the longest it waits for the machine lock.
function startShard(shard, {deps, sha, forward, costs}) {
  const lanes = costs.filter((cost) => shard.files.includes(cost.file)).map((cost) => cost.lane);
  return deps.runRemote(shard, {sha, deadlineMs: deadlineFor(shard), forward,
    holder: {purpose: labTestPurpose(lanes), expectedMs: shard.loadMs}});
}

// The next ready host for files whose host refused them: the fastest this
// run has not tried that takes every one, charged its setup and its speed.
function nextHostFor(files, {machines, tried, costs}) {
  const priced = costs.filter((cost) => files.includes(cost.file));
  const machine = machines.filter((one) => !tried.has(one.name)).sort(bySpeed)
    .find((one) => priced.every((cost) => fits(one, cost)));
  if (!machine) return null;
  return {machine, files, loadMs: PLACEMENT_REMOTE_SETUP_MS +
    priced.reduce((sum, cost) => sum + cost.ms / cost.jobs, 0) * machine.speed};
}

// Whether a lab host refused its shard, as a typed placement outcome: held
// by another agent for the whole wait (the lab shell's busy exit), or too
// hot to run (its runner's thermal refusal). Reported once; null if it ran.
function hostRefusal(shard, outcome, write) {
  const lines = String(outcome.log || EMPTY).split(PLACEMENT_LINE);
  if (outcome.status === PLACEMENT_EXIT.BUSY) {
    reportHostBusy(shard.machine.name, lines, write);
    return PLACEMENT_TEXT.REFUSED_BUSY;
  }
  if (!lines.some((line) => THERMAL_REFUSAL_LINE.test(line))) return null;
  reportThermalUnfit(shard.machine.name, lines, write);
  return PLACEMENT_TEXT.REFUSED_HOT;
}

// A started shard's settled outcomes: the one re-placement policy. The files
// a host that refused never ran go on to the next ready host this run has
// not tried - a host that refused is never tried again in it - and, with none
// left, to the controller. What it did run is settled as it ran.
async function followShard(shard, run, context) {
  const outcome = await run.done;
  const refusal = hostRefusal(shard, outcome, context.write);
  if (!refusal) return [{shard, outcome}];
  const {unreported} = logVerdicts(shard.files, outcome.log);
  const ran = {shard: {...shard, files: shard.files.filter((file) => !unreported.includes(file))},
    outcome};
  if (unreported.length === 0) return [ran];
  const next = nextHostFor(unreported, context);
  if (!next) {
    context.write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${unreported.length}` +
      `${PLACEMENT_TEXT.UNREPORTED}${refusal}${PLACEMENT_TEXT.NO_NEXT_HOST}`);
    context.leftover.push(...unreported);
    return [ran];
  }
  context.tried.add(next.machine.name);
  context.write(`${PLACEMENT_TEXT.PREFIX}${next.machine.name}: ${next.files.length} files, ` +
    `~${minutes(next.loadMs)} min${PLACEMENT_TEXT.MOVED_FROM}${shard.machine.name}` +
    `${PLACEMENT_TEXT.MOVED_CLOSE}`);
  const moved = await startShard(next, context);
  context.runs.push(moved);
  return [ran, ...await followShard(next, moved, context)];
}

// A lab machine's own lines, shown under its name.
function relayShardLines(shard, outcome, write) {
  for (const stream of [outcome.log, outcome.errors]) {
    for (const line of String(stream || EMPTY).split(PLACEMENT_LINE)) {
      if (line) write(`[${shard.machine.name}] ${line}`);
    }
  }
}

/**
 * Run test files placed across the fleet when that can shorten the run, and
 * on the controller alone otherwise. Every choice is reported on one line.
 * @param {string[]} files
 * @param {Object} deps
 * @param {Function} deps.planCosts files -> [{file, ms, jobs}]
 * @param {Function} deps.runLocal (files, {failFast}) -> exit status
 * @param {Function} deps.lastGreen file -> whether its controller result is green
 * @param {Function} deps.commitAt () -> the sha the tree exactly is, or null
 * @param {Function} deps.discover async () -> {machines, record(name, key, files)}
 * @param {Function} deps.runRemote (shard, {sha, deadlineMs, forward}) ->
 *   {done, stop, interrupt, abort}
 * @param {Function} [deps.runLocalChild] files -> {done, abort}: the controller's
 *   files while lab shards run, without blocking this process
 * @param {Object} [deps.signals] where SIGINT, SIGTERM and SIGHUP arrive (process)
 * @param {Function} [deps.exit] process.exit
 * @param {boolean} [deps.failFast] the explicit opt-in to stop at the first
 *   red batch; such a run is never placed
 * @param {Object} [deps.env]
 * @param {Function} [deps.write]
 * @return {Promise<number>} exit status
 */
export async function runPlacedTestFiles(files, deps) {
  const {env = process.env, failFast = false,
    write = (line) => process.stdout.write(`${line}\n`)} = deps;
  const local = (reason) => {
    if (reason) write(`${PLACEMENT_TEXT.LOCAL}${reason}`);
    return deps.runLocal(files, {failFast});
  };
  if (env[PLACEMENT_ENV] === PLACEMENT_LOCAL) return local(null);
  if (failFast) return local(PLACEMENT_TEXT.FAIL_FAST);
  const costs = deps.planCosts(files);
  const aloneMs = costs.reduce((sum, cost) => sum + cost.ms / cost.jobs, 0);
  if (aloneMs < PLACEMENT_MIN_PLAN_MS) return local(null);
  const sha = deps.commitAt();
  if (!sha) return local(PLACEMENT_TEXT.NOT_A_COMMIT);
  let fleet;
  try {
    fleet = await deps.discover();
  } catch (error) {
    // Placement can only shorten a run: an unreadable inventory is no fleet.
    return local(`${PLACEMENT_TEXT.NO_INVENTORY}${error.message}`);
  }
  if (fleet.machines.length === 0) return local(PLACEMENT_TEXT.NO_MACHINE);
  const shards = placeTestFiles(costs, [CONTROLLER_MACHINE, ...fleet.machines]);
  const remote = shards.filter((shard) => !shard.machine.controller);
  if (remote.length === 0) return local(PLACEMENT_TEXT.NO_GAIN);
  write(`${PLACEMENT_TEXT.PREFIX}${files.length} files over ${shards.length} machines, ` +
    `~${minutes(Math.max(...shards.map((shard) => shard.loadMs)))} min ` +
    `(controller alone ~${minutes(aloneMs)} min)`);
  for (const shard of shards) {
    write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${shard.files.length} files, ` +
      `~${minutes(shard.loadMs)} min`);
  }
  // Every lab shard is on its way before the controller's own files start.
  const context = {deps, sha, forward: forwardedPolicy(env), costs, write,
    machines: fleet.machines, tried: new Set(remote.map((shard) => shard.machine.name)),
    runs: [], leftover: []};
  const started = await Promise.all(remote.map((shard) => startShard(shard, context)));
  context.runs.push(...started);
  const followed = Promise.all(remote.map((shard, index) =>
    followShard(shard, started[index], context)));
  // While lab shards run, the controller's own files run in a child process
  // of their own group, never in this process's blocking lanes: a signal
  // handler here could not run until those lanes finished, so a Ctrl-C or a
  // SIGTERM would be held for the whole shard (verifier round 2). Interrupted,
  // the local child is cut first and every lab shard is aborted together,
  // synchronously.
  let here = null;
  const runHere = (planned) => {
    here = deps.runLocalChild ? deps.runLocalChild(planned) :
      {done: Promise.resolve(deps.runLocal(planned, {}))};
    return here.done;
  };
  const release = abortOnSignals(deps, () => {
    here?.abort?.();
    abortTogether(context.runs);
  });
  try {
    const controllerShard = shards.find((shard) => shard.machine.controller);
    const statuses = controllerShard ? [await runHere(controllerShard.files)] : [];
    return await settleRemoteShards((await followed).flat(),
      {deps, fleet, statuses, write, runHere, leftover: context.leftover});
  } finally {
    release();
  }
}

// The controller's own retry and timeout policy, handed to a lab machine.
function forwardedPolicy(env) {
  return {
    retry: env[PLACEMENT_FORWARDED_ENV.RETRY] || EMPTY,
    tapTimeout: env[PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT] || EMPTY,
  };
}

// Interrupted, hung up or terminated: cut everything a run started and exit.
// The handler stays installed and runs once: a hang-up arrives twice (the
// shell resends it, then the kernel), and a second Ctrl-C can come during
// the lab shells' grace. A listener removed on first use handed either back
// to the default action, which killed this process mid-abort and left the
// detached shards running (verifier, placement-fixture-followups round 1).
// Returns the removal of the handler.
function abortOnSignals(deps, cutAll) {
  let aborting = false;
  const interrupted = () => {
    if (aborting) return;
    aborting = true;
    cutAll();
    (deps.exit || process.exit)(PLACEMENT_EXIT.INTERRUPTED);
  };
  const signals = deps.signals || process;
  for (const signal of PLACEMENT_SIGNALS) signals.on(signal, interrupted);
  return () => {
    for (const signal of PLACEMENT_SIGNALS) signals.removeListener(signal, interrupted);
  };
}

async function settleRemoteShards(settled, {deps, fleet, statuses, write, runHere, leftover}) {
  const reruns = [];
  // Files no ready lab host was left to take after theirs was held.
  const fallback = [...leftover];
  settled.forEach(({shard, outcome}) => {
    relayShardLines(shard, outcome, write);
    // Its files not proved there are placed once more, on the controller:
    // never retried on the machine within this run.
    const {red, fallback: back} = shardVerdicts(shard, outcome);
    if (back.length > 0) {
      write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${back.length}` +
        `${PLACEMENT_TEXT.UNREPORTED}${outcome.reason || `exit ${outcome.status}`}`);
      fallback.push(...back);
    }
    if (red.length > 0) {
      write(`${PLACEMENT_TEXT.PREFIX}${shard.machine.name}: ${red.length}${PLACEMENT_TEXT.RED_THERE}`);
      reruns.push({shard, red});
    }
  });
  const redCount = reruns.reduce((sum, rerun) => sum + rerun.red.length, 0);
  if (redCount > PLACEMENT_RERUN_CAP) {
    write(`${PLACEMENT_TEXT.PREFIX}${PLACEMENT_TEXT.OVER_CAP}`);
    statuses.push(1);
  } else if (redCount > 0) {
    statuses.push(await runHere(reruns.flatMap((rerun) => rerun.red)));
    for (const {shard, red} of reruns) {
      const misses = red.filter((file) => deps.lastGreen(file));
      if (misses.length === 0) continue;
      write(`${PLACEMENT_TEXT.PREFIX}${misses.length}${PLACEMENT_TEXT.MISS}${shard.machine.name}`);
      await fleet.record(shard.machine.name, shard.machine.gapsKey, misses);
    }
  }
  if (fallback.length > 0) statuses.push(await runHere(fallback));
  return statuses.find((status) => status !== 0) ?? 0;
}

// The lab machine's half: take the commit from the bundle (when one was
// needed), prove it in a throwaway worktree with the workspace links the
// publisher's gate checkout gets, run the controller-chosen files through the
// same classified runner, and remove the worktree, ref, bundle and file list
// on every exit. One heavy run per machine at a time, whoever starts it: the
// lab convention's machine-wide lock, waited for no longer than the shard's
// budget, with the holder record beside it for as long as it is held; and
// inside it this checkout's own lock, which a run placed from another clone
// by an older wrapper takes alone. Exit 97 is a setup failure and 98 a
// machine held by another run: the controller then places the shard on the
// next ready host, or runs it itself. The runner leads its own process group,
// so the controller's deadline can stop everything it started.
const PLACEMENT_RESULTS_PREFIX = 'placement-results=';
const PLACEMENT_SCRIPT_HEAD = [
  'set -u',
  'repo="$1"; sha="$2"; node_major="$3"; factor="$4"; run="$5"; bundle="$6"',
  'retry="$7"; tap_timeout="$8"; results="$9"; lock_wait="${10}"; holder_head="${11}"',
  'expected_minutes="${12}"',
  // Before nvm, which reads its arguments (see the capability script).
  'set --',
  'pid=""; holding=""',
  ...LAB_LOCK_PATHS,
  // The controller stops a shard by signalling this shell, whose trap stops
  // the runner's group and whose exit removes everything below.
  'echo "placement-shell=$$"',
  `cd "$repo" || exit ${PLACEMENT_EXIT.SETUP}`,
  `parent="$repo/${PLACEMENT_PARENT}"`,
  'wt="$parent/$run"; list="$parent/$run.files"; ref="refs/lagrange-placement/$run"',
  // Installed before anything that can fail or be interrupted, so every exit
  // - busy, a failed fetch, a signal - removes what this run was given, and
  // last the holder record, if this shell wrote one.
  'cleanup() { if cd "$repo"; then git worktree remove --force "$wt" >/dev/null 2>&1; ' +
    'rm -rf "$wt"; git worktree prune >/dev/null 2>&1; git update-ref -d "$ref" >/dev/null 2>&1; ' +
    'rm -f "$list"; if [ -n "$bundle" ]; then rm -f "$bundle"; fi; fi; ' +
    'if [ -n "$holding" ]; then rm -f "$lab_holder"; fi; }',
  'trap cleanup EXIT',
  // Stop the runner's whole group and wait for the runner, so cleanup never
  // races a dying test writing into the worktree. The runner and its tests
  // install no TERM handler, so the wait ends with them.
  'stop() {',
  '  if [ -n "$pid" ]; then',
  '    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null',
  '    wait "$pid"',
  '  fi',
  `  exit ${PLACEMENT_EXIT.TERMINATED}`,
  '}',
  'trap stop HUP INT TERM',
  // One run per machine and a stoppable runner group are what this relies
  // on: a machine without flock or setsid runs nothing placed.
  'if ! command -v flock >/dev/null 2>&1 || ! command -v setsid >/dev/null 2>&1; then',
  '  echo "placement needs flock and setsid on this machine" >&2',
  `  exit ${PLACEMENT_EXIT.SETUP}`,
  'fi',
  'NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
  '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && ' +
    '[ -n "$node_major" ] && nvm use "$node_major" >/dev/null 2>&1',
  `common="$(git rev-parse --git-common-dir 2>/dev/null)" || exit ${PLACEMENT_EXIT.SETUP}`,
  'case "$common" in /*) ;; *) common="$repo/$common";; esac',
  ...LAB_LOCK_TAKE,
  'exec 8>"$common/lagrange-placement.lock"',
  `flock -n 8 || { echo "${LAB_LOCK_LINE.BUSY}"; exit ${PLACEMENT_EXIT.BUSY}; }`,
  ...LAB_LOCK_RECORD,
  `mkdir -p "$parent" || exit ${PLACEMENT_EXIT.SETUP}`,
  // Under the lock nothing else is placed here, so anything left by an
  // earlier run - a connection lost after its upload, an interrupted one -
  // is stale and goes (verifier round 1).
  'for stale in "$parent"/* "$parent"/.[!.]*; do',
  '  [ -e "$stale" ] || continue',
  '  [ "$stale" = "$bundle" ] || rm -rf "$stale"',
  'done',
  'git worktree prune >/dev/null 2>&1',
  'for stale in $(git for-each-ref --format="%(refname)" refs/lagrange-placement/); do',
  '  [ "$stale" = "$ref" ] || git update-ref -d "$stale" >/dev/null 2>&1',
  'done',
  'if [ -n "$bundle" ]; then git fetch --quiet "$bundle" "HEAD:$ref" >/dev/null 2>&1 || ' +
    `exit ${PLACEMENT_EXIT.SETUP}; fi`,
  `git worktree add --detach --quiet "$wt" "$sha" >/dev/null 2>&1 || exit ${PLACEMENT_EXIT.SETUP}`,
  `[ "$(git -C "$wt" rev-parse HEAD)" = "$sha" ] || exit ${PLACEMENT_EXIT.SETUP}`,
  // What the worktree actually is, for the controller's log.
  'echo "placement-head=$(git -C "$wt" rev-parse HEAD)"',
  // The workspace links the publisher's gate checkout gets - but only for
  // what this checkout ignores: an older checkout's copy of a tracked path
  // the placed commit deleted must not reappear in it (verifier round 1).
  'for dir in node_modules data; do',
  '  [ -e "$repo/$dir" ] || continue',
  '  if [ ! -e "$wt/$dir" ]; then',
  '    git -C "$repo" check-ignore -q "$dir" && ln -s "$repo/$dir" "$wt/$dir" && ' +
    'echo "placement-link=$dir"',
  '    continue',
  '  fi',
  '  for entry in "$repo/$dir"/* "$repo/$dir"/.[!.]*; do',
  '    [ -e "$entry" ] || continue',
  '    name="$dir/${entry##*/}"',
  '    [ -e "$wt/$name" ] && continue',
  '    git -C "$repo" check-ignore -q "$name" || continue',
  '    ln -s "$entry" "$wt/$name" && echo "placement-link=$name"',
  '  done',
  'done',
  `cat > "$list" <<'${PLACEMENT_FILES_MARK}'`,
];
const PLACEMENT_SCRIPT_TAIL = [
  PLACEMENT_FILES_MARK,
  `cd "$wt" || exit ${PLACEMENT_EXIT.SETUP}`,
  // Its own budgets scaled by its measured speed, the controller's retry and
  // timeout policy, and never placed again.
  `export ${PLACEMENT_MACHINE_FACTOR_ENV}="$factor" ${PLACEMENT_ENV}=${PLACEMENT_LOCAL}`,
  `if [ -n "$retry" ]; then export ${PLACEMENT_FORWARDED_ENV.RETRY}="$retry"; fi`,
  `if [ -n "$tap_timeout" ]; then export ${PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT}="$tap_timeout"; fi`,
  // Every lane capped at this host's own processors less one, counted here at
  // run time: never a per-host constant, never a host's name.
  `unset ${LANE_JOBS_CAP_ENV}`,
  'cores="$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null)"',
  `case "$cores" in ""|*[!0-9]*) ;; 0|1) export ${LANE_JOBS_CAP_ENV}=1;; ` +
    `*) export ${LANE_JOBS_CAP_ENV}=$((cores - 1));; esac`,
  `echo "placement-env=factor:$${PLACEMENT_MACHINE_FACTOR_ENV} mode:$${PLACEMENT_ENV} ` +
    `retry:\${${PLACEMENT_FORWARDED_ENV.RETRY}:-} timeout:\${${PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT}:-} ` +
    `lanecap:\${${LANE_JOBS_CAP_ENV}:-}"`,
  // Both locks (fds 8 and 9) stay with this shell: a test process that
  // outlived its run must not hold the machine busy after it.
  'setsid node scripts/run-classified-test-files.js --stdin < "$list" 8>&- 9>&- &',
  'pid=$!',
  'echo "placement-pid=$pid"',
  'wait "$pid"; status=$?',
  // A results ledger the runner left in the worktree comes back on this
  // relay, one prefixed line per record, before cleanup removes it.
  'if [ -n "$results" ] && [ -f "$wt/$results" ]; then ' +
    `sed 's/^/${PLACEMENT_RESULTS_PREFIX}/' "$wt/$results"; fi`,
  'exit "$status"',
];

function placementScript(files) {
  return [...PLACEMENT_SCRIPT_HEAD, ...files, ...PLACEMENT_SCRIPT_TAIL]
    .join(PLACEMENT_NEWLINE) + PLACEMENT_NEWLINE;
}

// The command that runs a POSIX script on a machine: over ssh for a lab
// machine, here for none (the controller, and the witnesses).
function remoteCommand(machine, script, args, {fromStdin = false} = {}) {
  const quoted = args.map(shellQuote).join(' ');
  if (!machine.sshTarget) {
    return fromStdin ? [PLACEMENT_SHELL, [...PLACEMENT_SHELL_STDIN, ...args]] :
      [PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, script, PLACEMENT_SHELL, ...args]];
  }
  if (String(machine.sshTarget).startsWith(SSH_OPTION_PREFIX)) {
    throw new Error(`${ERROR_TEXT_CAPABILITY.BAD_TARGET}${machine.sshTarget}`);
  }
  const command = fromStdin ? `sh -s -- ${quoted}` :
    `sh -c ${shellQuote(script)} sh ${quoted}`;
  return [SSH, [SSH_OPTION, SSH_BATCH_MODE, ...SSH_RUN_OPTIONS, machine.sshTarget, command]];
}

// The same command as one line for a local shell.
function commandLine([command, args]) {
  return [command, ...args].map(shellQuote).join(PLACEMENT_WORD_SEPARATOR);
}

function exitOf(child) {
  return new Promise((resolve) => {
    child.on(PLACEMENT_CHILD_EVENT.ERROR, () => resolve(null));
    child.on(PLACEMENT_CHILD_EVENT.EXIT, (code) => resolve(code));
  });
}

// Its exit status once its output streams are also closed: every line read.
function closeOf(child) {
  return new Promise((resolve) => {
    child.on(PLACEMENT_CHILD_EVENT.ERROR, () => resolve(null));
    child.on(PLACEMENT_CHILD_EVENT.CLOSE, (code) => resolve(code));
  });
}

function streamLines(readable, stream, onLine) {
  let partial = EMPTY;
  readable.setEncoding(TEXT_UTF8);
  readable.on(PLACEMENT_CHILD_EVENT.DATA, (text) => {
    const lines = `${partial}${text}`.split(PLACEMENT_LINE);
    partial = lines.pop();
    for (const line of lines) onLine(line, stream);
  });
  readable.on(PLACEMENT_CHILD_EVENT.END, () => {
    if (partial) onLine(partial, stream);
    partial = EMPTY;
  });
}

// Git here addresses the checkout it is given, never a repository pointer
// inherited from a hook (the push gate runs this inside pre-push).
function gitAt(root, args) {
  return spawnSync(PLACEMENT_GIT, args,
    {cwd: root, env: gitProcessEnvironment(), encoding: TEXT_UTF8});
}

function gitSucceeds(root, args) {
  return gitAt(root, args).status === 0;
}

function safeName(name) {
  return String(name).replace(/[^\w.-]/gu, PLACEMENT_SAFE_CHARACTER);
}

// The bundle of what lies between the commit the machine's checkout is at and
// the one being placed, or nothing when the machine already holds it. A `git
// push` would run this repository's pre-push gate against the lab machine; a
// bundle runs nothing.
function bundleFor(machine, {root, sha, local}) {
  if (!gitSucceeds(root, [...PLACEMENT_GIT_HAS_COMMIT, `${machine.repoHead}^{commit}`])) {
    throw new Error(PLACEMENT_TEXT.NO_HISTORY);
  }
  if (gitSucceeds(root, [...PLACEMENT_GIT_IS_ANCESTOR, sha, machine.repoHead])) return null;
  // A bundle names refs, not bare shas, so it carries HEAD - which must be
  // the commit being placed.
  if (gitAt(root, PLACEMENT_GIT_HEAD).stdout?.trim() !== sha) {
    throw new Error(`HEAD is not ${sha}`);
  }
  const bundleFile = `${local}.bundle`;
  const made = gitAt(root, ['bundle', 'create', bundleFile, 'HEAD', '--not', machine.repoHead]);
  if (made.status !== 0) throw new Error(`git bundle create exited ${made.status}`);
  return bundleFile;
}

// The local half of one shard, as one shell: upload the bundle (bounded, so a
// machine that accepts the connection and then stalls cannot hold anything),
// then run the lab-side script. Its own process group, its output in files:
// nothing about it needs this process's event loop.
function shardWrapper({upload, bundleFile, run, scriptFile}) {
  const script = shellQuote(scriptFile);
  const lines = [...PLACEMENT_WRAPPER_HEAD];
  if (upload) {
    const bundle = shellQuote(bundleFile);
    lines.push(`$bound ${upload} < ${bundle} || status=${PLACEMENT_EXIT.SETUP}`,
      `rm -f ${bundle}`,
      `if [ "$status" != 0 ]; then ${PLACEMENT_WRAPPER_UPLOAD_FAILED} rm -f ${script}; ` +
        `${PLACEMENT_WRAPPER_EXIT} fi`);
  }
  lines.push(`${run} < ${script} || status=$?`, `rm -f ${script}`, PLACEMENT_WRAPPER_EXIT);
  return lines.join(PLACEMENT_NEWLINE);
}

// Stop a started shard: signal its shell on the machine, whose trap stops
// the runner's process group and whose exit removes the worktree, ref and
// bundle; cut the local side only if it has not ended by the grace.
function signalLabShell(machine, logFile) {
  const shell = PLACEMENT_SHELL_LINE.exec(fs.readFileSync(logFile, TEXT_UTF8))?.[1];
  if (shell) {
    const [command, args] = remoteCommand(machine, PLACEMENT_KILL_SCRIPT, [shell]);
    spawnSync(command, args, {stdio: PLACEMENT_STDIO_IGNORE, timeout: PLACEMENT_STOP_GRACE_MS});
  }
  return shell;
}

function stopShard(machine, child, logFile) {
  const shell = signalLabShell(machine, logFile);
  const cut = setTimeout(() => killGroup(child), shell ? PLACEMENT_STOP_GRACE_MS : 0);
  child.once(PLACEMENT_CHILD_EVENT.EXIT, () => clearTimeout(cut));
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

// The relay's lines as they land: the ssh session writes the lab machine's
// output into these files live, so following them is streaming without a
// second connection. Returns the finish, which delivers the rest and stops.
function tailLines(file, stream, onLine) {
  const decoder = new StringDecoder(TEXT_UTF8);
  let offset = 0;
  let partial = EMPTY;
  const emit = (text) => {
    const lines = `${partial}${text}`.split(PLACEMENT_LINE);
    partial = lines.pop();
    for (const line of lines) onLine(line, stream);
  };
  const drain = () => {
    const size = fs.statSync(file).size;
    if (size <= offset) return;
    const buffer = Buffer.alloc(size - offset);
    const fd = fs.openSync(file, PLACEMENT_READ_FLAG);
    let read = 0;
    try {
      read = fs.readSync(fd, buffer, 0, buffer.length, offset);
    } finally {
      fs.closeSync(fd);
    }
    offset += read;
    emit(decoder.write(buffer.subarray(0, read)));
  };
  const timer = setInterval(drain, PLACEMENT_TAIL_POLL_MS);
  return () => {
    clearInterval(timer);
    drain();
    emit(decoder.end());
    if (partial) onLine(partial, stream);
    partial = EMPTY;
  };
}

/**
 * Start one shard on its machine. Returns at once: the upload and the run
 * go on in a process group of their own, reading from and writing to files,
 * so the controller's own blocking lanes cannot stall them. `done` settles
 * with the exit status, the stdout log (the runner's verdict lines) and the
 * stderr log, or a reason when the shard never ran or its deadline stopped
 * it; `stop` stops it now.
 * @param {{machine: Object, files: string[]}} shard
 * `onLine(line, stream)`, when given, receives each line of the relay as it
 * arrives - stdout as `out`, stderr as `err` - not only at settle; `results`
 * names a ledger the runner leaves in the worktree, relayed back as prefixed
 * lines; `gitRoot` is the checkout whose HEAD is the commit (default root).
 * `holder` is what the shard tells other agents under the lab convention: its
 * purpose, and the time it expects to hold the machine, which is also the
 * longest it waits for the machine lock (capped by the lab).
 * @param {{sha: string, deadlineMs: number, root: string,
 *   holder: {purpose: string, expectedMs: number},
 *   runId?: string, env?: Object, forward?: {retry?: string, tapTimeout?: string},
 *   onLine?: Function, results?: string, gitRoot?: string}} options
 * @return {{done: Promise<Object>, stop: Function}}
 */
export function startRemoteShard(shard, {sha, deadlineMs, root, holder,
  env = gitProcessEnvironment(), forward = {}, onLine = null, results = EMPTY, gitRoot = root,
  runId = `${sha.slice(0, PLACEMENT_RUN_SHA_CHARACTERS)}-` +
    `${Date.now().toString(PLACEMENT_RUN_RADIX)}-${process.pid}`}) {
  const {machine} = shard;
  const logDir = path.join(root, PLACEMENT_LOG_PARENT);
  fs.mkdirSync(logDir, {recursive: true});
  const local = path.join(logDir, `${runId}-${safeName(machine.name)}`);
  const logFile = `${local}.log`;
  const errorFile = `${local}.err`;
  const scriptFile = `${local}.sh`;
  let bundleFile;
  try {
    bundleFile = bundleFor(machine, {root: gitRoot, sha, local});
  } catch (error) {
    return {done: Promise.resolve({status: PLACEMENT_EXIT.SETUP, log: EMPTY,
      reason: error.message}), stop: () => {}, interrupt: () => null, abort: () => {}};
  }
  const remoteBundle = bundleFile ?
    `${machine.repoPath}/${PLACEMENT_PARENT}/${runId}.bundle` : EMPTY;
  fs.writeFileSync(scriptFile, placementScript(shard.files));
  const wrapper = shardWrapper({
    upload: bundleFile ?
      commandLine(remoteCommand(machine, PLACEMENT_UPLOAD_SCRIPT, [remoteBundle])) : null,
    bundleFile,
    run: commandLine(remoteCommand(machine, null, [machine.repoPath, sha,
      machine.nodeMajor || EMPTY, String(machine.factor || 1), runId, remoteBundle,
      forward.retry || EMPTY, forward.tapTimeout || EMPTY, results,
      ...labLockArgs({waitMs: holder.expectedMs, purpose: holder.purpose,
        expectedMs: holder.expectedMs, sha, env})], {fromStdin: true})),
    scriptFile,
  });
  const output = fs.openSync(logFile, 'w');
  const errors = fs.openSync(errorFile, 'w');
  const child = spawn(PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, wrapper],
    {env, stdio: [PLACEMENT_STDIO_IGNORE, output, errors], detached: true});
  fs.closeSync(output);
  fs.closeSync(errors);
  const tails = onLine ? [tailLines(logFile, PLACEMENT_STREAM.OUT, onLine),
    tailLines(errorFile, PLACEMENT_STREAM.ERR, onLine)] : [];
  let stopped = null;
  const stop = (reason) => {
    if (stopped || hasExited(child)) return;
    stopped = reason;
    stopShard(machine, child, logFile);
  };
  // A deadline that expired while this process was blocked is looked at
  // again after its pending events: a shard that finished meanwhile is not
  // stopped, and its gone shell's pid is never signalled (verifier round 1).
  const deadline = setTimeout(() => setImmediate(() => stop(PLACEMENT_TEXT.DEADLINE)),
    deadlineMs);
  const done = exitOf(child).then((status) => {
    clearTimeout(deadline);
    for (const finish of tails) finish();
    // A wrapper stopped mid-upload never reached its own removals.
    fs.rmSync(scriptFile, {force: true});
    if (bundleFile) fs.rmSync(bundleFile, {force: true});
    const outcome = {
      status: stopped ? null : status,
      log: fs.readFileSync(logFile, TEXT_UTF8),
      errors: fs.readFileSync(errorFile, TEXT_UTF8),
    };
    return stopped ? {...outcome, reason: stopped} : outcome;
  });
  // Interrupted: ask the lab shell to stop, and hand back what to wait for
  // and how to cut the local side - abortTogether does both for every shard.
  const interrupt = () => {
    if (hasExited(child)) return null;
    stopped = PLACEMENT_TEXT.INTERRUPTED;
    return {pid: signalLabShell(machine, logFile) ? child.pid : null,
      cut: () => killGroup(child)};
  };
  return {done, stop: () => stop(PLACEMENT_TEXT.INTERRUPTED), interrupt,
    abort: () => abortTogether([{interrupt}])};
}

// Every lab shell is asked to stop first, then all of them share one bounded
// grace for their traps - which stop the runner and remove the worktree, ref
// and bundle; a wrapper cut at once killed a local-mode shell before its trap
// ran (verifier, test-placement round 3) - then whatever is left is cut. Any
// number of shards costs one grace, not one each.
function abortTogether(runs) {
  const pending = runs.map((run) => (run.interrupt ? run.interrupt() : run.abort?.()))
    .filter((one) => one?.cut);
  const waiting = pending.map((one) => one.pid).filter(Boolean).map(String);
  if (waiting.length > 0) {
    spawnSync(PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, PLACEMENT_WAIT_SCRIPT,
      PLACEMENT_SHELL, String(PLACEMENT_ABORT_GRACE_MS / PLACEMENT_ABORT_POLL_MS), ...waiting],
    {stdio: PLACEMENT_STDIO_IGNORE, timeout: 2 * PLACEMENT_ABORT_GRACE_MS});
  }
  for (const one of pending) one.cut();
}

// ---------------------------------------------------------------------------
// A formation's hold on a lab machine, under the lab convention above: the
// same lock and record the placement wrapper takes, in a session of its own
// that the harness keeps open for the whole formation.

/**
 * Hold one lab machine for a formation under the lab convention: its lock
 * taken with a bounded wait and its holder record written, both kept until
 * `release`. `outcome` settles `{state: 'held'}`, `{state: 'busy', holder}`
 * (the holder's record, or null) or `{state: 'failed', reason}`.
 * @param {{name: string, sshTarget: string|null}} machine
 * @param {{waitMs: number, purpose: string, expectedMs: number, env?: Object,
 *   root?: string}} request
 * @return {{outcome: Promise<Object>, release: Function}}
 */
export function holdLabMachine(machine, {waitMs, purpose, expectedMs, env = process.env,
  root = process.cwd()}) {
  const sha = gitAt(root, PLACEMENT_GIT_HEAD).stdout?.trim() || LAB_HOLDER_UNKNOWN;
  const [command, args] = remoteCommand(machine, LAB_HOLD_SCRIPT,
    labLockArgs({waitMs, purpose, expectedMs, sha, env}));
  const child = spawn(command, args, {env, stdio: PLACEMENT_STDIO_PIPE});
  const lines = [];
  const errors = [];
  const closed = closeOf(child);
  const outcome = new Promise((resolve) => {
    streamLines(child.stdout, PLACEMENT_STREAM.OUT, (line) => {
      lines.push(line);
      if (line === LAB_LOCK_LINE.HELD) resolve({state: LAB_HOLD.HELD});
    });
    streamLines(child.stderr, PLACEMENT_STREAM.ERR, (line) => errors.push(line));
    closed.then((code) => resolve(holdEnded(code, lines, errors)));
  });
  let released = null;
  const release = () => {
    if (!released) {
      child.stdin.end();
      const cut = setTimeout(() => killGroup(child), LAB_HOLD_RELEASE_GRACE_MS);
      released = closed.then(() => clearTimeout(cut));
    }
    return released;
  };
  return {outcome, release};
}

// A hold whose session ended before it held: busy, naming the holder, or
// failed with what its shell said.
function holdEnded(code, lines, errors) {
  if (code === LAB_LOCK_EXIT.BUSY) return {state: LAB_HOLD.BUSY, holder: busyHolder(lines)};
  return {state: LAB_HOLD.FAILED,
    reason: [`exit ${code}`, ...errors].join(LAB_HOLD_REASON_SEPARATOR)};
}

/**
 * The requirement a machine must meet to run a checkout's corpus: its
 * lockfile digest and its engines floor.
 * @param {string} root
 * @return {{lockSha256: string, nodeMinimum: string}}
 */
export function fleetRequirement(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, REQUIREMENT_FILE.PACKAGE),
    TEXT_UTF8));
  return {
    lockSha256: createHash(REQUIREMENT_DIGEST.ALGORITHM)
      .update(fs.readFileSync(path.join(root, REQUIREMENT_FILE.LOCK)))
      .digest(REQUIREMENT_DIGEST.ENCODING),
    nodeMinimum: String(manifest.engines?.node || EMPTY).replace(/^>=\s*/u, EMPTY),
  };
}

// The sha the tree at root exactly is - nothing modified, nothing untracked -
// or null: a working tree is never sent anywhere.
function commitAt(root) {
  const status = gitAt(root, ['status', '--porcelain']);
  if (status.status !== 0 || status.stdout.trim().length > 0) return null;
  const head = gitAt(root, PLACEMENT_GIT_HEAD);
  return head.status === 0 ? head.stdout.trim() : null;
}

async function discoverPlacement(root, env) {
  const state = await loadState();
  const fleet = await discoverFleet({
    nodes: Object.values(state.nodes || {}),
    controllerRepoPath: root,
    ...fleetRequirement(root),
  });
  await saveState(recordFleet(state, fleet));
  const controllerFactor = Number(env[PLACEMENT_MACHINE_FACTOR_ENV]);
  return {
    fleet,
    machines: placementMachines(fleet, state, {
      controllerFactor: controllerFactor >= 1 ? controllerFactor : 1,
    }),
    record: async (name, gapsKey, files) => {
      await saveState(recordPlacementMisses(await loadState(), name, gapsKey, files));
    },
  };
}

// The controller's own files while lab shards run: the classified runner's
// entry point as a child in a group of its own, told never to place again.
// `abort` ends the whole group. With `onLine` its output is not inherited but
// handed over line by line, as a lab shard's relay is, and it is done only
// once that output has been read to the end.
//
// Its file list is its stdin as a FILE, never a socket this process writes:
// the runner reads stdin synchronously, and a child that got there before
// this event loop had written found the non-blocking socket empty and died
// with EAGAIN - every child, when this process was busy for 300 ms after the
// spawn (found 2026-09-23). The file is unlinked once the child holds it.
function runClassifiedChild(root, files, env, {onLine = null} = {}) {
  const output = onLine ? PLACEMENT_STDIO_PIPE : PLACEMENT_STDIO_INHERIT;
  const listDir = path.join(root, PLACEMENT_LOG_PARENT);
  fs.mkdirSync(listDir, {recursive: true});
  const list = path.join(listDir, `${PLACEMENT_CHILD_LIST_PREFIX}${process.pid}-` +
    `${Date.now().toString(PLACEMENT_RUN_RADIX)}-${childListCount += 1}` +
    `${PLACEMENT_CHILD_LIST_SUFFIX}`);
  fs.writeFileSync(list, files.join(PLACEMENT_NEWLINE) + PLACEMENT_NEWLINE);
  const input = fs.openSync(list, PLACEMENT_READ_FLAG);
  let child;
  try {
    child = spawn(process.execPath, [PLACEMENT_RUNNER, PLACEMENT_RUNNER_STDIN], {
      cwd: root,
      env: {...env, [PLACEMENT_ENV]: PLACEMENT_LOCAL},
      stdio: [input, output, output],
      detached: true,
    });
  } finally {
    fs.closeSync(input);
    fs.rmSync(list, {force: true});
  }
  if (onLine) {
    streamLines(child.stdout, PLACEMENT_STREAM.OUT, onLine);
    streamLines(child.stderr, PLACEMENT_STREAM.ERR, onLine);
  }
  return {
    done: (onLine ? closeOf(child) : exitOf(child)).then((status) => status ?? 1),
    abort: () => {
      if (!hasExited(child)) killGroup(child);
    },
    // Its process group, for a caller that must know exactly what it started.
    group: child.pid,
  };
}

/**
 * The real collaborators of runPlacedTestFiles, given the classified runner's
 * own planning and execution.
 * @param {{root: string, failFast?: boolean, env?: Object, planCosts: Function,
 *   runLocal: Function, lastGreen: Function}} input
 * @return {Object}
 */
export function placementDeps({root, failFast = false, env = process.env,
  planCosts, runLocal, lastGreen}) {
  return {
    failFast, env, planCosts, runLocal, lastGreen,
    runLocalChild: (files) => runClassifiedChild(root, files, env),
    commitAt: () => commitAt(root),
    discover: () => discoverPlacement(root, env),
    runRemote: (shard, options) => startRemoteShard(shard, {...options, root}),
  };
}

// ---------------------------------------------------------------------------
// The hand verb: `lab test <profile> --lane <lane> [--on NAME] [--sha COMMIT]
// [--split]`. No new placement layer: the exact commit goes out through the
// same bundle and shard path a placed run uses, and each lane runs under its
// own job policy because the machine's classified runner plans it again.
// What is new is who chooses - the operator names a lane, and a machine or
// none - and that each file's verdict is shown as it lands, not at settle.
// The machine still comes from this run's discovery, never from a name in
// any setup; `--on` is a choice made at run time.

const LAB_TEST_PARENT = 'test-output/lab-test-worktrees';
// What planning a commit's lanes reads: its test tree and its npm scripts.
const LAB_TEST_PLANNED_PATHS = Object.freeze(['test', 'package.json']);
// Where a runner leaves its per-file results ledger, and where a machine's
// copy comes back to, named for the machine.
const LAB_TEST_RESULTS_FILE = 'test-output/reports/test-results.ndjson';
const LAB_TEST_RESULTS_DIR = 'test-output/reports';
const LAB_TEST_RESULTS_STEM = 'test-results-';
const LAB_TEST_RESULTS_EXTENSION = '.ndjson';
const LAB_TEST_KIB_PER_GIB = 1024 * 1024;
const LAB_TEST_MEMORY_DIGITS = 1;
const LAB_TEST_FAILED = 1;
const LAB_TEST_PROFILE_LINE = /\r?\n/u;
const LAB_TEST_REPETITION_PREFIX = 'lab test: repetition ';
const LAB_TEST_GIT = Object.freeze({
  RESOLVE: Object.freeze(['rev-parse', '--verify', '--quiet', '--end-of-options']),
  COMMIT_SUFFIX: '^{commit}',
  ADD: Object.freeze(['worktree', 'add', '--detach', '--no-checkout', '--quiet']),
  CHECKOUT: Object.freeze(['checkout', '--quiet']),
  REMOVE: Object.freeze(['worktree', 'remove', '--force']),
  PATHS: '--',
});
const LAB_TEST_TEXT = Object.freeze({
  PREFIX: 'lab test: ',
  NAME_ONE: ': commit it, or name a commit with --sha',
  NOT_A_COMMIT: ' is not a commit here',
  NOT_READY: ' is not a ready lab machine this run: ',
  NOT_LISTED: 'not in the inventory',
  CONTROLLER_TREE: 'the controller runs its lanes in this tree, which is not exactly ',
  PLANNING_FAILED: 'the commit could not be checked out for planning: ',
  UNREPORTED: ' file(s) reported no result: ',
  COPIED: 'results copied to ',
  LANES: ', ',
});

// The named profile stays exactly what the operator named; the convergence
// profile reads the one curated shard owned by primary test classification.
export function labNamedCertificationFiles(namedFile) {
  return [namedFile];
}

export function labConvergenceCertificationFiles(gitRoot) {
  return fs.readFileSync(path.join(gitRoot, CONVERGENCE_PROBES_SHARD_PATH), TEXT_UTF8)
    .split(LAB_TEST_PROFILE_LINE).map((line) => line.trim()).filter(Boolean);
}

/**
 * Repeat one normal lab run. A red repetition is retained as the aggregate
 * status; stop-on-first-red only prevents later repetitions from starting.
 * @param {{repeat: number, stopOnFirstRed?: boolean, write?: Function}} input
 * @param {Function} run repetition -> Promise<status>
 * @return {Promise<number>}
 */
export async function runLabTestRepetitions({repeat, stopOnFirstRed = false,
  write = (line) => process.stdout.write(`${line}${PLACEMENT_NEWLINE}`)}, run) {
  let aggregate = 0;
  for (let repetition = 1; repetition <= repeat; repetition += 1) {
    if (repeat > 1) write(`${LAB_TEST_REPETITION_PREFIX}${repetition}/${repeat}`);
    const status = await run(repetition);
    if (status === 0) continue;
    aggregate = LAB_TEST_FAILED;
    if (stopOnFirstRed) break;
  }
  return aggregate;
}

function gitMust(root, args) {
  const result = gitAt(root, args);
  if (result.status !== 0) {
    throw new Error(`${LAB_TEST_TEXT.PLANNING_FAILED}${String(result.stderr || EMPTY).trim()}`);
  }
  return result;
}

/**
 * The commit a hand lab run sends, and a checkout to plan it from. With no
 * `sha` the tree must be exactly a commit - a working tree is never sent - and
 * with one, any tree will do: the commit is named. Planning reads that
 * commit's own test tree, checked out alone into a throwaway worktree whose
 * HEAD is the commit, which is also what its bundle is made from. `release`
 * removes it, and may be called any number of times.
 * @param {{root: string, sha?: string|null}} input
 * @return {{sha: string, gitRoot: string, release: Function}}
 */
export function labTestCommit({root, sha = null}) {
  const resolved = sha ? resolveCommit(root, sha) : commitAt(root);
  if (!resolved) throw new Error(`${PLACEMENT_TEXT.NOT_A_COMMIT}${LAB_TEST_TEXT.NAME_ONE}`);
  const gitRoot = path.join(root, LAB_TEST_PARENT,
    `${resolved.slice(0, PLACEMENT_RUN_SHA_CHARACTERS)}-` +
    `${Date.now().toString(PLACEMENT_RUN_RADIX)}-${process.pid}`);
  fs.mkdirSync(path.dirname(gitRoot), {recursive: true});
  gitMust(root, [...LAB_TEST_GIT.ADD, gitRoot, resolved]);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    gitAt(root, [...LAB_TEST_GIT.REMOVE, gitRoot]);
    fs.rmSync(gitRoot, {recursive: true, force: true});
  };
  try {
    gitMust(gitRoot, [...LAB_TEST_GIT.CHECKOUT, resolved, LAB_TEST_GIT.PATHS,
      ...LAB_TEST_PLANNED_PATHS]);
  } catch (error) {
    release();
    throw error;
  }
  return {sha: resolved, gitRoot, release};
}

function resolveCommit(root, name) {
  const result = gitAt(root, [...LAB_TEST_GIT.RESOLVE, `${name}${LAB_TEST_GIT.COMMIT_SUFFIX}`]);
  if (result.status !== 0) throw new Error(`${name}${LAB_TEST_TEXT.NOT_A_COMMIT}`);
  return result.stdout.trim();
}

// The change cone of a hand run is the selector's own plan of the commit,
// measured from the base the operator named with --base-sha. With none named
// the selector applies its own default - the merge base with the publication
// remote, origin/main - so the lab never restates that decision. The named
// base reaches the one owner of the changed set, which is also what decides a
// release-surface refusal: a path changed only before the base is not part
// of the change.
const LAB_TEST_SELECTOR = Object.freeze({SCRIPT: 'scripts/select-change-tests.js',
  LIST: '--list', HEAD: '--head', BASE: '--base'});

/**
 * The selector invocation that lists the change cone of `sha` against
 * `baseSha`, or against the selector's default base when none is named.
 * @param {{sha: string, baseSha?: string|null}} input
 * @return {string[]}
 */
export function labTestSelectorArgs({sha, baseSha = null}) {
  const base = baseSha ? [LAB_TEST_SELECTOR.BASE, baseSha] : [];
  return [LAB_TEST_SELECTOR.SCRIPT, LAB_TEST_SELECTOR.LIST, LAB_TEST_SELECTOR.HEAD, sha, ...base];
}

function bySpeed(left, right) {
  return left.speed - right.speed;
}

function isExclusiveLane(lane) {
  return lane.resourceClass === RESOURCE_CLASS_EXCLUSIVE;
}

/**
 * Which machine runs which lanes of a hand run. Without --split every lane
 * goes to one lab machine: the one named, or the fastest measured this run.
 * With --split the exclusive lane goes there alone - it may share a machine
 * with nothing - and the other lanes go to whichever is measured faster of
 * the controller and the next lab machine.
 * @param {Array<{resourceClass: string, files: string[], jobs: number}>} plan
 * @param {Array<Object>} machines placementMachines' result
 * @param {{on?: string|null, split?: boolean, controller?: Object,
 *   fleet?: Array<Object>}} [options]
 * @return {Array<{machine: Object, lanes: Array<Object>}>}
 */
export function placeLabLanes(plan, machines, {on = null, split = false,
  controller = CONTROLLER_MACHINE, fleet = []} = {}) {
  if (machines.length === 0) throw new Error(PLACEMENT_TEXT.NO_MACHINE);
  const ranked = [...machines].sort(bySpeed);
  const first = on === null ? ranked[0] : machines.find((machine) => machine.name === on);
  if (!first) {
    const entry = fleet.find((one) => one.name === on);
    throw new Error(`${on}${LAB_TEST_TEXT.NOT_READY}` +
      `${entry ? fleetVerdict(entry) : LAB_TEST_TEXT.NOT_LISTED}`);
  }
  if (!split) return [{machine: first, lanes: plan}];
  // Stable: on a tie the controller, listed first, keeps the lanes here.
  const rest = [controller, ...ranked.filter((machine) => machine !== first)].sort(bySpeed)[0];
  return [
    {machine: first, lanes: plan.filter(isExclusiveLane)},
    {machine: rest, lanes: plan.filter((lane) => !isExclusiveLane(lane))},
  ].filter((assignment) => assignment.lanes.length > 0);
}

function gibibytes(memKiB) {
  return memKiB > 0 ? (memKiB / LAB_TEST_KIB_PER_GIB).toFixed(LAB_TEST_MEMORY_DIGITS) :
    FLEET_UNKNOWN;
}

/**
 * The decision, one line per machine, with the capacities it was made from.
 * @param {Array<{machine: Object, lanes: Array<Object>}>} assignments
 * @return {string[]}
 */
export function formatLabDecision(assignments) {
  return assignments.map(({machine, lanes}) => {
    const files = lanes.reduce((sum, lane) => sum + lane.files.length, 0);
    return `${LAB_TEST_TEXT.PREFIX}${machine.name}: ` +
      `${lanes.map((lane) => lane.resourceClass).join(LAB_TEST_TEXT.LANES)} (${files} files) ` +
      `cores=${machine.cores ?? FLEET_UNKNOWN} mem=${gibibytes(machine.memKiB)}GiB ` +
      `speed x${machine.speed.toFixed(FLEET_FACTOR_DIGITS)}`;
  });
}

function controllerMachine(fleet) {
  const capability = fleet.find((entry) => entry.controller)?.capability;
  return {...CONTROLLER_MACHINE, cores: capability?.cores ?? null,
    memKiB: capability?.memKiB ?? null};
}

// One machine's share, started: its lanes' files, the lines it streamed, and
// the run to wait for. The controller's share runs as the placed run's own
// child does; a lab machine's through the shard path, with the commit bundled
// from the planning checkout.
function startLabShare({machine, lanes}, {commit, deps, forward, results, costOf, write}) {
  const files = lanes.flatMap((lane) => lane.files);
  const lines = [];
  const onLine = (line, stream) => {
    if (stream === PLACEMENT_STREAM.OUT) lines.push(line);
    if (!line.startsWith(PLACEMENT_RESULTS_PREFIX)) write(`[${machine.name}] ${line}`);
  };
  if (machine.controller) return {machine, files, lines, run: deps.runLocalChild(files, {onLine})};
  const loadMs = PLACEMENT_REMOTE_SETUP_MS +
    files.reduce((sum, file) => sum + (costOf.get(file) || 0), 0) * machine.speed;
  const run = deps.runRemote({machine, files}, {sha: commit.sha, gitRoot: commit.gitRoot,
    deadlineMs: deadlineFor({loadMs}), forward, results, onLine,
    holder: {purpose: labTestPurpose(lanes.map((lane) => lane.resourceClass)),
      expectedMs: loadMs}});
  return {machine, files, lines, run};
}

// A machine's results ledger, back under its name beside the controller's.
function copyLabResults(share, root, write) {
  const records = share.lines.filter((line) => line.startsWith(PLACEMENT_RESULTS_PREFIX))
    .map((line) => line.slice(PLACEMENT_RESULTS_PREFIX.length));
  if (records.length === 0) return;
  const file = path.join(LAB_TEST_RESULTS_DIR,
    `${LAB_TEST_RESULTS_STEM}${safeName(share.machine.name)}${LAB_TEST_RESULTS_EXTENSION}`);
  fs.mkdirSync(path.join(root, LAB_TEST_RESULTS_DIR), {recursive: true});
  fs.writeFileSync(path.join(root, file), `${records.join(PLACEMENT_NEWLINE)}${PLACEMENT_NEWLINE}`);
  write(`${LAB_TEST_TEXT.PREFIX}${share.machine.name}: ${LAB_TEST_TEXT.COPIED}${file}`);
}

// Every share's verdicts, from its own lines: what it proved, what was red,
// and what never reported - which is a failure, never a pass.
async function settleLabShares(shares, {root, write}) {
  const totals = {total: 0, passed: 0, failed: 0, assertions: 0};
  let status = 0;
  for (const share of shares) {
    const outcome = await share.run.done;
    const exit = typeof outcome === 'object' ? outcome.status : outcome;
    const {green, red, assertions, unreported} = logVerdicts(share.files,
      share.lines.join(PLACEMENT_NEWLINE));
    const summary = {
      total: share.files.length,
      passed: [...green].filter((file) => !red.has(file)).length,
      failed: red.size + unreported.length,
      assertions: [...assertions.values()].reduce((sum, count) => sum + count, 0),
    };
    reportThermalUnfit(share.machine.name, share.lines, write);
    if (exit === PLACEMENT_EXIT.BUSY) reportHostBusy(share.machine.name, share.lines, write);
    write(`${LAB_TEST_TEXT.PREFIX}${share.machine.name}: ${formatTestFilesSummary(summary)}`);
    if (unreported.length > 0) {
      write(`${LAB_TEST_TEXT.PREFIX}${share.machine.name}: ${unreported.length}` +
        `${LAB_TEST_TEXT.UNREPORTED}${outcome?.reason || `exit ${exit}`}`);
    }
    copyLabResults(share, root, write);
    for (const key of Object.keys(totals)) totals[key] += summary[key];
    if (exit !== 0 || summary.failed > 0) status = LAB_TEST_FAILED;
  }
  write(formatTestFilesSummary(totals));
  return status;
}

/**
 * Run a hand lab test: place the planned lanes, start every share, stream
 * each machine's lines as they land, and end with the runner's own summary,
 * merged over the machines. The planning checkout is released once every
 * share has its commit. Interrupted, every share is cut.
 * @param {{plan: Array<Object>, costs?: Array<Object>, commit: Object,
 *   on?: string|null, split?: boolean, root: string, results?: string,
 *   env?: Object, write?: Function}} request
 * @param {Object} deps labTestDeps' collaborators (discover, runRemote,
 *   runLocalChild, commitAt; signals and exit optional)
 * @return {Promise<number>} exit status
 */
export async function runLabTest({plan, costs = [], commit, on = null, split = false, root,
  results = LAB_TEST_RESULTS_FILE, env = process.env,
  write = (line) => process.stdout.write(`${line}${PLACEMENT_NEWLINE}`)}, deps) {
  let shares = [];
  try {
    const {fleet = [], machines} = await deps.discover();
    const assignments = placeLabLanes(plan, machines,
      {on, split, controller: controllerMachine(fleet), fleet});
    if (assignments.some(({machine}) => machine.controller) && deps.commitAt() !== commit.sha) {
      throw new Error(`${LAB_TEST_TEXT.CONTROLLER_TREE}${commit.sha}`);
    }
    for (const line of formatLabDecision(assignments)) write(line);
    const costOf = new Map(costs.map((cost) => [cost.file, cost.ms / cost.jobs]));
    const context = {commit, deps, forward: forwardedPolicy(env), results, costOf, write};
    shares = assignments.map((assignment) => startLabShare(assignment, context));
  } finally {
    commit.release();
  }
  const release = abortOnSignals(deps, () => abortTogether(shares.map((share) => share.run)));
  try {
    await Promise.all(shares.map((share) => share.run.done));
  } finally {
    release();
  }
  return settleLabShares(shares, {root, write});
}

/**
 * The real collaborators of runLabTest for a checkout.
 * @param {{root: string, env?: Object}} input
 * @return {Object}
 */
export function labTestDeps({root, env = gitProcessEnvironment()}) {
  return {
    discover: () => discoverPlacement(root, env),
    runRemote: (shard, options) => startRemoteShard(shard, {...options, root, env}),
    runLocalChild: (files, options) => runClassifiedChild(root, files, env, options),
    commitAt: () => commitAt(root),
  };
}

export {LAB_TEST_RESULTS_FILE, PLACEMENT_ENV, PLACEMENT_EXIT, PLACEMENT_LOCAL,
  PLACEMENT_MIN_PLAN_MS};
