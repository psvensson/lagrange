import test from 'node:test';
import assert from 'node:assert/strict';

import {TABLES} from '../../src/constants/index.js';
import {
  POLICY_AUTHORITY_STATE,
  POLICY_ERROR_CODE,
  POLICY_READ_REASON,
} from '../../src/policy/policy-constants.js';
import {
  TablePolicyService,
} from '../../src/policy/table-policy-service.js';
import {
  isConfiguredPolicyRowStale,
} from '../../src/policy/table-policy-committed-base.js';
import {
  PriorityPublicationSafetyRows,
} from '../../src/rebalancer/priority-publication-safety-rows.js';

function buildWitnessedTableRead(row, appliedIndex) {
  return {
    success: true,
    source: 'owner_rpc_lane',
    rowSetComplete: true,
    rows: row ? [{...row}] : [],
    readAuthorityWitness: {
      state: 'observed',
      role: 'leader',
      partitionId: 'tables-p1',
      servingNodeId: 'node-1',
      servingReplicaId: 'tables-p1-r1',
      term: 1,
      commitIndex: appliedIndex,
      appliedIndex,
      observedAtMs: 1700000000000 + appliedIndex,
    },
  };
}

function buildWitnessedPartitionRead(row, appliedIndex) {
  return {
    success: true,
    source: 'owner_rpc_lane',
    rowSetComplete: true,
    rows: row ? [{...row}] : [],
    readAuthorityWitness: {
      state: 'observed',
      role: 'leader',
      partitionId: 'partitions-p1',
      servingNodeId: 'node-1',
      servingReplicaId: 'partitions-p1-r1',
      term: 1,
      commitIndex: appliedIndex,
      appliedIndex,
      observedAtMs: 1700000000000 + appliedIndex,
    },
  };
}

test('R1 producer-ordering-and-identity', async () => {
  const tableId = 't-producer-1';
  let nowTick = 1000;
  const dbRows = new Map([
    [tableId, {
      table_id: tableId,
      created_at: 1000,
      updated_at: 1000,
      version: 1,
      table_policies: JSON.stringify({minReplicaCount: 3}),
    }],
  ]);

  const service = new TablePolicyService({
    now: () => (nowTick += 1),
    systemTableCache: {filter: () => [], getAll: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(_tableName, _sql, [id]) {
        const row = dbRows.get(id);
        return buildWitnessedTableRead(row, row?.updated_at ?? 1000);
      },
      async submitMutation(m) {
        const id = m.whereClause.table_id;
        const cur = dbRows.get(id) || {};
        dbRows.set(id, {...cur, ...m.data, version: (cur.version || 1) + 1});
        return {success: true, outcome: 'applied', partitionResult: {affectedRows: 1}};
      },
    },
  });

  // Initial read sets currency with creation incarnation and version
  const initFact = await service.resolveTablePolicyFact(tableId, {requireAuthoritative: true});
  assert.equal(initFact.state, POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY);
  assert.equal(initFact.minReplicaCount, 3);

  const cur = service.policyCurrencyByTable.get(tableId);
  assert.ok(cur, 'currency must be recorded');
  assert.equal(cur.created_at, 1000, 'currency must track table creation incarnation');

  // Policy update monotonically advances version and preserves creation incarnation
  await service.updateTablePolicy(tableId, {minReplicaCount: 5});
  const updatedCur = service.policyCurrencyByTable.get(tableId);
  assert.ok(updatedCur.version > cur.version, 'version must advance monotonically');
  assert.equal(updatedCur.created_at, 1000, 'creation incarnation must be preserved across updates');

  // Observation from older incarnation is superseded by committed fence/currency
  const olderIncarnationRow = {
    table_id: tableId,
    created_at: 900,
    updated_at: 2000,
    table_policies: JSON.stringify({minReplicaCount: 5}),
  };
  const isSuperseded = service.isSupersededByCommittedPolicyFence(
    updatedCur,
    olderIncarnationRow,
    tableId,
  );
  assert.equal(isSuperseded, true, 'row from older creation incarnation must be superseded');

  // Older witness cannot advance currency backward
  const staleWitness = {term: 1, appliedIndex: 10};
  const staleObsRow = {
    table_id: tableId,
    created_at: 1000,
    updated_at: 500,
    table_policies: JSON.stringify({minReplicaCount: 3}),
  };
  const isStale = service.isStaleAgainstCommittedPolicyFence(
    tableId,
    staleObsRow,
    staleWitness,
    null,
  );
  assert.equal(isStale, true, 'older witness and older updated_at must be stale against currency');
});

