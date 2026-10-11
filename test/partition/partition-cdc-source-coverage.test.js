import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  CDC_COVERAGE_BOUND,
  CDC_COVERAGE_REFUSAL,
  CDC_SOURCE_SCOPE_AUTHORITY,
  buildCdcSourceScopeEvidence,
  captureCdcCoverageSourceLifecycle,
  isActiveCdcSourceScopeEvidence,
  isCdcSourceScopeEvidence,
  readCompleteCdcCoverage,
} from '../../src/partition/partition-cdc-source-coverage.js';
import {createPartitionServiceCdcCoverageMethods} from
  '../../src/partition/partition-service-cdc-coverage-methods.js';
import {compareCdcCoverageKeys} from '../../src/cdc/cdc-coverage-domain.js';
import {compareRoutingKeys} from
  '../../src/partition/split-key-comparator.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {NODES_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_SCHEMAS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cdc-table-policy.js';
import {resolveLiveCdcCoverageDomain} from
  '../../src/cdc/cdc-coverage-domain.js';
import {readCdcCoverageTransferDiagnostics, releaseCdcCoverageTransfer,
  reserveCdcCoverageTransfer, retireCdcCoverageTransferOwner} from
  '../../src/cdc/cdc-coverage-transfer-owner.js';
import {
  CDC_COVERAGE_TRANSFER_REFUSAL,
  captureLargeCoverageRow,
  handleCoverageTransferRequest,
} from '../../src/partition/partition-cdc-coverage-transfer.js';
import {resolvePartitionExecutionBuilders} from
  '../../src/query/query-executor-partition-request-builders.js';

const EMPTY_CONF_STATE = Object.freeze({voters: [], learners: [],
  votersOutgoing: [], learnersNext: [], autoLeave: false});

function sourceScope() {
  return buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    partitionDescriptor: {partition_id: 'p-source', table_id: 't-nodes',
      partition_version: 1, partition_key_start: null,
      partition_key_end: null, state: 'NORMAL'},
    tableDescriptor: {table_id: 't-nodes', table_name: TABLES.NODES,
      active_partition_version: 1, pending_partition_version: null,
      partition_transition_state: null, partition_transition_generation: 1},
  });
}

function versionedSourceScope(version, rangeStart = null,
  transitionGeneration = version,
  authority = CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR) {
  return buildCdcSourceScopeEvidence({
    authority,
    partitionDescriptor: {partition_id: 'p-source', table_id: 't-nodes',
      partition_version: version, partition_key_start: rangeStart,
      partition_key_end: null, state: 'NORMAL'},
    tableDescriptor: {table_id: 't-nodes', table_name: TABLES.NODES,
      active_partition_version: version, pending_partition_version: null,
      partition_transition_state: null,
      partition_transition_generation: transitionGeneration},
  });
}

function service(db, evidence = sourceScope()) {
  return {db, partitionId: 'p-source', tableId: 't-nodes',
    tableName: TABLES.NODES, keyRange: {start: null, end: null},
    cdcSourceScopeEvidence: evidence, raft: {readStatus: () => ({
      outcome: 'CORE_OK', lifecycleIncarnation: 'source-lifecycle-1',
      role: 'leader'})}};
}

function pageRequest(owner, extra = {}) {
  return {requestId: 'page-request', targetNodeId: 'target-node',
    targetLifecycleId: 'target-lifecycle', reconcileGenerationId: '1',
    deadlineMs: 1000,
    expectedScopeId: owner.cdcSourceScopeEvidence?.scopeId, ...extra};
}

function database(rowCount = 0) {
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  const insert = db.prepare('INSERT INTO nodes ' +
    '(node_id, node_address, cpu_cores, memory_mb, disk_gb, last_heartbeat, ' +
    'created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (let index = 0; index < rowCount; index += 1) {
      const nodeId = `node-${String(index).padStart(4, '0')}`;
      insert.run(nodeId, `${nodeId}:9000`, 1, 1024, 10, index, index);
    }
  })();
  const store = new RaftRsDurableStore(db);
  store.putAppliedState('p-source', '700', EMPTY_CONF_STATE);
  return db;
}

