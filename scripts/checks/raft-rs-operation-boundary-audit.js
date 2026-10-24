import fs from 'node:fs';
import path from 'node:path';

import {parse} from 'espree';

import {
  inspectLifecycleRetirements,
  NATIVE_RETIREMENT_METHOD,
} from './raft-rs-lifecycle-retirement-census.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const RUNTIME_OWNER = 'src/raft/raft-rs-runtime-owner.js';
const BINDING_OWNER = 'src/raft/raft-rs-binding-owner.js';
const CORE_LOADER = 'src/raft/raft-rs-core.js';
const LIFECYCLE_OWNER =
  'src/raft/raft-rs-replica-lifecycle-owner.js';
const SNAPSHOT_INSTALL = 'src/raft/snapshot-install.js';
const SNAPSHOT_LIFECYCLE_PREPARE = 'prepareReplicaLifecycleForSnapshot';
const SNAPSHOT_RECEIVER = 'src/raft/snapshot-receiver-admission.js';
const SNAPSHOT_LIFECYCLE_INSPECT = 'inspectReplicaLifecycleForSnapshot';
const ORIGINAL_ALLOCATION_PREPARATION =
  'src/raft/raft-rs-original-allocation-preparation.js';
const ORIGINAL_LIFECYCLE_PREPARE =
  'prepareReplicaLifecycleForOriginalAllocation';
// The preparation's declared calls into the lifecycle owner, the sole writer
// of the allocation fields (owner decision 2026-10-26, Q3): format a born
// founder's allocation row, issue the anchor, and the two named reads.
const ORIGINAL_ALLOCATION_ROW_PREPARE = 'prepareOriginalAllocationRow';
const ORIGINAL_ALLOCATION_ISSUE = 'markOriginalAllocationIssued';
const ORIGINAL_ALLOCATION_ROW_READ = 'readOriginalAllocationRow';
const ORIGINAL_ALLOCATION_DECLARATION_READ = 'readOriginalAllocationDeclaration';
// Each declared caller and one named lifecycle operation it may import, one
// row per (caller, operation): a symbol missing here is refused there.
const LIFECYCLE_OPERATION_CALLERS = Object.freeze([
  Object.freeze([SNAPSHOT_INSTALL, SNAPSHOT_LIFECYCLE_PREPARE]),
  Object.freeze([SNAPSHOT_RECEIVER, SNAPSHOT_LIFECYCLE_INSPECT]),
  Object.freeze([ORIGINAL_ALLOCATION_PREPARATION, ORIGINAL_LIFECYCLE_PREPARE]),
  Object.freeze([ORIGINAL_ALLOCATION_PREPARATION, ORIGINAL_ALLOCATION_ROW_PREPARE]),
  Object.freeze([ORIGINAL_ALLOCATION_PREPARATION, ORIGINAL_ALLOCATION_ISSUE]),
  Object.freeze([ORIGINAL_ALLOCATION_PREPARATION, ORIGINAL_ALLOCATION_ROW_READ]),
  Object.freeze([ORIGINAL_ALLOCATION_PREPARATION, ORIGINAL_ALLOCATION_DECLARATION_READ]),
]);
const LIFECYCLE_ADMIN =
  'src/raft/raft-rs-lifecycle-administration.js';
const LIFECYCLE_COORDINATOR =
  'src/node/replica-handler-remove-execution-methods.js';
const PORT_CONSTRUCTOR = 'src/raft/raft-rs-operation-port.js';
const MEMBERSHIP_ADMIN = 'src/raft/raft-rs-membership-administration.js';
// The group-neutral admission owner (design R3 section 1.6, D4): the one
// coordinator a partition and a message group reach the registry through.
const MEMBERSHIP_COORDINATOR =
  'src/raft/raft-rs-group-membership-admission.js';
const DIRECT_BINDING_PATTERN =
  /(?:vendor\/raft-rs-wasm|raft_wasm(?:_bg)?(?:\.wasm|\.js)?)/u;
