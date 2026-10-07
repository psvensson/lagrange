import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';

class MemoryRouter {
  constructor() {
    this.handlers = new Map();
  }
  async initialize() {}
  async shutdown() {
    this.handlers.clear();
  }
  setServiceNodeResolver() {}
  register(address, handler) {
    this.handlers.set(address, handler);
  }
  unregister(address) {
    this.handlers.delete(address);
  }
  async deliver(address, envelope) {
    const handler = this.handlers.get(address);
    if (!handler) return {acknowledged: false, noHandler: true};
    return handler(envelope);
  }
}

function emptyCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    onCacheChange() {},
    offCacheChange() {},
  };
}

function waitFor(predicate, boundMs = 2000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const poll = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - start >= boundMs) return resolve(predicate());
      setTimeout(poll, 10);
    };
    poll();
  });
}

test('mg-1 survives physical seed storage loss from two distinct off-seed voters', async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'node-seed'}});
  LoggingService.getInstance().initialize({level: 'error'});
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-mg-seedloss-red-'));
  const seedStorage = path.join(root, 'node-seed');
  const nodeBStorage = path.join(root, 'node-b');
  const nodeCStorage = path.join(root, 'node-c');
  fs.mkdirSync(seedStorage, {recursive: true});
  fs.mkdirSync(nodeBStorage, {recursive: true});
  fs.mkdirSync(nodeCStorage, {recursive: true});
  const router = new MemoryRouter();
  const cache = emptyCache();
  const nodeService = {
    getSystemTableCache: () => cache,
    getReadOnlySystemTableCache: () => cache,
  };
  const founders = ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'];
  const peerAddresses = founders.map((replicaId) =>
    `node-seed/message-group/${replicaId}`);
  const replicas = [];
  try {
    for (const replicaId of founders) {
      const service = new MessageGroupService({
        groupId: 'mg-1', replicaId, nodeId: 'node-seed',
        replicaIds: founders, peerAddresses, transport: router, nodeService,
        dbPath: path.join(seedStorage, `${replicaId}.db`),
        publishRoleMetadata: false,
        publishLeaderNodeMetadata: false,
      });
      router.register(service.unifiedAddress,
        (envelope) => service.receiveMessage(envelope));
      await service.initialize();
      replicas.push(service);
    }
    assert.equal(await waitFor(() => replicas.some((replica) =>
      replica.isLeaderReplica())), true,
    'setup: three real raft-rs message-group voters on seed elect');
    assert.deepEqual(fs.readdirSync(nodeBStorage), [],
      'base has no off-seed B4 artifact');
    assert.deepEqual(fs.readdirSync(nodeCStorage), [],
      'base has no off-seed C5 artifact');

    for (const replica of replicas) {
      router.unregister(replica.unifiedAddress);
      await replica.shutdown();
    }
    replicas.length = 0;
    fs.renameSync(seedStorage, `${seedStorage}.unavailable`);

    const b4 = path.join(nodeBStorage, 'mg-1-r4.db');
    const c5 = path.join(nodeCStorage, 'mg-1-r5.db');
    assert.equal(fs.existsSync(b4) && fs.existsSync(c5), true,
      'two serial production REPLACEs must leave real voter state on distinct off-seed storage before seed loss');
  } finally {
    for (const replica of replicas) await replica.shutdown().catch(() => {});
    await router.shutdown();
    fs.rmSync(root, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
