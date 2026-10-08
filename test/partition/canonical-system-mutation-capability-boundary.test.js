/**
 * Red control for the production PartitionService capability graph.
 * The higher Quest closes these aliases without reopening the frozen
 * operation-port boundary.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const TEST_NAME =
  'production PartitionService object graph exposes no raw mutation authority';
const OBJECT_GRAPH_MAX_DEPTH = 8;
const OBJECT_GRAPH_MAX_NODES = 500;
const OUTSTANDING_PRODUCTION_ROOTS = Object.freeze([
  'actual BootstrapService.partitionServices registration',
  'actual BootstrapAPI.partitionServices registration',
  'actual ReplicaHandler.localServices and local replica registration',
  'actual CDC localPartitionServices and partitionServicesProvider wiring',
  'actual SQLQueryEngine partitionServicesProvider wiring',
  'actual initialization, write, CDC, transaction, split, restart callbacks',
  'file-backed split snapshot returned authority',
]);
const RAW_CALLABLE_NAMES = new Set([
  'applyCommittedEntry',
  'createOperationPort',
  'executeLocalQuery',
  'handleTransportMessage',
  'transportHandler',
]);

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'boundary-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createProductionPartition() {
  return new PartitionService(withFoundingStamp({
    partitionId: 'boundary-table-p1',
    tableId: 'boundary-table',
    tableName: 'boundary_table',
    replicaId: 'boundary-table-p1-r1',
    replicaIds: ['boundary-table-p1-r1'],
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
    dbPath: ':memory:',
    suppressLifecycleLogs: true,
  }));
}

function isObject(value) {
  return value !== null &&
    (typeof value === 'object' || typeof value === 'function');
}

function inspectNamedAuthority(violations, path, name, value) {
  if (typeof value?.prepare === 'function' ||
      typeof value?.exec === 'function') {
    if (typeof value.prepare === 'function') violations.push(`${path}.prepare`);
    if (typeof value.exec === 'function') violations.push(`${path}.exec`);
  }
  if (typeof value?.propose === 'function') {
    violations.push(`${path}.propose`);
  }
  if ((name === 'proposalQueue' ||
       value?.constructor?.name === 'ProposalQueue') &&
      value !== undefined && value !== null) {
    violations.push(path);
  }
  if (name === 'pendingWriteOutcomes' && value instanceof Map) {
    violations.push(path);
  }
  if (RAW_CALLABLE_NAMES.has(name) && typeof value === 'function') {
    violations.push(path);
  }
  if (name === 'owner' && path.includes('.cdcDelivery.')) {
    violations.push(path);
  }
}

function walkObjectGraph(rootPath, rootValue, violations) {
  const visited = new Set();
  const queue = [{path: rootPath, value: rootValue, depth: 0}];
  let inspected = 0;
  while (queue.length > 0 && inspected < OBJECT_GRAPH_MAX_NODES) {
    const current = queue.shift();
    if (!isObject(current.value) || visited.has(current.value)) continue;
    visited.add(current.value);
    inspected += 1;

    if (current.value instanceof Map) {
      for (const [key, value] of current.value) {
        queue.push({
          path: `${current.path}.get(${JSON.stringify(key)})`,
          value,
          depth: current.depth + 1,
        });
      }
    }
    if (current.depth >= OBJECT_GRAPH_MAX_DEPTH) continue;

    let owner = current.value;
    let prototypeDepth = 0;
    while (owner && prototypeDepth <= OBJECT_GRAPH_MAX_DEPTH) {
      const ownerPath = prototypeDepth === 0 ? current.path :
        `${current.path}.<prototype:${owner.constructor?.name || 'unknown'}>`;
      for (const name of Reflect.ownKeys(owner)) {
        const descriptor = Object.getOwnPropertyDescriptor(owner, name);
        if (!descriptor) continue;
        const displayName = typeof name === 'symbol' ? `[${String(name)}]` : name;
        let value;
        if ('value' in descriptor) {
          value = descriptor.value;
        } else if (typeof name === 'string' &&
          ['db', 'raft', 'proposalQueue', 'pendingWriteOutcomes']
            .includes(name)) {
          value = Reflect.get(current.value, name);
        } else {
          continue;
        }
        const path = `${ownerPath}.${displayName}`;
        inspectNamedAuthority(violations, path, name, value);
        if (prototypeDepth === 0 && isObject(value)) {
          queue.push({path, value, depth: current.depth + 1});
        }
      }
      if (typeof current.value === 'function') break;
      owner = Object.getPrototypeOf(owner);
      prototypeDepth += 1;
    }
  }
}

function inspectReturnedAliases(service, rootPath, violations) {
  if (typeof service.syncCDCGeneratorDependencies === 'function') {
    const cdcGenerator = service.syncCDCGeneratorDependencies();
    if (typeof cdcGenerator?.db?.prepare === 'function') {
      violations.push(`${rootPath}.syncCDCGeneratorDependencies().db.prepare`);
    }
  }
  if (typeof service.openSplitSnapshotDatabase === 'function') {
    const splitSnapshot = service.openSplitSnapshotDatabase();
    try {
      if (typeof splitSnapshot?.prepare === 'function') {
        violations.push(`${rootPath}.openSplitSnapshotDatabase().prepare`);
      }
    } finally {
      splitSnapshot?.close?.();
    }
  }
}

function collectRawAuthorityPaths(roots) {
  const violations = [];
  for (const root of roots) {
    const value = typeof root.resolve === 'function' ?
      root.resolve() : root.value;
    walkObjectGraph(root.path, value, violations);
    if (root.inspectReturnedAliases === true) {
      inspectReturnedAliases(value, root.path, violations);
    }
  }
  return [...new Set(violations)].sort();
}

test('capability graph detector accepts closure and rejects independent aliases',
  async (t) => {
    t.same(collectRawAuthorityPaths([{path: 'closed', value: {}}]), [],
      'an absent/de-exported surface is accepted');
    const mutants = [
      ['raw DB', {db: {prepare() {}, exec() {}}}, 'mutant.db.prepare'],
      ['raw proposal', {raft: {propose() {}}}, 'mutant.raft.propose'],
      ['mutable queue', {proposalQueue: {}}, 'mutant.proposalQueue'],
      ['copied apply', {applyCommittedEntry() {}},
        'mutant.applyCommittedEntry'],
      ['CDC returned DB', {
        syncCDCGeneratorDependencies() {
          return {db: {prepare() {}}};
        },
      }, 'mutant.syncCDCGeneratorDependencies().db.prepare'],
      ['snapshot returned prepare', {
        openSplitSnapshotDatabase() {
          return {prepare() {}, close() {}};
        },
      }, 'mutant.openSplitSnapshotDatabase().prepare'],
      ['Map value alias', new Map([['p1', {raft: {propose() {}}}]]),
        'mutant.get("p1").raft.propose'],
      ['renamed database alias', {storageHandle: {prepare() {}, exec() {}}},
        'mutant.storageHandle.prepare'],
      ['Symbol database alias', {
        [Symbol.for('storage')]: {prepare() {}, exec() {}},
      }, 'mutant.[Symbol(storage)].prepare'],
      ['inherited database getter', Object.create(Object.defineProperty({},
        'db', {get: () => ({prepare() {}, exec() {}})})),
      'mutant.<prototype:Object>.db.prepare'],
    ];
    for (const [label, value, expected] of mutants) {
      const actual = collectRawAuthorityPaths([{
        path: 'mutant',
        value,
        inspectReturnedAliases: true,
      }]);
      t.ok(actual.includes(expected), `${label} mutant is detected`);
    }
  });

test(TEST_NAME, async (t) => {
  const service = createProductionPartition();
  await service.initialize();
  try {
    let eventReceiver = null;
    service.once('boundary-object-graph-receiver', function() {
      eventReceiver = this;
    });
    service.emit('boundary-object-graph-receiver');
    const providerMap = new Map([[service.replicaId, service]]);
    t.same(
      collectRawAuthorityPaths([
        {path: 'service', value: service, inspectReturnedAliases: true},
        {path: 'shape.bootstrap.partitionServices', value: providerMap},
        {path: 'shape.replicaHandler.localServices', value: providerMap},
        {
          path: 'shape.cdc.partitionServicesProvider()',
          resolve: () => providerMap,
        },
        {
          path: 'shape.sqlQueryEngine.partitionServicesProvider()',
          resolve: () => providerMap,
        },
        {path: 'syntheticEventListener.this', value: eventReceiver},
      ]),
      [],
      'production callers receive no raw proposal, apply, DB, queue, ' +
        'snapshot, CDC, or transport authority',
    );
    t.same(
      OUTSTANDING_PRODUCTION_ROOTS,
      [],
      'every production provider and real lifecycle callback recipe is covered',
    );
  } finally {
    await service.shutdown();
  }
});
