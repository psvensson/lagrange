import {capture} from './process.js';

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

const CAPABILITY_TOOLS = Object.freeze(['git', 'docker', 'helm', 'wasm-tools', 'psql', 'g++']);
const CAPABILITY_YES = 'yes';
const CAPABILITY_NO = 'no';
const CAPABILITY_SEPARATOR = '=';
const CAPABILITY_TOOL_PREFIX = 'tool_';
// Tools only some files need: their absence is a gap for placement to route
// around, not a disqualification of the machine.
const PARTIAL_TOOLS = Object.freeze(['helm', 'wasm-tools', 'psql']);
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
 * psql) is reported as a gap rather than a disqualification, because
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
