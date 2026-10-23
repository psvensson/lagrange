// S2: genuine depth-0 -> depth-1 CDC relay hydrates a strict follower, then
// the same source debt reaches its real native leader through the depth-2 route.
// One critical target only: this is not the full multi-window W7 witness.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_OPERATION, TABLES, SERVICE_STATUS} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PEER_ADDRESS_STATUS} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_ENTRY_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {PARTITION_SERVICE_OPERATION, PARTITION_COMMITTED_COMMAND_OUTCOME} from
  '../../src/partition/partition-service-constants.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {readCommittedStatementOutcome} from '../../src/partition/partition-committed-statement-outcome.js';
import {readOwedCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_CDC_COMMAND} from '../../src/partition/partition-cdc-obligation-constants.js';
import {isCommittedCdcOutcome, isProvisionalCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {buildPartitionCdcPropagationSubscriber} from '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {resolveOperationalMessageGroupSelection, resolveOperationalMessageGroupSelectionAsync,
  buildMessageGroupOwnerNotReadyError} from '../../src/bootstrap/shared/message-group-selection.js';
import {SeedRuntimeBridgeOwner} from '../../src/bootstrap/owners/seed-runtime-bridge-owner.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {CDC_GROUP_PROPAGATION_STATE} from '../../src/topology/cdc-group-propagation-constants.js';
import {LatencyTreeService} from '../../src/topology/latency-tree-service.js';
import {buildSafeTargets} from '../../src/topology/cdc-group-propagation-routing.js';
import {provisionalRouteFixture, registrationInsert, sourceView, targetView, recordOf,
  json, note, pump, tick, releaseB, addressOf, payloadOf, cdcEvents,
  NODE_ID, SOURCE_GROUP, TARGET_GROUP, SOURCE_REPLICA, TARGET_REPLICAS,
  LEADER, FIRST_HOP, FOLLOWER, PARTITION_ID} from './message-group-native-provisional-route-fixture.js';

function commandOf(entry) {
  return entry.entryType === RAFT_RS_ENTRY_TYPE.NORMAL && entry.data ?
    JSON.parse(Buffer.from(entry.data, 'base64').toString()) : null;
}

function commandsFor(record, debt) {
  return record.entries.flatMap((entry) => {
    const command = commandOf(entry);
    const events = command?.events ?? (command ? [command] : []);
    return events.some((event) => event.eventKey === debt.eventKey) ? [{entry, events}] : [];
  });
}

function assertEnvelope(event, debt) {
  for (const [key, value] of Object.entries(JSON.parse(debt.eventJson))) {
    assert.deepEqual(event[key], value, `actual retained source field ${key}`);
  }
  assert.equal(event.eventKey, debt.eventKey);
  assert.equal(event.entryId, debt.entryId);
  assert.equal(event.sourceLogIndex, debt.logIndex);
  assert.equal(event.sourceOrdinal, debt.ordinal);
}

