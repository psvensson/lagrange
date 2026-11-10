// PartitionService is assembled by constructor injection (quest
// partition-service-constructor-injection): no method is copied onto its
// prototype, each collaborator it used to feature-detect is validated where
// it is wired, an unwired late-bound collaborator answers the named state,
// and the admission stores are named fields of the owner that re-drives them.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  ReadOnlySystemTableCache,
  createReadOnlyCache,
} from '../../src/cache/read-only-system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_COLLABORATOR as COLLABORATOR,
  PARTITION_SERVICE_COLLABORATOR_ERROR_CODE as ERROR_CODE,
  PARTITION_SERVICE_COLLABORATOR_UNWIRED as UNWIRED,
  readWiredReadinessService,
} from '../../src/partition/partition-service-collaborators.js';
import {PartitionServiceRowOwner} from
  '../../src/partition/partition-service-row-owner.js';
import {
  admitGroupPeer,
  createGroupAdmissionLiveness,
  takeGroupAdmissionsInFlight,
} from '../../src/raft/raft-rs-group-membership-admission.js';
import {
  proposePeerRetirement,
  takeAdmissionsInFlight,
  takeDeferredRetirements,
} from '../../src/partition/partition-service-raft-membership-administration.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME as ADMISSION,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {settledTurn} from '../../src/raft/raft-rs-turn-answer.js';
import {partitionServiceContext} from '../helpers/partition-service-fixture.js';
import {createControllablePartitionService} from './partition-service-test-support.js';

const BAG_MODULES = Object.freeze([
  'durability-fitness', 'hydration-image-methods', 'leader-activation-methods',
  'leadership-transfer', 'learner-promotion-count-check-methods',
  'learner-promotion-methods', 'learner-promotion-proof-methods',
  'learner-promotion-wake-methods', 'lifecycle-methods',
  'merge-replication-methods', 'merge-replication-resumption-methods',
  'metadata-delivery-methods', 'participant-transaction-cadence-methods',
  'rebalancer-methods', 'remote-query-methods', 'removal-serving-methods',
  'source-replication-start-methods', 'split-mirror-queue-methods',
]);
// The prototype surface before the quest: 160 methods and the constructor.
const PROTOTYPE_NAME_COUNT = 161;
const PEER = Object.freeze({replicaIdentity: 'peer-r2', peerAddress: 'n2/partition/peer-r2'});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'construction-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function options(overrides = {}) {
  return {partitionId: 'construction-p1', tableId: 'construction_rows',
    replicaId: 'construction-p1-r1', nodeId: 'construction-node', ...overrides};
}

function refusal(collaborator) {
  return (error) => error.code === ERROR_CODE.INVALID &&
    error.collaborator === collaborator;
}

function coordinatorFake() {
  return {syncOwnerDependencies() {}, initialize() {}, async shutdown() {},
    controlPlaneReadinessService: null};
}

test('the prototype is declared, never copied: the same surface, no bag', async () => {
  const names = Object.getOwnPropertyNames(PartitionService.prototype);
  assert.equal(names.length, PROTOTYPE_NAME_COUNT, 'the same 161 prototype names');
  assert.deepEqual(Object.keys(PartitionService.prototype), [],
    'no enumerable member was copied onto the prototype');
  for (const name of BAG_MODULES) {
    const module = await import(`../../src/partition/partition-service-${name}.js`);
    const bags = Object.keys(module).filter((key) =>
      /^create\w*Methods$/u.test(key) || /_METHODS$/u.test(key));
    assert.deepEqual(bags, [], `${name} exports no method bag`);
  }
});