const AUDIT_AST = Object.freeze({
  LITERAL: 'Literal',
  IDENTIFIER: 'Identifier',
  BINARY_EXPRESSION: 'BinaryExpression',
  TEMPLATE_LITERAL: 'TemplateLiteral',
  IMPORT_DECLARATION: 'ImportDeclaration',
  IMPORT_SPECIFIER: 'ImportSpecifier',
  IMPORT_NAMESPACE_SPECIFIER: 'ImportNamespaceSpecifier',
  EXPORT_ALL_DECLARATION: 'ExportAllDeclaration',
  EXPORT_NAMED_DECLARATION: 'ExportNamedDeclaration',
  EXPORT_DEFAULT_DECLARATION: 'ExportDefaultDeclaration',
  VARIABLE_DECLARATION: 'VariableDeclaration',
  IMPORT_EXPRESSION: 'ImportExpression',
  MEMBER_EXPRESSION: 'MemberExpression',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
  OBJECT_PATTERN: 'ObjectPattern',
  CALL_EXPRESSION: 'CallExpression',
});
const AUDIT_SYNTAX = Object.freeze({
  JAVASCRIPT_EXTENSION: '.js',
  START: 'start',
  END: 'end',
  LOCATION: 'loc',
  PATH_SEPARATOR: '/',
  RELATIVE_PREFIX: '.',
  CONCATENATION_OPERATOR: '+',
  CORE_PRIMITIVE_OWNER: 'RAFT_RS_CORE_PRIMITIVE',
  LIST_SEPARATOR: ',',
  MEMBER_SEPARATOR: '.',
  SOURCE_ENCODING: 'utf8',
  SOURCE_DIRECTORY: 'src',
  // An interpolation the census cannot resolve, kept in the SQL text so a
  // write naming the lifecycle table around it is still a write.
  UNRESOLVED: '?',
});
const AUDIT_PARSE_OPTIONS = Object.freeze({ecmaVersion: 'latest', sourceType: 'module'});
const AUDIT_VIOLATION = Object.freeze({
  DIRECT_BINDING_IMPORT: 'direct-binding-import',
  BINDING_IMPORT_OUTSIDE_OWNER: 'binding-import-outside-owner',
  BINDING_OWNER_IMPORT_BYPASS: 'binding-owner-import-bypass',
  RUNTIME_OWNER_IMPORT_BYPASS: 'runtime-owner-import-bypass',
  LIFECYCLE_ADMIN_IMPORT_BYPASS: 'lifecycle-admin-import-bypass',
  LIFECYCLE_OWNER_IMPORT_BYPASS: 'lifecycle-owner-import-bypass',
  MEMBERSHIP_ADMIN_IMPORT_BYPASS: 'membership-admin-import-bypass',
  CORE_INVOCATION_OUTSIDE_OWNER: 'core-invocation-outside-owner',
  CORE_ALIAS_INVOCATION_OUTSIDE_OWNER:
    'core-alias-invocation-outside-owner',
  LIFECYCLE_WRITE_OUTSIDE_OWNER: 'lifecycle-write-outside-owner',
  LIFECYCLE_SQL_OUTSIDE_OWNER: 'lifecycle-sql-outside-owner',
  // A lifecycle writer may retire, but a binding the census cannot follow
  // there (escape, dynamic method, re-export) hides where retirement happens.
  LIFECYCLE_WRITER_BINDING_ESCAPE: 'lifecycle-writer-binding-escape',
  BINDING_LOADER_REEXPORT: 'binding-loader-reexport',
});
const LIFECYCLE_WRITE_METHODS = Object.freeze([
  'putRetirement', 'writeRetirement',
]);
// Native retirement is the lifecycle administration's retireReplica, found by
// its import binding (raft-rs-lifecycle-retirement-census.js), never by the
// method name: other owners (WasmServiceLifecycle) name a retireReplica too.
const LIFECYCLE_WRITERS = Object.freeze([
  LIFECYCLE_OWNER, LIFECYCLE_ADMIN, LIFECYCLE_COORDINATOR,
]);
const BINDING_LOADER_EXPORTS = Object.freeze([
  'loadRaftRsCore', 'instantiateRaftRsCore',
]);
const LIFECYCLE_SQL_DETAIL_LIMIT = 80;
// A schema or row write naming a lifecycle table, whatever binding spells it.
const LIFECYCLE_WRITE_SQL =
  /\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)\b[\s\S]*_raft_rs_(?:retirement|replica_lifecycle)\b/iu;

function javascriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return arrayFlatMap(fs.readdirSync(directory, {withFileTypes: true}),
    (entry) => {
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return javascriptFiles(resolved);
      }
      return entry.isFile() && stringEndsWith(
        entry.name, AUDIT_SYNTAX.JAVASCRIPT_EXTENSION) ? [resolved] : [];
    });
}

function walk(node, callback) {
  if (node === null || typeof node !== 'object') {
    return;
  }
  callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (arrayIncludes(
      [AUDIT_SYNTAX.START, AUDIT_SYNTAX.END, AUDIT_SYNTAX.LOCATION],
      key,
    )) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, callback));
    } else {
      walk(value, callback);
    }
  }
}

function relative(root, file) {
  return stringSplit(path.relative(root, file), path.sep)
    .join(AUDIT_SYNTAX.PATH_SEPARATOR);
}

function concatenatedValue(node, constants) {
  if (node.operator !== AUDIT_SYNTAX.CONCATENATION_OPERATOR) {
    return null;
  }
  const left = literalValue(node.left, constants);
  const right = literalValue(node.right, constants);
  return typeof left === 'string' && typeof right === 'string' ?
    left + right : null;
}

function templateValue(node, constants) {
  let result = '';
  for (let index = 0; index < node.quasis.length; index += 1) {
    result += node.quasis[index]?.value?.cooked ?? '';
    if (index < node.expressions.length) {
      const expression = literalValue(node.expressions[index], constants);
      if (typeof expression !== 'string') {
        return null;
      }
      result += expression;
    }
  }
  return result;
}

// A namespace-imported constant (`C.NAME`) resolves like a named import.
function namespaceMemberValue(node, constants) {
  return !node.computed && node.object?.type === AUDIT_AST.IDENTIFIER &&
    node.property?.type === AUDIT_AST.IDENTIFIER ?
    constants.get(node.object.name + AUDIT_SYNTAX.MEMBER_SEPARATOR +
      node.property.name) : null;
}

// How each statically known expression shape resolves to its value.
const LITERAL_VALUE_OF = Object.freeze({
  [AUDIT_AST.LITERAL]: (node) => node.value,
  [AUDIT_AST.IDENTIFIER]: (node, constants) => constants.get(node.name),
  [AUDIT_AST.MEMBER_EXPRESSION]: namespaceMemberValue,
  [AUDIT_AST.BINARY_EXPRESSION]: concatenatedValue,
  [AUDIT_AST.TEMPLATE_LITERAL]: templateValue,
});

function literalValue(node, constants = new Map()) {
  const resolve = Object.hasOwn(LITERAL_VALUE_OF, node?.type) ?
    LITERAL_VALUE_OF[node.type] : null;
  return resolve === null ? null : resolve(node, constants) ?? null;
}

function importSource(node, constants) {
  if (arrayIncludes([
    AUDIT_AST.IMPORT_DECLARATION,
    AUDIT_AST.EXPORT_ALL_DECLARATION,
    AUDIT_AST.EXPORT_NAMED_DECLARATION,
  ], node.type)) {
    return literalValue(node.source, constants);
  }
  if (node.type === AUDIT_AST.IMPORT_EXPRESSION) {
    return literalValue(node.source, constants);
  }
  return null;
}

