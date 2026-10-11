import {test} from '../../src/test-helpers/tap.js';
import {createControllableMessageGroupService,
  registerMessageGroupServiceLifecycleHooks} from './message-group-service-test-support.js';
import {ControllableConsensusPort, applyCommandThroughApplicationOwner,
  testCoreOk} from '../test-helpers/controllable-consensus-port.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {buildPartitionCdcPropagationSubscriber} from '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {CDC_COMMIT_WAIT_BOUND, readCdcCommitWaits, registerCdcCommitWait} from
  '../../src/message-group/message-group-cdc-commit-owner.js';
import {CDC_COMPLETION, buildCommittedCdcOutcome, completeCdcPropagation,
  isCommittedCdcOutcome, cdcCommitWaitIdentity} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../src/raft/raft-operation-port-request.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {CDC_SOURCE_SCOPE_AUTHORITY, buildCdcSourceScopeEvidence} from
  '../../src/partition/partition-cdc-source-coverage.js';

registerMessageGroupServiceLifecycleHooks();

function sourceScope(partitionId = 'nodes-p1') {
  return buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    partitionDescriptor: {partition_id: partitionId, table_id: 't-nodes',
      partition_version: 1, partition_key_start: null,
      partition_key_end: null, state: 'NORMAL'},
    tableDescriptor: {table_id: 't-nodes', table_name: 'nodes',
      active_partition_version: 1, pending_partition_version: null,
      partition_transition_state: null, partition_transition_generation: 1},
  });
}

async function fixture(t, voters = 2) {
  const timeSource = new VirtualTimeSource({startMs: 1000});
  const router = new MessageRouter({nodeId: 'cdc-commit', bootIncarnation: TEST_BOOT_INCARNATION});
  await router.initialize({startServer: false});
  const port = new ControllableConsensusPort({role: 'leader'});
  const service = createControllableMessageGroupService({groupId: 'mg-cdc',
    replicaId: 'mg-cdc-r1', nodeId: 'cdc-commit', transport: router, timeSource}, port);
  await service.initialize();
  service.replicaIds = voters === 1 ? ['mg-cdc-r1'] : ['mg-cdc-r1', 'mg-cdc-r2'];
  port.role = 'leader';
  port.leaderId = 'mg-cdc-r1';
  const commands = [];
  port.proposeHandler = (command) => {
    commands.push(command); return testCoreOk();
  };
  t.teardown(async () => {
    await service.shutdown(); await router.shutdown();
  });
  const event = {tableName: 'nodes', operation: 'UPSERT', data: {node_id: 'n1'},
    timestamp: service.hlcClock.now().toString(), sourcePartition: 'nodes-p1',
    eventKey: 'entry:1', sourceLogIndex: 1, sourceOrdinal: 0,
    sourceScope: sourceScope()};
  return {service, port, event, commands, timeSource};
}

for (const voters of [1, 2]) {
  test(`durable CDC awaits committed application with ${voters} voter hint(s)`, async (t) => {
    const {service, port, event, commands} = await fixture(t, voters);
    let settled = false;
    const pending = service.applyCDCEvent(event.tableName, event.operation, event.data,
      {...event, skipSubscriptionCheck: true})
      .then((answer) => {
        settled = true; return answer;
      });
    await new Promise(setImmediate);
    t.equal(commands.length, 1, 'durable transfer requires one real consensus proposal');
    t.equal(settled, false, 'leader append or local cache visibility does not acknowledge');
    t.equal(service.systemTableCache.get(event.tableName, event.data.node_id)?.node_id,
      event.data.node_id, 'strict leader ingress preserves sanctioned early visibility');
    if (commands[0]) port.commit(commands[0]);
    const answer = await pending;
    t.equal(answer?.success, true, 'commit produces positive semantic acceptance');
    t.equal(answer?.cdcCommitted?.[0]?.sourcePartition, event.sourcePartition);
    t.equal(answer?.cdcCommitted?.[0]?.eventKey, event.eventKey);
  });
}

test('strict leader ingress reports provisional only after the commit wait expires', async (t) => {
  const {service, event, commands, timeSource} = await fixture(t);
  const pending = service.applyCDCEvent(event.tableName, event.operation, event.data,
    {...event, skipSubscriptionCheck: true});
  await new Promise(setImmediate);
  t.equal(commands.length, 1);
  t.equal(service.systemTableCache.get(event.tableName, event.data.node_id)?.node_id,
    event.data.node_id, 'the early cache apply genuinely completed');
  timeSource.advance(service.computeCdcProposeTimeoutMs(1));
  const answer = await pending;
  t.equal(answer.success, false);
  t.equal(answer.error, CDC_COMPLETION.PROVISIONAL);
  t.equal(answer.cdcProvisional?.[0]?.eventKey, event.eventKey,
    'bounded unknown is returned as payload-bound provisional visibility');
});