test('R2 delayed-old-read-cannot-resurrect', async () => {
  const tableId = 't-aba-resurrect';
  let dbRow = {
    table_id: tableId,
    created_at: 1000,
    updated_at: 100,
    version: 1,
    table_policies: JSON.stringify({minReplicaCount: 3}),
  };

  let releaseDelayed = null;
  const delayedGate = new Promise((resolve) => {
    releaseDelayed = resolve;
  });
  let onDelayedHold = null;
  const delayedHoldingPromise = new Promise((resolve) => {
    onDelayedHold = resolve;
  });
  let holdNext = true;
  let witnessSeq = 100;

  const service = new TablePolicyService({
    now: () => 5000,
    systemTableCache: {filter: () => [], getAll: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        const snap = {...dbRow};
        const idx = witnessSeq++;
        if (holdNext) {
          holdNext = false;
          onDelayedHold();
          await delayedGate;
        }
        return buildWitnessedTableRead(snap, idx);
      },
      async submitMutation(m) {
        dbRow = {...dbRow, ...m.data, version: (dbRow.version || 1) + 1};
        return {success: true, outcome: 'applied', partitionResult: {affectedRows: 1}};
      },
    },
  });

  // 1. Begin delayed read observing minReplicaCount 3
  const delayedReadPromise = service.resolveTablePolicyFact(tableId, {requireAuthoritative: true});
  await delayedHoldingPromise;

  // 2. Commit update to 5, then commit update back to 3 (ABA content recurrence)
  await service.updateTablePolicy(tableId, {minReplicaCount: 5});
  await service.updateTablePolicy(tableId, {minReplicaCount: 3});

  // 3. Fresh read resolves and caches current policy 3 (version 3), retiring transient fence
  const freshRead = await service.resolveTablePolicyFact(tableId, {requireAuthoritative: true});
  assert.equal(freshRead.state, POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY);
  assert.equal(freshRead.minReplicaCount, 3);
  assert.equal(service.committedPolicyFences.has(tableId), false, 'transient fence retired');

  // 4. Release delayed old read (observed minReplicaCount 3 at version 1 / updated_at 100)
  releaseDelayed();
  const delayedResult = await delayedReadPromise;

  // Delayed read must be rejected as stale evidence despite matching policy content (ABA)
  assert.equal(delayedResult.state, POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE);
  assert.equal(delayedResult.reason, POLICY_READ_REASON.STALE_EVIDENCE);

  // Cached policy remains current and valid
  const cached = service.policyCache.get(tableId);
  assert.ok(cached, 'cache must not be poisoned or cleared by delayed read');
  assert.equal(cached.policy.minReplicaCount, 3);

  // Also verify configured policy stale check rejects ABA row when invalidated by commit
  // even if timestamps are identical or null (content recurrence)
  const staleToken = {tableId, invalidatedByCommit: true, currencyEvicted: false};
  const isStale = isConfiguredPolicyRowStale(
    service,
    tableId,
    {table_id: tableId, table_policies: JSON.stringify({minReplicaCount: 3}), updated_at: null},
    staleToken,
  );
  assert.equal(isStale, true, 'isConfiguredPolicyRowStale must reject invalidated ABA row even with null updated_at');
});

