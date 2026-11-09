/**
 * Census of the projection reads that today rely on the write path's cache
 * wait (quest replica-admission-from-committed-operation, attempt 2, design
 * note evidence/attempt2-write-answer-contract-delta.md section 4; lead
 * decision 2026-11-02).
 *
 * When a routed system-table write answers at commit, an owner that writes a
 * table and reads that same table back from its SystemTableCache no longer
 * finds its own write there by construction. Each such owner module must
 * wait explicitly for the write's position (awaitProjectionAt) - or be
 * reasoned to need no projection and listed below with the reason - before
 * the wait is deleted. Nothing may take a quieter path.
 *
 * Granularity: the owner module. At function scope no function both awaits
 * a mutation and reads the same table back (0 sites at 7486f64b0); the
 * dependence crosses methods of one owner (a writer method, a later
 * decision method), so the module is the unit a static census can decide.
 * A dependence across modules is not decidable statically; it is the
 * attempt's audit of each consumer listed in the design note, section 3.
 *
 * Parsed sources (espree), no grep: a module is a site when it calls a
 * system-table mutation naming table T and reads T from an expression naming
 * a cache (get / getAll / filter / has). Tables compare by name, not
 * spelling (TABLES.NODES, SYSTEM_TABLE_NAME.NODES and 'nodes' are one).
 *
 * The system-metadata owner family (SystemMetadataOwnerBase and its
 * subclasses) names neither: its writes go through this.upsertRow /
 * insertRow / update* / delete* and its reads through this.readCached* /
 * listCachedRows / filterCachedRows / executeCacheRead, on the owner's one
 * table. A module that calls both is a site `file:OWNER_TABLE` (found
 * 2026-11-02 by the minimal-deployment runtime access witness: the first
 * census, which looked only for named caches, missed this family).
 */

import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as espree from 'espree';
import {sourceFiles, walk} from '../test-helpers/source-tree-walk.js';
import {test} from '../../src/test-helpers/tap.js';

const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));
const MUTATION = /^(insert|update|upsert|delete)SystemTableRow(WithRetry)?$|^submitMutation$/u;
const CACHE_READS = new Set(['get', 'getAll', 'filter', 'has']);
const CACHE_NAME = /cache/iu;
const PROJECTION_WAIT = 'awaitProjectionAt';
const OWNER_WRITES = new Set(['upsertRow', 'insertRow', 'updateByPrimaryKey',
  'updateWhere', 'deleteByPrimaryKey', 'deleteWhere']);
const OWNER_CACHED_READS = new Set(['readCachedByPrimaryKey', 'listCachedRows',
  'filterCachedRows', 'executeCacheRead']);
const OWNER_TABLE = 'OWNER_TABLE';

function ownerCall(node, names) {
  return node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' && !node.callee.computed &&
    node.callee.object.type === 'ThisExpression' &&
    names.has(node.callee.property.name);
}
// Sites reasoned to need no projection: `file:TABLE` -> reason.
const FACADE = 'facade: write and cached-read entry points only; ' +
  'dependence, if any, lives in callers, audited per caller';
// Lead decision (b), 2026-11-02. Callers audited per facade.
const NO_PROJECTION_NEEDED = Object.freeze({
  // Writer: runtime-replica-state-projection (services rows). Cached
  // readers: control-plane-readiness-node-service-rows and
  // replica-dispatch-service-dispatch-observation-methods - Group A (C5).
  'control-plane/owners/services-owner.js:OWNER_TABLE': FACADE,
  // Writers: membership-publication-coordinator-persist (the persist loop,
  // covered) and formation-release-handoff-publication-coordinator (R17,
  // participant release/cutover owner). Cached reader:
  // membership-publication-coordinator-reads.
  'control-plane/owners/control-plane-publications-owner.js:OWNER_TABLE':
    FACADE,
  // No caller writes through this facade (replica_operations rows are
  // written by ReplicaOperationRepository). Cached readers:
  // replica-dispatch-service-dispatch-observation-methods and
  // replica-dispatch-replay-readiness - Group A (C5).
  'control-plane/owners/replica-operations-owner.js:OWNER_TABLE': FACADE,
  // Writer: admin-owner-operations removeTerminalNode (R17, Group A: admin
  // envelope A1). Cached readers: replica-dispatch observation and
  // control-plane-readiness-startup-authority-health /
  // control-plane-readiness-node-service-rows - heartbeat/NODES, Group A.
  'control-plane/owners/nodes-owner.js:OWNER_TABLE': FACADE,
  // Sites 1-4 (lead decision 2026-11-02): census rows owned elsewhere, not
  // redesigned in this quest. Defect: sendHeartbeat is a full-row merge
  // that re-publishes NODES fields owned by other writers, read from the
  // projection, so a stale projection read can overwrite a newer committed
  // field (lost update). Repair shape for the owner: column ownership -
  // each writer updates only its own columns through the partial
  // conditional UPDATE the write path supports; CAS only where a column has
  // two writers.
  'control-plane/heartbeat-service-lifecycle-methods.js:NODES':
    'census row (site 1, own NODES row merge): owner Group A (node ' +
    'lifecycle, lease, serve eligibility C5/C7); lost-update defect and ' +
    'column-ownership repair shape recorded; liveness witnessed',
  'control-plane/heartbeat-service-publication-methods.js:NODES':
    'census row (sites 1-2, heartbeat publication and lease expiry of ' +
    'other nodes\' rows): owner Group A (C5/C7)',
  'node/node-reintegration-service.js:NODES':
    'census row (site 3, node reintegration): owner Group A',
  'topology/latency-group-manager.js:NODES':
    'census row (site 4): owner the topology owner',
  'topology/latency-group-manager.js:LATENCY_GROUPS':
    'census row (site 4): owner the topology owner',
  // Site 6 (policy/table-policy-service.js:TABLES) left the module census
  // when the conditional write moved to table-policy-committed-base.js (a
  // file-size and complexity extraction). The dependence is now across
  // modules and was audited by hand: the write base is the committed policy
  // fence or one committed read, the write is conditional on it (typed
  // conflict), and the service's remaining cached TABLES reads are the
  // getTablePolicy read path, not a write base.
  // Site 7: own kept rows (rowsByJobId) after each write, and every workflow
  // write is conditional on row_version; the cached reads are a fallback
  // lookup and startup recovery, where a stale projection row can only
  // produce a typed conflict (accepted: false), never a lost update.
  'query/schema-provisioning-job-repository.js:SCHEMA_OPERATIONS':
    'own-row keep (rowsByJobId) with row_version-conditional writes; ' +
    'cached reads are fallback lookup and recovery, bounded to a typed ' +
    'conflict',
  // Site 7: a census false positive by spelling - the write is the join
  // delegate's pass-through upsert(tableName, row), the read is a record
  // count over the hydrated tables for one log line (observation only).
  'bootstrap/phases/query-system-state-phase.js:tableName':
    'observation only: the cached read counts hydrated rows for a log ' +
    'line; the write is the join delegate\'s pass-through upsert',
});

