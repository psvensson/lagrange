#!/usr/bin/env node

// Health-hint import guard (rule R10: durable authority excludes transient
// state).
//
// Node health data (src/diagnostics/node-health-buffer.js, read through
// src/diagnostics/node-health-collection.js) and the resource diagnostics
// report (src/diagnostics/resource-diagnostics-sampler.js) are HINTS:
// process-local, lossy, absent whenever their tick is not running. They may
// inform a person or a run report. They must never become an input to a
// safety, authority, admission, routing, timing or placement decision.
//
// The guard is an allow-list. Every src module that reaches a hint module
// must be named below, with the exported names it may take:
//
//   - the hint modules themselves (they compose one another);
//   - the admin node-health route, the one reader;
//   - the declared producers, which may take only the write surface;
//   - the composition root that owns the sampler's lifetime;
//   - recorded debt: a reader that predates the rule, named with the reason
//     it is debt. The allow-list does not grow to admit a new reader.
//
// A reference is any import, re-export, dynamic import(), createRequire'd
// require(), `new URL(...)` or other string literal whose relative specifier
// resolves to a hint module. A reference that names no binding statically
// (dynamic import, require, namespace import) takes every name. A module that
// re-exports a hint binding (`export ... from`, `export *`, or exporting an
// imported hint binding) is a relay: the relay itself is a violation, and its
// importers are judged as if they imported the hint module. An allow-list
// entry that no longer matches a reference is stale and fails too, so the
// list only shrinks.
//
// There is no baseline: the count is zero or the audit fails.
//
// Usage: node scripts/checks/check-health-hint-imports.js [--root <dir>]

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parseSourceFile, walkAst} from '../guideline-check-shared.js';

// Prototype methods captured at module load (the harness convention).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEXT_ENCODING = 'utf8';
const JS_SUFFIX = '.js';
const SOURCE_ROOT = 'src';
const ROOT_FLAG = '--root';
const POSIX_SEPARATOR = '/';
const RELATIVE_PREFIXES = Object.freeze(['./', '../']);
const DEFAULT_EXPORT = 'default';
const STRING_TYPE = 'string';
// Every exported name of a module.
const ALL_NAMES = '*';

const NODE = Object.freeze({
  EXPORT_ALL: 'ExportAllDeclaration',
  EXPORT_DEFAULT: 'ExportDefaultDeclaration',
  EXPORT_NAMED: 'ExportNamedDeclaration',
  IDENTIFIER: 'Identifier',
  IMPORT_DECLARATION: 'ImportDeclaration',
  IMPORT_DEFAULT: 'ImportDefaultSpecifier',
  IMPORT_NAMESPACE: 'ImportNamespaceSpecifier',
  LITERAL: 'Literal',
  TEMPLATE: 'TemplateLiteral',
  VARIABLE_DECLARATION: 'VariableDeclaration',
});

const HEALTH_HINT_MODULE = Object.freeze({
  BUFFER: 'src/diagnostics/node-health-buffer.js',
  COLLECTION: 'src/diagnostics/node-health-collection.js',
  RESOURCE_SAMPLER: 'src/diagnostics/resource-diagnostics-sampler.js',
});
const HEALTH_HINT_MODULES = Object.freeze(Object.values(HEALTH_HINT_MODULE));

const ALLOWED_ROLE = Object.freeze({
  READER: 'reader',
  PRODUCER: 'producer',
  COMPOSITION_ROOT: 'composition_root',
  RECORDED_DEBT: 'recorded_debt',
});

// The write surface a producer may take from the buffer.
const BUFFER_PRODUCER_NAMES = Object.freeze(['NODE_HEALTH_SERIES', 'recordNodeHealthSample']);

