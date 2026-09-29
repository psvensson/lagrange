/**
 * Structural census of every node_endpoints / service_endpoints mutation
 * site in src/** (invariant I9). Every endpoint row belongs to one exact node
 * boot incarnation; a mutation path may exist only as a classified owner
 * site whose final mutation carries that incarnation (or, for a dormant
 * owner, no runtime caller). The table only shrinks: an unlisted site fails.
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as espree from 'espree';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE_ROOT = join(REPO_ROOT, 'src');

const TABLE_ARGUMENT_MUTATIONS = new Set([
  'insertSystemTableRow', 'upsertSystemTableRow', 'updateSystemTableRow',
  'deleteSystemTableRow', 'upsertSystemTableRowWithRetry',
  'updateJoinAdmissionSystemTableRowWithRetry', 'applySystemTableChange',
  'upsertRow',
]);
// Endpoint-owner verbs (EndpointMetadataOwnerBase and its tables).
const ENDPOINT_OWNER_MUTATIONS = new Set([
  'insertEndpoint', 'upsertEndpoint', 'updateEndpoint', 'removeEndpoint',
]);
// Entry points of the endpoint incarnation authority: every fenced write,
// refresh and destructive predicate is built through one of them.
const AUTHORITY_ENTRIES = new Set([
  'writeEndpointAtIncarnation', 'mutateEndpointAtIncarnation',
  'endpointIncarnationPredicate', 'stampEndpointIncarnation',
]);
const ENDPOINT_SQL_MUTATION =
  /\b(UPDATE|INSERT(\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|DELETE\s+FROM)\s+(node_endpoints|service_endpoints)\b/iu;
const SOURCE_PREFILTER =
  /ENDPOINTS|_endpoints|Endpoint\(|EndpointAtIncarnation|EndpointIncarnation/u;
const EXCLUDED_FILES = new Set([
  // Verb definitions and the authority's own implementation.
  'src/control-plane/owners/endpoint-metadata-owner-base.js',
  'src/control-plane/owners/endpoint-incarnation-authority.js',
]);

const ENDPOINT_WRITE_CLASS = Object.freeze({
  // The final mutation carries the exact incarnation (birth, CAS, fenced
  // destructive predicate) through the endpoint incarnation authority.
  INCARNATION_FENCED: 'incarnation_fenced',
  // Rows born on a virgin cluster (no prior endpoint row can exist).
  VIRGIN_BIRTH_STAMPED: 'virgin_birth_stamped',
  // A writer with no runtime caller (recorded debt, not permission).
  DORMANT_DEBT: 'dormant_debt',
});
const C = ENDPOINT_WRITE_CLASS;

// [file, function, class, transition, incarnation source]. Shrink only.
const ENDPOINT_WRITER_ENTRIES = Object.freeze([
  ['src/bootstrap/shared/node-registration-owner-publication-methods.js',
    'registerNodeEndpoint', C.INCARNATION_FENCED,
    'joiner node endpoint birth/advance', 'registration boot incarnation'],
  ['src/bootstrap/shared/meta-service-definition-registration.js',
    'registerBuiltInMetaServiceEndpoints', C.VIRGIN_BIRTH_STAMPED,
    'meta endpoint rows stamped; the joiner callback writes through the ' +
      'authority, the seed callback only on a virgin cluster',
    'caller boot incarnation'],
  ['src/control-plane/lease-service.js', 'reapStaleRowEndpoints',
    C.INCARNATION_FENCED, 'stranded JOINING endpoint reap',
    'observed node row incarnation'],
  ['src/bootstrap/shared/meta-service-definition-registration.js',
    'stampThisBoot', C.INCARNATION_FENCED,
    'meta endpoint rows carry the caller boot incarnation',
    'caller boot incarnation'],
  ['src/bootstrap/shared/node-registration-owner-publication-methods.js',
    'withdrawEndpointAtIncarnation', C.INCARNATION_FENCED,
    'failed-join endpoint withdrawal', 'registration boot incarnation'],
  ['src/control-plane/heartbeat-service-publication-methods.js',
    'writeNodeEndpointAtIncarnation', C.INCARNATION_FENCED,
    'heartbeat node endpoint birth/refresh', 'process boot incarnation'],
  ['src/control-plane/owners/membership-publication-runtime-owner.js',
    'writeJoinEndpointAtIncarnation', C.INCARNATION_FENCED,
    'join endpoint birth/advance', 'registration boot incarnation'],
  ['src/control-plane/owners/membership-publication-runtime-owner.js',
    'insert', C.INCARNATION_FENCED, 'join endpoint birth (authority adapter)',
    'registration boot incarnation'],
  ['src/runtime/runtime-endpoint-publication-wiring.js',
    'writeRuntimeEndpointAtIncarnation', C.INCARNATION_FENCED,
    'runtime service endpoint birth/refresh',
    'node boot incarnation (runtime setup)'],
  ['src/runtime/runtime-endpoint-publication-wiring.js', 'insert',
    C.INCARNATION_FENCED, 'runtime endpoint birth (authority adapter)',
    'node boot incarnation (runtime setup)'],
  ['src/runtime/runtime-endpoint-publication-wiring.js',
    'removeRuntimeEndpointAtIncarnation', C.INCARNATION_FENCED,
    'runtime service endpoint removal', 'node boot incarnation'],
  ['src/control-plane/endpoint-service.js', 'registerEndpoint',
    C.DORMANT_DEBT, 'service endpoint upsert (no runtime caller)', 'none'],
  ['src/control-plane/endpoint-service.js', 'removeEndpoint',
    C.DORMANT_DEBT, 'service endpoint removal (no runtime caller)', 'none'],
]);

const ENDPOINT_WRITERS = Object.freeze(Object.fromEntries(
  ENDPOINT_WRITER_ENTRIES.map(([file, fn, writeClass, transition, source]) =>
    [`${file}#${fn}`, Object.freeze({writeClass, transition, source})]),
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

function namesEndpointTable(node) {
  return /"name":"(NODE_ENDPOINTS|SERVICE_ENDPOINTS)"|"value":"(node_endpoints|service_endpoints)"/u
    .test(JSON.stringify(node || null));
}

function calleeName(node) {
  const callee = node.callee;
  return callee?.type === 'MemberExpression' ?
    callee.property?.name :
    callee?.name;
}

function isEndpointMutationNode(node, source) {
  if (node.type === 'CallExpression') {
    const name = calleeName(node);
    return ENDPOINT_OWNER_MUTATIONS.has(name) || AUTHORITY_ENTRIES.has(name) ||
      (TABLE_ARGUMENT_MUTATIONS.has(name) &&
        namesEndpointTable(node.arguments?.[0]));
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return ENDPOINT_SQL_MUTATION.test(node.value);
  }
  return node.type === 'TemplateLiteral' &&
    ENDPOINT_SQL_MUTATION.test(source.slice(node.range[0], node.range[1]));
}

function resolveFunctionName(node, parent) {
  if (node.id?.name) return node.id.name;
  if (parent?.key) return parent.key.name || parent.key.value;
  return parent?.id?.name || '<anonymous>';
}

function childNodes(node) {
  return Object.values(node).flatMap((value) =>
    (Array.isArray(value) ? value : [value])
      .filter((child) => child && typeof child.type === 'string'));
}

function collectFileSites(path, source, sites) {
  const ast = espree.parse(source, {
    ecmaVersion: 'latest', sourceType: 'module', range: true});
  const relativePath = relative(REPO_ROOT, path);
  const functionNames = [];
  const visit = (node, parent) => {
    const isFunction = /Function/u.test(node.type);
    if (isFunction) functionNames.push(resolveFunctionName(node, parent));
    if (isEndpointMutationNode(node, source)) {
      sites.add(`${relativePath}#${functionNames.at(-1) || '<module>'}`);
    }
    for (const child of childNodes(node)) visit(child, node);
    if (isFunction) functionNames.pop();
  };
  visit(ast, null);
}

/**
 * @return {Array<string>} Every `file#function` endpoint mutation site in src
 *   (the owner base's verb definitions excepted).
 */
function collectEndpointMutationSites() {
  const sites = new Set();
  for (const path of listSourceFiles(SOURCE_ROOT)) {
    const source = readFileSync(path, 'utf8');
    if (!SOURCE_PREFILTER.test(source) ||
        EXCLUDED_FILES.has(relative(REPO_ROOT, path))) continue;
    collectFileSites(path, source, sites);
  }
  return [...sites].sort();
}

export {
  ENDPOINT_WRITERS,
  ENDPOINT_WRITE_CLASS,
  collectEndpointMutationSites,
};
