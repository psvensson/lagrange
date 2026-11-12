// Healthy-schedule cost at the actual consensus proposal port, including the
// source group and all target groups. Native RF1 groups commit/apply; only the
// inter-group transport and route projection are controlled. This does not
// measure source partition writes/ACKs, membership setup, or physical network cost.
import {positionRecipients} from '../test-helpers/cdc-source-range-fixture.js';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {pump, recipientFixture, NODE_ID} from '../message-group/message-group-native-custody-fixture.js';
import {createDurableCdcEvent, propagateToEveryRecipient, createGroupRow,
  createMessageGroupServiceRow, createTopologyCache, setupConfig, teardownConfig} from
  './cdc-group-propagation-service-harness.js';

const WAVES = 4;
const GROUPS = 3;
const PROPOSALS_PER_WAVE_GROUP = 1;
const SETTLE_ROUNDS = 8;

afterEach(teardownConfig);

function assertProposalBound(proposals) {
  assert.ok(proposals.length <= PROPOSALS_PER_WAVE_GROUP * WAVES * GROUPS,
    'actual consensus proposals <= c*K*M (c=1, K=4 waves, M=3 groups including source)');
}

async function healthyWaves(t, duplicateProposals) {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const fixtures = [];
  const proposals = [];
  for (let index = 0; index < GROUPS; index += 1) {
    const f = await recipientFixture(t, 'cost-row', {replicaCount: 1, groupId: `cost-group-${index}`});
    fixtures.push(f);
    const service = f.services[0];
    const native = service.raft;
    // Observe EVERY invocation, including rejected/retried ones, before native
    // admission. Forward unchanged to the existing native port. The negative
    // injects a second real proposal here, leaving router delivery count intact.
    service.raft = Object.freeze({...native, propose(command) {
      const submit = () => {
        proposals.push({groupId: service.groupId, command});
        return native.propose(command);
      };
      const answer = submit();
      if (duplicateProposals) submit();
      return answer;
    }});
    t.after(() => {
      service.raft = native;
    });
  }
  const services = fixtures.map((f) => f.services[0]);
  // CDC Stage 3: every recipient node starts from the synthetic source's start.
  positionRecipients(services,
    createDurableCdcEvent({tableName: TABLES.CONFIG}).sourcePartition, TABLES.CONFIG);
  const [source] = services;
  let deliveries = 0;
  const topology = new CDCGroupPropagationService({nodeId: NODE_ID,
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: NODE_ID, [COLUMN.LATENCY_GROUP_ID]: source.groupId}],
      groups: services.map((s) => createGroupRow(s.groupId, NODE_ID)),
      services: services.slice(1).map((s) => createMessageGroupServiceRow(s.replicaId,
        NODE_ID, s.unifiedAddress, RAFT_ROLE.LEADER, s.groupId)),
    }),
    messageRouter: {async deliver(address, payload, options) {
      deliveries += 1;
      const target = services.find((s) => s.unifiedAddress === address);
      assert.ok(target, 'the transport reaches a real target owner');
      return buildDeliveryEnvelope({acknowledged: true},
        await target.handleLatencyCdcPropagationBatchMessage(`cost-${deliveries}`,
          options.prepareDeliveryMessage(payload, options.remainingMs())));
    }},
    latencyTreeService: {getRoutingOrder: () => services.map((s) => s.groupId)},
    nowFn: () => fixtures[0].clocks[0].now(),
  });
  topology.initialize();
  topology.start();
  t.after(() => topology.stop());
  for (let wave = 0; wave < WAVES; wave += 1) {
    const before = services.map((service) =>
      BigInt(RaftRsDurableStore.readDurableRecordIn(service.db, service.groupId).appliedIndex));
    const key = `cost-row-${wave}`;
    const event = createDurableCdcEvent({tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
      data: {config_key: key, config_value: `value-${wave}`}, eventKey: `cost-event-${wave}`,
      sourceLogIndex: wave + 1});
    let result;
    let failure;
    const pending = propagateToEveryRecipient(topology, source, [event])
      .then((value) => {
        result = value;
      }, (error) => {
        failure = error;
      });
    for (let round = 0; round < SETTLE_ROUNDS && !result && !failure; round += 1) {
      for (const f of fixtures) await pump(f);
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ifError(failure);
    assert.equal(result?.success, true, `real native receipts settle each healthy wave: ${JSON.stringify({result, proposals: proposals.length, deliveries, waiters: services.map((s)=>s.cdcCommitWaiters.size)})}`);
    await pending;
    for (const [index, service] of services.entries()) {
      assert.equal(service.systemTableCache.get(TABLES.CONFIG, key)?.config_value, `value-${wave}`);
      const record = RaftRsDurableStore.readDurableRecordIn(service.db, service.groupId);
      assert.ok(BigInt(record.appliedIndex) > before[index],
        'each wave advances actual native application beyond its prior frontier');
    }
  }
  assert.equal(deliveries, WAVES * (GROUPS - 1), 'transport count is a separate metric');
  for (const service of services) {
    assert.equal(proposals.filter((p) => p.groupId === service.groupId).length,
      WAVES * (duplicateProposals ? 2 : 1), 'every source and target proposal is included');
  }
  return proposals;
}

test('CDCGroupPropagationService healthy native proposal cost includes source and every target',
  async (t) => assertProposalBound(await healthyWaves(t, false)));

test('proposal-cost negative detects extra native proposals despite unchanged transport count',
  async (t) => {
    const proposals = await healthyWaves(t, true);
    assert.throws(() => assertProposalBound(proposals), /actual consensus proposals/);
  });
