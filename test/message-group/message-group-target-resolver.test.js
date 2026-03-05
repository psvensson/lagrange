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
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

function addMessageGroupService(cache, row) {
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, row);
}

test('message-group target resolver prefers message_groups leader over stale services role',
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
      'node-b/message-group/mg-1-r3',
      'target resolution should honor canonical leader_node_id before stale service roles',
    );
    t.equal(
      forwardService?.[COLUMN.SERVICE_ID],
      'mg-1-r3',
      'forward service resolution should honor canonical leader_node_id before stale service roles',
    );
    t.equal(
      leaderService?.[COLUMN.SERVICE_ID],
      'mg-1-r3',
      'leader service resolution should honor canonical leader_node_id before stale service roles',
    );
  });
