import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {gitProcessEnvironment} from '../checks/git-process-environment.js';
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
 * gaps placement would route around, with speed relative to the controller.
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
      `speed x${factor} ${fleetVerdict(entry)}${fleetGaps(entry)}`;
  });
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
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
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
  SETUP: 97, BUSY: 98, INTERRUPTED: 130, TERMINATED: 143, SSH: 255,
});
const PLACEMENT_SHELL_LINE = /^placement-shell=(\d+)$/mu;
// A stopped shard's shell gets this long to clean up before its connection
// is cut.
const PLACEMENT_STOP_GRACE_MS = 10 * MS_PER_SECOND;
const PLACEMENT_RED_LINE = /^not ok (\S+) \(\d+ assertions, \d+ms\)$/u;
const PLACEMENT_GREEN_LINE = /^ok (\S+) \(\d+ assertions, \d+ms\)$/u;
const PLACEMENT_RETRIED_PASS_LINE = /^# retried-once pass (\S+)$/u;
// A bundle upload that has not finished by this is a stalled machine.
const PLACEMENT_UPLOAD_DEADLINE_SECONDS = 300;
// What the controller's own run policy hands a lab machine's runner.
const PLACEMENT_FORWARDED_ENV = Object.freeze({
  RETRY: 'LAGRANGE_RETRY_FAILED_ONCE',
  TAP_TIMEOUT: 'TAP_TIMEOUT',
});
const PLACEMENT_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM']);
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
const PLACEMENT_KEEP_GOING = '--keep-going';
const PLACEMENT_MACHINE_FACTOR_ENV = 'LAGRANGE_TEST_MACHINE_FACTOR';
const PLACEMENT_FACTOR_STEPS = 10;
const PLACEMENT_MINUTE_DIGITS = 1;
const PLACEMENT_LINE = /\r?\n/u;
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
const PLACEMENT_CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit'});
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
// the controller reached a second time, with an ssh target, the checkout
// path, the commit that checkout is at and a speed sample.
function isPlaceable(entry, node) {
  const cap = entry.capability;
  const distinct = !entry.controller && !entry.error && !entry.sameMachineAs;
  const reachable = Boolean(node?.ssh) && entry.readiness?.ready === true;
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
function shardVerdicts(shard, outcome) {
  const given = new Set(shard.files);
  const green = new Set();
  const red = new Set();
  for (const line of String(outcome.log || EMPTY).split(PLACEMENT_LINE)) {
    const passed = PLACEMENT_GREEN_LINE.exec(line) || PLACEMENT_RETRIED_PASS_LINE.exec(line);
    if (passed && given.has(passed[1])) green.add(passed[1]);
    const failed = PLACEMENT_RED_LINE.exec(line);
    if (failed && given.has(failed[1])) red.add(failed[1]);
  }
  for (const line of String(outcome.log || EMPTY).split(PLACEMENT_LINE)) {
    const retried = PLACEMENT_RETRIED_PASS_LINE.exec(line);
    if (retried) red.delete(retried[1]);
  }
  return {
    red: [...red],
    fallback: shard.files.filter((file) => !green.has(file) && !red.has(file)),
  };
}

/**
 * Run test files placed across the fleet when that can shorten the run, and
 * on the controller alone otherwise. Every choice is reported on one line.
 * @param {string[]} files
 * @param {Object} deps
 * @param {Function} deps.planCosts files -> [{file, ms, jobs}]
 * @param {Function} deps.runLocal (files, {keepGoing}) -> exit status
 * @param {Function} deps.lastGreen file -> whether its controller result is green
 * @param {Function} deps.commitAt () -> the sha the tree exactly is, or null
 * @param {Function} deps.discover async () -> {machines, record(name, key, files)}
 * @param {Function} deps.runRemote (shard, {sha, deadlineMs, forward}) -> {done, stop, abort}
 * @param {Function} [deps.runLocalChild] files -> {done, abort}: the controller's
 *   files while lab shards run, without blocking this process
 * @param {Object} [deps.signals] where SIGINT and SIGTERM arrive (process)
 * @param {Function} [deps.exit] process.exit
 * @param {boolean} [deps.keepGoing]
 * @param {Object} [deps.env]
 * @param {Function} [deps.write]
 * @return {Promise<number>} exit status
 */
export async function runPlacedTestFiles(files, deps) {
  const {env = process.env, keepGoing = false,
    write = (line) => process.stdout.write(`${line}\n`)} = deps;
  const local = (reason) => {
    if (reason) write(`${PLACEMENT_TEXT.LOCAL}${reason}`);
    return deps.runLocal(files, {keepGoing});
  };
  if (env[PLACEMENT_ENV] === PLACEMENT_LOCAL) return local(null);
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
  const forward = {
    retry: env[PLACEMENT_FORWARDED_ENV.RETRY] || EMPTY,
    tapTimeout: env[PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT] || EMPTY,
  };
  const runs = await Promise.all(remote.map((shard) =>
    deps.runRemote(shard, {sha, deadlineMs: deadlineFor(shard), forward})));
  // While lab shards run, the controller's own files run in a child process
  // of their own group, never in this process's blocking lanes: a signal
  // handler here could not run until those lanes finished, so a Ctrl-C or a
  // SIGTERM would be held for the whole shard (verifier round 2). Interrupted,
  // every lab shard and the local child are aborted at once, synchronously.
  let here = null;
  const runHere = (planned) => {
    here = deps.runLocalChild ? deps.runLocalChild(planned) :
      {done: Promise.resolve(deps.runLocal(planned, {keepGoing: true}))};
    return here.done;
  };
  const interrupted = () => {
    for (const run of runs) run.abort?.();
    here?.abort?.();
    (deps.exit || process.exit)(PLACEMENT_EXIT.INTERRUPTED);
  };
  const signals = deps.signals || process;
  for (const signal of PLACEMENT_SIGNALS) signals.once(signal, interrupted);
  try {
    const controllerShard = shards.find((shard) => shard.machine.controller);
    const statuses = controllerShard ? [await runHere(controllerShard.files)] : [];
    return await settleRemoteShards(remote, await Promise.all(runs.map((run) => run.done)),
      {deps, fleet, statuses, write, runHere});
  } finally {
    for (const signal of PLACEMENT_SIGNALS) signals.removeListener(signal, interrupted);
  }
}

async function settleRemoteShards(remote, outcomes, {deps, fleet, statuses, write, runHere}) {
  const reruns = [];
  const fallback = [];
  remote.forEach((shard, index) => {
    const outcome = outcomes[index];
    for (const stream of [outcome.log, outcome.errors]) {
      for (const line of String(stream || EMPTY).split(PLACEMENT_LINE)) {
        if (line) write(`[${shard.machine.name}] ${line}`);
      }
    }
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
// on every exit. One placed run per machine at a time (flock where present).
// Exit 97 is a setup failure and 98 a busy machine: the controller then runs
// the shard itself. The runner leads its own process group, so the
// controller's deadline can stop everything it started.
const PLACEMENT_SCRIPT_HEAD = [
  'set -u',
  'repo="$1"; sha="$2"; node_major="$3"; factor="$4"; run="$5"; bundle="$6"; keep="$7"',
  'retry="$8"; tap_timeout="$9"',
  // Before nvm, which reads its arguments (see the capability script).
  'set --',
  'pid=""',
  // The controller stops a shard by signalling this shell, whose trap stops
  // the runner's group and whose exit removes everything below.
  'echo "placement-shell=$$"',
  `cd "$repo" || exit ${PLACEMENT_EXIT.SETUP}`,
  `parent="$repo/${PLACEMENT_PARENT}"`,
  'wt="$parent/$run"; list="$parent/$run.files"; ref="refs/lagrange-placement/$run"',
  // Installed before anything that can fail or be interrupted, so every exit
  // - busy, a failed fetch, a signal - removes what this run was given.
  'cleanup() { cd "$repo" || return; git worktree remove --force "$wt" >/dev/null 2>&1; ' +
    'rm -rf "$wt"; git worktree prune >/dev/null 2>&1; git update-ref -d "$ref" >/dev/null 2>&1; ' +
    'rm -f "$list"; if [ -n "$bundle" ]; then rm -f "$bundle"; fi; }',
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
  'exec 9>"$common/lagrange-placement.lock"',
  `flock -n 9 || exit ${PLACEMENT_EXIT.BUSY}`,
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
  `echo "placement-env=factor:$${PLACEMENT_MACHINE_FACTOR_ENV} mode:$${PLACEMENT_ENV} ` +
    `retry:\${${PLACEMENT_FORWARDED_ENV.RETRY}:-} timeout:\${${PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT}:-}"`,
  // The machine lock (fd 9) stays with this shell: a test process that
  // outlived its run must not hold the machine busy after it.
  'setsid node scripts/run-classified-test-files.js $keep --stdin < "$list" 9>&- &',
  'pid=$!',
  'echo "placement-pid=$pid"',
  'wait "$pid"; status=$?',
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

/**
 * Start one shard on its machine. Returns at once: the upload and the run
 * go on in a process group of their own, reading from and writing to files,
 * so the controller's own blocking lanes cannot stall them. `done` settles
 * with the exit status, the stdout log (the runner's verdict lines) and the
 * stderr log, or a reason when the shard never ran or its deadline stopped
 * it; `stop` stops it now.
 * @param {{machine: Object, files: string[]}} shard
 * @param {{sha: string, deadlineMs: number, root: string, keepGoing?: boolean,
 *   runId?: string, env?: Object, forward?: {retry?: string, tapTimeout?: string}}} options
 * @return {{done: Promise<Object>, stop: Function}}
 */
export function startRemoteShard(shard, {sha, deadlineMs, root, keepGoing = true,
  env = gitProcessEnvironment(), forward = {},
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
    bundleFile = bundleFor(machine, {root, sha, local});
  } catch (error) {
    return {done: Promise.resolve({status: PLACEMENT_EXIT.SETUP, log: EMPTY,
      reason: error.message}), stop: () => {}, abort: () => {}};
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
      keepGoing ? PLACEMENT_KEEP_GOING : EMPTY, forward.retry || EMPTY,
      forward.tapTimeout || EMPTY], {fromStdin: true})),
    scriptFile,
  });
  const output = fs.openSync(logFile, 'w');
  const errors = fs.openSync(errorFile, 'w');
  const child = spawn(PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, wrapper],
    {env, stdio: [PLACEMENT_STDIO_IGNORE, output, errors], detached: true});
  fs.closeSync(output);
  fs.closeSync(errors);
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
  // Interrupted: stop the lab shell, and cut the local side now rather than
  // after a grace this process will not live to see.
  const abort = () => {
    if (hasExited(child)) return;
    stopped = PLACEMENT_TEXT.INTERRUPTED;
    signalLabShell(machine, logFile);
    killGroup(child);
  };
  return {done, stop: () => stop(PLACEMENT_TEXT.INTERRUPTED), abort};
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
// `abort` ends the whole group.
function runClassifiedChild(root, files, env) {
  const child = spawn(process.execPath, [PLACEMENT_RUNNER, PLACEMENT_KEEP_GOING,
    PLACEMENT_RUNNER_STDIN], {
    cwd: root,
    env: {...env, [PLACEMENT_ENV]: PLACEMENT_LOCAL},
    stdio: [PLACEMENT_STDIO_PIPE, PLACEMENT_STDIO_INHERIT, PLACEMENT_STDIO_INHERIT],
    detached: true,
  });
  child.stdin.end(files.join(PLACEMENT_NEWLINE) + PLACEMENT_NEWLINE);
  return {
    done: exitOf(child).then((status) => status ?? 1),
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
 * @param {{root: string, keepGoing?: boolean, env?: Object, planCosts: Function,
 *   runLocal: Function, lastGreen: Function}} input
 * @return {Object}
 */
export function placementDeps({root, keepGoing = false, env = process.env,
  planCosts, runLocal, lastGreen}) {
  return {
    keepGoing, env, planCosts, runLocal, lastGreen,
    runLocalChild: (files) => runClassifiedChild(root, files, env),
    commitAt: () => commitAt(root),
    discover: () => discoverPlacement(root, env),
    runRemote: (shard, options) => startRemoteShard(shard, {...options, root}),
  };
}

export {PLACEMENT_ENV, PLACEMENT_EXIT, PLACEMENT_LOCAL, PLACEMENT_MIN_PLAN_MS};
