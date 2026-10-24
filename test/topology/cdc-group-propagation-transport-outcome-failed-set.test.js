// The ordinary CDC topology wave counts a target as delivered only on the
// transport owner's decision. Outcomes are real MessageRouter local-dispatch
// results of the target's reply. Property: a target whose outcome the owner
// does not classify DELIVERED (a no-handler reply, an application deferral, a
// contradictory delivery-state claim) stays in the failed set and is retried
// by the wave's existing retry owner only; a delivered target is neither
// failed nor delivered again.
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TRANSPORT_DELIVERY_OUTCOME_STATE} from
  '../../src/transport/transport-semantic-outcome.js';
import {CDCGroupPropagationService} from
  '../../src/topology/cdc-group-propagation-service.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'cdc-failed-set-node';
const MAX_ATTEMPTS = 2;
const RETRY_HINT_MS = 250;
const DELIVERED_GROUP = 'cdc-failed-set-delivered';
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

async function harness(t, failingReply) {
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
  router.register(target(DELIVERED_GROUP).address, () => ({success: true}));
  router.register(failing.address, () => failingReply);
  const service = new CDCGroupPropagationService({
    nodeId: NODE_ID,
    systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
    messageRouter: {
      deliver(address, payload) {
        calls.set(address, (calls.get(address) ?? 0) + 1);
        return router.deliver(address, payload);
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
    for (const timer of service.backgroundRetryTimers) clearTimeout(timer);
    service.backgroundRetryTimers.clear();
    await router.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  return {service, calls, failing, delivered: target(DELIVERED_GROUP)};
}

const EVENTS = Object.freeze([{tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
  data: {config_key: 'cdc-failed-set', config_value: 'v'}}]);

for (const [name, reply] of Object.entries(FAILING_REPLIES)) {
  test(`CDC topology wave keeps a ${name} target in the failed set`, async (t) => {
    const {service, calls, failing, delivered} = await harness(t, reply);
    const failures = await service.deliverToTargets({events: EVENTS,
      sourceGroupId: 'cdc-failed-set-source', targets: [delivered, failing]});
    t.same(failures.map((failure) => failure.targetGroupId), [failing.groupId],
      `${name}: only the target the owner did not classify delivered failed`);

    calls.clear();
    await service.deliverToTargetsWithRetry({events: EVENTS,
      sourceGroupId: 'cdc-failed-set-source', targets: [delivered, failing]});
    t.same({delivered: calls.get(delivered.address), failing: calls.get(failing.address)},
      {delivered: 1, failing: MAX_ATTEMPTS},
      `${name}: the wave's retry owner retries only the failed target, once per attempt`);
  });
}
