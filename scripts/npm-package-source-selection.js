// npm selects the files. This owner refuses an unsafe development-source boundary.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isBuiltin} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parse} from 'espree';

export const DEVELOPMENT_SOURCES = Object.freeze([
  'src/debug-runtime/dwarf-index-pipeline.js',
  'src/debug-runtime/vscode-dwarf-parser-backend.js',
]);
const SELECTORS = Object.freeze(['src/', '!src/test-helpers/', '!src/**/INDEX.md',
  'wit/', 'vendor/raft-rs-wasm/', 'CHANGELOG.md',
  ...DEVELOPMENT_SOURCES.map((name) => `!${name}`)]);
const ROOT_FILES = Object.freeze(['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md']);
const SOURCE_DIRECTORIES = Object.freeze(['src', 'wit', 'vendor/raft-rs-wasm']);
const UNRESOLVED = Symbol('unresolved-package-target');
// Bounded, reviewed dynamic contracts. A changed producer or caller needs owner review.
const REVIEWED_SOURCES = Object.freeze({
  'src/transport/message-router-connection-authority.js':
    '16cf3b1e213c5b3188452413e787c59e2d98e0c644118b69693a19b87706ff4a',
  'src/transport/message-router-connection-lifecycle-methods.js':
    '225c5c2793d56872b66671ad25719e4f55b36f454b4bb11195a8573b10354c25',
  'vendor/raft-rs-wasm/BUILD.md':
    '9a0c43c82212f7253351048ac18cfa90c4750f61b9c768ffdcb79340622e5320',
  'vendor/raft-rs-wasm/Cargo.lock':
    '6d16d0cff5143d0b30f51fc1d06110cf22b41c89e3311d756c88ae8d4974761f',
  'vendor/raft-rs-wasm/Cargo.toml':
    'bac23df9887bc8e3c93f1bcfc20bdcc3acc80afdbd47ef0eef4199e3b97644af',
  'vendor/raft-rs-wasm/artifact-digest.json':
    '9e9ae48c07e290c3f1d077806242c26516e3f06c03e2b9195306a5c69364702d',
  'vendor/raft-rs-wasm/pkg/package.json':
    'fbae1db17ab8b0822d9f18654e23a4c15eabe11bb6ec60fcab3eeff55a16ea20',
  'vendor/raft-rs-wasm/pkg/raft_wasm.d.ts':
    '0be438c967162bb8165114aa1abfb28212e427201e6500893b6067bfdd8f600c',
  'vendor/raft-rs-wasm/pkg/raft_wasm_bg.wasm':
    '03b80b4e4b5049d5ea32dfa48ca2e2cb0efe261b47f73bf91499e2d510cadbc8',
  'vendor/raft-rs-wasm/pkg/raft_wasm_bg.wasm.d.ts':
    'ba11e988a990b4c77bcf6ffebdda14a42a97aa24c374569b8a9bcd5022350017',
  'vendor/raft-rs-wasm/raft-0.7.0/LICENSE':
    'c52cf83bf02deb33ef952e2808e3d0b3916d532805d865880ba9bdf8f2c0c93c',
  'vendor/raft-rs-wasm/raft-0.7.0/examples/five_mem_node/main.rs':
    'c2c17c69c6e3ba12cd5120ac70746e1398305cf6e5348cd8aae46aab30342d6f',
  'vendor/raft-rs-wasm/raft-0.7.0/src/lib.rs':
    '2d46291e5c0e11a575610756abfba97827abadba9e11b985b907d44b75aeca7e',
  'vendor/raft-rs-wasm/raft-0.7.0/src/raft_log.rs':
    '2de371ef878538c215782e8f8ed987e3ed4b1bda966f0c5f5da91d1cea6c42a4',
  'vendor/raft-rs-wasm/raft-0.7.0/src/raw_node.rs':
    '92cbca1fa82288ad8ccecbc74066bb766ea38b5ffce4ed89a0d1e0f174ddb057',
  'vendor/raft-rs-wasm/rust-toolchain.toml':
    'd9d51bbd4f251213d5420895ae01cc6d574275c64e2d8e2ef613b50bbfbe9c32',
  'vendor/raft-rs-wasm/src/lib.rs':
    '0fa91ffb1ae68d1c3724fcd455185248c95880796ea542ae4b1c402aa73d0086',
  'src/admin/admin-test-run-service.js':
    'c35d0a0ff12ba96555c834dc869cf1e23bf9f32a7057cf815c8fc992d74caa83',
  'src/admin/admin-constants.js':
    '48e2184a23edae5d4ca352a244c25a890b232efa96527ec4be93a8cb3a074109',
  'src/cli/bulk-load-router.js':
    '4e38ec07f4f09a8cb3c6e99f831e2e1666201f7959e29b33437a1179991b0361',
  'src/cli/cutover-router.js':
    '96afd9fe8db21728ec8eefff3aa69b685666cfb6580dc21816554dd3dc885931',
  'src/cli/service-pipeline-router.js':
    'd474356e9da1c918eee59ae59b5ebb1ccf777efa8f33d70a48aac53b5cc88b06',
  'src/embedded-lagrange.js':
    '06465ea48f29f8df93802dbb02ac63cc96b88e99028a905f7cde5f7a7f2966ee',
  'src/runtime/wasi-component-cell-worker.js':
    '804e0d85f051c2ef647d356be05232fd6b6343a4663ede449f294d89af26cb4f',
  'src/service/service-source-contract.js':
    '169f2702302c395bb065ce83b21d18c492d100fd46248982f48a7bec8074c956',
  'src/cli/service-pipeline-command.js':
    'a6a9e12290eb64ad0b4759ebfd0fdbf322249a91cf7c63ee878aa6ce141fcc7b',
  'src/service/service-component-build.js':
    '0431a59c4f1e6bfad1e829ead5e07b702665461b1d0238854f8044262fe9bc33',
  'src/threading/service-thread-manager.js':
    '93776e635732e492668ca6d9a7fbbc0ba69827f54e01cf4187271409064378e3',
  'src/runtime/wasi-component-cell-runtime.js':
    '51917ab5f0981942613c69edffa36946b41c1bed269a7f9b334ba5f3030ab71e',
  'src/runtime/wasi-component-derivation.js':
    'fb351bfb676cce1e279b5f219cc1ca3dcffca775b6f3d4f8904f84183f5c6bc9',
  'src/raft/raft-rs-binding-owner.js':
    'a2e87da5ee50b52875a5c77139ae5491ad7f7b3ddd1e4a849d77bce63edbde6b',
  'src/raft/raft-rs-core-constants.js':
    '234aae0044361be14ee1cde14d6573a2a20cce6454eb09d1ae8f966a4b560bee',
  'src/sea/runtime-file-resolution.js':
    'b571e09b734f77639f52f25d1a3f9a316b7208f59634802e1332d65b90a27ce0',
  'src/cli/service-wasm-scaffold.js':
    'd20333c3998d253d6ea287d69814fa93c3c93b2115626f7a99d04293ddff4f58',
  'src/diagnostics/runtime-build-provenance.js':
    '208821d22644d767da6b013337e3ce59edb007e9143d30e4b0808f5e0b17ba57',
  'vendor/raft-rs-wasm/pkg/raft_wasm.js':
    '766ec8b1e9dab187ec22bdbf059c4e717a312792f8b6f03536d3c444e76d0f6e',
});
const AUTHORED_IMPORTS = Object.freeze({
  'src/runtime/wasi-component-cell-worker.js': 'moduleUrl',
  'src/service/service-source-contract.js': 'url',
});
const OPAQUE_LOADERS = Object.freeze({
  'src/raft/raft-rs-binding-owner.js': Object.freeze([
    'binding.glue',
  ]),
  'src/diagnostics/runtime-build-provenance.js': Object.freeze([
    'path.join(moduleDirectory, MAIN_BUNDLE)',
  ]),
});
const WORKER_OWNERS = Object.freeze(['src/runtime/wasi-component-cell-runtime.js',
  'src/runtime/wasi-component-derivation.js']);