test('C17 live source schema binds canonical PK type and BINARY collation',
  (t) => {
    const canonical = database();
    t.ok(resolveLiveCdcCoverageDomain(canonical, TABLES.NODES),
      'canonical live schema is admitted');
    canonical.close();
    const changed = new Database(':memory:');
    changed.exec(generateCreateTableSQL(NODES_SCHEMA).replace(
      'node_id TEXT PRIMARY KEY',
      'node_id TEXT PRIMARY KEY COLLATE NOCASE'));
    t.equal(resolveLiveCdcCoverageDomain(changed, TABLES.NODES), null,
      'changed source collation cannot mint canonical absence');
    changed.close();
    t.end();
  });

test('C17 every propagated canonical schema owns one supported live domain',
  (t) => {
    for (const tableName of CDC_PROPAGATED_TABLES) {
      const schema = SYSTEM_TABLE_SCHEMAS.find(
        (candidate) => candidate.tableName === tableName);
      const db = new Database(':memory:');
      db.exec(generateCreateTableSQL(schema));
      t.ok(resolveLiveCdcCoverageDomain(db, tableName),
        `${tableName} has one TEXT/BINARY lossless coverage domain`);
      db.close();
    }
    t.end();
  });

test('C17 source row codec refuses integers outside the lossless envelope',
  async (t) => {
    const db = database(1);
    db.prepare('UPDATE nodes SET cpu_cores = ? WHERE node_id = ?')
      .run(9007199254740992, 'node-0000');
    const owner = service(db);
    const read = await readCompleteCdcCoverage(owner, pageRequest(owner));
    t.equal(read.reason, CDC_COVERAGE_REFUSAL.ROW_CODEC_UNSUPPORTED,
      'unsafe SQLite integer cannot be rounded into cache authority');
    t.equal(read.deferRetry, true, 'unsupported live bytes retain coverage debt');
    db.close();
    t.end();
  });

test('C17 source pages bind bounded complete ranges to applied prefix', async (t) => {
  const db = database(CDC_COVERAGE_BOUND.MAX_ROWS + 4);
  const owner = service(db);
  const first = await readCompleteCdcCoverage(owner, pageRequest(owner));
  t.equal(first.state, 'complete', 'first page is complete for its range');
  t.equal(first.rows.length, CDC_COVERAGE_BOUND.MAX_ROWS,
    'page obeys row bound');
  t.equal(first.sourcePrefix.appliedIndex, '700',
    'page carries applied prefix from the same transaction');
  t.equal(first.logicalCoverage.upper, first.nextPageStart,
    'next row is the exclusive page boundary');
  releaseCdcCoverageTransfer(owner, first.transferId);
  const second = await readCompleteCdcCoverage(owner,
    pageRequest(owner, {requestId: 'page-request-2',
      pageStart: first.nextPageStart}));
  t.equal(second.rows.length, 4, 'continuation returns remaining rows');
  t.equal(second.nextPageStart, null, 'final page closes descriptor range');
  releaseCdcCoverageTransfer(owner, second.transferId);
  db.close();
  t.end();
});

test('C17 source transfer reserves before capture and releases after chunk',
  (t) => {
    const db = database(1);
    const owner = service(db);
    const domain = resolveLiveCdcCoverageDomain(db, TABLES.NODES);
    const binding = {requestId: 'request-1', targetNodeId: 'target-node',
      targetLifecycleId: 'target-lifecycle-1',
      reconcileGenerationId: 'generation-1', deadlineMs: 1000};
    const offer = db.transaction(() => captureLargeCoverageRow(owner, {
      ...binding, scope: owner.cdcSourceScopeEvidence, domain, pageStart: null,
      appliedIndex: '700', sourceLifecycle: {
        lifecycleIncarnation: 'source-lifecycle-1', role: 'leader'},
    }))();
    t.equal(offer.state, 'offer');
    t.equal(offer.rowKey, 'node-0000');
    t.ok(offer.totalBytes > 0);
    const diagnostics = readCdcCoverageTransferDiagnostics(owner);
    t.equal(diagnostics.sessions, 1,
      'source retains exactly one reserved session');
    t.match(diagnostics.held[0], {transferId: offer.transferId,
      category: 'source', partitionId: owner.partitionId,
      tableName: owner.tableName, targetNodeId: binding.targetNodeId,
      targetLifecycleId: binding.targetLifecycleId,
      reconcileGenerationId: binding.reconcileGenerationId},
    'source diagnostics retain the exact folded session identity');
    const chunk = handleCoverageTransferRequest(owner, {...binding,
      mode: 'chunk', transferId: offer.transferId, chunkOrdinal: 0});
    t.equal(chunk.state, 'chunk');
    t.equal(Buffer.from(chunk.dataBase64, 'base64').length, offer.totalBytes);
    t.equal(readCdcCoverageTransferDiagnostics(owner).sessions, 0,
      'final chunk releases source bytes and the session slot');
    db.close();
    t.end();
  });

