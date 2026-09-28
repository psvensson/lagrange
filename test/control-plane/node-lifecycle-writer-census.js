/**
 * Structural census of every durable NODES mutation site in src/**.
 *
 * The node lifecycle columns (status, connection_state,
 * ready_lease_expires_at, boot_incarnation) have one semantic publisher:
 * NodeLifecyclePublication. Every other NODES mutation site must be named
 * here with its owner. The allowlist only shrinks: an unlisted site fails.
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as espree from 'espree';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE_ROOT = join(REPO_ROOT, 'src');

// Calls whose first argument names the table being mutated.
const TABLE_ARGUMENT_MUTATIONS = new Set([
  'updateSystemTableRow',
  'upsertSystemTableRow',
  'insertSystemTableRow',
  'upsertSystemTableRowWithRetry',
  'updateJoinAdmissionSystemTableRowWithRetry',
  'submitMutation',
  'executeSystemTableMutation',
  'applySystemTableChange',
  'update',
  'upsert',
  'insert',
  'upsertRow',
  'insertRow',
  'updateByPrimaryKey',
  'write',
]);
// NodesOwner-style calls that always mutate NODES.
const NODES_OWNER_MUTATIONS = new Set([
  'upsertNode',
  'insertNode',
  'updateNode',
  'upsertJoinNode',
]);
const NODES_SQL_MUTATION =
  /\b(UPDATE|INSERT(\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO)\s+(nodes\b|\$\{[\w.]*NODES\})/iu;
const SOURCE_PREFILTER = /NODES|\bnodes\b|upsertNode|insertNode|updateNode/u;

const OWNER_WRITER = 'NodeLifecyclePublication.applyPublication';

// [file, function, owner]. Shrink only.
const NODES_MUTATION_ALLOWLIST_ENTRIES = Object.freeze([
  ['src/control-plane/node-lifecycle-publication.js',
    'applyPublication',
    OWNER_WRITER],
  ['src/bootstrap/shared/node-registration-owner.js',
    'registerNodeInCluster',
    'NodeRegistrationOwner.registerNodeInCluster'],
  ['src/control-plane/owners/membership-publication-runtime-owner.js',
    'advanceJoinNodeBootIncarnation',
    'NodeRegistrationOwner boot incarnation advance (durable rejoin)'],
  ['src/bootstrap/shared/node-registration-owner-publication-methods.js',
    'withdrawFailedJoinAdmission',
    'NodeRegistrationOwner.withdrawFailedJoinAdmission'],
  ['src/bootstrap/shared/node-registration-owner-publication-methods.js',
    'upsertJoinPublicationRow',
    'NodeRegistrationOwner join publication plumbing'],
  ['src/bootstrap/shared/node-registration-owner-publication-methods.js',
    'upsertSystemTableRowWithRetry',
    'NodeRegistrationOwner join publication plumbing'],
  ['src/control-plane/owners/membership-publication-runtime-owner.js',
    'upsertJoinNode',
    'MembershipPublicationRuntimeOwner join-node upsert'],
  ['src/control-plane/heartbeat-service-lifecycle-methods.js',
    'reportNodeShutdown',
    'HeartbeatService.reportNodeShutdown (terminal STOPPED row)'],
  ['src/control-plane/heartbeat-service-publication-methods.js',
    'disconnectNodeDueToLeaseExpiry',
    'HeartbeatService.disconnectNodeDueToLeaseExpiry'],
  ['src/control-plane/lease-service.js',
    'reapStrandedJoiningRows',
    'LeaseService.reapStrandedJoiningRows'],
  ['src/rebalancer/node-storage-budget-service.js',
    'registerNodeBudget',
    'NodeStorageBudgetService.registerNodeBudget (seed upsert)'],
  ['src/rebalancer/storage-capacity-migration.js',
    'backfillNodeBudgets',
    'storage-capacity migration (budget columns only)'],
  ['src/topology/latency-group-manager.js',
    'persistNodeAssignment',
    'LatencyGroupManager (topology columns only)'],
  ['src/cli/admin-cli-action-methods.js',
    'updateNodeStatus',
    'admin CLI node status action (operator SQL)'],
  ['src/node/failure-detector.js',
    'handleNodeSuspicion',
    'FailureDetector (dormant: exported from src/node/index.js only)'],
  ['src/node/failure-detector.js',
    'handleNodeFailure',
    'FailureDetector (dormant: exported from src/node/index.js only)'],
  ['src/node/failure-detector.js',
    'handleNodeRecovery',
    'FailureDetector (dormant: exported from src/node/index.js only)'],
  ['src/node/node-lifecycle-service.js',
    'registerNode',
    'NodeLifecycleService (dormant: exported from src/node/index.js only)'],
  ['src/node/node-lifecycle-service.js',
    'updateHeartbeat',
    'NodeLifecycleService (dormant: exported from src/node/index.js only)'],
  ['src/node/node-lifecycle-service.js',
    'removeNode',
    'NodeLifecycleService (dormant: exported from src/node/index.js only)'],
  ['src/node/node-reintegration-service.js',
    'completeReintegration',
    'NodeReintegrationService (dormant)'],
  ['src/node/node-reintegration-service.js',
    'failReintegration',
    'NodeReintegrationService (dormant)'],
]);

const NODES_MUTATION_ALLOWLIST = Object.freeze(Object.fromEntries(
  NODES_MUTATION_ALLOWLIST_ENTRIES.map(([file, functionName, owner]) =>
    [`${file}#${functionName}`, owner]),
));

function listSourceFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      listSourceFiles(path, files);
    } else if (path.endsWith('.js')) {
      files.push(path);
    }
  }
  return files;
}

function namesNodesTable(node) {
  return /"name":"NODES"|"value":"nodes"/u.test(JSON.stringify(node || null));
}

function resolveFunctionName(node, parent) {
  if (node.id?.name) {
    return node.id.name;
  }
  if (parent?.key) {
    return parent.key.name || parent.key.value;
  }
  return parent?.id?.name || '<anonymous>';
}

function isNodesMutationCall(node) {
  const callee = node.callee;
  const name = callee?.type === 'MemberExpression' ?
    callee.property?.name :
    callee?.name;
  if (NODES_OWNER_MUTATIONS.has(name)) {
    return true;
  }
  return TABLE_ARGUMENT_MUTATIONS.has(name) &&
    namesNodesTable(node.arguments?.[0]);
}

function isNodesMutationSql(node, source) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return NODES_SQL_MUTATION.test(node.value);
  }
  return node.type === 'TemplateLiteral' &&
    NODES_SQL_MUTATION.test(source.slice(node.range[0], node.range[1]));
}

function collectFileSites(path, source) {
  const ast = espree.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    range: true,
  });
  const relativePath = relative(REPO_ROOT, path);
  const sites = new Set();
  const functionNames = [];
  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') {
      return;
    }
    const isFunction = /Function/u.test(node.type);
    if (isFunction) {
      functionNames.push(resolveFunctionName(node, parent));
    }
    if ((node.type === 'CallExpression' && isNodesMutationCall(node)) ||
        isNodesMutationSql(node, source)) {
      sites.add(`${relativePath}#${functionNames.at(-1) || '<module>'}`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        value.forEach((child) => visit(child, node));
      } else if (value && typeof value.type === 'string') {
        visit(value, node);
      }
    }
    if (isFunction) {
      functionNames.pop();
    }
  };
  visit(ast, null);
  return sites;
}

/**
 * @return {Array<string>} Every `file#function` NODES mutation site in src.
 */
function collectNodesMutationSites() {
  const sites = new Set();
  for (const path of listSourceFiles(SOURCE_ROOT)) {
    const source = readFileSync(path, 'utf8');
    if (!SOURCE_PREFILTER.test(source)) {
      continue;
    }
    for (const site of collectFileSites(path, source)) {
      sites.add(site);
    }
  }
  return [...sites].sort();
}

export {
  NODES_MUTATION_ALLOWLIST,
  OWNER_WRITER,
  collectNodesMutationSites,
};