const RESOLVER_OWNERS = Object.freeze([...WORKER_OWNERS,
  'src/threading/service-thread-manager.js', 'src/raft/raft-rs-binding-owner.js',
  'src/admin/admin-test-run-service.js']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = (value) => hash(JSON.stringify(value));

export class PackageSourceSelectionError extends Error {
  constructor(reason, source, target, cause) {
    super(`package source selection: ${reason}; source=${source}; target=${target}`, {cause});
    this.name = 'PackageSourceSelectionError';
    this.reason = reason;
    this.source = source;
    this.target = target;
  }
}
function demand(ok, reason, source, target) {
  if (!ok) throw new PackageSourceSelectionError(reason, source, target);
}
function canonical(name) {
  demand(typeof name === 'string' && name.length > 0 && !path.isAbsolute(name) &&
    !name.includes('\\') && !name.startsWith('../') && path.posix.normalize(name) === name,
  'noncanonical-path', 'inventory', name);
  return name;
}
function rowAt(root, name) {
  const file = path.join(root, canonical(name));
  demand(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file,
    'nonregular-source', name, file);
  const bytes = fs.readFileSync(file);
  return {path: name, size: bytes.length, sha256: hash(bytes)};
}
function directoryRows(root, prefix) {
  const rows = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), {withFileTypes: true})) {
    const name = `${prefix}/${entry.name}`;
    if (name === 'src/test-helpers') continue;
    if (name.startsWith('src/') && entry.name === 'INDEX.md') continue;
    if (entry.isDirectory()) rows.push(...directoryRows(root, name));
    else rows.push(rowAt(root, name));
  }
  return rows;
}
function sourceRows(root) {
  return [...ROOT_FILES.map((name) => rowAt(root, name)),
    ...SOURCE_DIRECTORIES.flatMap((name) => directoryRows(root, name))]
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
}
function checkSelectors(manifest) {
  demand(Array.isArray(manifest.files) && manifest.files.length === SELECTORS.length &&
    isDeepStrictEqual([...manifest.files].sort(), [...SELECTORS].sort()),
  'exact-development-exclusions', 'package.json#files', JSON.stringify(manifest.files));
}
function checkReviewedSources(rows) {
  const byName = new Map(rows.map((row) => [row.path, row]));
  for (const [name, sha256] of Object.entries(REVIEWED_SOURCES)) {
    demand(byName.has(name) && byName.get(name).sha256 === sha256,
      'reviewed-target-producer-changed', name, 'dynamic/worker/caller source contract');
  }
}
function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node));
    else if (value && typeof value === 'object') walk(value, visit, node);
  }
}
function memberName(node) {
  if (!node || node.type !== 'MemberExpression') return '';
  if (!node.computed) return node.property.name;
  return node.property.type === 'Literal' ? node.property.value : '';
}
function callName(node) {
  if (node.type === 'Identifier') return node.name;
  return memberName(node);
}
function moduleUrl(node) {
  return node?.type === 'MemberExpression' && memberName(node) === 'url' &&
    node.object.type === 'MetaProperty' && node.object.meta.name === 'import';
}
function collectBindings(ast) {
  const bindings = new Map();
  walk(ast, (node) => {
    if (node.type !== 'VariableDeclaration') return;
    for (const item of node.declarations) {
      if (item.id.type !== 'Identifier') continue;
      const prior = bindings.has(item.id.name);
      bindings.set(item.id.name, prior || node.kind !== 'const' ? null : item.init);
    }
  });
  walk(ast, (node) => {
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') {
      bindings.set(node.left.name, null);
    }
    if (Array.isArray(node.params)) {
      for (const item of node.params) {
        if (item.type === 'Identifier') bindings.set(item.name, null);
      }
    }
  });
  return bindings;
}
function identifierValue(node, context, seen) {
  if (seen.has(node.name) || !context.bindings.get(node.name)) return UNRESOLVED;
  return staticValue(context.bindings.get(node.name), context, new Set([...seen, node.name]));
}
function templateValue(node, context, seen) {
  const values = node.expressions.map((item) => staticValue(item, context, seen));
  if (values.some((value) => value === UNRESOLVED)) return UNRESOLVED;
  return node.quasis.map((part, index) => part.value.cooked +
    (index < values.length ? String(values[index]) : '')).join('');
}
function binaryValue(node, context, seen) {
  if (node.operator !== '+') return UNRESOLVED;
  const left = staticValue(node.left, context, seen);
  const right = staticValue(node.right, context, seen);
  if (typeof left !== 'string' || typeof right !== 'string') return UNRESOLVED;
  return left + right;
}
function urlValue(node, context, seen) {
  if (!context.urls.has(aliasName(node.callee, context))) return UNRESOLVED;
  const values = node.arguments.map((item) => staticValue(item, context, seen));
  if (!values.every((value) => typeof value === 'string')) return UNRESOLVED;
  return new URL(...values).href;
}
function staticValue(node, context, seen = new Set()) {
  if (!node) return UNRESOLVED;
  if (moduleUrl(node)) return pathToFileURL(path.join(context.root, context.name)).href;
  const evaluators = {Identifier: identifierValue, TemplateLiteral: templateValue,
    BinaryExpression: binaryValue, NewExpression: urlValue};
  if (node.type === 'Literal') return node.value;
  const evaluate = evaluators[node.type];
  return evaluate ? evaluate(node, context, seen) : UNRESOLVED;
}
function entryLeaves(value, label, visit) {
  if (typeof value === 'string') {
    demand(!value.includes('*'), 'wildcard-entry-target', 'package.json', label);
    visit(value, label);
    return;
  }
  demand(value !== null && typeof value === 'object' && !Array.isArray(value),
    'unexamined-entry-shape', 'package.json', label);
  for (const [key, child] of Object.entries(value)) {
    demand(!key.includes('*'), 'wildcard-entry-key', 'package.json', key);
    entryLeaves(child, `${label}.${key}`, visit);
  }
}
function localIdentity(specifier, context) {
  const base = pathToFileURL(path.join(context.root, context.name));
  const url = new URL(specifier, base);
  demand(url.protocol === 'file:', 'unsupported-module-url', context.name, specifier);
  const name = path.relative(context.root, fileURLToPath(url));
  demand(!name.startsWith('../') && !path.isAbsolute(name),
    'escaping-module-target', context.name, specifier);
  return canonical(name);
}
function checkLocal(specifier, context) {
  const target = localIdentity(specifier, context);
  const identities = [target, `${target}.js`, `${target}/index.js`];
  demand(!identities.some((name) => DEVELOPMENT_SOURCES.includes(name)),
    'incoming-development-source', context.name, specifier);
  const exact = context.files.has(target) ||
    [...context.files].some((name) => name.startsWith(`${target}/`));
  demand(exact || identities.slice(1).some((name) => context.files.has(name)),
    'unselected-local-target', context.name, specifier);
  return target;
}
function packageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') :
    specifier.split('/')[0];
}
function checkReference(specifier, context) {
  demand(typeof specifier === 'string' && specifier.length > 0,
    'unexamined-target', context.name, String(specifier));
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
    return checkLocal(specifier, context);
  }
  if (specifier.startsWith('#')) {
    const alias = context.manifest.imports?.[specifier];
    demand(typeof alias === 'string' && !alias.startsWith('#'),
      'unexamined-local-alias', context.name, specifier);
    return checkReference(alias, {...context, name: 'package.json'});
  }
  demand(isBuiltin(specifier) ||
    Object.hasOwn(context.manifest.dependencies, packageName(specifier)),
  'undeclared-module-target', context.name, specifier);
  return specifier;
}
function checkEntries(manifest, context) {
  const visit = (value, label) => {
    const target = value.startsWith('src/') ? `./${value}` : value;
    checkReference(target, {...context, name: 'package.json'});
    context.edges.push({from: label, to: target});
  };
  for (const name of ['main', 'exports', 'bin']) {
    entryLeaves(manifest[name], name, visit);
  }
  if (manifest.imports !== undefined) entryLeaves(manifest.imports, 'imports', visit);
}
function importAliases(node, context) {
  for (const item of node.specifiers) {
    const imported = item.imported?.name;
    if (imported === 'createRequire') context.creators.add(item.local.name);
    if (imported === 'URL') context.urls.add(item.local.name);
    if (imported === 'Worker') context.workers.add(item.local.name);
    if (imported === 'resolvePackagedRuntimeFile') context.resolvers.add(item.local.name);
    if (node.source.value === 'piscina') context.pools.add(item.local.name);
    if (['node:module', 'module', 'node:worker_threads', 'worker_threads'].includes(
      node.source.value) && item.type !== 'ImportSpecifier') context.namespaces.add(item.local.name);
  }
}
function targetRoles(context) {
  return [context.loaders, context.creators, context.resolvers,
    context.workers, context.pools, context.urls];
}
function aliasName(node, context) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type !== 'MemberExpression') return '';
  if (!node.computed) return node.property.name;
  const value = staticValue(node.property, context);
  return typeof value === 'string' ? value : '';
}
function assignAlias(name, initial, context) {
  if (initial?.type === 'CallExpression' &&
    context.creators.has(aliasName(initial.callee, context))) context.loaders.add(name);
  for (const names of [...targetRoles(context), context.namespaces]) {
    if (names.has(aliasName(initial, context))) names.add(name);
  }
}
function addAliases(node, context) {
  if (node.type === 'ImportDeclaration') importAliases(node, context);
  if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') {
    assignAlias(node.left.name, node.right, context);
  }
  if (node.type !== 'VariableDeclarator' || !node.init) return;
  if (node.id.type === 'Identifier') return assignAlias(node.id.name, node.init, context);
  if (node.id.type !== 'ObjectPattern') return;
  collectDestructuredAliases(node.id, context);
}
function collectDestructuredAliases(pattern, context) {
  for (const property of pattern.properties) {
    const key = property.computed ? staticValue(property.key, context) : property.key?.name;
    for (const names of targetRoles(context)) {
      if (names.has(key) && property.value?.type === 'Identifier') {
        names.add(property.value.name);
        context.declarations.add(property.value);
      }
    }
  }
}
function reviewedDeclaration(node, parent, context) {
  if (context.name === 'src/transport/message-router-connection-authority.js' &&
    parent.type === 'Property' && parent.shorthand && node.name === 'URL') return true;
  return ['src/sea/runtime-file-resolution.js',
    'src/transport/message-router-connection-authority.js'].includes(context.name) &&
    parent.type === 'ExportSpecifier';
}
function targetDeclaration(node, parent, context) {
  if (context.declarations.has(node) || reviewedDeclaration(node, parent, context)) return true;
  if (parent.type.startsWith('Import')) return true;
  if (parent.type === 'Property' && parent.key === node && !parent.computed) return true;
  return parent.id === node || parent.params?.includes(node) === true;
}
function inspectNamespaceUse(node, parent, context) {
  if (node.type !== 'Identifier' || !context.namespaces.has(node.name)) return;
  const namedMember = parent.type === 'MemberExpression' && parent.object === node &&
    aliasName(parent, context) !== '';
  const alias = parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier';
  demand(namedMember || alias, 'unexamined-loader-namespace', context.name,
    context.code.slice(parent.start, parent.end));
}
function allowedTargetUse(node, parent, context) {
  if (parent.type === 'BinaryExpression' && parent.operator === 'instanceof') return true;
  if (['CallExpression', 'NewExpression'].includes(parent.type)) return parent.callee === node;
  if (parent.type === 'VariableDeclarator') return parent.id.type === 'Identifier';
  if (parent.type === 'AssignmentExpression') return parent.left.type === 'Identifier';
  if (parent.type !== 'MemberExpression' || parent.object !== node) return false;
  return memberName(parent) === 'resolve' || context.name ===
    'src/diagnostics/runtime-build-provenance.js' && memberName(parent) === 'cache' ||
    context.name === 'src/raft/raft-rs-binding-owner.js' && memberName(parent) === 'cache';
}
function inspectTargetUse(node, parent, context) {
  if (!parent || !['Identifier', 'MemberExpression'].includes(node.type)) return;
  // Reviewed generated WASM glue exports opaque handles; its complete vendor bytes are bound.
  if (context.name === 'vendor/raft-rs-wasm/pkg/raft_wasm.js') return;
  if (node.type === 'Identifier' && parent.type === 'MemberExpression' &&
    parent.property === node && !parent.computed) return;
  if (targetDeclaration(node, parent, context)) return;
  inspectNamespaceUse(node, parent, context);
  if (!targetRoles(context).some((names) => names.has(aliasName(node, context)))) return;
  demand(allowedTargetUse(node, parent, context), 'unexamined-target-alias-use', context.name,
    context.code.slice(parent.start, parent.end));
}
function collectAliases(ast, context) {
  let previousSize;
  const size = () => [...targetRoles(context), context.namespaces]
    .reduce((total, names) => total + names.size, 0);
  do {
    previousSize = size();
    walk(ast, (node) => addAliases(node, context));
  } while (previousSize !== size());
}
function opaqueLoader(node, context) {
  const text = node ? context.code.slice(node.start, node.end) : '<absent>';
  return OPAQUE_LOADERS[context.name]?.includes(text) === true;
}
function inspectLoaderTarget(node, context) {
  const target = staticValue(node, context);
  if (target === UNRESOLVED) {
    demand(opaqueLoader(node, context), 'unexamined-loader-target', context.name,
      node ? context.code.slice(node.start, node.end) : '<absent>');
    return;
  }
  context.edges.push({from: context.name, to: checkReference(target, context)});
}
function inspectImport(node, context) {
  const target = staticValue(node.source, context);
  if (target === UNRESOLVED) {
    const expression = context.code.slice(node.source.start, node.source.end);
    demand(AUTHORED_IMPORTS[context.name] === expression,
      'unexamined-dynamic-import', context.name, expression);
    return;
  }
  context.edges.push({from: context.name, to: checkReference(target, context)});
}
function loaderCall(node, context) {
  if (context.loaders.has(aliasName(node.callee, context))) return true;
  if (node.callee.type === 'CallExpression') {
    return context.creators.has(aliasName(node.callee.callee, context));
  }
  return node.callee.type === 'MemberExpression' &&
    context.loaders.has(callName(node.callee.object));
}
function inspectCall(node, context) {
  const name = aliasName(node.callee, context);
  if (context.creators.has(name) || name === 'require') {
    inspectLoaderTarget(node.arguments[0], context);
  } else if (loaderCall(node, context) || name === 'require' ||
    node.callee.object?.type === 'MetaProperty' && name === 'resolve') {
    inspectLoaderTarget(node.arguments[0], context);
  } else if (context.resolvers.has(name)) {
    demand(RESOLVER_OWNERS.includes(context.name), 'unexamined-runtime-file-resolver',
      context.name, context.code.slice(node.start, node.end));
  } else if (name === 'eval') {
    demand(false, 'unexamined-evaluated-source', context.name,
      context.code.slice(node.start, node.end));
  }
}
function inspectWorker(node, context) {
  const target = staticValue(node.arguments[0], context);
  if (target !== UNRESOLVED) return inspectLoaderTarget(node.arguments[0], context);
  demand(WORKER_OWNERS.includes(context.name) &&
    context.code.slice(node.arguments[0].start, node.arguments[0].end) === 'this.workerPath',
  'unexamined-worker-target', context.name, context.code.slice(node.start, node.end));
}
function inspectUrl(node, context) {
  const target = staticValue(node, context);
  const first = staticValue(node.arguments[0], context);
  if (context.name === 'src/service/service-component-build.js' && first === '../../node_modules') {
    return;
  }
  if (typeof target === 'string' && target.startsWith('file:')) {
    inspectLoaderTarget(node, context);
  } else if (node.arguments.length > 1 && staticValue(node.arguments[1], context) === UNRESOLVED) {
    demand(false, 'unexamined-url-base', context.name, context.code.slice(node.start, node.end));
  }
}
function inspectNew(node, context) {
  const name = aliasName(node.callee, context);
  if (context.workers.has(name)) return inspectWorker(node, context);
  if (context.pools.has(name)) {
    demand(context.name === 'src/threading/service-thread-manager.js',
      'unexamined-pool-target', context.name, context.code.slice(node.start, node.end));
  } else if (context.urls.has(name)) {
    inspectUrl(node, context);
  } else if (name === 'Function') {
    demand(context.name === 'vendor/raft-rs-wasm/pkg/raft_wasm.js',
      'unexamined-generated-source', context.name, context.code.slice(node.start, node.end));
  }
}
function parseSelectedSource(code, name) {
  try {
    return parse(code, {ecmaVersion: 'latest', sourceType:
      name.startsWith('vendor/') || name.endsWith('.cjs') ? 'script' : 'module', range: true});
  } catch (error) {
    throw new PackageSourceSelectionError('source-syntax-unexaminable', name, error.message, error);
  }
}
function inspectSyntax(root, row, shared) {
  const code = fs.readFileSync(path.join(root, row.path), 'utf8');
  demand(hash(code) === row.sha256, 'source-changed-during-scan', row.path, row.sha256);
  const ast = parseSelectedSource(code, row.path);
  const context = {...shared, root, name: row.path, code, bindings: collectBindings(ast),
    declarations: new Set(), namespaces: new Set(),
    creators: new Set(['createRequire']), loaders: new Set(['require', '_load']),
    workers: new Set(['Worker']), pools: new Set(['Piscina']), urls: new Set(['URL']),
    resolvers: new Set(['resolvePackagedRuntimeFile'])};
  collectAliases(ast, context);
  walk(ast, (node, parent) => {
    inspectTargetUse(node, parent, context);
    if (node.source && ['ImportDeclaration', 'ExportNamedDeclaration',
      'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) inspectImport(node, context);
    if (node.type === 'CallExpression') inspectCall(node, context);
    if (node.type === 'NewExpression') inspectNew(node, context);
  });
}
function inspectSelection(root, manifest) {
  checkSelectors(manifest);
  const currentManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  demand(isDeepStrictEqual(currentManifest, manifest), 'workspace-manifest-changed',
    'package.json', 'manifest consumed by selection guard');
  const rows = sourceRows(root);
  const excluded = rows.filter((row) => DEVELOPMENT_SOURCES.includes(row.path));
  demand(excluded.length === DEVELOPMENT_SOURCES.length && excluded.every((row) => row.size > 0),
    'missing-or-empty-development-source', 'source tree', DEVELOPMENT_SOURCES.join(','));
  const retained = rows.filter((row) => !DEVELOPMENT_SOURCES.includes(row.path));
  checkReviewedSources(retained);
  const shared = {root, manifest, files: new Set(retained.map((row) => row.path)), edges: []};
  checkEntries(manifest, shared);
  for (const row of retained.filter((item) => /\.[cm]?js$/u.test(item.path))) {
    inspectSyntax(root, row, shared);
  }
  return {schema: 'npm-package-source-selection/1', manifest, retained, excluded,
    sourceFingerprint: fingerprint(rows), edges: shared.edges};
}
export function inspectPackageSourceSelection(root, manifest) {
  try {
    return inspectSelection(root, manifest);
  } catch (error) {
    if (error instanceof PackageSourceSelectionError) throw error;
    throw new PackageSourceSelectionError('source-unexaminable', root, error.message, error);
  }
}
function checkPackedList(packed, actual) {
  const npmRows = packed.files.map((row) => ({path: canonical(row.path), size: row.size}))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const actualRows = actual.map(({path: name, size}) => ({path: name, size}));
  demand(isDeepStrictEqual(npmRows, actualRows) && packed.entryCount === actual.length,
    'npm-selected-inventory-mismatch', 'npm pack', packed.filename);
}
function checkPackedBodies(root, selection, actual, manifest) {
  demand(isDeepStrictEqual(actual.map((row) => row.path),
    selection.retained.map((row) => row.path)), 'selected-membership-mismatch', root,
  'all retained source/assets/vendor and exact development exclusions');
  for (const row of actual) {
    if (row.path === 'package.json') continue;
    const original = selection.retained.find((item) => item.path === row.path);
    demand(row.sha256 === original.sha256 && row.size === original.size,
      'workspace-packed-byte-mismatch', row.path, original.sha256);
  }
  const parsed = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  demand(isDeepStrictEqual(parsed, manifest), 'packed-manifest-mismatch', root, 'package.json');
}
export function validatePackedSourceSelection(root, selection, packed, manifest) {
  try {
    const actual = sourceRows(root);
    checkPackedList(packed, actual);
    checkPackedBodies(root, selection, actual, manifest);
    return {files: actual, fingerprint: fingerprint(actual), npm: packed};
  } catch (error) {
    if (error instanceof PackageSourceSelectionError) throw error;
    throw new PackageSourceSelectionError('packed-source-unexaminable', root, error.message, error);
  }
}

// Workspace manifest policy belongs to the same package-selection owner.
export const PACKAGE_NAME = 'lagrange-server';
export const REGISTRY_URL = 'https://registry.npmjs.org/';
const PACKAGE_ROOT_EXPORT = '.';
const PUBLIC_API_MAIN = 'src/public-api.js';
const PUBLIC_API_EXPORT = './src/public-api.js';
const LAGRANGE_BIN_PATH = './src/sea-entry.js';
const ADMIN_BIN_NAME = 'lagrange-admin';
const ADMIN_BIN_PATH = './src/cli/bin/lagrange-admin.js';
const PACKAGE_SOURCE_PATH = 'src/';
const PACKAGE_WIT_PATH = 'wit/';
const COMPONENTIZE_DEPENDENCY = '@bytecodealliance/componentize-js';
const DISTRIBUTED_SQL_KEYWORD = 'distributed-sql';
const PUBLIC_ACCESS = 'public';
const MANIFEST_ERROR = Object.freeze({
  LOCK_VERSION: 'package-lock.json root version must match package.json',
  MAIN: 'package.json main must expose src/public-api.js',
  EXPORT: 'package.json root export must expose src/public-api.js',
  LAGRANGE_BIN: 'package.json must retain the lagrange executable',
  ADMIN_BIN: 'package.json must retain the lagrange-admin executable',
  FILES: 'package.json files must explicitly include src/',
  WIT_FILES: 'package.json files must explicitly include wit/',
  COMPONENTIZE_DEP:
    'package.json dependencies must include @bytecodealliance/componentize-js',
  AUTHOR: 'package.json author must be non-empty',
  HOMEPAGE: 'package.json homepage must be non-empty',
  BUGS: 'package.json bugs.url must be non-empty',
  KEYWORDS: 'package.json keywords must identify the distributed SQL package',
  ACCESS: 'package.json publishConfig.access must be public',
  PROVENANCE: 'package.json publishConfig.provenance must be true',
});
export function* packageStructureChecks(packageJson, packageLock) {
  const rootLock = packageLock.packages?.[''];
  yield {valid: packageJson.name === PACKAGE_NAME,
    message: `package.json name must be ${PACKAGE_NAME}`};
  yield {valid: packageLock.name === PACKAGE_NAME,
    message: `package-lock.json name must be ${PACKAGE_NAME}`};
  yield {valid: rootLock?.name === PACKAGE_NAME,
    message: `package-lock.json root package name must be ${PACKAGE_NAME}`};
  yield {valid: rootLock?.version === packageJson.version,
    message: MANIFEST_ERROR.LOCK_VERSION};
  yield {valid: packageJson.main === PUBLIC_API_MAIN,
    message: MANIFEST_ERROR.MAIN};
  yield {valid: packageJson.exports?.[PACKAGE_ROOT_EXPORT] === PUBLIC_API_EXPORT,
    message: MANIFEST_ERROR.EXPORT};
  yield {valid: packageJson.bin?.lagrange === LAGRANGE_BIN_PATH,
    message: MANIFEST_ERROR.LAGRANGE_BIN};
  yield {valid: packageJson.bin?.[ADMIN_BIN_NAME] === ADMIN_BIN_PATH,
    message: MANIFEST_ERROR.ADMIN_BIN};
  yield {valid: Array.isArray(packageJson.files) &&
    packageJson.files.includes(PACKAGE_SOURCE_PATH),
  message: MANIFEST_ERROR.FILES};
  yield {valid: Array.isArray(packageJson.files) &&
    packageJson.files.includes(PACKAGE_WIT_PATH),
  message: MANIFEST_ERROR.WIT_FILES};
  yield {valid: Boolean(packageJson.dependencies?.[COMPONENTIZE_DEPENDENCY]),
    message: MANIFEST_ERROR.COMPONENTIZE_DEP};
}
export function* publicationMetadataChecks(packageJson) {
  yield {valid: Boolean(packageJson.author),
    message: MANIFEST_ERROR.AUTHOR};
  yield {valid: Boolean(packageJson.homepage),
    message: MANIFEST_ERROR.HOMEPAGE};
  yield {valid: Boolean(packageJson.bugs?.url),
    message: MANIFEST_ERROR.BUGS};
  yield {valid: packageJson.keywords?.includes(DISTRIBUTED_SQL_KEYWORD),
    message: MANIFEST_ERROR.KEYWORDS};
  yield {valid: packageJson.publishConfig?.access === PUBLIC_ACCESS,
    message: MANIFEST_ERROR.ACCESS};
  yield {valid: packageJson.publishConfig?.provenance === true,
    message: MANIFEST_ERROR.PROVENANCE};
  yield {valid: packageJson.publishConfig?.registry === REGISTRY_URL,
    message: `package.json publishConfig.registry must be ${REGISTRY_URL}`};
}
