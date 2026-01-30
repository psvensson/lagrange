/**
 * Bootstrap State Tracker Tests
 * Requirements: 28.1, 28.2, 28.5, 28.6, 28.8, 28.9
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  BootstrapStateTracker,
  BootstrapPhase,
  PHASE_DESCRIPTIONS,
} from '../../src/bootstrap/bootstrap-state-tracker.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration before tests
test('setup', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});

  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node', level: 'debug'});

  t.pass('configuration initialized');
});

test('BootstrapPhase enum', async (t) => {
  t.equal(BootstrapPhase.NOT_STARTED, 'not_started', 'should have NOT_STARTED');
  t.equal(BootstrapPhase.INFRASTRUCTURE, 'infrastructure', 'should have INFRASTRUCTURE');
  t.equal(BootstrapPhase.MESSAGE_GROUPS, 'message_groups', 'should have MESSAGE_GROUPS');
  t.equal(BootstrapPhase.PARTITIONS, 'partitions', 'should have PARTITIONS');
  t.equal(BootstrapPhase.REGISTRATION, 'registration', 'should have REGISTRATION');
  t.equal(BootstrapPhase.COMPLETE, 'complete', 'should have COMPLETE');
  t.equal(BootstrapPhase.FAILED, 'failed', 'should have FAILED');
});

test('PHASE_DESCRIPTIONS', async (t) => {
  t.ok(PHASE_DESCRIPTIONS[BootstrapPhase.NOT_STARTED], 'should have NOT_STARTED description');
  t.ok(PHASE_DESCRIPTIONS[BootstrapPhase.INFRASTRUCTURE], 'should have INFRASTRUCTURE description');
  t.ok(PHASE_DESCRIPTIONS[BootstrapPhase.MESSAGE_GROUPS], 'should have MESSAGE_GROUPS description');
  t.ok(PHASE_DESCRIPTIONS[BootstrapPhase.PARTITIONS], 'should have PARTITIONS description');
  t.ok(PHASE_DESCRIPTIONS[BootstrapPhase.REGISTRATION], 'should have REGISTRATION description');
  t.ok(PHASE_DESCRIPTIONS[BootstrapPhase.COMPLETE], 'should have COMPLETE description');
  t.ok(PHASE_DESCRIPTIONS[BootstrapPhase.FAILED], 'should have FAILED description');
});

test('BootstrapStateTracker initialization', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});

  const state = tracker.getState();
  t.equal(state.nodeId, 'test-node', 'should have node ID');
  t.equal(state.currentPhase, BootstrapPhase.NOT_STARTED, 'should start in NOT_STARTED');
  t.equal(state.servicesCreated, 0, 'should have zero services');
  t.equal(state.partitionsCreated, 0, 'should have zero partitions');
  t.equal(state.messageGroupsCreated, 0, 'should have zero message groups');
});

test('BootstrapStateTracker startTracking', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});

  let eventReceived = false;
  tracker.on('trackingStarted', (data) => {
    eventReceived = true;
    t.equal(data.nodeId, 'test-node', 'event should have node ID');
    t.ok(data.timestamp, 'event should have timestamp');
  });

  tracker.startTracking();

  t.ok(eventReceived, 'should emit trackingStarted event');
  t.ok(tracker.getState().startTime, 'should set start time');
});

test('BootstrapStateTracker transitionToPhase', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();

  let eventReceived = false;
  tracker.on('phaseTransition', (data) => {
    eventReceived = true;
    t.equal(data.previousPhase, BootstrapPhase.NOT_STARTED, 'should have previous phase');
    t.equal(data.newPhase, BootstrapPhase.INFRASTRUCTURE, 'should have new phase');
  });

  tracker.transitionToPhase(BootstrapPhase.INFRASTRUCTURE);

  t.ok(eventReceived, 'should emit phaseTransition event');
  t.equal(tracker.getState().currentPhase, BootstrapPhase.INFRASTRUCTURE, 'should update phase');
});

test('BootstrapStateTracker phase history', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();

  tracker.transitionToPhase(BootstrapPhase.INFRASTRUCTURE);
  tracker.transitionToPhase(BootstrapPhase.MESSAGE_GROUPS);
  tracker.transitionToPhase(BootstrapPhase.PARTITIONS);

  const history = tracker.getPhaseHistory();
  t.equal(history.length, 2, 'should have 2 completed phases');
  t.equal(history[0].phase, BootstrapPhase.INFRASTRUCTURE, 'first phase should be INFRASTRUCTURE');
  t.equal(history[1].phase, BootstrapPhase.MESSAGE_GROUPS, 'second phase should be MESSAGE_GROUPS');
  t.ok(history[0].duration >= 0, 'should have duration');
});

test('BootstrapStateTracker recordServiceCreated', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();

  let eventReceived = false;
  tracker.on('serviceCreated', (data) => {
    eventReceived = true;
    t.equal(data.serviceId, 'svc-1', 'should have service ID');
    t.equal(data.serviceType, 'partition', 'should have service type');
  });

  tracker.recordServiceCreated({
    serviceId: 'svc-1',
    serviceType: 'partition',
    partitionId: 'p-1',
    tableId: 'tables',
  });

  t.ok(eventReceived, 'should emit serviceCreated event');
  t.equal(tracker.getState().servicesCreated, 1, 'should increment services');
  t.equal(tracker.getState().partitionsCreated, 1, 'should increment partitions');
});

test('BootstrapStateTracker recordServiceCreated message_group', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();

  tracker.recordServiceCreated({
    serviceId: 'mg-1',
    serviceType: 'message_group',
    groupId: 'mg-1',
  });

  t.equal(tracker.getState().servicesCreated, 1, 'should increment services');
  t.equal(tracker.getState().messageGroupsCreated, 1, 'should increment message groups');
  t.equal(tracker.getState().partitionsCreated, 0, 'should not increment partitions');
});

test('BootstrapStateTracker recordRaftStateChange', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();

  let eventReceived = false;
  tracker.on('raftStateChange', (data) => {
    eventReceived = true;
    t.equal(data.serviceId, 'svc-1', 'should have service ID');
    t.equal(data.previousRole, 'follower', 'should have previous role');
    t.equal(data.newRole, 'leader', 'should have new role');
  });

  tracker.recordRaftStateChange({
    serviceId: 'svc-1',
    serviceType: 'partition',
    previousRole: 'follower',
    newRole: 'leader',
    groupId: 'p-1',
  });

  t.ok(eventReceived, 'should emit raftStateChange event');
  t.equal(tracker.getRaftStateChanges().length, 1, 'should record state change');
});

test('BootstrapStateTracker recordError', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();
  tracker.transitionToPhase(BootstrapPhase.PARTITIONS);

  let eventReceived = false;
  tracker.on('error', (data) => {
    eventReceived = true;
    t.equal(data.message, 'Test error', 'should have error message');
    t.equal(data.phase, BootstrapPhase.PARTITIONS, 'should have phase');
  });

  tracker.recordError({
    message: 'Test error',
    serviceId: 'svc-1',
    context: {detail: 'test'},
  });

  t.ok(eventReceived, 'should emit error event');
  t.equal(tracker.getErrors().length, 1, 'should record error');
});

test('BootstrapStateTracker completeTracking success', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();
  tracker.transitionToPhase(BootstrapPhase.INFRASTRUCTURE);
  tracker.transitionToPhase(BootstrapPhase.MESSAGE_GROUPS);
  tracker.transitionToPhase(BootstrapPhase.PARTITIONS);
  tracker.transitionToPhase(BootstrapPhase.REGISTRATION);

  let eventReceived = false;
  tracker.on('trackingComplete', (data) => {
    eventReceived = true;
    t.ok(data.success, 'should indicate success');
    t.ok(data.totalDuration >= 0, 'should have duration');
  });

  tracker.completeTracking(true);

  t.ok(eventReceived, 'should emit trackingComplete event');
  t.ok(tracker.isComplete(), 'should be complete');
  t.notOk(tracker.isFailed(), 'should not be failed');
  t.notOk(tracker.isInProgress(), 'should not be in progress');
});

test('BootstrapStateTracker completeTracking failure', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();
  tracker.transitionToPhase(BootstrapPhase.INFRASTRUCTURE);

  // Add error listener to prevent unhandled error
  tracker.on('error', () => {});
  tracker.recordError({message: 'Failed to create service'});

  tracker.completeTracking(false);

  t.ok(tracker.isFailed(), 'should be failed');
  t.notOk(tracker.isComplete(), 'should not be complete');
  t.notOk(tracker.isInProgress(), 'should not be in progress');
});

test('BootstrapStateTracker isInProgress', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});

  t.notOk(tracker.isInProgress(), 'should not be in progress initially');

  tracker.startTracking();
  tracker.transitionToPhase(BootstrapPhase.INFRASTRUCTURE);

  t.ok(tracker.isInProgress(), 'should be in progress during phases');

  tracker.completeTracking(true);

  t.notOk(tracker.isInProgress(), 'should not be in progress after completion');
});

test('BootstrapStateTracker reset', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();
  tracker.transitionToPhase(BootstrapPhase.INFRASTRUCTURE);
  tracker.recordServiceCreated({serviceId: 'svc-1', serviceType: 'partition'});
  tracker.recordRaftStateChange({serviceId: 'svc-1', previousRole: 'follower', newRole: 'leader'});

  // Add error listener to prevent unhandled error
  tracker.on('error', () => {});
  tracker.recordError({message: 'Test error'});

  tracker.reset();

  const state = tracker.getState();
  t.equal(state.currentPhase, BootstrapPhase.NOT_STARTED, 'should reset phase');
  t.equal(state.servicesCreated, 0, 'should reset services');
  t.equal(tracker.getPhaseHistory().length, 0, 'should reset history');
  t.equal(tracker.getRaftStateChanges().length, 0, 'should reset raft changes');
  t.equal(tracker.getErrors().length, 0, 'should reset errors');
});

test('BootstrapStateTracker setNodeId', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'initial-node'});

  tracker.setNodeId('new-node');

  t.equal(tracker.getState().nodeId, 'new-node', 'should update node ID');
});

test('BootstrapStateTracker getState includes all fields', async (t) => {
  const tracker = new BootstrapStateTracker({nodeId: 'test-node'});
  tracker.startTracking();
  tracker.transitionToPhase(BootstrapPhase.INFRASTRUCTURE);

  const state = tracker.getState();

  t.ok('nodeId' in state, 'should have nodeId');
  t.ok('currentPhase' in state, 'should have currentPhase');
  t.ok('phaseDescription' in state, 'should have phaseDescription');
  t.ok('startTime' in state, 'should have startTime');
  t.ok('phaseStartTime' in state, 'should have phaseStartTime');
  t.ok('servicesCreated' in state, 'should have servicesCreated');
  t.ok('partitionsCreated' in state, 'should have partitionsCreated');
  t.ok('messageGroupsCreated' in state, 'should have messageGroupsCreated');
  t.ok('phaseHistory' in state, 'should have phaseHistory');
  t.ok('raftStateChanges' in state, 'should have raftStateChanges');
  t.ok('errors' in state, 'should have errors');
  t.ok('duration' in state, 'should have duration');
});

test('cleanup', async (t) => {
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});