test('C17 source transfer capacity refusal retains recoverable debt', (t) => {
  const db = database(1);
  const owner = service(db);
  owner.cdcCoverageTransferCapacityBytes = 1024;
  const refused = captureLargeCoverageRow(owner, {
    requestId: 'request-2', targetNodeId: 'target-node',
    targetLifecycleId: 'target-lifecycle-1',
    reconcileGenerationId: 'generation-1', deadlineMs: 1000,
    scope: owner.cdcSourceScopeEvidence,
    domain: resolveLiveCdcCoverageDomain(db, TABLES.NODES), pageStart: null,
    appliedIndex: '700', sourceLifecycle: {
      lifecycleIncarnation: 'source-lifecycle-1', role: 'leader'},
  });
  t.equal(refused.reason,
    CDC_COVERAGE_TRANSFER_REFUSAL.CAPACITY_UNAVAILABLE);
  t.equal(refused.deferRetry, true);
  t.equal(readCdcCoverageTransferDiagnostics(owner).sessions, 0);
  db.close();
  t.end();
});

test('C17 colocated transfer endpoints share one node capacity owner', (t) => {
  const sourceEndpoint = {nodeId: 'shared-capacity-node',
    cdcCoverageTransferCapacityBytes: 512,
    cdcCoverageTransferMaxSessions: 1};
  const consumerEndpoint = {nodeId: 'shared-capacity-node',
    cdcCoverageTransferCapacityBytes: 1024,
    cdcCoverageTransferMaxSessions: 1};
  t.ok(reserveCdcCoverageTransfer(sourceEndpoint, {
    transferId: 'source-session', retainedBytes: 512, category: 'source'}),
  'source reserves the shared node slot');
  t.equal(reserveCdcCoverageTransfer(consumerEndpoint, {
    transferId: 'consumer-session', retainedBytes: 1, category: 'consumer'}),
  null, 'consumer cannot independently over-admit the same node');
  t.equal(readCdcCoverageTransferDiagnostics(consumerEndpoint).sessions, 1,
    'both endpoints observe the same live session counter');
  releaseCdcCoverageTransfer(sourceEndpoint, 'source-session');
  retireCdcCoverageTransferOwner(sourceEndpoint);
  t.ok(reserveCdcCoverageTransfer(consumerEndpoint, {
    transferId: 'consumer-session', retainedBytes: 1024,
    category: 'consumer', value: {binding: {
      targetNodeId: 'target-node', targetLifecycleId: 'target-lifecycle',
      reconcileGenerationId: 'target-generation'}, offer: {sourceScope: {
      tableName: TABLES.NODES, partitionId: 'source-partition'}}}}),
  'retiring the lower-limit endpoint refreshes the shared node limit');
  t.match(readCdcCoverageTransferDiagnostics(consumerEndpoint).held[0], {
    category: 'consumer', tableName: TABLES.NODES,
    partitionId: 'source-partition', targetNodeId: 'target-node',
    targetLifecycleId: 'target-lifecycle',
    reconcileGenerationId: 'target-generation'},
  'consumer diagnostics retain the nested offer and binding identity');
  retireCdcCoverageTransferOwner(consumerEndpoint);
  t.end();
});

