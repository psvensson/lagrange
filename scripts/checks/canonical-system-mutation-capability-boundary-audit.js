#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {parse} from 'espree';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE =
  'solve/quests/canonical-system-mutation-capability-boundary/capability-baseline.json';
const SOURCE_ROOTS = Object.freeze(['src/partition']);
const EXTRA_FILES = Object.freeze([
  'src/bootstrap/bootstrap-service.js',
  'src/bootstrap/node-joining-publication-activation.js',
  'src/bootstrap/owners/bootstrap-topology-snapshot-owner-authoritative-rows.js',
  'src/bootstrap/shared/partition-service-activation.js',
  'src/bootstrap/shared/snapshot-catchup-wiring.js',
  'src/cdc/cdc-integration-service-local-system-table-routing.js',
  'src/node/replica-handler-committed-membership-methods.js',
  'src/node/replica-handler-membership-methods.js',
  'src/node/replica-transport-handler-identity.js',
  'src/query/sql-query-engine-instance-initializer.js',
]);
const CATEGORY_NAMES = Object.freeze({
  db: 'raw-database',
  DURABLE_STORAGE: 'raw-database',
  raft: 'raw-consensus-port',
  propose: 'raw-consensus-port',
  createOperationPort: 'raw-consensus-port',
  proposalQueue: 'mutable-proposal-state',
  pendingWriteOutcomes: 'mutable-proposal-state',
  pendingRequestTracker: 'mutable-proposal-state',
  applyCommittedEntry: 'direct-committed-application',
  APPLY_COMMITTED_ENTRY: 'direct-committed-application',
  executeLocalQuery: 'direct-local-sql',
  transportHandler: 'callable-transport-handler',
  handleTransportMessage: 'callable-transport-handler',
  cdcGenerator: 'cdc-owner-backreference',
  syncCDCGeneratorDependencies: 'cdc-owner-backreference',
  cdcDelivery: 'cdc-owner-backreference',
  rawService: 'service-backreference',
  partitionService: 'service-backreference',
  openSplitSnapshotDatabase: 'raw-snapshot-database',
});
const AUDITED_SUFFIX = '.js';

function listJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listJavaScriptFiles(absolute));
    if (entry.isFile() && entry.name.endsWith(AUDITED_SUFFIX)) {
      result.push(absolute);
    }
  }
  return result;
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((entry) => walk(entry, visit));
    else walk(value, visit);
  }
}

function stringConstants(tree) {
  const constants = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    walk(tree, (node) => {
      if (node.type !== 'VariableDeclarator' ||
          node.id?.type !== 'Identifier' || constants.has(node.id.name)) return;
      const value = literalValue(node.init, constants);
      if (typeof value === 'string') {
        constants.set(node.id.name, value);
        changed = true;
      }
    });
  }
  return constants;
}

function literalValue(node, constants) {
  if (node?.type === 'Literal') return node.value;
  if (node?.type === 'Identifier') return constants.get(node.name) ?? null;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? null;
  }
  return null;
}

function propertyName(node, constants) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  return literalValue(node, constants);
}

function candidateNames(node, constants) {
  if (node.type === 'MemberExpression') {
    return [node.computed ? literalValue(node.property, constants) :
      propertyName(node.property, constants)];
  }
  if (node.type === 'MethodDefinition' || node.type === 'Property') {
    return [node.computed ? literalValue(node.key, constants) :
      propertyName(node.key, constants)];
  }
  if (node.type === 'VariableDeclarator' && node.id?.type === 'ObjectPattern') {
    return node.id.properties.map((entry) => propertyName(entry.key, constants));
  }
  return [];
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function auditFiles(root) {
  const files = SOURCE_ROOTS.flatMap((entry) =>
    listJavaScriptFiles(path.join(root, entry)));
  for (const entry of EXTRA_FILES) {
    const absolute = path.join(root, entry);
    if (fs.existsSync(absolute)) files.push(absolute);
  }
  return [...new Set(files)].sort();
}

function auditCanonicalSystemMutationCapabilityBoundary({root = ROOT} = {}) {
  const violations = [];
  for (const file of auditFiles(root)) {
    const source = fs.readFileSync(file, 'utf8');
    const tree = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      loc: true,
    });
    const constants = stringConstants(tree);
    walk(tree, (node) => {
      for (const name of candidateNames(node, constants)) {
        const category = Object.hasOwn(CATEGORY_NAMES, name) ?
          CATEGORY_NAMES[name] : null;
        if (!category) continue;
        violations.push({
          category,
          file: relative(root, file),
          line: node.loc?.start?.line ?? null,
          name,
        });
      }
    });
  }
  return violations.sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.category.localeCompare(right.category) ||
    left.name.localeCompare(right.name) ||
    left.line - right.line);
}

function capabilityMaxima(violations) {
  const maxima = {};
  for (const violation of violations) {
    const key = `${violation.file}#${violation.category}#${violation.name}`;
    maxima[key] = (maxima[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(maxima).sort());
}

function checkAgainstBaseline(root, violations) {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'));
  const actual = capabilityMaxima(violations);
  const excess = [];
  for (const [key, count] of Object.entries(actual)) {
    const maximum = baseline.maxima[key];
    if (!Number.isInteger(maximum) || count > maximum) {
      excess.push({key, count, maximum: maximum ?? null});
    }
  }
  return {
    actualCount: violations.length,
    baselineCount: baseline.total,
    excess,
    passed: violations.length <= baseline.total && excess.length === 0,
  };
}

function parseRoot(argv) {
  const index = argv.indexOf('--root');
  return index === -1 ? ROOT : path.resolve(argv[index + 1]);
}

function runCli() {
  const root = parseRoot(process.argv.slice(2));
  const violations = auditCanonicalSystemMutationCapabilityBoundary({root});
  if (process.argv.includes('--emit-baseline')) {
    process.stdout.write(`${JSON.stringify({
      baseCommit: '82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af',
      generator:
        'scripts/checks/canonical-system-mutation-capability-boundary-audit.js',
      scope: 'first partition L1 capability surface',
      total: violations.length,
      maxima: capabilityMaxima(violations),
    }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes('--metric')) {
    process.stdout.write(`${violations.length}\n`);
    return;
  }
  const result = checkAgainstBaseline(root, violations);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.passed) process.exitCode = 1;
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runCli();

export {
  auditCanonicalSystemMutationCapabilityBoundary,
  capabilityMaxima,
  checkAgainstBaseline,
};
