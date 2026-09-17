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
