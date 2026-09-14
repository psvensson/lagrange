import {capture, run} from './process.js';

const RUNNER_DIR = '.lagrange-actions-runner';
const SINGLE_QUOTE = String.fromCharCode(39);
const POSIX_QUOTE_ESCAPE = SINGLE_QUOTE + '\\' + SINGLE_QUOTE + SINGLE_QUOTE;
const POWERSHELL_QUOTE_ESCAPE = SINGLE_QUOTE + SINGLE_QUOTE;

function runnerPlatform(node) {
  const osMap = {linux: 'linux', macos: 'osx', windows: 'win'};
  const archMap = {x64: 'x64', amd64: 'x64', arm64: 'arm64', aarch64: 'arm64'};
  const os = osMap[node.os];
  const arch = archMap[node.arch];
  if (!os || !arch) {
    throw new Error(`Runner node ${node.name} needs supported os/arch metadata`);
  }
  return {os, arch};
}

export function runnerLabels(node) {
  const labels = new Set(['home', 'lagrange', node.os, node.arch]);
  for (const role of node.roles || []) labels.add(`role-${role}`);
  for (const [key, value] of Object.entries(node.labels || {})) {
    labels.add(`${key}-${value}`.replace(/[^A-Za-z0-9_.-]/gu, '-'));
  }
  return [...labels].filter(Boolean).sort();
}

async function latestRunnerVersion() {
  const tag = await capture('gh', [
    'api', 'repos/actions/runner/releases/latest', '--jq', '.tag_name',
  ]);
  return tag.replace(/^v/u, '');
}

async function registrationToken(repo) {
  return capture('gh', [
    'api', '-X', 'POST', `repos/${repo}/actions/runners/registration-token`,
    '--jq', '.token',
  ]);
}

function quotePosix(value) {
  return SINGLE_QUOTE +
    String(value).replaceAll(SINGLE_QUOTE, POSIX_QUOTE_ESCAPE) +
    SINGLE_QUOTE;
}

function quotePowerShell(value) {
  return SINGLE_QUOTE +
    String(value).replaceAll(SINGLE_QUOTE, POWERSHELL_QUOTE_ESCAPE) +
    SINGLE_QUOTE;
}

function posixInstallScript({node, repo, token, version, platform, labels, service}) {
  const archive = `actions-runner-${platform.os}-${platform.arch}-${version}.tar.gz`;
  const url = `https://github.com/actions/runner/releases/download/v${version}/${archive}`;
  const args = [
    './config.sh', '--unattended', '--replace',
    '--url', `https://github.com/${repo}`,
    '--token', token,
    '--name', node.name,
    '--labels', labels.join(','),
    '--work', '_work',
  ];
  return [
    'set -eu',
    `mkdir -p "$HOME/${RUNNER_DIR}"`,
    `cd "$HOME/${RUNNER_DIR}"`,
    'if [ -f .runner ]; then',
    '  echo "runner already configured; refusing to overwrite local identity" >&2',
    '  exit 2',
    'fi',
    `curl -fsSL ${url} | tar xz`,
    args.map((part) => quotePosix(part)).join(' '),
    service && node.os === 'linux' ?
      'sudo -n ./svc.sh install "$(id -un)" && sudo -n ./svc.sh start' :
      '',
    service && node.os === 'macos' ? './svc.sh install && ./svc.sh start' : '',
    service ? 'echo "Runner service configured."' :
      'echo "Runner configured. Start it with ./run.sh, or install it as a service with ./svc.sh."',
  ].filter(Boolean).join('\n');
}

function windowsInstallScript({node, repo, token, version, platform, labels, service}) {
  const archive = `actions-runner-${platform.os}-${platform.arch}-${version}.zip`;
  const url = `https://github.com/actions/runner/releases/download/v${version}/${archive}`;
  const configArgs = [
    '--unattended', '--replace', '--url', `https://github.com/${repo}`,
    '--token', token, '--name', node.name, '--labels', labels.join(','), '--work', '_work',
  ];
  if (service) configArgs.push('--runasservice');
  const arrayItems = configArgs
    .map((part) => quotePowerShell(part))
    .join(', ');
  return [
    '$ErrorActionPreference = ' + SINGLE_QUOTE + 'Stop' + SINGLE_QUOTE,
    service ?
      '$dir = Join-Path $env:SystemDrive ' + SINGLE_QUOTE + 'actions-runner' + SINGLE_QUOTE :
      `$dir = Join-Path $HOME '${RUNNER_DIR}'`,
    'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    'Set-Location $dir',
    'if (Test-Path ' + SINGLE_QUOTE + '.runner' + SINGLE_QUOTE + ') {',
    '  throw ' + SINGLE_QUOTE +
      'runner already configured; refusing to overwrite local identity' + SINGLE_QUOTE,
    '}',
    `$zip = Join-Path $dir '${archive}'`,
    `Invoke-WebRequest -UseBasicParsing -Uri '${url}' -OutFile $zip`,
    'Expand-Archive -Force -Path $zip -DestinationPath $dir',
    'Remove-Item $zip',
    `$configArgs = @(${arrayItems})`,
    '& .\\config.cmd @configArgs',
    service ?
      'Write-Host ' + SINGLE_QUOTE + 'Runner configured as a Windows service.' + SINGLE_QUOTE :
      'Write-Host ' + SINGLE_QUOTE +
        'Runner configured. Start it with .\\run.cmd.' + SINGLE_QUOTE,
  ].join('; ');
}

export async function configureRunner(node, repo, {service = false} = {}) {
  if (!node.ssh) throw new Error(`Runner node ${node.name} needs an ssh target`);
  if (!repo || !repo.includes('/')) throw new Error('--repo owner/name is required');
  const platform = runnerPlatform(node);
  const labels = runnerLabels(node);
  const [version, token] = await Promise.all([latestRunnerVersion(), registrationToken(repo)]);
  const options = {node, repo, token, version, platform, labels, service};
  const script = node.os === 'windows' ?
    windowsInstallScript(options) :
    posixInstallScript(options);
  const remote = node.os === 'windows' ?
    ['powershell', '-NoProfile', '-NonInteractive', '-Command', '-'] :
    ['sh', '-s'];
  await run('ssh', [node.ssh, ...remote], {stdin: `${script}\n`});
}
