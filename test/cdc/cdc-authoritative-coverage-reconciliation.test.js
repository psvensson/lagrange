import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {CONTROL_PLANE_READ_RECOVERY_ROUTING} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CDC_SCOPE_RECONCILE_REASON,
  CDC_SCOPE_RECONCILE_STATE,
} from '../../src/cdc/cdc-source-scope-reconciliation.js';
import {CDC_SOURCE_SCOPE_AUTHORITY, buildCdcSourceScopeEvidence} from
  '../../src/cdc/cdc-source-scope-evidence.js';
import {CDC_COVERAGE_RECONCILE_STATE} from
  '../../src/cdc/cdc-coverage-reconcile-owner.js';
import {normalizeCoveragePageFailure} from
  '../../src/cdc/cdc-complete-coverage-reconcile.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {NODES_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';
import {RaftRsDurableStore} from
  '../../src/raft/raft-rs-durable-store.js';
import {readCompleteCdcCoverage} from
  '../../src/partition/partition-cdc-source-coverage.js';
import {handleCoverageTransferRequest} from
  '../../src/partition/partition-cdc-coverage-transfer.js';
import {readCdcCoverageTransferDiagnostics,
  retireCdcCoverageTransferOwner} from
  '../../src/cdc/cdc-coverage-transfer-owner.js';
import {resolvePartitionExecutionBuilders} from
  '../../src/query/query-executor-partition-request-builders.js';
import {decodeChunk} from
  '../../src/cdc/cdc-coverage-fragment-consumer.js';

const TEST_KEEP_ALIVE = setInterval(() => {}, 1000);

function tableRow(generation = 4) {
  return {table_id: 't-nodes', table_name: TABLES.NODES,
    active_partition_version: 2, pending_partition_version: null,
    partition_transition_state: null,
    partition_transition_generation: generation};
}

function partitionRow() {
  return {partition_id: 'p-nodes-2', table_id: 't-nodes',
    table_name: TABLES.NODES, partition_key_start: 'a',
    partition_key_end: 'z', partition_version: 2, state: 'NORMAL'};
}

function witness(tableName, observedAtMs) {
  return {state: 'observed', partitionId: INITIAL_PARTITION_IDS[tableName],
    role: RAFT_ROLE.LEADER, servingNodeId: 'owner-node',
    servingReplicaId: `${tableName}-owner-r1`, observedAtMs};
}

function result(tableName, row, observedAtMs) {
  return {success: true, rows: [row], source: 'owner_rpc_lane',
    readAuthorityWitness: witness(tableName, observedAtMs)};
}

function rowsResult(tableName, rows, observedAtMs) {
  return {success: true, rows, source: 'owner_rpc_lane',
    readAuthorityWitness: witness(tableName, observedAtMs)};
}

function serviceWithReads(reads, inspect = () => {}) {
  const service = new CDCIntegrationService({nodeId: 'coverage-target',
    systemTableCache: {}, cacheMutationTarget: {}});
  let index = 0;
  service.executeAuthoritativeSystemTableRead = async (
    tableName, sql, params, options,
  ) => {
    inspect({index, tableName, sql, params, options, service});
    return reads[index++];
  };
  return service;
}

function request(service) {
  return {tableId: 't-nodes', tableName: TABLES.NODES,
    partitionId: 'p-nodes-2', deadlineMs: service.timeSource.now() + 1000};
}

