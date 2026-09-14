import {capture} from './process.js';

function normalizeOs(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'linux') return 'linux';
  if (normalized === 'darwin') return 'macos';
  if (normalized.includes('windows')) return 'windows';
  return 'unknown';
}

function normalizeArch(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['x86_64', 'amd64', 'x64'].includes(normalized)) return 'x64';
  if (['aarch64', 'arm64'].includes(normalized)) return 'arm64';
  if (['armv7l', 'arm'].includes(normalized)) return 'arm';
  return normalized || 'unknown';
}

async function probePosix(sshTarget) {
  const os = await capture('ssh', [
    '-o', 'BatchMode=yes', sshTarget, 'uname', '-s',
  ]);
  const arch = await capture('ssh', [
    '-o', 'BatchMode=yes', sshTarget, 'uname', '-m',
  ]);
  return {os: normalizeOs(os), arch: normalizeArch(arch)};
}

async function probeWindows(sshTarget) {
  const script = [
    '$os = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription',
    '$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()',
    'Write-Output $os',
    'Write-Output $arch',
  ].join('; ');
  const output = await capture('ssh', [
    '-o', 'BatchMode=yes',
    sshTarget,
    'powershell', '-NoProfile', '-NonInteractive', '-Command', script,
  ]);
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('Windows probe returned incomplete metadata');
  return {os: normalizeOs(lines[0]), arch: normalizeArch(lines[1])};
}

export async function probeRemoteNode(sshTarget) {
  if (!sshTarget) throw new Error('Remote probe requires an ssh target');
  try {
    const result = await probePosix(sshTarget);
    if (result.os !== 'unknown') return result;
  } catch {
    // Windows OpenSSH normally has no uname. Fall through to PowerShell.
  }
  return probeWindows(sshTarget);
}
