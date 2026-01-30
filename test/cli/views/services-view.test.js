import {test} from '../../../src/test-helpers/tap.js';
import {ServicesView, SERVICE_TYPES, REPLICA_STATES, REPLICA_STATE_COLORS,
  TRANSITIONAL_STATES} from
  '../../../src/cli/views/services-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Create a sample service record
 * @param {Object} overrides - Field overrides
 * @return {Object} Service record
 */
function createService(overrides = {}) {
  return {
    service_id: 'svc-1',
    service_type: 'partition',
    node_id: 'node-1',
    status: 'active',
    address: '192.168.1.1:8080',
    role: null,
    partition_id: null,
    group_id: null,
    storage_bytes: null,
    ...overrides,
  };
}

test('ServicesView', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const view = new ServicesView();

    t.equal(view.viewName, 'services');
    t.equal(view.cache, null);
    t.equal(view.nodeFilter, null);
    t.equal(view.typeFilter, null);
  });

  t.test('getColumns returns correct column definitions', async (t) => {
    const view = new ServicesView();
    const columns = view.getColumns();

    t.equal(columns.length, 4);
    t.equal(columns[0].key, 'short_name');
    t.equal(columns[1].key, 'unified_address');
    t.equal(columns[2].key, 'node_address');
    t.equal(columns[3].key, 'status');
  });

  t.test('formatRow formats service data correctly', async (t) => {
    const view = new ServicesView();
    const service = createService({node_address: '192.168.1.1:8080'});

    const row = view.formatRow(service);

    t.equal(row[0], 'svc-1'); // short name
    t.equal(row[1], 'node-1/partition/svc-1'); // unified address
    t.equal(row[2], '192.168.1.1:8080'); // node address
    t.equal(row[3], 'active'); // status
  });

  t.test('formatRow handles missing values', async (t) => {
    const view = new ServicesView();
    const service = {
      service_id: null,
      service_type: null,
      node_id: undefined,
      status: null,
      address: null,
      node_address: null,
    };

    const row = view.formatRow(service);

    t.equal(row[0], 'N/A'); // short name
    t.equal(row[1], 'unknown/unknown/unknown'); // unified address
    t.equal(row[2], 'N/A'); // node address
    t.equal(row[3], 'unknown'); // status
  });

  t.test('formatNodeAddress formats address correctly', async (t) => {
    const view = new ServicesView();

    // With node_address
    const service1 = createService({node_address: '10.0.0.1:9000'});
    t.equal(view.formatNodeAddress(service1), '10.0.0.1:9000');

    // Falls back to address field
    const service2 = createService({node_address: null, address: '192.168.1.1:8080'});
    t.equal(view.formatNodeAddress(service2), '192.168.1.1:8080');

    // Returns N/A when both are missing
    const service3 = createService({node_address: null, address: null});
    t.equal(view.formatNodeAddress(service3), 'N/A');
  });

  t.test('formatShortName formats names correctly', async (t) => {
    const view = new ServicesView();

    // Short service ID
    const shortService = createService({service_id: 'svc-1'});
    t.equal(view.formatShortName(shortService), 'svc-1');

    // UUID service ID for partition
    const uuidPartition = createService({
      service_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      service_type: 'partition',
    });
    t.equal(view.formatShortName(uuidPartition), 'p-a1b2c3d4');

    // UUID service ID for message group
    const uuidMsgGroup = createService({
      service_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      service_type: 'message_group',
    });
    t.equal(view.formatShortName(uuidMsgGroup), 'mg-a1b2c3d4');

    // Long non-UUID name
    const longService = createService({
      service_id: 'this-is-a-very-long-service-name-that-needs-truncation',
    });
    t.equal(view.formatShortName(longService), 'this-is-a-very-lo...');

    // Null service ID
    const nullService = createService({service_id: null});
    t.equal(view.formatShortName(nullService), 'N/A');
  });

  t.test('formatUnifiedAddress formats address correctly', async (t) => {
    const view = new ServicesView();

    // Partition service
    const partitionService = createService({
      node_id: 'node-1',
      service_type: 'partition',
      service_id: 'svc-1',
    });
    t.equal(view.formatUnifiedAddress(partitionService), 'node-1/partition/svc-1');

    // Message group service (note: message_group -> message-group)
    const msgGroupService = createService({
      node_id: 'node-2',
      service_type: 'message_group',
      service_id: 'mg-1',
    });
    t.equal(view.formatUnifiedAddress(msgGroupService), 'node-2/message-group/mg-1');

    // Node service
    const nodeService = createService({
      node_id: 'node-3',
      service_type: 'node',
      service_id: 'node-svc-1',
    });
    t.equal(view.formatUnifiedAddress(nodeService), 'node-3/node/node-svc-1');
  });

  t.test('formatServiceType formats types correctly', async (t) => {
    const view = new ServicesView();

    t.equal(view.formatServiceType('partition'), 'Partition');
    t.equal(view.formatServiceType('message_group'), 'Message Group');
    t.equal(view.formatServiceType('node'), 'Node');
    t.equal(view.formatServiceType('custom'), 'custom');
    t.equal(view.formatServiceType(null), 'N/A');
  });

  t.test('formatStatus includes role when present', async (t) => {
    const view = new ServicesView();

    const leaderService = createService({status: 'active', role: 'leader'});
    t.equal(view.formatStatus(leaderService), 'active (leader)');

    const followerService = createService({status: 'active', role: 'follower'});
    t.equal(view.formatStatus(followerService), 'active (follower)');

    const noRoleService = createService({status: 'active', role: null});
    t.equal(view.formatStatus(noRoleService), 'active');
  });

  t.test('getRowStatus returns ERROR for failed services', async (t) => {
    const view = new ServicesView();

    t.equal(view.getRowStatus(createService({status: 'failed'})),
      ROW_STATUS.ERROR);
    t.equal(view.getRowStatus(createService({status: 'error'})),
      ROW_STATUS.ERROR);
  });

  t.test('getRowStatus returns WARNING for transitional states', async (t) => {
    const view = new ServicesView();

    t.equal(view.getRowStatus(createService({status: 'starting'})),
      ROW_STATUS.WARNING);
    t.equal(view.getRowStatus(createService({status: 'stopping'})),
      ROW_STATUS.WARNING);
  });

  t.test('getRowStatus returns NORMAL for active services', async (t) => {
    const view = new ServicesView();

    t.equal(view.getRowStatus(createService({status: 'active'})),
      ROW_STATUS.NORMAL);
  });

  t.test('getItemKey returns service_id', async (t) => {
    const view = new ServicesView();
    const service = createService({service_id: 'test-svc-123'});

    t.equal(view.getItemKey(service), 'test-svc-123');
  });

  t.test('setNodeFilter filters by node', async (t) => {
    const view = new ServicesView();
    const services = [
      createService({service_id: 'svc-1', node_id: 'node-1'}),
      createService({service_id: 'svc-2', node_id: 'node-2'}),
      createService({service_id: 'svc-3', node_id: 'node-1'}),
    ];
    view.setData(services);

    view.setNodeFilter('node-1');

    t.equal(view.filteredData.length, 2);
    t.ok(view.filteredData.every((s) => s.node_id === 'node-1'));
  });

  t.test('setTypeFilter filters by type', async (t) => {
    const view = new ServicesView();
    const services = [
      createService({service_id: 'svc-1', service_type: 'partition'}),
      createService({service_id: 'svc-2', service_type: 'message_group'}),
      createService({service_id: 'svc-3', service_type: 'partition'}),
    ];
    view.setData(services);

    view.setTypeFilter('partition');

    t.equal(view.filteredData.length, 2);
    t.ok(view.filteredData.every((s) => s.service_type === 'partition'));
  });

  t.test('clearServiceFilters removes all filters', async (t) => {
    const view = new ServicesView();
    const services = [
      createService({service_id: 'svc-1', node_id: 'node-1',
        service_type: 'partition'}),
      createService({service_id: 'svc-2', node_id: 'node-2',
        service_type: 'message_group'}),
    ];
    view.setData(services);

    view.setNodeFilter('node-1');
    view.setTypeFilter('partition');
    t.equal(view.filteredData.length, 1);

    view.clearServiceFilters();
    t.equal(view.filteredData.length, 2);
    t.equal(view.nodeFilter, null);
    t.equal(view.typeFilter, null);
  });

  t.test('handleDrillDown returns partition navigation', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_id: 'svc-1',
      service_type: 'partition',
      partition_id: 'part-1',
    })]);

    const action = view.handleDrillDown();

    t.same(action, {
      action: 'drillDown',
      view: 'partitions',
      context: {partitionId: 'part-1', serviceId: 'svc-1'},
    });
  });

  t.test('handleDrillDown returns message_group navigation', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_id: 'svc-1',
      service_type: 'message_group',
      group_id: 'mg-1',
    })]);

    const action = view.handleDrillDown();

    t.same(action, {
      action: 'drillDown',
      view: 'message_groups',
      context: {groupId: 'mg-1', serviceId: 'svc-1'},
    });
  });

  t.test('handleDrillDown returns node navigation for node services',
    async (t) => {
      const view = new ServicesView();
      view.setData([createService({
        service_id: 'svc-1',
        service_type: 'node',
        node_id: 'node-1',
      })]);

      const action = view.handleDrillDown();

      t.same(action, {
        action: 'drillDown',
        view: 'nodes',
        context: {nodeId: 'node-1'},
      });
    });

  t.test('handleDrillDown returns null for unknown types', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_id: 'svc-1',
      service_type: 'unknown',
    })]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('handleDrillDown returns null when no selection', async (t) => {
    const view = new ServicesView();
    view.setData([]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('getSelectedDetails returns service details', async (t) => {
    const view = new ServicesView();
    view.setData([createService()]);

    const details = view.getSelectedDetails();

    t.equal(details.title, 'Service: svc-1');
    t.ok(details.sections.length >= 2);
    t.equal(details.sections[0].title, 'Basic Information');
    t.equal(details.sections[1].title, 'Replica State');
  });

  t.test('getSelectedDetails includes partition details', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_type: 'partition',
      partition_id: 'part-1',
      storage_bytes: 1024,
      role: 'leader',
    })]);

    const details = view.getSelectedDetails();

    const partitionSection = details.sections.find((s) =>
      s.title === 'Partition Details');
    t.ok(partitionSection);
    t.ok(partitionSection.fields.some((f) => f.label === 'Partition ID'));
  });

  t.test('getSelectedDetails includes message group details', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_type: 'message_group',
      group_id: 'mg-1',
      storage_bytes: 2048,
      role: 'follower',
    })]);

    const details = view.getSelectedDetails();

    const mgSection = details.sections.find((s) =>
      s.title === 'Message Group Details');
    t.ok(mgSection);
    t.ok(mgSection.fields.some((f) => f.label === 'Group ID'));
  });

  t.test('formatBytes formats sizes correctly', async (t) => {
    const view = new ServicesView();

    t.equal(view.formatBytes(null), 'N/A');
    t.equal(view.formatBytes(undefined), 'N/A');
    t.equal(view.formatBytes(0), '0 B');
    t.equal(view.formatBytes(512), '512.0 B');
    t.equal(view.formatBytes(1024), '1.0 KB');
    t.equal(view.formatBytes(1048576), '1.0 MB');
    t.equal(view.formatBytes(1073741824), '1.0 GB');
  });

  t.test('SERVICE_TYPES constants are correct', async (t) => {
    t.equal(SERVICE_TYPES.PARTITION, 'partition');
    t.equal(SERVICE_TYPES.MESSAGE_GROUP, 'message_group');
    t.equal(SERVICE_TYPES.NODE, 'node');
  });

  t.test('REPLICA_STATES constants are correct', async (t) => {
    t.equal(REPLICA_STATES.PENDING, 'pending');
    t.equal(REPLICA_STATES.CREATING, 'creating');
    t.equal(REPLICA_STATES.SYNCING, 'syncing');
    t.equal(REPLICA_STATES.ACTIVE, 'active');
    t.equal(REPLICA_STATES.REMOVING, 'removing');
    t.equal(REPLICA_STATES.REMOVED, 'removed');
    t.equal(REPLICA_STATES.FAILED, 'failed');
  });

  t.test('REPLICA_STATE_COLORS has correct color mappings', async (t) => {
    t.equal(REPLICA_STATE_COLORS[REPLICA_STATES.ACTIVE], 'green');
    t.equal(REPLICA_STATE_COLORS[REPLICA_STATES.SYNCING], 'yellow');
    t.equal(REPLICA_STATE_COLORS[REPLICA_STATES.CREATING], 'blue');
    t.equal(REPLICA_STATE_COLORS[REPLICA_STATES.PENDING], 'blue');
    t.equal(REPLICA_STATE_COLORS[REPLICA_STATES.REMOVING], 'yellow');
    t.equal(REPLICA_STATE_COLORS[REPLICA_STATES.REMOVED], 'gray');
    t.equal(REPLICA_STATE_COLORS[REPLICA_STATES.FAILED], 'red');
  });

  t.test('TRANSITIONAL_STATES contains correct states', async (t) => {
    t.ok(TRANSITIONAL_STATES.includes('pending'));
    t.ok(TRANSITIONAL_STATES.includes('creating'));
    t.ok(TRANSITIONAL_STATES.includes('syncing'));
    t.ok(TRANSITIONAL_STATES.includes('removing'));
    t.notOk(TRANSITIONAL_STATES.includes('active'));
    t.notOk(TRANSITIONAL_STATES.includes('failed'));
  });

  t.test('getStatusColor returns correct colors for replica states', async (t) => {
    const view = new ServicesView();

    t.equal(view.getStatusColor('active'), 'green');
    t.equal(view.getStatusColor('syncing'), 'yellow');
    t.equal(view.getStatusColor('creating'), 'blue');
    t.equal(view.getStatusColor('pending'), 'blue');
    t.equal(view.getStatusColor('removing'), 'yellow');
    t.equal(view.getStatusColor('failed'), 'red');
    t.equal(view.getStatusColor('unknown'), 'white');
  });

  t.test('getRowStatus returns WARNING for transitional states', async (t) => {
    const view = new ServicesView();

    t.equal(view.getRowStatus(createService({status: 'pending'})),
      ROW_STATUS.WARNING);
    t.equal(view.getRowStatus(createService({status: 'creating'})),
      ROW_STATUS.WARNING);
    t.equal(view.getRowStatus(createService({status: 'syncing'})),
      ROW_STATUS.WARNING);
    t.equal(view.getRowStatus(createService({status: 'removing'})),
      ROW_STATUS.WARNING);
  });

  t.test('formatTimeInState formats durations correctly', async (t) => {
    const view = new ServicesView();
    const now = Date.now();

    // Test seconds
    t.equal(view.formatTimeInState(now - 5000), '5s');
    t.equal(view.formatTimeInState(now - 30000), '30s');

    // Test minutes
    t.equal(view.formatTimeInState(now - 65000), '1m 5s');
    t.equal(view.formatTimeInState(now - 120000), '2m 0s');

    // Test hours
    t.equal(view.formatTimeInState(now - 3665000), '1h 1m');

    // Test edge cases
    t.equal(view.formatTimeInState(null), 'N/A');
    t.equal(view.formatTimeInState(undefined), 'N/A');
    t.equal(view.formatTimeInState(now + 1000), '0s'); // Future timestamp
  });

  t.test('formatStatus includes time-in-state for transitional states',
    async (t) => {
      const view = new ServicesView();
      const now = Date.now();

      const syncingService = createService({
        status: 'syncing',
        state_entered_at: now - 30000,
      });
      const result = view.formatStatus(syncingService);
      t.ok(result.includes('syncing'));
      t.ok(result.includes('[30s]'));
    });

  t.test('formatStatus does not include time-in-state for non-transitional',
    async (t) => {
      const view = new ServicesView();
      const now = Date.now();

      const activeService = createService({
        status: 'active',
        state_entered_at: now - 30000,
      });
      const result = view.formatStatus(activeService);
      t.equal(result, 'active');
      t.notOk(result.includes('['));
    });

  t.test('getSelectedDetails includes replica state section', async (t) => {
    const view = new ServicesView();
    const now = Date.now();

    view.setData([createService({
      status: 'syncing',
      state_entered_at: now - 30000,
      previous_state: 'creating',
      trigger_reason: 'ACK received',
    })]);

    const details = view.getSelectedDetails();

    const stateSection = details.sections.find((s) =>
      s.title === 'Replica State');
    t.ok(stateSection);
    t.ok(stateSection.fields.some((f) => f.label === 'Current State'));
    t.ok(stateSection.fields.some((f) => f.label === 'Time in State'));
    t.ok(stateSection.fields.some((f) => f.label === 'Previous State'));
    t.ok(stateSection.fields.some((f) => f.label === 'Trigger Reason'));
  });

  t.test('getSelectedDetails shows failure reason for failed replicas',
    async (t) => {
      const view = new ServicesView();

      view.setData([createService({
        status: 'failed',
        error_message: 'Operation timed out after 60000ms',
        previous_state: 'creating',
      })]);

      const details = view.getSelectedDetails();

      const stateSection = details.sections.find((s) =>
        s.title === 'Replica State');
      t.ok(stateSection);
      const failureField = stateSection.fields.find((f) =>
        f.label === 'Failure Reason');
      t.ok(failureField);
      t.equal(failureField.value, 'Operation timed out after 60000ms');
    });

  t.test('getSelectedDetails does not show failure reason for non-failed',
    async (t) => {
      const view = new ServicesView();

      view.setData([createService({
        status: 'active',
        error_message: 'Some old error',
      })]);

      const details = view.getSelectedDetails();

      const stateSection = details.sections.find((s) =>
        s.title === 'Replica State');
      t.ok(stateSection);
      const failureField = stateSection.fields.find((f) =>
        f.label === 'Failure Reason');
      t.notOk(failureField);
    });

  t.test('getSelectedDetails includes sync progress for syncing replicas',
    async (t) => {
      const view = new ServicesView();

      view.setData([createService({
        status: 'syncing',
        sync_progress: 0.75,
        sync_source_node: 'node-2',
        bytes_synced: 768000,
        bytes_total: 1024000,
      })]);

      const details = view.getSelectedDetails();

      const syncSection = details.sections.find((s) =>
        s.title === 'Sync Progress');
      t.ok(syncSection);
      t.ok(syncSection.fields.some((f) => f.label === 'Sync Progress'));
      t.ok(syncSection.fields.some((f) => f.label === 'Sync Source'));
      t.ok(syncSection.fields.some((f) => f.label === 'Bytes Synced'));
    });

  t.test('getSelectedDetails includes navigation links', async (t) => {
    const view = new ServicesView();

    view.setData([createService({
      service_type: 'partition',
      partition_id: 'part-1',
      node_id: 'node-1',
    })]);

    const details = view.getSelectedDetails();

    t.ok(details.navigationLinks);
    t.ok(details.navigationLinks.some((l) => l.target === 'partitions'));
    t.ok(details.navigationLinks.some((l) => l.target === 'nodes'));
  });

  t.test('getSelectedDetails includes Raft state when available', async (t) => {
    const view = new ServicesView();

    view.setData([createService({
      raft_term: 5,
      raft_commit_index: 100,
      raft_applied_index: 99,
      raft_last_log_index: 101,
      raft_leader_id: 'node-2',
    })]);

    const details = view.getSelectedDetails();

    const raftSection = details.sections.find((s) =>
      s.title === 'Raft State');
    t.ok(raftSection);
    t.ok(raftSection.fields.some((f) => f.label === 'Term'));
    t.ok(raftSection.fields.some((f) => f.label === 'Commit Index'));
  });

  t.test('getSelectedDetails includes epoch info when available', async (t) => {
    const view = new ServicesView();

    view.setData([createService({
      epoch: 3,
      assignment_epoch: 2,
    })]);

    const details = view.getSelectedDetails();

    const epochSection = details.sections.find((s) =>
      s.title === 'Epoch Information');
    t.ok(epochSection);
    t.ok(epochSection.fields.some((f) => f.label === 'Current Epoch'));
    t.ok(epochSection.fields.some((f) => f.label === 'Assignment Epoch'));
  });
});
