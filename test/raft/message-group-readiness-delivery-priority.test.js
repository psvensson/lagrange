/**
 * Consensus transport priority: control messages that unblock readiness use
 * the protected READINESS lane; bulk replication does not consume it.
 */

import {test} from '../../src/test-helpers/tap.js';
import {resolveRaftTransportDeliveryOptions} from '../../src/raft/constants.js';
import {
  RAFT_RS_MESSAGE_TYPE,
  RAFT_RS_TRANSPORT_PROTOCOL,
} from '../../src/raft/raft-rs-ingress-constants.js';
import {OUTBOUND_DELIVERY_PRIORITY} from '../../src/constants/transport.js';

const MESSAGE_GROUP_TARGET = 'node-2/message-group/mg1-r1';
const PRIORITY_PARTITION_TARGET =
  'node-2/partition/replica_operations-p1-r2';
const SQL_WRITE_PRIORITY_PARTITION_TARGET =
  'node-2/partition/sql_write_operations-p1-r2';
const ORDINARY_PARTITION_TARGET = 'node-2/partition/users-p1';

function envelope(msgType, targetAddress, {entries = []} = {}) {
  return {
    protocol: RAFT_RS_TRANSPORT_PROTOCOL,
    groupId: 'priority-test-group',
    from: '101',
    to: '202',
    targetAddress,
    message: {
      msgType,
      from: '101',
      to: '202',
      term: '1',
      logTerm: '0',
      index: '0',
      commit: '0',
      entries,
    },
  };
}

test('message-group vote request is routed to the READINESS lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions(
    envelope(RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE, MESSAGE_GROUP_TARGET));
  t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.READINESS);
  t.end();
});

test('message-group vote response is routed to the READINESS lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions(
    envelope(RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE_RESPONSE, MESSAGE_GROUP_TARGET));
  t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.READINESS);
  t.end();
});

test('message-group heartbeat is routed to the READINESS lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions(
    envelope(RAFT_RS_MESSAGE_TYPE.HEARTBEAT, MESSAGE_GROUP_TARGET));
  t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.READINESS);
  t.equal(options.deliverySource, 'raft:heartbeat');
  t.equal(options.replacePendingKey, `raft:heartbeat:${MESSAGE_GROUP_TARGET}`);
  t.end();
});

test('message-group data-bearing append stays off the READINESS lane',
  async (t) => {
    const options = resolveRaftTransportDeliveryOptions(
      envelope(RAFT_RS_MESSAGE_TYPE.APPEND, MESSAGE_GROUP_TARGET, {
        entries: [{term: '1', index: '5'}],
      }));
    t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.BACKGROUND);
    t.end();
  });

test('priority control-plane vote is routed to the READINESS lane',
  async (t) => {
    const options = resolveRaftTransportDeliveryOptions(
      envelope(RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE, PRIORITY_PARTITION_TARGET));
    t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.READINESS);
    t.end();
  });

test('priority control-plane heartbeat is routed to the READINESS lane',
  async (t) => {
    const options = resolveRaftTransportDeliveryOptions(
      envelope(RAFT_RS_MESSAGE_TYPE.HEARTBEAT, PRIORITY_PARTITION_TARGET));
    t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.READINESS);
    t.equal(options.deliverySource, 'raft:heartbeat');
    t.equal(
      options.replacePendingKey,
      `raft:heartbeat:${PRIORITY_PARTITION_TARGET}`,
    );
    t.end();
  });

test('priority sql-write vote is routed to the READINESS lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions(
    envelope(
      RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE,
      SQL_WRITE_PRIORITY_PARTITION_TARGET,
    ));
  t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.READINESS);
  t.end();
});

test('priority control-plane data append stays CRITICAL', async (t) => {
  const options = resolveRaftTransportDeliveryOptions(
    envelope(RAFT_RS_MESSAGE_TYPE.APPEND, PRIORITY_PARTITION_TARGET, {
      entries: [{term: '1', index: '5'}],
    }));
  t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.CRITICAL);
  t.end();
});

test('ordinary partition vote keeps the CRITICAL lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions(
    envelope(RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE, ORDINARY_PARTITION_TARGET));
  t.equal(options.deliveryPriority, OUTBOUND_DELIVERY_PRIORITY.CRITICAL);
  t.end();
});