test('R3 retirement-eviction-and-recreation', async () => {
  const tableId = 't-recreate-1';
  let dbRow = {
    table_id: tableId,
    created_at: 1000,
    updated_at: 1000,
    version: 1,
    table_policies: JSON.stringify({minReplicaCount: 3}),
  };

  let releaseOldRead = null;
  const oldReadGate = new Promise((resolve) => {
    releaseOldRead = resolve;
  });
  let onOldReadHold = null;
  const oldReadHoldingPromise = new Promise((resolve) => {
    onOldReadHold = resolve;
  });
  let holdOldRead = true;

  const service = new TablePolicyService({
    maxCommittedPolicyFences: 2,
    systemTableCache: {filter: () => [], getAll: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(_tableName, _sql, [id]) {
        if (!dbRow || id !== tableId) {
          return {
            success: true,
            source: 'owner_rpc_lane',
            rowSetComplete: true,
            rows: [],
            readAuthorityWitness: {
              state: 'observed',
              role: 'leader',
              partitionId: 'tables-p1',
              servingNodeId: 'node-1',
              servingReplicaId: 'tables-p1-r1',
              term: 1,
              commitIndex: 200,
              appliedIndex: 200,
              observedAtMs: 1700000000200,
            },
          };
        }
        const snap = {...dbRow};
        if (holdOldRead) {
          holdOldRead = false;
          onOldReadHold();
          await oldReadGate;
        }
        return buildWitnessedTableRead(snap, snap.updated_at);
      },
      async submitMutation(m) {
        dbRow = {...dbRow, ...m.data, version: (dbRow?.version || 1) + 1};
        return {success: true, outcome: 'applied', partitionResult: {affectedRows: 1}};
      },
    },
  });

  // 1. Begin read on incarnation 1 (created_at 1000)
  const inFlightOldRead = service.resolveTablePolicyFact(tableId, {requireAuthoritative: true});
  await oldReadHoldingPromise;

  // 2. Table is dropped / deleted: deleteTablePolicy called, dbRow cleared
  service.deleteTablePolicy(tableId);
  dbRow = null;

  // 3. Table is recreated with same ID but new incarnation (created_at 2000, minReplicaCount 5)
  // Even if updated_at is identical (1000), creation incarnation differs!
  dbRow = {
    table_id: tableId,
    created_at: 2000,
    updated_at: 1000,
    version: 1,
    table_policies: JSON.stringify({minReplicaCount: 5}),
  };

  // Fresh read on recreated table establishes currency at incarnation 2000
  const freshRecreated = await service.resolveTablePolicyFact(
    tableId,
    {requireAuthoritative: true},
  );
  assert.equal(freshRecreated.state, POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY);
  assert.equal(freshRecreated.minReplicaCount, 5);

  // 4. Release old in-flight read from incarnation 1000
  releaseOldRead();
  const oldResult = await inFlightOldRead;

  // Old read must be rejected and cannot resurrect incarnation 1 policy
  assert.equal(oldResult.state, POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE);
  assert.equal(oldResult.reason, POLICY_READ_REASON.STALE_EVIDENCE);

  // Policy cache must still hold the recreated policy (5), not the old one (3)
  assert.equal(service.policyCache.get(tableId)?.policy?.minReplicaCount, 5);

  // 5. Authoritative absence: when table is deleted and absent, returns AUTHORITATIVE_ABSENCE
  dbRow = null;
  service.deleteTablePolicy(tableId);
  const absentFact = await service.resolveTablePolicyFact(tableId, {requireAuthoritative: true});
  assert.equal(absentFact.state, POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE);
  assert.equal(absentFact.reason, POLICY_READ_REASON.TABLE_ABSENT);

  // 6. Eviction under capacity bounds: oldest entry evicted marks in-flight read evicted
  const rows = new Map([0, 1, 2].map((i) => [`tab-evict-${i}`, {
    table_id: `tab-evict-${i}`,
    created_at: 1000,
    updated_at: 1000 + i,
    version: 1,
    table_policies: JSON.stringify({minReplicaCount: 3}),
  }]));
  let releaseEvicted = null;
  const evictGate = new Promise((r) => {
    releaseEvicted = r;
  });
  let onEvictHold = null;
  const evictHoldingPromise = new Promise((r) => {
    onEvictHold = r;
  });
  let holdEvict0 = true;

  const evictService = new TablePolicyService({
    maxCommittedPolicyFences: 2,
    systemTableCache: {filter: () => [], getAll: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(_t, _sql, [id]) {
        const snap = {...rows.get(id)};
        if (id === 'tab-evict-0' && holdEvict0) {
          holdEvict0 = false;
          onEvictHold();
          await evictGate;
        }
        return buildWitnessedTableRead(snap, snap.updated_at);
      },
      async submitMutation(m) {
        const id = m.whereClause.table_id;
        rows.set(id, {...rows.get(id), ...m.data, version: 2});
        return {success: true, outcome: 'applied', partitionResult: {affectedRows: 1}};
      },
    },
  });

  const rInFlightEvicted = evictService.resolveTablePolicyFact('tab-evict-0', {requireAuthoritative: true});
  await evictHoldingPromise;

  // Commit on 0, 1, 2 fills capacity (max 2) and evicts 0
  await evictService.updateTablePolicy('tab-evict-0', {minReplicaCount: 5});
  await evictService.updateTablePolicy('tab-evict-1', {minReplicaCount: 5});
  await evictService.updateTablePolicy('tab-evict-2', {minReplicaCount: 5});

  releaseEvicted();
  const evictedResult = await rInFlightEvicted;
  assert.equal(evictedResult.state, POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE);
  assert.equal(evictedResult.reason, POLICY_READ_REASON.STALE_EVIDENCE);
});

