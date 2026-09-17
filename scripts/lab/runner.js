import {capture, run} from './process.js';

const RUNNER_DIR = '.lagrange-actions-runner';
const SINGLE_QUOTE = String.fromCharCode(39);
const POSIX_QUOTE_ESCAPE = SINGLE_QUOTE + '\\' + SINGLE_QUOTE + SINGLE_QUOTE;
const POWERSHELL_QUOTE_ESCAPE = SINGLE_QUOTE + SINGLE_QUOTE;
const OS = Object.freeze({LINUX: 'linux', MACOS: 'macos', WINDOWS: 'windows'});
const RUNNER_OS = Object.freeze({linux: 'linux', macos: 'osx', windows: 'win'});
const RUNNER_ARCH = Object.freeze({x64: 'x64', amd64: 'x64', arm64: 'arm64', aarch64: 'arm64'});
const BASE_LABELS = Object.freeze(['home', 'lagrange']);
const LABEL_SEPARATOR = '-';
const ROLE_LABEL_PREFIX = 'role-';
const GH = Object.freeze({
  COMMAND: 'gh',
  API: 'api',
  METHOD: '-X',
  POST: 'POST',
  JQ: '--jq',
  LATEST_RELEASE: 'repos/actions/runner/releases/latest',
  TAG_NAME: '.tag_name',
  TOKEN: '.token',
});
const RUNNER_RELEASE_URL = 'https://github.com/actions/runner/releases/download/v';
const GITHUB_URL = 'https://github.com/';
const CONFIG = Object.freeze({
  SCRIPT: './config.sh',
  UNATTENDED: '--unattended',
  REPLACE: '--replace',
  URL: '--url',
  TOKEN: '--token',
  NAME: '--name',
  LABELS: '--labels',
  WORK: '--work',
  WORK_DIR: '_work',
  RUN_AS_SERVICE: '--runasservice',
});
const LIST_SEPARATOR = ',';
const POWERSHELL_LIST_SEPARATOR = ', ';
const SPACE = ' ';
const NEWLINE = '\n';
const STATEMENT_SEPARATOR = '; ';
const EMPTY = '';
const POSIX = Object.freeze({
  SET_STRICT: 'set -eu',
  ALREADY_CONFIGURED_TEST: 'if [ -f .runner ]; then',
  ALREADY_CONFIGURED_MESSAGE:
    '  echo "runner already configured; refusing to overwrite local identity" >&2',
  ALREADY_CONFIGURED_EXIT: '  exit 2',
  FI: 'fi',
  LINUX_SERVICE: 'sudo -n ./svc.sh install "$(id -un)" && sudo -n ./svc.sh start',
  MACOS_SERVICE: './svc.sh install && ./svc.sh start',
  SERVICE_DONE: 'echo "Runner service configured."',
  MANUAL_DONE:
    'echo "Runner configured. Start it with ./run.sh, or install it as a service with ./svc.sh."',
  ARCHIVE_SUFFIX: '.tar.gz',
});
const POWERSHELL = Object.freeze({
  STOP_ON_ERROR: '$ErrorActionPreference = ' + SINGLE_QUOTE + 'Stop' + SINGLE_QUOTE,
  SERVICE_DIR: '$dir = Join-Path $env:SystemDrive ' + SINGLE_QUOTE + 'actions-runner' + SINGLE_QUOTE,
  MAKE_DIR: 'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
  ENTER_DIR: 'Set-Location $dir',
  ALREADY_CONFIGURED_TEST: 'if (Test-Path ' + SINGLE_QUOTE + '.runner' + SINGLE_QUOTE + ') {',
  ALREADY_CONFIGURED_THROW: '  throw ' + SINGLE_QUOTE +
    'runner already configured; refusing to overwrite local identity' + SINGLE_QUOTE,
  CLOSE_BLOCK: '}',
  EXPAND: 'Expand-Archive -Force -Path $zip -DestinationPath $dir',
  REMOVE_ZIP: 'Remove-Item $zip',
  RUN_CONFIG: '& .\\config.cmd @configArgs',
  SERVICE_DONE: 'Write-Host ' + SINGLE_QUOTE + 'Runner configured as a Windows service.' + SINGLE_QUOTE,
  MANUAL_DONE: 'Write-Host ' + SINGLE_QUOTE +
    'Runner configured. Start it with .\\run.cmd.' + SINGLE_QUOTE,
  ARCHIVE_SUFFIX: '.zip',
  COMMAND: 'powershell',
  NO_PROFILE: '-NoProfile',
  NON_INTERACTIVE: '-NonInteractive',
  RUN: '-Command',
  STDIN: '-',
});
const POSIX_REMOTE = Object.freeze(['sh', '-s']);
const SSH = 'ssh';
const REPO_SEPARATOR = '/';
const ERROR_TEXT = Object.freeze({
  REPO_REQUIRED: '--repo owner/name is required',
});

function runnerPlatform(node) {
  const os = RUNNER_OS[node.os];
  const arch = RUNNER_ARCH[node.arch];
  if (!os || !arch) {
    throw new Error(`Runner node ${node.name} needs supported os/arch metadata`);
  }
  return {os, arch};
}

