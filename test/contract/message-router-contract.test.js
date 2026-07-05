/**
 * Stub/real contract suite for the messageRouter seam.
 *
 * The SAME behavioral assertions run against the real MessageRouter and the
 * canonical contract stub, so stub drift — tests modeling a healthier
 * transport than reality — fails here instead of shipping (the affinity-demo
 * run-25/26 class, generalized). Extend this pattern to other central seams
 * (repository visibility reads, coordinator admission) by adding a
 * *-contract-support.js with the shared assertions and running them against
 * both sides.
 */

import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  assertMessageRouterDeliveryContract,
  createContractMessageRouterStub,
} from './message-router-contract-support.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const CONTRACT_NODE_ID = 'contract-suite-node';

test('real MessageRouter honors the delivery contract', async (t) => {
  await assertMessageRouterDeliveryContract(t, {
    name: 'real MessageRouter',
    registeredAddress: `${CONTRACT_NODE_ID}/service/contract-probe`,
    missingAddress: `${CONTRACT_NODE_ID}/service/contract-missing`,
    async createRouter() {
      const router = new MessageRouter({nodeId: CONTRACT_NODE_ID});
      await router.initialize({startServer: false});
      router.logger = {info() {}, error() {}, warn() {}, debug() {}};
      return {
        router,
        teardown: () => router.shutdown?.(),
      };
    },
  });
});

test('contract stub factory honors the same delivery contract', async (t) => {
  await assertMessageRouterDeliveryContract(t, {
    name: 'contract stub',
    registeredAddress: 'stub-node/service/contract-probe',
    missingAddress: 'stub-node/service/contract-missing',
    async createRouter() {
      return {router: createContractMessageRouterStub(), teardown: null};
    },
  });
});

test('contract stub can reproduce the ACK-swallowed noHandler drop ' +
  '(DELIVERED at the transport is NOT owner-processed)', async (t) => {
  const droppedAddress = 'stub-node/service/mid-startup-target';
  const stub = createContractMessageRouterStub({
    simulateNoHandlerAckAddresses: [droppedAddress],
  });
  const response = await stub.deliver(droppedAddress, {type: 'WAKE'}, {});
  t.equal(response.acknowledged, true, 'the transport ACKs the delivery');
  t.equal(
    response.noHandler,
    true,
    'the ACK carries noHandler=true — consumers that only check ' +
      'acknowledged treat a dropped message as success (the run-26 wake ' +
      'drop, generalized)',
  );
});