function resolvesTo(file, specifier, target) {
  if (typeof specifier !== 'string' ||
      !stringStartsWith(specifier, AUDIT_SYNTAX.RELATIVE_PREFIX)) {
    return false;
  }
  return path.normalize(path.resolve(path.dirname(file), specifier)) ===
    path.normalize(target);
}

function memberName(member, constants = new Map()) {
  if (member?.type !== AUDIT_AST.MEMBER_EXPRESSION) {
    return null;
  }
  if (!member.computed && member.property.type === AUDIT_AST.IDENTIFIER) {
    return member.property.name;
  }
  return literalValue(member.property, constants);
}

function receiverLooksLikeCore(member, constants) {
  if (member?.type !== AUDIT_AST.MEMBER_EXPRESSION) {
    return false;
  }
  if (member.object?.type === AUDIT_AST.IDENTIFIER) {
    return /(?:core|facade|binding|rawNode)/iu.test(member.object.name);
  }
  return member.object?.type === AUDIT_AST.MEMBER_EXPRESSION &&
    /(?:core|facade|binding|rawNode)/iu.test(
      String(memberName(member.object, constants) || ''));
}

function stringConstants(tree, imported = new Map()) {
  const constants = new Map(imported);
  let changed = true;
  while (changed) {
    changed = false;
    walk(tree, (node) => {
      if (node.type !== AUDIT_AST.VARIABLE_DECLARATOR ||
          node.id?.type !== AUDIT_AST.IDENTIFIER ||
          constants.has(node.id.name)) {
        return;
      }
      const value = literalValue(node.init, constants);
      if (typeof value === 'string') {
        constants.set(node.id.name, value);
        changed = true;
      }
    });
  }
  return constants;
}

// One parse and one export table per module for a whole census run.
function moduleTables() {
  return Object.freeze({trees: new Map(), exports: new Map()});
}

function parseModule(file, tables) {
  if (!tables.trees.has(file)) {
    tables.trees.set(file, fs.existsSync(file) ?
      parse(fs.readFileSync(file, AUDIT_SYNTAX.SOURCE_ENCODING), AUDIT_PARSE_OPTIONS) : null);
  }
  return tables.trees.get(file);
}

function relativeModule(file, specifier) {
  return typeof specifier === 'string' &&
    stringStartsWith(specifier, AUDIT_SYNTAX.RELATIVE_PREFIX) ?
    path.resolve(path.dirname(file), specifier) : null;
}

// The string constants a module exports: its own (`export const`,
// `export {local as name}`) and those it re-exports from another module.
// An import cycle reads the partial table (never a guess beyond it).
function exportedConstants(file, tables) {
  if (tables.exports.has(file)) {
    return tables.exports.get(file);
  }
  const exported = new Map();
  tables.exports.set(file, exported);
  const tree = parseModule(file, tables);
  if (tree === null) {
    return exported;
  }
  const own = moduleConstants(tree, file, tables);
  for (const node of tree.body) {
    addExportedConstants(exported, node, file, own, tables);
  }
  return exported;
}

// One top-level statement's exported string constants, into `exported`.
function addExportedConstants(exported, node, file, own, tables) {
  const source = relativeModule(file, node.source?.value);
  const from = source === null ? own : exportedConstants(source, tables);
  if (node.type === AUDIT_AST.EXPORT_ALL_DECLARATION && source !== null) {
    from.forEach((value, name) => exported.set(name, value));
  }
  if (node.type === AUDIT_AST.EXPORT_NAMED_DECLARATION) {
    addNamedExportConstants(exported, node, own, from);
  }
}

function addNamedExportConstants(exported, node, own, from) {
  for (const declarator of node.declaration?.declarations ?? []) {
    if (own.has(declarator.id?.name)) {
      exported.set(declarator.id.name, own.get(declarator.id.name));
    }
  }
  for (const entry of node.specifiers) {
    if (from.has(entry.local?.name)) {
      exported.set(entry.exported.name, from.get(entry.local.name));
    }
  }
}