test('R4 real-permission-consumer', async () => {
  const tableId = 't-consumer-1';
  const partitionId = 'p-consumer-1';

  let dbTableRow = {
    table_id: tableId,
    created_at: 1000,
    updated_at: 100,
    version: 1,
    table_policies: JSON.stringify({minReplicaCount: 3}),
  };

  const dbPartitionRow = {
    partition_id: partitionId,
    table_id: tableId,
    replica_count: 7,
  };

  let releaseOldRead = null;
  const oldReadGate = new Promise((resolve) => {
    releaseOldRead = resolve;
  });
  let onConsumerTableHold = null;
  const consumerTableHoldingPromise = new Promise((resolve) => {
    onConsumerTableHold = resolve;
  });
  let holdNextTableRead = true;
  let witnessSeq = 10;

  const tablePolicyService = new TablePolicyService({
    now: () => 5000,
    systemTableCache: {filter: () => [], getAll: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(tableName, _sql, [_id]) {
        const idx = witnessSeq++;
        if (tableName === TABLES.PARTITIONS) {
          return buildWitnessedPartitionRead(dbPartitionRow, idx);
        }
        if (tableName === TABLES.TABLES) {
          const snap = {...dbTableRow};
          if (holdNextTableRead) {
            holdNextTableRead = false;
            onConsumerTableHold();
            await oldReadGate;
          }
          return buildWitnessedTableRead(snap, idx);
        }
        return {success: false, rows: []};
      },
      async submitMutation(m) {
        dbTableRow = {...dbTableRow, ...m.data, version: (dbTableRow.version || 1) + 1};
        return {success: true, outcome: 'applied', partitionResult: {affectedRows: 1}};
      },
    },
  });

  const safetyRows = Object.create(PriorityPublicationSafetyRows.prototype);
  safetyRows.tablePolicyService = tablePolicyService;
  safetyRows.repository = {
    controlPlaneSystemTableGateway: tablePolicyService.getControlPlaneSystemTableGateway(),
  };

  // Schedule:
  // 1. Begin authoritative read observing minimum replica count 3, hold it open
  const delayedOldReadPromise = safetyRows.getCriticalMinReplicaCount(partitionId);
  await consumerTableHoldingPromise;

  // 2. Commit policy update to 5, then commit policy update to 7
  await tablePolicyService.updateTablePolicy(tableId, {minReplicaCount: 5});
  await tablePolicyService.updateTablePolicy(tableId, {minReplicaCount: 7});

  // 3. Execute fresh read via getCriticalMinReplicaCount that observes and caches 7
  const freshMin = await safetyRows.getCriticalMinReplicaCount(partitionId);
  assert.equal(freshMin, 7, 'fresh read must observe and return updated minimum replica count 7');
  assert.equal(tablePolicyService.policyCache.get(tableId)?.policy?.minReplicaCount, 7);

  // 4. Release delayed old 3 read
  releaseOldRead();

  // 5. Verify delayed old 3 read is rejected as stale
  await assert.rejects(
    delayedOldReadPromise,
    (err) => err.code === POLICY_ERROR_CODE.READ_UNAVAILABLE &&
      err.reason === POLICY_READ_REASON.STALE_EVIDENCE,
    'delayed old read must be rejected as stale evidence',
  );

  // 6. Verify cached minimum 7 is preserved and safety continues enforcing minimum 7
  assert.equal(tablePolicyService.policyCache.get(tableId)?.policy?.minReplicaCount, 7);
  const recheckMin = await safetyRows.getCriticalMinReplicaCount(partitionId);
  assert.equal(recheckMin, 7, 'safetyRows must continue enforcing minimum replica count 7');

  // Removal permission check: removing from 7 live replicas would drop below 7 -> refused!
  const currentLiveReplicas = 7;
  const isSafeToRemove = (currentLiveReplicas - 1) >= recheckMin;
  assert.equal(isSafeToRemove, false, 'removal must be refused when live count drops below critical min 7');
});

