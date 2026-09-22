import fs from 'node:fs';
import path from 'node:path';

import {parse} from 'espree';

const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const RUNTIME_OWNER = 'src/raft/raft-rs-runtime-owner.js';
const CORE_LOADER = 'src/raft/raft-rs-core.js';
const LIFECYCLE_OWNER =
  'src/raft/raft-rs-replica-lifecycle-owner.js';
const LIFECYCLE_ADMIN =
  'src/raft/raft-rs-lifecycle-administration.js';
const LIFECYCLE_COORDINATOR =
  'src/node/replica-handler-remove-execution-methods.js';
const PORT_CONSTRUCTOR = 'src/raft/raft-rs-operation-port.js';
const MEMBERSHIP_ADMIN = 'src/raft/raft-rs-membership-administration.js';
const MEMBERSHIP_COORDINATOR =
  'src/partition/partition-service-raft-membership-administration.js';
const DIRECT_BINDING_PATTERN =
  /(?:vendor\/raft-rs-wasm|raft_wasm(?:_bg)?(?:\.wasm|\.js)?)/u;
const AUDIT_AST = Object.freeze({
  LITERAL: 'Literal',
  IDENTIFIER: 'Identifier',
  BINARY_EXPRESSION: 'BinaryExpression',
  TEMPLATE_LITERAL: 'TemplateLiteral',
  IMPORT_DECLARATION: 'ImportDeclaration',
  EXPORT_ALL_DECLARATION: 'ExportAllDeclaration',
  EXPORT_NAMED_DECLARATION: 'ExportNamedDeclaration',
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
});
const AUDIT_VIOLATION = Object.freeze({
  DIRECT_BINDING_IMPORT: 'direct-binding-import',
  BINDING_IMPORT_OUTSIDE_OWNER: 'binding-import-outside-owner',
  RUNTIME_OWNER_IMPORT_BYPASS: 'runtime-owner-import-bypass',
  LIFECYCLE_ADMIN_IMPORT_BYPASS: 'lifecycle-admin-import-bypass',
  LIFECYCLE_OWNER_IMPORT_BYPASS: 'lifecycle-owner-import-bypass',
  MEMBERSHIP_ADMIN_IMPORT_BYPASS: 'membership-admin-import-bypass',
  CORE_INVOCATION_OUTSIDE_OWNER: 'core-invocation-outside-owner',
  CORE_ALIAS_INVOCATION_OUTSIDE_OWNER:
    'core-alias-invocation-outside-owner',
  LIFECYCLE_WRITE_OUTSIDE_OWNER: 'lifecycle-write-outside-owner',
  LIFECYCLE_SQL_OUTSIDE_OWNER: 'lifecycle-sql-outside-owner',
  BINDING_LOADER_REEXPORT: 'binding-loader-reexport',
});
const LIFECYCLE_WRITE_METHODS = Object.freeze([
  'putRetirement', 'retireReplica', 'writeRetirement',
]);
const BINDING_LOADER_EXPORTS = Object.freeze([
  'loadRaftRsCore', 'instantiateRaftRsCore',
]);
const LIFECYCLE_SQL_DETAIL_LIMIT = 80;

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

function literalValue(node, constants = new Map()) {
  if (node?.type === AUDIT_AST.LITERAL) {
    return node.value;
  }
  if (node?.type === AUDIT_AST.IDENTIFIER) {
    return constants.get(node.name) ?? null;
  }
  if (node?.type === AUDIT_AST.BINARY_EXPRESSION &&
      node.operator === AUDIT_SYNTAX.CONCATENATION_OPERATOR) {
    const left = literalValue(node.left, constants);
    const right = literalValue(node.right, constants);
    return typeof left === 'string' && typeof right === 'string' ?
      left + right : null;
  }
  if (node?.type === AUDIT_AST.TEMPLATE_LITERAL) {
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
  return null;
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

function stringConstants(tree) {
  const constants = new Map();
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

function auditRaftRsOperationBoundary({root}) {
  const sourceRoot = path.join(root, 'src');
  const coreLoader = path.join(root, CORE_LOADER);
  const runtimeOwner = path.join(root, RUNTIME_OWNER);
  const lifecycleAdmin = path.join(root, LIFECYCLE_ADMIN);
  const lifecycleOwner = path.join(root, LIFECYCLE_OWNER);
  const membershipAdmin = path.join(root, MEMBERSHIP_ADMIN);
  const runtimePrimitives = primitiveNames(root);
  const violations = [];

  for (const file of javascriptFiles(sourceRoot)) {
    const fileName = relative(root, file);
    const source = fs.readFileSync(file, 'utf8');
    const tree = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
    const constants = stringConstants(tree);
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
          fileName !== RUNTIME_OWNER && fileName !== CORE_LOADER) {
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
        )) {
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
          fileName !== LIFECYCLE_OWNER &&
          fileName !== LIFECYCLE_ADMIN && fileName !== LIFECYCLE_COORDINATOR) {
          violations.push(violation(fileName,
            AUDIT_VIOLATION.LIFECYCLE_WRITE_OUTSIDE_OWNER, calledMember));
        }
      }
      const value = literalValue(node, constants);
      if (typeof value === 'string' &&
        /(?:INSERT|UPDATE|DELETE)[\s\S]*_raft_rs_(?:retirement|replica_lifecycle)/iu
          .test(value) && fileName !== LIFECYCLE_OWNER) {
        violations.push(violation(fileName,
          AUDIT_VIOLATION.LIFECYCLE_SQL_OUTSIDE_OWNER,
          stringTrim(value).slice(0, LIFECYCLE_SQL_DETAIL_LIMIT)));
      }
      if (node.type === AUDIT_AST.EXPORT_NAMED_DECLARATION &&
        fileName !== CORE_LOADER && fileName !== RUNTIME_OWNER) {
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
  }
  return Object.freeze(violations);
}

export {
  auditRaftRsOperationBoundary,
  CORE_LOADER,
  LIFECYCLE_ADMIN,
  LIFECYCLE_COORDINATOR,
  LIFECYCLE_OWNER,
  PORT_CONSTRUCTOR,
  RUNTIME_OWNER,
};
