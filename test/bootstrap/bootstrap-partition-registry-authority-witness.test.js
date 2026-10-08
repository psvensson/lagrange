/**
 * L0-only witness: production BootstrapService/BootstrapAPI registry objects
 * must not return a live PartitionService or its storage authority.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {withFoundingStamp} from
  '../partition/partition-founding-stamp.js';

const NODE_ID = 'bootstrap-registry-authority-node';
const PARTITION_ID = 'bootstrap-registry-authority-p1';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const TEST_TIMEOUT_MS = 30_000;
const MAX_TRAVERSAL_NODES = 2_000;
const DATA_DESCRIPTOR = 'value';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'error'});
}

async function waitForLeader(partition) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (partition.getRole() === 'leader') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('fixture PartitionService did not elect its single voter');
}

function enqueue(queue, value, pathName) {
  if (typeof value === 'object' && value !== null) {
    queue.push({value, pathName});
  }
}

function inspectReachableAuthority({
  roots,
  callbackRoots = [],
  targetService,
  targetStorage,
  maxNodes = MAX_TRAVERSAL_NODES,
}) {
  const queue = [];
  const seen = new Set();
  const matches = [];
  const getterErrors = [];
  const callbackErrors = [];
  const hasStorageTarget = typeof targetStorage === 'object' &&
    targetStorage !== null;
  const add = (value, pathName) => {
    if (value === targetService) matches.push({kind: 'live-service', pathName});
    if (hasStorageTarget && value === targetStorage) {
      matches.push({kind: 'live-storage', pathName});
    }
    enqueue(queue, value, pathName);
  };
  for (const root of roots) add(root.value, root.pathName);
  for (const callbackRoot of callbackRoots) {
    try {
      add(callbackRoot.callback(),
        `${callbackRoot.pathName}()`);
    } catch (error) {
      callbackErrors.push({
        pathName: callbackRoot.pathName,
        error: error?.message || String(error),
      });
    }
  }
  let visited = 0;
  while (queue.length > 0 && visited < maxNodes) {
    const current = queue.shift();
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    visited += 1;
    if (current.value instanceof Map) {
      for (const [key, value] of current.value.entries()) {
        add(value, `${current.pathName}.Map(${String(key)})`);
      }
    }
    let cursor = current.value;
    let prototypeDepth = 0;
    while (cursor && prototypeDepth < 2) {
      for (const key of Reflect.ownKeys(cursor)) {
        if (key === 'constructor') continue;
        const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
        const keyName = typeof key === 'symbol' ? key.toString() : key;
        const childPath = `${current.pathName}.${keyName}`;
        if (Object.hasOwn(descriptor, DATA_DESCRIPTOR)) {
          add(descriptor.value, childPath);
        } else if (typeof descriptor.get === 'function') {
          try {
            add(descriptor.get.call(current.value),
              `${childPath}<getter>`);
          } catch (error) {
            getterErrors.push({
              pathName: childPath,
              error: error?.message || String(error),
            });
          }
        }
      }
      cursor = Object.getPrototypeOf(cursor);
      prototypeDepth += 1;
    }
  }
  return Object.freeze({
    matches: Object.freeze(matches),
    getterErrors: Object.freeze(getterErrors),
    callbackErrors: Object.freeze(callbackErrors),
    exhausted: queue.length > 0,
    visited,
  });
}

function assertTraversalCertain(observations) {
  assert.equal(observations.some((entry) => entry.exhausted), false,
    'bounded traversal must finish rather than classify exhaustion as absence');
  assert.deepEqual(observations.flatMap((entry) => entry.callbackErrors), [],
    'provider failures must remain explicit rather than become absence');
  assert.deepEqual(observations.flatMap((entry) => entry.getterErrors), [],
    'inaccessible getters are uncertainty rather than authority absence');
}

test('production BootstrapService and BootstrapAPI registries do not return ' +
  'live partition authority', {timeout: TEST_TIMEOUT_MS}, async () => {
  initializeEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-registry-'));
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: 'bootstrap_registry_authority',
    tableName: 'bootstrap_registry_authority',
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: NODE_ID,
    dbPath: path.join(directory, `${REPLICA_ID}.db`),
    schema: 'CREATE TABLE bootstrap_registry_authority ' +
      '(id TEXT PRIMARY KEY, value TEXT)',
  }));
  const bootstrap = new BootstrapService({
    bootIncarnation: 1,
    nodeId: NODE_ID,
    nodeAddress: 'ws://127.0.0.1:19090',
  });
  let api = null;
  try {
    await partition.initialize();
    await waitForLeader(partition);
    assert.equal(partition.getRole(), 'leader',
      'ordinary named PartitionService role observation remains available');

    // Use the registry allocated and owned by the real BootstrapService. The
    // full bootstrap pipeline is intentionally not run; its many unrelated
    // singleton/network owners are outside this internal-encapsulation probe.
    bootstrap.partitionServices.set(REPLICA_ID, partition);
    api = new BootstrapAPI({
      bootstrapService: bootstrap,
      partitionServices: bootstrap.partitionServices,
      systemTableCache: new SystemTableCache(),
      seedNodeId: NODE_ID,
      seedNodeAddress: 'ws://127.0.0.1:19090',
    });
    const observations = [
      inspectReachableAuthority({
        roots: [{pathName: 'BootstrapService.partitionServices',
          value: bootstrap.partitionServices}],
        targetService: partition,
        targetStorage: partition.db,
      }),
      inspectReachableAuthority({
        roots: [{pathName: 'BootstrapAPI.partitionServices',
          value: api.partitionServices}],
        targetService: partition,
        targetStorage: partition.db,
      }),
      inspectReachableAuthority({
        roots: [],
        callbackRoots: [{
          pathName: 'BootstrapTopologySnapshotOwner.getPartitionServices',
          callback: () => api.bootstrapTopologySnapshotOwner
            .getPartitionServices(),
        }],
        targetService: partition,
        targetStorage: partition.db,
      }),
    ];
    assertTraversalCertain(observations);
    assert.deepEqual(observations.flatMap((entry) => entry.matches), [],
      'external registry/provider values must not return live authority');
  } finally {
    await api?.shutdown?.();
    await partition.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('descriptor-aware detector catches aliases and accepts closed values', () => {
  const storage = Object.freeze({prepare() {}});
  const service = Object.freeze({storage});
  const computedKey = ['hidden', 'authority'].join('_');
  const aliases = {
    renamedField: service,
    get getterAlias() {
      return service;
    },
    [computedKey]: service,
    mapAlias: new Map([['replica', service]]),
  };
  const aliasObservation = inspectReachableAuthority({
    roots: [{pathName: 'aliases', value: aliases}],
    callbackRoots: [{pathName: 'provider', callback: () => service}],
    targetService: service,
    targetStorage: storage,
  });
  assert.equal(aliasObservation.exhausted, false);
  assert.equal(aliasObservation.matches.some((entry) =>
    entry.pathName.includes('renamedField')), true);
  assert.equal(aliasObservation.matches.some((entry) =>
    entry.pathName.includes('getterAlias')), true);
  assert.equal(aliasObservation.matches.some((entry) =>
    entry.pathName.includes(computedKey)), true);
  assert.equal(aliasObservation.matches.some((entry) =>
    entry.pathName.includes('Map(replica)')), true);
  assert.equal(aliasObservation.matches.some((entry) =>
    entry.pathName.startsWith('provider()')), true);

  const getterFailure = {};
  Object.defineProperty(getterFailure, 'unreadable', {
    enumerable: true,
    get() {
      throw new Error('classified getter failure');
    },
  });
  const failedObservation = inspectReachableAuthority({
    roots: [{pathName: 'throwing', value: getterFailure}],
    targetService: service,
    targetStorage: storage,
  });
  assert.equal(failedObservation.getterErrors.length, 1,
    'an unreadable getter is explicit uncertainty, never authority absence');
  assert.throws(() => assertTraversalCertain([failedObservation]),
    /inaccessible getters are uncertainty/,
    'the same certainty assertion used by production rejects getter failure');

  const absentStorageObservation = inspectReachableAuthority({
    roots: [{
      pathName: 'deexported-storage',
      value: Object.freeze({replicaId: REPLICA_ID, optional: undefined}),
    }],
    targetService: service,
    targetStorage: undefined,
  });
  assert.equal(absentStorageObservation.matches.some((entry) =>
    entry.kind === 'live-storage'), false,
  'an absent storage export never matches unrelated undefined properties');

  const immutableObservation = inspectReachableAuthority({
    roots: [{
      pathName: 'closed',
      value: Object.freeze({
        replicaId: REPLICA_ID,
        role: 'leader',
      }),
    }],
    targetService: service,
    targetStorage: storage,
  });
  assert.equal(immutableObservation.exhausted, false);
  assert.deepEqual(immutableObservation.matches, [],
    'a frozen value-only observation is closed');
  assert.deepEqual(immutableObservation.getterErrors, []);
});
