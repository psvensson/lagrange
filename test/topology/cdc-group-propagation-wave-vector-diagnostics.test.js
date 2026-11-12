// The "CDC durable wave finished" line of a delivery that carries a vector
// (range shipping) to one recipient group (recipient isolation): through the
// real CDCGroupPropagationService, one delivery of five events to a target
// group writes one line whose eventCount is five, whose source position
// names the vector's first event and whose recipientGroupId names that
// target. A separate file, so that this is the first finished delivery of
// the process and the throttled line is written at once.
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {COLUMN} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDC_GROUP_PROPAGATION_LOG_MSG} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {addressedTo, committedTargetAnswer, createDurableCdcEvent, createDurablePropagationRequest,
  createDurableSourceMessageGroupService, createGroupRow, createMessageGroupServiceRow,
  createTopologyCache, setupConfig, teardownConfig} from
  './cdc-group-propagation-service-harness.js';

afterEach(teardownConfig);

test('the finished-wave line reports the length of the vector the wave carried', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const logging = LoggingService.getInstance();
  const lines = [];
  const original = logging.logConsoleOnly;
  logging.logConsoleOnly = (level, message, context) => lines.push({level, message, context});
  t.after(() => {
    logging.logConsoleOnly = original;
  });
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: 'g-1'}],
      groups: [createGroupRow('g-1', 'node-a'), createGroupRow('g-2', 'node-g-2')],
      services: [createMessageGroupServiceRow('g-2-r1', 'node-g-2',
        'node-g-2/message-group/g-2-r1', RAFT_ROLE.LEADER, 'g-2')],
    }),
    messageRouter: {deliver: async (_address, payload) => committedTargetAnswer(payload)},
    latencyTreeService: {getRoutingOrder: () => ['g-1', 'g-2']},
    nowFn: () => 2000,
  });
  service.initialize();
  service.start();
  t.after(() => service.stop());
  const events = Array.from({length: 5}, (_unused, index) => createDurableCdcEvent({
    eventKey: `diagnosed-event-${index}`, sourceLogIndex: 40 + index,
    data: {[COLUMN.NODE_ID]: `node-${index}`}}));

  const request = createDurablePropagationRequest(
    createDurableSourceMessageGroupService('g-1'), events);
  const result = await service.propagateCDCEvent({...request,
    deliveryContext: addressedTo(request.deliveryContext, 'g-2')});
  assert.equal(result.success, true);
  const finished = lines.filter((line) =>
    line.message === CDC_GROUP_PROPAGATION_LOG_MSG.DURABLE_WAVE_FINISHED);
  assert.equal(finished.length, 1, 'one line for the one delivery');
  assert.equal(finished[0].context.recipientGroupId, 'g-2');
  assert.equal(finished[0].context.eventCount, 5);
  assert.equal(finished[0].context.sourceLogIndex, 40, 'the vector\'s first event');
  assert.equal(finished[0].context.tableName, events[0].tableName);
  assert.equal(finished[0].context.targets.length, 1);
});
