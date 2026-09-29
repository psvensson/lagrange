/**
 * Structural census of every durable NODES mutation site (INSERT, UPDATE,
 * REPLACE, DELETE) in src/**.
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
  'deleteSystemTableRow',
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
  'delete',
  'deleteRow',
]);
// NodesOwner-style calls that always mutate NODES.
const NODES_OWNER_MUTATIONS = new Set([
  'insertNode',
  'updateNode',
  'registerJoinNodeAtIncarnation',
]);
const NODES_SQL_MUTATION =
  /\b(UPDATE|INSERT(\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|DELETE\s+FROM)\s+(nodes\b|\$\{[\w.]*NODES\})/iu;
const SOURCE_PREFILTER = /NODES|\bnodes\b|upsertNode|insertNode|updateNode/u;

// Semantic classes a NODES mutation site may hold. Exactly one site owns
// CONNECTED/READY publication; every other site is classified by the
// transition it owns. A site with no class fails the census.
const NODES_TRANSITION_CLASS = Object.freeze({
  LIFECYCLE_PUBLICATION: 'lifecycle_publication',
  REGISTRATION: 'registration',
  INCARNATION_ADVANCE: 'incarnation_advance',
  LEASE_EXPIRY: 'lease_expiry',
  TERMINAL: 'terminal',
  PRIVILEGED_OPERATOR_REPAIR: 'privileged_operator_repair',
  NON_LIFECYCLE_COLUMNS: 'non_lifecycle_columns',
  DORMANT_DEBT: 'dormant_debt',
});
const C = NODES_TRANSITION_CLASS;

// [file, function, class, owned transition]. Shrink only.
const NODES_TRANSITION_OWNER_ENTRIES = Object.freeze([
  ['src/control-plane/node-lifecycle-publication.js', 'applyPublication',
    C.LIFECYCLE_PUBLICATION, 'CONNECTED liveness / READY promotion'],
  ['src/bootstrap/shared/node-registration-owner.js', 'registerNodeInCluster',
    C.REGISTRATION, 'joiner row birth at this boot'],
  // Registration is monotonic in the mutation itself (D-7,
  // node-registration-incarnation-write.js): birth by INSERT or one CAS over
  // an older observed incarnation; never a generic UPSERT.
  ['src/bootstrap/shared/node-registration-owner-durable-rejoin-methods.js',
    'registerJoinNodeRow', C.REGISTRATION,
    'joiner row birth / advance at this boot'],
  ['src/control-plane/owners/membership-publication-runtime-owner.js',
    'insert', C.REGISTRATION, 'joiner row birth at this boot (INSERT)'],
  ['src/control-plane/owners/membership-publication-runtime-owner.js',
    'advance', C.REGISTRATION,
    'joiner row CAS over an older observed incarnation'],
  ['src/rebalancer/node-storage-budget-service.js', 'insert',
    C.REGISTRATION, 'seed row birth with storage budget (INSERT)'],
  ['src/rebalancer/node-storage-budget-service.js', 'advance',
    C.REGISTRATION, 'seed row CAS over an older observed incarnation'],
  ['src/control-plane/owners/membership-publication-runtime-owner.js',
    'advanceJoinNodeBootIncarnation', C.INCARNATION_ADVANCE,
    'observed older boot -> this boot (durable rejoin / resumed join)'],
  ['src/control-plane/heartbeat-service-publication-methods.js',
    'disconnectNodeDueToLeaseExpiry', C.LEASE_EXPIRY,
    'READY -> DISCONNECTED on observed lease lapse'],
  ['src/control-plane/heartbeat-service-lifecycle-methods.js',
    'writeShutdownRowAtIncarnation', C.TERMINAL,
    'graceful shutdown -> STOPPED at the exact boot incarnation'],
  ['src/bootstrap/shared/node-registration-owner-publication-methods.js',
    'writeNodeWithdrawalAtIncarnation', C.TERMINAL,
    'failed join admission -> STOPPED at the exact boot incarnation'],
  ['src/control-plane/lease-service.js', 'reapStrandedJoiningRows',
    C.TERMINAL, 'stranded JOINING -> STOPPED at the observed incarnation ' +
      'and lease state'],
  // Privileged operator repair: raw SQL through the admin query channel,
  // keyed by node_id only. It deliberately bypasses the incarnation, lease
  // and lost-outcome classification of the lifecycle owners; the owners'
  // own source policies then refuse to build on an operator-set status
  // (e.g. READY is never published from a draining row).
  ['src/cli/admin-cli-action-methods.js', 'updateNodeStatus',
    C.PRIVILEGED_OPERATOR_REPAIR, 'operator drain / activate (status only)'],
  ['src/cli/admin-cli-action-methods.js', 'removeNode',
    C.PRIVILEGED_OPERATOR_REPAIR, 'operator node-row removal (DELETE)'],
  ['src/topology/latency-group-manager.js', 'persistNodeAssignment',
    C.NON_LIFECYCLE_COLUMNS, 'latency topology columns'],
  ['src/rebalancer/storage-capacity-migration.js', 'backfillNodeBudgets',
    C.DORMANT_DEBT, 'budget backfill (migration never constructed)'],
  ['src/node/failure-detector.js', 'handleNodeSuspicion',
    C.DORMANT_DEBT, 'SUSPECTED'],
  ['src/node/failure-detector.js', 'handleNodeFailure',
    C.DORMANT_DEBT, 'FAILED'],
  ['src/node/failure-detector.js', 'handleNodeRecovery',
    C.DORMANT_DEBT, 'recovery -> ACTIVE'],
  ['src/node/node-lifecycle-service.js', 'registerNode',
    C.DORMANT_DEBT, 'registration'],
  ['src/node/node-lifecycle-service.js', 'updateHeartbeat',
    C.DORMANT_DEBT, 'heartbeat'],
  ['src/node/node-lifecycle-service.js', 'removeNode',
    C.DORMANT_DEBT, 'removal'],
  ['src/node/node-reintegration-service.js', 'completeReintegration',
    C.DORMANT_DEBT, 'reintegration complete'],
  ['src/node/node-reintegration-service.js', 'failReintegration',
    C.DORMANT_DEBT, 'reintegration failed'],
]);

const NODES_TRANSITION_OWNERS = Object.freeze(Object.fromEntries(
  NODES_TRANSITION_OWNER_ENTRIES.map(([file, functionName, transitionClass,
    transition]) =>
    [`${file}#${functionName}`, Object.freeze({transitionClass, transition})]),
));

// A dormant writer is debt only while the runtime never constructs it: its
// module may be imported only by its package index (re-exported through
// src/public-api.js for library consumers), never by a runtime module.
const DORMANT_ALLOWED_IMPORTERS = Object.freeze([
  'src/node/index.js',
  'src/rebalancer/index.js',
]);

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

function isNodesMutationNode(node, source) {
  return (node.type === 'CallExpression' && isNodesMutationCall(node)) ||
    isNodesMutationSql(node, source);
}

function childNodes(node) {
  return Object.values(node).flatMap((value) =>
    (Array.isArray(value) ? value : [value])
      .filter((child) => child && typeof child.type === 'string'));
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
    if (isNodesMutationNode(node, source)) {
      sites.add(`${relativePath}#${functionNames.at(-1) || '<module>'}`);
    }
    for (const child of childNodes(node)) {
      visit(child, node);
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

/**
 * @param {string} file - Repository-relative module path.
 * @return {Array<string>} src files (other than itself) importing it.
 */
function collectModuleImporters(file) {
  const baseName = file.split('/').pop();
  const importers = [];
  for (const path of listSourceFiles(SOURCE_ROOT)) {
    const relativePath = relative(REPO_ROOT, path);
    if (relativePath === file) continue;
    const source = readFileSync(path, 'utf8');
    if (new RegExp(`from\\s+['"][^'"]*/${baseName}['"]`, 'u').test(source)) {
      importers.push(relativePath);
    }
  }
  return importers.sort();
}

export {
  DORMANT_ALLOWED_IMPORTERS,
  NODES_TRANSITION_CLASS,
  NODES_TRANSITION_OWNERS,
  collectModuleImporters,
  collectNodesMutationSites,
};