test('C17 descriptor sandwich uses owner RPC leader authority and exact epoch', async (t) => {
  const calls = [];
  const service = serviceWithReads([
    result(TABLES.TABLES, tableRow(), 1),
    result(TABLES.PARTITIONS, partitionRow(), 2),
    result(TABLES.TABLES, tableRow(), 3),
  ], (call) => calls.push(call));
  const acquired = await service.acquireWitnessedCdcSourceScope(request(service));
  t.equal(acquired.state, CDC_SCOPE_RECONCILE_STATE.COMPLETE);
  t.equal(acquired.sourceScope.partitionId, 'p-nodes-2');
  t.equal(acquired.sourceScope.transitionGeneration, 4);
  t.equal(calls.length, 3, 'stable sandwich performs A/P/B reads');
  for (const call of calls) {
    t.equal(call.options.readAuthority.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED);
    t.equal(call.options.readAuthority.leaderMode,
      CONTROL_PLANE_READ_LEADER_MODE.REQUIRED);
    t.equal(call.options.readAuthority.recoveryRouting,
      CONTROL_PLANE_READ_RECOVERY_ROUTING.PRIORITY_RECOVERY_BOOTSTRAP);
    t.ok(call.options.queryOptions.timeoutMs > 0,
      'every read spends the captured absolute deadline');
  }
  service.markShuttingDown();
  t.end();
});

test('C17 bootstrap derives table identity only from witnessed owner rows',
  async (t) => {
    const calls = [];
    const service = serviceWithReads([
      result(TABLES.TABLES, tableRow(), 1),
      result(TABLES.PARTITIONS, partitionRow(), 2),
      result(TABLES.TABLES, tableRow(), 3),
    ], (call) => calls.push(call));
    const bootstrapRequest = request(service);
    delete bootstrapRequest.tableId;
    const acquired = await service.acquireWitnessedCdcSourceScope(
      bootstrapRequest);
    t.equal(acquired.state, CDC_SCOPE_RECONCILE_STATE.COMPLETE,
      'bootstrap reacquires without a cached table id');
    t.equal(acquired.sourceScope.tableId, 't-nodes',
      'scope takes table id from the witnessed owner row');
    t.equal(calls[0].params[0], TABLES.NODES,
      'first read is bound to the requested canonical table name');
    t.equal(calls[2].params[0], 't-nodes',
      'closing read uses the witnessed exact table id');
    service.markShuttingDown();
    t.end();
  });

test('C17 table bootstrap acquires one witnessed complete partition set',
  async (t) => {
    const calls = [];
    const left = {...partitionRow(), partition_id: 'p-nodes-left',
      partition_key_start: null, partition_key_end: 'm'};
    const right = {...partitionRow(), partition_id: 'p-nodes-right',
      partition_key_start: 'm', partition_key_end: null};
    const service = serviceWithReads([
      result(TABLES.TABLES, tableRow(), 1),
      rowsResult(TABLES.PARTITIONS, [right, left], 2),
      result(TABLES.TABLES, tableRow(), 3),
    ], (call) => calls.push(call));
    const acquired = await service.acquireWitnessedCdcSourceScopes({
      tableName: TABLES.NODES,
      deadlineMs: service.timeSource.now() + 1000,
    });
    t.equal(acquired.state, CDC_SCOPE_RECONCILE_STATE.COMPLETE);
    t.same(acquired.sourceScopes.map((scope) => scope.partitionId),
      ['p-nodes-left', 'p-nodes-right'],
      'the routing comparator orders a complete witnessed partition set');
    t.match(calls[1].sql, /WHERE table_id = \? AND state = \?/u);
    t.same(calls[1].params, ['t-nodes', 'NORMAL'],
      'partition enumeration is bound to the witnessed table and active state');
    service.markShuttingDown();
    t.end();
  });

test('C17 table bootstrap rejects a gap or overlap in active ranges',
  async (t) => {
    for (const boundary of ['l', 'n']) {
      const left = {...partitionRow(), partition_id: `left-${boundary}`,
        partition_key_start: null, partition_key_end: 'm'};
      const right = {...partitionRow(), partition_id: `right-${boundary}`,
        partition_key_start: boundary, partition_key_end: null};
      const service = serviceWithReads([
        result(TABLES.TABLES, tableRow(), 1),
        rowsResult(TABLES.PARTITIONS, [left, right], 2),
        result(TABLES.TABLES, tableRow(), 3),
      ]);
      const acquired = await service.acquireWitnessedCdcSourceScopes({
        tableName: TABLES.NODES,
        deadlineMs: service.timeSource.now() + 1000,
      });
      t.equal(acquired.reasonCode,
        CDC_SCOPE_RECONCILE_REASON.SANDWICH_CHANGED,
        `${boundary} cannot mint complete routing coverage`);
      service.markShuttingDown();
    }
    t.end();
  });