test('C17 remote query bridge returns only source-owned coverage receipts',
  async (t) => {
    const owner = service(database(2));
    owner.nodeId = 'source-route-node';
    owner.isWriteQuery = () => false;
    owner.readCompleteCdcCoverage = (options) =>
      readCompleteCdcCoverage(owner, options);
    owner.buildRemoteReadAuthorityWitness = () => Object.freeze({
      state: 'observed', partitionId: owner.partitionId,
    });
    owner.executeQuery = () => {
      throw new Error('coverage must not execute caller SQL');
    };
    owner.cdcCoverageTransferCapacityBytes = 1;
    const low = await PartitionService.prototype.handleRemoteQuery.call(
      owner, {type: 'query', sql: 'SELECT * FROM nodes', params: [],
        cdcCompleteCoverage: true,
        cdcCoverageExpectedScopeId: owner.cdcSourceScopeEvidence.scopeId,
        cdcCoverageRequestId: 'bridge-low', cdcCoverageTargetNodeId: 'target',
        cdcCoverageTargetLifecycleId: 'target-life',
        cdcCoverageReconcileGenerationId: '1', cdcCoverageDeadlineMs: 1000});
    t.equal(low.reason, 'cdc_coverage_capacity_unavailable',
      'one-byte source capacity refuses through the query route');
    t.equal(low.deferRetry, true, 'ordinary-page refusal retains debt');
    t.equal(readCdcCoverageTransferDiagnostics(owner).retainedBytes, 0,
      'refusal materializes no page');
    retireCdcCoverageTransferOwner(owner);
    owner.cdcCoverageTransferCapacityBytes = 128 * 1024 * 1024;
    const result = await PartitionService.prototype.handleRemoteQuery.call(
      owner, {type: 'query', sql: 'SELECT * FROM nodes', params: [],
        cdcCompleteCoverage: true,
        cdcCoverageExpectedScopeId: owner.cdcSourceScopeEvidence.scopeId,
        cdcCoverageRequestId: 'bridge-1', cdcCoverageTargetNodeId: 'target',
        cdcCoverageTargetLifecycleId: 'target-life',
        cdcCoverageReconcileGenerationId: '1', cdcCoverageDeadlineMs: 1000});
    t.equal(result.acknowledged, true, 'handler acknowledges the semantic reply');
    t.equal(result.success, true, 'complete source receipt is successful');
    t.equal(result.state, 'complete', 'source coverage state crosses the bridge');
    t.equal(result.sourcePrefix.appliedIndex, '700',
      'bridge preserves the source-owned applied prefix');
    t.equal(result.sourceLifecycle.lifecycleIncarnation, 'source-lifecycle-1',
      'bridge preserves the exact source lifecycle receipt');
    t.ok(typeof result.observationDigest === 'string',
      'bridge preserves the exact observation digest');
    releaseCdcCoverageTransfer(owner, result.transferId);
    const moved = await PartitionService.prototype.handleRemoteQuery.call(
      owner, {type: 'query', sql: 'SELECT * FROM nodes', params: [],
        cdcCompleteCoverage: true,
        cdcCoverageExpectedScopeId: 'delayed-old-scope',
        cdcCoverageRequestId: 'bridge-2', cdcCoverageTargetNodeId: 'target',
        cdcCoverageTargetLifecycleId: 'target-life',
        cdcCoverageReconcileGenerationId: '1', cdcCoverageDeadlineMs: 1000});
    t.equal(moved.success, false,
      'source refuses a request captured against another descriptor scope');
    t.equal(moved.reason, CDC_COVERAGE_REFUSAL.SCOPE_MOVED,
      'scope mismatch crosses the semantic response bridge');
    owner.isWriteQuery = () => true;
    const spoofed = await PartitionService.prototype.handleRemoteQuery.call(
      owner, {type: 'query', sql: 'DELETE FROM nodes', params: [],
        cdcCompleteCoverage: true,
        cdcCoverageExpectedScopeId: owner.cdcSourceScopeEvidence.scopeId});
    t.equal(spoofed.reason, CDC_COVERAGE_REFUSAL.IDENTITY_INVALID,
      'coverage flag cannot reinterpret a caller write as a source read');
    owner.db.close();
    t.end();
  });