const HEALTH_HINT_ALLOWED_IMPORTS = Object.freeze([
  Object.freeze({importer: 'src/admin/admin-websocket-diagnostics-route-methods.js',
    module: HEALTH_HINT_MODULE.COLLECTION, names: Object.freeze(['collectNodeHealth']),
    role: ALLOWED_ROLE.READER, reason: 'the admin node-health route'}),
  Object.freeze({importer: 'src/diagnostics/event-loop-delay-sampler.js',
    module: HEALTH_HINT_MODULE.BUFFER, names: Object.freeze(['sharedNodeHealthBuffer']),
    role: ALLOWED_ROLE.PRODUCER, reason: 'feeds event-loop delay samples to the buffer'}),
  Object.freeze({importer: 'src/message-group/cdc-handler-apply-diagnostics.js',
    module: HEALTH_HINT_MODULE.BUFFER, names: BUFFER_PRODUCER_NAMES,
    role: ALLOWED_ROLE.PRODUCER, reason: 'records CDC apply samples'}),
  Object.freeze({importer: 'src/topology/cdc-group-propagation-wave-diagnostics.js',
    module: HEALTH_HINT_MODULE.BUFFER, names: BUFFER_PRODUCER_NAMES,
    role: ALLOWED_ROLE.PRODUCER, reason: 'records CDC propagation wave samples'}),
  Object.freeze({importer: 'src/transport/message-router-peer-traffic-diagnostics.js',
    module: HEALTH_HINT_MODULE.BUFFER, names: BUFFER_PRODUCER_NAMES,
    role: ALLOWED_ROLE.PRODUCER, reason: 'records peer traffic, served-query and ACK-timeout samples'}),
  Object.freeze({importer: 'src/entrypoint-runtime-admin-composition.js',
    module: HEALTH_HINT_MODULE.RESOURCE_SAMPLER,
    names: Object.freeze(['ResourceDiagnosticsSampler']),
    role: ALLOWED_ROLE.COMPOSITION_ROOT, reason: 'constructs and owns the sampler'}),
  Object.freeze({importer: 'src/config/raft-adaptive-timing-controller.js',
    module: HEALTH_HINT_MODULE.RESOURCE_SAMPLER,
    names: Object.freeze(['ResourceDiagnosticsSampler']),
    role: ALLOWED_ROLE.RECORDED_DEBT,
    reason: 'pre-existing: reads ResourceDiagnosticsSampler.getReport() to choose Raft ' +
      'timing, a decision taken on a hint; recorded debt, not a precedent'}),
]);

const VIOLATION_KIND = Object.freeze({
  UNLISTED_IMPORT: 'unlisted_import',
  NAME_NOT_ALLOWED: 'name_not_allowed',
  RELAY: 'relay',
  STALE_ALLOW_ENTRY: 'stale_allow_entry',
});

function toPosix(filePath) {
  return arrayJoin(stringSplit(filePath, path.sep), POSIX_SEPARATOR);
}

function staticString(node) {
  if (node?.type === NODE.LITERAL && typeof node.value === STRING_TYPE) return node.value;
  if (node?.type === NODE.TEMPLATE && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/**
 * The repository path a relative specifier names, with or without `.js`.
 * @param {string} fromPath - The importing module's repository path.
 * @param {string} specifier - The specifier text.
 * @param {Set<string>} knownPaths - Every module path in scope.
 * @return {string|null} The module's repository path, or null.
 */
function resolveSpecifier(fromPath, specifier, knownPaths) {
  if (!arraySome(RELATIVE_PREFIXES, (prefix) => stringStartsWith(specifier, prefix))) {
    return null;
  }
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromPath), specifier));
  if (knownPaths.has(resolved)) return resolved;
  const withSuffix = `${resolved}${JS_SUFFIX}`;
  return knownPaths.has(withSuffix) ? withSuffix : null;
}

function importedName(specifier) {
  if (specifier.type === NODE.IMPORT_DEFAULT) return DEFAULT_EXPORT;
  if (specifier.type === NODE.IMPORT_NAMESPACE) return ALL_NAMES;
  return specifier.imported.name ?? specifier.imported.value;
}

function exportedName(specifier) {
  return specifier.exported.name ?? specifier.exported.value;
}

/**
 * Everything one module says about module references: what it imports (by
 * local binding), what it re-exports, and every other specifier literal.
 */
function describeModule(file, knownPaths) {
  const ast = parseSourceFile(file.text);
  const references = [];
  const reexports = [];
  const exportNames = [];
  const bindingByLocal = new Map();
  const declarationSources = new Set();
  const resolve = (node) => {
    const specifier = staticString(node);
    return specifier === null ? null : resolveSpecifier(file.path, specifier, knownPaths);
  };
  for (const statement of ast.body) {
    if (statement.source) declarationSources.add(statement.source);
    const target = statement.source ? resolve(statement.source) : null;
    if (statement.type === NODE.IMPORT_DECLARATION) {
      const names = arrayMap(statement.specifiers, importedName);
      if (target) references.push({target, names, line: statement.loc.start.line});
      for (const specifier of statement.specifiers) {
        if (target) {
          bindingByLocal.set(specifier.local.name,
            {target, name: importedName(specifier)});
        }
      }
    } else if (statement.type === NODE.EXPORT_ALL) {
      const exported = statement.exported ? exportedName(statement) : null;
      if (exported) exportNames.push(exported);
      if (target) {
        references.push({target, names: [ALL_NAMES], line: statement.loc.start.line});
        reexports.push({target, name: ALL_NAMES, as: exported, line: statement.loc.start.line});
      }
    } else if (statement.type === NODE.EXPORT_NAMED) {
      collectNamedExport(statement, target, {references, reexports, exportNames});
    } else if (statement.type === NODE.EXPORT_DEFAULT) {
      exportNames.push(DEFAULT_EXPORT);
      if (statement.declaration?.type === NODE.IDENTIFIER) {
        reexports.push({local: statement.declaration.name, as: DEFAULT_EXPORT,
          line: statement.loc.start.line});
      }
    }
  }
  walkAst(ast, (node) => {
    if (declarationSources.has(node)) return;
    const target = resolve(node);
    if (target) references.push({target, names: [ALL_NAMES], line: node.loc.start.line});
  });
  // An export of an imported binding re-exports what the binding names.
  const relays = [];
  for (const reexport of reexports) {
    if (reexport.local === undefined) {
      relays.push(reexport);
      continue;
    }
    const binding = bindingByLocal.get(reexport.local);
    if (binding) relays.push({...binding, as: reexport.as, line: reexport.line});
  }
  return {path: file.path, references, relays, exportNames};
}

