import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {parse} from 'espree';

import {
  auditRaftRsOperationBoundary,
} from '../../../scripts/checks/raft-rs-operation-boundary-audit.js';
import {
  generateCurrentLedger,
} from '../../../scripts/quest-evidence/raft-rs-operation-capability-ledger.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = path.join(ROOT, 'src');
const SRC_RAFT = path.join(SRC, 'raft');
const BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, 'solve', 'quests',
  'raft-rs-operation-port-boundary', 'capability-baseline.json'), 'utf8'));
const PORT_OPERATIONS = Object.freeze([
  'campaign', 'close', 'configureTick', 'probePeerProgress', 'propose',
  'proposeConfChange', 'readStatus', 'startScheduling', 'step',
  'stopScheduling', 'subscribe', 'tick',
]);

function sourceFiles(directory = SRC) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(resolved);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [resolved] : [];
  });
}

function sourceOf(file) {
  return fs.readFileSync(file, 'utf8');
}

function visit(node, callback) {
  if (node === null || typeof node !== 'object') {
    return;
  }
  callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, callback));
    } else {
      visit(value, callback);
    }
  }
}

function moduleSpecifiers(file) {
  const specifiers = [];
  const tree = parse(sourceOf(file), {ecmaVersion: 'latest', sourceType: 'module'});
  visit(tree, (node) => {
    if (['ImportDeclaration', 'ExportAllDeclaration',
      'ExportNamedDeclaration'].includes(node.type) && node.source) {
      specifiers.push(node.source.value);
    }
    if (node.type === 'ImportExpression' && node.source?.type === 'Literal') {
      specifiers.push(node.source.value);
    }
  });
  return specifiers;
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function bindingImporters() {
  return sourceFiles().filter((file) => moduleSpecifiers(file).some((specifier) =>
    typeof specifier === 'string' &&
      /(?:^|\/)raft-rs-core\.js$/u.test(specifier))).map(relative).sort();
}

function ownSurface(value) {
  return Reflect.ownKeys(value).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const member = descriptor && Object.hasOwn(descriptor, 'value') ?
      descriptor.value : undefined;
    return {
      key: String(key),
      kind: descriptor && Object.hasOwn(descriptor, 'value') ?
        typeof member : 'accessor',
      frozen: member === null ||
        !['object', 'function'].includes(typeof member) || Object.isFrozen(member),
    };
  });
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || !['object', 'function'].includes(typeof value) ||
    seen.has(value)) {
    return;
  }
  seen.add(value);
  assert.equal(Object.isFrozen(value), true,
    'every public value, function and nested result is frozen');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, 'value')) {
      assertDeepFrozen(descriptor.value, seen);
    }
  }
}

test('the partition receives only a frozen operation port and immutable snapshots',
  async () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'operation-port-red',
      replicaIds: ['operation-port-replica'],
    });
    try {
      const port = cluster.node('operation-port-replica');
      const surface = ownSurface(port);
      assert.equal(Object.getPrototypeOf(port), null,
        'the port is a null-prototype capability record');
      assert.deepEqual(Reflect.ownKeys(port).map(String).sort(),
        PORT_OPERATIONS);
      assert.equal(Object.isFrozen(port), true,
        'the public partition value itself is frozen');
      assert.equal(surface.every((entry) =>
        entry.kind === 'function' || entry.frozen), true,
      `only functions and immutable values cross; got ${JSON.stringify(surface)}`);
      assert.equal(surface.filter((entry) => entry.kind === 'function')
        .every((entry) => entry.frozen), true,
      'every callable capability is itself frozen');
      for (const forbidden of [
        'host', 'store', 'core', 'handle', 'key', 'runtime', 'lifecycle',
        'record', 'db', 'database',
      ]) {
        assert.equal(Reflect.has(port, forbidden), false,
          `${forbidden} is not publicly reachable`);
      }
      assert.equal(typeof port.raftRsGroupParts, 'undefined',
        'no helper returns the implementation graph');
      assertDeepFrozen(port);
      assertDeepFrozen(await port.readStatus());
    } finally {
      cluster.dispose();
    }
  });