test('C17 table bootstrap rejects a partition set across a descriptor epoch',
  async (t) => {
    const only = {...partitionRow(), partition_key_start: null,
      partition_key_end: null};
    const service = serviceWithReads([
      result(TABLES.TABLES, tableRow(4), 1),
      rowsResult(TABLES.PARTITIONS, [only], 2),
      result(TABLES.TABLES, tableRow(5), 3),
    ]);
    const acquired = await service.acquireWitnessedCdcSourceScopes({
      tableName: TABLES.NODES,
      deadlineMs: service.timeSource.now() + 1000,
    });
    t.equal(acquired.reasonCode, CDC_SCOPE_RECONCILE_REASON.SANDWICH_CHANGED);
    t.equal(acquired.sourceScopes, undefined,
      'mixed-generation descriptor bytes publish no active scopes');
    service.markShuttingDown();
    t.end();
  });

test('C17 descriptor cutover between A and B mints no active scope', async (t) => {
  const service = serviceWithReads([
    result(TABLES.TABLES, tableRow(4), 1),
    result(TABLES.PARTITIONS, partitionRow(), 2),
    result(TABLES.TABLES, tableRow(5), 3),
  ]);
  const acquired = await service.acquireWitnessedCdcSourceScope(request(service));
  t.equal(acquired.state, CDC_SCOPE_RECONCILE_STATE.DEFERRED);
  t.equal(acquired.reasonCode, CDC_SCOPE_RECONCILE_REASON.SANDWICH_CHANGED);
  t.equal(acquired.sourceScope, undefined);
  service.markShuttingDown();
  t.end();
});

test('C17 target replacement during descriptor await fences the answer', async (t) => {
  const reads = [result(TABLES.TABLES, tableRow(), 1),
    result(TABLES.PARTITIONS, partitionRow(), 2),
    result(TABLES.TABLES, tableRow(), 3)];
  const service = serviceWithReads(reads, ({index, service: owner}) => {
    if (index === 1) owner.markShuttingDown();
  });
  const acquired = await service.acquireWitnessedCdcSourceScope(request(service));
  t.equal(acquired.reasonCode, CDC_SCOPE_RECONCILE_REASON.LIFECYCLE_STALE);
  t.equal(acquired.sourceScope, undefined,
    'retired service cannot publish descriptor authority');
  t.end();
});

test('C17 missing leader witness is recoverable unavailability', async (t) => {
  const first = result(TABLES.TABLES, tableRow(), 1);
  first.readAuthorityWitness = {...first.readAuthorityWitness, role: RAFT_ROLE.FOLLOWER};
  const service = serviceWithReads([first]);
  const acquired = await service.acquireWitnessedCdcSourceScope(request(service));
  t.equal(acquired.reasonCode, CDC_SCOPE_RECONCILE_REASON.READ_UNAVAILABLE);
  t.equal(acquired.deferRetry, true);
  service.markShuttingDown();
  t.end();
});

