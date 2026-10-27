// Public durable DEFER through the committed-acceptance owner (lead O1): a
// public receive at a native follower whose leader route is UNAVAILABLE and
// whose cache selection yields no target is admitted, then the forward owner
// runs its bounded single-flight topology repair and re-decides. The source
// occurrences are test inputs; the RF5 group, router and owners are real.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_OPERATION, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {PEER_ADDRESS_STATUS} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {CDC_COMPLETION, isProvisionalCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {CDC_DELIVERY_REMAINING_MS} from '../../src/cdc/cdc-delivery-budget.js';
import {MessageGroupServiceRowOwner} from
  '../../src/message-group/message-group-service-row-owner.js';
import {MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE} from '../../src/message-group/constants.js';
import {MESSAGE_GROUP_CDC_INGRESS_ACTION, MESSAGE_GROUP_CDC_INGRESS_STATE} from
  '../../src/message-group/message-group-forwarding-owner-constants.js';
import {NODE_ID, TARGET_GROUP, provisionalRouteFixture, pump} from
  './message-group-native-provisional-route-fixture.js';

const RECEIVED_MS = 5000;
const PROBE_GROUP = 'mg-public-defer-probe';

function occurrence(index) {
  // An unrelated group's row, so provisional hydration cannot change routing.
  const data = MessageGroupServiceRowOwner.buildServiceRow({groupId: PROBE_GROUP,
    replicaId: `${PROBE_GROUP}-r${index}`, nodeId: NODE_ID, timestamp: 3,
    status: SERVICE_STATUS.ACTIVE});
  return {tableName: TABLES.SERVICES, operation: CDC_OPERATION.INSERT, data,
    timestamp: new HLCTimestamp(5000 + index, 0, 'public-defer').toString(),
    sourcePartition: 'public-defer', eventKey: `public-defer-${index}`,
    entryId: `public-defer-${index}`, sourceLogIndex: index, sourceOrdinal: 0};
}

function publicReceive(service, event, messageId) {
  const observed = {settled: false};
  observed.completion = service.receiveMessage({messageId, payload: {
    type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH,
    events: [event], targetGroupId: TARGET_GROUP, [CDC_DELIVERY_REMAINING_MS]: RECEIVED_MS}})
    .then((answer) => Object.assign(observed, {settled: true, answer}),
      (error) => Object.assign(observed, {settled: true, error}));
  return observed;
}

test('public durable DEFER_STRICT_TARGET_UNKNOWN repairs once and re-decides in the owner',
  async (t) => {
    const f = await provisionalRouteFixture(t);
    const follower = f.follower;
    const status = follower.raft.readStatus();
    assert.equal(status.leaderAddressStatus, PEER_ADDRESS_STATUS.UNAVAILABLE,
      'setup: the native leader route is unavailable');
    const first = occurrence(1);
    const second = occurrence(2);
    const decision = follower.resolveCdcIngressDecision({...first, targetGroupId: TARGET_GROUP,
      relayDepth: 0, events: [first]});
    assert.equal(decision.action, MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER);
    assert.equal(decision.state, MESSAGE_GROUP_CDC_INGRESS_STATE.DEFER_STRICT_TARGET_UNKNOWN);
    assert.equal(decision.shouldRepairAuthoritativeTopology, true);
    // Observe the real single-flight repair owner and its read; both run.
    const repairs = [];
    const reads = [];
    const maybeRepair = follower.maybeRepairAuthoritativeForwardTopology;
    follower.maybeRepairAuthoritativeForwardTopology = function(context) {
      repairs.push({remainingMs: context.remainingMs?.()});
      return Reflect.apply(maybeRepair, this, [context]);
    };
    const read = follower.repairAuthoritativeForwardTopology;
    follower.repairAuthoritativeForwardTopology = function(...args) {
      reads.push(args.length);
      return Reflect.apply(read, this, args);
    };
    const sendsBefore = f.events.filter((event) => event.kind === 'application-send').length;
    try {
      const one = publicReceive(follower, first, 'public-defer-1');
      const two = publicReceive(follower, second, 'public-defer-2');
      await pump(f);
      await Promise.all([one.completion, two.completion]);
      assert.equal(repairs.length, 2, 'C1_PUBLIC_DEFER_REACHES_REPAIR');
      assert.ok(repairs.every(({remainingMs}) => remainingMs > 0 && remainingMs <= RECEIVED_MS),
        'the repair runs inside the received grant');
      assert.equal(reads.length, 1, 'C1_PUBLIC_DEFER_REPAIR_SINGLE_FLIGHT');
      for (const [observed, event] of [[one, first], [two, second]]) {
        assert.equal(observed.error, undefined, observed.error?.stack);
        assert.equal(observed.answer.error, CDC_COMPLETION.PROVISIONAL,
          'C1_PUBLIC_DEFER_RE_DECIDES_TO_PROVISIONAL');
        assert.equal(isProvisionalCdcOutcome(observed.answer, [event], TARGET_GROUP), true);
      }
      assert.equal(f.events.filter((event) => event.kind === 'application-send').length,
        sendsBefore, 'no target exists, so nothing is forwarded');
      assert.equal(follower.cdcCommitWaiters.size, 0, 'both admitted waits released');
      assert.equal(follower.raft.readStatus().leaderAddressStatus,
        PEER_ADDRESS_STATUS.UNAVAILABLE, 'the probe rows did not change the native route');
    } finally {
      follower.maybeRepairAuthoritativeForwardTopology = maybeRepair;
      follower.repairAuthoritativeForwardTopology = read;
    }
  });
