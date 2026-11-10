/**
 * system_table_raw_column_reads_outside_decoder: the one recogniser of a
 * read of a `services`, `nodes` or `replica_operations` row's stored column
 * outside that table's decoder module (epic
 * code-navigability-and-mistake-resistance, quest system-table-row-decoders).
 * The detector module (code-navigability-detectors.js) is the single import
 * point and runs it.
 *
 * A READ is a member read `x.col`, `x['col']` or `x[COLUMN.COL]` (optional
 * chain included), or a destructured key `{col} = x` / `{[COLUMN.COL]: v}`,
 * that is not an assignment, update or delete target and not a callee. A
 * write builder never reads: an object literal key, an assignment target and
 * a column name inside SQL text are writes or text, so write builders are
 * excluded by construction. A builder that copies from another row
 * (`{node_id: row.node_id}`) reads that row and counts.
 *
 * ATTRIBUTION, per nearest enclosing function (the module top level is one
 * scope) and per object (structural key; each destructuring pattern is its
 * own object):
 * - an OWN column (stored by exactly one of the three tables and by no other
 *   system table, `type` excepted as a generic word) attributes its read to
 *   that table outright;
 * - a SHARED column (`node_id`, `status`, `partition_id`, `created_at`,
 *   `type`, ...) attributes its read to a table only when the same object
 *   in the same scope also has an own-column read of that table: the
 *   producer is traced by the co-read evidence, never by the name alone.
 * Known blind spots (by design; listed in the quest notes): a shared-column
 * read on an object whose scope reads no own column of the table (a row
 * passed to a helper that reads only `node_id`/`status`) is not counted; a
 * read through a variable key (`row[name]`) or another constants object
 * than `COLUMN` is not counted; evidence does not cross function scopes.
 *
 * A file named `<table>-row-decoder.js` (table name with `-` for `_`) is
 * that table's decoder: its reads attributed only to its own table are not
 * sites. One site per read; its detail is `<table>[+<table>]:<column>`.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import path from 'node:path';

import {
  NODE,
  childNodes,
  makeSite,
  memberSpelling,
  structuralKey,
} from './code-navigability-source.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const ROW = 'system_table_raw_column_reads_outside_decoder';

// Each table's stored columns, split into OWN (no other system table
// stores the name) and SHARED. The detector witness pins both lists to the
// schemas in src/bootstrap/system-table-*-schema-definitions.js.
const SYSTEM_TABLE_COLUMNS = Object.freeze({
  services: Object.freeze({
    own: Object.freeze(['raft_role', 'state_entered_at', 'previous_state',
      'trigger_reason', 'cleanup_token', 'create_attempt_token']),
    shared: Object.freeze(['service_id', 'service_type', 'node_id', 'partition_id',
      'group_id', 'replica_id', 'status', 'error_message', 'address', 'created_at',
      'updated_at']),
  }),
  nodes: Object.freeze({
    own: Object.freeze(['node_address', 'cpu_cores', 'memory_mb', 'disk_gb',
      'cpu_usage_percent', 'memory_usage_percent', 'disk_usage_percent',
      'connection_state', 'last_heartbeat', 'ready_lease_expires_at',
      'storage_budget_bytes', 'storage_budget_source', 'storage_budget_updated_at',
      'latency_group_id', 'last_latency_check_at', 'latency_assignment_state']),
    shared: Object.freeze(['node_id', 'status', 'capabilities', 'boot_incarnation',
      'created_at']),
  }),
  replica_operations: Object.freeze({
    own: Object.freeze(['membership_publication_epoch',
      'message_group_membership_owner_claim', 'message_group_membership_permit',
      'source_replica_id', 'message_group_membership_lane_key',
      'message_group_membership_phase', 'message_group_membership_obligation_state',
      'message_group_membership_identity', 'message_group_learner_stamp',
      'message_group_voter_stamp', 'message_group_removal_stamp',
      'message_group_source_lifecycle_claim', 'create_admission_state',
      'create_admission_token', 'create_admission_replica_created_at',
      'create_admission_attempt_token', 'create_admission_previous_attempt_token',
      'create_admission_attempt_seq', 'create_admission_workflow_updated_at',
      'create_admission_owner_incarnation', 'target_claim_key', 'source_node_id',
      'workflow_step', 'steps_history']),
    // `type` is stored by no other system table but is a generic word, so it
    // is attributed like a shared column.
    shared: Object.freeze(['operation_id', 'type', 'partition_id', 'entity_type',
      'entity_id', 'replica_id', 'target_node_id', 'status', 'created_at',
      'updated_at', 'completed_at', 'lease_expires_at', 'error_message']),
  }),
});

const TABLE_NAMES = Object.freeze(Object.keys(SYSTEM_TABLE_COLUMNS));
const COLUMN_CONSTANTS_OBJECT = 'COLUMN';
const DECODER_SUFFIX = '-row-decoder.js';
const TABLE_WORD_SEPARATOR = '_';
const FILE_WORD_SEPARATOR = '-';
const TABLE_JOIN = '+';
const DETAIL_SEPARATOR = ':';
const PATTERN_KEY_PREFIX = 'pattern@';
const DELETE_OPERATOR = 'delete';

const NODE_TYPE = Object.freeze({
  ARROW: 'ArrowFunctionExpression',
  ASSIGNMENT: 'AssignmentExpression',
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  FUNCTION_EXPRESSION: 'FunctionExpression',
  OBJECT_PATTERN: 'ObjectPattern',
  PROGRAM: 'Program',
  PROPERTY: 'Property',
  UPDATE: 'UpdateExpression',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});
const SCOPE_TYPES = Object.freeze(new Set([NODE_TYPE.ARROW,
  NODE_TYPE.FUNCTION_DECLARATION, NODE_TYPE.FUNCTION_EXPRESSION]));

// column -> tables storing it (among the three), and column -> owning
// table for an own column.
function columnIndex() {
  const tablesOf = new Map();
  const ownerOf = new Map();
  for (const table of TABLE_NAMES) {
    const {own, shared} = SYSTEM_TABLE_COLUMNS[table];
    for (const column of [...own, ...shared]) {
      if (!tablesOf.has(column)) tablesOf.set(column, []);
      tablesOf.get(column).push(table);
    }
    for (const column of own) ownerOf.set(column, table);
  }
  return {tablesOf, ownerOf};
}
const COLUMNS = columnIndex();

// The table whose decoder a file is, or undefined.
function decoderTableOf(file) {
  const base = path.basename(file);
  for (const table of TABLE_NAMES) {
    const decoderFile = `${stringReplaceAll(table, TABLE_WORD_SEPARATOR,
      FILE_WORD_SEPARATOR)}${DECODER_SUFFIX}`;
    if (base === decoderFile) return table;
  }
  return undefined;
}

// The stored column of the three tables a member key names: a plain or
// static string key, or `COLUMN.X` (read as the lower-cased X); undefined for
// any other name (a `COLUMN.X` of another table included).
function keyColumn(property, computed) {
  const spelled = computed && property.type === NODE.MEMBER && !property.computed &&
      property.object.type === NODE.IDENTIFIER &&
      property.object.name === COLUMN_CONSTANTS_OBJECT ?
    stringToLowerCase(property.property.name) :
    memberSpelling({computed, property});
  return COLUMNS.tablesOf.has(spelled) ? spelled : undefined;
}

function isWriteOrCallPosition(node, parent) {
  if (!parent) return false;
  if (parent.type === NODE_TYPE.ASSIGNMENT && parent.left === node) return true;
  if (parent.type === NODE_TYPE.UPDATE && parent.argument === node) return true;
  if (parent.type === NODE.UNARY && parent.operator === DELETE_OPERATOR &&
      parent.argument === node) {
    return true;
  }
  return parent.type === NODE.CALL && parent.callee === node;
}

function patternReads(pattern, objectKey, reads) {
  for (const property of pattern.properties) {
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const column = keyColumn(property.key, property.computed);
    if (column) reads.push({node: property.key, column, objectKey});
  }
}

// The object a destructuring pattern reads: the declarator's init when it
// has one, else the pattern itself.
function patternObjectKey(pattern, parent) {
  if (parent && parent.type === NODE_TYPE.VARIABLE_DECLARATOR && parent.id === pattern &&
      parent.init) {
    return structuralKey(parent.init);
  }
  if (parent && parent.type === NODE_TYPE.ASSIGNMENT && parent.left === pattern) {
    return structuralKey(parent.right);
  }
  return `${PATTERN_KEY_PREFIX}${pattern.range[0]}`;
}

// Walk one scope's own nodes (not nested functions), collecting reads;
// nested functions are returned to be walked as their own scopes.
function scopeReads(scope) {
  const reads = [];
  const nested = [];
  const visit = (node, parent) => {
    if (node !== scope && SCOPE_TYPES.has(node.type)) {
      nested.push(node);
      return;
    }
    if (node.type === NODE.MEMBER && !isWriteOrCallPosition(node, parent)) {
      const column = keyColumn(node.property, node.computed);
      if (column) reads.push({node, column, objectKey: structuralKey(node.object)});
    } else if (node.type === NODE_TYPE.OBJECT_PATTERN) {
      patternReads(node, patternObjectKey(node, parent), reads);
    }
    for (const child of childNodes(node)) visit(child, node);
  };
  visit(scope, null);
  return {reads, nested};
}

// The tables a read is attributed to, given the own-column evidence of its
// object in its scope.
function attributedTables(read, evidence) {
  const owner = COLUMNS.ownerOf.get(read.column);
  if (owner) return [owner];
  const evidenced = evidence.get(read.objectKey);
  if (!evidenced) return [];
  return arrayFilter(COLUMNS.tablesOf.get(read.column), (table) => evidenced.has(table));
}

function scopeSites(parsed, reads, decoderTable, sites) {
  const evidence = new Map();
  for (const read of reads) {
    const owner = COLUMNS.ownerOf.get(read.column);
    if (!owner) continue;
    if (!evidence.has(read.objectKey)) evidence.set(read.objectKey, new Set());
    evidence.get(read.objectKey).add(owner);
  }
  for (const read of reads) {
    const tables = attributedTables(read, evidence);
    if (tables.length === 0) continue;
    const outside = arrayFilter(tables, (table) => table !== decoderTable);
    if (outside.length === 0) continue;
    sites.push(makeSite(parsed, ROW, read.node,
      `${arrayJoin(tables, TABLE_JOIN)}${DETAIL_SEPARATOR}${read.column}`));
  }
}

// One visit per file (at its Program node): every scope's reads in source
// order of the scopes' walk.
const systemTableRawColumnReads = Object.freeze({
  row: ROW,
  visit(node, _parent, parsed, sites) {
    if (node.type !== NODE_TYPE.PROGRAM) return;
    const decoderTable = decoderTableOf(parsed.file);
    const pending = [node];
    const fileSites = [];
    while (pending.length > 0) {
      const scope = pending.shift();
      const {reads, nested} = scopeReads(scope);
      scopeSites(parsed, reads, decoderTable, fileSites);
      pending.push(...nested);
    }
    fileSites.sort((left, right) => left.range[0] - right.range[0]);
    sites.push(...fileSites);
  },
});

export {
  SYSTEM_TABLE_COLUMNS,
  systemTableRawColumnReads,
};