test('C17 query request and result wrappers preserve coverage binding', (t) => {
  const builders = resolvePartitionExecutionBuilders({
    partitionId: 'p-source', sql: 'SELECT * FROM nodes', params: [],
    executionOptions: {cdcCompleteCoverage: true,
      cdcCoverageExpectedScopeId: 'scope-1', cdcCoveragePageStart: 'm',
      cdcCoverageMode: 'chunk', cdcCoverageRequestId: 'request-1',
      cdcCoverageTargetNodeId: 'target-1',
      cdcCoverageTargetLifecycleId: 'target-life-1',
      cdcCoverageReconcileGenerationId: 'generation-1',
      cdcCoverageDeadlineMs: 1234, cdcCoverageTransferId: 'transfer-1',
      cdcCoverageChunkOrdinal: 3},
  });
  const request = builders.buildRequest();
  t.equal(request.cdcCompleteCoverage, true);
  t.equal(request.cdcCoverageExpectedScopeId, 'scope-1');
  t.equal(request.cdcCoveragePageStart, 'm');
  t.equal(request.cdcCoverageMode, 'chunk');
  t.equal(request.cdcCoverageRequestId, 'request-1');
  t.equal(request.cdcCoverageTargetNodeId, 'target-1');
  t.equal(request.cdcCoverageTargetLifecycleId, 'target-life-1');
  t.equal(request.cdcCoverageReconcileGenerationId, 'generation-1');
  t.equal(request.cdcCoverageDeadlineMs, 1234);
  t.equal(request.cdcCoverageTransferId, 'transfer-1');
  t.equal(request.cdcCoverageChunkOrdinal, 3);
  const result = builders.buildSuccessResult({acknowledged: true, success: true,
    rows: [], state: 'complete', sourceScope: {scopeId: 'scope-1'},
    sourcePrefix: {appliedIndex: '7'}, logicalCoverage: {lower: 'm'},
    sourceLifecycle: {lifecycleIncarnation: 'source-1', role: 'leader'},
    observationDigest: 'observation-1', nextPageStart: null});
  t.equal(result.observationDigest, 'observation-1');
  t.equal(result.sourceScope.scopeId, 'scope-1');
  t.end();
});

test('C17 source coverage refuses follower, bad cursor, and missing scope', async (t) => {
  const db = database();
  const follower = service(db);
  follower.raft.readStatus = () => ({outcome: 'CORE_OK',
    lifecycleIncarnation: 'source-lifecycle-1', role: 'follower'});
  t.equal((await readCompleteCdcCoverage(follower,
    pageRequest(follower))).reason,
  CDC_COVERAGE_REFUSAL.NOT_LEADER, 'follower cannot certify a prefix');
  const owner = service(db);
  t.equal((await readCompleteCdcCoverage(owner,
    pageRequest(owner, {pageStart: 7}))).reason,
  CDC_COVERAGE_REFUSAL.CURSOR_INVALID, 'non-string cursor is refused');
  owner.cdcSourceScopeEvidence = null;
  t.equal((await readCompleteCdcCoverage(owner, pageRequest(owner))).reason,
    CDC_COVERAGE_REFUSAL.SCOPE_MISSING, 'missing authority stays refused');
  db.close();
  t.end();
});

test('C17 source coverage fences a replaced operation-port lifecycle', async (t) => {
  const owner = service(database());
  let incarnation = 'source-lifecycle-1';
  let role = 'leader';
  owner.raft.readStatus = () => ({outcome: 'CORE_OK',
    lifecycleIncarnation: incarnation, role});
  const captured = captureCdcCoverageSourceLifecycle(owner);
  incarnation = 'source-lifecycle-2';
  const read = await readCompleteCdcCoverage(owner,
    pageRequest(owner, {sourceLifecycle: captured}));
  t.equal(read.reason, CDC_COVERAGE_REFUSAL.SOURCE_LIFECYCLE_MOVED,
    'captured old source object/port generation cannot read replacement bytes');
  t.equal(read.deferRetry, true, 'scope/status change remains recoverable debt');
  incarnation = 'source-lifecycle-1';
  const leadership = captureCdcCoverageSourceLifecycle(owner);
  role = 'follower';
  const demoted = await readCompleteCdcCoverage(owner,
    pageRequest(owner, {sourceLifecycle: leadership}));
  t.equal(demoted.reason, CDC_COVERAGE_REFUSAL.SOURCE_LIFECYCLE_MOVED,
    'captured leader observation cannot read after operation-port demotion');
  owner.db.close();
  t.end();
});

