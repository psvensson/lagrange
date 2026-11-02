/**
 * A message group's reconcile refuses a services row whose address is not a
 * unified address the way a partition does (quest
 * learner-admission-malformed-address-refusal): no untyped failure, the
 * admission reaches the port naming no node, and a corrected row admits.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createControllableMessageGroupService,
  createTestTransport,
  registerMessageGroupServiceLifecycleHooks,
  setTestPortBase,
} from './message-group-service-test-support.js';
import {ControllableConsensusPort} from
  '../test-helpers/controllable-consensus-port.js';
import {
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RaftRole} from '../../src/message-group/message-group-service.js';
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

test('a message group leader proposes no node for an unparsable address ' +
  'and the node of a corrected one', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const port = new ControllableConsensusPort();
    const service = createControllableMessageGroupService({
      groupId: GROUP_ID, replicaId: LOCAL_REPLICA, nodeId, transport: router,
    }, port);
    await service.initialize();
    t.equal(port.role, RaftRole.LEADER, 'the lone replica leads its group');

    // The double answers as the production port does for an ADD with no node.
    port.setConfChangeHandler(() => Object.freeze({
      outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_NODE_ID,
      phase: 'membership-admission', retryable: false,
      recoveryRequired: false,
    }));
    upsertPeerRow(service, `ws://localhost:7000/message-group/${PEER_REPLICA}`);
    t.doesNotThrow(() => service.reconcileRaftPeersFromCache(),
      'an unparsable address raises no untyped failure');
    t.same(port.confChanges, [{type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
      replicaIdentity: PEER_REPLICA, nodeId: null}],
    'the port is the one owner of refusing an ADD that names no node');

    port.confChanges.length = 0;
    port.setConfChangeHandler(null);
    upsertPeerRow(service, `${PEER_NODE}/message-group/${PEER_REPLICA}`);
    service.reconcileRaftPeersFromCache();
    t.same(port.confChanges.at(-1), {type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
      replicaIdentity: PEER_REPLICA, nodeId: PEER_NODE},
    'a corrected row proposes the node it names');
    await service.shutdown();
  } finally {
    await cleanup();
  }
});
