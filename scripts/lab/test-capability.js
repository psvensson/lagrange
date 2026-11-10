// Platform/capability parsing and readiness observations delegated by placement.
import {createHash} from 'node:crypto';
import {capture} from './process.js';
import {SSH, SSH_OPTION, SSH_BATCH_MODE, SSH_BOUNDED_OPTIONS,
  SSH_OPTION_PREFIX, ERROR_TEXT_CAPABILITY, shellQuote} from './shell-transport.js';
import {LAB_LOCK_PROBE, parseLabHolder, machineLockState} from './machine-lock.js';


const OS = Object.freeze({LINUX: 'linux', MACOS: 'macos', WINDOWS: 'windows', UNKNOWN: 'unknown'});
const OS_REPORT = Object.freeze({LINUX: 'linux', DARWIN: 'darwin', WINDOWS: 'windows'});
const ARCH = Object.freeze({X64: 'x64', ARM64: 'arm64', ARM: 'arm', UNKNOWN: 'unknown'});
const ARCH_ALIASES = Object.freeze({
  [ARCH.X64]: Object.freeze(['x86_64', 'amd64', 'x64']),
  [ARCH.ARM64]: Object.freeze(['aarch64', 'arm64']),
  [ARCH.ARM]: Object.freeze(['armv7l', 'arm']),
});
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

function normalizeOs(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === OS_REPORT.LINUX) return OS.LINUX;
  if (normalized === OS_REPORT.DARWIN) return OS.MACOS;
  if (normalized.includes(OS_REPORT.WINDOWS)) return OS.WINDOWS;
  return OS.UNKNOWN;
}

