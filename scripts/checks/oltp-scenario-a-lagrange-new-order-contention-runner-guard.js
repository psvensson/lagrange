import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

import {
  runLagrangeScenarioANewOrderContentionProof,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-new-order-contention-runner.js';

const RUNNER_PATH = fileURLToPath(new URL(
  '../../test/distributed/harness/oltp-scenario-a-lagrange-new-order-contention-runner.js',
  import.meta.url,
));
const source = await readFile(RUNNER_PATH, 'utf8');

assert.equal(typeof runLagrangeScenarioANewOrderContentionProof, 'function');
for (const required of [
  'prepareLagrangeScenarioAPublicPgContext',
  'createLagrangeOltpAdapter',
  'observeLagrangeNewOrderContentionState',
  'executePairedOltpTransactionWithRetry',
  'waitForDataConvergence',
  'admissionSha256',
  'runtimePreflightSha256',
  'comparable: false',
]) {
  assert.equal(
    source.includes(required),
    true,
    `Lagrange contention runner must consume ${required}`,
  );
}

for (const forbidden of [
  'service_definitions',
  'service_endpoints',
  'waitForConvergence',
  'computeSourceFingerprint',
  'ctx.call',
  'DB.call',
  "from '../../src/",
  "from '../../../src/",
  '.query(',
]) {
  assert.equal(
    source.includes(forbidden),
    false,
    `Lagrange contention runner must not own ${forbidden}`,
  );
}

await assert.rejects(
  runLagrangeScenarioANewOrderContentionProof(),
  /requires options/u,
);
await assert.rejects(
  runLagrangeScenarioANewOrderContentionProof({
    cluster: {},
    admission: {},
    executionPath: 'internal-sql',
  }),
  /unsupported Lagrange new-order contention runner option executionPath/u,
);

console.log('oltp-scenario-a-lagrange-new-order-contention-runner-guard: PASS');
