/**
 * Unit tests for MessageGroupService.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createTestTransport,
  registerMessageGroupServiceLifecycleHooks,
  setTestPortBase,
} from './message-group-service-test-support.js';
import {
  MessageGroupOperationLedger,
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
} from '../../src/message-group/constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  TABLES,
} from '../../src/constants/index.js';
import LifeRaft from '@markwylde/liferaft';
import {
  RAFT_EVENT,
} from '../../src/raft/constants.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/control-plane/pressure-governor.js';

setTestPortBase(25000);
registerMessageGroupServiceLifecycleHooks();

test('MessageGroupService - querySystemCache returns data', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    await service.subscribeToCDC('nodes');

    // Insert test data
    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-1',
      status: 'active',
    });
    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-2',
      status: 'inactive',
    });

    // Query by key
    const byKey = await service.querySystemCache('nodes', {key: 'node-1'});
    t.ok(byKey, 'Should find by key');
    t.equal(byKey.id, 'node-1', 'Should return correct record');

    // Query with predicate
    const filtered = await service.querySystemCache('nodes', {
      predicate: (r) => r.status === 'active',
    });
    t.equal(filtered.length, 1, 'Should filter correctly');

    // Query all
    const all = await service.querySystemCache('nodes');
    t.equal(all.length, 2, 'Should return all records');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - getReadOnlyCache returns wrapper', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    const cache = service.getReadOnlyCache();
    t.ok(cache, 'Should return cache');

    // Verify it's read-only
    t.throws(
      () => cache.applySystemTableChange('nodes', 'INSERT', {id: 'test'}),
      /not available on read-only cache/,
      'Should block write operations',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - single replica becomes leader', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1'],
      peerAddresses: [`${nodeId}/message-group/mg-1-r1`],
      transport: router,
    });

    let leaderEvent = null;
    service.on('leaderElected', (event) => {
      leaderEvent = event;
    });

    await service.initialize();

    // Single replica becomes leader immediately - no need to wait
    t.equal(service.isLeaderReplica(), true, 'Should become leader');
    t.equal(service.getLeaderId(), 'mg-1-r1', 'Should be own leader');
    t.equal(
      service.raft?.state,
      LifeRaft.LEADER,
      'single-replica initialization should promote the live raft owner to leader immediately',
    );
    t.equal(
      service.isCurrentRaftLeader(),
      true,
      'single-replica initialization should expose live raft leadership through the shared owner path',
    );
    t.ok(leaderEvent, 'Should emit leaderElected event');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - single-replica initialization fails closed ' +
  'without raft change()', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-missing-change',
      replicaId: 'mg-missing-change-r1',
      nodeId,
      replicaIds: ['mg-missing-change-r1'],
      peerAddresses: [`${nodeId}/message-group/mg-missing-change-r1`],
      transport: router,
    });
    const originalReconcileRaftPeersFromCache =
      service.reconcileRaftPeersFromCache.bind(service);
    service.reconcileRaftPeersFromCache = function(...args) {
      const result = originalReconcileRaftPeersFromCache(...args);
      if (this.raft) {
        this.raft.change = undefined;
        this.raft.end = () => {};
      }
      return result;
    };

    await t.rejects(
      service.initialize(),
      /single-replica leadership requires raft\.change/,
      'single-replica initialization should fail instead of mutating leader state without the live raft owner',
    );

    await service.shutdown().catch(() => {});
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - leader activation dedupes same-term flaps', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-leader-gate',
      replicaId: 'mg-leader-gate-r1',
      replicaIds: ['mg-leader-gate-r1', 'mg-leader-gate-r2'],
      peerAddresses: [
        `${nodeId}/message-group/mg-leader-gate-r1`,
        `${nodeId}/message-group/mg-leader-gate-r2`,
      ],
      nodeId,
      transport: router,
      deferElection: true,
      leaderActivationStabilizationMs: 20,
    });

    await service.initialize();
    await service.subscribeToCDC('nodes');
    await service.subscribeToCDC('services');

    let rebalancerLeadershipUpdates = 0;
    let cdcResubscribeCalls = 0;
    let leaderEvents = 0;
    const originalSubscribeToCDC = service.subscribeToCDC.bind(service);
    service.updateRebalancerLeadership = () => {
      rebalancerLeadershipUpdates += 1;
    };
    service.subscribeToCDC = async (tableName) => {
      cdcResubscribeCalls += 1;
      return originalSubscribeToCDC(tableName);
    };
    service.on('leaderElected', () => {
      leaderEvents += 1;
    });

    service.raft.term = 11;
    service.raft.emit(RAFT_EVENT.LEADER);
    service.raft.emit(RAFT_EVENT.LEADER);
    service.raft.emit(RAFT_EVENT.LEADER);

    await new Promise((resolve) => setTimeout(resolve, 80));

    t.equal(
      rebalancerLeadershipUpdates,
      1,
      'leader-owned background work should activate once per stable term',
    );
    t.equal(
      cdcResubscribeCalls,
      2,
      'existing CDC subscriptions should be replayed once per stable term',
    );
    t.equal(leaderEvents, 1, 'leaderElected should emit once per stable term');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - getStatus returns complete status', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    const status = service.getStatus();

    t.equal(status.groupId, 'mg-1', 'Should have groupId');
    t.equal(status.replicaId, 'mg-1-r1', 'Should have replicaId');
    t.equal(status.nodeId, nodeId, 'Should have nodeId');
    t.ok(status.role, 'Should have role');
    t.equal(typeof status.term, 'number', 'Should have term');
    t.equal(typeof status.logLength, 'number', 'Should have logLength');
    t.equal(status.initialized, true, 'Should be initialized');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - rebalancer coordinator refresh uses owner sync path',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-sync-owner',
        replicaId: 'mg-sync-owner-r1',
        nodeId,
        transport: router,
      });
      const coordinator = {
        id: 'coordinator-b',
      };
      let setCoordinatorCalls = 0;
      const rebalancer = {
        setRebalanceCoordinator(value) {
          setCoordinatorCalls += 1;
          this.rebalanceCoordinator = value;
        },
        setLeader() {},
      };

      service.rebalanceCoordinator = coordinator;
      service.cdcIntegrationService = {sqlQueryEngine: {}};
      service.tablePolicyService = {};
      service.rebalancer = rebalancer;
      service.isLeaderReplica = () => true;

      service.maybeInitializeRebalancer();

      t.equal(
        setCoordinatorCalls,
        1,
        'should route coordinator refresh through setRebalanceCoordinator',
      );
      t.equal(
        rebalancer.rebalanceCoordinator,
        coordinator,
        'should set the refreshed coordinator on rebalancer',
      );
    } finally {
      await cleanup();
    }
  });

test('MessageGroupService routes forward-topology cache repair through the ' +
  'gateway instead of mutating the cache directly', async (t) => {
  const {router, cleanup} = await createTestTransport();
  try {
    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'node-a', autoTransitionLifecycle: false});
    const cache = {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
      applySystemTableChange() {
        throw new Error('message-group repair must not mutate cache directly');
      },
      on() {},
      off() {},
    };
    nodeService.setSystemCacheProxy(cache);

    const repairCalls = [];
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'node-a',
      replicaIds: ['mg-1-r1'],
      transport: router,
      controlPlaneSystemTableGateway: {
        reconcileAuthoritativeCacheRows(tableName, rows, options) {
          repairCalls.push({tableName, rows, options});
          return Promise.resolve({success: true, mutationCount: 1});
        },
        setCdcIntegrationService() {},
        setSqlQueryEngine() {},
        setSystemTableCache() {},
        setMessageRouter() {},
      },
    });

    const repairedRowCount = await service.applyAuthoritativeForwardTopologyRows(
      TABLES.MESSAGE_GROUPS,
      [{
        [COLUMN.GROUP_ID]: 'mg-1',
        leader_node_id: 'node-a',
      }],
    );

    t.equal(repairedRowCount, 1, 'gateway-provided repair count should propagate');
    t.equal(repairCalls.length, 1, 'forward-topology repair should delegate once');
    t.equal(
      repairCalls[0].options.deleteMissing,
      false,
      'forward-topology refresh should not delete unrelated cached rows',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - shutdown cleans up', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let shutdownEvent = null;
    service.on('shutdown', (event) => {
      shutdownEvent = event;
    });

    await service.shutdown();

    t.equal(service.initialized, false, 'Should not be initialized');
    t.ok(shutdownEvent, 'Should emit shutdown event');
    t.equal(shutdownEvent.groupId, 'mg-1', 'Event should have groupId');
  } finally {
    await cleanup();
  }
});

test('MessageGroupOperationLedger - appendEntry adds entries', async (t) => {
  const storage = new MessageGroupOperationLedger();

  const entry1 = storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  const entry2 = storage.appendEntry({type: 'MESSAGE', data: 'test2'});

  t.equal(entry1.index, 1, 'First entry should have index 1');
  t.equal(entry2.index, 2, 'Second entry should have index 2');
  t.equal(storage.getLogLength(), 2, 'Should have 2 entries');
});

test('MessageGroupOperationLedger - retains a bounded rolling window', async (t) => {
  const storage = new MessageGroupOperationLedger({maxEntries: 2});

  const entry1 = storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  const entry2 = storage.appendEntry({type: 'MESSAGE', data: 'test2'});
  const entry3 = storage.appendEntry({type: 'MESSAGE', data: 'test3'});

  t.equal(storage.getLogLength(), 2, 'Should retain only the bounded number of entries');
  t.equal(storage.getEntry(entry1.index), null, 'Old trimmed entries should no longer be addressable');
  t.equal(storage.getEntry(entry2.index)?.data?.data, 'test2', 'Should retain newer entries');
  t.equal(storage.getLastEntry()?.index, entry3.index, 'Newest entry should retain its monotonic index');
});

test('MessageGroupOperationLedger - getEntriesFrom returns entries', async (t) => {
  const storage = new MessageGroupOperationLedger();

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});
  storage.appendEntry({type: 'MESSAGE', data: 'test3'});

  const fromStart = storage.getEntriesFrom(1);
  t.equal(fromStart.length, 3, 'Should return all entries from start');

  const fromMiddle = storage.getEntriesFrom(2);
  t.equal(fromMiddle.length, 2, 'Should return entries from index 2');
  t.equal(fromMiddle[0].data.data, 'test2', 'First should be test2');
});

test('MessageGroupOperationLedger - getLastEntry returns last', async (t) => {
  const storage = new MessageGroupOperationLedger();

  t.equal(storage.getLastEntry(), null, 'Should return null when empty');

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});

  const last = storage.getLastEntry();
  t.equal(last.data.data, 'test2', 'Should return last entry');
});

test('MessageGroupOperationLedger - truncateFrom removes entries', async (t) => {
  const storage = new MessageGroupOperationLedger();

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});
  storage.appendEntry({type: 'MESSAGE', data: 'test3'});

  storage.truncateFrom(2);

  t.equal(storage.getLogLength(), 1, 'Should have 1 entry after truncate');
  t.equal(storage.getLastEntry().data.data, 'test1', 'Should keep first entry');
});
