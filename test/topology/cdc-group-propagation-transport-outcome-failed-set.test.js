// The durable CDC topology wave counts a target as covered only when the
// transport owner classifies its outcome DELIVERED and it carries the target's
// committed receipt (isCommittedCdcDelivery). Outcomes are real MessageRouter
// local-dispatch results of the target's reply. Property: a target whose
// outcome is not covered (a no-handler reply, an application deferral, a
// contradictory delivery-state claim) stays uncovered and is retried by the
// wave's foreground retry only; a covered target is not delivered again.
// Those four replies are already refused by the CDC outcome owner's exact
// receipt fields, so they do not pin the transport decision. The BARE_RECEIPT
// lane does: the failing target answers a valid committed receipt with no
// transport envelope (only a router double can return one; the real router
// always stamps acknowledged/deliveryState), so CDC committed is true and the
// transport outcome is not delivered - only the transport classification can
// keep it uncovered.
// (Was written against the deleted ordinary wave's deliverToTargets; D1e
// moved it to the one path, the durable wave.)
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TRANSPORT_DELIVERY_OUTCOME_STATE} from
  '../../src/transport/transport-semantic-outcome.js';
import {CDCGroupPropagationService} from
  '../../src/topology/cdc-group-propagation-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {createDurableCdcEvent, createDurablePropagationRequest,
  createDurableSourceMessageGroupService, createMessageGroupServiceRow,
  createTopologyCache} from './cdc-group-propagation-service-harness.js';

const NODE_ID = 'cdc-failed-set-node';
const MAX_ATTEMPTS = 2;
const RETRY_HINT_MS = 250;
const DELIVERED_GROUP = 'cdc-failed-set-delivered';
const SOURCE_GROUP = 'cdc-failed-set-source';
const STATE = TRANSPORT_DELIVERY_OUTCOME_STATE;
const FAILING_REPLIES = Object.freeze({
  NO_HANDLER: {noHandler: true, error: 'No handler registered for address'},
  APPLICATION_DEFERRAL: {success: false, deferRetry: true, retryAfterMs: RETRY_HINT_MS},
  CONTRADICTORY_CLAIM: {success: true, deliveryState: STATE.DELIVERED,
    retryAfterMs: RETRY_HINT_MS},
  FAILED_CLAIM: {success: true, deliveryState: STATE.FAILED},
});

function target(groupId) {
  return {groupId, coordinatorNodeId: `${groupId}-node`,
    address: `${NODE_ID}/service/${groupId}`};
}

async function harness(t, failingReply, {bareReceipt = false} = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    logging: {level: 'fatal'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID});
  await router.initialize({startServer: false});
  const calls = new Map();
  const failing = target('cdc-failed-set-failing');
  router.register(target(DELIVERED_GROUP).address,
    (message) => buildCommittedCdcOutcome([message.payload], DELIVERED_GROUP,
      {index: 1, term: 1}));
  // The failing reply also carries the target's committed receipt.
  router.register(failing.address, (message) => ({...buildCommittedCdcOutcome(
    [message.payload], failing.groupId, {index: 1, term: 1}), ...failingReply}));
  const service = new CDCGroupPropagationService({
    nodeId: NODE_ID,
    systemTableCache: createTopologyCache({services: [target(DELIVERED_GROUP), failing].map(
      // Both target leaders are hosted on this node: real local dispatch.
      (row) => createMessageGroupServiceRow(`${row.groupId}-r1`, NODE_ID,
        row.address, RAFT_ROLE.LEADER, row.groupId))}),
    messageRouter: {
      async deliver(address, payload, options) {
        calls.set(address, (calls.get(address) ?? 0) + 1);
        if (bareReceipt && address === failing.address) {
          return buildCommittedCdcOutcome([payload], failing.groupId, {index: 1, term: 1});
        }
        return router.deliver(address, payload, options);
      },
    },
    latencyTreeService: {getRoutingOrder: () => []},
    nowFn: () => 1000,
    deliveryRetryMaxAttempts: MAX_ATTEMPTS,
    deliveryRetryDelayMs: 1,
    deliveryRetryMaxDelayMs: 1,
    deliveryRetryBackoffMultiplier: 1,
  });
  service.logger = {info() {}, warn() {}, debug() {}, error() {}};
  service.initialize();
  service.start();
  t.teardown(async () => {
    service.stop();
    await router.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  return {service, calls, failing, delivered: target(DELIVERED_GROUP)};
}

const EVENT = createDurableCdcEvent({tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
  data: {config_key: 'cdc-failed-set', config_value: 'v'}});

const LANES = [
  ...Object.entries(FAILING_REPLIES).map(([name, reply]) => ({name, reply, options: {}})),
  {name: 'BARE_RECEIPT', reply: null, options: {bareReceipt: true}},
];

for (const {name, reply, options} of LANES) {
  test(`CDC topology wave keeps a ${name} target uncovered`, async (t) => {
    const {service, calls, failing, delivered} = await harness(t, reply, options);
    const source = createDurableSourceMessageGroupService(SOURCE_GROUP);
    const result = await service.propagateCDCEvent(
      createDurablePropagationRequest(source, EVENT));
    t.equal(result.success, false,
      `${name}: the wave is incomplete while the target the owner did not classify delivered is uncovered`);
    t.equal(calls.get(delivered.address), 1,
      `${name}: the covered target is not delivered again`);
    t.ok(calls.get(failing.address) >= MAX_ATTEMPTS,
      `${name}: the uncovered target is re-dispatched in every foreground attempt`);
  });
}
