import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {describe, test} from 'node:test';

import {
  createWasmServiceProject,
} from '../../src/cli/service-wasm-scaffold.js';

describe('service-wasm-scaffold', () => {
  test('scaffold generates valid project and handler unit tests pass with object body and distinct account IDs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lagrange-scaffold-test-'));
    try {
      const target = path.join(root, 'amounts-service');
      const result = createWasmServiceProject(target);
      assert.equal(result.name, 'amounts-service');

      // Run node --test in the scaffolded project directory
      const run = spawnSync(process.execPath, ['--test'], {
        cwd: target,
        encoding: 'utf8',
      });
      assert.equal(
        run.status,
        0,
        `scaffold handler tests failed:\n${run.stdout}\n${run.stderr}`,
      );

      // Directly import the scaffolded handler and verify behavior
      const handlerPath = path.join(target, 'src', 'handler.js');
      const {handleAmountSummary} = await import(pathToFileURL(handlerPath).href);

      const calls = [];
      const operation = {kind: 'distributed_operation'};
      const context = {
        call(operationRef, args) {
          calls.push([operationRef, args]);
          return {accountId: args.accountId, status: 'ok'};
        },
        json(val, status) {
          return {body: JSON.stringify(val), status};
        },
      };

      // 1. Parsed object body with accountId: 7
      const res1 = handleAmountSummary({body: {accountId: 7}}, context, operation);
      assert.equal(res1.status, 200);
      assert.deepEqual(calls[0], [operation, {accountId: 7}]);

      // 2. Parsed object body with distinct accountId: 42
      const res2 = handleAmountSummary({body: {accountId: 42}}, context, operation);
      assert.equal(res2.status, 200);
      assert.deepEqual(calls[1], [operation, {accountId: 42}]);

      // 3. Null / empty body
      const res3 = handleAmountSummary({body: null}, context, operation);
      assert.equal(res3.status, 200);
      assert.deepEqual(calls[2], [operation, {accountId: null}]);

      // 4. Array body -> 400
      const res4 = handleAmountSummary({body: [1, 2, 3]}, context, operation);
      assert.equal(res4.status, 400);
      assert.deepEqual(JSON.parse(res4.body), {error: 'invalid_request_body'});

      // 5. Non-object primitive body -> 400
      const res5 = handleAmountSummary({body: 'raw-string'}, context, operation);
      assert.equal(res5.status, 400);
      assert.deepEqual(JSON.parse(res5.body), {error: 'invalid_request_body'});

      // 6. Invalid accountId shape -> 400
      const res6 = handleAmountSummary({body: {accountId: {bad: 1}}}, context, operation);
      assert.equal(res6.status, 400);
      assert.deepEqual(JSON.parse(res6.body), {error: 'invalid_account_id'});

      // 7. Non-int string accountId -> 400
      const res7 = handleAmountSummary({body: {accountId: 'not-an-int'}}, context, operation);
      assert.equal(res7.status, 400);
      assert.deepEqual(JSON.parse(res7.body), {error: 'invalid_account_id'});

      // 8. Negative integer accountId -> 400
      const res8 = handleAmountSummary({body: {accountId: -5}}, context, operation);
      assert.equal(res8.status, 400);
      assert.deepEqual(JSON.parse(res8.body), {error: 'invalid_account_id'});
    } finally {
      await rm(root, {force: true, recursive: true});
    }
  });
});
