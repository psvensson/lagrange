import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const WORKFLOW_PATH = fileURLToPath(new URL(
  '../../.github/workflows/tidb-reference-gcp.yml',
  import.meta.url,
));
const source = await readFile(WORKFLOW_PATH, 'utf8');
const referenceClientPaths = source
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.includes('test/distributed/reference-client/'));

assert.equal(
  source.includes('test/distributed/reference-client/**'),
  false,
  'TiDB GCP workflow must not subscribe to every reference client',
);
assert.deepEqual(referenceClientPaths, [
  '- "test/distributed/reference-client/package.json"',
  '- "test/distributed/reference-client/package-lock.json"',
  '- "test/distributed/reference-client/tidb-oltp-adapter.js"',
]);
for (const path of referenceClientPaths) {
  assert.equal(
    path.includes('lagrange-'),
    false,
    'TiDB GCP workflow must not subscribe to Lagrange-only reference clients',
  );
}
assert.equal(
  source.includes('test/distributed/harness/oltp-baseline-*.js'),
  true,
  'TiDB GCP workflow must retain shared OLTP owner coverage',
);
assert.equal(
  source.includes('test/distributed/harness/tidb-reference-lifecycle.js'),
  true,
  'TiDB GCP workflow must retain TiDB lifecycle owner coverage',
);

console.log(
  'tidb-reference-gcp-path-ownership-guard: PASS ' +
  JSON.stringify({referenceClientPaths: referenceClientPaths.length}),
);