test('C17 service scope installation is monotonic and idempotent', (t) => {
  const methods = createPartitionServiceCdcCoverageMethods();
  const owner = service(database(), null);
  owner.installCdcSourceScopeEvidence = methods.installCdcSourceScopeEvidence;
  const first = versionedSourceScope(1);
  const newer = versionedSourceScope(2);
  const conflicting = versionedSourceScope(2, 'changed');
  t.equal(owner.installCdcSourceScopeEvidence(first), true,
    'initial source authority installs');
  t.equal(owner.installCdcSourceScopeEvidence(first), true,
    'exact replay is idempotent');
  t.equal(owner.installCdcSourceScopeEvidence(newer), true,
    'strictly newer active generation replaces the old scope');
  t.equal(owner.installCdcSourceScopeEvidence(first), false,
    'delayed lower generation cannot replace newer authority');
  t.equal(owner.installCdcSourceScopeEvidence(conflicting), false,
    'equal-generation conflicting bytes cannot replace authority');
  owner.db.close();
  t.end();
});

test('C17 workflow provenance cannot activate source coverage', async (t) => {
  const provenance = versionedSourceScope(1, null, 1,
    CDC_SOURCE_SCOPE_AUTHORITY.REPLICA_CREATE_WORKFLOW);
  const methods = createPartitionServiceCdcCoverageMethods();
  const owner = service(database(), null);
  owner.installCdcSourceScopeEvidence = methods.installCdcSourceScopeEvidence;
  t.equal(isCdcSourceScopeEvidence(provenance), true,
    'carried CREATE descriptor remains valid historical provenance');
  t.equal(isActiveCdcSourceScopeEvidence(provenance), false,
    'historical provenance is not current descriptor authority');
  t.equal(owner.installCdcSourceScopeEvidence(provenance), false,
    'installer refuses workflow provenance as active scope');
  owner.cdcSourceScopeEvidence = provenance;
  t.equal((await readCompleteCdcCoverage(owner,
    pageRequest(owner, {expectedScopeId: provenance.scopeId}))).reason,
  CDC_COVERAGE_REFUSAL.SCOPE_MISSING,
  'source read stays held until witnessed descriptor reacquisition');
  owner.db.close();
  t.end();
});

test('C17 remote source reacquires current scope through its owner gateway',
  async (t) => {
    const owner = service(database(1), null);
    const methods = createPartitionServiceCdcCoverageMethods();
    owner.installCdcSourceScopeEvidence = methods.installCdcSourceScopeEvidence;
    owner.timeSource = {now: () => 0, setTimeout, clearTimeout};
    const scope = sourceScope();
    let reads = 0;
    owner.controlPlaneSystemTableGateway = {
      async readAuthoritativeRows(tableName) {
        reads += 1;
        const row = tableName === TABLES.TABLES ?
          {table_id: 't-nodes', table_name: TABLES.NODES,
            active_partition_version: 1, pending_partition_version: null,
            partition_transition_state: null,
            partition_transition_generation: 1} :
          {partition_id: 'p-source', table_id: 't-nodes',
            partition_key_start: null, partition_key_end: null,
            partition_version: 1, state: 'NORMAL'};
        return {success: true, rows: [row], readAuthorityWitness: {
          state: 'observed', partitionId: INITIAL_PARTITION_IDS[tableName],
          role: 'leader', servingNodeId: 'owner',
          servingReplicaId: `${tableName}-r1`, observedAtMs: reads}};
      },
    };
    const read = await readCompleteCdcCoverage(owner,
      pageRequest(owner, {expectedScopeId: scope.scopeId}));
    t.equal(read.state, 'complete', 'source activates from A/P/B owner reads');
    t.equal(reads, 3, 'source performs its own descriptor sandwich');
    t.equal(owner.cdcSourceScopeEvidence.scopeId, scope.scopeId,
      'only witnessed source-side evidence becomes active');
    releaseCdcCoverageTransfer(owner, read.transferId);
    owner.db.close();
    t.end();
  });