// Local bindings of string constants imported from another module: a named
// import under any alias, and each constant of a namespace import as
// `namespace.NAME`. SQL behind an imported table-name alias then resolves
// exactly like SQL behind a local constant.
function importedConstants(tree, file, tables) {
  const imported = new Map();
  for (const node of tree.body) {
    const source = node.type === AUDIT_AST.IMPORT_DECLARATION ?
      relativeModule(file, node.source.value) : null;
    if (source === null) {
      continue;
    }
    const exported = exportedConstants(source, tables);
    for (const entry of node.specifiers) {
      if (entry.type === AUDIT_AST.IMPORT_SPECIFIER &&
          exported.has(entry.imported.name)) {
        imported.set(entry.local.name, exported.get(entry.imported.name));
      }
      if (entry.type === AUDIT_AST.IMPORT_NAMESPACE_SPECIFIER) {
        exported.forEach((value, name) => imported.set(entry.local.name +
          AUDIT_SYNTAX.MEMBER_SEPARATOR + name, value));
      }
    }
  }
  return imported;
}

// SQL text with every resolvable part filled in and every unresolvable
// interpolation kept as a placeholder: `UPDATE ${TABLE} SET ${COLUMN.X}`
// is a write to TABLE even though COLUMN.X is not a string constant.
function sqlText(node, constants) {
  const value = literalValue(node, constants);
  if (typeof value === 'string') {
    return value;
  }
  if (node?.type === AUDIT_AST.TEMPLATE_LITERAL) {
    return arrayMap(node.quasis, (quasi, index) => (quasi.value?.cooked ?? '') +
      (index < node.expressions.length ?
        sqlPart(node.expressions[index], constants) : '')).join('');
  }
  if (node?.type === AUDIT_AST.BINARY_EXPRESSION &&
      node.operator === AUDIT_SYNTAX.CONCATENATION_OPERATOR) {
    return sqlPart(node.left, constants) + sqlPart(node.right, constants);
  }
  return null;
}

function sqlPart(node, constants) {
  return sqlText(node, constants) ?? AUDIT_SYNTAX.UNRESOLVED;
}

// Every lifecycle-table write in one module's SQL, at its outermost string
// expression only (a concatenation's operands are not reported again).
function lifecycleSqlWrites(tree, constants) {
  const nested = new Set();
  const writes = [];
  walk(tree, (node) => {
    if (node.type === AUDIT_AST.BINARY_EXPRESSION &&
        node.operator === AUDIT_SYNTAX.CONCATENATION_OPERATOR) {
      nested.add(node.left);
      nested.add(node.right);
    }
    if (node.type === AUDIT_AST.TEMPLATE_LITERAL) {
      node.expressions.forEach((expression) => nested.add(expression));
    }
  });
  walk(tree, (node) => {
    const text = nested.has(node) ? null : sqlText(node, constants);
    if (typeof text === 'string' && LIFECYCLE_WRITE_SQL.test(text)) {
      arrayPush(writes, stringTrim(text).slice(0, LIFECYCLE_SQL_DETAIL_LIMIT));
    }
  });
  return writes;
}

function moduleConstants(tree, file, tables) {
  return stringConstants(tree, importedConstants(tree, file, tables));
}

function primitiveNames(root) {
  const constantsFile = path.join(
    root, 'src', 'raft', 'raft-rs-core-constants.js');
  if (!fs.existsSync(constantsFile)) {
    return new Set();
  }
  const tree = parse(fs.readFileSync(constantsFile, 'utf8'), {
    ecmaVersion: 'latest', sourceType: 'module',
  });
  const names = new Set();
  walk(tree, (node) => {
    if (node.type !== AUDIT_AST.VARIABLE_DECLARATOR ||
      node.id?.name !== AUDIT_SYNTAX.CORE_PRIMITIVE_OWNER) {
      return;
    }
    walk(node.init, (valueNode) => {
      const value = literalValue(valueNode);
      if (typeof value === 'string') {
        names.add(value);
      }
    });
  });
  return names;
}