test('a malformed collaborator is refused at construction, typed', () => {
  const cases = [
    [COLLABORATOR.SYSTEM_TABLE_CACHE, {systemTableCache: {get() {}}}],
    [COLLABORATOR.CDC_INTEGRATION_SERVICE, {cdcIntegrationService: {}}],
    [COLLABORATOR.REBALANCE_COORDINATOR, {rebalanceCoordinator: {initialize() {}}}],
    [COLLABORATOR.REPLICA_STATE_MACHINE, {replicaStateMachine: {}}],
    [COLLABORATOR.INITIALIZATION_STAGE_HOOK, {onInitializationStage: true}],
    [COLLABORATOR.SNAPSHOT_CATCHUP_HOOK, {onSnapshotCatchupNeeded: 'hook'}],
  ];
  for (const [collaborator, given] of cases) {
    assert.throws(() => new PartitionService(options(given)), refusal(collaborator),
      `${collaborator} refused`);
  }
  const complete = new PartitionService(options({
    systemTableCache: new SystemTableCache(), rebalanceCoordinator: coordinatorFake(),
    onInitializationStage: () => {}, onSnapshotCatchupNeeded: null}));
  assert.equal(complete.onSnapshotCatchupNeeded, null, 'an absent hook is no hook');
});

test('every later wiring validates before anything changes', () => {
  const cache = new SystemTableCache();
  const coordinator = coordinatorFake();
  const service = new PartitionService(options({systemTableCache: cache,
    rebalanceCoordinator: coordinator}));
  assert.throws(() => service.setSystemTableCache({get() {}, filter() {}}),
    refusal(COLLABORATOR.SYSTEM_TABLE_CACHE));
  const halfChannel = Object.assign(Object.create(ReadOnlySystemTableCache.prototype),
    {applySystemTableChange() {}});
  assert.throws(() => service.setSystemTableCache(halfChannel),
    refusal(COLLABORATOR.SYSTEM_TABLE_CACHE), 'half a local write channel is refused');
  assert.throws(() => service.setSystemTableCache(new ReadOnlySystemTableCache(cache)),
    refusal(COLLABORATOR.SYSTEM_TABLE_CACHE), 'a cache without the write channel is refused');
  assert.equal(service.systemTableCache, cache, 'the wired cache is untouched');
  assert.throws(() => service.setCdcIntegrationService({refreshAuthoritativeCacheRow() {}}),
    refusal(COLLABORATOR.CDC_INTEGRATION_SERVICE));
  assert.equal(service.cdcIntegrationService, null, 'the CDC slot is untouched');
  assert.throws(() => service.setRebalanceCoordinator({shutdown() {}}),
    refusal(COLLABORATOR.REBALANCE_COORDINATOR));
  assert.equal(service.rebalanceCoordinator, coordinator, 'the coordinator is untouched');
  const sink = {setLeader() {}};
  service.setRebalancerLeadershipSink(sink);
  assert.throws(() => service.setRebalancerLeadershipSink({}),
    refusal(COLLABORATOR.REBALANCER_LEADERSHIP_SINK));
  assert.equal(service.rebalancerLeadershipSink, sink, 'the sink is untouched');
  service.setRebalancerLeadershipSink(null);
  assert.equal(service.rebalancerLeadershipSink, null, 'null detaches');
});

test('the production read-only cache is not a partition collaborator: typed refusal', () => {
  // createReadOnlyCache is the only production construction of the read-only
  // cache: a Proxy whose get trap throws for the blocked write members. The
  // check must answer the typed refusal, never the Proxy's own error.
  const underlying = new SystemTableCache();
  const readOnly = createReadOnlyCache(underlying);
  assert.throws(() => new PartitionService(options({systemTableCache: readOnly})),
    refusal(COLLABORATOR.SYSTEM_TABLE_CACHE), 'refused at construction');
  const service = new PartitionService(options({systemTableCache: underlying}));
  assert.throws(() => service.setSystemTableCache(readOnly),
    refusal(COLLABORATOR.SYSTEM_TABLE_CACHE), 'refused at a later wiring');
  assert.equal(service.systemTableCache, underlying, 'the wired cache is untouched');
});

test('an unwired readiness service reads the named state, a wired one itself', () => {
  const service = new PartitionService(options());
  assert.equal(readWiredReadinessService(service), UNWIRED);
  assert.equal(service.getPriorityRecoveryPlanningSnapshotForLearnerPromotion(), null,
    'no planning snapshot without a readiness service');
  const readinessService = {getPriorityRecoveryPlanningAnswerSync: () => ({epoch: 3})};
  service.setRebalanceCoordinator({...coordinatorFake(),
    controlPlaneReadinessService: readinessService});
  assert.equal(readWiredReadinessService(service), readinessService);
  assert.deepEqual(service.getPriorityRecoveryPlanningSnapshotForLearnerPromotion(),
    {epoch: 3});
});