function normalizeArch(value) {
  const normalized = String(value || '').trim().toLowerCase();
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

async function probeRemoteNode(sshTarget) {
  if (!sshTarget) throw new Error(ERROR_TEXT.SSH_TARGET_REQUIRED);
  try {
    const result = await probePosix(sshTarget);
    if (result.os !== OS.UNKNOWN) return result;
  } catch {
    // Windows OpenSSH normally has no uname. Fall through to PowerShell.
  }
  return probeWindows(sshTarget);
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
// The dependency graph a lockfile describes, as a sha256 digest, or null when
// the text is not a lockfile. The graph is the lockfile less the package's own
// release identity - the top-level `version` and `packages[""].version`, the
// selector's lockfileDependencyGraph deletions, which a witness binds this to -
// so a version-only release bump is the same graph. Everything else stays,
// serialised with object keys sorted and arrays in order: whitespace, key
// order and string escapes cannot make two graphs differ; anything npm reads
// can. A number JSON.parse may round has no digest (unknown, never equal).
// ONE definition: the controller calls it and a lab machine runs its source
// text (LOCKFILE_GRAPH_SCRIPT), so it references nothing outside itself; the
// hash is handed in (graphDigestOf), built on both sides from one constant.
function lockfileGraphDigest(text, digestOf) {
  const isRecord = (value) => value !== null && typeof value === 'object' &&
    !Array.isArray(value);
  const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (isRecord(value)) {
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    if (typeof value === 'number' && !(Number.isSafeInteger(value) && !Object.is(value, -0))) {
      throw new RangeError('a number JSON.parse may round');
    }
    return JSON.stringify(value);
  };
  try {
    const lock = JSON.parse(text);
    if (!isRecord(lock) || !isRecord(lock.packages) || !Object.hasOwn(lock.packages, '') ||
      !Object.values(lock.packages).every(isRecord)) {
      return null;
    }
    delete lock.version;
    delete lock.packages[''].version;
    return digestOf(canonical(lock));
  } catch {
    return null;
  }
}
// The lab machine's side: the same function on a lockfile path, printing
// nothing when there is no digest (unknown). Folded onto one line, so the
// function holds no line comment and relies on no line break.
const GRAPH_DIGEST = Object.freeze({ALGORITHM: 'sha256', ENCODING: 'hex'});
const graphDigestOf = (text) => createHash(GRAPH_DIGEST.ALGORITHM).update(text)
  .digest(GRAPH_DIGEST.ENCODING);
const LOCKFILE_GRAPH_SCRIPT = 'const f=require("fs"),c=require("crypto");' +
  `const d=(${String(lockfileGraphDigest).replace(/\n\s*/gu, ' ')})` +
  '(f.readFileSync(process.argv[1],"utf8"),(t)=>c.createHash(' +
  `${JSON.stringify(GRAPH_DIGEST.ALGORITHM)}).update(t).digest(` +
  `${JSON.stringify(GRAPH_DIGEST.ENCODING)}));if(d)console.log(d)`;
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
  // Whether the thermal gate (scripts/checks/wait-for-thermal-headroom.js) has
  // a source here: lm-sensors, a sysfs thermal zone or an hwmon input. A host
  // with none (a WSL2 VM) is `unmeasurable`, a fact placement can decide on.
  'if { command -v sensors >/dev/null 2>&1 && sensors -j >/dev/null 2>&1; } || ' +
    'ls /sys/class/thermal/thermal_zone*/temp /sys/class/hwmon/hwmon*/temp*_input ' +
    '>/dev/null 2>&1; then say thermal measured; else say thermal unmeasurable; fi',
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
  // Free bytes on the docker daemon's data root: whether the host has room
  // for the images a deployment must hold.
  'docker_root="$($dockercheck info --format \'{{.DockerRootDir}}\' 2>/dev/null)"',
  'if [ -n "$docker_root" ]; then say docker_root_free_bytes ' +
    '"$(df -PB1 "$docker_root" 2>/dev/null | awk \'NR==2{print $4}\')"; fi',
  'if $dockercheck info >/dev/null 2>&1; then say docker_reachable yes; ' +
    'else say docker_reachable no; fi',
  'if [ -e "$repo/.git" ]; then',
  '  say repo_present yes',
  // Free bytes on the checkout's filesystem: room for a worktree a run is
  // placed in (the benchmark load generator's harness worktree).
  '  say repo_free_bytes "$(df -PB1 "$repo" 2>/dev/null | awk \'NR==2{print $4}\')"',
  '  say repo_head "$(git -C "$repo" rev-parse HEAD 2>/dev/null)"',
  // The dependency graph its lockfile describes, not the lockfile's bytes: a
  // version-only release bump changes the bytes and no package.
  `  say lock_graph_sha256 "$(node -e ${shellQuote(LOCKFILE_GRAPH_SCRIPT)} -- ` +
    '"$repo/package-lock.json" 2>/dev/null)"',
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
  const number = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(number) ? number : null;
}

// Three-valued: `yes` and `no` are facts, anything else - absent, empty or
// garbled - is unknown.
function capabilityFlag(value) {
  if (value === CAPABILITY_YES) return true;
  return value === CAPABILITY_NO ? false : null;
}

function capabilityText(value) {
  const text = String(value || '').trim();
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
function parseCapability(text, probedAt = Date.now()) {
  const values = Object.create(null);
  for (const line of String(text || '').split(/\r?\n/u)) {
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
      lockGraphSha256: repoPresent ? capabilityText(values.lock_graph_sha256) : null,
      nodeModules: repoPresent ? capabilityFlag(values.node_modules) : null,
      dependenciesCurrent: repoPresent ? capabilityFlag(values.dependencies_current) : null,
    },
    movielensSha256: repoPresent ? capabilityText(values.movielens_sha256) : null,
    cpuSampleMs: capabilityNumber(values.cpu_sample_ms),
    thermal: capabilityText(values.thermal),
    dockerRootFreeBytes: capabilityNumber(values.docker_root_free_bytes),
    repoFreeBytes: repoPresent ? capabilityNumber(values.repo_free_bytes) : null,
    machineLock: parseMachineLock(values),
  };
}

/**
 * Probe one machine's test capability. With an ssh target the script runs
 * there; without one it runs here, for the controller.
 * @param {{sshTarget?: string, repoPath: string, nodeMajor?: string,
 *   captureCommand?: Function}} input
 * @return {Promise<Object>}
 */
async function probeTestCapability({sshTarget = null, repoPath,
  nodeMajor = '', captureCommand = capture}) {
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
  // The checkout's lockfile describes another dependency graph than the one
  // required (release-version fields aside), or one that cannot be read.
  DEPENDENCY_GRAPH_DIFFERS: 'dependency-graph-differs',
  DEPENDENCY_GRAPH_UNKNOWN: 'dependency-graph-unknown',
  NO_DEPENDENCIES: 'no-dependencies',
  DEPENDENCIES_DIFFER: 'dependencies-differ-from-lockfile',
  DEPENDENCIES_UNKNOWN: 'dependencies-unknown',
  NO_REQUIREMENT: 'no-lockfile-requirement',
  NO_NODE_FLOOR: 'no-node-floor',
  NO_DATASET: 'movielens-dataset-missing',
  NO_DOCKER: 'docker-unreachable',
});
// What a requirement read from no commit describes (fleetRequirement).
const REQUIREMENT_SOURCE = Object.freeze({WORKING_TREE: 'working-tree'});