export function runnerLabels(node) {
  const labels = new Set([...BASE_LABELS, node.os, node.arch]);
  for (const role of node.roles || []) labels.add(`${ROLE_LABEL_PREFIX}${role}`);
  for (const [key, value] of Object.entries(node.labels || {})) {
    labels.add(`${key}-${value}`.replace(/[^A-Za-z0-9_.-]/gu, LABEL_SEPARATOR));
  }
  return [...labels].filter(Boolean).sort();
}

async function latestRunnerVersion() {
  const tag = await capture(GH.COMMAND, [
    GH.API, GH.LATEST_RELEASE, GH.JQ, GH.TAG_NAME,
  ]);
  return tag.replace(/^v/u, EMPTY);
}

async function registrationToken(repo) {
  return capture(GH.COMMAND, [
    GH.API, GH.METHOD, GH.POST, `repos/${repo}/actions/runners/registration-token`,
    GH.JQ, GH.TOKEN,
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
  const archive = `actions-runner-${platform.os}-${platform.arch}-${version}${POSIX.ARCHIVE_SUFFIX}`;
  const url = `${RUNNER_RELEASE_URL}${version}/${archive}`;
  const args = [
    CONFIG.SCRIPT, CONFIG.UNATTENDED, CONFIG.REPLACE,
    CONFIG.URL, `${GITHUB_URL}${repo}`,
    CONFIG.TOKEN, token,
    CONFIG.NAME, node.name,
    CONFIG.LABELS, labels.join(LIST_SEPARATOR),
    CONFIG.WORK, CONFIG.WORK_DIR,
  ];
  return [
    POSIX.SET_STRICT,
    `mkdir -p "$HOME/${RUNNER_DIR}"`,
    `cd "$HOME/${RUNNER_DIR}"`,
    POSIX.ALREADY_CONFIGURED_TEST,
    POSIX.ALREADY_CONFIGURED_MESSAGE,
    POSIX.ALREADY_CONFIGURED_EXIT,
    POSIX.FI,
    `curl -fsSL ${url} | tar xz`,
    args.map((part) => quotePosix(part)).join(SPACE),
    service && node.os === OS.LINUX ? POSIX.LINUX_SERVICE : EMPTY,
    service && node.os === OS.MACOS ? POSIX.MACOS_SERVICE : EMPTY,
    service ? POSIX.SERVICE_DONE : POSIX.MANUAL_DONE,
  ].filter(Boolean).join(NEWLINE);
}

function windowsInstallScript({node, repo, token, version, platform, labels, service}) {
  const archive = `actions-runner-${platform.os}-${platform.arch}-${version}${POWERSHELL.ARCHIVE_SUFFIX}`;
  const url = `${RUNNER_RELEASE_URL}${version}/${archive}`;
  const configArgs = [
    CONFIG.UNATTENDED, CONFIG.REPLACE, CONFIG.URL, `${GITHUB_URL}${repo}`,
    CONFIG.TOKEN, token, CONFIG.NAME, node.name,
    CONFIG.LABELS, labels.join(LIST_SEPARATOR), CONFIG.WORK, CONFIG.WORK_DIR,
  ];
  if (service) configArgs.push(CONFIG.RUN_AS_SERVICE);
  const arrayItems = configArgs
    .map((part) => quotePowerShell(part))
    .join(POWERSHELL_LIST_SEPARATOR);
  return [
    POWERSHELL.STOP_ON_ERROR,
    service ?
      POWERSHELL.SERVICE_DIR :
      `$dir = Join-Path $HOME '${RUNNER_DIR}'`,
    POWERSHELL.MAKE_DIR,
    POWERSHELL.ENTER_DIR,
    POWERSHELL.ALREADY_CONFIGURED_TEST,
    POWERSHELL.ALREADY_CONFIGURED_THROW,
    POWERSHELL.CLOSE_BLOCK,
    `$zip = Join-Path $dir '${archive}'`,
    `Invoke-WebRequest -UseBasicParsing -Uri '${url}' -OutFile $zip`,
    POWERSHELL.EXPAND,
    POWERSHELL.REMOVE_ZIP,
    `$configArgs = @(${arrayItems})`,
    POWERSHELL.RUN_CONFIG,
    service ? POWERSHELL.SERVICE_DONE : POWERSHELL.MANUAL_DONE,
  ].join(STATEMENT_SEPARATOR);
}

export async function configureRunner(node, repo, {service = false} = {}) {
  if (!node.ssh) throw new Error(`Runner node ${node.name} needs an ssh target`);
  if (!repo || !repo.includes(REPO_SEPARATOR)) throw new Error(ERROR_TEXT.REPO_REQUIRED);
  const platform = runnerPlatform(node);
  const labels = runnerLabels(node);
  const [version, token] = await Promise.all([latestRunnerVersion(), registrationToken(repo)]);
  const options = {node, repo, token, version, platform, labels, service};
  const script = node.os === OS.WINDOWS ?
    windowsInstallScript(options) :
    posixInstallScript(options);
  const remote = node.os === OS.WINDOWS ?
    [POWERSHELL.COMMAND, POWERSHELL.NO_PROFILE, POWERSHELL.NON_INTERACTIVE, POWERSHELL.RUN,
      POWERSHELL.STDIN] :
    [...POSIX_REMOTE];
  await run(SSH, [node.ssh, ...remote], {stdin: `${script}${NEWLINE}`});
}
