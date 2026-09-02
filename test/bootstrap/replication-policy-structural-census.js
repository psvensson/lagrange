// Structural census helpers for the replication policy authority contract.
//
// Everything here reads SOURCE, not behaviour: the set of replica_count
// assignments in src/, the modules that own runtime replica identity, and the
// decoder's static import closure. They live outside the witness because the
// witness is a behavioural artifact and these are a source census, and because
// the two together exceed this repository's test file-size threshold.
//
// Nothing here is a dataflow analyzer. Each function answers one finite,
// enumerable question about the source text, and the witness pins the answer.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'espree';
import {
  initSync as initializeModuleLexer,
  parse as parseModuleImports,
} from 'es-module-lexer';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..');

// STRUCTURAL, not sampled. Four review rounds showed that probing creation
// sites with particular runtime values can only ever rule out the variants
// somebody thought to try: a maximum, an offset maximum, a ternary on nodeId,
// a config read and a clock are all different samples of the same open claim.
// The sealed clause "an identity count is never persisted as desired RF" is
// universal, so it is proved universally: in the files that write the
// persisted replica_count column, the value expression must BE one of the two
// declared-default identifiers. Any call, member access, ternary, arithmetic
// or literal fails, whatever it would evaluate to.
const PERSISTED_REPLICA_COUNT_COLUMN = 'replica_count';
const DECLARED_DEFAULT_IDENTIFIERS = Object.freeze([
  'DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT',
  'DECLARED_REPLICA_COUNT_DEFAULT',
]);
const CREATION_SITE_FILES = Object.freeze([
  'src/bootstrap/phases/create-message-group-phase.js',
  'src/bootstrap/phases/seed-registration-phase.js',
]);

function walkNodes(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) value.forEach((item) => walkNodes(item, visit));
    else if (value && typeof value === 'object' && value.type) {
      walkNodes(value, visit);
    }
  }
}

function parseRepoFile(relativePath) {
  return parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'),
    {ecmaVersion: 'latest', sourceType: 'module', loc: true});
}

function persistedReplicaCountWrites(relativePath) {
  const writes = [];
  walkNodes(parseRepoFile(relativePath), (node) => {
    if (node.type !== 'Property' || !node.key) return;
    const key = node.key.name ?? node.key.value;
    if (key !== PERSISTED_REPLICA_COUNT_COLUMN) return;
    writes.push({
      line: node.loc.start.line,
      valueType: node.value.type,
      valueName: node.value.name ?? null,
    });
  });
  return writes;
}

// The STRUCTURAL dependency boundary. A module that owns runtime replica
// identity either declares the seed identity lists or keeps a mutable peer
// container of its own; both are marks of ownership that survive renaming a
// variable, and neither matches a module that merely names the string.
const IDENTITY_OWNER_MARKERS = Object.freeze([
  /\bthis\.replicaIds\b/u,
  /\b(?:const|let|var|function)\s+(?:INITIAL_REPLICA_IDS|INITIAL_MESSAGE_GROUP_REPLICA_IDS|getInitialReplicaIds)\b/u,
]);
const SOURCE_ROOT = 'src';
const JS_SUFFIX = '.js';
const RELATIVE_SPECIFIER_PREFIX = '.';

initializeModuleLexer();

function sourceFilesUnder(relativeDirectory, collected = []) {
  for (const entry of fs.readdirSync(path.join(REPO_ROOT, relativeDirectory),
    {withFileTypes: true})) {
    const child = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) sourceFilesUnder(child, collected);
    else if (entry.name.endsWith(JS_SUFFIX)) collected.push(child);
  }
  return collected;
}

function identityOwnerModules() {
  return sourceFilesUnder(SOURCE_ROOT).filter((relativePath) => {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    return IDENTITY_OWNER_MARKERS.some((marker) => marker.test(source));
  });
}

// The transitive STATIC import closure, read with the same module lexer the
// Solver's own import-closure projection uses. Dynamic import() is deliberately
// out of scope: this is an import-graph boundary, not a dataflow analysis.
function staticImportClosure(entryRelativePath) {
  const seen = new Set();
  const queue = [entryRelativePath];
  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    const source = fs.readFileSync(path.join(REPO_ROOT, current), 'utf8');
    const [imports] = parseModuleImports(source, current);
    for (const imported of imports) {
      if (typeof imported.n !== 'string' ||
        !imported.n.startsWith(RELATIVE_SPECIFIER_PREFIX)) continue;
      const resolved = path.posix.join(path.posix.dirname(current), imported.n);
      if (fs.existsSync(path.join(REPO_ROOT, resolved))) queue.push(resolved);
    }
  }
  return seen;
}
export {
  CREATION_SITE_FILES,
  DECLARED_DEFAULT_IDENTIFIERS,
  identityOwnerModules,
  parseRepoFile,
  persistedReplicaCountWrites,
  staticImportClosure,
  walkNodes,
};