async function writeOrdinarySource(t, f, service, entryId) {
  assert.equal(f.producerLeader.cdcSubscribers.size, 0);
  const write = registrationInsert(service, entryId);
  const answer = await f.producerLeader.executeQuery(write.sql, write.params, {entryId});
  assert.equal(answer.success, true, `setup: released SERVICES ordinary SQL ${json(answer)}`);
  const debts = () => f.producer.services.map((replica) =>
    readOwedCdcObligations(replica.db).filter((debt) => debt.entryId === entryId));
  assert.equal(await f.producer.waitFor(() => debts().every((rows) => rows.length === 1)), true,
    'setup: every actual source voter retains the ordinary statement debt');
  const debt = debts()[0][0];
  for (const replica of f.producer.services) {
    const retained = readOwedCdcObligations(replica.db).find((row) => row.entryId === entryId);
    assert.deepEqual(retained, debt);
    const outcome = readCommittedStatementOutcome(replica, replica.getCommittedEntryKey({entryId}));
    assert.equal(outcome.state, PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED);
    assert.equal(outcome.outcome, PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED);
    assert.equal(outcome.logIndex, debt.logIndex);
    assert.equal(outcome.term, debt.term);
    const record = recordOf(replica, replica.partitionId);
    const entry = record.entries.find((item) => BigInt(item.index) === BigInt(debt.logIndex));
    assert.ok(entry);
    const command = commandOf(entry);
    assert.equal(command.type, PARTITION_SERVICE_OPERATION.QUERY);
    assert.equal(command.entryId, entryId);
    assert.equal(command.sql, write.sql);
    assert.deepEqual(command.params, write.params);
    assert.equal(BigInt(entry.term), BigInt(debt.term));
    assert.ok(BigInt(record.appliedIndex) >= BigInt(entry.index));
    assert.ok(BigInt(record.hardState.commit) >= BigInt(entry.index));
    const event = JSON.parse(debt.eventJson);
    assert.equal(event.tableName, TABLES.SERVICES);
    assert.equal(event.operation, CDC_OPERATION.INSERT);
    assert.equal(event.sourcePartition, PARTITION_ID);
    assert.equal(event.sourceReplica, f.producerLeader.replicaId);
    assert.equal(event.timestamp, command.timestamp);
    assert.equal(event.data.updated_at_hlc, command.timestamp);
    for (const [key, value] of Object.entries(write.row)) assert.deepEqual(event.data[key], value);
    const row = replica.db.prepare('SELECT * FROM services WHERE service_id = ?').get(service.replicaId);
    assert.equal(row.service_id, service.replicaId);
    assert.equal(row.status, SERVICE_STATUS.STOPPED);
    assert.equal(row.address, service.unifiedAddress);
  }
  t.diagnostic(json({stage: 'setup-released-services-query-and-exact-debt', answer, debt}));
  return debt;
}

function targets(f) {
  return buildSafeTargets({systemTableCache: f.source.systemTableCache,
    sourceGroupId: SOURCE_GROUP});
}

function assertPartialRouteSetup(t, f) {
  const first = f.first.raft.readStatus();
  const follower = f.follower.raft.readStatus();
  t.diagnostic(json({stage: 'setup-partial-route-observations-before-assertions', first, follower,
    firstRows: f.first.systemTableCache.getAll(TABLES.SERVICES),
    followerRows: f.follower.systemTableCache.getAll(TABLES.SERVICES),
    followerHints: f.follower.peerAddresses}));
  assert.notEqual(first.role, RAFT_ROLE.LEADER);
  assert.equal(first.leaderId, null);
  assert.equal(first.leaderAddressStatus, PEER_ADDRESS_STATUS.NO_LEADER);
  assert.equal(first.peerId, f.cutPeer);
  assert.equal(follower.role, RAFT_ROLE.FOLLOWER);
  assert.equal(follower.leaderId, LEADER);
  assert.equal(follower.leaderAddress, null);
  assert.equal(follower.leaderAddressStatus, PEER_ADDRESS_STATUS.UNAVAILABLE);
  assert.equal(f.follower.systemTableCache.get(TABLES.SERVICES, LEADER), undefined);
  assert.deepEqual(f.follower.peerAddresses, []);
  assert.equal(f.services.get(LEADER).raft.readStatus().role, RAFT_ROLE.LEADER);
  assert.equal(f.source.raft.readStatus().role, RAFT_ROLE.LEADER);
  const readiness = f.source.getMetadataIngressReadiness({requiredTables: [TABLES.SERVICES]});
  assert.equal(readiness.ready, true);
  for (const service of [f.first, f.follower]) {
    assert.equal(service.raft.readStatus().confState.voters.length, TARGET_REPLICAS.length);
    assert.deepEqual(service.raft.readStatus().confState, f.formed[0].confState);
  }
  const forward = f.first.resolveCDCForwardSelection({tableName: TABLES.SERVICES,
    operation: CDC_OPERATION.INSERT});
  assert.equal(forward.strictForwarding, true);
  assert.deepEqual(forward.targets.map(({serviceId, address}) => ({serviceId, address})),
    [{serviceId: FOLLOWER, address: addressOf(FOLLOWER)}]);
  f.capturedTargets = targets(f);
  assert.deepEqual(f.capturedTargets, [{groupId: TARGET_GROUP, coordinatorNodeId: NODE_ID,
    address: addressOf(FIRST_HOP)}]);
  f.followerBefore = follower;
  t.diagnostic(json({stage: 'setup-real-rf5-retained-reopens-and-partial-routes',
    formed: f.formed, first, follower, forward, targets: f.capturedTargets,
    reopens: f.events.filter((event) => event.kind === 'retained-reopen')}));
}