function collectNamedExport(statement, target, collected) {
  const line = statement.loc.start.line;
  for (const specifier of statement.specifiers) {
    const as = exportedName(specifier);
    collected.exportNames.push(as);
    if (target) {
      const name = specifier.local.name ?? specifier.local.value;
      collected.references.push({target, names: [name], line});
      collected.reexports.push({target, name, as, line});
    } else {
      collected.reexports.push({local: specifier.local.name, as, line});
    }
  }
  const declaration = statement.declaration;
  if (declaration?.type === NODE.VARIABLE_DECLARATION) {
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== NODE.IDENTIFIER) continue;
      collected.exportNames.push(declarator.id.name);
      // `export const relay = importedHintBinding`.
      if (declarator.init?.type === NODE.IDENTIFIER) {
        collected.reexports.push({local: declarator.init.name, as: declarator.id.name, line});
      }
    }
  } else if (declaration?.id?.name) {
    collected.exportNames.push(declaration.id.name);
  }
}

// The hint names each module exposes: every export of a hint module, and
// the names a relay re-exports from one, to a fixed point.
function computeHintExports(modules) {
  const hintExports = new Map();
  for (const hintPath of HEALTH_HINT_MODULES) {
    const described = modules.get(hintPath);
    if (described) hintExports.set(hintPath, new Set(described.exportNames));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const described of modules.values()) {
      if (arrayIncludes(HEALTH_HINT_MODULES, described.path)) continue;
      for (const relay of described.relays) {
        const source = hintExports.get(relay.target);
        if (!source) continue;
        const relayed = relay.name === ALL_NAMES && relay.as === null ?
          arrayFilter([...source], (name) => name !== DEFAULT_EXPORT) :
          (relay.name === ALL_NAMES || source.has(relay.name) ? [relay.as] : []);
        if (!hintExports.has(described.path)) hintExports.set(described.path, new Set());
        const own = hintExports.get(described.path);
        for (const name of relayed) {
          if (!own.has(name)) {
            own.add(name);
            changed = true;
          }
        }
      }
    }
  }
  return hintExports;
}

function hintNamesTouched(reference, hintExports) {
  const exposed = hintExports.get(reference.target);
  if (!exposed) return [];
  if (arrayIncludes(HEALTH_HINT_MODULES, reference.target)) {
    // Any reference to a hint module itself counts, even a bare import.
    return reference.names.length === 0 ? [ALL_NAMES] : reference.names;
  }
  if (arrayIncludes(reference.names, ALL_NAMES)) return exposed.size > 0 ? [ALL_NAMES] : [];
  return arrayFilter(reference.names, (name) => exposed.has(name));
}

function judgeReference(described, reference, touched, usedEntries) {
  const hintModule = arrayIncludes(HEALTH_HINT_MODULES, reference.target);
  const entry = hintModule ? arrayFind(HEALTH_HINT_ALLOWED_IMPORTS, (candidate) =>
    candidate.importer === described.path && candidate.module === reference.target) : null;
  const violation = {path: described.path, line: reference.line, module: reference.target};
  if (!entry) {
    return {...violation, kind: VIOLATION_KIND.UNLISTED_IMPORT, names: touched};
  }
  usedEntries.add(entry);
  const outside = arrayFilter(touched, (name) => !arrayIncludes(entry.names, name));
  return outside.length === 0 ? null :
    {...violation, kind: VIOLATION_KIND.NAME_NOT_ALLOWED, names: outside};
}

