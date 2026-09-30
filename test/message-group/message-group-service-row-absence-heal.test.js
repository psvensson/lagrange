/**
 * Message-group activation keeps creation authority separate.
 */
import {
  MessageGroupServiceRowOwner,
} from '../../src/message-group/message-group-service-row-owner.js';
import {
  runRowAbsenceActivationDeferredScenario,
} from '../test-helpers/row-absence-heal-scenarios.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {SERVICE_STATUS} from '../../src/constants/index.js';

const REPLICA_OPTIONS = Object.freeze({
  groupId: 'mg-1',
  replicaId: 'mg-1-r1',
  nodeId: 'node-a',
  service: {isLeaderReplica: () => false},
  isEffectHandlerCurrent: () => true,
});

// A registration is a birth: the row is born STOPPED and only the
// handler-bound activation may carry it to ACTIVE.
const REGISTRATION_OPTIONS = Object.freeze({
  ...REPLICA_OPTIONS,
  status: SERVICE_STATUS.STOPPED,
});

runRowAbsenceActivationDeferredScenario({
  OwnerClass: MessageGroupServiceRowOwner,
  replicaOptions: REPLICA_OPTIONS,
  registrationOptions: REGISTRATION_OPTIONS,
  ownerLabel: 'message-group',
  deferredCode: 'ACTIVATION_OWNER_DEFERRED',
  ownerOptions: {replicaStateMachine: new ReplicaStateMachine({
    nodeId: 'node-a', controlPlaneSystemTableGateway: {}})},
  assertRegisteredRow(t, insert, row) {
    t.equal(insert.row.service_id, 'mg-1-r1');
    t.equal(insert.row.service_type, 'message_group');
    t.equal(insert.row.status, 'stopped',
      'registration never manufactures activation');
    t.equal(insert.row.created_at, 1234,
      'canonical registration carries the full durable identity');
    t.equal(row.status, 'stopped');
  },
});