function violation(file, code, detail) {
  return Object.freeze({file, code, detail});
}

// Symbol-limited boundary, not a file-wide lifecycle allowlist. Snapshot
// installation can request staging but cannot import the class, registration,
// retirement or general inspection controls. The receiver interaction gets only
// its specific read-only inspection, never staging or mutation capabilities.
// The original-allocation preparation gets only the owner-minted original
// birth of a founder's row before native entry (owner decision 2026-10-26,
// Q1) and the owner's allocation-field operations and reads it declares (Q3),
// never the class, retirement, registration or another operation.
// Every imported symbol is one declared for that caller; namespace, default,
// dynamic imports and re-exports (direct or through a local binding) fail.
function isLifecycleOperationImport(fileName, node) {
  return node.type === AUDIT_AST.IMPORT_DECLARATION &&
    node.specifiers.length > 0 &&
    arrayEvery(node.specifiers, (entry) => entry.type === AUDIT_AST.IMPORT_SPECIFIER &&
      arraySome(LIFECYCLE_OPERATION_CALLERS, ([caller, operation]) =>
        caller === fileName && entry.imported.name === operation));
}

function auditRaftRsOperationBoundary({root}) {
  const sourceRoot = path.join(root, 'src');
  const coreLoader = path.join(root, CORE_LOADER);
  const runtimeOwner = path.join(root, RUNTIME_OWNER);
  const bindingOwner = path.join(root, BINDING_OWNER);
  const lifecycleAdmin = path.join(root, LIFECYCLE_ADMIN);
  const lifecycleOwner = path.join(root, LIFECYCLE_OWNER);
  const membershipAdmin = path.join(root, MEMBERSHIP_ADMIN);
  const runtimePrimitives = primitiveNames(root);
  const violations = [];
  const modules = moduleTables();

  for (const file of javascriptFiles(sourceRoot)) {
    const fileName = relative(root, file);
    const source = fs.readFileSync(file, 'utf8');
    const tree = parseModule(file, modules);
    const constants = moduleConstants(tree, file, modules);
    const primitiveAliases = new Set();
    walk(tree, (node) => {
      if (node.type !== AUDIT_AST.VARIABLE_DECLARATOR) {
        return;
      }
      if (node.id?.type === AUDIT_AST.IDENTIFIER &&
          runtimePrimitives.has(memberName(node.init, constants))) {
        primitiveAliases.add(node.id.name);
      }
      if (node.id?.type === AUDIT_AST.OBJECT_PATTERN) {
        for (const property of node.id.properties) {
          const primitive = property.key?.name ||
            literalValue(property.key, constants);
          const alias = property.value?.name;
          if (runtimePrimitives.has(primitive) && alias) {
            primitiveAliases.add(alias);
          }
        }
      }
    });
    walk(tree, (node) => {
      const specifier = importSource(node, constants);
      if (typeof specifier === 'string' &&
          DIRECT_BINDING_PATTERN.test(specifier) &&
          fileName !== BINDING_OWNER) {
        violations.push(violation(
          fileName, AUDIT_VIOLATION.DIRECT_BINDING_IMPORT,
          specifier));
      }
      if (resolvesTo(file, specifier, coreLoader) &&
        !arrayIncludes([RUNTIME_OWNER, CORE_LOADER], fileName)) {
        violations.push(violation(
          fileName, AUDIT_VIOLATION.BINDING_IMPORT_OUTSIDE_OWNER,
          String(specifier)));
      }
      if (resolvesTo(file, specifier, runtimeOwner) &&
        fileName !== PORT_CONSTRUCTOR) {
        violations.push(violation(
          fileName, AUDIT_VIOLATION.RUNTIME_OWNER_IMPORT_BYPASS,
          String(specifier)));
      }
      if (resolvesTo(file, specifier, bindingOwner) &&
          fileName !== RUNTIME_OWNER) {
        violations.push(violation(
          fileName, AUDIT_VIOLATION.BINDING_OWNER_IMPORT_BYPASS,
          String(specifier)));
      }
      if (resolvesTo(file, specifier, lifecycleAdmin) &&
        fileName !== LIFECYCLE_COORDINATOR) {
        violations.push(violation(fileName,
          AUDIT_VIOLATION.LIFECYCLE_ADMIN_IMPORT_BYPASS,
          String(specifier)));
      }
      if (resolvesTo(file, specifier, lifecycleOwner) &&
        !arrayIncludes(
          [PORT_CONSTRUCTOR, LIFECYCLE_ADMIN, LIFECYCLE_OWNER],
          fileName,
        ) && !isLifecycleOperationImport(fileName, node)) {
        violations.push(violation(fileName,
          AUDIT_VIOLATION.LIFECYCLE_OWNER_IMPORT_BYPASS,
          String(specifier)));
      }
      if (resolvesTo(file, specifier, membershipAdmin) &&
        !arrayIncludes(
          [PORT_CONSTRUCTOR, MEMBERSHIP_COORDINATOR, MEMBERSHIP_ADMIN],
          fileName,
        )) {
        violations.push(violation(fileName,
          AUDIT_VIOLATION.MEMBERSHIP_ADMIN_IMPORT_BYPASS,
          String(specifier)));
      }
      if (node.type === AUDIT_AST.CALL_EXPRESSION) {
        const calledMember = memberName(node.callee, constants);
        const raftRsModule = /^src\/raft\/raft-rs-/u.test(fileName);
        if (runtimePrimitives.has(calledMember) && fileName !== RUNTIME_OWNER &&
          (raftRsModule || receiverLooksLikeCore(node.callee, constants))) {
          violations.push(violation(fileName,
            AUDIT_VIOLATION.CORE_INVOCATION_OUTSIDE_OWNER, calledMember));
        }
        if (node.callee?.type === AUDIT_AST.IDENTIFIER &&
          primitiveAliases.has(node.callee.name) &&
          fileName !== RUNTIME_OWNER) {
          violations.push(violation(fileName,
            AUDIT_VIOLATION.CORE_ALIAS_INVOCATION_OUTSIDE_OWNER,
            node.callee.name));
        }
        if (arrayIncludes(LIFECYCLE_WRITE_METHODS, calledMember) &&
          !arrayIncludes(LIFECYCLE_WRITERS, fileName)) {
          violations.push(violation(fileName,
            AUDIT_VIOLATION.LIFECYCLE_WRITE_OUTSIDE_OWNER, calledMember));
        }
      }
      if (node.type === AUDIT_AST.EXPORT_NAMED_DECLARATION &&
        fileName !== BINDING_OWNER) {
        const names = arrayMap(
          node.specifiers, (entry) => entry.local?.name);
        if (arraySome(names, (name) =>
          arrayIncludes(BINDING_LOADER_EXPORTS, name))) {
          violations.push(violation(
            fileName,
            AUDIT_VIOLATION.BINDING_LOADER_REEXPORT,
            names.join(AUDIT_SYNTAX.LIST_SEPARATOR),
          ));
        }
      }
    });
    if (fileName !== LIFECYCLE_OWNER) {
      arrayPush(violations, ...arrayMap(lifecycleSqlWrites(tree, constants),
        (text) => violation(fileName, AUDIT_VIOLATION.LIFECYCLE_SQL_OUTSIDE_OWNER, text)));
      arrayPush(violations, ...lifecycleReexports(tree, file, fileName, lifecycleOwner));
    }
    arrayPush(violations, ...nativeRetirementCensus(source,
      {file, fileName, lifecycleAdmin}));
  }
  return Object.freeze(violations);
}

