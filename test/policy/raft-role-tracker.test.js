/**
 * Tests for RaftRoleTracker.
 * Requirements: 14.6, 14.7, 14.8
 */

import {test} from 'tap';
import {EventEmitter} from 'events';
import {RaftRoleTracker, RaftRole} from '../../src/policy/raft-role-tracker.js';

// Mock CDC integration service
function createMockCDCService() {
  const updates = [];
  return {
    updates,
    updateSystemTableRow: async (tableName, id, data) => {
      updates.push({tableName, id, data});
      return {success: true};
    },
  };
}

// Mock system table cache
function createMockCache(services = {}) {
  return {
    get: (tableName, id) => {
      if (tableName === 'services') {
        return services[id] || null;
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === 'services') {
        return Object.values(services).filter(predicate);
      }
      return [];
    },
  };
}

// Mock service with event emitter
function createMockService() {
  return new EventEmitter();
}

test('RaftRoleTracker - initialization', async (t) => {
  const tracker = new RaftRoleTracker();
  tracker.initialize();

  t.ok(tracker.initialized, 'Tracker should be initialized');
  t.end();
});

test('RaftRoleTracker - registerService adds service to tracking', async (t) => {
  const tracker = new RaftRoleTracker();
  const mockService = createMockService();

  tracker.registerService('service-1', mockService);

  const tracked = tracker.getTrackedServices();
  t.ok(tracked.includes('service-1'), 'Service should be tracked');
  t.end();
});

test('RaftRoleTracker - unregisterService removes service from tracking', async (t) => {
  const tracker = new RaftRoleTracker();
  const mockService = createMockService();

  tracker.registerService('service-1', mockService);
  tracker.unregisterService('service-1');

  const tracked = tracker.getTrackedServices();
  t.notOk(tracked.includes('service-1'), 'Service should not be tracked');
  t.end();
});

test('RaftRoleTracker - handles role change events from service', async (t) => {
  const mockCDC = createMockCDCService();
  const tracker = new RaftRoleTracker({cdcIntegrationService: mockCDC});
  const mockService = createMockService();

  tracker.registerService('service-1', mockService);

  // Emit role change event
  mockService.emit('roleChanged', {
    newRole: RaftRole.LEADER,
    oldRole: RaftRole.FOLLOWER,
  });

  // Wait for async update
  await new Promise((resolve) => setTimeout(resolve, 10));

  t.equal(mockCDC.updates.length, 1, 'Should have one CDC update');
  t.equal(mockCDC.updates[0].tableName, 'services', 'Should update services table');
  t.equal(mockCDC.updates[0].id, 'service-1', 'Should update correct service');
  t.equal(mockCDC.updates[0].data.raft_role, 'leader', 'Should set role to leader');
  t.end();
});


test('RaftRoleTracker - setServiceRole updates role manually', async (t) => {
  const mockCDC = createMockCDCService();
  const tracker = new RaftRoleTracker({cdcIntegrationService: mockCDC});

  tracker.registerService('service-1', null);
  await tracker.setServiceRole('service-1', RaftRole.LEADER);

  t.equal(mockCDC.updates.length, 1, 'Should have one CDC update');
  t.equal(mockCDC.updates[0].data.raft_role, 'leader', 'Should set role to leader');
  t.end();
});

test('RaftRoleTracker - setServiceRole rejects invalid role', async (t) => {
  const tracker = new RaftRoleTracker();

  try {
    await tracker.setServiceRole('service-1', 'invalid_role');
    t.fail('Should have thrown error');
  } catch (error) {
    t.ok(error.message.includes('Invalid'), 'Should throw invalid role error');
  }
  t.end();
});

test('RaftRoleTracker - getServiceRole returns tracked role', async (t) => {
  const mockCDC = createMockCDCService();
  const tracker = new RaftRoleTracker({cdcIntegrationService: mockCDC});

  tracker.registerService('service-1', null);
  await tracker.setServiceRole('service-1', RaftRole.FOLLOWER);

  const role = tracker.getServiceRole('service-1');
  t.equal(role, RaftRole.FOLLOWER, 'Should return follower role');
  t.end();
});

test('RaftRoleTracker - getServiceRole falls back to cache', async (t) => {
  const mockCache = createMockCache({
    'service-1': {service_id: 'service-1', raft_role: 'leader'},
  });
  const tracker = new RaftRoleTracker({systemTableCache: mockCache});

  const role = tracker.getServiceRole('service-1');
  t.equal(role, 'leader', 'Should return role from cache');
  t.end();
});