// Strict: `v23-garbage`, `v22.12x` and `v 22.12.0` are not versions.
function parseVersion(text) {
  const match = STRICT_VERSION.exec(String(text || '').trim());
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
 * Whether a probed machine can run the whole corpus for a given dependency
 * graph, and if not, every reason. Its packages are the required ones when
 * they match its own lockfile AND that lockfile is the required graph. A tool
 * that only some files need (helm, wasm-tools, psql, java, rg, jq) is reported
 * as a gap rather than a disqualification, because placement may still give
 * the machine the files that do not need it.
 * @param {Object|null} capability
 * @param {{lockGraphSha256: string, nodeMinimum: string}} requirement
 * @return {{ready: boolean, missing: string[], gaps: string[]}}
 */
function corpusReadiness(capability, {lockGraphSha256, nodeMinimum}) {
  if (!capability || typeof capability !== 'object') {
    return {ready: false, missing: [READINESS.NOT_PROBED], gaps: []};
  }
  const missing = [
    ...requirementProblems(capability, {lockGraphSha256, nodeMinimum}),
    ...repositoryProblems(capability.repo, lockGraphSha256),
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
// No requirement is no match: without a graph digest to compare, a machine
// with no lockfile would otherwise read as matching; and an engines floor
// that is not a version is named as such, not blamed on every machine's node.
function requirementProblems(capability, {lockGraphSha256, nodeMinimum}) {
  const problems = [];
  if (!HEX_SHA256.test(String(lockGraphSha256 || ''))) {
    problems.push(READINESS.NO_REQUIREMENT);
  }
  if (!parseVersion(nodeMinimum)) {
    problems.push(READINESS.NO_NODE_FLOOR);
  } else if (!nodeAtLeast(capability.nodeVersion, nodeMinimum)) {
    problems.push(READINESS.NODE_TOO_OLD);
  }
  return problems;
}

function repositoryProblems(repo, lockGraphSha256) {
  if (repo?.present !== true) return [READINESS.NO_REPOSITORY];
  const problems = [];
  // Absent (a record stored before the graph was measured) is unknown too.
  if ((repo.lockGraphSha256 ?? null) === null) {
    problems.push(READINESS.DEPENDENCY_GRAPH_UNKNOWN);
  } else if (repo.lockGraphSha256 !== lockGraphSha256) {
    problems.push(READINESS.DEPENDENCY_GRAPH_DIFFERS);
  }
  if (repo.nodeModules !== true) {
    problems.push(READINESS.NO_DEPENDENCIES);
  } else if (repo.dependenciesCurrent === null) {
    problems.push(READINESS.DEPENDENCIES_UNKNOWN);
  } else if (repo.dependenciesCurrent !== true) {
    problems.push(READINESS.DEPENDENCIES_DIFFER);
  }
  return problems;
}

export {MOVIELENS_FILE, MOVIELENS_SHA256, DEPENDENCIES_MATCH_SCRIPT, lockfileGraphDigest,
  graphDigestOf, probeTestCapability, REQUIREMENT_SOURCE, parseVersion, corpusReadiness,
  probeRemoteNode, parseCapability, CAPABILITY_SCRIPT, READINESS};
