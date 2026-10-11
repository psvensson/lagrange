import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from
  '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildCdcSourceScopeEvidence, CDC_SOURCE_SCOPE_AUTHORITY} from
  '../../src/cdc/cdc-source-scope-evidence.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

function tableRow() {
  return {table_id: 'nodes-table', table_name: TABLES.NODES,
    active_partition_version: 1, pending_partition_version: null,
    partition_transition_state: null, partition_transition_generation: 1};
}

function partitionRow() {
  return {partition_id: INITIAL_PARTITION_IDS[TABLES.NODES],
    table_id: 'nodes-table', table_name: TABLES.NODES,
    partition_key_start: null, partition_key_end: null,
    partition_version: 1, state: 'NORMAL'};
}

function witnessed(tableName, rows) {
  return {success: true, rows, source: 'owner_rpc_lane',
    readAuthorityWitness: {state: 'observed',
      partitionId: INITIAL_PARTITION_IDS[tableName], role: RAFT_ROLE.LEADER,
      servingNodeId: 'owner', servingReplicaId: `${tableName}-r1`,
      observedAtMs: 1}};
}

function completePage(options, scope) {
  const binding = options.queryOptions;
  return {success: true, state: 'complete', source: 'owner_rpc_lane', rows: [],
    sourceScope: scope,
    sourcePrefix: {partitionId: scope.partitionId, scopeId: scope.scopeId,
      appliedIndex: '1'},
    sourceLifecycle: {lifecycleIncarnation: 'source-life', role: RAFT_ROLE.LEADER},
    logicalCoverage: {scopeId: scope.scopeId, lower: null, upper: null},
    nextPageStart: null, observationDigest: 'empty',
    requestId: binding.cdcCoverageRequestId,
    targetNodeId: binding.cdcCoverageTargetNodeId,
    targetLifecycleId: binding.cdcCoverageTargetLifecycleId,
    reconcileGenerationId: binding.cdcCoverageReconcileGenerationId,
    deadlineMs: binding.cdcCoverageDeadlineMs,
    readAuthorityWitness: {state: 'observed', partitionId: scope.partitionId,
      role: RAFT_ROLE.LEADER, servingNodeId: 'source',
      servingReplicaId: 'nodes-r1', observedAtMs: 2}};
}

function compose(capacityBytes) {
  const timeSource = new VirtualTimeSource();
  const installed = [];
  const service = new CDCIntegrationService({nodeId: 'recipient',
    timeSource,
    cdcCoverageTransferCapacityBytes: capacityBytes,
    systemTableCache: new SystemTableCache(), cacheMutationTarget: {
      installCompleteCdcCoverage(page) {
        installed.push(page);
        return {installed: true, changes: 0};
      },
      estimateCdcCoverageInstallRetainedBytes() {
        return 0;
      },
    }});
  const calls = [];
  let scope = null;
  service.executeAuthoritativeSystemTableRead = async (
    tableName, _sql, _params, options,
  ) => {
    calls.push({tableName, options});
    if (calls.length === 1 || calls.length === 3) {
      return witnessed(TABLES.TABLES, [tableRow()]);
    }
    if (calls.length === 2) {
      const row = partitionRow();
      scope = buildCdcSourceScopeEvidence({
        authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
        tableDescriptor: tableRow(), partitionDescriptor: row});
      return witnessed(TABLES.PARTITIONS, [row]);
    }
    return completePage(options, scope);
  };
  return {calls, installed, service, timeSource};
}

test('CL-014 startup arms the bound coverage reconcile owner', async (t) => {
  const composed = compose(128 * 1024 * 1024);
  const summary = await composed.service
    .hydrateCdcPropagatedTablesFromAuthority({tables: [TABLES.NODES]});
  t.equal(summary.tablesHydrated, 1, 'startup hydration completes');
  t.equal(composed.installed.length, 1, 'one bound page is published');
  t.equal(composed.calls.length, 4, 'A/P/B and PAGE use the one owner path');
  const query = composed.calls[3].options.queryOptions;
  t.ok(query.cdcCoverageRequestId, 'PAGE carries request identity');
  t.ok(query.cdcCoverageTargetLifecycleId, 'PAGE carries target lifecycle');
  t.ok(query.cdcCoverageReconcileGenerationId,
    'PAGE carries reconcile generation');
  composed.service.markShuttingDown();
  t.end();
});

test('CL-014 consumer admission refuses before the PAGE route at one byte',
  async (t) => {
    const composed = compose(1);
    const pending = composed.service.hydrateCdcPropagatedTablesFromAuthority(
      {tables: [TABLES.NODES], windowMs: 1});
    await new Promise((resolve) => setImmediate(resolve));
    composed.timeSource.advance(1);
    const summary = await pending;
    t.equal(summary.tablesHydrated, 0, 'capacity refusal preserves debt');
    t.equal(composed.calls.length, 3,
      'consumer lease refuses before any page response allocation');
    t.equal(composed.installed.length, 0, 'refusal has no cache effect');
    composed.service.markShuttingDown();
    t.end();
  });
