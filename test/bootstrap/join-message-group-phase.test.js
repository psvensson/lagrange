// W8 (identity-reuse safety fix, A3): the joiner has no path that starts a
// message-group replica moved to it. A message-group replica's raft id
// derives from its name, so a move re-opened a committed identity on an
// empty log with no conf change. This file once pinned that path (the
// runtime owner queued the moved replica as joining an existing group); it
// now pins its absence: the runtime owner exposes no join-existing phase and
// refuses to start a replica another node actively owns, whatever the
// bootstrap response says.

import {test} from '../../src/test-helpers/tap.js';
import {
  JoinMessageGroupRuntimeOwner,
} from '../../src/bootstrap/owners/join-message-group-runtime-owner.js';
import {NodeService} from '../../src/node/node-service.js';
import {initializeTestEnvironment} from
  './node-joining-service-test-support.js';

test('JoinMessageGroupRuntimeOwner has no join-existing phase and refuses ' +
  'to start a replica another node owns', async (t) => {
  initializeTestEnvironment();
  const owner = new JoinMessageGroupRuntimeOwner({
    nodeId: 'joining-node-1',
    delegates: {
      getBootstrapResponse: () => ({
        messageGroupAssignment: {
          strategy: 'MOVE_REPLICA',
          groupId: 'mg-1',
          replicaToMove: 'mg-1-r2',
          sourceNodeId: 'seed-node-1',
          assignmentId: 'assignment-1',
        },
      }),
    },
  });
  t.equal(typeof owner.phaseJoinExistingMessageGroup, 'undefined',
    'no join-existing message-group phase exists');

  const nodeService = NodeService.getInstance();
  nodeService.initialize({nodeId: 'joining-node-1'});
  nodeService.getSystemTableCache().applySystemTableChange('services',
    'INSERT', {
      service_id: 'mg-1-r2',
      service_type: 'message_group',
      node_id: 'seed-node-1',
      group_id: 'mg-1',
      replica_id: 'mg-1-r2',
      status: 'active',
      address: 'seed-node-1/message-group/mg-1-r2',
    });
  t.throws(() => owner.assertReplicaStartupOwnership('mg-1-r2'),
    /replica_owner_conflict/i,
    'a MOVE_REPLICA assignment authorizes no takeover');
  t.doesNotThrow(() => owner.assertReplicaStartupOwnership('mg-joining-r0'),
    'a replica no row names may start');
});