// Owner decision 2026-10-26 (Q4, finding F1): a declared caller that imports
// its lifecycle operation and then exports that binding (`export {op}`,
// `export {op as other}`, `export const x = op`, `export default op`) hands
// the capability on exactly as `export {op} from` would; both are refused.
function lifecycleReexports(tree, file, fileName, lifecycleOwner) {
  const bindings = new Set();
  for (const node of tree.body) {
    if (node.type === AUDIT_AST.IMPORT_DECLARATION &&
        resolvesTo(file, node.source.value, lifecycleOwner)) {
      node.specifiers.forEach((entry) => bindings.add(entry.local.name));
    }
  }
  const exported = [];
  for (const node of tree.body) {
    arrayPush(exported, ...exportedBindings(node));
  }
  return arrayMap(arrayFilter(exported, (name) => bindings.has(name)), (name) =>
    violation(fileName, AUDIT_VIOLATION.LIFECYCLE_OWNER_IMPORT_BYPASS,
      `export ${name}`));
}

// The local bindings one top-level export statement hands on.
function exportedBindings(node) {
  if (node.type === AUDIT_AST.EXPORT_DEFAULT_DECLARATION) {
    return node.declaration?.type === AUDIT_AST.IDENTIFIER ? [node.declaration.name] : [];
  }
  if (node.type !== AUDIT_AST.EXPORT_NAMED_DECLARATION || node.source) {
    return [];
  }
  const declared = node.declaration?.type === AUDIT_AST.VARIABLE_DECLARATION ?
    arrayMap(node.declaration.declarations, (declarator) => declarator.init) : [];
  return [
    ...arrayMap(node.specifiers, (entry) => entry.local?.name),
    ...arrayMap(arrayFilter(declared, (init) => init?.type === AUDIT_AST.IDENTIFIER),
      (init) => init.name),
  ];
}

