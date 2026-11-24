import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {WASM_OPERATION_STATE} from '../../src/constants/wasm-meta.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
} from '../../src/service/request-cell-routing-contract.js';
import {
  createRequestCellInvocationOwner,
} from '../../src/runtime/request-cell-invocation-owner.js';

const QUERY_EXECUTOR_FACTORY_EVENT = Object.freeze({
  EXECUTOR_INJECTED: 'executor_injected',
});

function createOwnerHarness(executor) {
  const owner = {
    _queryExecutorFactory: () => executor,
    emit() {},
  };
  const invocationOwner = createRequestCellInvocationOwner({
    QUERY_EXECUTOR_FACTORY_EVENT,
    WASM_OPERATION_STATE,
  });
  return {invocationOwner, owner};
}

describe('createRequestCellInvocationOwner journal authority', () => {
  it('throws INVOCATION_AMBIGUOUS when a COMPLETED row has missing or malformed result JSON', async () => {
    const command = 'invoke:svc-1:intent-digest-1';
    const corruptResults = [null, undefined, '', '{corrupt-json', 42];

    for (const rawResult of corruptResults) {
      const executor = {
        async executeInternal(sql) {
          assert.match(sql, /^SELECT/u);
          return {
            rows: [{
              command,
              created_at: 1000,
              operation_id: 'op-completed-corrupt',
              result: rawResult,
              state: WASM_OPERATION_STATE.COMPLETED,
              updated_at: 1000,
            }],
            success: true,
          };
        },
      };
      const {invocationOwner, owner} = createOwnerHarness(executor);
      let driverCalled = false;

      await assert.rejects(
        () => invocationOwner.invokeWithDurableFence(
          owner,
          {service_id: 'svc-1', tenantId: 'tenant-1'},
          'svc-1',
          {
            intentDigest: 'intent-digest-1',
            invocationId: 'inv-corrupt-1',
            now: () => 1000,
            tenantId: 'tenant-1',
          },
          async () => {
            driverCalled = true;
            return {ok: true};
          },
        ),
        (err) =>
          err.code === REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS &&
          err.classification === REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS,
      );
      assert.equal(driverCalled, false);
    }
  });

  it('replays valid COMPLETED result JSON including explicit JSON null', async () => {
    const command = 'invoke:svc-1:intent-digest-1';
    for (const [rawResult, expectedValue] of [
      ['{"status":200,"body":"ok"}', {body: 'ok', status: 200}],
      ['null', null],
    ]) {
      const executor = {
        async executeInternal() {
          return {
            rows: [{
              command,
              created_at: 1000,
              operation_id: 'op-completed-ok',
              result: rawResult,
              state: WASM_OPERATION_STATE.COMPLETED,
              updated_at: 1000,
            }],
            success: true,
          };
        },
      };
      const {invocationOwner, owner} = createOwnerHarness(executor);
      const outcome = await invocationOwner.invokeWithDurableFence(
        owner,
        {service_id: 'svc-1', tenantId: 'tenant-1'},
        'svc-1',
        {
          intentDigest: 'intent-digest-1',
          invocationId: 'inv-valid-1',
          now: () => 1000,
          tenantId: 'tenant-1',
        },
        async () => assert.fail('replayed completed invocation must not run driver'),
      );
      assert.equal(outcome.replayed, true);
      assert.deepEqual(outcome.value, expectedValue);
    }
  });

  it('rejects legacy bare-function queryExecutor without executeInternal', async () => {
    const legacyBareFunction = async () => ({rows: [], success: true});
    const {invocationOwner, owner} = createOwnerHarness(legacyBareFunction);

    await assert.rejects(
      () => invocationOwner.invokeWithDurableFence(
        owner,
        {service_id: 'svc-1', tenantId: 'tenant-1'},
        'svc-1',
        {
          intentDigest: 'intent-digest-1',
          invocationId: 'inv-legacy-exec',
          now: () => 1000,
          tenantId: 'tenant-1',
        },
        async () => ({ok: true}),
      ),
      (err) => err.code === REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
    );
  });
});
