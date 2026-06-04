/**
 * Tests for break-point (a): message-group control-plane Raft traffic must ride
 * the protected READINESS outbound lane.
 *
 * Root cause (TLA+ verified, models/readiness-starvation): after a rolling
 * restart the query message-group ingress readiness gate (routingReady) only
 * flips once the group's Raft consensus converges. Those consensus CONTROL
 * messages (votes, vote/append responses, heartbeats) otherwise ride the
 * CRITICAL lane and are permanently starved by the priority-recovery dispatch
 * storm that saturates the shared outbound queue. Routing them onto the
 * READINESS lane reserves headroom so the group can converge under critical
 * saturation, WITHOUT letting bulk data-bearing replication consume the small
 * reserve (those must stay off the readiness lane).
 */

import {test} from '../../src/test-helpers/tap.js';
import {resolveRaftTransportDeliveryOptions} from '../../src/raft/constants.js';
import {OUTBOUND_DELIVERY_PRIORITY} from '../../src/constants/transport.js';

const MESSAGE_GROUP_TARGET = 'node-2/message-group/mg1-r1';
const PRIORITY_PARTITION_TARGET = 'node-2/partition/replica_operations-p1';
const ORDINARY_PARTITION_TARGET = 'node-2/partition/users-p1';

test('message-group vote is routed to the READINESS lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions({
    type: 'vote',
    targetAddress: MESSAGE_GROUP_TARGET,
  });
  t.equal(
    options.deliveryPriority,
    OUTBOUND_DELIVERY_PRIORITY.READINESS,
    'message-group vote must use the protected readiness lane',
  );
  t.end();
});

test('message-group vote response is routed to the READINESS lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions({
    type: 'voted',
    targetAddress: MESSAGE_GROUP_TARGET,
  });
  t.equal(
    options.deliveryPriority,
    OUTBOUND_DELIVERY_PRIORITY.READINESS,
    'message-group vote response must use the protected readiness lane',
  );
  t.end();
});

test('message-group heartbeat append is routed to the READINESS lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions({
    type: 'append',
    data: [],
    targetAddress: MESSAGE_GROUP_TARGET,
  });
  t.equal(
    options.deliveryPriority,
    OUTBOUND_DELIVERY_PRIORITY.READINESS,
    'message-group heartbeat (empty append) must use the readiness lane',
  );
  t.end();
});

test('message-group data-bearing append is NOT routed to the READINESS lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions({
    type: 'append',
    data: [{term: 1, index: 5}],
    targetAddress: MESSAGE_GROUP_TARGET,
  });
  t.not(
    options.deliveryPriority,
    OUTBOUND_DELIVERY_PRIORITY.READINESS,
    'bulk data-bearing replication must not consume the small readiness reserve',
  );
  t.equal(
    options.deliveryPriority,
    OUTBOUND_DELIVERY_PRIORITY.BACKGROUND,
    'data-bearing message-group append falls through to the background lane',
  );
  t.end();
});

test('priority control-plane partition vote keeps the CRITICAL lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions({
    type: 'vote',
    targetAddress: PRIORITY_PARTITION_TARGET,
  });
  t.equal(
    options.deliveryPriority,
    OUTBOUND_DELIVERY_PRIORITY.CRITICAL,
    'priority partition consensus is unchanged and stays critical',
  );
  t.end();
});

test('ordinary partition vote keeps the CRITICAL lane', async (t) => {
  const options = resolveRaftTransportDeliveryOptions({
    type: 'vote',
    targetAddress: ORDINARY_PARTITION_TARGET,
  });
  t.equal(
    options.deliveryPriority,
    OUTBOUND_DELIVERY_PRIORITY.CRITICAL,
    'ordinary partition consensus is unchanged and stays critical',
  );
  t.end();
});
