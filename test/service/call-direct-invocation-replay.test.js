import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from '../../src/service/call-cell-routing-contract.js';
import {
  DirectCallReplayCoordinator,
} from '../../src/service/call-direct-invocation-replay.js';

const SECURITY_CONTEXT = Object.freeze({
  principal: 'app-user',
  tenantId: 'tenant-1',
});

function createDurableResultStore() {
  const rows = new Map();
  return {
    rows,
    async readResultRow(invocationId) {
      return rows.get(invocationId) || null;
    },
    async updateResultWitness(invocationId, witness) {
      const existing = rows.get(invocationId) || {
        result_id: invocationId,
        result_json: '',
      };
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
});