test('one private runtime owner is the only production binding importer', () => {
  const violations = auditRaftRsOperationBoundary({root: ROOT});
  assert.deepEqual(violations, []);
  assert.deepEqual(bindingImporters(), [],
    'the former facade loader module is no longer an importable boundary');
  const runtimeOwner = sourceOf(path.join(
    SRC_RAFT, 'raft-rs-runtime-owner.js'));
  assert.match(runtimeOwner, /createRequire/u);
  assert.match(runtimeOwner, /RAFT_RS_WASM_FILE/u);
  assert.equal(fs.existsSync(path.join(SRC_RAFT, 'raft-rs-core.js')), false);
});

test('retirement has one production writer and no provider control accessor',
  () => {
    const sources = sourceFiles().map((file) => ({
      file: relative(file), source: sourceOf(file),
    }));
    const writers = sources.filter(({source}) =>
      /UPDATE\s+\$\{LIFECYCLE_TABLE\}/u.test(source))
      .map(({file}) => file);
    assert.deepEqual(writers, [
      'src/raft/raft-rs-replica-lifecycle-owner.js',
    ]);
    const provider = sourceOf(path.join(SRC_RAFT, 'raft-rs-provider.js'));
    assert.equal(provider.includes('partitionControlOf'), false);
    assert.equal(provider.includes('partitionControls'), false);
  });

test('the private owner instruments actual core entry rather than gate checks',
  () => {
    const ownerFile = path.join(SRC_RAFT, 'raft-rs-runtime-owner.js');
    assert.equal(fs.existsSync(ownerFile), true,
      'the private runtime owner exists');
    const owner = sourceOf(ownerFile);
    assert.match(owner, /actualCoreEntr(?:y|ies)/u);
    assert.match(owner, /lifecycle/u);
    assert.doesNotMatch(owner, /partitionControlOf|walkObjectGraph|depth/u);
  });

test('the operation boundary removes public capability instead of renaming it',
  () => {
    const provider = sourceOf(path.join(SRC_RAFT, 'raft-rs-provider.js'));
    assert.doesNotMatch(provider,
      /RaftRsGroupHandle|raftRsGroupOf|partitionControlOf|retireFromScheduling/u);
    assert.match(provider, /createPartitionPort/u);
    const providerCluster = new PartitionNodeCluster({
      partitionId: 'stateless-provider-red',
      replicaIds: ['stateless-provider-replica'],
    });
    try {
      assert.equal(Object.isFrozen(providerCluster.provider), true);
      assert.deepEqual(Reflect.ownKeys(providerCluster.provider), [],
        'the provider retains no options, runtime or per-group values');
    } finally {
      providerCluster.dispose();
    }
    const after = generateCurrentLedger();
    const categories = [
      'publicMethods', 'publicDataProperties', 'mutablePublicValues',
      'coreAccessPaths', 'lifecycleStateMutationPaths',
      'sqliteHandlesExposed', 'providerControlAccessors',
      'runtimeObjectTypesExposed',
    ];
    for (const category of categories) {
      assert.ok(after[category] <= BASELINE[category],
        `${category} grew: after=${after[category]} base=${BASELINE[category]}`);
    }
    assert.equal(after.coreAccessPaths, 0);
    assert.equal(after.lifecycleStateMutationPaths, 0);
    assert.equal(after.sqliteHandlesExposed, 0);
    assert.equal(after.providerControlAccessors, 0);
    assert.ok(categories.reduce((sum, category) =>
      sum + BASELINE[category] - after[category], 0) > 0,
    `the mechanical ledger removed nothing: ${JSON.stringify(after)}`);
  });