/**
 * Every src module that writes a lifecycle table (row or schema SQL naming
 * `_raft_rs_replica_lifecycle` or `_raft_rs_retirement`), resolving local,
 * imported (any alias) and namespace-imported string constants. The one
 * production writer is the lifecycle owner.
 * @param {{root: string}} options
 * @return {string[]} Sorted repository-relative module paths.
 */
function lifecycleTableWriters({root}) {
  const modules = moduleTables();
  const writers = [];
  for (const file of javascriptFiles(path.join(root, AUDIT_SYNTAX.SOURCE_DIRECTORY))) {
    const tree = parseModule(file, modules);
    if (lifecycleSqlWrites(tree, moduleConstants(tree, file, modules)).length > 0) {
      arrayPush(writers, relative(root, file));
    }
  }
  return writers.sort();
}

// The binding-aware census runs in every file. Only a lifecycle writer's own
// retirements are allowed; every native retirement elsewhere, and every
// binding the census cannot follow anywhere, writers included, fails closed.
function nativeRetirementCensus(source, {file, fileName, lifecycleAdmin}) {
  const census = inspectLifecycleRetirements(source, {file, ownerFile: lifecycleAdmin});
  const writer = arrayIncludes(LIFECYCLE_WRITERS, fileName);
  const unfollowed = writer ? AUDIT_VIOLATION.LIFECYCLE_WRITER_BINDING_ESCAPE :
    AUDIT_VIOLATION.LIFECYCLE_WRITE_OUTSIDE_OWNER;
  return [
    ...arrayMap(writer ? [] : census.calls, () => violation(fileName,
      AUDIT_VIOLATION.LIFECYCLE_WRITE_OUTSIDE_OWNER, NATIVE_RETIREMENT_METHOD)),
    ...arrayMap(census.violations, (entry) => violation(fileName, unfollowed, entry.reason)),
  ];
}

export {
  auditRaftRsOperationBoundary,
  lifecycleTableWriters,
  BINDING_OWNER,
  CORE_LOADER,
  LIFECYCLE_ADMIN,
  LIFECYCLE_COORDINATOR,
  LIFECYCLE_OWNER,
  PORT_CONSTRUCTOR,
  RUNTIME_OWNER,
};