test('R5 fresh-read-progress-and-resource-bounds', async () => {
  const tableId = 't-progress-1';
  let dbRow = {
    table_id: tableId,
    created_at: 1000,
    updated_at: 100,
    version: 1,
    table_policies: JSON.stringify({minReplicaCount: 3}),
  };

  const service = new TablePolicyService({
    maxCommittedPolicyFences: 10,
    systemTableCache: {filter: () => [], getAll: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return buildWitnessedTableRead(dbRow, dbRow.updated_at);
      },
      async submitMutation(m) {
        dbRow = {...dbRow, ...m.data, version: (dbRow.version || 1) + 1};
        return {success: true, outcome: 'applied', partitionResult: {affectedRows: 1}};
      },
    },
  });

  // Fresh read succeeds and populates cache
  const f1 = await service.resolveTablePolicyFact(tableId, {requireAuthoritative: true});
  assert.equal(f1.state, POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY);
  assert.equal(f1.minReplicaCount, 3);

  // Active reads map is empty after read settles (no leaks)
  assert.equal(service.activePolicyReadsByTable.has(tableId), false, 'active reads set must be deleted when empty');

  // Resource bounds: insert 30 tables with maxCommittedPolicyFences = 10
  for (let i = 0; i < 30; i += 1) {
    service.recordCommittedPolicyFence(`t-bound-${i}`, {
      table_policies: JSON.stringify({minReplicaCount: 3}),
      updated_at: 1000 + i,
      version: 1,
    });
  }

  assert.ok(service.committedPolicyFences.size <= 10, 'committedPolicyFences must be bounded');
  assert.ok(service.policyCurrencyByTable.size <= 10, 'policyCurrencyByTable must be bounded');
  assert.equal(service.committedPolicyFences.has('t-bound-0'), false, 'oldest fence must be evicted');
  assert.equal(service.committedPolicyFences.has('t-bound-29'), true, 'newest fence must be retained');
});
