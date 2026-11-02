/**
 * A message group's reconcile refuses a services row whose address is not a
 * unified address the way a partition does (quest
 * learner-admission-malformed-address-refusal): no untyped failure, the
 * admission reaches the port naming no node, and a corrected row admits.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createTestTransport,
  registerMessageGroupServiceLifecycleHooks,
  setTestPortBase,
} from './message-group-service-test-support.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';
import {
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
} from '../../src/raft/raft-operation-port-constants.js';
import {MessageGroupService, RaftRole} from
  '../../src/message-group/message-group-service.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';

const GROUP_ID = 'mg-unparsable-address';
const LOCAL_REPLICA = `${GROUP_ID}-r1`;
const PEER_REPLICA = `${GROUP_ID}-r2`;
const PEER_NODE = 'peer-node';
const WAIT_MS = 5000;
const POLL_MS = 10;

setTestPortBase(24260);
registerMessageGroupServiceLifecycleHooks();

function upsertPeerRow(service, address) {
  service.systemTableCache.applySystemTableChange(TABLES.SERVICES,
    CDC_OPERATION.UPSERT, {
      [COLUMN.SERVICE_ID]: PEER_REPLICA,
      [COLUMN.GROUP_ID]: GROUP_ID,
      [COLUMN.NODE_ID]: PEER_NODE,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: address,
    });
}

async function waitFor(predicate) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return predicate();
}

test('a message group leader refuses an unparsable row at the native port ' +
  'and admits its correction through the cache wake', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const uncaught = [];
  const onUncaught = (error) => uncaught.push(error);
  process.on('uncaughtException', onUncaught);
  try {
    const service = new MessageGroupService(withTestDbPath({
      groupId: GROUP_ID, replicaId: LOCAL_REPLICA, nodeId, transport: router,
    }));
    try {
      await service.initialize();
      t.equal(service.raft.readStatus().role, RaftRole.LEADER,
        'the native lone-replica port leads its group');
      const admissions = [];
      const originalLogger = service.logger;
      const recordingLogger = Object.create(originalLogger);
      recordingLogger.warn = (message, payload) => {
        if (payload?.admission) admissions.push(payload.admission);
        return originalLogger.warn(message, payload);
      };
      service.logger = recordingLogger;

      upsertPeerRow(service, `ws://localhost:7000/message-group/${PEER_REPLICA}`);
      t.equal(await waitFor(() => admissions.some((admission) =>
        admission.reason === RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_NODE_ID)),
      true, 'the actual port refuses an ADD without a committed node');
      t.same(uncaught, [], 'no error escaped the cache-triggered reconcile hop');
      t.equal(service.raft.readStatus().peers.some((peer) =>
        peer.replicaIdentity === PEER_REPLICA), false,
      'the malformed row did not admit a peer');

      upsertPeerRow(service, `${PEER_NODE}/message-group/${PEER_REPLICA}`);
      t.equal(await waitFor(() => service.raft.readStatus().peers.some((peer) =>
        peer.replicaIdentity === PEER_REPLICA)), true,
      'the corrected row is admitted through the real cache wake');
      t.same(uncaught, [], 'no error escaped after the correction');
    } finally {
      await service.shutdown();
    }
  } finally {
    process.off('uncaughtException', onUncaught);
    await cleanup();
  }
});
