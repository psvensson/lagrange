// The selection owner's one binding rule (CDC Stage 3 repair of the selection
// churn): the sync resolver (the source lane's currentness check,
// getCDCPropagationService) and the async resolver (each delivery) used to
// apply different readiness rules, so during a leadership change they named
// different services and every pass released the propagation binding. A
// subscriber's bound service now stays selected by both while it is
// registered and live; only its real ineligibility rebinds.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {MESSAGE_GROUP_SELECTION_STATE, resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync} from
  '../../src/bootstrap/shared/message-group-selection.js';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {addressedTo, beginDurableCdcInvocation, createDurableCdcEvent} from
  '../topology/cdc-group-propagation-service-harness.js';

const TABLE = 'services';
const NOT_READY = Object.freeze({ready: false, retryAfterMs: 10, reason: 'not_ready'});
const READY = Object.freeze({ready: true, retryAfterMs: 0, reason: null});

// A: the local leader replica whose metadata ingress is not ready by the sync
// rule but forwards (the async rule finds targets). B: a relay ready by the
// sync rule. The two rules choose different services.
function services() {
  const leader = {groupId: 'group-a', initialized: true, isShutdown: false,
    isLeaderReplica: () => true, isCurrentRaftLeader: () => false,
    getMetadataIngressReadiness: () => NOT_READY,
    resolveMetadataIngressForwardSelection: async () => ({targets: ['peer']}),
    canAcceptCDCEvent: () => true};
  const relay = {groupId: 'group-b', initialized: true, isShutdown: false,
    isLeaderReplica: () => false, getMetadataIngressReadiness: () => READY,
    canAcceptCDCEvent: () => true};
  return {leader, relay, all: [leader, relay]};
}

test('the sync and async rules diverge without a binding; with one, the delivery\'s service ' +
  'is the one the lane compares against on every pass, until it is no longer live',
async () => {
  const s = services();
  const options = {requiredTables: [TABLE]};
  const sync = resolveOperationalMessageGroupSelection(s.all, options);
  const async = await resolveOperationalMessageGroupSelectionAsync(s.all, options);
  assert.equal(sync.service, s.relay, 'the sync rule selects the relay');
  assert.equal(async.service, s.leader, 'the async rule selects the forwarding leader');

  const used = [];
  const subscriber = buildPartitionCdcPropagationSubscriber({tableName: TABLE,
    resolveOperationalMessageGroupSelection: (selectionOptions) =>
      resolveOperationalMessageGroupSelection(s.all, selectionOptions),
    resolveOperationalMessageGroupSelectionAsync: (selectionOptions) =>
      resolveOperationalMessageGroupSelectionAsync(s.all, selectionOptions),
    buildMessageGroupOwnerNotReadyError: () => new Error('not ready'),
    propagatePartitionCDCEvent: (service, events) => {
      used.push(service);
      return buildCommittedCdcOutcome(events, service.groupId, {index: 3, term: 1});
    }});
  const events = [createDurableCdcEvent({tableName: TABLE})];
  for (let pass = 0; pass < 3; pass += 1) {
    await subscriber(events, addressedTo(beginDurableCdcInvocation(), null));
    assert.equal(subscriber.getCDCPropagationService(), used.at(-1),
      `pass ${pass}: the lane's currentness check names the service the delivery used`);
  }
  assert.deepEqual(used, [s.leader, s.leader, s.leader], 'one binding, no churn');
  assert.equal(resolveOperationalMessageGroupSelection(s.all,
    {requiredTables: [TABLE], boundService: s.leader}).state,
  MESSAGE_GROUP_SELECTION_STATE.BOUND_NOT_READY,
  'the sync rule names the bound service by identity even while it is not ready');

  s.leader.isShutdown = true;
  assert.equal(subscriber.getCDCPropagationService(), s.relay,
    'a bound service that is no longer live is selected again by the ordinary rule');
});