test('C17 reconcile owner acquires scope and publishes every exact page',
  async (t) => {
    const scope = buildCdcSourceScopeEvidence({
      authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
      tableDescriptor: tableRow(), partitionDescriptor: partitionRow()});
    const calls = [];
    const installed = [];
    const service = new CDCIntegrationService({nodeId: 'coverage-target',
      systemTableCache: {}, cacheMutationTarget: {
        estimateCdcCoverageInstallRetainedBytes() {
          return 0;
        },
        installCompleteCdcCoverage(page) {
          installed.push(page);
          return {installed: true, changes: page.rows.length};
        },
      }});
    const descriptorResults = [
      result(TABLES.TABLES, tableRow(), 1),
      result(TABLES.PARTITIONS, partitionRow(), 2),
      result(TABLES.TABLES, tableRow(), 3),
    ];
    const pages = [{success: true, state: 'complete', source: 'owner_rpc_lane',
      rows: [{node_id: 'a'}], sourceScope: scope,
      sourcePrefix: {partitionId: 'p-nodes-2', appliedIndex: '9'},
      sourceLifecycle: {lifecycleIncarnation: 'source-1', role: 'leader'},
      logicalCoverage: {lower: null, upper: 'm'}, nextPageStart: 'm',
      observationDigest: 'page-1',
      readAuthorityWitness: witness('source-page', 4)},
    {success: true, state: 'complete', source: 'owner_rpc_lane',
      rows: [{node_id: 'z'}], sourceScope: scope,
      sourcePrefix: {partitionId: 'p-nodes-2', appliedIndex: '9'},
      sourceLifecycle: {lifecycleIncarnation: 'source-1', role: 'leader'},
      logicalCoverage: {lower: 'm', upper: null}, nextPageStart: null,
      observationDigest: 'page-2',
      readAuthorityWitness: witness('source-page', 5)}];
    for (const page of pages) {
      page.readAuthorityWitness = {...page.readAuthorityWitness,
        partitionId: 'p-nodes-2'};
    }
    let index = 0;
    service.executeAuthoritativeSystemTableRead = async (
      tableName, sql, params, options,
    ) => {
      calls.push({tableName, sql, params, options});
      if (index < descriptorResults.length) return descriptorResults[index++];
      const page = pages[index++ - descriptorResults.length];
      const query = options.queryOptions;
      return {...page, requestId: query.cdcCoverageRequestId,
        targetNodeId: query.cdcCoverageTargetNodeId,
        targetLifecycleId: query.cdcCoverageTargetLifecycleId,
        reconcileGenerationId: query.cdcCoverageReconcileGenerationId,
        deadlineMs: query.cdcCoverageDeadlineMs};
    };
    const reconciled = await service.reconcileCompleteCdcCoverage({
      tableName: TABLES.NODES, partitionId: 'p-nodes-2',
      deadlineMs: service.timeSource.now() + 5000});
    t.equal(reconciled.state, CDC_COVERAGE_RECONCILE_STATE.COMPLETE);
    t.equal(reconciled.value.pages, 2, 'all independently complete pages install');
    t.equal(installed.length, 2);
    t.equal(service.resolvePartitionServices(), null,
      'recipient publishes without hosting or seeding the source replica');
    t.equal(calls[3].options.queryOptions.cdcCoverageExpectedScopeId,
      scope.scopeId, 'page request binds acquired scope');
    t.equal(calls[4].options.queryOptions.cdcCoveragePageStart, 'm',
      'continuation request binds exact prior boundary');
    service.markShuttingDown();
    t.end();
  });

test('C17 coverage transport maps no-handler and timeout under one deadline',
  (t) => {
    for (const raw of [{acknowledged: true, noHandler: true},
      {errorCode: 'ROUTER_MESSAGE_TIMEOUT'}]) {
      const retryable = normalizeCoveragePageFailure(raw, 500);
      t.equal(retryable.deferRetry, true);
      t.equal(retryable.retryAfterMs, 100,
        'transport default is clamped by the reconcile owner');
      const edge = normalizeCoveragePageFailure(raw, 99);
      t.equal(edge.deferRetry, true);
      t.equal(edge.retryAfterMs, undefined,
        'sub-minimum remainder records debt without launching a retry');
    }
    const semantic = normalizeCoveragePageFailure({success: false,
      reasonCode: 'cdc_coverage_digest_invalid', deferRetry: false}, 500);
    t.equal(semantic.deferRetry, false,
      'terminal handler result is not converted by a transport default');
    t.end();
  });