/**
 * @param {Array<{path: string, text: string}>} files - Every src module, by
 *   repository-relative posix path, with its source text.
 * @param {{wholeTree?: boolean}} [options] - wholeTree: the files are the
 *   whole tree, so an allow-list entry whose importer is gone is stale too.
 * @return {{violations: Object[], hintReachingModules: number}} Every
 *   reference to a hint module the allow-list does not admit, every relay,
 *   and every stale allow-list entry.
 */
function auditHealthHintImports(files, {wholeTree = false} = {}) {
  const knownPaths = new Set(arrayMap(files, (file) => file.path));
  const modules = new Map(arrayMap(files,
    (file) => [file.path, describeModule(file, knownPaths)]));
  const hintExports = computeHintExports(modules);
  const violations = [];
  const usedEntries = new Set();
  const reaching = new Set();
  for (const described of modules.values()) {
    if (arrayIncludes(HEALTH_HINT_MODULES, described.path)) continue;
    for (const reference of described.references) {
      const touched = hintNamesTouched(reference, hintExports);
      if (touched.length === 0) continue;
      reaching.add(described.path);
      const violation = judgeReference(described, reference, touched, usedEntries);
      if (violation) violations.push(violation);
    }
    if ((hintExports.get(described.path)?.size ?? 0) > 0) {
      const relay = arrayFind(described.relays,
        (candidate) => hintExports.has(candidate.target));
      violations.push({path: described.path, line: relay.line, module: relay.target,
        kind: VIOLATION_KIND.RELAY, names: [...hintExports.get(described.path)]});
    }
  }
  for (const entry of HEALTH_HINT_ALLOWED_IMPORTS) {
    if (!usedEntries.has(entry) && (wholeTree || knownPaths.has(entry.importer))) {
      violations.push({path: entry.importer, line: 0, module: entry.module,
        kind: VIOLATION_KIND.STALE_ALLOW_ENTRY, names: [...entry.names]});
    }
  }
  return {violations, hintReachingModules: reaching.size};
}

function listSourceFiles(root) {
  const absolute = path.join(root, SOURCE_ROOT);
  if (!fs.existsSync(absolute)) return [];
  const entries = fs.readdirSync(absolute, {recursive: true, withFileTypes: true});
  const sources = arrayFilter(entries,
    (entry) => entry.isFile() && stringEndsWith(entry.name, JS_SUFFIX));
  return arrayMap(sources, (entry) =>
    toPosix(path.relative(root, path.join(entry.parentPath, entry.name))));
}

function formatViolation(violation) {
  const where = `${violation.path}:${violation.line}`;
  const names = arrayJoin(violation.names, ', ');
  switch (violation.kind) {
  case VIOLATION_KIND.RELAY:
    return `${where} relays ${violation.module} (${names}): a hint module is ` +
        'imported from its owner, never re-exported';
  case VIOLATION_KIND.STALE_ALLOW_ENTRY:
    return `${violation.path} no longer reaches ${violation.module}: remove its ` +
        'allow-list entry';
  case VIOLATION_KIND.NAME_NOT_ALLOWED:
    return `${where} takes ${names} from ${violation.module}, beyond its allow-list entry`;
  default:
    return `${where} reaches ${violation.module} (${names}): node health is a hint ` +
        'and only the allow-listed reader, producers and recorded debt may import it';
  }
}

function main(argv) {
  const rootAt = arrayIndexOf(argv, ROOT_FLAG);
  const root = rootAt >= 0 ? path.resolve(argv[rootAt + 1]) : REPO_ROOT;
  const files = arrayMap(listSourceFiles(root), (relativePath) => ({
    path: relativePath,
    text: fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING),
  }));
  const {violations, hintReachingModules} = auditHealthHintImports(files, {wholeTree: true});
  for (const violation of violations) {
    process.stderr.write(`${formatViolation(violation)}\n`);
  }
  process.stdout.write(`health-hint imports: ${violations.length} violation(s); ` +
    `${hintReachingModules} module(s) reach a hint module, ` +
    `${HEALTH_HINT_ALLOWED_IMPORTS.length} allow-list entries ` +
    `(${arrayFilter(HEALTH_HINT_ALLOWED_IMPORTS,
      (entry) => entry.role === ALLOWED_ROLE.RECORDED_DEBT).length} recorded debt), ` +
    `${files.length} src file(s)\n`);
  return violations.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

export {
  ALLOWED_ROLE,
  HEALTH_HINT_ALLOWED_IMPORTS,
  HEALTH_HINT_MODULE,
  VIOLATION_KIND,
  auditHealthHintImports,
};