function connectSubscriber(f) {
  const cache = f.source.systemTableCache;
  f.tree = new LatencyTreeService({nodeId: NODE_ID, systemTableCache: cache});
  f.tree.initialize();
  f.tree.start({recomputeImmediately: true});
  f.topology = new CDCGroupPropagationService({nodeId: NODE_ID, systemTableCache: cache,
    messageRouter: f.router, latencyTreeService: f.tree});
  f.topology.initialize();
  f.topology.start();
  assert.equal(f.topology.state, CDC_GROUP_PROPAGATION_STATE.RUNNING);
  note(f, 'actual-topology-started', {state: f.topology.state,
    treeState: f.tree.state, treeStats: structuredClone(f.tree.stats), targets: targets(f)});
  const bridge = new SeedRuntimeBridgeOwner({delegates: {
    getLatencyTopology: () => ({cdcGroupPropagationService: f.topology}),
  }});
  const inventory = [...f.services.values()];
  assert.equal(inventory.length, TARGET_REPLICAS.length + 1, 'selection sees every hosted actual MG');
  const select = (options) => resolveOperationalMessageGroupSelection(inventory, options);
  assert.equal(select({requiredTables: [TABLES.SERVICES]}).service, f.source);
  f.subscriber = buildPartitionCdcPropagationSubscriber({tableName: TABLES.SERVICES,
    partitionId: PARTITION_ID, replicaId: f.producerLeader.replicaId,
    resolveOperationalMessageGroupSelection: select,
    resolveOperationalMessageGroupSelectionAsync: async (options) => {
      const selection = await resolveOperationalMessageGroupSelectionAsync(inventory, options);
      note(f, 'actual-source-selection', {serviceId: selection.service?.replicaId,
        groupId: selection.service?.groupId, ready: selection.ready});
      assert.equal(selection.service, f.source);
      return selection;
    },
    buildMessageGroupOwnerNotReadyError,
    beforePropagation: (event) => note(f, 'actual-subscriber-input', {event: structuredClone(event), source: sourceView(f)}),
    propagatePartitionCDCEvent: async (service, event, deliveryContext) => {
      assert.equal(service, f.source);
      const result = await bridge.propagatePartitionCDCEvent(service, event, deliveryContext);
      note(f, 'actual-topology-return', {event: structuredClone(event), result: structuredClone(result),
        source: sourceView(f), target: targetView(f)});
      return result;
    },
  });
  assert.equal(f.subscriber.canAcceptCDCEvent({...JSON.parse(f.debts[0].eventJson),
    eventKey: f.debts[0].eventKey}).ready, true);
}

function assertOwedWithoutAck(source, debts) {
  for (const peer of source) {
    for (const debt of debts) {
      const obligation = peer.obligations.find((row) => row.eventKey === debt.eventKey);
      assert.equal(obligation.delivered, false, 'provisional ingress retains source custody');
      assert.equal(obligation.eventJson, debt.eventJson);
    }
    const ack = peer.record.entries.some((entry) =>
      commandOf(entry)?.type === PARTITION_CDC_COMMAND.DELIVERED);
    assert.equal(ack,
      false, 'no source ACK is even appended before complete native acceptance');
  }
}

function pendingRouteSnapshot(f) {
  const topology = f.topology;
  const lane = f.producerLeader.cdcDelivery.obligationLane;
  const eventKinds = {};
  for (const event of f.events) eventKinds[event.kind] = (eventKinds[event.kind] ?? 0) + 1;
  return {
    phase: f.phase, eventKinds,
    // Already captured data only. In particular, no readStatus, laneOf,
    // readiness/selection, pump or diagnostic-owner call occurs at this cut.
    applicationEvents: f.events.filter((event) => event.kind.startsWith('application-') ||
      event.kind.startsWith('actual-') || event.kind === 'registered-handler' ||
      event.kind === 'held-b-before-dispatch'),
    nativeQueued: f.native.length, nativeHeld: f.heldNative.length,
    applicationsHeld: f.heldApplications.length,
    applicationSettlements: f.applicationSettlements.size,
    sourceLane: {tenureCurrent: lane.tenure === f.producerLeader.leadershipTenure,
      inFlight: lane.inFlight, rerun: lane.rerun, scan: structuredClone(lane.scan),
      pending: lane.pending.size, commands: lane.commands.size,
      retryArmed: lane.retryTimer !== null, flushArmed: lane.flushTimer !== null,
      lastDrive: lane.lastDrive, lastFlush: lane.lastFlush},
    topology: {state: topology.state, immediateTimers: topology.immediateBatchTimers.size,
      backgroundTimers: topology.backgroundRetryTimers.size,
      backgroundEntries: topology.backgroundRetryEntriesByKey.size,
      retrySleeps: topology.retrySleepReleases.size,
      immediateEntries: [...topology.immediateBatchEntriesByKey].map(([key, entry]) => ({
        key, sourceGroupId: entry.sourceGroupId, targets: structuredClone(entry.targets),
        timerPresent: entry.timer !== null, resolvers: entry.resolvers.length,
        pendingEvents: [...entry.pendingEventsByKey.values()].map((event) => ({
          eventKey: event.eventKey, tableName: event.tableName, operation: event.operation,
          serviceId: event.data?.service_id,
        })),
      }))},
  };
}