test('C17 descriptor evidence rejects inherited and accessor authority fields', (t) => {
  const inherited = Object.create({partition_id: 'p-source'});
  Object.assign(inherited, {table_id: 't-nodes', partition_version: 1,
    partition_key_start: null, partition_key_end: null, state: 'NORMAL'});
  let getterReads = 0;
  const accessor = {table_id: 't-nodes', partition_version: 1,
    partition_key_start: null, partition_key_end: null, state: 'NORMAL'};
  Object.defineProperty(accessor, 'partition_id', {enumerable: true,
    get() {
      getterReads += 1;
      return 'p-source';
    }});
  const table = {table_id: 't-nodes', table_name: TABLES.NODES,
    active_partition_version: 1, pending_partition_version: null,
    partition_transition_state: null, partition_transition_generation: 1};
  const build = (partitionDescriptor) => buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    partitionDescriptor, tableDescriptor: table});
  t.equal(build(inherited), null, 'inherited identity is not authority');
  t.equal(build(accessor), null, 'accessor identity is not authority');
  t.equal(getterReads, 0, 'validation never invokes an authority getter');
  t.end();
});

test('C17 transition generation orders equal active partition versions', (t) => {
  const methods = createPartitionServiceCdcCoverageMethods();
  const owner = service(database(), null);
  owner.installCdcSourceScopeEvidence = methods.installCdcSourceScopeEvidence;
  const earlier = versionedSourceScope(1, null, 4);
  const later = versionedSourceScope(1, null, 5);
  t.equal(owner.installCdcSourceScopeEvidence(earlier), true);
  t.equal(owner.installCdcSourceScopeEvidence(later), true,
    'newer descriptor generation replaces equal active version');
  t.equal(owner.installCdcSourceScopeEvidence(earlier), false,
    'delayed old descriptor generation cannot replace current authority');
  owner.db.close();
  t.end();
});

test('C17 source enumeration follows SQLite BINARY for NUL and Unicode', async (t) => {
  const db = database();
  const insert = db.prepare(
    'INSERT INTO nodes (node_id, node_address, cpu_cores, memory_mb, disk_gb, ' +
    'last_heartbeat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const keys = ['é', 'z', '\u0000x', 'aa'];
  for (let index = 0; index < keys.length; index += 1) {
    insert.run(keys[index], `address-${index}`, 1, 1024, 10, index, index);
  }
  const owner = service(db);
  const read = await readCompleteCdcCoverage(owner, pageRequest(owner));
  const expected = [...keys].sort((left, right) =>
    Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')));
  t.same(read.rows.map(({node_id: key}) => key), expected,
    'source SQL order matches unsigned UTF-8 byte order');
  t.equal(read.logicalCoverage.lower, null);
  t.equal(read.logicalCoverage.upper, null);
  releaseCdcCoverageTransfer(owner, read.transferId);
  db.close();
  t.end();
});

test('C17 routing and BINARY enumeration retain their distinct owners', (t) => {
  t.equal(Math.sign(compareRoutingKeys(2, '11')), -1,
    'numeric routed key sorts before its persisted TEXT boundary');
  t.equal(Math.sign(compareCdcCoverageKeys('2', '11')), 1,
    'the same TEXT encodings have the opposite BINARY order');
  t.equal(Math.sign(compareRoutingKeys('a', 'Z')), -1,
    'TEXT routing retains locale order');
  t.equal(Math.sign(compareCdcCoverageKeys('a', 'Z')), 1,
    'TEXT enumeration retains SQLite BINARY compatible byte order');
  t.end();
});