test('the row owner validates its collaborators once', () => {
  assert.throws(() => new PartitionServiceRowOwner(
    {systemTableWriter: {insertSystemTableRow() {}}}),
  refusal(COLLABORATOR.SYSTEM_TABLE_WRITER));
  assert.throws(() => new PartitionServiceRowOwner({replicaStateMachine: {}}),
    refusal(COLLABORATOR.REPLICA_STATE_MACHINE));
  assert.throws(() => new PartitionServiceRowOwner({now: 5}), refusal(COLLABORATOR.CLOCK));
  const owner = new PartitionServiceRowOwner({});
  assert.equal(owner.systemTableWriter, null, 'an unwired writer is the step\'s refusal');
});

function leaderPort(confChange) {
  return {readStatus: () => ({role: RAFT_ROLE.LEADER, peers: []}),
    proposeConfChange: confChange};
}

test('a queued admission settles into the record of the port it was proposed on', async () => {
  const queued = Promise.withResolvers();
  const first = createGroupAdmissionLiveness();
  const group = {groupId: 'g1', localReplicaIdentity: 'r1', logger: {info() {}, warn() {}, debug() {}, error() {}}};
  const pending = admitGroupPeer(leaderPort(() => ({settled: false, pending: queued.promise})),
    first, group, PEER);
  assert.equal(pending.outcome, ADMISSION.QUEUED);
  assert.deepEqual([...first.inFlight], [PEER.replicaIdentity], 'in flight while queued');
  const second = createGroupAdmissionLiveness();
  queued.resolve({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, retryable: true,
    recoveryRequired: false});
  await pending.settled;
  assert.deepEqual([...first.deferred], [PEER.replicaIdentity],
    'the settlement lands in its own port\'s record');
  assert.equal(second.inFlight.size + second.deferred.size, 0,
    'a later port\'s record is untouched');
  assert.deepEqual([...takeGroupAdmissionsInFlight(null, first)], [],
    'a closed replica takes nothing');
  assert.deepEqual([...takeGroupAdmissionsInFlight({}, first)], [PEER.replicaIdentity]);
  assert.equal(first.deferred.size, 0, 'taken and forgotten');
});

test('the partition re-drives its own deferred retirements and admissions', () => {
  const context = partitionServiceContext({partitionId: 'redrive-p1',
    replicaId: 'redrive-p1-r1', logger: {info() {}, warn() {}, debug() {}},
    systemTableCache: null,
    raft: {...leaderPort(() => settledTurn({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      retryable: true, recoveryRequired: false})), subscribe() {}}});
  const other = partitionServiceContext({});
  assert.notEqual(context.deferredRetirements, other.deferredRetirements,
    'each owner has its own store');
  const change = {type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: 'm2'};
  proposePeerRetirement(context, change);
  assert.deepEqual([...context.deferredRetirements.keys()], ['m2'],
    'a deferred retirement is the partition\'s own field');
  assert.equal(other.deferredRetirements.size, 0);
  assert.deepEqual(takeDeferredRetirements(context), [change]);
  assert.equal(context.deferredRetirements.size, 0);
  context.groupAdmissionLiveness.deferred.add('joiner');
  assert.deepEqual([...takeAdmissionsInFlight(context)], ['joiner'],
    'the admission record taken is the current port\'s');
});

test('each port the partition opens gets its own admission record', async () => {
  const service = createControllablePartitionService(options({
    replicaIds: ['construction-p1-r1'], dbPath: ':memory:',
    schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]}}));
  const constructed = service.groupAdmissionLiveness;
  constructed.inFlight.add('stale-joiner');
  try {
    await service.initialize();
    assert.notEqual(service.groupAdmissionLiveness, constructed,
      'opening the port replaced the record');
    assert.equal(service.groupAdmissionLiveness.inFlight.size, 0,
      'a new port starts with no admission in flight');
    assert.deepEqual([...takeAdmissionsInFlight(service)], [],
      'nothing of an earlier record is re-driven');
  } finally {
    await service.shutdown();
  }
});
