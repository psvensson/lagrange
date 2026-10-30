import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const WORKFLOW_PATH = fileURLToPath(new URL(
  '../../.github/workflows/tidb-reference-gcp.yml',
  import.meta.url,
));
const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const REFERENCE_CLIENT_PREFIX = 'test/distributed/reference-client/';
const GLOB_ALL_REFERENCE_CLIENTS = 'test/distributed/reference-client/**';
const MSG_SUBSCRIBE_ALL =
  'TiDB GCP workflow must not subscribe to every reference client';
const EXPECTED_REFERENCE_CLIENT_PATHS = Object.freeze([
  '- "test/distributed/reference-client/package.json"',
  '- "test/distributed/reference-client/package-lock.json"',
  '- "test/distributed/reference-client/tidb-oltp-adapter.js"',
]);
const LAGRANGE_PREFIX = 'lagrange-';
const MSG_LAGRANGE_ONLY =
  'TiDB GCP workflow must not subscribe to Lagrange-only reference clients';
const OLTP_BASELINE_PATTERN = 'test/distributed/harness/oltp-baseline-*.js';
const MSG_OLTP_OWNER =
  'TiDB GCP workflow must retain shared OLTP owner coverage';
const TIDB_LIFECYCLE_PATTERN =
  'test/distributed/harness/tidb-reference-lifecycle.js';
const MSG_TIDB_LIFECYCLE =
  'TiDB GCP workflow must retain TiDB lifecycle owner coverage';
const PASS_PREFIX = 'tidb-reference-gcp-path-ownership-guard: PASS ';

const source = await readFile(WORKFLOW_PATH, ENCODING_UTF8);
const referenceClientPaths = arrayFilter(
  arrayMap(stringSplit(source, NEWLINE), (line) => stringTrim(line)),
  (line) => stringIncludes(line, REFERENCE_CLIENT_PREFIX),
);

assert.equal(
  stringIncludes(source, GLOB_ALL_REFERENCE_CLIENTS),
  false,
  MSG_SUBSCRIBE_ALL,
);
assert.deepEqual(referenceClientPaths, EXPECTED_REFERENCE_CLIENT_PATHS);
for (const path of referenceClientPaths) {
  assert.equal(
    stringIncludes(path, LAGRANGE_PREFIX),
    false,
    MSG_LAGRANGE_ONLY,
  );
}
assert.equal(
  stringIncludes(source, OLTP_BASELINE_PATTERN),
  true,
  MSG_OLTP_OWNER,
);
assert.equal(
  stringIncludes(source, TIDB_LIFECYCLE_PATTERN),
  true,
  MSG_TIDB_LIFECYCLE,
);

console.log(
  PASS_PREFIX +
  JSON.stringify({referenceClientPaths: referenceClientPaths.length}),
);