test('C17 chunk decoder bounds encoded text before one decode', (t) => {
  const binding = {requestId: 'r', targetNodeId: 'n',
    targetLifecycleId: 'l', reconcileGenerationId: 'g', deadlineMs: 10};
  const offer = {transferId: 'x', chunkBytes: 512 * 1024,
    totalBytes: 512 * 1024 + 1};
  const result = (ordinal, dataBase64, chunkBytes) => ({success: true,
    state: 'chunk', transferId: 'x', ...binding, chunkOrdinal: ordinal,
    chunkBytes, chunkDigest: '0'.repeat(64), dataBase64});
  t.equal(decodeChunk(result(0, 'A'.repeat(700000), offer.chunkBytes),
    offer, binding, 0), null, 'dense oversized geometry is refused pre-decode');
  t.equal(decodeChunk(result(0, `${'A'.repeat(699052)}    `,
    offer.chunkBytes),
  offer, binding, 0), null, 'sparse padded geometry is refused pre-decode');
  t.equal(decodeChunk(result(1, '', 0), offer, binding, 1), null,
    'a short final chunk is refused before decode');
  t.end();
});

test('C17 COMPLETE binding rejects late generation, target and cursor',
  async (t) => {
    for (const changed of ['generation', 'target', 'cursor']) {
      const scope = buildCdcSourceScopeEvidence({
        authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
        tableDescriptor: tableRow(), partitionDescriptor: partitionRow()});
      let reads = 0;
      let installs = 0;
      const service = new CDCIntegrationService({nodeId: 'coverage-target',
        systemTableCache: {}, cacheMutationTarget: {
          estimateCdcCoverageInstallRetainedBytes() {
            return 0;
          },
          installCompleteCdcCoverage() {
            installs += 1;
            return {installed: true, changes: 0};
          },
        }});
      service.executeAuthoritativeSystemTableRead = async (
        tableName, _sql, _params, options,
      ) => {
        reads += 1;
        if (reads === 1 || reads === 3) {
          return result(TABLES.TABLES, tableRow(), reads);
        }
        if (reads === 2) {
          return result(TABLES.PARTITIONS, partitionRow(), reads);
        }
        const query = options.queryOptions;
        return {success: true, state: 'complete', source: 'owner_rpc_lane',
          rows: [], sourceScope: scope,
          sourcePrefix: {partitionId: scope.partitionId, appliedIndex: '1'},
          sourceLifecycle: {lifecycleIncarnation: 'source', role: 'leader'},
          logicalCoverage: {lower: null,
            upper: changed === 'cursor' ? 'm' : null},
          nextPageStart: null, observationDigest: 'empty',
          requestId: query.cdcCoverageRequestId,
          targetNodeId: changed === 'target' ? 'replacement' :
            query.cdcCoverageTargetNodeId,
          targetLifecycleId: query.cdcCoverageTargetLifecycleId,
          reconcileGenerationId: changed === 'generation' ? 'old' :
            query.cdcCoverageReconcileGenerationId,
          deadlineMs: query.cdcCoverageDeadlineMs,
          readAuthorityWitness: {...witness(TABLES.NODES, 4),
            partitionId: scope.partitionId}};
      };
      const outcome = await service.reconcileCompleteCdcCoverage({
        tableName: TABLES.NODES, partitionId: scope.partitionId,
        deadlineMs: service.timeSource.now() + 1000});
      t.equal(outcome.state, 'failed', `${changed} receipt is terminally refused`);
      t.equal(installs, 0, `${changed} receipt cannot reach cache install`);
      service.markShuttingDown();
    }
    t.end();
  });