test('propagation subscriber preserves a refused semantic result', async (t) => {
  const service = {canAcceptCDCEvent: () => ({ready: true})};
  let afterCalls = 0;
  const subscriber = buildPartitionCdcPropagationSubscriber({tableName: 'nodes',
    resolveOperationalMessageGroupSelectionAsync: async () => ({ready: true, service}),
    propagatePartitionCDCEvent: async () => ({success: false, error: 'stopped'}),
    afterPropagation: () => {
      afterCalls++;
    },
  });
  await t.rejects(() => subscriber({tableName: 'nodes', operation: 'UPSERT', data: {node_id: 'n1'}}),
    'stopped propagation cannot resolve as completed handling');
  t.equal(afterCalls, 0, 'no downstream completion callback on refusal');
});

for (const answer of [{acknowledged: true, noHandler: true},
  {acknowledged: true, deferRetry: true}, {acknowledged: true, success: false},
  {acknowledged: true}]) {
  test(`durable topology fanout rejects incomplete acceptance ${JSON.stringify(answer)}`, async (t) => {
    const owner = Object.create(CDCGroupPropagationService.prototype);
    owner.nodeId = 'source';
    owner.isPropagationStopped = () => false;
    owner.messageRouter = {deliver: async () => answer};
    const event = {tableName: 'nodes', operation: 'UPSERT', data: {node_id: 'n1'},
      sourcePartition: 'nodes-p1', eventKey: 'entry:1', timestamp: '1000:0:n1'};
    const failures = await owner.deliverToTargets({...event, sourceGroupId: 'mg-source',
      targets: [{groupId: 'mg-target', coordinatorNodeId: 'n2', address: 'n2/message-group/r1'}]});
    t.equal(failures.length, 1, 'transport ACK is not event-bound committed acceptance');
  });
}

test('late CDC routing callback cannot retire a replacement wait', async (t) => {
  const {service, event, timeSource} = await fixture(t);
  const first = registerCdcCommitWait(service, [event], 10);
  timeSource.advance(10);
  t.equal((await first.promise).success, false);
  const second = registerCdcCommitWait(service, [event], 10);
  first.resolve({success: false, error: 'late-route-failure'});
  t.equal(second.active(), true, 'old route owns only its retired wait');
  second.resolve(buildCommittedCdcOutcome([event], service.groupId, {index: 1, term: 1}));
  t.equal((await second.promise).success, true);
});

test('CDC committed receipt covers exactly the requested semantic events', async (t) => {
  const {service, event} = await fixture(t);
  const valid = buildCommittedCdcOutcome([event], service.groupId, {index: 1, term: 1});
  t.equal(isCommittedCdcOutcome(valid, [event], service.groupId), true);
  t.equal(isCommittedCdcOutcome({...valid,
    cdcCommitted: [...valid.cdcCommitted, {...valid.cdcCommitted[0], eventKey: 'unrequested'}]},
  [event], service.groupId), false, 'extra key is not the exact requested batch');
  t.equal(isCommittedCdcOutcome({...valid,
    cdcCommitted: [...valid.cdcCommitted, valid.cdcCommitted[0]]},
  [event, {...event, eventKey: 'missing'}], service.groupId), false);
  const legacy = {tableName: 'nodes', operation: 'DELETE', data: {node_id: 'legacy'},
    timestamp: event.timestamp};
  t.not(cdcCommitWaitIdentity([event]), cdcCommitWaitIdentity([event, legacy]),
    'mixed batch cannot join a wait for a different command');
});

test('synchronous one-voter application settles the already registered CDC wait', async (t) => {
  const {service, port, event} = await fixture(t, 1);
  port.proposeHandler = (command) => {
    port.commit(command); return testCoreOk();
  };
  const answer = await service.applyCDCEvent(event.tableName, event.operation, event.data, event);
  t.equal(isCommittedCdcOutcome(answer, [event], service.groupId), true);
});

test('an exact duplicate joins one fixed deadline while changed payload is refused', async (t) => {
  const {service, event, timeSource} = await fixture(t);
  const first = registerCdcCommitWait(service, [event], 10);
  timeSource.advance(5);
  const duplicate = registerCdcCommitWait(service, [{...event, data: {...event.data}}], 10);
  const conflict = registerCdcCommitWait(service,
    [{...event, data: {...event.data, status: 'changed'}}], 10);
  t.equal(first.promise, duplicate.promise, 'same semantic bytes join the original wait');
  t.same(await conflict.promise, {success: false, error: CDC_COMPLETION.INVALID,
    deferRetry: false}, 'one request identity cannot own conflicting payload bytes');
  t.equal(readCdcCommitWaits(service).size, 1, 'conflict allocates no second owner');
  timeSource.advance(4);
  t.equal(first.active(), true, 'duplicate does not shorten the first wait');
  timeSource.advance(1);
  t.equal((await first.promise).error, CDC_COMPLETION.UNKNOWN,
    'duplicate does not extend the first wait');
});

