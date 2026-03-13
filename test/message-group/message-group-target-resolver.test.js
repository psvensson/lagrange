import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  resolveMessageGroupForwardServiceFromCache,
  resolveMessageGroupLeaderServiceFromCache,
  resolveMessageGroupTargetAddressFromCache,
} from '../../src/message-group/message-group-target-resolver.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

function addMessageGroupService(cache, row) {
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, row);
}

function addNode(cache, row) {
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, row);
}

test('message-group target resolver prefers explicit services leader over stale message_groups leader node',
  async (t) => {
    const cache = new SystemTableCache();

    cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, CDC_OPERATION.UPSERT, {
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.LEADER_NODE_ID]: 'node-b',
    });

    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r2',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-a/message-group/mg-1-r2',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    });
    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r3',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'node-b',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-b/message-group/mg-1-r3',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
    });

    const targetAddress =
      resolveMessageGroupTargetAddressFromCache(cache, 'mg-1');
    const forwardService =
      resolveMessageGroupForwardServiceFromCache(cache, 'mg-1');
    const leaderService =
      resolveMessageGroupLeaderServiceFromCache(cache, 'mg-1');

    t.equal(
      targetAddress,
      'node-a/message-group/mg-1-r2',
      'target resolution should prefer an explicit services leader over stale canonical group leader metadata',
    );
    t.equal(
      forwardService?.[COLUMN.SERVICE_ID],
      'mg-1-r2',
      'forward service resolution should prefer an explicit services leader over stale canonical group leader metadata',
    );
    t.equal(
      leaderService?.[COLUMN.SERVICE_ID],
      'mg-1-r2',
      'leader service resolution should prefer an explicit services leader over stale canonical group leader metadata',
    );
  });

test('message-group target resolver falls back to canonical leader node when no explicit leader row exists',
  async (t) => {
    const cache = new SystemTableCache();

    cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, CDC_OPERATION.UPSERT, {
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.LEADER_NODE_ID]: 'node-b',
    });

    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r2',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-a/message-group/mg-1-r2',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
      [COLUMN.UPDATED_AT]: 200,
    });
    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r3',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'node-b',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-b/message-group/mg-1-r3',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
      [COLUMN.UPDATED_AT]: 100,
    });

    const targetAddress =
      resolveMessageGroupTargetAddressFromCache(cache, 'mg-1');
    const forwardService =
      resolveMessageGroupForwardServiceFromCache(cache, 'mg-1');
    const leaderService =
      resolveMessageGroupLeaderServiceFromCache(cache, 'mg-1');

    t.equal(
      targetAddress,
      'node-b/message-group/mg-1-r3',
      'target resolution should still honor canonical leader node when service rows have no explicit leader',
    );
    t.equal(
      forwardService?.[COLUMN.SERVICE_ID],
      'mg-1-r3',
      'forward service resolution should still honor canonical leader node when service rows have no explicit leader',
    );
    t.equal(
      leaderService?.[COLUMN.SERVICE_ID],
      'mg-1-r3',
      'leader service resolution should still honor canonical leader node when service rows have no explicit leader',
    );
  });

test('message-group target resolver avoids ambiguous same-node canonical leader picks',
  async (t) => {
    const cache = new SystemTableCache();

    cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, CDC_OPERATION.UPSERT, {
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });

    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r1',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/message-group/mg-1-r1',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
      [COLUMN.UPDATED_AT]: 100,
    });
    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r2',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/message-group/mg-1-r2',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      [COLUMN.UPDATED_AT]: 200,
    });
    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r3',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/message-group/mg-1-r3',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
      [COLUMN.UPDATED_AT]: 300,
    });

    const targetAddress =
      resolveMessageGroupTargetAddressFromCache(cache, 'mg-1');
    const forwardService =
      resolveMessageGroupForwardServiceFromCache(cache, 'mg-1');
    const leaderService =
      resolveMessageGroupLeaderServiceFromCache(cache, 'mg-1');

    t.equal(
      targetAddress,
      'seed-node/message-group/mg-1-r2',
      'target address should resolve to the explicit leader when canonical node is ambiguous',
    );
    t.equal(
      forwardService?.[COLUMN.SERVICE_ID],
      'mg-1-r2',
      'forward service should prefer the explicit leader over another replica on the same node',
    );
  t.equal(
      leaderService?.[COLUMN.SERVICE_ID],
      'mg-1-r2',
      'leader service should prefer the explicit leader over another replica on the same node',
    );
  });

test('message-group target resolver excludes non-ready nodes from leader and forward selection',
  async (t) => {
    const cache = new SystemTableCache();
    const now = Date.now();

    addNode(cache, {
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 1,
    });
    addNode(cache, {
      [COLUMN.NODE_ID]: 'node-b',
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
    });

    cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, CDC_OPERATION.UPSERT, {
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.LEADER_NODE_ID]: 'node-a',
    });

    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r2',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-a/message-group/mg-1-r2',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      [COLUMN.UPDATED_AT]: now,
    });
    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r3',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'node-b',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-b/message-group/mg-1-r3',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
      [COLUMN.UPDATED_AT]: now + 1,
    });

    const targetAddress =
      resolveMessageGroupTargetAddressFromCache(cache, 'mg-1');
    const forwardService =
      resolveMessageGroupForwardServiceFromCache(cache, 'mg-1');
    const leaderService =
      resolveMessageGroupLeaderServiceFromCache(cache, 'mg-1');

    t.equal(
      leaderService,
      null,
      'leader resolution should ignore leader rows hosted on non-ready nodes',
    );
    t.equal(
      forwardService?.[COLUMN.SERVICE_ID],
      'mg-1-r3',
      'forward resolution should fall back to a ready replica when the leader node is not ready',
    );
    t.equal(
      targetAddress,
      'node-b/message-group/mg-1-r3',
      'target address should avoid non-ready node service rows',
    );
  });

test('message-group target resolver prefers connected relay candidates over disconnected leaders',
  async (t) => {
    const cache = new SystemTableCache();
    const now = Date.now();

    addNode(cache, {
      [COLUMN.NODE_ID]: 'node-leader',
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
    });
    addNode(cache, {
      [COLUMN.NODE_ID]: 'node-relay',
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
    });

    cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, CDC_OPERATION.UPSERT, {
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.LEADER_NODE_ID]: 'node-leader',
    });

    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r2',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'node-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-leader/message-group/mg-1-r2',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      [COLUMN.UPDATED_AT]: now + 2,
    });
    addMessageGroupService(cache, {
      [COLUMN.SERVICE_ID]: 'mg-1-r3',
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.NODE_ID]: 'node-relay',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-relay/message-group/mg-1-r3',
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
      [COLUMN.UPDATED_AT]: now + 1,
    });

    const isConnectedNode = (nodeId) => nodeId === 'node-relay';
    const targetAddress =
      resolveMessageGroupTargetAddressFromCache(cache, 'mg-1', {isConnectedNode});
    const forwardService =
      resolveMessageGroupForwardServiceFromCache(cache, 'mg-1', {isConnectedNode});
    const leaderService =
      resolveMessageGroupLeaderServiceFromCache(cache, 'mg-1', {isConnectedNode});

    t.equal(
      leaderService,
      null,
      'leader resolution should not insist on a disconnected canonical leader target',
    );
    t.equal(
      forwardService?.[COLUMN.SERVICE_ID],
      'mg-1-r3',
      'forward resolution should prefer a connected relay candidate during restart windows',
    );
    t.equal(
      targetAddress,
      'node-relay/message-group/mg-1-r3',
      'target address resolution should prefer a connected relay candidate',
    );
  });
