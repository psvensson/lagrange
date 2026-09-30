// What the JavaScript host actually does, censused from its own source.
//
// The wasmBoundary verdict rests on there being no missing primitive that
// would force consensus semantics back into JavaScript. That is asserted
// structurally: every consensus decision the loop reaches is a call into the
// core, and the host source contains no arithmetic that could decide a
// quorum, a majority or a commit on its own.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

const here = path.dirname(fileURLToPath(import.meta.url));

const SURFACE = Object.freeze({
  // The files that make up the host: the Ready loop and the drives.
  HOST_FILES: Object.freeze(['forked-core-harness.js', 'core-scenarios.js']),
  UTF8: 'utf8',
  CORE_RECEIVERS: Object.freeze(['core', 'cluster']),
  // Names that would mean the host is deciding consensus itself.
  FORBIDDEN_IDENTIFIERS: /^(majority|quorum|computeQuorum|isCommitted)$/u,
});

// Halving is how a majority is computed; if the host never halves anything,
// it cannot be computing one.
const HALVING = /(\/\s*2\b)|(>>\s*1\b)/u;

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const key of KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, visit);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

// `core.x(...)` and `cluster.x(...)`: a decision handed to the core.
function receiverNameOf(receiver) {
  if (receiver?.type === 'Identifier') {
    return receiver.name;
  }
  return receiver?.type === 'MemberExpression' ?
    receiver.property?.name || null : null;
}

function delegatedCoreCall(node) {
  if (node.type !== 'CallExpression' ||
      node.callee?.type !== 'MemberExpression' ||
      node.callee.property?.type !== 'Identifier') {
    return null;
  }
  const receiver = receiverNameOf(node.callee.object);
  return SURFACE.CORE_RECEIVERS.includes(receiver) ?
    node.callee.property.name : null;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

/**
 * Census the host: which core operations it calls, and whether it contains
 * anything that could decide membership, quorum or commit locally.
 * @return {Object}
 */
function hostConsensusSurfaceCensus() {
  const coreCalls = new Set();
  const suspects = [];
  for (const name of SURFACE.HOST_FILES) {
    const file = path.join(here, name);
    const raw = fs.readFileSync(file, SURFACE.UTF8);
    const source = stripComments(raw);
    const tree = parse(source, {ecmaVersion: 'latest', sourceType: 'module',
      loc: true});
    walk(tree, (node) => {
      const delegated = delegatedCoreCall(node);
      if (delegated) {
        coreCalls.add(delegated);
      }
      if (node.type === 'Identifier' &&
          SURFACE.FORBIDDEN_IDENTIFIERS.test(node.name)) {
        suspects.push({file: name, line: node.loc.start.line,
          kind: 'identifier', detail: node.name});
      }
    });
    source.split('\n').forEach((line, index) => {
      if (HALVING.test(line)) {
        suspects.push({file: name, line: index + 1, kind: 'halving',
          detail: line.trim().slice(0, 80)});
      }
    });
  }
  return {
    // Every consensus decision the host reaches, reached by asking the core.
    delegatedToCore: [...coreCalls].sort(),
    // Anything that looks like the host deciding for itself.
    localDecisionSuspects: suspects,
    decidesNothingLocally: suspects.length === 0,
  };
}

// --- what the host can possibly READ ----------------------------------------
//
// The stale-cache claim is that a Lagrange service-row cache cannot reach the
// core driver, because there is nothing for it to arrive through. The
// verifier accepted the claim but called the test of it weak: the caches were
// a constant nothing read, and the check was a regex over one parameter list.
//
// This is the structural form. Every module the driver pulls in - including
// the wasm-pack glue, which is where an ambient dependency would actually
// hide - is censused, and the whole set must be node builtins plus the fork's
// own files. A cache has no channel because no channel exists.
const AMBIENT = Object.freeze({
  FILES: Object.freeze(['forked-core-harness.js', 'core-scenarios.js',
    'raft-core/pkg/raft_wasm.js']),
  NODE_BUILTIN: /^(node:)?(fs|path|url|module|util|assert|crypto|buffer)$/u,
  // The fork's own test-side files. `restore-oracle.js` is the receipt's
  // local checks and imports nothing at all.
  OWN: /^(\.\/)?(forked-core-harness\.js|restore-oracle\.js|raft_wasm_bg\.wasm|raft-core\/pkg\/raft_wasm\.js)$/u,
  UTF8: 'utf8',
});

const MODULE_DECLARATION = new Set(['ImportDeclaration',
  'ExportAllDeclaration', 'ExportNamedDeclaration']);

function isRequireCall(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const callee = node.callee;
  return (callee?.type === 'Identifier' && callee.name === 'require') ||
    (callee?.type === 'MemberExpression' && callee.object?.name === 'require');
}

function moduleSourceOf(node) {
  if (MODULE_DECLARATION.has(node.type)) {
    return node.source?.value === undefined ? null :
      String(node.source.value);
  }
  if (node.type === 'ImportExpression') {
    return node.source?.value === undefined ? null :
      String(node.source.value);
  }
  if (isRequireCall(node) && node.arguments?.[0]?.value !== undefined) {
    return String(node.arguments[0].value);
  }
  return null;
}

function importSourcesOf(tree) {
  const sources = [];
  walk(tree, (node) => {
    const source = moduleSourceOf(node);
    if (source !== null) {
      sources.push(source);
    }
  });
  return sources;
}

/**
 * Every module the core driver and the wasm glue pull in, and whether any of
 * them is something other than a node builtin or the fork's own files.
 * @return {Object}
 */
function hostAmbientInputCensus() {
  const imports = {};
  const foreign = [];
  for (const name of AMBIENT.FILES) {
    const source = fs.readFileSync(path.join(here, name), AMBIENT.UTF8);
    const tree = parse(stripComments(source),
      {ecmaVersion: 'latest', sourceType: 'module', loc: true});
    const sources = [...new Set(importSourcesOf(tree))].sort();
    imports[name] = sources;
    for (const imported of sources) {
      if (!AMBIENT.NODE_BUILTIN.test(imported) &&
          !AMBIENT.OWN.test(imported)) {
        foreign.push({file: name, imported});
      }
    }
  }
  return {
    files: [...AMBIENT.FILES],
    imports,
    foreignImports: foreign,
    onlyBuiltinsAndTheGlue: foreign.length === 0,
  };
}

export {
  hostAmbientInputCensus,
  hostConsensusSurfaceCensus,
};
