/**
 * Contract of the embedded-cluster harness's application process (no cluster).
 *
 * The public-seam acceptance suites prove what an APPLICATION can do, so the
 * process that plays the application (test/integration/helpers/
 * embedded-node-worker.js) must reach Lagrange only through the public package
 * entry `src/public-api.js`. This pins that import census, the exposure codec
 * that carries everything the application observed back to the parent, the
 * topology-leak detector the suites share. No process or node is started
 * here; the IPC round trip itself is exercised by the multi-node suites.
 */

import {Buffer} from 'node:buffer';
import {readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {
  decodeExposure,
  decodeParams,
  encodeParam,
  expose,
  exposedProperty,
} from '../integration/helpers/embedded-node-protocol.js';
import {
  SESSION_KEY_FRAGMENT,
  findTopologyLeaks,
} from '../integration/helpers/public-surface-leak.js';

const HELPERS = new URL('../integration/helpers/', import.meta.url);
const WORKER_URL = new URL('embedded-node-worker.js', HELPERS);
const PROTOCOL_URL = new URL('embedded-node-protocol.js', HELPERS);
const PUBLIC_ENTRY_SPECIFIER = '../../../src/public-api.js';
const PROTOCOL_SPECIFIER = './embedded-node-protocol.js';
const NODE_BUILTIN_PREFIX = 'node:';
const IMPORT_SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
const NODE_ID = '6a6be293-dbd7-4a81-999d-1153f09d18e1';
const PARTITION_ID = 'acceptance_objects-p1';

function importSpecifiers(url) {
  const source = readFileSync(url, 'utf8');
  return [...source.matchAll(IMPORT_SPECIFIER_PATTERN)].map((match) => match[1]);
}

test('the application process imports only the public package entry under src/', async (t) => {
  const workerImports = importSpecifiers(WORKER_URL);
  t.same(
    workerImports.filter((specifier) => specifier.includes('/src/')),
    [PUBLIC_ENTRY_SPECIFIER],
    'worker: the only src/ import is src/public-api.js',
  );
  t.same(
    workerImports.filter((specifier) =>
      !specifier.startsWith(NODE_BUILTIN_PREFIX) &&
      specifier !== PUBLIC_ENTRY_SPECIFIER),
    [PROTOCOL_SPECIFIER],
    'worker: everything else is node: built-ins or the src-free protocol module',
  );
  t.same(
    importSpecifiers(PROTOCOL_URL)
      .filter((specifier) => !specifier.startsWith(NODE_BUILTIN_PREFIX)),
    [],
    'protocol module: node: built-ins only',
  );
});

test('exposure snapshots keep everything the application could observe', async (t) => {
  const inner = new Error('inner');
  inner.participantNodeId = NODE_ID;
  const outer = new Error('outer', {cause: inner});
  Object.defineProperty(outer, 'hidden', {enumerable: false, value: 'h'});
  const shared = {id: 'x'};
  const cyclic = {shared, again: shared};
  cyclic.self = cyclic;

  const errorSnapshot = expose(outer);
  t.equal(exposedProperty(errorSnapshot, 'message'), 'outer');
  t.equal(errorSnapshot.properties.hidden.enumerable, false,
    'non-enumerable own properties are kept and marked');
  const causeSnapshot = errorSnapshot.properties.cause.value;
  t.equal(exposedProperty(causeSnapshot, 'participantNodeId'), NODE_ID,
    'the cause chain is carried');

  const cyclicSnapshot = expose(cyclic);
  t.same(decodeExposure(cyclicSnapshot.properties.again.value), {id: 'x'},
    'a shared (non-cyclic) reference is exposed on both branches');
  t.same(cyclicSnapshot.properties.self.value, {__kind: 'circular'},
    'a true cycle is marked');

  const bytes = Buffer.from([0, 255, 16]);
  const rowSnapshot = expose({body: bytes, view: new Uint8Array([1, 2])});
  t.equal(rowSnapshot.properties.body.value.type, 'Buffer');
  t.equal(rowSnapshot.properties.view.value.type, 'Uint8Array');
  const row = decodeExposure(JSON.parse(JSON.stringify(rowSnapshot)));
  t.ok(Buffer.isBuffer(row.body) && bytes.equals(row.body),
    'bytes survive JSON IPC exactly');
  const [param] = decodeParams(JSON.parse(JSON.stringify([encodeParam(bytes)])));
  t.ok(bytes.equals(param), 'bind bytes survive JSON IPC exactly');
});

test('the topology-leak detector fails raw engine shapes and passes the public shape', async (t) => {
  const rawSelect = {
    success: true,
    rows: [{id: 'a'}],
    partitions: [PARTITION_ID],
    readAuthorityWitnesses: [{servingNodeId: NODE_ID, term: 3}],
    timestamp: `1790412099886-0-${NODE_ID}`,
  };
  const leakPaths = findTopologyLeaks(rawSelect, {forbiddenValues: [NODE_ID]})
    .map((leak) => leak.path);
  t.ok(leakPaths.includes('$.partitions'), 'partitions key is a leak');
  t.ok(leakPaths.includes('$.readAuthorityWitnesses'), 'witness key is a leak');
  t.ok(leakPaths.includes('$.timestamp'), 'a node id inside a value is a leak');

  const causeLeak = new Error('failed', {cause: Object.assign(new Error('x'),
    {participantNodeId: 'n'})});
  t.same(findTopologyLeaks(causeLeak).map((leak) => leak.path),
    ['$.cause.participantNodeId'], 'a leak through cause is found (live value)');
  t.same(findTopologyLeaks(expose(causeLeak)).map((leak) => leak.path),
    ['$.cause.participantNodeId'], 'and through the exposure snapshot');

  const publicShape = Object.freeze(Object.assign(Object.create(null),
    {rows: [{id: 'a', note: 'n'}], affectedRows: 0}));
  t.same(findTopologyLeaks(publicShape, {forbiddenValues: [NODE_ID]}), [],
    'the public {rows, affectedRows} shape passes');
  t.same(findTopologyLeaks({rows: [{partition_id: 'user'}]},
    {allowedKeys: ['partition_id']}), [],
  'an application-declared column can be exempted explicitly');
  t.same(findTopologyLeaks({retryAfterMs: 1, determinant: 2, explain: 3}), [],
    'a fragment matches only at a word start (retryAfterMs is not a term)');
  t.same(findTopologyLeaks({'routedToNode': 1, 'leader_node_id': 2, 'plan-id': 3})
    .map((leak) => leak.path), ['$.routedToNode', '$.leader_node_id', '$.plan-id'],
  'camelCase, snake_case and kebab keys are all split into words');
  t.same(findTopologyLeaks({sessionId: 's'},
    {extraKeyFragments: [SESSION_KEY_FRAGMENT]}).map((leak) => leak.path),
  ['$.sessionId'], 'session identity is detectable on request');
});