test('conflicting payload bytes at one source identity propose no second command', async (t) => {
  const {service, port, event, commands} = await fixture(t);
  const pending = service.applyCDCEvent(event.tableName, event.operation, event.data, event);
  await new Promise(setImmediate);
  const conflictEvent = {...event, data: {...event.data, status: 'changed'}};
  const conflict = await service.applyCDCEvent(
    conflictEvent.tableName, conflictEvent.operation, conflictEvent.data, conflictEvent);
  t.equal(conflict.error, CDC_COMPLETION.INVALID);
  t.equal(conflict.deferRetry, false);
  t.equal(commands.length, 1, 'conflict is refused before append');
  port.commit(commands[0]);
  t.equal((await pending).success, true, 'the original semantic command still completes');
});

test('CDC commit waits refuse event, byte and aggregate resource overflow without retention',
  async (t) => {
    const {service, event} = await fixture(t);
    const events = (prefix, count) => Array.from({length: count}, (_unused, index) => ({
      ...event, sourcePartition: `${prefix}-partition`, eventKey: `${prefix}:${index}`,
      data: {...event.data, node_id: `${prefix}-${index}`},
    }));
    const countOverflow = registerCdcCommitWait(service,
      events('count', CDC_COMMIT_WAIT_BOUND.MAX_EVENTS_PER_WAIT + 1), 100);
    const byteOverflow = registerCdcCommitWait(service,
      [{...event, eventKey: 'byte-overflow', data: {payload: 'x'.repeat(
        CDC_COMMIT_WAIT_BOUND.MAX_BYTES_PER_WAIT)}}], 100);
    t.equal((await countOverflow.promise).error, CDC_COMPLETION.BACKPRESSURE);
    t.equal((await byteOverflow.promise).error, CDC_COMPLETION.BACKPRESSURE);
    t.same(readCdcCommitWaits(service), {
      size: 0,
      maxCapacity: CDC_COMMIT_WAIT_BOUND.MAX_WAITS,
      pendingEvents: 0,
      pendingBytes: 0,
      closed: false,
    }, 'per-wait refusals retain no command bytes');
    const first = registerCdcCommitWait(service, events('first', 200), 100);
    const second = registerCdcCommitWait(service, events('second', 200), 100);
    const aggregateOverflow = registerCdcCommitWait(service, events('third', 200), 100);
    t.equal((await aggregateOverflow.promise).error, CDC_COMPLETION.BACKPRESSURE,
      'aggregate event bound refuses a third wait');
    t.equal(readCdcCommitWaits(service).pendingEvents, 400);
    first.resolve({success: false, error: 'test-release'});
    second.resolve({success: false, error: 'test-release'});
    await Promise.all([first.promise, second.promise]);
    t.equal(readCdcCommitWaits(service).pendingEvents, 0,
      'resolution releases retained event accounting');
  });

test('source completion is bound to the exact source message group', async (t) => {
  const {service, event} = await fixture(t);
  const sourceAnswer = buildCommittedCdcOutcome([event], 'mg-wrong', {index: 1, term: 1});
  const completed = completeCdcPropagation(event, sourceAnswer, [], {
    sourceGroupId: service.groupId,
  });
  t.equal(completed.success, false);
  t.equal(completed.error, CDC_COMPLETION.UNKNOWN,
    'a committed receipt from another group cannot complete the source leg');
});

test('same-service reinitialization fences old application callbacks from replacement waits',
  async (t) => {
    const {service, port, event} = await fixture(t);
    const oldApply = port.request[RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY];
    const old = registerCdcCommitWait(service, [event], 100);
    const shutdown = service.shutdown();
    t.equal((await old.promise).error, CDC_COMPLETION.UNKNOWN,
      'shutdown releases the old generation before its first await completes');
    await shutdown;
    service.replicaIds = [service.replicaId];
    await service.initialize();
    const replacement = registerCdcCommitWait(service, [event], 100);
    const command = {type: MESSAGE_GROUP_COMMAND_TYPE.CDC, ...event};
    applyCommandThroughApplicationOwner({
      database: service.db,
      groupId: service.groupId,
      index: 1,
      term: 1,
      command,
      applyCommittedEntry: oldApply,
    });
    t.equal(replacement.active(), true,
      'old generation afterCommit cannot settle the replacement owner');
    applyCommandThroughApplicationOwner({
      database: service.db,
      groupId: service.groupId,
      index: 2,
      term: 1,
      command,
      applyCommittedEntry:
        port.request[RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY],
    });
    t.equal(isCommittedCdcOutcome(await replacement.promise, [event], service.groupId), true,
      'the replacement generation settles only from its own callback');
  });