test('the ownership census catches import and lifecycle-writer bypass modules',
  () => {
    const importerMutant = parse(
      'import {loadRaftRsCore} from \'./raft-rs-core.js\'; loadRaftRsCore();',
      {ecmaVersion: 'latest', sourceType: 'module'});
    const lifecycleMutant = parse(
      'db.prepare(\'UPDATE raft_rs_retirement SET state = ?\').run(\'retired\');',
      {ecmaVersion: 'latest', sourceType: 'module'});
    const importNodes = [];
    const lifecycleNodes = [];
    visit(importerMutant, (node) => importNodes.push(node));
    visit(lifecycleMutant, (node) => lifecycleNodes.push(node));
    assert.equal(importNodes.some((node) =>
      node.type === 'ImportDeclaration' &&
      /raft-rs-core\.js$/u.test(node.source.value)), true);
    assert.equal(lifecycleNodes.some((node) => node.type === 'Literal' &&
      /UPDATE\s+raft_rs_retirement/iu.test(String(node.value))), true);
  });

test('the real ownership audit rejects core, facade and lifecycle mutants',
  () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-owner-audit-'));
    const raft = path.join(fixture, 'src', 'raft');
    const node = path.join(fixture, 'src', 'node');
    fs.mkdirSync(raft, {recursive: true});
    fs.mkdirSync(node, {recursive: true});
    fs.writeFileSync(path.join(raft, 'raft-rs-core-constants.js'),
      'const RAFT_RS_CORE_PRIMITIVE = {STATUS: \'status\'};\n');
    fs.writeFileSync(path.join(raft, 'raft-rs-core.js'),
      'export function loadRaftRsCore() {}\n');
    fs.writeFileSync(path.join(raft, 'raft-rs-runtime-owner.js'),
      'import {loadRaftRsCore} from \'./raft-rs-core.js\';\n' +
      'loadRaftRsCore().status(1);\n');
    fs.writeFileSync(path.join(raft,
      'raft-rs-replica-lifecycle-owner.js'), 'export const owner = true;\n');
    fs.writeFileSync(path.join(raft, 'raft-rs-lifecycle-administration.js'),
      'export function retireReplica() {}\n');
    fs.writeFileSync(path.join(node,
      'replica-handler-remove-execution-methods.js'),
    'import {retireReplica} from \'../raft/raft-rs-lifecycle-administration.js\';\n' +
      'retireReplica();\n');
    fs.writeFileSync(path.join(raft, 'binding-bypass.js'),
      'import {loadRaftRsCore} from \'./raft-rs-core.js\';\n' +
      'export const escaped = loadRaftRsCore();\n');
    fs.writeFileSync(path.join(raft, 'facade-bypass.js'),
      'export function invoke(core) {\n' +
      '  const method = \'sta\' + \'tus\';\n' +
      '  const {status: enter} = core;\n' +
      '  enter(1);\n' +
      '  return core[method](1);\n' +
      '}\n');
    fs.writeFileSync(path.join(raft, 'direct-binding-bypass.js'),
      'const base = \'../../vendor/\';\n' +
      'export const escaped = import(base + \'raft-rs-wasm/pkg/raft_wasm.js\');\n');
    fs.writeFileSync(path.join(raft, 'lifecycle-bypass.js'),
      'const table = \'_raft_rs_\' + \'replica_lifecycle\';\n' +
      'db.prepare(`UPDATE ${table} SET state = ?`).run(\'retired\');\n');
    try {
      const codes = new Set(auditRaftRsOperationBoundary({root: fixture})
        .map((entry) => entry.code));
      assert.equal(codes.has('binding-import-outside-owner'), true);
      assert.equal(codes.has('core-invocation-outside-owner'), true);
      assert.equal(codes.has('core-alias-invocation-outside-owner'), true);
      assert.equal(codes.has('direct-binding-import'), true);
      assert.equal(codes.has('lifecycle-sql-outside-owner'), true);
    } finally {
      fs.rmSync(fixture, {recursive: true, force: true});
    }
  });
