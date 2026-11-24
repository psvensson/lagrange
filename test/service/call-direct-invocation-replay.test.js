import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import Database from 'better-sqlite3';

import {
  createCallCellReduceCoordinator,
} from '../../src/runtime/call-cell-reduce-coordinator.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from '../../src/service/call-cell-routing-contract.js';
import {
  DirectCallReplayCoordinator,
  executeWithDirectCallReplay,
} from '../../src/service/call-direct-invocation-replay.js';

const SECURITY_CONTEXT = Object.freeze({
  principal: 'app-user',
  tenantId: 'tenant-1',
});

function createDurableResultStore() {
  const rows = new Map();
  return {
    rows,
    seedResultRow(invocationId, admissionMeta) {
      rows.set(invocationId, {
        result_id: invocationId,
        result_json: '',
        source_snapshot_json: JSON.stringify({admissionMeta}),
      });
    },
    async readResultRow(invocationId) {
      return rows.get(invocationId) || null;
    },
    async updateResultWitness(invocationId, witness) {
      const existing = rows.get(invocationId);
      if (!existing) {
        return;
      }
      rows.set(invocationId, {
        ...existing,
        source_snapshot_json: JSON.stringify(witness ?? null),
      });
    },
    publishFinalSnapshot(invocationId, resultJson, witness) {
      rows.set(invocationId, {
        result_id: invocationId,
        result_json: resultJson,
        source_snapshot_json: JSON.stringify(witness),
      });
    },
  };
}

function sampleRequest(invocationKey = 'key-1') {
  return {
    argumentsJson: '{"accountId":42}',
    callerServiceId: 'svc-caller',
    invocationKey,
    name: 'summarize',
    securityContext: SECURITY_CONTEXT,
  };
}

