import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

const STATE_VERSION = 1;
const JSON_INDENT = 2;

function defaultStateDir() {
  const override = process.env.LAGRANGE_LAB_HOME;
  if (override) return override;
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || homedir(), 'Lagrange', 'lab');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'lagrange', 'lab');
}

export function statePath() {
  return join(defaultStateDir(), 'inventory.json');
}

export function createEmptyState() {
  return {
    version: STATE_VERSION,
    controller: {},
    nodes: {},
  };
}

export async function loadState({allowMissing = true} = {}) {
  const path = statePath();
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (parsed?.version !== STATE_VERSION || typeof parsed?.nodes !== 'object') {
      throw new Error(`Unsupported lab inventory at ${path}`);
    }
    return parsed;
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return createEmptyState();
    throw error;
  }
}

export async function saveState(state) {
  const path = statePath();
  await mkdir(dirname(path), {recursive: true});
  const temporaryPath = `${path}.tmp-${process.pid}`;
  const content = `${JSON.stringify(state, null, JSON_INDENT)}\n`;
  await writeFile(temporaryPath, content, {mode: 0o600});
  await rename(temporaryPath, path);
  return path;
}

export function requireNode(state, name) {
  const node = state.nodes?.[name];
  if (!node) throw new Error(`Unknown lab node: ${name}`);
  return node;
}

export function selectNodesByRole(state, role, requestedNames = []) {
  const explicitSelection = requestedNames.length > 0;
  const names = explicitSelection ? requestedNames : Object.keys(state.nodes || {});
  const nodes = names.map((name) => requireNode(state, name));
  if (explicitSelection) {
    const wrongRole = nodes.find(
      (node) => !Array.isArray(node.roles) || !node.roles.includes(role),
    );
    if (wrongRole) {
      throw new Error(`Lab node ${wrongRole.name} does not have the ${role} role`);
    }
    return nodes;
  }
  return nodes.filter(
    (node) => Array.isArray(node.roles) && node.roles.includes(role),
  );
}

export function normalizeRoles(value) {
  if (!value) return [];
  return [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))].sort();
}

export function normalizeLabels(value) {
  if (!value) return {};
  const labels = {};
  for (const item of value.split(',')) {
    const [key, ...rest] = item.split('=');
    const normalizedKey = key?.trim();
    if (!normalizedKey) continue;
    labels[normalizedKey] = rest.join('=').trim() || 'true';
  }
  return labels;
}

export function nodeSummary(node) {
  return {
    name: node.name,
    ssh: node.ssh || null,
    ip: node.ip || null,
    os: node.os || 'unknown',
    arch: node.arch || 'unknown',
    roles: node.roles || [],
    labels: node.labels || {},
  };
}
