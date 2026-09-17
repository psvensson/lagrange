import {capture, run} from './process.js';

const INSTALL_URL = 'https://get.k3s.io';
const SHELL_QUOTE = String.fromCharCode(39);
const SHELL_QUOTE_ESCAPE = SHELL_QUOTE + '\\' + SHELL_QUOTE + SHELL_QUOTE;
const SSH = 'ssh';
const SSH_FORCE_TTY = '-tt';
const SUDO = 'sudo';
const SUDO_NON_INTERACTIVE = '-n';
const K3S = 'k3s';
const KUBECTL = 'kubectl';
const OS_LINUX = 'linux';
const PURPOSE = Object.freeze({SERVER: 'K3s server', AGENT: 'K3s agent'});
const REMOTE = Object.freeze({
  SET_STRICT: 'set -eu;',
  READ_TOKEN: 'sudo -n cat /var/lib/rancher/k3s/server/node-token',
  VERSION: 'sudo -n k3s --version',
  TOKEN_FROM_STDIN: 'K3S_TOKEN=$(cat);',
  EXPORT_TOKEN: 'export K3S_TOKEN;',
  VERSION_PREFIX: 'v',
});
const K3S_API_PORT = 6443;
const LABEL = Object.freeze({
  KUBECTL_VERB: 'label',
  KUBECTL_KIND: 'node',
  OVERWRITE: '--overwrite',
  PREFIX: 'lagrange.dev/',
  MACHINE: 'lagrange.dev/machine',
  OS: 'lagrange.dev/os',
  ARCH: 'lagrange.dev/arch',
  ROLE_PREFIX: 'lagrange.dev/role-',
  TRUE: 'true',
  UNKNOWN: 'unknown',
  MAX_LENGTH: 63,
  START: 0,
});
const EMPTY = '';
const SPACE = ' ';
const LABEL_SEPARATOR = '-';

function shellQuote(value) {
  return SHELL_QUOTE +
    String(value).replaceAll(SHELL_QUOTE, SHELL_QUOTE_ESCAPE) +
    SHELL_QUOTE;
}

function requireLinuxNode(node, purpose) {
  if (!node.ssh) throw new Error(`${purpose} node ${node.name} needs an ssh target`);
  if (!node.ip) throw new Error(`${purpose} node ${node.name} needs a LAN ip`);
  if (node.os && node.os !== OS_LINUX) {
    throw new Error(`${purpose} node ${node.name} must be Linux; got ${node.os}`);
  }
}

export async function initK3sServer(node, {version = EMPTY} = {}) {
  requireLinuxNode(node, PURPOSE.SERVER);
  const versionEnv = version ? `INSTALL_K3S_VERSION=${shellQuote(version)}` : EMPTY;
  const command = [
    REMOTE.SET_STRICT,
    `curl -sfL ${INSTALL_URL} | sudo env ${versionEnv} sh -s - server`,
    `--node-ip ${shellQuote(node.ip)}`,
    `--advertise-address ${shellQuote(node.ip)}`,
    `--tls-san ${shellQuote(node.ip)}`,
  ].filter(Boolean).join(SPACE);
  await run(SSH, [SSH_FORCE_TTY, node.ssh, command]);
}

export async function joinK3sNode(node, server) {
  requireLinuxNode(node, PURPOSE.AGENT);
  requireLinuxNode(server, PURPOSE.SERVER);
  const token = await capture(SSH, [server.ssh, REMOTE.READ_TOKEN]);
  const versionOutput = await capture(SSH, [server.ssh, REMOTE.VERSION]);
  const version = versionOutput.split(/\s+/u)
    .find((part) => part.startsWith(REMOTE.VERSION_PREFIX)) || EMPTY;
  const versionEnv = version ? ` INSTALL_K3S_VERSION=${shellQuote(version)}` : EMPTY;
  const command = [
    REMOTE.SET_STRICT,
    REMOTE.TOKEN_FROM_STDIN,
    REMOTE.EXPORT_TOKEN,
    `curl -sfL ${INSTALL_URL} | sudo -n env`,
    `K3S_URL=${shellQuote(`https://${server.ip}:${K3S_API_PORT}`)}`,
    `K3S_TOKEN="$K3S_TOKEN"${versionEnv}`,
    `sh -s - agent --node-ip ${shellQuote(node.ip)}`,
  ].join(SPACE);
  await run(SSH, [node.ssh, command], {stdin: `${token}\n`});
}

export async function k3sKubectl(server, args) {
  requireLinuxNode(server, PURPOSE.SERVER);
  await run(SSH, [server.ssh, SUDO, SUDO_NON_INTERACTIVE, K3S, KUBECTL, ...args]);
}

function kubernetesLabelPart(value) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/gu, LABEL_SEPARATOR)
    .replace(/^-+|-+$/gu, EMPTY)
    .slice(LABEL.START, LABEL.MAX_LENGTH)
    .replace(/[-_.]+$/gu, EMPTY);
  return normalized || LABEL.UNKNOWN;
}

export function inventoryK3sLabels(node) {
  const labels = {
    [LABEL.MACHINE]: kubernetesLabelPart(node.name),
    [LABEL.OS]: kubernetesLabelPart(node.os || LABEL.UNKNOWN),
    [LABEL.ARCH]: kubernetesLabelPart(node.arch || LABEL.UNKNOWN),
  };
  for (const role of node.roles || []) {
    labels[`${LABEL.ROLE_PREFIX}${kubernetesLabelPart(role)}`] = LABEL.TRUE;
  }
  for (const [key, value] of Object.entries(node.labels || {})) {
    labels[`${LABEL.PREFIX}${kubernetesLabelPart(key)}`] = kubernetesLabelPart(value);
  }
  return labels;
}

export async function syncK3sLabels(server, nodes) {
  for (const node of nodes) {
    const k3sName = node.k3sNode || node.name;
    const labels = inventoryK3sLabels(node);
    const args = [LABEL.KUBECTL_VERB, LABEL.KUBECTL_KIND, k3sName, LABEL.OVERWRITE];
    for (const [key, value] of Object.entries(labels)) args.push(`${key}=${value}`);
    await k3sKubectl(server, args);
  }
}