function memberCallName(node) {
  return node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' && !node.callee.computed ?
    node.callee.property.name : null;
}

function tableKey(source, node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value.toUpperCase();
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    return node.property.name.toUpperCase();
  }
  return source.slice(node.range[0], node.range[1]);
}

function mutationTable(source, call) {
  const [first] = call.arguments;
  if (memberCallName(call) === 'submitMutation' &&
      first?.type === 'ObjectExpression') {
    const property = first.properties.find((entry) =>
      entry.key?.name === 'tableName');
    return tableKey(source, property?.value);
  }
  return tableKey(source, first);
}

function callName(node) {
  return memberCallName(node) ??
    (node.type === 'CallExpression' && node.callee.type === 'Identifier' ?
      node.callee.name : null);
}

function recordCacheRead(source, node, read) {
  if (CACHE_NAME.test(source.slice(
    node.callee.object.range[0], node.callee.object.range[1]))) {
    const table = tableKey(source, node.arguments[0]);
    if (table) read.add(table);
  }
}

// One AST node's contribution to its module's site: a write, a cache read,
// or the projection wait.
function recordNode(source, node, found) {
  if (ownerCall(node, OWNER_WRITES)) found.written.add(OWNER_TABLE);
  if (ownerCall(node, OWNER_CACHED_READS)) found.read.add(OWNER_TABLE);
  const name = callName(node);
  if (name === null) return;
  if (name === PROJECTION_WAIT) found.waits = true;
  if (MUTATION.test(name)) {
    const table = mutationTable(source, node);
    if (table) found.written.add(table);
  }
  if (CACHE_READS.has(name) && node.callee.type === 'MemberExpression') {
    recordCacheRead(source, node, found.read);
  }
}

function census() {
  const sites = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!/SystemTableRow|submitMutation|this\.(upsertRow|insertRow|update|delete)/u
      .test(source)) continue;
    const ast = espree.parse(source, {ecmaVersion: 'latest',
      sourceType: 'module', range: true});
    const found = {written: new Set(), read: new Set(), waits: false};
    walk(ast, (node) => recordNode(source, node, found));
    const {written, read, waits} = found;
    for (const table of written) {
      if (read.has(table)) {
        sites.push({id: `${file.slice(SRC_ROOT.length)}:${table}`, waits});
      }
    }
  }
  return sites.sort((a, b) => a.id.localeCompare(b.id));
}

test('every owner that writes a table and reads it back from its cache ' +
  'waits for its write position (awaitProjectionAt) or is reasoned to need ' +
  'none', async (t) => {
  const sites = census();
  const owed = sites.filter((site) => !site.waits &&
    !Object.hasOwn(NO_PROJECTION_NEEDED, site.id)).map((site) => site.id);
  t.comment(`census: ${sites.length} site(s), ${owed.length} owed`);
  t.same(owed, [], 'no owner reads its own writes back from the cache ' +
    'without waiting for the write\'s position');
  t.same(Object.keys(NO_PROJECTION_NEEDED).filter((id) =>
    !sites.some((site) => site.id === id)), [],
  'every reasoned exemption names a live site');
});

// A4: no second projection wait grows over the cache's change events. A
// module that both awaits a Promise it builds and subscribes to the cache
// is the one wait, or is named here with what it waits for.
const OWN_CACHE_CHANGE_WAITS = Object.freeze({
  'cdc/cdc-integration-service-projection-wait.js': 'the one projection wait',
  'cdc/cdc-confirmation-tracker.js': 'a caller confirmation wait with a ' +
    'timer; no production code constructs the tracker',
  'bootstrap/shared/startup-convergence-gate.js': 'startup convergence ' +
    'wake source; waits on readiness conditions, not a write position',
});

test('no wait over onCacheChange exists outside the named modules',
  async (t) => {
    const found = sourceFiles(SRC_ROOT).filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return source.includes('.onCacheChange(') &&
        source.includes('new Promise');
    }).map((file) => file.slice(SRC_ROOT.length)).sort();
    t.same(found, Object.keys(OWN_CACHE_CHANGE_WAITS).sort(),
      'each cache-change wait is the projection wait or named with a reason');
  });