function requireReturn(f, replicaId, debt, predicate, label, afterOrdinal = -1) {
  const serviceId = JSON.parse(debt.eventJson).data.service_id;
  const candidates = f.events.filter((event) => event.kind === 'application-return' &&
    event.ordinal > afterOrdinal && event.address === addressOf(replicaId) &&
    cdcEvents(event.envelope).some((item) => item.data?.service_id === serviceId));
  const errors = f.events.filter((event) => event.kind === 'application-error');
  if (candidates.length === 0) {
    f.report({stage: 'missing-application-return-before-assertion', label, replicaId,
      eventKey: debt.eventKey, snapshot: pendingRouteSnapshot(f)});
  }
  assert.ok(candidates.length > 0, `${label}: actual registered handler returned; ${json(errors)}`);
  const result = candidates.find((candidate) => predicate(candidate.result,
    cdcEvents(candidate.envelope), TARGET_GROUP));
  const answers = candidates.map(({result}) => result);
  assert.ok(result, `${label}: expected canonical owner result, got ${json(answers)}`);
  for (const event of cdcEvents(result.envelope)) assertEnvelope(event, debt);
  return result;
}

function assertNativeReceipt(event, debt) {
  const [receipt] = event.result.cdcCommitted;
  const peer = event.target.find((item) => item.replicaId === LEADER);
  const retained = peer.record.entries.find((entry) =>
    BigInt(entry.index) === BigInt(receipt.logIndex));
  assert.ok(retained, 'native receipt identifies a retained entry at the actual result time');
  assert.equal(BigInt(retained.term), BigInt(receipt.term));
  assert.ok(BigInt(peer.record.hardState.commit) >= BigInt(retained.index));
  assert.ok(BigInt(peer.record.appliedIndex) >= BigInt(retained.index));
  const command = commandOf(retained);
  const events = command.events ?? [command];
  const exact = events.filter((item) => item.eventKey === debt.eventKey);
  assert.equal(exact.length, 1);
  assertEnvelope(exact[0], debt);
}

function assertActualIngress(f, replicaId, debt, depth) {
  const ingress = f.events.find((event) => event.kind === 'registered-handler' &&
    event.replicaId === replicaId &&
    cdcEvents(event.envelope).some((item) => item.eventKey === debt.eventKey));
  assert.ok(ingress, 'the exact registered handler received the source occurrence');
  assert.equal(payloadOf(ingress.envelope).relayDepth ?? 0, depth);
  assertEnvelope(cdcEvents(ingress.envelope).find((item) => item.eventKey === debt.eventKey), debt);
  return ingress;
}

function assertSourceGroupApplied(provisional, debt) {
  const record = provisional.sourceGroup.record;
  const committed = commandsFor(record, debt).find(({entry}) =>
    BigInt(record.hardState.commit) >= BigInt(entry.index) &&
    BigInt(record.appliedIndex) >= BigInt(entry.index));
  assert.ok(committed, 'mixed coverage includes actual source MG native application');
  assertEnvelope(committed.events.find((item) => item.eventKey === debt.eventKey), debt);
}

