import {capture, run} from './process.js';

const INSTALL_URL = 'https://get.k3s.io';
const SHELL_QUOTE = String.fromCharCode(39);
const SHELL_QUOTE_ESCAPE = SHELL_QUOTE + '\\' + SHELL_QUOTE + SHELL_QUOTE;

function shellQuote(value) {
  return SHELL_QUOTE +
    String(value).replaceAll(SHELL_QUOTE, SHELL_QUOTE_ESCAPE) +
    SHELL_QUOTE;
}

function requireLinuxNode(node, purpose) {
  if (!node.ssh) throw new Error(`${purpose} node ${node.name} needs an ssh target`);
  if (!node.ip) throw new Error(`${purpose} node ${node.name} needs a LAN ip`);
  if (node.os && node.os !== 'linux') {
    throw new Error(`${purpose} node ${node.name} must be Linux; got ${node.os}`);
  }
}

export async function initK3sServer(node, {version = ''} = {}) {
  requireLinuxNode(node, 'K3s server');
  const versionEnv = version ? `INSTALL_K3S_VERSION=${shellQuote(version)}` : '';
  const command = [
    'set -eu;',
    `curl -sfL ${INSTALL_URL} | sudo env ${versionEnv} sh -s - server`,
    `--node-ip ${shellQuote(node.ip)}`,
    `--advertise-address ${shellQuote(node.ip)}`,
    `--tls-san ${shellQuote(node.ip)}`,
  ].filter(Boolean).join(' ');
  await run('ssh', ['-tt', node.ssh, command]);
}

export async function joinK3sNode(node, server) {
  requireLinuxNode(node, 'K3s agent');
  requireLinuxNode(server, 'K3s server');
  const token = await capture('ssh', [
    server.ssh,
    'sudo -n cat /var/lib/rancher/k3s/server/node-token',
  ]);
  const versionOutput = await capture('ssh', [server.ssh, 'sudo -n k3s --version']);
  const version = versionOutput.split(/\s+/u).find((part) => part.startsWith('v')) || '';
  const versionEnv = version ? ` INSTALL_K3S_VERSION=${shellQuote(version)}` : '';
  const command = [
    'set -eu;',
    'K3S_TOKEN=$(cat);',
    'export K3S_TOKEN;',
    `curl -sfL ${INSTALL_URL} | sudo -n env`,
    `K3S_URL=${shellQuote(`https://${server.ip}:6443`)}`,
    `K3S_TOKEN="$K3S_TOKEN"${versionEnv}`,
    `sh -s - agent --node-ip ${shellQuote(node.ip)}`,
  ].join(' ');
  await run('ssh', [node.ssh, command], {stdin: `${token}\n`});
}

export async function k3sKubectl(server, args) {
  requireLinuxNode(server, 'K3s server');
  await run('ssh', [server.ssh, 'sudo', '-n', 'k3s', 'kubectl', ...args]);
}

function kubernetesLabelPart(value) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 63)
    .replace(/[-_.]+$/gu, '');
  return normalized || 'unknown';
}

export function inventoryK3sLabels(node) {
  const labels = {
    'lagrange.dev/machine': kubernetesLabelPart(node.name),
    'lagrange.dev/os': kubernetesLabelPart(node.os || 'unknown'),
    'lagrange.dev/arch': kubernetesLabelPart(node.arch || 'unknown'),
  };
  for (const role of node.roles || []) {
    labels[`lagrange.dev/role-${kubernetesLabelPart(role)}`] = 'true';
  }
  for (const [key, value] of Object.entries(node.labels || {})) {
    labels[`lagrange.dev/${kubernetesLabelPart(key)}`] = kubernetesLabelPart(value);
  }
  return labels;
}

export async function syncK3sLabels(server, nodes) {
  for (const node of nodes) {
    const k3sName = node.k3sNode || node.name;
    const labels = inventoryK3sLabels(node);
    const args = ['label', 'node', k3sName, '--overwrite'];
    for (const [key, value] of Object.entries(labels)) args.push(`${key}=${value}`);
    await k3sKubectl(server, args);
  }
}
