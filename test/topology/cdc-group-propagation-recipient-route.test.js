// CDCGroupPropagationService durable delivery (deliverCdcVectorToRecipient):
// a target recipient is delivered through ONE route, the one its invocation
// answers when the plan is bound (bindTopology: the source lane's observation
// of that group). A required group the plan no longer names is delivered
// through the lane's observed route; a recipient the lane has no route for is
// not sent and answers the typed unknown (no synthesized null address).
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {COLUMN} from '../../src/constants/index.js';
import {CDC_COMPLETION} from '../../src/cdc/cdc-delivery-outcome.js';
import {scopeCdcDeliveryInvocation} from '../../src/cdc/cdc-delivery-invocation.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {committedTargetAnswer, createDurableCdcEvent, createDurablePropagationRequest,
  createDurableSourceMessageGroupService, createGroupRow, createTopologyCache, setupConfig,
  teardownConfig} from './cdc-group-propagation-service-harness.js';
import {sourceRangeOfEvents} from '../test-helpers/cdc-source-range-fixture.js';

afterEach(teardownConfig);

const LANE_ROUTE = Object.freeze({groupId: 'g-3', address: 'node-g-3/message-group/g-3-r1',
  coordinatorNodeId: 'node-g-3'});

// The source lane's invocation seam: it names the target group and answers
// the route it observes for it once the reported set is bound.
function laneInvocation(parent, recipientGroupId, route, events) {
  return scopeCdcDeliveryInvocation(parent, () => true, () => ({recipientGroupId,
    sourceRange: sourceRangeOfEvents(events), bindTopology: () => route}));
}

function propagationService(t, delivered) {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    // The plan names g-1 (the source) and g-2 only: g-3 is not planned.
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: 'g-1'}],
      groups: [createGroupRow('g-1', 'node-a'), createGroupRow('g-2', 'node-g-2')],
    }),
    messageRouter: {deliver: async (address, payload) => {
      delivered.push(address);
      return committedTargetAnswer(payload);
    }},
    latencyTreeService: {getRoutingOrder: () => ['g-1', 'g-2']},
    nowFn: () => 2000,
  });
  service.initialize();
  service.start();
  t.after(() => service.stop());
  return service;
}

test('deliverCdcVectorToRecipient delivers an unplanned required group through the lane route',
  async (t) => {
    const delivered = [];
    const service = propagationService(t, delivered);
    const events = [createDurableCdcEvent()];
    const request = createDurablePropagationRequest(
      createDurableSourceMessageGroupService('g-1'), events);
    const result = await service.propagateCDCEvent({...request,
      deliveryContext: laneInvocation(request.deliveryContext, 'g-3', LANE_ROUTE, events)});
    assert.deepEqual(delivered, [LANE_ROUTE.address], 'the lane\'s route, the one source');
    assert.equal(result.success, true);
  });

test('deliverCdcVectorToRecipient answers the typed unknown for a recipient with no route',
  async (t) => {
    const delivered = [];
    const service = propagationService(t, delivered);
    const events = [createDurableCdcEvent()];
    const request = createDurablePropagationRequest(
      createDurableSourceMessageGroupService('g-1'), events);
    const result = await service.propagateCDCEvent({...request,
      deliveryContext: laneInvocation(request.deliveryContext, 'g-3', null, events)});
    assert.deepEqual(delivered, [], 'nothing is sent to a synthesized address');
    assert.equal(result.success, false);
    assert.equal(result.error, CDC_COMPLETION.UNKNOWN);
    assert.equal(result.deferRetry, true);
    assert.deepEqual(result.failedTargetGroupIds, ['g-3']);
  });