describe('DirectCallReplayCoordinator durable authority', () => {
  it('fails closed when reduceCoordinator lacks readResultRow or updateResultWitness', async () => {
    const missingBoth = new DirectCallReplayCoordinator({});
    const missingWrite = new DirectCallReplayCoordinator({
      reduceCoordinator: {readResultRow: async () => null},
    });
    const missingRead = new DirectCallReplayCoordinator({
      reduceCoordinator: {updateResultWitness: async () => {}},
    });
    const intent = missingBoth.buildIntent(sampleRequest());

    for (const coordinator of [missingBoth, missingWrite, missingRead]) {
      assert.equal('_fallbackRecords' in coordinator, false);
      await assert.rejects(
        () => coordinator.inspectExisting(intent),
        (err) => err.code === CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      );
    }
  });

  it('distinguishes absent row (ADMIT_FRESH) from present corrupt/missing witness (INVOCATION_AMBIGUOUS)', async () => {
    const store = createDurableResultStore();
    const coordinator = new DirectCallReplayCoordinator({
      nowProvider: () => 1_000,
      reduceCoordinator: store,
    });
    const intent = coordinator.buildIntent(sampleRequest('key-corrupt'));

    const fresh = await coordinator.inspectExisting(intent);
    assert.equal(fresh.action, 'admit_fresh');

    const corruptRows = [
      {result_id: intent.scopedInvocationId, result_json: '', source_snapshot_json: null},
      {result_id: intent.scopedInvocationId, result_json: '', source_snapshot_json: ''},
      {result_id: intent.scopedInvocationId, result_json: '', source_snapshot_json: '{bad json'},
      {result_id: intent.scopedInvocationId, result_json: '', source_snapshot_json: JSON.stringify({})},
      {
        result_id: intent.scopedInvocationId,
        result_json: '',
        source_snapshot_json: JSON.stringify({admissionMeta: 'not-an-object'}),
      },
    ];

    for (const row of corruptRows) {
      store.rows.set(intent.scopedInvocationId, row);
      await assert.rejects(
        () => coordinator.inspectExisting(intent),
        (err) =>
          err.code === CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS &&
          err.classification === CALL_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS,
      );
    }
  });

  it('produces identical decisions across local instance and fresh instances reading the durable store', async () => {
    const store = createDurableResultStore();
    const nowProvider = () => 5_000;
    const local = new DirectCallReplayCoordinator({
      nowProvider,
      reduceCoordinator: store,
    });
    const freshA = new DirectCallReplayCoordinator({
      nowProvider,
      reduceCoordinator: store,
    });
    const freshB = new DirectCallReplayCoordinator({
      nowProvider,
      reduceCoordinator: store,
    });

    const intent = local.buildIntent(sampleRequest('key-shared'));
    const admissionMeta = local.createAdmissionMeta(
      intent,
      {bindingVersionId: 'bv-1', generation: 1},
      null,
    );

    // Record completion into durable store (mirroring CallCellInvoker.publishFinalSnapshot)
    const resultJson = '{"total":99}';
    const finalWitness = await local.recordCompleted(
      intent.scopedInvocationId,
      admissionMeta,
      resultJson,
      {schemaVersion: 1, slots: []},
    );
    store.publishFinalSnapshot(intent.scopedInvocationId, resultJson, finalWitness);

    const [dLocal, dFreshA, dFreshB] = await Promise.all([
      local.inspectExisting(intent),
      freshA.inspectExisting(intent),
      freshB.inspectExisting(intent),
    ]);

    assert.deepEqual(dLocal, dFreshA);
    assert.deepEqual(dFreshA, dFreshB);
    assert.equal(dLocal.action, 'replay_completed');
    assert.equal(dLocal.resultJson, resultJson);

    // Also verify retryable failure decision equivalence across instances
    const retryIntent = local.buildIntent(sampleRequest('key-retry'));
    const retryMeta = local.createAdmissionMeta(
      retryIntent,
      {bindingVersionId: 'bv-1', generation: 1},
      null,
    );
    // Faithful SQL UPDATE never creates a missing row.
    await store.updateResultWitness(retryIntent.scopedInvocationId, {admissionMeta: retryMeta});
    assert.equal(await store.readResultRow(retryIntent.scopedInvocationId), null);

    // Seed the result row first (matching CallCellInvoker seeding before shard dispatch).
    store.seedResultRow(retryIntent.scopedInvocationId, retryMeta);
    await local.recordFailure(
      retryIntent.scopedInvocationId,
      retryMeta,
      createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE,
        'host not ready',
        {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      ),
      false,
    );

    const [rLocal, rFreshA, rFreshB] = await Promise.all([
      local.inspectExisting(retryIntent),
      freshA.inspectExisting(retryIntent),
      freshB.inspectExisting(retryIntent),
    ]);
    assert.deepEqual(rLocal, rFreshA);
    assert.deepEqual(rFreshA, rFreshB);
    assert.equal(rLocal.action, 'retry_pinned');
    assert.equal(rLocal.meta.pinnedBindingVersionId, 'bv-1');
  });

  it('recovers immediately on retry after an interrupted seedInvocation in real SQLite',
    async () => {
      const db = new Database(':memory:');
      try {
        db.exec(
          'CREATE TABLE call_cell_reduce_slots (' +
          'invocation_id TEXT NOT NULL, ' +
          'slot_id INTEGER NOT NULL, ' +
          'replica_id TEXT NOT NULL, ' +
          'lease_expires_at INTEGER NOT NULL, ' +
          'partial_json TEXT NOT NULL, ' +
          'computed_at INTEGER NOT NULL, ' +
          'PRIMARY KEY (invocation_id, slot_id))',
        );
        db.exec(
          'CREATE TABLE call_cell_reduce_results (' +
          'result_id TEXT PRIMARY KEY, ' +
          'result_json TEXT NOT NULL, ' +
          'computed_at INTEGER NOT NULL, ' +
          'source_snapshot_json TEXT NOT NULL)',
        );

        let nowMs = 10_000;
        let slotInserts = 0;
        let injectedSeedFailure = false;
        const executeInternal = async (sqlText) => {
          const trimmed = sqlText.trim();
          if (trimmed.startsWith('INSERT INTO call_cell_reduce_slots')) {
            slotInserts += 1;
            if (!injectedSeedFailure && slotInserts === 2) {
              injectedSeedFailure = true;
              throw createCallRoutingFailure(
                CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
                'injected failure after slot 1 insert before result row',
                {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
              );
            }
          }
          if (trimmed.startsWith('SELECT ')) {
            return {results: db.prepare(trimmed).all(), success: true};
          }
          const info = db.prepare(trimmed).run();
          return {changes: info.changes, success: true};
        };

        const reduceCoordinator = createCallCellReduceCoordinator({
          coordinationTable: 'call_cell_reduce_slots',
          executeInternal,
          leaseMs: 5_000,
          nowProvider: () => nowMs,
          resultTable: 'call_cell_reduce_results',
          slotCount: 2,
        });
        const replayCoordinator = new DirectCallReplayCoordinator({
          nowProvider: () => nowMs,
          reduceCoordinator,
        });
        const routeResolver = {
          resolve: () => ({bindingVersionId: 'bv-1', generation: 1, replicaId: 'r-1'}),
        };
        const request = sampleRequest('key-partial-seed');

        const invokeOnce = () => {
          const executionEvidence = {started: false};
          return executeWithDirectCallReplay({
            executionEvidence,
            replayCoordinator,
            request,
            resolveProbePrefix: 'probe:',
            routeResolver,
            runCore: async (effectiveReq) => {
              const invocationId = effectiveReq.invocationId;
              if (!effectiveReq._skipSeedIfRetry) {
                await reduceCoordinator.seedInvocation(
                  invocationId, [1, 2], effectiveReq._admissionMeta,
                );
              }
              executionEvidence.started = true;
              await reduceCoordinator.acquireReduceLease(invocationId, 'r-1', 1);
              await reduceCoordinator.publishPartial(
                invocationId, 1, 'r-1', JSON.stringify([{groupKey: 'k1', aggValue: 10}]), nowMs,
              );
              await reduceCoordinator.acquireReduceLease(invocationId, 'r-2', 2);
              await reduceCoordinator.publishPartial(
                invocationId, 2, 'r-2', JSON.stringify([{groupKey: 'k2', aggValue: 20}]), nowMs,
              );
              const gate = await reduceCoordinator.resolveCompletePartialSet(
                invocationId, [1, 2], 10,
              );
              const resultJson = JSON.stringify({sum: 30});
              const finalWitness = await replayCoordinator.recordCompleted(
                invocationId, effectiveReq._admissionMeta, resultJson, gate.witness,
              );
              await reduceCoordinator.publishFinalSnapshot(invocationId, resultJson, finalWitness);
              return resultJson;
            },
          });
        };

        // Attempt 1 fails mid-seed after slot 1 is inserted, before slot 2 or result row exist.
        await assert.rejects(
          () => invokeOnce(),
          (err) => err.code === CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        );
        const partialSlots = db.prepare('SELECT * FROM call_cell_reduce_slots').all();
        const partialResults = db.prepare('SELECT * FROM call_cell_reduce_results').all();
        assert.equal(partialSlots.length, 1, 'slot 1 remains from interrupted seed');
        assert.equal(partialSlots[0].slot_id, 1);
        assert.equal(partialResults.length, 0, 'result row was not inserted');

        // Immediate retry at the exact same timestamp (no retention expiry) must succeed.
        const result = await invokeOnce();
        assert.equal(result, JSON.stringify({sum: 30}));
        assert.equal(db.prepare('SELECT * FROM call_cell_reduce_slots').all().length, 2);
        assert.equal(db.prepare('SELECT * FROM call_cell_reduce_results').all().length, 1);

        // Subsequent retry replays the durably completed result without re-executing.
        nowMs += 10;
        const replayed = await invokeOnce();
        assert.equal(replayed, JSON.stringify({sum: 30}));
      } finally {
        db.close();
      }
    });
});