test('SERVICES scan releases provisional relay to the real native leader', async (t) => {
  const f = await provisionalRouteFixture(t);
  assertPartialRouteSetup(t, f);
  const a = await writeOrdinarySource(t, f, f.source, 'provisional-route-a');
  const b = await writeOrdinarySource(t, f, f.services.get(LEADER), 'provisional-route-b');
  f.debts = [a, b];
  assert.ok(a.logIndex < b.logIndex, 'B is later metadata in the same actual source scan');
  connectSubscriber(f);
  await f.producerLeader.subscribeToCDCWithHandshake(f.subscriber,
    {subscriberId: 'native-provisional-route'});
  const wrapper = f.producerLeader.cdcSubscriberWrappers.get(f.subscriber);
  const tenure = f.producerLeader.leadershipTenure;
  await tick(f);

  const provisional = requireReturn(f, FOLLOWER, a, isProvisionalCdcOutcome, 'S2_PROVISIONAL_A');
  assert.equal(payloadOf(provisional.envelope).relayDepth, 1, 'F1 produced the genuine first relay');
  assertActualIngress(f, FIRST_HOP, a, 0);
  const localIngress = assertActualIngress(f, FOLLOWER, a, 1);
  assert.equal(localIngress.status.role, RAFT_ROLE.FOLLOWER);
  assert.equal(localIngress.status.leaderAddressStatus, PEER_ADDRESS_STATUS.UNAVAILABLE);
  assertSourceGroupApplied(provisional, a);
  const direct = f.events.find((event) => event.kind === 'application-send' &&
    event.address === addressOf(FIRST_HOP) &&
    cdcEvents(event.envelope).some((item) => item.eventKey === a.eventKey));
  assert.ok(direct);
  assert.equal(payloadOf(direct.envelope).relayDepth ?? 0, 0);
  assertOwedWithoutAck(provisional.source, f.debts);
  const local = provisional.target.find((peer) => peer.replicaId === FOLLOWER);
  assert.equal(local.a.service_id, SOURCE_REPLICA);
  for (const peer of provisional.target) assert.equal(commandsFor(peer.record, a).length, 0);

  const held = f.events.find((event) => event.kind === 'held-b-before-dispatch');
  assert.ok(held, 'S2_WEAK_PROGRESS: actual source scan reached later B while A remained owed');
  assert.ok(held.ordinal > provisional.ordinal);
  const aggregate = f.events.find((event) => event.kind === 'actual-topology-return' &&
    event.event.eventKey === a.eventKey);
  assert.ok(aggregate, 'source scan consumes the real complete topology outcome');
  assert.equal(aggregate.result.targetGroupCount, 1);
  assert.equal(isProvisionalCdcOutcome(aggregate.result, [aggregate.event]), true,
    'complete mixed native/provisional coverage permits scanning B without ACK');
  assertOwedWithoutAck(held.source, f.debts);
  assert.equal(f.follower.systemTableCache.get(TABLES.SERVICES, LEADER), undefined);
  assert.deepEqual(targets(f), f.capturedTargets);
  t.diagnostic(json({stage: 'semantic-provisional-a-retains-custody-and-scan-reaches-b', provisional, held}));

  releaseB(f);
  await tick(f);
  const hydrated = requireReturn(f, FOLLOWER, b, isProvisionalCdcOutcome, 'S2_PROVISIONAL_B');
  assert.equal(payloadOf(hydrated.envelope).relayDepth, 1);
  assertActualIngress(f, FIRST_HOP, b, 0);
  assertActualIngress(f, FOLLOWER, b, 1);
  assertOwedWithoutAck(hydrated.source, f.debts);
  const after = f.follower.raft.readStatus();
  assert.equal(f.follower.raft, f.followerBeforePort);
  assert.equal(after.lifecycleIncarnation, f.followerBefore.lifecycleIncarnation);
  assert.equal(after.configurationKey, f.followerBefore.configurationKey);
  assert.deepEqual(after.confState, f.followerBefore.confState);
  assert.equal(after.role, RAFT_ROLE.FOLLOWER);
  assert.equal(after.leaderId, LEADER);
  assert.equal(after.leaderAddressStatus, PEER_ADDRESS_STATUS.RESOLVED);
  assert.equal(after.leaderAddress, addressOf(LEADER));
  const hydratedRow = f.follower.systemTableCache.get(TABLES.SERVICES, LEADER);
  assert.equal(hydratedRow.status, SERVICE_STATUS.STOPPED);
  assert.ok(f.events.some((event) => event.kind === 'actual-peer-reconciliation' &&
      event.row?.service_id === LEADER),
  'the real cache change invoked the existing peer reconciliation owner');
  assert.equal(f.first.systemTableCache.get(TABLES.SERVICES, LEADER), undefined,
    'first relay did not hydrate itself');
  assert.deepEqual(targets(f), f.capturedTargets, 'STOPPED B does not replace the captured F1 target');
  t.diagnostic(json({stage: 'semantic-stopped-b-hydrates-same-follower-route', hydrated, after}));

  const drive = f.producerLeader.cdcDelivery.driveCdcObligations('native-provisional-route-redrive')
    .then((answer) => ({answer}), (error) => ({error}));
  await tick(f);
  // An always-local-after-B mutation produces a concrete provisional result
  // here. It cannot pass by eventually timing out or merely touching the cache.
  const forwarded = requireReturn(f, FOLLOWER, a, isCommittedCdcOutcome,
    'S2_F3_FOLLOWER_MUST_RELEASE_TO_NATIVE', hydrated.ordinal);
  assertNativeReceipt(forwarded, a);
  const native = requireReturn(f, LEADER, a, isCommittedCdcOutcome, 'S2_NATIVE_AFTER_B');
  assert.equal(payloadOf(native.envelope).relayDepth, 2,
    'terminal native route consumes the remaining hop');
  assert.ok(native.ordinal > hydrated.ordinal);
  assertActualIngress(f, LEADER, a, 2);
  assertNativeReceipt(native, a);
  for (const peer of native.source) {
    assert.equal(peer.obligations.find((item) => item.eventKey === a.eventKey).delivered, false,
      'source custody still exists when the first terminal native answer returns');
  }
  assert.equal(f.producerLeader.cdcSubscriberWrappers.get(f.subscriber), wrapper);
  assert.equal(f.producerLeader.leadershipTenure, tenure);
  assert.deepEqual(targets(f), f.capturedTargets);
  assert.notEqual(f.first.raft.readStatus().role, RAFT_ROLE.LEADER);
  assert.equal(f.first.raft.readStatus().leaderId, null);
  assert.equal(f.follower.raft.readStatus().role, RAFT_ROLE.FOLLOWER);
  const ingress = f.events.filter((event) => event.kind === 'registered-handler' &&
    event.replicaId === FOLLOWER);
  for (const event of ingress) {
    assert.equal(event.status.role, RAFT_ROLE.FOLLOWER);
    assert.equal(event.status.leaderId, LEADER);
    assert.equal(event.status.lifecycleIncarnation, f.followerBefore.lifecycleIncarnation);
    assert.equal(event.status.configurationKey, f.followerBefore.configurationKey);
  }
  assert.ok(f.heldNative.some(({envelope}) => envelope.from === f.cutPeer));
  assert.ok(f.heldNative.some(({envelope}) => envelope.to === f.cutPeer));
  const driven = await drive;
  assert.equal(driven.error, undefined, json(driven.error));
  await f.producerLeader.cdcDelivery.flushCdcAcknowledgements('native-provisional-route-receipts');
  assert.equal(await f.producer.waitFor(() => sourceView(f).every((peer) =>
    peer.obligations.every((obligation) => obligation.delivered === true))), true,
  'actual source CDC_DELIVERED application settles A and B only after native delivery');
  for (const debt of f.debts) {
    assertNativeReceipt(requireReturn(f, LEADER, debt,
      isCommittedCdcOutcome, 'S2_NATIVE_RECEIPT_BEFORE_ACK'), debt);
  }
  for (const peer of sourceView(f)) {
    for (const obligation of peer.obligations) {
      const entry = peer.record.entries.find((item) =>
        BigInt(item.index) === BigInt(obligation.deliveredIndex));
      assert.equal(commandOf(entry).type, PARTITION_CDC_COMMAND.DELIVERED);
      assert.equal(BigInt(entry.term), BigInt(obligation.deliveredTerm));
      assert.ok(BigInt(peer.record.appliedIndex) >= BigInt(entry.index));
    }
  }
  t.diagnostic(json({stage: 'semantic-fresh-native-route-and-source-ack', native,
    source: sourceView(f), targets: targets(f)}));
  await pump(f);
});
