// Unit test for src/test-helpers/topology-leak-check.js, the topology-leak
// check every public-seam suite shares. Controls both directions: raw engine
// shapes MUST be reported, the public shape and application-declared keys
// MUST pass.

import {test} from '../../src/test-helpers/tap.js';
import {
  LEAK_KIND,
  LIFECYCLE_ERROR_ALLOWED_KEYS,
  SESSION_KEY_FRAGMENT,
  TOPOLOGY_KEY_FRAGMENTS,
  findTopologyLeaks,
} from '../../src/test-helpers/topology-leak-check.js';

const NODE_ID = '6a6be293-dbd7-4a81-999d-1153f09d18e1';
const PARTITION_ID = 'acceptance_objects-p1';

const leakPaths = (value, options) =>
  findTopologyLeaks(value, options).map((leak) => leak.path);

test('the fragment list is the union of both public-seam lists', async (t) => {
  for (const fragment of ['partition', 'node', 'replica', 'leader', 'term',
    'epoch', 'witness', 'participant', 'plan', 'routedto', 'address',
    'candidate', 'election', 'endpoint', 'follower', 'holder', 'host', 'lease',
    'member', 'owner', 'peer', 'placement', 'quorum', 'role', 'shard',
    'voter']) {
    t.ok(TOPOLOGY_KEY_FRAGMENTS.includes(fragment), `${fragment} is covered`);
  }
});

test('raw engine shapes are reported by key and by value', async (t) => {
  const paths = leakPaths({
    success: true,
    rows: [{id: 'a'}],
    partitions: [PARTITION_ID],
    readAuthorityWitnesses: [{servingNodeId: NODE_ID, term: 3}],
    participantResults: [{acceptingNodeId: NODE_ID}],
    distributedPlan: {planId: 'dqp-1'},
    timestamp: `1790412099886-0-${NODE_ID}`,
  }, {forbiddenValues: [NODE_ID, PARTITION_ID]});
  for (const expected of ['$.partitions', '$.readAuthorityWitnesses',
    '$.participantResults', '$.distributedPlan', '$.timestamp',
    '$.readAuthorityWitnesses[0].servingNodeId']) {
    t.ok(paths.includes(expected), `${expected} is a leak`);
  }
});

test('leaks through non-enumerable props and cause chains are found', async (t) => {
  const inner = new Error('x');
  Object.defineProperty(inner, 'leaderAddress', {enumerable: false, value: 'h'});
  const outer = new Error('failed', {cause: inner});
  t.same(leakPaths(outer), ['$.cause.leaderAddress']);
  const snapshot = {__kind: 'object', properties: {
    cause: {enumerable: false, value: {__kind: 'object', properties: {
      replicaId: {enumerable: true, value: 'r1'}}}}}};
  t.same(leakPaths(snapshot), ['$.cause.replicaId'],
    'the exposure-snapshot form is walked the same way');
});

test('matching is at word starts and legitimate keys can be exempted', async (t) => {
  t.same(leakPaths({retryAfterMs: 1, determinant: 2, explain: 3,
    rollbackError: null, affectedRows: 0, rows: []}), [],
  'fragments inside a word do not match');
  t.same(leakPaths({'routedToNode': 1, 'leader_node_id': 2, 'plan-id': 3}),
    ['$.routedToNode', '$.leader_node_id', '$.plan-id'],
    'camelCase, snake_case and kebab keys are split into words');
  t.same(leakPaths({plan_name: 'x', address_line1: 'y', terms_accepted: true},
    {allowedKeys: ['plan_name', 'address_line1', 'terms_accepted']}), [],
  'application-declared keys are exempted explicitly');
  t.same(leakPaths({sessionId: 's'}, {extraKeyFragments: [SESSION_KEY_FRAGMENT]}),
    ['$.sessionId'], 'session identity is detectable on request');
});

test('the public result shape passes', async (t) => {
  const publicShape = Object.freeze(Object.assign(Object.create(null),
    {rows: [{id: 'a', note: 'n'}], affectedRows: 0}));
  t.same(findTopologyLeaks(publicShape, {forbiddenValues: [NODE_ID]}), []);
});

test('the value scan finds a known identity inside any string, at any depth',
  async (t) => {
    const failure = {
      code: 'XX000',
      message: `no route to ${PARTITION_ID}`,
      detail: JSON.stringify({outcomeClass: 'unknown', hint: NODE_ID}),
      nested: [{note: 'clean'}, {note: `served by ${NODE_ID}`}],
      body: Buffer.from(NODE_ID),
    };
    const valueLeak = (path, match) => ({kind: LEAK_KIND.VALUE, match, path,
      reason: `value contains ${match}`});
    t.same(findTopologyLeaks(failure, {forbiddenValues: [NODE_ID, PARTITION_ID]}), [
      valueLeak('$.message', PARTITION_ID),
      valueLeak('$.detail', NODE_ID),
      valueLeak('$.nested[1].note', NODE_ID),
    ], 'strings are scanned (JSON text included); bytes are opaque values');
    t.same(findTopologyLeaks({message: 'clean'}, {forbiddenValues: ['', 7]}), [],
      'empty and non-string identities never match');
  });

test('a lifecycle failure passes only with the explicit ownerCode allowance',
  async (t) => {
    const lifecycleFailure = {
      code: 'XX000',
      detail: {outcomeClass: 'definitely_not_executed', ownerCode: 'X',
        path: 'call_invocation', retrySafe: false, stage: 'call_invocation'},
    };
    t.same(leakPaths(lifecycleFailure), ['$.detail.ownerCode'],
      'the broad `owner` fragment flags ownerCode without the allowance');
    t.same(leakPaths(lifecycleFailure,
      {allowedKeys: LIFECYCLE_ERROR_ALLOWED_KEYS}), [],
    'the allowance exempts exactly the lifecycle owner code');
    t.same(leakPaths({detail: {ownerCode: 'X', owner_node_id: 'n',
      ownerNodeId: 'n', ownerId: 'o'}},
    {allowedKeys: LIFECYCLE_ERROR_ALLOWED_KEYS}),
    ['$.detail.owner_node_id', '$.detail.ownerNodeId', '$.detail.ownerId'],
    'the allowance is an exact key, not a fragment');
    t.same(leakPaths({rows: [{ownerCode: 'X'}]}), ['$.rows[0].ownerCode'],
      'ownerCode is allowed only where the allowance is passed');
  });

test('array elements are addressed by index in live and snapshot form',
  async (t) => {
    t.same(findTopologyLeaks({rows: [{}, {leaderId: 'x'}]}), [
      {kind: LEAK_KIND.KEY, match: 'leader', path: '$.rows[1].leaderId',
        reason: 'key contains leader'},
    ]);
    const snapshot = {__kind: 'object', properties: {rows: {value: {
      __kind: 'object', array: true, properties: {0: {value: {
        __kind: 'object', properties: {termId: {value: 3}}}}}}}}};
    t.same(leakPaths(snapshot), ['$.rows[0].termId']);
  });