test('C17 >16MiB row recaptures after source session loss and installs once',
  async (t) => {
    const db = new Database(':memory:');
    db.exec(generateCreateTableSQL(NODES_SCHEMA));
    const largeAddress = 'x'.repeat(16 * 1024 * 1024 + 1024);
    db.prepare('INSERT INTO nodes (node_id, node_address, cpu_cores, memory_mb, ' +
      'disk_gb, last_heartbeat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('large-node', largeAddress, 1, 1024, 10, 1, 1);
    const store = new RaftRsDurableStore(db);
    store.putAppliedState('p-nodes-2', '19', {voters: [], learners: [],
      votersOutgoing: [], learnersNext: [], autoLeave: false});
    const scope = buildCdcSourceScopeEvidence({
      authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
      tableDescriptor: tableRow(), partitionDescriptor: partitionRow(),
    });
    const createSource = (lifecycleIncarnation) => {
      const sourceService = {db, partitionId: 'p-nodes-2', tableId: 't-nodes',
        tableName: TABLES.NODES, keyRange: {start: 'a', end: 'z'},
        nodeId: 'source-node', cdcSourceScopeEvidence: scope,
        cdcCoverageTransferCapacityBytes: 768 * 1024 * 1024,
        timeSource: {now: () => Date.now(), setTimeout, clearTimeout},
        raft: {readStatus: () => ({outcome: 'CORE_OK',
          lifecycleIncarnation, role: 'leader'})},
        isWriteQuery: () => false,
        readCompleteCdcCoverage(options) {
          return readCompleteCdcCoverage(sourceService, options);
        },
        handleCdcCoverageTransferRequest(options) {
          return handleCoverageTransferRequest(sourceService, options);
        },
      };
      sourceService.buildRemoteReadAuthorityWitness = () => ({
        ...witness(TABLES.NODES, Date.now()), partitionId: 'p-nodes-2',
      });
      return sourceService;
    };
    let source = createSource('source-lifecycle-1');
    const installed = [];
    const target = new CDCIntegrationService({nodeId: 'coverage-target',
      systemTableCache: {}, cacheMutationTarget: {
        estimateCdcCoverageInstallRetainedBytes() {
          return 0;
        },
        installCompleteCdcCoverage(page) {
          installed.push(page);
          return {installed: true, changes: page.rows.length};
        },
      }});
    const transferIds = [];
    let loseFirstSession = true;
    target.executeAuthoritativeSystemTableRead = async (
      tableName, sql, params, options,
    ) => {
      if (tableName === TABLES.TABLES) {
        return result(TABLES.TABLES, tableRow(), Date.now());
      }
      if (tableName === TABLES.PARTITIONS) {
        return result(TABLES.PARTITIONS, partitionRow(), Date.now());
      }
      const builders = resolvePartitionExecutionBuilders({
        partitionId: 'p-nodes-2', sql, params,
        executionOptions: options.queryOptions,
      });
      const requestPayload = builders.buildRequest();
      if (requestPayload.cdcCoverageMode === 'chunk' && loseFirstSession) {
        loseFirstSession = false;
        retireCdcCoverageTransferOwner(source);
        source = createSource('source-lifecycle-2');
      }
      const raw = await PartitionService.prototype.handleRemoteQuery.call(
        source, requestPayload);
      if (raw.state === 'offer') transferIds.push(raw.transferId);
      const routed = raw.acknowledged === true && raw.success === true ?
        builders.buildSuccessResult(raw) : raw;
      return {...routed, source: 'owner_rpc_lane'};
    };
    const reconciled = await target.reconcileCompleteCdcCoverage({
      tableName: TABLES.NODES, partitionId: 'p-nodes-2',
      deadlineMs: Date.now() + 10000,
    });
    t.equal(reconciled.state, CDC_COVERAGE_RECONCILE_STATE.COMPLETE,
      'session loss retains debt and a new source capture completes');
    t.equal(new Set(transferIds).size, 2,
      'retry uses a fresh volatile transfer identity');
    t.equal(installed.length, 1, 'partial fragments never publish cache truth');
    t.equal(installed[0].rows[0].node_address.length, largeAddress.length,
      'the complete row beyond the old page budget is installed byte-exactly');
    t.equal(readCdcCoverageTransferDiagnostics(source).sessions, 0,
      'source releases the completed transfer');
    t.equal(readCdcCoverageTransferDiagnostics(target).sessions, 0,
      'consumer releases its retained assembly');
    target.markShuttingDown();
    retireCdcCoverageTransferOwner(source);
    db.close();
    clearInterval(TEST_KEEP_ALIVE);
    t.end();
  });
