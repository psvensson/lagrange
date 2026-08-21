import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  planClassifiedTestFiles,
  runClassifiedTestFiles,
} from '../../scripts/run-classified-test-files.js';
import {
  RESOURCE_CLASS_EXCLUSIVE,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  RESOURCE_CLASS_JOBS,
  RESOURCE_CLASS_ORDINARY,
} from '../../scripts/checks/test-resource-classification-constants.js';

const root = process.cwd();
const ORDINARY = 'test/address/address-manager.test.js';
const TOOLCHAIN = 'test/examples/service-compiler-account-summary-parity.test.js';
const INTEGRATION = 'test/integration/admin-cdc-propagation.integration.test.js';
const SHARED_OUTPUT =
  'test/scripts/exact-election-evidence-same-turn-model-contract.test.js';

test('one classified plan owns concurrency for every test source', () => {
  const plan = planClassifiedTestFiles(root,
    [SHARED_OUTPUT, INTEGRATION, TOOLCHAIN, ORDINARY]);
  const byClass = Object.fromEntries(plan.map((lane) =>
    [lane.resourceClass, lane]));

  assert.deepEqual(byClass[RESOURCE_CLASS_ORDINARY].files, [ORDINARY]);
  assert.equal(byClass[RESOURCE_CLASS_ORDINARY].jobs,
    RESOURCE_CLASS_JOBS[RESOURCE_CLASS_ORDINARY]);
  assert.deepEqual(byClass[RESOURCE_CLASS_EXTERNAL_TOOLCHAIN].files,
    [TOOLCHAIN]);
  assert.equal(byClass[RESOURCE_CLASS_EXTERNAL_TOOLCHAIN].jobs, 1);
  assert.deepEqual(byClass[RESOURCE_CLASS_EXCLUSIVE].files,
    [INTEGRATION, SHARED_OUTPUT].sort());
  assert.equal(byClass[RESOURCE_CLASS_EXCLUSIVE].jobs, 1);
});

test('the executor runs classified lanes serially with their owned budgets', () => {
  const calls = [];
  const status = runClassifiedTestFiles(
    [INTEGRATION, TOOLCHAIN, ORDINARY], {
      root,
      spawn(command, args, options) {
        calls.push({args, command, tapTimeout: options.env.TAP_TIMEOUT});
        return {status: 0};
      },
    });

  assert.equal(status, 0);
  assert.deepEqual(calls.map((call) => call.args[1]),
    ['--jobs=4', '--jobs=1', '--jobs=1']);
  assert.deepEqual(calls.map((call) => call.args.at(-1)),
    [ORDINARY, TOOLCHAIN, INTEGRATION]);
  assert.equal(calls[2].tapTimeout, '120');
});

test('the classified plan fails closed on duplicates and unknown paths', () => {
  assert.throws(() => planClassifiedTestFiles(root, [ORDINARY, ORDINARY]),
    /duplicate/u);
  assert.throws(() => planClassifiedTestFiles(
    root, ['test/not-present.test.js']), /unclassified or missing/u);
});
