import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

const STATE_VERSION = 1;
const JSON_INDENT = 2;
const TEXT_ENCODING = 'utf8';
const INVENTORY_FILE_MODE = 0o600;
const PLATFORM_WINDOWS = 'win32';
const ERROR_CODE_MISSING = 'ENOENT';
const UNKNOWN = 'unknown';
const TRUE_TEXT = 'true';
const LIST_SEPARATOR = ',';
const LABEL_SEPARATOR = '=';
const STATE_DIR = Object.freeze({
  WINDOWS_VENDOR: 'Lagrange',
  POSIX_CONFIG: '.config',
  POSIX_VENDOR: 'lagrange',
  LEAF: 'lab',
  INVENTORY_FILE: 'inventory.json',
});
const OBJECT_TYPE = 'object';

function defaultStateDir() {
  const override = process.env.LAGRANGE_LAB_HOME;
  if (override) return override;
  if (process.platform === PLATFORM_WINDOWS) {
    return join(process.env.APPDATA || homedir(), STATE_DIR.WINDOWS_VENDOR, STATE_DIR.LEAF);
  }
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), STATE_DIR.POSIX_CONFIG),
    STATE_DIR.POSIX_VENDOR,
    STATE_DIR.LEAF,
  );
}

export function statePath() {
  return join(defaultStateDir(), STATE_DIR.INVENTORY_FILE);
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
    const parsed = JSON.parse(await readFile(path, TEXT_ENCODING));
    if (parsed?.version !== STATE_VERSION || typeof parsed?.nodes !== OBJECT_TYPE) {
      throw new Error(`Unsupported lab inventory at ${path}`);
    }
    return parsed;
  } catch (error) {
    if (allowMissing && error?.code === ERROR_CODE_MISSING) return createEmptyState();
    throw error;
  }
}

export async function saveState(state) {
  const path = statePath();
  await mkdir(dirname(path), {recursive: true});
  const temporaryPath = `${path}.tmp-${process.pid}`;
  const content = `${JSON.stringify(state, null, JSON_INDENT)}\n`;
  await writeFile(temporaryPath, content, {mode: INVENTORY_FILE_MODE});
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
  return [...new Set(
    value.split(LIST_SEPARATOR).map((part) => part.trim()).filter(Boolean),
  )].sort();
}

export function normalizeLabels(value) {
  if (!value) return {};
  const labels = {};
  for (const item of value.split(LIST_SEPARATOR)) {
    const [key, ...rest] = item.split(LABEL_SEPARATOR);
    const normalizedKey = key?.trim();
    if (!normalizedKey) continue;
    labels[normalizedKey] = rest.join(LABEL_SEPARATOR).trim() || TRUE_TEXT;
  }
  return labels;
}

export function nodeSummary(node) {
  return {
    name: node.name,
    ssh: node.ssh || null,
    ip: node.ip || null,
    os: node.os || UNKNOWN,
    arch: node.arch || UNKNOWN,
    roles: node.roles || [],
    labels: node.labels || {},
  };
}