test('RaftRoleTracker - getServicesByRole filters correctly', async (t) => {
  const mockCache = createMockCache({
    'service-1': {service_id: 'service-1', raft_role: 'leader'},
    'service-2': {service_id: 'service-2', raft_role: 'follower'},
    'service-3': {service_id: 'service-3', raft_role: 'leader'},
  });
  const tracker = new RaftRoleTracker({systemTableCache: mockCache});

  const leaders = tracker.getServicesByRole('leader');
  t.equal(leaders.length, 2, 'Should find 2 leaders');
  t.end();
});

test('RaftRoleTracker - getLeaders returns leader services', async (t) => {
  const mockCache = createMockCache({
    'service-1': {service_id: 'service-1', raft_role: 'leader'},
    'service-2': {service_id: 'service-2', raft_role: 'follower'},
  });
  const tracker = new RaftRoleTracker({systemTableCache: mockCache});

  const leaders = tracker.getLeaders();
  t.equal(leaders.length, 1, 'Should find 1 leader');
  t.equal(leaders[0].service_id, 'service-1', 'Should be service-1');
  t.end();
});

test('RaftRoleTracker - getFollowers returns follower services', async (t) => {
  const mockCache = createMockCache({
    'service-1': {service_id: 'service-1', raft_role: 'leader'},
    'service-2': {service_id: 'service-2', raft_role: 'follower'},
    'service-3': {service_id: 'service-3', raft_role: 'follower'},
  });
  const tracker = new RaftRoleTracker({systemTableCache: mockCache});

  const followers = tracker.getFollowers();
  t.equal(followers.length, 2, 'Should find 2 followers');
  t.end();
});

test('RaftRoleTracker - isValidRole validates roles', async (t) => {
  const tracker = new RaftRoleTracker();

  t.ok(tracker.isValidRole('leader'), 'leader should be valid');
  t.ok(tracker.isValidRole('follower'), 'follower should be valid');
  t.ok(tracker.isValidRole('candidate'), 'candidate should be valid');
  t.notOk(tracker.isValidRole('invalid'), 'invalid should not be valid');
  t.notOk(tracker.isValidRole(''), 'empty string should not be valid');
  t.end();
});

test('RaftRoleTracker - emits roleChanged event', async (t) => {
  const mockCDC = createMockCDCService();
  const tracker = new RaftRoleTracker({cdcIntegrationService: mockCDC});

  let emittedEvent = null;
  tracker.on('roleChanged', (event) => {
    emittedEvent = event;
  });

  tracker.registerService('service-1', null);
  await tracker.setServiceRole('service-1', RaftRole.LEADER);

  t.ok(emittedEvent, 'Should emit roleChanged event');
  t.equal(emittedEvent.serviceId, 'service-1', 'Event should have serviceId');
  t.equal(emittedEvent.newRole, 'leader', 'Event should have newRole');
  t.ok(emittedEvent.timestamp, 'Event should have timestamp');
  t.end();
});

test('RaftRoleTracker - handles missing CDC service gracefully', async (t) => {
  const tracker = new RaftRoleTracker();

  tracker.registerService('service-1', null);
  const result = await tracker.updateServiceRole('service-1', RaftRole.LEADER);

  t.notOk(result.success, 'Should not succeed without CDC service');
  t.equal(result.reason, 'no_cdc_service', 'Should indicate missing CDC service');
  t.end();
});

test('RaftRoleTracker - shutdown cleans up', async (t) => {
  const tracker = new RaftRoleTracker();
  const mockService = createMockService();

  tracker.registerService('service-1', mockService);
  tracker.registerService('service-2', mockService);

  tracker.shutdown();

  const tracked = tracker.getTrackedServices();
  t.equal(tracked.length, 0, 'Should have no tracked services after shutdown');
  t.end();
});

test('RaftRole enum has correct values', async (t) => {
  t.equal(RaftRole.LEADER, 'leader', 'LEADER should be leader');
  t.equal(RaftRole.FOLLOWER, 'follower', 'FOLLOWER should be follower');
  t.equal(RaftRole.CANDIDATE, 'candidate', 'CANDIDATE should be candidate');
  t.end();
});
